#!/usr/bin/env node
// Gameplay clips of the Algrow GTA library, end to end without the network: picks -> assign -> fetch (files already
// here) -> find_shots pick -> build_video -> sheet.
//
//     node tests/gameplay_test.mjs
//
// It makes a project in a temp folder with five fake clips (FFmpeg, 1280x720 60 fps with game sound, like the
// library's). Each one draws the game's HUD in pure red where the real one sits: the minimap, the subtitles, the
// wanted stars and, on the clip with a gun out, the health bars and the ammo count. A built shot plays the full frame,
// HUD and all (owner, 19 Nov 2026), scaled 1.5x, without sound; a shot that opts in to a crop ("crop") has no red left;
// a continuation plays both clips of its scene; a cutscene clip is refused at every step. A new animation with its own
// ground ("ground_vf") gets it baked from the shots under it, and a file the video plays that isn't there stops the build.
// Prints one line per check and exits 1 if any fails. The temp folder is removed at the end (--keep to look at it).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assign, readPicks, HUD_CROPS, barsOf, detectBars, shotBars, gameplayVf } from "../skills/gta-footage/gameplay.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILLS = path.join(HERE, "..", "skills");
const keep = process.argv.includes("--keep");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gta-gameplay-test-"));
const proj = path.join(tmp, "proj");
const clips = path.join(proj, "footage", "gameplay");
fs.mkdirSync(clips, { recursive: true });
fs.mkdirSync(path.join(proj, "work"), { recursive: true });
fs.mkdirSync(path.join(proj, "assets"), { recursive: true });

let failed = 0;
const ok = (cond, what) => {
  console.log(`${cond ? "ok  " : "FAIL"}  ${what}`);
  if (!cond) failed++;
};
const run = (args, cwd = proj) => spawnSync(process.execPath, args, { cwd, encoding: "utf8" });
const ffmpeg = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
const writeJson = (p, d) => fs.writeFileSync(p, JSON.stringify(d, null, 1));

