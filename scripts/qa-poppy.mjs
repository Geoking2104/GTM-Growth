/** Local browser fixtures: UX evidence only, never external-agent interoperability. */
import fs from 'node:fs/promises';
import express from 'express';
import { chromium } from 'playwright-core';
const output = process.env.PAP_QA_OUTPUT_DIR || '../qa-poppy';
const app = express(); app.use(express.static('site'));
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
await fs.mkdir(output, { recursive: true });
try {
  for (const lang of ['en', 'fr']) for (const width of [390, 1440]) for (const consent of [true, false]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } }); const errors = []; page.on('pageerror', e => errors.push(e.message)); let revoked = false;
    await page.route('**/console/auth.js', r => r.fulfill({ contentType: 'text/javascript', body: 'export const handleRedirect=async()=>({}),accessToken=async()=>"fixture",login=async()=>{};' }));
    await page.route('**/api/poppy/console/**', async route => {
      const path = new URL(route.request().url()).pathname; const body = route.request().postDataJSON();
      if (path.endsWith('/revoke')) { revoked = true; await route.fulfill({ json: { revoked: true } }); return; }
      const client = 'https://agent.example/client.json'; const scopes = ['workspace', 'search', 'analytics', 'visibility', 'operations'].map(x => `gtm:${x}:read`);
      const resources = { domains: ['acme.example'], search: ['sc-domain:acme.example'], analytics: ['123456'] };
      const data = { workspaces: [{ id: 'acme', name: 'Acme · Test fixture' }], tenant: { id: 'acme', name: 'Acme · Test fixture' }, role: 'tenant-user', user: 'pilot-user', resources, policy: { enabled: true, clients: [client] }, allowedClients: [client], scopes, grants: [{ id: 'grant', client, clientName: 'Pilot agent · Test fixture', user: 'pilot-user', scopes, resources, created: 1794700000, expires: Date.now()/1000+86400, lastUsed: null, revoked: revoked ? 1794700010 : null }], request: consent ? { client, clientName: 'Pilot agent · Test fixture', scopes, allowed: true } : null };
      if (body.request && !consent) throw new Error('Unexpected pending consent');
      await route.fulfill({ json: data });
    });
    await page.goto(`${base}/console/agents.html?lang=${lang}${consent ? '&request=fixture-request' : ''}`);
    await page.getByRole('heading', { name: lang === 'fr' ? 'Agents connectés' : 'Connected agents' }).waitFor();
    if (consent) {
      const inputs = page.locator('input[type=checkbox]'); if (await inputs.count() !== 8) throw new Error('Missing permissions or sources');
      if ((await inputs.evaluateAll(xs => xs.filter(x => x.checked).length)) !== 0) throw new Error('Consent is preselected');
      await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
    } else {
      await page.getByRole('button', { name: lang === 'fr' ? 'Révoquer l’accès' : 'Revoke access' }).click();
      await page.getByRole('status').getByText(lang === 'fr' ? 'Accès révoqué. Les nouvelles lectures sont bloquées.' : 'Access revoked. New reads are blocked.').waitFor();
    }
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    if (scrollWidth > width + 2 || errors.length) throw new Error(JSON.stringify({ lang, width, consent, scrollWidth, errors }));
    await page.screenshot({ path: `${output}/${lang}-${width}-${consent ? 'consent' : 'revoked'}.png`, fullPage: true });
    console.log(JSON.stringify({ lang, width, consent, scrollWidth, errors, revoked })); await page.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
