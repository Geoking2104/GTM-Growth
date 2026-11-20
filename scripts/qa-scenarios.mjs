#!/usr/bin/env node
/** Real editor + real planning handlers, synthetic tenant and temporary databases only. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';

const temp = await mkdtemp(path.join(tmpdir(), 'gtm-scenarios-qa-'));
process.env.TENANTS_PATH = path.join(temp, 'tenants.json');
process.env.SCENARIOS_PATH = path.join(temp, 'scenarios.sqlite3');
process.env.DECISION_PATH = path.join(temp, 'decision.sqlite3');
process.env.SOCIAL_PATH = path.join(temp, 'social.sqlite3');
process.env.LOCAL_SEO_PATH = path.join(temp, 'local.sqlite3');
process.env.AI_VISIBILITY_PATH = path.join(temp, 'ai');
const { scenarioRoutes } = await import('../src/console/scenarios.ts');
const { captureOverviewEvidence } = await import('../src/scenarios/evidence.ts');
const { getPlan } = await import('../src/scenarios/service.ts');
const { closeScenarioStores } = await import('../src/scenarios/store.ts');
const { closeDecisionStores } = await import('../src/console/decision-store.ts');
const routes = new Map(scenarioRoutes.map(route => [route.path, route]));
const site = path.resolve('site');
const output = path.resolve(process.env.SCENARIOS_QA_OUTPUT_DIR || 'qa-scenarios');
await mkdir(output, { recursive: true });
const contexts = new Map(), calls = [];
const context = id => ({ url: '', body: {}, user: { sub: 'qa-author', preferred_username: 'Demo editor' }, tenancy: {
  tenant: { id, name: 'Campaign Studio QA', status: 'active', domains: ['example.com'], gscProperties: [], ga4Properties: [], bingSites: [], gtmContainers: [], branding: {}, social: {} },
  role: 'tenant-admin', platformAdmin: false, memberships: [{ id, role: 'tenant-admin' }],
} });
const invoke = (ctx, route, body = {}) => {
  const handler = routes.get(route)?.handler;
  if (!handler) throw new Error(`Unknown test route: ${route}`);
  return handler({ ...ctx, body });
};
const policy = "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'";
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/fixture-api/')) {
      const [, , tenantId, ...suffix] = url.pathname.split('/');
      if (req.method !== 'POST' || !contexts.has(tenantId)) { res.writeHead(404); return res.end(); }
      let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 4_000_000) throw new Error('Fixture request too large'); }
      const route = '/' + suffix.join('/'), body = JSON.parse(text || '{}');
      if (route === '/scenarios/generate-preview') assert.notEqual(body.mode, 'ai', 'Browser QA must never call a paid model');
      calls.push({ tenantId, route });
      try {
        const result = await invoke(contexts.get(tenantId), route, body);
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result));
      } catch (error) { res.writeHead(error.status || 400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.code || error.message })); }
      return;
    }
    if (url.pathname === '/scenario-fixture') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Security-Policy', policy);
      res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Campaign Studio QA</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/brand.css"><link rel="stylesheet" href="/console/shell.css"><link rel="stylesheet" href="/console/scenarios.css"><body class="console-page"><main class="app-panel"><p class="c-note">Campaign Studio · Synthetic QA workspace · No real campaigns</p><div id="fixture"></div></main></body></html>');
      return;
    }
    const file = path.resolve(site, '.' + url.pathname);
    if (!file.startsWith(site + path.sep)) throw new Error('Invalid path');
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' })[path.extname(file)] || 'text/plain');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const results = [];
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_BIN || (existsSync(chromium.executablePath()) ? chromium.executablePath() : '/usr/bin/chromium'), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  for (const language of ['fr', 'en']) for (const width of [1360, 390]) {
    const id = `qa-${language}-${width}`, ctx = context(id), fr = language === 'fr', L = (a, b) => fr ? a : b;
    contexts.set(id, ctx);
    captureOverviewEvidence(id, { url: 'https://example.com/', generatedAt: '2026-11-20T10:00:00Z', geo: { recommendations: [
      { action: L('Clarifier les titres des pages', 'Clarify page titles'), category: 'seo', points: 4 },
      { action: L('Ajouter des sources aux contenus', 'Add sources to content'), category: 'content', points: 3 },
    ] } });
    const evidence = (await invoke(ctx, '/scenarios/evidence')).evidence;
    const channels = ['seo', 'content', 'analytics'];
    const names = fr ? ['Clarifier le titre', 'Relire les métadonnées', 'Préparer le contenu', 'Valider le contenu', 'Vérifier la mesure', 'Lire les résultats'] : ['Clarify the title', 'Review metadata', 'Prepare content', 'Review content', 'Check measurement', 'Read results'];
    const nodes = names.map((title, index) => ({ id: `step${index}`, type: index === 5 ? 'observation' : 'action', title, description: L('Action de démonstration fondée sur les constats du site.', 'Demonstration action based on website findings.'), channel: channels[Math.floor(index / 2)], startDate: `2026-12-${String(1 + index * 3).padStart(2, '0')}`, endDate: `2026-12-${String(3 + index * 3).padStart(2, '0')}`, owner: ['SEO lead', 'Content lead', 'Analyst'][Math.floor(index / 2)], effortHours: 2, budgetCents: 3000, status: 'todo', locked: index === 5, evidenceIds: [evidence[index % evidence.length].id], checklist: [{ id: `check${index}`, label: L('Vérifier la source', 'Review source'), done: false }] }));
    const initial = (await invoke(ctx, '/scenarios/create', { draft: {
      name: L('Visibilité · campagne de décembre', 'Visibility · December campaign'), objective: L('Améliorer les contenus et suivre les résultats.', 'Improve content and track results.'), language, timezone: 'Europe/Paris', startDate: '2026-12-01', endDate: '2026-12-31', budgetCents: 120000, currency: 'EUR', channels, status: 'draft', nodes, edges: [{ id: 'edge01', source: 'step0', target: 'step1', type: 'finish_to_start', lagDays: 0 }], evidence, layout: { positions: Object.fromEntries(nodes.map((n, i) => [n.id, { x: 28 + i % 2 * 300, y: 56 + Math.floor(i / 2) * 190 }])) },
    } })).plan;
    const page = await browser.newPage({ viewport: { width, height: 1000 }, timezoneId: 'America/Los_Angeles', reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { window.cspViolations = []; document.addEventListener('securitypolicyviolation', event => window.cspViolations.push(`${event.violatedDirective}: ${event.blockedURI}`)); });
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(`${origin}/scenario-fixture?lang=${language}`);
    await page.evaluate(async ({ id, language }) => {
      document.documentElement.lang = language;
      const { renderScenarios } = await import('/console/scenarios.js');
      window.studio = await renderScenarios({ me: { tenant: { id }, user: { sub: 'qa-author' }, role: 'tenant-admin' }, api: async (route, body = {}) => {
        const response = await fetch(`/fixture-api/${id}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const result = await response.json(); if (!response.ok) { const error = new Error(result.error); error.status = response.status; throw error; } return result;
      } });
      document.querySelector('#fixture').append(window.studio);
    }, { id, language });
    assert.deepEqual(calls.filter(call => call.tenantId === id).map(call => call.route).sort(), ['/scenarios/capabilities', '/scenarios/evidence', '/scenarios/list']);
    await page.getByRole('button', { name: L('Ouvrir le scénario', 'Open scenario'), exact: true }).click();
    await page.getByRole('button', { name: L('Proposer un plan', 'Suggest a plan'), exact: true }).waitFor();
    if (width > 900) {
      await page.locator('.joint-element').first().waitFor();
      assert.equal(await page.locator('.joint-element').count(), 6);
      const rect = await page.locator('.joint-element').first().boundingBox();
      await page.mouse.move(rect.x + 80, rect.y + 45); await page.mouse.down(); await page.mouse.move(rect.x + 120, rect.y + 65, { steps: 5 }); await page.mouse.up();
      await page.waitForFunction(() => /(?:Enregistré|Saved)/.test(document.querySelector('.scenario-save-state')?.textContent || ''));
      await page.screenshot({ path: path.join(output, `campaign-canvas-${language}-${width}.png`), fullPage: true });
    }
    await page.getByRole('button', { name: L('Tableau', 'Table'), exact: true }).click();
    const first = page.locator('.scenario-table tbody tr').first();
    await first.getByRole('button', { name: names[0], exact: true }).click();
    const inspector = page.locator('.scenario-inspector');
    await inspector.getByLabel(L('Responsable / rôle', 'Owner / role'), { exact: true }).fill('Marketing lead');
    await inspector.getByLabel(L('Titre', 'Title'), { exact: true }).fill(L('Titre adapté à la campagne', 'Title adapted to the campaign'));
    await inspector.getByRole('button', { name: L('Appliquer les modifications', 'Apply changes'), exact: true }).click();
    await page.waitForFunction(() => /(?:Enregistré|Saved)/.test(document.querySelector('.scenario-save-state')?.textContent || ''));
    assert.equal(getPlan(id, initial.id).nodes.find(n => n.id === 'step0').owner, 'Marketing lead');
    await page.getByRole('button', { name: L('Planning', 'Schedule'), exact: true }).click();
    assert.equal(await page.locator('.scenario-time-row').count(), 6);
    assert.equal(await page.locator('.scenario-time-lane').count(), 3);
    await page.screenshot({ path: path.join(output, `campaign-schedule-${language}-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: L('Proposer un plan', 'Suggest a plan'), exact: true }).click();
    await page.getByRole('button', { name: L('Générer un aperçu', 'Generate preview'), exact: true }).click();
    const proposal = page.getByRole('dialog', { name: L('Relire la proposition', 'Review suggestions'), exact: true });
    await proposal.waitFor();
    assert.equal(getPlan(id, initial.id).nodes.length, 6, 'Preview must not mutate the plan');
    await proposal.getByRole('checkbox').check();
    await proposal.getByRole('button', { name: L('Appliquer au planning', 'Apply to plan'), exact: true }).click();
    await proposal.waitFor({ state: 'hidden' });
    const updated = getPlan(id, initial.id);
    assert.ok(updated.nodes.length > 6);
    assert.deepEqual(updated.nodes.find(n => n.id === 'step5'), initial.nodes.find(n => n.id === 'step5'), 'Locked action must survive generation');
    await page.getByRole('button', { name: L('Versions & échanges', 'Versions & discussion'), exact: true }).click();
    await page.getByLabel(L('Ajouter une note', 'Add a note'), { exact: true }).fill(L('Relecture des dates effectuée.', 'Campaign dates reviewed.'));
    await page.getByRole('button', { name: L('Enregistrer la note', 'Save note'), exact: true }).click();
    await page.getByText(L('Note enregistrée.', 'Note saved.'), { exact: true }).waitFor();
    await page.getByRole('dialog').getByRole('button', { name: L('Fermer', 'Close'), exact: true }).click();
    const footprint = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, violations: window.cspViolations }));
    assert.ok(footprint.document <= width + 2, `Unexpected horizontal page overflow: ${JSON.stringify(footprint)}`);
    assert.deepEqual(footprint.violations, [], 'The editor must work under the production CSP');
    assert.deepEqual(errors, [], 'No unhandled browser error');
    assert.ok(calls.every(call => call.route.startsWith('/scenarios/')), 'Planning must never dispatch a native connector');
    await page.evaluate(() => window.studio.dispose()); await page.close();
    results.push({ language, width, result: 'passed', nodes: updated.nodes.length, version: updated.version });
  }
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ results, policy, checks: ['real JointJS canvas', 'real tenant-scoped planning handlers', 'edit and autosave', 'calendar channel lanes', 'review before apply', 'locked node preservation', 'comments', 'strict CSP', 'FR/EN', 'mobile', 'no provider writes'] }, null, 2));
  console.log(JSON.stringify({ output, results }, null, 2));
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
  closeScenarioStores(); closeDecisionStores();
  await rm(temp, { recursive: true, force: true });
}
