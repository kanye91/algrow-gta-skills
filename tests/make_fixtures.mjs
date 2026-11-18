#!/usr/bin/env node
// Build the check_pacing test fixtures from one fake 77-second voice-over.
//
//     node tests/make_fixtures.mjs
//
// Writes tests/calm/ (a plan that must pass) and tests/busy/ (a plan that must fail on every
// rule). Both share words.json, so the anchors are real word times.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = [
  "GTA 6 has over 3,000 NPC routines and every one of them reacts to you.",
  "Rockstar spent years building a city that feels alive.",
  "Jason is the first lead you meet, and his story starts in Vice City.",
  "He grew up around the Keys, far from the neon of the beach.",
  "Then there is Lucia, and the two of them change everything.",
  "But the map is where it gets wild.",
  "Leonida is bigger than anything Rockstar has made before.",
  "You can drive from the swamps of Grassrivers to the mountains in one long run.",
  "Every town on the way has its own people, its own radio and its own trouble.",
  "And the water is part of the map too, with boats, islands and hidden coves.",
  "According to Bloomberg, the team doubled the size of the world twice during development.",
  "That is why it took so long.",
  "And honestly, after seeing all of it, the wait looks worth it.",
  "There is still a lot we have not been shown yet.",
  "If you want the full map guide on launch day, subscribe now so you don't miss it.",
];

const r2 = (x) => Number(x.toFixed(2));

function wordsFor(script, wpsGap = 0.31, sentencePause = 0.45) {
  const out = [];
  let t = 0.4;
  for (const sentence of script) {
    for (const w of sentence.split(/\s+/).filter(Boolean)) {
      const d = 0.26 + 0.02 * Math.min(w.length, 8);
      out.push({ w, s: r2(t), e: r2(t + d) });
      t += Math.max(d + 0.03, wpsGap);
    }
    t += sentencePause;
  }
  return out;
}

function at(words, token, after = 0) {
  for (const w of words) {
    if (w.w.replace(/^[.,]+|[.,]+$/g, "").toLowerCase() === token.toLowerCase() && w.s >= after) return w.s;
  }
  throw new Error(`word not in the script: ${token}`);
}

/** Cut roughly every `step` seconds, always on a word start (never inside a word). */
function shotsOnWords(words, start, end, step = 2.8, src = "assets/footage/trailer2.mp4") {
  const starts = words.map((w) => w.s);
  const cuts = [start];
  let t = start;
  for (;;) {
    const target = t + step;
    const nxt = starts.filter((s) => s >= target && s < end - 1.0);
    if (!nxt.length) break;
    t = nxt[0];
    cuts.push(t);
  }
  cuts.push(end);
  return cuts.slice(0, -1).map((a, i) => ({ start: r2(a), end: r2(cuts[i + 1]), src, in: r2(10 + i * 7.3) }));
}

const words = wordsFor(SCRIPT);
const dur = r2(words[words.length - 1].e + 1.5);
const tNum = at(words, "3,000");
const tJason = at(words, "Jason");
const tMap = at(words, "But");
const tBloom = at(words, "Bloomberg");
const tSub = at(words, "subscribe");
const tEvery = at(words, "every");
const tKeys = at(words, "Keys");
const tLucia = at(words, "Lucia");
const tAnything = at(words, "anything");
const tGrass = at(words, "Grassrivers");
const tPeople = at(words, "people");
const tRadio = at(words, "radio");
const tTrouble = at(words, "trouble");
const tDoubled = at(words, "doubled");
const tLot = at(words, "lot");
const chapter = r2(tMap);

