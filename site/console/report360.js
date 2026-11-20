/** Five-pillar public report. All target-originated text is inserted as textContent. */
import { explainRecommendation, normalisePublicUrl } from "./public-read-model.js";
import { completionStats, renderCategoryIcon, renderCompletionDonut } from "./completion-donut.js";

const UI = {
  fr: {
    eyebrow: "DIAGNOSTIC GRATUIT · 360°", title: "Votre visibilité, expliquée simplement",
    subtitle: "Une seule page publique analysée. Les espaces vides sont des mesures à connecter, pas des erreurs détectées.",
    url: "Page source", date: "Relevé le", scope: "Périmètre : cette URL, pas l'ensemble du site",
    coverage: "Couverture", measured: "Contrôles effectués", partial: "Partiellement observé", unknown: "Non mesuré",
    checks: "contrôles vérifiés", attention: "à examiner", profiles: "liens de profils repérés",
    score: "Grille GEO v2 · 42 contrôles", scoreMissing: "Score v2 non publié · preuves incomplètes",
    seoNote: "Contrôles HTML de cette page ; aucun score SEO global calculé.",
    geoNote: "42 contrôles GEO v2 ; seuls les constats sourcés sont évalués. Aucun score public sans couverture complète et accord du propriétaire.",
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
    v2Checks: "contrôles observés / 42", v2Grid: "Grille GEO v2 · preuves et applicabilité",
    v2Intro: "Chaque contrôle est soit observé, soit inconnu, soit non applicable avec justification. Un inconnu ne vaut jamais zéro.",
    v2Measured: "Observé", v2Unknown: "Inconnu", v2Excluded: "Non applicable", v2Status: "Statut",
    v2Summary: "Contrôles GEO v2", v2Completion: "Contrôles observés", v2NoScore: "Aucun score v2 publiable à ce stade",
    visualTitle: "La page, illustrée à partir des éléments lus", visualLabel: "APERÇU RECONSTITUÉ · PAS UNE CAPTURE D’ÉCRAN",
    visualNote: "Titre, description et titres de section proviennent de la réponse HTML. La mise en page d'origine n'a pas été capturée. Pour une capture authentique, vérifiez la propriété du domaine et autorisez un rendu isolé.",
    visualSnippet: "Aperçu du résultat de recherche", visualOutline: "Titres observés sur la page", visualMissing: "Non trouvé dans le HTML",
    connectionsTitle: "Compléter les mesures dans votre espace sécurisé", connectionsIntro: "Ces données ne sont pas déductibles d'une lecture publique. Activez uniquement les sources qui vous appartiennent.",
    connectionOpen: "Ouvrir le module", connectionAi: "Réponses réelles des moteurs IA", connectionCrm: "Conversions et parcours CRM", connectionSocial: "Réseaux sociaux et liens entrants",
    connectionAiNote: "Compte API autorisé ou import de réponses horodatées. Une requête moteur peut être facturée ; validation requise.",
    connectionCrmNote: "Événements GA4/CRM et identités explicites, avec accès cloisonné par client et consentement.",
    connectionSocialNote: "Profils déclarés, analytics autorisées et sources de liens entrants indépendantes à fournir ou connecter.",
  },
  en: {
    eyebrow: "FREE 360° DIAGNOSTIC", title: "Your visibility, made understandable",
    subtitle: "One public page analysed. Empty metrics mean a source must be connected, not a detected failure.",
    url: "Source page", date: "Observed on", scope: "Scope: this URL, not the entire website",
    coverage: "Coverage", measured: "Checks performed", partial: "Partially observed", unknown: "Not measured",
    checks: "checks reviewed", attention: "to review", profiles: "profile links found",
    score: "GEO v2 · 42-control grid", scoreMissing: "V2 score unpublished · incomplete evidence",
    seoNote: "HTML checks on this page; no overall SEO score is calculated.",
    geoNote: "42 GEO v2 controls; only source-backed findings are evaluated. No public score without full coverage and owner consent.",
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
    v2Checks: "observed / 42 controls", v2Grid: "GEO v2 grid · proof and applicability",
    v2Intro: "Every check is observed, unknown or not applicable with evidence. Unknown never means zero.",
    v2Measured: "Observed", v2Unknown: "Unknown", v2Excluded: "Not applicable", v2Status: "Status",
    v2Summary: "GEO v2 controls", v2Completion: "Checks observed", v2NoScore: "No publishable v2 score yet",
    visualTitle: "Your page, illustrated using observed HTML", visualLabel: "RECONSTRUCTED PREVIEW · NOT A SCREENSHOT",
    visualNote: "The title, description and headings come from the HTML response. The original visual layout was not captured. Verify domain ownership and authorise isolated rendering for an authentic screenshot.",
    visualSnippet: "Search-result preview", visualOutline: "Headings observed on the page", visualMissing: "Not found in HTML",
    connectionsTitle: "Complete measurement in your secure workspace", connectionsIntro: "These sources cannot be inferred from a public page. Activate only sources you own or are authorised to access.",
    connectionOpen: "Open module", connectionAi: "Real AI-engine answers", connectionCrm: "CRM conversions and journeys", connectionSocial: "Social networks and inbound links",
    connectionAiNote: "Authorised API account or dated answer import. A model request may incur costs and requires confirmation.",
    connectionCrmNote: "GA4/CRM events and explicitly linked identities, with tenant isolation and consent.",
    connectionSocialNote: "Declared profiles, authorised analytics and independent inbound-link sources to supply or connect.",
  },
};

