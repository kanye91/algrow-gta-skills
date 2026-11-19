#!/usr/bin/env node
// Official videos of other games (and the five GTA VI ones), from the publisher's own YouTube channel, downloaded on
// the user's computer with yt-dlp (an outside program, like FFmpeg). When the voice talks about another game ("RDR2 vs
// GTA 6"), that game's own footage goes on screen: find its official videos, get one or two, look at the sheet, and
// give the beat a shot of that file ("src", "in", "game").
//
//   node <skills>/skills/gta-footage/official_video.mjs check
//       is yt-dlp there, with what YouTube needs (yt-dlp-ejs and a JavaScript runtime: Deno, or this Node.js)
//   node <skills>/skills/gta-footage/official_video.mjs find "<game>" [--query "words"] [--limit 20] [--json]
//       the game's official videos, searched on its channels in official-channels.json only: id, length, year, title
//   node <skills>/skills/gta-footage/official_video.mjs get <id or url>... [--game "<game>"] [--dir footage/other/<dir>]
//   node <skills>/skills/gta-footage/official_video.mjs get gta6 [--dir footage/gta6]
//       downloads each to <dir>/<id>.mp4 (the best picture up to 1080p, no sound: the build mutes footage) with a small
//       <id>.json (title, channel, url, date, game, letterbox). A video that isn't from an official channel is refused.
//       Files already there are kept. `gta6` = the five official GTA VI videos (SETUP.md, A).
//   node <skills>/skills/gta-footage/official_video.mjs sheet <file> [--every 5] [--from S] [--to S] [--out work/sheets/<id>]
//       finds the cuts (FFmpeg's scene detection) and writes contact-sheet pages of 12 frames at most (3 columns),
//       each frame labelled with its time in the file and its shot's span: pick the shot that shows what the words say
//   node <skills>/skills/gta-footage/official_video.mjs games
//   node <skills>/skills/gta-footage/official_video.mjs channel <@handle or channel url>
//       a channel's real id and name, read with yt-dlp: the line to add to official-channels.json for a new publisher
//
// Run it from the project folder. Exit 0 = done, 1 = refused or failed (the message says why), 2 = bad usage,
// 3 = yt-dlp isn't installed: fall back to asking the user for the file (gta-footage/SKILL.md).
// No cookies and no sign-in are ever used: a video YouTube only shows to signed-in users (an age check) is refused.
// The downloads stay in the project's footage/ folder: never commit, upload or share them. Node 22+, FFmpeg, yt-dlp.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONT = path.join(HERE, "..", "gta-motion", "fonts", "Inter-Variable.ttf");
export const CHANNELS_FILE = path.join(HERE, "official-channels.json");
export const OTHER_DIR = path.join("footage", "other");   // in the project folder: footage/other/<game dir>/<id>.mp4
const YTDLP = process.env.YTDLP || "yt-dlp";
// The best picture up to 1080p, video only. Sorted SDR first (an HDR copy would come out washed out: the build doesn't
// tone-map), then the highest resolution up to 1080p, then the highest bitrate.
const FORMAT = "bv*[height<=1080]/b[height<=1080]";
const SORT = "+hdr,res:1080,tbr";
const PER_PAGE = 12, COLS = 3;
const BAR_LUMA = 24;     // a row whose brightest pixel is at most this is black
const BAR_MIN = 0.033;   // fewer black rows than 3.3 % of the height: a dark frame, not a letterbox

