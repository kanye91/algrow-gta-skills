#!/usr/bin/env node
// Put one motion template into a HyperFrames project as its own scene.
//
//   node make_scene.mjs <template> --project DIR --as SCENE_ID [--theme clean|vice]
//        [--set id=value ...] [--start S] [--duration D] [--track N] [--force] [--json]
//
// It copies templates/<template>/<template>.html to DIR/compositions/<SCENE_ID>.html and:
//   - renames the template's root id (and every id prefixed with it) to SCENE_ID, so two uses never collide;
//   - pastes theme.css at the /*GTA-THEME*/ marker;
//   - writes the values (--theme, --set) into the scene's variable defaults, so the file alone is the truth;
//   - copies file values (the channel's profile picture) into DIR/assets/channel/, and the fonts into DIR/assets/fonts/;
//   - makes the files a template derives from another (device.json "derive": a logo's silhouette, logo_shape.mjs);
//   - prints the host tag to paste into DIR/index.html.
// Node 22+, no packages (FFmpeg for a derived file). Exit 0 = written, 1 = a value or the template is wrong, 2 = bad usage.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logoShape } from "./logo_shape.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.join(HERE, "templates");
const USAGE =
  "usage: node make_scene.mjs <template> --project DIR --as SCENE_ID [--theme clean|vice] [--set id=value ...] [--start S] [--duration D] [--track N] [--force] [--json]";

class Bad extends Error {}

function parseArgs(argv) {
  const a = { template: null, project: null, as: null, theme: null, set: [], start: 0, duration: null, track: 1, force: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    const val = () => {
      if (i + 1 >= argv.length) throw new Bad(`${x} needs a value`);
      return argv[++i];
    };
    if (x === "-h" || x === "--help") return { help: true };
    else if (x === "--project") a.project = val();
    else if (x === "--as") a.as = val();
    else if (x === "--theme") a.theme = val();
    else if (x === "--set") a.set.push(val());
    else if (x === "--start") a.start = Number(val());
    else if (x === "--duration") a.duration = Number(val());
    else if (x === "--track") a.track = Number(val());
    else if (x === "--force") a.force = true;
    else if (x === "--json") a.json = true;
    else if (x.startsWith("--")) throw new Bad(`unknown option ${x}`);
    else if (!a.template) a.template = x;
    else throw new Bad(`unexpected argument ${x}`);
  }
  if (!a.template || !a.project || !a.as) throw new Bad("give a template, --project and --as");
  return a;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const attr = (s) => s.replace(/&/g, "&amp;").replace(/'/g, "&#39;");
const unattr = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

/** Coerce one --set value to its declared type, or explain why it can't be used. */
function coerce(decl, raw) {
  const t = decl.type;
  if (t === "number") {
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n)) throw new Bad(`${decl.id} must be a number, got "${raw}"`);
    if (decl.min != null && n < decl.min) throw new Bad(`${decl.id} must be ${decl.min} or more, got ${n}`);
    if (decl.max != null && n > decl.max) throw new Bad(`${decl.id} must be ${decl.max} or less, got ${n}`);
    return n;
  }
  if (t === "boolean") {
    if (!["true", "false"].includes(raw)) throw new Bad(`${decl.id} must be true or false, got "${raw}"`);
    return raw === "true";
  }
  if (t === "enum") {
    const ok = (decl.options || []).map((o) => o.value);
    if (!ok.includes(raw)) throw new Bad(`${decl.id} must be one of ${ok.join(", ")}, got "${raw}"`);
    return raw;
  }
  if (decl.maxLength != null && raw.length > decl.maxLength)
    throw new Bad(`${decl.id} is ${raw.length} characters; this template fits ${decl.maxLength} at most ("${raw}")`);
  return raw;
}

