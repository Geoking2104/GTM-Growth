#!/usr/bin/env node
/** Actual console acceptance; synthetic identity/data, local network only, strict production CSP. */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { chromium } from 'playwright-core';

const output = path.resolve(process.env.CONSOLE_COACH_QA_OUTPUT_DIR || '../qa-console-coach');
await fs.mkdir(output, { recursive: true });
const policy = "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'";
const fixtures = new Map(), calls = [], results = [];
const period = { start: '2026-10-20', end: '2026-11-16', prevStart: '2026-09-22', prevEnd: '2026-10-19' };
const observedAt = '2026-11-19T10:30:00Z';
const forbidden = /\/(?:publish|write|execute|decide|approve|grant|revoke|import|generate(?:-preview)?|openai-run|claude-run|mistral-run|grok-run|gemini-run|delete|save|create)$/;
const L = (f, fr, en) => f.language === 'fr' ? fr : en;
function fixture(id, language, extra = {}) {
  const value = {
    id, language, connected: true, failContext: false, failOperations: false, realtimeReads: 0,
    profile: { role: 'marketer', goal: 'traffic', stage: 'grow', audience: 'Synthetic fixture audience', target: { metric: 'clicks', value: 500 } },
    ...extra,
  };
  fixtures.set(id, value); return value;
}
function tenant(f) {
  return { id: f.id, name: L(f, 'Atelier Acme · Démonstration', 'Atelier Acme · Demonstration'), status: 'active', domains: ['example.com'], gscProperties: ['sc-domain:example.com'], ga4Properties: ['123'], bingSites: [], gtmContainers: [], branding: {} };
}
function searchData() {
  const rows = [12, 18, 16, 23, 21, 30, 27].map((clicks, i) => ({ date: `2026-11-${String(i + 10).padStart(2, '0')}`, clicks, impressions: clicks * 20, ctr: 0.05, position: 5 - i / 10 }));
  return { period, totals: { clicks: 147, impressions: 2940, ctr: 0.05, position: 4.7 }, deltas: { clicks: 12, impressions: 8, ctr: 3, position: -2 }, trend: rows, queries: [{ query: 'synthetic customer question', clicks: 30, impressions: 600, ctr: 0.05, position: 4.5 }], pages: [{ page: 'https://example.com/service', clicks: 30, impressions: 600, ctr: 0.05, position: 4.5 }], devices: [], countries: [], searchAppearance: [] };
}
function analyticsData() {
  return { period, totals: { sessions: 420, totalUsers: 350, newUsers: 280, engagementRate: 0.7, engagedSessions: 294, averageSessionDuration: 95, screenPageViews: 680, keyEvents: 18 }, deltas: {}, trend: [
    { date: '2026-11-14', sessions: 80, totalUsers: 70, keyEvents: 3 },
    { date: '2026-11-15', sessions: 120, totalUsers: 100, keyEvents: 5 },
    { date: '2026-11-16', sessions: 220, totalUsers: 180, keyEvents: 10 },
  ], channels: [], sources: [], pages: [], landingPages: [], devices: [], countries: [], events: [] };
}
function operationData(f) {
  return { model: 'operations', state: 'ready', source: 'GTM Growth', readAt: new Date().toISOString(), period: { start: observedAt, end: observedAt }, href: '#ops', summary: L(f, 'État enregistré des opérations. Aucune collecte n’est lancée.', 'Recorded operations status. No collection is started.'), metrics: [
    { id: 'prompts', label: L(f, 'Questions enregistrées', 'Saved questions'), value: 12, unit: 'count' },
    { id: 'pendingAlertsSample', label: L(f, 'Alertes non acquittées (200 max.)', 'Unacknowledged alerts (200 max.)'), value: 2, unit: 'count' },
    { id: 'latestRunSucceeded', label: L(f, 'Dernière collecte : réussites', 'Latest collection: successes'), value: 5, unit: 'count' },
    { id: 'latestRunFailed', label: L(f, 'Dernière collecte : échecs', 'Latest collection: failures'), value: 1, unit: 'count' },
  ], caveats: [L(f, 'Les questions ne mesurent pas la demande. Les alertes sont un échantillon limité.', 'Saved questions do not measure demand. Alerts are a bounded sample.')] };
}

