#!/usr/bin/env node
// Put a detail box (or a lens, an arrow, a cut-out) exactly on the thing the voice names, on a frozen still.
// Never guess pixel values from a glance at the frame: read them off rulers, tighten them on a zoom, then have the box
// checked blind (gta-motion SKILL.md, "A box sits on the thing it names").
//
//   node find_box.mjs grid  <still>                          the still with pixel rulers every 1/16 of its width
//   node find_box.mjs zoom  <still> --near x1,y1,x2,y2       a magnified crop around a rough box, with fine rulers
//   node find_box.mjs check <still> --box x1,y1,x2,y2 [--label "what it is"]
//                                                            the box on the still (check.jpg) and the crop alone
//                                                            (crop.jpg, for the blind check); prints the values
//
// Pictures go to work/box/ under the current folder (--out DIR to change). Values are pixels of the still
// (1920x1080 for the screenshot2 templates). Node 22+, FFmpeg, no packages.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONT = path.join(HERE, "fonts", "Inter-Variable.ttf");
class Bad extends Error {}

function size(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { encoding: "utf8" });
  const [w, h] = out.trim().split(",").map(Number);
  if (!w || !h) throw new Bad(`can't read the size of ${file}`);
  return [w, h];
}

// runs one ffmpeg filter graph in a scratch folder that holds the font (drawtext can't take a Windows path)
function ff(input, vf, out, extra = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "find_box-"));
  try {
    fs.copyFileSync(FONT, path.join(dir, "font.ttf"));
    fs.writeFileSync(path.join(dir, "vf.txt"), vf);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.resolve(input), "-filter_script:v", "vf.txt", "-frames:v", "1", ...extra, "-q:v", "2", path.resolve(out)],
      { cwd: dir, stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    throw new Bad(`ffmpeg failed: ${String(e.stderr || e.message).trim().split("\n").pop()}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const label = (text, x, y, fs_ = 22) =>
  `drawtext=fontfile=font.ttf:text='${String(text).replace(/[^0-9A-Za-z ,.\-+]/g, "")}':x=${Math.round(x)}:y=${Math.round(y)}:fontsize=${fs_}:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=4`;
// a line drawn twice (dark, then light) so it reads on any footage
const vline = (x, h, t = 1) => `drawbox=x=${Math.round(x) - 1}:y=0:w=${t + 2}:h=${h}:color=black@0.55:t=fill,drawbox=x=${Math.round(x)}:y=0:w=${t}:h=${h}:color=white@0.9:t=fill`;
const hline = (y, w, t = 1) => `drawbox=x=0:y=${Math.round(y) - 1}:w=${w}:h=${t + 2}:color=black@0.55:t=fill,drawbox=x=0:y=${Math.round(y)}:w=${w}:h=${t}:color=white@0.9:t=fill`;
const nums = (s) => {
  const v = String(s || "").split(",").map((x) => Math.round(Number(x)));
  if (v.length !== 4 || v.some((n) => !Number.isFinite(n))) throw new Bad(`want x1,y1,x2,y2 (four numbers), got "${s}"`);
  const [x1, y1, x2, y2] = v;
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
};

/** The still at 1600 px wide with rulers: a line every 1/16 of the width, labelled in still pixels. */
export function grid(still, out) {
  const [W, H] = size(still);
  const step = W / 16, k = 1600 / W;
  const f = [`scale=1600:${Math.round(H * k)}:flags=lanczos`];
  for (let i = 1; i < 16; i++) f.push(vline(i * step * k, Math.round(H * k)));
  for (let j = 1; j * step < H; j++) f.push(hline(j * step * k, 1600));
  for (let i = 1; i < 16; i++) f.push(label(Math.round(i * step), i * step * k + 4, 4, 18));
  for (let j = 1; j * step < H; j++) f.push(label(Math.round(j * step), 4, j * step * k + 4, 18));
  ff(still, f.join(","), out);
  return { out, step: Math.round(step), size: [W, H] };
}

/** A magnified crop around a rough box, with rulers in still pixels every 5 to 100 px. */
export function zoom(still, near, out) {
  const [W, H] = size(still);
  const [x1, y1, x2, y2] = nums(near);
  const mx = Math.max(60, (x2 - x1) * 0.5), my = Math.max(60, (y2 - y1) * 0.5);
  const span = Math.max(x2 - x1 + 2 * mx, (y2 - y1 + 2 * my) * 1.6);
  const step = [5, 10, 20, 25, 40, 50, 80, 100, 200].find((s) => span / s <= 18) || 200;
  const rx = Math.max(0, Math.floor((x1 - mx) / step) * step), ry = Math.max(0, Math.floor((y1 - my) / step) * step);
  const rx2 = Math.min(W, Math.ceil((x2 + mx) / step) * step), ry2 = Math.min(H, Math.ceil((y2 + my) / step) * step);
  const rw = rx2 - rx, rh = ry2 - ry;
  // the scale keeps the ruler spacing a whole number of pixels
  const sp = Math.max(8, Math.floor(Math.min(1600 / rw, 1000 / rh) * step));
  const k = sp / step, ow = Math.round(rw * k), oh = Math.round(rh * k);
  const f = [`crop=${rw}:${rh}:${rx}:${ry}`, `scale=${ow}:${oh}:flags=lanczos`];
  const every = sp >= 56 ? 1 : 2;
  for (let v = Math.ceil(rx / step) * step, i = 0; v <= rx2; v += step, i++) {
    if (v > rx && v < rx2) f.push(vline((v - rx) * k, oh));
    if (i % every === 0 && v < rx2) f.push(label(v, (v - rx) * k + 3, 3, 17));
  }
  for (let v = Math.ceil(ry / step) * step, i = 0; v <= ry2; v += step, i++) {
    if (v > ry && v < ry2) f.push(hline((v - ry) * k, ow));
    if (i % every === 0 && v < ry2 && v > ry) f.push(label(v, 3, (v - ry) * k + 3, 17));
  }
  ff(still, f.join(","), out);
  return { out, step, region: [rx, ry, rx2, ry2] };
}

/** The box drawn on the still (check) and the crop alone (crop), plus the values and what looks wrong. */
export function check(still, box, out, cropOut, text = "") {
  const [W, H] = size(still);
  const [x1, y1, x2, y2] = nums(box);
  const x = Math.max(0, x1), y = Math.max(0, y1), w = Math.min(W, x2) - x, h = Math.min(H, y2) - y;
  if (w < 4 || h < 4) throw new Bad("the box is empty");
  const k = 1600 / W, t = 4;
  const f = [`scale=1600:${Math.round(H * k)}:flags=lanczos`,
    `drawbox=x=${Math.round(x * k) - t}:y=${Math.round(y * k) - t}:w=${Math.round(w * k) + 2 * t}:h=${Math.round(h * k) + 2 * t}:color=black@0.8:t=${t + 2}`,
    `drawbox=x=${Math.round(x * k) - t + 1}:y=${Math.round(y * k) - t + 1}:w=${Math.round(w * k) + 2 * t - 2}:h=${Math.round(h * k) + 2 * t - 2}:color=0x39ff88:t=${t - 1}`,
    label(`${x},${y} ${w}x${h}${text ? "  " + text : ""}`, 8, 8, 22)];
  ff(still, f.join(","), out);
  // the crop: the box plus 15 % on each side, no frame and no words, so a blind look can say what it shows
  const px = Math.round(w * 0.15), py = Math.round(h * 0.15);
  const cx = Math.max(0, x - px), cy = Math.max(0, y - py), cw = Math.min(W, x + w + px) - cx, ch = Math.min(H, y + h + py) - cy;
  ff(still, `crop=${cw}:${ch}:${cx}:${cy},scale='if(gt(iw,ih),900,-2)':'if(gt(iw,ih),-2,900)':flags=lanczos`, cropOut);
  const warn = [];
  if (Math.min(w, h) < W / 48) warn.push(`it is small (${w}x${h} px): a viewer won't see it in a box this size. Pick a still where the thing is bigger, or drop it.`);
  if (w * h > W * H * 0.35) warn.push("it covers over a third of the frame: that's not a detail, the whole shot is.");
  if (x1 < 0 || y1 < 0 || x2 > W || y2 > H || x <= 2 || y <= 2 || x + w >= W - 2 || y + h >= H - 2)
    warn.push("it touches the frame's edge: the thing is probably cut off. Pick another still.");
  return { box_x: x, box_y: y, box_w: w, box_h: h, cx: Math.round(x + w / 2), cy: Math.round(y + h / 2), check: out, crop: cropOut, warnings: warn };
}

/** One review picture of every mark the graphics put on their stills: [{ still, label, marks: [{x,y,w,h,n}] }]. */
export function boxSheet(items, out) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "box_sheet-"));
  try {
    fs.copyFileSync(FONT, path.join(dir, "font.ttf"));
    items.forEach((it, i) => {
      const n = String(i + 1).padStart(3, "0");
      const [W] = size(it.still);
      const k = 640 / W;
      fs.writeFileSync(path.join(dir, `l${n}.txt`), it.label);
      const f = ["scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2:color=0x202020"];
      for (const m of it.marks) {
        const bx = Math.round(m.x * k), by = Math.round(m.y * k), bw = Math.max(6, Math.round(m.w * k)), bh = Math.max(6, Math.round(m.h * k));
        f.push(`drawbox=x=${bx - 2}:y=${by - 2}:w=${bw + 4}:h=${bh + 4}:color=black@0.8:t=4`, `drawbox=x=${bx - 1}:y=${by - 1}:w=${bw + 2}:h=${bh + 2}:color=0x39ff88:t=2`);
        if (m.n != null) f.push(label(m.n, Math.min(620, bx + bw + 4), Math.max(0, by - 2), 18));
      }
      f.push("pad=640:400:0:0:color=0x111111", `drawtext=fontfile=font.ttf:textfile=l${n}.txt:fontsize=18:fontcolor=white:x=10:y=370`);
      fs.writeFileSync(path.join(dir, `vf${n}.txt`), f.join(","));
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.resolve(it.still), "-filter_script:v", `vf${n}.txt`, "-frames:v", "1", `t${n}.png`], { cwd: dir, stdio: "ignore" });
    });
    const cols = Math.min(3, items.length), rows = Math.ceil(items.length / cols);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", "t%03d.png", "-vf", `tile=${cols}x${rows}:padding=6:color=black`, "-frames:v", "1", "-q:v", "3", path.resolve(out)],
      { cwd: dir, stdio: "ignore" });
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function main(argv) {
  const [cmd, still, ...rest] = argv;
  const opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
  if (!cmd || !still || ["-h", "--help"].includes(cmd)) {
    console.log("usage:\n  node find_box.mjs grid <still>\n  node find_box.mjs zoom <still> --near x1,y1,x2,y2\n  node find_box.mjs check <still> --box x1,y1,x2,y2 [--label \"what it is\"]\n  (--out DIR: where the pictures go, default work/box)");
    return cmd ? 0 : 2;
  }
  try {
    if (!fs.existsSync(still)) throw new Bad(`no such still: ${still}`);
    const dir = opt("--out") || path.join("work", "box");
    fs.mkdirSync(dir, { recursive: true });
    const base = path.basename(still).replace(/\.[^.]+$/, "");
    if (cmd === "grid") {
      const r = grid(still, path.join(dir, `${base}_grid.jpg`));
      console.log(`wrote ${r.out}\nLook at it. Read the thing's left, top, right and bottom edges off the rulers (a line every ${r.step} px), roughly, then:\n  node find_box.mjs zoom ${still} --near x1,y1,x2,y2`);
    } else if (cmd === "zoom") {
      const r = zoom(still, opt("--near"), path.join(dir, `${base}_zoom.jpg`));
      console.log(`wrote ${r.out} (still pixels ${r.region.join(",")}, a line every ${r.step} px)\nLook at it. Read the thing's edges off the rulers, tight around the whole thing, then:\n  node find_box.mjs check ${still} --box x1,y1,x2,y2 --label "<the words>"`);
    } else if (cmd === "check") {
      const r = check(still, opt("--box"), path.join(dir, `${base}_check.jpg`), path.join(dir, `${base}_crop.jpg`), opt("--label") || "");
      console.log(JSON.stringify({ box_x: r.box_x, box_y: r.box_y, box_w: r.box_w, box_h: r.box_h, cx: r.cx, cy: r.cy }));
      console.log(`wrote ${r.check} (the box on the still) and ${r.crop} (the crop alone)`);
      for (const w of r.warnings) console.log(`warning: ${w}`);
      console.log("Now the blind check: give the crop ALONE to a fresh agent that knows nothing of the video, and ask:\n" +
        "  \"What is the main thing in this picture, in a few words? Is any part of it cut off by the picture's own edges?\n" +
        "   A part hidden behind something inside the scene (a door frame, a person) doesn't count.\"\n" +
        "Keep the box only when its answer names the thing the voice names and nothing is cut off. Otherwise move the box, pick another still, or drop the detail.");
    } else throw new Bad(`unknown command ${cmd}: grid, zoom or check`);
    return 0;
  } catch (e) {
    if (!(e instanceof Bad)) throw e;
    console.error(`find_box: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
