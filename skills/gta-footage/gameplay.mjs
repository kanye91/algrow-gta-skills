#!/usr/bin/env node
// Gameplay clips from the Algrow GTA library (the `algrow-gta` connector): real GTA VI gameplay, cut into clips of about
// 3 to 10 s and described one by one. Claude picks them with the connector's tools (gta_match_script, gta_search_clips...,
// always with clip_type "gameplay") and writes what it picked to work/gameplay_picks.json; this script does the rest.
// The library also holds cutscene clips: never used (owner, 19 Nov 2026). assign and fetch refuse them.
//
//   node <skills>/skills/gta-footage/gameplay.mjs assign work/beats.json work/gameplay_picks.json --out work/beats.json
//       puts each pick's clip on its beat ("clip", "in", "scene"): the beat sits in the middle of the clip
//   node <skills>/skills/gta-footage/gameplay.mjs fetch work/gameplay_picks.json [--dir footage/gameplay]
//       downloads each clip to footage/gameplay/<id>.mp4 with its description in <id>.json (no links kept)
//   node <skills>/skills/gta-footage/gameplay.mjs sheet work/shots.json|plan.json [--out work/gameplay.jpg]
//       one frame per gameplay shot, framed like the video, labelled with its time, its words and its clip, on pages of
//       12 (3 columns x 4 rows): work/gameplay_01.jpg, work/gameplay_02.jpg... (open every page)
//
// picks.json is a list of the clips as the connector returned them (at least id, scene, duration_s, video_url),
// each with the beat it is for: "beat" (the beat's index, from 0, as find_shots counts) or "line" (the beat's words).
// The connector's raw gta_match_script answer ({"lines": [{"line", "clip"}]}) works as it is when its lines are the
// beats' lines. Two clips on one beat are a continuation: consecutive clips of one scene (gta_get_scene), played as one shot.
// Links expire after a few hours: fetch right after picking. An expired link: the other clips are fetched, then
// fetch exits 2 with the ids to refresh (gta_get_clip gives fresh links).
//
// In the video, a gameplay clip plays full frame, HUD and subtitles included (they are fine: owner, 19 Nov 2026), scaled
// from 1280x720 to 1920x1080 (1.5x, lanczos) at 30 fps, without the game's sound; black bars baked into a clip
// (detectBars) are cut off. A shot can opt in to a HUD crop with
// "crop" (HUD_CROPS below). Node 22+, FFmpeg, no packages. Signed links are never printed.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONT = path.join(HERE, "..", "gta-motion", "fonts", "Inter-Variable.ttf");
export const PREFIX = "gameplay/";              // a shot's src: "gameplay/<id>", or "gameplay/<id>+<id>" (a continuation)
export const DIR = path.join("footage", "gameplay");   // in the project folder
const MARGIN = 0.1;          // seconds kept clear at each end of a clip
const SPACING = 6;           // the same scene never within this many beats
const SHEET_PER_PAGE = 12, SHEET_COLS = 3;   // a sheet page: 3 columns x 4 rows, 1932x1778, readable when opened

/** The HUD crops, opt-in only (the default is the full frame): a shot sets "crop": "auto" (chosen from the clip's
 *  description, as below) or names one ("hud", "wanted", "combat"). As fractions of the clip's frame: keep x from `x`
 *  to `x + w` and y from `y` to `y + h` (16:9, so w = h). Measured on the library's 1280x720 clips, 100 frames
 *  (19 Nov 2026):
 *  - the minimap box starts at y 81.8 % (x 1.6-17.3 %); subtitles, mission text and prompts sit at y 85-98 %;
 *  - wanted: a row of six star slots (the unearned ones grey) at x 87.5-98.2 %, y 2.6-5.5 %, and icons under it to
 *    y 8.6 %; a stamina bar top left at x 1.7-10 %, y 3-5 %;
 *  - a gun out: health bars top left (x 1.6-15.6 %, y 2.5-6.7 %), ammo, weapon and money top right (x from 93.4 %,
 *    y to 14 %).
 *  `hud` (auto: every other clip): centred, top-anchored, y 0-80.5 %: no minimap or subtitles (11 px to spare at
 *    720p). Zoom 1.24: a 720p clip is scaled 1.86x.
 *  `wanted` (auto: `wanted`: true): x 10.7-86.7 %, y 0-76 %: no stars, icons or stamina bar either (8 to 12 px to
 *    spare). Zoom 1.32, scaled 1.98x; the picture's centre 1.3 % left of the clip's.
 *  `combat` (auto: `gun`: true): x 13.5-86.5 %, y 7.5-80.5 %: no health bars, ammo or stars either. Zoom 1.37,
 *    scaled 2.06x.
 *  The full frame (the default) is scaled 1.5x. */
