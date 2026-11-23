import { renderMeasurementBanner, renderPortfolio } from './decision-flows.js';
import { renderBilling } from "./billing.js";
import { renderConnectedAgents } from "./connected-agents.js";
import { renderCrm } from './crm.js';
import { renderSocial } from './social.js';
import { renderScenarios } from './scenarios.js';
import { renderLocalSeo } from "./local-seo-network.js";
import { renderLocalSeoWorkspace } from "./local-seo.js";
/* Console authentifiée : même design que la section #console du site (coque .app),
 * données en direct via /api/console/*. Les définitions d'outils viennent de tools.js. */
import { API_BASE, DISCOVER, CONSOLE_DOMAIN } from "./config.js";
import { login, logout, handleRedirect, accessToken, currentTenant, setTenant, accountConsoleUrl } from "./auth.js";
import { TABS } from "./tools.js";
import { el } from "./render.js";
import { t, tr, actionLabel, LANG } from "./i18n.js";
import { icon } from "./icons.js";
import { tabIcon } from "./tab-icons.js";
import { DECISION_AREAS, DECISION_VIEWS, decisionLocation, decisionLabel } from './decision-navigation.js';
import { renderDecisionHub, renderDecisionPriorities } from './decision-workspace.js';
import { renderCompetition } from "./competition.js";
import { renderAiVisibility } from "./ai-visibility.js";
import { renderAudienceOverview } from "./audience-overview.js";
import { renderOverview, renderPlan, renderIndexNow } from "./overview.js";
import { renderOnboarding } from "./onboarding.js";
import { renderAccessManagement } from "./access-management.js";
import { createBackgroundLoader } from "./background.js";
import { runSources, renderSourceProgress } from "./source-progress.js";
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
import { resolveWorkspace, workspaceHandoff, featureHandoff } from "./workspace-context.js";
import { renderGlobalSeo } from "./global-seo.js";
import { renderCustomerJourneyWorkspace } from "./customer-journey-workspace.js";
import { renderCatalog } from "./catalog.js";
import { renderCommerce } from "./commerce.js";
import { clearVisualEntities, setVisualEntities, visualBrief, sectionHeading } from "./visuals.js";
import { createConsoleCoach } from './coach.js';
import { attachContextualHelp } from './context-help.js';
import { createOperationsFeed, createRealtimeView } from './console-live.js';
import { renderJourneyBoard } from './journey-board.js';
import { renderFeatureGuide, renderFeatureEntry } from "./feature-guide.js";
import { consoleFeature } from "../journey-content.js";

const $ = (s) => document.querySelector(s);
const selectedTenant = () => sessionStorage.getItem("gtm-console-selected") || currentTenant()?.id || "";
const headers = (token) => ({ Authorization: `Bearer ${token}`, ...(selectedTenant() ? { "X-Tenant": selectedTenant() } : {}) });
const ls = (k) => localStorage.getItem(`gtm-console-${k}`) || "";
const state = { url: ls("url"), property: ls("property"), ga4Property: ls("ga4Property"), bingSite: ls("bingSite"), days: Number(ls("days")) || 28, searchType: ls("searchType") || "web", overview: null, overviewFor: "", me: null };
let consoleCoach = null, contextualHelp = null;
const coachScope = () => JSON.stringify([selectedTenant() || state.me?.tenant?.id || '', state.url, state.property, state.ga4Property, state.bingSite, state.days]);
function observeRead(route, data, requestedScope) {
  if (requestedScope !== coachScope() || data?.problem) return;
  if (route === '/overview' && data?.geo) { state.overview = data; state.overviewFor = state.url; consoleCoach?.setContext({ overview: data }); }
  if (route === '/tracking/status') { state.sourceStatus = data; consoleCoach?.setContext({ status: data }); }
  if (automaticRoutes.has(route) || route === '/data-agent/query' || route === '/ga4/realtime') {
    const live = $('#c-live');
    if (live) { live.dataset.freshness = 'received'; live.textContent = `${LANG === 'fr' ? 'Dernière réponse' : 'Last response'} · ${new Date().toLocaleTimeString(LANG, { hour: '2-digit', minute: '2-digit' })}`; }
  }
}
/** Corps commun des requêtes Track : domaine, propriétés, période. */
const scope = (extra = {}) => ({ url: state.url || undefined, property: state.property || undefined, ga4Property: state.ga4Property || undefined, bingSite: state.bingSite || undefined, days: state.days, searchType: state.searchType, ...extra });
const rerender = () => show(current.section, current.tab, current.pinId ? { pinId: current.pinId } : undefined);
/** Vue de données : barre de période + rendu ; ne demande pas de domaine. */
const live = (route, render, opts = {}) => ({ needsDomain: false, async: async () => [toolbar(state, rerender, opts), ...[render(await api(route, scope()))].flat()] });
const tool = (id) => TABS.find((x) => x.id === id);
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u || "—"; } };

