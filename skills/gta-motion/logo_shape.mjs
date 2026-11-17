#!/usr/bin/env node
// A logo's silhouette: the logo's own outline, solid inside. The gaps inside the artwork (between letters, between
// the V and the I of GTA VI) and the hairline channels that reach them are filled, so a window cut in the shape of
// the logo (intro-B) shows the shot whole, with no slivers of the ground floating in it. The outer outline keeps the
// logo's own anti-aliased edge.
//
//   node logo_shape.mjs <logo.png> <out.png>
//
// make_scene.mjs calls it for a template that declares "derive": {"shape": ["silhouette", "logo"]}.
// Node 22+, FFmpeg, no packages.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.toString("latin1", 12, 16) !== "IHDR") throw new Error(`${file} is not a PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

// chamfer distance (in px) from every pixel to the nearest pixel of the set
function distanceTo(set, W, H) {
  const d = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = set[i] ? 0 : 1e9;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 1e9 : d[y * W + x]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (d[i]) d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + Math.SQRT2, at(x + 1, y - 1) + Math.SQRT2);
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (d[i]) d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + Math.SQRT2, at(x - 1, y + 1) + Math.SQRT2);
    }
  return d;
}

/** Writes the silhouette of `src` to `dest` (a white PNG whose alpha is the shape). Returns the pixels it filled. */
export function logoShape(src, dest, { seal = 0.006 } = {}) {
  const [W, H] = pngSize(src);
  const run = spawnSync("ffmpeg", ["-v", "error", "-i", src, "-vf", "format=rgba,alphaextract,format=gray", "-f", "rawvideo", "-"], { maxBuffer: 1 << 28 });
  if (run.status !== 0 || run.stdout.length !== W * H) throw new Error(`ffmpeg could not read the alpha of ${src}: ${String(run.stderr || "").trim()}`);
  const a = run.stdout;
  const solid = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) solid[i] = a[i] >= 128 ? 1 : 0;
  // grow the logo by r, so a channel narrower than 2r is shut; flood the outside from the image's border;
  // grow the outside back by r: what it doesn't reach is the logo, solid inside (a closing, then a hole fill)
  const r = Math.max(2, Math.round(seal * W));
  const dIn = distanceTo(solid, W, H);
  const outside = new Uint8Array(W * H);
  const stack = [];
  const push = (x, y) => { const i = y * W + x; if (!outside[i] && dIn[i] > r) { outside[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (stack.length) {
    const i = stack.pop(), x = i % W, y = (i - x) / W;
    if (x > 0) push(x - 1, y);
    if (x < W - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < H - 1) push(x, y + 1);
  }
  const dOut = distanceTo(outside, W, H);
  const rgba = Buffer.alloc(W * H * 4, 255);
  let filled = 0;
  for (let i = 0; i < W * H; i++) {
    // fully solid inside; only the outer outline (within 2 px of the outside) keeps the logo's soft edge
    const inside = dOut[i] > r, deep = dOut[i] > r + 2;
    const v = deep || (inside && !solid[i]) ? 255 : a[i];
    if (v !== a[i]) filled++;
    rgba[i * 4 + 3] = v;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const enc = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-i", "-", "-frames:v", "1", "-pix_fmt", "rgba", dest], { input: rgba, maxBuffer: 1 << 26 });
  if (enc.status !== 0) throw new Error(`ffmpeg could not write ${dest}: ${String(enc.stderr || "").trim()}`);
  return filled;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [src, dest] = process.argv.slice(2);
  if (!src || !dest) {
    console.error("usage: node logo_shape.mjs <logo.png> <out.png>");
    process.exitCode = 2;
  } else {
    try {
      const n = logoShape(src, dest);
      console.log(`wrote ${dest} (${n} px filled inside the outline)`);
    } catch (e) {
      console.error(`logo_shape: ${e.message}`);
      process.exitCode = 1;
    }
  }
}