const calm = {
  version: 1, theme: "clean", fps: 30, duration: dur,
  voiceover: "assets/voiceover.wav", words: "../words.json", channel: "channel.json",
  chapters: [{ title: "The Leads", start: 0.0 }, { title: "The Map", start: chapter }],
  shots: [...shotsOnWords(words, 0.0, chapter), ...shotsOnWords(words, chapter + 3.4, dur)],
  graphics: [
    // R15: the video opens on a designed moment (the first line names the game: intro-B).
    // R8: about 35 % plain footage (40 % at most) and a graphic every 8 s after the hook, with R3's gaps
    // (1 s inside the hook, 2 s after it) and no variant used twice in a row (R12).
    { id: "g01", device: "intro-B", layer: "fullscreen", start: 0, end: 2.33, reason: "intro",
      vars: { game: "Grand Theft Auto VI", logo: "assets/logos/gta_vi.png" }, enter: 0.43, exit: 0.3 },
    { id: "g02", device: "topbar-B2", layer: "overlay",
      start: r2(tEvery + 0.01), end: r2(tEvery + 5.01), reason: "detail",
      anchor: "every one", text: ["3,000 NPC routines", "Every one reacts to you"],
      vars: { kicker: "3,000 NPC routines", title: "Every one reacts to you" }, enter: 0.4, exit: 0.27 },
    { id: "g03", device: "nametag-A2", layer: "overlay",
      start: r2(tJason), end: r2(tJason + 5.5), reason: "name",
      anchor: "Jason", text: ["Jason", "The first lead"], vars: { name: "Jason", role: "The first lead" }, enter: 0.3, exit: 0.2 },
    // dot from `node skills/gta-map/places.mjs --cornerbug` (Leonida Keys)
    { id: "g04", device: "cornerbug-A", layer: "overlay",
      start: r2(tKeys), end: r2(tKeys + 3.3), reason: "place",
      anchor: "Keys", text: ["Leonida", "The Keys"], vars: { kicker: "Leonida", place: "The Keys", dot_x: 309.1, dot_y: 898.3 },
      enter: 0.5, exit: 0.23 },
    { id: "g05", device: "nametag-B", layer: "overlay",
      start: r2(tLucia), end: r2(chapter - 1.0), reason: "name",
      anchor: "Lucia", text: ["Lucia", "The second lead"], vars: { name: "Lucia", role: "The second lead", ringX: 1398, ringY: 548 },
      enter: 0.4, exit: 0.3 },
    { id: "g06", device: "chapter2-B", layer: "fullscreen",
      start: chapter, end: r2(chapter + 3.4), reason: "chapter",
      text: ["Chapter 2", "The Map"], enter: 0.45, exit: 0.3,
      // file values: any path here (the value check stands them in); a real plan gives @clip / @frame or files
      vars: { title: "The Map", before: "@clip QdBZY2fkU-0 10 2", after: "@clip QdBZY2fkU-0 20 3", ground: "@frame QdBZY2fkU-0 30",
        now_still: "@frame QdBZY2fkU-0 20", thumb1: "@frame QdBZY2fkU-0 40", thumb2: "@frame QdBZY2fkU-0 50" } },
    { id: "g07", device: "keyword-A2", layer: "overlay",
      start: r2(chapter + 5.42), end: r2(chapter + 7.87), reason: "comparison",
      anchor: "anything", text: ["Bigger than anything"], vars: { word: "Bigger than anything" }, enter: 0.33, exit: 0.23 },
    { id: "g08", device: "cornerbug-B2", layer: "overlay",
      start: r2(tGrass - 0.03), end: r2(tPeople - 2.22), reason: "place",
      anchor: "Grassrivers", text: ["Leonida", "Grassrivers"], vars: { kicker: "Leonida", place: "Grassrivers", focus_x: 347.4, focus_y: 541.2 },
      enter: 0.5, exit: 0.23 },
    { id: "g09", device: "listtags-A", layer: "overlay",
      start: r2(tPeople - 0.2), end: r2(tTrouble + 1.51), reason: "list",
      anchor: "people", text: ["People, Radio", "Trouble"],
      vars: { item1: "People", item2: "Radio", item3: "Trouble", at1: 0.2, at2: r2(tRadio - tPeople + 0.2), at3: r2(tTrouble - tPeople + 0.2) },
      enter: 0.37, exit: 0.23 },
    { id: "g10", device: "caption5-C", layer: "overlay",
      start: r2(tDoubled - 0.1), end: r2(tDoubled + 7.9), reason: "source",
      anchor: "doubled", text: ["The world doubled twice", "Bloomberg"], vars: { line1: "The world doubled twice", outlet: "Bloomberg" }, enter: 0.4, exit: 0.25 },
    { id: "g11", device: "screenshot2-B", layer: "fullscreen",
      start: r2(tLot), end: r2(tSub - 2.0), reason: "detail",
      anchor: "lot", vars: { shot: "@frame QdBZY2fkU-0 60", shot_blur: "@frame QdBZY2fkU-0 60" }, enter: 0.5, exit: 0.3 },
    { id: "g12", device: "subscribe-B", layer: "overlay",
      start: r2(tSub), end: r2(dur - 0.1), reason: "cta",
      anchor: "subscribe", text: ["Subscribe"], vars: { channel: "Vice Weekly" },
      enter: 0.4, exit: 0.25 },
  ],
  transitions: [{ at: chapter, device: "whip-A" }],
  sfx: [{ at: r2(tJason), src: "assets/sfx/soft-hit.wav" }],
};