function billingView() {
  const tenant = selectedTenant();
  const me = state.me;
  const request = async (route, body) => {
    const token = await accessToken();
    if (!token || selectedTenant() !== tenant) throw new Error(LANG === "fr" ? "Espace ou session modifié. Rechargez la page." : "Workspace or session changed. Reload this page.");
    const res = await fetch(`${API_BASE.replace(/\/console\/?$/, "/billing")}${route}`, {
      method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Tenant": tenant },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) { const error = new Error(data.error || `HTTP ${res.status}`); error.status = res.status; throw error; }
    if (selectedTenant() !== tenant) throw new Error("Workspace changed. Reload this page.");
    return data;
  };
  return renderBilling({ me, request, fr: LANG === "fr" });
}

/** Pin every studio request to the workspace that opened the editor. */
function scenarioView() {
  const tenant = selectedTenant() || state.me?.tenant?.id || '';
  const me = state.me;
  const unchanged = () => tenant && (selectedTenant() || state.me?.tenant?.id || '') === tenant;
  const request = async (route, body = {}) => {
    if (!route.startsWith('/scenarios/') || !unchanged()) throw new Error(LANG === 'fr' ? 'Espace modifié. Rouvrez le scénario.' : 'Workspace changed. Reopen the scenario.');
    const token = await accessToken();
    if (!token || !unchanged()) throw new Error(LANG === 'fr' ? 'Session modifiée. Rouvrez le scénario.' : 'Session changed. Reopen the scenario.');
    const res = await fetch(`${API_BASE}${route}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Tenant': tenant },
      body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(75000),
    });
    const data = await res.json();
    if (!res.ok) { const error = new Error(data.error || `HTTP ${res.status}`); error.status = res.status; error.code = data.code; throw error; }
    if (!unchanged()) throw new Error(LANG === 'fr' ? 'Espace modifié. Rouvrez le scénario.' : 'Workspace changed. Reopen the scenario.');
    return data;
  };
  return renderScenarios({ api: request, state: { ...state }, me });
}

async function fetchApi(route, body, { binary = false } = {}) {
  const requestedScope = coachScope();
  const token = await accessToken();
  if (!token) { await login(); throw new Error("Session expirée"); }
  const readTimeout = automaticRoutes.has(route) ? 90000 : ['/data-agent/query', '/data-agent/context', '/ga4/realtime'].includes(route) ? 30000 : 0;
  const res = await fetch(`${API_BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers(token) }, body: JSON.stringify(body), ...(readTimeout ? { signal: AbortSignal.timeout(readTimeout) } : {}) });
  if (res.status === 401) { await login(); throw new Error("Session expirée"); }
  if (!res.ok) { const e = await res.json().catch(() => ({})); const error = new Error(e.error || `HTTP ${res.status}`); error.status = res.status; throw error; }
  if (binary) return res.blob();
  const data = await res.json(); observeRead(route, data, requestedScope); return data;
}


const automaticRoutes = new Set(["/visual/catalog", "/overview", "/tracking/status", "/search/performance", "/search/query-pages", "/search/sitemaps", "/ga4/overview", "/ga4/ecommerce", "/ga4/technology", "/bing/performance", "/sitemap/map", "/geo/citability", "/geo/robots", "/geo/schema", "/performance/weight", "/ai-visibility/datasets", "/competition/state", "/gtm/inventory", "/search/queries", "/search/trends", "/search/losing-pages", "/keywords/opportunities", "/sitemap/audit", "/geo/llms", "/performance/pagespeed", "/performance/crux", "/audit/technical", "/audit/serp-preview", "/calc/ctr"]);
const background = createBackgroundLoader((route, body) => fetchApi(route, body), renderBackground);
export async function api(route, body, options = {}) {
  if (!options.binary && automaticRoutes.has(route)) return background.request(selectedTenant() || state.me?.tenant?.id || "", route, body);
  const result = await fetchApi(route, body, options);
  if (["/ai-visibility/import", "/ai-visibility/review", "/ai-visibility/openai-run", "/ai-visibility/gemini-run", "/ai-visibility/claude-run", "/ai-visibility/mistral-run", "/ai-visibility/grok-run", "/competition/panel", "/competition/revise-panel", "/competition/group", "/competition/alert-config", "/competition/priority", "/competition/action", "/gtm/write", "/gtm/publish"].includes(route)) startBackground();
  return result;
}
/** A Portfolio read carries its own explicit member tenant; it never mutates the active picker. */
async function portfolioRequest(tenant, route, body) {
  if (route !== '/decision/portfolio/card' || !state.me?.memberships?.some(m => m.id === tenant)) throw new Error('Workspace access denied');
  const token = await accessToken(); if (!token) throw new Error('Session expired');
  const res = await fetch(`${API_BASE}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Tenant': tenant }, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
function renderBackground(jobs) {
  consoleCoach?.setContext({ jobs });
  const box = $("#c-background"), summary = $("#c-background-summary"), list = $("#c-background-jobs");
  if (!box || !summary || !list) return;
  box.hidden = jobs.length === 0;
  const done = jobs.filter((j) => !["queued", "running"].includes(j.state)).length;
  const errors = jobs.filter((j) => j.state === "error").length;
  summary.textContent = LANG === "fr" ? `Analyses en arrière-plan : ${done}/${jobs.length} terminées${errors ? ` · ${errors} en erreur` : ""}` : `Background analyses: ${done}/${jobs.length} finished${errors ? ` · ${errors} failed` : ""}`;
  const labels = LANG === "fr" ? { queued: "En attente", running: "En cours", done: "Terminé", error: "Indisponible", skipped: "Non configuré" } : { queued: "Queued", running: "Running", done: "Done", error: "Unavailable", skipped: "Not configured" };
  list.replaceChildren(...jobs.map((job) => { const item = el("li", `c-background-${job.state}`); item.append(el("strong", "", job.label), document.createTextNode(` — ${labels[job.state]}${job.detail ? ` : ${job.detail}` : ""}`)); return item; }));
}
function startBackground() {
  background.reset(); state.overview = null; state.overviewFor = ""; state.sourceStatus = null; consoleCoach?.setContext({ overview: null, status: null, jobs: [] }); startVisualContext();
  if (!state.me?.tenant) return;
  const base = scope(); const actionBody = { url: state.url, property: state.property || undefined };
  const missing = LANG === "fr" ? "Renseignez les paramètres dans Tracking." : "Configure the connection in Tracking.";
  const tasks = [
    ["GEO", "/overview", { url: state.url }, !state.url],
    [LANG === "fr" ? "Accès" : "Connections", "/tracking/status", base, false],
    ["Search Console", "/search/performance", base, !state.property],
    [LANG === "fr" ? "Requêtes et pages" : "Queries and pages", "/search/query-pages", base, !state.property],
    ["Sitemaps Search Console", "/search/sitemaps", base, !state.property],
    ["GA4", "/ga4/overview", base, !state.ga4Property],
    ["GA4 e-commerce", "/ga4/ecommerce", base, !state.ga4Property],
    [LANG === "fr" ? "GA4 technologie" : "GA4 technology", "/ga4/technology", base, !state.ga4Property],
    ["Bing", "/bing/performance", base, !state.bingSite],
    ["Google Tag Manager", "/gtm/inventory", scope({ container: state.gtmContainer || undefined }), !state.me.tenant.gtmContainers?.length],
    ["Sitemap", "/sitemap/map", actionBody, !state.url],
    [LANG === "fr" ? "Citabilité" : "Citability", "/geo/citability", actionBody, !state.url],
    ["Robots IA", "/geo/robots", actionBody, !state.url],
    [LANG === "fr" ? "Données structurées" : "Structured data", "/geo/schema", actionBody, !state.url],
    [LANG === "fr" ? "Poids de page" : "Page weight", "/performance/weight", actionBody, !state.url],
    [LANG === "fr" ? "Réponses IA importées" : "Imported AI answers", "/ai-visibility/datasets", {}, false],
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
  // Initial value first. Connector analyses load when their view is opened,
  // rather than running 27 unrelated analyses at every workspace entry.
  void background.start(selectedTenant() || state.me.tenant.id, tasks.filter(task => ['/overview', '/tracking/status'].includes(task.route)));
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

/** Localised copy for the per-source progress panel (console i18n.js). */
function sourceProgressCopy(ids) {
  return {
    title: t("progTitle"), intro: t("progIntro"),
    overall: (done, total) => t("progOverall").replace("{done}", String(done)).replace("{total}", String(total)),
    states: { queued: t("progQueued"), running: t("progRunning"), done: t("progDone"), error: t("progError"), skipped: t("progSkipped") },
    sources: Object.fromEntries(ids.map((id) => [id, { label: t(`prog_${id}`), explain: t(`prog_${id}_x`) }])),
  };
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

/* ── Sections de la barre latérale : Track / Act, comme la démo publique ── */
const custom = (id, tabs) => ({ id, tabs });
const fromTool = (id, filter = () => true, intro) => () => { const x = tool(id); return { intro: intro ?? tr(x.intro), tabs: x.actions.filter(filter).map((a) => ({ id: a.id, label: actionLabel(a), action: a })) }; };
const SECTIONS = {
  track: [
    { id: "overview", icon: "overview", build: () => custom("overview", [
      { id: "board", label: t("s_overview"), needsDomain: false, progress: true, async: async (host) => {
        // Sources load in order, two at a time, with their real state shown
        // (queued / running / done / error / not connected) instead of a spinner.
        const copy = sourceProgressCopy(["geo", "status", "gsc", "ga4", "bing", "ai", "reports"]);
        const startedScope = coachScope();
        let jobs = [];
        const draw = (next) => { jobs = next; if (startedScope === coachScope()) consoleCoach?.setContext({ jobs: next }); if (host) host.replaceChildren(renderSourceProgress(next, copy)); };
        const connected = (key) => (results) => results.status?.[key]?.hasAccess === true ? false : t("progNoAccess");
        const r = await runSources([
          { id: "geo", skip: () => state.url ? false : (LANG === 'fr' ? 'Choisissez un site pour analyser sa page.' : 'Choose a website to analyse its page.'), run: () => overview() },
          { id: "status", run: () => api("/tracking/status", scope()) },
          { id: "gsc", after: ["status"], skip: connected("gsc"), run: () => api("/search/performance", scope()) },
          { id: "ga4", after: ["status"], skip: connected("ga4"), run: () => api("/ga4/overview", scope()) },
          { id: "bing", after: ["status"], skip: connected("bing"), run: () => api("/bing/performance", scope()) },
          { id: "ai", run: () => latestAiReport() },
          { id: "reports", run: () => reportsList() },
        ], { concurrency: 2, onChange: draw });
        const ov = r.geo ?? null; const status = r.status?.loadError ? null : r.status ?? null; const reports = Array.isArray(r.reports) ? r.reports : []; const ai = r.ai ?? null;
        const measured = (value) => value?.loadError ? { problem: true } : value ?? null;
        const search = measured(r.gsc), ga4 = measured(r.ga4), bing = measured(r.bing);
        if (startedScope === coachScope()) consoleCoach?.setContext({ overview: ov?.loadError ? null : ov, status, jobs });
        const setup = el('details', 'decision-setup');
        setup.append(el('summary', '', LANG === 'fr' ? 'Configurer mon espace et mes sources' : 'Set up my workspace and sources'), renderOnboarding({ status, tenant: state.me?.tenant, overview: ov?.loadError ? null : ov, reports }), wizardButton(), renderAgentHelp());
        const loaded = el('details', 'c-source-progress-details');
        loaded.append(el('summary', '', `${t("progDetails")} · ${copy.overall(jobs.filter((j) => !["queued", "running"].includes(j.state)).length, jobs.length)}`), renderSourceProgress(jobs, copy));
        const technical = el('details', 'journey-technical-details'); technical.append(el('summary', '', LANG === 'fr' ? 'Approfondir le diagnostic technique et ses hypothèses' : 'Explore the technical diagnosis and its assumptions'));
        if (ov?.loadError) technical.append(renderDataGuide('geo', { error: ov.loadError, retry: rerender }));
        else if (ov) technical.append(...renderOverview(ov));
        const feed = createOperationsFeed({ api, language: LANG, getScope: coachScope });
        return [renderJourneyBoard({ overview: ov?.loadError ? null : ov, status, search, ga4, bing, language: LANG }), renderDecisionPriorities(ov?.loadError ? null : ov), feed, renderAudienceOverview({ search, ga4, bing, status, state, rerender, ai, progressive: true }), ...(ov ? [technical] : []), setup, loaded];
      } },
      { id: "plan", label: t("t_plan"), async: async () => renderPlan(await overview()) }]) },
    { id: "local_seo", icon: "local_seo", build: () => custom("local_seo", [{ id: "website", label: LANG === "fr" ? "SEO du site" : "Website SEO", needsDomain: false, async: async () => renderGlobalSeo({ state, api, scope }) }, { id: "network", label: "Google Business Profile", needsDomain: false, async: async () => renderLocalSeo({ api, me: state.me }) }, { id: "planning", label: LANG === "fr" ? "Préparer mon établissement" : "Plan my business", needsDomain: false, async: async () => renderLocalSeoWorkspace({ state }) }]) },
    { id: "catalog", icon: "products", build: () => custom("catalog", [{ id: "library", label: LANG === "fr" ? "Catalogue visuel" : "Visual catalogue", needsDomain: false, async: async () => catalogWorkspace() }]) },
    { id: "commerce", icon: "commerce", build: () => custom("commerce", [{ id: "connect", label: LANG === "fr" ? "Boutiques et revenus" : "Stores and revenue", needsDomain: false, async: async () => renderCommerce({ api, me: state.me }) }]) },
    { id: "competition", icon: "competition", build: () => custom("competition", [{ id: "board", label: LANG === "fr" ? "Concurrence" : "Competition", needsDomain: false, async: async () => renderCompetition({ api, me: state.me, property: state.property, days: state.days, onOpenCitations: (filters) => show("ai_visibility", undefined, filters) }) }]) },
    { id: "ai_visibility", icon: "eye", build: () => custom("ai_visibility", [{ id: "board", label: LANG === "fr" ? "Réponses IA" : "AI answers", needsDomain: false, async: async (initialFilters) => renderAiVisibility({ api, me: state.me, initialFilters }) }]) },
    { id: "gsc", icon: "google", build: () => custom("gsc", [
      { id: "performance", label: t("t_gscPerf"), ...live("/search/performance", renderSearchPerformance, { searchType: true }) },
      { id: "query-pages", label: t("t_queryPages"), ...live("/search/query-pages", renderQueryPages) },
      { id: "sitemaps", label: t("t_gscSitemaps"), needsDomain: false, async: async () => renderSitemaps(await api("/search/sitemaps", scope())) }]) },
    { id: "ga4", icon: "ga4", build: () => custom("ga4", [
      { id: "overview", label: t("t_ga4"), ...live("/ga4/overview", renderGa4) },
      { id: "ecommerce", label: t("t_ecommerce"), ...live("/ga4/ecommerce", renderEcommerce) },
      { id: "technology", label: t("t_technology"), ...live("/ga4/technology", renderTechnology) },
      { id: "realtime", label: t("t_realtime"), needsDomain: false, async: async () => createRealtimeView({ api, scope, render: renderRealtime, language: LANG, getScope: coachScope }) }]) },
    { id: "bing", icon: "bing", build: () => custom("bing", [{ id: "performance", label: t("t_bing"), ...live("/bing/performance", renderBing) }]) },
    { id: "geo", icon: "geo", build: fromTool("geo", (a) => a.id !== "citability") },
    { id: "citability", icon: "citability", build: fromTool("geo", (a) => a.id === "citability", t("citIntro")) },
    { id: "indexnow", icon: "indexnow", build: () => custom("indexnow", [{ id: "readiness", label: t("s_indexnow"), needsDomain: false, async: async () => renderIndexNow(await overview()) }]) },
    { id: "sitemap", icon: "sitemap", build: fromTool("sitemap") },
    { id: "performance", icon: "performance", build: fromTool("performance") },
  ],
  act: [
    { id: 'studio', icon: 'workflow', build: () => custom('studio', [{ id: 'campaigns', label: LANG === 'fr' ? 'Scénarios de campagne' : 'Campaign scenarios', icon: 'workflow', needsDomain: false, decision: true, async: scenarioView }]) },
    { id: "journey", icon: "journey", build: () => custom("journey", [
      { id: "map", label: LANG === "fr" ? "Mon parcours client" : "My customer journey", needsDomain: false, async: async () => renderCustomerJourneyWorkspace({ state, api }) },
      { id: "prompts", label: LANG === "fr" ? "Questions suivies" : "Tracked questions", needsDomain: false, async: async () => renderOpsPrompts({ api, me: state.me }) },
    ]) },
    { id: "crm", icon: "crm", build: () => custom("crm", [['timeline','Contacts et timeline','Contacts and timeline'],['connections','Connexions et accès','Connections and access']].map(([id,fr,en])=>({id,label:LANG==='fr'?fr:en,needsDomain:false,async:async()=>renderCrm({api,me:state.me,tab:id})}))) },
    { id: "social", icon: "social", build: () => custom("social", [['campaigns','Campagnes','Campaigns'],['posts','Contenus','Content'],['calendar','Calendrier','Calendar'],['approvals','Validations','Approvals'],['analytics','Résultats','Results'],['creators','Créateurs et contacts','Creators and outreach'],['connections','Comptes','Accounts'],['runs','Traitements','Runs']].map(([id,fr,en])=>({id,label:LANG==='fr'?fr:en,needsDomain:false,async:async()=>renderSocial({api,me:state.me,tab:id})}))) },
    { id: "apply_mode", icon: "fixes", build: () => custom("apply_mode", [
      { id: "preview", label: LANG === "fr" ? "Correctifs GEO" : "GEO fixes", needsDomain: false, async: async () => renderApplyMode({ api, me: state.me, url: state.url }) }]) },
    { id: "search", icon: "search", build: fromTool("search") },
    { id: "keywords", icon: "keywords", build: () => { const base = fromTool("keywords")(); base.tabs.push({ id: "tracked", label: LANG === "fr" ? "Requêtes suivies" : "Tracked queries", needsDomain: false, async: async () => renderTrackedQueries({ state, api, scope, saveSettings }) }); return base; } },
    { id: "tracking", icon: "tracking", build: () => custom("tracking", [
      { id: "status", label: t("t_status"), needsDomain: false, async: async () => renderStatus(await api("/tracking/status", scope()), state) },
      { id: "tags", label: t("t_tags"), async: async () => renderTags(await api("/tracking/status", scope())) },
      { id: "settings", label: t("t_settings"), needsDomain: false, async: async () => { const status = await api("/tracking/status", scope()).catch(() => null); return renderSettings(state.me, saveSettings, status?.serviceAccount ?? null, api); } },
      { id: "access", label: LANG === "fr" ? "Accès" : "Access", needsDomain: false, async: async () => renderAccessManagement(state.me, api) }]) },
    { id: "billing", icon: "billing", build: () => custom("billing", [{ id: "subscription", label: t("s_billing"), needsDomain: false, async: billingView }]) },
    { id: "agents", icon: "agents", build: () => custom("agents", [{ id: "connections", label: LANG === "fr" ? "Agents connectés" : "Connected agents", needsDomain: false, async: async () => renderConnectedAgents({ tenant: state.me?.tenant?.id }) }]) },
    { id: "gtm", icon: "tag", build: () => custom("gtm", [
      { id: "workspace", label: t("t_gtm"), needsDomain: false, async: async () => renderGtm(await api("/gtm/inventory", scope({ container: state.gtmContainer || undefined })), api, rerender) }]) },
    { id: "audit", icon: "audit", build: fromTool("audit") },
    { id: "generators", icon: "generators", build: fromTool("generators") },
    { id: "calculators", icon: "calculators", build: fromTool("calculators") },
    { id: "report", icon: "report", build: fromTool("report") },
    { id: "ops", icon: "operations", build: () => custom("ops", [
      { id: "prompts", label: LANG === "fr" ? "Visibilité IA en direct" : "Live AI visibility", needsDomain: false, async: async () => renderOpsPrompts({ api, me: state.me }) },
      { id: "rank", label: LANG === "fr" ? "Positions suivies" : "Tracked rankings", needsDomain: false, async: async () => renderOpsRank({ api, me: state.me }) },
      { id: "articles", label: LANG === "fr" ? "Articles" : "Articles", needsDomain: false, async: async (filters) => renderOpsArticles({ api, me: state.me, pinId: filters?.pinId }) },
      { id: "alerts", label: LANG === "fr" ? "Alertes" : "Alerts", needsDomain: false, async: async () => renderOpsAlerts({ api, me: state.me }) }]) },
  ],
};
const ALL = [...SECTIONS.track, ...SECTIONS.act];
ALL.push({ id: 'portfolio', icon: 'building', decision: true, build: () => custom('portfolio', [{ id: 'workspaces', label: 'Portfolio', icon: 'building', decision: true, needsDomain: false, async: async () => renderPortfolio({ me: state.me, request: portfolioRequest }) }]) });
const decisionTab = (area, view) => ({ id: view.id, label: LANG === 'fr' ? view.fr : view.en, icon: view.icon, needsDomain: false, decision: true, async: area === 'ops' && view.id === 'campaigns' ? scenarioView : async () => renderDecisionHub(area, view.id, { state, api, scope }) });
for (const area of ['diagnose', 'impact', 'settings']) ALL.push({ id: area, icon: DECISION_AREAS.find(a => a.id === area).icon, decision: true, build: () => custom(area, DECISION_VIEWS[area].map(view => decisionTab(area, view))) });
for (const area of ['overview', 'ops']) {
  const section = ALL.find(s => s.id === area), original = section.build;
  section.build = () => {
    const legacy = original();
    if (area === 'overview') {
      legacy.tabs.find(t => t.id === 'plan').hiddenInNav = true;
      legacy.tabs[0].label = LANG === 'fr' ? 'Priorités' : 'Priorities';
      return { ...legacy, tabs: [...legacy.tabs, ...DECISION_VIEWS.overview.filter(v => v.id !== 'board').map(v => decisionTab(area, v))] };
    }
    return { ...legacy, tabs: [...DECISION_VIEWS.ops.map(v => decisionTab(area, v)), ...legacy.tabs.map(t => ({ ...t, hiddenInNav: true }))] };
  };
}


function wizardButton() {
  const button = el("button", "btn btn-small", LANG === "fr" ? "Refaire le démarrage guidé" : "Restart guided setup");
  button.type = "button"; button.onclick = launchWizard; return button;
}
function launchWizard() {
  if (!state.me?.tenant) return;
  openWizard({ state, api, scope, saveSettings, renderSettings, renderStatus, onSite: (url) => {
    state.url = url; state.overview = null; state.overviewFor = "";
    localStorage.setItem("gtm-console-url", url); $("#c-url").value = url; refreshSite();
  }, onClose: () => show(current.section, current.tab) });
}
let started = false;
let current = { section: "overview", tab: "" };
function routeFromHash() {
  const [section, tab, id] = location.hash.slice(1).split('/');
  const pinId = section === 'ops' && tab === 'articles' && /^[0-9a-f-]{36}$/.test(id || '') ? id : undefined;
  return [section, tab, pinId ? { pinId } : undefined];
}
let mountedEditor = null;
let viewEpoch = 0;
async function saveSettings(body) {
  const token = await accessToken();
  const res = await fetch(`${API_BASE}/tenant/settings`, { method: "PUT", headers: { "Content-Type": "application/json", ...headers(token) }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  state.me = { ...state.me, tenant: data.tenant };
  if (!data.tenant.gscProperties?.includes(state.property)) state.property = data.tenant.gscProperties?.[0] || '';
  if (!data.tenant.ga4Properties?.includes(state.ga4Property)) state.ga4Property = data.tenant.ga4Properties?.[0] || '';
  if (!data.tenant.bingSites?.includes(state.bingSite)) state.bingSite = data.tenant.bingSites?.[0] || '';
  let selectedHost = ''; try { selectedHost = new URL(state.url).hostname.toLowerCase().replace(/^www\./, ''); } catch { /* no selected site */ }
  if (!(data.tenant.domains || []).some(domain => selectedHost === domain || selectedHost.endsWith(`.${domain}`))) state.url = data.tenant.domains?.[0] ? `https://${data.tenant.domains[0]}` : '';
  for (const [id, value] of [['#c-url', state.url], ['#c-property', state.property], ['#c-ga4', state.ga4Property], ['#c-bing', state.bingSite]]) $(id).value = value;
  refreshSite();
  startBackground();
  return data;
}
async function show(sectionId, tabId, initialFilters) {
  if (!started) return;
  const epoch = ++viewEpoch;
  if (mountedEditor?.beforeLeave && !(await mountedEditor.beforeLeave())) {
    history.replaceState(null, '', `#${current.section}/${current.tab}`);
    return;
  }
  if (epoch !== viewEpoch) return;
  mountedEditor?.dispose?.(); mountedEditor = null;
  const section = ALL.find((s) => s.id === sectionId) ?? ALL[0];
  const def = section.build();
  const requestedTab = !state.me?.tenant && state.me?.platformAdmin && section.id === 'settings' && !tabId ? 'access' : tabId;
  const tab = def.tabs.find((x) => x.id === requestedTab) ?? def.tabs[0];
  const pinId = section.id === 'ops' && tab.id === 'articles' ? initialFilters?.pinId : undefined;
  current = { section: section.id, tab: tab.id, pinId };
  const decision = decisionLocation(section.id, tab.id);
  $('#c-app').dataset.area = decision.area;
  $('.app-side').classList.remove('is-nav-open'); $('#c-nav-toggle').setAttribute('aria-expanded', 'false');
  if (state.me?.tenant) {
    if (!consoleCoach) {
      consoleCoach = createConsoleCoach({ api, language: LANG, workspaceName: state.me.tenant.name, me: state.me, state, onNavigate: href => { const [section, tab] = href.slice(1).split('/'); void show(section, tab); } });
      $('#c-data-agent').replaceChildren(consoleCoach.element);
      contextualHelp = attachContextualHelp($('#c-app'), { getContext: () => ({ ...current }), onExplain: value => consoleCoach?.explain(value), language: LANG });
    }
    consoleCoach.setContext({ section: section.id, tab: tab.id, overview: state.overview, status: state.sourceStatus });
  }
  history.replaceState(null, "", `#${section.id}${tab.id !== def.tabs[0].id ? `/${tab.id}` : ""}${pinId ? `/${pinId}` : ""}`);
  document.querySelectorAll(".app-nav a").forEach((a) => { const on = a.dataset.section === decision.area; a.classList.toggle("is-active", on); if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
  const screenTitle = (section.id === "platform" ? (LANG === "fr" ? "Administration plateforme" : "Platform administration") : section.id === "competition" ? (LANG === "fr" ? "Concurrence" : "Competition") : section.id === "ai_visibility" ? (LANG === "fr" ? "Visibilité IA" : "AI visibility") : t(`s_${section.id}`));
  $("#c-crumb").textContent = decisionLabel(decision.area, LANG);
  const tabs = $("#c-tabs"); tabs.replaceChildren();
  for (const x of def.tabs.filter(x => !x.hiddenInNav)) {
    const active = x.id === tab.id || (tab.hiddenInNav && x.id === decision.view);
    const b = el("button", `app-tab${active ? " is-active" : ""}`); b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(active));
    b.dataset.coachSection = section.id; b.dataset.coachTab = x.id;
    const ic = el("span", "app-tab-icon"); ic.innerHTML = icon(x.icon || tabIcon(section.id, x.id)); b.dataset.icon = x.icon || tabIcon(section.id, x.id); b.append(ic, x.label);
    b.onclick = () => show(section.id, x.id); tabs.append(b);
  }
  const panel = el("section", "app-panel c-panel"); panel.setAttribute("role", "tabpanel");
  $("#c-panels").replaceChildren(panel);
  const feature = consoleFeature(section.id, tab.id, LANG);
  const area = DECISION_AREAS.find(a => a.id === decision.area);
  const isHub = tab.decision || section.id === 'overview';
  panel.append(sectionHeading(isHub ? (section.id === 'overview' && tab.id === 'board' ? decisionLabel('overview', LANG) : tab.label) : screenTitle, isHub ? (area?.description[LANG === 'fr' ? 0 : 1] || (LANG === 'fr' ? 'Coordonnez vos espaces clients.' : 'Coordinate customer workspaces.')) : feature?.benefit || def.intro || (LANG === 'fr' ? 'Comprendre les résultats, leurs sources et la prochaine action.' : 'Understand results, their sources and the next action.'), isHub ? (tab.icon || section.icon) : section.icon));
  if (!isHub) {
    const back = el('p', 'decision-tool-heading'); const link = el('a', '', `${decisionLabel(decision.area, LANG)} →`);
    link.href = `#${decision.area}/${decision.view}`; back.append(link, el('span', '', LANG === 'fr' ? 'Outil spécialisé · même espace client' : 'Specialist tool · same workspace')); panel.prepend(back);
  }
  if (section.id === 'apply_mode') panel.append(el('span', 'decision-badge', LANG === 'fr' ? 'Aperçu · Sans écriture directe' : 'Preview · No direct write'));
  const guide = isHub ? null : renderFeatureGuide(section.id, tab.id, LANG);
  if (guide) panel.append(guide);
  if (!state.me?.tenant && !["platform","portfolio"].includes(section.id) && !(section.id === 'settings' && tab.id === 'access' && state.me?.platformAdmin)) {
    panel.append(renderDataGuide("tenant", { error: state.contextError })); return;
  }

  if (state.me?.tenant && ['ga4','crm'].includes(section.id)) panel.append(renderMeasurementBanner({ api, state }));
  if (tab.action) { panel.append(renderAction(tab.action, { state, api, automaticRoutes })); return; }
  if (!state.url && tab.needsDomain !== false) { panel.append(renderDataGuide("domain")); return; }
  const loading = tab.progress ? el("div", "c-source-progress-host") : el("p", "c-loading", t("loadingOverview")); panel.append(loading);
  try {
    const nodes = await tab.async(tab.progress ? loading : initialFilters);
    if (epoch === viewEpoch && panel.isConnected) {
      loading.replaceWith(...[nodes].flat());
      mountedEditor = [nodes].flat().find(node => typeof node?.dispose === 'function') || null;
    } else for (const node of [nodes].flat()) node?.dispose?.();
  }
  catch (error) { if (panel.isConnected) loading.replaceWith(renderDataGuide(section.id, { error, retry: rerender })); }
}

function mountNav() {
  const navToggle = $('#c-nav-toggle');
  navToggle.textContent = LANG === 'fr' ? '☰ Parcours' : '☰ Navigation';
  navToggle.onclick = () => { const open = $('.app-side').classList.toggle('is-nav-open'); navToggle.setAttribute('aria-expanded', String(open)); };
  $('#c-nav-track').replaceChildren(); $('#c-nav-act').replaceChildren();
  $('#c-journey-label').textContent = LANG === 'fr' ? 'Votre parcours' : 'Your journey';
  $('#c-workspace-label').textContent = LANG === 'fr' ? 'Votre espace' : 'Your workspace';
  for (const area of [...DECISION_AREAS, ...((state.me?.memberships?.length || 0) > 1 ? [{ id: 'portfolio', icon: 'building' }] : [])]) {
    const li = el('li'), a = el('a'); a.href = `#${area.id}`; a.dataset.section = area.id; a.innerHTML = icon(area.icon);
    a.append(el('span', '', decisionLabel(area.id, LANG))); a.onclick = e => { e.preventDefault(); show(area.id); }; li.append(a);
    $(['settings','portfolio'].includes(area.id) ? '#c-nav-act' : '#c-nav-track').append(li);
  }
  const search = $('#c-search'), results = $('#c-tool-search');
  results.setAttribute('aria-label', LANG === 'fr' ? 'Résultats de recherche d’outils' : 'Tool search results');
  search.oninput = () => {
    const q = search.value.trim().toLocaleLowerCase(LANG); results.replaceChildren();
    if (!q) return;
    for (const section of ALL.filter(s => !s.decision)) {
      for (const tab of section.build().tabs.filter(t => !t.decision)) {
        const label = `${section.id === 'platform' ? (LANG === 'fr' ? 'Administration' : 'Administration') : t(`s_${section.id}`)} · ${tab.label}`;
        if (!`${label} ${section.id} ${tab.id}`.toLocaleLowerCase(LANG).includes(q)) continue;
        const li = el('li'), a = el('a'); a.href = `#${section.id}/${tab.id}`; a.innerHTML = icon(tab.icon || tabIcon(section.id, tab.id)); a.append(el('span', '', label));
        a.onclick = e => { e.preventDefault(); search.value = ''; results.replaceChildren(); show(section.id, tab.id); }; li.append(a); results.append(li);
      }
    }
    if (!results.children.length) results.append(el('li', 'c-note', LANG === 'fr' ? 'Aucun outil trouvé.' : 'No matching tool.'));
  };
  search.onkeydown = e => { if (e.key === 'Enter') results.querySelector('a')?.click(); if (e.key === 'Escape') { search.value = ''; results.replaceChildren(); } };
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('.app-side').classList.add('is-nav-open'); navToggle.setAttribute('aria-expanded', 'true'); search.focus(); } });
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
  $('#c-live').dataset.freshness = 'waiting';
  $('#c-live').textContent = LANG === 'fr' ? 'En attente de données' : 'Waiting for data';
}

function applyBranding(branding) {
  if (branding?.primaryColor) document.documentElement.style.setProperty("--app-accent", branding.primaryColor);
  if (branding?.logoUrl) { const img = $("#c-login-logo"); img.src = branding.logoUrl; img.hidden = false; $("#c-switch-logo").src = branding.logoUrl; }
}

async function discover(query) {
  const res = await fetch(`${DISCOVER}?${new URLSearchParams(query)}`, { cache: "no-store" });
  return res.ok ? res.json() : null;
}

/** Découverte du tenant : sous-domaine, ?tenant=, puis e-mail saisi.
 * Le gestionnaire est attaché avant tout await : un clic n'est jamais perdu, et
 * toute erreur est affichée au lieu d'échouer silencieusement. */
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
  document.getElementById('c-feature-entry')?.remove();
  const destination = featureHandoff(location, sessionStorage);
  const entry = destination && renderFeatureEntry(destination.hash, LANG);
  if (entry) document.querySelector('#c-login .public-main')?.prepend(entry);
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
  const label = (n) => (LANG === "en" ? `Sign in to ${n}` : `Se connecter à ${n}`);
  if (!tenant && (fromUrl || sub)) {
    ready = discover(fromUrl ? { tenant: fromUrl } : { host: sub }).then((x) => { if (x) { tenant = x; setTenant(x); applyBranding(x.branding); btn.textContent = label(x.name); } }).catch(() => {});
  } else if (tenant) { applyBranding(tenant.branding); btn.textContent = label(tenant.name); }
}
function i18nStaticLogin() { document.querySelectorAll("#c-login [data-i18n]").forEach((n) => { n.textContent = t(n.dataset.i18n); }); document.title = t("title"); }

