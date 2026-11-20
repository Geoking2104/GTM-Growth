/** Context for the console coach. Pure data: no network, DOM, storage or execution. */
import { DECISION_AREAS, DECISION_VIEWS, decisionLocation } from './decision-navigation.js';

const pick = (value, language) => Array.isArray(value) ? value[language === 'fr' ? 0 : 1] : value;
const own = (object, key) => Object.hasOwn(object, key) ? object[key] : undefined;
const link = (href, fr, en) => ({ href, label: [fr, en] });
const record = (title, summary, origin, relations, consequence, freshness, next) => ({ title, summary, origin, relations, consequence, freshness, next });
const readAt = ['La date de lecture décrit la consultation. La date des observations décrit leur fraîcheur ; elles peuvent être différentes.', 'Read time describes retrieval. Observation dates describe data freshness; the two can differ.'];
const configAt = ['Configuration actuelle de l’espace. Vérifiez les accès pour connaître leur état ; un identifiant enregistré ne prouve pas une connexion.', 'Current workspace configuration. Check access to know its state; a saved identifier does not prove a connection.'];
const observedAt = ['Relisez la période et la date des observations avant de comparer. Une donnée absente reste inconnue, jamais remplacée par zéro.', 'Review the period and observation dates before comparing. Missing data stays unknown and is never replaced with zero.'];
const planAt = ['Plan enregistré ou en cours de préparation. Les dates du plan ne prouvent pas qu’une action a été exécutée.', 'A saved plan or work in preparation. Planning dates do not prove an action was executed.'];

export const COACH_GOALS = Object.freeze([
  { id: 'traffic', fr: 'Attirer plus de visiteurs', en: 'Attract more visitors', href: '#gsc/query-pages' },
  { id: 'leads', fr: 'Obtenir des prospects', en: 'Generate leads', href: '#ga4' },
  { id: 'sales', fr: 'Comprendre mes ventes', en: 'Understand my sales', href: '#ga4/ecommerce' },
  { id: 'ai-visibility', fr: 'Être mieux compris par les IA', en: 'Be better understood by AI', href: '#ai_visibility' },
  { id: 'local', fr: 'Développer ma présence locale', en: 'Grow my local presence', href: '#local_seo/network' },
].map(Object.freeze));

