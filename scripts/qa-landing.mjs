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
import { chromium, devices, firefox, webkit } from "playwright-core";

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

// Fragment navigation and input focus must never scroll the hero independently of the page.
// Verify the visible artwork, its local asset and its reserved space on each public surface.
async function verifyCardIllustrations(browser) {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const routes = [
    ['/fr/#offres', '.pricing-grid .plan', ['apply_mode', 'billing', 'overview', 'assistant']],
    ['/#platform', '.vh-depth-grid > a', ['catalog', 'apply_mode', 'tracking']],
    ['/guides/marketing/', '.evidence-lanes article', ['prompts', 'ga4', 'crm']],
    ['/fr/guides/technical/', '.availability-list article', ['public', 'tracking', 'apply_mode']],
    ['/console/', '.public-login-card', ['agents']],
    ['/report/', '.report-gate', ['agents']],
    ['/reports/opendpe.html', '.dash > .panel', ['rank', 'ai_visibility', 'audit', 'citability', 'overview']],
  ];
  for (const [width, height] of [[375,812], [1440,900]]) {
    await page.setViewportSize({width, height});
    for (const [route, selector, topics] of routes) {
      await page.goto(origin + route);
      const cards = page.locator(selector);
      await cards.first().waitFor();
      const rendered = await cards.evaluateAll(async nodes => Promise.all(nodes.map(async card => {
        const band = getComputedStyle(card, '::after');
        const file = band.backgroundImage.match(/url\("([^"]+\.webp)"\)/)?.[1];
        if (!file) throw new Error('Missing illustration on ' + card.className);
        const img = new Image(); img.src = file; await img.decode();
        return {
          topic: new URL(file).pathname.split('/').pop().replace('.webp',''),
          fits: parseFloat(getComputedStyle(card).paddingTop) >= parseFloat(band.height) && parseFloat(band.height) > 0,
          local: new URL(file).origin === location.origin,
        };
      })));
      assert.deepEqual(rendered.map(item => item.topic), topics, route + ' artwork');
      assert.ok(rendered.every(item => item.local && item.fits), route + ' art stays above content');
    }
  }
  await page.close();
}

const auditViewports = [[320,568], [390,844], [650,900], [651,900], [768,1024], [844,390], [1024,768], [1440,900], [2048,1152]];

async function verifyAuditPlacement(browser, locale, viewports = auditViewports, device = {}) {
  const page = await browser.newPage({ ...device, reducedMotion: 'reduce' });
  const home = origin + (locale === 'fr' ? '/fr/' : '/');
  await page.route('**/api/free-read', route => route.fulfill({
    status: 503, contentType: 'application/json', body: '{"error":"offline test"}',
  }));
  await page.goto(home);
  await page.getByRole('button', { name: locale === 'fr' ? 'Refuser' : 'Reject', exact: true }).click();
  for (const [width, height] of viewports) {
    const label = locale + ' ' + width + '×' + height;
    await page.setViewportSize({ width, height });
    await page.goto(home + '#ops');
    await page.locator('#ops').waitFor();
    await page.locator('a[href="#url-form"]:visible').first().click();
    await page.waitForURL(home + '#url-form');
    // Reopening the bookmark also exercises initial fragment placement after fonts load.
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#url-input').focus();
    const layout = await page.evaluate(() => {
      const hero = document.querySelector('.vh-hero');
      const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
      return {
        header: rect('.site-header'), input: rect('#url-input'), button: rect('#url-form button'),
        blank: hero.getBoundingClientRect().bottom - rect('.hero-copy > .vh-text-link').bottom,
        innerScroll: hero.scrollTop, pageWidth: document.documentElement.scrollWidth,
      };
    });
    const { header, input, button } = layout;
    assert.equal(layout.innerScroll, 0, label + ' unexpected internal hero scrolling: ' + JSON.stringify(layout));
    assert.ok(layout.blank < 64, label + ' gap below the form: ' + layout.blank);
    assert.ok(input.top >= Math.max(0, header.bottom) + 4, label + ' header overlaps the field');
    assert.ok(button.bottom <= height && input.left >= 0 && button.right <= width + 1 && layout.pageWidth <= width + 1, label + ' controls must fit');
    assert.ok(Math.min(input.height, button.height) >= 44, label + ' touch target size');
    if (width <= 650) {
      assert.ok(button.top >= input.bottom && Math.abs(button.width - input.width) <= 1, label + ' stacked controls');
    } else {
      assert.ok(button.left >= input.right && Math.abs(button.top - input.top) <= 1 && Math.abs(button.height - input.height) <= 1, label + ' aligned controls');
    }
    await page.locator('#url-input').fill('not a url');
    await page.locator('#url-input').press('Enter');
    assert.ok((await page.locator('#form-msg').innerText()).length > 0, label + ' validation feedback');
    await page.locator('#url-input').fill('example.com');
    await page.locator('#url-input').press('Enter');
    await page.locator('#read-result .gg-checks li').first().waitFor();
    const result = await page.locator('#read-result').boundingBox();
    const headerAfter = await page.locator('.site-header').boundingBox();
    assert.ok(result.y >= Math.max(0, headerAfter.y + headerAfter.height) && result.y < height / 2, label + ' results visible after submitting');
  }
  await page.close();
}