const PILLARS = [
  { id: "seo", symbol: "⌕", fr: "SEO", en: "SEO" },
  { id: "geo", symbol: "◇", fr: "GEO", en: "GEO" },
  { id: "ai", symbol: "✦", fr: "Moteurs IA", en: "AI engines" },
  { id: "crm", symbol: "◎", fr: "CRM", en: "CRM" },
  { id: "social", symbol: "↗", fr: "Réseaux sociaux", en: "Social" },
];

const V2_CATEGORY = {
  robots: ["Accès des robots", "Crawler access"], llms: ["Documentation IA", "AI documentation"],
  jsonld: ["Données structurées", "Structured data"], meta: ["Métadonnées", "Metadata"],
  content: ["Contenu", "Content"], brand: ["Identité de marque", "Brand identity"],
  discovery: ["Découverte IA", "AI discovery"], rendering: ["Rendu du navigateur", "Browser rendering"],
};
const V2_TITLES_FR = {
  R01: "Accès au fichier robots.txt", R02: "Autorisation des robots des moteurs IA", R03: "Absence de blocage contradictoire", R04: "Sitemap déclaré et accessible", R05: "Cohérence des règles par robot",
  L01: "Accès au fichier llms.txt", L02: "Identification de l'activité", L03: "Résumé clair pour les IA", L04: "Structure et liens de documentation", L05: "Documentation de plus de 1 000 mots", L06: "Documentation approfondie et structurée",
  J01: "JSON-LD lisible", J02: "Entité entreprise déclarée", J03: "Identifiants des entités cohérents", J04: "Liens entre site et pages", J05: "Données adaptées au contenu", J06: "Cohérence entre texte et données structurées",
  M01: "Titre descriptif", M02: "Description utile", M03: "Adresse canonique cohérente", M04: "Aperçu Open Graph", M05: "Directives d'indexation cohérentes",
  C01: "Proposition de valeur identifiable", C02: "Réponses directes aux questions", C03: "Titres de page structurés", C04: "Faits vérifiables", C05: "Sources pertinentes", C06: "Passages faciles à extraire", C07: "Dates de mise à jour vérifiables", C08: "Liens internes contextualisés",
  B01: "Identité de marque cohérente", B02: "Entreprise et coordonnées identifiables", B03: "Profils sociaux déclarés cohérents", B04: "Références externes vérifiées", B05: "Expertise et autorité documentées",
  D01: "Ressources de découverte IA accessibles", D02: "Pages importantes présentes dans le sitemap", D03: "Documentation facilement accessible",
  P01: "Contenu essentiel présent dans le HTML", P02: "Cohérence entre HTML et rendu", P03: "Accès au contenu pour un crawler", P04: "Rendu stable sans blocage",
};
const V2_GUIDES = {
  R: { fr: ["Contrôlez la règle de crawl pour cette URL et chaque robot concerné.", "Corrigez le fichier robots.txt ou la directive uniquement après accord du propriétaire.", "Relancez la lecture des mêmes ressources et vérifiez les statuts HTTP."], en: ["Inspect crawler rules for this exact URL and the relevant agents.", "Change robots.txt or page directives only with owner approval.", "Fetch the same resources again and verify HTTP statuses."] },
  L: { fr: ["Relisez llms.txt et les pages de documentation réellement accessibles.", "Ajoutez des titres, descriptions et liens fidèles au contenu existant.", "Vérifiez les réponses HTTP et les extraits du nouveau fichier."], en: ["Review llms.txt and the documentation pages actually available.", "Add headings, summaries and links that match existing content.", "Verify HTTP responses and excerpts from the updated file."] },
  J: { fr: ["Comparez les propriétés Schema.org aux informations visibles de la page.", "Corrigez uniquement les données vérifiées, en conservant des identifiants cohérents.", "Testez le JSON-LD et relisez les valeurs dans le HTML publié."], en: ["Compare Schema.org properties with visible page facts.", "Update only verified values with coherent identifiers.", "Validate JSON-LD and recheck the published HTML."] },
  M: { fr: ["Identifiez l'élément meta concerné dans le code source.", "Préparez une valeur concise et exacte, puis faites-la valider.", "Récupérez la page et comparez la nouvelle balise au constat."], en: ["Find the relevant metadata in the source.", "Prepare a concise, accurate value and request approval.", "Fetch the page again and compare the tag with this observation."] },
  C: { fr: ["Relisez le passage concerné tel qu'un visiteur le voit.", "Ajoutez des réponses et références utiles sans inventer de faits.", "Vérifiez la structure, les liens et la lisibilité après publication."], en: ["Read the passage as a visitor would.", "Add useful answers and cited sources without fabricating facts.", "Check structure, links and readability after publishing."] },
  B: { fr: ["Confirmez la dénomination et les profils officiels auprès de l'entreprise.", "Alignez les mentions sur la page et les déclarations structurées.", "Contrôlez les liens officiels et les preuves indépendantes après mise à jour."], en: ["Confirm the business identity and official profiles with the owner.", "Align visible information with structured declarations.", "Verify official links and independent proof after the update."] },
  D: { fr: ["Identifiez les ressources d'entrée réellement disponibles.", "Reliez les pages utiles depuis le sitemap et la documentation approuvée.", "Contrôlez les URL, leur contenu et les codes HTTP."], en: ["Identify the entry resources that are actually accessible.", "Link useful pages from the approved sitemap and documentation.", "Validate URLs, content and HTTP statuses."] },
  P: { fr: ["Vérifiez d'abord la propriété du domaine (DNS TXT ou fichier HTTPS).", "Autorisez un rendu Playwright isolé avec limites de ressources.", "Comparez le HTML, le DOM et les journaux du même instantané."], en: ["First verify domain ownership (DNS TXT or HTTPS file).", "Authorise resource-limited isolated Playwright rendering.", "Compare HTML, DOM and logs from the same snapshot."] },
};

