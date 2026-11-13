/* Guided setup: all access and audit claims come from live API responses. */
import { el } from "./render.js";
import { LANG } from "./i18n.js";
import { API_BASE } from "./config.js";
const L = (fr, en) => LANG === "fr" ? fr : en;
const button = (label, fn, cls = "btn btn-small") => { const b = el("button", cls, label); b.type = "button"; b.onclick = fn; return b; };
const keyFor = (me) => `gtm-console-wizard-v1:${me.tenant.id}:${me.email || me.username || "user"}`;
import { hasVerifiedAccess } from "./onboarding-steps.js";
import { renderTrackedQueries } from "./tracked-queries.js";
import { createDataAgent } from "./data-agent.js";

export function renderAgentHelp() {
  const box = el("section", "app-strip wizard-agent");
  box.append(el("h3", "", L("Continuer avec votre agent", "Continue with your agent")));
  box.append(el("p", "c-note", L("Dans le dépôt GTM Growth, copiez cette demande dans Codex, Claude ou Grok. Les accès Google doivent être configurés séparément.", "In the GTM Growth repository, paste this request into Codex, Claude or Grok. Google access must be configured separately.")));
  const prompt = L("Configure le serveur MCP GTM Growth pour cet environnement en suivant le guide du dépôt. Montre-moi la configuration proposée, puis vérifie que les outils sont disponibles. Ne crée aucune donnée de démonstration.", "Configure the GTM Growth MCP server for this environment using the repository guide. Show me the proposed configuration, then verify that the tools are available. Do not fabricate demonstration data.");
  const pre = el("pre", "wizard-prompt", prompt); box.append(pre);
  const feedback = el("span", "c-note");
  box.append(button(L("Copier", "Copy"), async () => { try { await navigator.clipboard.writeText(prompt); feedback.textContent = L("Copié", "Copied"); } catch { feedback.textContent = L("Sélectionnez le texte pour le copier.", "Select the text to copy it."); } }), feedback);
  const a = el("a", "", L("Configuration manuelle et fichier .mcp.json", "Manual setup and .mcp.json")); a.href = "https://github.com/Geoking2104/GTM-Growth/blob/main/docs/CODEX_SETUP.md"; a.target = "_blank"; a.rel = "noopener noreferrer"; box.append(el("p", "", "")); box.lastChild.append(a); return box;
}

