/** Unauthenticated, evidence-led free read shared by French and English shells. */
import { normalisePublicUrl, rankRecommendations, explainRecommendation } from "./public-read-model.js";
import { translateLiveTables } from "../fr/server-tables.js";

const COPY = {
  fr: {
    loading: "Analyse de la page publique en cours…", invalid: "Saisissez une URL de site public valide (ex. https://exemple.fr).",
    unavailable: "La lecture est momentanément indisponible. Réessayez dans un instant ; aucune donnée fictive n’est affichée.",
    analyzed: "PAGE ANALYSÉE", intro: "Préparation technique d’une seule page, pas visibilité réelle dans les réponses IA.",
    score: "SCORE GEO · V1", scoreNote: "Mesure de préparation sur cette URL, pas de tout le domaine.",
    pass: "contrôles validés", attention: "points à améliorer", scoreGain: "points théoriquement récupérables",
    gainsNote: "Somme indicative des contrôles non satisfaits, sans promesse de positionnement ni de trafic.",
    observed: "Ce que nous avons réellement observé", evidence: "PREUVES", noMeasurements: "Aucun contrôle détaillé disponible pour cette page.",
    technical: "Voir les mesures techniques", social: "Profils sociaux repérés", socialEmpty: "Aucun lien vers un profil social repéré sur cette page.",
    socialNote: "Liens sortants et identités déclarées uniquement · les backlinks entrants ne sont pas vérifiés.",
    engines: "Moteurs et assistants concernés", enginesNote: "Logos indicatifs. Aucun moteur n’a été interrogé ; citations, positions et trafic ne sont pas mesurés.",
    actionEyebrow: "VOTRE PLAN PERSONNALISÉ", actionTitle: "Que corriger en premier ?", actionIntro: "Plusieurs pistes sont calculées à partir des échecs réellement observés.",
    recommend: "✨ L’IA recommande", recommends: "L’IA recommande", algorithmNote: "Classement automatique et explicable des contrôles mesurés, sans génération de réponse par un LLM.",
    quick: "Gains rapides", impact: "Impact potentiel", ai: "Découverte IA", fixCount: "options analysées", noFixes: "Aucun correctif étayé par cette lecture.",
    possible: "Effet possible", points: "pts GEO possibles", blocker: "Blocage prioritaire", effort: "Effort", easy: "Faible", medium: "Modéré", hard: "Élevé",
    proof: "Voir la preuve et l’effet", proofSource: "Constat technique du contrôle", doThis: "Comment agir", continue: "Me guider pour corriger", consent: "Toute modification exige votre validation dans votre espace.",
    limitation: "Diagnostic public : une page et ses ressources accessibles. Pas d’accès Google Analytics, Search Console ou Bing Webmaster sans connexion autorisée.",
    retry: "Vérifiez l’URL et les règles d’accès du site avant de relancer l’analyse.",
  },
  en: {
    loading: "Analysing the public page…", invalid: "Enter a valid public website URL (e.g. https://example.com).",
    unavailable: "The read is temporarily unavailable. Please try again; no invented results are displayed.",
    analyzed: "ANALYSED PAGE", intro: "Technical readiness of one page, not actual visibility in AI answers.",
    score: "GEO SCORE · V1", scoreNote: "Readiness measured for this URL, not the whole domain.",
    pass: "checks passed", attention: "areas to improve", scoreGain: "theoretically recoverable points",
    gainsNote: "Indicative sum of missing checks; not a ranking or traffic guarantee.",
    observed: "What we actually observed", evidence: "EVIDENCE", noMeasurements: "No detailed checks available for this page.",
    technical: "See technical measurements", social: "Social profiles found", socialEmpty: "No social profile link found on this page.",
    socialNote: "Outbound links and declared identities only · inbound backlinks are not checked.",
    engines: "Relevant engines and assistants", enginesNote: "Illustrative logos. No engine was queried; citations, rankings and traffic were not measured.",
    actionEyebrow: "YOUR PERSONAL ACTION PLAN", actionTitle: "What should you fix first?", actionIntro: "Multiple options are calculated from the actual observed failures.",
    recommend: "✨ AI recommends", recommends: "AI recommends", algorithmNote: "Automatic, explainable ranking of measured checks. No LLM response is generated.",
    quick: "Quick wins", impact: "Potential impact", ai: "AI discovery", fixCount: "options assessed", noFixes: "No evidence-backed fixes from this read.",
    possible: "Possible effect", points: "possible GEO pts", blocker: "Priority blocker", effort: "Effort", easy: "Low", medium: "Moderate", hard: "High",
    proof: "See evidence and effect", proofSource: "Raw technical finding", doThis: "How to act", continue: "Guide me through the fix", consent: "Any change requires your approval in your workspace.",
    limitation: "Public diagnostic: one page and accessible resources. No Google Analytics, Search Console or Bing Webmaster access without authorised sign-in.",
    retry: "Check the URL and site access rules before running the read again.",
  },
};