export class Bad extends Error {
  constructor(msg, code = 1) {
    super(msg);
    this.code = code;
  }
}
export const MISSING = "yt-dlp isn't installed, so official videos can't be downloaded on this computer. Install it " +
  "(SETUP.md, \"Other games' official videos\": winget install -e --id yt-dlp.yt-dlp on Windows, brew install yt-dlp on " +
  "macOS), or ask the user for that game's official video file. Without one: background footage, plus the game's logo.";

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, ""));
const r2 = (x) => Math.round(Number(x) * 100) / 100;
const norm = (s) => String(s || "").toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "");
const mmss = (s) => (Number.isFinite(Number(s)) ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "?");
/** Never show a signed link: keep the address, drop its query string. */
const redact = (s) => String(s).replace(/(https?:\/\/[^\s?"'<>]+)\?[^\s"'<>]*/g, "$1?<signed>");

// ---------------------------------------------------------------- the official channels

/** official-channels.json: the channels (key -> {name, id, handle...}) and the games, each with its title patterns. */
export function readChannels(file = CHANNELS_FILE) {
  const j = readJson(file);
  const channels = j.channels || {};
  const games = (j.games || []).map((g) => ({ ...g, re: (g.titles || []).map((t) => new RegExp(t, "i")) }));
  for (const g of games) {
    for (const k of g.channels || []) if (!channels[k]?.id) throw new Bad(`${path.basename(file)}: ${g.game} names the channel "${k}", which isn't in "channels"`);
  }
  return { channels, games };
}
/** The game a name means ("RDR2", "Red Dead 2", "gta6"), or null. */
export function gameNamed(name, conf = readChannels()) {
  const want = norm(name);
  return conf.games.find((g) => [g.game, g.key, g.dir, ...(g.names || [])].some((n) => n && norm(n) === want)) || null;
}
/** The first game whose title pattern a video title matches, or null. */
export const gameOfTitle = (title, conf = readChannels()) => conf.games.find((g) => g.re.some((re) => re.test(String(title || "")))) || null;
const channelIds = (g, conf) => (g.channels || []).map((k) => conf.channels[k].id);
/** Where a game's videos go in the project: footage/gta6 for GTA VI, footage/other/<dir> for the others. */
export const dirFor = (g) => (g.key === "gta6" ? path.join("footage", "gta6") : path.join(OTHER_DIR, g.dir || norm(g.game)));

// ---------------------------------------------------------------- yt-dlp

/** yt-dlp's own config is ignored (the same result on every computer), and it gets this Node.js as a JavaScript runtime
 *  for YouTube's challenges: Deno, its default, still comes first when it is installed (yt-dlp wiki, EJS). */
const ytBase = () => ["--ignore-config", "--js-runtimes", `node:${process.execPath}`, "--socket-timeout", "30"];
function runYt(args) {
  const r = spawnSync(YTDLP, [...ytBase(), ...args], { encoding: "utf8", maxBuffer: 1 << 28, windowsHide: true });
  if (r.error?.code === "ENOENT") throw new Bad(MISSING, 3);
  if (r.error) throw new Bad(`yt-dlp didn't run: ${r.error.message}`);
  return r;
}
export function ytdlpVersion() {
  const r = runYt(["--version"]);
  const v = String(r.stdout || "").trim().split(/\s+/)[0];
  if (r.status !== 0 || !v) throw new Bad(MISSING, 3);
  return v;
}
/** yt-dlp's error in plain words, without its advice to pass cookies (these skills never use any). */
export function ytError(stderr) {
  const text = String(stderr || "");
  if (/confirm your age|age[- ]restricted|inappropriate for some users/i.test(text))
    return "YouTube shows this video only to signed-in users (an age check), and these skills never sign in: ask the user " +
      "for their own copy of it, or pick another video";
  if (/not a bot/i.test(text)) return "YouTube asked this computer to prove it isn't a bot: try again later or on another network, or ask the user for the file";
  if (/private video|video unavailable|has been removed|no longer available|account associated with this video has been terminated/i.test(text))
    return "YouTube says this video isn't available";
  const line = text.split(/\r?\n/).find((l) => /^ERROR:/.test(l)) || text.trim().split(/\r?\n/).pop() || "no output";
  return redact(line.replace(/^ERROR:\s*/, "").replace(/\s*(Use|See|Also see)\s+--?cookies.*$/i, "").replace(/\s*See\s+https?:\S+.*$/i, "")).slice(0, 240);
}

/** What this computer has for the downloads: yt-dlp, its JavaScript runtime(s), yt-dlp-ejs, FFmpeg. */
export function checkTools() {
  const version = ytdlpVersion();
  const r = runYt(["-v"]);   // no URL: it prints its debug header, then stops
  const head = `${r.stderr || ""}\n${r.stdout || ""}`;
  const runtimes = ((head.match(/JS runtimes:\s*([^\r\n]+)/) || [])[1] || "").trim();
  const ejs = (head.match(/yt_dlp_ejs-([\w.]+)/) || [])[1] || null;
  const ff = spawnSync("ffmpeg", ["-version"], { encoding: "utf8", windowsHide: true });
  return { version, runtimes: runtimes && runtimes !== "none" ? runtimes : null, ejs, ffmpeg: ff.status === 0 };
}

// ---------------------------------------------------------------- find

/** The game's official videos on its channels, in YouTube's search order: [{id, title, duration, year, channel}]. Only
 *  that channel's own uploads whose title names the game; Shorts and live streams left out. */
export function findVideos(name, { query = "", limit = 20, conf = readChannels() } = {}) {
  const g = gameNamed(name, conf);
  if (!g) throw new Bad(`"${name}" isn't in official-channels.json. Its games: ${conf.games.map((x) => x.game).join(", ")}. ` +
    "For another game, add its publisher's channel (official_video.mjs channel @handle) and the game, or ask the user for its official video.");
  ytdlpVersion();
  const words = [g.search || g.game, query].filter(Boolean).join(" ");
  const videos = [], left = { game: 0, shorts: 0, live: 0, foreign: 0 }, seen = new Set();
  for (const key of g.channels) {
    const ch = conf.channels[key];
    const url = `https://www.youtube.com/channel/${ch.id}/search?query=${encodeURIComponent(words)}`;
    const r = runYt(["--flat-playlist", "-J", "--extractor-args", "youtubetab:approximate_date", "-I", `1:${Math.min(150, limit * 3 + 10)}`, url]);
    if (r.status !== 0) throw new Bad(`yt-dlp couldn't search ${ch.name}'s channel: ${ytError(r.stderr)}`);
    let list;
    try {
      list = JSON.parse(r.stdout).entries || [];
    } catch {
      throw new Bad(`yt-dlp's answer for ${ch.name}'s channel isn't readable`);
    }
    for (const e of list) {
      if (videos.length >= limit) break;
      if (!e || e._type === "playlist" || !/^[A-Za-z0-9_-]{11}$/.test(String(e.id || "")) || seen.has(e.id)) continue;   // the channel's playlists
      seen.add(e.id);
      if (e.channel_id !== ch.id) { left.foreign++; continue; }                                   // only the channel's own uploads
      if (/\/shorts\//.test(String(e.url || ""))) { left.shorts++; continue; }                     // vertical: never fills the frame
      if (["is_live", "is_upcoming", "post_live"].includes(e.live_status)) { left.live++; continue; }
      // another game's video: its title must name this game first, as get reads it ("Jobs inspired by Liberty City
      // Stories (GTA Online livestream)" is GTA Online footage)
      if (gameOfTitle(e.title, conf) !== g) { left.game++; continue; }
      const d = String(e.upload_date || ""), ts = Number(e.timestamp);
      videos.push({ id: e.id, title: String(e.title || ""), duration: e.duration ?? null,
        year: /^\d{8}$/.test(d) ? d.slice(0, 4) : ts > 0 ? String(new Date(ts * 1000).getUTCFullYear()) : null,
        channel: ch.name, url: `https://www.youtube.com/watch?v=${e.id}` });
    }
  }
  return { game: g, words, videos, left };
}

// ---------------------------------------------------------------- get

/** The YouTube id in an id or a link, or null. */
export function idOf(x) {
  const s = String(x || "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/** ffprobe a video: its size, frame rate, length and codec, or null when it isn't a readable video. */
export function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries",
    "stream=width,height,r_frame_rate,codec_name:format=duration", "-of", "json", file], { encoding: "utf8", windowsHide: true });
  try {
    const j = JSON.parse(r.stdout), s = (j.streams || [])[0], dur = Number(j.format?.duration);
    if (!s || !(dur > 0)) return null;
    const [a, b] = String(s.r_frame_rate || "0/1").split("/").map(Number);
    return { width: s.width, height: s.height, fps: b ? r2(a / b) : 0, duration: r2(dur), codec: s.codec_name };
  } catch {
    return null;
  }
}

/** The description get wrote next to a downloaded video (<id>.json), or null for any other file. */
export function videoMeta(file) {
  try {
    const p = path.join(path.dirname(file), `${path.basename(file).replace(/\.[^.]+$/, "")}.json`);
    const m = readJson(p);
    return m && m.id && m.channel_id ? m : null;
  } catch {
    return null;
  }
}

/** A downloaded copy of the video already in the project: <dir>/<id>.mp4 with its <id>.json, readable. */
function already(id, dirs) {
  for (const d of dirs) {
    const f = path.join(d, `${id}.mp4`);
    if (fs.existsSync(f) && videoMeta(f) && probe(f)) return f;
  }
  return null;
}
const subdirs = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(d, e.name)) : []);

/** Download the official videos. `items`: ids, links, or a game's key word ("gta6": its official videos). */
export async function getVideos(items, { game = null, dir = null, conf = readChannels(), log = console.log } = {}) {
  const forced = game ? gameNamed(game, conf) : null;
  if (game && !forced) throw new Bad(`--game "${game}" isn't in official-channels.json (official_video.mjs games lists them)`);
  const jobs = [];
  for (const x of items) {
    const byKey = conf.games.find((g) => g.videos?.length && (norm(g.key) === norm(x) || norm(g.game) === norm(x)));
    if (byKey) for (const id of byKey.videos) jobs.push({ id, g: byKey });
    else {
      const id = idOf(x);
      if (!id) throw new Bad(`"${x}" is not a YouTube id or link`);
      jobs.push({ id, g: forced || conf.games.find((g) => g.videos?.includes(id)) || null });
    }
  }
  ytdlpVersion();
  const res = { got: [], kept: [], refused: [], failed: [] };
  for (const { id, g } of jobs.filter((j, k) => jobs.findIndex((y) => y.id === j.id) === k)) {
    const here = already(id, dir ? [dir] : g ? [dirFor(g)] : [path.join("footage", "gta6"), ...subdirs(OTHER_DIR)]);
    if (here) {
      const m = videoMeta(here);
      res.kept.push({ id, file: here, meta: m });
      log(`${id}  already here: ${here} (${m.title})`);
      continue;
    }
    // 1. what the video is, and whose: only an official channel's own upload is downloaded
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "official-video-"));
    try {
      const url = `https://www.youtube.com/watch?v=${id}`;
      const r = runYt(["-J", "--no-playlist", url]);
      if (r.status !== 0) {
        const why = ytError(r.stderr);
        (/signed-in|isn't available/.test(why) ? res.refused : res.failed).push({ id, why });
        log(`${id}  NOT downloaded: ${why}`);
        continue;
      }
      let info;
      try {
        info = JSON.parse(r.stdout);
      } catch {
        res.failed.push({ id, why: "yt-dlp's answer isn't readable" });
        continue;
      }
      const ch = Object.values(conf.channels).find((c) => c.id === info.channel_id);
      const title = String(info.title || "");
      const refuse = (why) => (res.refused.push({ id, title, why }), log(`${id}  REFUSED: "${title}": ${why}`));
      if (!ch) {
        refuse(`it is from ${info.channel || "an unknown channel"} (${info.channel_id || "no channel id"}), not an official channel in ` +
          "official-channels.json. Only the publisher's own uploads are used: never a fan upload or a re-upload");
        continue;
      }
      const game2 = g || gameOfTitle(title, conf);
      if (!game2) {
        refuse(`its title names none of the games in official-channels.json: say which game it shows with --game "<game>"`);
        continue;
      }
      if (!channelIds(game2, conf).includes(info.channel_id)) {
        refuse(`${game2.game}'s official channel is ${game2.channels.map((k) => conf.channels[k].name).join(" or ")}, not ${ch.name}`);
        continue;
      }
      const read = gameOfTitle(title, conf);
      if (g && read && read !== g) log(`${id}  note: its title reads as ${read.game}; kept as ${g.game}, as asked. Check that it shows ${g.game}.`);
      if (info.is_live || ["is_live", "is_upcoming"].includes(info.live_status)) {
        refuse("it is a live stream or not out yet");
        continue;
      }
      if (Number(info.width) > 0 && Number(info.height) > Number(info.width)) {
        refuse("it is vertical (a Short): it can't fill the 16:9 frame");
        continue;
      }
      // 2. the download: from the description just read (not read again), the best picture up to 1080p, as mp4
      const folder = dir || dirFor(game2);
      fs.mkdirSync(folder, { recursive: true });
      const infoFile = path.join(tmp, "info.json");
      fs.writeFileSync(infoFile, r.stdout);
      const out = path.resolve(folder, `${id}.mp4`);
      log(`${id}  downloading "${title}" (${mmss(info.duration)}, ${ch.name}) into ${folder}...`);
      const dl = await download(infoFile, path.resolve(folder), id, log);
      if (!dl.ok || !fs.existsSync(out)) {
        const why = dl.ok ? "the download didn't come out as an mp4 file" : dl.why;
        res.failed.push({ id, title, why });
        log(`${id}  FAILED: ${why}`);
        continue;
      }
      const p = probe(out);
      if (!p) {
        res.failed.push({ id, title, why: "the file isn't a readable video" });
        fs.rmSync(out, { force: true });
        continue;
      }
      const lb = measureBars(out, p);
      const d = String(info.upload_date || "");
      const meta = {
        id, title, game: game2.game, channel: info.channel || ch.name, channel_id: info.channel_id, url,
        upload_date: /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : null,
        duration: p.duration, width: p.width, height: p.height, fps: p.fps, codec: p.codec,
        bars: lb.bars,               // letterbox, px at 1080p top and bottom each (0 = none): the build cuts it off
        bars_share: lb.share,        // the share of the sampled frames that show it
        size_mb: r2(fs.statSync(out).size / 1e6), downloaded: new Date().toISOString().slice(0, 10), by: "official_video.mjs",
      };
      fs.writeFileSync(path.join(folder, `${id}.json`), JSON.stringify(meta, null, 1));
      res.got.push({ id, file: path.join(folder, `${id}.mp4`), meta });
      log(`${id}  downloaded: ${path.join(folder, `${id}.mp4`)} (${mmss(p.duration)}, ${p.width}x${p.height} ${p.fps} fps ${p.codec}, ` +
        `${meta.size_mb} MB${lb.bars ? `, letterbox ${lb.bars} px at 1080p: cut off in the video` : ""})`);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });   // the description holds signed links: never kept
    }
  }
  return res;
}

