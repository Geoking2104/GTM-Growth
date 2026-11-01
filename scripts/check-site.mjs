#!/usr/bin/env node
/**
 * Static checks for the landing site.
 *
 * Catches the failures that a marketing page actually ships with: a missing
 * asset, a form hook renamed in the HTML but not in the JS, placeholder copy,
 * or a canonical URL that disagrees with the sitemap.
 */

import fs from "node:fs";
import path from "node:path";

const root = path.resolve("site");
const failures = [];

function read(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    failures.push(`missing file: site/${file}`);
    return "";
  }
  return fs.readFileSync(full, "utf8");
}

const required = [
  "index.html",
  "styles.css",
  "app.js",
  "preview.js",
  "robots.txt",
  "sitemap.xml",
  "llms.txt",
  "llms-full.txt",
  "ai/summary.json",
  "ai/faq.json",
  "ai/service.json",
  ".well-known/ai.txt",
  "404.html",
  "assets/logo.svg",
];
for (const file of required) read(file);

const html = read("index.html");
const js = read("app.js");
const sitemap = read("sitemap.xml");
const llms = read("llms.txt");

const hooks = ['id="check-form"', 'id="site-url"', 'id="lead-form"', 'id="lead-site"', 'id="result-heading"'];
for (const hook of hooks) {
  if (!html.includes(hook)) failures.push(`index.html lost hook ${hook}`);
}

for (const needle of ['type="application/ld+json"', 'rel="canonical"', 'name="description"', "app.js", "styles.css"]) {
  if (!html.includes(needle)) failures.push(`index.html missing ${needle}`);
}

for (const selector of ["#check-form", "#lead-form", "#site-url"]) {
  if (!js.includes(selector)) failures.push(`app.js no longer wires ${selector}`);
}

const placeholders = /lorem ipsum|TODO|FIXME|your-domain\.example/i;
if (placeholders.test(html) || placeholders.test(js)) failures.push("placeholder text found");

const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? "";
if (!canonical) failures.push("canonical URL not found");
if (canonical && !sitemap.includes(canonical)) failures.push(`sitemap does not list canonical ${canonical}`);
if (!llms.startsWith("# ")) failures.push("llms.txt must start with an H1");

// Local asset references must exist.
for (const match of html.matchAll(/(?:src|href)="((?:assets\/|styles\.css|app\.js)[^"]*)"/g)) {
  const target = match[1];
  if (!fs.existsSync(path.join(root, target))) failures.push(`broken local reference: ${target}`);
}

if (failures.length) {
  console.error("site check failed:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("site check OK — files, hooks, JSON-LD, canonical, sitemap and llms.txt");
