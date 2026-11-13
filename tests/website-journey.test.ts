import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { journeyContent, consoleFeature } from '../site/journey-content.js';
import { featureHandoff } from '../site/console/workspace-context.js';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it('covers every customer console section with a real destination and bilingual purpose', () => {
  const app = readFileSync('site/console/app.js', 'utf8');
  const sections = [...app.slice(app.indexOf('const SECTIONS ='), app.indexOf('const ALL =')).matchAll(/\{ id: "(\w+)", icon:/g)].map(m => m[1]);
  for (const language of ['en', 'fr']) {
    const { features, stages } = journeyContent(language);
    const page = parseHTML(readFileSync(language === 'fr' ? 'site/fr/index.html' : 'site/index.html', 'utf8')).document;
    expect(features).toHaveLength(31);
    for (const section of sections) expect(consoleFeature(section, '', language), section).toBeTruthy();
    for (const f of features) {
      expect(stages.some(s => s.id === f.stage)).toBe(true);
      for (const route of [f.route, f.next]) expect(route === '#c-public-read' || sections.includes(route.slice(1).split('/')[0]), route).toBe(true);
      const card = page.getElementById(`feature-${f.id}`);
      expect(card?.querySelector('a')?.getAttribute('href')).toBe(`/console/?lang=${language}${f.route}`);
      expect(card?.textContent).toContain(f.output);
      expect(card?.textContent).toContain(f.input);
    }
  }
});

it.each(['en', 'fr'])('filters, searches, recovers and recommends without hiding access in %s', async language => {
  const { document, window } = parseHTML(readFileSync(language === 'fr' ? 'site/fr/index.html' : 'site/index.html', 'utf8'));
  vi.stubGlobal('document', document); vi.stubGlobal('window', window); vi.stubGlobal('location', { hash: '' });
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await import('../site/journey.js');
  const visible = () => [...document.querySelectorAll('[data-feature]')].filter(n => !n.hasAttribute('hidden'));
  expect(visible()).toHaveLength(5);
  document.querySelector<HTMLButtonElement>('[data-profile="growth"]')!.click();
  expect(visible().every(n => n.getAttribute('data-feature-stage') === 'understand')).toBe(true);
  expect(document.querySelectorAll('#journey-recommendation a')).toHaveLength(4);
  const search = document.querySelector<HTMLInputElement>('#feature-query')!;
  search.value = 'nonexistent-feature-xyz'; search.dispatchEvent(new window.Event('input'));
  expect(visible()).toHaveLength(0);
  expect(document.getElementById('feature-count')?.textContent).toMatch(language === 'fr' ? /Aucune/ : /No matching/);
  document.getElementById('feature-reset')!.click(); expect(visible()).toHaveLength(31);
  search.value = 'Slack'; search.dispatchEvent(new window.Event('input'));
  expect(visible()).toHaveLength(1); expect(visible()[0].id).toBe('feature-slack');
  expect(fetcher).not.toHaveBeenCalled();
});

it('restores a selected function through sign-in without tenant selection or arbitrary URLs', () => {
  const memory = new Map<string, string>();
  const storage = { getItem: k => memory.get(k), setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) };
  const value = featureHandoff({ hash: '#local_seo/network', search: '?lang=fr' }, storage, 1000);
  expect(value).toEqual({ hash: '#local_seo/network', expires: 601000 });
  expect(featureHandoff({ hash: '', search: '?code=callback' }, storage, 2000)).toEqual(value);
  expect([...memory.keys()]).toEqual(['gtm-console-feature-handoff']);
  expect(featureHandoff({ hash: '#c-public-read', search: '' }, storage, 3000)).toBeNull();
  featureHandoff({ hash: '#local_seo/network', search: '' }, storage, 1000);
  expect(featureHandoff({ hash: '', search: '' }, storage, 601001)).toBeNull();
  for (const hash of ['https://evil.example', '#platform', '#billing', '#c-public-read', '#javascript:alert(1)']) expect(featureHandoff({ hash, search: '' }, storage, 700000)).toBeNull();
  storage.setItem('gtm-console-feature-handoff', '{bad json');
  expect(featureHandoff({ hash: '', search: '' }, storage)).toBeNull();
  expect(featureHandoff({ hash: '#ga4', search: '' }, { getItem() { throw new Error('Storage blocked'); }, setItem() { throw new Error('Storage blocked'); } })).toBeNull();
});

it.each(['en', 'fr'])('explains the selected function before sign-in in %s', async language => {
  const { document } = parseHTML('<html><body></body></html>');
  vi.stubGlobal('document', document);
  vi.stubGlobal('location', { search: `?lang=${language}` });
  vi.stubGlobal('localStorage', { getItem: () => language, setItem() {} });
  const { renderFeatureEntry } = await import('../site/console/feature-guide.js');
  const entry = renderFeatureEntry('#ga4', language);
  expect(entry?.textContent).toContain('Google Analytics 4');
  expect(entry?.querySelector('a')?.getAttribute('href')).toBe('#c-login-form');
  expect(entry?.textContent).toContain(journeyContent(language).features.find(f => f.id === 'ga4')?.input);
  expect(renderFeatureEntry('#unknown', language)).toBeNull();
});
