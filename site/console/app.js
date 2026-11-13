import { renderLocalSeo } from "./local-seo-network.js";
import { renderLocalSeoWorkspace } from "./local-seo.js";
ï»¿/* Console authentifiÃ©e : mÃªme design que la section #console du site (coque .app),
 * donnÃ©es en direct via /api/console/*. Les dÃ©finitions d'outils viennent de tools.js. */
import { API_BASE, DISCOVER, CONSOLE_DOMAIN } from "./config.js";
import { login, logout, handleRedirect, accessToken, currentTenant, setTenant, accountConsoleUrl } from "./auth.js";
import { TABS } from "./tools.js";
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
import { renderApplyMode } from "./apply.js";
import { openWizard, renderAgentHelp } from "./onboarding-wizard.js";
import { toolbar, renderSearchPerformance, renderQueryPages, renderSitemaps, renderGa4, renderRealtime, renderEcommerce, renderTechnology, renderGtm, renderBing, renderStatus, renderTags, renderSettings } from "./analytics.js";
import { mountPublicRead } from "./public-read.js";
import { renderAction } from "./action-view.js";
import { renderDataGuide } from "./data-guidance.js";
import { resolveWorkspace, workspaceHandoff } from "./workspace-context.js";
import { renderGlobalSeo } from "./global-seo.js";
import { renderCustomerJourneyWorkspace } from "./customer-journey-workspace.js";
import { renderCatalog } from "./catalog.js";
import { renderCommerce } from "./commerce.js";
import { clearVisualEntities, setVisualEntities, visualBrief, sectionHeading } from "./visuals.js";
import { createDataAgent } from "./data-agent.js";

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
  const res = await fetch(`${API_BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers(token) }, body: JSON.stringify(body), ...(automaticRoutes.has(route) ? { signal: AbortSignal.timeout(90000) } : {}) });
  if (res.status === 401) { await login(); throw new Error("Session expirÃ©e"); }
  if (!res.ok) { const e = await res.json().catch(() => ({})); const error = new Error(e.error || `HTTP ${res.status}`); error.status = res.status; throw error; }
  return binary ? res.blob() : res.json();
}


const automaticRoutes = new Set(["/visual/catalog", "/overview", "/tracking/status", "/search/performance", "/search/query-pages", "/search/sitemaps", "/ga4/overview", "/ga4/ecommerce", "/ga4/technology", "/bing/performance", "/sitemap/map", "/geo/citability", "/geo/robots", "/geo/schema", "/performance/weight", "/ai-visibility/datasets", "/competition/state", "/gtm/inventory", "/search/queries", "/search/trends", "/search/losing-pages", "/keywords/opportunities", "/sitemap/audit", "/geo/llms", "/performance/pagespeed", "/performance/crux", "/audit/technical", "/audit/serp-preview", "/calc/ctr"]);
const background = createBackgroundLoader((route, body) => fetchApi(route, body), renderBackground);
export async function api(route, body, options = {}) {
  if (!options.binary && automaticRoutes.has(route)) return background.request(selectedTenant() || state.me?.tenant?.id || "", route, body);
  const result = await fetchApi(route, body, options);
  if (["/ai-visibility/import", "/ai-visibility/review", "/ai-visibility/openai-run", "/ai-visibility/gemini-run", "/ai-visibility/claude-run", "/ai-visibility/mistral-run", "/ai-visibility/grok-run", "/competition/panel", "/competition/revise-panel", "/competition/group", "/competition/alert-config", "/competition/priority", "/competition/action", "/gtm/write", "/gtm/publish"].includes(route)) startBackground();
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
  background.reset(); state.overview = null; state.overviewFor = ""; startVisualContext();
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

let visualGeneration = 0;
function updateVisualContext(data) {
  setVisualEntities(data.items || [], state.url);
  const box = $("#c-visual-context");
  if (box && state.url) box.replaceChildren(visualBrief(data.profile, state.url));
}
function startVisualContext() {
  const generation = ++visualGeneration, url = state.url;
  clearVisualEntities(url);
  const box = $("#c-visual-context");
  if (!box) return;
  box.replaceChildren();
  if (!url || !state.me?.tenant) return;
  box.append(visualBrief(null, url));
  api("/visual/catalog", { url }).then(data => { if (generation === visualGeneration && url === state.url) updateVisualContext(data); }).catch(() => {});
}
function catalogWorkspace() {
  const generation = visualGeneration, url = state.url;
  return renderCatalog({ api, state: { ...state }, me: state.me, onLoaded: data => {
    if (generation !== visualGeneration || url !== state.url) return;
    if (data === null) { background.reset(); clearVisualEntities(url); return; }
    updateVisualContext(data);
  } });
}

async function overview() {
  if (state.overview && state.overviewFor === state.url) return state.overview;
  const url = state.url; const data = await api("/overview", { url }); if (state.url === url) { state.overview = data; state.overviewFor = url; } return data;
}

async function reportsList() {
  try { const token = await accessToken(); const r = await fetch(`${API_BASE}/reports`, { headers: headers(token) }); return r.ok ? (await r.json()).reports ?? [] : []; } catch { return []; }
}
async function latestAiReport() {
  try {
    const [result, competition] = await Promise.all([api("/ai-visibility/datasets", {}), api("/competition/state", {}).catch(() => null)]);
    const dataset = result.datasets?.at(-1); if (!dataset) return null;
    return await api("/ai-visibility/report", { datasetId: dataset.id, brand: competition?.panels?.[dataset.id] || undefined });
  } catch { return { unavailable: true }; }
}

/* Ã¢â€â‚¬Ã¢â€â‚¬ Sections de la barre latÃ©rale : Track / Act, comme la dÃ©mo publique Ã¢â€â‚¬Ã¢â€â‚¬ */
const custom = (id, tabs) => ({ id, tabs });
const fromTool = (id, filter = () => true, intro) => () => { const x = tool(id); return { intro: intro ?? tr(x.intro), tabs: x.actions.filter(filter).map((a) => ({ id: a.id, label: actionLabel(a), action: a })) }; };
const SECTIONS = {
  track: [
    { id: "overview", icon: "overview", build: () => custom("overview", [
      { id: "board", label: t("s_overview"), async: async () => {
        const [ov, status, reports, ai] = await Promise.all([overview().catch(error => ({ loadError: error })), api("/tracking/status", scope()).catch(() => null), reportsList(), latestAiReport()]);
        const [search, ga4] = await Promise.all([
          status?.gsc?.hasAccess === true ? api("/search/performance", scope()).catch(() => ({ problem: true })) : null,
          status?.ga4?.hasAccess === true ? api("/ga4/overview", scope()).catch(() => ({ problem: true })) : null,
        ]);
        return [renderAudienceOverview({ search, ga4, status, state, rerender, ai }), ...(ov?.loadError ? [renderDataGuide("geo", { error: ov.loadError, retry: rerender })] : ov ? renderOverview(ov) : []), renderOnboarding({ status, tenant: state.me?.tenant, overview: ov?.loadError ? null : ov, reports }), wizardButton(), renderAgentHelp()];
      } },
      { id: "plan", label: t("t_plan"), async: async () => renderPlan(await overview()) }]) },
    { id: "local_seo", icon: "local_seo", build: () => custom("local_seo", [{ id: "website", label: LANG === "fr" ? "SEO du site" : "Website SEO", needsDomain: false, async: async () => renderGlobalSeo({ state, api, scope }) }, { id: "network", label: LANG === "fr" ? "RÃ©seau et Ã©tablissements" : "Network and locations", needsDomain: false, async: async () => renderLocalSeo({ api, me: state.me }) }, { id: "planning", label: LANG === "fr" ? "PrÃ©parer mon Ã©tablissement" : "Plan my business", needsDomain: false, async: async () => renderLocalSeoWorkspace({ state }) }]) },
    { id: "catalog", icon: "products", build: () => custom("catalog", [{ id: "library", label: LANG === "fr" ? "Catalogue visuel" : "Visual catalogue", needsDomain: false, async: async () => catalogWorkspace() }]) },
    { id: "commerce", icon: "commerce", build: () => custom("commerce", [{ id: "connect", label: LANG === "fr" ? "Boutiques et revenus" : "Stores and revenue", needsDomain: false, async: async () => renderCommerce({ api, me: state.me }) }]) },
    { id: "competition", icon: "competition", build: () => custom("competition", [{ id: "board", label: LANG === "fr" ? "Concurrence" : "Competition", needsDomain: false, async: async () => renderCompetition({ api, me: state.me, property: state.property, days: state.days }) }]) },
    { id: "ai_visibility", icon: "eye", build: () => custom("ai_visibility", [{ id: "board", label: LANG === "fr" ? "RÃ©ponses IA" : "AI answers", needsDomain: false, async: async () => renderAiVisibility({ api, me: state.me }) }]) },
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
    { id: "indexnow", icon: "indexnow", build: () => custom("indexnow", [{ id: "readiness", label: t("s_indexnow"), needsDomain: false, async: async () => renderIndexNow(await overview()) }]) },
    { id: "sitemap", icon: "sitemap", build: fromTool("sitemap") },
    { id: "performance", icon: "performance", build: fromTool("performance") },
  ],
  act: [
    { id: "journey", icon: "journey", build: () => custom("journey", [
      { id: "map", label: LANG === "fr" ? "Mon parcours client" : "My customer journey", needsDomain: false, async: async () => renderCustomerJourneyWorkspace({ state, api }) },
      { id: "prompts", label: LANG === "fr" ? "Questions suivies" : "Tracked questions", needsDomain: false, async: async () => renderOpsPrompts({ api, me: state.me }) },
    ]) },
    { id: "apply_mode", icon: "fixes", build: () => custom("apply_mode", [
      { id: "preview", label: LANG === "fr" ? "Correctifs GEO" : "GEO fixes", needsDomain: false, async: async () => renderApplyMode({ api, me: state.me, url: state.url }) }]) },
    { id: "search", icon: "search", build: fromTool("search") },
    { id: "keywords", icon: "keywords", build: () => { const base = fromTool("keywords")(); base.tabs.push({ id: "tracked", label: LANG === "fr" ? "RequÃªtes suivies" : "Tracked queries", needsDomain: false, async: async () => renderTrackedQueries({ state, api, scope, saveSettings }) }); return base; } },
    { id: "tracking", icon: "tracking", build: () => custom("tracking", [
      { id: "status", label: t("t_status"), needsDomain: false, async: async () => renderStatus(await api("/tracking/status", scope()), state) },
      { id: "tags", label: t("t_tags"), async: async () => renderTags(await api("/tracking/status", scope())) },
      { id: "settings", label: t("t_settings"), needsDomain: false, async: async () => { const status = await api("/tracking/status", scope()).catch(() => null); return renderSettings(state.me, saveSettings, status?.serviceAccount ?? null, api); } },
      { id: "access", label: LANG === "fr" ? "AccÃ¨s" : "Access", needsDomain: false, async: async () => renderAccessManagement(state.me, api) }]) },
    { id: "gtm", icon: "tag", build: () => custom("gtm", [
      { id: "workspace", label: t("t_gtm"), needsDomain: false, async: async () => renderGtm(await api("/gtm/inventory", scope({ container: state.gtmContainer || undefined })), api, rerender) }]) },
    { id: "audit", icon: "audit", build: fromTool("audit") },
    { id: "generators", icon: "generators", build: fromTool("generators") },
    { id: "calculators", icon: "calculators", build: fromTool("calculators") },
    { id: "report", icon: "report", build: fromTool("report") },
    { id: "ops", icon: "operations", build: () => custom("ops", [
      { id: "prompts", label: LANG === "fr" ? "VisibilitÃ© IA en direct" : "Live AI visibility", needsDomain: false, async: async () => renderOpsPrompts({ api, me: state.me }) },
      { id: "rank", label: LANG === "fr" ? "Positions suivies" : "Tracked rankings", needsDomain: false, async: async () => renderOpsRank({ api, me: state.me }) },
      { id: "articles", label: LANG === "fr" ? "Articles" : "Articles", needsDomain: false, async: async () => renderOpsArticles({ api, me: state.me }) },
      { id: "alerts", label: LANG === "fr" ? "Alertes" : "Alerts", needsDomain: false, async: async () => renderOpsAlerts({ api, me: state.me }) }]) },
  ],
};
const ALL = [...SECTIONS.track, ...SECTIONS.act];


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
let started = false;
let current = { section: "overview", tab: "" };
let dataAgent = null;
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
  if (!started) return;
  const section = ALL.find((s) => s.id === sectionId) ?? ALL[0];
  const def = section.build();
  const tab = def.tabs.find((x) => x.id === tabId) ?? def.tabs[0];
  current = { section: section.id, tab: tab.id };
  if (state.me?.tenant) {
    if (!dataAgent) { dataAgent = createDataAgent({ api, language: LANG, workspaceName: state.me.tenant.name }); $("#c-data-agent").replaceChildren(dataAgent.element); }
    dataAgent.setSection(section.id);
  }
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
  panel.append(sectionHeading($("#c-crumb").textContent, def.intro || (LANG === "fr" ? "Comprendre les rÃ©sultats, leurs sources et la prochaine action." : "Understand results, their sources and the next action."), section.icon));
  if (!state.me?.tenant && section.id !== "platform") {
    panel.append(renderDataGuide("tenant", { error: state.contextError })); return;
  }

  if (tab.action) { panel.append(renderAction(tab.action, { state, api, automaticRoutes })); return; }
  if (!state.url && tab.needsDomain !== false) { panel.append(renderDataGuide("domain")); return; }
  const loading = el("p", "c-loading", t("loadingOverview")); panel.append(loading);
  try { const nodes = await tab.async(); if (current.section === section.id && current.tab === tab.id) loading.replaceWith(...[nodes].flat()); }
  catch (error) { if (panel.isConnected) loading.replaceWith(renderDataGuide(section.id, { error, retry: rerender })); }
}

function mountNav() {
  for (const [group, list] of Object.entries(SECTIONS)) {
    const ul = $(`#c-nav-${group}`);
    for (const s of list) { const li = el("li"); const a = el("a"); a.href = `#${s.id}`; a.dataset.section = s.id; a.innerHTML = icon(s.icon); a.append(el("span", "", (s.id === "platform" ? (LANG === "fr" ? "Administration plateforme" : "Platform administration") : s.id === "competition" ? (LANG === "fr" ? "Concurrence" : "Competition") : s.id === "ai_visibility" ? (LANG === "fr" ? "VisibilitÃ© IA" : "AI visibility") : s.id === "journey" ? (LANG === "fr" ? "Parcours client" : "Customer journey") : t(`s_${s.id}`)))); a.onclick = (e) => { e.preventDefault(); show(s.id); }; li.append(a); ul.append(li); }
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
  l.onclick = (e) => { e.preventDefault(); localStorage.setItem("gtm-console-lang", other); const u = new URL(location.href); u.searchParams.set("lang", other); location.replace(u); };
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
const onboardingUrlKey = "gtm-console-onboarding-url";
function pendingOnboardingUrl() {
  try {
    const url = new URL(sessionStorage.getItem(onboardingUrlKey));
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && url.hostname.includes(".") ? url.href : "";
  } catch { return ""; }
}
async function loginScreen() {
  i18nStaticLogin();
  $("#c-login").hidden = false;
  mountPublicRead({ initialUrl: pendingOnboardingUrl(), language: LANG, endpoint: `${API_BASE.replace(/\/console$/, "")}/free-read` });
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
  const handoff = workspaceHandoff(location, sessionStorage);
  let tokens;
  try { tokens = await handleRedirect(); } catch (error) { console.error(error); $("#c-login-error").textContent = error.message; }
  if (!tokens) return loginScreen();
  $("#c-app").hidden = false; i18nStatic();
  $("#c-logout").onclick = () => { setTenant(null); sessionStorage.removeItem("gtm-console-selected"); sessionStorage.removeItem("gtm-console-handoff"); logout(); };
  $("#c-account").href = accountConsoleUrl();
  $("#c-account svg").outerHTML = icon("account");
  const picker = $("#c-picker"); const sw = $("#c-switch");
  sw.onclick = () => { picker.hidden = !picker.hidden; sw.setAttribute("aria-expanded", String(!picker.hidden)); };
  try {
    const token = await accessToken();
    const me = await resolveWorkspace(async (tenant) => {
      const res = await fetch(`${API_BASE}/me`, { headers: { Authorization: `Bearer ${token}`, ...(tenant ? { "X-Tenant": tenant } : {}) } });
      const value = await res.json();
      if (!res.ok) throw new Error(value.error || `Erreur ${res.status}`);
      return value;
    }, handoff?.tenant || selectedTenant(), id => sessionStorage.setItem("gtm-console-selected", id));
    if (handoff) {
      if (me.tenant?.id !== handoff.tenant) throw new Error(LANG === "fr" ? "L'espace demandÃ© n'est pas accessible avec ce compte." : "The requested workspace is not accessible with this account.");
      sessionStorage.removeItem("gtm-console-handoff");
      history.replaceState(null, "", `?lang=${LANG}${handoff.hash}`);
    }
    state.me = me;
    $("#c-user").textContent = `${me.username ?? ""}${me.tenant ? ` Â· ${me.tenant.name}` : ""}${me.platformAdmin ? ` Â· ${t("superAdmin")}` : ""}`;
    if (me.accountConsole) $("#c-account").href = me.accountConsole;
    applyBranding(me.tenant?.branding);
    const select = $("#c-tenant");
    if ((me.memberships?.length ?? 0) > 1 || me.platformAdmin) {
      $("#c-tenant-wrap").hidden = false;
      const empty = el("option", "", LANG === "fr" ? "Choisir un clientâ€¦" : "Choose a customerâ€¦"); empty.value = ""; select.append(empty);
      for (const m of me.memberships ?? []) { const o = el("option", "", `${m.id} (${m.role})`); o.value = m.id; select.append(o); }
      if (me.tenant && ![...select.options].some((o) => o.value === me.tenant.id)) { const o = el("option", "", me.tenant.id); o.value = me.tenant.id; select.append(o); }
      select.value = me.tenant?.id ?? selectedTenant() ?? "";
    }
    select.onchange = () => {
      if (!select.value || select.value === selectedTenant()) return;
      sessionStorage.removeItem("gtm-console-handoff"); sessionStorage.setItem("gtm-console-selected", select.value); location.reload();
    };
    if (me.tenant) {
      // The picker was historically shared by all tenants on this browser.
      // Never reuse another tenant's scope after switching workspaces.
      const domains = me.tenant.domains || [];
      const requested = pendingOnboardingUrl();
      if (requested) {
        const requestedHost = new URL(requested).hostname.toLowerCase().replace(/^www\./, "");
        const authorized = domains.find((d) => { const domain = d.toLowerCase().replace(/^www\./, ""); return requestedHost === domain; });
        if (authorized) { state.url = `https://${authorized}`; sessionStorage.removeItem(onboardingUrlKey); state.openRequestedWizard = true; }
        else { state.requestedDomainUnavailable = requestedHost; }
      }
      let hostname = ""; try { hostname = new URL(state.url).hostname.toLowerCase().replace(/^www\./, ""); } catch { /* no valid selection */ }
      if (!domains.some((d) => hostname === d || hostname.endsWith(`.${d}`))) state.url = domains[0] ? `https://${domains[0]}` : "";
      if (!me.tenant.gscProperties?.includes(state.property)) state.property = me.tenant.gscProperties?.[0] || "";
      if (!me.tenant.ga4Properties?.includes(state.ga4Property)) state.ga4Property = me.tenant.ga4Properties?.[0] || "";
      if (!me.tenant.bingSites?.includes(state.bingSite)) state.bingSite = me.tenant.bingSites?.[0] || "";
    }
  } catch (error) { state.contextError = error; $("#c-user").textContent = LANG === "fr" ? "Espace indisponible" : "Workspace unavailable"; }
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
    const platform = { id: "platform", icon: "platform", build: () => custom("platform", [{ id: "clients", label: LANG === "fr" ? "Clients" : "Clients", needsDomain: false, async: async () => renderPlatformDashboard(accessToken, (id) => { sessionStorage.setItem("gtm-console-selected", id); location.href = "#overview"; location.reload(); }) }, { id: "setup", label: LANG === "fr" ? "Provisionnement" : "Provisioning", needsDomain: false, async: async () => renderPlatformSetup(accessToken) }]) };
    SECTIONS.act.push(platform); ALL.push(platform);
  }
  refreshSite(); mountNav();
  if (state.requestedDomainUnavailable) {
    const notice = el("p", "c-error", LANG === "fr" ? `Le domaine ${state.requestedDomainUnavailable} nâ€™est pas autorisÃ© dans cet espace. Contactez votre administrateur pour lâ€™ajouter.` : `The domain ${state.requestedDomainUnavailable} is not authorized in this workspace. Contact your administrator to add it.`);
    notice.setAttribute("role", "alert"); $("#c-app").prepend(notice);
  }
  const [s, tb] = location.hash.slice(1).split("/");
  if (!state.url || !state.me?.tenant) { picker.hidden = false; sw.setAttribute("aria-expanded", "true"); }
  startBackground();
  started = true;
  show(s || "overview", tb);
  if (state.me?.tenant && !state.requestedDomainUnavailable && (state.openRequestedWizard || !localStorage.getItem(`gtm-console-wizard-v1:${state.me.tenant.id}:${state.me.email || state.me.username || "user"}`))) launchWizard();
}
window.addEventListener("hashchange", () => { const [a, b] = location.hash.slice(1).split("/"); if (a && ALL.some((x) => x.id === a)) show(a, b); });
start().catch((error) => { console.error(error); loginScreen(); $("#c-login-error").textContent = error.message; });