const ENGINES = [
  ["Google", "../assets/ai-engines/google.svg"],
  ["Bing", "../assets/ai-engines/bing.svg"],
  ["ChatGPT", "../assets/ai-engines/openai.svg"],
  ["Gemini", "../assets/ai-engines/gemini.svg"],
  ["Perplexity", "../assets/ai-engines/perplexity.png"],
  ["Claude", "../assets/ai-engines/claude.svg"],
];

function el(tag, className = "", value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = String(value);
  return node;
}
function image(src, label) {
  const img = el("img"); img.src = src; img.alt = ""; img.width = 23; img.height = 23; img.loading = "lazy";
  const wrap = el("span", "public-engine"); wrap.setAttribute("aria-label", label);
  wrap.append(img, el("span", "", label)); return wrap;
}
function detailText(value, lang) {
  const s = String(value ?? "");
  return lang === "fr" ? s.replace(/(\d+) chars?\b/g, "$1 caractères").replace(/\bmissing\b/gi, "absent") : s;
}
function safeNumber(value, max = 100) { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.round(value))) : null; }

function diagnostic(data, lang, copy) {
  const panel = el("section", "public-panel public-diagnostic");
  panel.append(el("p", "public-eyebrow", copy.evidence), el("h2", "", copy.observed));
  const table = (id) => (data.tables || []).find((entry) => entry.id === id && !entry.sample);
  const row = (id, label) => table(id)?.rows?.find((item) => item.label === label);
  const items = [
    [lang === "fr" ? "Titre" : "Title", row("seo.meta", "Title")],
    ["Canonical", row("seo.meta", "Canonical")],
    [lang === "fr" ? "Indexation" : "Indexing", row("gsc.readiness", "Indexability") || row("seo.meta", "Robots meta")],
    ["Sitemap", row("gsc.readiness", "Sitemap")],
  ].filter(([, value]) => value);
  if (!items.length) panel.append(el("p", "public-description", copy.noMeasurements));
  const grid = el("div", "public-signal-grid");
  for (const [label, value] of items) {
    const item = el("div", `public-signal public-status-${value.status === "pass" ? "pass" : value.status === "fail" ? "fail" : "warn"}`);
    item.append(el("strong", "", label), el("span", "", detailText(value.value, lang)));
    grid.append(item);
  }
  panel.append(grid);
  return panel;
}

function socialPanel(data, copy) {
  const panel = el("section", "public-panel public-social");
  panel.append(el("h2", "", copy.social));
  const profiles = Array.isArray(data.socialProfiles) ? data.socialProfiles : [];
  if (profiles.length) {
    const links = el("div", "public-social-links");
    for (const profile of profiles) {
      try {
        const url = new URL(profile.url);
        if (!["https:", "http:"].includes(url.protocol)) continue;
        const link = el("a", "public-social-link", profile.platform);
        link.href = url.href; link.target = "_blank"; link.rel = "noopener noreferrer"; links.append(link);
      } catch { /* Ignore malformed API data. */ }
    }
    if (links.children.length) panel.append(links);
    else panel.append(el("p", "public-description", copy.socialEmpty));
  } else panel.append(el("p", "public-description", copy.socialEmpty));
  panel.append(el("p", "public-micro", copy.socialNote)); return panel;
}

