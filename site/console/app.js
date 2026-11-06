/* Console authentifiÃ©e : mÃªme design que la section #console du site (coque .app),
 * donnÃ©es en direct via /api/console/*. Les dÃ©finitions d'outils viennent de tools.js. */
import { API_BASE, DISCOVER, CONSOLE_DOMAIN } from "./config.js";
import { login, logout, handleRedirect, accessToken, currentTenant, setTenant, accountConsoleUrl } from "./auth.js";
import { TABS, raw } from "./tools.js";
import { el } from "./render.js";
import { t, tr, actionLabel, LANG } from "./i18n.js";
import { icon } from "./icons.js";
import { renderCompetition } from "./competition.js";
import { renderAiVisibility } from "./ai-visibility.js";
import { renderAudienceOverview } from "./audience-overview.js";
import { renderOverview, renderPlan, renderIndexNow } from "./overview.js";
import { renderOnboarding } from "./onboarding.js";
import { renderAccessManagement } from "./access-management.js";
import { createBackgroundLoader } from "./background.js";
import { renderPlatformDashboard } from "./platform-dashboard.js";
import { renderPlatformSetup } from "./platform-setup.js";
import { renderTrackedQueries } from "./tracked-queries.js";
import { renderOpsPrompts, renderOpsRank, renderOpsArticles, renderOpsAlerts } from "./ops.js";
import { openWizard, renderAgentHelp } from "./onboarding-wizard.js";
import { toolbar, renderSearchPerformance, renderQueryPages, renderSitemaps, renderGa4, renderRealtime, renderEcommerce, renderTechnology, renderGtm, renderBing, renderStatus, renderTags, renderSettings } from "./analytics.js";

const $ = (s) => document.querySelector(s);
const selectedTenant = () => sessionStorage.getItem("gtm-console-selected") || currentTenant()?.id || "";
const headers = (token) => ({ Authorization: `Bearer ${token}`, ...(selectedTenant() ? { "X-Tenant": selectedTenant() } : {}) });
const ls = (k) => localStorage.getItem(`gtm-console-${k}`) || "";
const state = { url: ls("url"), property: ls("property"), ga4Property: ls("ga4Property"), bingSite: ls("bingSite"), days: Number(ls("days")) || 28, searchType: ls("searchType") || "web", overview: null, overviewFor: "", me: null };
/** Corps commun des requÃªtes Track : domaine, propriÃ©tÃ©s, pÃ©riode. */
const scope = (extra = {}) => ({ url: state.url || undefined, property: state.property || undefined, ga4Property: state.ga4Property || undefined, bingSite: state.bingSite || undefined, days: state.days, searchType: state.searchType, ...extra });
const rerender = () => show(current.section, current.tab);
/** Vue de donnÃ©es : barre de pÃ©riode + rendu ; ne demande pas de domaine. */
const live = (route, render, opts = {}) => ({ needsDomain: false, async: async () => [toolbar(state, rerender, opts), ...[render(await api(route, scope()))].flat()] });
const tool = (id) => TABS.find((x) => x.id === id);
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u || "â€”"; } };

async function fetchApi(route, body, { binary = false } = {}) {
  const token = await accessToken();
  if (!token) { await login(); throw new Error("Session expirÃ©e"); }
  const res = await fetch(`${API_BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers(token) }, body: JSON.stringify(body) });
  if (res.status === 401) { await login(); throw new Error("Session expirÃ©e"); }
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Erreur ${res.status}`); }
  return binary ? res.blob() : res.json();
}