const GUIDES = {
  overview: record(
    ['Votre point de départ', 'Your starting point'],
    ['Choisissez une priorité, comprenez sa preuve, puis préparez l’action à suivre.', 'Choose a priority, understand its evidence, then prepare the action to take.'],
    ['Les constats proviennent de l’audit du site sélectionné ; les mesures proviennent des sources effectivement lues dans cet espace.', 'Findings come from the selected website audit; measurements come from sources actually read in this workspace.'],
    [link('#diagnose', 'Examiner les constats', 'Inspect findings'), link('#studio/campaigns', 'Planifier les actions', 'Plan actions'), link('#impact', 'Mesurer les résultats', 'Measure results')],
    ['Une correction peut modifier le prochain audit. Son effet sur le trafic ou le revenu doit être mesuré séparément, sur une période comparable.', 'A correction can change the next audit. Its effect on traffic or revenue must be measured separately over a comparable period.'],
    readAt, link('#diagnose', 'Comprendre ma prochaine priorité', 'Understand my next priority')),
  diagnose: record(
    ['Comprendre ce qui bloque', 'Understand what is blocking progress'],
    ['Reliez chaque constat à la page, au contrôle et à la preuve qui l’expliquent.', 'Connect each finding to the page, check and evidence that explain it.'],
    ['Les lectures de pages publiques et les contrôles disponibles fournissent les preuves ; les sources connectées apportent des observations supplémentaires.', 'Public page reads and available checks provide evidence; connected sources add observations.'],
    [link('#local_seo/website', 'Audit du site', 'Website audit'), link('#studio/campaigns', 'Scénario de correction', 'Correction scenario')],
    ['Corriger un élément peut lever un blocage technique. Une nouvelle lecture vérifie le changement ; elle ne garantit pas un classement ou une vente.', 'Fixing an item can remove a technical blocker. A new read verifies the change; it does not guarantee a ranking or sale.'],
    readAt, link('#local_seo/website', 'Ouvrir les preuves de mon site', 'Open my website evidence')),
  ops: record(
    ['Passer du constat au plan', 'Turn findings into a plan'],
    ['Préparez les contenus et corrections, puis suivez le circuit de validation de chaque canal.', 'Prepare content and corrections, then follow each channel’s review workflow.'],
    ['Les brouillons, propositions et demandes d’approbation proviennent des modules de cet espace, avec leurs propres états.', 'Drafts, proposals and approval requests come from this workspace’s modules, each with its own state.'],
    [link('#studio/campaigns', 'Dates et responsables', 'Dates and owners'), link('#ops/inbox', 'Demandes à examiner', 'Items to review'), link('#impact', 'Résultats à suivre', 'Results to monitor')],
    ['Un plan ou un brouillon prépare une action. L’approbation et l’exécution restent des étapes distinctes dans le module concerné.', 'A plan or draft prepares an action. Approval and execution remain separate steps in the relevant module.'],
    planAt, link('#studio/campaigns', 'Préparer un scénario', 'Prepare a scenario')),
  impact: record(
    ['Lire les résultats observés', 'Read observed results'],
    ['Comparez des observations de même source, de même périmètre et de périodes comparables.', 'Compare observations from the same source and scope over comparable periods.'],
    ['Les connecteurs et imports autorisés fournissent les mesures affichées. Une source configurée ou un plan préparé ne constitue pas un résultat.', 'Authorised connectors and imports supply the displayed measurements. A configured source or prepared plan is not a result.'],
    [link('#settings/sources', 'Sources et accès', 'Sources and access'), link('#diagnose/intent', 'Demande observée', 'Observed demand'), link('#studio/campaigns', 'Actions planifiées', 'Planned actions')],
    ['Une variation est un signal à examiner. Croisez-la avec les changements, la période, le consentement et la qualité de mesure avant d’attribuer une cause.', 'A change is a signal to investigate. Check changes, period, consent and measurement quality before attributing a cause.'],
    observedAt, link('#impact/visibility', 'Choisir une mesure à suivre', 'Choose a measurement to monitor')),
  settings: record(
    ['Rendre les sources utilisables', 'Make sources usable'],
    ['Choisissez les données à relier et vérifiez les autorisations de l’espace actif.', 'Choose which data to connect and verify permissions for the active workspace.'],
    ['Cette vue utilise la configuration de l’espace et les résultats explicites des vérifications d’accès.', 'This view uses workspace configuration and explicit access-check results.'],
    [link('#tracking/settings', 'Configurer une source', 'Configure a source'), link('#tracking/status', 'Vérifier les accès', 'Check access'), link('#overview', 'Revenir au parcours', 'Return to the journey')],
    ['Modifier une propriété ou une autorisation change le périmètre des lectures futures. Vérifiez l’espace et la propriété avant d’enregistrer.', 'Changing a property or permission changes the scope of future reads. Check the workspace and property before saving.'],
    configAt, link('#tracking/status', 'Vérifier les sources disponibles', 'Check available sources')),
  search: record(
    ['Relier les recherches aux pages', 'Connect searches to pages'],
    ['Repérez les recherches qui produisent des impressions et des clics, puis ouvrez les pages correspondantes.', 'Find searches that generate impressions and clicks, then open the related pages.'],
    ['Search Console ou Bing Webmaster fournit les observations de la propriété autorisée et de la période sélectionnée.', 'Search Console or Bing Webmaster supplies observations for the authorised property and selected period.'],
    [link('#gsc/query-pages', 'Requêtes et pages', 'Queries and pages'), link('#journey', 'Besoins du public', 'Audience needs'), link('#studio/campaigns', 'Planifier une amélioration', 'Plan an improvement')],
    ['Une hausse des clics peut accompagner une évolution de la demande, des impressions ou du taux de clic. Elle ne prouve pas une hausse des conversions.', 'More clicks can accompany changes in demand, impressions or click-through rate. It does not prove more conversions.'],
    ['Ces rapports ont un délai de disponibilité. Utilisez la période affichée ; l’actualisation de la console ne rend pas les données instantanées.', 'These reports have a reporting delay. Use the displayed period; refreshing the console does not make the data instantaneous.'],
    link('#gsc/query-pages', 'Examiner les requêtes et les pages', 'Inspect queries and pages')),
  analytics: record(
    ['Comprendre les visites et actions', 'Understand visits and actions'],
    ['Lisez les sessions, événements et conversions en vérifiant leur définition.', 'Read sessions, events and conversions while checking their definitions.'],
    ['GA4 fournit les agrégats de la propriété autorisée. La collecte dépend des balises, du consentement et des événements configurés.', 'GA4 supplies aggregates from the authorised property. Collection depends on tags, consent and configured events.'],
    [link('#diagnose/tracking', 'Fiabilité de la mesure', 'Measurement reliability'), link('#ga4/ecommerce', 'Achats observés', 'Observed purchases'), link('#crm', 'Parcours identifiés', 'Identified journeys')],
    ['Modifier une balise ou un événement peut changer les volumes mesurés sans changer le comportement réel. Validez le tracking avant d’interpréter une variation.', 'Changing a tag or event can change measured volumes without changing actual behaviour. Validate tracking before interpreting a change.'],
    observedAt, link('#diagnose/tracking', 'Vérifier les événements clés', 'Check key events')),
  realtime: record(
    ['Observer l’activité récente', 'Observe recent activity'],
    ['Consultez la fenêtre récente renvoyée par GA4 pour vérifier que des événements arrivent.', 'Read the recent window returned by GA4 to check whether events are arriving.'],
    ['Le rapport temps réel GA4 de la propriété autorisée fournit cette fenêtre d’activité.', 'The GA4 realtime report from the authorised property supplies this activity window.'],
    [link('#diagnose/tracking', 'Contrôler les balises', 'Check tags'), link('#ga4', 'Historique consolidé', 'Consolidated history')],
    ['Une variation dans une fenêtre courte peut refléter le renouvellement des visiteurs ou la collecte. Comparez avec l’historique avant de décider.', 'A short-window change can reflect visitor turnover or collection behaviour. Compare with history before deciding.'],
    ['La fenêtre et l’heure de lecture définissent ce qui est récent. Un rafraîchissement de l’écran n’est pas une nouvelle observation si la source n’a pas été relue.', 'The window and retrieval time define what is recent. A screen refresh is not a new observation unless the source was read again.'],
    link('#ga4/realtime', 'Lire l’activité récente', 'Read recent activity')),
  visibility: record(
    ['Comprendre les réponses des IA', 'Understand AI answers'],
    ['Relisez les réponses et citations avant de comparer la présence de votre marque.', 'Review answers and citations before comparing your brand’s presence.'],
    ['Les jeux de réponses importés ou collectés contiennent une question, un moteur, une date et une preuve. Les mentions validées restent distinctes des mentions à vérifier.', 'Imported or collected answer datasets contain a question, engine, date and evidence. Confirmed mentions remain separate from mentions awaiting review.'],
    [link('#journey/prompts', 'Questions suivies', 'Tracked questions'), link('#competition', 'Panel concurrentiel', 'Competitor panel'), link('#geo', 'Préparation du site', 'Website readiness')],
    ['Ajouter une question, un moteur ou un concurrent change le panel. Comparez des panels équivalents ; la présence observée n’est ni une part de marché ni une garantie de recommandation.', 'Adding a question, engine or competitor changes the panel. Compare equivalent panels; observed presence is neither market share nor a recommendation guarantee.'],
    ['La date de chaque réponse décrit sa fraîcheur. La date d’import ne rajeunit pas une observation.', 'Each answer’s date describes its freshness. Importing an observation does not make it newer.'],
    link('#ai_visibility', 'Examiner les réponses et preuves', 'Inspect answers and evidence')),
  journey: record(
    ['Relier l’offre aux besoins du public', 'Connect the offer to audience needs'],
    ['Construisez les étapes du parcours à partir de votre offre et de questions à valider.', 'Build journey stages from your offer and questions to validate.'],
    ['Les contenus du site et les éléments confirmés par l’utilisateur alimentent le parcours. Une question proposée reste une hypothèse sans observation associée.', 'Website content and user-confirmed facts feed the journey. A suggested question remains a hypothesis without a linked observation.'],
    [link('#catalog', 'Offre et images sources', 'Offer and source images'), link('#diagnose/intent', 'Demande documentée', 'Evidence-based demand'), link('#journey/prompts', 'Questions suivies', 'Tracked questions')],
    ['Modifier une audience ou une étape change les hypothèses et contenus à préparer. Cela ne crée pas de demande mesurée ni de contact CRM.', 'Changing an audience or stage changes hypotheses and content to prepare. It does not create measured demand or a CRM contact.'],
    planAt, link('#journey/prompts', 'Choisir les questions à vérifier', 'Choose questions to verify')),
  intent: record(
    ['Relier une intention à une preuve', 'Connect intent to evidence'],
    ['Associez une recherche ou une réponse IA observée à une étape et à une page.', 'Link an observed search or AI answer to a stage and page.'],
    ['Les observations Search Console, Bing et les réponses IA enregistrées fournissent des preuves datées ; les associations sont confirmées par l’utilisateur.', 'Search Console and Bing observations and saved AI answers provide dated evidence; users confirm the associations.'],
    [link('#gsc/query-pages', 'Requêtes sources', 'Source queries'), link('#journey', 'Étapes du parcours', 'Journey stages'), link('#studio/campaigns', 'Actions à préparer', 'Actions to prepare')],
    ['Associer une intention organise vos preuves et priorités. Cela ne démontre pas qu’un contenu a causé une conversion.', 'Linking intent organises evidence and priorities. It does not demonstrate that content caused a conversion.'],
    observedAt, link('#diagnose/intent', 'Examiner les preuves d’intention', 'Inspect intent evidence')),
  catalog: record(
    ['Voir ce qui illustre votre offre', 'See what illustrates your offer'],
    ['Vérifiez les pages, images et caractéristiques utilisées dans les parcours et contenus.', 'Check the pages, images and features used in journeys and content.'],
    ['Les métadonnées, données structurées et imports confirmés fournissent les titres, images et informations produit.', 'Metadata, structured data and confirmed imports provide product titles, images and facts.'],
    [link('#journey', 'Parcours client', 'Customer journey'), link('#ops/articles', 'Contenu à préparer', 'Content to prepare'), link('#geo/schema', 'Données structurées', 'Structured data')],
    ['Une correction de produit ou d’image change les références utilisées pour préparer les contenus. Vérifiez les droits d’usage et la source avant diffusion.', 'Correcting a product or image changes the references used to prepare content. Check usage rights and provenance before distribution.'],
    readAt, link('#journey', 'Utiliser l’offre dans mon parcours', 'Use the offer in my journey')),
  measurement: record(
    ['Vérifier la fiabilité des mesures', 'Check measurement reliability'],
    ['Reliez les balises et événements observés aux mesures que vous souhaitez interpréter.', 'Connect observed tags and events to the measurements you want to interpret.'],
    ['Le conteneur GTM autorisé et les contrôles de mesure disponibles fournissent les constats. Un diagnostic partiel reste signalé comme tel.', 'The authorised GTM container and available measurement checks provide findings. A partial diagnosis stays labelled as partial.'],
    [link('#gtm', 'Conteneur et versions', 'Container and versions'), link('#ga4', 'Événements mesurés', 'Measured events'), link('#tracking/status', 'Accès aux sources', 'Source access')],
    ['Changer une balise, un déclencheur ou un consentement peut modifier la collecte. Examinez les différences et contrôlez après publication.', 'Changing a tag, trigger or consent can change collection. Review differences and verify after publication.'],
    readAt, link('#diagnose/tracking', 'Lire le diagnostic de mesure', 'Read the measurement diagnosis')),
  campaigns: record(
    ['Organiser une campagne visuelle', 'Organise a visual campaign'],
    ['Transformez les constats en actions par canal, avec dates, responsables et dépendances.', 'Turn findings into channel actions with dates, owners and dependencies.'],
    ['Les constats sélectionnés alimentent le scénario. Les dates, responsabilités, coûts et propositions restent des données de planification modifiables.', 'Selected findings feed the scenario. Dates, responsibilities, costs and proposals remain editable planning data.'],
    [link('#diagnose', 'Analyses sources', 'Source analyses'), link('#ops/inbox', 'Approbations par canal', 'Channel approvals'), link('#impact', 'Mesures de résultat', 'Outcome measurements')],
    ['Déplacer une date ou une dépendance peut décaler les actions liées. L’aperçu permet de vérifier les effets ; enregistrer le scénario ne publie pas la campagne.', 'Moving a date or dependency can shift related actions. Preview lets you inspect the effects; saving the scenario does not publish the campaign.'],
    planAt, link('#studio/campaigns', 'Construire ou adapter mon scénario', 'Build or adapt my scenario')),
  local: record(
    ['Comprendre chaque établissement', 'Understand each location'],
    ['Comparez les établissements à partir de leur registre et d’observations localisées.', 'Compare locations using their registry and location-specific observations.'],
    ['Le registre, les observations importées et les comptes Google Business Profile autorisés fournissent les preuves par établissement.', 'The registry, imported observations and authorised Google Business Profile accounts supply evidence per location.'],
    [link('#local_seo/network', 'Registre et contrôles', 'Registry and checks'), link('#local_seo/planning', 'Préparer les informations', 'Prepare information'), link('#studio/campaigns', 'Plan par établissement', 'Plan by location')],
    ['Modifier une fiche peut changer les informations publiques de l’établissement après validation. Les résultats locaux dépendent aussi de la requête, du lieu et de la date.', 'Changing a listing can change the location’s public information after review. Local results also depend on query, location and date.'],
    observedAt, link('#local_seo/network', 'Examiner un établissement', 'Inspect a location')),
  social: record(
    ['Relier les contenus aux canaux sociaux', 'Connect content to social channels'],
    ['Préparez les contenus, vérifiez les comptes et suivez les validations et résultats disponibles.', 'Prepare content, check accounts and follow available approvals and results.'],
    ['Les contenus enregistrés, connexions Postiz et observations importées alimentent ce module. Un contenu préparé n’est pas une publication confirmée.', 'Saved content, Postiz connections and imported observations feed this module. Prepared content is not a confirmed publication.'],
    [link('#social/connections', 'Comptes autorisés', 'Authorised accounts'), link('#social/approvals', 'Validations', 'Approvals'), link('#social/analytics', 'Observations sociales', 'Social observations')],
    ['Modifier un contenu ou sa destination peut nécessiter une nouvelle validation. Une publication réussie et ses résultats doivent être confirmés par le canal.', 'Changing content or its destination can require a new review. A successful publication and its results must be confirmed by the channel.'],
    readAt, link('#social/approvals', 'Examiner les contenus à valider', 'Review content awaiting approval')),
  crm: record(
    ['Comprendre les parcours identifiés', 'Understand identified journeys'],
    ['Reliez contacts, interactions et commandes en conservant la méthode d’identification.', 'Connect contacts, interactions and orders while retaining the identity method.'],
    ['Les données CRM autorisées et les événements reçus fournissent les parcours. Les rapprochements d’identité doivent être vérifiables.', 'Authorised CRM data and received events supply journeys. Identity matches must be verifiable.'],
    [link('#crm/connections', 'Source CRM', 'CRM source'), link('#commerce', 'Commandes', 'Orders'), link('#diagnose/tracking', 'Qualité de collecte', 'Collection quality')],
    ['Une identité ou une source corrigée peut changer les regroupements de parcours. L’attribution décrit une règle de rapprochement, pas une causalité démontrée.', 'Correcting an identity or source can change journey groupings. Attribution describes a matching rule, not proven causality.'],
    observedAt, link('#crm', 'Examiner les parcours et identités', 'Inspect journeys and identities')),
  commerce: record(
    ['Relier les ventes à leur source', 'Connect sales to their source'],
    ['Consultez les commandes et le catalogue de boutiques autorisées, avec leur provenance.', 'Read orders and catalogues from authorised stores with their provenance.'],
    ['Les synchronisations et webhooks Shopify ou PrestaShop fournissent les commandes et produits. Les règles d’attribution restent visibles.', 'Shopify or PrestaShop synchronisations and webhooks supply orders and products. Attribution rules remain visible.'],
    [link('#crm', 'Parcours associés', 'Related journeys'), link('#catalog', 'Produits sources', 'Source products'), link('#ga4/ecommerce', 'Mesure GA4', 'GA4 measurement')],
    ['Changer une connexion ou une règle de rapprochement peut modifier le périmètre des revenus affichés. Comparez des périmètres et devises compatibles.', 'Changing a connection or matching rule can change the scope of displayed revenue. Compare compatible scopes and currencies.'],
    observedAt, link('#commerce', 'Vérifier mes boutiques et données', 'Check my stores and data')),
  content: record(
    ['Préparer un contenu fondé sur des preuves', 'Prepare evidence-based content'],
    ['Vérifiez l’objectif, l’audience et les sources avant de relire une proposition.', 'Check the goal, audience and sources before reviewing a proposal.'],
    ['Les informations de l’espace, briefs et sources sélectionnées alimentent les propositions. Un texte généré reste un brouillon à relire.', 'Workspace information, briefs and selected sources feed proposals. Generated text remains a draft to review.'],
    [link('#catalog', 'Informations et images', 'Facts and images'), link('#journey', 'Besoins et intentions', 'Needs and intent'), link('#ops/inbox', 'Circuit de validation', 'Review workflow')],
    ['Modifier le brief change les propositions suivantes. Un transfert WordPress crée un brouillon ; la publication suit son circuit propre.', 'Changing the brief changes subsequent proposals. A WordPress transfer creates a draft; publication follows its own workflow.'],
    planAt, link('#ops/articles', 'Préparer et relire un brouillon', 'Prepare and review a draft')),
  fixes: record(
    ['Comprendre une correction avant application', 'Understand a fix before applying it'],
    ['Comparez l’état observé et la proposition avant toute modification.', 'Compare the observed state and proposal before making a change.'],
    ['Les fichiers publics, contrôles d’audit et choix de l’utilisateur alimentent l’aperçu des différences.', 'Public files, audit checks and user choices feed the differences preview.'],
    [link('#geo', 'Contrôles sources', 'Source checks'), link('#apply_mode', 'Aperçu des corrections', 'Fix preview'), link('#audit', 'Contrôle après changement', 'Post-change check')],
    ['Une règle robots.txt ou un balisage modifié peut affecter l’accès des crawlers et l’interprétation du site. Vérifiez le périmètre avant mise en place.', 'A changed robots.txt rule or markup can affect crawler access and site interpretation. Check the scope before implementation.'],
    readAt, link('#apply_mode', 'Comparer la proposition', 'Compare the proposal')),
  reports: record(
    ['Partager un bilan traçable', 'Share a traceable review'],
    ['Relisez les sources, dates et limites du rapport avant de le transmettre.', 'Review report sources, dates and limitations before sharing it.'],
    ['Le rapport reprend les preuves et observations disponibles pour le domaine et l’espace autorisés au moment de sa génération.', 'The report uses evidence and observations available for the authorised domain and workspace when it is generated.'],
    [link('#diagnose', 'Constats détaillés', 'Detailed findings'), link('#impact', 'Mesures observées', 'Observed measurements'), link('#studio/campaigns', 'Plan d’action', 'Action plan')],
    ['Un nouvel export peut refléter des preuves ou périodes différentes. Conservez la date et le périmètre pour interpréter les écarts.', 'A new export can reflect different evidence or periods. Retain the date and scope to interpret differences.'],
    ['Le rapport est un instantané. Sa date de génération ne remplace pas la date des observations qu’il contient.', 'A report is a snapshot. Its generation date does not replace the observation dates it contains.'],
    link('#report', 'Préparer le rapport', 'Prepare the report')),
  simulation: record(
    ['Explorer une hypothèse', 'Explore an assumption'],
    ['Faites varier les entrées pour comprendre le calcul et ses limites.', 'Change inputs to understand the calculation and its limits.'],
    ['Les valeurs saisies et la formule du simulateur produisent l’estimation ; il ne s’agit pas de résultats observés.', 'Entered values and the simulator formula produce the estimate; these are not observed results.'],
    [link('#impact', 'Comparer aux observations', 'Compare with observations'), link('#studio/campaigns', 'Documenter le scénario', 'Document the scenario')],
    ['Changer une hypothèse modifie mécaniquement l’estimation. Cela ne prédit pas la réaction des clients, des moteurs ou du marché.', 'Changing an assumption mechanically changes the estimate. It does not predict customers, search engines or the market.'],
    ['Scénario calculé à partir des valeurs affichées ; aucune collecte en temps réel n’est impliquée.', 'Scenario calculated from the displayed inputs; no realtime collection is implied.'],
    link('#overview/scenarios', 'Choisir une hypothèse à comparer', 'Choose an assumption to compare')),
  agents: record(
    ['Comprendre les accès des agents', 'Understand agent access'],
    ['Vérifiez qui peut lire ou agir, dans quel périmètre et jusqu’à quelle échéance.', 'Check who can read or act, within which scope and until which expiry.'],
    ['Les autorisations et liaisons d’agents de cet espace définissent les capacités disponibles.', 'This workspace’s agent permissions and bindings define available capabilities.'],
    [link('#tracking/access', 'Rôles de l’espace', 'Workspace roles'), link('#agents', 'Agents connectés', 'Connected agents')],
    ['Réduire ou révoquer un accès limite les opérations futures autorisées. Cela ne retire pas une action déjà exécutée ou une information déjà partagée.', 'Restricting or revoking access limits future authorised operations. It does not undo an action already performed or information already shared.'],
    configAt, link('#agents', 'Examiner les autorisations', 'Inspect permissions')),
  access: record(
    ['Gérer l’espace et ses droits', 'Manage the workspace and permissions'],
    ['Vérifiez le rôle et le périmètre avant de modifier des accès ou l’abonnement.', 'Check the role and scope before changing access or subscription.'],
    ['Les appartenances à l’espace, rôles et états d’abonnement enregistrés déterminent les accès affichés.', 'Workspace memberships, roles and recorded subscription states determine displayed access.'],
    [link('#tracking/access', 'Accès des membres', 'Member access'), link('#billing', 'Abonnement Cloud', 'Cloud subscription'), link('#agents', 'Autorisations des agents', 'Agent permissions')],
    ['Un changement de rôle ou d’abonnement peut modifier les fonctions accessibles. Relisez le récapitulatif et les conditions avant confirmation.', 'A role or subscription change can alter available functions. Review the summary and terms before confirming.'],
    configAt, link('#tracking/access', 'Examiner les accès', 'Inspect access')),
  portfolio: record(
    ['Coordonner plusieurs espaces', 'Coordinate multiple workspaces'],
    ['Comparez les états des espaces auxquels votre compte est autorisé à accéder.', 'Compare states of workspaces your account is authorised to access.'],
    ['Les appartenances du compte et les informations disponibles dans chaque espace alimentent cette vue.', 'Account memberships and information available in each workspace feed this view.'],
    [link('#overview', 'Ouvrir le cockpit actif', 'Open the active cockpit'), link('#settings/sources', 'Sources de l’espace', 'Workspace sources')],
    ['Changer d’espace change le périmètre des données et des actions. Une mesure d’un client ne doit pas être interprétée comme celle d’un autre.', 'Switching workspaces changes the scope of data and actions. One customer’s measurement must not be interpreted as another’s.'],
    readAt, link('#portfolio', 'Choisir un espace autorisé', 'Choose an authorised workspace')),
  operations: record(
    ['Suivre les traitements enregistrés', 'Follow recorded processing'],
    ['Examinez les questions, collectes, positions et alertes avant de relancer une opération.', 'Inspect questions, collections, rankings and alerts before starting an operation again.'],
    ['Les questions sauvegardées, observations datées et journaux des traitements fournissent les états affichés.', 'Saved questions, dated observations and processing logs supply the displayed states.'],
    [link('#ops/prompts', 'Questions et collectes', 'Questions and collections'), link('#ops/alerts', 'Alertes', 'Alerts'), link('#ai_visibility', 'Réponses observées', 'Observed answers')],
    ['Lancer une collecte peut consommer les quotas ou crédits du fournisseur choisi. Son résultat doit être examiné ; une question enregistrée ne mesure pas la demande.', 'Running a collection can use the selected provider’s quota or credits. Review its result; a saved question does not measure demand.'],
    observedAt, link('#ops/alerts', 'Examiner les changements signalés', 'Inspect reported changes')),
};

