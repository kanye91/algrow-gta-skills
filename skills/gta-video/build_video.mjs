#!/usr/bin/env node
// Build the HyperFrames project of a GTA video from its edit plan.
//
//   node build_video.mjs path/to/project/plan.json [--dry-run] [--json]
//   --test-showcase: template tests only (every animation in one project). It skips the pacing check and lets a
//   graphic set its own `theme`. Never use it for a user's video.
//
// The project is the folder that holds plan.json. The script:
//   1. checks the plan with gta-pacing and stops if it fails (a failing plan is never built);
//   2. tries every graphic's values first (a wrong one stops the build in seconds), then cuts every shot from
//      the official videos with FFmpeg: 1920x1080, 30 fps, letterbox bars removed,
//      into assets/footage/ (a shot already cut the same way is reused);
//   3. makes one scene per graphic with gta-motion's make_scene.mjs, filling the pfp and channel name
//      from the channel kit when the template takes them, and bakes the treated footage a template sits on
//      (its device.json `ground`) into assets/grounds/, and the one a new animation plays (its device.json
//      `ground_vf`) into assets/newgrounds/<name>.mp4;
//   4. writes index.html: footage, grounds, graphics, voice-over and sounds on one clock. A file the page or a
//      composition plays that isn't there (src="assets/...") stops the build first: the render would fail on it.
// Then: npx -y hyperframes@0.9.53 check, snapshot, render (printed at the end).
// Footage: the official videos on this computer, or the Algrow footage library (library.json at the repo root): a shot
// whose file isn't here, and isn't in the plan's "footage" folder either, is fetched from the library already cut.
// Gameplay shots (src "gameplay/<id>", the Algrow GTA library) are cut from <project>/footage/gameplay/<id>.mp4, full
// frame with the game's HUD and subtitles (fine: owner, 19 Nov 2026) and any black bars baked into the clip cut off,
// unless the shot opts in to a crop with "crop" (gta-footage/gameplay.mjs). A cutscene clip stops the build.
// Another game's official video (src under footage/other/<game>/, downloaded by gta-footage/official_video.mjs get) is
// cut like the official GTA VI videos, its letterbox (measured at download, in its <id>.json) cut off where the piece
// shows it; such a shot must name its "game", and must fit in the file.
// Node 22+ and FFmpeg, no packages. Exit 0 = built, 1 = the plan or a value is wrong, 2 = bad usage.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { check, toWords, ts } from "../gta-pacing/check_pacing.mjs";
import { makeScene } from "../gta-motion/make_scene.mjs";
import { boxSheet } from "../gta-motion/find_box.mjs";
import { libraryConfig, openLibrary, runAll, LibraryError } from "../gta-footage/library.mjs";
import { gameplayIds, gameplayVf, cropFor, clipMeta, shotBars, HUD_CROPS, isCutscene, cutsceneMsg, DIR as GAMEPLAY_DIR } from "../gta-footage/gameplay.mjs";
import { videoMeta, pieceBars, gameNamed, OTHER_DIR } from "../gta-footage/official_video.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.join(HERE, "..", "gta-motion", "templates");
const LOGOS = path.join(HERE, "..", "..", "assets", "logos");   // outlet logos + logos.json (the Algrow download, like the footage)
const USAGE = "usage: node build_video.mjs path/to/project/plan.json [--dry-run] [--json]  (--test-showcase: template tests only)";
const GSAP = "https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js";

class Stop extends Error {}
const r3 = (n) => Math.round(Number(n) * 1000) / 1000;
/** Where to seek for footage that starts at `t`: a quarter frame early. In points come rounded to 0.01 s (the shot
    index's 2.67 is a cut at 2.6667), and FFmpeg starts on the first frame at or after the seek: at 2.67 it would skip
    the shot's first frame, and a shot of its full length would end on one frame of the next shot. */
const seekAt = (t) => r3(Math.max(0, Number(t || 0) - 0.008));
// times on the clock: snapped to the 30 fps grid and written at full precision (41/30 = 1.3666666666666667);
// a time rounded up to 1.367 shows its clip a frame late
const F = (t) => Math.round(Number(t) * 30);
const fr = (t) => F(t) / 30;
const floor4 = (t) => Math.floor(Number(t) * 10000 + 1e-6) / 10000;

/** Split a template's recipe into commands and arguments, without a shell (same on Windows, macOS and Linux). */
function runRecipe(recipe, vars, what) {
  const tokens = [];
  for (const m of recipe.matchAll(/"([^"]*)"|(\S+)/g)) tokens.push(m[1] ?? m[2]);
  const cmds = [[]];
  for (const t of tokens) t === "&&" ? cmds.push([]) : cmds[cmds.length - 1].push(t);
  for (const c of cmds) {
    let args = c.map((t) => t.replace(/\{[a-z0-9_]+\}/gi, (k) => (k in vars ? String(vars[k]) : k)));
    // FFmpeg 8 reads nothing from a still image opened with -ss (it still exits 0): drop the seek before an image input
    args = args.filter((a, i) => !((a === "-ss" && args[i + 2] === "-i" && /\.(jpe?g|png|webp)$/i.test(args[i + 3] || "")) ||
      (args[i - 1] === "-ss" && args[i + 1] === "-i" && /\.(jpe?g|png|webp)$/i.test(args[i + 2] || ""))));
    const left = args.join(" ").match(/\{[a-z0-9_]+\}/i);
    if (left) throw new Stop(`${what}: its recipe needs ${left[0]}, which the builder doesn't know`);
    if (args[0] !== "ffmpeg") throw new Stop(`${what}: its recipe runs ${args[0]}; only ffmpeg is allowed`);
    try {
      execFileSync("ffmpeg", args.slice(1), { stdio: ["ignore", "ignore", "pipe"] });
    } catch (e) {
      throw new Stop(`${what}: FFmpeg failed: ${String(e.stderr || e.message).trim().split("\n").slice(-2).join(" ")}`);
    }
  }
}
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, ""));
const rel = (root, p) => path.relative(root, p).replace(/\\/g, "/");
const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function probeDuration(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  const d = Number(out.trim());
  if (!(d > 0)) throw new Stop(`can't read the length of ${file}`);
  return d;
}

/** A file the plan names: inside the project, or copied into assets/<sub>/. Returns its project path. */
// An outlet's logo: the plan's own "logos" folder first, then the repo's assets/logos/. Matched on the names in
// logos.json (case, "The" and punctuation ignored), else on a file named like the outlet (ign.png). null = none.
export function findLogo(outlet, dirs = [LOGOS]) {
  const norm = (x) => String(x || "").toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "");
  const want = norm(outlet);
  if (!want) return null;
  for (const dir of dirs) {
    if (!dir || !fs.existsSync(dir)) continue;
    const idx = path.join(dir, "logos.json");
    const list = fs.existsSync(idx) ? (readJson(idx).logos || []) : [];
    const hit = list.find((e) => (e.names || []).some((n) => norm(n) === want));
    if (hit && fs.existsSync(path.join(dir, hit.file))) return { file: path.join(dir, hit.file), logo_h: hit.logo_h, logo_trim: hit.logo_trim, cx: hit.cx, door: hit.door };
    for (const ext of [".png", ".svg"]) {
      const p = path.join(dir, want + ext);
      if (fs.existsSync(p)) return { file: p };
    }
  }
  return null;
}

// "g07 a3: Boat (Grand Theft Auto IV)": the graphic, the value, and the words that picture must show
export function stillLabel(g, k, vars) {
  const n = (k.match(/(\d+)$/) || [])[1];
  const said = (n && (vars[`thing${n}`] || vars[`label${n}`] || vars[`name${n}`] || vars[`caption${n}`])) || g.anchor || "";
  const game = /^a\d$/.test(k) ? vars.game1 : /^b\d$/.test(k) ? vars.game2 : vars.game;
  return `${g.id} ${k}${said ? `: ${said}` : ""}${game ? ` (${game})` : ""}`.replace(/\s+/g, " ").slice(0, 52);
}

// The marks a graphic puts on its frozen still (device.json "marks": a box [x, y, w, h] or a point [x, y] with an
// optional radius formula), from the values the plan set: [{x, y, w, h, n}] in still pixels
export function markList(device, vars, values) {
  const out = [];
  const num = (k) => Number(values[k] ?? vars[k]);
  for (const m of device.marks || []) {
    if (m.box && m.box.every((k) => k in vars)) {
      const [x, y, w, h] = m.box.map(num);
      if ([x, y, w, h].every(Number.isFinite)) out.push({ x, y, w, h, n: m.n });
    } else if (m.point && m.point.every((k) => k in vars)) {
      const [x, y] = m.point.map(num);
      let r = 24;
      if (m.r) {
        const js = String(m.r).replace(/[A-Za-z_][A-Za-z0-9_]*/g, (w) => `(${Number.isFinite(num(w)) ? num(w) : "NaN"})`);
        if (/^[\d\s.+\-*/()NaN]+$/.test(js)) r = Function(`"use strict"; return (${js});`)();
        if (!Number.isFinite(r) || r <= 0) r = 24;
      }
      if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x: x - r, y: y - r, w: 2 * r, h: 2 * r, n: m.n });
    }
  }
  return out;
}

