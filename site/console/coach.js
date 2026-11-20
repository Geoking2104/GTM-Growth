import { el } from './render.js';
import { icon } from './icons.js';
import { createDataAgent } from './data-agent.js';
import { COACH_GOALS, buildCoachPlan, getCoachGuide, getElementGuide } from './coach-model.js';

let coachSequence = 0;
const tones = new Set(['overview', 'diagnose', 'ops', 'impact', 'settings']);
const safeRoute = value => typeof value === 'string' && /^#[a-z0-9_]+(?:\/[a-z0-9_-]+)?$/.test(value);
const withHook = (node, name) => { node.dataset.coach = name; return node; };
const text = value => typeof value === 'string' ? value : '';

/**
 * A visible guide over the existing console. Navigation and page help never
 * invoke an LLM, publish a campaign or change a customer's source data.
 * Preference writes and the existing data assistant remain explicit actions.
 */
export function createConsoleCoach({ api, language = 'en', workspaceName = '', me = {}, state = {}, onNavigate, onRefresh } = {}) {
  const L = (fr, en) => language === 'fr' ? fr : en;
  const uid = `console-coach-${++coachSequence}`;
  let disposed = false, requestEpoch = 0, profile = null, context = null, pendingContext = null;
  let section = 'overview', tab = '', overview = null, status = null, jobs = [];
  let lastReadAt = null, goalDirty = false, saving = false, returnFocus = null, profileRevision = 0, planSignature = '';
  let scopeKey = JSON.stringify([me?.tenant?.id, state.url, state.property, state.ga4Property, state.bingSite, state.gtmContainer]);
  const principal = me?.user?.sub || me?.sub || me?.email || me?.username;
  const storageKey = me?.tenant?.id && principal ? `gtm-console-coach-v1:${me.tenant.id}:${principal}` : null;
  let expanded = true;
  try { if (storageKey) expanded = sessionStorage.getItem(storageKey) !== 'closed'; } catch { /* Session storage is optional. */ }

  const button = (label, fn, className = 'coach-button') => {
    const node = el('button', className, label); node.type = 'button'; node.onclick = fn; return node;
  };
  const glyph = name => { const span = el('span', 'coach-icon'); span.innerHTML = icon(name); return span; };
  const navigateLink = (label, href, className = 'coach-link') => {
    const node = el('a', className, label);
    node.href = safeRoute(href) ? href : '#overview';
    if (onNavigate) node.addEventListener('click', event => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); onNavigate(node.getAttribute('href'));
    });
    return node;
  };
  const root = withHook(el('section', 'c-coach'), 'root');
  root.setAttribute('aria-label', L('Votre coach GTM', 'Your GTM coach'));
  root.dataset.tone = 'overview';
  const header = el('div', 'coach-header');
  const identity = el('div', 'coach-identity');
  const mark = el('span', 'coach-avatar'); mark.innerHTML = icon('compass');
  const identityCopy = el('div');
  identityCopy.append(el('strong', '', L('Votre coach GTM', 'Your GTM coach')), el('span', 'coach-workspace', workspaceName || L('Votre espace', 'Your workspace')));
  identity.append(mark, identityCopy);
  const headerActions = el('div', 'coach-header-actions');
  const pageHelp = withHook(button(L('Comprendre cet écran', 'Understand this screen'), () => explain({ section, tab, element: pageHelp }), 'coach-button coach-button-soft'), 'explain-page');
  const toggle = withHook(button('', () => setExpanded(!expanded)), 'toggle');
  toggle.setAttribute('aria-controls', `${uid}-panel`);
  headerActions.append(pageHelp, toggle); header.append(identity, headerActions);
  const panel = withHook(el('div', 'coach-panel'), 'panel'); panel.id = `${uid}-panel`;

  const hero = el('div', 'coach-hero');
  const intro = el('div', 'coach-intro');
  intro.append(el('p', 'coach-eyebrow', L('UN OBJECTIF. UNE PROCHAINE ACTION.', 'ONE GOAL. ONE NEXT ACTION.')));
  const heading = el('h2', 'coach-heading', L('Avancez avec un cap clair.', 'Make your next move clear.'));
  const introduction = el('p', 'coach-description', L('Choisissez votre objectif. Je relie vos données aux étapes qui vous aideront à avancer.', 'Choose your goal. I connect your data to the steps that help you move forward.'));
  intro.append(heading, introduction);

  const goalForm = el('form', 'coach-goal-form');
  const goalLabel = el('label', 'coach-goal-label', L('Mon objectif', 'My goal')); goalLabel.htmlFor = `${uid}-goal`;
  const goal = withHook(el('select', 'coach-goal'), 'goal'); goal.id = `${uid}-goal`; goal.disabled = true;
  for (const value of COACH_GOALS) {
    const option = el('option', '', language === 'fr' ? value.fr : value.en); option.value = value.id; goal.append(option);
  }
  goal.onchange = () => { goalDirty = true; goalStatus.textContent = L('Enregistrez pour adapter vos prochaines étapes.', 'Save to adapt your next steps.'); };
  const saveGoal = withHook(el('button', 'coach-button coach-button-primary', L('Adapter mon parcours', 'Adapt my journey')), 'goal-save'); saveGoal.type = 'submit'; saveGoal.disabled = true;
  const goalControls = el('div', 'coach-goal-controls'); goalControls.append(goal, saveGoal);
  const goalStatus = withHook(el('p', 'coach-form-status', L('Chargement de vos préférences…', 'Loading your preferences…')), 'goal-status'); goalStatus.setAttribute('role', 'status');
  goalForm.append(goalLabel, goalControls, goalStatus); intro.append(goalForm);
  const illustration = el('img', 'coach-illustration'); illustration.src = '/assets/coach/overview.svg'; illustration.width = 220; illustration.height = 154;
  illustration.alt = L('Illustration : des preuves reliées à un parcours d’actions.', 'Illustration: evidence connected to an action journey.');
  const nextCard = el('section', 'coach-next-card'); nextCard.setAttribute('aria-label', L('Votre prochaine action', 'Your next action'));
  hero.append(intro, nextCard, illustration);

  const path = el('details', 'coach-path');
  const pathHeader = el('summary', 'coach-path-header');
  const pathTitle = el('span', 'coach-path-title', L('Voir mon parcours, étape par étape', 'See my journey, step by step'));
  pathHeader.append(pathTitle, el('span', 'coach-path-note', L('Chaque étape explique son rôle', 'Every step explains its purpose')));
  const steps = withHook(el('ol', 'coach-steps'), 'steps');
  const provenance = el('p', 'coach-provenance');
  const progressRegion = withHook(el('section', 'coach-read-status'), 'activity'); progressRegion.setAttribute('aria-label', L('État des lectures de données', 'Data reading status'));
  const routeContext = el('div', 'coach-route-context');
  path.append(pathHeader, steps, provenance, routeContext);
  const questionArea = el('div', 'coach-question-area');
  const dataAgent = createDataAgent({
    language, workspaceName,
    api: async (route, body) => {
      const revision = profileRevision;
      if (route === '/data-agent/profile') profileRevision++;
      const result = await api(route, body);
      if (!disposed && result?.profile && (route === '/data-agent/profile' || route === '/data-agent/context')) {
        if (route === '/data-agent/context' && revision !== profileRevision) return result;
        profile = result.profile; if (context) context = { ...context, profile };
        if (!goalDirty) goal.value = profile.goal;
        drawPlan();
      }
      return result;
    },
  });
  dataAgent.element.dataset.coach = 'data-assistant';
  dataAgent.element.querySelector('summary').textContent = L('Poser une question à mes données', 'Ask a question about my data');
  questionArea.append(dataAgent.element);
  panel.append(hero, path, progressRegion, questionArea);

  const launcher = withHook(button(L('Mon coach GTM', 'My GTM coach'), () => { setExpanded(true); toggle.focus(); root.scrollIntoView?.({ block: 'nearest' }); }, 'coach-launcher'), 'launcher');
  launcher.prepend(glyph('compass')); launcher.setAttribute('aria-controls', panel.id);
  const dialog = withHook(el('dialog', 'coach-inspector'), 'inspector');
  dialog.setAttribute('aria-labelledby', `${uid}-help-title`);
  const dialogHead = el('div', 'coach-inspector-head');
  const dialogClose = withHook(button(L('Fermer l’aide', 'Close help'), () => closeHelp(), 'coach-button coach-close'), 'help-close');
  dialogHead.append(el('p', 'coach-eyebrow', L('COMPRENDRE AVANT D’AGIR', 'UNDERSTAND BEFORE ACTING')), dialogClose);
  const helpContent = el('div', 'coach-inspector-content');
  dialog.append(dialogHead, helpContent);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeHelp(); });
  dialog.addEventListener('close', restoreFocus);
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeHelp(); } });
  root.append(header, panel, launcher, dialog);

  function setExpanded(value) {
    expanded = Boolean(value); panel.hidden = !expanded; root.classList.toggle('is-collapsed', !expanded);
    toggle.textContent = expanded ? L('Réduire', 'Collapse') : L('Ouvrir mon coach', 'Open my coach');
    toggle.setAttribute('aria-expanded', String(expanded)); launcher.hidden = expanded; launcher.setAttribute('aria-expanded', String(expanded));
    try { if (storageKey) sessionStorage.setItem(storageKey, expanded ? 'open' : 'closed'); } catch { /* Keep it usable without storage. */ }
  }

  function closeHelp() {
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else { dialog.removeAttribute('open'); restoreFocus(); }
  }

  function restoreFocus() {
    if (returnFocus?.isConnected) returnFocus.focus();
    else if (!disposed && root.isConnected) pageHelp.focus();
    returnFocus = null;
  }

  function factBlock(label, value, hook, symbol) {
    const block = withHook(el('section', 'coach-fact'), hook);
    const title = el('h3'); title.append(glyph(symbol), label);
    block.append(title, el('p', '', text(value))); return block;
  }

  function explain(input = {}) {
    if (disposed) return;
    const currentSection = input.section || section, currentTab = input.tab ?? tab;
    const guide = input.guide || (input.label ? getElementGuide({ section: currentSection, tab: currentTab, label: input.label, kind: input.kind }, language) : getCoachGuide(currentSection, currentTab, language));
    returnFocus = input.element || document.activeElement;
    dialog.dataset.tone = tones.has(guide.tone) ? guide.tone : 'overview';
    const title = withHook(el('h2', 'coach-help-title', input.label || guide.title), 'help-title'); title.id = `${uid}-help-title`;
    helpContent.replaceChildren(title, el('p', 'coach-help-summary', guide.summary || ''));
    helpContent.append(factBlock(L('D’où cela provient', 'Where it comes from'), guide.origin, 'help-source', 'layers'));
    const relations = withHook(el('section', 'coach-fact'), 'help-relations');
    const relTitle = el('h3'); relTitle.append(glyph('links'), L('À quoi cela est relié', 'What it connects to')); relations.append(relTitle);
    const links = el('ul', 'coach-related-links');
    for (const link of guide.relations || []) {
      if (!safeRoute(link.href)) continue;
      const item = el('li'), a = navigateLink(link.label, link.href); a.addEventListener('click', closeHelp); item.append(a); links.append(item);
    }
    relations.append(links); helpContent.append(relations);
    helpContent.append(factBlock(L('Si cela évolue, qu’est-ce qui change ?', 'What changes when this changes?'), guide.consequence, 'help-consequence', 'workflow'));
    helpContent.append(factBlock(L('Quand relire cette information', 'When to read it again'), guide.freshness, 'help-freshness', 'realtime'));
    if (safeRoute(guide.next?.href)) { const link = navigateLink(guide.next.label, guide.next.href, 'coach-button coach-button-primary'); link.addEventListener('click', closeHelp); helpContent.append(link); }
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    dialogClose.focus();
  }

  function drawGuide() {
    const guide = getCoachGuide(section, tab, language);
    const tone = tones.has(guide.tone) ? guide.tone : 'overview';
    root.dataset.tone = tone; illustration.src = `/assets/coach/${tone}.svg`;
    illustration.alt = L(`Illustration du parcours : ${guide.title}.`, `Journey illustration: ${guide.title}.`);
    routeContext.replaceChildren();
    const copy = el('div'); copy.append(el('strong', '', guide.title), el('p', '', guide.summary));
    const detail = button(L('Source, liens et effets', 'Source, links and effects'), () => explain({ section, tab, element: detail }), 'coach-button coach-button-soft');
    detail.prepend(glyph('links')); routeContext.append(copy, detail);
  }

  function drawPlan() {
    const guide = getCoachGuide(section, tab, language);
    const plan = buildCoachPlan({ profile, me: state.me || me, overview, status, section, tab }, language);
    const signature = JSON.stringify([plan, guide.id]);
    if (signature === planSignature) return;
    planSignature = signature;
    const entries = (plan.steps || []).slice(0, 6);
    const next = plan.next || entries[0];
    const explainStep = (item, trigger) => {
      const [targetSection, targetTab = ''] = String(item.href || '#overview').slice(1).split('/');
      const targetGuide = getCoachGuide(targetSection, targetTab, language);
      explain({ label: item.title, kind: 'recommendation', element: trigger, guide: {
        ...targetGuide, title: item.title, summary: item.detail,
        origin: `${item.reason || ''} ${plan.source || ''}`.trim(),
        consequence: item.impact || targetGuide.consequence,
        next: { label: L('Ouvrir cette étape →', 'Open this step →'), href: item.href },
      } });
    };
    nextCard.replaceChildren(el('p', 'coach-eyebrow', L('PROCHAINE ACTION CONSEILLÉE', 'SUGGESTED NEXT ACTION')));
    if (next) {
      nextCard.append(el('h3', '', next.title), el('p', 'coach-next-reason', next.reason || next.detail));
      const action = withHook(navigateLink(L('Continuer →', 'Continue →'), next.href, 'coach-button coach-button-primary'), 'next');
      const explainNext = button(L('Pourquoi cette étape ?', 'Why this step?'), () => explainStep(next, explainNext), 'coach-button coach-button-text');
      nextCard.append(action, explainNext);
    } else {
      nextCard.append(el('h3', '', guide.title), el('p', 'coach-next-reason', guide.summary));
      nextCard.append(withHook(navigateLink(guide.next.label, guide.next.href, 'coach-button coach-button-primary'), 'next'));
    }
    steps.replaceChildren();
    for (const [index, item] of entries.entries()) {
      const step = el('li', 'coach-step'); step.dataset.state = ['ready', 'todo', 'blocked'].includes(item.state) ? item.state : 'todo';
      const count = el('span', 'coach-step-number', String(index + 1)); count.setAttribute('aria-hidden', 'true');
      const label = navigateLink(item.title, item.href, 'coach-step-link');
      const stateLabel = item.state === 'ready' ? L('Disponible', 'Available') : item.state === 'blocked' ? L('Prérequis manquant', 'Missing prerequisite') : L('À vérifier', 'To review');
      step.append(count, label, el('span', 'coach-step-state', stateLabel));
      const why = button(L('Comprendre cette étape', 'Understand this step'), () => explainStep(item, why), 'coach-step-help');
      why.title = item.reason || item.detail || ''; step.append(why); steps.append(step);
    }
    provenance.textContent = plan.source || L('Parcours guidé à partir de votre espace et des preuves disponibles.', 'Guided journey based on your workspace and available evidence.');
  }

  function drawProgress() {
    progressRegion.replaceChildren();
    const active = jobs.filter(job => ['queued', 'running'].includes(job.state)).length;
    const failed = jobs.filter(job => job.state === 'error').length;
    const settled = jobs.filter(job => ['done', 'error', 'skipped'].includes(job.state)).length;
    const heading = el('div', 'coach-read-heading');
    const statusText = active ? L('Lecture en cours', 'Reading data') : failed ? L('Certaines sources sont à vérifier', 'Some sources need attention') : jobs.length ? L('Lectures terminées', 'Reads completed') : L('Chaque donnée conserve sa date', 'Every measure keeps its date');
    const dot = el('span', 'coach-live-dot'); dot.dataset.state = active ? 'running' : failed ? 'error' : jobs.length ? 'done' : 'idle'; dot.setAttribute('aria-hidden', 'true');
    const label = el('span', 'coach-live-label', statusText); label.setAttribute('role', 'status');
    heading.append(dot, label);
    if (lastReadAt) { const time = el('time', 'coach-read-time', `${L('Écran actualisé à', 'Screen updated at')} ${lastReadAt.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`); time.dateTime = lastReadAt.toISOString(); heading.append(time); }
    if (onRefresh) {
      const refresh = withHook(button(L('Actualiser l’écran', 'Refresh screen'), () => onRefresh(), 'coach-button coach-button-text'), 'refresh'); refresh.disabled = active > 0; heading.append(refresh);
    }
    progressRegion.append(heading);
    if (jobs.length) {
      const progress = el('progress', 'coach-progress'); progress.max = jobs.length; progress.value = settled;
      progress.setAttribute('aria-label', L(`${settled} lectures terminées sur ${jobs.length}`, `${settled} of ${jobs.length} reads completed`)); progressRegion.append(progress);
      const breakdown = el('div', 'coach-job-list');
      const jobLabels = { overview: L('Audit du site', 'Website audit'), status: L('Accès aux sources', 'Source access'), gsc: 'Search Console', ga4: 'Google Analytics', bing: 'Bing', ai: L('Observations IA', 'AI observations'), reports: L('Rapports', 'Reports') };
      const stateLabels = { queued: L('en attente', 'queued'), running: L('en lecture', 'reading'), done: L('lu', 'read'), error: L('à vérifier', 'check needed'), skipped: L('non lu', 'not read') };
      for (const job of jobs.slice(0, 10)) {
        const chip = el('span', 'coach-job', `${job.label || jobLabels[job.id] || L('Source', 'Source')} · ${stateLabels[job.state] || L('état inconnu', 'unknown state')}`); chip.dataset.state = job.state; breakdown.append(chip);
      }
      progressRegion.append(breakdown);
    }
    progressRegion.append(el('p', 'coach-read-caveat', L('Ce suivi montre les lectures de la console. La date de collecte et le délai du fournisseur restent propres à chaque source.', 'This tracks console reads. Collection dates and provider delays remain specific to each source.')));
  }

  async function loadContext() {
    if (pendingContext) return pendingContext;
    const epoch = ++requestEpoch;
    goalStatus.setAttribute('role', 'status');
    pendingContext = (async () => {
      try {
        const value = await Promise.resolve().then(() => api('/data-agent/context', { locale: language, section }));
        if (disposed || epoch !== requestEpoch) return;
        if (!value?.profile) throw new Error('Missing profile');
        context = value; profile = value.profile; goal.value = profile.goal; goal.disabled = false; saveGoal.disabled = false;
        goalStatus.textContent = L('Votre objectif adapte les conseils ; vos droits restent inchangés.', 'Your goal adapts the guidance; your permissions stay the same.');
        drawPlan();
      } catch {
        if (disposed || epoch !== requestEpoch) return;
        goalStatus.setAttribute('role', 'alert');
        goalStatus.replaceChildren(withHook(el('span', '', L('Préférences indisponibles. L’aide de chaque écran reste accessible.', 'Preferences unavailable. Help for every screen remains available.')), 'context-status'), withHook(button(L('Réessayer', 'Retry'), loadContext, 'coach-button coach-button-text'), 'retry'));
      } finally { pendingContext = null; }
    })();
    return pendingContext;
  }

  goalForm.onsubmit = async event => {
    event.preventDefault(); if (!profile || saving || disposed) return;
    saving = true; profileRevision++; saveGoal.disabled = true; goal.disabled = true;
    goalStatus.textContent = L('Enregistrement…', 'Saving…');
    const epoch = requestEpoch;
    try {
      const result = await api('/data-agent/profile', { ...profile, goal: goal.value });
      if (disposed || epoch !== requestEpoch) return;
      if (!result?.profile) throw new Error('Missing saved profile');
      profile = result.profile; context = { ...context, profile }; goalDirty = false;
      goal.value = profile.goal; drawPlan();
      goalStatus.textContent = L('Parcours adapté à votre objectif.', 'Journey adapted to your goal.');
    } catch {
      if (!disposed && epoch === requestEpoch) goalStatus.textContent = L('Objectif non enregistré. Vos préférences précédentes sont conservées.', 'Goal not saved. Your previous preferences are unchanged.');
    } finally { saving = false; if (!disposed) { saveGoal.disabled = !profile; goal.disabled = !profile; } }
  };

  function setContext(next = {}) {
    if (disposed) return;
    const nextScope = JSON.stringify([me?.tenant?.id, state.url, state.property, state.ga4Property, state.bingSite, state.gtmContainer]);
    if (nextScope !== scopeKey) { scopeKey = nextScope; overview = null; status = null; jobs = []; lastReadAt = null; }
    const changedRoute = section !== (next.section || section) || tab !== (next.tab ?? tab);
    section = next.section || section; tab = next.tab ?? tab;
    if (Object.hasOwn(next, 'overview')) overview = next.overview;
    if (Object.hasOwn(next, 'status')) status = next.status;
    if (Array.isArray(next.jobs)) jobs = next.jobs.map(job => ({ ...job }));
    if (Object.hasOwn(next, 'overview') || Object.hasOwn(next, 'status') || Array.isArray(next.jobs)) lastReadAt = new Date();
    if (changedRoute) { drawGuide(); dataAgent.setSection(section); }
    drawPlan(); drawProgress();
  }

  setExpanded(expanded); drawGuide(); drawPlan(); drawProgress();
  void loadContext();
  return {
    element: root, setContext, explain,
    open() { setExpanded(true); toggle.focus(); },
    dispose() { disposed = true; requestEpoch++; closeHelp(); root.remove(); },
  };
}