export const HUD_CROPS = {
  hud: { x: 0.0975, y: 0, w: 0.805, h: 0.805 },
  wanted: { x: 0.107, y: 0, w: 0.76, h: 0.76 },
  combat: { x: 0.135, y: 0.075, w: 0.73, h: 0.73 },
};

/** How a gameplay shot is framed: "full" (the default: the whole frame, HUD and all), or the crop its "crop" asks for:
 *  a named one ("hud", "wanted", "combat"), or "auto", chosen from the clip's description (`meta`, its
 *  footage/gameplay/<id>.json): "combat" with a gun out, "wanted" with the police after the player, "hud" for the rest. */
export function cropFor(shot, meta = null) {
  const c = shot?.crop;
  if (c && HUD_CROPS[c]) return c;
  if (c !== "auto") return "full";
  if (meta?.gun === true) return "combat";
  if (meta?.wanted === true || Number(meta?.wanted_level) > 0) return "wanted";
  return "hud";
}

/** Cutscene clips are never used (owner, 19 Nov 2026). */
export const isCutscene = (c) => String(c?.clip_type || "").trim().toLowerCase() === "cutscene";
export const cutsceneMsg = (ids) => `${ids.join(", ")} ${ids.length > 1 ? "are cutscene clips" : "is a cutscene clip"} (clip_type ` +
  "\"cutscene\"): cutscenes are never used. Pick a gameplay clip instead (pass clip_type: \"gameplay\" to gta_match_script " +
  "and gta_search_clips).";

/** The FFmpeg filter that turns a gameplay clip into the video's 1920x1080 frame (no fps change: the caller adds it).
 *  `bars`: black bars baked into the clip (px at the clip's height, top and bottom each), cropped off first; the picture
 *  then fills the frame, like a trailer shot's letterbox. */
export function gameplayVf(mode = "full", bars = 0) {
  const b = Math.max(0, Math.round(Number(bars) || 0));
  const lb = b > 0 ? `crop=iw:ih-${2 * b}:0:${b},` : "";
  const c = HUD_CROPS[mode];
  const crop = c ? `crop=trunc(iw*${c.w}/2)*2:trunc(ih*${c.h}/2)*2:trunc(iw*${c.x}):trunc(ih*${c.y}),` : "";
  return `${lb}${crop}scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,setsar=1`;
}

const BAR_LUMA = 24;     // a row whose brightest pixel is at most this is black
const BAR_MIN = 0.033;   // fewer black rows than 3.3 % of the height are a dark night scene, not bars
/** Black bars baked into a clip: about 1 clip in 7 plays in a cinematic camera, 2:1 inside the 16:9 frame (39 to 40 px
 *  top and bottom at 720p, measured 19 Nov 2026). The rows black at both the top and the bottom in five frames, in px
 *  at the clip's height (even, one row to spare), or 0. */
export function detectBars(file) {
  const p = probe(file);
  if (!p) return 0;
  const W = p.width, H = p.height;
  let bars = Infinity;
  for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    let buf;
    try {
      buf = execFileSync("ffmpeg", ["-v", "error", "-threads", "4", "-ss", String(r2(p.duration * f)), "-i", file, "-frames:v", "1",
        "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: W * H * 2, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      continue;
    }
    if (buf.length < W * H) continue;
    const black = (y) => {
      for (let x = 0; x < W; x++) if (buf[y * W + x] > BAR_LUMA) return false;
      return true;
    };
    let top = 0, bottom = 0;
    while (top < H / 4 && black(top)) top++;
    while (bottom < H / 4 && black(H - 1 - bottom)) bottom++;
    bars = Math.min(bars, top, bottom);
  }
  if (!Number.isFinite(bars) || bars < H * BAR_MIN || bars >= H / 4) return 0;   // none, or a black frame
  return Math.ceil((bars + 1) / 2) * 2;
}

/** A clip's bars: from its <id>.json, else measured once and stored there. */
export function barsOf(dir, id) {
  const meta = clipMeta(dir, id);
  if (meta && Number.isFinite(meta.bars)) return meta.bars;
  const file = path.join(dir, `${id}.mp4`);
  if (!fs.existsSync(file)) return 0;
  const b = detectBars(file);
  if (meta) {
    try {
      fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ ...meta, bars: b }, null, 1));
    } catch {}
  }
  return b;
}