// A contact sheet of the pictures the graphics show (a clip: its middle frame), four across, each with its label under it.
// Returns false when FFmpeg can't make it (the build goes on without it).
export function stillSheet(root, list) {
  const dir = path.join(root, "work", ".stills");
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(HERE, "..", "gta-motion", "fonts", "Inter-Variable.ttf"), path.join(dir, "font.ttf"));
    list.forEach((s, i) => {
      const n = String(i + 1).padStart(3, "0");
      fs.writeFileSync(path.join(dir, `l${n}.txt`), s.label);
      const seek = /\.(mp4|mov|webm|mkv)$/i.test(s.file) ? ["-ss", String(Math.max(0, probeDuration(s.file) / 2))] : [];
      execFileSync("ffmpeg", ["-v", "error", "-y", ...seek, "-i", s.file, "-frames:v", "1", "-vf",
        "scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2:color=0x202020," +
        `pad=480:310:0:0:color=0x111111,drawtext=fontfile=font.ttf:textfile=l${n}.txt:fontsize=19:fontcolor=white:x=10:y=282`, `t${n}.png`],
        { cwd: dir, stdio: "ignore" });
    });
    const cols = Math.min(4, list.length), rows = Math.ceil(list.length / cols);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", "t%03d.png", "-vf", `tile=${cols}x${rows}:padding=6:color=black`, "-frames:v", "1",
      "-q:v", "3", path.join(root, "work", "stills.jpg")], { cwd: dir, stdio: "ignore" });
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function bring(root, p, sub, dry) {
  const abs = path.resolve(root, p);
  if (!fs.existsSync(abs)) throw new Stop(`file not found: ${p}`);
  if (!path.relative(root, abs).startsWith("..") && !path.isAbsolute(path.relative(root, abs))) return rel(root, abs);
  const dest = path.join(root, "assets", sub, path.basename(abs));
  if (!dry) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(abs).size) fs.copyFileSync(abs, dest);
  }
  return rel(root, dest);
}

/** Each official video's letterbox, in px at 1080p: the most common bar height over its shots in the shot index
    (a shot's own `lb` also catches fades to black, so it isn't used alone). */
function letterboxes() {
  const idx = readJson(path.join(HERE, "..", "gta-footage", "shot-index.json"));
  const counts = {};
  for (const s of Array.isArray(idx) ? idx : idx.shots || []) {
    const [t, b] = String(s.lb ?? "0,0").split(",").map(Number);
    const bars = Math.min(t || 0, b || 0);
    ((counts[s.src] ??= {})[bars] ??= 0), counts[s.src][bars]++;
  }
  return Object.fromEntries(Object.entries(counts).map(([v, c]) => [v, Number(Object.entries(c).sort((x, y) => y[1] - x[1])[0][0])]));
}
let LB = null;

/** The footage library (library.json at the repo root), read the first time a piece isn't on this computer. */
function footageLibrary(plan, root) {
  let client;
  return {
    dir: plan.footage ? path.resolve(root, plan.footage) : null,   // the plan's own footage folder, looked in first
    jobs: [],                                                       // shots to fetch, run a few at a time
    gp: [],                                                         // gameplay clips to cut, run a few at a time
    get client() {
      if (client === undefined) {
        try {
          const conf = libraryConfig();
          client = conf ? openLibrary(conf) : null;
        } catch (e) {
          throw new Stop(e.message);
        }
      }
      return client;
    },
  };
}

/** The YouTube id of an official video named by a plan: the id itself, or a file name holding it. */
function videoId(src) {
  LB ??= letterboxes();
  const base = path.basename(String(src));
  return Object.keys(LB).find((v) => base.includes(v)) || (/^[A-Za-z0-9_-]{11}$/.test(String(src)) ? String(src) : null);
}
const ownCopy = (dirs, vid) =>
  dirs.filter((d) => d && fs.existsSync(d)).flatMap((d) => fs.readdirSync(d).map((f) => path.join(d, f))).find((f) => path.basename(f).includes(vid));
const NO_FOOTAGE = "Is the official video in the footage folder? Or use the Algrow footage library (SETUP.md).";
// ground-E's recipe reads Trailer 1 at a time; from the library, that frame comes as a still
const TRAILER1_SS = /-ss\s+(\d+(?:\.\d+)?)\s+-i\s+"\{trailer1\}"/;

/** What a shot's file holds, as a stamp: its video (or the library's copy), in, length, letterbox and tail. Two shots
    with the same key have the same frames. null when the video is neither on this computer nor in the library. */
function shotKey(root, shot, tail, lib) {
  const dur = (F(shot.end) - F(shot.start)) / 30;
  // a gameplay clip of the Algrow GTA library, fetched into footage/gameplay/ (a continuation: several clips of a scene)
  const gids = gameplayIds(shot.src);
  if (gids) {
    const dir = path.join(root, GAMEPLAY_DIR);
    const files = gids.map((id) => path.join(dir, `${id}.mp4`));
    const lost = gids.filter((id, k) => !fs.existsSync(files[k]));
    if (lost.length) return { lost, dur };
    const cut = gids.filter((id) => isCutscene(clipMeta(dir, id)));
    if (cut.length) throw new Stop(`the gameplay shot at ${ts(shot.start)}: ${cutsceneMsg(cut)}`);
    const mode = cropFor(shot, clipMeta(dir, gids[0]));
    const bars = shotBars(shot, dir, gids);   // black bars baked into the clip: cut off, like a trailer's letterbox
    return { key: JSON.stringify([`gameplay:${gids.join("+")}`, files.map((x) => fs.statSync(x).size), r3(shot.in || 0), r3(dur), mode,
      HUD_CROPS[mode] || null, bars, tail]), gameplay: files, ids: gids, mode, bars, dur };
  }
  let src = path.resolve(root, shot.src);
  LB ??= letterboxes();
  const barsOf = (vid) => (Number.isFinite(Number(shot.bars)) && shot.bars !== undefined ? Number(shot.bars) : (LB[vid] || 0));
  if (!fs.existsSync(src)) {
    const vid = videoId(shot.src);
    const own = vid && lib ? ownCopy([lib.dir], vid) : null;
    if (own) src = own;
    else if (vid && lib?.client) {
      const lb = barsOf(vid);
      return { key: JSON.stringify([`library:${vid}`, r3(shot.in || 0), r3(dur), lb, tail]), library: vid, dur, lb };
    } else return null;
  }
  const vid = Object.keys(LB).find((v) => path.basename(src).includes(v));
  const ownBars = shot.bars !== undefined && shot.bars !== null && shot.bars !== "" && Number.isFinite(Number(shot.bars));
  // another game's official video (official_video.mjs get): its letterbox, cut off where this piece shows it
  const lb = vid || ownBars ? barsOf(vid) : pieceBars(src, Number(shot.in || 0), dur);
  return { key: JSON.stringify([src, r3(shot.in || 0), r3(dur), lb, tail]), src, dur, lb };
}

/** Cut one shot to 1920x1080 30 fps, with `tail` frames past its end (a transition reads them; `hold`: those frames
    are its last frame held, when the footage past its end is already another shot); skip it when the same cut is already there. A shot whose video isn't on this computer comes cut from the footage
    library: queued in lib.jobs, fetched by build() into the same file. */
function cutShot(root, shot, i, done, dry, tail = 2, lib = null, hold = false) {
  const name = `s${String(i + 1).padStart(3, "0")}.mp4`;
  const out = path.join(root, "assets", "footage", name);
  const k = shotKey(root, shot, tail, lib);
  if (k?.lost) throw new Stop(`shot ${i + 1} (${ts(shot.start)}): the gameplay clip ${k.lost.join(", ")} isn't in footage/gameplay/. ` +
    "Fetch it from the project folder: node <skills>/skills/gta-footage/gameplay.mjs fetch work/gameplay_picks.json (a link expires after a few " +
    "hours: gta_get_clip gives a fresh one).");
  if (!k) throw new Stop(`shot ${i + 1}: footage not found: ${shot.src}. ${NO_FOOTAGE}`);
  if (done[name] === k.key && fs.existsSync(out)) return { name, cut: false };
  if (k.gameplay) {
    if (!dry) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      (lib?.gp || lib?.jobs || []).push(async () => {   // cut a few at a time (build), or right away (a re-cut)
        await cutGameplay(k, shot, out, tail, hold, `shot ${i + 1} (${ts(shot.start)})`);
        done[name] = k.key;
      });
    }
    return { name, cut: true };
  }
  if (k.library) {
    if (!dry) {
      lib.jobs.push(async () => {
        await lib.client.get("shot", { src: k.library, in: seekAt(shot.in), dur: r3(k.dur), tail: hold ? 0 : tail, lb: k.lb }, out);
        if (hold) holdTail(out, tail);
        done[name] = k.key;
      });
    }
    return { name, cut: true };
  }
  // letterbox bars are given in px at 1080p: crop them, then fill the frame
  const bars = k.lb > 0 ? `crop=iw:ih-2*ih*${k.lb}/1080:0:ih*${k.lb}/1080,` : "";
  const vf = `${bars}scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,fps=30,format=yuv420p`;
  if (!dry) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    execFileSync("ffmpeg", ["-v", "error", "-threads", "4", "-ss", String(seekAt(shot.in)), "-i", k.src, "-t", String(r3(k.dur + tail / 30)),
      "-an", "-vf", hold ? `${vf},trim=end_frame=${Math.round(k.dur * 30)},tpad=stop_mode=clone:stop=${tail}` : vf, "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-threads", "4", "-movflags", "+faststart", "-y", out],
      { stdio: ["ignore", "ignore", "pipe"] });
    done[name] = k.key;
  }
  return { name, cut: true };
}

/** A gameplay shot: its clip (or a scene's clips joined end to end) from `in`, full frame (or the crop the shot opts
    in to, gameplay.mjs), at 1920x1080 30 fps, without the game's sound. The `tail` frames past its end are the clip's own while it has them, then its
    last frame held (all held with `hold`). A shot that runs past the end of its clip stops the build. */