const busy = structuredClone(calm);
busy.theme = "neon";                                                          // R11
const g = busy.graphics;
const byId = (id) => g.find((x) => x.id === id);
byId("g01").enter = 0.8;                                                      // R4
g.push({ id: "g01b", device: "keyword-A2", layer: "overlay",                  // R1 + R2 (no anchor) + R5; R3 in the hook (g02 lands 0.3 s after it)
  start: 2.0, end: 3.0, reason: "keyword", text: ["ALIVE"] });
Object.assign(byId("g03"), { start: r2(tNum + 4.0), end: r2(tNum + 5.0) });   // R1 + R2 (far from "Jason") + R5
g.push({ id: "g13", device: "nametag-B", layer: "overlay",                    // R2 repeat name, R5 four texts, R12 same nametag variant again
  start: r2(tBloom + 4.5), end: r2(tBloom + 13.0), reason: "name",            // R1 over g10; R3 after the hook (g11 lands 1.4 s after it)
  anchor: "Jason", text: ["Jason", "Lead", "Vice City", "Season 1"] });
byId("g12").vars = { avatar: "brand/pfp.png", monogram: "VW" };               // R10 (CTA, no pfp given)
busy.graphics = g.sort((a, b) => a.start - b.start);
busy.transitions.push({ at: r2(tBloom), device: "whip-A" });                  // R6 off-chapter + twice in a row
busy.sfx.push({ at: busy.shots[3].start, src: "assets/sfx/whoosh.wav" });     // R7 on a cut
busy.shots[5].start = r2(busy.shots[5].start + 0.9);                          // R9 gap with nothing on screen
const k = busy.shots.findIndex((s) => s.start >= chapter + 6);                // R9 cut inside a word
const inside = words.find((w) => w.s > busy.shots[k].start + 1.2 && w.e < busy.shots[k].end);
busy.shots[k].end = r2((inside.s + inside.e) / 2);
busy.shots[k + 1].start = busy.shots[k].end;

const channel = { name: "Vice Weekly", avatar: null, theme: "clean", asked: ["name", "avatar", "theme"] };
for (const dir of ["calm", "busy"]) fs.mkdirSync(path.join(HERE, dir), { recursive: true });
for (const [p, data] of [["words.json", words], ["calm/plan.json", calm], ["busy/plan.json", busy],
  ["calm/channel.json", channel], ["busy/channel.json", channel]]) {
  fs.writeFileSync(path.join(HERE, p), JSON.stringify(data, null, 1), "utf8");
}
console.log(`fixtures written: ${words.length} words, ${dur} s`);
