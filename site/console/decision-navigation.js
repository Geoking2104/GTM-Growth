/** Business navigation over the existing console routes. No provider writes. */
export const DECISION_AREAS = [
  { id: 'overview', icon: 'overview', fr: 'Cockpit & Priorités', en: 'Cockpit & Priorities', description: ['Choisissez la prochaine action à partir de vos constats.', 'Choose the next action from your findings.'] },
  { id: 'diagnose', icon: 'search', fr: 'Diagnostic & Opportunités', en: 'Diagnosis & Opportunities', description: ['Comprenez les obstacles, les intentions et les preuves disponibles.', 'Understand obstacles, intent and available evidence.'] },
  { id: 'ops', icon: 'operations', fr: 'Studio & Approbations', en: 'Studio & Approvals', description: ['Préparez les livrables et retrouvez leur circuit de validation.', 'Prepare deliverables and find their review workflow.'] },
  { id: 'impact', icon: 'ga4', fr: 'Impact & Revenus', en: 'Impact & Revenue', description: ['Lisez les résultats observés et leurs limites de mesure.', 'Read observed results and their measurement limits.'] },
  { id: 'settings', icon: 'settings', fr: 'Sources & Espace', en: 'Sources & Workspace', description: ['Reliez les sources et gérez les établissements, agents et accès.', 'Connect sources and manage locations, agents and access.'] },
];
const item = (route, icon, fr, en, frBenefit, enBenefit, source = '', badge = '') => ({ route, icon, fr, en, frBenefit, enBenefit, source, badge });
export const DECISION_VIEWS = {
  overview: [
    { id: 'board', icon: 'overview', fr: 'Priorités', en: 'Priorities', items: [] },
    { id: 'scenarios', icon: 'calculators', fr: 'Simulateurs & Scénarios', en: 'Simulators & Scenarios', items: [
      item('#calculators/ctr','percent','Explorer les hypothèses de CTR','Explore CTR assumptions','Comparez des hypothèses de planification, pas des résultats promis.','Compare planning assumptions, not promised results.'),
      item('#calculators/value','coins','Estimer la valeur du trafic','Estimate traffic value','Modifiez le volume, la position ou les clics et le CPC équivalent.','Adjust volume, position or clicks and equivalent CPC.'),
      item('#calculators/roi','overview','Simuler un scénario de ROI','Simulate an ROI scenario','Rendez explicites vos hypothèses de conversion, marge et coût.','Make conversion, margin and cost assumptions explicit.'),
      item('#calculators/budget','wallet','Préparer un budget','Plan a budget','Testez une cible de revenu avec vos hypothèses modifiables.','Test a revenue target with editable assumptions.'),
    ] },
    { id: 'reports', icon: 'report', fr: 'Rapports exportables', en: 'Exportable reports', items: [item('#report','report','Préparer le rapport du site','Prepare the website report','Générez le rapport disponible pour le domaine autorisé.','Generate the available report for the authorised domain.')] },
  ],
  diagnose: [
    { id: 'technical', icon: 'audit', fr: 'Santé technique & IA', en: 'Technical & AI health', items: [
      item('#local_seo/website','globe','Auditer mon site','Audit my website','Rassemblez les constats SEO et les prochaines corrections.','Gather SEO findings and next corrections.'),
      item('#geo','geo','Préparer le site pour les moteurs IA','Prepare for AI engines','Contrôlez robots.txt, llms.txt et les données structurées.','Check robots.txt, llms.txt and structured data.'),
      item('#audit','audit','Examiner les pages','Inspect pages','Repérez les titres, liens et balises à corriger.','Find titles, links and tags to fix.'),
      item('#performance','performance','Améliorer la vitesse','Improve speed','Distinguez tests de laboratoire et mesures terrain.','Separate lab tests from field measurements.'),
      item('#sitemap','sitemap','Contrôler la découverte des pages','Check page discovery','Explorez et auditez le sitemap.','Explore and audit the sitemap.'),
      item('#citability','citability','Faciliter la citation des contenus','Make content easier to cite','Vérifiez la structure des passages citables.','Check the structure of quotable passages.'),
      item('#catalog','products','Voir les produits et les pages','See products and pages','Gardez les preuves dans le contexte de votre offre.','Keep evidence in the context of your offer.'),
    ] },
    { id: 'tracking', icon: 'tag', fr: 'Fiabilité du tracking', en: 'Tracking reliability', items: [
      item('#tracking/tags','scan','Vérifier les balises observées','Check observed tags','Examinez les balises détectées sur la page.','Inspect tags detected on the page.'),
      item('#gtm','layers','Examiner le conteneur GTM','Inspect the GTM container','Consultez les balises, versions et changements du conteneur autorisé.','Inspect tags, versions and changes in the authorised container.','gtm'),
    ] },
    { id: 'intent', icon: 'journey', fr: 'Demande & Intention', en: 'Demand & Intent', items: [
      item('#journey','journey','Construire le parcours client','Build the customer journey','Partez des produits et besoins confirmés du client.','Start from confirmed products and customer needs.'),
      item('#gsc/query-pages','links','Relier les requêtes aux pages','Connect queries to pages','Repérez la demande réellement observée dans Google.','Find demand actually observed in Google.','gsc'),
      item('#keywords','target','Prioriser les requêtes','Prioritise queries','Examinez les opportunités et les requêtes suivies.','Inspect opportunities and tracked queries.','gsc'),
      item('#bing','bing','Comparer la demande Bing','Compare Bing demand','Consultez les requêtes et clics disponibles.','Read available queries and clicks.','bing'),
      item('#competition','competition','Examiner la concurrence IA','Inspect AI competition','Relisez les mentions et les comparaisons avant de conclure.','Review mentions and comparisons before drawing conclusions.'),
    ] },
    { id: 'local', icon: 'pin', fr: 'Réseau local', en: 'Local network', items: [
      item('#local_seo/network','store','Contrôler mes établissements','Review my locations','Consultez les contrôles, preuves et corrections par fiche.','Read controls, evidence and corrections per listing.'),
      item('#local_seo/planning','pin','Préparer un établissement','Plan a location','Identifiez les informations à réunir avant connexion.','Identify information to gather before connecting.'),
    ] },
  ],
  ops: [
    { id: 'inbox', icon: 'approved', fr: 'Approbations', en: 'Approvals', items: [
      item('#social/approvals','social','Valider les contenus sociaux','Review social content','Retrouvez les demandes et les règles d’approbation indépendante.','Find requests and independent-review rules.'),
      item('#local_seo/network','store','Valider les corrections locales','Review local corrections','Vérifiez les preuves et le contrôle après écriture.','Check evidence and readback after a write.'),
      item('#ops/articles','page','Relire un brouillon web','Review a web draft','Un transfert WordPress crée un brouillon, pas une publication.','A WordPress transfer creates a draft, not a publication.'),
      item('#gtm','tag','Examiner les changements GTM','Review GTM changes','Les confirmations natives restent nécessaires avant publication.','Native confirmations remain required before publishing.','gtm'),
      item('#crm','crm','Vérifier les identités CRM','Verify CRM identities','Reliez uniquement les identités confirmées dans le parcours.','Link only confirmed identities in the journey.'),
    ] },
    { id: 'content', icon: 'pen', fr: 'Contenus & Métadonnées', en: 'Content & Metadata', items: [
      item('#generators','generators','Préparer les métadonnées','Prepare metadata','Travaillez les titres, descriptions et plans avec le contexte client.','Work on titles, descriptions and outlines using customer context.'),
      item('#ops/articles','page','Préparer un article','Prepare an article','Construisez un brief, relisez le brouillon puis confirmez son transfert.','Build a brief, review the draft, then confirm its transfer.'),
      item('#catalog','products','Revoir les sources produit','Review product sources','Vérifiez les images, pages et caractéristiques utilisées.','Check the images, pages and product facts being used.'),
    ] },
    { id: 'diffs', icon: 'code', fr: 'Diffs techniques', en: 'Technical diffs', items: [
      item('#apply_mode','fixes','Prévisualiser une correction robots.txt','Preview a robots.txt correction','Comparez le contenu proposé. Aucune écriture directe.','Compare the proposed content. No direct write.','','preview'),
      item('#geo/llms','filecode','Préparer llms.txt','Prepare llms.txt','Validez ou générez le fichier avant une mise en place manuelle.','Validate or generate the file before manual installation.'),
      item('#geo/schema','code','Contrôler le JSON-LD','Check JSON-LD','Lisez les constats avant de préparer une correction.','Read findings before preparing a fix.'),
    ] },
    { id: 'social', icon: 'megaphone', fr: 'Social & Créateurs', en: 'Social & Creators', items: [
      item('#social/campaigns','megaphone','Organiser une campagne','Organise a campaign','Définissez les objectifs et contenus à préparer.','Define goals and content to prepare.'),
      item('#social/posts','pen','Préparer les publications','Prepare posts','Conservez les étapes de validation avant diffusion.','Keep review steps before distribution.'),
      item('#social/creators','audience','Évaluer les créateurs','Review creators','Examinez les profils et les prises de contact supervisées.','Review profiles and supervised outreach.'),
      item('#social/calendar','calendar','Voir le calendrier','View the calendar','Retrouvez les dates et statuts des contenus.','Find content dates and statuses.'),
    ] },
    { id: 'indexing', icon: 'indexnow', fr: 'Indexation & Rappels', en: 'Indexing & Reminders', items: [
      item('#indexnow','indexnow','Préparer IndexNow','Prepare IndexNow','Vérifiez les prérequis avant une soumission explicite.','Check prerequisites before an explicit submission.'),
      item('#ops/alerts','bell','Traiter les alertes','Handle alerts','Relisez les alertes disponibles et leurs sources.','Review available alerts and their sources.'),
      item('#ops/rank','competition','Suivre les positions','Track rankings','Comparez les relevés lorsque le fournisseur est configuré.','Compare observations when the provider is configured.'),
      item('#ops/prompts','message','Suivre les questions IA','Track AI questions','Choisissez les questions et déclenchez les collectes autorisées.','Choose questions and trigger authorised collections.'),
    ] },
  ],
  impact: [
    { id: 'visibility', icon: 'eye', fr: 'Trafic & Visibilité', en: 'Traffic & Visibility', items: [
      item('#gsc','google','Mesurer la visibilité Google','Measure Google visibility','Comparez les clics, impressions et requêtes de recherche.','Compare search clicks, impressions and queries.','gsc'),
      item('#bing','bing','Mesurer la visibilité Bing','Measure Bing visibility','Comparez les résultats de la période sélectionnée.','Compare results for the selected period.','bing'),
      item('#ai_visibility','eye','Examiner les réponses IA','Inspect AI answers','Consultez les réponses collectées ou importées et leurs limites.','Read collected or imported answers and their limitations.'),
      item('#social/analytics','social','Lire les résultats sociaux','Read social results','Utilisez les observations importées et connectées.','Use imported and connected observations.'),
    ] },
    { id: 'analytics', icon: 'ga4', fr: 'Conversions & Analytics', en: 'Conversions & Analytics', items: [
      item('#ga4','ga4','Comprendre les visites et conversions','Understand visits and conversions','Consultez l’acquisition, les appareils et les événements clés.','Read acquisition, devices and key events.','ga4'),
      item('#ga4/ecommerce','commerce','Lire les résultats e-commerce','Read ecommerce results','Examinez les transactions reçues dans GA4.','Inspect transactions received in GA4.','ga4'),
    ] },
    { id: 'local', icon: 'store', fr: 'Performance locale', en: 'Local performance', items: [
      item('#local_seo/network','store','Lire les résultats Google Business Profile','Read Google Business Profile results','Consultez avis et interactions par établissement autorisé.','Read reviews and interactions per authorised location.','gbp'),
    ] },
    { id: 'crm', icon: 'timeline', fr: 'Parcours & Revenus CRM', en: 'Journeys & CRM Revenue', items: [
      item('#crm','crm','Explorer les parcours observés','Explore observed journeys','Reliez les contacts et commandes par des identités déterministes.','Link contacts and orders through deterministic identities.','crm'),
      item('#commerce','commerce','Relier les boutiques','Connect stores','Préparez les connexions Shopify et PrestaShop de cet espace.','Prepare Shopify and PrestaShop connections for this workspace.'),
    ] },
  ],
  settings: [
    { id: 'sources', icon: 'plug', fr: 'Connecteurs & Statuts', en: 'Connections & Status', items: [
      item('#tracking/settings','settings','Configurer les sources de mesure','Configure measurement sources','Renseignez les propriétés et les autorisations de cet espace.','Set workspace properties and permissions.'),
      item('#tracking/status','tracking','Vérifier les accès','Check access','Consultez les résultats réels de connexion.','Read actual connection results.'),
      item('#social/connections','social','Relier les comptes sociaux','Connect social accounts','Examinez les comptes et capacités du connecteur.','Inspect connector accounts and capabilities.'),
      item('#crm/connections','crm','Configurer le CRM','Configure CRM','Choisissez le CRM natif ou un connecteur client.','Choose native CRM or a customer connector.'),
      item('#commerce','commerce','Configurer les boutiques','Configure stores','Gérez les intégrations commerciales autorisées.','Manage authorised commerce integrations.'),
    ] },
    { id: 'locations', icon: 'building', fr: 'Établissements', en: 'Locations', items: [item('#local_seo/network','store','Organiser le registre local','Organise the location registry','Gérez les établissements, pays, langues et accès locaux.','Manage locations, countries, languages and local access.')] },
    { id: 'agents', icon: 'agents', fr: 'Agents & Intégrations', en: 'Agents & Integrations', items: [item('#agents','agents','Gérer les agents connectés','Manage connected agents','Examinez les autorisations, expirations et révocations.','Review permissions, expiry and revocation.')] },
    { id: 'access', icon: 'key', fr: 'Abonnement & Accès', en: 'Subscription & Access', items: [
      item('#tracking/access','key','Gérer les accès à l’espace','Manage workspace access','Retrouvez les rôles et autorisations existants.','Find existing roles and permissions.'),
      item('#billing','billing','Consulter l’abonnement','View subscription','Vérifiez la disponibilité et l’état réel de l’offre Cloud.','Check availability and actual Cloud subscription status.'),
    ] },
  ],
};

