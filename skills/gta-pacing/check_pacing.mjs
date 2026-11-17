#!/usr/bin/env node
// Check the rhythm of a GTA video edit plan before anything is rendered.
//
//     node check_pacing.mjs plan.json [--words words.json] [--channel channel.json]
//                                     [--templates DIR] [--json]
//
// Exit code 0: the plan passes (warnings may remain). Exit code 1: at least one rule fails.
// Exit code 2: the plan can't be read.
//
// The rules and their numbers are explained in rules.md (next to this script). Keep the RULES table
// below and that file in sync. Needs Node.js 22+ (see SETUP.md at the repo root), no packages.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The animations this repo ships: their device.json files give entry and exit times, series and variants (R4, R12).
const DEFAULT_TEMPLATES = fileURLToPath(new URL("../gta-motion/templates", import.meta.url));

export const RULES = {
  hook_end: 30.0,        // the hook is the first 30 s
  gap: 10.0,             // R3: clean footage between two graphics, after the hook (s)
  gap_hook: 5.0,         // R3: ... inside the hook (s)
  enter_max: 0.5,        // R4: a graphic lands in 0.5 s or less
  exit_max: 0.3,         // R4: and leaves in 0.3 s or less
  min_on: 2.0,           // R5: shortest time a graphic stays on screen (s)
  read_wps: 3.3,         // R5: reading speed while listening, words per second
  text_max: 2,           // R5: text elements per graphic
  overlay_max: 8.0,      // R5: longest an overlay may sit on footage (s)
  anchor_before: 0.3,    // R2: a graphic may land up to 0.3 s before its word...
  anchor_after: 0.6,     // R2: ...and at most 0.6 s after the word starts
  transition_snap: 0.5,  // R6: a transition sits within 0.5 s of a chapter start
  sfx_snap: 0.1,         // R7: a sound sits within 0.1 s of a landing or a transition
  plain_min: 0.35,       // R8: share of the video that is footage with nothing on it
  plain_max: 0.65,       // R8: ...and at most this much: above it the video feels bare (aim for 50 to 65 %)
  spacing_max: 18.0,     // R8: after the hook, graphics start every 18 s or closer on average (start to start)
  shot_min: 2.5,         // R9: shortest footage shot after the hook (s); shorter only when the library has nothing longer
  shot_avg: 3.0,         // R9: average footage shot after the hook must reach this (s); aim for 3 to 4
  shot_min_hook: 0.6,    // R9: ... inside the hook
  shot_max: 8.0,         // R9: longest footage shot before it feels static (s)
  mid_word: 0.08,        // R9: a cut this far inside a word counts as cutting the word
};
const REASONS = new Set(["number", "name", "place", "source", "correction", "comparison", "list",
  "date", "quote", "theory", "detail", "chapter", "cta", "keyword"]);
const LAYERS = new Set(["overlay", "fullscreen", "tag"]);   // tag: a game's logo over that game's footage (R13)
const THEMES = new Set(["clean", "vice"]);
const IDENTITY_NEVER = ["monogram", "initials", "logo_text"];  // never generated, never placeholders
const EPS = 1e-6;
const USAGE = "usage: node check_pacing.mjs plan.json [--words words.json] [--channel channel.json] [--templates DIR] [--json]";

class Report {
  constructor() { this.items = []; }
  add(level, rule, t, msg, id = null) { this.items.push({ level, rule, t, id, msg }); }
  fail(rule, t, msg, id) { this.add("FAIL", rule, t, msg, id); }
  warn(rule, t, msg, id) { this.add("WARN", rule, t, msg, id); }
  get fails() { return this.items.filter((i) => i.level === "FAIL"); }
  get warns() { return this.items.filter((i) => i.level === "WARN"); }
}

function die(msg, code = 2) {
  console.error(msg);
  process.exit(code);
}

const num = (v, d = 0) => (v === undefined || v === null ? d : Number(v));
const show = (v) => (v === undefined || v === null ? "nothing" : typeof v === "string" ? `'${v}'` : JSON.stringify(v));
const pct = (x) => `${(x * 100).toFixed(0)}%`;

