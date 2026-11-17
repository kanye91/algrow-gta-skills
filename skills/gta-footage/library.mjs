#!/usr/bin/env node
// The Algrow footage library: the official videos stay on Algrow's server, and the skills fetch only the pieces a
// video needs (each shot, still and clip), already cut. Nothing to download beforehand.
//
// It is on when library.json at the repo root has a "url":
//     {"url": "https://gta-footage.13.140.129.97.sslip.io", "key": "<your key>"}
// The key can also come from the environment variable ALGROW_FOOTAGE_KEY (it wins over the file).
// Without library.json, the skills use the user's own copies of the official videos (SETUP.md).
//
// Check that it works:
//     node <skills>/skills/gta-footage/library.mjs check
// Node 22+, no packages. The key is never printed: errors show only its last 4 characters.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LIBRARY_FILE = path.join(HERE, "..", "..", "library.json");
const TIMEOUT = 300_000;   // one request, queue on the server included
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

export class LibraryError extends Error {}

/** The library's settings ({url, key}), or null when this copy of the skills uses the user's own footage. */
export function libraryConfig() {
  if (!fs.existsSync(LIBRARY_FILE)) return null;
  let conf;
  try {
    conf = JSON.parse(fs.readFileSync(LIBRARY_FILE, "utf8").replace(/^﻿/, ""));
  } catch {
    // the parser's message can quote the file, key included: never show it
    throw new LibraryError(`library.json at the repo root isn't valid JSON. It must look like {"url": "https://...", "key": "<your key>"}.`);
  }
  const url = String(conf?.url || "").trim().replace(/\/+$/, "");
  if (!url) return null;
  return { url, key: String(process.env.ALGROW_FOOTAGE_KEY || conf.key || "").trim() };
}

const NO_KEY = "the footage library has no key. Put yours in library.json at the repo root (\"key\"), " +
  "or in the environment variable ALGROW_FOOTAGE_KEY. Ask Algrow if you don't have one.";

/** A client of the library. get() writes one piece to a file; json() reads a small answer. */
export function openLibrary(conf, { note = (m) => process.stderr.write(`${m}\n`) } = {}) {
  const masked = conf.key ? `…${conf.key.slice(-4)}` : "none";
  const scrub = (s) => (conf.key ? String(s).split(conf.key).join(masked) : String(s));
  const fail = (msg) => new LibraryError(scrub(msg));

  async function request(ep, params, auth = true) {
    if (auth && !conf.key) throw fail(NO_KEY);
    const u = new URL(`${conf.url}/v1/${ep}`);
    for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, String(v));
    const what = `${ep}${params?.src ? ` ${params.src}` : ""}${params?.in ?? params?.t ? ` at ${params.in ?? params.t} s` : ""}`;
    for (let attempt = 0; ; attempt++) {
      let res, body;
      try {
        res = await fetch(u, { headers: auth ? { Authorization: `Bearer ${conf.key}` } : {}, signal: AbortSignal.timeout(TIMEOUT) });
        if (res.ok) {
          body = Buffer.from(await res.arrayBuffer());
          const len = Number(res.headers.get("content-length"));
          if (len && body.length !== len) throw new Error(`the download stopped at ${body.length} of ${len} bytes`);
          return { res, body };
        }
      } catch (e) {
        if (attempt < 2) {
          await sleep(3000 * (attempt + 1));
          continue;
        }
        const why = e?.cause?.code || e?.cause?.message || (e?.name === "TimeoutError" ? `no answer in ${TIMEOUT / 1000} s` : e?.message || e);
        throw fail(`the footage library at ${conf.url} isn't answering (${why}). Check your internet connection and build again; ` +
          "if it keeps failing, tell Algrow.");
      }
      let err = {};
      try {
        err = await res.json();
      } catch {}
      const msg = err.message || `HTTP ${res.status}`;
      if (res.status === 401 && err.error === "no_key") throw fail(NO_KEY);
      if (res.status === 401) {
        throw fail(`the footage library refused your key (${masked}): it is wrong or was revoked. Check "key" in library.json ` +
          "or ALGROW_FOOTAGE_KEY, or ask Algrow for a new one.");
      }
      const busy = (res.status === 429 && err.error === "rate_limit") || res.status === 503;
      if (busy || res.status >= 500) {
        if (attempt < (busy ? 6 : 2)) {
          const wait = Math.min(Math.max(Number(res.headers.get("retry-after")) || 5 * (attempt + 1), 1), 65);
          note(`footage library: ${msg} Trying again in ${wait} s.`);
          await sleep(wait * 1000);
          continue;
        }
        throw fail(`the footage library: ${msg} (${what}). Build again in a few minutes.`);
      }
      if (res.status === 429) {
        throw fail(`the footage library: ${msg} The pieces already fetched are kept: build again then, and only the missing ones are fetched.`);
      }
      throw fail(`the footage library: ${msg} (${what})`);
    }
  }

  return {
    url: conf.url,
    /** One piece (endpoint shot, frame or clip) into `out`, written whole or not at all. */
    async get(ep, params, out) {
      const { body } = await request(ep, params);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const tmp = `${out}.part`;
      fs.writeFileSync(tmp, body);
      fs.renameSync(tmp, out);
      return body.length;
    },
    async json(ep, params, auth = true) {
      const { body } = await request(ep, params, auth);
      return JSON.parse(body.toString("utf8"));
    },
  };
}

/** Run async tasks, `n` at a time; stop starting new ones after the first failure, and throw it. */
export async function runAll(tasks, n = 3) {
  let next = 0, failed = null;
  const worker = async () => {
    while (!failed && next < tasks.length) {
      const task = tasks[next++];
      try {
        await task();
      } catch (e) {
        failed ??= e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, worker));
  if (failed) throw failed;
}

async function main(argv) {
  if (argv[0] !== "check" || argv.length > 1) {
    console.error("usage: node library.mjs check");
    return 2;
  }
  try {
    const conf = libraryConfig();
    if (!conf) {
      console.log("No footage library: there is no library.json with a url at the repo root, so the skills use your own copies " +
        "of the official videos (SETUP.md).");
      return 1;
    }
    const lib = openLibrary(conf);
    await lib.json("health", {}, false);
    const { sources } = await lib.json("sources", {});
    console.log(`footage library OK: ${conf.url}, your key works. ${sources.length} videos:`);
    for (const s of sources) console.log(`  ${s.id}  ${s.title}`);
    return 0;
  } catch (e) {
    if (!(e instanceof LibraryError)) throw e;
    console.error(`library: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
