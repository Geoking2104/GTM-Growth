/** Five-area console browser regression. Synthetic data and mocked authentication only. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import express from 'express';
import { chromium } from 'playwright-core';
const output = process.env.DECISION_QA_OUTPUT_DIR || 'qa-brand/decision';
await fs.mkdir(output, { recursive: true });
const app = express(); app.use(express.static('site'));
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const lang of ['fr', 'en']) for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [], calls = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem('gtm-console-wizard-v1:acme:user', 'done'));
    await page.route('**/console/auth.js', r => r.fulfill({ contentType: 'text/javascript', body: 'export const handleRedirect=async()=>({}),accessToken=async()=>"fixture",currentTenant=()=>null,setTenant=()=>{},accountConsoleUrl=()=>"#settings",login=async()=>{},logout=()=>{};' }));
    let connected = false, platformOnly = false;
    await page.route('**/api/**', async r => {
      const path = new URL(r.request().url()).pathname; calls.push({ path, tenant: r.request().headers()['x-tenant'] });
      let data, status = 200;
      if (path.endsWith('/me')) data = { tenant: platformOnly ? null : { id: 'acme', name: lang === 'fr' ? 'Espace de test · Acme' : 'Test workspace · Acme', domains: ['example.com'], gscProperties: [], ga4Properties: ['123'], bingSites: [], gtmContainers: [] }, memberships: platformOnly ? [] : [{ id: 'acme', role: 'tenant-admin' }], role: 'tenant-admin', platformAdmin: platformOnly };
      else if (path.endsWith('/overview')) data = { geo: { score: 42, projectedScore: 100, breakdown: { meta: 10 }, max: { meta: 14 }, recommendations: [{ action: lang === 'fr' ? 'Corriger la balise title de la page test' : 'Fix the test page title', points: 8 }, { action: lang === 'fr' ? 'Clarifier les titres de section de la page test' : 'Clarify test page headings', points: 5 }, { action: lang === 'fr' ? 'Vérifier les liens de la page test' : 'Check test page links', points: 3 }] }, citability: { score: 42 }, indexnow: { score: 35 }, platforms: [{ label: 'ChatGPT', score: 25 }] };
      else if (path.endsWith('/tracking/status')) data = { serviceAccount: { installed: connected }, ga4: { hasAccess: connected, configured: '123' }, gsc: {}, bing: {}, tags: {} };
      else if (path.endsWith('/reports')) data = { reports: [] };
      else if (path.endsWith('/ai-visibility/datasets')) data = { datasets: [] };
      else if (path.endsWith('/competition/state')) data = { panels: {}, actions: [] };
      else if (path.endsWith('/visual/catalog')) data = { items: [], profile: {} };
      else if (path.endsWith('/data-agent/context')) data = { profile: { role: 'owner', goal: 'traffic', stage: 'activate', audience: '', target: null }, actions: [], models: [], slack: 'not-configured' };
      else { status = 503; data = { error: 'Test fixture: unavailable source' }; }
      await r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(`${origin}/console/?lang=${lang}#overview`);
    await page.locator('.decision-priority').first().waitFor();
    assert.equal(await page.locator('.decision-priority').count(), 3);
    assert.equal(await page.locator('.app-nav a').count(), 5);
    await page.screenshot({ path: `${output}/${lang}-${width}-cockpit.png`, fullPage: true });
    for (const area of ['diagnose', 'ops', 'impact', 'settings']) {
      await page.locator(`.app-nav a[href="#${area}"]`).click();
      await page.locator('.decision-hub, .decision-flow').first().waitFor();
      assert.equal(await page.locator('.app-nav [aria-current="true"]').count(), 1);
      const icons = await page.locator('#c-tabs .app-tab-icon').evaluateAll(nodes => nodes.map(n => n.innerHTML));
      assert.equal(new Set(icons).size, icons.length);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `${lang}/${width}/${area}: no overflow`);
      await page.screenshot({ path: `${output}/${lang}-${width}-${area}.png`, fullPage: true });
    }
    await page.goto(`${origin}/console/?lang=${lang}#impact/analytics`);
    await page.locator('.decision-enrich').waitFor();
    assert.equal(await page.locator('.decision-enrich').getAttribute('open'), null);
    assert.equal(await page.locator('.decision-hub > .decision-grid > a').count(), 0);
    await page.locator('.decision-enrich > summary').click();
    assert.equal(await page.locator('.decision-enrich a[href="#ga4"]').count(), 1);
    assert.match(await page.locator('.decision-measurement').innerText(), lang === 'fr' ? /Non évalué/ : /Not assessed/);
    await page.locator('#c-search').fill('ga4');
    await page.locator('#c-tool-search a').first().click();
    await page.locator('.v-section-heading h1').getByText('Google Analytics 4').waitFor();
    assert.equal(await page.locator('.app-nav [aria-current="true"]').getAttribute('href'), '#impact');
    connected = true;
    await page.goto(`${origin}/console/?lang=${lang}#impact/analytics`);
    await page.reload(); // A changed fixture represents a new connection/session.
    await page.locator('.decision-hub > .decision-grid > a[href="#ga4"]').waitFor();
    assert.equal(await page.locator('.decision-hub > .decision-grid > a').count(), 2);
    assert.ok(calls.filter(c => !c.path.endsWith('/me')).every(c => c.tenant === 'acme'));
    assert.ok(!calls.some(c => /\/(publish|write|approve|decide|execute|grant|add|save)$/.test(c.path)), 'Navigation never mutates provider state');
    platformOnly = true;
    await page.goto(`${origin}/console/?lang=${lang}#settings`);
    await page.reload();
    await page.locator('.decision-card[href="#platform"]').waitFor();
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Decision console passed: five areas, three priorities, legacy tool search, denied/connected source states, tenant headers, admin recovery, no automatic writes, FR/EN desktop/mobile.');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
