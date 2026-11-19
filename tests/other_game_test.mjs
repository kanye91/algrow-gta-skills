#!/usr/bin/env node
// Another game's official footage, end to end without the network: the channel list -> (no yt-dlp: the fallback exit)
// -> sheet -> find_shots pick -> build_video.
//
//     node tests/other_game_test.mjs
//
// It makes a project in a temp folder with a fake "official Red Dead Redemption 2 video" in footage/other/rdr2/, made
// with FFmpeg as official_video.mjs get leaves one (1920x1080, 30 fps, with sound, and its <id>.json): two letterboxed
// shots (110 px black bars), a black stretch, then a shot that fills the frame, with a yellow mark on its top edge.
// The sheet must find those cuts and page its frames 12 at a time; pick must pass the beats through with their "game"
// (and, with four of the five official GTA VI videos in the folder, use those four and name the one left out);
// the build must cut the shots at 1920x1080 30 fps without sound, the bars off where the shot has them and the full
// frame where it doesn't, and stop on a shot with no "game" or one that runs past the end of its file.
// Prints one line per check and exits 1 if any fails. The temp folder is removed at the end (--keep to look at it).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readChannels, gameNamed, gameOfTitle, idOf, measureBars, pieceBars, videoMeta, dirFor } from "../skills/gta-footage/official_video.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILLS = path.join(HERE, "..", "skills");
const OFFICIAL = path.join(SKILLS, "gta-footage", "official_video.mjs");
const keep = process.argv.includes("--keep");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gta-other-game-test-"));
const proj = path.join(tmp, "proj");
const ID = "AAAAAAAAAAA";
const rdr = path.join(proj, "footage", "other", "rdr2");
fs.mkdirSync(rdr, { recursive: true });
fs.mkdirSync(path.join(proj, "work"), { recursive: true });
fs.mkdirSync(path.join(proj, "assets"), { recursive: true });

