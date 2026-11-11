/** Pure, explainable ranking for the public GEO opportunity assistant.
 * It only prioritises observed failures. It never predicts search traffic,
 * runs an LLM, or claims that an engine has actually cited a page. */

const FIXES = {
  "robots.found": ["Publier un robots.txt", "Publish robots.txt", "Créez un fichier robots.txt lisible à la racine du site.", "Publish a readable robots.txt file at the site root.", "easy"],
  "robots.citation_bots": ["Clarifier l’accès des robots IA", "Clarify AI crawler access", "Ajoutez des règles explicites pour les robots pertinents dans robots.txt, selon vos choix d’accès.", "Add explicit robots.txt rules for the relevant crawlers, according to your access policy.", "easy"],
  "robots.crawl_delay": ["Réduire le délai de crawl", "Reduce crawl delay", "Revoyez le Crawl-delay dans robots.txt si sa valeur freine les visites.", "Review robots.txt Crawl-delay if it slows crawling.", "easy"],
  "llms.found": ["Créer un llms.txt utile", "Create a useful llms.txt", "Publiez un index des contenus clés, avec des liens vers des pages réelles.", "Publish an index of key content with links to real pages.", "medium"],
  "llms.h1": ["Nommer le site dans llms.txt", "Name the site in llms.txt", "Commencez llms.txt par un titre Markdown avec le nom du site.", "Start llms.txt with a Markdown title naming the site.", "easy"],
  "llms.blockquote": ["Résumer l’activité dans llms.txt", "Summarise the site in llms.txt", "Ajoutez une phrase de présentation après le titre du fichier.", "Add a one-line description after the file heading.", "easy"],
  "llms.sections": ["Structurer llms.txt en rubriques", "Add sections to llms.txt", "Regroupez les liens par sujets : services, documentation, entreprise.", "Group links by topics: services, documentation, company.", "easy"],
  "llms.links": ["Relier les pages clés", "Link important pages", "Insérez des liens Markdown vers les contenus que vous voulez rendre découvrables.", "Add Markdown links to content you want visitors and agents to discover.", "easy"],
  "llms.depth": ["Enrichir le contexte llms.txt", "Enrich llms.txt context", "Ajoutez des descriptions exactes des produits, services et ressources clés.", "Add accurate descriptions of products, services and key resources.", "medium"],
  "llms.depth_high": ["Compléter la référence IA", "Expand the AI reference", "Ajoutez une référence approfondie si vous disposez de contenu pertinent.", "Add a more complete reference when you have relevant content.", "medium"],
  "llms.full": ["Fournir un llms-full.txt", "Add llms-full.txt", "Publiez un complément détaillé et liez-le depuis llms.txt.", "Publish a detailed companion file and link it from llms.txt.", "medium"],
  "schema.any_valid": ["Ajouter des données structurées", "Add structured data", "Déclarez un JSON-LD valide correspondant au contenu visible.", "Add valid JSON-LD matching the visible page content.", "medium"],
  "schema.richness": ["Compléter les propriétés Schema.org", "Complete Schema.org properties", "Renseignez les attributs utiles et vérifiables des objets JSON-LD.", "Add useful, verifiable attributes to JSON-LD objects.", "medium"],
  "schema.organization": ["Déclarer l’organisation", "Describe the organisation", "Ajoutez un objet Organization avec le vrai nom et l’URL officielle.", "Add an Organization object with the real name and official URL.", "medium"],
  "schema.website": ["Décrire le site Web", "Describe the website", "Ajoutez un objet WebSite JSON-LD cohérent avec la page.", "Add a WebSite JSON-LD object consistent with the page.", "medium"],
  "schema.faq": ["Structurer les réponses utiles", "Structure useful answers", "Si la page contient une FAQ visible, balisez les questions et réponses correspondantes.", "If a visible FAQ exists, mark up its matching questions and answers.", "medium"],
  "schema.article": ["Baliser les contenus éditoriaux", "Mark up editorial content", "Sur les articles concernés, déclarez auteur, titre et dates de publication/mise à jour.", "On relevant articles, declare author, headline and publication/update dates.", "medium"],
  "schema.visible_match": ["Aligner les schémas avec la page", "Align schema with visible content", "Utilisez les mêmes noms et titres dans les données structurées et le texte visible.", "Use matching names and headlines in structured data and visible copy.", "easy"],
  "schema.parse_errors": ["Corriger les erreurs JSON-LD", "Fix JSON-LD errors", "Validez la syntaxe JSON-LD et réparez les blocs non interprétables.", "Validate JSON-LD syntax and fix unparseable blocks.", "medium"],
  "meta.title": ["Ajouter un titre explicite", "Add a descriptive title", "Rédigez une balise title qui nomme précisément le sujet et la marque.", "Write a title tag that names the topic and brand.", "easy"],
  "meta.description": ["Rédiger la meta description", "Write a meta description", "Résumez l’objectif réel de la page en une description utile.", "Summarise the real purpose of the page in a useful description.", "easy"],
  "meta.canonical": ["Déclarer l’URL canonique", "Declare the canonical URL", "Indiquez la bonne URL principale dans rel=canonical.", "Set the correct primary URL in rel=canonical.", "easy"],
  "meta.og": ["Compléter les aperçus de partage", "Complete social previews", "Ajoutez les balises Open Graph manquantes, en cohérence avec la page.", "Add missing Open Graph tags consistent with the page.", "easy"],
  "meta.x_robots_noindex": ["Lever le blocage d’indexation", "Remove the indexing blocker", "Vérifiez l’en-tête HTTP X-Robots-Tag : un noindex peut empêcher l’indexation.", "Review the X-Robots-Tag HTTP header: noindex can block indexing.", "easy"],
  "meta.noai": ["Revoir la directive noai", "Review the noai directive", "Si vous souhaitez des citations IA, adaptez vos directives noai/noimageai en connaissance de cause.", "If you want AI citations, reconsider noai/noimageai directives intentionally.", "easy"],
  "content.h1": ["Clarifier le titre principal", "Clarify the main heading", "Ajoutez un H1 qui dit clairement à quelle question la page répond.", "Add an H1 clearly stating what question the page answers.", "easy"],
  "content.word_count": ["Renforcer le contenu utile", "Expand useful content", "Ajoutez des explications vérifiables, sans remplissage artificiel.", "Add factual, useful explanations without filler.", "hard"],
  "content.heading_hierarchy": ["Organiser H2 et H3", "Organise H2 and H3", "Structurez les informations en sections et sous-sections cohérentes.", "Structure content into coherent sections and subsections.", "medium"],
  "content.lists_or_tables": ["Créer des listes et tableaux", "Add lists and tables", "Présentez étapes ou comparaisons sous un format facile à parcourir.", "Present steps or comparisons in a scannable format.", "easy"],
  "content.front_loading": ["Mettre la réponse en évidence", "Lead with the answer", "Placez une réponse factuelle dès le début de la page.", "Put a factual answer near the start of the page.", "medium"],
  "content.numbers": ["Ajouter des faits chiffrés", "Add concrete numbers", "Intégrez des chiffres sourcés, à jour et pertinents.", "Add sourced, current, relevant figures.", "medium"],
  "content.links": ["Citer des sources fiables", "Cite reliable sources", "Ajoutez des liens externes vers les sources qui étayent les affirmations.", "Link to external sources supporting your claims.", "easy"],
  "content.image_alt": ["Décrire les images", "Describe images", "Renseignez les textes alternatifs des images informatives.", "Add alternative text for informative images.", "easy"],
  "brand.name_coherence": ["Unifier le nom de marque", "Unify the brand name", "Alignez les noms dans le title, le H1 et les schémas.", "Align naming in the title, H1 and structured data.", "medium"],
  "brand.desc_coherence": ["Harmoniser la description de marque", "Align brand descriptions", "Gardez la même description factuelle dans les métadonnées et les schémas.", "Use the same factual description in metadata and schema.", "easy"],
  "brand.kg_readiness": ["Relier les identités officielles", "Link official brand identities", "Ajoutez uniquement vos profils réels dans sameAs (ex. LinkedIn, Wikidata).", "Add only your real official profiles to sameAs (e.g. LinkedIn, Wikidata).", "medium"],
  "brand.about_link": ["Rendre l’entreprise identifiable", "Make the company identifiable", "Ajoutez un lien visible vers une page À propos pertinente.", "Link visibly to a relevant About page.", "easy"],
  "brand.contact_info": ["Clarifier les coordonnées", "Clarify contact details", "Déclarez des coordonnées exactes dans les données structurées appropriées.", "Declare accurate contact details in relevant structured data.", "easy"],
  "brand.geo_identity": ["Préciser les marchés servis", "Describe served markets", "Renseignez la langue et les zones géographiques réellement couvertes.", "Declare the language and geographic areas genuinely served.", "medium"],
  "brand.topic_authority": ["Démontrer l’expertise", "Demonstrate topic expertise", "Publiez des contenus récents, attribués et répondant aux vraies questions.", "Publish recent, attributed content answering real questions.", "hard"],
  "signals.lang": ["Déclarer la langue", "Declare the page language", "Ajoutez la bonne valeur lang à la balise html.", "Set the correct lang attribute on the html element.", "easy"],
  "signals.rss": ["Exposer un flux de contenus", "Expose a content feed", "Publiez un flux RSS/Atom si votre site diffuse des nouveautés.", "Publish RSS/Atom if the site regularly shares updates.", "medium"],
  "signals.freshness": ["Exposer la fraîcheur", "Signal content freshness", "Affichez des dates de mise à jour vérifiables sur les contenus concernés.", "Expose verifiable update dates on relevant content.", "medium"],
  "ai_discovery.well_known": ["Ajouter un point d’entrée IA", "Add an AI discovery entry", "Documentez le service dans le fichier de découverte prévu par le contrôle.", "Describe the service in the expected discovery file.", "medium"],
  "ai_discovery.summary": ["Rédiger un résumé machine", "Write a machine-readable summary", "Publiez un résumé fidèle de l’activité en format structuré.", "Publish an accurate structured summary of the service.", "medium"],
  "ai_discovery.faq": ["Structurer les réponses IA", "Structure AI answers", "Exposez une FAQ structurée reflétant vos vrais contenus.", "Expose a structured FAQ reflecting real site content.", "medium"],
  "ai_discovery.service": ["Décrire les services", "Describe services", "Ajoutez une description machine des offres réellement disponibles.", "Add a machine-readable description of real offerings.", "medium"],
};

