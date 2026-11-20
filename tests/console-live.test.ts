import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
let createReadRefresh: typeof import('../site/console/console-live.js').createReadRefresh;
let createOperationsFeed: typeof import('../site/console/console-live.js').createOperationsFeed;

const START = '2026-11-20T20:00:00.000Z';
const disposers: Array<() => void> = [];
const deferred = <T = unknown>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(0); };
function surfaces() {
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const win = new EventTarget();
  let isOnline = true;
  return { doc, win, online: () => isOnline, setOnline(value: boolean) { isOnline = value; win.dispatchEvent(new Event(value ? 'online' : 'offline')); } };
}
function loop(options: Record<string, unknown> = {}) {
  const env = surfaces();
  const onChange = vi.fn();
  const read = vi.fn().mockResolvedValue({ state: 'ready', metrics: [] });
  const controller = createReadRefresh({ ...env, read, onChange, ...options });
  disposers.push(() => controller.dispose());
  return { ...env, onChange, read, controller };
}
function dom() {
  const { document, window } = parseHTML('<html lang="en"><body></body></html>');
  Object.defineProperty(document, 'hidden', { configurable: true, writable: true, value: false });
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', window);
  vi.stubGlobal('navigator', { onLine: true });
  return { document, window };
}
function operations(overrides: Record<string, unknown> = {}) {
  return {
    model: 'operations', state: 'ready', source: 'Saved operations', readAt: '2026-11-20T19:59:58.000Z',
    period: { start: '2026-11-18T10:30:00.000Z', end: '2026-11-18T10:30:00.000Z' },
    metrics: [
      { id: 'prompts', value: 12 }, { id: 'pendingAlertsSample', value: 3 },
      { id: 'latestRunSucceeded', value: 8 }, { id: 'latestRunFailed', value: null },
    ], ...overrides,
  };
}
const values = (node: Element) => [...node.querySelectorAll('.live-metric strong')].map(item => item.textContent);

