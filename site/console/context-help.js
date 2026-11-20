/** Progressive, keyboard-accessible explanations. Never reads field values. */
const blocked = '[data-coach="root"],[data-coach="inspector"],[data-coach-root],.console-coach,.coach-root,[data-coach-dialog],[data-coach-help],.joint-paper,.c-code,pre,[aria-hidden="true"]';
const cardSelector = '.decision-card,.decision-priority,.decision-metric,.c-metric,.kpi-cell,.v-gauge,.audience-card,.audience-metrics > div,.journey-stage,.scenario-node-inspector,.c-data-guide,.journey-board-step,.journey-board-source,.live-metric';
const chartSelector = 'figure,.app-chart,.v-chart,.v-visibility-chart,[data-coach-chart]';
const clean = text => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 150);
function labelText(label) {
  if (!label) return '';
  // A textarea's initial value is a text node; select options are also text.
  // Neither belongs in contextual help, even when nested in a label.
  const copy = label.cloneNode(true);
  for (const field of copy.querySelectorAll('input,textarea,select,[data-coach-help]')) field.remove();
  return clean(copy.textContent);
}
function cardLabel(node) {
  // A selector list follows DOM order, not selector order. Inspect headings
  // before generic spans so a decorative icon or a rank number cannot win.
  for (const selector of ['h2,h3,h4', '.kpi-label,.v-gauge-label,.live-metric-label', 'span:not(.v-metric-icon):not(.decision-mark):not([aria-hidden="true"]),strong']) {
    for (const candidate of node.querySelectorAll(selector)) {
      if (candidate.closest('[aria-hidden="true"],[data-coach-help],.v-metric-icon,.decision-mark')) continue;
      const label = labelText(candidate); if (label) return label;
    }
  }
  return '';
}
function labelFor(node, kind) {
  if (node.dataset.coachLabel) return clean(node.dataset.coachLabel);
  if (kind === 'field') {
    const label = node.id ? [...node.ownerDocument.querySelectorAll('label[for]')].find(label => label.getAttribute('for') === node.id) : null;
    return clean(node.getAttribute('aria-label') || labelText(label) || labelText(node.closest('label')) || node.getAttribute('placeholder') || node.name);
  }
  if (kind === 'chart') return clean(node.getAttribute('aria-label') || node.querySelector('figcaption,h2,h3,h4,title')?.textContent);
  if (kind === 'card') return cardLabel(node);
  return clean(node.getAttribute('aria-label') || node.getAttribute('title') || node.textContent);
}

/** Observe late source results without replacing application controls or handlers. */
export function attachContextualHelp(root, { getContext, onExplain, language = 'en' }) {
  const tracked = new WeakSet(); const controls = new Set();
  let disposed = false, queued = false;
  const L = (fr, en) => language === 'fr' ? fr : en;
  function add(node, kind) {
    if (tracked.has(node) || node.closest(blocked) || node.matches('[type="hidden"]') || node.dataset.coachIgnore !== undefined) return;
    const label = labelFor(node, kind); if (!label) return;
    tracked.add(node);
    const help = node.ownerDocument.createElement('button');
    help.type = 'button'; help.className = `context-help context-help-${kind}`;
    help.dataset.coachHelp = kind;
    help.setAttribute('aria-label', `${L('Comprendre : ', 'Understand: ')}${label}`);
    help.setAttribute('title', L('Origine, liens et conséquences', 'Origin, connections and consequences'));
    help.textContent = '?';
    const context = () => {
      const source = node.closest('[data-coach-section]');
      const destination = !source && node.matches('a[href^="#"]') ? /^#([a-z][a-z0-9_]*)(?:\/([a-z0-9_-]+))?$/.exec(node.getAttribute('href') || '') : null;
      const route = source ? { section: source.dataset.coachSection, tab: source.dataset.coachTab || '' } : destination ? { section: destination[1], tab: destination[2] || '' } : {};
      return { ...getContext(), ...route, label, kind, element: help };
    };
    help.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); onExplain(context()); });
    // Avoid nested interactive elements and keep table/form semantics intact.
    if (kind === 'field') {
      const wrapper = node.closest('label');
      if (wrapper && root.contains(wrapper)) {
        let frame = wrapper.parentElement;
        if (!frame?.classList.contains('context-field-wrap')) {
          frame = node.ownerDocument.createElement('div'); frame.className = 'context-field-wrap';
          wrapper.before(frame); frame.append(wrapper);
        }
        frame.append(help);
      } else node.after(help);
    } else if (node.matches('a,button,summary')) {
      const wrapper = node.ownerDocument.createElement(kind === 'card' ? 'div' : 'span');
      wrapper.className = kind === 'card' ? 'context-card-wrap' : 'context-control-wrap';
      node.before(wrapper); wrapper.append(node, help);
    } else {
      node.classList.add('context-help-host');
      node.append(help);
    }
    controls.add(help);
  }
  function scan() {
    queued = false; if (disposed) return;
    for (const node of root.querySelectorAll(cardSelector)) add(node, 'card');
    for (const node of root.querySelectorAll(chartSelector)) add(node, 'chart');
    for (const node of root.querySelectorAll('input:not([type=hidden]),select,textarea')) add(node, 'field');
    for (const node of root.querySelectorAll('thead th,.app-table > tr:first-child th')) add(node, 'column');
    for (const node of root.querySelectorAll('button:not([data-coach-help]),a[href^="#"]')) {
      if (node.matches(cardSelector) || node.closest('label')) continue;
      add(node, node.matches('.app-tab,.app-nav a') ? 'navigation' : 'action');
    }
    for (const node of root.querySelectorAll('h1,h2,h3')) {
      if (!node.closest(`${cardSelector},${chartSelector}`)) add(node, 'section');
    }
    for (const help of controls) if (!root.contains(help)) controls.delete(help);
  }
  const observer = typeof MutationObserver === 'function' ? new MutationObserver(records => {
    // Our own help controls do not cause another pass.
    if (queued || disposed || !records.some(r => [...r.addedNodes].some(n => n.nodeType === 1 && !n.matches?.('[data-coach-help]')))) return;
    queued = true; queueMicrotask(scan);
  }) : null;
  observer?.observe(root, { childList: true, subtree: true }); scan();
  return { refresh: scan, dispose() { disposed = true; observer?.disconnect(); for (const help of controls) help.remove(); controls.clear(); } };
}