const automaticRoutes = new Set(["/overview", "/tracking/status", "/search/performance", "/search/query-pages", "/search/sitemaps", "/ga4/overview", "/ga4/ecommerce", "/ga4/technology", "/bing/performance", "/sitemap/map", "/geo/citability", "/geo/robots", "/geo/schema", "/performance/weight", "/ai-visibility/datasets", "/competition/state", "/gtm/inventory", "/search/queries", "/search/trends", "/search/losing-pages", "/keywords/opportunities", "/sitemap/audit", "/geo/llms", "/performance/pagespeed", "/performance/crux", "/audit/technical", "/audit/serp-preview"]);
const background = createBackgroundLoader((route, body) => fetchApi(route, body), renderBackground);
export async function api(route, body, options = {}) {
  if (!options.binary && automaticRoutes.has(route)) return background.request(selectedTenant() || state.me?.tenant?.id || "", route, body);
  const result = await fetchApi(route, body, options);
  if (["/ai-visibility/import", "/ai-visibility/review", "/ai-visibility/openai-run", "/ai-visibility/gemini-run", "/competition/panel", "/competition/revise-panel", "/competition/group", "/competition/alert-config", "/competition/priority", "/competition/action", "/gtm/write", "/gtm/publish"].includes(route)) startBackground();
  return result;
}
function renderBackground(jobs) {
  const box = $("#c-background"), summary = $("#c-background-summary"), list = $("#c-background-jobs");
  if (!box || !summary || !list) return;
  box.hidden = jobs.length === 0;
  const done = jobs.filter((j) => !["queued", "running"].includes(j.state)).length;
  const errors = jobs.filter((j) => j.state === "error").length;
  summary.textContent = LANG === "fr" ? `Analyses en arriÃ¨re-plan : ${done}/${jobs.length} terminÃ©es${errors ? ` Â· ${errors} en erreur` : ""}` : `Background analyses: ${done}/${jobs.length} finished${errors ? ` Â· ${errors} failed` : ""}`;
  const labels = LANG === "fr" ? { queued: "En attente", running: "En cours", done: "TerminÃ©", error: "Indisponible", skipped: "Non configurÃ©" } : { queued: "Queued", running: "Running", done: "Done", error: "Unavailable", skipped: "Not configured" };
  list.replaceChildren(...jobs.map((job) => { const item = el("li", `c-background-${job.state}`); item.append(el("strong", "", job.label), document.createTextNode(` â€” ${labels[job.state]}${job.detail ? ` : ${job.detail}` : ""}`)); return item; }));
}
function startBackground() {
  background.reset(); state.overview = null; state.overviewFor = "";
  if (!state.me?.tenant) return;
  const base = scope(); const actionBody = { url: state.url, property: state.property || undefined };
  const missing = LANG === "fr" ? "Renseignez les paramÃ¨tres dans Tracking." : "Configure the connection in Tracking.";
  const tasks = [
    ["GEO", "/overview", { url: state.url }, !state.url],
    [LANG === "fr" ? "AccÃ¨s" : "Connections", "/tracking/status", base, false],
    ["Search Console", "/search/performance", base, !state.property],
    [LANG === "fr" ? "RequÃªtes et pages" : "Queries and pages", "/search/query-pages", base, !state.property],
    ["Sitemaps Search Console", "/search/sitemaps", base, !state.property],
    ["GA4", "/ga4/overview", base, !state.ga4Property],
    ["GA4 e-commerce", "/ga4/ecommerce", base, !state.ga4Property],
    [LANG === "fr" ? "GA4 technologie" : "GA4 technology", "/ga4/technology", base, !state.ga4Property],
    ["Bing", "/bing/performance", base, !state.bingSite],
    ["Google Tag Manager", "/gtm/inventory", scope({ container: state.gtmContainer || undefined }), !state.me.tenant.gtmContainers?.length],
    ["Sitemap", "/sitemap/map", actionBody, !state.url],
    [LANG === "fr" ? "CitabilitÃ©" : "Citability", "/geo/citability", actionBody, !state.url],
    ["Robots IA", "/geo/robots", actionBody, !state.url],
    [LANG === "fr" ? "DonnÃ©es structurÃ©es" : "Structured data", "/geo/schema", actionBody, !state.url],
    [LANG === "fr" ? "Poids de page" : "Page weight", "/performance/weight", actionBody, !state.url],
    [LANG === "fr" ? "RÃ©ponses IA importÃ©es" : "Imported AI answers", "/ai-visibility/datasets", {}, false],
    [LANG === "fr" ? "Concurrence" : "Competition", "/competition/state", {}, false],
  ].map(([label, route, body, skip]) => ({ label, route, body, skip: skip ? missing : "" }));
  const preload = new Set(["/search/queries", "/search/trends", "/search/losing-pages", "/keywords/opportunities", "/sitemap/audit", "/geo/llms", "/performance/pagespeed", "/performance/crux", "/audit/technical", "/audit/serp-preview"]);
  for (const group of TABS) for (const action of group.actions) {
    if (!preload.has(action.route)) continue;
    const body = { ...actionBody };
    for (const param of action.params || []) body[param.name] = String(param.value ?? (param.type === "select" ? param.options?.[0]?.[0] ?? "" : ""));
    const skip = action.route.startsWith("/search/") || action.route.startsWith("/keywords/") ? !state.property : !state.url;
    tasks.push({ label: tr(action.label), route: action.route, body, skip: skip ? missing : "" });
  }
  void background.start(selectedTenant() || state.me.tenant.id, tasks);
}

