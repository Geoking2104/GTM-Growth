import { API_BASE } from "./config.js";
import { login, logout, handleRedirect, accessToken } from "./auth.js";
import { TABS, raw } from "./tabs.js";
import { el } from "./render.js";

const $ = (s) => document.querySelector(s);
const state = { url: localStorage.getItem("gtm-console-url") || "", property: localStorage.getItem("gtm-console-property") || "" };

export async function api(route, body, { binary = false } = {}) {
  const token = await accessToken();
  if (!token) { await login(); throw new Error("Session expirée"); }
  const res = await fetch(`${API_BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
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

async function start() {
  let tokens;
  try { tokens = await handleRedirect(); } catch (error) { $("#c-login-error").textContent = error.message; }
  if (!tokens) { $("#c-login").hidden = false; $("#c-login-btn").onclick = () => login(); return; }
  $("#c-app").hidden = false; $("#c-logout").onclick = () => logout();
  const urlInput = $("#c-url"); const propInput = $("#c-property");
  try {
    const token = await accessToken();
    const me = await (await fetch(`${API_BASE}/me`, { headers: { Authorization: `Bearer ${token}` } })).json();
    $("#c-user").textContent = me.username ?? "";
    if (!state.url && me.defaults?.url) state.url = me.defaults.url;
    if (!state.property && me.defaults?.property) state.property = me.defaults.property;
  } catch { /* l'API répondra 401 plus tard si besoin */ }
  urlInput.value = state.url; propInput.value = state.property;
  urlInput.onchange = () => { state.url = urlInput.value.trim(); localStorage.setItem("gtm-console-url", state.url); };
  propInput.onchange = () => { state.property = propInput.value.trim(); localStorage.setItem("gtm-console-property", state.property); };
  mountTabs();
}
start();