async function verifyCarousel(browser, locale, viewport) {
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto(`${origin}/${locale === 'fr' ? 'fr/' : ''}#console`);
  await page.getByRole('button', { name: locale === 'fr' ? 'Refuser' : 'Reject', exact: true }).click();
  const reel = page.locator('[data-product-demo]');
  const selected = reel.locator('[role="tab"][aria-selected="true"]');
  await reel.scrollIntoViewIfNeeded();
  await page.clock.fastForward(7000);
  assert.equal(await selected.getAttribute('id'), 'tab-search', 'reduced motion keeps the first scene still');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('[data-product-demo].vh-playing').waitFor();
  await reel.hover();
  await page.clock.fastForward(7000);
  assert.equal(await selected.getAttribute('id'), 'tab-ai', 'the visible reel advances automatically');

  const manual = reel.locator('#tab-local');
  await manual.click();
  await manual.blur();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(14000);
  assert.equal(await selected.getAttribute('id'), 'tab-local', 'manual selection holds after focus and pointer leave');
  assert.equal(await page.locator('#demo-local').isVisible(), true);
  await page.close();
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
  await page.locator("#local-preview > summary").click();
  const planner = page.locator("#local-seo-planner");
  await planner.waitFor();
  await planner.locator("select").selectOption("web-only");
  assert.match(await planner.innerText(), locale === "fr" ? /non applicables/ : /not applicable/);
  assert.match(await planner.locator("a").getAttribute("href"), new RegExp(`lang=${locale}`));
  await planner.locator("select").selectOption("service-area");
  assert.match(await planner.innerText(), locale === "fr" ? /adresse privée/ : /private address/);
  await page.locator("#local-preview > summary").click();
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".brand").click();
  const sizing = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth }));
  assert.ok(sizing.documentWidth <= sizing.width + 2, `${label}: horizontal overflow ${JSON.stringify(sizing)}`);
  const urlFieldHeight = await page.locator('#url-input').evaluate(input => input.getBoundingClientRect().height);
  assert.ok(urlFieldHeight >= 44 && urlFieldHeight <= 80, `${label}: URL field remains a compact touch target (${urlFieldHeight}px)`);
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
  await page.locator('#contact').screenshot({ path: path.join(outputDir, `${label}-contact.png`), style: '.site-header { visibility: hidden !important; }' });
  // Exercise the actual product reel, including its routes and accessibility contract.
  const sceneIds = ['search', 'ai', 'local', 'social', 'crm', 'decide'];
  for (const id of sceneIds) {
    await page.locator(`#tab-${id}`).click();
    assert.equal(await page.locator('[role="tabpanel"]:visible').count(), 1);
    assert.equal(await page.locator(`#tab-${id}`).getAttribute('aria-selected'), 'true');
    const href = await page.locator(`#demo-${id} .vh-action`).getAttribute('href');
    const target = new URL(href, origin);
    assert.equal(target.origin, origin);
    if (id === 'search') assert.equal(target.hash, '#url-form');
    else { assert.equal(target.pathname, '/console/'); assert.equal(target.searchParams.get('lang'), locale); assert.ok(target.hash); }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `${label}: ${id} has no overflow`);
    if (viewport.width > 1000) await page.locator('#console').screenshot({ path: path.join(outputDir, `${label}-scene-${id}.png`) });
  }
  await page.locator('#tab-decide').press('Home');
  assert.equal(await page.locator('#tab-search').getAttribute('aria-selected'), 'true');
  await page.locator('#tab-search').press('ArrowRight');
  assert.equal(await page.locator('#tab-ai').getAttribute('aria-selected'), 'true');
  await page.locator('#tab-ai').press('End');
  assert.equal(await page.locator('#tab-decide').getAttribute('aria-selected'), 'true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#tab-search').click();
  await page.locator('#console').screenshot({ path: path.join(outputDir, `${label}-product.png`) });
  await page.goto(`${origin}/${locale === 'fr' ? 'fr/' : ''}#features`);
  // A fragment-only navigation keeps the existing consent decision.
  if (await page.locator('.privacy-banner').isVisible()) await page.getByRole('button', { name: locale === 'fr' ? 'Refuser' : 'Reject', exact: true }).click();
  assert.equal(await page.locator('#tool-explorer').evaluate(node => node.open), true, 'bookmarked catalogue opens its disclosure');
  await page.locator('#tool-explorer > summary').click();
  const plans = page.locator("#offres");
  const pricingCopy = await plans.innerText();
  assert.match(pricingCopy, /39/, `${label}: Solo pilot price`);
  assert.match(pricingCopy, /149/, `${label}: Agency pilot price`);
  assert.match(pricingCopy, locale === "fr" ? /HT\/TTC/ : /VAT/, `${label}: VAT status is explicit`);
  assert.equal(await plans.locator('a[href="#contact"]').count(), 3, `${label}: pilot and support CTAs lead to contact, not inactive checkout`);
  if (viewport.width > 1000) await plans.screenshot({ path: path.join(outputDir, `${label}-pricing.png`) });
  await page.locator('#tool-explorer > summary').click();
  await page.locator('[data-profile="growth"]').click();
  assert.equal(await page.locator('#journey-recommendation a').count(), 4);
  assert.equal(await page.locator('[data-stage="understand"]').getAttribute('aria-pressed'), 'true');
  await page.locator('#feature-query').fill('zzzz-no-match');
  assert.equal(await page.locator('[data-feature]:visible').count(), 0);
  await page.locator('#feature-reset').click();
  assert.equal(await page.locator('[data-feature]:visible').count(), 35);
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
function v2ReportFixture() {
  const categories = { robots: ["R", 5], llms: ["L", 6], jsonld: ["J", 6], meta: ["M", 5], content: ["C", 8], brand: ["B", 5], discovery: ["D", 3], rendering: ["P", 4] };
  const controls = Object.entries(categories).flatMap(([category, [prefix, count]]) =>
    Array.from({ length: count }, (_, index) => {
      const controlId = `${prefix}${String(index + 1).padStart(2, "0")}`;
      const measured = ["R01", "M01"].includes(controlId);
      return {
        controlId, title: controlId === "M01" ? "Descriptive title" : `Reviewed control ${controlId}`, category,
        status: measured ? "measured" : "unknown",
        outcome: controlId === "R01" ? "pass" : measured ? "review" : "unknown",
        proof: measured ? { type: "extract", value: controlId === "M01" ? "No descriptive title observed" : "robots.txt HTTP 200", url: "https://example.com/" } : null,
        reason: measured ? null : "Requires additional independent evidence",
      };
    }));
  const observedAt = "2026-11-16T12:00:00Z", sourceUrl = "https://example.com/";
  return {
    schemaVersion: 1, method: "geo-v2-public-evidence", scope: "single_public_url", sourceUrl, observedAt, httpStatus: 200,
    geoV2: { gridVersion: "2.0.0", status: "incomplete", score: null, controls, unmeasuredControls: controls.filter(c => c.status === "unknown").map(c => c.controlId) },
    sourcePreview: { kind: "observed_html_reconstruction", title: "Example services for professionals", description: "Independent services for companies", heading: "Example services", subheadings: ["How our services work", "Compare services"], observedAt, screenshotUrl: null },
    pillars: [
      { id: "seo", coverage: "measured", score: null, observedChecks: 12, needsAttention: 2 },
      { id: "geo", coverage: "partial", score: null, observedChecks: 2, needsAttention: 1 },
      { id: "ai", coverage: "partial", score: null },
      { id: "crm", coverage: "not_measured", score: null },
      { id: "social", coverage: "partial", score: null, observedCount: 1 },
    ],
    actions: [
      { id: "geo.v2.M01", code: "geo_v2_check", pillar: "geo", kind: "observed_fix", checkId: "M01", title: "Descriptive title", priority: "high", effort: "low", risk: "low", owner: "technical", points: null,
        proof: { id: "geo-v2:M01", label: "M01", value: "No descriptive title observed", sourceUrl, observedAt, format: "geo_v2_control" } },
      ...[["ai", "ai_measurement"], ["crm", "crm_measurement"], ["social", "social_presence"]].map(([pillar, code]) =>
        ({ id: `${pillar}.connect`, pillar, code, kind: "next_step", priority: "medium", effort: "medium", risk: "medium", owner: "marketing", points: null, proof: null })),
    ],
    comparison: null, unmeasured: ["ai_citations", "crm_conversions", "social_inbound_backlinks"],
  };
}

