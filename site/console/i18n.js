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
    s_search: "Recherche", s_keywords: "Mots-clés", s_tracking: "Tracking", s_audit: "Audit technique", s_generators: "Générateurs", s_calculators: "Calculateurs", s_report: "Rapport", s_ops: "OpÃ©rations", s_apply_mode: "Correctifs GEO",
    t_plan: "Plan d’action", kGeo: "Score GEO", hGeo: "Un moteur peut-il récupérer, parser et croire la page ? Huit catégories, 42 contrôles, une preuve par point.", hCit: "Un passage survivrait-il à une citation ? Douze méthodes — statistiques, citations, structure, auteur, fraîcheur (0–3 chacune).", hIdx: "Quand la page change, en combien de temps Bing et ses partenaires le savent ? Clé, vérification, accès crawler, sitemap — 7 contrôles, hors barème GEO.", hEng: "La préparation par moteur, à partir des mêmes preuves — pas un second avis sur le score.", hBoard: "Trois scores, parce qu’une page peut échouer de trois façons : lisible sans jamais être citée, citable mais ignorée pendant des jours. Le tableau mesure chaque couche séparément, puis classe un seul plan à travers les trois ; les blocages d’indexation passent en premier.", kCit: "Citabilité", kIdx: "IndexNow", kEng: "Moteurs prêts", projected: "projeté", toMax: "jusqu’au max", toFix: "contrôles à corriger",
    trajectory: "Trajectoire du score vers le plan", perFix: "un point par correctif", now: "maintenant", fixes: "correctifs", engines: "Préparation par moteur", outOf: "sur 100",
    best: "Meilleur", weakest: "plus faible", gapFoot: "Écart au pentagone complet, en points.", where: "Où sont les points", loadingOverview: "Audit du domaine en cours (≈ 20 s)…",
    rank: "#", action: "Action", impact: "Impact", effort: "Effort", area: "Zone", check: "Contrôle", points: "Points", status: "Statut", evidence: "Constat", fix: "Correctif",
    citIntro: "Lisibilité IA : la page est-elle facile à citer par un moteur génératif ?", idxIntro: "Préparation IndexNow : clé, fichier de clé, sitemap et signaux de découverte.",
    idxKeyTitle: "Générer une clé IndexNow", idxKeyHelp: "Local uniquement — rien n’est envoyé. Publiez le fichier .txt à la racine du site, puis vérifiez.",
    idxKeyHost: "Votre hôte", idxKeyPlaceholder: "exemple.fr", idxKeyGenerate: "Générer une clé", idxKeyDownload: "Télécharger le .txt",
    idxNoAudit: "Choisissez un domaine pour le tableau de préparation IndexNow.",
    publicDemo: "Démo publique",
    s_gsc: "Search Console", s_ga4: "Google Analytics 4", s_bing: "Bing Webmaster",
    t_gscPerf: "Performance", t_queryPages: "Requêtes × pages", t_gscSitemaps: "Sitemaps envoyés", t_ga4: "Audience & acquisition", t_realtime: "Temps réel", t_ecommerce: "E-commerce", t_technology: "Systèmes & navigateurs", s_gtm: "Google Tag Manager", t_gtm: "Conteneur, écriture & publication", t_bing: "Performance de recherche",
    t_status: "Statut des accès", t_tags: "Balises GA4 / GTM", t_settings: "Paramètres", ga4Property: "Propriété GA4 (ID)", bingSite: "Site Bing Webmaster",
  },
  en: {
    title: "GTM Growth console", loginLead: "Restricted access. Sign in with your account (Keycloak SSO).", email: "Work email",
    continue: "Continue", redirecting: "Redirecting…", loginHelp: "Your client space is detected from your email, the subdomain (client.gtm.kayroslab.com) or the ?tenant=client link. Otherwise you sign in to the GTM Growth account.",
    loginFail: "Sign-in failed", backToSite: "← Back to site", search: "Search", track: "Track", act: "Act", settings: "My account", logout: "Sign out",
    client: "Client", domain: "Analysed domain", property: "Search Console property", apply: "Apply", noDomain: "Pick a domain in the selector at the top left.",
    run: "Run", running: "Analysing…", download: "Download PDF", live: "Live data", allEngines: "All engines", superAdmin: "super-admin",
    s_overview: "Overview", s_geo: "GEO", s_citability: "Citability", s_indexnow: "IndexNow", s_sitemap: "Sitemap", s_performance: "Performance",
    s_search: "Search", s_keywords: "Keywords", s_tracking: "Tracking", s_audit: "Technical audit", s_generators: "Generators", s_calculators: "Calculators", s_report: "Report", s_ops: "Operations", s_apply_mode: "GEO fixes",
    t_plan: "Action plan", kGeo: "GEO score", hGeo: "Can an engine fetch, parse and trust the page? Eight categories, 42 checks, evidence per point.", hCit: "Would a passage survive being quoted? Twelve methods — statistics, quotations, structure, authorship, freshness (0–3 each).", hIdx: "Once the page changes, how fast can Bing and its partners know? Key file, verification, crawler access, sitemap — 7 checks, outside the GEO rubric.", hEng: "Readiness per engine, from the same evidence — not a second opinion on the score.", hBoard: "Three scores, because a page can fail in three different ways: readable and never quoted, quotable and still unnoticed for days. The board measures each layer separately, then ranks one plan across all three; indexing blockers come first.", kCit: "Citability", kIdx: "IndexNow", kEng: "Engines ready", projected: "projected", toMax: "to max", toFix: "checks to fix",
    trajectory: "Score trajectory to plan", perFix: "one point per fix", now: "now", fixes: "fixes", engines: "Readiness by engine", outOf: "out of 100",
    best: "Best", weakest: "weakest", gapFoot: "Gap to the full pentagon, in points.", where: "Where the points are", loadingOverview: "Auditing the domain (≈ 20 s)…",
    rank: "#", action: "Action", impact: "Impact", effort: "Effort", area: "Area", check: "Check", points: "Points", status: "Status", evidence: "Evidence", fix: "Fix",
    citIntro: "AI readability: is the page easy for a generative engine to quote?", idxIntro: "IndexNow readiness: key, key file, sitemap and discovery signals.",
    idxKeyTitle: "Generate an IndexNow key", idxKeyHelp: "Local only — nothing is sent. Publish the .txt at the site root, then verify.",
    idxKeyHost: "Your host", idxKeyPlaceholder: "example.com", idxKeyGenerate: "Generate a key", idxKeyDownload: "Download .txt",
    idxNoAudit: "Pick a domain to load the IndexNow readiness table.",
    publicDemo: "Public demo",
    s_gsc: "Search Console", s_ga4: "Google Analytics 4", s_bing: "Bing Webmaster",
    t_gscPerf: "Performance", t_queryPages: "Queries × pages", t_gscSitemaps: "Submitted sitemaps", t_ga4: "Audience & acquisition", t_realtime: "Realtime", t_ecommerce: "Ecommerce", t_technology: "OS & browsers", s_gtm: "Google Tag Manager", t_gtm: "Container, write & publish", t_bing: "Search performance",
    t_status: "Access status", t_tags: "GA4 / GTM tags", t_settings: "Settings", ga4Property: "GA4 property (ID)", bingSite: "Bing Webmaster site",
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

/* Libellés des outils (paramètres, colonnes, métriques, intertitres) : FR → EN. */
const FR_EN = {
  "Absentes de llms.txt": "Missing from llms.txt", "Afficher": "Show", "Alertes": "Warnings", "Appareil": "Device", "Autorisés": "Allowed", "Bloquées": "Blocked", "Bloqués": "Blocked",
  "Bénéfice clé": "Key benefit", "CPC équivalent (€)": "Equivalent CPC (€)", "CTR moyen": "Avg CTR", "Calculer": "Calculate", "Canonique Google": "Google canonical", "Caractères": "Characters",
  "Chaîne": "Chain", "Chaînes de redirections": "Redirect chains", "Clics": "Clicks", "Clics / mois": "Clicks / month", "Clics après": "Clicks after", "Clics avant": "Clicks before", "Clics potentiels": "Potential clicks",
  "Constat": "Evidence", "Contexte : page du domaine": "Context: domain page", "Contrôle": "Check", "Conversion (%)": "Conversion (%)", "Conversions nécessaires": "Conversions needed", "Correctif": "Fix", "Correctifs prioritaires": "Priority fixes",
  "Couverture": "Coverage", "Coût SEO / mois (€)": "SEO cost / month (€)", "Coût par visite (€)": "Cost per visit (€)", "Dernier crawl": "Last crawl", "Descriptions dupliquées": "Duplicate descriptions", "Découvertes": "Discovered", "Dérive vs sitemap": "Drift vs sitemap",
  "Entrées": "Entries", "Erreurs": "Errors", "Générer": "Generate", "Générer le PDF": "Generate the PDF", "Impressions min.": "Min. impressions", "Incluses": "Included", "Lien": "Link", "Liens cassés": "Broken links", "Liens externes vérifiés": "External links checked",
  "Lignes": "Rows", "Manques": "Gaps", "Manques sur tout le site": "Site-wide gaps", "Marge (%)": "Margin (%)", "Marque": "Brand", "Marque (optionnel)": "Brand (optional)", "Meta description (optionnel)": "Meta description (optional)",
  "Modèles (déterministe)": "Templates (deterministic)", "Mot-clé principal": "Main keyword", "Moteur": "Engine", "Méthode": "Method", "Niveau": "Band", "Nombre": "Count", "Non": "No", "Oui": "Yes", "Non déclarés": "Not declared",
  "Objectif CA / mois (€)": "Revenue target / month (€)", "Obsolètes": "Stale", "Ollama (modèle open source)": "Ollama (open-source model)", "Ordinateur": "Desktop", "Origine": "Origin", "Pages (max 25)": "Pages (max 25)", "Pages auditées": "Pages audited",
  "Pages les plus faibles": "Weakest pages", "Pages max (200)": "Max pages (200)", "Pages récupérées": "Pages fetched", "Panier moyen (€)": "Average order value (€)", "Poids": "Weight", "Points forts": "Strengths", "Portée": "Scope",
  "Position cible": "Target position", "Problèmes": "Issues", "Problèmes par page": "Issues by page", "Proposition": "Suggestion", "Public cible": "Target audience", "Période (jours)": "Period (days)", "Requête": "Query", "Requêtes à travailler": "Queries to work on",
  "Ressource": "Resource", "Ressources": "Resources", "Sauts": "Hops", "Score moyen": "Average score", "Statut": "Status", "Synchronisé": "In sync", "Taille inconnue": "Unknown size", "Thème": "Topic", "Title (optionnel)": "Title (optional)",
  "Titles dupliqués": "Duplicate titles", "Tous": "All", "Trafic / mois": "Traffic / month", "Trafic d'équilibre": "Break-even traffic", "Trafic nécessaire": "Traffic needed", "Trouvé sur": "Found on", "URL (max 500)": "URLs (max 500)", "URL à inspecter": "URL to inspect",
  "Validation": "Validation", "Volume mensuel": "Monthly volume", "ou clics réels (GSC)": "or actual clicks (GSC)", "robots.txt proposé": "Proposed robots.txt", "Écart": "Delta", "Écart %": "Delta %", "Échecs": "Failures", "Clusters": "Clusters",
  "Valeur / mois": "Value / month", "Valeur / an": "Value / year", "CA": "Revenue", "Marge brute": "Gross profit", "Budget / mois": "Budget / month", "Total": "Total", "Erreurs": "Errors", "Prioritaire": "Priority",
  "Carte visuelle, audit GEO page par page et génération d'un sitemap XML.": "Visual map, page-by-page GEO audit and XML sitemap generation.",
  "Lisibilité IA (citabilité), llms.txt, robots IA et données structurées — en direct.": "AI readability (citability), llms.txt, AI robots and structured data — live.",
  "PageSpeed Insights, Core Web Vitals terrain (CrUX) et poids de page mesuré.": "PageSpeed Insights, field Core Web Vitals (CrUX) and measured page weight.",
  "Données Search Console en direct pour la propriété indiquée en haut de page.": "Live Search Console data for the property chosen at the top left.",
  "Score d'opportunité et regroupement des requêtes, calculés à partir des paires requête/page de Search Console.": "Opportunity score and query clustering, computed from Search Console query/page pairs.",
  "Estimations indicatives : courbe de CTR par position, valeur du trafic, ROI et budget SEO.": "Indicative estimates: CTR curve by position, traffic value, ROI and SEO budget.",
  "Rapport GEO complet (audit, plateformes IA, citabilité) généré à la demande pour le domaine choisi.": "Full GEO report (audit, AI platforms, citability) generated on demand for the chosen domain.",
  "Crawl interne du domaine : canonical, titres Hn, redirections, liens cassés, doublons, et aperçu du résultat Google.": "Internal crawl of the domain: canonical, headings, redirects, broken links, duplicates and Google result preview.",
  "Titles, meta descriptions et plans d'article. Modèles déterministes par défaut ; Ollama (modèle open source auto-hébergé) en option.": "Titles, meta descriptions and article outlines. Deterministic templates by default; Ollama (self-hosted open-source model) optional.",
  "Laisser vide pour lire le title et la meta description de la page ; sinon tester vos propres textes.": "Leave empty to read the page's title and meta description; otherwise test your own texts.",
  "Aucune donnée.": "No data.", "Données brutes (JSON)": "Raw data (JSON)", "Copier": "Copy", "Télécharger": "Download",
};
/** Traduit un libellé d'outil en anglais (inchangé en français ou si inconnu). */
export const tr = (s) => (LANG === "en" && typeof s === "string" ? FR_EN[s] ?? s : s);