async function overview() {
  if (state.overview && state.overviewFor === state.url) return state.overview;
  const url = state.url; const data = await api("/overview", { url }); if (state.url === url) { state.overview = data; state.overviewFor = url; } return data;
}

async function reportsList() {
  try { const token = await accessToken(); const r = await fetch(`${API_BASE}/reports`, { headers: headers(token) }); return r.ok ? (await r.json()).reports ?? [] : []; } catch { return []; }
}

/* â”€â”€ Sections de la barre latÃ©rale : Track / Act, comme la dÃ©mo publique â”€â”€ */
const custom = (id, tabs) => ({ id, tabs });
const fromTool = (id, filter = () => true, intro) => () => { const x = tool(id); return { intro: intro ?? tr(x.intro), tabs: x.actions.filter(filter).map((a) => ({ id: a.id, label: actionLabel(a), action: a })) }; };
const SECTIONS = {
  track: [
    { id: "overview", icon: "overview", build: () => custom("overview", [
      { id: "board", label: t("s_overview"), async: async () => {
        const [ov, status, reports] = await Promise.all([overview().catch(() => null), api("/tracking/status", scope()).catch(() => null), reportsList()]);
        const [search, ga4] = await Promise.all([
          status?.gsc?.hasAccess === true ? api("/search/performance", scope()).catch(() => ({ problem: true })) : null,
          status?.ga4?.hasAccess === true ? api("/ga4/overview", scope()).catch(() => ({ problem: true })) : null,
        ]);
        return [renderAudienceOverview({ search, ga4, status, state, rerender }), ...(ov ? renderOverview(ov) : []), renderOnboarding({ status, tenant: state.me?.tenant, overview: ov, reports }), wizardButton(), renderAgentHelp()];
      } },
      { id: "plan", label: t("t_plan"), async: async () => renderPlan(await overview()) }]) },
    { id: "competition", icon: "geo", build: () => custom("competition", [{ id: "board", label: LANG === "fr" ? "Concurrence" : "Competition", needsDomain: false, async: async () => renderCompetition({ api, me: state.me, property: state.property, days: state.days }) }]) },
    { id: "ai_visibility", icon: "geo", build: () => custom("ai_visibility", [{ id: "board", label: LANG === "fr" ? "RÃ©ponses IA" : "AI answers", needsDomain: false, async: async () => renderAiVisibility({ api, me: state.me }) }]) },
    { id: "gsc", icon: "google", build: () => custom("gsc", [
      { id: "performance", label: t("t_gscPerf"), ...live("/search/performance", renderSearchPerformance, { searchType: true }) },
      { id: "query-pages", label: t("t_queryPages"), ...live("/search/query-pages", renderQueryPages) },
      { id: "sitemaps", label: t("t_gscSitemaps"), needsDomain: false, async: async () => renderSitemaps(await api("/search/sitemaps", scope())) }]) },
    { id: "ga4", icon: "ga4", build: () => custom("ga4", [
      { id: "overview", label: t("t_ga4"), ...live("/ga4/overview", renderGa4) },
      { id: "ecommerce", label: t("t_ecommerce"), ...live("/ga4/ecommerce", renderEcommerce) },
      { id: "technology", label: t("t_technology"), ...live("/ga4/technology", renderTechnology) },
      { id: "realtime", label: t("t_realtime"), needsDomain: false, async: async () => renderRealtime(await api("/ga4/realtime", scope())) }]) },
    { id: "bing", icon: "bing", build: () => custom("bing", [{ id: "performance", label: t("t_bing"), ...live("/bing/performance", renderBing) }]) },
    { id: "geo", icon: "geo", build: fromTool("geo", (a) => a.id !== "citability") },
    { id: "citability", icon: "citability", build: fromTool("geo", (a) => a.id === "citability", t("citIntro")) },
    { id: "indexnow", icon: "indexnow", build: () => custom("indexnow", [{ id: "readiness", label: t("s_indexnow"), needsDomain: false, async: async () => renderIndexNow(await overview().catch(() => null)) }]) },
    { id: "sitemap", icon: "sitemap", build: fromTool("sitemap") },
    { id: "performance", icon: "performance", build: fromTool("performance") },
  ],
  act: [
    { id: "search", icon: "search", build: fromTool("search") },
    { id: "keywords", icon: "keywords", build: () => { const base = fromTool("keywords")(); base.tabs.push({ id: "tracked", label: LANG === "fr" ? "RequÃªtes suivies" : "Tracked queries", needsDomain: false, async: async () => renderTrackedQueries({ state, api, scope, saveSettings }) }); return base; } },
    { id: "tracking", icon: "tracking", build: () => custom("tracking", [
      { id: "status", label: t("t_status"), needsDomain: false, async: async () => renderStatus(await api("/tracking/status", scope()), state) },
      { id: "tags", label: t("t_tags"), async: async () => renderTags(await api("/tracking/status", scope())) },
      { id: "settings", label: t("t_settings"), needsDomain: false, async: async () => { const status = await api("/tracking/status", scope()).catch(() => null); return renderSettings(state.me, saveSettings, status?.serviceAccount ?? null, api); } },
      { id: "access", label: LANG === "fr" ? "AccÃ¨s" : "Access", needsDomain: false, async: async () => renderAccessManagement(state.me, api) }]) },
    { id: "gtm", icon: "tracking", build: () => custom("gtm", [
      { id: "workspace", label: t("t_gtm"), needsDomain: false, async: async () => renderGtm(await api("/gtm/inventory", scope({ container: state.gtmContainer || undefined })), api, rerender) }]) },
    { id: "audit", icon: "audit", build: fromTool("audit") },
    { id: "generators", icon: "generators", build: fromTool("generators") },
    { id: "calculators", icon: "calculators", build: fromTool("calculators") },
    { id: "report", icon: "report", build: fromTool("report") },
    { id: "ops", icon: "tracking", build: () => custom("ops", [
      { id: "prompts", label: LANG === "fr" ? "Visibilité IA en direct" : "Live AI visibility", needsDomain: false, async: async () => renderOpsPrompts({ api, me: state.me }) },
      { id: "rank", label: LANG === "fr" ? "Positions suivies" : "Tracked rankings", needsDomain: false, async: async () => renderOpsRank({ api, me: state.me }) },
      { id: "articles", label: LANG === "fr" ? "Articles" : "Articles", needsDomain: false, async: async () => renderOpsArticles({ api, me: state.me }) },
      { id: "alerts", label: LANG === "fr" ? "Alertes" : "Alerts", needsDomain: false, async: async () => renderOpsAlerts({ api, me: state.me }) }]) },
  ],
};
const ALL = [...SECTIONS.track, ...SECTIONS.act];

