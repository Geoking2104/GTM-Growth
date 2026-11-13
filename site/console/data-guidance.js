import { el } from "./render.js";
import { LANG } from "./i18n.js";

const L = (fr, en) => LANG === "fr" ? fr : en;
const settings = ["#tracking/settings", "Configurer les sources", "Configure sources"];
const access = ["#tracking", "Vérifier les accès", "Check access"];
const guides = {
  domain: {
    title: ["Choisir le site à analyser", "Choose the website to analyse"],
    reason: ["Aucune URL autorisée n’est sélectionnée pour cette analyse.", "No authorised URL is selected for this analysis."],
    steps: [["Ouvrez le sélecteur de site à gauche et choisissez le client.", "Open the website picker on the left and select the customer."], ["Renseignez une URL publique appartenant à ses domaines autorisés, puis appliquez.", "Enter a public URL on an authorised domain, then apply."], ["Si le domaine manque, un administrateur doit l’ajouter dans Tracking → Paramètres.", "If the domain is missing, an administrator must add it under Tracking → Settings."]], links: [settings], picker: true,
  },
  tenant: {
    title: ["Choisir un espace client", "Choose a customer workspace"],
    reason: ["La session est ouverte, mais aucun espace client n’est actif pour ces données.", "You are signed in, but no customer workspace is active for this data."],
    steps: [["Sélectionnez le client dans le sélecteur de site : les données de cet espace seront chargées automatiquement.", "Select a customer in the website picker: its data will load automatically."], ["Si aucun client n’est proposé, demandez votre rattachement à l’administrateur ou ouvrez Administration plateforme.", "If no customer is listed, ask the administrator for membership or open Platform administration."]], links: [], picker: true,
  },
  gsc: {
    title: ["Connecter les données de recherche", "Connect search data"],
    reason: ["Les clics, requêtes et positions nécessitent une propriété Search Console accessible.", "Clicks, queries and positions require an accessible Search Console property."],
    steps: [["Dans Tracking → Paramètres, enregistrez la propriété exacte (sc-domain:exemple.fr ou l’URL préfixe).", "Under Tracking → Settings, save the exact property (sc-domain:example.com or URL prefix)."], ["Dans Search Console → Paramètres → Utilisateurs et autorisations, ajoutez l’e-mail du compte de service affiché dans Tracking avec un accès en lecture.", "In Search Console → Settings → Users and permissions, give the service account shown in Tracking read access."], ["Vérifiez l’accès dans Tracking, puis revenez ici. Si la période est vide, élargissez-la ; les données récentes peuvent arriver avec un délai.", "Check access in Tracking, then return here. If the period is empty, expand it; recent data can be delayed."]], links: [settings, access],
  },
  ga4: {
    title: ["Connecter Google Analytics 4", "Connect Google Analytics 4"],
    reason: ["Les audiences et conversions nécessitent une propriété GA4 et des événements collectés.", "Audiences and conversions require a GA4 property and collected events."],
    steps: [["Enregistrez l’identifiant numérique de la propriété dans Tracking → Paramètres.", "Save the numeric property ID under Tracking → Settings."], ["Dans GA4 → Administration → Gestion des accès à la propriété, ajoutez le compte de service affiché dans Tracking avec le rôle Lecteur.", "In GA4 → Admin → Property access management, add the service account shown in Tracking as a Viewer."], ["Vérifiez que la balise collecte des événements, puis choisissez une période contenant des visites. Les achats nécessitent les événements e-commerce.", "Verify that the tag collects events, then choose a period with visits. Purchases require ecommerce events."]], links: [settings, access],
  },
  bing: {
    title: ["Connecter Bing Webmaster", "Connect Bing Webmaster"],
    reason: ["Les résultats Bing nécessitent un site vérifié et une clé API configurée.", "Bing results require a verified website and a configured API key."],
    steps: [["Vérifiez le site dans Bing Webmaster Tools.", "Verify the website in Bing Webmaster Tools."], ["Récupérez la clé dans Bing → Paramètres → Accès API, puis enregistrez-la dans Tracking → Paramètres avec l’URL exacte du site.", "Get the key from Bing → Settings → API access, then save it under Tracking → Settings with the exact website URL."], ["Vérifiez l’accès et choisissez une période disposant de données.", "Check access and select a period containing data."]], links: [settings, access],
  },
  gtm: {
    title: ["Connecter un conteneur GTM", "Connect a GTM container"],
    reason: ["L’inventaire nécessite un conteneur accessible au compte de service.", "The inventory requires a container accessible to the service account."],
    steps: [["Ajoutez le compte de service affiché dans Tracking à votre conteneur GTM avec le droit Lecture.", "Add the service account shown in Tracking to your GTM container with Read permission."], ["Enregistrez le chemin accounts/<id>/containers/<id> dans Tracking → Paramètres, puis revenez ici.", "Save accounts/<id>/containers/<id> under Tracking → Settings, then return here."]], links: [settings, access],
  },
  local_seo: {
    title: ["Alimenter le suivi local", "Set up local tracking"],
    reason: ["Les résultats locaux proviennent d’un référentiel d’établissements et d’observations datées. Ils ne sont pas déduits du seul nom de domaine.", "Local results need a location registry and dated observations. A domain name alone cannot supply them."],
    steps: [["Utilisez un compte client actif : le rôle administrateur plateforme est exclu du suivi local. L’administrateur client importe le référentiel et délègue les établissements aux responsables.", "Use an active customer account: the platform administrator role is excluded from local tracking. The customer administrator imports the registry and delegates locations to managers."], ["Dans Importer et organiser, chargez un CSV ou JSON : id, name, brand, country, languages, timezone, kind, page. Prévisualisez puis confirmez les lignes valides.", "Under Import and organise, load CSV or JSON: id, name, brand, country, languages, timezone, kind, page. Preview and confirm valid rows."], ["Importez une observation avec établissement, recherche, source, date, langue et points de position. Les tableaux et contrôles se recalculent après l’import.", "Import an observation with location, query, source, date, language and rank points. Tables and checks recalculate after import."], ["Pour automatiser, configurez GBP et les traitements Node-RED avec l’administrateur. Le diagnostic manuel reste disponible sans ces connecteurs.", "For automation, configure GBP and Node-RED jobs with the administrator. Manual assessment remains available without these connectors."]], links: [["#local_seo/planning", "Préparer mon établissement", "Plan my business"], ["#local_seo/website", "Voir le SEO du site", "View website SEO"]],
  },
  competition: {
    title: ["Créer une comparaison documentée", "Create an evidence-based comparison"],
    reason: ["Aucune comparaison n’est calculable sans réponses IA enregistrées mentionnant votre marque et les marques à comparer. Le score GEO ne mesure pas ces mentions.", "A comparison needs saved AI answers and a panel containing your brand and competitors. The GEO score does not measure these mentions."],
    steps: [["Préparez vos marques et alias, puis des réponses réelles : question, réponse complète, source, date ISO avec fuseau et citations éventuelles.", "Prepare brands and aliases, then real answers: prompt, full answer, source, ISO date with timezone and optional citations."], ["Dans Visibilité IA → Importer des réponses JSON, vérifiez puis enregistrez l’import. Cette voie n’exige aucune API payante.", "In AI visibility → Import answers as JSON, review and save the import. This route requires no paid API."], ["Revenez dans Concurrence : le dernier jeu est chargé automatiquement. Choisissez votre marque et vérifiez les mentions. Les périodes comparées doivent partager les mêmes questions et sources.", "Return to Competition: the latest dataset loads automatically. Select your brand and review mentions. Compared periods must share prompts and sources."]], links: [["#ai_visibility", "Importer des réponses IA", "Import AI answers"], ["#journey", "Préparer les questions", "Prepare questions"]],
  },
  journey: {
    title: ["Préparer le parcours client", "Prepare the customer journey"],
    reason: ["Le parcours utilise les titres et contenus d’une page publique. Ses questions sont des hypothèses à valider, pas des recherches mesurées.", "The journey uses a public page’s headings and content. Its questions are hypotheses to validate, not measured searches."],
    steps: [["Sélectionnez une URL autorisée et accessible sans connexion. La lecture démarre à l’ouverture.", "Select an authorised URL accessible without sign-in. Reading starts on entry."], ["Si la page bloque la lecture ou ne répond pas, utilisez la trame manuelle et renseignez votre public et votre objectif.", "If the page blocks reading or does not respond, use the manual outline and enter your audience and goal."], ["Choisissez les questions à suivre, puis importez des réponses réelles dans Visibilité IA pour obtenir des mesures.", "Choose questions to track, then import real answers in AI visibility to obtain measurements."]], links: [["#journey/prompts", "Questions suivies", "Tracked questions"], ["#ai_visibility", "Ajouter des observations", "Add observations"]],
  },
  rank: {
    title: ["Alimenter les positions suivies", "Set up tracked rankings"],
    reason: ["Une position nécessite un mot-clé suivi et une observation fournie par une source de positions configurée.", "A ranking requires a tracked keyword and an observation from a configured rank source."],
    steps: [["Ajoutez vos mots-clés dans Opérations → Positions suivies.", "Add keywords under Operations → Tracked rankings."], ["Demandez à l’administrateur de configurer la source de positions. Les vérifications sont lancées explicitement depuis cet écran.", "Ask the administrator to configure the rank source. Checks are explicitly started from that screen."], ["Vous pouvez aussi utiliser Mots-clés pour travailler à partir des positions déjà observées dans votre propriété Search Console.", "You can also use Keywords to work with rankings already observed in your Search Console property."]], links: [["#keywords", "Requêtes Search Console", "Search Console queries"], access],
  },
  geo: {
    title: ["Obtenir les résultats de l’audit", "Get audit results"],
    reason: ["L’analyse nécessite une page publique joignable. Un blocage HTTP, un délai dépassé ou une restriction de domaine peut empêcher sa lecture.", "Analysis requires a reachable public page. HTTP blocking, a timeout or a domain restriction can prevent reading."],
    steps: [["Vérifiez l’URL sélectionnée et son autorisation dans Tracking → Paramètres.", "Check the selected URL and its authorisation under Tracking → Settings."], ["Vérifiez que la page, robots.txt et le sitemap sont accessibles. Si un pare-feu bloque le crawler, faites vérifier ses règles par le gestionnaire du site.", "Verify that the page, robots.txt and sitemap are accessible. If a firewall blocks the crawler, ask the website manager to review its rules."], ["Revenez dans cette rubrique pour relancer la lecture. Un fichier absent est un constat d’audit, pas un score de visibilité IA.", "Return to this section to read again. A missing file is an audit finding, not an AI visibility score."]], links: [settings, ["#tracking", "Vérifier la configuration", "Check configuration"]],
  },
};
export function guidanceKey(section = "") {
  if (/^\/(search|keywords)\//.test(section) || ["search", "keywords"].includes(section)) return "gsc";
  if (section.startsWith("/ga4/")) return "ga4";
  if (section.startsWith("/bing/")) return "bing";
  if (section.startsWith("/gtm/")) return "gtm";
  if (["ai_visibility", "ops"].includes(section)) return "competition";
  return guides[section] ? section : "geo";
}

/** A visible recovery path. Never turns missing observations into sample metrics. */
export function renderDataGuide(section, { reason, error, retry, title } = {}) {
  const guide = guides[guidanceKey(section)];
  const box = el("section", "c-data-guide");
  box.append(el("h3", "", title || L(...guide.title)), el("p", "c-note", reason || L(...guide.reason)));
  if (error) { const detail = el("details", "c-error-detail"); detail.append(el("summary", "", L("Détail du problème", "Problem details")), el("p", "c-note", error.message || String(error))); box.append(detail); }
  const steps = el("ol", "c-list"); guide.steps.forEach(step => steps.append(el("li", "", L(...step)))); box.append(steps);
  const actions = el("div", "c-guide-actions");
  if (guide.picker) {
    const button = el("button", "btn btn-small", L("Choisir le client et le site", "Choose customer and website")); button.type = "button";
    button.onclick = () => { const picker = document.querySelector("#c-picker"); if (picker) { picker.hidden = false; document.querySelector("#c-switch")?.setAttribute("aria-expanded", "true"); picker.scrollIntoView({ block: "nearest" }); picker.querySelector("select, input")?.focus(); } }; actions.append(button);
  }
  for (const [href, fr, en] of guide.links) { const link = el("a", "c-btn", L(fr, en)); link.href = href; actions.append(link); }
  if (retry) { const button = el("button", "c-btn", L("Réessayer", "Retry")); button.type = "button"; button.onclick = retry; actions.append(button); }
  box.append(actions); return box;
}
