/** Render recorded observations as text, never as executable customer HTML. */
import { normalisePublicUrl } from './public-read-model.js';

const el = (tag, cls = '', text) => { const n = document.createElement(tag); n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };

export function renderPublicEvidence(data, language = 'en') {
  const L = (fr, en) => language === 'fr' ? fr : en;
  const panel = el('section', 'public-panel public-diagnostic');
  panel.append(el('p', 'public-eyebrow', L('PREUVES', 'EVIDENCE')), el('h2', '', L('Ce que nous avons réellement observé', 'What we actually observed')));
  const evidence = data.evidence;
  if (evidence?.version !== 1) {
    panel.append(el('p', 'public-description', L('Cette lecture ne contient pas les preuves détaillées. Relancez l’analyse pour les obtenir.', 'This read has no detailed evidence. Run the analysis again to retrieve it.')));
    return panel;
  }
  const observed = new Date(evidence.observedAt);
  if (Number.isFinite(observed.getTime())) {
    const time = el('time', '', observed.toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB', { timeZoneName: 'short' })); time.dateTime = evidence.observedAt;
    const caption = el('p', 'public-micro', L('Lecture effectuée le ', 'Read on ')); caption.append(time); panel.append(caption);
  }
  panel.append(el('p', 'public-micro', L('Extraits du HTML reçu et réponses HTTP. La page peut avoir changé depuis cette lecture.', 'Excerpts from the received HTML and HTTP responses. The page may have changed since this read.')));
  const grid = el('div', 'public-signal-grid'); panel.append(grid);
  function link(url, label = url) {
    const safe = normalisePublicUrl(url);
    if (!safe) return el('span', '', label || '—');
    const a = el('a', 'public-evidence-source', label); a.href = safe; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
  }
  function card(id, title, status, summary) {
    const box = el('article', `public-signal public-status-${status}`); box.dataset.evidence = id;
    box.append(el('h3', '', title), el('strong', 'public-evidence-verdict', summary)); grid.append(box); return box;
  }
  function field(box, label, value) {
    const p = el('div', 'public-evidence-fact'); p.append(el('span', '', label), el('code', '', value)); box.append(p);
  }
  function excerpt(box, label, observation) {
    field(box, label, observation.value || L('(vide)', '(empty)'));
    if (observation.truncated) box.append(el('p', 'public-micro', L('Extrait limité à 2 048 caractères.', 'Excerpt limited to 2,048 characters.')));
  }
  function source(box, resource) {
    const p = el('p', 'public-evidence-resource');
    p.append(el('span', '', resource.status === null ? L('Réponse indisponible · ', 'Response unavailable · ') : `HTTP ${resource.status} · `), link(resource.requestedUrl || resource.url));
    if (resource.requestedUrl && resource.url !== resource.requestedUrl) p.append(document.createTextNode(' → '), link(resource.url));
    box.append(p);
  }
  const title = evidence.title;
  const titleCard = card('title', L('Titre', 'Title'), !title.characters ? 'fail' : title.characters >= 20 && title.characters <= 60 ? 'pass' : 'warn', `${title.characters} ${L('caractères', 'characters')}`);
  if (title.present) excerpt(titleCard, L('Texte extrait de <title>', 'Text extracted from <title>'), title);
  else field(titleCard, 'title', L('Aucune balise trouvée dans le HTML reçu.', 'No tag found in the received HTML.'));
  titleCard.append(el('p', 'public-micro', L('Repère du contrôle : 20 à 60 caractères.', 'Check guideline: 20 to 60 characters.'))); source(titleCard, evidence.page);

  const canonicals = evidence.canonicals;
  const canonical = canonicals[0]?.value;
  let resolved = null;
  try { resolved = canonical && normalisePublicUrl(new URL(canonical, evidence.page.url).href); } catch { /* invalid declaration */ }
  const canonicalCard = card('canonical', 'Canonical', !resolved ? 'fail' : canonicals.length !== 1 || resolved.replace(/\/$/, '') !== evidence.page.url.replace(/\/$/, '') ? 'warn' : 'pass', canonicals.length ? L('Canonical déclarée', 'Declared canonical') : L('Canonical non trouvée', 'Canonical not found'));
  if (!canonicals.length) field(canonicalCard, 'link[rel~="canonical"]', L('0 balise dans le HTML reçu.', '0 tags in the received HTML.'));
  for (const value of canonicals) excerpt(canonicalCard, 'link[rel~="canonical"] · href', value);
  if (resolved) canonicalCard.append(link(resolved, L('Ouvrir la cible déclarée ↗', 'Open the declared target ↗')));
  else if (canonicals.length) canonicalCard.append(el('p', 'public-micro', L('Cible vide, invalide ou non HTTP(S).', 'Empty, invalid or non-HTTP(S) target.')));
  source(canonicalCard, evidence.page);

  const blocked = evidence.noindex;
  const indexing = card('indexing', L('Indexation', 'Indexing'), blocked ? 'fail' : 'pass', blocked ? L('Directive noindex repérée', 'Noindex directive found') : L('Aucune directive noindex repérée', 'No noindex directive found'));
  for (const agent of ['robots', 'googlebot']) {
    const values = evidence.directives.filter(item => item.agent === agent);
    if (!values.length) field(indexing, `meta[name="${agent}"]`, L('Balise non trouvée.', 'Tag not found.'));
    else for (const value of values) excerpt(indexing, `meta[name="${agent}"] · content`, value);
  }
  if (evidence.xRobotsTag.value) excerpt(indexing, 'X-Robots-Tag', evidence.xRobotsTag);
  else field(indexing, 'X-Robots-Tag', L('En-tête non reçu.', 'Header not received.'));
  indexing.append(el('p', 'public-micro', L('Ces directives ne confirment ni la permission d’exploration dans robots.txt, ni l’indexation réelle dans Google.', 'These directives confirm neither robots.txt crawl permission nor actual Google indexation.')));
  source(indexing, evidence.page);

  const found = evidence.sitemaps.some(item => item.document);
  const missing = evidence.sitemaps.length > 0 && evidence.sitemaps.every(item => [404, 410].includes(item.status));
  const sitemap = card('sitemap', 'Sitemap', found ? 'pass' : missing ? 'fail' : 'warn', found ? L('Sitemap lu', 'Sitemap read') : missing ? L('Introuvable aux URL testées', 'Not found at the tested URLs') : L('Vérification incomplète', 'Incomplete verification'));
  for (const item of evidence.sitemaps) {
    source(sitemap, item);
    if (item.document) {
      field(sitemap, item.document.kind, `${item.document.count} ${item.document.kind === 'sitemapindex' ? L('sitemaps déclarés', 'declared sitemaps') : L('URL déclarées', 'declared URLs')}`);
      for (const url of item.document.examples) sitemap.append(link(url));
    } else if (item.status >= 200 && item.status < 300) sitemap.append(el('p', 'public-micro', L('La réponse reçue n’est pas un document urlset ou sitemapindex reconnu.', 'The response is not a recognised urlset or sitemapindex document.')));
  }
  const declarations = el('details', 'public-evidence-details'); declarations.append(el('summary', '', L('Déclarations dans robots.txt', 'Declarations in robots.txt')));
  source(declarations, evidence.robots);
  for (const url of evidence.robots.declarations) declarations.append(link(url));
  if (!evidence.robots.declarations.length) declarations.append(el('p', 'public-micro', evidence.robots.status >= 200 && evidence.robots.status < 300 ? L('Aucune ligne Sitemap reçue.', 'No Sitemap line received.') : L('Déclarations indisponibles.', 'Declarations unavailable.')));
  sitemap.append(declarations, el('p', 'public-micro', L('Seules les URL testées ci-dessus sont vérifiées. Les autres déclarations et les URL contenues dans les sitemaps ne sont pas explorées.', 'Only the tested URLs above are verified. Other declarations and URLs within sitemaps are not crawled.')));
  return panel;
}