export function ts(t) {
  if (t === null || t === undefined) return "  --   ";
  t = Math.max(t, 0);
  const s = t % 60;
  const m = Math.round((t - s) / 60);
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

/** Lower case, no punctuation, no thousands separators: '3,000' -> '3000', "Jason's" -> 'jasons'. */
export function norm(word) {
  return String(word).toLowerCase().replaceAll(",", "").replace(/[^0-9a-z]+/g, "");
}

function loadJson(p, what) {
  let raw;
  try {
    raw = fs.readFileSync(p, "utf8");
  } catch (e) {
    die(`check_pacing: ${what} not found: ${p}`);
  }
  try {
    return JSON.parse(raw.replace(/^﻿/, ""));
  } catch (e) {
    die(`check_pacing: ${what} is not valid JSON (${p}): ${e.message}`);
  }
}

/** Word timings as {w, s, e}. Also reads HyperFrames' transcript ({text, start, end}, or {words: [...]}) as it is. */
export function toWords(data) {
  const list = Array.isArray(data) ? data : data && Array.isArray(data.words) ? data.words : null;
  if (!list) die("check_pacing: the word timings must be a list of words (see plan-format.md)");
  return list.map((x) => ({ w: x.w ?? x.text ?? x.word ?? "", s: Number(x.s ?? x.start), e: Number(x.e ?? x.end) }));
}

function unionLength(intervals) {
  let total = 0, curS = null, curE = null;
  for (const [s, e] of [...intervals].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    if (curE === null || s > curE) {
      if (curE !== null) total += curE - curS;
      curS = s;
      curE = e;
    } else {
      curE = Math.max(curE, e);
    }
  }
  if (curE !== null) total += curE - curS;
  return total;
}

/** Read enter/exit from the device.json of a template, or of a new animation in the project's animations/ folder. */
/** The template variants of one animation that come in this theme (an empty list without a templates folder). */
const variantCache = new Map();
function familyVariants(templatesDir, family, theme) {
  if (!templatesDir) return [];
  if (!variantCache.has(templatesDir)) {
    const all = [];
    const queue = [templatesDir];
    while (queue.length) {
      const root = queue.shift();
      let entries;
      try {
        entries = fs.readdirSync(root, { withFileTypes: true });
      } catch {
        continue;
      }
      if (entries.some((e) => e.isFile() && e.name === "device.json")) {
        try {
          all.push(JSON.parse(fs.readFileSync(path.join(root, "device.json"), "utf8").replace(/^﻿/, "")));
        } catch { /* a broken device.json is reported where it is used */ }
        continue;
      }
      for (const e of entries) if (e.isDirectory()) queue.push(path.join(root, e.name));
    }
    variantCache.set(templatesDir, all);
  }
  return variantCache.get(templatesDir)
    .filter((d) => d.animation === family && (!["clean", "vice"].includes(theme) || !Array.isArray(d.themes) || !d.themes.length || d.themes.includes(theme)))
    .map((d) => d.id).sort();
}

function deviceMeta(templatesDir, device, planDir = null) {
  if (!device) return {};
  if (String(device).startsWith("new:")) {
    const name = String(device).slice(4);
    const p = planDir ? path.join(planDir, "animations", name, "device.json") : null;
    if (!p || !fs.existsSync(p)) return {};
    try {
      return JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, ""));
    } catch {
      return {};
    }
  }
  if (!templatesDir) return {};
  const queue = [templatesDir];
  while (queue.length) {
    const root = queue.shift();
    let entries;
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    if (path.basename(root) === device && entries.some((e) => e.isFile() && e.name === "device.json")) {
      try {
        return JSON.parse(fs.readFileSync(path.join(root, "device.json"), "utf8").replace(/^﻿/, ""));
      } catch {
        return {};
      }
    }
    for (const e of entries) if (e.isDirectory()) queue.push(path.join(root, e.name));
  }
  return {};
}

/** [best word start, found anywhere] for the anchor's words, nearest to time t. */
function findAnchor(words, anchor, t) {
  const tokens = anchor.split(/\s+/).map(norm).filter(Boolean);
  if (!tokens.length || !words || !words.length) return [null, false];
  const hits = [];
  words.forEach((w, i) => {
    if (norm(w.w ?? "") !== tokens[0]) return;
    const seq = words.slice(i, i + tokens.length).map((x) => norm(x.w ?? ""));
    if (seq.length === tokens.length && seq.every((x, k) => x === tokens[k])) hits.push(Number(w.s));
  });
  if (!hits.length) return [null, false];
  let best = hits[0];
  for (const h of hits) if (Math.abs(h - t) < Math.abs(best - t)) best = h;
  return [best, true];
}

