#!/usr/bin/env node
// Find the official GTA VI shots that show what the voice-over is saying.
//
// Search (look at the options for one line):
//     node <skills>/skills/gta-footage/find_shots.mjs search "swamp airboat sawgrass wetland" [--need 3.0] [--place grassrivers]
//         [--who jason lucia] [--limit 8] [--json]
//     node <skills>/skills/gta-footage/find_shots.mjs search "night" --broll [--place vice_city] [--need 2.5]      (background options)
//
// Pick (one shot per beat, for the whole video):
//     node <skills>/skills/gta-footage/find_shots.mjs pick beats.json --footage FOLDER [--plan plan.json] [--out shots.json]
//     (with the Algrow footage library, library.json at the repo root, leave out --footage: src stays the YouTube id)
//     (--plan: the video's plan.json, for its graphics and the footage it already uses elsewhere; see the rules below)
//
// Draft the beats (cut between words, 2.4 s in the hook, 3.4 s after; each beat's words for you to read and type):
//     node <skills>/skills/gta-footage/find_shots.mjs beats words.json [--duration S] [--hook 30] [--out beats.json]
//
// beats.json is a list of the moments to fill, written from the voice-over. A beat is either:
//   "show":  the line names something on screen (a place, a character, a vehicle, an action), so
//            `query` lists those things and the shot must show them. `who` names the leads it is about;
//   "broll": the line is just talk (an opinion, a setup, a joke), so any good background shot from
//            the chapter's `place` will do. `query` is optional mood words ("night", "calm", "sunset").
// Any beat can name its shot instead: "shot": "lt-016", and optionally "in": 32.1 (seconds in the source
// video, like `in` in shots.json). Pick then uses that shot as given, if it is long enough.
//     [{"start": 0.0, "end": 2.6, "type": "show", "query": "swamp airboat sawgrass", "place": "grassrivers"},
//      {"start": 2.6, "end": 5.1, "type": "broll", "query": "sunset calm", "place": "vice_city"},
//      {"start": 5.1, "end": 7.0, "type": "show", "query": "lucia prison", "who": ["lucia"]},
//      {"start": 7.0, "end": 9.0, "type": "show", "shot": "lt-016"}]
//
// The rules pick follows:
// - Characters: a beat with `who` (or a lead's name in its query) only takes a shot that confirms that
//   person (`who` lists them, not `unsure_who`). With none, it gets background footage and the report
//   says so. A shot showing a lead, or maybe showing one, is never background footage.
// - Scenes: never the same `scene` within six picks; reusing a scene anywhere costs score, so an unused
//   scene of equal fit wins. A long shot can give a second, later piece; the same moment comes back only
//   when the library has no unused footage that long left, from as far away as possible, with a note.
// - Order: named shots first, then the show beats whose best match stands alone, then the rest, then
//   background, so an easy beat never takes the one shot another beat needs.
// - Background stays in the beat's `place`: good background (`bg`) there first, then shots only guessed
//   to be there (`place_guess`), then the neighbouring regions, then shots of unknown region; other calm
//   shots and other regions only as a last resort. The report says each time it leaves the place.
// - Never a shot with an outdated date on screen (`dated`) unless the beat names it.
// - No violent shot in the first 7.5 s, none as background, and never a graphic one unless named.
// - Words on screen only when the query asks for them (or names them), never as background; game-HUD
//   footage as background only when no clean shot fits.
// - With --plan: a beat under an overlay graphic never gets a shot whose game HUD (`hud`: minimap, prompts, stars...)
//   sits in a corner the graphic covers, unless nothing else fits at all (then a CHECK line says so). Plain footage
//   may keep its HUD. The moments the plan uses outside these beats (its other shots, `@frame`/`@clip` values) count
//   as already used.
// - A beat still empty at the end gets background cut closer to the shot's ends, or a shot freed by moving
//   a neighbouring background beat, or that far-away repeat. Only when nothing at all is long enough does a
//   beat stay empty (exit code 1).
// The report ends with a summary and a CHECK line for the beats to fix (split, merge, place or name).
// It writes the `shots[]` list for plan.json, with each file found in FOLDER (a video whose name
// contains the YouTube id). Needs Node.js 22+ (see SETUP.md at the repo root).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { libraryConfig } from "./library.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(HERE, "shot-index.json");
const TEMPLATES = path.join(HERE, "..", "gta-motion", "templates");
const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"];
const UNDER = 0.1;       // a graphic over less of a beat than this (its last frames) doesn't count
const HOOK = 7.5;        // no violence before this time
const SPACING = 6;       // never the same scene within this many picks
const MARGIN = 0.15;     // skip this much at each end of a shot (cut frames)
const NAMED_MARGIN = 0.05;  // ...and at least this much for a named shot
const REUSE_GAP = 0.5;   // a second piece of a long shot starts this far after the first one ends
const MIN_TERMS = 3;     // a "show" match needs at least one real word hit (a tag)...
const PER_TERM = 1.5;    // ...and this much per query word (half the words hit as tags), or it becomes background
const SCENE_COST = 1.5;  // per earlier use of the same scene anywhere in the video
const PLACES = ["vice_city", "leonida_keys", "grassrivers", "port_gellhorn", "ambrosia", "mount_kalaga"];
const NEAR = {           // neighbouring regions, closest first
  vice_city: ["grassrivers", "leonida_keys"],
  leonida_keys: ["vice_city", "grassrivers"],
  grassrivers: ["vice_city", "leonida_keys", "ambrosia"],
  ambrosia: ["grassrivers", "mount_kalaga", "port_gellhorn"],
  port_gellhorn: ["mount_kalaga", "ambrosia"],
  mount_kalaga: ["port_gellhorn", "ambrosia"],
};
const ALIAS = { duval: "jason", caminos: "lucia", bautista: "raul" };   // surnames -> the index's `who` names
// words for an anonymous person: they barely count, so "woman smiling" can't pull in a random woman
const GENERIC = new Set(["man", "men", "woman", "women", "guy", "girl", "boy", "person", "people", "lady", "figure"].map(stem));
// a person as the subject of a shot (the first words of its description)
const STRANGER = new Set(["man", "men", "woman", "women", "guy", "girl", "boy", "person", "lady", "couple"].map(stem));
// the last part of a compound word in a description also counts: a motorboat or an airboat is a boat, a motorbike a bike
const HEADS = ["boat", "bik"];
// words that don't describe the picture (and switches like "hud"), left out of the per-word threshold
const STOP = new Set(["a", "an", "the", "and", "or", "of", "in", "on", "at", "to", "up", "by", "for", "from", "with", "into",
  "over", "its", "his", "her", "their", "hud", "gameplay", "text", "shot", "footage"].map(stem));