/** Legacy links stay valid. Only the primary navigation is reorganised. */
export function decisionLocation(section, tab = '') {
  if (section === 'overview') return { area: 'overview', view: ['scenarios', 'reports'].includes(tab) ? tab : 'board' };
  if (['diagnose','impact','settings'].includes(section)) return { area: section, view: tab || DECISION_VIEWS[section][0].id };
  if (section === 'portfolio') return { area: 'portfolio', view: 'workspaces' };
  if (section === 'ops' && DECISION_VIEWS.ops.some(v => v.id === tab || (!tab && v.id === 'inbox'))) return { area: 'ops', view: tab || 'inbox' };
  const overrides = {
    'local_seo/website': ['diagnose','technical'], 'gsc/sitemaps': ['diagnose','technical'],
    'ops/prompts': ['ops','indexing'], 'ops/rank': ['ops','indexing'], 'ops/articles': ['ops','content'], 'ops/alerts': ['ops','indexing'],
    'crm/connections': ['settings','sources'], 'social/connections': ['settings','sources'],
    'social/analytics': ['impact','visibility'], 'social/approvals': ['ops','inbox'],
    'tracking/tags': ['diagnose','tracking'], 'tracking/access': ['settings','access'],
    'gsc/query-pages': ['diagnose','intent'],
  };
  const defaults = { local_seo: ['diagnose','local'], catalog: ['diagnose','technical'], commerce: ['settings','sources'], competition: ['diagnose','intent'], ai_visibility: ['impact','visibility'], gsc: ['impact','visibility'], ga4: ['impact','analytics'], bing: ['impact','visibility'], geo: ['diagnose','technical'], citability: ['diagnose','technical'], indexnow: ['ops','indexing'], sitemap: ['diagnose','technical'], performance: ['diagnose','technical'], journey: ['diagnose','intent'], crm: ['impact','crm'], social: ['ops','social'], apply_mode: ['ops','diffs'], search: ['diagnose','intent'], keywords: ['diagnose','intent'], tracking: ['settings','sources'], billing: ['settings','access'], agents: ['settings','agents'], gtm: ['diagnose','tracking'], audit: ['diagnose','technical'], generators: ['ops','content'], calculators: ['overview','scenarios'], report: ['overview','reports'], platform: ['settings','access'] };
  const key = `${section}/${tab}`;
  const [area, view] = Object.hasOwn(overrides, key) ? overrides[key] : Object.hasOwn(defaults, section) ? defaults[section] : ['overview','board'];
  return { area, view };
}
export function decisionLabel(id, language) {
  const a = DECISION_AREAS.find(a => a.id === id);
  return a ? a[language === 'fr' ? 'fr' : 'en'] : (language === 'fr' ? 'Portfolio' : 'Portfolio');
}
