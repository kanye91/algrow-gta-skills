#!/usr/bin/env node
// What the map knows: the regions, the routes between them and the places the game has named, and where a
// real-world point falls on our maps.
//
//   node skills/gta-map/places.mjs                     list the regions, routes and named places
//   node skills/gta-map/places.mjs 25.7745,-80.1700    where that point is: leonida.jpg pixels, vice-city.jpg pixels,
//                                                      the region it's in, and whether pins there get the close-up map
//   node skills/gta-map/places.mjs --cornerbug 25.7745,-80.1700
//                                                      cornerbug-A's dot_x / dot_y for that point (its Florida outline)
//   node skills/gta-map/places.mjs --cornerbug         dot_x / dot_y for every region's centre and every named place
//   add --json for data instead of text
//
// Reads maps/regions.json and maps/maps.json (x = (lon - lon0) * ppd * cos, y = (lat1 - lat) * ppd; the cornerbug-A
// outline is in maps.json's "marks").
// Node 22+, no packages. Exit 0 = done, 1 = a point is not on the map, 2 = bad usage.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(fs.readFileSync(path.join(HERE, "maps", f), "utf8").replace(/^﻿/, ""));
const data = read("regions.json");
const mapsFile = read("maps.json");
const maps = mapsFile.maps;
const L = maps["leonida.jpg"], C = maps["vice-city.jpg"], MARK = mapsFile.marks["cornerbug-A"];

const args = process.argv.slice(2);
const json = args.includes("--json");
const cornerbug = args.includes("--cornerbug");
const points = args.filter((a) => a !== "--json" && a !== "--cornerbug");
const r1 = (x) => Math.round(x * 10) / 10;
const r4 = (x) => Math.round(x * 10000) / 10000;

/** lat, lon -> pixels of one map file, or null when it's off that map */
function px(m, lat, lon) {
  const x = (lon - m.lon0) * m.ppd * m.cos, y = (m.lat1 - lat) * m.ppd;
  return x >= 0 && y >= 0 && x <= m.w && y <= m.h ? [r1(x), r1(y)] : null;
}

/** the region whose outline holds a leonida.jpg pixel (even-odd over its shapes) */
function regionAt(x, y) {
  for (const r of data.regions) {
    if (!r.on_map) continue;
    let inside = false;
    for (const d of r.paths) {
      const n = d.replace(/[MLZ]/g, " ").trim().split(/\s+/).map(Number);
      for (let i = 0, j = n.length - 2; i < n.length; j = i, i += 2) {
        const [xi, yi, xj, yj] = [n[i], n[i + 1], n[j], n[j + 1]];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    if (inside) return r;
  }
  return null;
}

/** a region's centre as lat, lon: the middle of its outline (area centroid); when that falls outside it (the Keys:
    the middle of the chain is sea), the nearest point inside, a few pixels past its edge */
function centre(r) {
  const shapes = r.paths.map((d) => {
    const n = d.replace(/[MLZ]/g, " ").trim().split(/\s+/).map(Number), p = [];
    for (let i = 0; i < n.length; i += 2) p.push([n[i], n[i + 1]]);
    return p;
  });
  const inside = (x, y) => {
    let c = false;
    for (const p of shapes) for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, yi] = p[i], [xj, yj] = p[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  let a = 0, sx = 0, sy = 0;
  for (const p of shapes) for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [x0, y0] = p[j], [x1, y1] = p[i], f = x0 * y1 - x1 * y0;
    a += f; sx += (x0 + x1) * f; sy += (y0 + y1) * f;
  }
  let x = sx / (3 * a), y = sy / (3 * a);
  if (!inside(x, y)) {
    let best = [Infinity, 0, 0];
    for (const p of shapes) for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [ax, ay] = p[j], [bx, by] = p[i], dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      const qx = ax + t * dx, qy = ay + t * dy, dd = Math.hypot(x - qx, y - qy);
      if (dd < best[0]) best = [dd, qx, qy];
    }
    const [dd, qx, qy] = best, ux = (qx - x) / dd, uy = (qy - y) / dd;
    for (let k = 1; k <= 40; k++) if (inside(qx + ux * k, qy + uy * k)) { x = qx + ux * k; y = qy + uy * k; break; }
  }
  return [r4(L.lat1 - y / L.ppd), r4(L.lon0 + x / (L.ppd * L.cos))];
}

// --cornerbug: cornerbug-A's dot_x / dot_y (its outline covers leonida.jpg: 24.45-27.25 N, 82-79.95 W)
if (cornerbug) {
  const OFF = "off the outline (it covers 24.45-27.25 N, 82-79.95 W)";
  const dot = (lat, lon) => px(MARK, lat, lon);
  if (!points.length) {
    const rows = [];
    for (const r of data.regions) {
      const at = r.on_map ? centre(r) : null, xy = at ? dot(...at) : null;
      rows.push({ kind: "region centre", id: r.id, name: r.name, at: at ? at.join(",") : null, dot_x: xy ? xy[0] : null, dot_y: xy ? xy[1] : null });
    }
    for (const p of data.places) {
      const xy = dot(p.lat, p.lon);
      rows.push({ kind: "place", id: p.id, name: p.label, at: `${p.lat},${p.lon}`, dot_x: xy ? xy[0] : null, dot_y: xy ? xy[1] : null });
    }
    if (json) {
      console.log(JSON.stringify(rows, null, 1));
      process.exit(0);
    }
    console.log("CORNERBUG-A DOT (the dot_x, dot_y values; its Florida outline is 659.1 x 1000 units)");
    for (const w of rows) {
      const name = `${w.kind === "place" ? "place " : "region"}  ${w.name}`.padEnd(30);
      console.log(`  ${name} ${w.dot_x === null ? (w.at ? OFF : "north of our maps: " + OFF) : `dot_x ${String(w.dot_x).padStart(5)}  dot_y ${String(w.dot_y).padStart(5)}   (${w.at})`}`);
    }
    console.log("\nRegion centre = the middle of the region's outline (the Keys: the nearest point of the chain to it).");
    console.log("The dot is 108 units wide (about 14 px), so places closer than ~50 units share one spot.");
    process.exit(0);
  }
  let bad = 0;
  const out = [];
  for (const s of points) {
    const m = s.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!m) {
      console.error(`"${s}": write a point as lat,lon (25.7745,-80.1700)`);
      process.exit(2);
    }
    const lat = Number(m[1]), lon = Number(m[2]), xy = dot(lat, lon);
    if (!xy) bad++;
    out.push({ at: `${lat},${lon}`, dot_x: xy ? xy[0] : null, dot_y: xy ? xy[1] : null });
    if (!json) console.log(xy ? `${lat},${lon}: dot_x ${xy[0]}, dot_y ${xy[1]}` : `${lat},${lon}: ${OFF}`);
  }
  if (json) console.log(JSON.stringify(out, null, 1));
  process.exit(bad ? 1 : 0);
}