// a query word also finds these (a weaker hit), so "drone coast" finds "aerial ... beach"
const RELATED = Object.fromEntries(Object.entries({
  aerial: "overhead drone top-down above", drone: "aerial overhead", overhead: "aerial top-down",
  coast: "beach shore sea waterfront coastline bay", shore: "beach coast sea", beach: "sand shore coast",
  sea: "ocean water turquoise bay", ocean: "sea water", water: "sea river bay",
  swamp: "wetland sawgrass marsh mangrove airboat grassrivers", wetland: "swamp marsh sawgrass", mangrove: "swamp mangroves",
  river: "stream water", island: "islands keys key", keys: "island islands",
  town: "village street houses main-street", house: "houses home homes", houses: "house homes",
  truck: "pickup trucks", pickup: "truck", biker: "motorcycle bike rider bikers", bike: "motorcycle dirt-bike",
  motorcycle: "bike biker rider", forest: "trees woods", woods: "forest trees", tree: "trees forest",
  car: "sedan convertible suv coupe sports", club: "nightclub dance party", nightclub: "club dance",
  party: "club crowd guests", dancing: "dance dancers", dance: "dancing dancers",
  police: "cop cops officer sheriff", cop: "police officer", skyline: "towers skyscraper skyscrapers city",
  mud: "dirt bog", bog: "mud swamp", fishing: "fish fisherman rod", deer: "elk animal animals",
  storm: "hurricane rain wind", hurricane: "storm rain wind", store: "shop", shop: "store", mall: "strip shops store",
  sunset: "dusk golden", sunrise: "dawn golden", night: "neon dark", rural: "trailer countryside farm yard",
  boat: "motorboat yacht airboat sailboat dinghy ship", fishing: "fisherman rod angler", hunting: "hunter rifle deer elk",
  trail: "dirt path track off-road", classic: "vintage lowrider old retro", jet: "jetski", ski: "jetski",
}).map(([k, v]) => [stem(k), new Set(v.split(" ").map(stem))]));
// shots that work as background: wide, scenic, the world itself rather than a story moment
const BROLL = new Set(["aerial", "skyline", "sunset", "sunrise", "street", "palm", "sea", "water", "beach",
  "boat", "marina", "swamp", "sky", "bridge", "road", "traffic", "neon", "establishing", "landscape", "ocean",
  "coast", "island", "highway", "skyscraper", "tower", "view", "wide", "drone", "wetland", "forest"].map(stem));
// ambient life: adds to a background shot's score, but doesn't make one
const AMBIENT = new Set(["crowd", "party", "club", "dance", "pool", "bar", "rooftop", "mall", "shop", "motel", "house",
  "town", "park", "dock", "pier", "harbor", "river", "lake", "trees", "mangrove", "sawgrass", "airboat", "lights", "palms",
  "bay"].map(stem));
// a shot about one person: never background unless judged so by eye (bg)
const PERSONAL = new Set(["close-up", "close", "man", "men", "woman", "women", "guy", "girl", "boy", "host", "couple",
  "lady"].map(stem));
const WIDE = new Set(["aerial", "skyline", "establishing", "landscape", "drone", "wide", "view", "sunset", "sunrise"].map(stem));
// never background: cards and logos, and story moments that would pull the eye away from the voice
const NOT_BROLL = new Set(["title", "logo", "black", "rockstar", "text", "card", "chase", "police", "robbery",
  "jump", "parachute", "fight", "crash", "explosion", "shoot", "gun", "fire", "arrest", "prison", "tv"].map(stem));
const VIDEO = /\.(mp4|mkv|webm|mov|m4v)$/i;
const USAGE = `usage:
  node <skills>/skills/gta-footage/find_shots.mjs search "words for what is on screen" [--need SECONDS] [--place PLACE] [--who NAME ...] [--limit N] [--json]
  node <skills>/skills/gta-footage/find_shots.mjs search "mood words" --broll [--place PLACE] [--need SECONDS]     (background options)
  node <skills>/skills/gta-footage/find_shots.mjs beats words.json [--duration SECONDS] [--hook 30] [--out beats.json]     (a first cut of the beats)
  node <skills>/skills/gta-footage/find_shots.mjs pick beats.json [--footage FOLDER] [--plan plan.json] [--out shots.json]
    (--footage: your copies of the official videos; leave it out with the Algrow footage library, library.json)
    (--plan: no game HUD under the plan's graphics, and none of the footage it already uses elsewhere)
places: ${PLACES.join(", ")}, or any (talk with no in-game place)`;

function die(msg, code = 2) {
  console.error(msg);
  process.exit(code);
}

function stem(w) {
  w = w.toLowerCase().replace(/^['-]+|['-]+$/g, "");
  for (const suf of ["ings", "ing", "ies", "es", "s"]) {
    if (w.length > suf.length + 2 && w.endsWith(suf)) {
      w = w.slice(0, -suf.length) + (suf === "ies" ? "y" : "");
      break;
    }
  }
  return w.length > 3 && w.endsWith("e") ? w.slice(0, -1) : w;   // dance, dancing, dances -> danc
}

