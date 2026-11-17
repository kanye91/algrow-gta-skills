#!/usr/bin/env node
// Measures a game logo for the templates and writes it into logos.json:
//   cx   its visual centre (the alpha-weighted centroid), in logo widths from the image's centre (+ = right), so a
//        year or a line under the logo centres on the artwork, not on its image box (GTA VI's leans right: 0.091);
//   door [x, y, r]: the middle and radius of its largest solid disc, in logo widths from the centre: where intro-B
//        dives through the logo. Under 0.05 the logo is a thin wordmark: intro-A suits it better.
//
//   node logo_fit.mjs [assets/logos] [--all] [--write]
//
// Without --all it measures the game logos that have no cx or door yet; --write saves logos.json.
// Node 22+, FFmpeg, no packages.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const W = 400;   // measured at 400 px wide: enough for three decimals

function alpha(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file} is not a PNG`);
  const H = Math.round((b.readUInt32BE(20) * W) / b.readUInt32BE(16));
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `scale=${W}:${H}:flags=area,format=rgba,alphaextract,format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 1 << 26 });
  if (r.status !== 0 || r.stdout.length !== W * H) throw new Error(`ffmpeg could not read ${file}`);
  return [r.stdout, H];
}

export function fitLogo(file) {
  const [a, H] = alpha(file);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  let s = 0, sx = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = a[y * W + x] / 255; s += v; sx += v * (x + 0.5); }
  const cx = r3(sx / s / W - 0.5);
  // chamfer distance from each solid pixel to the nearest non-solid one: the deepest point is the door
  const d = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = a[i] >= 250 ? 1e9 : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : d[y * W + x]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (d[i]) d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + Math.SQRT2, at(x + 1, y - 1) + Math.SQRT2); }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (d[i]) d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + Math.SQRT2, at(x - 1, y + 1) + Math.SQRT2); }
  let b = [0, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[y * W + x] > b[0]) b = [d[y * W + x], x, y];
  // one pixel less than measured, so the disc stays inside the solid part after resampling
  const door = [r3((b[1] + 0.5 - W / 2) / W), r3((b[2] + 0.5 - H / 2) / W), r3(Math.max(0, b[0] - 1) / W)];
  return { cx, door };
}

function main(argv) {
  const dir = argv.find((x) => !x.startsWith("--")) || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "logos");
  const idx = path.join(dir, "logos.json");
  const j = JSON.parse(fs.readFileSync(idx, "utf8"));
  let n = 0;
  for (const e of j.logos) {
    if (e.kind !== "game" || (!argv.includes("--all") && e.cx != null && Array.isArray(e.door))) continue;
    const file = path.join(dir, e.file);
    if (!fs.existsSync(file)) { console.log(`${e.file}: not here (it comes with the Algrow download)`); continue; }
    Object.assign(e, fitLogo(file));
    n++;
    console.log(`${e.file}: cx ${e.cx}, door ${JSON.stringify(e.door)}${e.door[2] < 0.05 ? " (thin: no intro-B)" : ""}`);
  }
  if (argv.includes("--write") && n) fs.writeFileSync(idx, JSON.stringify(j, null, 2) + "\n");
  console.log(`${n} measured${argv.includes("--write") ? ", logos.json saved" : " (add --write to save)"}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
