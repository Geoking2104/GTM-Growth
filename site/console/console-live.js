import { el } from './render.js';

/** A bounded read loop. Hidden/offline pages and obsolete workspace scopes stop it. */
export function createReadRefresh({ read, onChange, getScope = () => '', interval = 30000, doc = document, win = window, online = () => globalThis.navigator?.onLine !== false }) {
  const initialScope = getScope();
  let disposed = false, busy = false, timer = null, generation = 0, snapshot = { status: 'waiting', data: null, readAt: null, error: null };
  const valid = () => !disposed && getScope() === initialScope;
  const paused = () => doc.hidden || !online();
  function notify() { if (valid()) onChange({ ...snapshot }); }
  function schedule() {
    clearTimeout(timer); timer = null;
    if (valid() && !paused()) timer = setTimeout(() => { void refresh(); }, Math.max(15000, interval));
  }
  async function refresh() {
    if (!valid() || busy) return;
    if (paused()) { snapshot.status = 'paused'; notify(); return; }
    clearTimeout(timer); timer = null; busy = true;
    const own = ++generation; snapshot.status = 'loading'; snapshot.error = null; notify();
    try {
      const data = await read();
      if (!valid() || own !== generation) return;
      if (data?.problem || ['unavailable', 'not-configured', 'choose-source'].includes(data?.state)) throw new Error(data.summary || 'Unavailable');
      snapshot = { status: paused() ? 'paused' : 'ready', data, readAt: new Date().toISOString(), error: null }; notify();
    } catch (error) {
      if (valid() && own === generation) { snapshot.status = paused() ? 'paused' : 'error'; snapshot.error = error?.message || 'Unavailable'; notify(); }
    } finally { busy = false; schedule(); }
  }
  function visibility() {
    clearTimeout(timer); timer = null;
    if (!valid()) return;
    if (paused()) { snapshot.status = 'paused'; notify(); }
    else void refresh();
  }
  doc.addEventListener('visibilitychange', visibility);
  win.addEventListener('online', visibility); win.addEventListener('offline', visibility);
  queueMicrotask(() => { if (valid()) void refresh(); });
  return {
    refresh,
    snapshot: () => ({ ...snapshot }),
    dispose() { disposed = true; generation++; clearTimeout(timer); doc.removeEventListener('visibilitychange', visibility); win.removeEventListener('online', visibility); win.removeEventListener('offline', visibility); },
  };
}

