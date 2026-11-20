import { el } from './render.js';
import { CATEGORY } from './i18n.js';
import { providerMark } from './provider-marks.js';
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [key, value] of Object.entries(attrs)) n.setAttribute(key, String(value)); return n; };
const finite = value => typeof value === 'number' && Number.isFinite(value);

/** Visual orientation built from observed reads, never sample business performance. */
export function renderJourneyBoard({ overview, status, search, ga4, bing, language = 'en' }) {
  const L = (fr, en) => language === 'fr' ? fr : en;
  const root = el('section', 'journey-board'); root.dataset.coachSection = 'overview';
  const heading = el('div', 'journey-board-heading');
  heading.append(el('div', '', ''), el('p', 'journey-board-note', L('Chaque étape garde le lien avec ses preuves.', 'Every step stays connected to its evidence.')));
  heading.firstChild.append(el('p', 'journey-board-eyebrow', L('VOTRE FIL CONDUCTEUR', 'YOUR PATH FORWARD')), el('h2', '', L('Des données aux actions, puis aux résultats', 'From data to action, then results')));
  const available = ['gsc', 'ga4', 'bing'].filter(key => status?.[key]?.hasAccess === true).length;
  const measured = [search, ga4, bing].filter(value => value && !value.problem && Array.isArray(value.trend) && value.trend.length).length;
  const recs = overview?.geo?.recommendations?.filter(r => r.action && finite(r.points) && r.points > 0) || [];
  const steps = [
    { tone: 'settings', section: 'settings', href: '#settings/sources', title: L('Relier les sources', 'Connect sources'), detail: L('Les bonnes données, dans le bon espace.', 'The right data in the right workspace.'), state: status ? L(`${available}/3 accès de mesure confirmés`, `${available}/3 measurement sources verified`) : L('Accès à vérifier', 'Access needs checking'), image: 'settings' },
    { tone: 'diagnose', section: 'diagnose', href: '#diagnose/technical', title: L('Comprendre les priorités', 'Understand priorities'), detail: L('Voir ce qui freine votre visibilité.', 'See what is holding back visibility.'), state: overview?.geo ? L(`${recs.length} pistes issues de l’analyse`, `${recs.length} findings from the analysis`) : L('Analyse à consulter', 'Review the analysis'), image: 'diagnose' },
    { tone: 'ops', section: 'studio', href: '#studio/campaigns', title: L('Construire le plan', 'Build the plan'), detail: L('Des actions, des dates et des responsables.', 'Actions, dates and clear ownership.'), state: L('Scénario à préparer ou à reprendre', 'Create or continue a scenario'), image: 'ops' },
    { tone: 'impact', section: 'impact', href: '#impact/visibility', title: L('Mesurer les effets', 'Measure results'), detail: L('Comparer les observations après vos actions.', 'Compare observations after your actions.'), state: measured ? L(`${measured} historique(s) reçu(s)`, `${measured} history source(s) received`) : L('Historique à alimenter', 'Add observed history'), image: 'impact' },
  ];
  const list = el('ol', 'journey-board-path');
  for (const [index, item] of steps.entries()) {
    const li = el('li', 'journey-board-step'); li.dataset.tone = item.tone; li.dataset.coachSection = item.section; li.dataset.coachLabel = item.title;
    const visual = el('div', 'journey-board-visual'), img = el('img'); img.src = `/assets/coach/${item.image}.svg`; img.alt = ''; img.width = 180; img.height = 84; img.loading = 'lazy';
    visual.append(img, el('span', 'journey-board-number', String(index + 1).padStart(2, '0')));
    const a = el('a', '', item.title); a.href = item.href;
    li.append(visual, el('h3'), el('p', '', item.detail), el('span', 'journey-board-state', item.state)); li.querySelector('h3').append(a); list.append(li);
  }
  root.append(heading, list);
  const evidence = el('div', 'journey-board-evidence'); evidence.append(renderSourceMap(status, L), renderAuditChart(overview, language)); root.append(evidence);
  return root;
}

