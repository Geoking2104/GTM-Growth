import { afterEach, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { DECISION_AREAS, DECISION_VIEWS, decisionLocation } from '../site/console/decision-navigation.js';
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it('keeps business areas stable and resolves source bookmarks into their task', () => {
  expect(DECISION_AREAS.map(a => a.id)).toEqual(['overview','diagnose','ops','impact','settings']);
  expect(decisionLocation('gsc','query-pages')).toEqual({ area: 'diagnose', view: 'intent' });
  expect(decisionLocation('ga4','ecommerce')).toEqual({ area: 'impact', view: 'analytics' });
  expect(decisionLocation('social','approvals')).toEqual({ area: 'ops', view: 'inbox' });
  expect(decisionLocation('crm','connections')).toEqual({ area: 'settings', view: 'sources' });
  expect(decisionLocation('ops','articles')).toEqual({ area: 'ops', view: 'content' });
  expect(decisionLocation('constructor')).toEqual({ area: 'overview', view: 'board' });
  for (const views of Object.values(DECISION_VIEWS)) expect(new Set(views.map(v => v.icon)).size).toBe(views.length);
});
it('keeps unavailable sources in a closed evidence drawer and does not call provider writes', async () => {
  const { document, window } = parseHTML('<html lang="en"><body></body></html>');
  vi.stubGlobal('document', document); vi.stubGlobal('window', window); vi.stubGlobal('Node', window.Node);
  vi.stubGlobal('location', { search: '?lang=en' }); vi.stubGlobal('localStorage', { getItem: () => 'en', setItem() {} });
  const { renderDecisionHub, sourceAvailability } = await import('../site/console/decision-workspace.js');
  const api = vi.fn(async () => ({ ga4: { hasAccess: false } }));
  const node = renderDecisionHub('impact', 'analytics', { state: { me: { tenant: { id: 'one' } } }, api, scope: () => ({ ga4Property: '1' }) });
  document.body.append(node);
  await vi.waitFor(() => expect(node.querySelector('.decision-enrich')?.textContent).toContain('Check permissions'));
  expect(node.querySelector(':scope > .decision-grid')?.children.length).toBe(0);
  expect(node.querySelector('details')?.hasAttribute('open')).toBe(false);
  expect(api.mock.calls).toHaveLength(1);
  expect(api.mock.calls[0][0]).toBe('/tracking/status');
  expect(sourceAvailability('ga4', { ga4: { error: 'denied' } })).toBe('unavailable');
  expect(sourceAvailability('ga4', { ga4: { hasAccess: true } })).toBe('connected');
  expect(sourceAvailability('gbp', { capabilities: { gbp: 'configured' }, bindings: [] })).toBe('not-configured');
  expect(sourceAvailability('crm', { settings: { enabled: false } })).toBe('not-configured');
  expect(sourceAvailability('social', { capabilities: { postiz: true, accounts: [] } })).toBe('not-configured');
  expect(sourceAvailability('social', { capabilities: { postiz: true, accounts: [{ id: 'allowed' }] } })).toBe('connected');
  expect(sourceAvailability('ai', { datasets: [] })).toBe('not-configured');
  expect(node.textContent).toContain('not assessed globally');
});
it('renders cached connection results that resolve before the view is mounted', async () => {
  const { document, window } = parseHTML('<html lang="en"><body></body></html>');
  vi.stubGlobal('document', document); vi.stubGlobal('window', window); vi.stubGlobal('Node', window.Node);
  vi.stubGlobal('location', { search: '?lang=en' }); vi.stubGlobal('localStorage', { getItem: () => 'en', setItem() {} });
  const { renderDecisionHub } = await import('../site/console/decision-workspace.js');
  const node = renderDecisionHub('impact', 'analytics', { state: {}, api: () => Promise.resolve({ ga4: { hasAccess: true } }), scope: () => ({}) });
  await vi.waitFor(() => expect(node.querySelector(':scope > .decision-grid')?.children.length).toBe(2));
  document.body.append(node);
  expect(node.querySelector('details')?.hidden).toBe(true);
});
it('keeps empty overview measurements behind a closed drawer while retaining measured charts', async () => {
  const { document, window } = parseHTML('<html lang="en"><body></body></html>');
  // linkedom omits the browser's writable select.value API used by the toolbar.
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', { configurable: true,
    get() { return [...this.options].find(o => o.selected)?.value || ''; },
    set(value) { for (const option of this.options) option.selected = option.value === value; },
  });
  vi.stubGlobal('document', document); vi.stubGlobal('window', window); vi.stubGlobal('Node', window.Node);
  vi.stubGlobal('location', { search: '?lang=en' }); vi.stubGlobal('localStorage', { getItem: () => 'en', setItem() {} });
  const { renderAudienceOverview } = await import('../site/console/audience-overview.js');
  const args = { state: { days: 28 }, rerender() {}, progressive: true };
  const empty = renderAudienceOverview({ ...args, status: { ga4: { hasAccess: false } } });
  expect(empty.querySelector(':scope > .audience-grid')?.children.length).toBe(0);
  expect(empty.querySelector('.decision-enrich')?.hasAttribute('open')).toBe(false);
  expect(empty.querySelector('.decision-enrich .audience-ai')).toBeTruthy();
  const measured = renderAudienceOverview({ ...args, status: { ga4: { hasAccess: true } }, ga4: { trend: [{ date: '2026-11-01', sessions: 12 }] } });
  expect(measured.querySelector(':scope > .audience-grid')?.children.length).toBe(1);
  expect(measured.querySelector(':scope > .audience-grid svg')).toBeTruthy();
});