const terms = (text) => new Set((String(text).toLowerCase().match(/[a-z0-9][a-z0-9'-]+/g) || []).map(stem));
const has = (q, ...ws) => ws.some((w) => q.has(stem(w)));

function loadIndex() {
  const idx = JSON.parse(fs.readFileSync(INDEX, "utf8").replace(/^﻿/, ""));
  idx.byId = {};
  idx.leads = new Set();
  for (const s of idx.shots) {
    s.who = (s.who || []).map((w) => w.toLowerCase());
    for (const w of s.who) idx.leads.add(w);
    s.scene = s.scene || s.id;                                  // a version-1 index has no scenes
    const txt = s.text === true ? "[text]" : String(s.text || "");
    s._words = txt.trim() !== "" && !/^\[.*\]$/.test(txt.trim());   // real words on screen, not just a HUD
    s._graphic = txt.trim() !== "" && !s._words;
    s._text = terms(txt.replace(/\[|\]/g, " "));
    s._tags = new Set(s.tags.map(stem));
    s._desc = terms(s.d);
    for (const w of [...s._desc]) for (const h of HEADS) if (w.length > h.length + 2 && w.endsWith(h)) s._desc.add(h);  // motorboat: a boat
    s._lead = new Set([...terms(s.d.split(/\s+/).slice(0, 6).join(" "))]);   // the subject: the description's first words
    s._len = s.b - s.a - 2 * MARGIN;
    s._region = s.place || s.place_guess || null;
    s._hud = {};                                                // corner -> the HUD elements there (version 3: true)
    if (s.hud === true) for (const c of CORNERS) s._hud[c] = ["game HUD"];
    else for (const [e, c] of Object.entries(s.hud || {})) for (const k of [c].flat()) (s._hud[k] ??= []).push(e);
    idx.byId[s.id] = s;
  }
  return idx;
}

/** The corners an overlay graphic covers, read from the words of its device.json (`name`, `when`): the corners they
 *  name ("lower left", "top-left badge"), both top ones for a top bar, both bottom ones for a lower third or a line
 *  along the bottom, and both bottom ones when they name none (a new animation, a centred title). Full-screen scenes
 *  and transitions cover the footage or blur it: none. */
const DEVICES = new Map();
function graphicCorners(g) {
  const dev = String(g.device || "");
  if (!DEVICES.has(dev)) {
    let d = null;
    try {
      if (/^[\w.-]+$/.test(dev)) d = JSON.parse(fs.readFileSync(path.join(TEMPLATES, dev, "device.json"), "utf8").replace(/^﻿/, ""));
    } catch {}
    DEVICES.set(dev, d);
  }
  const d = DEVICES.get(dev);
  if ((d ? d.layer : g.layer) !== "overlay") return [];
  const out = new Set();
  const words = d ? `${d.name}. ${d.when}`.toLowerCase() : "";
  for (const m of words.matchAll(/\b(top|upper|bottom|lower)[- ](left|right)\b/g)) {
    out.add(`${m[1] === "upper" ? "top" : m[1] === "lower" ? "bottom" : m[1]}-${m[2]}`);
  }
  if (/\btop (?:edge|bar|banner)\b/.test(words)) ["top-left", "top-right"].forEach((c) => out.add(c));
  if (/\b(?:lower third|bottom edge|along the bottom|at the bottom|low in the frame)\b/.test(words) || !out.size) {
    ["bottom-left", "bottom-right"].forEach((c) => out.add(c));
  }
  return [...out];
}

/** From the video's plan.json: its graphics with the corners they cover, and every moment of an official video it
 *  uses (its shots, and the `@frame`/`@clip` values of its graphics). */
function readPlan(idx, file) {
  const plan = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  const vid = (src) => (idx.sources.find((v) => String(src).includes(v.id)) || {}).id;
  const used = [];
  for (const s of plan.shots || []) {
    const len = Number(s.end) - Number(s.start);
    used.push({ src: vid(s.src), from: Number(s.in), to: Number(s.in) + len, start: Number(s.start), end: Number(s.end) });
  }
  const walk = (o) => {
    if (typeof o === "string") {
      const m = o.match(/^@(frame|clip)\s+(\S+)\s+([\d.]+)(?:\s+([\d.]+))?/);
      if (m) used.push({ src: m[2], from: Number(m[3]), to: Number(m[3]) + (m[1] === "clip" ? Number(m[4] || 0) : 0.05) });
    } else if (o && typeof o === "object") for (const v of Object.values(o)) walk(v);
  };
  for (const g of plan.graphics || []) walk(g.vars);
  const graphics = (plan.graphics || []).map((g) => ({ id: g.id || g.device, start: Number(g.start), end: Number(g.end),
    corners: graphicCorners(g) })).filter((g) => g.corners.length);
  return { graphics, used: used.filter((u) => u.src && Number.isFinite(u.from) && u.to >= u.from) };
}

/** The leads a beat is about: its `who`, plus any lead named in its query. */
function leadsOf(idx, bt) {
  const out = new Set((Array.isArray(bt.who) ? bt.who : bt.who ? [bt.who] : []).map((w) => String(w).toLowerCase()));
  for (const t of terms(bt.query || "")) {
    if (idx.leads.has(t)) out.add(t);
    else if (ALIAS[t] && idx.leads.has(ALIAS[t])) out.add(ALIAS[t]);
  }
  return [...out];
}

/** Query words that describe what is on screen (the leads' names are matched through `who` instead). */
function queryTerms(idx, query) {
  const q = terms(query || "");
  for (const t of [...q]) if (idx.leads.has(t) || ALIAS[t]) q.delete(t);
  return q;
}

function termScore(shot, q) {
  let sc = 0;
  for (const t of q) {
    if (STOP.has(t)) continue;
    const w = GENERIC.has(t) ? 1 : 0;
    if (shot._tags.has(t)) sc += w || 3;
    else if (shot._desc.has(t) || shot._text.has(t)) sc += w || 2;
    else if ([...(RELATED[t] || [])].some((r) => shot._tags.has(r) || shot._desc.has(r))) sc += 1;
  }
  return sc;
}

/** The term score a show match needs: one tag hit, and half the describing words hit. */
function needed(q) {
  const n = [...q].filter((t) => !STOP.has(t) && !GENERIC.has(t)).length;
  return Math.max(MIN_TERMS, PER_TERM * n);
}

/** Does the query ask for words on screen (or the very words a shot shows)? */
const wantsText = (shot, q) => has(q, "text", "logo", "title", "card", "sign", "caption", "news", "livestream", "social") ||
  [...q].some((t) => !STOP.has(t) && shot._text.has(t));

/** How well a shot answers a show query, before the cost of reusing its scene. */
function score(shot, q, place = null, who = null) {
  let sc = termScore(shot, q);
  if (place) {
    if (shot.place === place) sc += 4;
    else if (shot.place_guess === place) sc += 2;
    else if (shot._region && (NEAR[place] || []).includes(shot._region)) sc -= 1;
    else if (shot._region) sc -= 3;
  }
  if (who && who.length) {
    const want = new Set(who);
    sc += 4 * shot.who.filter((w) => want.has(w)).length;
    sc -= 3 * shot.who.filter((w) => !want.has(w)).length;     // another lead in frame
  } else if (shot.who.length || shot.unsure_who) sc -= 3;      // a lead (maybe) in frame reads as "about them"
  const words = [...q].filter((t) => !STOP.has(t) && !GENERIC.has(t));
  sc += Math.min(words.filter((t) => shot._lead.has(t)).length, 2);   // the subject, not a detail in the corner
  if (who && who.some((w) => shot._lead.has(w))) sc += 1;
  if (words.length >= 2 && words.every((t) => shot._tags.has(t) || shot._desc.has(t) || shot._text.has(t))) sc += 2;  // all of it
  const night = shot._desc.has("night") || shot._tags.has("night") || shot.dark;
  const day = ["sunny", "day", "daytime", "daylight"].some((t) => shot._desc.has(stem(t)) || shot._tags.has(stem(t)));
  if ((has(q, "sunny", "day", "daytime", "daylight") && night) || (has(q, "night") && day)) sc -= 3;  // the wrong time of day
  if (shot._words && !wantsText(shot, q)) sc -= 3;
  if ((shot.hud || shot._graphic) && !has(q, "hud", "gameplay")) sc -= 1;
  if (shot.dark && !has(q, "night", "dark")) sc -= 1;
  return sc;
}

/** Does the shot confirm every lead asked for (or at least one)? */
function confirms(shot, who) {
  if (!who.length) return true;
  if (shot.unsure_who) return false;
  return who.some((w) => shot.who.includes(w));
}

const byId = (x, y) => (x[1].id < y[1].id ? -1 : x[1].id > y[1].id ? 1 : 0);
const byScore = (x, y) => y[0] - x[0] || y[1]._len - x[1]._len || byId(x, y);        // background: the longer shot
const byFit = (x, y) => y[0] - x[0] || x[1]._len - y[1]._len || byId(x, y);          // show: the tighter shot

function search(idx, query, { need = 0, place = null, who = null, limit = 8, t = null, exclude = null, cost = null,
  strictWho = false, auto = false, all = false } = {}) {
  const q = queryTerms(idx, query);
  const out = [];
  for (const s of idx.shots) {
    if (s._len < need) continue;
    if (t !== null && t < HOOK && s.hook_ok === false) continue;
    if (auto && (s.dated || s.violence >= 2 || (s._words && !wantsText(s, q)))) continue;
    if (strictWho && !confirms(s, who || [])) continue;
    if (exclude && exclude(s)) continue;
    const raw = score(s, q, place, who);
    if (raw > 0 || strictWho || all) out.push([raw - (cost ? cost(s) : 0), s, raw, termScore(s, q)]);
  }
  out.sort(byFit);
  return out.slice(0, limit);
}

/** Can the shot be background footage? 0 yes (bg), 1 bg but the game HUD shows, 2 scenic but not judged bg,
 *  3 a last resort (any calm shot with no lead and no words), -1 never. */
function brollLevel(shot) {
  if (shot.who.length || shot.unsure_who) return -1;           // a lead (maybe) in frame: never background
  if (shot._words || shot.violence || shot.dated) return -1;
  if (shot.bg) return shot.hud || shot._graphic ? 1 : 0;       // bg: judged good background by eye
  const words = [...shot._tags, ...shot._desc];
  if (shot.hud || shot._graphic || shot._tags.has("interior") || words.some((t) => NOT_BROLL.has(t) || PERSONAL.has(t))) return 3;
  return [...shot._tags].some((t) => BROLL.has(t)) ? 2 : 3;
}
const LEVEL_NOTE = ["", "game HUD on screen: no clean background left that fits",
  "a shot not marked as good background: no better one left that fits",
  "LAST RESORT, not background footage: every background shot that fits is used; split or merge beats, or name a shot"];

/** Background footage: scenic, calm, the chapter's world. Mood words only nudge the choice. */
function brollScore(shot, mood) {
  if (brollLevel(shot) < 0) return 0;
  const scenic = [...shot._tags].filter((t) => BROLL.has(t) || AMBIENT.has(t)).length;
  let sc = (shot.bg ? 6 : 0) + 2 * Math.min(scenic, 3) + Math.min([...shot._tags].filter((t) => WIDE.has(t)).length, 2);
  for (const t of mood) if (shot._tags.has(t) || shot._desc.has(t)) sc += 2;
  if (shot._tags.has("interior")) sc -= 2;
  if (shot.dark && !has(mood, "night", "dark", "neon")) sc -= 1;
  return Math.max(sc, 0.5);
}

/** 0 in the place, 1 guessed there, 2 a neighbouring region, 3 region unknown, 4 another region. */
function tierOf(shot, place) {
  if (!place) return 0;
  if (shot.place === place) return 0;
  if (!shot.place && shot.place_guess === place) return 1;
  if (shot._region && (NEAR[place] || []).includes(shot._region)) return 2;
  if (!shot._region) return 3;
  return 4;
}
const TIER_NOTE = ["", "from a shot only guessed to be in", "from a neighbouring region of", "from a shot of unknown region, not",
  "from another region, not"];

function searchBroll(idx, mood, { need = 0, place = null, limit = 8, exclude = null, cost = null } = {}) {
  const q = terms(mood || "");
  const out = [];
  for (const s of idx.shots) {
    if (s._len < need || (exclude && exclude(s))) continue;
    const sc = brollScore(s, q);
    if (sc > 0) out.push([sc - (cost ? cost(s) : 0), s, sc, brollLevel(s), tierOf(s, place)]);
  }
  // good background in the place, then guessed there, the neighbours, region unknown; then other calm shots in that
  // order; another region only when nothing else is left
  const grp = (c) => (c[4] === 4 ? 2 : c[3] >= 2 ? 1 : 0);
  out.sort((x, y) => grp(x) - grp(y) || x[4] - y[4] || x[3] - y[3] || byScore(x, y));
  return out.slice(0, limit);
}

function listVideos(folder) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && VIDEO.test(e.name)) out.push(p);
    }
  };
  walk(folder);
  return out.sort();
}