export function makeScene(opts) {
  const { template, project, as: id } = opts;
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Bad(`--as must be lower-case letters, digits and hyphens, starting with a letter (got "${id}")`);
  const dir = path.join(TEMPLATES, template);
  const src = path.join(dir, `${template}.html`);
  if (!fs.existsSync(src)) {
    const have = fs.existsSync(TEMPLATES) ? fs.readdirSync(TEMPLATES).filter((d) => fs.existsSync(path.join(TEMPLATES, d, `${d}.html`))) : [];
    throw new Bad(`no template "${template}". Templates: ${have.join(", ") || "(none)"}`);
  }
  const device = JSON.parse(fs.readFileSync(path.join(dir, "device.json"), "utf8").replace(/^﻿/, ""));
  let html = fs.readFileSync(src, "utf8").replace(/^﻿/, "");

  const rootId = (html.match(/data-composition-id="([^"]+)"/) || [])[1];
  if (!rootId) throw new Bad(`${template}.html has no data-composition-id`);
  if (!html.includes("/*GTA-THEME*/")) throw new Bad(`${template}.html has no /*GTA-THEME*/ marker`);

  const projectDir = path.resolve(project);
  const outFile = path.join(projectDir, "compositions", `${id}.html`);
  if (fs.existsSync(outFile) && !opts.force) throw new Bad(`compositions/${id}.html already exists: pick another --as, or --force to replace it`);

  // variables: declared defaults <- --theme <- --set
  const m = html.match(/data-composition-variables='([^']*)'/);
  if (!m) throw new Bad(`${template}.html declares no data-composition-variables`);
  const decls = JSON.parse(unattr(m[1]));
  const byId = Object.fromEntries(decls.map((d) => [d.id, d]));
  const sets = [];
  if (opts.theme != null) sets.push(["theme", opts.theme]);
  for (const kv of opts.set || []) {
    const k = kv.indexOf("=");
    if (k < 1) throw new Bad(`--set wants id=value, got "${kv}"`);
    sets.push([kv.slice(0, k), kv.slice(k + 1)]);
  }
  const files = new Set(device.files || []);
  const identity = new Set(device.identity || []);
  const copied = [];
  const copyIn = (abs, sub) => {
    const dest = path.join(projectDir, "assets", sub, path.basename(abs));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(abs).size) {
      fs.copyFileSync(abs, dest);
      copied.push(path.relative(projectDir, dest).replace(/\\/g, "/"));
    }
    return `assets/${sub}/${path.basename(abs)}`;
  };
  for (const [k, raw] of sets) {
    const d = byId[k];
    if (!d) throw new Bad(`${template} has no variable "${k}". It has: ${decls.map((x) => x.id).join(", ") || "no variables"}`);
    let v = coerce(d, raw);
    if (files.has(k) && v) {
      // a file value: it must exist; copy it into the project unless it is already there
      // (the channel kit goes to assets/channel/, any other file to assets/<variable>/)
      if (!fs.existsSync(path.join(projectDir, v))) {
        const abs = path.resolve(v);
        if (!fs.existsSync(abs)) throw new Bad(`${k}: file not found: ${v}`);
        v = copyIn(abs, identity.has(k) ? "channel" : k.replace(/[^a-z0-9_-]/gi, "_"));
      } else v = v.replace(/\\/g, "/");
    }
    d.default = v;
  }
  // files the template ships (our own pictures, never game art) fill the values left empty
  for (const [k, f] of Object.entries(device.bundled || {})) {
    const d = byId[k];
    if (!d || d.default) continue;
    const abs = path.resolve(dir, f);
    if (!fs.existsSync(abs)) throw new Bad(`${template}: its bundled file for ${k} is missing (${f})`);
    d.default = copyIn(abs, path.join("templates", template).replace(/\\/g, "/"));
  }
  // files made from another file value, left empty by the caller: "derive": {"shape": ["silhouette", "logo"]} makes
  // the logo's silhouette (logo_shape.mjs) into assets/shape/, once per logo
  const derived = [];
  for (const [k, [how, from] = []] of Object.entries(device.derive || {})) {
    const d = byId[k];
    const srcRel = byId[from]?.default;
    if (!d || d.default || !srcRel) continue;
    if (how !== "silhouette") throw new Bad(`${template}: device.json derive.${k} is "${how}"; make_scene knows "silhouette"`);
    const srcAbs = path.join(projectDir, srcRel);
    const rel = `assets/${k}/${path.basename(srcRel).replace(/\.[^.]+$/, "")}_${k}.png`;
    const dest = path.join(projectDir, rel);
    try {
      if (!fs.existsSync(dest) || fs.statSync(dest).mtimeMs < fs.statSync(srcAbs).mtimeMs) {
        logoShape(srcAbs, dest);
        copied.push(rel);
      }
      d.default = rel;
    } catch (e) {
      derived.push(`${k} could not be made from ${from} (${e.message}): the template uses ${from} itself.`);
    }
  }
  const values =Object.fromEntries(decls.map((d) => [d.id, d.default]));
  for (const k of device.required || [])
    if (values[k] === "" || values[k] == null) throw new Bad(`${template} needs ${k}: ${device.vars?.[k] || "set it with --set " + k + "=..."}`);
  // one of each group (a shot or an icon in its place)
  for (const group of device.required_any || [])
    if (group.every((k) => values[k] === "" || values[k] == null))
      throw new Bad(`${template} needs ${group.join(" or ")}: ${group.map((k) => device.vars?.[k]).filter(Boolean).join(" / ")}`);
  for (const k of files) {
    const v = values[k];
    if (v && !fs.existsSync(path.join(projectDir, v))) throw new Bad(`${k}: ${v} is not in the project (expected ${path.join(projectDir, v)})`);
  }

  // a file bound with data-var-src is also written into the element's src: HyperFrames 0.9.53 plays a video
  // only from a src written in the file once the scene starts after 0 s (a bound one renders blank)
  for (const k of files) {
    const v = values[k];
    if (!v) continue;
    html = html.replace(new RegExp(`<(video|img|audio)\\b[^>]*\\bdata-var-src="${esc(k)}"[^>]*>`, "g"), (tag) =>
      /\ssrc="[^"]*"/.test(tag) ? tag.replace(/\ssrc="[^"]*"/, ` src="${v}"`) : tag.replace(/^<(video|img|audio)/, `<$1 src="${v}"`));
  }

  const declText = "[\n" + decls.map((d) => "      " + JSON.stringify(d)).join(",\n") + "\n    ]";
  html = html.replace(m[0], `data-composition-variables='${attr(declText)}'`);
  html = html.replace(/(<div[^>]*data-composition-id="[^"]+"[^>]*?)data-theme="(clean|vice)"/, `$1data-theme="${values.theme === "vice" ? "vice" : "clean"}"`);

  // rename the root id and every id built on it (subscribe-b, subscribe-b-row, ...) -> SCENE_ID, SCENE_ID-row, ...
  html = html.replace(new RegExp(`(?<![A-Za-z0-9_-])${esc(rootId)}(?![A-Za-z0-9_])`, "g"), id);

  // the theme goes in last, so its own words are never renamed
  const theme = fs.readFileSync(path.join(HERE, "theme.css"), "utf8").replace(/^﻿/, "");
  // a tag written inside the CSS (even in a comment) breaks the scene's style block for the HyperFrames linter
  if (theme.includes("<")) throw new Bad("theme.css contains a '<': write no HTML tags in it, not even in comments");
  html = html.replace("/*GTA-THEME*/", () => `/* ---- theme.css (gta-motion) ---- */\n${theme}\n    /* ---- ${template} ---- */`);

  // duration: from the exit time when the template has one, else the template's default
  const exitTotal = Number(device.exit_total ?? device.exit ?? 0);
  const minDur = "out" in values ? Number(values.out) + exitTotal : null;
  let duration = opts.duration;
  if (duration == null || !Number.isFinite(duration)) duration = minDur ?? Number(device.duration?.default ?? 5);

  // timing that depends on the values: HyperFrames reads a clip's data-start / data-duration / data-media-start
  // from the file before any script runs, so a template writes them as formulas of its number variables
  // (data-start-expr="out - 0.05") and they are computed here. `duration` is the scene's length.
  const known = { duration };
  for (const [k, v] of Object.entries(values)) if (v !== "" && v !== null && typeof v !== "boolean" && Number.isFinite(Number(v))) known[k] = Number(v);
  // A start between two frames is moved up to the next frame, the way HyperFrames shows it, and a video's
  // media start moves by the same amount, so the frames on screen are exactly the ones the formula meant.
  html = html.replace(/<[a-z]+\b[^>]*\bdata-(?:start|duration|media-start)-expr="[^"]*"[^>]*>/gi, (tag) => {
    const calc = {};
    for (const m of [...tag.matchAll(/\sdata-(start|duration|media-start)-expr="([^"]*)"/g)]) {
      const [, which, expr] = m;
      const js = expr.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (w) => {
        if (!(w in known)) throw new Bad(`${template}: data-${which}-expr="${expr}" uses "${w}", which is not a number variable of the scene`);
        return `(${known[w]})`;
      });
      if (!/^[\d\s.+\-*/()e]+$/.test(js)) throw new Bad(`${template}: data-${which}-expr="${expr}" may only use numbers, number variables and + - * / ( )`);
      calc[which] = Math.max(0, Function(`"use strict"; return (${js});`)());
      tag = tag.replace(m[0], "");
    }
    const stat = (w) => { const m = tag.match(new RegExp(`\\sdata-${w}="([^"]*)"`)); return m ? Number(m[1]) : null; };
    const start = calc.start ?? stat("start");
    const dur = calc.duration ?? stat("duration");
    let media = calc["media-start"] ?? stat("media-start");
    const out = {};
    if (start != null) {
      const up = Math.ceil(start * 30 - 1e-6) / 30;
      out.start = up;
      if (dur != null) out.duration = Math.max(1, Math.round((start + dur) * 30) - Math.round(up * 30)) / 30;
      // HyperFrames shows media time = media start + playback rate x time since the clip's start
      const rate = stat("playback-rate") ?? 1;
      if (/^<(video|audio)\b/i.test(tag) && up - start > 1e-9) media = (media ?? 0) + (up - start) * rate;
    } else if (dur != null) out.duration = Math.round(dur * 30) / 30;
    if (media != null) out["media-start"] = Math.round(media * 1e4) / 1e4;
    for (const [w, v] of Object.entries(out)) {
      tag = tag.replace(new RegExp(`\\sdata-${w}="[^"]*"`), "");
      tag = tag.replace(/\s*(\/?)>$/, ` data-${w}="${v}"$1>`);
    }
    return tag;
  });

  // an optional video or sound left empty is dropped, unless the script uses it
  for (const k of files) {
    if (values[k]) continue;
    html = html.replace(new RegExp(`<(video|audio)\\b[^>]*\\bdata-var-src="${esc(k)}"[^>]*>\\s*</\\1>`, "g"), (tag) => {
      const tid = (tag.match(/\bid="([^"]+)"/) || [])[1];
      const short = tid && tid.startsWith(`${id}-`) ? tid.slice(id.length + 1) : tid;
      const rest = html.replace(tag, "");
      return tid && (rest.includes(tid) || rest.includes(`"${short}"`) || rest.includes(`'${short}'`)) ? tag : "";
    });
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);

  // fonts used by the vice theme
  const fontsOut = path.join(projectDir, "assets", "fonts");
  fs.mkdirSync(fontsOut, { recursive: true });
  for (const f of fs.readdirSync(path.join(HERE, "fonts"))) {
    if (!/\.(ttf|otf|woff2?)$/i.test(f)) continue;
    const dest = path.join(fontsOut, f);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(path.join(HERE, "fonts", f), dest);
      copied.push(`assets/fonts/${f}`);
    }
  }

  const warnings = [...derived];
  if (minDur != null && duration + 1e-6 < minDur)
    warnings.push(`--duration ${duration} cuts the exit: it ends at ${minDur.toFixed(2)} s (out ${values.out} + exit ${exitTotal}). Raise --duration or lower out.`);
  for (const k of device.identity || []) if (!values[k]) warnings.push(`${k} is empty: the template leaves it out (never invent it).`);
  const indexHtml = path.join(projectDir, "index.html");
  if (fs.existsSync(indexHtml) && !/gsap/i.test(fs.readFileSync(indexHtml, "utf8")))
    warnings.push("index.html doesn't load GSAP: add <script src=\"https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js\"></script> in its <head>.");

  // on the 30 fps grid, written at full precision: 41/30 is 1.3666666666666667. A start rounded up (1.367) shows
  // the scene a frame late, and one rounded to 6 decimals can repeat a frame.
  const r3 = (n) => Math.round(Number(n) * 30) / 30;
  const host =
    `<div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" ` +
    `data-start="${r3(opts.start || 0)}" data-duration="${r3(duration)}" data-track-index="${opts.track ?? 1}" ` +
    `data-track-kind="graphics" data-width="1920" data-height="1080"></div>`;
  return { file: path.relative(projectDir, outFile).replace(/\\/g, "/"), template, id, values, duration: r3(duration), host, copied, warnings, layer: device.layer || null };
}

function main(argv) {
  let a;
  try {
    a = parseArgs(argv);
  } catch (e) {
    console.error(`${e.message}\n${USAGE}`);
    return 2;
  }
  if (a.help) {
    console.log(USAGE);
    return 0;
  }
  try {
    const r = makeScene(a);
    if (a.json) console.log(JSON.stringify(r, null, 2));
    else {
      console.log(`wrote ${r.file} (${r.template}, ${r.duration} s${r.layer ? `, ${r.layer}` : ""})`);
      for (const c of r.copied) console.log(`copied ${c}`);
      for (const w of r.warnings) console.log(`note: ${w}`);
      console.log(`\nhost tag for index.html (inside the root, above the footage in z-index):\n${r.host}`);
    }
    return 0;
  } catch (e) {
    if (!(e instanceof Bad)) throw e;
    console.error(`make_scene: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
