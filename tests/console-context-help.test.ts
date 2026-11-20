import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { attachContextualHelp } from '../site/console/context-help.js';
import { getElementGuide } from '../site/console/coach-model.js';

const disposers: Array<() => void> = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); vi.unstubAllGlobals(); });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function fixture(markup: string, options: { language?: string; context?: () => Record<string, string>; observed?: (count: number) => void } = {}) {
  const { document, window } = parseHTML(`<html><body><main id="help-root">${markup}</main></body></html>`);
  const root = document.querySelector('#help-root')!;
  const NativeObserver = window.MutationObserver;
  let callbacks = 0;
  vi.stubGlobal('MutationObserver', class extends NativeObserver {
    constructor(callback: MutationCallback) {
      super((records: MutationRecord[], observer: MutationObserver) => { callbacks++; options.observed?.(callbacks); callback(records, observer); });
    }
  });
  const explain = vi.fn();
  const helper = attachContextualHelp(root, { language: options.language || 'en', getContext: options.context || (() => ({ section: 'overview', tab: 'board' })), onExplain: explain });
  disposers.push(helper.dispose);
  return { document, window, root, helper, explain, callbacks: () => callbacks };
}

describe('contextual element help', () => {
  it('adds distinct accessible help to fields, cards, charts, actions, columns, navigation and sections', () => {
    const { root } = fixture(`
      <h2>Website results</h2>
      <label for="date">Start date</label><input id="date" type="date">
      <label>Owner <select><option>Alice</option></select></label>
      <label>Brief <textarea></textarea></label>
      <article class="c-metric"><span>Organic clicks</span><strong>123</strong></article>
      <figure><figcaption>Search traffic</figcaption><svg aria-hidden="true"></svg></figure>
      <table><thead><tr><th>Impressions</th></tr></thead><tbody><tr><td>1200</td></tr></tbody></table>
      <button id="save">Save campaign</button>
      <nav class="app-nav"><a href="#diagnose">Diagnose</a></nav>
    `);
    const kinds = [...root.querySelectorAll('[data-coach-help]')].map(node => node.getAttribute('data-coach-help'));
    expect(kinds.filter(kind => kind === 'field')).toHaveLength(3);
    for (const kind of ['card', 'chart', 'action', 'column', 'navigation', 'section']) expect(kinds).toContain(kind);
    expect(root.querySelectorAll('[data-coach-help]')).toHaveLength(9);
    for (const help of root.querySelectorAll<HTMLButtonElement>('[data-coach-help]')) {
      expect(help.tagName).toBe('BUTTON');
      expect(help.type).toBe('button');
      expect(help.getAttribute('aria-label')).toMatch(/^Understand: .+/);
      expect(help.getAttribute('title')).toBe('Origin, connections and consequences');
      expect(help.hasAttribute('tabindex')).toBe(false); // Native buttons remain in the normal keyboard order.
      expect(help.closest('a,label,summary')).toBeNull();
    }
  });

  it('does not invoke or replace the original action, input or parent handlers when help is activated', () => {
    const { root, window, helper, explain } = fixture('<form><label><span>Budget</span><input id="budget"></label><button id="publish">Publish campaign</button></form>');
    const publish = root.querySelector<HTMLButtonElement>('#publish')!;
    const input = root.querySelector<HTMLInputElement>('#budget')!;
    const form = root.querySelector('form')!;
    const publishHandler = vi.fn(), inputHandler = vi.fn(), bubbleHandler = vi.fn(), submitHandler = vi.fn();
    publish.onclick = publishHandler; input.oninput = inputHandler;
    form.addEventListener('click', bubbleHandler); form.addEventListener('submit', submitHandler);
    const originalPublish = publish, originalInput = input;
    helper.refresh();
    const help = publish.parentElement!.querySelector<HTMLButtonElement>('[data-coach-help]')!;
    const event = new window.Event('click', { bubbles: true, cancelable: true });
    help.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(explain).toHaveBeenCalledTimes(1);
    expect(publishHandler).not.toHaveBeenCalled(); expect(inputHandler).not.toHaveBeenCalled();
    expect(bubbleHandler).not.toHaveBeenCalled(); expect(submitHandler).not.toHaveBeenCalled();
    expect(root.querySelector('#publish')).toBe(originalPublish); expect(root.querySelector('#budget')).toBe(originalInput);
    expect(publish.onclick).toBe(publishHandler); expect(input.oninput).toBe(inputHandler);
    publish.click(); input.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(publishHandler).toHaveBeenCalledTimes(1); expect(inputHandler).toHaveBeenCalledTimes(1);
  });

  it('uses labels only and never reads or exposes input, textarea or selected option values', () => {
    const { document, window } = parseHTML('<html><body><main><label for="key:secret[0]">API key</label><input id="key:secret[0]" type="password" value="input-secret"><label>Private brief <textarea>textarea-secret</textarea></label><label>Connection <select><option value="option-secret">private-option-content</option></select></label></main></body></html>');
    const root = document.querySelector('main')!;
    for (const control of root.querySelectorAll('input,textarea,select')) Object.defineProperty(control, 'value', { get() { throw new Error('Context help must not read control values'); } });
    vi.stubGlobal('MutationObserver', window.MutationObserver);
    const explain = vi.fn();
    const helper = attachContextualHelp(root, { getContext: () => ({ section: 'tracking', tab: 'settings' }), onExplain: explain }); disposers.push(helper.dispose);
    for (const help of root.querySelectorAll<HTMLButtonElement>('[data-coach-help=field]')) help.click();
    const payloads = explain.mock.calls.map(([payload]) => ({ label: payload.label, section: payload.section, tab: payload.tab, kind: payload.kind }));
    expect(payloads.map(payload => payload.label)).toEqual(['API key', 'Private brief', 'Connection']);
    const delivered = JSON.stringify(payloads) + [...root.querySelectorAll('[data-coach-help]')].map(node => node.getAttribute('aria-label')).join(' ');
    for (const secret of ['input-secret', 'textarea-secret', 'option-secret', 'private-option-content']) expect(delivered).not.toContain(secret);
  });

  it('keeps link cards and wrapping labels intact without nesting help inside a clickable target', () => {
    const { root, explain } = fixture('<a id="card" class="decision-card" href="#gsc"><h3>Read search evidence</h3><p>Explore clicks.</p></a><label id="field-label"><span>Domain</span><input id="domain"></label>');
    const card = root.querySelector<HTMLAnchorElement>('#card')!;
    const label = root.querySelector('#field-label')!;
    expect(card.parentElement?.className).toBe('context-card-wrap');
    expect(card.querySelector('[data-coach-help]')).toBeNull();
    expect(card.getAttribute('href')).toBe('#gsc');
    expect(label.parentElement?.className).toBe('context-field-wrap');
    expect(label.querySelector('input')?.id).toBe('domain');
    const help = label.parentElement!.querySelector<HTMLButtonElement>('[data-coach-help]')!;
    help.click(); expect(explain.mock.calls[0][0].kind).toBe('field');
    expect(explain.mock.calls[0][0].element).toBe(help);
  });

  it('prefers real card titles and metric labels over decorative icons or priority numbers', () => {
    const { root } = fixture('<a class="decision-card" href="#gsc"><span class="decision-mark"><svg aria-hidden="true"><path/></svg></span><div><h3>Search opportunities</h3><p>Review observed queries.</p></div></a><article class="c-metric"><span class="v-metric-icon"><svg aria-hidden="true"><path/></svg></span><span>Organic clicks</span><strong>42</strong></article><article class="decision-priority"><span class="decision-number">1</span><h3>Review page titles</h3></article>');
    const labels = [...root.querySelectorAll('[data-coach-help=card]')].map(node => node.getAttribute('aria-label'));
    expect(labels).toEqual(['Understand: Search opportunities', 'Understand: Organic clicks', 'Understand: Review page titles']);
  });

  it.each([
    ['fr', 'Performance quotidienne (Google Search)', 'Comprendre : '],
    ['en', 'Daily performance (Google Search)', 'Understand: '],
  ])('uses the accessible chart title without concatenating its metric legend (%s)', (language, title, prefix) => {
    const { root, explain } = fixture(`<figure class="app-chart"><figcaption>${title}<span class="c-legend"><span class="c-legend-item">Clics</span><span class="c-legend-item">Impressions</span><span class="c-legend-item">CTR</span><span class="c-legend-item">Position</span></span></figcaption><svg role="img" aria-label="${title}"><circle><title>Position: 5</title></circle></svg></figure>`, { language, context: () => ({ section: 'gsc', tab: '' }) });
    const help = root.querySelector<HTMLButtonElement>('[data-coach-help=chart]')!;
    expect(help.getAttribute('aria-label')).toBe(`${prefix}${title}`);
    help.click();
    const context = explain.mock.calls[0][0];
    expect(context).toMatchObject({ section: 'gsc', label: title, kind: 'chart' });
    expect(getElementGuide(context, language).elementId).not.toBe('position');
    expect(root.querySelector('.c-legend')?.textContent).toBe('ClicsImpressionsCTRPosition');
  });

  it('prefers a chart aria-label, then a heading, and cleans the caption of an empty chart without changing its content', () => {
    const { root, explain } = fixture('<figure id="labelled" aria-label="Figure title"><figcaption>Caption<span class="c-legend">Position</span></figcaption><h2>Heading title</h2><svg role="img" aria-label="SVG title"></svg></figure><figure id="headed"><figcaption>Caption<span class="c-legend">Position</span></figcaption><h3>Heading title</h3></figure><figure id="empty"><figcaption>Daily performance (Google Search)<span class="c-legend"><span class="c-legend-item">Clicks</span><span class="c-legend-item">Position</span></span><button id="chart-refresh">Refresh</button><input value="private-value"></figcaption><p>No data for this period.</p></figure>');
    const labels = [...root.querySelectorAll('[data-coach-help=chart]')].map(help => help.getAttribute('aria-label'));
    expect(labels).toEqual(['Understand: Figure title', 'Understand: Heading title', 'Understand: Daily performance (Google Search)']);
    root.querySelector<HTMLButtonElement>('#empty > [data-coach-help=chart]')!.click();
    expect(explain.mock.calls[0][0].label).toBe('Daily performance (Google Search)');
    expect(root.querySelector('#empty .c-legend')?.textContent).toBe('ClicksPosition');
    const action = root.querySelector<HTMLButtonElement>('#chart-refresh')!, handler = vi.fn(); action.onclick = handler;
    action.click(); expect(handler).toHaveBeenCalledTimes(1);
    expect(action.parentElement?.querySelector('[data-coach-help=action]')).not.toBeNull();
    expect(root.querySelector('#empty input')?.getAttribute('value')).toBe('private-value');
  });

  it('keeps one journey card explanation for its heading link while preserving other actions and the exact destination', () => {
    const { root, helper, explain } = fixture('<ol><li class="journey-board-step" data-coach-section="studio" data-coach-tab="campaigns"><h3><a id="journey-heading" href="#studio/campaigns">Build the plan</a></h3><button id="journey-action">Generate a draft</button><a id="journey-detail" href="#studio">Review details</a></li></ol><h3><a id="other-heading" href="#impact/visibility">Measure results</a></h3>');
    helper.refresh();
    const step = root.querySelector('.journey-board-step')!, link = root.querySelector<HTMLAnchorElement>('#journey-heading')!, handler = vi.fn(); link.onclick = handler;
    expect(step.querySelectorAll('[data-coach-help=card]')).toHaveLength(1);
    expect(link.parentElement?.tagName).toBe('H3');
    expect(link.parentElement?.querySelector('[data-coach-help]')).toBeNull();
    const cardHelp = step.querySelector<HTMLButtonElement>('[data-coach-help=card]')!;
    cardHelp.click();
    expect(explain.mock.calls[0][0]).toMatchObject({ label: 'Build the plan', section: 'studio', tab: 'campaigns', kind: 'card' });
    expect(handler).not.toHaveBeenCalled();
    link.click(); expect(handler).toHaveBeenCalledTimes(1);
    expect(link.getAttribute('href')).toBe('#studio/campaigns');
    for (const id of ['journey-action', 'journey-detail', 'other-heading']) {
      expect(root.querySelector(`#${id}`)?.parentElement?.querySelector('[data-coach-help=action]')).not.toBeNull();
    }
  });

  it('explains navigation and link card destinations while explicit source context wins and page anchors stay local', () => {
    const { root, explain } = fixture('<nav class="app-nav"><a href="#settings/sources">Sources</a></nav><a class="decision-card" href="#studio/campaigns"><h3>Visual plan</h3></a><a href="#ga4/realtime" data-coach-section="geo" data-coach-tab="schema">Linked finding</a><a href="#c-login-form">Continue below</a>');
    const activate = (label: string) => { root.querySelector<HTMLButtonElement>(`[aria-label="Understand: ${label}"]`)!.click(); return explain.mock.calls.at(-1)![0]; };
    expect(activate('Sources')).toMatchObject({ section: 'settings', tab: 'sources', kind: 'navigation' });
    expect(activate('Visual plan')).toMatchObject({ section: 'studio', tab: 'campaigns', kind: 'card' });
    expect(activate('Linked finding')).toMatchObject({ section: 'geo', tab: 'schema' });
    expect(activate('Continue below')).toMatchObject({ section: 'overview', tab: 'board' });
  });

  it('uses the current route at activation and respects per-element source overrides', () => {
    let context = { section: 'overview', tab: 'board' };
    const { root, explain } = fixture('<button id="generic">Refresh</button><article class="c-metric" data-coach-section="ga4" data-coach-tab="realtime"><span>Active users</span></article><article class="c-metric" data-coach-section="gsc"><span>Clicks</span></article>', { context: () => context });
    context = { section: 'impact', tab: 'analytics' };
    root.querySelector<HTMLButtonElement>('#generic + [data-coach-help]')!.click();
    expect(explain.mock.calls[0][0]).toMatchObject({ section: 'impact', tab: 'analytics', label: 'Refresh', kind: 'action' });
    root.querySelector<HTMLButtonElement>('[data-coach-section=ga4] [data-coach-help]')!.click();
    expect(explain.mock.calls[1][0]).toMatchObject({ section: 'ga4', tab: 'realtime', label: 'Active users', kind: 'card' });
    root.querySelector<HTMLButtonElement>('[data-coach-section=gsc] [data-coach-help]')!.click();
    expect(explain.mock.calls[2][0]).toMatchObject({ section: 'gsc', tab: '', label: 'Clicks' });
  });

  it('is idempotent and observes late source results without recursively decorating its own controls', async () => {
    const { root, document, helper, callbacks } = fixture('<button>Inspect evidence</button>');
    for (let i = 0; i < 10; i++) helper.refresh();
    await tick(); await tick();
    expect(root.querySelectorAll('[data-coach-help]')).toHaveLength(1);
    const before = callbacks(); await tick(); await tick();
    expect(callbacks()).toBe(before);
    const late = document.createElement('article'); late.className = 'c-metric'; late.innerHTML = '<span>Recorded sessions</span><strong>25</strong>'; root.append(late);
    await tick(); await tick();
    expect(root.querySelectorAll('[data-coach-help]')).toHaveLength(2);
    expect(late.querySelector('[data-coach-help]')?.getAttribute('aria-label')).toBe('Understand: Recorded sessions');
    const settled = callbacks(); await tick(); await tick();
    expect(callbacks()).toBe(settled);
    expect(root.querySelectorAll('[data-coach-help] [data-coach-help]')).toHaveLength(0);
  });

  it('excludes coach internals, hidden fields, source code and explicitly ignored controls', () => {
    const { root } = fixture('<section data-coach="root"><h2>Coach</h2><button>Save goal</button></section><dialog data-coach="inspector"><h2>Source</h2><button>Close help</button></dialog><section class="joint-paper"><button>Graph control</button></section><div class="c-code"><button>Copy code</button></div><pre><button>Code text</button></pre><div aria-hidden="true"><button>Hidden control</button></div><input type="hidden" name="token" value="secret"><button data-coach-ignore>Internal control</button><button>Explainable action</button>');
    expect(root.querySelectorAll('[data-coach-help]')).toHaveLength(1);
    expect(root.querySelector('[data-coach-help]')?.getAttribute('aria-label')).toBe('Understand: Explainable action');
  });

  it('disconnects and removes help on disposal without disabling original controls', async () => {
    const { root, document, helper } = fixture('<button id="action">Review</button>');
    const action = root.querySelector<HTMLButtonElement>('#action')!, handler = vi.fn(); action.onclick = handler;
    helper.dispose(); helper.dispose();
    const late = document.createElement('button'); late.textContent = 'New action'; root.append(late);
    await tick(); helper.refresh();
    expect(root.querySelectorAll('[data-coach-help]')).toHaveLength(0);
    action.click(); expect(handler).toHaveBeenCalledTimes(1);
  });

  it('reuses action and card wrappers after disposal and a new attachment without replacing the original controls', () => {
    const { root, helper } = fixture('<button id="workspace">Choose workspace</button><a id="logout" href="#login">Sign out</a><a id="persistent-card" class="decision-card" href="#settings/sources"><h3>Connect sources</h3></a>');
    const controls = ['workspace', 'logout', 'persistent-card'].map(id => {
      const node = root.querySelector<HTMLButtonElement>(`#${id}`)!, handler = vi.fn(); node.onclick = handler;
      return { node, wrapper: node.parentElement, handler };
    });
    helper.dispose();
    expect(root.querySelectorAll('[data-coach-help]')).toHaveLength(0);
    const explain = vi.fn();
    const remounted = attachContextualHelp(root, { getContext: () => ({ section: 'overview', tab: 'board' }), onExplain: explain });
    disposers.push(remounted.dispose); remounted.refresh();
    expect(root.querySelectorAll('.context-control-wrap')).toHaveLength(2);
    expect(root.querySelectorAll('.context-card-wrap')).toHaveLength(1);
    expect(root.querySelectorAll('.context-control-wrap .context-control-wrap,.context-card-wrap .context-card-wrap')).toHaveLength(0);
    expect(root.querySelectorAll('[data-coach-help]')).toHaveLength(3);
    for (const { node, wrapper, handler } of controls) {
      expect(root.querySelector(`#${node.id}`)).toBe(node);
      expect(node.parentElement).toBe(wrapper);
      expect(wrapper?.querySelectorAll('[data-coach-help]')).toHaveLength(1);
      wrapper!.querySelector<HTMLButtonElement>('[data-coach-help]')!.click();
      expect(handler).not.toHaveBeenCalled();
      node.click(); expect(handler).toHaveBeenCalledTimes(1);
    }
    expect(explain).toHaveBeenCalledTimes(3);
  });

  it('provides French button names and bounds explicit labels without injecting markup', () => {
    const label = `<img src=x onerror=alert(1)> ${'x'.repeat(180)}`;
    const { root, document, helper, explain } = fixture('', { language: 'fr' });
    const action = document.createElement('button'); action.textContent = 'Action'; action.dataset.coachLabel = label; root.append(action); helper.refresh();
    const help = root.querySelector<HTMLButtonElement>('[data-coach-help]')!;
    expect(help.getAttribute('aria-label')).toBe(`Comprendre : ${label.slice(0, 150)}`);
    expect(help.querySelector('img')).toBeNull(); help.click();
    expect(explain.mock.calls[0][0].label).toHaveLength(150);
  });
});