const SECTION_GUIDE = Object.freeze({
  overview: 'overview', diagnose: 'diagnose', impact: 'impact', settings: 'settings', ops: 'ops',
  studio: 'campaigns', gsc: 'search', bing: 'search', search: 'search', keywords: 'search',
  ga4: 'analytics', ai_visibility: 'visibility', competition: 'visibility', journey: 'journey',
  catalog: 'catalog', tracking: 'settings', gtm: 'measurement', local_seo: 'local',
  social: 'social', crm: 'crm', commerce: 'commerce', generators: 'content', apply_mode: 'fixes',
  geo: 'diagnose', citability: 'diagnose', audit: 'diagnose', performance: 'diagnose', sitemap: 'diagnose',
  indexnow: 'fixes', calculators: 'simulation', report: 'reports', agents: 'agents', billing: 'access',
  platform: 'access', portfolio: 'portfolio',
});
const ROUTE_GUIDE = Object.freeze({
  'overview/scenarios': 'simulation', 'overview/reports': 'reports', 'overview/plan': 'campaigns',
  'diagnose/intent': 'intent', 'diagnose/tracking': 'measurement', 'diagnose/local': 'local',
  'impact/visibility': 'impact', 'impact/analytics': 'analytics', 'impact/local': 'local', 'impact/crm': 'crm',
  'settings/agents': 'agents', 'settings/access': 'access', 'settings/locations': 'local',
  'ops/campaigns': 'campaigns', 'ops/content': 'content', 'ops/diffs': 'fixes', 'ops/social': 'social',
  'ops/articles': 'content', 'ops/indexing': 'operations', 'ops/prompts': 'operations', 'ops/rank': 'operations', 'ops/alerts': 'operations',
  'ga4/realtime': 'realtime', 'tracking/tags': 'measurement', 'tracking/access': 'access',
  'local_seo/website': 'diagnose', 'crm/connections': 'settings', 'social/connections': 'settings',
  'social/analytics': 'social', 'journey/prompts': 'operations', 'geo/llms': 'fixes', 'geo/schema': 'fixes',
});
const routePart = (value, fallback = '') => typeof value === 'string' && /^[a-z0-9_-]{1,80}$/.test(value) ? value : fallback;
const localLink = (value, language) => ({ href: value.href, label: pick(value.label, language) });