const v2Title = (id, fallback, lang) => lang === "fr" ? V2_TITLES_FR[id] || fallback || id : fallback || id;

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
    fr: ["Mesurer les réponses des moteurs IA", "La grille GEO v2 mesure une préparation, pas des citations réellement observées dans ChatGPT, Claude, Gemini, Mistral ou Grok.", "Choisissez des questions clients représentatives.", "Connectez ou autorisez explicitement les moteurs et les comptes utiles.", "Enregistrez dates, requêtes, réponses et preuves sans extrapoler.", "Comparez les résultats à périmètre identique, avec attribution claire."],
    en: ["Measure actual AI engine answers", "GEO v2 readiness is not a record of actual citations in ChatGPT, Claude, Gemini, Mistral or Grok.", "Choose representative customer questions.", "Explicitly authorise the relevant engines and accounts.", "Record queries, answers, dates and evidence without extrapolating.", "Compare like-for-like observations with clear attribution."],
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
  if (action.pillar === "geo" && action.code === "geo_v2_check" && action.checkId) {
    const copy = UI[lang];
    const title = v2Title(action.checkId, action.title, lang);
    const steps = V2_GUIDES[action.checkId[0]]?.[lang] || [copy.generalVerify, copy.generalApprove, copy.generalVerify];
    return {
      title: `GEO v2 ${action.checkId} · ${title}`,
      why: action.proof ? `${copy.proof} : ${action.proof.value}` : copy.noProof,
      steps, verify: copy.generalVerify,
    };
  }
  if (action.pillar === "geo" && action.checkId) {
    const info = explainRecommendation({ checkId: action.checkId, status: "fail", priority: action.priority, points: action.points || 0 }, lang);
    return { title: info.title, why: info.effect, steps: [info.steps, UI[lang].generalApprove, UI[lang].generalVerify], verify: UI[lang].generalVerify };
  }
  const values = GUIDES[action.code]?.[lang];
  if (!values) return null;
  return { title: values[0], why: values[1], steps: values.slice(2, 5), verify: values[5] };
}
function pillLabel(pillar, lang, copy) {
  if (pillar.id === "geo") return `${pillar.observedChecks ?? 0} ${copy.v2Checks}`;
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

/** A styled illustration made only from observed HTML text, never a screenshot. */
function renderSourcePreview(report, lang, copy) {
  const model = report.sourcePreview;
  if (model?.kind !== "observed_html_reconstruction") return null;
  const section = el("section", "report360-visual"); section.id = "c-report360-visual";
  section.append(el("p", "report360-eyebrow", copy.visualLabel), el("h2", "", copy.visualTitle));
  const grid = el("div", "report360-visual-grid");
  const search = el("article", "report360-search-preview");
  search.append(el("h3", "", copy.visualSnippet));
  const browserFrame = el("div", "report360-browser-frame");
  const chrome = el("div", "report360-browser-bar");
  chrome.append(span("report360-browser-dots", "● ● ●"), span("report360-browser-url", report.sourceUrl));
  browserFrame.append(chrome);
  const snippet = el("div", "report360-search-result");
  snippet.append(el("small", "", report.sourceUrl));
  snippet.append(el("strong", "report360-search-title", model.title || copy.visualMissing));
  snippet.append(el("p", "", model.description || copy.visualMissing));
  browserFrame.append(snippet); search.append(browserFrame);
  const outline = el("article", "report360-page-outline");
  outline.append(el("h3", "", copy.visualOutline));
  const h1 = el("div", "report360-outline-h1");
  h1.append(span("report360-outline-tag", "H1"), el("strong", "", model.heading || copy.visualMissing)); outline.append(h1);
  for (const heading of (Array.isArray(model.subheadings) ? model.subheadings : []).slice(0, 4)) {
    const row = el("div", "report360-outline-h2");
    row.append(span("report360-outline-tag", "H2"), span("", heading)); outline.append(row);
  }
  grid.append(search, outline); section.append(grid);
  section.append(el("p", "report360-visual-disclaimer", copy.visualNote));
  section.append(safeLink(report.sourceUrl, copy.source, "report360-source"));
  return section;
}

function renderV2Grid(report, lang, copy) {
  const v2 = report.geoV2;
  if (!v2 || !Array.isArray(v2.controls)) return null;
  const section = el("section", "report360-v2-grid"); section.id = "c-report360-v2-grid";
  section.append(el("p", "report360-eyebrow", `GEO ${v2.gridVersion || "v2"}`), el("h2", "", copy.v2Grid), el("p", "report360-subtitle", copy.v2Intro));
  const measured = v2.controls.filter(c => c.status === "measured").length;
  const unknown = v2.controls.filter(c => c.status === "unknown").length;
  const excluded = v2.controls.filter(c => c.status === "not_applicable").length;
  const summary = el("div", "report360-v2-summary");
  const overall = el("div", "report360-v2-stat report360-v2-overall");
  overall.append(renderCompletionDonut(completionStats(v2.controls), lang, { size: "lg" }), el("span", "", copy.v2Completion));
  summary.append(overall);
  for (const [value, label, key] of [[measured, copy.v2Measured, "measured"], [unknown, copy.v2Unknown, "unknown"], [excluded, copy.v2Excluded, "not_applicable"]]) {
    const tile = el("div", `report360-v2-stat report360-v2-stat-${key}`);
    const swatch = span("report360-v2-swatch"); swatch.setAttribute("aria-hidden", "true");
    tile.append(swatch, el("strong", "", value), el("span", "", label)); summary.append(tile);
  }
  section.append(summary, el("p", "report360-v2-no-score", copy.v2NoScore));
  const buckets = el("div", "report360-v2-buckets");
  // Known categories keep their editorial order; any other key returned by the
  // API is still shown (with the fallback pictogram) instead of being dropped.
  const extraCategories = [...new Set(v2.controls.map(c => c.category))].filter(k => typeof k === "string" && k && !Object.hasOwn(V2_CATEGORY, k));
  for (const category of [...Object.keys(V2_CATEGORY), ...extraCategories]) {
    const labels = V2_CATEGORY[category] || [category, category];
    const group = v2.controls.filter(c => c.category === category);
    const stats = completionStats(group);
    const detail = el("details", "report360-v2-category"); detail.dataset.category = category;
    const summaryLine = el("summary");
    const name = span("report360-v2-category-name");
    name.append(renderCategoryIcon(category), span("", labels[lang === "fr" ? 0 : 1]));
    const progress = span("report360-v2-category-progress");
    progress.append(renderCompletionDonut(stats, lang), span("report360-v2-category-count", `${stats.observed}/${stats.total} ${copy.v2Measured.toLowerCase()}`));
    summaryLine.append(name, progress);
    detail.append(summaryLine);
    const list = el("ol", "report360-v2-list");
    for (const control of group) {
      const item = el("li", `report360-v2-row report360-v2-${control.status}`);
      const top = el("div", "report360-v2-row-head");
      top.append(span("report360-v2-code", control.controlId), el("strong", "", v2Title(control.controlId, control.title, lang)));
      const status = control.status === "measured"
        ? control.outcome === "review" ? (lang === "fr" ? "À examiner · observé" : "Review · observed")
          : (lang === "fr" ? "Satisfait · observé" : "Pass · observed")
        : control.status === "not_applicable" ? copy.v2Excluded : copy.v2Unknown;
      top.append(span("report360-v2-tag", status)); item.append(top);
      if (control.status === "measured" && control.proof) {
        item.append(el("p", "report360-v2-extract", control.proof.value));
        item.append(safeLink(control.proof.url, copy.source, "report360-source"));
      } else if (control.status === "unknown") {
        item.append(el("p", "report360-v2-extract", lang === "fr" ? "Preuve complémentaire requise ; aucune conclusion sur la conformité." : "Additional evidence required; compliance cannot yet be determined."));
      } else if (control.reason) item.append(el("p", "report360-v2-extract", control.reason));
      list.append(item);
    }
    detail.append(list); buckets.append(detail);
  }
  section.append(buckets); return section;
}

function renderConnections(lang, copy) {
  const section = el("section", "report360-connections");
  section.append(el("p", "report360-eyebrow", copy.next), el("h2", "", copy.connectionsTitle), el("p", "report360-subtitle", copy.connectionsIntro));
  const items = [
    ["ai", copy.connectionAi, copy.connectionAiNote, "ai_visibility"],
    ["crm", copy.connectionCrm, copy.connectionCrmNote, "crm/connections"],
    ["social", copy.connectionSocial, copy.connectionSocialNote, "social/connections"],
  ];
  const grid = el("div", "report360-connection-grid");
  for (const [id, label, note, fragment] of items) {
    const card = el("article", `report360-connection report360-connection-${id}`);
    const pillar = PILLARS.find(p => p.id === id);
    card.append(span("report360-glyph", pillar?.symbol || "↗"), el("h3", "", label), el("p", "", note));
    const link = el("a", "report360-workspace", `${copy.connectionOpen} ↗`);
    link.href = `/console/?lang=${lang}#${fragment}`; card.append(link); grid.append(card);
  }
  section.append(grid); return section;
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
  const preview = renderSourcePreview(report, lang, copy);
  if (preview) section.append(preview);
  const v2Grid = renderV2Grid(report, lang, copy);
  if (v2Grid) section.append(v2Grid);
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
  filterBy("all"); plan.append(controls, cards); section.append(plan, renderConnections(lang, copy));

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