const app = express();
app.use((req, res, next) => { res.setHeader('Content-Security-Policy', policy); res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
app.get('/console/auth.js', (req, res) => res.type('application/javascript').send('export const handleRedirect=async()=>({}),accessToken=async()=>"synthetic-test-token",currentTenant=()=>null,setTenant=()=>{},accountConsoleUrl=()=>"#settings",login=async()=>{},logout=()=>{};'));
app.use('/api', express.json(), (req, res) => {
  const route = req.path.replace(/^\/console/, ''), id = req.get('x-tenant'), f = fixtures.get(id);
  calls.push({ id, route, method: req.method, body: req.body || {}, at: Date.now() });
  if (!f) return res.status(403).json({ error: 'Unknown synthetic workspace' });
  if (forbidden.test(route)) return res.status(400).json({ error: 'Provider mutations are forbidden in coach QA' });
  if (route === '/me') return res.json({ tenant: tenant(f), username: 'qa-user', email: 'qa@example.invalid', user: { sub: 'qa-user', iss: 'https://identity.example.invalid' }, role: 'tenant-admin', memberships: [{ id, role: 'tenant-admin' }, { id: `${id}-other`, role: 'tenant-user' }], platformAdmin: false });
  if (route === '/data-agent/context') return f.failContext ? res.status(503).json({ error: 'Synthetic context outage' }) : res.json({ profile: f.profile, actions: [], models: [], slack: 'not-configured' });
  if (route === '/data-agent/profile') { f.profile = { ...f.profile, ...req.body }; return res.json({ profile: f.profile }); }
  if (route === '/data-agent/query') {
    if (f.failOperations) return res.status(503).json({ error: 'Synthetic operation-read outage' });
    if (req.body.model === 'operations') return res.json(operationData(f));
    return res.json({ ...operationData(f), model: req.body.model, summary: L(f, 'Réponse guidée de démonstration.', 'Synthetic guided answer.'), metrics: [], period: null });
  }
  if (route === '/tracking/status') return res.json({ serviceAccount: { installed: true }, gsc: { configured: 'sc-domain:example.com', hasAccess: f.connected }, ga4: { configured: '123', hasAccess: f.connected }, bing: {}, tags: {} });
  if (route === '/overview') return res.json({ url: 'https://example.com', generatedAt: observedAt, geo: { score: 62, projectedScore: 78, breakdown: { meta: 10 }, max: { meta: 14 }, recommendations: [
    { action: L(f, 'Clarifier le titre de la page', 'Clarify the page title'), points: 8, category: 'meta' },
    { action: L(f, 'Ajouter des sources au contenu', 'Add sources to content'), points: 5, category: 'content' },
    { action: L(f, 'Vérifier les liens internes', 'Check internal links'), points: 3, category: 'discovery' },
  ] }, citability: { score: 55 }, indexnow: { score: 35 }, platforms: [{ label: 'ChatGPT', score: 25 }] });
  if (route === '/search/performance') return f.connected ? res.json(searchData()) : res.json({ problem: { message: 'Search Console: synthetic permission unavailable', steps: [] } });
  if (route === '/ga4/overview') return f.connected ? res.json(analyticsData()) : res.json({ problem: { message: 'GA4: synthetic permission unavailable', steps: [] } });
  if (route === '/ga4/realtime') return res.json({ activeUsers: 6 + ++f.realtimeReads, readAt: new Date().toISOString(), pages: [], countries: [], devices: [] });
  if (route === '/reports') return res.json({ reports: [] });
  if (route === '/ai-visibility/datasets') return res.json({ datasets: [] });
  if (route === '/competition/state') return res.json({ panels: {}, actions: [] });
  if (route === '/visual/catalog') return res.json({ items: [], profile: { name: 'Atelier Acme', logoUrl: '' } });
  if (route === '/decision/measurement/latest') return res.json({ run: null, stale: false });
  if (route === '/decision/inbox') return res.json({ rows: [], sources: [], pending: 0, partial: false });
  if (route === '/social/state') return res.json({ capabilities: { postiz: false, accounts: [] } });
  if (route === '/crm/overview') return res.json({ settings: { enabled: false } });
  if (route === '/local-seo/state') return res.json({ capabilities: { gbp: 'not-configured' }, bindings: [] });
  return res.status(503).json({ error: 'Synthetic fixture: source unavailable' });
});
app.use(express.static('site'));
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const origin = `http://127.0.0.1:${server.address().port}`;
let browser, activePage, activeCase;

async function pageFor(f, width) {
  const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ id, firstVisit }) => {
    if (!sessionStorage.getItem('gtm-console-selected')) sessionStorage.setItem('gtm-console-selected', id);
    if (!firstVisit) localStorage.setItem(`gtm-console-wizard-v1:${id}:qa@example.invalid`, 'done');
    localStorage.setItem(`gtm-console-wizard-v1:${id}-other:qa@example.invalid`, 'done');
    window.coachCspViolations = [];
    document.addEventListener('securitypolicyviolation', e => window.coachCspViolations.push(`${e.violatedDirective}: ${e.blockedURI}`));
  }, { id: f.id, firstVisit: f.language === 'fr' && width === 1360 });
  await page.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin === origin) return route.continue(); external.push(url.origin); return route.abort(); });
  return { page, errors, external };
}
async function screenshot(page, language, width, name) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `${language}/${width}/${name}: horizontal page overflow`);
  await page.screenshot({ path: path.join(output, `${language}-${width}-${name}.png`), fullPage: true });
  if (name === 'welcome') await page.screenshot({ path: path.join(output, `${language}-${width}-welcome-viewport.png`) });
}
const coach = page => page.locator('[data-coach="root"]');
const inspector = page => page.locator('[data-coach="inspector"]');
async function closeHelp(page) {
  await page.keyboard.press('Escape');
  await inspector(page).waitFor({ state: 'hidden' });
}
async function inspectHelp(page, trigger, language, expectedSource) {
  await trigger.click(); await inspector(page).waitFor({ state: 'visible' });
  for (const key of ['help-title', 'help-source', 'help-relations', 'help-consequence', 'help-freshness']) {
    assert.ok((await page.locator(`[data-coach="${key}"]`).innerText()).trim(), `${language}: ${key} is explained`);
  }
  if (expectedSource) assert.match(await page.locator('[data-coach="help-source"]').innerText(), expectedSource);
  assert.ok(await page.locator('[data-coach="help-relations"] a[href^="#"]').count() > 0, 'Help links to existing console workflows');
  await closeHelp(page);
  assert.equal(await trigger.evaluate(node => document.activeElement === node), true, 'Escape restores focus to the help trigger');
}

