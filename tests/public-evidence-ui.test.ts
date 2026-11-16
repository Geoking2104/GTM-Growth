import { afterEach, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { buildFreeReadEvidence } from '../src/freeread/evidence.js';
import { HtmlDoc } from '../src/geo/html.js';
import { renderPublicEvidence } from '../site/console/public-evidence.js';
import { openLocalDashboard } from '../site/console/local-dashboard-entry.js';
import { featureHandoff } from '../site/console/workspace-context.js';

afterEach(() => vi.unstubAllGlobals());
const source = 'https://example.com/';
function fixture() {
  const html = '<title>&lt;img src=x onerror=alert(1)&gt;</title><meta name="robots" content="noindex">';
  const page = { url: source, status: 200, ok: true, body: html, headers: {} };
  return { evidence: buildFreeReadEvidence(page, HtmlDoc.parse(html), null, [null, { ...page, status: 404 }], [source + 'sitemap.xml', source + 'sitemap_index.xml']) };
}

it.each(['en', 'fr'])('shows literal evidence and sources, keeps unknown fetches honest in %s', language => {
  const { document } = parseHTML('<html></html>'); vi.stubGlobal('document', document);
  const panel = renderPublicEvidence(fixture(), language);
  expect(panel.querySelectorAll('[data-evidence]')).toHaveLength(4);
  expect(panel.querySelector('[data-evidence="title"] code')?.textContent).toContain('<img src=x onerror=alert(1)>');
  expect(panel.querySelectorAll('img,script')).toHaveLength(0);
  expect(panel.querySelector('[data-evidence="canonical"]')?.textContent).toContain('0');
  expect(panel.querySelector('[data-evidence="indexing"]')?.className).toContain('public-status-fail');
  expect(panel.querySelector('[data-evidence="sitemap"]')?.className).toContain('public-status-warn');
  expect(panel.textContent).toContain('HTTP 404');
  expect(panel.querySelector('a')?.getAttribute('href')).toBe(source);
  expect(panel.querySelector('time')?.getAttribute('datetime')).toBeTruthy();
});

it('does not turn untrusted canonical or sitemap values into executable links', () => {
  const { document } = parseHTML('<html></html>'); vi.stubGlobal('document', document);
  const data = fixture(); data.evidence.canonicals = [{ value: 'javascript:alert(1)', truncated: false }];
  data.evidence.robots.declarations = ['javascript:alert(1)'];
  const panel = renderPublicEvidence(data);
  expect(panel.querySelectorAll('a[href^="javascript:"]')).toHaveLength(0);
  expect(panel.querySelector('[data-evidence="canonical"]')?.className).toContain('public-status-fail');
  expect(renderPublicEvidence({ tables: [] }).textContent).toContain('Run the analysis again');
});

it('opens sign-in on repeated same-route clicks and keeps GBP through the auth callback', () => {
  const { document } = parseHTML('<html><form id="c-login-form"><input id="c-login-email"></form></html>');
  const location = { hash: '#local_seo/network', search: '?lang=fr' };
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
  vi.stubGlobal('document', document); vi.stubGlobal('location', location); vi.stubGlobal('sessionStorage', storage);
  vi.stubGlobal('history', { replaceState: vi.fn((_state, _unused, hash) => { location.hash = hash; }) });
  const scroll = vi.fn(), focus = vi.fn();
  document.getElementById('c-login-form')!.scrollIntoView = scroll;
  document.getElementById('c-login-email')!.focus = focus;
  openLocalDashboard('fr'); openLocalDashboard('fr');
  expect(scroll).toHaveBeenCalledTimes(2); expect(focus).toHaveBeenCalledTimes(2);
  expect(document.querySelectorAll('#c-local-dashboard-login')).toHaveLength(1);
  expect(document.getElementById('c-local-dashboard-login')!.textContent).toContain('Google Business Profile');
  expect(featureHandoff({ hash: '', search: '?code=callback' }, storage)?.hash).toBe('#local_seo/network');
});
