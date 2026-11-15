import { consoleFeature, journeyContent } from '../journey-content.js';
import { el } from './render.js';

export function renderFeatureEntry(hash, language) {
  const [section, tab] = (hash || '').slice(1).split('/');
  const feature = consoleFeature(section, tab, language);
  if (!feature) return null;
  const L = (en, fr) => language === 'fr' ? fr : en;
  const box = el('section', 'c-feature-guide'); box.id = 'c-feature-entry';
  box.append(el('p', 'public-eyebrow', L('Your selected next step', 'Votre prochaine étape')),
    el('h2', '', feature.title), el('p', '', feature.benefit),
    el('p', '', `${L('You need', 'Il vous faut')} : ${feature.input}`));
  const link = el('a', 'c-feature-next', L('Sign in to continue to this function →', 'Se connecter pour poursuivre vers cette fonction →'));
  link.href = '#c-login-form'; box.append(link);
  return box;
}

/** Immediate orientation, including while the data source is loading or missing. */
export function renderFeatureGuide(section, tab, language) {
  const feature = consoleFeature(section, tab, language);
  if (!feature) return null;
  const L = (en, fr) => language === 'fr' ? fr : en;
  const { stages, features } = journeyContent(language);
  const stage = stages.find(s => s.id === feature.stage);
  const box = el('aside', 'c-feature-guide');
  box.setAttribute('aria-label', L('Purpose and next step', 'Intérêt et prochaine étape'));
  const header = el('div', 'c-feature-guide-head');
  header.append(el('span', '', `${stage.number} · ${stage.title}`), el('span', '', feature.access));
  const detail = el('details');
  detail.append(el('summary', '', L('What you get and what you need', 'Résultat et prérequis')));
  const dl = el('dl');
  for (const [label, value] of [[L('You get', 'Vous obtenez'), feature.output], [L('You need', 'Il vous faut'), feature.input]]) dl.append(el('dt', '', label), el('dd', '', value));
  detail.append(dl);
  const nextFeature = features.find(f => f.route === feature.next) || features.find(f => f.id === feature.next.slice(1).split('/')[0]);
  const next = el('a', 'c-feature-next', `${L('Next', 'Ensuite')} · ${nextFeature?.title || L('Action plan', 'Plan d’action')} →`);
  next.href = feature.next;
  const map = el('a', '', L('Explore all functions', 'Explorer toutes les fonctions'));
  map.href = `${language === 'fr' ? '/fr/' : '/'}#feature-${feature.id}`;
  const actions = el('div', 'c-feature-guide-actions'); actions.append(next, map);
  box.append(header, detail, actions);
  return box;
}
