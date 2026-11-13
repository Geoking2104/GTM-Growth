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
  const planner = page.locator("#local-seo-planner");
  await planner.waitFor();
  await planner.locator("select").selectOption("web-only");
  assert.match(await planner.innerText(), locale === "fr" ? /non applicables/ : /not applicable/);
  assert.match(await planner.locator("a").getAttribute("href"), new RegExp(`lang=${locale}`));
  await planner.locator("select").selectOption("service-area");
  assert.match(await planner.innerText(), locale === "fr" ? /adresse privée/ : /private address/);
  await page.evaluate(() => document.fonts.ready);
  const sizing = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth }));
  assert.ok(sizing.documentWidth <= sizing.width + 2, `${label}: horizontal overflow ${JSON.stringify(sizing)}`);
  const logo = page.locator(".site-header .brand img");
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
  const plans = page.locator("#offres");
  const pricingCopy = await plans.innerText();
  assert.match(pricingCopy, /39/, `${label}: Solo pilot price`);
  assert.match(pricingCopy, /149/, `${label}: Agency pilot price`);
  assert.match(pricingCopy, locale === "fr" ? /HT\/TTC/ : /VAT/, `${label}: VAT status is explicit`);
  assert.equal(await plans.locator('a[href="#contact"]').count(), 3, `${label}: pilot and support CTAs lead to contact, not inactive checkout`);
  if (viewport.width > 1000) await plans.screenshot({ path: path.join(outputDir, `${label}-pricing.png`) });
  await page.locator('[data-profile="growth"]').click();
  assert.equal(await page.locator('#journey-recommendation a').count(), 4);
  assert.equal(await page.locator('[data-stage="understand"]').getAttribute('aria-pressed'), 'true');
  await page.locator('#feature-query').fill('zzzz-no-match');
  assert.equal(await page.locator('[data-feature]:visible').count(), 0);
  await page.locator('#feature-reset').click();
  assert.equal(await page.locator('[data-feature]:visible').count(), 31);
  await page.locator('#feature-query').fill('Slack');
  assert.equal(await page.locator('[data-feature]:visible').count(), 1);
  assert.ok((await page.locator('#feature-slack a').getAttribute('href')).endsWith(`/console/?lang=${locale}#overview`));
  await page.locator('#feature-query').fill('');
  await page.locator('[data-stage="diagnose"]').press('Enter');
  assert.equal(await page.locator('[data-feature]:visible').count(), 5);
  await page.locator('#features').screenshot({ path: path.join(outputDir, `${label}-feature-explorer.png`) });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `${label}: explorer has no overflow`);
  await page.goto(`${origin}/${locale === 'fr' ? 'fr/' : ''}`);
  await page.getByRole('button', { name: locale === 'fr' ? 'Refuser' : 'Reject', exact: true }).click();
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
  const recommend = page.locator('.public-recommend-button[aria-controls="c-public-ranked"]');
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
  // Lazy images below the longer mobile journey load when brought into view.
  for (const engine of await engines.all()) {
    await engine.scrollIntoViewIfNeeded();
    await engine.evaluate(img => img.decode());
  }
  assert.equal(await engines.evaluateAll((imgs) => imgs.every((img) => img.complete && img.naturalWidth > 0)), true, `${label}: engine logos load`);
  const sizing = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(sizing.scrollWidth <= sizing.width + 2, `${label}: horizontal overflow ${JSON.stringify(sizing)}`);
  await page.screenshot({ path: path.join(outputDir, `${screenshotPrefix}-recommendations.png`), fullPage: true });
  assert.deepEqual(errors, [], `${label}: no browser runtime errors`);
  await context.close();
}