beforeEach(async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(START)); dom();
  vi.stubGlobal('location', { search: '?lang=en' });
  vi.stubGlobal('localStorage', { getItem: () => 'en', setItem() {} });
  ({ createReadRefresh, createOperationsFeed } = await import('../site/console/console-live.js'));
});
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe('bounded read refresh controller', () => {
  it('performs one initial read and waits a full 30 seconds between settled reads', async () => {
    const { controller, read, onChange } = loop();
    await settle();
    expect(read).toHaveBeenCalledTimes(1);
    expect(controller.snapshot()).toMatchObject({ status: 'ready', readAt: START, error: null });
    expect(onChange.mock.calls.map(call => call[0].status)).toEqual(['loading', 'ready']);
    await vi.advanceTimersByTimeAsync(29999);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(2);
    expect(controller.snapshot().readAt).toBe('2026-11-20T20:00:30.000Z');
  });

  it('never overlaps a pending read with timer, manual, visibility or online refreshes', async () => {
    const first = deferred();
    const read = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ state: 'ready' });
    const env = loop({ read });
    await settle();
    await Promise.all([env.controller.refresh(), env.controller.refresh()]);
    env.doc.dispatchEvent(new Event('visibilitychange'));
    env.win.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(90000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(env.controller.snapshot().status).toBe('loading');
    first.resolve({ state: 'ready', value: 7 }); await settle();
    expect(env.controller.snapshot()).toMatchObject({ status: 'ready', data: { value: 7 }, readAt: '2026-11-20T20:01:30.000Z' });
    await vi.advanceTimersByTimeAsync(29999);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('pauses hidden or offline pages, then refreshes immediately on a usable surface', async () => {
    const env = loop(); await settle();
    env.doc.hidden = true; env.doc.dispatchEvent(new Event('visibilitychange'));
    expect(env.controller.snapshot().status).toBe('paused');
    await vi.advanceTimersByTimeAsync(90000); await env.controller.refresh();
    expect(env.read).toHaveBeenCalledTimes(1);
    env.doc.hidden = false; env.doc.dispatchEvent(new Event('visibilitychange')); await settle();
    expect(env.read).toHaveBeenCalledTimes(2);
    env.setOnline(false);
    expect(env.controller.snapshot().status).toBe('paused');
    await vi.advanceTimersByTimeAsync(90000); await env.controller.refresh();
    expect(env.read).toHaveBeenCalledTimes(2);
    env.setOnline(true); await settle();
    expect(env.read).toHaveBeenCalledTimes(3);
    expect(env.controller.snapshot().status).toBe('ready');
  });

  it('does not start a read until an initially hidden and offline page is both visible and online', async () => {
    const env = surfaces(); env.doc.hidden = true; env.setOnline(false);
    const read = vi.fn().mockResolvedValue({ state: 'ready' });
    const controller = createReadRefresh({ ...env, read, onChange: vi.fn() });
    disposers.push(() => controller.dispose());
    await settle();
    expect(controller.snapshot().status).toBe('paused');
    expect(read).not.toHaveBeenCalled();
    env.doc.hidden = false; env.doc.dispatchEvent(new Event('visibilitychange')); await settle();
    expect(read).not.toHaveBeenCalled();
    env.setOnline(true); await settle();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('lets an already running read settle while hidden but schedules no further background reads', async () => {
    const request = deferred();
    const read = vi.fn().mockReturnValueOnce(request.promise).mockResolvedValue({ state: 'ready', value: 2 });
    const env = loop({ read }); await settle();
    env.doc.hidden = true; env.doc.dispatchEvent(new Event('visibilitychange'));
    request.resolve({ state: 'ready', value: 1 }); await settle();
    expect(env.controller.snapshot()).toMatchObject({ status: 'paused', data: { value: 1 }, readAt: START });
    await vi.advanceTimersByTimeAsync(60000); expect(read).toHaveBeenCalledTimes(1);
    env.doc.hidden = false; env.doc.dispatchEvent(new Event('visibilitychange')); await settle();
    expect(read).toHaveBeenCalledTimes(2);
    expect(env.controller.snapshot().data.value).toBe(2);
  });

  it('rejects late results and all further refreshes when the workspace or property scope changes', async () => {
    let scope = 'tenant-a:property-1';
    const request = deferred();
    const read = vi.fn().mockReturnValue(request.promise);
    const env = loop({ read, getScope: () => scope }); await settle();
    const callbacksBeforeChange = env.onChange.mock.calls.length;
    scope = 'tenant-b:property-2';
    request.resolve({ state: 'ready', privateValue: 'tenant-a result' }); await settle();
    expect(env.onChange).toHaveBeenCalledTimes(callbacksBeforeChange);
    expect(env.controller.snapshot().data).toBeNull();
    expect(env.controller.snapshot().readAt).toBeNull();
    env.doc.dispatchEvent(new Event('visibilitychange'));
    env.win.dispatchEvent(new Event('online'));
    await env.controller.refresh(); await vi.advanceTimersByTimeAsync(90000);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('removes event handlers and ignores a pending response after disposal', async () => {
    const request = deferred();
    const read = vi.fn().mockReturnValue(request.promise);
    const env = loop({ read });
    const removeDoc = vi.spyOn(env.doc, 'removeEventListener');
    const removeWin = vi.spyOn(env.win, 'removeEventListener');
    await settle(); const count = env.onChange.mock.calls.length;
    env.controller.dispose();
    expect(removeDoc.mock.calls.map(call => call[0])).toContain('visibilitychange');
    expect(removeWin.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining(['online', 'offline']));
    request.resolve({ state: 'ready', privateValue: 'obsolete' }); await settle();
    env.doc.dispatchEvent(new Event('visibilitychange')); env.win.dispatchEvent(new Event('online'));
    await env.controller.refresh(); await vi.advanceTimersByTimeAsync(90000);
    expect(env.onChange).toHaveBeenCalledTimes(count);
    expect(env.controller.snapshot().data).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('retains the last good payload and successful read time on failed or unavailable reads', async () => {
    const good = operations();
    const read = vi.fn().mockResolvedValueOnce(good).mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({ state: 'unavailable', summary: 'source unavailable', metrics: [] })
      .mockResolvedValueOnce({ state: 'not-configured', metrics: [] })
      .mockResolvedValueOnce({ state: 'choose-source', sources: ['123', '456'] })
      .mockResolvedValueOnce({ problem: { message: 'quota' }, metrics: [] });
    const env = loop({ read }); await settle();
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(new Date(Date.parse(START) + (i + 1) * 1000));
      await env.controller.refresh();
      const snapshot = env.controller.snapshot();
      expect(snapshot.status).toBe('error');
      expect(snapshot.data).toBe(good);
      expect(snapshot.readAt).toBe(START);
      expect(snapshot.error).toBeTruthy();
    }
  });

  it('keeps missing initial data unknown, and treats an explicitly empty successful response as distinct from an error', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ state: 'empty', metrics: [], period: null });
    const env = loop({ read }); await settle();
    expect(env.controller.snapshot()).toMatchObject({ status: 'error', data: null, readAt: null });
    vi.setSystemTime(new Date(Date.parse(START) + 1000)); await env.controller.refresh();
    expect(env.controller.snapshot()).toMatchObject({ status: 'ready', data: { state: 'empty', metrics: [] }, readAt: '2026-11-20T20:00:01.000Z', error: null });
  });

  it('bounds an excessively short configured interval to 15 seconds', async () => {
    const env = loop({ interval: 1 }); await settle();
    await vi.advanceTimersByTimeAsync(14999); expect(env.read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(env.read).toHaveBeenCalledTimes(2);
  });
});

describe('operations activity feed', () => {
  it.each(['fr', 'en'])('reads recorded operations only and distinguishes reception time from observation period (%s)', async language => {
    const { document } = dom();
    const api = vi.fn().mockResolvedValue(operations());
    const node = createOperationsFeed({ api, language, getScope: () => 'tenant-a' });
    disposers.push(() => node.dispose()); document.body.append(node); await settle();
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith('/data-agent/query', { model: 'operations', locale: language, days: 28 });
    expect(node.querySelector('[data-live-status]')?.getAttribute('data-live-status')).toBe('ready');
    expect(values(node)).toEqual(['12', '3', '8', '—']);
    expect(node.querySelector('[data-live-read-at]')?.getAttribute('data-live-read-at')).toBe(START);
    expect(node.textContent).toContain(new Date(operations().period.end).toLocaleString(language));
    expect(node.textContent).toContain(language === 'fr' ? 'Collecte observée le' : 'Collection observed on');
    expect(node.textContent).toContain(language === 'fr' ? 'Échantillon limité à 200' : 'Sample limited to 200');
    expect(node.textContent).toContain(language === 'fr' ? 'période et le délai propres à leur source' : 'reporting period and delay');
    expect([...node.querySelectorAll('a')].map(link => link.getAttribute('href'))).toEqual(['#ops/alerts', '#ops/prompts', '#ga4/realtime']);
  });

  it('keeps displayed last-good values and timestamp on failure, then recovers without substituting unknown values with zero', async () => {
    const { document } = dom();
    const api = vi.fn().mockResolvedValueOnce(operations()).mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(operations({ metrics: [{ id: 'prompts', value: 0 }, { id: 'pendingAlertsSample', value: Infinity }, { id: 'latestRunSucceeded', value: NaN }], period: null }));
    const node = createOperationsFeed({ api, language: 'en', getScope: () => 'tenant-a' });
    disposers.push(() => node.dispose()); document.body.append(node); await settle();
    const refresh = node.querySelector('[data-live-refresh]') as HTMLButtonElement;
    vi.setSystemTime(new Date(Date.parse(START) + 1000)); refresh.click(); await settle();
    expect(node.querySelector('[data-live-status]')?.getAttribute('data-live-status')).toBe('error');
    expect(values(node)).toEqual(['12', '3', '8', '—']);
    expect(node.querySelector('[data-live-read-at]')?.getAttribute('data-live-read-at')).toBe(START);
    expect(node.textContent).toContain('previous data'); expect(refresh.disabled).toBe(false);
    vi.setSystemTime(new Date(Date.parse(START) + 2000)); refresh.click(); await settle();
    expect(node.querySelector('[data-live-status]')?.getAttribute('data-live-status')).toBe('ready');
    expect(values(node)).toEqual(['0', '—', '—', '—']);
    expect(node.querySelector('[data-live-read-at]')?.getAttribute('data-live-read-at')).toBe('2026-11-20T20:00:02.000Z');
    expect(node.textContent).toContain('No dated collection available');
    expect(node.textContent).toContain('does not start a collection');
    expect(node.textContent).not.toContain('previous data');
  });

  it('does not display a late result from a different scope or a disposed feed', async () => {
    const { document } = dom();
    let scope = 'tenant-a';
    const request = deferred(); const api = vi.fn().mockReturnValue(request.promise);
    const node = createOperationsFeed({ api, language: 'fr', getScope: () => scope });
    disposers.push(() => node.dispose()); document.body.append(node); await settle();
    scope = 'tenant-b'; request.resolve(operations({ metrics: [{ id: 'prompts', value: 999 }] })); await settle();
    expect(values(node)).toEqual([]); expect(node.textContent).not.toContain('999');
    expect(node.querySelector('[data-live-read-at]')?.getAttribute('data-live-read-at')).toBe('');
    node.dispose(); await vi.advanceTimersByTimeAsync(90000);
    expect(api).toHaveBeenCalledTimes(1);
  });
});
