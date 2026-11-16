/** Five-pillar public report. All target-originated text is inserted as textContent. */
import { explainRecommendation, normalisePublicUrl } from "./public-read-model.js";

const UI = {
  fr: {
    eyebrow: "DIAGNOSTIC GRATUIT · 360°", title: "Votre visibilité, expliquée simplement",
    subtitle: "Une seule page publique analysée. Les espaces vides sont des mesures à connecter, pas des erreurs détectées.",
    url: "Page source", date: "Relevé le", scope: "Périmètre : cette URL, pas l'ensemble du site",
    coverage: "Couverture", measured: "Contrôles effectués", partial: "Partiellement observé", unknown: "Non mesuré",
    checks: "contrôles vérifiés", attention: "à examiner", profiles: "liens de profils repérés",
    score: "Score de préparation GEO v1", scoreMissing: "Pas de score public fiable",
    seoNote: "Contrôles HTML de cette page ; aucun score SEO global calculé.",
    geoNote: "Préparation GEO v1 seulement ; ni GEO v2 ni citation réelle.",
    aiNote: "Préparation de la page seulement ; aucun moteur IA interrogé.",
    crmNote: "Conversions et revenus non observables sans connexion autorisée.",
    socialNote: "Liens sortants/identités déclarées seulement ; pas de liens entrants mesurés.",
    top: "Les 3 priorités à examiner", seePlan: "Voir le plan complet", next: "Étape de connexion",
    print: "Imprimer / enregistrer en PDF", printing: "Le navigateur permet d'enregistrer un PDF A4.",
    planEyebrow: "PLAN D'ACTION 360°", planTitle: "Un plan à transmettre, puis à vérifier",
    planIntro: "Filtrez par levier. Chaque carte distingue un constat démontré d'une prochaine étape qui nécessite vos données.",
    all: "Tous", priority: "Priorité", effort: "Effort", risk: "Risque", owner: "Responsable", proof: "Preuve", noProof: "Aucune preuve d'échec : étape proposée pour compléter les mesures.",
    why: "Pourquoi agir ?", how: "Comment agir, en 3 étapes", verify: "Comment vérifier ?",
    observed: "Constat observé", conditional: "Étape conditionnelle", readDetails: "Afficher les étapes et la preuve",
    source: "Voir la page source", raw: "EXTRAIT OBSERVÉ — PAS UNE CAPTURE D'ÉCRAN", proposed: "CORRECTION À EXAMINER — NON APPLIQUÉE",
    notMeasured: "Non mesuré", approve: "Aucune modification ni connexion privée ne sera effectuée sans accord.",
    copyAction: "Copier cette fiche", copiedAction: "Fiche copiée", copyFailure: "Copie indisponible",
    signIn: "Activer ce suivi dans la console", method: "Méthode", disclaimer: "Une seule lecture HTTP et des contrôles déterministes. Aucun moteur IA, compte CRM ou backlink entrant n'a été interrogé ; aucune évolution avant/après n'est affirmée.",
    effortLow: "Faible", effortMedium: "Modéré", effortHigh: "Élevé", ownerContent: "Éditorial", ownerTechnical: "Technique", ownerMarketing: "Marketing", ownerAnalytics: "Data / CRM",
    critical: "Critique", high: "Haute", medium: "Moyenne", low: "Basse",
    generalVerify: "Relancez le même diagnostic sur la même URL et comparez le contrôle ; conservez la date et la méthode.",
    generalApprove: "Faites relire le changement par le responsable du site avant publication.",
  },
  en: {
    eyebrow: "FREE 360° DIAGNOSTIC", title: "Your visibility, made understandable",
    subtitle: "One public page analysed. Empty metrics mean a source must be connected, not a detected failure.",
    url: "Source page", date: "Observed on", scope: "Scope: this URL, not the entire website",
    coverage: "Coverage", measured: "Checks performed", partial: "Partially observed", unknown: "Not measured",
    checks: "checks reviewed", attention: "to review", profiles: "profile links found",
    score: "GEO v1 readiness score", scoreMissing: "No defensible public score",
    seoNote: "HTML checks on this page; no overall SEO score is calculated.",
    geoNote: "GEO v1 readiness only, not GEO v2 or observed citations.",
    aiNote: "Page readiness only; no AI engine was queried.",
    crmNote: "Conversions and revenue require an authorised connection.",
    socialNote: "Outbound/declared profile links only; inbound links not measured.",
    top: "Top 3 priorities to review", seePlan: "View the full action plan", next: "Connection step",
    print: "Print / save as PDF", printing: "Your browser can save an A4 PDF.",
    planEyebrow: "360° ACTION PLAN", planTitle: "A plan you can hand off and verify",
    planIntro: "Filter by channel. Every card distinguishes a proven observation from a next step requiring your own data.",
    all: "All", priority: "Priority", effort: "Effort", risk: "Risk", owner: "Owner", proof: "Evidence", noProof: "No failure observed: this step would complete the measurement.",
    why: "Why does this matter?", how: "How to act in 3 steps", verify: "How to verify",
    observed: "Observed finding", conditional: "Conditional next step", readDetails: "View instructions and evidence",
    source: "Open source page", raw: "OBSERVED EXCERPT — NOT A SCREENSHOT", proposed: "PROPOSED CHANGE — NOT APPLIED",
    notMeasured: "Not measured", approve: "No website change or private connection happens without your approval.",
    copyAction: "Copy this action", copiedAction: "Action copied", copyFailure: "Copy unavailable",
    signIn: "Track this in your workspace", method: "Method", disclaimer: "One public HTTP read and deterministic checks. No AI engine, CRM account or inbound backlink was queried, and no before/after gain is claimed.",
    effortLow: "Low", effortMedium: "Moderate", effortHigh: "High", ownerContent: "Content", ownerTechnical: "Technical", ownerMarketing: "Marketing", ownerAnalytics: "Data / CRM",
    critical: "Critical", high: "High", medium: "Medium", low: "Low",
    generalVerify: "Run the same diagnostic on the same URL again and compare the check, keeping the date and method.",
    generalApprove: "Have the website owner review the change before it is published.",
  },
};