/** A named shot: where it starts, or why it can't be used. */
function namedPiece(s, bt, need) {
  const fmt = (x) => x.toFixed(2);
  if (bt.in !== undefined && bt.in !== null && bt.in !== "") {
    const at = Number(bt.in);
    if (!Number.isFinite(at)) return { why: `"in" must be a number of seconds` };
    if (at < s.a - 1e-6 || at >= s.b) {
      return { why: `"in": ${bt.in} is outside ${s.id} (${fmt(s.a)}-${fmt(s.b)} s in the source video; "in" counts from the start of the video)` };
    }
    if (at + need > s.b - NAMED_MARGIN + 1e-6) {
      const latest = s.b - NAMED_MARGIN - need;
      return { why: `${s.id} from ${fmt(at)} has ${fmt(Math.max(s.b - NAMED_MARGIN - at, 0))} s left, the beat needs ${fmt(need)}` +
        (latest >= s.a ? ` (start it at ${fmt(latest)} at the latest)` : ` (the whole shot is ${fmt(s.b - s.a)} s)`) };
    }
    return { at };
  }
  if (s.a + MARGIN + need <= s.b - MARGIN + 1e-6) return { at: s.a + MARGIN };
  if (s.a + NAMED_MARGIN + need <= s.b - NAMED_MARGIN + 1e-6) return { at: s.a + NAMED_MARGIN };
  return { why: `${s.id} is ${fmt(s.b - s.a)} s long, the beat needs ${fmt(need)}` };
}