export function openWizard({ state, api, scope, saveSettings, renderSettings, renderStatus, onSite, onClose }) {
  const assistant = createDataAgent({ api, language: LANG, workspaceName: state.me.tenant.name });
  const storageKey = keyFor(state.me); let step = -1, usage = state.me.tenant.usageType || "", status = null, audit = null, read = null, profile = null, profileHints = "", comparison = null, busy = false, selected = state.url;
  const overlay = el("div", "wizard-overlay"); overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true"); overlay.setAttribute("aria-labelledby", "wizard-title");
  const panel = el("div", "wizard-panel"); overlay.append(panel); document.body.append(overlay);
  const close = (complete = false) => { if (complete) localStorage.setItem(storageKey, "done"); overlay.remove(); onClose(); };
  const run = async (action) => { busy = true; draw(); try { await action(); } catch (e) { error = e.message; } finally { busy = false; draw(); } };
  let error = "", notice = "";
  function draw() {
    panel.replaceChildren();
    const top = el("div", "wizard-top"); top.append(el("span", "", step < 0 ? L("VOTRE USAGE", "YOUR USE") : `${L("ÉTAPE", "STEP")} ${step + 1} / 5`), button(L("Quitter", "Exit"), () => close(), "wizard-link")); panel.append(top);
    const title = el("h2", "", [L("Votre site", "Your website"), L("Lecture de votre site", "Your website read"), L("Connectez vos données", "Connect your data"), L("Vos concurrents", "Your competitors"), L("Votre premier audit", "Your first audit")][step] || L("Comment utilisez-vous GTM Growth ?", "How will you use GTM Growth?")); title.id = "wizard-title"; panel.append(title);
    const content = el("div", "wizard-content"); panel.append(content);
    if (step === -1) {
      content.append(assistant.element);
      const admin = state.me.platformAdmin || state.me.role === "tenant-admin";
      content.append(el("p", "c-note", L("Ce choix adapte le contexte de votre espace. Les droits et les clients accessibles restent ceux accordés par votre administrateur.", "This choice describes your workspace. Access to clients remains controlled by your administrator.")));
      for (const [value, title, hint] of [["company", L("Mon entreprise", "My company"), L("Suivre les sites de votre organisation.", "Track your organization’s sites.")], ["agency", L("Pour mes clients", "For my clients"), L("Travailler dans les espaces clients auxquels vous avez accès.", "Work in the client workspaces you can access.")]]) {
        const label = el("label", "wizard-choice"); const radio = el("input"); radio.type = "radio"; radio.name = "usage"; radio.value = value; radio.checked = usage === value; radio.disabled = !admin; radio.onchange = () => { usage = value; next.disabled = false; }; const text = el("span"); text.append(el("strong", "", title), el("p", "c-note", hint)); label.append(radio, text); content.append(label);
      }
      if (!admin) content.append(el("p", "c-note", L("Seul un administrateur peut modifier ce choix.", "Only an administrator can change this choice.")));
    }
    if (step === 0) {
      content.append(el("p", "c-note", L("Choisissez un domaine autorisé pour cet espace. Un administrateur peut modifier la liste dans les paramètres du client.", "Choose a domain authorized for this workspace. An administrator can change the client’s domain list.")));
      const label = el("label", "c-field"); label.append(el("span", "", L("Domaine", "Domain"))); const select = el("select");
      const domains = state.me.tenant.domains || []; for (const d of domains) { const o = el("option", "", d); o.value = `https://${d}`; select.append(o); }
      if (!domains.length) selected = "";
      if (domains.length) { select.value = [...select.options].some((o) => o.value === selected) ? selected : select.options[0].value; selected = select.value; }
      select.onchange = () => { selected = select.value; read = null; profile = null; profileHints = ""; audit = null; comparison = null; }; label.append(select); content.append(label);
      if (!domains.length) content.append(el("p", "c-error", L("Aucun domaine autorisé. Contactez l’administrateur de votre espace.", "No authorized domain. Contact your workspace administrator.")));
    }
    if (step === 1) {
      content.append(el("p", "c-note", L("La lecture mesure le HTML public. Vérifiez le profil proposé ; le secteur est à renseigner par vos soins.", "The read measures public HTML. Review the suggested profile; enter the industry yourself.")));
      if (!read) content.append(button(L("Analyser le site", "Analyze website"), () => run(async () => {
        const root = API_BASE.replace(/\/console$/, "");
        const [response, extracted] = await Promise.all([fetch(`${root}/free-read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: selected }) }), api("/onboarding/profile", { url: selected })]);
        const data = await response.json(); if (!response.ok) throw new Error(data.error || L("Lecture impossible", "Read failed"));
        read = data; const domain = new URL(selected).hostname; const saved = state.me.tenant.siteProfiles?.[domain];
        const pf = extracted.profile || extracted; profile = saved ? { ...saved } : { name: pf.siteName || pf.title || "", description: pf.description || "", industry: "" };
        profileHints = saved ? "" : [pf.siteNameSource === "schema" ? L("nom lu dans les données structurées", "name read from structured data") : pf.siteName ? L("nom lu dans les balises meta", "name read from meta tags") : "", pf.lang ? `${L("langue")} ${pf.lang}` : "", (pf.schemaTypes || []).length ? `${L("données structurées")} : ${pf.schemaTypes.join(", ")}` : ""].filter(Boolean).join(" · ");
      })));
      else {
        content.append(el("p", "", `${L("Score de lecture", "Read score")} : ${read.score}/100 · ${read.finalUrl}`));
        if (profileHints) content.append(el("p", "c-note", profileHints));
        for (const [key, label, max] of [["name", L("Nom", "Name"), 200], ["description", "Description", 500], ["industry", L("Secteur", "Industry"), 200]]) {
          const wrapper = el("label", "c-field"); wrapper.append(el("span", "", label)); const input = el(key === "description" ? "textarea" : "input"); input.maxLength = max; input.value = profile[key]; input.oninput = () => { profile[key] = input.value; }; wrapper.append(input); content.append(wrapper);
        }
        if (state.me.platformAdmin || state.me.role === "tenant-admin") content.append(button(L("Enregistrer le profil", "Save profile"), () => run(async () => { await saveSettings({ siteProfile: { domain: new URL(selected).hostname, ...profile } }); notice = L("Profil enregistré.", "Profile saved."); })));
        else content.append(el("p", "c-note", L("Seul un administrateur peut enregistrer le profil partagé.", "Only an administrator can save the shared profile.")));
      }
    }
    if (step === 2) {
      content.append(el("p", "c-note", L("Vérifiez au moins un accès, ou poursuivez explicitement plus tard. GTM et Clarity sont enregistrés dans les paramètres, mais leur accès n’est pas vérifié ici.", "Verify at least one connection, or explicitly continue later. GTM and Clarity can be configured below, but their access is not verified here.")));
      for (const [heading, instructions, href] of [
        ["Search Console", L("Ouvrez votre propriété, puis Paramètres → Utilisateurs et autorisations. Ajoutez le compte de service affiché ci-dessous.", "Open your property, then Settings → Users and permissions. Add the service account shown below."), "https://search.google.com/search-console"],
        ["Google Analytics", L("Dans Administration → Gestion des accès à la propriété, ajoutez le compte de service avec le rôle Lecteur.", "In Admin → Property access management, add the service account with Viewer access."), "https://analytics.google.com/"],
        ["Bing Webmaster Tools", L("Dans Paramètres → Accès API, créez une clé, puis enregistrez-la ci-dessous avec l’URL exacte du site.", "Under Settings → API access, create a key, then save it below with the exact site URL."), "https://www.bing.com/webmasters/"],
      ]) { const details = el("details"); details.append(el("summary", "", heading), el("p", "c-note", instructions)); const link = el("a", "", L("Ouvrir", "Open")); link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer"; details.append(link); content.append(details); }
      content.append(...renderSettings(state.me, async (body) => { const result = await saveSettings(body); state.property = result.tenant.gscProperties[0] || ""; state.ga4Property = result.tenant.ga4Properties[0] || ""; state.bingSite = result.tenant.bingSites[0] || ""; status = null; return result; }));
      content.append(button(L("Vérifier les accès", "Check connections"), () => run(async () => { status = await api("/tracking/status", scope()); })));
      if (status) { const list = el("ul"); for (const k of ["gsc", "ga4", "bing"]) list.append(el("li", "", `${k.toUpperCase()} : ${status[k]?.hasAccess === true ? L("accès vérifié", "access verified") : L("accès non vérifié", "access not verified")}`)); content.append(list, ...renderStatus(status, state)); if (status.gsc?.hasAccess === true) content.append(renderTrackedQueries({ state, api, scope, saveSettings })); }
    }
    if (step === 3) {
      content.append(el("p", "c-note", L("Aucun concurrent n’est détecté automatiquement. Indiquez jusqu’à cinq URL pour préparer une comparaison dans votre agent. Cette liste reste sur cet appareil. La comparaison lit les pages publiques, sans données de classement ou de trafic.", "No competitors are detected automatically. Enter up to five URLs to prepare a comparison in your agent. This list stays on this device. The comparison reads public pages, without ranking or traffic data.")));
      const label = el("label", "c-field"); label.append(el("span", "", L("URL concurrentes, une par ligne (facultatif)", "Competitor URLs, one per line (optional)"))); const field = el("textarea"); field.rows = 5; const competitorKey = `${storageKey}:competitors:${new URL(selected).hostname}`; field.value = localStorage.getItem(competitorKey) || ""; field.oninput = () => { const values = field.value.split(/\n/).map((x) => x.trim()).filter(Boolean); const valid = values.length <= 5 && values.every((x) => { try { return ["https:", "http:"].includes(new URL(x).protocol); } catch { return false; } }); field.setCustomValidity(valid ? "" : L("Saisissez au maximum cinq URL HTTP(S) valides.", "Enter at most five valid HTTP(S) URLs.")); next.disabled = !valid; if (valid) localStorage.setItem(competitorKey, field.value); }; label.append(field); content.append(label);
      content.append(button(L("Comparer les pages", "Compare pages"), () => run(async () => {
        if (!field.checkValidity()) throw new Error(L("Vérifiez les URL saisies.", "Check the URLs entered."));
        const competitors = field.value.split(/\n/).map((x) => x.trim()).filter(Boolean);
        if (!competitors.length) throw new Error(L("Ajoutez au moins une URL.", "Add at least one URL."));
        comparison = await api("/geo/positioning", { url: selected, competitors });
      })));
      if (comparison) {
        content.append(el("h3", "", L("Comparaison du vocabulaire", "Vocabulary comparison")), el("p", "", `${L("Termes communs à toutes les pages", "Terms shared by all pages")} : ${comparison.overlapScore}%`));
        content.append(el("p", "c-note", `${L("Termes propres à votre page", "Terms unique to your page")} : ${(comparison.uniqueToPrimary || []).join(", ") || "—"}`));
        for (const [url, terms] of Object.entries(comparison.competitorOnly || {})) content.append(el("p", "c-note", `${url} : ${terms.join(", ") || "—"}`));
        for (const warning of comparison.warnings || []) content.append(el("p", "c-note", warning));
      }
      const copied = el("span", "c-note");
      content.append(button(L("Copier la demande de comparaison", "Copy comparison request"), async () => {
        if (!field.checkValidity()) { field.reportValidity(); return; }
        const competitors = field.value.split(/\n/).map((x) => x.trim()).filter(Boolean);
        if (!competitors.length) { copied.textContent = L("Ajoutez au moins une URL.", "Add at least one URL."); return; }
        const prompt = L(`Utilise geo_positioning pour comparer ${selected} à ces pages : ${competitors.join(", ")}. Explique les limites de cette comparaison de contenu public.`, `Use geo_positioning to compare ${selected} with these pages: ${competitors.join(", ")}. Explain the limits of this public-page content comparison.`);
        try { await navigator.clipboard.writeText(prompt); copied.textContent = L("Copié", "Copied"); } catch { copied.textContent = prompt; }
      }), copied);
    }
    if (step === 4) {
      content.append(el("p", "c-note", L("L’audit mesure la préparation du site : il ne consulte pas les moteurs d’IA et ne mesure pas votre visibilité réelle dans leurs réponses.", "The audit measures website readiness: it does not query AI engines or measure actual visibility in their answers.")));
      if (!audit) content.append(button(L("Lancer l’audit", "Run audit"), () => run(async () => { audit = await api("/overview", { url: selected }); if (typeof audit?.geo?.score !== "number") throw new Error(L("Score indisponible", "Score unavailable")); })));
      else { content.append(el("p", "wizard-score", `${audit.geo.score} / 100`), el("h3", "", L("Priorités disponibles", "Available priorities"))); const list = el("ol"); const recs = [...(audit.geo.recommendations || [])].sort((a, b) => b.points - a.points).slice(0, 3); for (const r of recs) list.append(el("li", "", `${r.action} (+${r.points})`)); if (!recs.length) content.append(el("p", "c-note", L("Aucune recommandation disponible.", "No recommendations available."))); else content.append(list); content.append(renderAgentHelp()); }
    }
    if (busy) content.append(el("p", "c-loading", L("Analyse en cours…", "Working…")));
    if (notice) content.append(el("p", "c-note", notice));
    if (error) { const msg = el("p", "c-error", error); msg.setAttribute("role", "alert"); content.append(msg); }
    const foot = el("div", "wizard-actions");
    if (step >= 0) foot.append(button(L("Retour", "Back"), () => { error = ""; step--; draw(); }, "btn btn-ghost"));
    if (step === 2 && !hasVerifiedAccess(status)) foot.append(button(L("Plus tard", "Later"), () => { error = ""; step++; draw(); }, "btn btn-ghost"));
    const next = button(step === 4 ? L("Terminer", "Finish") : L("Continuer", "Continue"), () => {
      error = ""; notice = "";
      if (step === -1 && (state.me.platformAdmin || state.me.role === "tenant-admin")) { run(async () => { await saveSettings({ usageType: usage }); step = 0; }); return; }
      if (step === 0) onSite(selected); if (step === 4) close(true); else { step++; draw(); }
    });
    next.disabled = busy || (step === -1 && (state.me.platformAdmin || state.me.role === "tenant-admin") && !usage) || (step === 0 && !selected) || (step === 1 && !read) || (step === 2 && !hasVerifiedAccess(status)) || (step === 4 && !audit);
    foot.append(next); panel.append(foot); if (step === 3) content.querySelector("textarea").dispatchEvent(new Event("input"));
  }
  draw(); panel.querySelector("button")?.focus();
}
