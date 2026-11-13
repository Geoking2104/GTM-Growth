/** Read-only journey entry for authenticated users.
 * Adds hypotheses to the existing tenant-scoped prompt pool only on request. */
import { renderJourneyPreview } from "./customer-journey.js";
import { normalisePublicUrl } from "./public-read-model.js";
import { el } from "./render.js";
import { renderDataGuide } from "./data-guidance.js";
import { LANG } from "./i18n.js";

const L = (fr, en) => LANG === "fr" ? fr : en;
function ownedUrl(tenant, url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (tenant?.domains || []).some((item) => {
      let domain = "";
      try { domain = new URL(item.includes("://") ? item : "https://" + item).hostname.toLowerCase(); }
      catch { return false; }
      return host === domain || host.endsWith("." + domain);
    });
  } catch { return false; }
}
export function renderCustomerJourneyWorkspace({ state, api }) {
  const panel = el("section", "app-strip journey-workspace");
  panel.append(el("h3", "", L("Mon parcours client", "My customer journey")),
    el("p", "c-note", L(
      "Construisez cinq étapes depuis votre page publique, puis choisissez les questions hypothétiques que vous souhaitez suivre. Aucune collecte de réponses IA n'est déclenchée ici.",
      "Build five stages from a public page, then select hypothetical questions to track. This view does not run an AI answer collection."
    )));
  const status = el("p", "c-note"); status.setAttribute("role", "status");
  const output = el("div");
  const button = el("button", "btn btn-small", L("Lire la page et afficher le parcours", "Read the page and map the journey"));
  button.type = "button";
  const render = (url, data = {}) => renderJourneyPreview({
    language: LANG, mode: "workspace",
    data: { url: data.finalUrl || url, finalUrl: data.finalUrl || url, pageSignals: data.pageSignals || {}, opportunities: data.opportunities || [] },
    savePrompt: (prompt) => {
      if (!state.me?.platformAdmin && state.me?.role !== "tenant-admin") throw new Error(L("Droits administrateur requis.", "Administrator permissions required."));
      return api("/visibility/prompts/add", prompt);
    },
  });
  const load = async () => {
    const url = normalisePublicUrl(state.url || "");
    if (!url || !ownedUrl(state.me?.tenant, url)) {
      output.replaceChildren(renderDataGuide("domain"));
      return;
    }
    button.disabled = true;
    status.textContent = L("Lecture limitée à une page publique…", "Reading one public page…");
    try {
      const response = await fetch("/api/free-read", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(25000),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      if (data.httpStatus && (data.httpStatus < 200 || data.httpStatus >= 400)) throw new Error("HTTP " + data.httpStatus);
      output.replaceChildren(render(url, data));
      status.textContent = L("Parcours prêt. Les questions sont des hypothèses non observées.", "Journey ready. Questions are unobserved hypotheses.");
    } catch (error) {
      status.textContent = L("Lecture indisponible. La trame ci-dessous est manuelle : aucun contenu de page n’a été observé.", "Reading unavailable. The outline below is manual: no page content was observed.");
      output.replaceChildren(renderDataGuide("journey", { error, retry: load }), render(url));
    } finally {
      button.disabled = false;
    }
  };
  button.onclick = load;
  button.textContent = L("Actualiser la lecture", "Refresh page reading");
  panel.append(el("p", "c-note", L("Agir → Parcours client : préparez vos contenus et vos questions avant de mesurer leur visibilité.", "Act → Customer journey: prepare content and questions before measuring visibility.")), button, status, output);
  void load();
  return panel;
}