function pick(idx, beats, folder, plan = null) {
  const pieces = new Map();       // shot id -> [[from, to], ...] already used (seconds in the source)
  const sceneAt = beats.map(() => null);
  const sceneCount = new Map();
  const res = beats.map(() => null);   // per beat: { s, at, kind, sc }
  const notes = beats.map(() => []);
  const checks = new Set(), bad = [], hudBack = [];
  const count = { named: 0, show: 0, broll: 0, toBroll: 0, noWho: 0, offPlace: 0 };
  const info = beats.map((bt, i) => {
    const t = Number(bt.start), need = Number(bt.end) - t;
    const place = bt.place && PLACES.includes(bt.place) ? bt.place : null;
    // "any": the talk has no in-game place (consoles, PC, price, a date): background from anywhere, on purpose
    if (bt.place && !place && bt.place !== "any") notes[i].push(`unknown place "${bt.place}" ignored`);
    // the plan's overlay graphics over this beat, and the corners they cover
    const over = (plan ? plan.graphics : []).filter((g) => Math.min(g.end, t + need) - Math.max(g.start, t) > UNDER);
    return { i, bt, t, need, place, anyPlace: bt.place === "any", who: leadsOf(idx, bt), q: queryTerms(idx, bt.query), over,
      under: [...new Set(over.flatMap((g) => g.corners))] };
  });
  /** The shot's HUD elements a graphic over the beat would sit on ("minimap bottom-left"). */
  const hudUnder = (b, s) => b.under.flatMap((c) => (s._hud[c] || []).map((e) => `${e} ${c}`));
  const hudFree = (b, exclude) => (b.under.length && !b.hudOk ? (s) => hudUnder(b, s).length > 0 || (exclude ? exclude(s) : false) : exclude);

  /** Where a new piece of `need` s can start in the shot, keeping clear of the pieces already used; null if nowhere. */
  const freeAt = (s, need, margin = MARGIN) => {
    let at = s.a + margin;
    for (const [u0, u1] of [...(pieces.get(s.id) || [])].sort((x, y) => x[0] - y[0])) {
      if (at + need + REUSE_GAP <= u0) break;
      at = Math.max(at, u1 + REUSE_GAP);
    }
    return at + need <= s.b - margin + 1e-9 ? at : null;
  };
  const sceneNear = (scene, i) => {
    for (let j = Math.max(0, i - SPACING); j <= Math.min(beats.length - 1, i + SPACING); j++) {
      if (j !== i && sceneAt[j] === scene) return true;
    }
    return false;
  };
  const blocked = (b, margin = MARGIN) => (s) => sceneNear(s.scene, b.i) || freeAt(s, b.need, margin) === null;
  const cost = (s) => SCENE_COST * (sceneCount.get(s.scene) || 0) + (pieces.has(s.id) ? 1 : 0);
  const take = (b, s, at, kind, sc) => {
    pieces.set(s.id, [...(pieces.get(s.id) || []), [at, at + b.need]]);
    sceneAt[b.i] = s.scene;
    sceneCount.set(s.scene, (sceneCount.get(s.scene) || 0) + 1);
    res[b.i] = { s, at, kind, sc };
    count[kind]++;
  };
  const untake = (b) => {
    const { s, at, kind } = res[b.i];
    pieces.set(s.id, pieces.get(s.id).filter(([u0]) => u0 !== at));
    if (!pieces.get(s.id).length) pieces.delete(s.id);
    sceneAt[b.i] = null;
    sceneCount.set(s.scene, sceneCount.get(s.scene) - 1);
    res[b.i] = null;
    count[kind]--;
    return { s, at, kind };
  };
  const showCands = (b, exclude, limit) => {
    exclude = hudFree(b, exclude);
    if (b.who.length) {
      return search(idx, b.bt.query, { need: b.need, place: b.place, who: b.who, limit, t: b.t, exclude, cost, strictWho: true, auto: true });
    }
    const least = needed(b.q);
    return search(idx, b.bt.query, { need: b.need, place: b.place, limit, t: b.t, cost, auto: true, all: true,
      exclude: (x) => termScore(x, b.q) < least || ((x.who.length || x.unsure_who) && score(x, b.q, b.place) < 1) ||
        (exclude ? exclude(x) : false) });
  };
  // a show beat sent to background: a stranger as the subject would read as the person or thing the line is about
  const fallbackCost = (s) => cost(s) + ([...s._lead].some((t) => STRANGER.has(t)) ? 3 : 0);
  const brollCands = (b, exclude, limit, tight = 0) => searchBroll(idx, b.bt.query, { need: b.need - tight, place: b.place, limit,
    exclude: hudFree(b, exclude), cost: b.bt.type === "broll" ? cost : fallbackCost });
  // the beats with the fewest options choose first, so an easy beat never takes the only shot a later one could use
  const fewestFirst = (list, options) => list.map((b) => [options(b), b]).sort((x, y) => x[0] - y[0] || x[1].i - y[1].i).map((x) => x[1]);

  // the moments the plan uses outside these beats (its other shots, stills and clips) are used already: that piece is
  // kept out, and the rest of the shot and its scene cost score, like a shot picked here (until step 4, see there)
  const seen = new Set(), elsewhere = [];
  for (const u of plan ? plan.used : []) {
    const mid = u.start === undefined ? null : (u.start + u.end) / 2;
    if (mid !== null && info.some((b) => b.t <= mid && mid < b.t + b.need)) continue;   // a shot these beats pick again
    for (const s of idx.shots) {
      const key = `${s.id} ${u.from} ${u.to}`;
      if (s.src !== u.src || !(s.a < u.to + 1e-6 && s.b > u.from) || seen.has(key)) continue;
      seen.add(key);
      elsewhere.push([s.id, Math.max(u.from, s.a), Math.min(u.to, s.b)]);
      pieces.set(s.id, [...(pieces.get(s.id) || []), [Math.max(u.from, s.a), Math.min(u.to, s.b), "plan"]]);
      sceneCount.set(s.scene, (sceneCount.get(s.scene) || 0) + 1);
    }
  }

  // 1. named shots, as given
  const queue = [];
  for (const b of info) {
    if (!Number.isFinite(b.t) || !(b.need > 0)) {
      bad.push(b.i);
      continue;
    }
    if (b.bt.shot) {
      const s = idx.byId[b.bt.shot];
      const p = s ? namedPiece(s, b.bt, b.need) : null;
      if (!s) notes[b.i].push(`named shot ${b.bt.shot} is not in the index (cards and unusable shots are left out); picked instead`);
      else if (p.why) notes[b.i].push(`named shot not used: ${p.why}; picked instead`);
      else {
        const warn = [];
        if (sceneNear(s.scene, b.i)) warn.push(`its scene ${s.scene} is also on another named beat within ${SPACING} picks`);
        if ((pieces.get(s.id) || []).some(([u0, u1]) => p.at < u1 && p.at + b.need > u0)) warn.push("this piece is already used by another named beat or elsewhere in the plan");
        if (hudUnder(b, s).length) warn.push(`the game HUD (${hudUnder(b, s).join(", ")}) sits under ${b.over.map((g) => g.id).join(", ")}`);
        if (b.t < HOOK && s.hook_ok === false) warn.push("violent shot in the first 7.5 s");
        if (s.dated) warn.push(`outdated date on screen: ${s.text}`);
        if (warn.length) notes[b.i].push(warn.join("; "));
        take(b, s, p.at, "named", 0);
      }
      if (notes[b.i].length) checks.add(b.i);
    }
    if (!res[b.i]) queue.push(b);
  }

  // 2. show beats: the best free shot that really shows it. A beat whose best match stands alone chooses before one with
  // many near-equal options; a beat left with only a weaker match than its best waits for the second round, so it can't
  // take the one shot another beat really needs.
  const shows = queue.filter((b) => b.bt.type !== "broll" && (String(b.bt.query || "").trim() !== "" || b.who.length > 0));
  const best = new Map();
  const goodOptions = (b) => {
    const c = showCands(b, null, Infinity);
    best.set(b.i, c.length ? c[0][2] : 0);
    return c.length ? c.filter((x) => x[2] >= c[0][2] - 2).length : 0;
  };
  const later = [];
  for (const round of [1, 2]) {
    for (const b of round === 1 ? fewestFirst(shows, goodOptions) : later) {
      const c = showCands(b, blocked(b), 1);
      if (c.length && round === 1 && c[0][2] < best.get(b.i) - 2) {
        later.push(b);
        continue;
      }
      if (c.length) {
        const s = c[0][1];
        take(b, s, freeAt(s, b.need), "show", c[0][0]);
        const missed = b.who.filter((w) => !s.who.includes(w));
        if (missed.length) notes[b.i].push(`shows ${b.who.filter((w) => s.who.includes(w)).join(", ")} but not ${missed.join(", ")}`);
      } else if (b.who.length) {
        notes[b.i].push(`no confirmed shot of ${b.who.join(" and ")} is free and long enough, background instead`);
        count.toBroll++;
        count.noWho++;
      } else {
        notes[b.i].push("no real match, background instead");
        count.toBroll++;
      }
    }
  }

  // 3. background: the beat's place first, then shots guessed there, then the neighbouring regions
  const rest = queue.filter((b) => !res[b.i]);
  for (const b of fewestFirst(rest, (b) => brollCands(b, null, Infinity).filter((c) => c[4] === 0 && c[3] < 2).length)) {
    const c = brollCands(b, blocked(b), 1);
    if (!c.length) {
      checks.add(b.i);
      continue;
    }
    const [sc, s, , level, tier] = c[0];
    take(b, s, freeAt(s, b.need), "broll", sc);
    if (level > 0) notes[b.i].push(LEVEL_NOTE[level]);
    if (level >= 2) checks.add(b.i);
    if (tier > 0) {
      notes[b.i].push(`background ${TIER_NOTE[tier]} ${b.place}${s._region ? ` (${s._region})` : ""}` +
        (tier >= 2 ? `: nothing left in ${b.place} is ${b.need.toFixed(1)} s long, split the beat to stay there` : ""));
      count.offPlace++;
      if (tier >= 2) checks.add(b.i);
    } else if (!b.place && !b.anyPlace) notes[b.i].push("no place given: background from anywhere (give the beat its chapter's place, or \"any\" when the talk has no in-game place)");
  }

  // 4. a beat still empty: background with thinner margins at the shot's ends, then free a shot by moving the one
  // neighbouring background beat that holds its scene to another shot. The scene and lead rules still hold. The
  // plan's own stills and clips stop keeping their moments out: sharing one is better than repeating a beat's.
  for (const [id, list] of pieces) {
    const own = list.filter((p) => p[2] !== "plan");
    if (own.length) pieces.set(id, own);
    else pieces.delete(id);
  }
  const TIGHT = 2 * (MARGIN - NAMED_MARGIN);
  const place = (b, c, how) => {
    const [sc, s, , level, tier] = c;
    take(b, s, freeAt(s, b.need, NAMED_MARGIN), "broll", sc);
    checks.add(b.i);
    notes[b.i].push(how);
    if (level > 0) notes[b.i].push(LEVEL_NOTE[level]);
    if (tier > 0) {
      notes[b.i].push(`background ${TIER_NOTE[tier]} ${b.place}${s._region ? ` (${s._region})` : ""}`);
      count.offPlace++;
    }
  };
  for (const b of queue.filter((x) => !res[x.i])) {
    const c = brollCands(b, blocked(b, NAMED_MARGIN), 1, TIGHT);
    if (c.length) {
      place(b, c[0], "background cut close to the shot's ends: every other shot that fits is used");
      continue;
    }
    // the shots only a neighbouring background beat's scene keeps out
    const near = (s) => info.filter((y) => y.i !== b.i && Math.abs(y.i - b.i) <= SPACING && sceneAt[y.i] === s.scene);
    const opts = brollCands(b, (s) => freeAt(s, b.need, NAMED_MARGIN) === null || near(s).length !== 1 ||
      res[near(s)[0].i].kind !== "broll", 20, TIGHT);
    for (const c of opts) {
      const y = info[near(c[1])[0].i];
      const old = untake(y);
      const alt = brollCands(y, (s) => s.scene === c[1].scene || blocked(y, NAMED_MARGIN)(s), 1, TIGHT)[0];
      if (alt && !sceneNear(c[1].scene, b.i) && freeAt(c[1], b.need, NAMED_MARGIN) !== null) {
        place(y, alt, `moved to free ${c[1].id} for beat ${b.i}`);
        place(b, c, `took ${c[1].id} from beat ${y.i}, which moved to another shot`);
        break;
      }
      take(y, old.s, old.at, old.kind, res[y.i] ? res[y.i].sc : 0);
    }
  }
  // the library has no unused footage this long left: repeat the background moment used furthest away (never within
  // the scene spacing), and say so
  const usedAt = (s) => info.filter((y) => res[y.i] && res[y.i].s.id === s.id).map((y) => y.i);
  const repeat = (b) => {
    const opts = brollCands(b, (s) => sceneNear(s.scene, b.i) || s.b - s.a - 2 * NAMED_MARGIN < b.need, Infinity, TIGHT)
      .filter((c) => c[3] <= 1 && c[4] <= 3)
      .map((c) => [Math.min(...usedAt(c[1]).map((j) => Math.abs(j - b.i)), Infinity), c])
      .sort((x, y) => y[0] - x[0] || y[1][0] - x[1][0]);
    if (!opts.length) return false;
    const [far, c] = opts[0];
    const s = c[1];
    const from = usedAt(s).sort((x, y) => Math.abs(x - b.i) - Math.abs(y - b.i))[0];
    take(b, s, s.a + MARGIN + b.need <= s.b - MARGIN ? s.a + MARGIN : s.a + NAMED_MARGIN, "broll", c[0]);
    checks.add(b.i);
    count.repeat = (count.repeat || 0) + 1;
    notes[b.i].push(far === Infinity ? "background cut close to the shot's ends" :
      `REPEATS the moment of ${s.id} from beat ${from} (${far} picks away): no unused footage ${b.need.toFixed(1)} s long is left; ` +
      "split the beat into shorter ones or name a shot");
    if (c[4] > 0) {
      notes[b.i].push(`background ${TIER_NOTE[c[4]]} ${b.place}${s._region ? ` (${s._region})` : ""}`);
      count.offPlace++;
    }
    return true;
  };
  for (const b of queue.filter((x) => !res[x.i])) repeat(b);

  // a beat under a graphic still empty: a shot with the game HUD under the graphic after all (a free one, else a
  // repeat), and the report says so
  for (const b of queue.filter((x) => !res[x.i] && x.under.length)) {
    b.hudOk = true;
    const c = b.bt.type !== "broll" ? showCands(b, blocked(b), 1)[0] : null;
    const r = c ? null : brollCands(b, blocked(b, NAMED_MARGIN), 1, TIGHT)[0];
    if (c) take(b, c[1], freeAt(c[1], b.need), "show", c[0]);
    else if (r) take(b, r[1], freeAt(r[1], b.need, NAMED_MARGIN), "broll", r[0]);
    else if (!repeat(b)) continue;
    const hud = hudUnder(b, res[b.i].s);
    if (!hud.length) continue;
    hudBack.push(b.i);
    checks.add(b.i);
    notes[b.i].push(`the game HUD (${hud.join(", ")}) sits under ${b.over.map((g) => g.id).join(", ")}: no HUD-free shot is free ` +
      "and long enough; split the beat or name a shot");
  }

  // the report and the shots, in time order
  const shots = [], report = [], missing = new Set();
  const videos = folder ? listVideos(folder) : [];
  for (const b of info) {
    const r = res[b.i];
    if (bad.includes(b.i)) {
      report.push(`beat ${b.i}: "end" must be a time after "start".`);
      continue;
    }
    if (!r) {
      report.push(`beat ${b.i} at ${b.t.toFixed(1)}s: no shot is ${b.need.toFixed(1)} s long for "${b.bt.query || "background"}" ` +
        `(or every one is in a scene used within ${SPACING} picks). Split the beat into shorter ones.`);
      continue;
    }
    const { s, at, kind, sc } = r;
    const also = sceneAt.map((x, j) => (x === s.scene && j !== b.i ? j : -1)).filter((j) => j >= 0);
    if (also.length) notes[b.i].push(`scene ${s.scene} also at beat ${also.join(", ")}`);
    if (elsewhere.some(([id, u0, u1]) => id === s.id && at < u1 && at + b.need > u0)) notes[b.i].push("shares its moment with footage the plan uses elsewhere");
    const f = folder ? videos.find((p) => path.basename(p).includes(s.src)) : null;
    if (folder && !f) missing.add(s.src);
    shots.push({ start: round2(b.t), end: round2(b.t + b.need), src: f || s.src, in: round2(at), shot: s.id, kind, lb: s.lb ?? null });
    report.push(`beat ${String(b.i).padEnd(3)} ${b.t.toFixed(1).padStart(6)}s  ${kind.padEnd(5)} ${s.id.padEnd(7)} ${s.scene.padEnd(9)} ` +
      `${kind === "named" ? "     " : sc.toFixed(1).padStart(5)}  ${s.d.slice(0, 64)}${notes[b.i].map((x) => `  (${x})`).join("")}`);
  }
  report.push("");
  report.push(`${beats.length} beats, ${shots.length} shots: ${count.named} named, ${count.show} show, ${count.broll} background. ` +
    `${new Set(sceneAt.filter(Boolean)).size} different scenes, none twice within ${SPACING} picks` +
    `${res.some((r) => r && r.kind === "named") ? " (named shots excepted)" : ""}.`);
  if (count.toBroll) {
    report.push(`${count.toBroll} show beats got background footage` +
      (count.noWho ? ` (${count.noWho} because no confirmed shot of the person fits)` : "") + ".");
  }
  if (count.offPlace) report.push(`${count.offPlace} background shots come from outside their beat's place (see the notes).`);
  if (count.repeat) report.push(`${count.repeat} beats repeat a moment used earlier: the library has no unused footage that long left ` +
    "(see the notes; split those beats).");
  if (plan) {
    const under = info.filter((b) => b.under.length && res[b.i]);
    const clash = under.filter((b) => hudUnder(b, res[b.i].s).length).map((b) => b.i);
    report.push(`${under.length} beats sit under an overlay graphic: ${clash.length ? `${clash.length} show the game HUD under it` :
      "none shows the game HUD under it"}. ${seen.size} pieces the plan uses elsewhere were kept out.`);
    if (hudBack.length) report.push(`CHECK game HUD under a graphic at beats ${hudBack.join(", ")}: no HUD-free shot fits; split those beats or name a shot.`);
  }
  if (checks.size || bad.length) report.push(`CHECK beats ${[...checks, ...bad].sort((x, y) => x - y).join(", ")}: see those lines.`);
  return { shots, report, missing };
}