function technicalTables(data, lang, copy) {
  const details = el("details", "public-panel public-details");
  details.append(el("summary", "", copy.technical));
  const tables = (lang === "fr" ? translateLiveTables(data.tables || []) : (data.tables || []))
    .filter((table) => !table.sample && table.rows?.length);
  for (const table of tables) {
    const group = el("div", "public-table-group"); group.append(el("h3", "", table.title));
    const list = el("ul");
    for (const row of table.rows) {
      const item = el("li", `public-status-${row.status === "pass" ? "pass" : row.status === "fail" ? "fail" : "warn"}`);
      item.append(el("strong", "", row.label), document.createTextNode(` : ${row.value}`));
      list.append(item);
    }
    group.append(list); details.append(group);
  }
  return details;
}

function recommendationCard(fix, lang, copy, index) {
  const info = explainRecommendation(fix, lang);
  const card = el("li", "public-action-card");
  const head = el("div", "public-action-head");
  head.append(el("span", "public-action-index", String(index + 1)), el("h3", "", info.title));
  card.append(head);
  const effect = el("p", "public-action-effect", `${copy.possible} : ${info.effect}`);
  card.append(effect);
  const tags = el("div", "public-action-tags");
  const points = safeNumber(fix.points, 100);
  if (fix.priority === "critical") tags.append(el("span", "public-pill public-pill-alert", copy.blocker));
  else if (points !== null && points > 0) tags.append(el("span", "public-pill public-pill-good", `+${points} ${copy.points}`));
  tags.append(el("span", "public-pill", `${copy.effort} : ${copy[info.effort]}`));
  card.append(tags);
  const details = el("details", "public-action-details");
  details.append(el("summary", "", copy.proof));
  details.append(el("p", "", `${copy.doThis} : ${info.steps}`));
  if (fix.evidence) {
    const proof = el("p", "public-action-evidence");
    proof.append(el("strong", "", `${copy.proofSource} : `));
    const value = el("span", "", fix.evidence); value.lang = "en"; proof.append(value); details.append(proof);
  }
  card.append(details);
  const link = el("a", "public-action-cta", `${copy.continue} ↗`);
  link.href = "#c-login-form"; card.append(link);
  return card;
}

function recommendations(data, lang, copy) {
  const section = el("section", "public-panel public-recommendations");
  section.append(el("p", "public-eyebrow", copy.actionEyebrow), el("h2", "", copy.actionTitle), el("p", "public-description", copy.actionIntro));
  const trigger = el("button", "public-recommend-button", copy.recommend);
  trigger.type = "button"; trigger.setAttribute("aria-expanded", "false"); trigger.setAttribute("aria-controls", "c-public-ranked");
  const opportunities = Array.isArray(data.opportunities) ? data.opportunities : (data.topFixes || []).map((fix) => ({
    ...fix, status: "fail", category: fix.checkId?.startsWith("brand.") ? "brand_entity" : fix.checkId?.split(".")[0], priority: "high",
  }));
  section.append(trigger, el("p", "public-micro", `${opportunities.length} ${copy.fixCount} · ${copy.algorithmNote}`));
  const ranked = el("div", "public-ranked"); ranked.id = "c-public-ranked"; ranked.hidden = true;
  const modes = el("div", "public-rank-modes"); modes.setAttribute("role", "group"); modes.setAttribute("aria-label", copy.recommends);
  const list = el("ol", "public-action-list");
  function choose(mode) {
    for (const btn of modes.children) btn.setAttribute("aria-pressed", String(btn.dataset.mode === mode));
    list.replaceChildren(...rankRecommendations(opportunities, mode).map((fix, index) => recommendationCard(fix, lang, copy, index)));
    if (!list.children.length) list.append(el("li", "public-description", copy.noFixes));
  }
  for (const [mode, label] of [["quick", copy.quick], ["impact", copy.impact], ["ai", copy.ai]]) {
    const button = el("button", "public-rank-mode", label); button.type = "button"; button.dataset.mode = mode;
    button.onclick = () => choose(mode); modes.append(button);
  }
  ranked.append(modes, list, el("p", "public-micro", copy.consent)); section.append(ranked);
  trigger.onclick = () => {
    const expanded = ranked.hidden; ranked.hidden = !expanded;
    trigger.setAttribute("aria-expanded", String(expanded));
    if (expanded) choose("quick");
  };
  return section;
}

