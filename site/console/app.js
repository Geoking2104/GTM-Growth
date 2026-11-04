import { API_BASE, DISCOVER, CONSOLE_DOMAIN } from "./config.js";
import { login, logout, handleRedirect, accessToken, currentTenant, setTenant, accountConsoleUrl } from "./auth.js";
import { TABS, raw } from "./tabs.js";
import { el } from "./render.js";

const $ = (s) => document.querySelector(s);
const selectedTenant = () => sessionStorage.getItem("gtm-console-selected") || currentTenant()?.id || "";
const headers = (token) => ({ Authorization: `Bearer ${token}`, ...(selectedTenant() ? { "X-Tenant": selectedTenant() } : {}) });
const state = { url: localStorage.getItem("gtm-console-url") || "", property: localStorage.getItem("gtm-console-property") || "" };

export async function api(route, body, { binary = false } = {}) {
  const token = await accessToken();
  if (!token) { await login(); throw new Error("Session expirée"); }
  const res = await fetch(`${API_BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers(token) }, body: JSON.stringify(body) });
  if (res.status === 401) { await login(); throw new Error("Session expirée"); }
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Erreur ${res.status}`); }
  return binary ? res.blob() : res.json();
}

function paramField(p) {
  const label = el("label", "c-field"); label.append(el("span", "", p.label));
  let input;
  if (p.type === "select") { input = el("select"); for (const [v, t] of p.options) { const o = el("option", "", t); o.value = v; input.append(o); } }
  else if (p.type === "textarea") { input = el("textarea"); input.rows = p.rows ?? 4; input.value = p.value ?? ""; }
  else { input = el("input"); input.type = p.type ?? "text"; if (p.value !== undefined) input.value = p.value; if (p.step) input.step = p.step; if (p.placeholder) input.placeholder = p.placeholder; }
  input.name = p.name; label.append(input); return label;
}

function renderAction(action) {
  const card = el("section", "c-card");
  card.append(el("h3", "", action.label));
  if (action.help) card.append(el("p", "c-note", action.help));
  const form = el("form", "c-form");
  for (const p of action.params ?? []) form.append(paramField(p));
  const btn = el("button", "c-btn", action.button ?? "Lancer"); btn.type = "submit"; form.append(btn);
  const out = el("div", "c-out");
  form.onsubmit = async (event) => {
    event.preventDefault();
    const body = { url: state.url, property: state.property || undefined };
    for (const [k, v] of new FormData(form)) body[k] = v;
    if (action.local) { out.replaceChildren(...[action.local(body)].flat()); return; }
    if (action.needsUrl !== false && !state.url) { out.replaceChildren(el("p", "c-error", "Renseignez d'abord le domaine en haut de la page.")); return; }
    btn.disabled = true; out.replaceChildren(el("p", "c-note", "Analyse en cours…"));
    try {
      if (action.download) { const blob = await api(action.route, body, { binary: true }); const a = el("a", "c-btn", "Télécharger le PDF"); a.href = URL.createObjectURL(blob); a.download = action.download; out.replaceChildren(a); a.click(); return; }
      const data = await api(action.route, body);
      out.replaceChildren(...[action.render ? action.render(data, body) : []].flat(), raw(data));
    } catch (error) { out.replaceChildren(el("p", "c-error", error.message)); }
    finally { btn.disabled = false; }
  };
  card.append(form, out); return card;
}

function mountTabs() {
  const nav = $("#c-tabs"); const main = $("#c-panels");
  TABS.forEach((tab, i) => {
    const b = el("button", "c-tab", tab.label); b.type = "button"; b.setAttribute("role", "tab");
    const panel = el("div", "c-panel"); panel.setAttribute("role", "tabpanel"); panel.hidden = i !== 0;
    panel.append(el("p", "c-intro", tab.intro), ...tab.actions.map(renderAction));
    b.onclick = () => { nav.querySelectorAll(".c-tab").forEach((x) => x.setAttribute("aria-selected", "false")); b.setAttribute("aria-selected", "true"); main.querySelectorAll(".c-panel").forEach((p) => (p.hidden = p !== panel)); location.hash = tab.id; };
    b.setAttribute("aria-selected", String(i === 0));
    nav.append(b); main.append(panel);
  });
  const wanted = [...nav.children].find((b, i) => TABS[i].id === location.hash.slice(1)); wanted?.click();
}

function applyBranding(branding) {
  if (branding?.primaryColor) document.documentElement.style.setProperty("--brand", branding.primaryColor);
  if (branding?.logoUrl) { const img = $("#c-login-logo") ; img.src = branding.logoUrl; img.hidden = false; }
}