const PILLARS = [
  { id: "seo", symbol: "⌕", fr: "SEO", en: "SEO" },
  { id: "geo", symbol: "◇", fr: "GEO", en: "GEO" },
  { id: "ai", symbol: "✦", fr: "Moteurs IA", en: "AI engines" },
  { id: "crm", symbol: "◎", fr: "CRM", en: "CRM" },
  { id: "social", symbol: "↗", fr: "Réseaux sociaux", en: "Social" },
];

/* Editorial instructions are reviewed suggestions, never mutations. */
const GUIDES = {
  title: {
    fr: ["Clarifier le titre de la page", "Le titre visible dans le HTML peut être incomplet ou peu explicite pour le visiteur et les moteurs.", "Décrivez le sujet principal dans une phrase concise.", "Réécrivez la balise <title> de cette URL, sans bourrage de mots-clés.", "Demandez une validation éditoriale avant publication.", "Vérifiez la balise <title> dans la nouvelle réponse HTML."],
    en: ["Clarify the page title", "The observed HTML title may not describe this page clearly to visitors and crawlers.", "Summarise the page's main subject in one concise sentence.", "Update this URL's <title> tag without keyword stuffing.", "Request editorial approval before publishing.", "Check the <title> tag in the new HTML response."],
  },
  description: {
    fr: ["Expliquer la proposition de valeur", "Une description incomplète peut rendre l'extrait de recherche moins utile.", "Décrivez clairement la promesse de cette page.", "Ajoutez une meta description fidèle au contenu.", "Faites valider le ton et la traduction.", "Vérifiez sa présence dans le HTML après publication."],
    en: ["Explain the page's value", "An incomplete description may produce a less useful search snippet.", "Describe the page's offer in plain language.", "Add a meta description supported by the content.", "Review copy and translation before publishing.", "Check the description in the HTML response."],
  },
  canonical: {
    fr: ["Vérifier l'adresse de référence", "La canonical observée manque ou renvoie ailleurs ; cela demande une décision technique.", "Confirmez l'URL que vous souhaitez indexer.", "Vérifiez redirections et pages équivalentes avec votre développeur.", "Corrigez rel=canonical seulement après validation.", "Relisez la canonical dans le HTML et sa cible HTTP."],
    en: ["Verify the reference URL", "The observed canonical is missing or points elsewhere and needs technical review.", "Confirm which URL should be indexed.", "Review redirects and equivalent pages with a developer.", "Change rel=canonical only after approval.", "Recheck the canonical tag and its HTTP target."],
  },
  robots: {
    fr: ["Vérifier la directive d'indexation", "Une directive noindex a été détectée ; elle peut être intentionnelle.", "Demandez si cette page doit être publique dans la recherche.", "Contrôlez les règles de publication et les environnements.", "Retirez noindex uniquement avec l'accord du propriétaire.", "Confirmez l'absence de noindex dans le HTML reçu."],
    en: ["Review the indexing directive", "A noindex directive was detected; it may be intentional.", "Ask whether this page should appear in search.", "Check publication rules and environment settings.", "Remove noindex only with owner approval.", "Confirm the received HTML no longer carries noindex."],
  },
  x_robots: {
    fr: ["Contrôler l'en-tête X-Robots-Tag", "Le serveur peut bloquer l'indexation indépendamment de la page.", "Confirmez l'objectif d'indexation.", "Demandez au webmaster d'inspecter les en-têtes HTTP.", "Modifiez la règle seulement après validation.", "Relisez X-Robots-Tag dans la réponse HTTP."],
    en: ["Review the X-Robots-Tag header", "The server may block indexing regardless of the page markup.", "Confirm the page's indexing goal.", "Ask the webmaster to inspect the HTTP response headers.", "Change the rule only after approval.", "Recheck X-Robots-Tag in the HTTP response."],
  },
  lang: {
    fr: ["Déclarer la langue principale", "La langue du document n'est pas explicitement déclarée.", "Identifiez la langue réellement utilisée par cette page.", "Ajoutez la valeur correcte à l'attribut lang de <html>.", "Vérifiez les variantes traduites avec l'équipe éditoriale.", "Relisez <html lang> après publication."],
    en: ["Declare the main page language", "The document language is not explicitly declared.", "Identify the language actually used on this page.", "Add the correct lang attribute on <html>.", "Review translated variants with the content team.", "Check <html lang> after publishing."],
  },
  open_graph: {
    fr: ["Soigner l'aperçu partagé", "Les métadonnées visibles peuvent donner un aperçu social incomplet.", "Choisissez un titre cohérent avec la page.", "Préparez une image de partage appropriée et autorisée.", "Complétez les balises Open Graph après revue.", "Vérifiez le rendu d'un lien partagé avec l'outil de la plateforme."],
    en: ["Improve shared-link previews", "The observed metadata may produce an incomplete social preview.", "Choose a title consistent with the page.", "Prepare a licensed sharing image with appropriate dimensions.", "Review and update Open Graph tags.", "Use the platform's preview inspector to verify the result."],
  },
  h1: {
    fr: ["Clarifier le titre principal", "La structure H1 de cette page mérite un examen éditorial.", "Identifiez l'idée essentielle en une phrase.", "Organisez le titre principal et les sections sans répétition inutile.", "Vérifiez l'accessibilité du plan de titres.", "Contrôlez la nouvelle structure H1/H2 du HTML."],
    en: ["Clarify the main heading", "This page's H1 structure deserves editorial review.", "State the main purpose in one sentence.", "Organise the heading and sections without needless repetition.", "Review the heading outline for accessibility.", "Check the updated H1/H2 HTML structure."],
  },
  outline: {
    fr: ["Structurer les réponses par sujet", "Les sous-titres observés donnent peu de repères ; le besoin dépend du contenu.", "Listez les questions réellement traitées sur la page.", "Créez des sous-sections utiles, pas un quota de titres.", "Faites valider le plan éditorial.", "Vérifiez la logique H1/H2/H3 à la relecture."],
    en: ["Organise answers by topic", "The observed subheadings offer few signposts; the need depends on the content.", "List the questions this page actually answers.", "Create useful sections, not a heading quota.", "Get the outline approved by an editor.", "Check the H1/H2/H3 hierarchy after publishing."],
  },
  content_review: {
    fr: ["Vérifier la valeur du contenu", "Un compteur de mots n'est pas une preuve de mauvaise qualité ; vérifiez la réponse à l'intention.", "Identifiez l'objectif du visiteur.", "Ajoutez seulement les informations vérifiées qui manquent.", "Relisez les exemples et les sources.", "Vérifiez que la page répond mieux à la question, au-delà du nombre de mots."],
    en: ["Review content usefulness", "Word count alone does not prove poor quality; review whether the intent is served.", "Identify the visitor's goal.", "Add only relevant, verified missing information.", "Review examples and citations.", "Confirm the page answers the question, not merely that it is longer."],
  },
  internal_links: {
    fr: ["Relier les pages vraiment pertinentes", "Peu de liens internes ont été repérés sur la page lue, pas dans tout le site.", "Identifiez une page complémentaire existante.", "Vérifiez la pertinence de l'ancre et de la destination.", "Soumettez le lien à l'équipe éditoriale.", "Contrôlez le lien dans le nouveau HTML et sa destination."],
    en: ["Connect genuinely related pages", "Few internal links were observed on this page, not necessarily across the site.", "Find an existing complementary page.", "Check relevance of anchor text and destination.", "Ask the content owner to approve the link.", "Verify the new HTML link and the destination."],
  },
  image_alt: {
    fr: ["Décrire les images utiles", "Des images sans texte alternatif ont été repérées ; certaines peuvent être purement décoratives.", "Distinguez les images informatives des éléments décoratifs.", "Rédigez un alt descriptif pour chaque image informative.", "Laissez un alt vide pour les décors, après vérification.", "Vérifiez les attributs alt dans le HTML et au lecteur d'écran."],
    en: ["Describe meaningful images", "Images without alt text were found; some may be decorative.", "Separate informative imagery from decoration.", "Write descriptive alt text for informative images.", "Use empty alt for decoration after review.", "Check alt attributes in HTML and with a screen reader."],
  },
  jsonld: {
    fr: ["Vérifier les données structurées", "Aucun bloc JSON-LD exploitable n'a été repéré ; il peut exister un autre balisage.", "Identifiez les informations que la page présente réellement.", "Choisissez un type schema.org approprié sans inventer d'attributs.", "Faites valider le code avant publication.", "Testez le JSON-LD et sa cohérence avec la page."],
    en: ["Review structured data", "No usable JSON-LD block was found; other markup may exist.", "Identify information actually present on the page.", "Choose an appropriate schema.org type without inventing claims.", "Review the markup before publishing.", "Validate JSON-LD and its consistency with the page."],
  },
  schema: {
    fr: ["Déclarer des entités vérifiables", "La page ne présente pas de type Schema détectable dans ce périmètre.", "Identifiez l'organisation, les produits ou contenus réellement décrits.", "Vérifiez les identifiants officiels et les URL de référence.", "Ajoutez seulement les entités justifiées et approuvées.", "Validez le balisage et les liens sources."],
    en: ["Declare verifiable entities", "No schema type was detected within this page's scope.", "Identify organisations, products or articles actually described.", "Verify official identities and reference URLs.", "Add only supported, approved entities.", "Validate markup and source links."],
  },
  ai_measurement: {
    fr: ["Mesurer les réponses des moteurs IA", "Le score GEO v1 indique une préparation, pas des citations observées dans ChatGPT, Claude ou Gemini.", "Choisissez des questions clients représentatives.", "Connectez ou autorisez explicitement les moteurs et les comptes utiles.", "Enregistrez dates, requêtes, réponses et preuves sans extrapoler.", "Comparez les résultats à périmètre identique, avec attribution claire."],
    en: ["Measure actual AI engine answers", "GEO v1 readiness is not observed citations in ChatGPT, Claude or Gemini.", "Choose representative customer questions.", "Explicitly authorise the relevant engines and accounts.", "Record queries, answers, dates and evidence without extrapolating.", "Compare like-for-like observations with clear attribution."],
  },
  crm_measurement: {
    fr: ["Relier les actions aux conversions", "Une lecture HTML publique ne donne ni prospects, ni ventes, ni revenus fiables.", "Définissez ce qu'est une conversion ou un contact utile.", "Connectez une propriété GA4/CRM avec consentement et droits adaptés.", "Vérifiez les événements et leur provenance sans exposer de données personnelles.", "Contrôlez le rapprochement dans un rapport tenant isolé."],
    en: ["Connect actions to conversions", "A public HTML read cannot establish leads, sales or reliable revenue.", "Define a meaningful conversion or contact event.", "Connect GA4/CRM with consent and scoped permissions.", "Validate event origin without exposing personal data.", "Review attribution inside the isolated customer workspace."],
  },
  social_presence: {
    fr: ["Vérifier la présence sociale", "Les liens sortants repérés sur cette page ne permettent pas de conclure sur les backlinks, l'engagement ou la réputation.", "Confirmez les profils officiels de la marque.", "Reliez les profils pertinents depuis votre site après validation.", "Connectez une source autorisée pour analyser les signaux entrants.", "Contrôlez les liens sur la page puis les mesures de provenance dans l'espace client."],
    en: ["Verify social presence", "Outbound links on this page cannot prove backlinks, engagement or reputation.", "Confirm the brand's official profiles.", "Add relevant verified profile links with approval.", "Connect an authorised source to inspect inbound signals.", "Check page links and then referral measures in the customer workspace."],
  },
};