function paramField(p) {
  const label = el("label", "c-field"); label.append(el("span", "", tr(p.label)));
  let input;
  if (p.type === "select") { input = el("select"); for (const [v, txt] of p.options) { const o = el("option", "", tr(txt)); o.value = v; input.append(o); } }
  else if (p.type === "textarea") { input = el("textarea"); input.rows = p.rows ?? 4; input.value = p.value ?? ""; }
  else { input = el("input"); input.type = p.type ?? "text"; if (p.value !== undefined) input.value = p.value; if (p.step) input.step = p.step; if (p.placeholder) input.placeholder = p.placeholder; }
  input.name = p.name; label.append(input); return label;
}

function renderAction(action) {
  const card = el("section", "c-card");
  card.append(el("h3", "", actionLabel(action)));
  if (action.help) card.append(el("p", "c-note", tr(action.help)));
  const form = el("form", "c-form");
  for (const p of action.params ?? []) form.append(paramField(p));
  const btn = el("button", "btn btn-small", tr(action.button) ?? t("run")); btn.type = "submit"; form.append(btn);
  const out = el("div", "c-out");
  form.onsubmit = async (event) => {
    event.preventDefault();
    const body = { url: state.url, property: state.property || undefined };
    for (const [k, v] of new FormData(form)) body[k] = v;
    if (action.local) { out.replaceChildren(...[action.local(body)].flat()); return; }
    if (action.needsUrl !== false && !state.url) { out.replaceChildren(el("p", "c-error", t("noDomain"))); return; }
    btn.disabled = true; out.replaceChildren(el("p", "c-loading", t("running")));
    try {
      if (action.download) { const blob = await api(action.route, body, { binary: true }); const a = el("a", "btn btn-small", t("download")); a.href = URL.createObjectURL(blob); a.download = action.download; out.replaceChildren(a); a.click(); return; }
      const data = await api(action.route, body);
      out.replaceChildren(...[action.render ? action.render(data, body) : []].flat(), raw(data));
    } catch (error) { out.replaceChildren(el("p", "c-error", error.message)); }
    finally { btn.disabled = false; }
  };
  card.append(form, out);
  if (action.route && automaticRoutes.has(action.route) && (!action.needsUrl || state.url)) form.requestSubmit();
  return card;
}