/** An explanatory contract for every registered route; unknown routes remain generic. */
export function getCoachGuide(section = 'overview', tab = '', language = 'en') {
  section = routePart(section, 'overview'); tab = routePart(tab);
  const key = own(ROUTE_GUIDE, `${section}/${tab}`) || own(SECTION_GUIDE, section) || 'overview';
  const data = GUIDES[key];
  const location = decisionLocation(section, tab);
  const tone = DECISION_AREAS.some(area => area.id === location.area) ? location.area : 'settings';
  const directView = own(DECISION_VIEWS, section)?.find(view => view.id === tab);
  return {
    id: `${section}${tab ? `/${tab}` : ''}`, title: directView ? directView[language === 'fr' ? 'fr' : 'en'] : pick(data.title, language),
    summary: pick(data.summary, language), origin: pick(data.origin, language),
    relations: data.relations.map(item => localLink(item, language)), consequence: pick(data.consequence, language),
    freshness: pick(data.freshness, language), next: localLink(data.next, language), tone, illustration: tone,
  };
}

const normalise = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const ELEMENTS = [
  ['credentials', /(?:api.?key|cle api|jeton|token|secret|mot de passe|password)/,
    ['Identifiant ou secret utilisé par une connexion autorisée. L’aide ne lit ni n’affiche sa valeur.', 'Identifier or secret used by an authorised connection. Help does not read or display its value.'],
    ['Modifier ou révoquer ce secret peut interrompre les lectures ou actions dépendantes. Vérifiez le fournisseur et les accès concernés.', 'Changing or revoking this secret can interrupt dependent reads or actions. Check the provider and affected permissions.']],
  ['freshness', /(?:fraicheur|actualis|mis(?:e)? a jour|read at|retriev|refresh|updated|freshness|last read|lu a)/,
    ['L’heure de lecture et les dates des observations proviennent du résultat fourni par la source.', 'Retrieval time and observation dates come from the result supplied by the source.'],
    ['Actualiser relit la source lorsque le module le permet ; cela ne supprime pas son délai de traitement. Comparez la date d’observation, pas seulement l’heure d’affichage.', 'Refreshing reads the source again when the module supports it; it does not remove the source’s processing delay. Compare observation dates, not just display time.']],
  ['readiness', /(?:score|note|preparation|readiness|citabil|controles|checks|conform)/,
    ['Les contrôles et preuves de l’analyse déterminent la note ou l’état affiché. Les contrôles inconnus ou non applicables gardent leur propre statut.', 'Analysis checks and evidence determine the displayed score or state. Unknown or inapplicable checks retain their own status.'],
    ['Une correction peut modifier un contrôle après vérification. Une note technique ne mesure pas les ventes, ni les mentions réelles dans les réponses IA.', 'A correction can change a check after verification. A technical score measures neither sales nor actual mentions in AI answers.']],
  ['ctr', /(?:\bctr\b|taux de clic|click.?through)/,
    ['Le taux de clic rapporte les clics aux impressions du même périmètre et de la même période.', 'Click-through rate relates clicks to impressions within the same scope and period.'],
    ['Le taux peut évoluer parce que les clics, les impressions ou le mélange de requêtes changent. Un taux supérieur avec moins d’impressions ne garantit pas plus de visites.', 'The rate can change because clicks, impressions or the query mix change. A higher rate with fewer impressions does not guarantee more visits.']],
  ['position', /(?:position|rank|classement)/,
    ['La source de positions ou le rapport de recherche fournit la position, selon sa requête, son lieu, son appareil et sa période.', 'The ranking source or search report supplies position for its query, location, device and period.'],
    ['Un nombre plus faible représente généralement une meilleure position. Comparez des requêtes et périmètres identiques ; une moyenne peut masquer des écarts.', 'A lower number generally represents a better position. Compare the same queries and scope; an average can hide differences.']],
  ['clicks', /(?:clics?|clicks?)/,
    ['Les clics sont des interactions comptées par la source indiquée, pour le filtre et la période sélectionnés.', 'Clicks are interactions counted by the stated source for the selected filter and period.'],
    ['Des clics supplémentaires indiquent davantage d’interactions dans ce périmètre. Vérifiez les visites et événements associés avant de conclure à une hausse des prospects.', 'Additional clicks indicate more interactions within this scope. Check related visits and events before concluding that leads increased.']],
  ['impressions', /(?:impressions?|affichages?)/,
    ['Les impressions comptent les affichages déclarés par la source. Elles ne représentent pas nécessairement des personnes distinctes.', 'Impressions count displays reported by the source. They do not necessarily represent distinct people.'],
    ['Une variation peut venir de la demande, de la couverture ou du périmètre. Reliez-la aux clics et au taux de clic avant de décider.', 'A change can come from demand, coverage or scope. Relate it to clicks and click-through rate before deciding.']],
  ['sessions', /(?:sessions?|visites?|visiteurs?|users?|utilisateurs?|audience)/,
    ['La source analytique regroupe les événements selon sa définition des sessions ou utilisateurs et les règles de consentement.', 'The analytics source groups events according to its session or user definitions and consent rules.'],
    ['Ces volumes peuvent changer avec la collecte, les filtres ou le comportement. Une session n’est pas une personne unique, un prospect ou une vente.', 'These volumes can change with collection, filters or behaviour. A session is not a unique person, lead or sale.']],
  ['key-events', /(?:key events?|evenements? cles?|conversions?|leads?|prospects?)/,
    ['Les événements enregistrés et leur configuration déterminent les conversions affichées ; leur sens métier doit être confirmé.', 'Recorded events and their configuration determine displayed conversions; their business meaning must be confirmed.'],
    ['Modifier la définition d’un événement peut changer la mesure. Vérifiez qu’il représente bien le prospect ou l’achat souhaité avant de le comparer à votre objectif.', 'Changing an event definition can change the measurement. Check that it represents the intended lead or purchase before comparing it with your goal.']],
  ['revenue', /(?:revenus?|revenue|ventes?|sales|commandes?|orders?|transactions?|chiffre d'affaires)/,
    ['Les commandes ou événements d’achat observés fournissent le montant, avec leur devise et leur règle d’attribution.', 'Observed orders or purchase events supply the amount, currency and attribution rule.'],
    ['Les remboursements, doublons, devises et périmètres peuvent modifier le total. Un revenu attribué à un canal ne démontre pas son effet causal.', 'Refunds, duplicates, currencies and scope can change the total. Revenue attributed to a channel does not demonstrate its causal effect.']],
  ['mentions', /(?:mentions?|citations?|presence|share of voice|part de voix|reponses? ia|ai answers?)/,
    ['Les réponses datées du panel et les mentions relues fournissent cette observation. Les suggestions de correspondance restent à confirmer.', 'Dated panel answers and reviewed mentions supply this observation. Suggested matches remain to be confirmed.'],
    ['Valider une mention change les agrégats de l’échantillon. Ajouter des questions ou moteurs change le dénominateur et la comparabilité du panel.', 'Confirming a mention changes sample aggregates. Adding questions or engines changes the denominator and panel comparability.']],
  ['dates', /(?:dates?|debut|fin|start|end|echeance|deadline|duration|duree|calendrier|calendar)/,
    ['Les dates proviennent du plan saisi, ou de la période explicitement indiquée dans le rapport.', 'Dates come from the entered plan or the period explicitly stated in the report.'],
    ['Changer une date de plan peut décaler les étapes dépendantes ; changer une période de rapport modifie les observations comparées. Une date seule ne programme pas une publication.', 'Changing a plan date can shift dependent steps; changing a reporting period changes the compared observations. A date alone does not schedule publication.']],
  ['owners', /(?:responsables?|intervenants?|assigne|owners?|assignee)/,
    ['La responsabilité provient de la personne ou de l’étiquette choisie dans le plan.', 'Responsibility comes from the person or label selected in the plan.'],
    ['Changer le responsable précise qui doit prendre en charge l’action. Cela n’accorde pas de nouveaux droits et ne prouve pas qu’une invitation ou notification a été envoyée.', 'Changing the owner clarifies who should handle the action. It does not grant new permissions or prove an invitation or notification was sent.']],
  ['budget', /(?:budget|cout|cost|effort|roi|cpc|marge|margin)/,
    ['Les coûts, efforts et hypothèses sont les valeurs de planification saisies ou explicitement sourcées.', 'Costs, effort and assumptions are entered or explicitly sourced planning values.'],
    ['Une modification change l’estimation et les arbitrages du plan. Elle ne dépense pas un budget publicitaire et ne garantit pas un retour sur investissement.', 'A change affects the estimate and planning trade-offs. It does not spend advertising budget or guarantee a return on investment.']],
  ['dependencies', /(?:depend|relie|linked|relations?|canal|channel)/,
    ['Les liens du scénario ou les relations explicites entre sources et actions décrivent les dépendances.', 'Scenario links or explicit relationships between sources and actions describe dependencies.'],
    ['Modifier un lien peut changer l’ordre ou le calendrier des actions associées. Relisez l’aperçu des dépendances avant d’appliquer un déplacement.', 'Changing a link can change the order or schedule of related actions. Review the dependency preview before applying a shift.']],
  ['scope', /(?:domaine|domain|\burl\b|site|property|propriete|workspace|espace|client)/,
    ['Le sélecteur et les autorisations de l’espace déterminent le domaine ou la propriété utilisé.', 'The selector and workspace permissions determine the domain or property in use.'],
    ['Changer ce périmètre change les lectures et résultats affichés. Vérifiez le client, le domaine et la période avant de comparer ou d’agir.', 'Changing this scope changes displayed reads and results. Check the customer, domain and period before comparing or acting.']],
  ['approval', /(?:approuv|approval|approve|publier|publish|execut|envoyer|send|diffuser|transfer|transfert)/,
    ['L’action préparée, son état de validation et les autorisations du module déterminent ce qui peut être exécuté.', 'The prepared action, approval state and module permissions determine what can be executed.'],
    ['Cette action peut modifier ou transmettre des données selon le module. Vérifiez la destination et le récapitulatif ; le coach n’exécute pas cette action à votre place.', 'This action can change or transmit data depending on the module. Check the destination and summary; the coach does not execute this action for you.']],
  ['delete', /(?:supprimer|delete|revoqu|revok|retirer|remove)/,
    ['L’élément sélectionné et les autorisations de ce module définissent le périmètre de suppression ou révocation.', 'The selected item and module permissions define the deletion or revocation scope.'],
    ['Vérifiez les dépendances et la confirmation affichée. Une suppression ou révocation peut rendre l’élément indisponible sans annuler les actions déjà réalisées.', 'Check dependencies and the displayed confirmation. Deletion or revocation can make the item unavailable without undoing completed actions.']],
  ['generate', /(?:generer|generat|collect|lancer|run|synchronis|synchroniz|sync)/,
    ['Les sources, paramètres et autorisations sélectionnés définissent ce qui sera lu ou préparé.', 'Selected sources, parameters and permissions define what will be read or prepared.'],
    ['Vérifiez le périmètre et les éventuels coûts fournisseur avant lancement. Une proposition générée doit être relue ; elle n’est pas une preuve observée.', 'Check the scope and any provider costs before starting. A generated proposal must be reviewed; it is not observed evidence.']],
  ['save', /(?:enregistr|save|appliquer|apply|restaur|restore|dupliq|duplicat)/,
    ['Les valeurs et la version affichées constituent la modification proposée dans le module actif.', 'Displayed values and version constitute the proposed change in the active module.'],
    ['Vérifiez le récapitulatif et les éventuels conflits de version. Enregistrer un plan ne confirme ni l’exécution ni les résultats de ses actions.', 'Check the summary and any version conflicts. Saving a plan confirms neither execution nor action outcomes.']],
  ['evidence', /(?:preuves?|evidence|sources?|imports?|photos?|images?)/,
    ['La source, l’URL et la date associées indiquent l’origine de l’élément. Un import conserve la date réelle de l’observation.', 'The associated source, URL and date indicate the item’s origin. An import retains the actual observation date.'],
    ['Remplacer une preuve peut changer le constat et les actions qui s’y réfèrent. Vérifiez sa pertinence, ses droits d’utilisation et son périmètre.', 'Replacing evidence can change the finding and actions that refer to it. Check relevance, usage rights and scope.']],
  ['goal', /(?:objectif|goal|target|cible|hypothese|assumption)/,
    ['L’objectif est une préférence ou une hypothèse déclarée par l’utilisateur, avec sa période et sa mesure.', 'The goal is a user-declared preference or assumption, with its period and metric.'],
    ['Le modifier adapte la priorisation et la comparaison à la cible. Cela ne modifie pas les résultats déjà observés ni les permissions.', 'Changing it adapts prioritisation and target comparison. It does not change already observed results or permissions.']],
];

/** Explain a labelled element without reading its current value or secret fields. */
export function getElementGuide({ section = 'overview', tab = '', label = '', kind = '' } = {}, language = 'en') {
  const guide = getCoachGuide(section, tab, language);
  const cleanLabel = String(label || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200);
  const text = normalise(cleanLabel);
  // Treat actions as actions even when their label also contains a metric or site name.
  const action = /^(button|action|submit|link)$/.test(kind)
    ? ELEMENTS.find(([id, re]) => ['approval', 'delete', 'generate', 'save', 'freshness'].includes(id) && re.test(text)) : null;
  const preference = /^(field|input|select|textarea)$/.test(kind) && /(?:audience|objectif|goal|target|cible|role)/.test(text)
    ? ELEMENTS.find(([id]) => id === 'goal') : null;
  const mentionScore = ['ai_visibility', 'competition'].includes(section) && /(?:score|note|presence|taux|rate)/.test(text)
    ? ELEMENTS.find(([id]) => id === 'mentions') : null;
  const match = action || preference || mentionScore || ELEMENTS.find(([, expression]) => expression.test(text));
  return {
    ...guide, label: cleanLabel || guide.title, elementId: match?.[0] || 'context',
    ...(match ? { origin: `${pick(match[2], language)} ${guide.origin}`, consequence: pick(match[3], language) } : {}),
  };
}

const safeText = value => typeof value === 'string' ? value.trim().slice(0, 400) : '';
const hasList = value => Array.isArray(value) && value.some(item => typeof item === 'string' && item.trim());
const belongs = (url, domains) => {
  if (!url) return true; // A caller may pass an already scoped audit without its URL.
  try { const parsed = new URL(url); return /^https?:$/.test(parsed.protocol) && !parsed.username && !parsed.password && domains.some(domain => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)); } catch { return false; }
};
const access = (status, source) => status?.error || status?.problem || status?.loadError || status?.[source]?.error || status?.[source]?.problem ? 'unknown'
  : status?.[source]?.hasAccess === true ? 'available'
    : status?.[source]?.hasAccess === false ? 'denied' : 'unknown';