const PRIO = { critical: 0, high: 1, medium: 2, low: 3 };
let removePrintHandlers = null;
function el(tag, className = "", value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = String(value);
  return node;
}
const span = (cls, value) => el("span", cls, value);
const labelFor = (id, lang) => PILLARS.find(item => item.id === id)?.[lang] || id;
function safeLink(url, label, cls = "") {
  const safe = normalisePublicUrl(url);
  if (!safe) return span(cls, label || "—");
  const link = el("a", cls, label);
  link.href = safe; link.target = "_blank"; link.rel = "noopener noreferrer";
  return link;
}
function guide(action, lang) {
  if (action.pillar === "geo" && action.checkId) {
    const info = explainRecommendation({ checkId: action.checkId, status: "fail", priority: action.priority, points: action.points || 0 }, lang);
    return { title: info.title, why: info.effect, steps: [info.steps, UI[lang].generalApprove, UI[lang].generalVerify], verify: UI[lang].generalVerify };
  }
  const values = GUIDES[action.code]?.[lang];
  if (!values) return null;
  return { title: values[0], why: values[1], steps: values.slice(2, 5), verify: values[5] };
}
function pillLabel(pillar, lang, copy) {
  if (pillar.id === "geo" && typeof pillar.score === "number") return `${pillar.score}/100`;
  if (pillar.id === "seo") return `${pillar.observedChecks ?? "—"} ${copy.checks}`;
  if (pillar.id === "social") return `${pillar.observedCount ?? "—"} ${copy.profiles}`;
  return copy.notMeasured;
}
function pillarCard(pillar, lang, copy) {
  const item = PILLARS.find(p => p.id === pillar.id);
  if (!item) return null;
  const card = el("article", `report360-pillar report360-pillar-${pillar.id}`);
  const head = el("div", "report360-pillar-head");
  const glyph = span("report360-glyph", item.symbol); glyph.setAttribute("aria-hidden", "true");
  head.append(glyph, el("h3", "", item[lang])); card.append(head);
  card.append(el("strong", "report360-pillar-value", pillLabel(pillar, lang, copy)));
  if (pillar.id === "seo" && typeof pillar.observedChecks === "number" && pillar.observedChecks > 0) {
    const value = Math.max(0, Math.min(100, 100 * (pillar.observedChecks - pillar.needsAttention) / pillar.observedChecks));
    const bar = el("div", "report360-bar"); bar.setAttribute("role", "progressbar"); bar.setAttribute("aria-valuemin", "0"); bar.setAttribute("aria-valuemax", "100"); bar.setAttribute("aria-valuenow", String(Math.round(value)));
    bar.setAttribute("aria-label", `${pillar.observedChecks - pillar.needsAttention} / ${pillar.observedChecks} ${copy.measured.toLowerCase()}`);
    const fill = el("span"); fill.style.width = `${value}%`; bar.append(fill); card.append(bar);
  } else if (pillar.id === "geo" && typeof pillar.score === "number") {
    const bar = el("div", "report360-bar"); bar.setAttribute("role", "progressbar"); bar.setAttribute("aria-valuemin", "0"); bar.setAttribute("aria-valuemax", "100"); bar.setAttribute("aria-valuenow", String(pillar.score)); bar.setAttribute("aria-label", copy.score);
    const fill = el("span"); fill.style.width = `${Math.max(0, Math.min(100, pillar.score))}%`; bar.append(fill); card.append(bar);
  } else card.append(el("div", "report360-bar report360-bar-unknown", "··········"));
  const coverage = pillar.coverage === "measured" ? copy.measured : pillar.coverage === "partial" ? copy.partial : copy.unknown;
  const note = copy[`${pillar.id}Note`];
  card.append(span(`report360-coverage report360-coverage-${pillar.coverage}`, coverage), el("p", "", note));
  if (pillar.id === "seo" || pillar.id === "geo") card.append(el("p", "report360-fact", `${pillar.needsAttention ?? "—"} ${copy.attention}`));
  return card;
}
function actionCard(action, lang, copy, idx) {
  const info = guide(action, lang);
  if (!info) return null;
  const card = el("article", `report360-action report360-action-${action.pillar}`);
  card.dataset.pillar = action.pillar;
  const header = el("div", "report360-action-header");
  const number = span("report360-action-number", String(idx + 1).padStart(2, "0"));
  const heading = el("div", "report360-action-heading");
  heading.append(el("p", "report360-action-category", `${labelFor(action.pillar, lang)} · ${action.kind === "observed_fix" ? copy.observed : copy.conditional}`), el("h3", "", info.title));
  header.append(number, heading); card.append(header);
  const tags = el("div", "report360-tags");
  tags.append(span(`report360-chip report360-priority-${action.priority}`, `${copy.priority} : ${copy[action.priority]}`));
  tags.append(span("report360-chip", `${copy.effort} : ${copy[`effort${action.effort[0].toUpperCase()}${action.effort.slice(1)}`]}`));
  tags.append(span("report360-chip", `${copy.risk} : ${copy[`effort${(action.risk || "medium")[0].toUpperCase()}${(action.risk || "medium").slice(1)}`]}`));
  tags.append(span("report360-chip", `${copy.owner} : ${copy[`owner${action.owner[0].toUpperCase()}${action.owner.slice(1)}`]}`));
  card.append(tags, el("p", "report360-action-why", info.why));
  const details = el("details", "report360-detail");
  details.append(el("summary", "", copy.readDetails));
  const grid = el("div", "report360-detail-grid");
  const proof = el("div", "report360-proof");
  proof.append(el("h4", "", copy.proof));
  if (action.proof) {
    proof.append(el("p", "report360-proof-label", copy.raw));
    proof.append(el("strong", "", action.proof.label), el("code", "report360-raw", action.proof.value || "—"));
    if (action.proof.note) proof.append(el("p", "report360-proof-note", action.proof.note));
    proof.append(safeLink(action.proof.sourceUrl, copy.source, "report360-source"), el("small", "", `${copy.date} ${formatDate(action.proof.observedAt, lang)}`));
  } else proof.append(el("p", "report360-no-proof", copy.noProof));
  const tutorial = el("div", "report360-tutorial");
  tutorial.append(el("p", "report360-proof-label", copy.proposed), el("h4", "", copy.how));
  const steps = el("ol", "report360-steps"); for (const step of info.steps) steps.append(el("li", "", step));
  tutorial.append(steps, el("h4", "", copy.verify), el("p", "", info.verify));
  grid.append(proof, tutorial); details.append(grid);
  const copyButton = el("button", "report360-copy", copy.copyAction); copyButton.type = "button";
  copyButton.onclick = async () => {
    try {
      await navigator.clipboard.writeText([
        `${labelFor(action.pillar, lang)} · ${info.title}`, info.why,
        ...info.steps.map((step, i) => `${i + 1}. ${step}`), `${copy.verify}: ${info.verify}`,
        action.proof ? `${copy.proof}: ${action.proof.label}: ${action.proof.value} (${action.proof.sourceUrl}; ${action.proof.observedAt})` : copy.noProof,
      ].join("\n"));
      copyButton.textContent = copy.copiedAction;
    } catch { copyButton.textContent = copy.copyFailure; }
  };
  details.append(copyButton);
  card.append(details);
  return card;
}
function formatDate(value, lang) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(lang === "fr" ? "fr-FR" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/** Renders the approved overview, action list and proof-backed tutorial. */
export function renderFreeReport360(report, language = "fr") {
  if (report?.schemaVersion !== 1 || !Array.isArray(report.pillars) || !Array.isArray(report.actions)) return null;
  const lang = language === "en" ? "en" : "fr", copy = UI[lang];
  const section = el("section", "free-report360"); section.id = "c-free-report360";
  const lead = el("header", "report360-lead");
  lead.append(el("p", "report360-eyebrow", copy.eyebrow), el("h2", "", copy.title), el("p", "report360-subtitle", copy.subtitle));
  const meta = el("div", "report360-meta");
  meta.append(el("span", "", `${copy.date} ${formatDate(report.observedAt, lang)}`), el("span", "", copy.scope));
  meta.append(safeLink(report.sourceUrl, report.sourceUrl, "report360-source")); lead.append(meta); section.append(lead);

  const pillars = el("div", "report360-pillars");
  for (const p of PILLARS) { const model = report.pillars.find(item => item.id === p.id); if (model) { const card = pillarCard(model, lang, copy); if (card) pillars.append(card); } }
  section.append(pillars);
  const observed = report.actions.filter(a => a.kind === "observed_fix").sort((a, b) => (PRIO[a.priority] ?? 5) - (PRIO[b.priority] ?? 5));
  const highlights = observed.length ? observed.slice(0, 3) : report.actions.slice(0, 3);
  const highlightBox = el("div", "report360-highlights");
  highlightBox.append(el("h3", "", copy.top));
  const highlightList = el("ol", "report360-highlight-list");
  for (const a of highlights) { const info = guide(a, lang); if (info) highlightList.append(el("li", "", `${labelFor(a.pillar, lang)} · ${info.title}`)); }
  highlightBox.append(highlightList); section.append(highlightBox);

  const plan = el("section", "report360-plan"); plan.id = "c-report360-plan";
  plan.append(el("p", "report360-eyebrow", copy.planEyebrow), el("h2", "", copy.planTitle), el("p", "report360-subtitle", copy.planIntro));
  const controls = el("div", "report360-controls"); controls.setAttribute("role", "group"); controls.setAttribute("aria-label", copy.planTitle);
  const cards = el("div", "report360-actions");
  const sorted = report.actions.slice().sort((a, b) => (PRIO[a.priority] ?? 5) - (PRIO[b.priority] ?? 5));
  for (const [index, action] of sorted.entries()) { const card = actionCard(action, lang, copy, index); if (card) cards.append(card); }
  function filterBy(selected) {
    for (const button of controls.children) button.setAttribute("aria-pressed", String(button.dataset.pillar === selected));
    for (const card of cards.children) card.hidden = selected !== "all" && card.dataset.pillar !== selected;
  }
  for (const id of ["all", ...PILLARS.map(p => p.id)]) {
    const button = el("button", "report360-filter", id === "all" ? copy.all : labelFor(id, lang));
    button.type = "button"; button.dataset.pillar = id;
    button.onclick = () => filterBy(id); controls.append(button);
  }
  filterBy("all"); plan.append(controls, cards); section.append(plan);

  const footer = el("footer", "report360-footer");
  let printState = null;
  const expandForPrint = () => {
    if (printState) return;
    const all = [...section.querySelectorAll("details")];
    printState = all.map(d => [d, d.open]);
    all.forEach(d => { d.open = true; });
  };
  const restoreAfterPrint = () => {
    if (!printState) return;
    for (const [details, wasOpen] of printState) details.open = wasOpen;
    printState = null;
  };
  if (removePrintHandlers) removePrintHandlers();
  const browserWindow = window;
  browserWindow.addEventListener("beforeprint", expandForPrint);
  browserWindow.addEventListener("afterprint", restoreAfterPrint);
  removePrintHandlers = () => {
    browserWindow.removeEventListener("beforeprint", expandForPrint);
    browserWindow.removeEventListener("afterprint", restoreAfterPrint);
  };
  const printButton = el("button", "report360-print", copy.print); printButton.type = "button";
  printButton.onclick = () => {
    expandForPrint();
    window.print();
  };
  footer.append(printButton, el("span", "", copy.printing));
  const cta = el("a", "report360-workspace", copy.signIn); cta.href = "#c-login-form"; footer.append(cta);
  footer.append(el("p", "report360-warning", copy.approve), el("p", "report360-method", `${copy.method} : ${report.method} · ${copy.disclaimer}`));
  section.append(footer);
  return section;
}
