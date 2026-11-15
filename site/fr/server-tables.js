/** Localise the public free-read API's English table schema for /fr/.
 * Values quoted from the audited website (titles, URLs, IDs) stay unchanged.
 * If a newly added server note has no translation, omit that explanation rather
 * than silently mixing English copy into the French UI. */
const titles = {
  "seo.meta": ["SEO — métadonnées", "Mesuré sur le HTML renvoyé par le serveur."],
  "seo.content": ["SEO — structure du contenu", "Mots et titres tels que les moteurs les analysent."],
  "seo.technical": ["SEO — liens, médias et données structurées", ""],
  "ga4.readiness": ["GA4 — préparation de la mesure", "Lu dans le HTML. Aucun compte Google nécessaire."],
  "gsc.readiness": ["Search Console — préparation à l’indexation", "Lu dans la page, robots.txt et le sitemap. Aucun compte Google nécessaire."],
  "ga4.traffic": ["GA4 — rapport de trafic", ""],
  "gsc.traffic": ["Search Console — rapport de performance", ""],
};

const labels = {
  "Title": "Titre", "Meta description": "Méta-description", "Canonical": "URL canonique",
  "Robots meta": "Balise meta robots", "Open Graph": "Open Graph", "Outline": "Plan des titres",
  "Words": "Mots", "Tables": "Tableaux", "Lists": "Listes", "Blockquotes": "Citations",
  "Internal links": "Liens internes", "External links": "Liens externes", "Empty or anchor links": "Liens vides ou ancres",
  "Images": "Images", "Images without alt": "Images sans texte alternatif",
  "JSON-LD blocks": "Blocs JSON-LD", "Schema types": "Types Schema.org",
  "GA4 measurement IDs": "Identifiants GA4", "Universal Analytics": "Universal Analytics",
  "Tag Manager containers": "Conteneurs Tag Manager", "Loader duplication": "Chargements en double",
  "dataLayer initialised": "dataLayer initialisé", "Consent mode": "Mode consentement",
  "Server-side hints": "Indices côté serveur", "Ads conversion IDs": "Identifiants de conversion Ads",
  "Verification meta": "Balise de vérification", "robots.txt": "robots.txt",
  "Sitemap declared in robots.txt": "Sitemap déclaré dans robots.txt", "Sitemap": "Sitemap",
  "Lastmod coverage": "Couverture lastmod", "Indexability": "Indexabilité",
  "Canonical host": "Domaine canonique", "Sessions": "Sessions",
  "Engaged sessions": "Sessions avec engagement", "Key events": "Événements clés",
  "Top landing page": "Principale page d’entrée", "Organic share": "Part organique",
  "Clicks": "Clics", "Impressions": "Impressions", "Average CTR": "CTR moyen",
  "Average position": "Position moyenne", "Top query": "Principale requête",
};

const notes = {
  "Aim for 20–60 characters so the title survives a snippet.": "Visez 20 à 60 caractères pour préserver le titre dans les extraits.",
  "Aim for 70–160 characters: engines reuse it verbatim.": "Visez 70 à 160 caractères : les moteurs réutilisent souvent cette description.",
  "No canonical link: the page has no declared identity.": "Sans URL canonique, la page ne déclare pas son adresse de référence.",
  "Canonical is not a valid URL.": "L’URL canonique est invalide.",
  "The page asks not to be indexed.": "La page demande à ne pas être indexée.",
  "Indexable.": "Indexable.",
  "Declare the language: engines use it for language targeting.": "Déclarez la langue de la page pour les moteurs.",
  "og:image present": "Image Open Graph déclarée.",
  "No og:image: link previews render empty.": "Aucune image Open Graph : l’aperçu du lien peut rester vide.",
  "Declared language variants.": "Variantes linguistiques déclarées.",
  "Single-language page.": "Page dans une seule langue.",
  "Several H1s: the page states more than one main topic.": "Plusieurs H1 : la page présente plusieurs sujets principaux.",
  "Fewer than two H2s: the structure is hard to excerpt.": "Moins de deux H2 : la structure est difficile à citer.",
  "Thin page: little to quote.": "Contenu trop court : peu de passages citables.",
  "No table: comparisons stay unquotable.": "Sans tableau, les comparaisons sont moins faciles à citer.",
  "No quotation: assistants rarely quote what is not already a quote.": "Aucune citation explicite repérée.",
  "Few internal links: weak crawl paths.": "Peu de liens internes : parcours d’exploration limités.",
  "No outbound citation: claims are unsourced.": "Aucun lien externe pour étayer les affirmations.",
  "No Article: editorial pages cannot carry authors or dates.": "Pas de type Article : les pages éditoriales peuvent manquer d’auteur ou de date.",
  "More than one GA4 property on the page: sessions can be double-counted.": "Plusieurs propriétés GA4 : les sessions risquent d’être comptées deux fois.",
  "UA stopped collecting in 2023 — this tag is dead weight.": "Universal Analytics ne collecte plus depuis 2023.",
  "Several containers: the deployment order decides which one wins.": "Plusieurs conteneurs : l’ordre de chargement peut modifier le comportement.",
  "Two loaders on the same page is the classic source of duplicated events.": "Deux chargeurs sur la page risquent de dupliquer les événements.",
  "No consent signal in the HTML: EEA measurement depends on it.": "Aucun signal de consentement dans le HTML ; il est important pour la mesure dans l’EEE.",
  "No sGTM/MP reference in the page source — expected on static sites.": "Aucune référence sGTM/MP repérée dans le HTML ; fréquent sur un site statique.",
  "A DNS or file verification may still exist — this only checks the meta tag.": "Une vérification DNS ou par fichier peut exister : seule la balise meta est vérifiée.",
  "robots.txt blocks everything for all agents.": "Le robots.txt bloque toutes les ressources pour tous les agents.",
  "Declare the sitemap so Search Console finds it.": "Déclarez le sitemap dans robots.txt pour en faciliter la découverte.",
  "No lastmod: recrawl decisions fall back to guesswork.": "Sans lastmod, la fraîcheur des pages est difficile à estimer.",
  "Canonical points at another host.": "L’URL canonique renvoie vers un autre domaine.",
};

