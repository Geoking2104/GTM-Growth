#!/usr/bin/env node
/** Local bilingual visual regression smoke test (requires local Chromium).
 * Run: node scripts/qa-landing.mjs
 * Screenshots are generated outside the git worktree by default. */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { get as httpGet } from "node:http";
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import { chromium } from "playwright-core";

const root = process.cwd();
const outputDir = path.resolve(process.env.LANDING_QA_OUTPUT_DIR || "../qa-landing");
const port = 18000 + Math.floor(Math.random() * 9000);
const origin = `http://127.0.0.1:${port}`;
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", path.join(root, "site")], { stdio: "ignore" });
let browser;
const failures = [];

async function ready() {
  for (let attempts = 0; attempts < 50; attempts++) {
    if (server.exitCode !== null) throw new Error("Static preview server exited unexpectedly");
    try {
      const status = await new Promise((resolve, reject) => {
        const request = httpGet(origin, (response) => { response.resume(); resolve(response.statusCode); });
        request.on("error", reject);
      });
      if (status === 200) return;
    } catch { /* startup in progress */ }
    await wait(100);
  }
  throw new Error("Static preview server did not start");
}

async function visit(browserContext, locale, label, viewport) {
  const page = await browserContext.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Check the first-visit consent journey independently for every locale.
  await page.addInitScript(() => localStorage.removeItem("gtm-growth-privacy-v1"));
  await page.setViewportSize(viewport);
  const response = await page.goto(`${origin}/${locale === "fr" ? "fr/" : ""}`, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200, `${label} homepage loaded`);
  assert.equal(await page.locator("html").getAttribute("lang"), locale, `${label} correct html lang`);
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), `https://gtm.kayroslab.com/${locale === "fr" ? "fr/" : ""}`);
  await page.evaluate(() => document.fonts.ready);
  const sizing = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth }));
  assert.ok(sizing.documentWidth <= sizing.width + 2, `${label}: horizontal overflow ${JSON.stringify(sizing)}`);
  const logo = page.locator(locale === "fr" ? ".nav .logo-mark" : ".site-header .brand img");
  assert.ok(await logo.evaluate((img) => img.complete && img.naturalWidth > 0), `${label}: logo must load`);
  const langTarget = locale === "fr" ? "en" : "fr";
  assert.equal(await page.locator(`a[hreflang="${langTarget}"]`).count() > 0, true);
  const privacy = page.locator(".privacy-banner");
  await privacy.waitFor({ state: "visible" });
  assert.equal(await privacy.locator("strong").textContent(), locale === "fr" ? "Vos préférences de confidentialité" : "Your privacy preferences");
  await page.screenshot({ path: path.join(outputDir, `${label}-privacy.png`) });
  await privacy.getByRole("button", { name: locale === "fr" ? "Refuser" : "Reject" }).click();
  await privacy.waitFor({ state: "hidden" });
  await page.screenshot({ path: path.join(outputDir, `${label}.png`) });
  assert.deepEqual(errors, [], `${label}: no JS runtime exceptions`);
  return page;
}

try {
  await fs.mkdir(outputDir, { recursive: true });
  await ready();
  const browserExecutable = process.env.CHROMIUM_BIN || (existsSync(chromium.executablePath()) ? chromium.executablePath() : "/usr/bin/chromium");
  browser = await chromium.launch({ executablePath: browserExecutable, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({ locale: "fr-FR" });
  await context.route("**/api/free-read", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"preview unavailable"}' }));

  const desktop = { width: 1440, height: 900 };
  const mobile = { width: 390, height: 844 };
  const en = await visit(context, "en", "en-desktop", desktop);
  const fr = await visit(context, "fr", "fr-desktop", desktop);

  // French read: instant URL analysis, no identity wall; sample fallback explicit.
  await fr.locator("#url-input").fill("not a url");
  await fr.locator("#url-form button").click();
  assert.match(await fr.locator("#form-msg").innerText(), /URL|hôte|domaine/i);
  await fr.locator("#url-input").fill("example.com");
  await fr.locator("#url-form button").click();
  await fr.locator("#read-result .gg-checks li").first().waitFor();
  assert.equal(await fr.locator("#read-result .gg-checks li").count(), 10);
  await fr.getByText("Lecture serveur momentanément indisponible.", { exact: false }).waitFor();
  assert.match(await fr.locator("#read-result").innerText(), /EXEMPLES/);
  assert.ok(fr.url().endsWith("/fr/"), "French free read remains on landing");
  await fr.screenshot({ path: path.join(outputDir, "fr-result.png") });

  // English read still works on the same unmodified engine.
  await en.locator("#site-url").fill("example.com");
  await en.locator("#check-form button").click();
  await en.locator("#check-list li").first().waitFor();
  assert.equal(await en.locator("#check-list li").count(), 10);
  await en.screenshot({ path: path.join(outputDir, "en-result.png") });

  // The FR server rows remain translated when a real response arrives.
  const measured = await browser.newContext();
  await measured.route("**/api/free-read", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ score: 71, projectedScore: 100, durationMs: 117, tables: [{ id: "seo.meta", title: "SEO — metadata", rows: [{ label: "Title", value: "48 chars", status: "pass", note: "Indexable." }] }] }) }));
  const frMeasured = await measured.newPage();
  await frMeasured.goto(`${origin}/fr/`);
  await frMeasured.locator("#url-input").fill("example.com");
  await frMeasured.locator("#url-form button").click();
  await frMeasured.getByText("Score GEO mesuré : 71/100").waitFor();
  assert.match(await frMeasured.locator("#read-result").innerText(), /SEO — métadonnées/);
  assert.match(await frMeasured.locator("#read-result").innerText(), /48 caractères/);
  await frMeasured.screenshot({ path: path.join(outputDir, "fr-measured.png") });

  const enMobile = await visit(context, "en", "en-mobile", mobile);
  const frMobile = await visit(context, "fr", "fr-mobile", mobile);
  await frMobile.locator(".mobile-nav summary").click();
  assert.ok(await frMobile.locator('.mobile-nav a[href="#faq"]').isVisible(), "French mobile menu opens");
  await frMobile.screenshot({ path: path.join(outputDir, "fr-mobile-menu.png") });
  await frMobile.locator('.lang-switch a[hreflang="en"]').click();
  await frMobile.waitForURL(origin + "/");
  assert.equal(await frMobile.locator("html").getAttribute("lang"), "en", "FR to EN navigation works");
  await enMobile.locator('.lang a[hreflang="fr"]').click();
  await enMobile.waitForURL(origin + "/fr/");
  assert.equal(await enMobile.locator("html").getAttribute("lang"), "fr", "EN to FR navigation works");

  for (const page of [en, fr, frMeasured, enMobile, frMobile]) await page.close();
  await measured.close();
  await context.close();
  console.log(`QA OK: FR/EN desktop + mobile, URL read, measured/fallback states, language toggles. Screenshots: ${outputDir}`);
} catch (error) {
  failures.push(error.stack || String(error));
} finally {
  await browser?.close().catch(() => undefined);
  server.kill("SIGTERM");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