/** The bars a gameplay shot crops off, in px at the clip's height: the shot's own "bars" (px at 1080p, as on a trailer
 *  shot; 0 keeps them), else the clips' measured bars (the smallest, for a continuation). */
export function shotBars(shot, dir, ids) {
  const height = Number(clipMeta(dir, ids[0])?.probe?.height) || 720;
  const own = shot?.bars;
  if (own !== undefined && own !== null && own !== "" && Number.isFinite(Number(own))) return Math.round((Number(own) * height) / 1080 / 2) * 2;
  return Math.min(...ids.map((id) => barsOf(dir, id)));
}

/** A clip's description file (footage/gameplay/<id>.json), or null. */
export function clipMeta(dir, id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), "utf8").replace(/^﻿/, ""));
  } catch {
    return null;
  }
}

/** The clip ids of a gameplay src ("gameplay/gta-001012+gta-001013"), or null for any other footage. */
export function gameplayIds(src) {
  const s = String(src || "").replace(/\\/g, "/");
  if (!s.startsWith(PREFIX)) return null;
  const ids = s.slice(PREFIX.length).split("+").map((x) => x.trim()).filter(Boolean);
  return ids.length && ids.every((x) => /^[\w.-]+$/.test(x)) ? ids : null;
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, ""));
const r2 = (x) => Math.round(Number(x) * 100) / 100;
const ts = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
/** Never show a signed link: keep the address, drop its query string. */
export const redact = (s) => String(s).replace(/(https?:\/\/[^\s?"'<>]+)\?[^\s"'<>]*/g, "$1?<signed>");
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

class Bad extends Error {}

/** The clips of a picks file: a list of clips, or of {beat, line, clip: {...}}, or an object holding such a list
 *  (the connector's raw answer). Each comes back flat, with `beat` and `line` when the file gives them. */
export function readPicks(file) {
  let data;
  try {
    data = readJson(file);
  } catch (e) {
    throw new Bad(`can't read ${file}: ${redact(e.message)}`);
  }
  const listOf = (d) => (Array.isArray(d) ? d : d && typeof d === "object" ?
    listOf(d.picks ?? d.clips ?? d.results ?? d.matches ?? d.lines ?? d.items ?? null) : null);
  const list = listOf(data);
  if (!list) throw new Bad(`${file} must hold a list of clips (the connector's results, each with "beat" or "line")`);
  const out = [];
  list.forEach((p, k) => {
    if (!p || typeof p !== "object") return;
    const inner = p.clip && typeof p.clip === "object" ? p.clip : p.match && typeof p.match === "object" ? p.match : null;
    const c = inner ? { ...inner, beat: p.beat ?? inner.beat, line: p.line ?? inner.line, in: p.in ?? inner.in } : { ...p };
    if (c.beat === undefined && c.line_index !== undefined) c.beat = c.line_index;
    if (!c.id) throw new Bad(`${file}: pick ${k} has no clip id`);
    out.push(c);
  });
  return out;
}

/** ffprobe a clip: its length, size and frame rate, or null when it isn't a readable video. */
export function probe(file) {
  try {
    const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries",
      "stream=width,height,r_frame_rate:format=duration", "-of", "json", file], { encoding: "utf8" });
    const j = JSON.parse(out), s = (j.streams || [])[0];
    const dur = Number(j.format?.duration);
    if (!s || !(dur > 0)) return null;
    const [a, b] = String(s.r_frame_rate || "0/1").split("/").map(Number);
    return { width: s.width, height: s.height, fps: b ? r2(a / b) : 0, duration: r2(dur) };
  } catch {
    return null;
  }
}

/** A clip file is good when it reads as a video about as long as the library says. */
function valid(file, want) {
  if (!fs.existsSync(file)) return null;
  const p = probe(file);
  if (!p) return null;
  if (Number(want) > 0 && Math.abs(p.duration - Number(want)) > 0.6) return null;
  return p;
}

/** What we keep about a clip: everything but its links and the per-video fields. */
function metaOf(c, p, bars = null) {
  const m = {};
  for (const [k, v] of Object.entries(c)) if (!/url$/i.test(k) && !["beat", "line", "in", "line_index"].includes(k)) m[k] = v;
  if (p) m.probe = p;
  if (bars !== null) m.bars = bars;   // black bars baked into the clip, px at its height (detectBars)
  return m;
}

// ---------------------------------------------------------------- fetch

export async function fetchClips(picksFile, dir = DIR, { log = console.log } = {}) {
  const picks = readPicks(picksFile);
  const byId = new Map();
  for (const c of picks) if (!byId.has(c.id) || (!byId.get(c.id).video_url && c.video_url)) byId.set(c.id, c);
  // cutscenes are never used: refused, never downloaded
  const refused = [...byId.values()].filter(isCutscene).map((c) => c.id);
  for (const id of refused) byId.delete(id);
  fs.mkdirSync(dir, { recursive: true });
  const stale = [], failed = [];
  let got = 0, kept = 0;
  const one = async (c) => {
    const mp4 = path.join(dir, `${c.id}.mp4`), meta = path.join(dir, `${c.id}.json`);
    let p = valid(mp4, c.duration_s);
    if (p) {
      kept++;
      if (!fs.existsSync(meta)) fs.writeFileSync(meta, JSON.stringify(metaOf(c, p, detectBars(mp4)), null, 1));
      log(`${c.id}  already here (${p.duration} s)`);
      return;
    }
    if (!c.video_url) {
      stale.push([c.id, "no video_url in the picks"]);
      return;
    }
    const part = `${mp4}.part`;
    let why = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(c.video_url, { signal: AbortSignal.timeout(180_000) });
        if (!res.ok) {
          why = `HTTP ${res.status}`;
          if ([401, 403, 404, 410].includes(res.status)) break;      // expired or refused: a fresh link is needed
          await new Promise((ok) => setTimeout(ok, 2000 * (attempt + 1)));
          continue;
        }
        const body = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(part, body);
        p = valid(part, c.duration_s);
        if (!p) {
          why = "the file isn't a readable video of the right length";
          fs.rmSync(part, { force: true });
          continue;
        }
        fs.renameSync(part, mp4);
        const bars = detectBars(mp4);
        fs.writeFileSync(meta, JSON.stringify(metaOf(c, p, bars), null, 1));
        got++;
        log(`${c.id}  fetched (${p.duration} s, ${p.width}x${p.height}, ${p.fps} fps${bars ? `, black bars ${bars} px top and bottom: cut off in the video` : ""})`);
        return;
      } catch (e) {
        why = redact(e?.cause?.code || e?.cause?.message || e?.message || e);
        fs.rmSync(part, { force: true });
        await new Promise((ok) => setTimeout(ok, 2000 * (attempt + 1)));
      }
    }
    (/^HTTP (401|403|404|410)$/.test(why) ? stale : failed).push([c.id, why]);
  };
  const queue = [...byId.values()];
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) await one(queue.shift());
  }));
  return { got, kept, stale, failed, refused, total: byId.size + refused.length };
}

