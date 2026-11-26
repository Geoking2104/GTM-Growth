import { renderInbox, renderIntent, renderMeasurement, renderMeasurementBanner } from './decision-flows.js';
import { el } from './render.js';
import { LANG } from './i18n.js';
import { icon } from './icons.js';
import { providerAsset, providerMark } from './provider-marks.js';
import { journeyContent } from '../journey-content.js';
import { DECISION_VIEWS } from './decision-navigation.js';
const L = (fr, en) => LANG === 'fr' ? fr : en;

const artByRoute = new Map(journeyContent(LANG).features.map(feature => [feature.route, feature.id]));

export function sourceAvailability(source, value) {
  if (!value || value.error || value.problem) return 'unavailable';
  if (['gsc', 'ga4', 'bing'].includes(source)) {
    const entry = value[source];
    if (entry?.hasAccess === true) return 'connected';
    if (entry?.hasAccess === false) return 'restricted';
    if (entry?.error) return 'unavailable';
    return 'not-configured';
  }
  if (source === 'gtm') return value.container?.path ? 'connected' : 'not-configured';
  if (source === 'gbp') return value.capabilities?.gbp === 'configured' && value.bindings?.length ? 'connected' : 'not-configured';
  if (source === 'crm') return value.settings?.enabled === true ? 'connected' : 'not-configured';
  if (source === 'social') return value.capabilities?.postiz === true && value.capabilities.accounts?.length ? 'connected' : 'not-configured';
  if (source === 'ai') return value.datasets?.length ? 'connected' : 'not-configured';
  return 'unavailable';
}

const labels = {
  checking: ['Vérification en cours', 'Checking access'],
  'not-configured': ['À connecter', 'Connect source'],
  restricted: ['Accès à vérifier', 'Check permissions'],
  unavailable: ['Statut indisponible', 'Status unavailable'],
};
export function decisionCard(item, status) {
  const link = el('a', 'decision-card'); link.href = item.route;
  link.dataset.artScope = artByRoute.get(item.route) || item.route.slice(1).split('/')[0];
  const mark = el('span', 'decision-mark');
  if (providerAsset(item.source)) mark.append(providerMark(item.source === 'gsc' ? 'Search Console' : item.source === 'ga4' ? 'Google Analytics 4' : item.source, { symbolOnly: true }));
  else mark.innerHTML = icon(item.icon);
  const copy = el('div'); copy.append(el('h3', '', L(item.fr, item.en)), el('p', '', L(item.frBenefit, item.enBenefit)));
  if (item.badge === 'preview') copy.append(el('span', 'decision-badge', L('Aperçu · Sans écriture directe', 'Preview · No direct write')));
  if (status && status !== 'connected') copy.append(el('span', 'decision-badge', status === 'not-configured' && ['social', 'ai'].includes(item.source) ? L('Collecter ou importer des preuves', 'Collect or import evidence') : L(...(labels[status] || labels.unavailable))));
  const arrow = el('span', 'decision-arrow', '↗'); arrow.setAttribute('aria-hidden', 'true');
  link.append(mark, copy, arrow); return link;
}