/** yt-dlp downloads one video from its description file into `folder`/<id>.mp4, printing its progress every 5 s. */
function download(infoFile, folder, id, log) {
  const tpl = path.join(folder.replace(/%/g, "%%"), `${id}.%(ext)s`);
  const args = [...ytBase(), "--load-info-json", infoFile, "-f", FORMAT, "-S", SORT, "--remux-video", "mp4", "-N", "4",
    "--no-mtime", "--no-playlist", "--retries", "5", "--fragment-retries", "10", "--newline", "--progress-delta", "5", "-o", tpl];
  return new Promise((ok) => {
    let err = "", buf = "";
    const p = spawn(YTDLP, args, { windowsHide: true });
    p.on("error", (e) => ok({ ok: false, why: e.code === "ENOENT" ? MISSING : e.message }));
    const line = (l) => {
      if (/^\[download\]\s+\d/.test(l) && !/100%|100\.0%/.test(l)) log(`  ${l.replace(/^\[download\]\s+/, "")}`);
    };
    p.stdout.on("data", (d) => {
      buf += d;
      const parts = buf.split(/\r?\n/);
      buf = parts.pop();
      parts.forEach(line);
    });
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => ok(code === 0 ? { ok: true } : { ok: false, why: ytError(err) }));
  });
}