/** A contextual recommendation list, never a forecast or an execution command. */
export function buildCoachPlan({ profile, me, overview, status, section = 'overview', tab = '' } = {}, language = 'en') {
  const L = (fr, en) => language === 'fr' ? fr : en;
  const goal = COACH_GOALS.find(item => item.id === profile?.goal) || COACH_GOALS[0];
  const tenant = me?.tenant;
  const active = Boolean(tenant?.id && tenant.status === 'active');
  const domains = hasList(tenant?.domains);
  const steps = [];
  const add = (id, title, detail, href, state, reason, impact) => steps.push({ id, title: L(...title), detail: L(...detail), href, state, reason: L(...reason), impact: L(...impact) });
  if (!active) {
    add('workspace', ['Choisir mon espace client', 'Choose my customer workspace'],
      ['Sélectionnez un espace autorisé avant de lire les données ou préparer une action.', 'Select an authorised workspace before reading data or preparing an action.'], '#settings/sources', 'blocked',
      ['Aucun espace client actif n’est disponible dans le contexte reçu.', 'No active customer workspace is available in the supplied context.'],
      ['Ce choix fixe le périmètre des données et permissions.', 'This choice sets the data and permission scope.']);
  } else if (!domains) {
    add('domain', ['Renseigner le site de l’espace', 'Set the workspace website'],
      ['Vérifiez les domaines autorisés et choisissez la page à examiner.', 'Check authorised domains and choose the page to inspect.'], '#tracking/settings', 'todo',
      ['Aucun domaine n’est renseigné dans la configuration reçue.', 'No domain is set in the supplied configuration.'],
      ['Le domaine définit les pages que le diagnostic peut examiner.', 'The domain defines the pages the diagnosis can inspect.']);
  }
  const recommendation = active && domains && belongs(overview?.url, tenant.domains) && !overview?.error && !overview?.problem && !overview?.loadError && Array.isArray(overview?.geo?.recommendations)
    ? [...overview.geo.recommendations].filter(item => safeText(item?.action) && typeof item.points === 'number' && Number.isFinite(item.points) && item.points > 0).sort((a, b) => b.points - a.points)[0] : null;
  const auditStep = () => add('evidence', recommendation ? ['Examiner la priorité de mon audit', 'Inspect my audit priority'] : ['Comprendre la première preuve du site', 'Understand the first website finding'],
    recommendation ? [safeText(recommendation.action), safeText(recommendation.action)] : ['Ouvrez le diagnostic pour distinguer les constats, les inconnues et les corrections possibles.', 'Open the diagnosis to distinguish findings, unknowns and possible corrections.'], '#diagnose/technical',
    !active || !domains ? 'blocked' : recommendation ? 'ready' : 'todo',
    recommendation ? ['Cette action provient des recommandations de l’audit reçu.', 'This action comes from the supplied audit recommendations.'] : ['Le coach ne dispose pas d’une recommandation chiffrée vérifiable pour ce site.', 'The coach has no verifiable scored recommendation for this website.'],
    ['Une nouvelle analyse vérifiera l’effet de la correction ; aucun gain de trafic n’est présumé.', 'A new analysis will verify the correction; no traffic gain is assumed.']);
  const sourceStep = source => {
    const configured = hasList(source === 'gsc' ? tenant?.gscProperties : tenant?.ga4Properties);
    const selected = status?.[source]?.configured;
    const allowedProperties = source === 'gsc' ? tenant?.gscProperties : tenant?.ga4Properties;
    const selectedInScope = selected === undefined || typeof selected === 'string' && (allowedProperties || []).includes(source === 'ga4' ? selected.replace(/^properties\//, '') : selected);
    const available = active && selectedInScope ? access(status, source) : 'unknown';
    const provider = source === 'gsc' ? 'Search Console' : 'GA4';
    const ready = configured && available === 'available';
    const href = !configured ? '#tracking/settings' : !ready ? '#tracking/status' : goal.href;
    add('source', ready ? (source === 'gsc' ? ['Relier les requêtes aux pages', 'Connect queries to pages'] : ['Vérifier le sens des événements clés', 'Check the meaning of key events']) : [`Vérifier mon accès ${provider}`, `Check my ${provider} access`],
      ready ? (source === 'gsc' ? ['Choisissez une période et ouvrez les recherches qui apportent des clics.', 'Choose a period and open searches that bring clicks.'] : ['Vérifiez quels événements représentent réellement vos prospects ou achats.', 'Check which events actually represent your leads or purchases.']) : [`Configurez ${provider}, puis utilisez la vérification d’accès avant d’interpréter les mesures.`, `Configure ${provider}, then check access before interpreting measurements.`],
      href, !active || available === 'denied' ? 'blocked' : ready ? 'ready' : 'todo',
      !configured ? ['La propriété nécessaire n’est pas configurée.', 'The required property is not configured.'] : available === 'denied' ? ['La dernière vérification fournie n’a pas confirmé l’accès.', 'The supplied access check did not confirm access.'] : ready ? ['La propriété est configurée et son accès a été confirmé par le statut fourni.', 'The property is configured and access was confirmed by the supplied status.'] : ['La propriété est configurée, mais aucun accès réussi n’est confirmé dans le contexte reçu.', 'The property is configured, but no successful access is confirmed in the supplied context.'],
      source === 'gsc' ? ['Cette lecture permet de choisir des pages à examiner ; les clics ne sont pas des conversions.', 'This read helps choose pages to inspect; clicks are not conversions.'] : ['Une définition fiable permet de comparer les résultats ; un événement clé n’est pas automatiquement une vente.', 'A reliable definition enables result comparison; a key event is not automatically a sale.']);
  };
  if (profile?.role === 'technical') auditStep();
  if (goal.id === 'traffic') sourceStep('gsc');
  else if (goal.id === 'leads' || goal.id === 'sales') sourceStep('ga4');
  else if (goal.id === 'ai-visibility') add('source', ['Relire des réponses IA réelles', 'Review actual AI answers'],
    ['Choisissez les questions et moteurs du panel, puis vérifiez les réponses et mentions enregistrées.', 'Choose panel questions and engines, then check saved answers and mentions.'], '#ai_visibility', active ? 'todo' : 'blocked',
    ['La préparation technique du site ne remplace pas les réponses observées.', 'Website technical readiness does not replace observed answers.'],
    ['La validation des mentions améliore la fiabilité de l’échantillon ; elle ne garantit pas une recommandation future.', 'Reviewing mentions improves sample reliability; it does not guarantee a future recommendation.']);
  else add('source', ['Choisir un établissement et ses preuves', 'Choose a location and its evidence'],
    ['Examinez le registre et la dernière observation de l’établissement concerné.', 'Inspect the registry and latest observation for the relevant location.'], '#local_seo/network', active ? 'todo' : 'blocked',
    ['Les résultats locaux nécessitent un lieu, une recherche et une observation datée.', 'Local results require a location, query and dated observation.'],
    ['Vous pourrez préparer une correction locale dans le bon périmètre.', 'You can then prepare a local correction within the correct scope.']);
  if (profile?.role !== 'technical') auditStep();
  add('plan', ['Transformer les constats en actions', 'Turn findings into actions'],
    ['Choisissez les constats à traiter, les canaux, les dates et les responsables dans un scénario modifiable.', 'Choose findings to address, channels, dates and owners in an editable scenario.'], '#studio/campaigns', active && domains ? 'todo' : 'blocked',
    ['Le scénario conserve les liens entre vos analyses et les actions préparées.', 'The scenario retains links between analyses and prepared actions.'],
    ['Le plan organise les dépendances ; les validations et publications restent propres à chaque canal.', 'The plan organises dependencies; approvals and publications remain specific to each channel.']);
  if (profile?.stage === 'retain') add('follow-up', ['Examiner les alertes enregistrées', 'Inspect recorded alerts'],
    ['Relisez la preuve et la date avant de modifier votre plan.', 'Review evidence and date before changing your plan.'], '#ops/alerts', active ? 'todo' : 'blocked',
    ['Votre préférence indique une phase de suivi.', 'Your preference indicates a monitoring stage.'],
    ['Une alerte signale un changement à vérifier, pas une cause démontrée.', 'An alert flags a change to investigate, not a proven cause.']);
  else if (profile?.role === 'agency' || profile?.stage === 'expand') add('follow-up', ['Préparer un bilan de cet espace', 'Prepare a review of this workspace'],
    ['Rassemblez les preuves, périodes et actions du client avant de partager un rapport.', 'Gather the customer’s evidence, periods and actions before sharing a report.'], '#report', active ? 'todo' : 'blocked',
    ['Votre rôle ou votre étape privilégie la coordination et le suivi client.', 'Your role or stage prioritises coordination and customer follow-up.'],
    ['Le rapport partage un instantané ; gardez les mesures de chaque client séparées.', 'The report shares a snapshot; keep each customer’s measurements separate.']);
  const guide = getCoachGuide(section, tab, language);
  return {
    goal: goal.id, title: pick([goal.fr, goal.en], language),
    summary: L('Un parcours conseillé à partir de vos préférences et des preuves disponibles. Les étapes décrivent ce qui peut être examiné, pas des actions déjà effectuées.', 'A suggested journey based on your preferences and available evidence. Steps describe what can be examined, not actions already completed.'),
    steps, next: steps[0],
    source: L('Profil personnel, configuration de l’espace et derniers statuts ou constats fournis au coach.', 'Personal profile, workspace configuration and latest statuses or findings supplied to the coach.'),
    context: guide.id,
  };
}