function renderResult(box, data, url, lang) {
  const copy = COPY[lang];
  const finalUrl = normalisePublicUrl(data.finalUrl || url) || url;
  const hostname = new URL(finalUrl).hostname;
  const summary = el("section", "public-summary");
  const identity = el("div"); identity.append(el("p", "public-eyebrow", copy.analyzed), el("h2", "public-domain", hostname), el("p", "public-description", copy.intro));
  const scoring = el("div", "public-score"); scoring.append(el("span", "", copy.score));
  scoring.append(el("strong", "", safeNumber(data.score) ?? "—"), el("small", "", "/ 100"));
  summary.append(identity, scoring);
  const metrics = el("div", "public-read-metrics");
  for (const [num, caption] of [
    [data.checksSummary?.passed, copy.pass], [data.checksSummary?.toImprove, copy.attention], [data.recoverablePoints, copy.scoreGain],
  ]) {
    if (safeNumber(num, 200) === null) continue;
    const metric = el("div", "public-read-metric"); metric.append(el("strong", "", safeNumber(num, 200)), el("span", "", caption)); metrics.append(metric);
  }
  box.replaceChildren(summary);
  if (data.httpStatus && (data.httpStatus < 200 || data.httpStatus >= 400)) {
    box.append(el("p", "public-panel c-error", copy.retry)); return;
  }
  if (metrics.children.length) box.append(metrics);
  box.append(el("p", "public-micro", `${copy.scoreNote} ${copy.gainsNote}`));
  box.append(diagnostic(data, lang, copy));
  box.append(recommendations(data, lang, copy));
  const enginePanel = el("section", "public-panel public-engine-panel");
  enginePanel.append(el("h2", "", copy.engines));
  const logos = el("div", "public-engines");
  for (const [label, src] of ENGINES) logos.append(image(src, label));
  enginePanel.append(logos, el("p", "public-micro", copy.enginesNote)); box.append(enginePanel);
  box.append(socialPanel(data, copy), technicalTables(data, lang, copy), el("p", "public-micro", copy.limitation));
}

/** Mount once on the unauthenticated shell. API-only; no crawlers or writes run in the browser. */
export function mountPublicRead({ initialUrl = "", language = "fr", endpoint = "/api/free-read" } = {}) {
  const lang = language === "en" ? "en" : "fr";
  const copy = COPY[lang];
  const form = document.querySelector("#c-public-url-form");
  const input = document.querySelector("#c-public-url");
  const error = document.querySelector("#c-public-url-error");
  const box = document.querySelector("#c-public-read");
  if (!form || !input || !error || !box) return;
  let generation = 0;
  async function run(raw) {
    const url = normalisePublicUrl(raw);
    error.textContent = "";
    if (!url) { error.textContent = copy.invalid; input.focus(); return; }
    input.value = url;
    const id = ++generation;
    box.hidden = false;
    box.replaceChildren(el("p", "public-panel c-loading", copy.loading));
    const button = form.querySelector("button[type=submit]"); if (button) button.disabled = true;
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ url }), signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (id !== generation) return;
      renderResult(box, data, url, lang);
      try { sessionStorage.setItem("gtm-console-onboarding-url", url); } catch { /* Storage is optional. */ }
    } catch {
      if (id === generation) box.replaceChildren(el("p", "public-panel c-error", copy.unavailable));
    } finally { if (id === generation && button) button.disabled = false; }
  }
  form.addEventListener("submit", (event) => { event.preventDefault(); void run(input.value); });
  if (initialUrl) { input.value = initialUrl; void run(initialUrl); }
}