// ---------------------------------------------------------------- letterbox

/** One frame in grey, or null. */
function grey(file, t, W, H) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-threads", "4", "-ss", String(r2(Math.max(0, t))), "-i", file, "-frames:v", "1",
    "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: W * H * 2 + 1024, windowsHide: true });
  return r.status === 0 && r.stdout && r.stdout.length >= W * H ? r.stdout : null;
}
/** A frame's black rows at the top and the bottom (the fewer of the two), in px at the file's height; null when the frame
 *  is (nearly) black or unreadable. */
function frameBars(file, t, W, H) {
  const buf = grey(file, t, W, H);
  if (!buf) return null;
  const black = (y) => {
    for (let x = 0; x < W; x++) if (buf[y * W + x] > BAR_LUMA) return false;
    return true;
  };
  const cap = Math.floor(H * 0.3);
  let top = 0, bottom = 0;
  while (top < cap && black(top)) top++;
  while (bottom < cap && black(H - 1 - bottom)) bottom++;
  if (top >= cap && bottom >= cap) return null;
  return Math.min(top, bottom);
}

/** A video's letterbox: 24 frames from 5 % to 95 % of it; the bar height most of the barred frames share (darker frames
 *  only add black rows), when at least 40 % of the lit frames show it. In px at 1080p (one row to spare, even), or 0. */
