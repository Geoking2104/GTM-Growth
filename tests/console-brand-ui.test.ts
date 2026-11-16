import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
beforeEach(() => {
  const { document, window } = parseHTML('<html><body></body></html>');
  vi.stubGlobal('document', document); vi.stubGlobal('window', window); vi.stubGlobal('Node', window.Node);
  vi.stubGlobal('location', { search: '?lang=en' }); vi.stubGlobal('localStorage', { getItem: () => 'en', setItem: vi.fn() });
});
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it('identifies known providers locally and keeps unknown names as safe text', async () => {
  const { providerMark, providerAsset } = await import('../site/console/provider-marks.js');
  const mark = providerMark('Google Analytics 4');
  expect(mark.querySelector('img')?.getAttribute('src')).toBe('/assets/providers/google-analytics.svg');
  expect(mark.textContent).toBe('Google Analytics 4');
  const unknown = providerMark('<img src=x onerror=alert(1)>');
  expect(unknown.querySelector('img')).toBeNull(); expect(unknown.textContent).toContain('<img');
  expect(providerAsset('constructor')).toBeNull();
  mark.querySelector('img')!.dispatchEvent(new window.Event('error'));
  expect(mark.querySelector('img')).toBeNull(); expect(mark.querySelector('svg')).toBeTruthy();
});
it('shows real scores including zero and leaves unknown readiness unfilled', async () => {
  const { renderOverview } = await import('../site/console/overview.js');
  const host = document.createElement('main');
  host.append(...renderOverview({ geo: { score: 42, projectedScore: 100 }, platforms: [
    { label: 'ChatGPT', score: 42 }, { label: 'Gemini', score: 0 }, { label: 'Claude', score: null },
  ] }));
  const rows = [...host.querySelectorAll('.v-engine-rank')];
  expect(rows.map(r => r.querySelector('.rank-score')?.textContent)).toEqual(['42', '0', '—']);
  expect(rows.map(r => r.querySelector('.v-score-track i')?.getAttribute('style') ?? null)).toEqual(['width:42%', 'width:0%', null]);
  expect(host.querySelectorAll('.v-provider img')).toHaveLength(3);
});
it('plots zero but does not turn missing analytics observations into zero or join across gaps', async () => {
  const { lineChart } = await import('../site/console/analytics.js');
  const chart = lineChart([{ date: '2026-11-01', sessions: 0 }, { date: '2026-11-02', sessions: 10 }, { date: '2026-11-03', sessions: null }, { date: '2026-11-04', sessions: 8 }], [{ key: 'sessions', label: 'Sessions', color: '#6935dc' }], 'Traffic');
  expect(chart.querySelectorAll('circle')).toHaveLength(3);
  expect(chart.querySelectorAll('polyline')).toHaveLength(1);
  expect(chart.querySelector('title')?.textContent).toContain('Sessions: 0');
  expect(chart.innerHTML).not.toMatch(/NaN|Infinity/);
});