async function visitPublicConsole(browserInstance, locale, viewport, label) {
  const context = await browserInstance.newContext();
  const report360 = v2ReportFixture();
  const payload = {
    finalUrl: "https://example.com/", httpStatus: 200, score: 71, recoverablePoints: 29,
    evidence: {
      version: 1, observedAt: '2026-11-16T12:00:00Z', page: { url: 'https://example.com/', status: 200 },
      title: { value: 'Example services for professionals', characters: 34, present: true, truncated: false },
      canonicals: [{ value: 'https://example.com/', truncated: false }],
      directives: [{ agent: 'robots', value: 'index, follow', truncated: false }], xRobotsTag: { value: '', truncated: false }, noindex: false,
      robots: { requestedUrl: 'https://example.com/robots.txt', url: 'https://example.com/robots.txt', status: 200, declarations: ['https://example.com/sitemap.xml'] },
      sitemaps: [
        { requestedUrl: 'https://example.com/sitemap.xml', url: 'https://example.com/sitemap.xml', status: 200, document: { kind: 'urlset', count: 15, examples: ['https://example.com/'] } },
        { requestedUrl: 'https://example.com/sitemap_index.xml', url: 'https://example.com/sitemap_index.xml', status: 404, document: null },
      ],
    },
    checksSummary: { passed: 22, toImprove: 13, total: 35 },
    pageSignals: { title: "Example services for professionals", description: "Independent services for companies", htmlLang: "en", h1: ["Example services"], h2: ["How our services work", "Compare services"] },
    journeyContext: { url: "https://example.com/", brand: "Example", brandSource: "schema:organization", products: [{ id: "bookkeeping", name: "Monthly bookkeeping", kind: "Service", category: "bookkeeping services", url: "https://example.com/bookkeeping", sourceUrl: "https://example.com/", source: "schema", description: "Monthly invoices and reporting", attributes: {} }], links: [] },
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
    geoV2: report360.geoV2,
    report360,
  };
  await context.route("**/api/free-read", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize(viewport);
  const response = await page.goto(`${origin}/console/?lang=${locale}#local_seo/network`, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200, `${label}: console loads`);
  await page.locator("#c-public-url").fill("https://example.com/");
  await page.locator("#c-public-url-form button").click();
  await page.locator(".public-domain").waitFor();
  assert.equal(await page.locator(".public-domain").innerText(), "example.com");
  assert.equal(await page.locator(".public-signal").count(), 4);
  const screenshotPrefix = `${locale}-console-${label}`;
  assert.match(await page.locator('[data-evidence="title"]').innerText(), /Example services for professionals/);
  assert.match(await page.locator('[data-evidence="sitemap"]').innerText(), /HTTP 404/);
  await page.locator('.public-diagnostic').screenshot({ path: path.join(outputDir, `${screenshotPrefix}-evidence.png`) });
  // Reproduce the original no-op: the planner already shares the current hash.
  await page.locator('#local-seo-planner a').click();
  assert.equal(await page.locator('#c-login-email').evaluate(n => n === document.activeElement), true);
  assert.ok(await page.locator('#c-local-dashboard-login').isVisible());
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('gtm-console-feature-handoff')).hash), '#local_seo/network');
  assert.equal(new URL(page.url()).hash, '#local_seo/network');
  await page.locator('#c-login-form').screenshot({ path: path.join(outputDir, `${screenshotPrefix}-gbp-signin.png`) });
  await page.screenshot({ path: path.join(outputDir, `${screenshotPrefix}-overview.png`), fullPage: true });
  assert.equal(await page.locator(".report360-v2-row").count(), 42, "all approved v2 control statuses are visible");
  assert.equal(await page.locator(".report360-v2-category").count(), 8);
  assert.equal(await page.locator(".report360-v2-unknown").count(), 40);
  assert.equal(await page.locator(".report360-connection").count(), 3);
  assert.match(await page.locator(".report360-visual").innerText(), locale === "fr" ? /PAS UNE CAPTURE/ : /NOT A SCREENSHOT/);
  assert.doesNotMatch(await page.locator(".public-score").innerText(), /71\/100/);
  await page.locator('.report360-filter[data-pillar="geo"]').click();
  assert.equal(await page.locator(".report360-action:visible").count(), 1);
  await page.locator(".report360-action-geo summary").click();
  assert.equal(await page.locator(".report360-action-geo .report360-steps li").count(), 3);
  assert.equal(await page.locator(".journey-stage").count(), 5);
  const intro = await page.locator(".journey-panel").innerText();
  assert.match(intro, locale === "fr" ? /hypothèses modifiables/ : /editable hypotheses/);
  assert.equal(await page.locator(".journey-question-label textarea").count(), 0, "no questions before context confirmation");
  await page.locator(".journey-context-fields select").selectOption("bookkeeping");
  const fields = page.locator(".journey-context-fields input");
  await fields.nth(1).fill(locale === "fr" ? "services de comptabilité" : "bookkeeping services");
  await fields.nth(2).fill(locale === "fr" ? "professionnels indépendants" : "independent professionals");
  await fields.nth(3).fill(locale === "fr" ? "suivre mes factures" : "track my invoices");
  await page.locator('.journey-context button[type="submit"]').click();
  assert.equal(await page.locator(".journey-question-label textarea").count(), 3);
  assert.match(await page.locator(".journey-question-label textarea").first().inputValue(), locale === "fr" ? /professionnels indépendants/ : /independent professionals/);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `${label}: grounded journey has no overflow`);
  await fields.nth(3).fill(locale === "fr" ? "préparer mon bilan" : "prepare my accounts");
  assert.equal(await page.locator(".journey-question-label textarea").count(), 0, "context edit invalidates old questions");
  await page.locator('.journey-context button[type="submit"]').click();
  await page.screenshot({ path: path.join(outputDir, `${screenshotPrefix}-journey.png`), fullPage: true });
  const copy = await page.locator(".report360-action-geo").innerText();
  assert.match(copy, /M01 · /);
  assert.doesNotMatch(copy, /GEO v2/);
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
  await root.getByRole("button", {name: locale === "fr" ? "Relier et contrôler mes fiches" : "Link and check my listings", exact:true}).click();
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