async function cutGameplay(k, shot, out, tail, hold, what) {
  const lens = k.gameplay.map((x) => probeDuration(x));
  const total = lens.reduce((n, x) => n + x, 0), at = Number(shot.in || 0);
  if (!(at >= 0) || at + k.dur > total + 1 / 60)
    throw new Stop(`${what}: ${k.ids.join(" + ")} ${k.ids.length > 1 ? "are" : "is"} ${total.toFixed(2)} s long; from "in" ${at} the shot needs ` +
      `${k.dur.toFixed(2)} s. Run gameplay.mjs assign and find_shots pick again (assign centres the beat in its clip), or continue the ` +
      "beat into the next clip of its scene (gta_get_scene).");
  const n = Math.round(k.dur * 30);
  const end = hold ? `trim=end_frame=${n},` : "";
  const vf = `${gameplayVf(k.mode, k.bars)},fps=30,${end}tpad=stop_mode=clone:stop=${tail},format=yuv420p`;
  const enc = ["-an", "-frames:v", String(n + tail), "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-threads", "4", "-movflags", "+faststart", "-y", out];
  const args = k.gameplay.length === 1
    ? ["-v", "error", "-threads", "4", "-ss", String(seekAt(at)), "-i", k.gameplay[0], "-vf", vf, ...enc]
    : ["-v", "error", "-threads", "4", ...k.gameplay.flatMap((x) => ["-i", x]), "-filter_complex",
      `${k.gameplay.map((_, j) => `[${j}:v]setsar=1[c${j}]`).join(";")};${k.gameplay.map((_, j) => `[c${j}]`).join("")}concat=n=${k.gameplay.length}:v=1:a=0,` +
      `trim=start=${seekAt(at)},setpts=PTS-STARTPTS,${vf}[v]`, "-filter_complex_threads", "4", "-map", "[v]", ...enc];
  try {
    await new Promise((ok, no) => execFile("ffmpeg", args, { maxBuffer: 1 << 26 }, (e, _o, se) => (e ? no(Object.assign(e, { stderr: se })) : ok())));
  } catch (e) {
    throw new Stop(`${what}: FFmpeg couldn't cut ${k.ids.join(" + ")}: ${String(e.stderr || e.message).trim().split("\n").slice(-2).join(" ")}`);
  }
}