async function visitLocalSeoWorkspace(browser, locale) {
  const context = await browser.newContext({ locale: locale === "fr" ? "fr-FR" : "en-GB" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/local-seo-qa.html*", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/brand.css"><link rel="stylesheet" href="/console/shell.css"><link rel="stylesheet" href="/local-seo.css"></head><body class="console-page"><main class="app c-app"><section class="c-panel" id="qa"></section></main></body></html>` }));
  await page.goto(`${origin}/local-seo-qa.html?lang=${locale}`);
  await page.evaluate(async () => {
    const { renderLocalSeo } = await import("/console/local-seo-network.js");
    const state = { sites: [{id:"brussels",name:"Brussels",country:"BE",languages:["fr-BE","nl-BE"],kind:"physical",timezone:"Europe/Brussels"}], observations: [], actions: [], comparisons: [], controls: [{siteId:"brussels",summary:{coverage:0,reliable:false},findings:Array.from({length:24},(_,i)=>({id:`LOC-${String(i+1).padStart(2,"0")}`,status:"unknown",reason:"missing-evidence",evidence:[],provenance:[]}))}], publications:[{id:"fixture",siteId:"brussels",language:"fr-BE",status:"draft",before:"https://example.com/old",change:{field:"websiteUri",value:"https://example.com/new"},digest:"fixture"}] };
    document.getElementById("qa").append(await renderLocalSeo({ me: {role:"tenant-admin",tenant:{name:"QA network",domains:["example.com"]}}, api: async () => state }));
  });
  const root = page.locator(".local-seo-workspace");
  assert.match(await root.innerText(), locale === "fr" ? /SEO global et local/ : /Global and local SEO/);
  assert.match(await root.innerText(), /BE · fr-BE, nl-BE/);
  await root.locator("summary").filter({hasText: /Brussels — 24/}).click();
  assert.equal(await root.locator(".local-seo-operations li").count(),24);
  assert.match(await root.innerText(),locale === "fr" ? /Preuve manquante/ : /Missing evidence/);
  assert.ok(await root.getByRole("button",{name:locale === "fr" ? "Approuver ce diff" : "Approve this diff",exact:true}).isVisible());
  await root.locator("summary").filter({hasText: locale === "fr" ? "Importer et organiser" : "Import and organise"}).click();
  assert.ok(await root.locator('input[type="file"]').isVisible());
  await root.screenshot({ path: path.join(outputDir, `${locale}-local-seo-workspace.png`) });
  assert.deepEqual(errors, []);
  await context.close();
}


async function verifySharedLanding(en, fr) {
  const shape = page => page.evaluate(() => ({
    sections: [...document.querySelectorAll("main > section, main > header")].map(n => n.id),
    stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map(n => new URL(n.href).pathname),
    scripts: [...document.querySelectorAll('script[src]')].map(n => new URL(n.src).pathname),
    styles: [".site-header", ".hero", ".hero-inner", ".block", ".plan", ".check-form"].map(selector => {
      const s = getComputedStyle(document.querySelector(selector));
      return [s.backgroundColor,s.backgroundImage,s.color,s.fontFamily,s.display,s.borderRadius,s.padding];
    }),
    cards: ["#ops .loop-node", "#roadmap .phase", "#toolkit .lever", "#faq details"].map(q => document.querySelectorAll(q).length),
  }));
  assert.deepEqual(await shape(en), await shape(fr), "Both locales have the English visual system, complete French sections and identical behaviors");
}

async function verifyLeadFlow(page, locale) {
  const requests = [];
  await page.route("**/api/lead", route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({status:200,contentType:"application/json",body:'{"ok":true}'});
  });
  await page.locator('#lead-form button').click();
  assert.equal(requests.length,0,"Invalid forms must not be sent");
  assert.match(await page.locator('#lead-msg-status').innerText(),locale==='fr'?/invalides/:/invalid/);
  await page.locator('#lead-name').fill('QA Example');
  await page.locator('#lead-email').fill('qa@example.com');
  await page.locator('#lead-url').fill('https://example.com/');
  await page.locator('#lead-form button').click();
  await page.getByText(locale==='fr'?'Votre demande a bien été enregistrée.':'Your request has been recorded.',{exact:true}).waitFor();
  assert.equal(requests.length,1);
  assert.equal(requests[0].source,`landing-${locale}`);
  assert.equal(requests[0].website,'https://example.com/');
  assert.ok(await page.locator('#lead-form button').isEnabled());
  await page.unroute('**/api/lead');
  await page.route('**/api/lead',route=>route.fulfill({status:503,body:'unavailable'}));
  await page.locator('#lead-name').fill('QA Example');
  await page.locator('#lead-email').fill('qa@example.com');
  await page.locator('#lead-url').fill('https://example.com/');
  await page.locator('#lead-form button').click();
  await page.getByText(locale==='fr'?'L’envoi a échoué. Veuillez réessayer.':'Sending failed. Please try again.',{exact:true}).waitFor();
  assert.equal(await page.locator('#lead-email').inputValue(),'qa@example.com','Failed send keeps the visitor input');
}

try {
  await fs.mkdir(outputDir, { recursive: true });
  await ready();
  const browserExecutable = process.env.CHROMIUM_BIN || (existsSync(chromium.executablePath()) ? chromium.executablePath() : "/usr/bin/chromium");
  browser = await chromium.launch({ executablePath: browserExecutable, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  await visitLocalSeoWorkspace(browser, "fr");
  await visitLocalSeoWorkspace(browser, "en");
  const context = await browser.newContext({ locale: "fr-FR" });
  await context.route("**/api/free-read", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"preview unavailable"}' }));

  const desktop = { width: 1440, height: 900 };
  const mobile = { width: 390, height: 844 };
  const en = await visit(context, "en", "en-desktop", desktop);
  const fr = await visit(context, "fr", "fr-desktop", desktop);
  await verifySharedLanding(en, fr);
  await verifyLeadFlow(en, "en");
  await verifyLeadFlow(fr, "fr");
  for (const [page, locale] of [[en,"en"],[fr,"fr"]]) {
    await page.goto(`${origin}/${locale === "fr" ? "fr/" : ""}#ops`);
    await page.getByRole("button", { name: locale === "fr" ? "Refuser" : "Reject", exact: true }).click();
    await page.locator("#ops").screenshot({path:path.join(outputDir,`${locale}-ops.png`)});
    await page.goto(`${origin}/${locale === "fr" ? "fr/" : ""}#roadmap`);
    await page.locator("#roadmap").screenshot({path:path.join(outputDir,`${locale}-roadmap.png`)});
    await page.goto(`${origin}/${locale === "fr" ? "fr/" : ""}`);
    await page.getByRole("button", { name: locale === "fr" ? "Refuser" : "Reject", exact: true }).click();
  }

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
  await en.locator("#url-input").fill("example.com");
  await en.locator("#url-form button").click();
  await en.locator("#read-result .gg-checks li").first().waitFor();
  assert.equal(await en.locator("#read-result .gg-checks li").count(), 10);
  await en.screenshot({ path: path.join(outputDir, "en-result.png") });

  // The FR server rows remain translated when a real response arrives.
  const measured = await browser.newContext();
  await measured.route("**/api/free-read", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ score: 71, projectedScore: 100, durationMs: 117, opportunities: [{ checkId: "llms.found", category: "llms", priority: "high", status: "fail", points: 3, evidence: "No llms.txt (HTTP 404)" }], tables: [{ id: "seo.meta", title: "SEO — metadata", rows: [{ label: "Title", value: "48 chars", status: "pass", note: "Indexable." }] }] }) }));
  const frMeasured = await measured.newPage();
  await frMeasured.goto(`${origin}/fr/`);
  await frMeasured.locator("#url-input").fill("example.com");
  await frMeasured.locator("#url-form button").click();
  await frMeasured.getByText("Score GEO mesuré : 71/100").waitFor();
  assert.match(await frMeasured.locator("#read-result").innerText(), /SEO — métadonnées/);
  assert.match(await frMeasured.locator("#read-result").innerText(), /48 caractères/);
  assert.equal(await frMeasured.locator(".landing-next-actions li").count(), 1);
  assert.equal(await frMeasured.locator(".gg-next").getAttribute("href"), "/console/?lang=fr#c-public-read");
  await frMeasured.screenshot({ path: path.join(outputDir, "fr-measured.png") });

  await visitPublicConsole(browser, "fr", desktop, "desktop");
  await visitPublicConsole(browser, "en", desktop, "desktop");
  await visitPublicConsole(browser, "fr", mobile, "mobile");
  await visitPublicConsole(browser, "en", mobile, "mobile");

  const enMobile = await visit(context, "en", "en-mobile", mobile);
  const frMobile = await visit(context, "fr", "fr-mobile", mobile);
  await verifySharedLanding(enMobile,frMobile);
  for (const locale of ["en", "fr"]) { const narrow = await visit(context, locale, `${locale}-narrow`, { width: 375, height: 812 }); await narrow.close(); }
  await frMobile.locator(".nav-menu summary").click();
  assert.ok(await frMobile.locator('.nav-dropdown a[href="#faq"]').isVisible(), "French mobile menu opens");
  await frMobile.screenshot({ path: path.join(outputDir, "fr-mobile-menu.png") });
  await frMobile.locator('.lang a[hreflang="en"]').click();
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