export function createOperationsFeed({ api, language = 'en', getScope }) {
  const L = (fr, en) => language === 'fr' ? fr : en;
  const root = el('section', 'console-live-feed'); root.dataset.liveFeed = 'operations'; root.dataset.coachSection = 'ops';
  const header = el('div', 'console-live-head'), heading = el('div');
  heading.append(el('p', 'journey-board-eyebrow', L('VOTRE ESPACE EN MOUVEMENT', 'WORKSPACE ACTIVITY')), el('h2', '', L('Suivre ce qui se passe', 'See what is happening')));
  const refresh = el('button', 'c-btn', L('Actualiser l’état', 'Refresh status')); refresh.type = 'button'; refresh.dataset.liveRefresh = '';
  header.append(heading, refresh);
  const state = el('p', 'console-live-status'); state.dataset.liveStatus = 'waiting'; state.setAttribute('role', 'status'); state.setAttribute('aria-live', 'polite');
  const time = el('p', 'console-live-time'); time.dataset.liveReadAt = '';
  const metrics = el('div', 'console-live-metrics'), observed = el('p', 'c-note'), explanation = el('p', 'c-note', L('État des opérations enregistrées, relu toutes les 30 secondes quand cet écran est visible. Les graphiques d’audience conservent la période et le délai propres à leur source.', 'Saved operations status, read every 30 seconds while this screen is visible. Audience charts retain each source’s reporting period and delay.'));
  const actions = el('div', 'console-live-links');
  for (const [label, href] of [[L('Examiner les alertes', 'Review alerts'), '#ops/alerts'], [L('Voir les collectes', 'View collections'), '#ops/prompts'], [L('Audience GA4 en temps réel', 'GA4 realtime audience'), '#ga4/realtime']]) { const a = el('a', '', label); a.href = href; actions.append(a); }
  root.append(header, state, time, metrics, observed, explanation, actions);
  let previousData = null;
  const loop = createReadRefresh({ getScope, read: () => api('/data-agent/query', { model: 'operations', locale: language, days: 28 }), onChange(value) {
    const labels = {
      waiting: L('En attente de lecture', 'Waiting for a read'), loading: L('Synchronisation de l’état…', 'Syncing status…'),
      ready: L('État synchronisé · lecture seule', 'Status synced · read only'), paused: L('Actualisation en pause', 'Refresh paused'),
      error: L('État indisponible · réessayer', 'Status unavailable · retry'),
    };
    state.dataset.liveStatus = value.status; state.textContent = labels[value.status]; refresh.disabled = value.status === 'loading';
    time.textContent = value.readAt ? `${L('Dernière lecture réussie', 'Last successful read')} : ${new Date(value.readAt).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}${value.status === 'error' ? L(' · données précédentes', ' · previous data') : ''}` : L('Aucun état reçu pour le moment.', 'No status received yet.');
    time.dataset.liveReadAt = value.readAt || '';
    if (value.data === previousData) return;
    previousData = value.data; metrics.replaceChildren();
    const ids = ['prompts', 'pendingAlertsSample', 'latestRunSucceeded', 'latestRunFailed'];
    for (const id of ids) {
      const m = value.data?.metrics?.find(m => m.id === id);
      const labels = {
        prompts: L('Questions enregistrées', 'Saved questions'), pendingAlertsSample: L('Alertes à examiner', 'Alerts to review'),
        latestRunSucceeded: L('Dernière collecte · réussites', 'Last collection · successes'), latestRunFailed: L('Dernière collecte · échecs', 'Last collection · failures'),
      };
      const cell = el('article', 'live-metric'); cell.dataset.coachLabel = labels[id]; cell.dataset.coachSection = 'ops';
      cell.append(el('span', 'live-metric-label', labels[id]), el('strong', '', typeof m?.value === 'number' && Number.isFinite(m.value) ? m.value.toLocaleString(language) : '—'));
      if (id === 'pendingAlertsSample') cell.append(el('small', '', L('Échantillon limité à 200', 'Sample limited to 200')));
      metrics.append(cell);
    }
    observed.textContent = value.data?.period?.end ? `${L('Collecte observée le', 'Collection observed on')} ${new Date(value.data.period.end).toLocaleString(language)}` : L('Aucune collecte datée disponible. Rafraîchir cet état ne lance pas de collecte.', 'No dated collection available. Refreshing this status does not start a collection.');
  } });
  refresh.onclick = () => { void loop.refresh(); };
  root.dispose = () => loop.dispose();
  return root;
}

/** Re-read GA4's actual realtime endpoint only while its dedicated view is open. */
export function createRealtimeView({ api, scope, render, language = 'en', getScope }) {
  const L = (fr, en) => language === 'fr' ? fr : en;
  const root = el('section', 'console-realtime');
  const controls = el('div', 'console-live-head');
  const status = el('p', 'console-live-status'); status.dataset.liveStatus = 'waiting'; status.setAttribute('role', 'status');
  const refresh = el('button', 'c-btn', L('Actualiser', 'Refresh')); refresh.type = 'button'; refresh.dataset.liveRefresh = '';
  controls.append(status, refresh); const time = el('p', 'c-note'); time.dataset.liveReadAt = '';
  const content = el('div'); root.append(controls, time, content);
  let previousData = null;
  const loop = createReadRefresh({ getScope, read: () => api('/ga4/realtime', scope()), onChange(value) {
    status.dataset.liveStatus = value.status;
    status.textContent = value.status === 'error' ? L('GA4 indisponible · vérifiez les accès', 'GA4 unavailable · check access') : value.status === 'paused' ? L('Actualisation en pause', 'Refresh paused') : value.status === 'ready' ? L('GA4 · fenêtre des 30 dernières minutes', 'GA4 · last 30 minutes') : L('Lecture de GA4…', 'Reading GA4…');
    refresh.disabled = value.status === 'loading';
    time.textContent = value.readAt ? `${L('Lu à', 'Read at')} ${new Date(value.readAt).toLocaleTimeString(language)} · ${L('actualisation toutes les 30 s', 'refresh every 30 s')}${value.status === 'error' ? L(' · données précédentes', ' · previous data') : ''}` : L('Aucune mesure reçue. Une source absente ne vaut pas zéro.', 'No measurement received. A missing source is not zero.');
    time.dataset.liveReadAt = value.readAt || '';
    if (value.data && value.data !== previousData) { previousData = value.data; content.replaceChildren(...[render(value.data)].flat()); }
    if (!value.data && value.status === 'error') { const link = el('a', '', L('Configurer ou vérifier GA4', 'Configure or verify GA4')); link.href = '#tracking/settings'; content.replaceChildren(link); }
  } });
  refresh.onclick = () => { void loop.refresh(); }; root.dispose = () => loop.dispose(); return root;
}