// ---------------------------------------------------------------- assign

/** Put each pick on its beat: `clip` (an id, or a list for a continuation), `scene` and `in` (seconds into the clip,
 *  the beat in its middle). Returns the beats and the report; `bad` lists the beats left without their clip. */
export function assign(beats, picks) {
  const lines = [], bad = [], warn = [];
  const per = new Map();     // beat index -> its picks
  const taken = new Set();
  for (const c of picks) {
    let i = null;
    if (c.beat !== undefined && c.beat !== null && c.beat !== "") {
      i = Number(c.beat);
      if (!Number.isInteger(i) || i < 0 || i >= beats.length) throw new Bad(`pick ${c.id}: "beat": ${c.beat} is not a beat (0 to ${beats.length - 1})`);
    } else if (c.line) {
      const want = norm(c.line);
      const eq = beats.map((b, k) => k).filter((k) => norm(beats[k].line) === want);
      const part = beats.map((b, k) => k).filter((k) => norm(beats[k].line) && (norm(beats[k].line).includes(want) || want.includes(norm(beats[k].line))));
      i = eq.find((k) => !taken.has(k)) ?? eq[0] ?? part.find((k) => !taken.has(k)) ?? part[0] ?? null;
      if (i === null) throw new Bad(`pick ${c.id}: no beat has the line "${String(c.line).slice(0, 60)}"; give it "beat": <index> instead`);
    } else throw new Bad(`pick ${c.id} has neither "beat" nor "line": say which beat it is for`);
    taken.add(i);
    per.set(i, [...(per.get(i) || []), c]);
  }
  const out = beats.map((b) => ({ ...b }));
  for (const [i, list] of [...per.entries()].sort((x, y) => x[0] - y[0])) {
    const b = out[i];
    const need = Number(b.end) - Number(b.start);
    const tag = `beat ${String(i).padEnd(3)} ${ts(Number(b.start)).padStart(7)}`;
    if (!(need > 0)) {
      bad.push(i), lines.push(`${tag}  "end" must come after "start"`);
      continue;
    }
    const clips = list.length > 1 ? [...list].sort((x, y) => Number(x.scene_pos) - Number(y.scene_pos)) : list;
    const cut = clips.filter(isCutscene).map((c) => c.id);
    if (cut.length) {
      bad.push(i), lines.push(`${tag}  REFUSED: ${cutsceneMsg(cut)}`);
      delete b.clip, delete b.in, delete b.scene;
      continue;
    }
    if (clips.length > 1) {
      const same = clips.every((c) => c.scene && c.scene === clips[0].scene);
      const next = clips.every((c, k) => !k || Number(c.scene_pos) === Number(clips[k - 1].scene_pos) + 1);
      if (!same || !next) {
        bad.push(i);
        lines.push(`${tag}  ${clips.map((c) => c.id).join(" + ")}: two clips on one beat must be consecutive clips of one scene ` +
          "(a continuation, from gta_get_scene). Keep one, or split the beat.");
        continue;
      }
    }
    const lens = clips.map((c) => Number(c.duration_s));
    if (lens.some((x) => !(x > 0))) {
      bad.push(i), lines.push(`${tag}  ${clips.map((c) => c.id).join(" + ")}: no duration_s in the pick (copy the clip as the connector gave it)`);
      continue;
    }
    const total = lens.reduce((n, x) => n + x, 0), room = total - 2 * MARGIN;
    const ids = clips.map((c) => c.id);
    if (need > room + 1e-6) {
      bad.push(i);
      const first = clips[0], last = clips[clips.length - 1];
      const pos = (c) => Number(c.scene_pos), size = Number(last.scene_size);
      // continue into the scene's next clip, or its previous one; a scene of one clip can't be continued
      const nextPos = pos(last) < size ? pos(last) + 1 : pos(first) > 1 ? pos(first) - 1 : null;
      const how = nextPos !== null && Number.isFinite(nextPos)
        ? `, or continue it: gta_get_scene("${last.scene}") and add the clip at scene_pos ${nextPos} to the picks with "beat": ${i}, then assign again.`
        : `, or pick a longer clip (${ids.join(" + ")} ${ids.length > 1 ? "are" : "is"} the whole scene ${last.scene}: nothing to continue into).`;
      lines.push(`${tag}  TOO LONG: the beat is ${need.toFixed(2)} s, ${ids.join(" + ")} ${ids.length > 1 ? "have" : "has"} ${room.toFixed(2)} s. ` +
        `Split the beat (2.5 s at least) and give the new beat its own clip${how}`);
      delete b.clip, delete b.in, delete b.scene;
      continue;
    }
    // the beat in the middle of the clip, unless the pick names its own moment and it fits
    const given = clips[0].in !== undefined && clips[0].in !== null && clips[0].in !== "" ? Number(clips[0].in) : null;
    const at = given !== null && given >= 0 && given + need <= total - 0.02 ? given : Math.max(MARGIN, (total - need) / 2);
    b.clip = ids.length === 1 ? ids[0] : ids;
    b.in = r2(at);
    if (clips[0].scene) b.scene = clips[0].scene;
    b.type = b.type || "show";
    const notes = [];
    if (ids.length > 1) notes.push(`continued: ${ids.join(" + ")} play as one shot (the scene's own cut)`);
    // the person the beat names must be the one playing
    const said = norm(`${b.line || ""} ${(Array.isArray(b.who) ? b.who : b.who ? [b.who] : []).join(" ")}`).split(" ");
    const names = ["jason", "lucia"].filter((n) => said.includes(n));
    const player = String(clips[0].player || "").toLowerCase();
    if (names.length === 1 && player !== names[0] && player !== "both") {
      notes.push(`the beat names ${names[0]} but the clip's player is ${player || "not given"}: pick a clip with player "${names[0]}"`);
      warn.push(i);
    }
    lines.push(`${tag}  ${ids.join(" + ").padEnd(10)} in ${b.in.toFixed(2).padStart(5)}  (${need.toFixed(1)} s of ${total.toFixed(1)})  ` +
      `${String(clips[0].description || "").slice(0, 70)}${notes.map((x) => `  (${x})`).join("")}`);
  }
  // the same scene never within SPACING beats
  const sceneAt = out.map((b) => (b.clip && b.scene ? b.scene : null));
  sceneAt.forEach((s, i) => {
    if (!s) return;
    const j = sceneAt.findIndex((x, k) => k > i && k - i <= SPACING && x === s);
    if (j > 0) {
      warn.push(j);
      lines.push(`beat ${j}: scene ${s} is also on beat ${i}, ${j - i} beat(s) before: swap one (gta_similar_clips, or gta_search_clips with filters)`);
    }
  });
  return { beats: out, lines, bad, warn: [...new Set(warn)] };
}