/** Only connection reads are automatic. A hub never generates, approves or publishes. */
export function renderDecisionHub(area, viewId, { state, api, scope }) {
  if (area === 'ops' && viewId === 'inbox') return renderInbox({ api });
  if (area === 'diagnose' && viewId === 'tracking') return renderMeasurement({ api, state });
  if (area === 'diagnose' && viewId === 'intent') return renderIntent({ api, state });
  const view = DECISION_VIEWS[area]?.find(v => v.id === viewId);
  const root = el('section', 'decision-hub');
  if (!view) return root;
  const items = [...view.items];
  if (area === 'settings' && viewId === 'access' && state.me?.platformAdmin) items.push({ route: '#platform', icon: 'platform', fr: 'Administrer la plateforme', en: 'Administer the platform', frBenefit: 'Gérez les espaces autorisés et leur provisionnement.', enBenefit: 'Manage authorised workspaces and provisioning.' });
  if (area === 'ops' && viewId === 'inbox') root.append(el('p', 'decision-context', L('Retrouvez chaque circuit de validation ci-dessous. Les listes restent propres à chaque module ; aucune approbation ni publication n’est déclenchée par cette page.', 'Find each review workflow below. Lists remain specific to each module; this page does not approve or publish anything.')));
  if (area === 'impact' && ['analytics','crm'].includes(viewId)) root.append(renderMeasurementBanner({ api, state }));
  const grid = el('div', 'decision-grid'); root.append(grid);
  const empty = el('p', 'c-note', L('Aucune source de cette vue n’est actuellement confirmée accessible. Ajoutez des preuves ci-dessous ou commencez par le diagnostic de votre site.', 'No source in this view is currently confirmed accessible. Add evidence below or start with your website diagnosis.'));
  const diagnose = el('a', '', L('Ouvrir le diagnostic du site →', 'Open website diagnosis →')); diagnose.href = '#diagnose'; empty.append(' ', diagnose); root.append(empty);
  const drawer = el('details', 'decision-enrich');
  drawer.append(el('summary', '', L('+ Enrichir mes preuves', '+ Enrich my evidence')));
  const sources = el('div', 'decision-grid'); drawer.append(el('p', 'c-note', L('Chaque source précise ce qu’elle apporte. Une connexion n’est jamais assimilée à un résultat mesuré.', 'Each source explains its benefit. A connection is never treated as a measured result.')), sources); root.append(drawer);
  const status = Object.fromEntries(items.filter(i => i.source).map(i => [i.source, 'checking']));
  function draw() {
    grid.replaceChildren(); sources.replaceChildren();
    for (const item of items) (item.source && status[item.source] !== 'connected' ? sources : grid).append(decisionCard(item, status[item.source]));
    empty.hidden = grid.children.length > 0; drawer.hidden = sources.children.length === 0;
  }
  draw();
  const requests = new Map();
  const request = (route, body) => { if (!requests.has(route)) requests.set(route, api(route, body).catch(() => null)); return requests.get(route); };
  for (const source of Object.keys(status)) {
    const [route, body] = ['gsc','ga4','bing'].includes(source) ? ['/tracking/status', scope()] : source === 'gtm' ? ['/gtm/inventory', scope({ container: state.gtmContainer || undefined })] : source === 'gbp' ? ['/local-seo/state', {}] : source === 'social' ? ['/social/state', {}] : source === 'ai' ? ['/ai-visibility/datasets', {}] : ['/crm/overview', {}];
    // A cached response can resolve before the caller mounts this root. Drawing
    // remains local to this node, so late results cannot replace another view.
    void request(route, body).then(value => { status[source] = sourceAvailability(source, value); draw(); });
  }
  return root;
}

/** Existing audit recommendations, not invented revenue or a new score model. */
export function renderDecisionPriorities(overview) {
  const box = el('section', 'decision-priorities');
  box.append(el('p', 'decision-eyebrow', L('REPÉRER → COMPRENDRE → PRÉPARER → MESURER → COORDONNER', 'FIND → UNDERSTAND → PREPARE → MEASURE → COORDINATE')), el('h2', '', L('Vos trois prochaines priorités', 'Your next three priorities')));
  const recommendations = [...(overview?.geo?.recommendations || [])].filter(r => typeof r.action === 'string' && Number.isFinite(r.points) && r.points > 0).sort((a, b) => b.points - a.points).slice(0, 3);
  if (!recommendations.length) {
    box.append(el('p', 'c-note', L('Aucune priorité chiffrée disponible dans cet audit. Consultez les preuves avant de choisir une action.', 'No scored priority is available in this audit. Review evidence before choosing an action.')));
    const a = el('a', 'c-btn', L('Examiner mon site →', 'Inspect my site →')); a.href = '#diagnose'; box.append(a); return box;
  }
  const cards = el('div', 'decision-priority-grid');
  for (const [i, r] of recommendations.entries()) {
    const card = el('article', 'decision-priority'); card.append(el('span', 'decision-number', String(i + 1)), el('h3', '', r.action), el('p', 'c-note', L(`Potentiel de préparation : +${r.points} points, à vérifier après correction.`, `Readiness potential: +${r.points} points, to verify after correction.`)));
    const a = el('a', '', L('Examiner les preuves →', 'Inspect evidence →')); a.href = '#diagnose/technical'; card.append(a); cards.append(card);
  }
  const scenario = el('a', 'btn btn-small', L('Créer un scénario à partir de ces analyses', 'Create a scenario from these findings'));
  scenario.href = '#studio/campaigns';
  box.append(cards, el('p', 'c-note', L('Priorisation issue de l’audit. Ce potentiel n’est ni une prévision de trafic ni un revenu garanti.', 'Prioritisation comes from the audit. This potential is neither a traffic forecast nor guaranteed revenue.')), scenario); return box;
}