async function visitReadingGuides(context, locale, viewport, label) {
  for (const track of ['marketing', 'technical']) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    const prefix = locale === 'fr' ? '/fr' : '';
    const route = `${prefix}/guides/${track}/`;
    assert.equal((await page.goto(`${origin}${route}`, { waitUntil: 'networkidle' }))?.status(), 200);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('html').getAttribute('lang'), locale);
    assert.equal(await page.locator('.guide-stages > li').count(), 5);
    assert.equal(await page.locator('.site-header .nav').isVisible(), true);
    assert.ok(await page.locator('.site-header .brand img').evaluate(img => img.complete && img.naturalWidth > 0));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `${route} ${label}: no page overflow`);
    await page.screenshot({ path: path.join(outputDir, `${locale}-${track}-${label}.png`), fullPage: true });
    await page.locator(track === 'marketing' ? '#identity' : '#architecture').screenshot({ path: path.join(outputDir, `${locale}-${track}-${label}-diagram.png`) });
    // Clicking the language control keeps the selected guide, then returns to the source locale.
    const other = locale === 'fr' ? 'en' : 'fr';
    await page.locator(`.lang a[hreflang="${other}"]`).click();
    await page.waitForURL(`${origin}${other === 'fr' ? '/fr' : ''}/guides/${track}/`);
    assert.equal(await page.locator('html').getAttribute('lang'), other);
    await page.locator(`.lang a[hreflang="${locale}"]`).click();
    await page.waitForURL(`${origin}${route}`);
    // A real click checks the public console handoff, with language and target preserved.
    await page.locator('.guide-hero a.btn').click();
    await page.waitForURL(`${origin}/console/?lang=${locale}#c-public-read`);
    await page.locator('#c-public-url').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#c-public-url').inputValue(), '', 'The guide opens an empty analysis form; no implicit fetch');
    assert.deepEqual(errors, [], `${route}: no runtime errors`);
    await page.close();
  }
}