if (!points.length) {
  if (json) {
    console.log(JSON.stringify({ regions: data.regions.map(({ paths, paths_vc, ...r }) => r), routes: data.routes.map(({ d, ...t }) => t),
      places: data.places, credit: data.credit }, null, 1));
    process.exit(0);
  }
  console.log("REGIONS (the `region` value; the game shows six)");
  for (const r of data.regions) {
    console.log(`  ${(r.on_map ? r.id : "(" + r.id + ")").padEnd(16)} ${r.name}: ${r.real}${r.on_map ? "" : ". North of our map: no map chapter"}`);
  }
  console.log("\nROUTES (the `route` value: either direction, `<from>-to-<to>`)");
  for (const t of data.routes) console.log(`  ${t.id.padEnd(27)} / ${t.back_id.padEnd(27)} ${String(t.miles).padStart(5)} mi  ${t.via}`);
  console.log("\nPLACES the game has named (pin values: `pinN` = the name, `pinN_real` = the line shown, `pinN_at`, `pinN_icon`)");
  for (const p of data.places) {
    const line = (p.basis === "rockstar" ? "REAL: " : "FANS SAY: ") + p.real;
    console.log(`  ${p.label.padEnd(13)} ${line.padEnd(25)} ${`${p.lat},${p.lon}`.padEnd(18)} ${p.icon.padEnd(6)} ${p.basis === "rockstar" ? "named in Rockstar's text" : "fan match, not Rockstar's word"}`);
  }
  console.log(`\nCredit for the video description: ${data.credit}`);
  process.exit(0);
}

let bad = 0;
const out = [];
for (const s of points) {
  const m = s.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) {
    console.error(`"${s}": write a point as lat,lon (25.7745,-80.1700)`);
    process.exit(2);
  }
  const lat = Number(m[1]), lon = Number(m[2]);
  const onL = px(L, lat, lon), onC = px(C, lat, lon);
  const reg = onL ? regionAt(onL[0], onL[1]) : null;
  const near = data.places.find((p) => Math.abs(p.lat - lat) < 0.002 && Math.abs(p.lon - lon) < 0.002);
  const row = { at: `${lat},${lon}`, leonida_px: onL, vice_city_px: onC, region: reg ? reg.id : null, close_up: !!onC, place: near ? near.label : null };
  if (!onL) bad++;
  out.push(row);
  if (json) continue;
  if (!onL) {
    console.log(`${row.at}: off our map (leonida.jpg covers ${L.lat0}..${L.lat1} N, ${L.lon0}..${L.lon1} E)`);
    continue;
  }
  console.log(`${row.at}${near ? ` (${near.label})` : ""}: leonida.jpg (${onL.join(", ")})` +
    (onC ? `, vice-city.jpg (${onC.join(", ")})` : "") + `, ${reg ? "in " + reg.name : "outside every region"}` +
    (onC ? "; pins here get the Vice City close-up" : "; pins here stay on the state map"));
}
if (json) console.log(JSON.stringify(out, null, 1));
process.exit(bad ? 1 : 0);