const round2 = (x) => Number(x.toFixed(2));

function parseArgs(argv) {
  const cmd = argv[0];
  if (cmd !== "search" && cmd !== "pick" && cmd !== "beats") die(USAGE);
  const a = { cmd, pos: null, duration: null, hook: 30, need: 0, place: null, who: null, limit: 8, json: false, broll: false, footage: null, out: null, plan: null };
  for (let i = 1; i < argv.length; i++) {
    const x = argv[i];
    const val = () => (i + 1 < argv.length ? argv[++i] : die(`find_shots: ${x} needs a value\n${USAGE}`));
    if (x === "-h" || x === "--help") {
      console.log(USAGE);
      process.exit(0);
    } else if (x === "--json") a.json = true;
    else if (x === "--broll") a.broll = true;
    else if (x === "--need") a.need = Number(val());
    else if (x === "--limit") a.limit = Number(val());
    else if (x === "--place") a.place = val();
    else if (x === "--footage") a.footage = val();
    else if (x === "--out") a.out = val();
    else if (x === "--plan") a.plan = val();
    else if (x === "--duration") a.duration = Number(val());
    else if (x === "--hook") a.hook = Number(val());
    else if (x === "--who") {
      a.who = [];
      while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) a.who.push(argv[++i].toLowerCase());
    } else if (x.startsWith("--")) die(`find_shots: unknown option ${x}\n${USAGE}`);
    else if (a.pos === null) a.pos = x;
    else die(`find_shots: unexpected ${x}\n${USAGE}`);
  }
  if (a.pos === null && !(a.cmd === "search" && a.broll)) die(USAGE);
  if (a.place && !PLACES.includes(a.place)) die(`find_shots: unknown place ${a.place}\n${USAGE}`);
  return a;
}

