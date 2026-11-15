import { handleRedirect, accessToken, login } from "./auth.js";
import { LANG } from "./i18n.js";
import { el } from "./render.js";
import { renderConnectedAgents, agentError } from "./connected-agents.js";
const request = new URLSearchParams(location.search).get("request");
if (request) sessionStorage.setItem("gtm-pap-request", request);
const root = document.getElementById("pap-consent");
try {
  await handleRedirect();
  if (!await accessToken()) {
    root.append(el("h1", "", LANG === "fr" ? "Connecter votre agent à GTM Growth" : "Connect your agent to GTM Growth"));
    const button = el("button", "c-btn", LANG === "fr" ? "Se connecter pour vérifier la demande" : "Sign in to review the request"); button.type = "button"; button.onclick = () => login(); root.append(button);
  } else root.append(await renderConnectedAgents({ request: sessionStorage.getItem("gtm-pap-request") || undefined }));
} catch (e) { root.append(el("p", "c-error", agentError(e.message))); }