function localizeValue(value) {
  if (typeof value !== "string") return String(value ?? "");
  const exact = {
    missing: "absent", none: "aucun", yes: "oui", no: "non", "not found": "non trouvé",
    indexable: "indexable", declared: "déclaré", "n/a": "sans objet",
    "index, follow (default)": "index, follow (par défaut)",
    "og:title present": "og:title présent", "google-site-verification present": "google-site-verification présent",
    "collect endpoint referenced": "point de collecte référencé",
  };
  if (Object.hasOwn(exact, value)) return exact[value];
  return value.replace(/(\d+) chars\b/g, "$1 caractères")
    .replace(/(\d+) character\b/g, "$1 caractère")
    .replace(/(\d+) line\(s\)/g, "$1 lignes")
    .replace(/(\d+) URL\(s\)/g, "$1 URL")
    .replace(/(\d+) item\(s\)/g, "$1 éléments")
    .replace(/(\d+) alternate\(s\)/g, "$1 variantes")
    .replace(/\bfirst H2:/g, "premier H2 :")
    .replace(/\bindex file\b/g, "index de sitemaps")
    .replace(/\bclicks\b/g, "clics")
    .replace(/\bsessions\b/g, "sessions");
}

function localizeNote(note) {
  if (!note) return "";
  if (Object.hasOwn(notes, note)) return notes[note];
  const quoted = note.match(/^Currently: “(.+)”$/);
  if (quoted) return `Texte actuel : « ${quoted[1]} »`;
  const goal = note.match(/^(.+?) Currently: “(.+)”$/);
  if (goal && Object.hasOwn(notes, goal[1])) return `${notes[goal[1]]} Texte actuel : « ${goal[2]} »`;
  const noAlt = note.match(/^(\d+) of (\d+) carry no alt text\.$/);
  if (noAlt) return `${noAlt[1]} image(s) sur ${noAlt[2]} sans texte alternatif.`;
  if (/^https?:\/\//.test(note) || /^sitemap:\s/i.test(note)) return note; // raw URL/source evidence
  if (/^Points elsewhere: /.test(note)) return note.replace(/^Points elsewhere: /, "Pointe ailleurs : ");
  return "";
}

export function translateLiveTables(tables) {
  if (!Array.isArray(tables)) return [];
  return tables.map((table) => {
    const pair = titles[table.id];
    const isTraffic = table.id === "ga4.traffic" || table.id === "gsc.traffic";
    const subtitle = isTraffic
      ? `${String(table.subtitle ?? "").startsWith("Last 28 days") ? "28 derniers jours" : "Période du rapport"} · ${table.connected ? "propriété connectée (lecture seule)" : "EXEMPLE illustratif, non issu de votre propriété"}.`
      : pair?.[1] ?? "";
    return {
      ...table,
      title: pair?.[0] ?? "Données mesurées",
      subtitle,
      rows: Array.isArray(table.rows) ? table.rows.map((row) => ({
        ...row,
        label: labels[row.label] ?? row.label,
        value: localizeValue(row.value),
        note: localizeNote(row.note),
      })) : [],
    };
  });
}
