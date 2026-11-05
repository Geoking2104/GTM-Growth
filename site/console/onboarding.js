/* Carte « Démarrage » de la vue d'ensemble : mêmes étapes que la section #how du site. */
import { el } from "./render.js";
import { LANG } from "./i18n.js";
import { onboardingSteps, onboardingProgress } from "./onboarding-steps.js";

const FR = LANG === "fr";
const LABELS = {
  freeRead: [ "1 · Lecture gratuite : domaine du site renseigné", "1 · Free read: site domain set" ],
  gsc: [ "2 · Search Console connectée (compte de service autorisé)", "2 · Search Console connected (service account granted)" ],
  ga4: [ "2 · GA4 connecté (rôle Lecteur + ID de propriété)", "2 · GA4 connected (Viewer role + property id)" ],
  bing: [ "2 · Bing Webmaster : clé API gratuite enregistrée", "2 · Bing Webmaster: free API key saved" ],
  gtm: [ "2 · Google Tag Manager : conteneur déclaré", "2 · Google Tag Manager: container set" ],
  clarity: [ "2 · Microsoft Clarity : ID de projet déclaré", "2 · Microsoft Clarity: project id set" ],
  audit: [ "3 · Premier audit complet lancé (note GEO)", "3 · First full audit run (GEO score)" ],
  plan: [ "4 · Plan d’action priorisé disponible", "4 · Prioritised action plan available" ],
};

export function renderOnboarding(input) {
  const steps = onboardingSteps(input);
  const { done, total } = onboardingProgress(steps);
  const card = el("section", "app-strip onboarding-card");
  card.setAttribute("aria-label", FR ? "Démarrage" : "Getting started");
  const head = el("h3", "", FR ? "Démarrage" : "Getting started");
  head.append(el("span", "onboarding-count", ` ${done}/${total}`));
  card.append(head, el("p", "c-note", FR
    ? "Connecter vos accès : Search Console, GA4, Bing, GTM et Clarity se règlent dans Tracking → Paramètres. Chaque étape se coche d’elle-même à partir du statut réel."
    : "Connect your access: Search Console, GA4, Bing, GTM and Clarity are set in Tracking → Settings. Each step ticks itself from the live status."));
  const ul = el("ul", "onboarding-list");
  for (const s of steps) {
    const li = el("li", s.done ? "is-done" : "");
    li.append(el("span", `pill ${s.done ? "ok" : "warn"}`, s.done ? "✓" : "…"));
    const a = el("a", "", LABELS[s.id][FR ? 0 : 1]); a.href = s.href; li.append(a); ul.append(li);
  }
  card.append(ul);
  return card;
}
