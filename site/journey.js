import { journeyContent } from './journey-content.js';
const lang = document.documentElement.lang === 'fr' ? 'fr' : 'en';
const L = (en, fr) => lang === 'fr' ? fr : en;
const { profiles, features } = journeyContent(lang);
const cards = [...document.querySelectorAll('[data-feature]')];
const search = document.getElementById('feature-query');
const count = document.getElementById('feature-count');
const reset = document.getElementById('feature-reset');
let stage = 'diagnose';
function filter() {
  const query = (search?.value || '').trim().toLocaleLowerCase(lang);
  let visible = 0;
  for (const card of cards) {
    card.hidden = (stage !== 'all' && card.dataset.featureStage !== stage) || !card.textContent.toLocaleLowerCase(lang).includes(query);
    if (!card.hidden) visible++;
  }
  document.querySelectorAll('[data-stage]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.stage === stage)));
  if (count) count.textContent = visible ? `${visible} ${(visible === 1 ? L('function shown', 'fonction affichée') : L('functions shown', 'fonctions affichées'))}` : L('No matching function. Try another term or show all functions.', 'Aucune fonction correspondante. Essayez un autre terme ou affichez toutes les fonctions.');
  if (reset) reset.hidden = stage === 'all' && !query;
}
document.querySelectorAll('[data-stage]').forEach(b => b.addEventListener('click', () => { stage = b.dataset.stage; filter(); }));
document.querySelectorAll('[data-choose-stage]').forEach(a => a.addEventListener('click', () => { stage = a.dataset.chooseStage; search.value = ''; filter(); }));
search?.addEventListener('input', () => { stage = 'all'; filter(); });
reset?.addEventListener('click', () => { stage = 'all'; search.value = ''; filter(); search.focus(); });
document.querySelectorAll('[data-profile]').forEach(b => b.addEventListener('click', () => {
  const profile = profiles.find(p => p.id === b.dataset.profile);
  if (!profile) return;
  document.querySelectorAll('[data-profile]').forEach(button => button.setAttribute('aria-pressed', String(button === b)));
  const panel = document.getElementById('journey-recommendation'), p = document.createElement('p'), links = document.createElement('div');
  p.textContent = profile.text; links.className = 'journey-picks';
  for (const id of profile.picks) { const f = features.find(f => f.id === id), a = document.createElement('a'); a.href = `/console/?lang=${lang}${f.route}`; a.textContent = `${f.title} →`; links.append(a); }
  panel.replaceChildren(p, links); stage = profile.stage; search.value = ''; filter();
}));
// Technical sections remain linkable while secondary detail is collapsed.
function revealAnchor() {
  const target = document.getElementById(location.hash.slice(1));
  if (!target) return;
  for (let parent = target.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
  if (target.dataset.feature) { stage = 'all'; search.value = ''; filter(); }
  target.scrollIntoView({ block: 'start', behavior: 'instant' });
}
window.addEventListener('hashchange', revealAnchor);
filter();
if (location.hash) revealAnchor();
