#!/usr/bin/env node
/**
 * Point the landing site at the public API.
 *
 *   npm run site:api -- https://gtm-growth-api.sub.workers.dev
 *   npm run site:api -- --clear
 *
 * Writes the `gg-api` meta tag in both language pages, so the free read switches
 * from sample rows to measured ones and the form posts to the API.
 */

import fs from "node:fs";
import path from "node:path";

const pages = ["site/index.html", "site/fr/index.html"];
const arg = process.argv.slice(2).find((value) => value !== "--");

if (!arg) {
  console.error("usage: npm run site:api -- https://your-worker.workers.dev");
  process.exit(1);
}

const clear = arg === "--clear";
let url = "";

if (!clear) {
  try {
    const parsed = new URL(arg);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      console.error("refusing a non-https endpoint (use http only for localhost)");
      process.exit(1);
    }
    url = parsed.origin;
  } catch {
    console.error(`not a URL: ${arg}`);
    process.exit(1);
  }
}

let changed = 0;
for (const page of pages) {
  const full = path.resolve(page);
  if (!fs.existsSync(full)) {
    console.error(`missing ${page}`);
    continue;
  }
  const before = fs.readFileSync(full, "utf8");
  const after = before.replace(
    /<meta name="gg-api" content="[^"]*">/,
    `<meta name="gg-api" content="${url}">`,
  );
  if (after === before) {
    console.log(`unchanged ${page}`);
    continue;
  }
  fs.writeFileSync(full, after, "utf8");
  changed += 1;
  console.log(`${clear ? "cleared" : "set"} ${page}`);
}

if (!changed) {
  console.error("no page was updated — is the gg-api meta tag still present?");
  process.exit(1);
}

console.log(`
Next:
  node scripts/check-site.mjs
  git add -A && git commit -m "site: point the free read at the worker"
  git push origin main
`);