async function start() {
  const handoff = workspaceHandoff(location, sessionStorage);
  const destination = featureHandoff(location, sessionStorage);
  let tokens;
  try { tokens = await handleRedirect(); } catch (error) { console.error(error); $("#c-login-error").textContent = error.message; }
  if (!tokens) return loginScreen();
  $("#c-app").hidden = false; i18nStatic();
  $("#c-logout").onclick = () => { mountedEditor?.dispose?.(); consoleCoach?.dispose(); contextualHelp?.dispose(); setTenant(null); sessionStorage.removeItem("gtm-console-selected"); sessionStorage.removeItem("gtm-console-handoff"); logout(); };
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
      if (me.tenant?.id !== handoff.tenant) throw new Error(LANG === "fr" ? "L'espace demandé n'est pas accessible avec ce compte." : "The requested workspace is not accessible with this account.");
      sessionStorage.removeItem("gtm-console-handoff");
      history.replaceState(null, "", `?lang=${LANG}${handoff.hash}`);
    } else if (destination && !location.hash) {
      history.replaceState(null, "", `?lang=${LANG}${destination.hash}`);
    }
    sessionStorage.removeItem('gtm-console-feature-handoff');
    state.me = me;
    $("#c-user").textContent = `${me.username ?? ""}${me.tenant ? ` · ${me.tenant.name}` : ""}${me.platformAdmin ? ` · ${t("superAdmin")}` : ""}`;
    if (me.accountConsole) $("#c-account").href = accountConsoleUrl(me.accountConsole);
    applyBranding(me.tenant?.branding);
    const select = $("#c-tenant");
    if ((me.memberships?.length ?? 0) > 1 || me.platformAdmin) {
      $("#c-tenant-wrap").hidden = false;
      const empty = el("option", "", LANG === "fr" ? "Choisir un client…" : "Choose a customer…"); empty.value = ""; select.append(empty);
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
    const notice = el("p", "c-error", LANG === "fr" ? `Le domaine ${state.requestedDomainUnavailable} n’est pas autorisé dans cet espace. Contactez votre administrateur pour l’ajouter.` : `The domain ${state.requestedDomainUnavailable} is not authorized in this workspace. Contact your administrator to add it.`);
    notice.setAttribute("role", "alert"); $("#c-app").prepend(notice);
  }
  const [s, tb, hashFilters] = routeFromHash();
  if (!state.url || !state.me?.tenant) { picker.hidden = false; sw.setAttribute("aria-expanded", "true"); }
  startBackground();
  started = true;
  show(s || (state.me?.tenant?.usageType === "agency" && state.me?.memberships?.length > 1 ? "portfolio" : "overview"), tb, hashFilters);
  // The coach is the default welcome. The setup wizard remains available when
  // explicitly requested, including the public website onboarding handoff.
  if (state.me?.tenant && !state.requestedDomainUnavailable && state.openRequestedWizard) launchWizard();
}
window.addEventListener("hashchange", () => { const [a, b, filters] = routeFromHash(); if (a && ALL.some((x) => x.id === a)) show(a, b, filters); });
start().catch((error) => { console.error(error); loginScreen(); $("#c-login-error").textContent = error.message; });