function renderSourceMap(status, L) {
  const root = el('section', 'journey-board-sources'); root.dataset.coachSection = 'tracking';
  root.append(el('h3', '', L('D’où viennent vos chiffres ?', 'Where do your numbers come from?')), el('p', 'c-note', L('Un accès confirmé permet la lecture. La présence de résultats dépend ensuite de la période et des données collectées.', 'Verified access enables reading. Results also depend on the period and collected data.')));
  const list = el('ul');
  for (const [key, label, purpose] of [['gsc', 'Search Console', L('Recherches → clics vers vos pages', 'Searches → clicks to your pages')], ['ga4', 'Google Analytics 4', L('Visites → événements clés', 'Visits → key events')], ['bing', 'Bing Webmaster', L('Recherches Bing → vos pages', 'Bing searches → your pages')]]) {
    const value = status?.[key], state = value?.hasAccess === true ? 'connected' : value?.hasAccess === false ? 'restricted' : 'unknown';
    const row = el('li', 'journey-board-source'); row.dataset.state = state; row.dataset.coachSection = key;
    row.append(providerMark(label), el('span', 'journey-board-source-purpose', purpose), el('strong', '', state === 'connected' ? L('Accès confirmé', 'Access verified') : state === 'restricted' ? L('Accès refusé ou incomplet', 'Denied or incomplete access') : L('À vérifier', 'Needs checking'))); list.append(row);
  }
  const link = el('a', 'journey-board-link', L('Vérifier mes connexions →', 'Check my connections →')); link.href = '#tracking/status'; root.append(list, link); return root;
}

/** Bars use the actual numerator and denominator returned by this page audit. */
export function renderAuditChart(overview, language = 'en') {
  const L = (fr, en) => language === 'fr' ? fr : en;
  const figure = el('figure', 'journey-audit-chart'); figure.dataset.coachChart = 'audit'; figure.dataset.coachSection = 'geo'; figure.dataset.coachLabel = L('Préparation technique de la page', 'Page technical readiness');
  figure.append(el('figcaption', '', L('Ce que l’analyse a observé', 'What the analysis observed')), el('p', 'c-note', L('Préparation technique de cette page. Ce graphique ne mesure pas vos mentions réelles dans les réponses IA.', 'Technical readiness of this page. This chart does not measure actual mentions in AI answers.')));
  const rows = Object.entries(overview?.geo?.max || {}).filter(([, max]) => finite(max) && max > 0).map(([id, max]) => ({ id, max, value: overview.geo.breakdown?.[id], label: CATEGORY[id] || id }));
  if (!rows.length) {
    const img = el('img', 'journey-audit-empty-image'); img.src = '/assets/coach/diagnose.svg'; img.alt = ''; img.width = 180; img.height = 100;
    figure.append(img, el('p', '', L('Le graphique apparaîtra dès qu’une analyse exploitable sera disponible.', 'This chart appears when a usable analysis is available.')));
  } else {
    const plot = svg('svg', { viewBox: `0 0 460 ${rows.length * 39 + 10}`, role: 'img', 'aria-label': L('Points observés par catégorie ; détail chiffré disponible ci-dessous', 'Observed points by category; exact values available below') });
    for (const [index, row] of rows.entries()) {
      const y = index * 39 + 6;
      const label = svg('text', { x: 0, y: y + 12, class: 'journey-chart-label' }); label.textContent = row.label.length > 25 ? row.label.slice(0, 24) + '…' : row.label;
      const base = svg('rect', { x: 202, y, width: 180, height: 16, rx: 6, class: 'journey-chart-track' });
      plot.append(label, base);
      if (finite(row.value)) plot.append(svg('rect', { x: 202, y, width: Math.max(0, Math.min(1, row.value / row.max)) * 180, height: 16, rx: 6, class: `journey-chart-bar journey-chart-tone-${index % 4}` }));
      const value = svg('text', { x: 395, y: y + 12, class: 'journey-chart-value' }); value.textContent = finite(row.value) ? `${row.value}/${row.max}` : '—'; plot.append(value);
    }
    figure.append(plot);
    const detail = el('details', 'journey-chart-data'); detail.append(el('summary', '', L('Voir les valeurs et la méthode', 'View values and method')));
    const table = el('table', 'app-table'); const caption = el('caption', '', L('Points de préparation de la page analysée', 'Readiness points for the analysed page')); table.append(caption);
    const thead = el('thead'), head = el('tr'); for (const label of [L('Catégorie', 'Category'), L('Points observés', 'Observed points'), L('Maximum', 'Maximum')]) { const th = el('th', '', label); th.scope = 'col'; head.append(th); } thead.append(head); table.append(thead);
    const body = el('tbody'); for (const row of rows) { const tr = el('tr'); const th = el('th', '', row.label); th.scope = 'row'; tr.append(th, el('td', '', finite(row.value) ? String(row.value) : '—'), el('td', '', String(row.max))); body.append(tr); } table.append(body);
    detail.append(table, el('p', 'c-note', L('Valeurs renvoyées par l’audit de la page sélectionnée. Une correction doit être suivie d’une nouvelle analyse ; aucun gain de trafic n’est déduit de ces points.', 'Values returned by the selected page audit. Run a new analysis after a correction; these points do not predict traffic gains.'))); figure.append(detail);
  }
  const a = el('a', 'journey-board-link', L('Comprendre les constats →', 'Understand the findings →')); a.href = '#diagnose/technical'; figure.append(a); return figure;
}