let failed = 0;
const ok = (cond, what) => {
  console.log(`${cond ? "ok  " : "FAIL"}  ${what}`);
  if (!cond) failed++;
};
const run = (args, env = {}) => spawnSync(process.execPath, args, { cwd: proj, encoding: "utf8", env: { ...process.env, ...env } });
const ffmpeg = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
const writeJson = (p, d) => fs.writeFileSync(p, JSON.stringify(d, null, 1));
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const probeV = (f) => {
  const p = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_frames", "-of", "json", f], { encoding: "utf8" }));
  return { v: p.streams.find((s) => s.codec_type === "video"), audio: p.streams.some((s) => s.codec_type === "audio") };
};
/** A frame's rows as grey bytes, and its brightest pixel per row. */
const rowsOf = (file, at) => {
  const buf = execFileSync("ffmpeg", ["-v", "error", "-ss", String(at), "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 1 << 26 });
  return (y) => Math.max(...buf.subarray(y * 1920, (y + 1) * 1920));
};
const yellowAt = (file, at) => {
  const buf = execFileSync("ffmpeg", ["-v", "error", "-ss", String(at), "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 26 });
  let n = 0;
  for (let k = 0; k < buf.length; k += 3) if (buf[k] > 180 && buf[k + 1] > 180 && buf[k + 2] < 80) n++;
  return n;
};

try {
  // ---- the official channels: Rockstar's real channel, every game on a listed channel, titles read as get reads them
  const conf = readChannels();
  ok(conf.channels.rockstar?.id === "UC6VcWc1rAoWdBCM0JxrRQ3A" && conf.channels.rockstar.handle === "@RockstarGames",
    "official-channels.json: Rockstar Games is UC6VcWc1rAoWdBCM0JxrRQ3A (@RockstarGames)");
  ok(conf.games.every((g) => g.game && g.dir && g.channels.length && g.re.length && g.channels.every((k) => conf.channels[k]?.id)),
    `every game (${conf.games.length}) has its value, folder, title patterns and a listed channel`);
  const logos = (() => { try { return readJson(path.join(SKILLS, "..", "assets", "logos", "logos.json")).logos || []; } catch { return []; } })();
  const norm = (s) => String(s).toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "");
  ok(conf.games.every((g) => logos.some((l) => l.kind === "game" && (l.names || []).some((n) => norm(n) === norm(g.game)))),
    "every game's value is a name in assets/logos/logos.json (so its tag finds its logo)");
  ok(gameNamed("RDR2", conf)?.game === "Red Dead Redemption 2" && gameNamed("gta 6", conf)?.key === "gta6" && gameNamed("Cyberpunk 2077", conf) === null,
    "names: RDR2 is Red Dead Redemption 2, gta 6 is GTA VI, an unlisted game is none");
  const t = (title) => gameOfTitle(title, conf)?.game;
  ok(t("Red Dead Redemption 2 Launch Trailer") === "Red Dead Redemption 2" && t("Red Dead Redemption Official Launch Trailer") === "Red Dead Redemption" &&
    t("Grand Theft Auto V: The Official Trailer") === "Grand Theft Auto V" && t("Grand Theft Auto VI Trailer 1") === "Grand Theft Auto VI" &&
    t("Player-Created Jobs Inspired by Grand Theft Auto: Liberty City Stories (GTA Online Livestream)") === "GTA Online" &&
    t("Grand Theft Auto: Episodes from Liberty City  Meet: Luis Lopez") === "Grand Theft Auto IV: The Ballad of Gay Tony",
    "titles: RDR2, RDR, GTA V (not VI), GTA VI, a GTA Online livestream, a Gay Tony video");
  ok(idOf("https://www.youtube.com/watch?v=HVRzx17WHVk&t=3s") === "HVRzx17WHVk" && idOf("https://youtu.be/HVRzx17WHVk") === "HVRzx17WHVk" &&
    idOf("HVRzx17WHVk") === "HVRzx17WHVk" && idOf("not a video") === null, "ids from a link, a short link or the id itself");
  ok(gameNamed("gta6", conf).videos.join(" ") === "QdBZY2fkU-0 VQRLujxTm3c rz1B4B2yBZY tJbzMqJGH4k EiQEBYDox_k" &&
    dirFor(gameNamed("gta6", conf)).replace(/\\/g, "/") === "footage/gta6" && dirFor(gameNamed("RDR2", conf)).replace(/\\/g, "/") === "footage/other/rdr2",
    "get gta6 = the five official GTA VI videos of SETUP.md, into footage/gta6; RDR2 into footage/other/rdr2");

  // ---- without yt-dlp: a clear message and exit 3 (the skill falls back to asking for the file)
  let r = run([OFFICIAL, "find", "Red Dead Redemption 2"], { YTDLP: path.join(tmp, "no-such-yt-dlp") });
  ok(r.status === 3 && /yt-dlp isn't installed/.test(r.stderr) && /ask the user/.test(r.stderr), `no yt-dlp: exit 3 and the fallback (${r.status}) ${r.stderr.trim().slice(0, 80)}`);
  r = run([OFFICIAL, "get", "HVRzx17WHVk"], { YTDLP: path.join(tmp, "no-such-yt-dlp") });
  ok(r.status === 3 && /yt-dlp isn't installed/.test(r.stderr), `get without yt-dlp: exit 3 (${r.status})`);

  // ---- the fake official video, as get leaves it: 14 s, with sound
  const video = path.join(rdr, `${ID}.mp4`);
  const bars = "drawbox=x=0:y=0:w=1920:h=110:color=black:t=fill,drawbox=x=0:y=970:w=1920:h=110:color=black:t=fill";
  ffmpeg(["-f", "lavfi", "-i", "color=c=0x406080:s=1920x1080:r=30:d=4", "-f", "lavfi", "-i", "color=c=0xC09040:s=1920x1080:r=30:d=4",
    "-f", "lavfi", "-i", "color=c=black:s=1920x1080:r=30:d=0.5", "-f", "lavfi", "-i", "color=c=0x408060:s=1920x1080:r=30:d=5.5",
    "-f", "lavfi", "-i", "sine=f=440:d=14", "-filter_complex",
    `[0:v]${bars}[a];[1:v]${bars}[b];[3:v]drawbox=x=896:y=0:w=128:h=12:color=yellow:t=fill[d];[a][b][2:v][d]concat=n=4:v=1:a=0[v]`,
    "-map", "[v]", "-map", "4:a", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", video]);
  const lb = measureBars(video);
  ok(lb.bars === 112 && lb.share > 0.5 && lb.share < 0.7, `the letterbox: 110 px bars measured as 112 at 1080p (one row to spare), on part of the frames (got ${lb.bars}, ${lb.share})`);
  writeJson(path.join(rdr, `${ID}.json`), { id: ID, title: "Red Dead Redemption 2 Test Trailer", game: "Red Dead Redemption 2", channel: "Rockstar Games",
    channel_id: "UC6VcWc1rAoWdBCM0JxrRQ3A", url: `https://www.youtube.com/watch?v=${ID}`, upload_date: "2018-10-18", duration: 14, width: 1920,
    height: 1080, fps: 30, codec: "h264", bars: lb.bars, bars_share: lb.share, by: "official_video.mjs" });
  ok(videoMeta(video)?.game === "Red Dead Redemption 2", "videoMeta reads the <id>.json next to the video");
  ok(pieceBars(video, 0.5, 3) === 112 && pieceBars(video, 9, 3) === 0, "a letterboxed piece gets the bars cut, a full-frame piece none");

  // ---- the sheet: the cuts (a colour change, both ends of the black stretch), frames 12 to a page in 3 columns
  r = run([OFFICIAL, "sheet", `footage/other/rdr2/${ID}.mp4`, "--every", "1"]);
  ok(r.status === 0, `sheet exits 0 (${r.status}) ${r.status ? r.stderr : ""}`);
  const sheetDir = path.join(proj, "work", "sheets", ID);
  const idx = fs.existsSync(path.join(sheetDir, "index.json")) ? readJson(path.join(sheetDir, "index.json")) : { cuts: [], shots: [], frames: [] };
  const near = (a, b) => Math.abs(a - b) <= 0.1;
  ok(idx.cuts.length === 3 && near(idx.cuts[0], 4) && near(idx.cuts[1], 8) && near(idx.cuts[2], 8.5), `cuts at 4, 8 and 8.5 s (got ${idx.cuts.join(", ")})`);
  ok(idx.shots.length === 3 && near(idx.shots[2].a, 8.5) && near(idx.shots[2].b, 14), `3 shots, the black stretch left out (got ${JSON.stringify(idx.shots)})`);
  ok(idx.frames.length === 14 && idx.frames.every((f) => f.page === (f.n <= 12 ? 1 : 2)), `--every 1: 14 frames, 12 on page 1 and 2 on page 2 (got ${idx.frames.length})`);
  const dims = (f) => execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", f], { encoding: "utf8" }).trim();
  const p1 = path.join(sheetDir, "page-01.jpg"), p2 = path.join(sheetDir, "page-02.jpg");
  ok(fs.existsSync(p1) && fs.existsSync(p2) && !fs.existsSync(path.join(sheetDir, "page-03.jpg")) && dims(p1) === "1952,1808" && dims(p2) === "1952,494",
    `two pages, 3 frames of 640 px across, 4 rows then 1 (got ${fs.existsSync(p1) ? dims(p1) : "-"} / ${fs.existsSync(p2) ? dims(p2) : "-"})`);
  ok(/3 cuts, 3 shots/.test(r.stdout) && /page-01\.jpg {2}#1-#12/.test(r.stdout) && /8\.50-14\.00 \(5\.5 s\)/.test(r.stdout), "it prints the pages and the long shots");

  // ---- find_shots pick: the beats of another game pass through as shots, "game" from the file when left out
  const src = `footage/other/rdr2/${ID}.mp4`;
  const beats = [
    { start: 0, end: 3.5, type: "show", src, in: 0.2, game: "Red Dead Redemption 2", line: "Red Dead 2 had a camp" },
    { start: 3.5, end: 7.0, type: "show", src, in: 4.3, line: "and a horse you bond with" },
    { start: 7.0, end: 11.0, type: "show", src, in: 9.0, game: "Red Dead Redemption 2", line: "and a whole frontier" },
  ];
  writeJson(path.join(proj, "work", "beats.json"), beats);
  r = run([path.join(SKILLS, "gta-footage", "find_shots.mjs"), "pick", "work/beats.json", "--out", "work/shots.json"]);
  ok(r.status === 0, `pick exits 0 with no --footage when every beat is another game's file (${r.status}) ${r.status ? r.stdout + r.stderr : ""}`);
  const shots = fs.existsSync(path.join(proj, "work", "shots.json")) ? readJson(path.join(proj, "work", "shots.json")) : [];
  ok(shots.length === 3 && shots.every((s) => s.src === src && s.game === "Red Dead Redemption 2" && s.kind === "other") && shots[1].in === 4.3,
    `3 shots of the file, each with its game (the second from the file's <id>.json) and its in (got ${JSON.stringify(shots[1])})`);
  ok(/3 of another game/.test(r.stdout) && /beat 1 .*other AAAAAAAAAAA\.mp4/.test(r.stdout), "the report lists them");
  const late = [{ ...beats[0] }, { ...beats[1], in: 12.0 }, { ...beats[2], in: 0.5 }];
  writeJson(path.join(proj, "work", "late.json"), late);
  r = run([path.join(SKILLS, "gta-footage", "find_shots.mjs"), "pick", "work/late.json", "--out", "work/late_shots.json"]);
  ok(r.status === 1 && /beat 1 at 3\.5s: other game's footage not used: .*14\.00 s; from "in" 12\.00 the beat needs 3\.50 s/.test(r.stdout) &&
    /beat 2 .*same moment of AAAAAAAAAAA\.mp4 as beat 0/.test(r.stdout) && /CHECK beats? .*2/.test(r.stdout),
    `a beat past the end of the file has no shot (exit 1); the same moment twice gets a CHECK (${r.status})`);

  // ---- four of the five official GTA VI videos (get gta6 can't fetch the Extended Look: YouTube's age check): pick
  // uses the four and says which one it left out (empty stand-in files: pick reads only their names)
  const gta6 = path.join(proj, "footage", "gta6");
  fs.mkdirSync(gta6, { recursive: true });
  for (const id of ["QdBZY2fkU-0", "VQRLujxTm3c", "rz1B4B2yBZY", "EiQEBYDox_k"]) fs.writeFileSync(path.join(gta6, `${id}.mp4`), "");
  writeJson(path.join(proj, "work", "four.json"), [0, 1, 2].map((k) => ({ start: 2.5 * k, end: 2.5 * k + 2.5, type: "broll", place: "any" })));
  r = run([path.join(SKILLS, "gta-footage", "find_shots.mjs"), "pick", "work/four.json", "--footage", "footage/gta6", "--out", "work/four_shots.json"]);
  const four = fs.existsSync(path.join(proj, "work", "four_shots.json")) ? readJson(path.join(proj, "work", "four_shots.json")) : [];
  ok(r.status === 0 && /Not in footage\/gta6, so not used: Grand Theft Auto VI: An Extended Look \(tJbzMqJGH4k\)/.test(r.stdout) && four.length === 3 &&
    four.every((s) => /footage[\\/]gta6/.test(s.src) && !s.src.includes("tJbzMqJGH4k")) && !/Missing footage/.test(r.stdout),
    `four of the five videos: pick uses them, says the Extended Look was left out, nothing missing (${r.status}, ${four.length} shots)`);
  fs.rmSync(gta6, { recursive: true, force: true });

  // ---- build: a plan of those shots, with the game's tag over them (R13)
  ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "11", path.join(proj, "assets", "voiceover.wav")]);
  fs.mkdirSync(path.join(proj, "logos"));   // the game's logo for its tag: the plan's own folder (the repo's logos aren't in git)
  ffmpeg(["-f", "lavfi", "-i", "color=c=white:s=400x150", "-frames:v", "1", "-pix_fmt", "rgba", path.join(proj, "logos", "rdr2.png")]);
  writeJson(path.join(proj, "logos", "logos.json"), { logos: [{ file: "rdr2.png", names: ["Red Dead Redemption 2"], kind: "game" }] });
  const plan = {
    version: 1, theme: "clean", fps: 30, duration: 11, voiceover: "assets/voiceover.wav", logos: "logos",
    shots: shots.map(({ start, end, src: s, in: at, game }) => ({ start, end, src: s, in: at, game })),
    graphics: [
      { id: "g01", device: "keyword-A2", layer: "overlay", start: 0.2, end: 2.2, reason: "keyword", anchor: "Red Dead 2", text: ["RED DEAD 2"],
        vars: { word: "RED DEAD 2", at: 0 }, enter: 0.33, exit: 0.23 },
      { id: "g02", device: "gametag-A", layer: "tag", start: 2.3, end: 11, reason: "name", anchor: "Red Dead 2",
        vars: { game: "Red Dead Redemption 2", width: 400 }, enter: 0.47, exit: 0.23 },
    ],
  };
  writeJson(path.join(proj, "plan.json"), plan);
  r = run([path.join(SKILLS, "gta-video", "build_video.mjs"), "plan.json"]);
  ok(r.status === 0, `build_video builds the plan (${r.status}) ${r.status ? r.stdout + r.stderr : ""}`);
  ok(/3 shot\(s\) of other games' official videos \(footage\/other\/\): 3 Red Dead Redemption 2/.test(r.stdout), "the build notes the other game's shots");
  const foot = path.join(proj, "assets", "footage");
  for (let i = 1; i <= 3; i++) {
    const f = path.join(foot, `s00${i}.mp4`);
    const { v, audio } = fs.existsSync(f) ? probeV(f) : { v: {}, audio: true };
    const want = Math.round((plan.shots[i - 1].end - plan.shots[i - 1].start) * 30) + 2;
    ok(v.width === 1920 && v.height === 1080 && v.r_frame_rate === "30/1" && !audio && Number(v.nb_frames) === want,
      `s00${i}.mp4: 1920x1080, 30 fps, no sound, ${want} frames (got ${v.width}x${v.height} ${v.r_frame_rate} ${v.nb_frames}${audio ? ", sound" : ""})`);
  }
  if (fs.existsSync(path.join(foot, "s003.mp4"))) {
    const a = rowsOf(path.join(foot, "s001.mp4"), 1), b = rowsOf(path.join(foot, "s002.mp4"), 1), c = rowsOf(path.join(foot, "s003.mp4"), 1);
    ok(a(0) > 40 && a(1079) > 40 && b(0) > 40 && b(1079) > 40, `letterboxed shots: the bars cut off, picture to the top and bottom edges (rows ${a(0)} ${a(1079)}, ${b(0)} ${b(1079)})`);
    const y = yellowAt(path.join(foot, "s003.mp4"), 1);
    ok(c(0) > 40 && y > 1200 && y < 1800, `the full-frame shot: not cropped, its top-edge mark whole (yellow ${y} px)`);
  }
  // shots with no "game" (and no tag, so the pacing check sees GTA VI footage and passes), one of them past the end of
  // its file: the build stops and names each
  const bad = structuredClone(plan);
  for (const sh of bad.shots) delete sh.game;
  bad.shots[2].in = 12;
  bad.graphics = bad.graphics.filter((g) => g.layer !== "tag");
  writeJson(path.join(proj, "plan_bad.json"), bad);
  r = run([path.join(SKILLS, "gta-video", "build_video.mjs"), "plan_bad.json"]);
  ok(r.status === 1 && /4 problems with other games' shots/.test(r.stderr) && /shot 2 \(00:03\.5\) plays Red Dead Redemption 2 footage .*set its "game" to "Red Dead Redemption 2"/.test(r.stderr) &&
    /shot 3 \(00:07\.0\): footage\/other\/rdr2\/AAAAAAAAAAA\.mp4 is 14\.00 s long; from "in" 12 the shot needs 4\.00 s/.test(r.stderr),
    `no "game", or past the end of the file: the build stops and names each (${r.status}) ${r.stderr.trim().slice(0, 160)}`);
} catch (e) {
  failed++;
  console.log(`FAIL  ${e.stack || e}`);
} finally {
  if (keep) console.log(`kept: ${tmp}`);
  else fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall other-game checks passed");
process.exitCode = failed ? 1 : 0;
