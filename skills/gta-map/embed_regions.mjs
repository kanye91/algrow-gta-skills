#!/usr/bin/env node
// Write the region data into the map chapter template, so the scene needs no file and no network.
//
//   node skills/gta-map/embed_regions.mjs           write it (after regions.json changed)
//   node skills/gta-map/embed_regions.mjs --check   only say whether the template is up to date (exit 1 if not)
//
// It reads maps/regions.json and maps/maps.json, keeps what the template draws (each region on the map: title,
// colour, outline, cameras; each route: its line, miles and cameras; the map's pixel formula; where the Vice City
// close-up sits on the state map) and writes it between /*REGIONS*/ and /*END REGIONS*/ in
// gta-motion/templates/mapchapter-A/mapchapter-A.html. It also checks that the template's `region` and `route`
// choices match the data. Users never run it: the template ships with the data in it.
// Node 22+, no packages. Exit 0 = up to date or written, 1 = stale or mismatched.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(HERE, "..", "gta-motion", "templates", "mapchapter-A", "mapchapter-A.html");
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, ""));

const regions = read(path.join(HERE, "maps", "regions.json"));
const maps = read(path.join(HERE, "maps", "maps.json")).maps;
const L = maps["leonida.jpg"], C = maps["vice-city.jpg"];
const r2 = (x) => Math.round(x * 100) / 100;

const data = {
  map: { w: L.w, h: L.h, lon0: L.lon0, lat1: L.lat1, ppd: L.ppd, cos: L.cos },
  // the close-up's box in leonida.jpg pixels (same projection, ppd ratio as the scale)
  detail: {
    x: r2((C.lon0 - L.lon0) * L.ppd * L.cos), y: r2((L.lat1 - C.lat1) * L.ppd),
    w: r2((C.w * L.ppd) / C.ppd), h: r2((C.h * L.ppd) / C.ppd),
  },
  regions: {},
  routes: [],
};
for (const r of regions.regions) {
  if (!r.on_map) continue;
  data.regions[r.id] = { title: r.title, name: r.name, short: r.short, color: r.color, paths: r.paths,
    cams: { title0: r.cams.title0, title1: r.cams.title1 } };
}
for (const t of regions.routes) {
  data.routes.push({ id: t.id, back_id: t.back_id, from: t.from, to: t.to, miles: t.miles, d: t.d, cams: t.cams });
}

const block = `/*REGIONS*/ const DATA = ${JSON.stringify(data)}; /*END REGIONS*/`;
const html = fs.readFileSync(TEMPLATE, "utf8");
const re = /\/\*REGIONS\*\/[\s\S]*?\/\*END REGIONS\*\//;
if (!re.test(html)) {
  console.error(`${TEMPLATE}: no /*REGIONS*/ ... /*END REGIONS*/ block`);
  process.exit(1);
}
const problems = [];
// the choices the template offers must be the data's
const decl = JSON.parse((html.match(/data-composition-variables='([^']*)'/) || [])[1].replace(/&#39;/g, "'"));
const opts = (id) => (decl.find((d) => d.id === id)?.options || []).map((o) => o.value);
const wantRegions = Object.keys(data.regions);
const wantRoutes = ["", ...data.routes.flatMap((t) => [t.id, t.back_id])];
const same = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
if (!same(opts("region"), wantRegions)) problems.push(`the region choices should be: ${wantRegions.join(", ")}`);
if (!same(opts("route"), wantRoutes)) problems.push(`the route choices should be: (none), ${wantRoutes.slice(1).join(", ")}`);
for (const t of data.routes) {
  for (const k of ["from", "to"]) if (!data.regions[t[k]]) problems.push(`route ${t.id}: ${t[k]} is not a region on the map`);
}

const current = html.match(re)[0] === block;
if (process.argv.includes("--check")) {
  if (!current) problems.push("the region data in the template is not the one in maps/regions.json: run this script without --check");
} else if (!current) {
  fs.writeFileSync(TEMPLATE, html.replace(re, () => block));
  console.log(`wrote the region data into ${path.relative(process.cwd(), TEMPLATE)} (${block.length} characters)`);
} else console.log("the template's region data is up to date");
for (const p of problems) console.error("problem: " + p);
process.exit(problems.length ? 1 : 0);