/** A library shot cut without its tail gets it as its last frame held: re-encoded at the same quality. */
function holdTail(file, tail) {
  const tmp = file.replace(/\.mp4$/, ".hold.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-threads", "4", "-i", file, "-an", "-vf", `tpad=stop_mode=clone:stop=${tail}`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-threads", "4", "-movflags", "+faststart", "-y", tmp], { stdio: ["ignore", "ignore", "pipe"] });
  fs.renameSync(tmp, file);
}

/** Flash frames. A piece of footage meant to hold one shot can catch a frame or a few of the shot before or after it
    (a boundary in the shot index a frame off, a seek that lands early): one frame of a beach flashing between the
    flamingos and the deer (owner, 17 Nov 2026). Read on a small grey copy, a cut is a frame far more different from
    the one before than the frames around it are, and different in shape too: each frame is measured against its own
    mean and spread, so a flicker, a flash of light or a fade is no cut. A flash inside the piece is a few frames between
    two cuts EDGE frames apart or less, unlike the frames on both sides, after which the shot resumes (a fast move or a
    burst of on-screen text doesn't come back to where it was).
    Returns the piece's frame count, its `cuts`, the frames of another shot at its start (`head`) and at its end
    (`tail`), up to EDGE each, and `mid`, where a flash inside it starts. `seen`: how many frames of the piece are
    ever shown (a shot's frames past its end are read only by a transition on its cut); none = all of them. */
const EDGE = 8;
const FLASH_NOTES = [];   // clips taken for graphics that were cut again a few frames over, for the build's notes
export function strays(file, seen = 0) {
  const W = 96 * 54;
  const r = spawnSync("ffmpeg", ["-hide_banner", "-v", "error", "-threads", "4", "-i", file, "-an", "-vf",
    `${seen > 0 ? `trim=end_frame=${seen},` : ""}scale=96:54,format=gray`, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 1 << 30 });
  const buf = r.stdout || Buffer.alloc(0), frames = Math.floor(buf.length / W);
  const px = (k) => buf.subarray(k * W, (k + 1) * W);
  const norm = [];
  for (let k = 0; k < frames; k++) {
    const p = px(k);
    let m = 0, sd = 0;
    for (const v of p) m += v;
    m /= W;
    for (const v of p) sd += (v - m) ** 2;
    sd = Math.sqrt(sd / W) || 1;
    norm.push(Float32Array.from(p, (v) => (v - m) / sd));
  }
  const grey = (i, j) => { const A = px(i), B = px(j); let t = 0; for (let n = 0; n < W; n++) t += Math.abs(A[n] - B[n]); return t / W; };
  const shape = (i, j) => { const A = norm[i], B = norm[j]; let t = 0; for (let n = 0; n < W; n++) t += Math.abs(A[n] - B[n]); return t / W; };
  const d = [];
  for (let k = 1; k < frames; k++) d.push(grey(k - 1, k));   // d[k]: frame k+1 against frame k
  const cuts = [];
  d.forEach((v, k) => {
    const near = d.filter((_, j) => Math.abs(j - k) > 1 && Math.abs(j - k) <= 12).sort((x, y) => x - y);
    const med = near.length ? near[near.length >> 1] : 0;
    if (v >= 18 && v >= 3 * Math.max(med, 2) && shape(k, k + 1) >= 0.35) cuts.push(k + 1);
  });
  const head = cuts.filter((k) => k <= EDGE).pop() || 0;
  const last = cuts.find((k) => frames - k <= EDGE);
  const inner = cuts.filter((k) => k > EDGE && frames - k > EDGE);
  let mid = null;
  for (let i = 1; i < inner.length && mid == null; i++) {
    const c1 = inner[i - 1], c2 = inner[i];
    if (c2 - c1 <= EDGE && shape(c1 - 1, c2) < 0.4 * Math.min(shape(c1 - 1, c1), shape(c2 - 1, c2))) mid = c1;
  }
  return { frames, head, tail: last ? frames - last : 0, mid, cuts };
}

/** Cut a piece again until no frame of another shot is left at its edges: its in point moves later past the frames
    at its start, or earlier before the frames at its end, by as many frames plus one. `recut(shift)` cuts it again
    with its in point moved by `shift` frames. Returns a note when it moved, and stops when the piece can't be cleaned. */
async function cleanFlashes(file, what, recut, seen = 0) {
  let s = strays(file, seen), shift = 0;
  for (let tries = 0; tries < 3 && (s.head || s.tail) && !(s.head && s.tail); tries++) {
    shift += s.tail ? -(s.tail + 1) : s.head + 1;
    await recut(shift);
    s = strays(file, seen);
  }
  if (s.head || s.tail)
    throw new Stop(`${what}: it holds ${s.head || s.tail} frame(s) of another shot at its ${s.head ? "start" : "end"} (a flash frame), ` +
      `and moving it doesn't help: the shot is shorter than this piece. Shorten it, or take another moment.`);
  if (s.mid != null)
    throw new Stop(`${what}: a flash of another shot ${(s.mid / 30).toFixed(2)} s into it (a shot of a few frames inside the piece). Take another moment.`);
  return shift ? `${what}: ${Math.abs(shift) - 1} frame(s) of the ${shift < 0 ? "next" : "previous"} shot at its ${shift < 0 ? "end" : "start"}; ` +
    `its in point moved ${Math.abs(shift)} frame(s) ${shift < 0 ? "earlier" : "later"}.` : null;
}

/** The folders official_video.mjs downloads into (footage/gta6, footage/other/<game>): searched for @frame and @clip. */
function downloadDirs(root) {
  const other = path.join(root, OTHER_DIR);
  const subs = fs.existsSync(other) ? fs.readdirSync(other, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(other, e.name)) : [];
  return [path.join(root, "footage", "gta6"), ...subs].filter((d) => fs.existsSync(d));
}

/** Shots of another game's official video (official_video.mjs get: footage/other/<game>/<id>.mp4 and its <id>.json).
    Each must name its "game" (R13 puts that game's logo on it, R14 a game switch on its cuts: without it, it would pass
    as GTA VI footage), and must fit in its file. Stops on any that doesn't; returns a note, or null when there are none. */
function otherGameShots(root, shots) {
  const problems = [], games = {};
  const otherDir = path.join(root, OTHER_DIR);
  shots.forEach((s, i) => {
    if (gameplayIds(s.src)) return;
    const file = path.resolve(root, String(s.src || ""));
    if (!fs.existsSync(file)) return;
    const meta = videoMeta(file);
    const inOther = !path.relative(otherDir, file).startsWith("..") && !path.isAbsolute(path.relative(otherDir, file));
    if (!inOther && (!meta || gameNamed(meta.game)?.key === "gta6")) return;   // GTA VI, or the user's own file: as before
    const what = `shot ${i + 1} (${ts(s.start)})`, name = rel(root, file);
    const len = Number(meta?.duration) > 0 ? Number(meta.duration) : probeDuration(file);
    const dur = (F(s.end) - F(s.start)) / 30, at = Number(s.in || 0);
    if (!(at >= 0) || at + dur > len + 1 / 60)
      problems.push(`${what}: ${name} is ${len.toFixed(2)} s long; from "in" ${s.in ?? 0} the shot needs ${dur.toFixed(2)} s. ` +
        "Take an earlier \"in\" inside the shot you picked (the sheet gives each shot's span), or shorten the beat.");
    const game = String(s.game || "").trim();
    if (!game) problems.push(`${what} plays ${meta?.game || "another game's"} footage (${name}): set its "game"` +
      (meta?.game ? ` to "${meta.game}"` : " (as assets/logos/logos.json names that game)") +
      ", so it wears that game's logo (R13) and a game switch plays on its cuts (R14).");
    games[game || "?"] = (games[game || "?"] || 0) + 1;
  });
  if (problems.length) throw new Stop(problems.length === 1 ? problems[0] : `${problems.length} problems with other games' shots:\n- ${problems.join("\n- ")}`);
  const n = Object.values(games).reduce((a, b) => a + b, 0);
  return n ? `${n} shot(s) of other games' official videos (footage/other/): ${Object.entries(games).map(([g, k]) => `${k} ${g}`).join(", ")}; ` +
    "each one's letterbox cut off where it shows one." : null;
}

/** Shot files are named by their place in the plan (s001, s002...), so a shot added or removed renames every later one.
    Before cutting, find each shot's cut under its old name (same key) and copy it into place: no re-cut, no stale file.
    Returns how many were moved. (Video 2, 17 Nov 2026: two Red Dead shots added at 6:07 would have re-cut 35 shots.) */
function relinkShots(root, shots, done, tails, lib, dry) {
  if (dry) return 0;
  const dir = path.join(root, "assets", "footage");
  const byKey = new Map();
  for (const [n, key] of Object.entries(done)) if (/^s\d+\.mp4$/.test(n) && fs.existsSync(path.join(dir, n))) byKey.set(key, n);
  const moves = [];
  shots.forEach((s, i) => {
    const name = `s${String(i + 1).padStart(3, "0")}.mp4`;
    const k = shotKey(root, s, tails[i] || 2, lib);
    if (!k || !k.key || (done[name] === k.key && fs.existsSync(path.join(dir, name)))) return;
    const from = byKey.get(k.key);
    if (from && from !== name) moves.push([from, name, k.key]);
  });
  if (!moves.length) return 0;
  // every source is copied aside first: a file can be both moved away and overwritten in one pass
  const stage = path.join(dir, ".relink");
  fs.mkdirSync(stage, { recursive: true });
  for (const [from] of moves) if (!fs.existsSync(path.join(stage, from))) fs.copyFileSync(path.join(dir, from), path.join(stage, from));
  for (const [from, to, key] of moves) {
    fs.copyFileSync(path.join(stage, from), path.join(dir, to));
    done[to] = key;
  }
  fs.rmSync(stage, { recursive: true, force: true });
  // the stamps now say what each file holds: write them at once, so a stop later never leaves a stale stamp
  fs.writeFileSync(path.join(dir, "shots.json"), JSON.stringify(done, null, 1));
  return moves.length;
}

/** A file value taken from an official video: "@frame <video id> <seconds>" (a still) or
    "@clip <video id> <seconds> <length>" (a video), each optionally followed by "| <ffmpeg filter>". The length is the
    seconds taken from the video, here and from the library alike: a "| setpts=3*PTS" after it makes a clip 3 times longer.
    Cut to 1920x1080 with the letterbox removed, into assets/media/. Returns the project path.
    A video that isn't in the footage folders comes from the footage library, already cut; the "| filter" is then
    applied here, on the downloaded piece. */
async function takeMedia(root, spec, dirs, name, stamps, dry, lib = null) {
  // "@clip A + @clip B": takes joined end to end into one video (a place whose trailer shots are each too short
  // to hold a panel), the cut being the trailer's own
  const joined = String(spec).split(/\s\+\s(?=@clip\b)/);
  if (joined.length > 1) {
    if (!joined.every((p) => /^@clip\b/.test(p.trim()))) throw new Stop(`"${spec}": only @clip values can be joined with +`);
    const file = `${name}.mp4`, out = path.join(root, "assets", "media", file);
    const parts = [];
    for (const [k, p] of joined.entries()) parts.push(await takeMedia(root, p.trim(), dirs, `${name}-p${k + 1}`, stamps, dry, lib));
    const key = JSON.stringify(["join", ...parts.map((p) => stamps[path.basename(p)] || p)]);
    if (dry || (stamps[file] === key && fs.existsSync(out))) return `assets/media/${file}`;
    const list = path.join(os.tmpdir(), `gta-join-${process.pid}-${name}.txt`);
    fs.writeFileSync(list, parts.map((p) => `file '${path.join(root, p).replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n") + "\n");
    try {
      // every part is cut with the same settings (1920x1080, 30 fps, x264 CRF 16), so they join without re-encoding
      execFileSync("ffmpeg", ["-v", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", "-y", out], { stdio: ["ignore", "ignore", "pipe"] });
    } catch (e) {
      throw new Stop(`"${spec}": FFmpeg could not join the takes: ${String(e.stderr || e.message).trim().split("\n").slice(-2).join(" ")}`);
    } finally {
      fs.rmSync(list, { force: true });
    }
    stamps[file] = key;
    fs.writeFileSync(path.join(root, "assets", "media", "media.json"), JSON.stringify(stamps, null, 1));
    return `assets/media/${file}`;
  }
  const m = String(spec).match(/^@(frame|clip)\s+([A-Za-z0-9_-]{11})\s+(\d+(?:\.\d+)?)(?:\s+(\d+(?:\.\d+)?))?\s*(?:\|\s*(.+))?$/);
  if (!m || (m[1] === "clip" && !m[4]))
    throw new Stop(`"${spec}": write @frame <video id> <seconds>, or @clip <video id> <seconds> <length>, optionally followed by | <ffmpeg filter>`);
  const [, kind, vid, at, len, extra] = m;
  const src = dirs.flatMap((d) => (fs.existsSync(d) ? fs.readdirSync(d).map((f) => path.join(d, f)) : [])).find((f) => path.basename(f).includes(vid));
  if (!src && !lib?.client) throw new Stop(`"${spec}": no official video with the id ${vid} in the footage folder`);
  LB ??= letterboxes();
  // an official GTA VI video's letterbox; another game's (official_video.mjs get) where this take shows it
  const lb = LB[vid] !== undefined ? LB[vid] : src ? pieceBars(src, Number(at), Number(len) || 0.1) : 0;
  const bars = lb > 0 ? `crop=iw:ih-2*ih*${lb}/1080:0:ih*${lb}/1080,` : "";
  const vf = `${bars}scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,setsar=1${extra ? "," + extra.trim() : ""}`;
  const file = `${name}.${kind === "frame" ? "jpg" : "mp4"}`;
  const out = path.join(root, "assets", "media", file);
  const key = JSON.stringify([src || `library:${vid}`, at, len ?? null, vf]);
  if (dry || (stamps[file] === key && fs.existsSync(out))) return `assets/media/${file}`;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const fail = (e) => new Stop(`"${spec}": FFmpeg failed: ${String(e.stderr || e.message).trim().split("\n").slice(-2).join(" ")}`);
  // cut the take from `t` seconds into the video (a clip is cut again a few frames over when it holds a flash frame)
  const make = async (t) => {
    if (!src) {
      // the library cuts it like the args below, without the extra filter; the filter is applied here
      const params = kind === "frame" ? { src: vid, t, lb } : { src: vid, t: seekAt(t), len, lb };
      const piece = extra ? path.join(os.tmpdir(), `gta-media-${process.pid}-${file}`) : out;
      await lib.client.get(kind, params, piece);
      if (!extra) return;
      // the JPEG comes back in full range; the official videos are limited-range BT.709, so the filter gets the
      // values it would get from the video itself
      const back = "scale=out_range=tv,format=yuv420p,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709,";
      const args = kind === "frame"
        ? ["-v", "error", "-threads", "4", "-i", piece, "-frames:v", "1", "-vf", back + extra.trim(), "-q:v", "2", "-y", out]
        : ["-v", "error", "-threads", "4", "-i", piece, "-an", "-vf", `${extra.trim()},fps=30,format=yuv420p`,
          "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-threads", "4", "-movflags", "+faststart", "-y", out];
      try {
        execFileSync("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
      } catch (e) {
        throw fail(e);
      } finally {
        fs.rmSync(piece, { force: true });
      }
      return;
    }
    const args = kind === "frame"
      ? ["-v", "error", "-threads", "4", "-ss", t, "-i", src, "-frames:v", "1", "-vf", vf, "-q:v", "2", "-y", out]
      : ["-v", "error", "-threads", "4", "-ss", String(seekAt(t)), "-t", len, "-i", src, "-an", "-vf", `${vf},fps=30,format=yuv420p`,
        "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-threads", "4", "-movflags", "+faststart", "-y", out];
    try {
      execFileSync("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    } catch (e) {
      throw fail(e);
    }
  };
  await make(at);
  if (kind === "clip") {
    const note = await cleanFlashes(out, `"${spec}"`, (shift) => make(String(r3(Math.max(0, Number(at) + shift / 30)))));
    if (note) FLASH_NOTES.push(note);
  }
  stamps[file] = key;
  fs.writeFileSync(path.join(root, "assets", "media", "media.json"), JSON.stringify(stamps, null, 1));
  return `assets/media/${file}`;
}

/** A time of a template's `ground`: a number, a variable's name, or a variable plus or minus seconds ("out+0.067"). */
function groundTime(v, values, what) {
  if (v === undefined || v === null || v === "") return null;
  let n = Number(v);
  if (typeof v !== "number") {
    const m = String(v).match(/^([a-z_][a-z0-9_]*)\s*(?:([+-])\s*(\d+(?:\.\d+)?))?$/i);
    if (m) n = Number(values[m[1]]) + (m[2] ? (m[2] === "+" ? 1 : -1) * Number(m[3]) : 0);
  }
  if (!Number.isFinite(n)) throw new Stop(`its ground's ${what} "${v}" is not a number or a variable of the scene`);
  return n;
}

/** Bake the treated footage a template wants under it (device.json `ground`) from the shots under the scene.
    The clip starts with the scene; it fades in from the sharp shot at soft_at and back to it at sharp_at.
    `file`: where to write it (a new animation's ground, assets/newgrounds/<name>.mp4) instead of assets/grounds/<id>.mp4;
    `shots`: the shots' stamps (shots.json), put in its stamp so a shot cut again under it bakes it again. */
function bakeGround(root, id, start, dur, ground, values, cuts, stamps, dry, { file = null, shots = null } = {}) {
  if (!ground?.vf) return null;
  const f = (t) => Math.round(t * 30);
  const soft = groundTime(ground.soft_at, values, "soft_at") ?? 0;
  const softFade = Number(ground.soft_fade || 0);
  const sharp = groundTime(ground.sharp_at, values, "sharp_at");
  const sharpFade = Number(ground.sharp_fade || 0);
  // a pushed ground covers the whole scene: cutting back to the still shot mid-push would jump
  const push = Number(ground.push || 0);
  const frames = push ? f(dur) : Math.min(f(dur), sharp === null ? f(dur) : f(sharp + sharpFade));
  if (frames <= 0) return null;
  const a = f(start), b = a + frames;
  // the pieces of the cut shots under [a, b); black where no shot plays
  const pieces = [];
  let t = a;
  for (const c of cuts) {
    const s = f(c.start), e = f(c.end);
    if (e <= t || s >= b) continue;
    if (s > t) pieces.push({ black: Math.min(s, b) - t }), (t = Math.min(s, b));
    const end = Math.min(e, b);
    if (end > t) pieces.push({ file: c.file, from: t - s, n: end - t }), (t = end);
    if (t >= b) break;
  }
  if (t < b) pieces.push({ black: b - t });

  const name = file ? path.basename(file) : `${id}.mp4`;
  const out = file || path.join(root, "assets", "grounds", name);
  const key = JSON.stringify([pieces, ground.vf, soft, softFade, sharp, sharpFade, push,
    ...(shots ? [pieces.map((p) => (p.file ? shots[path.basename(p.file)] ?? null : null))] : [])]);
  const tag = `<video id="${id}-ground" class="clip ground" src="assets/grounds/${name}" muted playsinline ` +
    `data-start="${a / 30}" data-duration="${frames / 30}" data-track-index="2"></video>`;
  // the slow push of the validated clip: a GSAP scale on the ground, from its first frame
  const tween = push ? `tl.fromTo("#${id}-ground", { scale: 1 }, { scale: ${push}, duration: ${Number(ground.push_time) || frames / 30}, ease: "none" }, ${a / 30});` : null;
  if (dry || (stamps[name] === key && fs.existsSync(out))) return { tag, baked: false, tween };

  const args = ["-v", "error", "-threads", "4"];
  const chains = [];
  pieces.forEach((p, i) => {
    if (p.black) args.push("-f", "lavfi", "-t", String(r3(p.black / 30)), "-i", "color=c=black:s=1920x1080:r=30");
    else args.push("-ss", String(seekAt(p.from / 30)), "-t", String(r3((p.n + 0.5) / 30)), "-i", path.join(root, p.file));
    chains.push(`[${i}:v]fps=30,setsar=1,trim=end_frame=${p.black || p.n},setpts=PTS-STARTPTS[p${i}]`);
  });
  const joined = pieces.length > 1 ? `${pieces.map((_, i) => `[p${i}]`).join("")}concat=n=${pieces.length}:v=1:a=0[c]` : null;
  const src = joined ? "[c]" : "[p0]";
  const treat = `${ground.vf},scale=1920:1080:flags=lanczos,setsar=1`;
  const fades = [];
  if (soft > 0 || softFade > 0) fades.push(`fade=t=in:st=${r3(soft)}:d=${r3(Math.max(softFade, 1 / 30))}:alpha=1`);
  if (sharp !== null && sharpFade > 0) fades.push(`fade=t=out:st=${r3(sharp)}:d=${r3(sharpFade)}:alpha=1`);
  const graph = [...chains, ...(joined ? [joined] : [])];
  if (fades.length) graph.push(`${src}split[s][t]`, `[t]${treat},format=yuva420p,${fades.join(",")}[g]`, `[s][g]overlay=format=auto,format=yuv420p[v]`);
  else graph.push(`${src}${treat},format=yuv420p[v]`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  try {
    execFileSync("ffmpeg", [...args, "-filter_complex", graph.join(";"), "-filter_complex_threads", "4", "-map", "[v]", "-frames:v", String(frames),
      "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-threads", "4", "-movflags", "+faststart", "-y", out],
      { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    throw new Stop(`FFmpeg couldn't bake the ground: ${String(e.stderr || e.message).trim().split("\n").slice(-2).join(" ")}`);
  }
  stamps[name] = key;
  return { tag, baked: true, tween };
}

/** The project files the page plays or shows (src="assets/...", "animations/..." or "compositions/..."), in index.html
    and in every composition it mounts, down the tree, that aren't on disk: [{ file, in }]. HyperFrames stops the render
    on a missing video (VIDEO_SOURCE_UNRENDERABLE, 19 Nov 2026: a new animation's ground that was never baked). */
export function missingAssets(root, html) {
  const missing = new Map();
  const read = new Set();
  const scan = (text, where) => {
    for (const m of text.matchAll(/\bsrc\s*=\s*["']((?:assets|animations|compositions)\/[^"'?#]+)/g)) {
      const p = m[1];
      if (/[{}$]/.test(p)) continue;   // a value filled in by a script, not a file
      let file = path.join(root, p);
      try {
        file = path.join(root, decodeURIComponent(p));
      } catch {}
      if (!fs.existsSync(file)) {
        if (!missing.has(p)) missing.set(p, where);
      } else if (/\.html?$/i.test(p) && !read.has(p)) {
        read.add(p);
        scan(fs.readFileSync(file, "utf8"), p);
      }
    }
  };
  scan(html, "index.html");
  return [...missing].map(([file, where]) => ({ file, in: where }));
}

// Before any footage is cut, every graphic's values go through make_scene in a scratch project, so a wrong value
// (too long, missing, a time past the scene's end) stops the build in seconds, not after all the shots are cut.
// Files are stood in for by a 1-pixel image here: only text, numbers and times are checked; the real files come in step 3.
export function checkValues(plan, channel = null, showcase = false, root = null) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "gta-values-"));
  const errors = [];
  try {
    const stand = path.join(scratch, "stand-in.png");
    fs.writeFileSync(stand, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
    let n = 0;
    for (const g of plan.graphics || []) {
      const dev = String(g.device || "");
      const devFile = path.join(TEMPLATES, dev, "device.json");
      if (!dev || dev.startsWith("new:") || !fs.existsSync(devFile)) continue;   // step 3 reports these
      const device = readJson(devFile);
      const theme = showcase && g.theme ? g.theme : plan.theme;
      if (device.themes?.length && !device.themes.includes(theme)) continue;
      const html = fs.readFileSync(path.join(TEMPLATES, dev, `${dev}.html`), "utf8");
      const declared = (k) => new RegExp(`"id"\\s*:\\s*"${k}"`).test(html);
      const dur = (F(g.end) - F(g.start)) / 30;
      const vars = { ...(g.vars || {}) };
      // a logo build() will take from assets/logos/ (an outlet's, a game's) counts as given
      for (const n of ["", "1", "2", "3", "4", "5", "6"]) {
        const lk = `logo${n}`, ok = declared(`outlet${n}`) ? `outlet${n}` : `game${n}`;
        if (declared(lk) && !vars[lk] && vars[ok] && findLogo(vars[ok], [plan.logos && root ? path.resolve(root, plan.logos) : null, LOGOS])) vars[lk] = stand;
      }
      if (channel && declared("avatar") && !("avatar" in vars) && channel.avatar) vars.avatar = stand;
      if (channel && declared("channel") && !("channel" in vars) && channel.name) vars.channel = channel.name;
      fitOut(vars, declared, dur, device);
      for (const k of device.files || []) if (vars[k]) vars[k] = stand;
      // every value at once: make_scene stops at the first bad one, so try each set value alone after a failure
      const tryScene = (set) => makeScene({ template: dev, project: scratch, as: `v${++n}`, theme: device.themes?.length ? theme : null,
        force: true, set, start: fr(g.start), duration: dur, track: 1 });
      const all = Object.entries(vars).map(([k, v]) => `${k}=${v}`);
      try {
        tryScene(all);
      } catch (e) {
        const one = [];
        for (const kv of all) {
          try {
            tryScene([kv]);
          } catch (e1) {
            if (!/ needs /.test(e1.message)) one.push(e1.message);   // "needs x" here only means the other values were left out
          }
        }
        for (const msg of one.length ? one : [e.message]) errors.push({ start: g.start, text: `${g.id} (${dev}): ${msg}` });
      }
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  return errors;
}

// The exit ends with the scene. Left out, `out` is the last frame the exit fits in; set a hair too late (a plan's
// end minus the exit, in seconds, lands up to a frame past the scene once times snap to 1/30 s), it moves back.
function fitOut(vars, declared, dur, device, notes = null, id = "") {
  if (!declared("out")) return;
  const exitT = Number(device.exit_total ?? device.exit ?? 0.3);
  const outMax = Math.floor((dur - exitT) * 30 + 1e-6) / 30;
  if (!("out" in vars)) vars.out = outMax;
  else if (Number(vars.out) > outMax + 1e-6 && Number(vars.out) - outMax <= 0.1 + 1e-6) {
    if (notes) notes.push(`${id}: out ${vars.out} moved to ${outMax.toFixed(3)} so its ${exitT} s exit fits the scene.`);
    vars.out = outMax;
  }
}

export async function build(planPath, { dry = false, showcase = false } = {}) {
  const planFile = path.resolve(planPath);
  if (!fs.existsSync(planFile)) throw new Stop(`no plan at ${planPath}`);
  const root = path.dirname(planFile);
  const plan = readJson(planFile);
  const notes = [];

  // 1. the plan must pass gta-pacing
  const words = plan.words && fs.existsSync(path.resolve(root, plan.words)) ? toWords(readJson(path.resolve(root, plan.words))) : null;
  const channelPath = plan.channel ? path.resolve(root, plan.channel) : null;
  const channel = channelPath && fs.existsSync(channelPath) ? readJson(channelPath) : null;
  const { rep } = check(plan, words, channel, channelPath, TEMPLATES, root);
  if (showcase) notes.push(`TEST SHOWCASE: the pacing check was skipped (${rep.fails.length} rule(s) broken). Never ship this video.`);
  else if (rep.fails.length) {
    const lines = rep.fails.slice(0, 12).map((f) => `  ${ts(f.t)}  ${f.rule}  ${f.msg}`);
    throw new Stop(`the plan fails gta-pacing (${rep.fails.length}). Fix plan.json, then build again:\n${lines.join("\n")}` +
      (rep.fails.length > 12 ? `\n  ... and ${rep.fails.length - 12} more: node ../gta-pacing/check_pacing.mjs ${planPath}` : ""));
  }
  if (!words) notes.push("no words.json: the graphics' timing on their words was not checked.");

  const theme = plan.theme;
  const fps = Number(plan.fps || 30);
  if (fps !== 30) throw new Stop("fps must be 30: the footage and the templates are made at 30 fps.");
  const duration = r3(plan.duration);

  // 2. footage
  const stampFile = path.join(root, "assets", "footage", "shots.json");
  const done = fs.existsSync(stampFile) ? readJson(stampFile) : {};
  const shots = [...(plan.shots || [])].sort((a, b) => a.start - b.start);
  if (!dry) {
    const bad = checkValues(plan, channel, showcase, root).map((x) => x.text);
    if (bad.length) throw new Stop(bad.length === 1 ? bad[0] : `${bad.length} values don't fit their template:\n  ${bad.join("\n  ")}`);
  }

  // a transition reads frames of the outgoing shot past the cut (its `tail`): cut that shot longer
  const transitions = [...(plan.transitions || [])].sort((a, b) => a.at - b.at).map((x, n) => {
    const dev = String(x.device || "");
    const devFile = path.join(TEMPLATES, dev, "device.json");
    if (!fs.existsSync(devFile)) throw new Stop(`transition at ${ts(x.at)}: no template "${dev}" in gta-motion/templates`);
    const device = readJson(devFile);
    if (device.layer !== "transition" || !device.recipe)
      throw new Stop(`transition at ${ts(x.at)}: ${dev} isn't a transition between two shots. Use whip-A, whip-C, trans-D, trans-E or trans-F2.`);
    const ia = shots.findIndex((s) => F(s.end) === F(x.at));
    const ib = shots.findIndex((s) => F(s.start) === F(x.at));
    if (ia < 0 || ib < 0) throw new Stop(`transition at ${ts(x.at)}: no cut between two shots there. A transition sits exactly on a cut.`);
    return { n: n + 1, at: x.at, dev, device, ia, ib };
  });
  const tails = {};
  for (const t of transitions) tails[t.ia] = Math.max(tails[t.ia] || 2, Number(t.device.tail || 0) + 1);
  const videoTags = [];
  const cuts = [];
  let cut = 0;
  const lib = footageLibrary(plan, root);
  const other = otherGameShots(root, shots);
  if (other) notes.push(other);
  const relinked = relinkShots(root, shots, done, tails, lib, dry);
  if (relinked) notes.push(`${relinked} shot file(s) renamed after a shot was added or removed (same cut, not cut again).`);
  const gpShots = shots.filter((s) => gameplayIds(s.src));
  if (gpShots.length) {
    const modes = {};
    for (const s of gpShots) {
      const m = cropFor(s, clipMeta(path.join(root, GAMEPLAY_DIR), gameplayIds(s.src)[0]));
      modes[m] = (modes[m] || 0) + 1;
    }
    const say = { full: "the full frame, HUD and subtitles kept", hud: "the HUD crop (\"crop\")", wanted: "the wanted crop (\"crop\")",
      combat: "the combat crop (\"crop\")" };
    const barred = gpShots.filter((s) => shotBars(s, path.join(root, GAMEPLAY_DIR), gameplayIds(s.src)) > 0).length;
    notes.push(`${gpShots.length} gameplay shot(s) from footage/gameplay/: ${Object.entries(modes).map(([m, n]) => `${n} with ${say[m]}`).join(", ")}` +
      `${barred ? `; ${barred} with the clip's black bars cut off` : ""}. ` +
      "Look at them: node <skills>/skills/gta-footage/gameplay.mjs sheet plan.json, then open every page (work/gameplay_01.jpg...).");
  }
  const fresh = [];   // the shots cut in this build, checked for flash frames once they are all here
  shots.forEach((s, i) => {
    const r = cutShot(root, s, i, done, dry, tails[i] || 2, lib);
    if (r.cut) cut++, fresh.push(i);
    cuts.push({ start: Number(s.start), end: Number(s.end), file: `assets/footage/${r.name}` });
    videoTags.push(`<video id="${r.name.replace(".mp4", "")}" class="clip shot" src="assets/footage/${r.name}" muted playsinline ` +
      `data-start="${fr(s.start)}" data-duration="${(F(s.end) - F(s.start)) / 30}" data-track-index="0"></video>`);
  });
  // the shots that come from the footage library, a few at a time; the ones fetched are kept even if one fails
  try {
    if (lib.gp.length) {   // gameplay clips: 4 cuts at once on an 8-core machine and up (each FFmpeg uses 4 threads)
      const t0 = Date.now(), n = Math.max(2, Math.min(6, Math.floor(os.cpus().length / 4)));
      process.stderr.write(`gameplay: cutting ${lib.gp.length} shot(s), ${n} at a time...
`);
      await runAll(lib.gp, n);
      notes.push(`${lib.gp.length} gameplay shot(s) cut in ${Math.round((Date.now() - t0) / 1000)} s.`);
    }
    if (lib.jobs.length) {
      const t0 = Date.now();
      process.stderr.write(`footage library: fetching ${lib.jobs.length} shot(s) from ${lib.client.url}...\n`);
      await runAll(lib.jobs, 4);   // the library cuts 4 pieces at once
      notes.push(`${lib.jobs.length} shot(s) fetched from the footage library in ${Math.round((Date.now() - t0) / 1000)} s.`);
    }
    // no frame of another shot in any shot: an edge one is cut again a few frames over, a flash inside stops the build.
    // Every fresh shot is checked before the build stops, so one build lists all of them (and none is left stamped unchecked).
    const flashStops = [];
    for (const i of dry ? [] : fresh) {
      const name = `s${String(i + 1).padStart(3, "0")}.mp4`, file = path.join(root, "assets", "footage", name);
      if (!fs.existsSync(file)) continue;
      try {
        const what = `shot ${i + 1} (${ts(shots[i].start)})`, shown = F(shots[i].end) - F(shots[i].start);
        let moved = 0;
        const recut = async (shift, hold = false) => {
          moved = shift;
          const one = { dir: lib.dir, jobs: [], get client() { return lib.client; } };
          cutShot(root, { ...shots[i], in: r3(Math.max(0, Number(shots[i].in || 0) + shift / 30)) }, i, {}, false, tails[i] || 2, one, hold);
          for (const job of one.jobs) await job();
        };
        const note = await cleanFlashes(file, what, recut, shown);
        if (note) notes.push(note);
        // a transition on its cut also reads the frames past its end: if the footage there is already the next
        // shot, those frames hold the shot's last frame instead (nothing else to see through the whip)
        if (transitions.some((t) => t.ia === i) && strays(file).cuts.some((k) => k >= shown)) {
          await recut(moved, true);
          notes.push(`${what}: the footage right after it is another shot, so the transition on its cut reads its last frame held.`);
        }
      } catch (e) {
        delete done[name];   // never stamped as good: the next build cuts it again
        if (!(e instanceof Stop)) throw e;
        flashStops.push(e.message);
      }
    }
    if (flashStops.length) throw new Stop(flashStops.length === 1 ? flashStops[0] : `${flashStops.length} shots to fix:\n- ${flashStops.join("\n- ")}`);
  } finally {
    if (!dry) {
      fs.mkdirSync(path.dirname(stampFile), { recursive: true });
      fs.writeFileSync(stampFile, JSON.stringify(done, null, 1));
    }
  }

  // 3. graphics, and the treated footage some of them want under them
  const hostTags = [];
  const groundTags = [];
  const rootTweens = [];
  const groundFile = path.join(root, "assets", "grounds", "grounds.json");
  const groundStamps = fs.existsSync(groundFile) ? readJson(groundFile) : {};
  const newGroundFile = path.join(root, "assets", "newgrounds", "newgrounds.json");   // the grounds of new animations
  const newGroundStamps = fs.existsSync(newGroundFile) ? readJson(newGroundFile) : {};
  let baked = 0, newGrounds = 0;
  const used = new Set();
  // stills and clips that graphics take from the official videos (@frame / @clip), from the shots' folders
  const footageDirs = [...new Set([...shots.filter((s) => !gameplayIds(s.src)).map((s) => path.dirname(path.resolve(root, s.src))),
    ...(plan.footage ? [path.resolve(root, plan.footage)] : []), ...downloadDirs(root)])];
  const mediaFile = path.join(root, "assets", "media", "media.json");
  const mediaStamps = fs.existsSync(mediaFile) ? readJson(mediaFile) : {};
  const stills = [];
  const boxes = [];   // every box, lens and arrow on its frozen still (device.json marks), for work/boxes.jpg
  for (const g of [...(plan.graphics || [])].sort((a, b) => a.start - b.start)) {
    const id = String(g.id || "").toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (!/^[a-z]/.test(id)) throw new Stop(`graphic "${g.id}": its id must start with a letter (g01, g02...)`);
    if (used.has(id)) throw new Stop(`two graphics have the id ${g.id}`);
    used.add(id);
    const start = fr(g.start), dur = (F(g.end) - F(g.start)) / 30;
    const z = g.layer === "fullscreen" ? 10 : g.layer === "transition" ? 30 : 20;   // a plate over a cut (gameswitch) covers everything
    const dev = String(g.device || "");

    if (dev.startsWith("new:")) {
      // an animation built for this video (gta-motion/new-animation.md): mounted as it is
      const name = dev.slice(4);
      const file = path.join(root, "animations", name, `${name}.html`);
      if (!fs.existsSync(file)) throw new Stop(`${g.id}: animations/${name}/${name}.html not found`);
      const compId = (fs.readFileSync(file, "utf8").match(/data-composition-id="([^"]+)"/) || [])[1];
      if (!compId) throw new Stop(`${g.id}: animations/${name}/${name}.html has no data-composition-id`);
      if (used.has(`new:${compId}`)) throw new Stop(`${g.id}: ${dev} is used twice; give the second use its own copy and id`);
      used.add(`new:${compId}`);
      hostTags.push(`<div id="${compId}" data-composition-id="${compId}" data-composition-src="animations/${name}/${name}.html" ` +
        `data-start="${start}" data-duration="${dur}" data-track-index="1" data-track-kind="graphics" data-width="1920" ` +
        `data-height="1080" style="z-index:${z}"></div>`);
      // its own ground (device.json `ground_vf`): the shots under it, treated, into assets/newgrounds/<name>.mp4,
      // which its HTML plays from its first frame
      const ndFile = path.join(root, "animations", name, "device.json");
      let nd = {};
      try {
        if (fs.existsSync(ndFile)) nd = readJson(ndFile);
      } catch (e) {
        throw new Stop(`${g.id}: animations/${name}/device.json can't be read (${e.message})`);
      }
      if (nd.ground_vf !== undefined && nd.ground_vf !== null && nd.ground_vf !== "") {
        if (typeof nd.ground_vf !== "string") throw new Stop(`${g.id}: "ground_vf" in animations/${name}/device.json must be an FFmpeg filter, as text`);
        let gr;
        try {
          gr = bakeGround(root, name, start, dur, { vf: nd.ground_vf }, {}, cuts, newGroundStamps, dry,
            { file: path.join(root, "assets", "newgrounds", `${name}.mp4`), shots: done });
        } catch (e) {
          throw new Stop(`${g.id} (${dev}): ${e.message}`);
        }
        if (gr) newGrounds++, gr.baked && baked++;
      }
      continue;
    }

    const devFile = path.join(TEMPLATES, dev, "device.json");
    if (!fs.existsSync(devFile)) throw new Stop(`${g.id}: no template "${dev}" in gta-motion/templates`);
    const device = readJson(devFile);
    const theme = showcase && g.theme ? g.theme : plan.theme;
    if (!showcase && g.theme && g.theme !== plan.theme) throw new Stop(`${g.id}: one theme per video; remove its "theme"`);
    if (device.themes?.length && !device.themes.includes(theme))
      throw new Stop(`${g.id}: ${dev} has no ${theme} version (only ${device.themes.join(", ")}). Pick another variant.`);
    const vars = { ...(g.vars || {}) };
    const html = fs.readFileSync(path.join(TEMPLATES, dev, `${dev}.html`), "utf8");
    const declared = (id) => new RegExp(`"id"\\s*:\\s*"${id}"`).test(html);
    // identity from the channel kit only (rule R10 already checked the plan against it)
    if (channel) {
      const kitDir = path.dirname(channelPath);
      if (declared("avatar") && !("avatar" in vars) && channel.avatar) vars.avatar = bring(root, path.resolve(kitDir, channel.avatar), "channel", dry);
      else if (vars.avatar) vars.avatar = bring(root, path.resolve(kitDir, vars.avatar), "channel", dry);
      if (declared("channel") && !("channel" in vars) && channel.name) vars.channel = channel.name;
    }
    // the outlet's logo from assets/logos/ when the plan names an outlet and gives no logo file; none = its name as text.
    // A game tag (gametag) names a game instead: same lookup, and with no logo it stops (a game logo is never drawn).
    for (const n of ["", "1", "2", "3", "4", "5", "6"]) {
      const lk = `logo${n}`, ok = declared(`outlet${n}`) ? `outlet${n}` : `game${n}`;
      if (!declared(lk) || vars[lk] || !vars[ok]) continue;
      const hit = findLogo(vars[ok], [plan.logos ? path.resolve(root, plan.logos) : null, LOGOS]);
      if (!hit) {
        notes.push(`${g.id}: no logo for "${vars[ok]}" in assets/logos/, so its name shows as text. Add the PNG and a logos.json entry to show it.`);
        continue;
      }
      vars[lk] = hit.file;
      if (declared(`${lk}_h`) && !(`${lk}_h` in vars) && hit.logo_h != null) vars[`${lk}_h`] = hit.logo_h;
      if (declared(`${lk}_trim`) && !(`${lk}_trim` in vars) && hit.logo_trim != null) vars[`${lk}_trim`] = hit.logo_trim;
      // a game logo's visual centre (a year or a line under it centres there) and its dive point (intro-B)
      if (declared(`${lk}_cx`) && !(`${lk}_cx` in vars) && hit.cx != null) vars[`${lk}_cx`] = hit.cx;
      if (!n && Array.isArray(hit.door) && declared("doorx") && !("doorx" in vars)) [vars.doorx, vars.doory, vars.doorr] = hit.door;
    }
    // the exit ends with the graphic
    fitOut(vars, declared, dur, device, notes, id);
    for (const k of device.files || []) {
      if (!vars[k] || k === "avatar") continue;
      vars[k] = String(vars[k]).startsWith("@") ? await takeMedia(root, vars[k], footageDirs, `${id}-${k}`, mediaStamps, dry, lib) : bring(root, vars[k], "graphics", dry);
    }
    // every still and clip this graphic shows goes on the review sheet (work/stills.jpg), labelled with the words it shows
    for (const k of device.files || []) if (vars[k] && k !== "avatar" && !/^logo\d?$/.test(k)) stills.push({ file: path.join(root, vars[k]), label: stillLabel(g, k, vars) });

    if (dry) {
      hostTags.push(`<!-- ${id}: ${dev} -->`);
      continue;
    }
    let r;
    try {
      r = makeScene({ template: dev, project: root, as: id, theme: device.themes?.length ? theme : null, force: true,
        set: Object.entries(vars).map(([k, v]) => `${k}=${v}`), start, duration: dur, track: 1 });
    } catch (e) {
      throw new Stop(`${g.id} (${dev}): ${e.message}`);
    }
    for (const w of r.warnings) if (!/is empty: the template leaves it out/.test(w)) notes.push(`${g.id}: ${w}`);
    hostTags.push(r.host.replace("></div>", ` style="z-index:${z}"></div>`));
    const marked = markList(device, vars, r.values || {});
    if (marked.length && r.values?.[device.marks_on])
      boxes.push({ still: path.join(root, r.values[device.marks_on]), marks: marked,
        label: `${g.id} ${dev}: ${device.marks.map((m) => (m.label && vars[m.label]) || "").filter(Boolean).join(" / ") || g.anchor || ""}`.slice(0, 64) });
    if (device.ground) {
      let gr;
      try {
        gr = bakeGround(root, id, start, dur, device.ground, r.values || {}, cuts, groundStamps, dry);
      } catch (e) {
        throw new Stop(`${g.id} (${dev}): ${e.message}`);
      }
      if (gr) groundTags.push(gr.tag), gr.baked && baked++, gr.tween && rootTweens.push(gr.tween);
    }
    // a ground scene under a full-screen graphic (plan field `ground`: ground-A, ground-B, ground-D, ground-E, ground-F, ground-G)
    if (g.ground) {
      const gdev = String(g.ground);
      const gFile = path.join(TEMPLATES, gdev, "device.json");
      if (!fs.existsSync(gFile)) throw new Stop(`${g.id}: no ground "${gdev}" in gta-motion/templates`);
      const gd = readJson(gFile);
      if (gd.layer !== "ground") throw new Stop(`${g.id}: ${gdev} is not a ground. Use ground-A, ground-B, ground-D, ground-E, ground-F or ground-G.`);
      if (g.layer !== "fullscreen") throw new Stop(`${g.id}: a ground goes only under a full-screen graphic`);
      if (device.ground || declared("ground")) throw new Stop(`${g.id}: ${dev} already has its own ground; remove "ground" from this graphic`);
      const set = [`out=${dur}`];
      const recipeVars = { ...(gd.recipe_defaults || {}) };
      const wants = (k) => (gd.recipe || "").includes(k);
      let skyFrame = null;
      if (wants("{plate}")) {
        const under = cuts.find((c) => F(c.start) <= F(start) && F(start) < F(c.end));
        if (!under) throw new Stop(`${g.id}: ${gdev} blurs the shot under the graphic, and no shot plays at ${ts(start)}. Use ground-A, ground-B, ground-F or ground-G.`);
        Object.assign(recipeVars, { "{shot}": path.join(root, under.file), "{time}": floor4(fr(start) - fr(under.start)),
          "{plate}": path.join(root, "assets", "grounds", `${id}-plate.jpg`) });
        set.push(`plate=assets/grounds/${id}-plate.jpg`);
      }
      if (wants("{sky}")) {
        const dirs = [...new Set([...shots.filter((s) => !gameplayIds(s.src)).map((s) => path.dirname(path.resolve(root, s.src))), lib.dir])].filter((d) => d && fs.existsSync(d));
        let t1 = dirs.flatMap((d) => fs.readdirSync(d).map((f) => path.join(d, f))).find((f) => f.includes("QdBZY2fkU-0"));
        if (!t1 && !lib.client) throw new Stop(`${g.id}: ${gdev} is made from Trailer 1 (QdBZY2fkU-0), which isn't in the footage folder. Use another ground, add Trailer 1, or use the Algrow footage library (SETUP.md).`);
        if (!t1) {
          // Trailer 1 from the footage library: its frame at the recipe's time, as a still (the recipe then reads it without -ss)
          const at = (gd.recipe.match(TRAILER1_SS) || [])[1];
          if (!at) throw new Stop(`${g.id}: ${gdev}'s recipe doesn't read Trailer 1 as "-ss <seconds> -i {trailer1}", so the footage library can't give its frame`);
          t1 = path.join(os.tmpdir(), `gta-trailer1-${process.pid}.jpg`);
          skyFrame = { at, file: t1 };
        }
        Object.assign(recipeVars, { "{trailer1}": t1, "{tmp}": path.join(os.tmpdir(), `gta-sky-${process.pid}.png`),
          "{sky}": path.join(root, "assets", "grounds", "sky.jpg") });
        set.push("sky=assets/grounds/sky.jpg");
      }
      if (!dry) {
        const target = recipeVars["{plate}"] || recipeVars["{sky}"];
        const gkey = JSON.stringify([gdev, recipeVars["{shot}"] ? done[path.basename(recipeVars["{shot}"])] : null, recipeVars["{time}"] ?? null]);
        if (target && !(groundStamps[path.basename(target)] === gkey && fs.existsSync(target))) {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          if (skyFrame) {
            LB ??= letterboxes();
            await lib.client.get("frame", { src: "QdBZY2fkU-0", t: skyFrame.at, lb: LB["QdBZY2fkU-0"] || 0 }, skyFrame.file);
            try {
              runRecipe(gd.recipe.replace(TRAILER1_SS, '-i "{trailer1}"'), recipeVars, `${g.id} (${gdev})`);
            } finally {
              fs.rmSync(skyFrame.file, { force: true });
            }
          } else runRecipe(gd.recipe, recipeVars, `${g.id} (${gdev})`);
          groundStamps[path.basename(target)] = gkey;
          baked++;
        }
        let gr;
        try {
          gr = makeScene({ template: gdev, project: root, as: `${id}-ground`, theme: null, force: true, set, start, duration: dur, track: 2 });
        } catch (e) {
          throw new Stop(`${g.id} (${gdev}): ${e.message}`);
        }
        groundTags.push(gr.host.replace("></div>", ` style="z-index:5"></div>`));
      }
    }
  }
  if (!dry && groundTags.length) { fs.mkdirSync(path.dirname(groundFile), { recursive: true }); fs.writeFileSync(groundFile, JSON.stringify(groundStamps, null, 1)); }
  if (!dry && newGrounds) fs.writeFileSync(newGroundFile, JSON.stringify(newGroundStamps, null, 1));
  if (!dry && Object.keys(mediaStamps).length) fs.writeFileSync(mediaFile, JSON.stringify(mediaStamps, null, 1));

  // 4. transitions: the move is baked from the two shots around the cut, and played over the plain hard cut
  const transTags = [];
  const tStampFile = path.join(root, "assets", "transitions", "transitions.json");
  const tStamps = fs.existsSync(tStampFile) ? readJson(tStampFile) : {};
  for (const t of transitions) {
    const tid = `t${String(t.n).padStart(2, "0")}`;
    const lead = F(Number(t.device.cut || 0));
    const frames = F(t.device.duration?.default ?? 0.5);
    const startF = F(t.at) - lead;
    const a = cuts[t.ia], b = cuts[t.ib];
    if (startF < F(a.start)) throw new Stop(`transition at ${ts(t.at)}: ${t.dev} starts ${lead} frames before the cut; the outgoing shot is shorter`);
    if (F(b.end) - F(t.at) < frames - lead) throw new Stop(`transition at ${ts(t.at)}: the incoming shot is shorter than ${t.dev} (${frames - lead} frames)`);
    const window = path.join(root, "assets", "transitions", `${tid}.mp4`);
    const vars = { "{from}": path.join(root, a.file), "{from_in}": floor4((startF - F(a.start)) / 30), "{to}": path.join(root, b.file),
      "{to_in}": 0, "{window}": window };
    if (dry) continue;
    const key = JSON.stringify([t.dev, done[path.basename(a.file)], done[path.basename(b.file)], vars["{from_in}"]]);
    if (!(tStamps[`${tid}.mp4`] === key && fs.existsSync(window))) {
      fs.mkdirSync(path.dirname(window), { recursive: true });
      runRecipe(t.device.recipe, vars, `transition at ${ts(t.at)} (${t.dev})`);
      tStamps[`${tid}.mp4`] = key;
    }
    let r;
    try {
      r = makeScene({ template: t.dev, project: root, as: tid, theme: null, force: true, set: [], start: startF / 30, duration: frames / 30, track: 3 });
    } catch (e) {
      throw new Stop(`transition at ${ts(t.at)} (${t.dev}): ${e.message}`);
    }
    transTags.push(r.host.replace("></div>", ` style="z-index:6"></div>`));
  }
  if (!dry && transTags.length) fs.writeFileSync(tStampFile, JSON.stringify(tStamps, null, 1));

  // 5. sound
  if (!plan.voiceover) throw new Stop("the plan has no voiceover");
  const vo = bring(root, plan.voiceover, "audio", dry);
  const audioTags = [`<audio id="vo" class="clip" src="${vo}" data-start="0" data-duration="${r3(Math.min(duration, probeDuration(path.join(root, vo))))}"></audio>`];
  (plan.sfx || []).forEach((x, i) => {
    const f = bring(root, x.src, "sfx", dry);
    const d = probeDuration(path.join(root, f));
    audioTags.push(`<audio id="sfx${String(i + 1).padStart(2, "0")}" class="clip" src="${f}" data-start="${fr(x.at)}" ` +
      `data-duration="${r3(Math.min(d, duration - x.at))}"></audio>`);
  });

  const index = `<!doctype html>
<html lang="en" data-resolution="landscape">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="${GSAP}"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #000; }
      #main { position: relative; width: 1920px; height: 1080px; overflow: hidden; }
      #main > video.shot { position: absolute; inset: 0; width: 1920px; height: 1080px; object-fit: cover; z-index: 0; }
      #main > video.ground { position: absolute; inset: 0; width: 1920px; height: 1080px; object-fit: cover; z-index: 5; }
    </style>
  </head>
  <body>
    <!-- Built by gta-video/build_video.mjs from plan.json (${escAttr(theme)} theme). Change plan.json and build again. -->
    <div id="main" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="1920" data-height="1080">
      ${[...videoTags, ...groundTags, ...transTags, ...hostTags, ...audioTags].join("\n      ")}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      ${rootTweens.join("\n      ")}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
  // every file the video plays must be there: a missing one stops the render (VIDEO_SOURCE_UNRENDERABLE)
  const lost = dry ? [] : missingAssets(root, index);
  if (lost.length) {
    const ng = lost.some((x) => x.file.startsWith("assets/newgrounds/"));
    throw new Stop(`${lost.length} file(s) the video plays ${lost.length === 1 ? "isn't" : "aren't"} there, so it would not render ` +
      `(index.html not written):\n  ${lost.slice(0, 12).map((x) => `${x.file}  (in ${x.in})`).join("\n  ")}` +
      (lost.length > 12 ? `\n  ... and ${lost.length - 12} more` : "") +
      (ng ? "\nA new animation's ground (assets/newgrounds/<name>.mp4) is baked by the build when its animations/<name>/device.json " +
        "has \"ground_vf\" (gta-motion/new-animation.md): add it, or point the HTML at the file it bakes." : ""));
  }
  if (!dry) fs.writeFileSync(path.join(root, "index.html"), index);
  notes.push(...FLASH_NOTES.splice(0));
  if (!dry && stills.length && stillSheet(root, stills))
    notes.push(`work/stills.jpg: the ${stills.length} stills and clips the graphics show, each labelled with its words. Look at every one: the thing its words name must be the subject of the picture (gta-video step 6).`);
  if (!dry && boxes.length && boxSheet(boxes, path.join(root, "work", "boxes.jpg")))
    notes.push(`work/boxes.jpg: every box, lens and arrow on its frozen still, numbered as the voice names them. Look at each one: it sits on the thing the voice names, whole (gta-motion, find_box.mjs).`);
  return { project: root, shots: shots.length, cut, graphics: hostTags.length, grounds: groundTags.length + newGrounds, baked,
    transitions: transitions.length, sounds: audioTags.length,
    warnings: rep.warns.length, notes };
}

async function main(argv) {
  const a = { plan: null, dry: false, json: false, showcase: false };
  for (const x of argv) {
    if (x === "-h" || x === "--help") return console.log(USAGE), 0;
    if (x === "--dry-run") a.dry = true;
    else if (x === "--json") a.json = true;
    else if (x === "--test-showcase") a.showcase = true;
    else if (x.startsWith("--") || a.plan) return console.error(USAGE), 2;
    else a.plan = x;
  }
  if (!a.plan) return console.error(USAGE), 2;
  try {
    const r = await build(a.plan, { dry: a.dry, showcase: a.showcase });
    if (a.json) return console.log(JSON.stringify(r, null, 2)), 0;
    console.log(`${a.dry ? "would build" : "built"} ${r.project}`);
    console.log(`  ${r.shots} shots (${r.cut} cut now), ${r.graphics} graphics, ${r.grounds} grounds (${r.baked} baked now), ` +
      `${r.transitions} transitions, ${r.sounds} sound track(s); pacing warnings: ${r.warnings}`);
    for (const n of r.notes) console.log(`  note: ${n}`);
    if (!a.dry) {
      console.log("\nnext, from the project folder:");
      console.log("  npx -y hyperframes@0.9.53 check --json");
      console.log("  npx -y hyperframes@0.9.53 snapshot --at <a few graphic times>");
      console.log("  npx -y hyperframes@0.9.53 render -o out/video.mp4 --crf 16");
    }
    return 0;
  } catch (e) {
    if (!(e instanceof Stop || e instanceof LibraryError)) throw e;
    console.error(`build_video: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