// ---------------------------------------------------------------- sheet

/** The words spoken from a to b. */
function wordsBetween(words, a, b) {
  return words.filter((w) => w.s >= a - 0.05 && w.s < b - 0.05).map((w) => w.w).join(" ");
}
function loadWords(file) {
  if (!file || !fs.existsSync(file)) return null;
  let w = readJson(file);
  if (!Array.isArray(w)) w = w.words || w.segments || [];
  return w.map((x) => ({ w: String(x.w ?? x.text ?? x.word ?? ""), s: Number(x.s ?? x.start), e: Number(x.e ?? x.end) }))
    .filter((x) => Number.isFinite(x.s));
}

/** Contact-sheet pages of the gameplay shots: each one's frame at the middle of the piece it plays, framed like the
 *  video, labelled with its time, the words said over it and the clip's description, 12 to a page in 3 columns (one
 *  big image of a long video is shrunk past reading). `out` work/gameplay.jpg writes work/gameplay_01.jpg,
 *  work/gameplay_02.jpg... and removes that base's pages (and its one-image sheet) from a run before. */
export function sheet(input, { out = path.join("work", "gameplay.jpg"), dir = null, words = null } = {}) {
  const data = readJson(input);
  const isPlan = !Array.isArray(data);
  const root = isPlan ? path.dirname(path.resolve(input)) : process.cwd();
  const clipDir = path.resolve(root, dir || DIR);
  const shots = (isPlan ? data.shots || [] : data).filter((s) => gameplayIds(s.src));
  if (!shots.length) throw new Bad(`${input} has no gameplay shot (src "gameplay/<id>")`);
  const wordList = loadWords(words ? path.resolve(words) : isPlan && data.words ? path.resolve(root, data.words) : null);
  const dest = path.dirname(path.resolve(out));
  const base = path.basename(out).replace(/\.[^.]+$/, "");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gameplay-sheet-"));
  const missing = [], tiles = [], pages = [];
  try {
    fs.copyFileSync(FONT, path.join(tmp, "font.ttf"));
    let n = 0;
    for (const s of [...shots].sort((x, y) => x.start - y.start)) {
      const ids = gameplayIds(s.src);
      const files = ids.map((id) => path.join(clipDir, `${id}.mp4`));
      if (files.some((f) => !fs.existsSync(f))) {
        missing.push(...ids.filter((id, k) => !fs.existsSync(files[k])));
        continue;
      }
      // the middle of the piece, found in the clip (or the continuation's clip) that holds it
      let t = Number(s.in || 0) + (Number(s.end) - Number(s.start)) / 2, k = 0;
      const lens = files.map((f) => probe(f)?.duration || 0);
      while (k < files.length - 1 && t >= lens[k]) t -= lens[k++];
      t = Math.min(Math.max(0, t), Math.max(0, lens[k] - 0.05));
      const meta = clipMeta(clipDir, ids[k]) || {};
      const crop = cropFor(s, clipMeta(clipDir, ids[0]));
      const bars = shotBars(s, clipDir, ids);
      const said = s.line || (wordList ? wordsBetween(wordList, Number(s.start), Number(s.end)) : "");
      const id = String(++n).padStart(3, "0");
      const clean = (x, len) => String(x || "").replace(/\s+/g, " ").trim().slice(0, len);
      const who = [meta.player && meta.player !== "unclear" ? meta.player : "", isCutscene(meta) ? "CUTSCENE: never used" : "",
        crop === "full" ? "" : `${crop} crop`, bars ? "bars cut" : ""].filter(Boolean).join(", ");
      fs.writeFileSync(path.join(tmp, `a${id}.txt`), clean(`${ts(Number(s.start))}-${ts(Number(s.end))}  ${ids.join("+")}${who ? `  (${who})` : ""}`, 70));
      fs.writeFileSync(path.join(tmp, `b${id}.txt`), clean(said ? `"${said}"` : "(no words)", 66));
      fs.writeFileSync(path.join(tmp, `c${id}.txt`), clean(meta.description || "", 80));
      const vf = `${gameplayVf(crop, bars)},scale=640:360:flags=lanczos,pad=640:440:0:0:color=0x111111,` +
        `drawtext=fontfile=font.ttf:textfile=a${id}.txt:fontsize=17:fontcolor=0x9be7ff:x=10:y=368,` +
        `drawtext=fontfile=font.ttf:textfile=b${id}.txt:fontsize=17:fontcolor=white:x=10:y=392,` +
        `drawtext=fontfile=font.ttf:textfile=c${id}.txt:fontsize=13:fontcolor=0xaaaaaa:x=10:y=416`;
      fs.writeFileSync(path.join(tmp, `vf${id}.txt`), vf);
      execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(r2(t)), "-i", path.resolve(files[k]), "-filter_script:v", `vf${id}.txt`,
        "-frames:v", "1", `t${id}.png`], { cwd: tmp, stdio: ["ignore", "ignore", "pipe"] });
      tiles.push({ n, start: Number(s.start), end: Number(s.end) });
    }
    if (!n) throw new Bad(`none of the gameplay clips is in ${clipDir}: run gameplay.mjs fetch first (missing: ${[...new Set(missing)].join(", ")})`);
    fs.mkdirSync(dest, { recursive: true });
    const esc = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), stale = new RegExp(`^${esc}_\\d+\\.jpg$`);
    for (const f of fs.readdirSync(dest)) if (stale.test(f)) fs.rmSync(path.join(dest, f), { force: true });
    fs.rmSync(path.resolve(out), { force: true });   // the one-image sheet of an older run
    const cols = Math.min(SHEET_COLS, n), total = Math.ceil(n / SHEET_PER_PAGE);
    for (let pg = 0; pg < total; pg++) {
      const list = tiles.slice(pg * SHEET_PER_PAGE, (pg + 1) * SHEET_PER_PAGE);
      const file = path.join(dest, `${base}_${String(pg + 1).padStart(2, "0")}.jpg`);
      execFileSync("ffmpeg", ["-v", "error", "-y", "-start_number", String(list[0].n), "-i", "t%03d.png", "-frames:v", "1",
        "-vf", `tile=${cols}x${Math.ceil(list.length / cols)}:padding=6:color=black`, "-q:v", "2", file],
      { cwd: tmp, stdio: ["ignore", "ignore", "pipe"] });
      pages.push({ file, first: list[0].n, last: list[list.length - 1].n, from: list[0].start, to: list[list.length - 1].end });
    }
    return { shots: n, pages, missing: [...new Set(missing)] };
  } catch (e) {
    if (e instanceof Bad) throw e;
    throw new Bad(`FFmpeg couldn't make the sheet: ${String(e.stderr || e.message).trim().split("\n").pop()}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- command line

const USAGE = `usage:
  node <skills>/skills/gta-footage/gameplay.mjs assign work/beats.json work/gameplay_picks.json [--out work/beats.json]
  node <skills>/skills/gta-footage/gameplay.mjs fetch work/gameplay_picks.json [--dir footage/gameplay]
  node <skills>/skills/gta-footage/gameplay.mjs sheet work/shots.json|plan.json [--out work/gameplay.jpg] [--dir footage/gameplay] [--words work/words.json]
      (writes pages of 12 frames: work/gameplay_01.jpg, work/gameplay_02.jpg...)
Run it from the project folder.`;

async function main(argv) {
  const [cmd, ...rest] = argv;
  const pos = [], opt = {};
  for (let i = 0; i < rest.length; i++) {
    const x = rest[i];
    if (x === "-h" || x === "--help") return console.log(USAGE), 0;
    if (["--out", "--dir", "--words"].includes(x)) {
      if (i + 1 >= rest.length) return console.error(`gameplay: ${x} needs a value\n${USAGE}`), 2;
      opt[x.slice(2)] = rest[++i];
    } else if (x.startsWith("--")) return console.error(`gameplay: unknown option ${x}\n${USAGE}`), 2;
    else pos.push(x);
  }
  try {
    if (cmd === "fetch" && pos.length === 1) {
      const r = await fetchClips(pos[0], opt.dir || DIR);
      console.log(`\n${r.total} clip(s): ${r.got} fetched, ${r.kept} already here, into ${opt.dir || DIR}`);
      for (const [id, why] of r.failed) console.log(`FAILED ${id}: ${why}`);
      if (r.refused.length) {
        console.log(`\nREFUSED, not fetched: ${cutsceneMsg(r.refused)}`);
        console.log("Swap them in the picks file (and on their beats: assign again), then fetch again.");
      }
      if (r.stale.length) {
        console.log(`\n${r.stale.length} clip(s) need a fresh link: ${r.stale.map(([id]) => id).join(", ")}`);
        for (const [id, why] of r.stale) console.log(`  ${id}: ${why}`);
        console.log("Call gta_get_clip for each, put its new video_url in the picks file, and run fetch again (the clips here are kept).");
      }
      return r.refused.length || r.failed.length ? 1 : r.stale.length ? 2 : 0;
    }
    if (cmd === "assign" && pos.length === 2) {
      const beats = readJson(pos[0]);
      if (!Array.isArray(beats)) throw new Bad(`${pos[0]} must hold a list of beats`);
      const r = assign(beats, readPicks(pos[1]));
      console.log(r.lines.join("\n"));
      const data = JSON.stringify(r.beats, null, 1);
      if (opt.out) fs.writeFileSync(opt.out, data, "utf8");
      else console.log(data);
      const n = r.beats.filter((b) => b.clip).length;
      console.log(`\n${n} of ${beats.length} beats carry a gameplay clip${opt.out ? ` -> ${opt.out}` : ""}.`);
      if (r.warn.length) console.log(`CHECK beats ${r.warn.join(", ")}: see those lines.`);
      if (r.bad.length) {
        console.log(`FIX beats ${r.bad.join(", ")}: they have no clip yet (see those lines), then assign again.`);
        return 1;
      }
      return 0;
    }
    if (cmd === "sheet" && pos.length === 1) {
      const r = sheet(pos[0], { out: opt.out || path.join("work", "gameplay.jpg"), dir: opt.dir, words: opt.words });
      const rel = (f) => path.relative(process.cwd(), f).replace(/\\/g, "/");
      console.log(`${r.shots} gameplay shot(s), each at the middle of the piece it plays, framed like the video, on ${r.pages.length} page(s):`);
      for (const p of r.pages) console.log(`  ${rel(p.file)}  #${p.first}-#${p.last}  ${ts(p.from)}-${ts(p.to)}`);
      console.log("Open every page. For each frame: do its words name something a viewer expects to see right now (a place, an " +
        "object, a person doing something, weather, a body change)? If so, is it clearly in the picture? Swap the clip when it isn't.");
      if (r.missing.length) console.log(`Not fetched yet, so not on the sheet: ${r.missing.join(", ")} (gameplay.mjs fetch).`);
      return 0;
    }
    console.error(USAGE);
    return 2;
  } catch (e) {
    if (!(e instanceof Bad)) throw e;
    console.error(`gameplay: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