export function check(plan, words = null, channel = null, channelPath = null, templates = null, planDir = null) {
  const R = RULES;
  const rep = new Report();
  const dur = Number(plan.duration || 0);
  if (!(dur > 0)) {
    rep.fail("plan", null, "`duration` is missing or zero.");
    return { rep, stats: null };
  }

  // R11 one theme
  const theme = plan.theme;
  if (!THEMES.has(theme)) {
    rep.fail("R11", null, `\`theme\` must be 'clean' or 'vice' (got ${show(theme)}). Ask the user once, at the start.`);
  }

  const by = (k) => (a, b) => num(a[k]) - num(b[k]);
  const chapters = (plan.chapters || []).map((c) => num(c.start)).sort((a, b) => a - b);
  const shots = [...(plan.shots || [])].sort(by("start"));
  const graphics = [...(plan.graphics || [])].sort(by("start"));
  const transitions = [...(plan.transitions || [])].sort(by("at"));
  const sfx = plan.sfx || [];
  const hook = R.hook_end;

  // --- graphics: fields, R2, R4, R5, R10, R11
  const seenNames = new Map();
  for (const g of graphics) {
    const gid = g.id ?? "?";
    const dev = g.device ?? "graphic";
    const s = num(g.start), e = num(g.end);
    if (e <= s) {
      rep.fail("plan", s, `${gid}: \`end\` must be after \`start\`.`, gid);
      continue;
    }
    if (!LAYERS.has(g.layer)) {
      rep.fail("plan", s, `${gid}: \`layer\` must be 'overlay', 'fullscreen' or 'tag' (got ${show(g.layer)}).`, gid);
    }
    if (g.theme && g.theme !== theme) {
      rep.fail("R11", s, `${gid}: uses theme ${show(g.theme)} but the video is ${show(theme)}. One theme per video.`, gid);
    }

    const reason = g.reason;
    if (!REASONS.has(reason)) {
      rep.fail("R2", s, `${gid} ${dev}: no valid \`reason\` (${show(reason)}). ` +
        `A graphic needs one of: ${[...REASONS].sort().join(", ")}.`, gid);
    }
    const anchor = String(g.anchor || "").trim();
    if (!anchor && reason !== "chapter") {
      rep.fail("R2", s, `${gid} ${dev}: no \`anchor\`. Which words in the voice-over earn it? ` +
        "If none, drop the graphic.", gid);
    }
    if (anchor && words !== null) {
      const [ws, found] = findAnchor(words, anchor, s);
      if (!found) {
        rep.warn("R2", s, `${gid}: anchor "${anchor}" is not in the transcript. ` +
          "Check by ear (numbers may be spelled out).", gid);
      } else if (!(ws - R.anchor_before - EPS <= s && s <= ws + R.anchor_after + EPS)) {
        rep.fail("R2", s, `${gid}: lands at ${ts(s)} but the voice says "${anchor}" at ${ts(ws)}. ` +
          `Move it to start between ${ts(ws - R.anchor_before)} and ${ts(ws + R.anchor_after)}.`, gid);
      }
    }
    if (reason === "name" && anchor) {
      const key = norm(anchor);
      if (seenNames.has(key)) {
        rep.warn("R2", s, `${gid}: "${anchor}" already got a graphic at ${ts(seenNames.get(key))}. ` +
          "A name gets a tag on its first mention only.", gid);
      } else {
        seenNames.set(key, s);
      }
    }

    const meta = deviceMeta(templates, g.device, planDir);
    const enter = "enter" in g ? g.enter : meta.enter;
    const exit = "exit" in g ? g.exit : meta.exit;
    if (enter != null && Number(enter) > R.enter_max + EPS) {
      rep.fail("R4", s, `${gid}: entry takes ${Number(enter).toFixed(2)} s. Land in ${R.enter_max} s or less, then hold still.`, gid);
    }
    if (exit != null && Number(exit) > R.exit_max + EPS) {
      rep.fail("R4", e, `${gid}: exit takes ${Number(exit).toFixed(2)} s. Leave in ${R.exit_max} s or less.`, gid);
    }

    let text = g.text || [];
    if (typeof text === "string") text = [text];
    if (text.length > R.text_max) {
      rep.fail("R5", s, `${gid}: shows ${text.length} text elements. Two at most ` +
        "(a headline plus one supporting line or tag).", gid);
    }
    const nWords = text.reduce((n, t) => n + String(t).split(/\s+/).filter(Boolean).length, 0);
    const need = Math.max(R.min_on, Number(enter || 0) + nWords / R.read_wps);
    if (e - s + EPS < need) {
      rep.fail("R5", s, `${gid}: on screen ${(e - s).toFixed(1)} s, too short to read ${nWords} word(s). ` +
        `Keep it ${need.toFixed(1)} s or more.`, gid);
    }
    if (g.layer === "overlay" && e - s > R.overlay_max + EPS) {
      rep.warn("R5", s, `${gid}: overlay stays ${(e - s).toFixed(1)} s on the footage. Over ${R.overlay_max.toFixed(0)} s it ` +
        "reads like a sticker. Shorten it or make it a full-screen scene.", gid);
    }

    // R10 never invent identity
    const v = g.vars && typeof g.vars === "object" ? g.vars : {};
    for (const k of IDENTITY_NEVER) {
      if (k in v) {
        rep.fail("R10", s, `${gid}: \`${k}\` is set. Identity text is never generated: use the user's own ` +
          "pfp, or leave the avatar out entirely.", gid);
      }
    }
    const wantsIdentity = reason === "cta" || "avatar" in v || "channel" in v;
    if (wantsIdentity && channel === null) {
      rep.fail("R10", s, `${gid}: needs the channel kit (pfp? channel name?) and there is none. ` +
        "Ask the user first: gta-video/channel-kit.md.", gid);
    } else if (wantsIdentity) {
      const avatar = channel.avatar;
      if (v.avatar) {
        if (!avatar) {
          rep.fail("R10", s, `${gid}: uses an avatar but the user said no pfp. ` +
            "Play the CTA without the avatar circle.", gid);
        } else {
          const base = channelPath ? path.dirname(path.resolve(channelPath)) : ".";
          if (!fs.existsSync(path.resolve(base, String(v.avatar)))) {
            rep.fail("R10", s, `${gid}: avatar file not found: ${v.avatar}.`, gid);
          }
        }
      }
      if (v.channel && channel.name && v.channel !== channel.name) {
        rep.warn("R10", s, `${gid}: channel name "${v.channel}" differs from the kit ("${channel.name}").`, gid);
      }
      if (v.channel && !channel.name) {
        rep.fail("R10", s, `${gid}: shows a channel name the user never gave.`, gid);
      }
    }
  }

  // R12 series stay the same, everything else varies.
  // A series (device.json "series": true: list counters, chapter cards) keeps the variant of its first use, so a
  // top 10 counts down in one style. Any other animation used again takes another variant, when there is one.
  const firstUse = new Map();  // series animation -> [variant, graphic id, start]
  const lastUse = new Map();   // other animation -> [variant, graphic id, start]
  for (const g of graphics) {
    if (!g.device || num(g.end) <= num(g.start)) continue;
    const dev = String(g.device);
    const gid = g.id ?? "?";
    const meta = deviceMeta(templates, dev, planDir);
    const family = meta.animation || (dev.startsWith("new:") ? dev : dev.replace(/-[A-Z][0-9]*$/, ""));
    if (meta.series) {
      const seen = firstUse.get(family);
      if (!seen) firstUse.set(family, [dev, gid, num(g.start)]);
      else if (seen[0] !== dev) {
        rep.fail("R12", num(g.start), `${gid}: uses ${dev}, but ${seen[1]} at ${ts(seen[2])} uses ${seen[0]}. ` +
          `A series looks the same all through the video: use ${seen[0]} here too.`, gid);
      }
      continue;
    }
    if (meta.layer === "transition") continue;   // transitions vary by R6
    const prev = lastUse.get(family);
    lastUse.set(family, [dev, gid, num(g.start)]);
    if (!prev || prev[0] !== dev) continue;
    const others = familyVariants(templates, family, plan.theme).filter((v) => v !== dev);
    if (others.length) {
      rep.fail("R12", num(g.start), `${gid}: ${dev} again (${prev[1]} at ${ts(prev[2])} uses it). ` +
        `Vary it: use ${others.join(" or ")}, or another animation that says the same thing.`, gid);
    } else {
      rep.warn("R12", num(g.start), `${gid}: ${dev} again (${prev[1]} at ${ts(prev[2])} uses it) and it has no other ` +
        `variant. If another animation can say this (same "says" in its device.json), use it for variety.`, gid);
    }
  }

  // R1 one at a time, R3 breathing room. A tag (R13) is a label on the footage, not a graphic: left out here and in R8.
  const valid = graphics.filter((g) => num(g.end) > num(g.start) && g.layer !== "tag");
  for (let i = 0; i + 1 < valid.length; i++) {
    const a = valid[i], b = valid[i + 1];
    const aE = num(a.end), bS = num(b.start);
    if (bS < aE - EPS) {
      rep.fail("R1", bS, `${b.id} starts while ${a.id} is still on screen ` +
        `(until ${ts(aE)}). One graphic at a time.`, b.id);
      continue;
    }
    const need = bS < hook ? R.gap_hook : R.gap;
    if (bS - aE + EPS < need) {
      const where = bS < hook ? "inside the hook" : "after the hook";
      rep.fail("R3", bS, `${b.id} ${b.device} lands ${(bS - aE).toFixed(1)} s after ` +
        `${a.id} ends; ${where} it needs ${need.toFixed(0)} s of clean footage. ` +
        `Move it to ${ts(aE + need)} or later, merge both into one scene, or drop the weaker one.`, b.id);
    }
  }

  // R13 another game's footage wears its logo
  const tags = graphics.filter((g) => g.layer === "tag" && num(g.end) > num(g.start));
  const gameOf = (sh) => String(sh.game || "").trim();
  for (const t of tags) {
    const s = num(t.start), e = num(t.end);
    const under = shots.filter((sh) => num(sh.start) < e - EPS && num(sh.end) > s + EPS);
    const bare = under.filter((sh) => !gameOf(sh));
    if (!under.length || bare.length) {
      rep.fail("R13", s, `${t.id}: a tag names the game the footage comes from, so it sits only on shots with \`game\` set` +
        (bare.length ? ` (the shot at ${ts(num(bare[0].start))} has none). Trim it to that game's shots.` : "."), t.id);
    }
    const hit = valid.find((g) => num(g.start) < e - EPS && num(g.end) > s + EPS);
    if (hit) rep.fail("R1", s, `${t.id} shares the screen with ${hit.id}. A tag sits on plain footage only.`, t.id);
  }
  for (const sh of shots.filter(gameOf)) {
    const s = num(sh.start), e = num(sh.end);
    const seen = tags.reduce((n, t) => n + Math.max(0, Math.min(e, num(t.end)) - Math.max(s, num(t.start))), 0);
    const fullOver = valid.some((g) => g.layer === "fullscreen" && num(g.start) - EPS <= s && e <= num(g.end) + EPS);
    if (!fullOver && seen + EPS < Math.min(1.0, e - s - 0.2)) {
      rep.fail("R13", s, `shot at ${ts(s)} is ${gameOf(sh)} footage with no tag on it. Another game on screen always wears ` +
        "its logo (a gametag over that game's shots), so nobody takes it for GTA 6.");
    }
  }

  // R6 transitions
  let prevDev = null;
  for (const x of transitions) {
    const at = num(x.at);
    if (!chapters.some((c) => Math.abs(c - at) <= R.transition_snap + EPS)) {
      rep.fail("R6", at, `transition ${x.device} is not on a chapter start. ` +
        "Use a hard cut here; transitions mark chapters only.");
    }
    if (prevDev && x.device === prevDev) {
      rep.fail("R6", at, `transition ${x.device} is used twice in a row. Change it.`);
    }
    prevDev = x.device;
  }

  // R7 sounds
  const landings = [...graphics.map((g) => num(g.start)), ...transitions.map((x) => num(x.at))];
  const cuts = shots.slice(1).map((s) => num(s.start));
  for (const fx of sfx) {
    const at = num(fx.at);
    if (landings.some((t) => Math.abs(at - t) <= R.sfx_snap + EPS)) continue;
    if (cuts.some((t) => Math.abs(at - t) <= R.sfx_snap + EPS)) {
      rep.fail("R7", at, `sound ${fx.src} sits on a footage cut. No sound on cuts.`);
    } else {
      rep.fail("R7", at, `sound ${fx.src} is not tied to a graphic landing or a transition.`);
    }
  }

  // R9 shots
  let prevEnd = 0;
  const full = valid.filter((g) => g.layer === "fullscreen").map((g) => [num(g.start), num(g.end)]);
  const covered = (a, b) => full.some(([fs_, fe]) => fs_ - EPS <= a && b <= fe + EPS);
  const short = [], longs = [], mid = [];
  for (const sh of shots) {
    const s = num(sh.start), e = num(sh.end);
    if (e <= s) {
      rep.fail("plan", s, `shot at ${ts(s)}: \`end\` must be after \`start\`.`);
      continue;
    }
    if (s < prevEnd - EPS) {
      rep.fail("R9", s, `shot at ${ts(s)} overlaps the previous shot (ends ${ts(prevEnd)}).`);
    } else if (s > prevEnd + EPS && !covered(prevEnd, s)) {
      rep.fail("R9", prevEnd, `nothing on screen from ${ts(prevEnd)} to ${ts(s)}. ` +
        "Add a shot or cover it with a full-screen scene.");
    }
    const lim = s < hook ? R.shot_min_hook : R.shot_min;
    if (e - s < lim - EPS && !covered(s, e)) short.push(s);
    if (e - s > R.shot_max + EPS && !covered(s, e)) longs.push(s);
    if (words !== null && s > EPS) {
      for (const w of words) {
        if (num(w.s) + R.mid_word < s && s < num(w.e) - R.mid_word) {
          mid.push([s, w.w]);
          break;
        }
      }
    }
    prevEnd = Math.max(prevEnd, e);
  }
  if (prevEnd < dur - EPS && !covered(prevEnd, dur)) {
    rep.fail("R9", prevEnd, `nothing on screen from ${ts(prevEnd)} to the end (${ts(dur)}).`);
  }
  if (short.length) {
    rep.warn("R9", short[0], `${short.length} shot(s) shorter than ${R.shot_min} s ` +
      `(${R.shot_min_hook} s in the hook), first at ${ts(short[0])}. Let shots breathe: use a longer take ` +
      "(find_shots search --need 3) or a long background shot; go shorter only when the library has nothing longer.");
  }
  const after = shots.filter((sh) => num(sh.start) >= hook - EPS && num(sh.end) > num(sh.start) && !covered(num(sh.start), num(sh.end)));
  if (after.length >= 5) {
    const avg = after.reduce((n, sh) => n + (num(sh.end) - num(sh.start)), 0) / after.length;
    if (avg < R.shot_avg - EPS) {
      rep.fail("R9", num(after[0].start), `shots after the hook average ${avg.toFixed(1)} s: aim for 3 to 4 s ` +
        `(at least ${R.shot_avg} s). The cuts come too fast. Merge beats and use the library's long takes.`);
    }
  }
  if (longs.length) {
    rep.warn("R9", longs[0], `${longs.length} shot(s) longer than ${R.shot_max.toFixed(0)} s with nothing on ` +
      `them, first at ${ts(longs[0])}. Cut earlier or add a slow push.`);
  }
  for (const [t, w] of mid.slice(0, 5)) {
    rep.warn("R9", t, `cut at ${ts(t)} falls inside the word "${w}". Cut between words.`);
  }
  if (mid.length > 5) rep.warn("R9", mid[5][0], `${mid.length - 5} more cut(s) inside words.`);

  // R8 screen share
  const over = valid.filter((g) => g.layer === "overlay").map((g) => [num(g.start), num(g.end)]);
  const graphicTime = unionLength([...over, ...full]);
  const stats = {
    duration: dur,
    plain: Math.max(0, dur - graphicTime) / dur,
    overlay: unionLength(over) / dur,
    fullscreen: unionLength(full) / dur,
    graphics: valid.length,
    shots: shots.length,
    asl: shots.length ? shots.reduce((n, s) => n + (num(s.end) - num(s.start)), 0) / shots.length : 0,
  };
  if (stats.plain > R.plain_max + EPS && dur > 120) {
    rep.fail("R8", null, `${pct(stats.plain)} of the video is plain footage: it feels bare (aim for 50 to 65 %, ` +
      `${pct(R.plain_max)} at most). Add graphics where the voice earns them: numbers, names, quotes, places, ` +
      "lists, comparisons, corrections. Keep R3's 10 s between them.");
  }
  const startsAfter = valid.map((g) => num(g.start)).filter((t) => t >= hook - EPS).sort((a, b) => a - b);
  if (dur - hook > 120) {
    const spacing = (dur - hook) / Math.max(1, startsAfter.length);
    if (spacing > R.spacing_max + EPS) {
      rep.fail("R8", null, `after the hook a graphic starts every ${spacing.toFixed(0)} s on average ` +
        `(${startsAfter.length} graphics): aim for one every 14 to 18 s (about ${Math.ceil((dur - hook) / 16)} here).`);
    }
  }
  if (stats.plain < R.plain_min) {
    rep.warn("R8", null, `only ${pct(stats.plain)} of the video is plain footage ` +
      `(aim for ${pct(R.plain_min)} or more). Check every graphic is earned.`);
  }
  return { rep, stats };
}