// the HUD of a 1280x720 clip, in pixels (measured on the library's clips, 19 Nov 2026)
const RED = "color=0xFF0000:t=fill";
const HUD = [
  `drawbox=x=20:y=589:w=202:h=112:${RED}`,      // minimap
  `drawbox=x=400:y=612:w=480:h=58:${RED}`,      // subtitles (two lines)
];
const WANTED = [
  `drawbox=x=1120:y=19:w=137:h=21:${RED}`,      // six star slots
  `drawbox=x=1196:y=45:w=62:h=17:${RED}`,       // the icons under them
  `drawbox=x=22:y=22:w=106:h=14:${RED}`,        // stamina bar
];
const COMBAT = [...WANTED, `drawbox=x=20:y=18:w=180:h=31:${RED}`, `drawbox=x=1196:y=20:w=79:h=80:${RED}`];   // health bars; ammo, weapon, money
const TOP = "drawbox=x=576:y=6:w=128:h=10:color=0xFFFF00:t=fill";   // a yellow mark near the top: kept unless the crop cuts the top
function makeClip(id, secs, bg, extra = []) {
  const vf = [...HUD, ...extra, TOP].join(",");
  ffmpeg(["-f", "lavfi", "-i", `color=c=${bg}:s=1280x720:r=60:d=${secs}`, "-f", "lavfi", "-i", `sine=f=440:d=${secs}`,
    "-vf", vf, "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(clips, `${id}.mp4`)]);
}

try {
  makeClip("gta-000001", 8, "0x406080");
  makeClip("gta-000002", 8, "0x506040", COMBAT);
  makeClip("gta-000003", 8, "0x604050", WANTED);
  makeClip("gta-000004", 4, "0x2040A0");   // one scene, two clips: a continuation
  makeClip("gta-000005", 4, "0x20A040");
  makeClip("gta-000006", 8, "0x605040", WANTED);
  ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "20.3", path.join(proj, "assets", "voiceover.wav")]);

  // the picks, as Claude writes them from the connector's results (no links: the clips are here already)
  const clip = (id, scene, pos, size, secs, beat, more = {}) => ({ id, scene, scene_pos: pos, scene_size: size, duration_s: secs,
    clip_type: "gameplay", player: "jason", region: "Vice City", description: `test clip ${id}`, gun: false, wanted: false, beat, ...more });
  const picks = [
    clip("gta-000001", "gta-s-00001", 1, 1, 8, 0, { description: "Jason drives a white sports car down a highway in Vice City at night" }),
    clip("gta-000002", "gta-s-00002", 1, 1, 8, 1, { gun: true, wanted: true, description: "Jason shoots at police cars from behind a barrier" }),
    clip("gta-000003", "gta-s-00009", 1, 1, 8, 2, { player: "lucia", wanted: true, description: "Lucia walks along a downtown street" }),
    clip("gta-000006", "gta-s-00004", 1, 1, 8, 3, { wanted: true, wanted_level: 2, description: "Jason runs from two police cars" }),
    clip("gta-000005", "gta-s-00003", 2, 2, 4, 4),
    clip("gta-000004", "gta-s-00003", 1, 2, 4, 4),
  ];
  writeJson(path.join(proj, "work", "gameplay_picks.json"), picks);
  const lines = ["Jason drives through Vice City at night", "and he opens fire", "Lucia on foot downtown", "the police are on him",
    "and the whole city keeps moving around them"];
  const beats = [[0, 3.2], [3.2, 6.4], [6.4, 9.6], [9.6, 12.8], [12.8, 20.3]].map(([s, e], i) => ({ start: s, end: e, line: lines[i], type: "show", place: "vice_city" }));
  beats[0].crop = "auto";     // opt-in crops: chosen from the description (plain clip: hud) ...
  beats[1].crop = "auto";     // ... (gun out: combat) ...
  beats[3].crop = "wanted";   // ... or named. Beats 2 and 4 keep the default, the full frame.
  writeJson(path.join(proj, "work", "beats.json"), beats);

  // assign: each clip on its beat, the beat in the middle of its clip; two clips of one scene continue a long beat
  let r = run([path.join(SKILLS, "gta-footage", "gameplay.mjs"), "assign", "work/beats.json", "work/gameplay_picks.json", "--out", "work/beats.json"]);
  ok(r.status === 0, `assign exits 0 (${r.status}) ${r.status ? r.stdout + r.stderr : ""}`);
  const got = JSON.parse(fs.readFileSync(path.join(proj, "work", "beats.json"), "utf8"));
  ok(got[0].clip === "gta-000001" && got[0].in === 2.4 && got[0].scene === "gta-s-00001", `beat 0: gta-000001 from 2.4 s (the middle of 8 s), got ${got[0].clip} ${got[0].in}`);
  ok(Array.isArray(got[4].clip) && got[4].clip.join("+") === "gta-000004+gta-000005" && got[4].in === 0.25,
    `beat 4 (7.5 s): continued over gta-000004 + gta-000005 from 0.25 s, got ${JSON.stringify(got[4].clip)} ${got[4].in}`);
  ok(/names lucia/.test(r.stdout) === false && /beat 2 .*gta-000003/.test(r.stdout), "assign reports each beat");

  // assign refuses a beat longer than its clip, and says how to continue it
  const alone = assign([{ start: 0, end: 9, line: "x" }], [clip("gta-000001", "gta-s-00001", 1, 1, 8, 0)]);
  ok(alone.bad.length === 1 && /nothing to continue into/.test(alone.lines.join(" ")) && !/gta_get_scene/.test(alone.lines.join(" ")),
    "a clip that is its whole scene: no continuation offered");
  const long = assign([{ start: 0, end: 9, line: "x" }], [clip("gta-000001", "gta-s-00001", 1, 3, 8, 0)]);
  ok(long.bad.length === 1 && !long.beats[0].clip && /gta_get_scene\("gta-s-00001"\).*scene_pos 2/.test(long.lines.join(" ")),
    "a 9 s beat on an 8 s clip: no clip, and the line names gta_get_scene and the next scene_pos");
  const who = assign([{ start: 0, end: 3, line: "Lucia steps out" }], [clip("gta-000001", "gta-s-00001", 1, 1, 8, 0)]);
  ok(who.warn.length === 1 && /names lucia/.test(who.lines.join(" ")), "a line about Lucia on a Jason clip is flagged");
  ok(readPicks(writeAndPath({ clips: [{ id: "gta-000001", beat: 0 }] })).length === 1, "readPicks takes the connector's raw answer ({clips: [...]})");
  const cs = assign([{ start: 0, end: 3, line: "x" }], [clip("gta-000001", "gta-s-00001", 1, 1, 8, 0, { clip_type: "cutscene" })]);
  ok(cs.bad.length === 1 && !cs.beats[0].clip && /REFUSED: gta-000001 is a cutscene clip/.test(cs.lines.join(" ")), "assign refuses a cutscene clip, naming it");

  // fetch: clips already here are kept (checked with ffprobe), their descriptions written without links
  r = run([path.join(SKILLS, "gta-footage", "gameplay.mjs"), "fetch", "work/gameplay_picks.json"]);
  ok(r.status === 0 && /0 fetched, 6 already here/.test(r.stdout), `fetch keeps the 6 clips already here (${r.status}) ${r.status ? r.stdout + r.stderr : ""}`);
  const meta = JSON.parse(fs.readFileSync(path.join(clips, "gta-000002.json"), "utf8"));
  ok(meta.gun === true && meta.probe?.width === 1280 && meta.bars === 0 && !("beat" in meta) && !Object.keys(meta).some((k) => /url$/i.test(k)),
    "gta-000002.json: the clip's fields, its probe and its bars (none), no beat, no links");

  // black bars baked into a clip (a cinematic camera): measured, stored, cut off; a black frame isn't bars
  const barsDir = path.join(tmp, "bars");
  fs.mkdirSync(barsDir);
  ffmpeg(["-f", "lavfi", "-i", "color=c=0x406080:s=1280x720:r=60:d=3", "-vf",
    "drawbox=x=0:y=0:w=1280:h=40:color=black:t=fill,drawbox=x=0:y=680:w=1280:h=40:color=black:t=fill", "-c:v", "libx264", "-preset", "ultrafast",
    "-pix_fmt", "yuv420p", path.join(barsDir, "gta-000010.mp4")]);
  ffmpeg(["-f", "lavfi", "-i", "color=c=black:s=1280x720:r=60:d=3", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", path.join(barsDir, "gta-000011.mp4")]);
  writeJson(path.join(barsDir, "gta-000010.json"), { id: "gta-000010", clip_type: "gameplay", probe: { width: 1280, height: 720 } });
  const b10 = barsOf(barsDir, "gta-000010");
  ok(b10 === 42 && JSON.parse(fs.readFileSync(path.join(barsDir, "gta-000010.json"), "utf8")).bars === 42,
    `40 px bars top and bottom: measured as 42 (one row to spare) and stored in its .json (got ${b10})`);
  ok(detectBars(path.join(barsDir, "gta-000011.mp4")) === 0, "an all-black clip has no bars");
  ok(shotBars({ bars: 0 }, barsDir, ["gta-000010"]) === 0 && shotBars({ bars: 60 }, barsDir, ["gta-000010"]) === 40,
    "a shot's own \"bars\" (px at 1080p) wins: 0 keeps them, 60 is 40 at 720p");
  const rows = execFileSync("ffmpeg", ["-v", "error", "-i", path.join(barsDir, "gta-000010.mp4"), "-frames:v", "1", "-vf", gameplayVf("full", b10),
    "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 1 << 26 });
  const rowMax = (y) => Math.max(...rows.subarray(y * 1920, (y + 1) * 1920));
  ok(rows.length === 1920 * 1080 && rowMax(0) > 40 && rowMax(1079) > 40, `cut with its bars off: picture to the top and bottom edges (rows ${rowMax(0)}, ${rowMax(1079)})`);
  // a pick with no file and no link: the others are kept, exit 2 names it
  writeJson(path.join(proj, "work", "stale.json"), [...picks, clip("gta-000009", "gta-s-00009", 1, 1, 5, 0, { video_url: "" })]);
  r = run([path.join(SKILLS, "gta-footage", "gameplay.mjs"), "fetch", "work/stale.json"]);
  ok(r.status === 2 && /need a fresh link: gta-000009/.test(r.stdout) && /gta_get_clip/.test(r.stdout), `an expired pick: exit 2 naming gta-000009 (${r.status})`);
  // a cutscene pick: refused, never downloaded (no network: it is refused before any request)
  writeJson(path.join(proj, "work", "cut.json"), [...picks, clip("gta-000007", "gta-s-00007", 1, 1, 6, 0, { clip_type: "cutscene", video_url: "https://example.invalid/gta-000007.mp4" })]);
  r = run([path.join(SKILLS, "gta-footage", "gameplay.mjs"), "fetch", "work/cut.json"]);
  ok(r.status === 1 && /REFUSED, not fetched: gta-000007 is a cutscene clip/.test(r.stdout) && !fs.existsSync(path.join(clips, "gta-000007.mp4")),
    `fetch refuses a cutscene clip, naming it (${r.status})`);

  // find_shots pick: gameplay beats pass through as shots, no trailer footage needed
  const plan = {
    version: 1, theme: "clean", fps: 30, duration: 20.3, voiceover: "assets/voiceover.wav", words: "work/words.json",
    shots: [],
    graphics: [],
  };
  // each line's words from 0.3 s into its beat, one every 0.33 s; the graphic lands on "Vice" (R15: by 2 s)
  const words = lines.flatMap((line, i) => line.split(" ").map((w, k) => {
    const s = beats[i].start + 0.3 + 0.33 * k;
    return { w, s: +s.toFixed(2), e: +(s + 0.28).toFixed(2) };
  }));
  const vice = words.find((w) => w.w === "Vice");
  plan.graphics.push({ id: "g01", device: "keyword-A2", layer: "overlay", start: vice.s, end: +(vice.s + 2.7).toFixed(2), reason: "keyword",
    anchor: "Vice City", text: ["VICE CITY"], vars: { word: "VICE CITY", at: 0 }, enter: 0.33, exit: 0.23 });
  writeJson(path.join(proj, "work", "words.json"), words);
  writeJson(path.join(proj, "plan.json"), plan);
  r = run([path.join(SKILLS, "gta-footage", "find_shots.mjs"), "pick", "work/beats.json", "--plan", "plan.json", "--out", "work/shots.json"]);
  ok(r.status === 0, `find_shots pick exits 0 with no --footage when every beat is gameplay (${r.status}) ${r.status ? r.stdout + r.stderr : ""}`);
  const shots = JSON.parse(fs.readFileSync(path.join(proj, "work", "shots.json"), "utf8"));
  ok(shots.length === 5 && shots[0].src === "gameplay/gta-000001" && shots[0].in === 2.4 && shots[0].kind === "gameplay",
    `shot 1: src gameplay/gta-000001 from 2.4 s, got ${shots[0]?.src} ${shots[0]?.in}`);
  ok(shots[4].src === "gameplay/gta-000004+gta-000005" && shots[0].crop === "auto" && shots[3].crop === "wanted" && !("crop" in shots[2]),
    "shot 5 is the continuation; the opt-in crops are copied, the others have none");
  ok(/beat 0 .* game {2}gta-000001/.test(r.stdout) && /5 gameplay/.test(r.stdout), "the report lists gameplay beats");
  ok(/\(and 2 gameplay beats, whose HUD is fine there\)/.test(r.stdout) && !/CHECK/.test(r.stdout), "gameplay beats under a graphic: no HUD check");
  // a graphic over a full-frame beat (wanted stars, minimap, subtitles): still no HUD check (the HUD is fine)
  const plan2 = structuredClone(plan);
  plan2.graphics[0] = { ...plan2.graphics[0], start: 6.6, end: 9.3 };
  writeJson(path.join(proj, "plan2.json"), plan2);
  r = run([path.join(SKILLS, "gta-footage", "find_shots.mjs"), "pick", "work/beats.json", "--plan", "plan2.json", "--out", "work/shots2.json"]);
  ok(r.status === 0 && /\(and 1 gameplay beat, whose HUD is fine there\)/.test(r.stdout) && !/CHECK/.test(r.stdout),
    "a full-frame gameplay shot under a graphic is not flagged or avoided");
  // the same scene twice within six beats
  const twice = got.map((b) => ({ ...b }));
  twice[2] = { ...twice[0], start: twice[2].start, end: twice[2].end, line: twice[2].line, in: 0.2 };
  writeJson(path.join(proj, "work", "twice.json"), twice);
  r = run([path.join(SKILLS, "gta-footage", "find_shots.mjs"), "pick", "work/twice.json", "--out", "work/shots3.json"]);
  ok(/scene gta-s-00001 is also on beat 0/.test(r.stdout) && /CHECK beats 2/.test(r.stdout), "the same scene two beats apart gets a CHECK");

  // build: the gameplay shots are cut from footage/gameplay, full frame unless a crop is asked for, no sound, 1920x1080 30 fps
  plan.shots = shots;
  writeJson(path.join(proj, "plan.json"), plan);
  r = run([path.join(SKILLS, "gta-video", "build_video.mjs"), "plan.json"]);
  ok(r.status === 0, `build_video builds the plan (${r.status}) ${r.status ? r.stdout + r.stderr : ""}`);
  ok(/5 gameplay shot\(s\) from footage\/gameplay\/: /.test(r.stdout) && /2 with the full frame, HUD and subtitles kept/.test(r.stdout) &&
    /1 with the HUD crop/.test(r.stdout) && /1 with the combat crop/.test(r.stdout) && /1 with the wanted crop/.test(r.stdout),
    "the build notes the gameplay shots and how each is framed");
  const foot = path.join(proj, "assets", "footage");
  for (let i = 1; i <= 5; i++) {
    const f = path.join(foot, `s00${i}.mp4`);
    const p = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_frames", "-of", "json", f], { encoding: "utf8" }));
    const v = p.streams.find((s) => s.codec_type === "video");
    const want = Math.round((shots[i - 1].end - shots[i - 1].start) * 30) + 2;
    ok(v.width === 1920 && v.height === 1080 && v.r_frame_rate === "30/1" && !p.streams.some((s) => s.codec_type === "audio") && Number(v.nb_frames) === want,
      `s00${i}.mp4: 1920x1080, 30 fps, no sound, ${want} frames (got ${v.width}x${v.height} ${v.r_frame_rate} ${v.nb_frames})`);
  }
  // colours of a frame: red pixels (the HUD), yellow pixels (the top mark), the average colour
  const look = (file, at) => {
    const buf = execFileSync("ffmpeg", ["-v", "error", "-ss", String(at), "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 26 });
    let red = 0, yellow = 0, sum = [0, 0, 0];
    for (let k = 0; k < buf.length; k += 3) {
      const [R, G, B] = [buf[k], buf[k + 1], buf[k + 2]];
      if (R > 180 && G < 80 && B < 80) red++;
      if (R > 180 && G > 180 && B < 80) yellow++;
      sum[0] += R, sum[1] += G, sum[2] += B;
    }
    const n = buf.length / 3;
    return { red, yellow, avg: sum.map((x) => Math.round(x / n)) };
  };
  const [s1, s2, s3, s4] = [1, 2, 3, 4].map((i) => look(path.join(foot, `s00${i}.mp4`), 1));
  // the full frame, scaled 1.5x: the 128x10 yellow mark becomes 192x15 = 2880 px, and every HUD box stays
  ok(s3.red > 30000 && s3.yellow > 2600 && s3.yellow < 3200, `default: the full frame scaled 1.5x, HUD and all (red ${s3.red}, yellow ${s3.yellow})`);
  ok(s1.red === 0 && s1.yellow > 500, `"crop": "auto" on a plain clip: the hud crop, no minimap or subtitles, the top kept (red ${s1.red}, yellow ${s1.yellow})`);
  ok(s2.red === 0 && s2.yellow === 0, `"crop": "auto" with a gun out: the combat crop, no bars, ammo or stars, the top 7.5 % cut (red ${s2.red}, yellow ${s2.yellow})`);
  ok(s4.red === 0 && s4.yellow > 500, `"crop": "wanted": no star slots, icons or stamina bar, the top kept (red ${s4.red}, yellow ${s4.yellow})`);
  const s4a = look(path.join(foot, "s005.mp4"), 0.5), s4b = look(path.join(foot, "s005.mp4"), 7);
  ok(s4a.avg[2] > s4a.avg[1] && s4b.avg[1] > s4b.avg[2] && s4a.red > 10000 && s4b.red > 10000,
    `the continuation plays gta-000004 then gta-000005, full frame (blue ${s4a.avg}, then green ${s4b.avg})`);
  const html = fs.readFileSync(path.join(proj, "index.html"), "utf8");
  ok((html.match(/class="clip shot"/g) || []).length === 5, "index.html plays the 5 shots");
  // built again: nothing cut again
  r = run([path.join(SKILLS, "gta-video", "build_video.mjs"), "plan.json"]);
  ok(r.status === 0 && /5 shots \(0 cut now\)/.test(r.stdout), "a second build reuses the cut shots");

  // a new animation with its own ground (device.json "ground_vf"): the build bakes assets/newgrounds/<name>.mp4 from
  // the shots under it, and bakes it again only when they change (19 Nov 2026: never baked, the render failed)
  const anim = path.join(proj, "animations", "test-ground");
  fs.mkdirSync(anim, { recursive: true });
  fs.writeFileSync(path.join(anim, "test-ground.html"), `<template id="test-ground-template"><div data-composition-id="test-ground" ` +
    `data-width="1920" data-height="1080"><video id="test-ground-bg" class="clip" src="assets/newgrounds/test-ground.mp4" muted ` +
    `playsinline data-start="0" data-duration="2.7" data-track-index="0"></video></div></template>\n`);
  const devJson = { id: "new:test-ground", says: "keyword", layer: "fullscreen", enter: 0.4, exit: 0.23, themes: ["clean", "vice"],
    ground_vf: "gblur=sigma=10,lutyuv=y='val*0.5'" };
  writeJson(path.join(anim, "device.json"), devJson);
  const lucia = words.find((w) => w.w === "Lucia");
  const planNew = structuredClone(plan);
  planNew.graphics.push({ id: "g02", device: "new:test-ground", layer: "fullscreen", start: lucia.s, end: +(lucia.s + 2.7).toFixed(2),
    reason: "name", anchor: "Lucia", text: ["Lucia"] });
  writeJson(path.join(proj, "plan_new.json"), planNew);
  const ng = path.join(proj, "assets", "newgrounds", "test-ground.mp4");
  r = run([path.join(SKILLS, "gta-video", "build_video.mjs"), "plan_new.json"]);
  ok(r.status === 0 && /\(1 baked now\)/.test(r.stdout) && fs.existsSync(ng), `a new animation with "ground_vf": its ground is baked (${r.status}) ${r.status ? r.stdout + r.stderr : ""}`);
  if (fs.existsSync(ng)) {
    const p = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_frames", "-of", "json", ng], { encoding: "utf8" }));
    const v = p.streams.find((s) => s.codec_type === "video");
    const want = Math.round(planNew.graphics[1].end * 30) - Math.round(planNew.graphics[1].start * 30);
    ok(v.width === 1920 && v.height === 1080 && v.r_frame_rate === "30/1" && Number(v.nb_frames) === want && p.streams.length === 1,
      `assets/newgrounds/test-ground.mp4: 1920x1080, 30 fps, the graphic's ${want} frames, no sound (got ${v.width}x${v.height} ${v.r_frame_rate} ${v.nb_frames})`);
    // the shot under it, treated: blurred and dimmed by half (the mean of the Y plane as stored, a frame 1 s in,
    // against the shot's own frame there)
    const luma = (file, at) => {
      const buf = execFileSync("ffmpeg", ["-v", "error", "-ss", String(at), "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "yuv420p", "-"], { maxBuffer: 1 << 26 });
      return buf.subarray(0, 1920 * 1080).reduce((n, x) => n + x, 0) / (1920 * 1080);
    };
    const u = planNew.shots.findIndex((s) => s.start <= lucia.s + 1 && lucia.s + 1 < s.end);
    const ratio = luma(ng, 1) / luma(path.join(foot, `s00${u + 1}.mp4`), lucia.s + 1 - planNew.shots[u].start);
    ok(ratio > 0.45 && ratio < 0.55, `it is the shot under the graphic with its ground_vf (dimmed to 0.5: luma ratio ${ratio.toFixed(2)})`);
    ok(/test-ground\.mp4/.test(fs.readFileSync(path.join(proj, "assets", "newgrounds", "newgrounds.json"), "utf8")), "its stamp is in assets/newgrounds/newgrounds.json");
  }
  const mtime = () => (fs.existsSync(ng) ? fs.statSync(ng).mtimeMs : 0);
  const m0 = mtime();
  r = run([path.join(SKILLS, "gta-video", "build_video.mjs"), "plan_new.json"]);
  ok(r.status === 0 && /\(0 baked now\)/.test(r.stdout) && mtime() === m0, "built again with the same shots: the new ground is kept, not baked again");
  // the shot under it changes (cut again from another point): its ground is baked again
  const under = planNew.shots.findIndex((s) => s.start <= lucia.s && lucia.s < s.end);
  planNew.shots[under].in = +(planNew.shots[under].in - 0.4).toFixed(2);
  writeJson(path.join(proj, "plan_new.json"), planNew);
  r = run([path.join(SKILLS, "gta-video", "build_video.mjs"), "plan_new.json"]);
  ok(r.status === 0 && /5 shots \(1 cut now\)/.test(r.stdout) && /\(1 baked now\)/.test(r.stdout) && mtime() !== m0,
    `a shot under it cut again: the new ground is baked again (${r.status}) ${r.status ? r.stderr : r.stdout.split("\n")[1]}`);
  // a file the video plays that isn't there stops the build before index.html is written (here: a new ground never baked)
  writeJson(path.join(anim, "device.json"), { ...devJson, ground_vf: undefined });
  fs.rmSync(ng, { force: true });
  fs.rmSync(path.join(proj, "index.html"), { force: true });
  r = run([path.join(SKILLS, "gta-video", "build_video.mjs"), "plan_new.json"]);
  ok(r.status === 1 && /1 file\(s\) the video plays isn't there/.test(r.stderr) &&
    /assets\/newgrounds\/test-ground\.mp4 {2}\(in animations\/test-ground\/test-ground\.html\)/.test(r.stderr) && /ground_vf/.test(r.stderr) &&
    !fs.existsSync(path.join(proj, "index.html")), `a missing file the video plays stops the build, naming it, and no index.html (${r.status}) ${r.stderr.trim()}`);
  writeJson(path.join(anim, "device.json"), devJson);
  // a missing clip stops the build with the fetch command
  fs.renameSync(path.join(clips, "gta-000003.mp4"), path.join(clips, "gta-000003.bak"));
  r = run([path.join(SKILLS, "gta-video", "build_video.mjs"), "plan.json"]);
  ok(r.status === 1 && /gameplay clip gta-000003 isn't in footage\/gameplay\/.*gameplay\.mjs fetch/.test(r.stderr), "a missing clip stops the build and says how to fetch it");
  fs.renameSync(path.join(clips, "gta-000003.bak"), path.join(clips, "gta-000003.mp4"));
  // a cutscene clip that got into footage/gameplay anyway: pick refuses its beat, the build stops
  const m6 = path.join(clips, "gta-000006.json"), m6text = fs.readFileSync(m6, "utf8");
  writeJson(m6, { ...JSON.parse(m6text), clip_type: "cutscene" });
  r = run([path.join(SKILLS, "gta-footage", "find_shots.mjs"), "pick", "work/beats.json", "--out", "work/shots4.json"]);
  ok(/beat 3 at .*REFUSED: gta-000006 is a cutscene clip/.test(r.stdout) && JSON.parse(fs.readFileSync(path.join(proj, "work", "shots4.json"), "utf8")).length === 4,
    "find_shots pick refuses a cutscene clip's beat");
  r = run([path.join(SKILLS, "gta-video", "build_video.mjs"), "plan.json"]);
  ok(r.status === 1 && /gta-000006 is a cutscene clip/.test(r.stderr), "a cutscene clip stops the build");
  fs.writeFileSync(m6, m6text);

  // the sheet: one frame per gameplay shot, on pages of 12 (3 columns x 4 rows) small enough to read when opened
  const work = path.join(proj, "work"), page = (k) => path.join(work, `gameplay_${String(k).padStart(2, "0")}.jpg`);
  const dims = (f) => execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", f], { encoding: "utf8" })
    .trim().split(",").map(Number);
  // bright pixels in the label strip under a tile (its text): the strip itself is 0x111111
  const label = (f, col, row) => {
    const buf = execFileSync("ffmpeg", ["-v", "error", "-i", f, "-vf", `crop=640:80:${col * 646}:${row * 446 + 360}`, "-frames:v", "1",
      "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 1 << 24 });
    return buf.filter((v) => v > 100).length;
  };
  const gpShots = JSON.parse(fs.readFileSync(path.join(proj, "plan.json"), "utf8")).shots.filter((s) => /^gameplay\//.test(s.src));
  writeJson(path.join(work, "many.json"), Array.from({ length: 14 }, (_, k) =>
    ({ ...gpShots[k % gpShots.length], start: 2 * k, end: 2 * k + 2, line: `the words of shot ${k + 1}` })));
  fs.writeFileSync(path.join(work, "gameplay.jpg"), "an old one-image sheet");
  fs.writeFileSync(page(3), "a page of an older run");
  r = run([path.join(SKILLS, "gta-footage", "gameplay.mjs"), "sheet", "work/many.json", "--out", "work/gameplay.jpg"]);
  const [w1, h1] = fs.existsSync(page(1)) ? dims(page(1)) : [0, 0], [w2, h2] = fs.existsSync(page(2)) ? dims(page(2)) : [0, 0];
  ok(r.status === 0 && /14 gameplay shot\(s\).* on 2 page\(s\)/.test(r.stdout) && w1 === 1932 && h1 === 1778 && w2 === 1932 && h2 === 440,
    `14 shots: 2 pages, 12 frames in 3x4 then 2 (got ${w1}x${h1}, ${w2}x${h2}) ${r.status ? r.stderr : ""}`);
  ok(h1 <= 1800 && h2 <= 1800, "every page is at most 1800 px tall, so it stays readable when opened");
  ok(!fs.existsSync(page(3)) && !fs.existsSync(path.join(work, "gameplay.jpg")), "the stale page and the old one-image sheet are removed");
  ok(/work\/gameplay_01\.jpg {2}#1-#12/.test(r.stdout) && /work\/gameplay_02\.jpg {2}#13-#14/.test(r.stdout) && /Open every page/.test(r.stdout),
    "it prints every page's path and says to open every page");
  const lab = h1 ? [label(page(1), 0, 0), label(page(1), 2, 3), label(page(2), 1, 0)] : [0, 0, 0];
  ok(lab.every((n) => n > 300), `labels are under the frames: first, last of page 1, last of page 2 (bright pixels ${lab.join(", ")})`);
  // the plan's 5 shots: one page, and the second page of the run before is gone
  r = run([path.join(SKILLS, "gta-footage", "gameplay.mjs"), "sheet", "plan.json", "--out", "work/gameplay.jpg"]);
  ok(r.status === 0 && /5 gameplay shot/.test(r.stdout) && fs.existsSync(page(1)) && !fs.existsSync(page(2)) && dims(page(1)).join("x") === "1932x886",
    `the plan's 5 shots: one page of 3x2, the older page 2 removed (${r.status}) ${r.status ? r.stderr : ""}`);
  ok(Object.values(HUD_CROPS).every((c) => c.w === c.h), "the three crops keep 16:9");
} catch (e) {
  failed++;
  console.log(`FAIL  ${e.stack || e}`);
} finally {
  if (keep) console.log(`kept: ${tmp}`);
  else fs.rmSync(tmp, { recursive: true, force: true });
}

function writeAndPath(data) {
  const p = path.join(tmp, `raw-${Math.random().toString(36).slice(2)}.json`);
  writeJson(p, data);
  return p;
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall gameplay checks passed");
process.exitCode = failed ? 1 : 0;