async function discover(query) {
  const res = await fetch(`${DISCOVER}?${new URLSearchParams(query)}`, { cache: "no-store" });
  return res.ok ? res.json() : null;
}

/** Découverte du tenant : sous-domaine, ?tenant=, puis e-mail saisi.
 * Le gestionnaire est attaché avant tout await : un clic n'est jamais perdu, et
 * toute erreur est affichée au lieu d'échouer silencieusement. */
async function loginScreen() {
  $("#c-login").hidden = false;
  const errorBox = $("#c-login-error"); const btn = $("#c-login-btn");
  let tenant = currentTenant();
  let ready = Promise.resolve();
  $("#c-login-form").onsubmit = async (event) => {
    event.preventDefault();
    errorBox.textContent = ""; btn.disabled = true; btn.textContent = "Redirection…";
    try {
      await ready;
      const email = $("#c-login-email").value.trim();
      if (!tenant && email) {
        // Domaine inconnu ou public (gmail.com…) : connexion au realm par défaut ;
        // l'espace client est ensuite déduit des claims du jeton (organisation, groupes).
        tenant = await discover({ email }).catch(() => null);
        if (tenant) setTenant(tenant);
      }
      await login(email || undefined);
    } catch (error) {
      console.error(error);
      errorBox.textContent = `Connexion impossible : ${error?.message ?? error}`;
      btn.disabled = false; btn.textContent = "Continuer";
    }
  };
  const fromUrl = new URLSearchParams(location.search).get("tenant");
  const host = location.hostname.endsWith(`.${CONSOLE_DOMAIN}`) ? location.hostname : "";
  if (!tenant && (fromUrl || host)) {
    ready = discover(fromUrl ? { tenant: fromUrl } : { host }).then((t) => {
      if (t) { tenant = t; setTenant(t); applyBranding(t.branding); btn.textContent = `Se connecter à ${t.name}`; }
    }).catch(() => {});
  } else if (tenant) { applyBranding(tenant.branding); btn.textContent = `Se connecter à ${tenant.name}`; }
}

async function start() {
  let tokens;
  try { tokens = await handleRedirect(); } catch (error) { console.error(error); $("#c-login-error").textContent = error.message; }
  if (!tokens) return loginScreen();
  $("#c-app").hidden = false; $("#c-logout").onclick = () => { setTenant(null); sessionStorage.removeItem("gtm-console-selected"); logout(); };
  $("#c-account").href = accountConsoleUrl();
  const urlInput = $("#c-url"); const propInput = $("#c-property");
  try {
    const token = await accessToken();
    const res = await fetch(`${API_BASE}/me`, { headers: headers(token) });
    const me = await res.json();
    if (!res.ok) throw new Error(me.error || `Erreur ${res.status}`);
    $("#c-user").textContent = `${me.username ?? ""}${me.tenant ? ` · ${me.tenant.name}` : ""}${me.platformAdmin ? " · super-admin" : ""}`;
    if (me.accountConsole) $("#c-account").href = me.accountConsole;
    applyBranding(me.tenant?.branding);
    if ((me.memberships?.length ?? 0) > 1 || me.platformAdmin) {
      const select = $("#c-tenant"); $("#c-tenant-wrap").hidden = false;
      for (const m of me.memberships ?? []) { const o = el("option", "", `${m.id} (${m.role})`); o.value = m.id; select.append(o); }
      if (me.tenant && ![...select.options].some((o) => o.value === me.tenant.id)) { const o = el("option", "", me.tenant.id); o.value = me.tenant.id; select.append(o); }
      select.value = me.tenant?.id ?? "";
      select.onchange = () => { sessionStorage.setItem("gtm-console-selected", select.value); location.reload(); };
    }
    if (!state.url && me.tenant?.domains?.[0]) state.url = `https://${me.tenant.domains[0]}`;
    if (!state.property && me.tenant?.gscProperties?.[0]) state.property = me.tenant.gscProperties[0];
  } catch (error) { $("#c-user").textContent = error.message; }
  urlInput.value = state.url; propInput.value = state.property;
  urlInput.onchange = () => { state.url = urlInput.value.trim(); localStorage.setItem("gtm-console-url", state.url); };
  propInput.onchange = () => { state.property = propInput.value.trim(); localStorage.setItem("gtm-console-property", state.property); };
  mountTabs();
}
start().catch((error) => { console.error(error); loginScreen(); $("#c-login-error").textContent = error.message; });