function parseArgs(argv) {
  const a = { plan: null, words: null, channel: null, templates: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "-h" || x === "--help") {
      console.log(USAGE);
      process.exit(0);
    } else if (x === "--json") {
      a.json = true;
    } else if (x === "--words" || x === "--channel" || x === "--templates") {
      if (i + 1 >= argv.length) die(`check_pacing: ${x} needs a path\n${USAGE}`);
      a[x.slice(2)] = argv[++i];
    } else if (x.startsWith("--")) {
      die(`check_pacing: unknown option ${x}\n${USAGE}`);
    } else if (a.plan === null) {
      a.plan = x;
    } else {
      die(`check_pacing: one plan at a time\n${USAGE}`);
    }
  }
  if (!a.plan) die(USAGE);
  for (const k of ["words", "channel"]) if (a[k] && !fs.existsSync(a[k])) die(`check_pacing: ${k} file not found: ${a[k]}`);
  return a;
}

export function main(argv) {
  const a = parseArgs(argv);
  const plan = loadJson(a.plan, "plan");
  const base = path.dirname(path.resolve(a.plan));
  const rel = (p) => (!p ? null : path.isAbsolute(p) ? p : path.join(base, p));

  const wordsPath = a.words || rel(plan.words);
  const channelPath = a.channel || rel(plan.channel);
  const words = wordsPath && fs.existsSync(wordsPath) ? toWords(loadJson(wordsPath, "words")) : null;
  const channel = channelPath && fs.existsSync(channelPath) ? loadJson(channelPath, "channel kit") : null;

  const templates = a.templates || (fs.existsSync(DEFAULT_TEMPLATES) ? DEFAULT_TEMPLATES : null);
  const { rep, stats } = check(plan, words, channel, channelPath, templates, base);
  rep.items.sort((x, y) => (x.level !== "FAIL") - (y.level !== "FAIL") || (x.t ?? -1) - (y.t ?? -1));
  const ok = rep.fails.length === 0;

  if (a.json) {
    console.log(JSON.stringify({ ok, stats: stats || {}, items: rep.items }, null, 2));
  } else {
    console.log(`check_pacing: ${path.basename(a.plan)} (${ts(stats ? stats.duration : null)}, theme ${plan.theme ?? "not set"})`);
    if (words === null) console.log("  (no word timings: anchors and mid-word cuts not checked)");
    for (const i of rep.items) console.log(`${i.level} ${ts(i.t)}  ${i.rule.padEnd(4)} ${i.msg}`);
    if (stats) {
      console.log(`Screen time: plain footage ${pct(stats.plain)}, overlays ${pct(stats.overlay)}, ` +
        `full-screen ${pct(stats.fullscreen)} | ${stats.graphics} graphics, ` +
        `${stats.shots} shots, average shot ${stats.asl.toFixed(1)} s`);
    }
    const nF = rep.fails.length, nW = rep.warns.length;
    console.log(ok ? "Result: PASS" + (nW ? ` with ${nW} warning(s)` : "")
      : `Result: FAIL, ${nF} rule(s) broken, ${nW} warning(s). Fix the fails, then run again.`);
  }
  return ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