const CATEGORY_EFFECTS = {
  robots: ["Accès des robots clarifié", "Clearer crawler access"],
  llms: ["Parcours de découverte plus explicite", "Clearer discovery path"],
  schema: ["Contexte de page mieux structuré", "Better structured page context"],
  meta: ["Signaux d’indexation et d’aperçu clarifiés", "Clearer indexing and preview signals"],
  content: ["Réponses plus faciles à extraire", "Easier extraction of relevant answers"],
  brand_entity: ["Identité de marque plus cohérente", "More consistent brand identity"],
  signals: ["Informations de langue et de fraîcheur clarifiées", "Clearer language and freshness data"],
  ai_discovery: ["Ressources de découverte mieux exposées", "More discoverable machine-readable resources"],
};

export function normalisePublicUrl(value) {
  try {
    const input = String(value || "").trim();
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
        !url.hostname.includes(".") || url.hostname === "localhost" || url.hostname.endsWith(".local")) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}

function effortOf(id) { return FIXES[id]?.[4] || "medium"; }

/** Returns different defensible ordering strategies; critical blockers always lead. */
export function rankRecommendations(input, mode = "quick", limit = 6) {
  const seen = new Set();
  const fixes = (Array.isArray(input) ? input : []).filter((fix) => {
    if (!fix || typeof fix.checkId !== "string" || seen.has(fix.checkId)) return false;
    seen.add(fix.checkId);
    return fix.status !== "pass" && fix.status !== "info";
  });
  const priority = { critical: 10000, high: 150, medium: 70, low: 25 };
  const effort = { easy: 1, medium: 2, hard: 3 };
  const value = (fix) => {
    const base = priority[fix.priority] ?? 60;
    const points = Math.max(0, Math.min(20, Number(fix.points) || 0));
    const cost = effort[effortOf(fix.checkId)] || 2;
    if (mode === "impact") return base + points * 20 - cost * 3;
    if (mode === "blockers") return base + points * 3 + (["meta", "robots"].includes(fix.category) ? 200 : 0) - cost * 4;
    if (mode === "journey") return base + points * 3 + (["content", "meta", "brand_entity"].includes(fix.category) ? 120 : 0) - cost * 7;
    if (mode === "ai") return base + points * 6 + (["robots", "llms", "schema", "brand_entity", "ai_discovery"].includes(fix.category) ? 42 : 0) - cost * 5;
    return base + points * 6 - cost * 16;
  };
  return fixes.sort((a, b) => value(b) - value(a) || a.checkId.localeCompare(b.checkId)).slice(0, Math.max(0, limit));
}

export function explainRecommendation(fix, language = "fr") {
  const en = language === "en";
  const copy = FIXES[fix.checkId];
  const generic = en ? "Improve this measured signal" : "Améliorer ce signal mesuré";
  const effect = CATEGORY_EFFECTS[fix.category] || ["Signal technique clarifié", "Clearer technical signal"];
  return {
    title: copy ? copy[en ? 1 : 0] : generic,
    steps: copy ? copy[en ? 3 : 2] : (en ? fix.action : "Vérifiez le contrôle concerné et sa preuve avant d’agir."),
    effect: effect[en ? 1 : 0],
    effort: effortOf(fix.checkId),
  };
}
