/* Libellés de la console authentifiée (FR/EN). Les outils gardent leurs libellés
 * de paramètres en français ; la navigation, le tableau de bord et les actions sont traduits. */
const param = new URLSearchParams(location.search).get("lang");
if (param === "fr" || param === "en") localStorage.setItem("gtm-console-lang", param);
export const LANG = localStorage.getItem("gtm-console-lang") || (document.documentElement.lang === "en" ? "en" : "fr");
document.documentElement.lang = LANG;

const DICT = {
  fr: {
    title: "Console GTM Growth", loginLead: "Accès réservé. Connectez-vous avec votre compte (SSO Keycloak).", email: "E-mail professionnel",
    continue: "Continuer", redirecting: "Redirection…", loginHelp: "Votre espace client est détecté à partir de votre e-mail, du sous-domaine (client.gtm.kayroslab.com) ou du lien ?tenant=client. Sinon, connexion au compte GTM Growth.",
    loginFail: "Connexion impossible", backToSite: "← Retour au site", search: "Rechercher", track: "Track", act: "Act", settings: "Mon compte", logout: "Déconnexion",
    client: "Client", domain: "Domaine analysé", property: "Propriété Search Console", apply: "Appliquer", noDomain: "Choisissez un domaine dans le sélecteur en haut à gauche.",
    run: "Lancer", running: "Analyse en cours…", download: "Télécharger le PDF", live: "Données en direct", allEngines: "Tous les moteurs", superAdmin: "super-admin",
    s_overview: "Vue d’ensemble", s_geo: "GEO", s_citability: "Citabilité", s_indexnow: "IndexNow", s_sitemap: "Sitemap", s_performance: "Performance",
    s_search: "Recherche", s_keywords: "Mots-clés", s_tracking: "Tracking", s_audit: "Audit technique", s_generators: "Générateurs", s_calculators: "Calculateurs", s_report: "Rapport",
    t_plan: "Plan d’action", kGeo: "Score GEO", kCit: "Citabilité", kIdx: "IndexNow", kEng: "Moteurs prêts", projected: "projeté", toMax: "jusqu’au max", toFix: "contrôles à corriger",
    trajectory: "Trajectoire du score vers le plan", perFix: "un point par correctif", now: "maintenant", fixes: "correctifs", engines: "Préparation par moteur", outOf: "sur 100",
    best: "Meilleur", weakest: "plus faible", gapFoot: "Écart au pentagone complet, en points.", where: "Où sont les points", loadingOverview: "Audit du domaine en cours (≈ 20 s)…",
    rank: "#", action: "Action", impact: "Impact", effort: "Effort", area: "Zone", check: "Contrôle", points: "Points", status: "Statut", evidence: "Constat", fix: "Correctif",
    trackingNote: "Le suivi GA4 / Tag Manager passe par les outils MCP et le compte de service Google du serveur (non installé). Les données apparaîtront ici dès qu’il sera configuré.",
    citIntro: "Lisibilité IA : la page est-elle facile à citer par un moteur génératif ?", idxIntro: "Préparation IndexNow : clé, fichier de clé, sitemap et signaux de découverte.",
    publicDemo: "Démo publique",
  },
  en: {
    title: "GTM Growth console", loginLead: "Restricted access. Sign in with your account (Keycloak SSO).", email: "Work email",
    continue: "Continue", redirecting: "Redirecting…", loginHelp: "Your client space is detected from your email, the subdomain (client.gtm.kayroslab.com) or the ?tenant=client link. Otherwise you sign in to the GTM Growth account.",
    loginFail: "Sign-in failed", backToSite: "← Back to site", search: "Search", track: "Track", act: "Act", settings: "My account", logout: "Sign out",
    client: "Client", domain: "Analysed domain", property: "Search Console property", apply: "Apply", noDomain: "Pick a domain in the selector at the top left.",
    run: "Run", running: "Analysing…", download: "Download PDF", live: "Live data", allEngines: "All engines", superAdmin: "super-admin",
    s_overview: "Overview", s_geo: "GEO", s_citability: "Citability", s_indexnow: "IndexNow", s_sitemap: "Sitemap", s_performance: "Performance",
    s_search: "Search", s_keywords: "Keywords", s_tracking: "Tracking", s_audit: "Technical audit", s_generators: "Generators", s_calculators: "Calculators", s_report: "Report",
    t_plan: "Action plan", kGeo: "GEO score", kCit: "Citability", kIdx: "IndexNow", kEng: "Engines ready", projected: "projected", toMax: "to max", toFix: "checks to fix",
    trajectory: "Score trajectory to plan", perFix: "one point per fix", now: "now", fixes: "fixes", engines: "Readiness by engine", outOf: "out of 100",
    best: "Best", weakest: "weakest", gapFoot: "Gap to the full pentagon, in points.", where: "Where the points are", loadingOverview: "Auditing the domain (≈ 20 s)…",
    rank: "#", action: "Action", impact: "Impact", effort: "Effort", area: "Area", check: "Check", points: "Points", status: "Status", evidence: "Evidence", fix: "Fix",
    trackingNote: "GA4 / Tag Manager tracking goes through the MCP tools and the server's Google service account (not installed yet). Data will show here once it is configured.",
    citIntro: "AI readability: is the page easy for a generative engine to quote?", idxIntro: "IndexNow readiness: key, key file, sitemap and discovery signals.",
    publicDemo: "Public demo",
  },
};
const ACTIONS_EN = {
  map: "Sitemap map", audit: "Sitemap GEO audit", build: "Generate a sitemap", citability: "AI citability", llms: "llms.txt: validate, generate, drift", robots: "AI robots", schema: "Structured data",
  psi: "PageSpeed", crux: "Core Web Vitals (CrUX)", weight: "Page weight", queries: "Queries", trends: "Trends", losing: "Pages losing clicks", inspect: "URL inspection",
  opps: "Opportunities & clusters", ctr: "CTR by position", value: "Organic traffic value", roi: "SEO ROI", budget: "SEO budget", pdf: "Export the PDF report",
  tech: "Technical audit (crawler)", serp: "SERP preview", titles: "Title tags", meta: "Meta descriptions", outline: "Article outline",
};
export const t = (k) => DICT[LANG][k] ?? DICT.fr[k] ?? k;
export const actionLabel = (a) => (LANG === "en" ? ACTIONS_EN[a.id] ?? a.label : a.label);
export const CATEGORY = {
  fr: { robots: "robots.txt", llms: "llms.txt", schema: "Schéma", meta: "Métadonnées", content: "Contenu", brand_entity: "Marque & entité", signals: "Signaux", ai_discovery: "Découverte IA" },
  en: { robots: "robots.txt", llms: "llms.txt", schema: "Schema", meta: "Metadata", content: "Content", brand_entity: "Brand & entity", signals: "Signals", ai_discovery: "AI discovery" },
}[LANG];
