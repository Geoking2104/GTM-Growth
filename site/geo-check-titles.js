/**
 * French titles of the 42 AI visibility checks (GEO check framework v2.0.0),
 * shared by the homepage free-read widget and the console public read.
 * English keeps the server title. Mirrors V2_TITLES_FR in src/report-access/export.ts
 * (tests/geo-check-titles.test.ts keeps them in sync).
 */
export const GEO_CHECK_TITLES_FR = {
  R01: "Accès au fichier robots.txt", R02: "Autorisation des robots des moteurs IA", R03: "Absence de blocage contradictoire", R04: "Sitemap déclaré et accessible", R05: "Cohérence des règles par robot",
  L01: "Accès au fichier llms.txt", L02: "Identification de l'activité", L03: "Résumé clair pour les IA", L04: "Structure et liens de documentation", L05: "Documentation de plus de 1 000 mots", L06: "Documentation approfondie et structurée",
  J01: "JSON-LD lisible", J02: "Entité entreprise déclarée", J03: "Identifiants des entités cohérents", J04: "Liens entre site et pages", J05: "Données adaptées au contenu", J06: "Cohérence entre texte et données structurées",
  M01: "Titre descriptif", M02: "Description utile", M03: "Adresse canonique cohérente", M04: "Aperçu Open Graph", M05: "Directives d'indexation cohérentes",
  C01: "Proposition de valeur identifiable", C02: "Réponses directes aux questions", C03: "Titres de page structurés", C04: "Faits vérifiables", C05: "Sources pertinentes", C06: "Passages faciles à extraire", C07: "Dates de mise à jour vérifiables", C08: "Liens internes contextualisés",
  B01: "Identité de marque cohérente", B02: "Entreprise et coordonnées identifiables", B03: "Profils sociaux déclarés cohérents", B04: "Références externes vérifiées", B05: "Expertise et autorité documentées",
  D01: "Ressources de découverte IA accessibles", D02: "Pages importantes présentes dans le sitemap", D03: "Documentation facilement accessible",
  P01: "Contenu essentiel présent dans le HTML", P02: "Cohérence entre HTML et rendu", P03: "Accès au contenu pour un crawler", P04: "Rendu stable sans blocage",
};

/** User-facing title of a check: French map in FR, server title otherwise. */
export const geoCheckTitle = (id, fallback, lang) => lang === "fr" ? GEO_CHECK_TITLES_FR[id] || fallback || id : fallback || id;