/** Beats cut between words: about 2.4 s in the hook and 3.4 s after it, ending after a sentence or a pause when one is
 *  close. A draft: read each beat's words, then set its type, query and place (or name a shot). */
export function draftBeats(words, { duration = null, hook = 30 } = {}) {
  const ws = words.map((w) => ({ w: String(w.w ?? w.text ?? w.word ?? ""), s: Number(w.s ?? w.start), e: Number(w.e ?? w.end) }))
    .filter((w) => Number.isFinite(w.s) && Number.isFinite(w.e)).sort((x, y) => x.s - y.s);
  if (!ws.length) return [];
  const end = Math.max(duration || 0, ws[ws.length - 1].e);
  const r3 = (n) => Math.round(n * 1000) / 1000;
  // a cut sits in the gap before a word: its middle, never inside a word
  const cuts = ws.slice(1).map((w, k) => ({ t: r3((ws[k].e + w.s) / 2), k: k + 1,
    stop: /[.!?]["')]]*$/.test(ws[k].w) ? 1 : /[,;:—-]$/.test(ws[k].w) ? 0.5 : 0, pause: w.s - ws[k].e }))
    .filter((c) => c.t >= ws[c.k - 1].e && c.t <= ws[c.k].s);
  const beats = [];
  let t0 = 0;
  while (end - t0 > 0.01) {
    const inHook = t0 < hook - 0.01;
    const [target, lo, hi] = inHook ? [2.4, 1.8, 3.2] : [3.4, 2.6, 4.5];
    if (end - t0 <= hi + (inHook ? 0 : 1.0)) { beats.push([t0, end]); break; }
    const near = cuts.filter((c) => c.t - t0 >= lo && c.t - t0 <= hi && end - c.t >= lo);
    const cost = (c) => Math.abs(c.t - t0 - target) - 0.6 * c.stop - Math.min(c.pause, 0.4);
    const pickc = near.sort((x, y) => cost(x) - cost(y))[0] ||
      cuts.filter((c) => c.t - t0 >= lo).sort((x, y) => x.t - y.t)[0];
    if (!pickc) { beats.push([t0, end]); break; }
    beats.push([t0, pickc.t]);
    t0 = pickc.t;
  }
  return beats.map(([a, b]) => ({ start: r3(a), end: r3(b),
    line: ws.filter((w) => w.s >= a - 0.001 && w.s < b - 0.001).map((w) => w.w).join(" "),
    type: "broll", query: "", place: "" }));
}

function main(argv) {
  const a = parseArgs(argv);
  if (a.cmd === "beats") {
    let words;
    try {
      words = JSON.parse(fs.readFileSync(a.pos, "utf8").replace(/^﻿/, ""));
    } catch (e) {
      die(`find_shots: can't read ${a.pos}: ${e.message}`);
    }
    if (!Array.isArray(words)) words = words.words || words.segments || [];
    const beats = draftBeats(words, { duration: a.duration, hook: a.hook });
    const lens = beats.map((b) => b.end - b.start), after = beats.filter((b) => b.start >= a.hook - 0.01);
    const avg = after.length ? after.reduce((n, b) => n + b.end - b.start, 0) / after.length : 0;
    const data = JSON.stringify(beats, null, 1);
    if (a.out) fs.writeFileSync(a.out, data, "utf8");
    else console.log(data);
    console.log(`${beats.length} beats, ${Math.min(...lens).toFixed(1)} to ${Math.max(...lens).toFixed(1)} s, after the hook ${avg.toFixed(1)} s on average` +
      (a.out ? ` -> ${a.out}` : "") + ". Now set each beat's type (show or broll), query and place.");
    return 0;
  }
  const idx = loadIndex();

  if (a.cmd === "search") {
    const res = a.broll ? searchBroll(idx, a.pos, { need: a.need, place: a.place, limit: a.limit })
      : search(idx, a.pos, { need: a.need, place: a.place, who: leadsOf(idx, { who: a.who, query: a.pos }), limit: a.limit });
    if (a.json) {
      const clean = (s) => Object.fromEntries(Object.entries(s).filter(([k]) => !k.startsWith("_")));
      console.log(JSON.stringify(res.map(([sc, s]) => ({ ...clean(s), score: sc })), null, 1));
    } else {
      if (!res.length && a.need > 0) {
        const any = a.broll ? searchBroll(idx, a.pos, { place: a.place, limit: Infinity })
          : search(idx, a.pos, { place: a.place, who: leadsOf(idx, { who: a.who, query: a.pos }), limit: Infinity });
        const longest = Math.max(0, ...any.map((r) => r[1]._len));
        if (any.length) console.log(`no match is ${a.need} s long: ${any.length} shorter ones, the longest ${longest.toFixed(1)} s. ` +
          "Split the line into shorter beats, or drop --need to see them.");
        else console.log("no match: try other words for what would be on screen (places, objects, actions, time of day)");
      } else if (!res.length) console.log("no match: try other words for what would be on screen (places, objects, actions, time of day)");
      for (const r of res) {
        const [sc, s] = r;
        const flags = [s.who.length ? `who:${s.who.join(",")}` : "", s.unsure_who ? "unsure_who" : "", s.dated ? "DATED" : "",
          s.hud ? `hud:${Object.keys(s._hud).join(",")}` : "", s.dark ? "dark" : "", s.violence ? "violent" : "", s.bg ? "bg" : ""].filter(Boolean).join(" ");
        const where = s.place || (s.place_guess ? `${s.place_guess}?` : "place unknown");
        const tier = a.broll && a.place && r[4] ? `  [${TIER_NOTE[r[4]]} ${a.place}]` : "";
        console.log(`${sc.toFixed(1).padStart(4)}  ${s.id.padEnd(7)} ${s.src} ${s.a.toFixed(2).padStart(7)}-${s.b.toFixed(2).padStart(7)} ` +
          `(${s._len.toFixed(1)}s) ${where} scene ${s.scene} ${flags}${tier}\n      ${s.d}` +
          (s._words || s._graphic ? `\n      on screen: ${s.text === true ? "text" : s.text}` : ""));
      }
    }
    return 0;
  }

  let beats;
  try {
    beats = JSON.parse(fs.readFileSync(a.pos, "utf8").replace(/^﻿/, ""));
  } catch (e) {
    die(`find_shots: can't read ${a.pos}: ${e.message}`);
  }
  if (!Array.isArray(beats)) die(`find_shots: ${a.pos} must hold a list of beats`);
  if (!a.footage) {
    let lib = null;
    try {
      lib = libraryConfig();
    } catch (e) {
      die(`find_shots: ${e.message}`);
    }
    if (!lib) die("find_shots: pick needs --footage FOLDER (your copies of the official videos), or the Algrow footage library " +
      "(library.json at the repo root, see SETUP.md).");
  }
  let plan = null;
  if (a.plan) {
    try {
      plan = readPlan(idx, a.plan);
    } catch (e) {
      die(`find_shots: can't read ${a.plan}: ${e.message}`);
    }
  }
  const { shots, report, missing } = pick(idx, beats, a.footage, plan);
  console.log(report.join("\n"));
  if (missing.size) {
    const names = Object.fromEntries(idx.sources.map((s) => [s.id, s.title]));
    console.log("\nMissing footage (put your copy in the footage folder, with the YouTube id in the file name):");
    for (const m of [...missing].sort()) console.log(`  ${m}  ${names[m] || ""}`);
  }
  const data = JSON.stringify(shots, null, 1);
  if (a.out) {
    fs.writeFileSync(a.out, data, "utf8");
    console.log(`\n${shots.length} shots written to ${a.out}`);
  } else {
    console.log(data);
  }
  return shots.length === beats.length ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