try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_BIN || (existsSync(chromium.executablePath()) ? chromium.executablePath() : '/usr/bin/chromium'), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  for (const language of ['fr', 'en']) for (const width of [1360, 390]) {
    const id = `coach-${language}-${width}`, f = fixture(id, language), second = fixture(`${id}-other`, language, { connected: false });
    const { page, errors, external } = await pageFor(f, width);
    activePage = page; activeCase = { language, width, errors };
    await page.goto(`${origin}/console/?lang=${language}#overview`);
    await coach(page).waitFor();
    await page.locator('[data-coach="panel"]').waitFor({ state: 'visible' });
    assert.equal(await page.getByRole('dialog').count(), 0, 'The welcome coach does not put a blocking wizard over the console');
    await page.locator('[data-coach="goal"]').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-coach="goal"]')?.value === 'traffic');
    await page.locator('.decision-priority').first().waitFor();
    assert.equal(await page.locator('[data-coach="steps"] a[href^="#"]').count() > 0, true);
    assert.equal(calls.filter(c => c.id === id && c.route === '/data-agent/profile').length, 0, 'Opening the console never saves personal preferences');
    await screenshot(page, language, width, 'welcome');

    await page.locator('[data-coach="toggle"]').click();
    await page.locator('[data-coach="panel"]').waitFor({ state: 'hidden' });
    await page.locator('[data-coach="launcher"]').click();
    await page.locator('[data-coach="panel"]').waitFor({ state: 'visible' });

    const initialProfile = structuredClone(f.profile);
    await page.locator('[data-coach="goal"]').selectOption('sales');
    assert.equal(calls.filter(c => c.id === id && c.route === '/data-agent/profile').length, 0, 'Selecting a goal is not yet a save');
    const saved = page.waitForResponse(r => r.url().endsWith('/data-agent/profile') && r.status() === 200);
    await page.locator('[data-coach="goal-save"]').click(); await saved;
    await page.waitForFunction(() => document.querySelector('[data-coach="goal-status"]')?.textContent?.trim());
    assert.equal(f.profile.goal, 'sales');
    for (const key of ['role', 'audience', 'stage', 'target']) assert.deepEqual(f.profile[key], initialProfile[key], `Goal save preserves ${key}`);

    await inspectHelp(page, page.locator('[data-coach="explain-page"]'), language);
    await page.goto(`${origin}/console/?lang=${language}#gsc`);
    await page.locator('.kpi-cell').first().waitFor();
    await page.waitForFunction(() => document.querySelector('[data-coach="root"]')?.dataset.tone === 'impact');
    await page.locator('[data-coach-help="chart"]').first().waitFor();
    await inspectHelp(page, page.locator('[data-coach-help][aria-label*="' + (language === 'fr' ? 'Clics' : 'Clicks') + '"]:visible').first(), language, /Google|Search Console/i);
    await inspectHelp(page, page.locator('.c-toolbar [data-coach-help="field"]:visible').first(), language);
    await inspectHelp(page, page.locator('[data-coach-help="chart"]:visible').first(), language);
    await inspectHelp(page, page.locator('.c-filterable [data-coach-help="action"]:visible').first(), language);
    if (width < 640) await page.locator('#c-nav-toggle').click();
    await inspectHelp(page, page.locator('[data-coach-help="navigation"]:visible').first(), language);
    if (width < 640) await page.locator('#c-nav-toggle').click();
    await page.locator('[data-coach-help="chart"]:visible').first().click(); await inspector(page).waitFor({ state: 'visible' });
    await screenshot(page, language, width, 'provenance'); await closeHelp(page);

    // A manual live refresh is an inventory read. It must not start a collection or write.
    await page.goto(`${origin}/console/?lang=${language}#overview`);
    const refresh = page.locator('.console-live-feed [data-live-refresh]'); await refresh.waitFor();
    await page.locator('.console-live-feed [data-live-status="ready"]').waitFor();
    const beforeRefresh = calls.length;
    const liveRead = page.waitForResponse(r => r.url().endsWith('/data-agent/query') && r.request().postDataJSON()?.model === 'operations');
    await refresh.click(); await liveRead;
    await page.waitForFunction(() => document.querySelector('[data-live-read-at]')?.textContent?.trim());
    assert.ok(calls.slice(beforeRefresh).some(c => c.route === '/data-agent/query' && c.body.model === 'operations'));
    assert.ok(!calls.slice(beforeRefresh).some(c => forbidden.test(c.route) || c.route === '/data-agent/profile'));

    await page.goto(`${origin}/console/?lang=${language}#ga4/realtime`);
    await page.locator('.console-realtime [data-live-status="ready"]').waitFor();
    const firstActive = await page.locator('.console-realtime .kpi-value strong').innerText();
    const readAgain = page.waitForResponse(r => r.url().endsWith('/ga4/realtime') && r.status() === 200);
    await page.locator('.console-realtime [data-live-refresh]').click(); await readAgain;
    await page.waitForFunction(previous => document.querySelector('.console-realtime .kpi-value strong')?.textContent !== previous, firstActive);
    assert.equal(f.realtimeReads, 2, 'The dedicated realtime view uses the actual GA4 read route on entry and explicit refresh');

    // Existing access errors remain understandable and must not be replaced with simulated metrics.
    f.connected = false;
    await page.goto(`${origin}/console/?lang=${language}#impact/analytics`); await page.reload();
    await page.locator('.decision-enrich').first().waitFor();
    assert.equal(await page.locator('.decision-hub > .decision-grid .decision-card[href="#ga4"]').count(), 0);
    await screenshot(page, language, width, 'missing-source');
    assert.ok(!calls.filter(c => c.id === id).some(c => forbidden.test(c.route)), 'No provider mutations or model collection calls');

    if (language === 'en' && width === 1360) {
      await page.goto(`${origin}/console/?lang=${language}#overview`);
      await page.locator('.console-live-feed [data-live-status="ready"]').waitFor();
      f.failOperations = true;
      const failedRead = page.waitForResponse(r => r.url().endsWith('/data-agent/query') && r.status() === 503);
      await page.locator('.console-live-feed [data-live-refresh]').click(); await failedRead;
      await page.waitForFunction(() => /unavailable|retry|failed|offline/i.test(document.querySelector('[data-live-status]')?.textContent || ''));
      f.failOperations = false;
      const recoveredRead = page.waitForResponse(r => r.url().endsWith('/data-agent/query') && r.status() === 200);
      await page.locator('.console-live-feed [data-live-refresh]').click(); await recoveredRead;
      // A collapse choice and saved goal in one tenant must not hide the next customer's welcome.
      await page.locator('[data-coach="toggle"]').click();
      await page.locator('#c-switch').click();
      await page.locator('#c-tenant').selectOption(second.id);
      await page.waitForFunction(id => document.querySelector('#c-tenant')?.value === id, second.id);
      await page.locator('[data-coach="panel"]').waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.querySelector('[data-coach="goal"]')?.value === 'traffic');
      assert.equal(second.profile.goal, 'traffic', 'Goal preferences are isolated by tenant');
      await screenshot(page, language, width, 'workspace-switch');

      second.failContext = true;
      await page.reload();
      await page.locator('[data-coach="retry"]').waitFor();
      assert.equal(await page.locator('[data-coach="goal"]').isDisabled(), true, 'Unavailable preferences are not silently replaced and saved');
      await inspectHelp(page, page.locator('[data-coach="explain-page"]'), language);
      second.failContext = false;
      const contextRecovery = page.waitForResponse(r => r.url().endsWith('/data-agent/context') && r.status() === 200);
      await page.locator('[data-coach="retry"]').click(); await contextRecovery;
      await page.waitForFunction(() => document.querySelector('[data-coach="goal"]')?.disabled === false);
    }

    assert.deepEqual(errors, [], 'No uncaught browser errors');
    assert.deepEqual(await page.evaluate(() => window.coachCspViolations), [], 'Strict CSP remains satisfied');
    assert.deepEqual(external, [], 'The QA stays entirely on the local synthetic site');
    results.push({ language, width, result: 'passed', profileWrites: calls.filter(c => c.id === id && c.route === '/data-agent/profile').length });
    await page.close();
  }
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ results, policy, checks: ['actual console integration', 'visible first-open coach', 'collapse and reopen', 'explicit goal save with retained preferences', 'source/relationship/consequence help', 'metric/field/chart/action/navigation inspection', 'Escape and focus restoration', 'read-only live refresh', 'missing-source and read-error recovery', 'tenant isolation', 'strict CSP', 'FR/EN desktop/mobile', 'no external provider calls'] }, null, 2));
  console.log(JSON.stringify({ output, results }, null, 2));
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
    const state = await activePage.evaluate(() => ({ text: document.body.innerText.slice(0, 14000), csp: window.coachCspViolations, width: innerWidth, documentWidth: document.documentElement.scrollWidth })).catch(() => null);
    await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ ...activeCase, message: error.message, state }, null, 2));
  }
  throw error;
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