export function measureBars(file, p = probe(file)) {
  if (!p) return { bars: 0, share: 0 };
  const W = p.width, H = p.height, N = 24, vals = [];
  let lit = 0;
  for (let k = 0; k < N; k++) {
    const b = frameBars(file, p.duration * (0.05 + (0.9 * k) / (N - 1)), W, H);
    if (b === null) continue;
    lit++;
    if (b >= H * BAR_MIN) vals.push(b);
  }
  const share = lit ? r2(vals.length / lit) : 0;
  if (!lit || vals.length < Math.max(3, 0.4 * lit)) return { bars: 0, share };
  vals.sort((a, b) => a - b);
  let best = vals[0], most = 0;
  for (const v of vals) {
    const n = vals.filter((x) => Math.abs(x - v) <= 4).length;
    if (n > most) (most = n), (best = v);
  }
  const m = Math.min(...vals.filter((x) => Math.abs(x - best) <= 4));
  return { bars: Math.ceil(((m + 1) * 1080) / H / 2) * 2, share };
}

const PIECES = new Map();
/** The letterbox to cut off a piece of a downloaded video (px at 1080p): the video's own (its <id>.json) when the
 *  piece's frames show it, at its start, middle and end; 0 for a piece that fills the frame, or a file get didn't write. */
export function pieceBars(file, at, dur, meta = videoMeta(file)) {
  const bars = Number(meta?.bars) || 0;
  if (!(bars > 0)) return 0;
  const key = `${file}|${r2(at)}|${r2(dur)}|${bars}`;
  if (PIECES.has(key)) return PIECES.get(key);
  const p = meta.width && meta.height ? { width: meta.width, height: meta.height } : probe(file);
  let out = 0;
  if (p) {
    const need = (bars * p.height) / 1080 - 4;
    const seen = [at + 0.1, at + dur / 2, at + Math.max(0.1, dur - 0.1)].map((t) => frameBars(file, t, p.width, p.height)).filter((b) => b !== null);
    out = seen.length && seen.every((b) => b >= need) ? bars : 0;
  }
  PIECES.set(key, out);
  return out;
}

// ---------------------------------------------------------------- sheet

/** The cuts of a video between `from` and `to`, in seconds into the file: FFmpeg's scene score on a small copy (0.15:
 *  on the RDR2 launch trailer 0.3 found 16 cuts and 0.15 found 28, the logo card's among them), and the black stretches (a fade
 *  through black, a title on black: 98 % of the picture darker than 10 %), whose two ends are cuts too. */
export function findCuts(file, from, to, threshold = 0.15) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-threads", "4", "-ss", String(from), "-t", String(r2(to - from)), "-i", file,
    "-an", "-sn", "-dn", "-vf", `scale=320:-2,blackdetect=d=0.04:pic_th=0.98:pix_th=0.10,select='gt(scene,${threshold})',showinfo`,
    "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 28, windowsHide: true });
  if (r.status !== 0) throw new Bad(`FFmpeg couldn't read ${file}: ${String(r.stderr || "").trim().split(/\r?\n/).pop()}`);
  const err = String(r.stderr);
  const black = [...err.matchAll(/black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)/g)].map((m) => [r2(from + Number(m[1])), r2(from + Number(m[2]))]);
  const at = [...err.matchAll(/Parsed_showinfo[^\n]*?pts_time:\s*([\d.]+)/g)].map((m) => r2(from + Number(m[1])));
  const cuts = [];
  for (const t of [...at, ...black.flat()].sort((x, y) => x - y)) {
    if (t > from + 0.2 && t < to - 0.2 && (!cuts.length || t - cuts[cuts.length - 1] >= 0.25)) cuts.push(t);
  }
  return { cuts, black };
}

