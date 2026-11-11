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
  const plans = page.locator(locale === "fr" ? "#offres" : "#plans");
  const pricingCopy = await plans.innerText();
  assert.match(pricingCopy, /39/, `${label}: Solo pilot price`);
  assert.match(pricingCopy, /149/, `${label}: Agency pilot price`);
  assert.match(pricingCopy, locale === "fr" ? /HT\/TTC/ : /VAT/, `${label}: VAT status is explicit`);
  const consoleLink = await plans.locator('a[href*="/console/"]').first().getAttribute("href");
  assert.match(consoleLink ?? "", new RegExp(`lang=${locale}`), `${label}: checkout CTA preserves language`);
  if (viewport.width > 1000) await plans.screenshot({ path: path.join(outputDir, `${label}-pricing.png`) });
  assert.deepEqual(errors, [], `${label}: no JS runtime exceptions`);
  return page;
}

/** Public console smoke: response fixture means no external domain is crawled. */
async function visitPublicConsole(browserInstance, locale, viewport, label) {
  const context = await browserInstance.newContext();
  const payload = {
    finalUrl: "https://example.com/", httpStatus: 200, score: 71, recoverablePoints: 29,
    checksSummary: { passed: 22, toImprove: 13, total: 35 },
    pageSignals: { title: "Example services for professionals", description: "Independent services for companies", htmlLang: "en", h1: ["Example services"], h2: ["How our services work", "Compare services"] },
    opportunities: [
      { checkId: "robots.citation_bots", category: "robots", priority: "high", status: "partial", points: 3, evidence: "5 citation crawlers need explicit rules", action: "Add explicit crawler rules" },
      { checkId: "schema.article", category: "schema", priority: "medium", status: "fail", points: 3, evidence: "No Article found", action: "Add Article schema" },
      { checkId: "brand.kg_readiness", category: "brand_entity", priority: "medium", status: "partial", points: 3, evidence: "1 sameAs link", action: "Add official sameAs profiles" },
      { checkId: "llms.found", category: "llms", priority: "high", status: "fail", points: 3, evidence: "No /llms.txt (HTTP 404)", action: "Publish llms.txt" },
      { checkId: "content.links", category: "content", priority: "low", status: "fail", points: 2, evidence: "0 external links", action: "Cite sources" },
    ],
    socialProfiles: [{ platform: "LinkedIn", url: "https://www.linkedin.com/company/example", source: "schema" }],
    tables: [
      { id: "seo.meta", title: "SEO — metadata", rows: [
        { label: "Title", value: "48 chars", status: "pass" },
        { label: "Canonical", value: "https://example.com/", status: "pass" },
        { label: "Robots meta", value: "index, follow (default)", status: "pass" },
      ] },
      { id: "gsc.readiness", title: "Search Console — indexation readiness", rows: [
        { label: "Sitemap", value: "15 URL(s)", status: "pass" },
        { label: "Indexability", value: "indexable", status: "pass" },
      ] },
    ],
  };
  await context.route("**/api/free-read", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize(viewport);
  const response = await page.goto(`${origin}/console/?lang=${locale}#c-public-read`, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200, `${label}: console loads`);
  await page.locator("#c-public-url").fill("https://example.com/");
  await page.locator("#c-public-url-form button").click();
  await page.locator(".public-domain").waitFor();
  assert.equal(await page.locator(".public-domain").innerText(), "example.com");
  assert.equal(await page.locator(".public-signal").count(), 4);
  const screenshotPrefix = `${locale}-console-${label}`;
  await page.screenshot({ path: path.join(outputDir, `${screenshotPrefix}-overview.png`), fullPage: true });
  const recommend = page.locator(".public-recommend-button");
  await recommend.click();
  assert.equal(await recommend.getAttribute("aria-expanded"), "true");
  assert.equal(await page.locator(".public-top-fixes .public-action-card").count(), 3);
  assert.equal(await page.locator(".public-action-card").count(), 8);
  assert.equal(await page.locator(".journey-stage").count(), 5);
  const intro = await page.locator(".journey-panel").innerText();
  assert.match(intro, locale === "fr" ? /hypothèses modifiables/ : /editable hypotheses/);
  await page.locator(".journey-context summary").click();
  await page.locator(".journey-context-fields input").first().fill(locale === "fr" ? "professionnels indépendants" : "independent professionals");
  await page.locator(".journey-context-fields button").click();
  assert.equal(await page.locator(".journey-stage").count(), 5);
  await page.screenshot({ path: path.join(outputDir, `${screenshotPrefix}-journey.png`), fullPage: true });
  await page.locator('.public-rank-mode[data-mode="impact"]').click();
  await page.locator(".public-action-details summary").first().click();
  const copy = await page.locator(".public-recommendations").innerText();
  assert.match(copy, locale === "fr" ? /L’IA recommande|points|effet/i : /AI recommends|points|effect/i);
  if (locale === "fr") assert.doesNotMatch(copy, /Add explicit crawler rules|Add Article schema/);
  const engines = page.locator(".public-engine img");
  assert.equal(await engines.count(), 6);
  assert.equal(await engines.evaluateAll((imgs) => imgs.every((img) => img.complete && img.naturalWidth > 0)), true, `${label}: engine logos load`);
  const sizing = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(sizing.scrollWidth <= sizing.width + 2, `${label}: horizontal overflow ${JSON.stringify(sizing)}`);
  await page.screenshot({ path: path.join(outputDir, `${screenshotPrefix}-recommendations.png`), fullPage: true });
  assert.deepEqual(errors, [], `${label}: no browser runtime errors`);
  await context.close();
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

  await visitPublicConsole(browser, "fr", desktop, "desktop");
  await visitPublicConsole(browser, "en", desktop, "desktop");
  await visitPublicConsole(browser, "fr", mobile, "mobile");
  await visitPublicConsole(browser, "en", mobile, "mobile");

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
  console.log(`QA OK: FR/EN landing + public console on desktop/mobile, recommended actions, evidence, logos, and language toggles. Screenshots: ${outputDir}`);
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
