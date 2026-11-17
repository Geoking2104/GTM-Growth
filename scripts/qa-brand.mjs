#!/usr/bin/env node
/** CI-only browser QA: disposable Keycloak 26.4, native login and real dashboard renderers.
 * No production credentials, no real provider calls, no submitted customer forms. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, mkdtemp, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const output = path.resolve(process.env.BRAND_QA_OUTPUT_DIR || 'qa-brand');
await mkdir(output, { recursive: true });
const temp = await mkdtemp(path.join(tmpdir(), 'gtm-brand-'));
await chmod(temp, 0o755); // Keycloak runs as an unprivileged container user.
const container = `gtm-brand-qa-${process.pid}`;
const root = path.resolve('site');
const server = createServer(async (req, res) => {
  try {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep)) throw new Error('Invalid path');
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' })[path.extname(file)] || 'text/html');
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser, activePage;
try {
  await writeFile(path.join(temp, 'realm.json'), JSON.stringify({ realm: 'brand-qa', enabled: true, loginTheme: 'gtm-growth', accountTheme: 'gtm-growth', users: [{ username: 'brand-reviewer', enabled: true, clientRoles: { account: ['manage-account', 'view-profile'] }, emailVerified: true, email: 'brand-reviewer@example.test', firstName: 'Brand', lastName: 'Reviewer', credentials: [{ type: 'password', value: 'brand-qa-local-only', temporary: false }] }], displayName: 'GTM Growth', internationalizationEnabled: true, supportedLocales: ['fr', 'en'], defaultLocale: 'fr', resetPasswordAllowed: true, registrationAllowed: true, clients: [{ clientId: 'brand-qa', name: 'GTM Growth console', rootUrl: origin, baseUrl: `${origin}/callback`, enabled: true, publicClient: true, standardFlowEnabled: true, redirectUris: [`${origin}/*`] }] }));
  execFileSync('docker', ['run', '--detach', '--rm', '--name', container, '-p', '127.0.0.1:8119:8080', '-v', `${path.resolve('deploy/kayroslab-vps/keycloak/themes')}:/opt/keycloak/themes:ro`, '-v', `${temp}:/opt/keycloak/data/import:ro`, 'quay.io/keycloak/keycloak:26.4', 'start-dev', '--import-realm'], { stdio: 'inherit' });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try { ready = (await fetch('http://127.0.0.1:8119/realms/brand-qa/.well-known/openid-configuration')).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(ready, 'Disposable Keycloak must start');
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  for (const lang of ['fr', 'en']) for (const width of [1280, 390]) {
    const page = activePage = await browser.newPage({ viewport: { width, height: 960 }, colorScheme: 'dark' });
    page.on('pageerror', error => console.error('Keycloak fixture browser error:', error.message));
    page.on('response', response => { if (response.status() >= 400 && new URL(response.url()).origin === 'http://127.0.0.1:8119') console.error('Keycloak fixture HTTP:', response.status(), new URL(response.url()).pathname); });
    page.on('console', message => { if (message.type() === 'error') console.error('Keycloak fixture console:', message.text()); });
    const url = new URL('http://127.0.0.1:8119/realms/brand-qa/protocol/openid-connect/auth');
    url.search = new URLSearchParams({ client_id: 'brand-qa', redirect_uri: `${origin}/callback`, response_type: 'code', scope: 'openid', ui_locales: lang });
    await page.goto(url.href); await page.locator('#username').waitFor(); await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('html').getAttribute('lang'), lang);
    assert.match(await page.locator('link[rel=icon]').getAttribute('href'), /logo-rocket.png$/);
    assert.equal((await page.locator('#kc-header-wrapper').innerText()).trim(), 'GTM Growth');
    assert.equal(await page.locator('#kc-header-wrapper').evaluate(el => getComputedStyle(el).color), 'rgb(25, 20, 38)');
    assert.equal(await page.locator('.pf-v5-c-login__main-header').evaluate(el => getComputedStyle(el).borderTopWidth), '0px');
    const metrics = await page.evaluate(() => {
      const input = document.querySelector('#username'), control = input.closest('.pf-v5-c-form-control');
      return { field: input.getBoundingClientRect().height, radius: getComputedStyle(control).borderRadius, button: getComputedStyle(document.querySelector('#kc-login')).backgroundColor, logo: getComputedStyle(document.querySelector('#kc-header'), '::before').backgroundImage, width: document.documentElement.scrollWidth, dark: document.documentElement.classList.contains('pf-v5-theme-dark') };
    });
    assert.ok(metrics.field >= 48); assert.equal(metrics.radius, '9px'); assert.equal(metrics.button, 'rgb(105, 53, 220)'); assert.match(metrics.logo, /logo-rocket.png/); assert.ok(metrics.width <= width + 1); assert.equal(metrics.dark, false);
    await page.locator('#username').focus();
    assert.equal(await page.locator('#username').evaluate(el => getComputedStyle(el.closest('.pf-v5-c-form-control')).borderTopColor), 'rgb(105, 53, 220)');
    await page.locator('#password').fill('qa-local-only');
    const toggle = page.locator('button[data-password-toggle]');
    await toggle.click(); assert.equal(await page.locator('#password').getAttribute('type'), 'text');
    await toggle.click(); assert.equal(await page.locator('#password').getAttribute('type'), 'password');
    await page.locator('#password').fill('');
    await page.screenshot({ path: path.join(output, `signin-${lang}-${width}.png`), fullPage: true });
    await page.locator('a[href*="reset-credentials"]').click(); await page.locator('#username').waitFor();
    assert.equal(await page.locator('#username').evaluate(el => getComputedStyle(el.closest('.pf-v5-c-form-control')).borderRadius), '9px');
    await page.screenshot({ path: path.join(output, `reset-${lang}-${width}.png`), fullPage: true });
    const back = page.locator('.gtm-auth-footer a');
    assert.equal(await back.getAttribute('href'), `https://gtm.kayroslab.com/console/?lang=${lang}`);

    // Exercise the real account React application with a disposable fixture user.
    // Native login is used; no production account, token injection or mocked DOM.
    const account = `http://127.0.0.1:8119/realms/brand-qa/account/?${new URLSearchParams({kc_locale:lang,referrer:"brand-qa",referrer_uri:`${origin}/callback?lang=${lang}`})}`;
    await page.goto(account);
    await page.locator('#username').fill('brand-reviewer');
    await page.locator('#password').fill('brand-qa-local-only');
    await page.locator('#kc-login').click();
    const brand = page.locator('[data-testid="page-header"] img[alt="GTM Growth"]');
    await brand.waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.title(), 'GTM Growth');
    assert.equal(await page.locator('[data-testid=referrer-link]').getAttribute('href'), `${origin}/callback?lang=${lang}`);
    assert.match(await brand.getAttribute('src'), /gtm-growth\/img\/brand.svg$/);
    assert.equal(await brand.evaluate(el => el.complete && el.naturalWidth > 0), true);
    assert.equal(await brand.evaluate(el => el.closest('a')?.href), 'https://gtm.kayroslab.com/console/');
    assert.equal(await page.locator('[data-testid="page-header"]').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
    assert.equal(await page.locator('html').evaluate(el => el.classList.contains('pf-v5-theme-dark')), false);
    assert.match(await page.locator('body').evaluate(el => getComputedStyle(el).fontFamily), /Inter/);
    const save = page.locator('.pf-v5-c-button.pf-m-primary').first();
    await save.waitFor();
    assert.equal(await save.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(105, 53, 220)');
    const accountInput = page.locator('input.pf-v5-c-form-control, .pf-v5-c-form-control input').first();
    assert.equal(await accountInput.evaluate(el => getComputedStyle(el.closest('.pf-v5-c-form-control')).borderRadius), '9px');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(output, `account-${lang}-${width}.png`), fullPage: true });

    await page.route('**/brand-fixture*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/brand.css"><link rel="stylesheet" href="/console/shell.css"><link rel="stylesheet" href="/console/visual.css"></head><body class="console-page"><main class="c-app" style="padding:24px;max-width:1200px;margin:auto"><p>GTM Growth · ${lang === 'fr' ? 'Données de test' : 'Test data'}</p><div id="fixture"></div></main></body></html>` }));
    await page.goto(`${origin}/brand-fixture?lang=${lang}`);
    await page.evaluate(async (lang) => {
      const { renderOverview } = await import('/console/overview.js');
      const { sectionHeading } = await import('/console/visuals.js');
      const { renderDataGuide } = await import('/console/data-guidance.js');
      const { lineChart } = await import('/console/analytics.js');
      const { icon } = await import('/console/icons.js'); const { TAB_ICONS } = await import('/console/tab-icons.js');
      const host = document.getElementById('fixture');
      const nav = document.createElement('nav'); nav.className = 'app-tabs';
      for (const [key, symbol] of Object.entries(TAB_ICONS.ga4)) { const b = document.createElement('button'); b.className = 'app-tab'; const span = document.createElement('span'); span.className = 'app-tab-icon'; span.innerHTML = icon(symbol); b.append(span, ({overview: lang === 'fr' ? 'Audience' : 'Audience', ecommerce: 'E-commerce', technology: lang === 'fr' ? 'Appareils' : 'Devices', realtime: lang === 'fr' ? 'Temps réel' : 'Realtime'})[key]); nav.append(b); }
      host.append(nav, sectionHeading('Google Analytics 4', '', 'ga4'));
      host.append(...renderOverview({ geo: { score: 42, projectedScore: 100, recommendations: [{ points: 20 }, { points: 38 }], breakdown: { robots: 12, meta: 14 }, max: { robots: 18, meta: 14 } }, citability: { score: 42 }, indexnow: { score: 35 }, platforms: [{ label: 'Perplexity', score: 45 }, { label: 'Google AI Overviews', score: 25 }, { label: 'ChatGPT', score: 25 }, { label: 'Gemini', score: 25 }, { label: 'Microsoft Copilot', score: 0 }] }));
      host.append(lineChart([{ date: '2026-11-01', sessions: 0 }, { date: '2026-11-02', sessions: 40 }, { date: '2026-11-03', sessions: null }, { date: '2026-11-04', sessions: 20 }], [{ key: 'sessions', label: 'Sessions', color: '#6935dc' }], 'GA4 · Sessions'));
      host.append(renderDataGuide('ga4'));
    }, lang);
    await page.waitForFunction(() => [...document.querySelectorAll('.v-provider img')].every(img => img.complete && img.naturalWidth > 0));
    assert.equal(await page.locator('.v-engine-rank').count(), 5);
    assert.equal(await page.locator('.v-section-heading img').count(), 1);
    assert.doesNotMatch(await page.locator('body').innerText(), /Ã|Â/);
    assert.equal(await page.locator('.v-source-pending').count(), 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(output, `dashboard-${lang}-${width}.png`), fullPage: true });
    await page.close();
  }
  console.log('Brand QA passed: native Keycloak login/reset/toggle and account console, FR/EN, desktop/mobile, dark preference, provider marks and data charts.');
} catch (error) {
  if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
  try { execFileSync('docker', ['rm', '--force', container], { stdio: 'ignore' }); } catch {}
  await rm(temp, { recursive: true, force: true });
}