function wizardButton() {
  const button = el("button", "btn btn-small", LANG === "fr" ? "Refaire le dÃ©marrage guidÃ©" : "Restart guided setup");
  button.type = "button"; button.onclick = launchWizard; return button;
}
function launchWizard() {
  if (!state.me?.tenant) return;
  openWizard({ state, api, scope, saveSettings, renderSettings, renderStatus, onSite: (url) => {
    state.url = url; state.overview = null; state.overviewFor = "";
    localStorage.setItem("gtm-console-url", url); $("#c-url").value = url; refreshSite();
  }, onClose: () => show("overview") });
}
let current = { section: "overview", tab: "" };
async function saveSettings(body) {
  const token = await accessToken();
  const res = await fetch(`${API_BASE}/tenant/settings`, { method: "PUT", headers: { "Content-Type": "application/json", ...headers(token) }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  state.me = { ...state.me, tenant: data.tenant };
  if (!state.property && data.tenant.gscProperties[0]) state.property = data.tenant.gscProperties[0];
  if (!state.ga4Property && data.tenant.ga4Properties?.[0]) state.ga4Property = data.tenant.ga4Properties[0];
  if (!state.bingSite && data.tenant.bingSites?.[0]) state.bingSite = data.tenant.bingSites[0];
  startBackground();
  return data;
}
async function show(sectionId, tabId) {
  const section = ALL.find((s) => s.id === sectionId) ?? ALL[0];
  const def = section.build();
  const tab = def.tabs.find((x) => x.id === tabId) ?? def.tabs[0];
  current = { section: section.id, tab: tab.id };
  history.replaceState(null, "", `#${section.id}${tab.id !== def.tabs[0].id ? `/${tab.id}` : ""}`);
  document.querySelectorAll(".app-nav a").forEach((a) => { const on = a.dataset.section === section.id; a.classList.toggle("is-active", on); if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
  $("#c-crumb").textContent = (section.id === "platform" ? (LANG === "fr" ? "Administration plateforme" : "Platform administration") : section.id === "competition" ? (LANG === "fr" ? "Concurrence" : "Competition") : section.id === "ai_visibility" ? (LANG === "fr" ? "VisibilitÃ© IA" : "AI visibility") : t(`s_${section.id}`));
  const tabs = $("#c-tabs"); tabs.replaceChildren();
  for (const x of def.tabs) {
    const b = el("button", `app-tab${x.id === tab.id ? " is-active" : ""}`); b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(x.id === tab.id));
    const ic = el("span", "app-tab-icon"); ic.innerHTML = icon(section.icon); b.append(ic, x.label);
    b.onclick = () => show(section.id, x.id); tabs.append(b);
  }
  const panel = el("section", "app-panel c-panel"); panel.setAttribute("role", "tabpanel");
  $("#c-panels").replaceChildren(panel);
  if (def.intro) panel.append(el("p", "c-intro", def.intro));
  if (tab.action) { panel.append(renderAction(tab.action)); return; }
  if (!state.url && tab.needsDomain !== false) { panel.append(el("p", "c-intro", t("noDomain"))); return; }
  const loading = el("p", "c-loading", t("loadingOverview")); panel.append(loading);
  try { const nodes = await tab.async(); if (current.section === section.id && current.tab === tab.id) loading.replaceWith(...[nodes].flat()); }
  catch (error) { loading.replaceWith(el("p", "c-error", error.message)); }
}

function mountNav() {
  for (const [group, list] of Object.entries(SECTIONS)) {
    const ul = $(`#c-nav-${group}`);
    for (const s of list) { const li = el("li"); const a = el("a"); a.href = `#${s.id}`; a.dataset.section = s.id; a.innerHTML = icon(s.icon); a.append(el("span", "", (s.id === "platform" ? (LANG === "fr" ? "Administration plateforme" : "Platform administration") : s.id === "competition" ? (LANG === "fr" ? "Concurrence" : "Competition") : s.id === "ai_visibility" ? (LANG === "fr" ? "VisibilitÃ© IA" : "AI visibility") : t(`s_${s.id}`)))); a.onclick = (e) => { e.preventDefault(); show(s.id); }; li.append(a); ul.append(li); }
  }
  const search = $("#c-search");
  search.oninput = () => { const q = search.value.trim().toLowerCase(); document.querySelectorAll(".app-nav li").forEach((li) => { li.hidden = q && !li.textContent.toLowerCase().includes(q); }); };
  search.onkeydown = (e) => { if (e.key === "Enter") { const first = [...document.querySelectorAll(".app-nav li:not([hidden]) a")][0]; first?.click(); } };
  document.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); search.focus(); } });
}