/** Contact-sheet pages of a video: its shots between its cuts, a frame in the middle of each (and one every `every`
 *  seconds in a longer one), 12 to a page in 3 columns, each labelled with its number, its time in the file and its
 *  shot's span. Writes <out>/page-01.jpg... and <out>/index.json. */
export function sheet(file, { every = 5, from = 0, to = null, out = null } = {}) {
  if (!fs.existsSync(file)) throw new Bad(`no file ${file}`);
  const p = probe(file);
  if (!p) throw new Bad(`${file} isn't a readable video`);
  const a = Math.max(0, Number(from) || 0), b = Math.min(p.duration, to === null || to === undefined ? p.duration : Number(to));
  if (!(b > a)) throw new Bad(`--from ${a} --to ${b}: nothing in between (the file is ${p.duration} s)`);
  const step = Math.max(1, Number(every) || 5);
  const { cuts, black } = findCuts(file, a, b);
  const edges = [a, ...cuts, b];
  const shots = [];
  for (let k = 0; k < edges.length - 1; k++) {
    const s = { a: r2(edges[k]), b: r2(edges[k + 1]) }, mid = (s.a + s.b) / 2;
    if (black.some(([x, y]) => x <= mid && mid <= y)) continue;   // black, or a title on black: nothing to show
    shots.push({ n: shots.length + 1, ...s });
  }
  const frames = [];
  for (const s of shots) {
    const len = s.b - s.a;
    if (len < 0.3) continue;   // a flash of a few frames: never a shot to use
    const n = len > step ? Math.ceil(len / step) : 1;
    for (let k = 0; k < n; k++) frames.push({ n: frames.length + 1, t: r2(s.a + (len * (k + 0.5)) / n), shot: s.n, a: s.a, b: s.b });
  }
  if (!frames.length) throw new Bad(`${file}: no shot of 0.3 s or more between ${a} and ${b} s`);
  const base = path.basename(file).replace(/\.[^.]+$/, "");
  const dest = path.resolve(out || path.join("work", "sheets", base));
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(dest)) if (/^page-\d+\.jpg$/.test(f)) fs.rmSync(path.join(dest, f), { force: true });
  const meta = videoMeta(file);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "official-sheet-"));
  const pages = [];
  try {
    fs.copyFileSync(FONT, path.join(tmp, "font.ttf"));
    const ff = (args) => {
      const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { cwd: tmp, encoding: "utf8", windowsHide: true });
      if (r.status !== 0) throw new Bad(`FFmpeg couldn't make the sheet: ${String(r.stderr || "").trim().split(/\r?\n/).pop()}`);
    };
    const total = Math.ceil(frames.length / PER_PAGE);
    for (let pg = 0; pg < total; pg++) {
      const list = frames.slice(pg * PER_PAGE, (pg + 1) * PER_PAGE);
      list.forEach((f, k) => {
        const id = `${String(pg + 1).padStart(2, "0")}_${String(k + 1).padStart(2, "0")}`;
        f.page = pg + 1;
        fs.writeFileSync(path.join(tmp, `a${id}.txt`), `#${String(f.n).padStart(2, "0")}   ${f.t.toFixed(2)} s`);
        fs.writeFileSync(path.join(tmp, `b${id}.txt`), `shot ${f.a.toFixed(2)} - ${f.b.toFixed(2)} s  (${(f.b - f.a).toFixed(1)} s)`);
        const vf = "scale=640:360:force_original_aspect_ratio=decrease:flags=lanczos,pad=640:360:(ow-iw)/2:(oh-ih)/2,setsar=1," +
          "pad=640:430:0:0:color=0x151515," +
          `drawtext=fontfile=font.ttf:textfile=a${id}.txt:fontsize=30:fontcolor=white:x=12:y=368,` +
          `drawtext=fontfile=font.ttf:textfile=b${id}.txt:fontsize=21:fontcolor=0x9be7ff:x=12:y=402`;
        fs.writeFileSync(path.join(tmp, `vf${id}.txt`), vf);
        ff(["-ss", String(f.t), "-i", path.resolve(file), "-filter_script:v", `vf${id}.txt`, "-frames:v", "1", `p${id}.png`]);
      });
      const rows = Math.ceil(list.length / COLS);
      const head = `${base}   page ${pg + 1} of ${total}   frames #${list[0].n}-#${list[list.length - 1].n}   ` +
        `${list[0].a.toFixed(2)}-${list[list.length - 1].b.toFixed(2)} s${meta?.title ? `   ${meta.title}` : ""}`;
      fs.writeFileSync(path.join(tmp, `h${pg}.txt`), head.slice(0, 120));
      const name = `page-${String(pg + 1).padStart(2, "0")}.jpg`;
      fs.writeFileSync(path.join(tmp, `pvf${pg}.txt`), `tile=${COLS}x${rows}:padding=8:margin=8:color=black,` +
        `pad=iw:ih+48:0:48:color=0x000000,drawtext=fontfile=font.ttf:textfile=h${pg}.txt:fontsize=24:fontcolor=white:x=16:y=14`);
      ff(["-start_number", "1", "-i", `p${String(pg + 1).padStart(2, "0")}_%02d.png`, "-filter_script:v", `pvf${pg}.txt`, "-frames:v", "1",
        "-q:v", "3", path.join(dest, name)]);
      pages.push({ file: path.join(dest, name), first: list[0].n, last: list[list.length - 1].n, from: list[0].a, to: list[list.length - 1].b });
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  fs.writeFileSync(path.join(dest, "index.json"), JSON.stringify({ file: path.resolve(file), duration: p.duration, from: a, to: b, cuts,
    black, shots, frames: frames.map(({ n, t, shot, page }) => ({ n, t, shot, page })) }, null, 1));
  return { pages, shots, frames, cuts, black, dest, duration: p.duration };
}

