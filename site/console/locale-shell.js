/** Localise the unauthenticated console shell, and link back to the matching
 * marketing language. Authenticated labels remain managed by console/i18n.js. */
import { LANG } from "./i18n.js";

const en = LANG === "en";
const strings = en ? {
  header: "Console · Free read", back: "Back to site ", workspace: "YOUR WORKSPACE",
  navOverview: "Overview", navRead: "Site analysis", navStart: "Guided setup",
  navigation: "Free analysis navigation",
  sidebar: "Public-signal analysis for your website.", eyebrow: "FREE READ",
  title: "Your website, seen through AI.", description: "A first read of your visibility and a way to improve it.",
  live: "●  Site analysis", next: "GO FURTHER", loginTitle: "Continue in your workspace",
  loginInfo: "Sign in to find guided onboarding and detailed analyses of your authorised domains.",
  emailPlaceholder: "name@company.com", urlLabel: "Page URL to analyse", urlButton: "Run free analysis ↗",
  urlHelp: "No account · public page only · evidence-based recommendations.", urlForm: "Free website analysis", urlPlaceholder: "https://www.example.com/",
} : {
  header: "Console · Lecture gratuite", back: "Retour au site ", workspace: "VOTRE ESPACE",
  navOverview: "Vue d’ensemble", navRead: "Analyse du site", navStart: "Démarrage guidé",
  navigation: "Navigation de la lecture",
  sidebar: "Analyse des signaux publics de votre site.", eyebrow: "LECTURE GRATUITE",
  title: "Votre site, vu par l’IA.", description: "Une première lecture de votre visibilité et des pistes pour progresser.",
  live: "●  Analyse du site", next: "ALLER PLUS LOIN", loginTitle: "Continuez dans votre espace",
  loginInfo: "Connectez-vous pour retrouver le démarrage guidé et les analyses détaillées de vos domaines autorisés.",
  emailPlaceholder: "prenom@entreprise.fr", urlLabel: "Adresse de la page à analyser", urlButton: "Analyser gratuitement ↗",
  urlHelp: "Sans compte · page publique uniquement · recommandations basées sur des mesures.", urlForm: "Analyse gratuite d’un site", urlPlaceholder: "https://www.exemple.fr/",
};

function set(selector, value) {
  const node = document.querySelector(`#c-login ${selector}`);
  if (node) node.textContent = value;
}

set(".public-header-label", strings.header);
set(".public-nav-label", strings.workspace);
document.querySelector("#c-login .public-sidebar")?.setAttribute("aria-label", strings.navigation);
for (const [index, label] of [strings.navOverview, strings.navRead, strings.navStart].entries()) {
  set(`.public-sidebar > a:nth-of-type(${index + 1}) span`, label);
}
set(".public-sidebar-note", strings.sidebar);
set(".public-heading .public-eyebrow", strings.eyebrow);
set(".public-heading h1", strings.title);
set(".public-heading h1 + p", strings.description);
set(".public-heading .public-live", strings.live);
set(".public-login-card .public-eyebrow", strings.next);
set(".public-login-card h2", strings.loginTitle);
set(".public-login-card h2 + p", strings.loginInfo);
set(".public-url-form label", strings.urlLabel);
set(".public-url-form .public-url-button", strings.urlButton);
set(".public-url-form .public-url-help", strings.urlHelp);
const urlForm = document.getElementById("c-public-url-form");
if (urlForm) urlForm.setAttribute("aria-label", strings.urlForm);
const urlInput = document.getElementById("c-public-url");
if (urlInput) urlInput.placeholder = strings.urlPlaceholder;

const home = en ? "/" : "/fr/";
for (const selector of [".public-brand", ".public-back"]) {
  const link = document.querySelector(`#c-login ${selector}`);
  if (link) link.href = home;
}
const back = document.querySelector("#c-login .public-back");
if (back?.firstChild) back.firstChild.textContent = strings.back;
const email = document.getElementById("c-login-email");
if (email) email.placeholder = strings.emailPlaceholder;
for (const link of document.querySelectorAll(".c-public-languages a")) {
  const lang = link.getAttribute("hreflang");
  const url = new URL(location.href);
  url.searchParams.set("lang", lang);
  link.href = `${url.pathname}${url.search}${url.hash}`;
  if (lang === LANG) link.setAttribute("aria-current", "page");
}