try {
  await fs.mkdir(outputDir, { recursive: true });
  await ready();
  const browserExecutable = process.env.CHROMIUM_BIN || (existsSync(chromium.executablePath()) ? chromium.executablePath() : "/usr/bin/chromium");
  browser = await chromium.launch({ executablePath: browserExecutable, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  await verifyCardIllustrations(browser);
  await verifyAuditPlacement(browser, "fr");
  await verifyAuditPlacement(browser, "en");
  await verifyAuditPlacement(browser, 'fr', [[412,839], [839,412]], devices['Pixel 7']);
  if (process.env.LANDING_CROSS_BROWSER === '1') {
    const safari = await webkit.launch();
    try {
      await verifyAuditPlacement(safari, 'fr', [[390,664], [664,390]], devices['iPhone 13']);
      await verifyAuditPlacement(safari, 'en', [[810,1080], [1080,810]], devices['iPad (gen 7)']);
    } finally { await safari.close(); }
    const gecko = await firefox.launch();
    try {
      await verifyAuditPlacement(gecko, 'fr', [[768,1024], [1440,900]]);
    } finally { await gecko.close(); }
  }
  await visitLocalSeoWorkspace(browser, "fr");
  await visitLocalSeoWorkspace(browser, "en");
  const context = await browser.newContext({ locale: "fr-FR" });
  await context.route("**/api/free-read", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"preview unavailable"}' }));

  const desktop = { width: 1440, height: 900 };
  const mobile = { width: 390, height: 844 };
  await verifyCarousel(browser, 'en', desktop);
  await verifyCarousel(browser, 'fr', mobile);
  const en = await visit(context, "en", "en-desktop", desktop);
  const fr = await visit(context, "fr", "fr-desktop", desktop);
  await verifySharedLanding(en, fr);
  for (const [page, locale] of [[en, 'en'], [fr, 'fr']]) {
    await page.locator('.vh-technical > summary').click();
    await page.locator('#reading-guides').screenshot({ path: path.join(outputDir, `${locale}-reading-tracks.png`) });
    // Keep the homepage's consent-test page intact; its init script resets consent on reload.
    const entry = await context.newPage();
    await entry.goto(`${origin}/${locale === 'fr' ? 'fr/' : ''}`);
    await entry.locator('.vh-technical > summary').click();
    await entry.locator(`#reading-guides a[href="${locale === 'fr' ? '/fr' : ''}/guides/marketing/"]`).click();
    await entry.waitForURL(`${origin}${locale === 'fr' ? '/fr' : ''}/guides/marketing/`);
    await entry.close();
    await visitReadingGuides(context, locale, desktop, 'desktop');
    await visitReadingGuides(context, locale, mobile, 'mobile');
  }
  await verifyLeadFlow(en, "en");
  await verifyLeadFlow(fr, "fr");
  for (const [page, locale] of [[en,"en"],[fr,"fr"]]) {
    await page.goto(`${origin}/${locale === "fr" ? "fr/" : ""}#ops`);
    // Hash navigation keeps the existing page and its rejected privacy choice.
    assert.equal(await page.locator(".privacy-banner").isVisible(), false);
    await page.locator("#ops").screenshot({path:path.join(outputDir,`${locale}-ops.png`)});
    await page.goto(`${origin}/${locale === "fr" ? "fr/" : ""}#roadmap`);
    await page.locator("#roadmap").screenshot({path:path.join(outputDir,`${locale}-roadmap.png`)});
    await page.goto(`${origin}/${locale === "fr" ? "fr/" : ""}`);
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
  const measuredReport = v2ReportFixture();
  await measured.route("**/api/free-read", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    score: 71, projectedScore: 100, durationMs: 117, geoV2: measuredReport.geoV2, report360: measuredReport,
    tables: [{ id: "seo.meta", title: "SEO — metadata", rows: [{ label: "Title", value: "48 chars", status: "pass", note: "Indexable." }] }],
  }) }));
  const frMeasured = await measured.newPage();
  await frMeasured.goto(`${origin}/fr/`);
  await frMeasured.locator("#url-input").fill("example.com");
  await frMeasured.locator("#url-form button").click();
  await frMeasured.getByText(/Visibilité IA · 42 contrôles — \d+\/42 contrôles faits/).waitFor();
  assert.doesNotMatch(await frMeasured.locator("#read-result").innerText(), /GEO v2|score v2|inconnu/i);
  assert.match(await frMeasured.locator(".landing-next-actions").innerText(), /M01 · Titre descriptif/);
  assert.match(await frMeasured.locator("#read-result").innerText(), /Vérification de l’adresse \(\d+ points\)/);
  assert.doesNotMatch(await frMeasured.locator("#read-result").innerText(), /71\/100/);
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