// ---------------------------------------------------------------- a new channel

/** A channel's real id, name and handle, read with yt-dlp (never guessed). */
export function channelInfo(x) {
  const s = String(x || "").trim();
  const m = s.match(/(@[\w.-]+|channel\/UC[\w-]{22})/);
  if (!m) throw new Bad(`"${x}": give a channel's @handle or its link (youtube.com/@handle or youtube.com/channel/UC...)`);
  ytdlpVersion();
  const r = runYt(["--flat-playlist", "-J", "-I", "1:1", `https://www.youtube.com/${m[1]}/videos`]);
  if (r.status !== 0) throw new Bad(`yt-dlp couldn't read the channel: ${ytError(r.stderr)}`);
  const j = JSON.parse(r.stdout);
  return { name: j.channel || j.uploader, id: j.channel_id, handle: j.uploader_id || null, verified: j.channel_is_verified ?? null,
    followers: j.channel_follower_count ?? null };
}

// ---------------------------------------------------------------- command line

const USAGE = `usage (from the project folder):
  node <skills>/skills/gta-footage/official_video.mjs check
  node <skills>/skills/gta-footage/official_video.mjs find "<game>" [--query "words"] [--limit 20] [--json]
  node <skills>/skills/gta-footage/official_video.mjs get <id or url>... [--game "<game>"] [--dir footage/other/<dir>]
  node <skills>/skills/gta-footage/official_video.mjs get gta6 [--dir footage/gta6]
  node <skills>/skills/gta-footage/official_video.mjs sheet <file> [--every 5] [--from S] [--to S] [--out work/sheets/<id>]
  node <skills>/skills/gta-footage/official_video.mjs games
  node <skills>/skills/gta-footage/official_video.mjs channel <@handle or channel url>`;

