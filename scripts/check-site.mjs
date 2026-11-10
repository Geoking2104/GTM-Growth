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
  "brand.css",
  "sitemap-map.css",
  "app.js",
  "locale-links.js",
  "fr/free-read.js",
  "fr/server-tables.js",
  "console/index.html",
  "console/locale-shell.js",
  "preview.js",
  "i18n.js",
  "tables.js",
  "indexnow.js",
  "console.js",
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
  "fr/assets/logo-rocket.png",
  "assets/screens/geo-board-en.svg",
  "reports/opendpe.html",
  "reports/opendpe.json",
  "reports/opendpe.pdf",
];
for (const file of required) read(file);

const html = read("index.html");
const frHtml = read("fr/index.html");
const js = read("app.js");
const frJs = read("fr/free-read.js");
const sitemap = read("sitemap.xml");
const llms = read("llms.txt");

const hooks = [
  'id="check-form"',
  'id="site-url"',
  'id="lead-form"',
  'id="lead-site"',
  'id="lead-company"',
  'id="result-heading"',
  'id="result-tables"',
  'id="tab-overview"',
  'id="panel-overview"',
];
for (const hook of hooks) {
  if (!html.includes(hook)) failures.push(`index.html lost hook ${hook}`);
}

// The French landing uses the same read engine as English, with a separate
// translated UI module; its lead form remains an inline handler.
for (const hook of ['id="url-form"', 'id="url-input"', 'id="lead-form"', 'id="lead-name"', 'id="lead-email"', 'id="lead-url"']) {
  if (!frHtml.includes(hook)) failures.push(`fr/index.html lost hook ${hook}`);
}
for (const behavior of ['id="read-result"', 'src="free-read.js"', 'class="lang-switch"', "getElementById('lead-form').addEventListener", "fetch('/api/lead'"]) {
  if (!frHtml.includes(behavior)) failures.push(`fr/index.html lost form behavior ${behavior}`);
}
for (const behavior of ['getElementById("url-form")', 'normalizeTarget', 'auditUrlShape', 'renderTables', 'translateLiveTables', '/api/free-read']) {
  if (!frJs.includes(behavior)) failures.push(`fr/free-read.js lost behavior ${behavior}`);
}
if (frHtml.includes("window.location.assign('/console/')")) failures.push("French free read still redirects to the login console");
if (!html.includes('href="brand.css"') || !frHtml.includes('href="../brand.css"')) failures.push("English and French must load the same brand stylesheet");
if (!html.includes('src="locale-links.js"') || !frHtml.includes('src="../locale-links.js"')) failures.push("Both landings must preserve language through Cloud console links");
if (!read("console/index.html").includes('src="locale-shell.js"')) failures.push("Console sign-in must localise its public shell");
for (const [page, name, amount, locale] of [[html, "EN", "€39", "en"], [frHtml, "FR", "39&nbsp;€", "fr"]]) {
  if (!page.includes(amount) || !page.includes(name === "FR" ? "149&nbsp;€" : "€149")) failures.push(`${name} landing must display the approved pilot Solo/Agency prices`);
  if (!page.includes(`/console/?lang=${locale}#billing`)) failures.push(`${name} billing CTA must preserve the language`);
}
for (const screenshot of ["geo-board.webp", "citability-main.webp", "free-sitemap.webp", "free-seo.webp", "free-ga4.webp", "free-gsc.webp", "search-perf.webp", "indexnow-main.webp"]) {
  if (html.includes(`src="assets/screens/${screenshot}"`) || html.includes(`srcset="assets/screens/${screenshot}"`)) {
    failures.push(`English landing includes a French-language screenshot: ${screenshot}`);
  }
}

for (const needle of ['type="application/ld+json"', 'rel="canonical"', 'name="description"', "app.js", "styles.css"]) {
  if (!html.includes(needle)) failures.push(`index.html missing ${needle}`);
}

for (const selector of ["#check-form", "#lead-form", "#site-url"]) {
  if (!js.includes(selector)) failures.push(`app.js no longer wires ${selector}`);
}
if (!js.includes("dictFor")) failures.push("app.js no longer loads the translation dictionary");

// The form must never hand the visitor to a mail client.
if (/mailto:/.test(js) || /mailto:/.test(html)) failures.push("the lead form still opens a mail client");
if (!js.includes("/api/lead")) failures.push("app.js no longer posts to /api/lead");
if (!js.includes("/api/free-read")) failures.push("app.js no longer calls /api/free-read");
for (const meta of ["gg-api", "gg-form"]) {
  if (!html.includes(`name="${meta}"`)) failures.push(`index.html missing the ${meta} meta`);
}
if (!js.includes("result-tables")) failures.push("app.js no longer renders the tables");
if (!html.includes("/console/#indexnow") || !frHtml.includes("/console/#indexnow")) failures.push("landing pages no longer link to IndexNow in the console");
if (!read("console/app.js").includes("renderIndexNow")) failures.push("console no longer initialises IndexNow");
if (!js.includes("initConsole")) failures.push("app.js no longer initialises the console");
if (!html.includes("reports/opendpe.html")) failures.push("index.html no longer links the sample report");
const reportHtml = read("reports/opendpe.html");
if (!reportHtml.includes("opendpe.pdf")) failures.push("sample report no longer links its PDF");

const placeholders = /lorem ipsum|TODO|FIXME|your-domain\.example/i;
if (placeholders.test(html) || placeholders.test(js) || placeholders.test(frHtml)) {
  failures.push("placeholder text found");
}

const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? "";
if (!canonical) failures.push("canonical URL not found");
if (!canonical.startsWith("https://gtm.kayroslab.com/")) failures.push("English canonical must use the live GTM domain");
if (canonical && !sitemap.includes(canonical)) failures.push(`sitemap does not list canonical ${canonical}`);
if (!llms.startsWith("# ")) failures.push("llms.txt must start with an H1");

// Language pair
const frCanonical = frHtml.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? "";
if (!frHtml.includes('<html lang="fr">')) failures.push("fr/index.html must declare lang=fr");
if (!frCanonical.endsWith("/fr/")) failures.push("fr/index.html canonical must end with /fr/");
if (frCanonical !== "https://gtm.kayroslab.com/fr/") failures.push("French canonical must use the live GTM domain");
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
  for (const match of page.matchAll(/(?:src|srcset|href)="((?:\.\.\/)?(?:assets\/|fr\/assets\/|styles\.css|brand\.css|sitemap-map\.css|app\.js|free-read\.js)[^"]*)"/g)) {
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