function i18nStatic() {
  document.querySelectorAll("[data-i18n]").forEach((n) => { n.textContent = t(n.dataset.i18n); });
  document.querySelectorAll("[data-i18n-ph]").forEach((n) => { n.placeholder = t(n.dataset.i18nPh); n.setAttribute("aria-label", t(n.dataset.i18nPh)); });
  document.title = t("title");
  const other = LANG === "en" ? "fr" : "en"; const l = $("#c-lang"); l.textContent = other.toUpperCase();
  l.onclick = (e) => { e.preventDefault(); localStorage.setItem("gtm-console-lang", other); const u = new URL(location.href); u.searchParams.delete("lang"); location.replace(u); };
}

function refreshSite() {
  $("#c-switch-label").textContent = host(state.url); $("#c-crumb-site").textContent = host(state.url);
  $("#c-live").textContent = `${t("live")} Â· ${new Date().toLocaleDateString(LANG === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;
}

function applyBranding(branding) {
  if (branding?.primaryColor) document.documentElement.style.setProperty("--app-accent", branding.primaryColor);
  if (branding?.logoUrl) { const img = $("#c-login-logo"); img.src = branding.logoUrl; img.hidden = false; $("#c-switch-logo").src = branding.logoUrl; }
}

async function discover(query) {
  const res = await fetch(`${DISCOVER}?${new URLSearchParams(query)}`, { cache: "no-store" });
  return res.ok ? res.json() : null;
}

/** DÃ©couverte du tenant : sous-domaine, ?tenant=, puis e-mail saisi.
 * Le gestionnaire est attachÃ© avant tout await : un clic n'est jamais perdu, et
 * toute erreur est affichÃ©e au lieu d'Ã©chouer silencieusement. */
async function loginScreen() {
  i18nStaticLogin();
  $("#c-login").hidden = false;
  const errorBox = $("#c-login-error"); const btn = $("#c-login-btn");
  let tenant = currentTenant();
  let ready = Promise.resolve();
  $("#c-login-form").onsubmit = async (event) => {
    event.preventDefault();
    errorBox.textContent = ""; btn.disabled = true; btn.textContent = t("redirecting");
    try {
      await ready;
      const email = $("#c-login-email").value.trim();
      if (!tenant && email) {
        tenant = await discover({ email }).catch(() => null);
        if (tenant) setTenant(tenant);
      }
      await login(email || undefined);
    } catch (error) {
      console.error(error);
      errorBox.textContent = `${t("loginFail")} : ${error?.message ?? error}`;
      btn.disabled = false; btn.textContent = t("continue");
    }
  };
  const fromUrl = new URLSearchParams(location.search).get("tenant");
  const sub = location.hostname.endsWith(`.${CONSOLE_DOMAIN}`) ? location.hostname : "";
  const label = (n) => (LANG === "en" ? `Sign in to ${n}` : `Se connecter Ã  ${n}`);
  if (!tenant && (fromUrl || sub)) {
    ready = discover(fromUrl ? { tenant: fromUrl } : { host: sub }).then((x) => { if (x) { tenant = x; setTenant(x); applyBranding(x.branding); btn.textContent = label(x.name); } }).catch(() => {});
  } else if (tenant) { applyBranding(tenant.branding); btn.textContent = label(tenant.name); }
}
function i18nStaticLogin() { document.querySelectorAll("#c-login [data-i18n]").forEach((n) => { n.textContent = t(n.dataset.i18n); }); document.title = t("title"); }

async function start() {
  let tokens;
  try { tokens = await handleRedirect(); } catch (error) { console.error(error); $("#c-login-error").textContent = error.message; }
  if (!tokens) return loginScreen();
  $("#c-app").hidden = false; i18nStatic();
  $("#c-logout").onclick = () => { setTenant(null); sessionStorage.removeItem("gtm-console-selected"); logout(); };
  $("#c-account").href = accountConsoleUrl();
  const picker = $("#c-picker"); const sw = $("#c-switch");
  sw.onclick = () => { picker.hidden = !picker.hidden; sw.setAttribute("aria-expanded", String(!picker.hidden)); };
  try {
    const token = await accessToken();
    const res = await fetch(`${API_BASE}/me`, { headers: headers(token) });
    const me = await res.json();
    if (!res.ok) throw new Error(me.error || `Erreur ${res.status}`);
    state.me = me;
    $("#c-user").textContent = `${me.username ?? ""}${me.tenant ? ` Â· ${me.tenant.name}` : ""}${me.platformAdmin ? ` Â· ${t("superAdmin")}` : ""}`;
    if (me.accountConsole) $("#c-account").href = me.accountConsole;
    applyBranding(me.tenant?.branding);
    const select = $("#c-tenant");
    if ((me.memberships?.length ?? 0) > 1 || me.platformAdmin) {
      $("#c-tenant-wrap").hidden = false;
      for (const m of me.memberships ?? []) { const o = el("option", "", `${m.id} (${m.role})`); o.value = m.id; select.append(o); }
      if (me.tenant && ![...select.options].some((o) => o.value === me.tenant.id)) { const o = el("option", "", me.tenant.id); o.value = me.tenant.id; select.append(o); }
      select.value = me.tenant?.id ?? selectedTenant() ?? "";
    }
    if (me.tenant) {
      // The picker was historically shared by all tenants on this browser.
      // Never reuse another tenant's scope after switching workspaces.
      const domains = me.tenant.domains || [];
      let hostname = ""; try { hostname = new URL(state.url).hostname.toLowerCase().replace(/^www\./, ""); } catch { /* no valid selection */ }
      if (!domains.some((d) => hostname === d || hostname.endsWith(`.${d}`))) state.url = domains[0] ? `https://${domains[0]}` : "";
      if (!me.tenant.gscProperties?.includes(state.property)) state.property = me.tenant.gscProperties?.[0] || "";
      if (!me.tenant.ga4Properties?.includes(state.ga4Property)) state.ga4Property = me.tenant.ga4Properties?.[0] || "";
      if (!me.tenant.bingSites?.includes(state.bingSite)) state.bingSite = me.tenant.bingSites?.[0] || "";
    }
  } catch (error) { $("#c-user").textContent = error.message; }
  $("#c-url").value = state.url; $("#c-property").value = state.property; $("#c-ga4").value = state.ga4Property; $("#c-bing").value = state.bingSite;
  picker.onsubmit = (e) => {
    e.preventDefault();
    const tenantSel = $("#c-tenant");
    state.url = $("#c-url").value.trim(); state.property = $("#c-property").value.trim(); state.ga4Property = $("#c-ga4").value.trim(); state.bingSite = $("#c-bing").value.trim();
    for (const k of ["url", "property", "ga4Property", "bingSite"]) localStorage.setItem(`gtm-console-${k}`, state[k]);
    if (!$("#c-tenant-wrap").hidden && tenantSel.value && tenantSel.value !== selectedTenant()) { sessionStorage.setItem("gtm-console-selected", tenantSel.value); location.reload(); return; }
    picker.hidden = true; sw.setAttribute("aria-expanded", "false"); refreshSite(); startBackground(); show(current.section, current.tab);
  };
  if (state.me?.platformAdmin) {
    const platform = { id: "platform", icon: "tracking", build: () => custom("platform", [{ id: "clients", label: LANG === "fr" ? "Clients" : "Clients", needsDomain: false, async: async () => renderPlatformDashboard(accessToken, (id) => { sessionStorage.setItem("gtm-console-selected", id); location.href = "#overview"; location.reload(); }) }, { id: "setup", label: LANG === "fr" ? "Provisionnement" : "Provisioning", needsDomain: false, async: async () => renderPlatformSetup(accessToken) }]) };
    SECTIONS.act.push(platform); ALL.push(platform);
  }
  refreshSite(); mountNav();
  const [s, tb] = location.hash.slice(1).split("/");
  if (!state.url) { picker.hidden = false; sw.setAttribute("aria-expanded", "true"); }
  startBackground();
  show(s || "overview", tb);
  if (state.me?.tenant && !localStorage.getItem(`gtm-console-wizard-v1:${state.me.tenant.id}:${state.me.email || state.me.username || "user"}`)) launchWizard();
}
window.addEventListener("hashchange", () => { const [a, b] = location.hash.slice(1).split("/"); if (a && ALL.some((x) => x.id === a)) show(a, b); });
start().catch((error) => { console.error(error); loginScreen(); $("#c-login-error").textContent = error.message; });
