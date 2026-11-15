import { el } from "./render.js";
import { LANG } from "./i18n.js";
import { accessToken, login } from "./auth.js";
const L = (fr, en) => LANG === "fr" ? fr : en;
const names = {
  workspace: ["Sources configurées", "Configured sources"], search: ["Clics et impressions GSC", "GSC clicks and impressions"], analytics: ["Sessions et événements clés GA4", "GA4 sessions and key events"], visibility: ["Dernier échantillon de réponses IA", "Latest AI answer sample"], operations: ["État des opérations enregistrées", "Recorded operations status"],
};
export function agentError(code) {
  const messages = {
    pilot_disabled: ["Le pilote n’est pas activé sur ce serveur.", "The pilot is not enabled on this server."],
    identity_unavailable: ["La vérification des accès est indisponible. Réessayez plus tard.", "Access verification is unavailable. Try again later."],
    request_expired: ["Cette demande a expiré ou appartient à un autre navigateur. Relancez la connexion depuis votre agent.", "This request expired or belongs to another browser. Start a new connection from your agent."],
    workspace_denied: ["Votre compte n’a plus accès à cet espace.", "Your account cannot access this workspace."],
    login_required: ["Reconnectez-vous pour vérifier votre session.", "Sign in again to verify your session."],
    invalid_scope: ["Sélectionnez au moins une permission demandée.", "Select at least one requested permission."],
    resource_denied: ["Les sources ont changé. Rechargez la demande.", "The sources changed. Reload the request."],
    access_denied: ["Cet agent n’est pas autorisé par l’administrateur.", "This agent is not allowed by the administrator."],
    rate_limited: ["Trop de demandes. Réessayez dans une minute.", "Too many requests. Try again in one minute."],
  };
  const pair = messages[code]; return pair ? L(...pair) : L("La demande a échoué. Rechargez la page ou reconnectez-vous.", "The request failed. Reload the page or sign in again.");
}
export async function papApi(path, body) {
  const token = await accessToken(); if (!token) { await login(); throw new Error("login_required"); }
  const r = await fetch(`/api/poppy/console/${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json(); if (!r.ok) throw new Error(data.error); return data;
}
function check(label, value) { const wrapper = el("label", "c-field pap-option"); const input = el("input"); input.type = "checkbox"; input.value = value; wrapper.append(input, document.createTextNode(label)); return { wrapper, input }; }
const date = value => value ? new Date(value * 1000).toLocaleString(LANG) : L("Jamais", "Never");
export async function renderConnectedAgents({ tenant, request, api = papApi } = {}) {
  const root = el("section", "c-card pap-panel"); root.append(el("h2", "", L("Agents connectés", "Connected agents")));
  const feedback = el("p", "c-note"); feedback.setAttribute("role", "status"); feedback.setAttribute("aria-live", "polite");
  const content = el("div"); root.append(content, feedback);
  const perform = async (button, task) => { button.disabled = true; feedback.textContent = ""; try { await task(); } catch (e) { feedback.textContent = agentError(e.message); } finally { button.disabled = false; } };
  let generation = 0;
  async function load(selected = tenant) {
    const current = ++generation;
    content.replaceChildren(); const data = await api("context", { ...(selected ? { tenant: selected } : {}), ...(request ? { request } : {}) });
    if (current !== generation) return;
    content.append(el("p", "c-note", L("Pilote en lecture seule. Aucun contenu n’est publié, aucune collecte n’est lancée et aucune identité CRM n’est créée.", "Read-only pilot. No content is published, no collection is started and no CRM identity is created.")));
    const languages = el("p"); for (const lang of ["en", "fr"]) { const a = el("a", "c-btn c-btn-ghost", lang.toUpperCase()); const u = new URL(location.href); u.searchParams.set("lang", lang); if (request) u.searchParams.set("request", request); a.href = u.href; a.lang = lang; languages.append(a); } content.append(languages);
    if (data.workspaces.length > 1 || !data.tenant) {
      const label = el("label", "c-field", L("Espace autorisé", "Authorized workspace")); const select = el("select"); const prompt = el("option", "", L("Choisir un espace", "Choose a workspace")); prompt.value = ""; select.append(prompt);
      for (const w of data.workspaces) { const option = el("option", "", w.name); option.value = w.id; option.selected = w.id === data.tenant?.id; select.append(option); }
      select.onchange = () => { if (select.value) load(select.value).catch(e => { feedback.textContent = agentError(e.message); }); }; label.append(select); content.append(label);
    }
    if (!data.tenant) {
      if (data.request) { const decline = el("button", "c-btn c-btn-ghost", L("Refuser", "Decline")); decline.type = "button"; decline.onclick = () => perform(decline, async () => { const result = await api("consent", { request, approve: false }); sessionStorage.removeItem("gtm-pap-request"); location.assign(result.redirect); }); content.append(decline); }
      content.append(el("p", "c-note", L("Choisissez un espace dont vous êtes membre.", "Choose a workspace you belong to."))); return; }
    content.append(el("h3", "", data.tenant.name));
    if (data.request) {
      content.append(el("h3", "", `${data.request.clientName} · ${new URL(data.request.client).host}`), el("p", "c-note", data.request.client));
      content.append(el("p", "", L("Votre consentement dure au maximum 30 jours et prend fin plus tôt à la déconnexion ou à l’expiration de votre session Keycloak. Chaque renouvellement exige votre consentement. Les lectures utilisent uniquement les sources sélectionnées encore autorisées.", "Consent lasts at most 30 days and ends sooner on Keycloak logout or session expiry. Renewal requires your consent. Reads use only selected sources that remain authorized.")));
      const permissions = el("fieldset"); permissions.append(el("legend", "", L("Permissions — sélection explicite", "Permissions — explicit selection")));
      const scopeInputs = data.request.scopes.map(scope => { const item = check(L(...names[scope.split(":")[1]]), scope); permissions.append(item.wrapper); return item.input; }); content.append(permissions);
      const resourceInputs = {};
      for (const [key, label] of [["domains", L("Domaines pour le résumé", "Domains for the summary")], ["search", "Search Console"], ["analytics", "Google Analytics 4"]]) {
        const field = el("fieldset"); field.append(el("legend", "", label)); resourceInputs[key] = data.resources[key].map(source => { const item = check(source, source); field.append(item.wrapper); return item.input; });
        if (!resourceInputs[key].length) field.append(el("p", "c-note", L("Aucune source configurée.", "No configured source."))); content.append(field);
      }
      content.append(el("p", "c-note", L("Visibilité IA et opérations couvrent l’espace sélectionné. Les mentions non validées restent distinctes ; un événement GA4 ne prouve pas une vente.", "AI visibility and operations cover the selected workspace. Unreviewed mentions remain separate; a GA4 key event does not prove a sale.")));
      const approve = el("button", "c-btn", L("Autoriser les lectures sélectionnées", "Allow selected reads")); approve.type = "button"; approve.disabled = !data.request.allowed;
      if (!data.request.allowed) content.append(el("p", "c-note", agentError("access_denied")));
      const decline = el("button", "c-btn c-btn-ghost", L("Refuser", "Decline")); decline.type = "button";
      const finish = async body => { const result = await api("consent", { request, ...body }); sessionStorage.removeItem("gtm-pap-request"); location.assign(result.redirect); };
      approve.onclick = () => perform(approve, () => finish({ approve: true, tenant: data.tenant.id, scopes: scopeInputs.filter(x => x.checked).map(x => x.value), resources: Object.fromEntries(Object.entries(resourceInputs).map(([k, inputs]) => [k, inputs.filter(x => x.checked).map(x => x.value)])) }));
      decline.onclick = () => perform(decline, () => finish({ approve: false })); content.append(approve, decline); return;
    }
    if (data.role === "tenant-admin") {
      const policy = el("fieldset"); policy.append(el("legend", "", L("Administration du pilote", "Pilot administration")));
      const enabled = check(L("Activer pour cet espace", "Enable for this workspace"), "enabled"); enabled.input.checked = data.policy.enabled; policy.append(enabled.wrapper);
      const clients = data.allowedClients.map(client => { const item = check(client, client); item.input.checked = data.policy.clients.includes(client); policy.append(item.wrapper); return item.input; });
      const save = el("button", "c-btn", L("Enregistrer la politique", "Save policy")); save.type = "button";
      save.onclick = () => perform(save, async () => { await api("policy", { tenant: data.tenant.id, enabled: enabled.input.checked, clients: clients.filter(x => x.checked).map(x => x.value) }); await load(data.tenant.id); feedback.textContent = L("Politique enregistrée. Les autorisations exclues sont révoquées.", "Policy saved. Excluded authorizations have been revoked."); }); policy.append(save); content.append(policy);
    }
    content.append(el("p", "c-note", L("Révoquer bloque les nouvelles lectures. Les données déjà transmises à l’agent ne peuvent pas être récupérées par ce bouton.", "Revoking blocks new reads. This button cannot retrieve data already sent to the agent.")));
    if (!data.grants.length) content.append(el("p", "c-note", L("Aucun agent connecté. Lancez une connexion depuis un agent autorisé par votre administrateur.", "No connected agent. Start a connection from an agent allowed by your administrator.")));
    content.append(el("p", "c-note", L("Première question à poser : quelles sources sont configurées dans mon espace autorisé ? Puis demandez les clics Search Console sur 28 jours si cette source est sélectionnée.", "First question to ask: which sources are configured in my authorized workspace? Then ask for Search Console clicks over 28 days if that source is selected.")));
    for (const g of data.grants) {
      const card = el("article", "c-card"); card.append(el("h3", "", `${g.clientName} · ${new URL(g.client).host}`));
      const active = !g.revoked && g.expires * 1000 > Date.now();
      card.append(el("p", "", `${L("Compte", "Account")}: ${g.user} · ${L("Espace", "Workspace")}: ${data.tenant.name}`), el("p", "", g.scopes.map(s => L(...names[s.split(":")[1]])).join(" · ")));
      card.append(el("p", "", Object.values(g.resources).flat().join(" · ") || L("Aucune propriété sélectionnée", "No selected property")));
      card.append(el("p", "", `${L("Consentement", "Consent")}: ${date(g.created)} · ${L("Expiration maximale", "Maximum expiry")}: ${date(g.expires)} · ${L("Dernière lecture", "Last read")}: ${date(g.lastUsed)}`), el("p", "", g.revoked ? L("Révoqué", "Revoked") : active ? L("Autorisé — accès courant vérifié à chaque lecture", "Authorized — current access checked on every read") : L("Expiré", "Expired")));
      if (active) { const revoke = el("button", "c-btn c-btn-ghost", L("Révoquer l’accès", "Revoke access")); revoke.type = "button"; revoke.onclick = () => perform(revoke, async () => { await api("revoke", { tenant: data.tenant.id, grant: g.id }); await load(data.tenant.id); feedback.textContent = L("Accès révoqué. Les nouvelles lectures sont bloquées.", "Access revoked. New reads are blocked."); }); card.append(revoke); } content.append(card);
    }
  }
  try { await load(); } catch (e) { feedback.textContent = agentError(e.message); } return root;
}