async function main(argv) {
  const [cmd, ...rest] = argv;
  const pos = [], opt = {};
  const VAL = ["--query", "--limit", "--game", "--dir", "--every", "--from", "--to", "--out"];
  for (let i = 0; i < rest.length; i++) {
    const x = rest[i];
    if (x === "-h" || x === "--help") return console.log(USAGE), 0;
    if (VAL.includes(x)) {
      if (i + 1 >= rest.length) return console.error(`official_video: ${x} needs a value\n${USAGE}`), 2;
      opt[x.slice(2)] = rest[++i];
    } else if (x === "--json") opt.json = true;
    else if (x.startsWith("--")) return console.error(`official_video: unknown option ${x}\n${USAGE}`), 2;
    else pos.push(x);
  }
  const num = (k) => (opt[k] === undefined ? undefined : Number(opt[k]));
  try {
    if (cmd === "check" && !pos.length) {
      const t = checkTools();
      console.log(`yt-dlp ${t.version}`);
      console.log(`JavaScript runtime for YouTube: ${t.runtimes || "none found"}` +
        (t.runtimes ? " (Deno first when installed: yt-dlp's default; this script also hands yt-dlp this Node.js)" : ""));
      console.log(`yt-dlp-ejs (YouTube's challenge solver): ${t.ejs ? `${t.ejs}, bundled` : "MISSING"}`);
      console.log(`FFmpeg: ${t.ffmpeg ? "OK" : "MISSING"}`);
      if (!t.ffmpeg) return console.log("FFmpeg is needed (SETUP.md)."), 1;
      if (!t.ejs || !t.runtimes) {
        console.log("Downloads may lose formats or fail: install yt-dlp as SETUP.md says (winget or Homebrew: both bundle yt-dlp-ejs " +
          "and bring Deno), not a pip copy.");
        return 1;
      }
      console.log("official videos OK");
      return 0;
    }
    if (cmd === "games" && !pos.length) {
      const conf = readChannels();
      for (const g of conf.games) console.log(`${g.game.padEnd(44)} ${dirFor(g).replace(/\\/g, "/").padEnd(30)} ${g.channels.map((k) => conf.channels[k].name).join(", ")}`);
      return 0;
    }
    if (cmd === "find" && pos.length === 1) {
      const r = findVideos(pos[0], { query: opt.query || "", limit: Math.max(1, Math.min(50, num("limit") || 20)) });
      if (opt.json) return console.log(JSON.stringify(r.videos, null, 1)), r.videos.length ? 0 : 1;
      const chans = r.game.channels.map((k) => readChannels().channels[k]);
      console.log(`${r.game.game}: official videos on ${chans.map((c) => `${c.name} (${c.handle || c.id})`).join(", ")}, searched for "${r.words}"\n`);
      if (r.videos.length) {
        console.log(`${"id".padEnd(12)} ${"length".padStart(6)}  ${"year".padEnd(5)}  title`);
        for (const v of r.videos) console.log(`${v.id.padEnd(12)} ${mmss(v.duration).padStart(6)}  ${v.year ? `~${v.year}` : "  ?  "}  ${v.title}`);
      }
      const l = r.left, out = [l.game && `${l.game} of another game`, l.shorts && `${l.shorts} Shorts`, l.live && `${l.live} live`,
        l.foreign && `${l.foreign} not the channel's own`].filter(Boolean);
      console.log(`\n${r.videos.length} found${out.length ? `; left out: ${out.join(", ")}` : ""}. The year is YouTube's "N years ago" ` +
        "(a year either way); get writes the exact date.");
      if (!r.videos.length) {
        console.log("Nothing: try other words (--query), or ask the user for that game's official video.");
        return 1;
      }
      console.log(`Next: node <skills>/skills/gta-footage/official_video.mjs get <id> --game "${r.game.game}"`);
      return 0;
    }
    if (cmd === "get" && pos.length) {
      const r = await getVideos(pos, { game: opt.game || null, dir: opt.dir || null });
      const mb = r.got.reduce((n, x) => n + x.meta.size_mb, 0);
      console.log(`\n${r.got.length} downloaded${r.got.length ? ` (${r2(mb)} MB)` : ""}, ${r.kept.length} already here, ` +
        `${r.refused.length} refused, ${r.failed.length} failed.`);
      for (const x of [...r.got, ...r.kept]) console.log(`  ${x.file.replace(/\\/g, "/")}  ${x.meta.game}: ${x.meta.title} (${x.meta.channel}, ${x.meta.upload_date || "?"})`);
      for (const x of [...r.refused, ...r.failed]) console.log(`  ${x.id}: ${x.why}`);
      if (r.got.length || r.kept.length) console.log("Never commit, upload or share these files. Next: official_video.mjs sheet <file>");
      return r.refused.length || r.failed.length ? 1 : 0;
    }
    if (cmd === "sheet" && pos.length === 1) {
      const r = sheet(pos[0], { every: num("every") ?? 5, from: num("from") ?? 0, to: num("to") ?? null, out: opt.out || null });
      const rel = (f) => path.relative(process.cwd(), f).replace(/\\/g, "/");
      console.log(`${pos[0]}: ${r.duration} s, ${r.cuts.length} cuts, ${r.shots.length} shots (black stretches left out: ${r.black.length}), ` +
        `${r.frames.length} frames on ${r.pages.length} page(s):`);
      for (const p of r.pages) console.log(`  ${rel(p.file)}  #${p.first}-#${p.last}  ${p.from.toFixed(2)}-${p.to.toFixed(2)} s`);
      const long = r.shots.filter((s) => s.b - s.a >= 3);
      console.log(`Shots of 3 s or more: ${long.length ? long.map((s) => `${s.a.toFixed(2)}-${s.b.toFixed(2)} (${(s.b - s.a).toFixed(1)} s)`).join(", ") : "none"}.`);
      console.log(`Every frame and shot: ${rel(path.join(r.dest, "index.json"))}. Open the pages; for a beat, take a shot that shows what its words ` +
        "say, and set \"in\" inside that shot so the beat ends before the shot does. Never an end card (logo, rating, platforms, date).");
      return 0;
    }
    if (cmd === "channel" && pos.length === 1) {
      const c = channelInfo(pos[0]);
      console.log(`${c.name}: id ${c.id}, handle ${c.handle || "?"}${c.verified ? ", verified" : ""}${c.followers ? `, ${c.followers} subscribers` : ""}`);
      console.log("Only the publisher's own channel. To add it, put this in official-channels.json \"channels\" (and its games in \"games\"):");
      console.log(`  "${norm(c.name).slice(0, 20) || "key"}": ${JSON.stringify({ name: c.name, publisher: c.name, id: c.id, handle: c.handle, checked: new Date().toISOString().slice(0, 10) })}`);
      return 0;
    }
    console.error(USAGE);
    return 2;
  } catch (e) {
    if (!(e instanceof Bad)) throw e;
    console.error(`official_video: ${e.message}`);
    return e.code;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
