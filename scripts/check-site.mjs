#!/usr/bin/env node
/**
 * Static checks for the landing site.
 *
 * Catches the failures that a marketing page actually ships with: a missing
 * asset, a form hook renamed in the HTML but not in the JS, placeholder copy,
 * a canonical URL that disagrees with the sitemap, or a broken language pair.
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
  "fr/index.html",
  "styles.css",
  "app.js",
  "preview.js",
  "i18n.js",
  "robots.txt",
  "sitemap.xml",
  "llms.txt",
  "llms-full.txt",
  "ai/summary.json",
  "ai/faq.json",
  "ai/service.json",
  ".well-known/ai.txt",
  "404.html",
  "assets/logo.png",
  "assets/logo-128.png",
  "assets/logo-64.png",
  "reports/opendpe.html",
  "reports/opendpe.json",
  "reports/opendpe.pdf",
];
for (const file of required) read(file);

const html = read("index.html");
const frHtml = read("fr/index.html");
const js = read("app.js");
const sitemap = read("sitemap.xml");
const llms = read("llms.txt");

const hooks = ['id="check-form"', 'id="site-url"', 'id="lead-form"', 'id="lead-site"', 'id="result-heading"'];
for (const hook of hooks) {
  if (!html.includes(hook)) failures.push(`index.html lost hook ${hook}`);
  if (!frHtml.includes(hook)) failures.push(`fr/index.html lost hook ${hook}`);
}

for (const needle of ['type="application/ld+json"', 'rel="canonical"', 'name="description"', "app.js", "styles.css"]) {
  if (!html.includes(needle)) failures.push(`index.html missing ${needle}`);
}

for (const selector of ["#check-form", "#lead-form", "#site-url"]) {
  if (!js.includes(selector)) failures.push(`app.js no longer wires ${selector}`);
}
if (!js.includes("dictFor")) failures.push("app.js no longer loads the translation dictionary");
if (!html.includes("reports/opendpe.html")) failures.push("index.html no longer links the sample report");
const reportHtml = read("reports/opendpe.html");
if (!reportHtml.includes("opendpe.pdf")) failures.push("sample report no longer links its PDF");

const placeholders = /lorem ipsum|TODO|FIXME|your-domain\.example/i;
if (placeholders.test(html) || placeholders.test(js) || placeholders.test(frHtml)) {
  failures.push("placeholder text found");
}

const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? "";
if (!canonical) failures.push("canonical URL not found");
if (canonical && !sitemap.includes(canonical)) failures.push(`sitemap does not list canonical ${canonical}`);
if (!llms.startsWith("# ")) failures.push("llms.txt must start with an H1");

// Language pair
const frCanonical = frHtml.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? "";
if (!frHtml.includes('<html lang="fr">')) failures.push("fr/index.html must declare lang=fr");
if (!frCanonical.endsWith("/fr/")) failures.push("fr/index.html canonical must end with /fr/");
if (!sitemap.includes(frCanonical)) failures.push(`sitemap does not list ${frCanonical}`);
for (const page of [html, frHtml]) {
  if (!page.includes('hreflang="en"')) failures.push("missing hreflang=en alternate");
  if (!page.includes('hreflang="fr"')) failures.push("missing hreflang=fr alternate");
}

// Local asset references must exist (resolve relative to the page folder).
for (const [page, base] of [
  [html, ""],
  [frHtml, "fr"],
]) {
  for (const match of page.matchAll(/(?:src|href)="((?:\.\.\/)?(?:assets\/|styles\.css|app\.js)[^"]*)"/g)) {
    const target = path.normalize(path.join(base, match[1]));
    if (!fs.existsSync(path.join(root, target))) failures.push(`broken local reference: ${match[1]} in ${base || "."}`);
  }
}

if (failures.length) {
  console.error("site check failed:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("site check OK — files, hooks, JSON-LD, canonical, sitemap, llms.txt and the en/fr pair");
