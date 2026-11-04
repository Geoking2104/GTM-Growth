/**
 * Console « Track » : données de performance en direct.
 *  - Google Search Console (Search Analytics) : totaux, comparaison à la période
 *    précédente, tendance quotidienne, ventilations requête / page / appareil / pays.
 *  - Google Analytics 4 (Data API) : sessions, utilisateurs, engagement, conversions
 *    (événements clés), canaux, sources, pages, pages de destination, appareils, pays, événements.
 *  - Bing Webmaster Tools (API gratuite, clé par tenant ou BING_WEBMASTER_API_KEY).
 *  - Statut des accès : quels sites / propriétés le compte de service voit vraiment.
 * Aucune API payante : APIs Google gratuites via le compte de service, API Bing gratuite.
 */

import fs from "node:fs";
import { google } from "googleapis";
import { getAuthClient } from "../auth/service-account.js";
import { querySearchAnalytics, listSearchConsoleSites, listSitemaps } from "../google/search-console.js";
import { runReport, runRealtimeReport } from "../google/data-api.js";
import { auditGtmInstallation } from "../google/gtm-installation.js";
import type { Tenant } from "../tenants/store.js";
import { str, num, type Body, type ConsoleRoute } from "./util.js";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Les données Search Console ont ~2-3 jours de retard. */
const GSC_LAG = 3;

export interface Period { start: string; end: string; prevStart: string; prevEnd: string; days: number; }
export function periodOf(days: number, lag = 0, now = Date.now()): Period {
  const end = new Date(now - lag * DAY);
  const start = new Date(end.getTime() - (days - 1) * DAY);
  const prevEnd = new Date(start.getTime() - DAY);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * DAY);
  return { start: iso(start), end: iso(end), prevStart: iso(prevStart), prevEnd: iso(prevEnd), days };
}

/** Variation relative en % (null si la base est nulle). */
export const delta = (cur: number, prev: number): number | null => (prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);

/** E-mail du compte de service (lu dans le fichier de clé : ce n'est pas un secret). */
export function serviceAccountEmail(): string | null {
  try {
    if (process.env.GOOGLE_CREDENTIALS_JSON) return JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON).client_email ?? null;
    const file = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!file || !fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")).client_email ?? null;
  } catch { return null; }
}

/** Erreur d'accès Google/Bing transformée en état exploitable par l'interface (pas un 502 opaque). */
export interface AccessProblem { state: "no-credentials" | "no-access" | "not-configured" | "error"; message: string; grantEmail?: string | null; steps?: string[]; }
export function accessProblem(error: unknown, kind: "gsc" | "ga4", target: string): AccessProblem {
  const e = error as { code?: number; status?: number; message?: string; response?: { status?: number } };
  const code = e.code ?? e.status ?? e.response?.status;
  const msg = e.message ?? String(error);
  const email = serviceAccountEmail();
  if (!email) return { state: "no-credentials", message: "Compte de service Google absent du serveur (GOOGLE_APPLICATION_CREDENTIALS).", grantEmail: null };
  if (code === 403 || code === 404 || /permission|not have|forbidden|not found|sufficient/i.test(msg)) {
    return {
      state: "no-access", grantEmail: email, message: `Le compte de service n'a pas accès à ${target}.`,
      steps: kind === "gsc"
        ? [`Search Console → ${target} → Paramètres → Utilisateurs et autorisations → Ajouter un utilisateur`, `E-mail : ${email} — autorisation « Restreint » (lecture) suffit.`]
        : [`Google Analytics → Admin → Propriété ${target} → Gestion des accès à la propriété → +`, `E-mail : ${email} — rôle « Lecteur ».`],
    };
  }
  return { state: "error", message: msg, grantEmail: email };
}

// ─── Search Console ─────────────────────────────────────────────────────────

type GscRow = { keys?: string[] | null; clicks?: number | null; impressions?: number | null; ctr?: number | null; position?: number | null };
const gscRow = (r: GscRow) => ({ clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, ctr: r.ctr ?? 0, position: r.position ?? 0 });
const SEARCH_TYPES = ["web", "image", "video", "news", "discover", "googleNews"];

export async function searchPerformance(body: Body, query = querySearchAnalytics) {
  const siteUrl = str(body.property);
  if (!siteUrl) return { problem: { state: "not-configured", message: "Aucune propriété Search Console configurée pour ce client (ex. sc-domain:exemple.fr)." } satisfies AccessProblem };
  const days = num(body.days, 28, 1, 480);
  const p = periodOf(days, GSC_LAG);
  const type = SEARCH_TYPES.includes(String(body.searchType)) ? String(body.searchType) : "web";
  const rowLimit = num(body.rowLimit, 100, 1, 5000);
  const base = { siteUrl, type };
  try {
    const q = (dimensions: string[], start = p.start, end = p.end, limit = rowLimit) => query({ ...base, startDate: start, endDate: end, dimensions, rowLimit: limit }).then((r) => r.rows as GscRow[]);
    const [tot, prevTot, trend, queries, pages, devices, countries, appearance] = await Promise.all([
      q([]), q([], p.prevStart, p.prevEnd), q(["date"], p.start, p.end, 500), q(["query"]), q(["page"]), q(["device"]), q(["country"], p.start, p.end, 250),
      type === "web" ? q(["searchAppearance"]).catch(() => []) : Promise.resolve([] as GscRow[]),
    ]);
    const cur = gscRow(tot[0] ?? {}); const prev = gscRow(prevTot[0] ?? {});
    const keyed = (rows: GscRow[], key: string) => rows.map((r) => ({ [key]: r.keys?.[0] ?? "", ...gscRow(r) }));
    return {
      property: siteUrl, searchType: type, period: p,
      totals: cur, previous: prev,
      deltas: { clicks: delta(cur.clicks, prev.clicks), impressions: delta(cur.impressions, prev.impressions), ctr: delta(cur.ctr, prev.ctr), position: delta(cur.position, prev.position) },
      trend: keyed(trend, "date"), queries: keyed(queries, "query"), pages: keyed(pages, "page"),
      devices: keyed(devices, "device"), countries: keyed(countries, "country"), searchAppearance: keyed(appearance, "appearance"),
    };
  } catch (error) { return { problem: accessProblem(error, "gsc", siteUrl) }; }
}

/** Paires requête → page (cannibalisation, pages qui portent chaque requête). */
export async function searchQueryPages(body: Body, query = querySearchAnalytics) {
  const siteUrl = str(body.property);
  if (!siteUrl) return { problem: { state: "not-configured", message: "Aucune propriété Search Console configurée." } satisfies AccessProblem };
  const p = periodOf(num(body.days, 28, 1, 480), GSC_LAG);
  try {
    const { rows } = await query({ siteUrl, startDate: p.start, endDate: p.end, dimensions: ["query", "page"], rowLimit: num(body.rowLimit, 500, 1, 5000) });
    return { property: siteUrl, period: p, rows: (rows as GscRow[]).map((r) => ({ query: r.keys?.[0], page: r.keys?.[1], ...gscRow(r) })) };
  } catch (error) { return { problem: accessProblem(error, "gsc", siteUrl) }; }
}

export async function searchSitemaps(body: Body) {
  const siteUrl = str(body.property);
  if (!siteUrl) return { problem: { state: "not-configured", message: "Aucune propriété Search Console configurée." } satisfies AccessProblem };
  try {
    const list = await listSitemaps(siteUrl);
    return { property: siteUrl, sitemaps: list.map((s) => ({ path: s.path, lastSubmitted: s.lastSubmitted, lastDownloaded: s.lastDownloaded, isPending: s.isPending, isIndex: s.isSitemapsIndex, errors: Number(s.errors ?? 0), warnings: Number(s.warnings ?? 0), submitted: (s.contents ?? []).reduce((a, c) => a + Number(c.submitted ?? 0), 0), indexed: (s.contents ?? []).reduce((a, c) => a + Number(c.indexed ?? 0), 0) })) };
  } catch (error) { return { problem: accessProblem(error, "gsc", siteUrl) }; }
}

// ─── GA4 ────────────────────────────────────────────────────────────────────

type Report = (p: Parameters<typeof runReport>[0]) => Promise<{ rows: Record<string, string>[] }>;
const n = (v: unknown) => (v === undefined || v === null || v === "" ? 0 : Number(v));
const GA4_TOTALS = ["sessions", "totalUsers", "newUsers", "activeUsers", "engagedSessions", "engagementRate", "averageSessionDuration", "screenPageViews", "keyEvents", "bounceRate", "eventCount"];

export function ga4PropertyOf(body: Body): string | undefined {
  const raw = str(body.ga4Property);
  return raw ? raw.replace(/^properties\//, "") : undefined;
}

export async function ga4Overview(body: Body, report: Report = runReport) {
  const propertyId = ga4PropertyOf(body);
  if (!propertyId) return { problem: { state: "not-configured", message: "Aucune propriété GA4 configurée pour ce client (identifiant numérique, ex. 123456789)." } satisfies AccessProblem };
  const days = num(body.days, 28, 1, 480);
  const p = periodOf(days, 1);
  const limit = num(body.rowLimit, 50, 1, 1000);
  const r = (metrics: string[], dimensions: string[] = [], start = p.start, end = p.end, lim = limit, order?: string) =>
    report({ propertyId, metrics, dimensions, startDate: start, endDate: end, limit: lim, orderBys: order ? [{ metric: { metricName: order }, desc: true }] : undefined }).then((x) => x.rows);
  try {
    const [tot, prevTot, trend, channels, sources, pages, landing, devices, countries, events] = await Promise.all([
      r(GA4_TOTALS), r(GA4_TOTALS, [], p.prevStart, p.prevEnd),
      r(["sessions", "totalUsers", "keyEvents"], ["date"], p.start, p.end, 500),
      r(["sessions", "totalUsers", "engagementRate", "keyEvents"], ["sessionDefaultChannelGroup"], p.start, p.end, limit, "sessions"),
      r(["sessions", "totalUsers", "keyEvents"], ["sessionSourceMedium"], p.start, p.end, limit, "sessions"),
      r(["screenPageViews", "activeUsers", "averageSessionDuration", "engagementRate", "keyEvents"], ["pagePath"], p.start, p.end, limit, "screenPageViews"),
      r(["sessions", "engagementRate", "keyEvents"], ["landingPage"], p.start, p.end, limit, "sessions"),
      r(["sessions", "totalUsers", "engagementRate", "keyEvents"], ["deviceCategory"], p.start, p.end, 10, "sessions"),
      r(["sessions", "totalUsers", "engagementRate", "keyEvents"], ["country"], p.start, p.end, limit, "sessions"),
      r(["eventCount", "keyEvents", "totalUsers"], ["eventName"], p.start, p.end, limit, "eventCount"),
    ]);
    const num0 = (row: Record<string, string> | undefined) => Object.fromEntries(GA4_TOTALS.map((k) => [k, n(row?.[k])]));
    const cur = num0(tot[0]); const prev = num0(prevTot[0]);
    const numeric = (rows: Record<string, string>[]) => rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(v) && k !== "date" ? Number(v) : v])));
    return {
      propertyId, period: p, totals: cur, previous: prev,
      deltas: Object.fromEntries(GA4_TOTALS.map((k) => [k, delta(cur[k], prev[k])])),
      trend: numeric(trend).sort((a, b) => String(a.date).localeCompare(String(b.date))).map((x) => ({ ...x, date: `${String(x.date).slice(0, 4)}-${String(x.date).slice(4, 6)}-${String(x.date).slice(6, 8)}` })),
      channels: numeric(channels), sources: numeric(sources), pages: numeric(pages), landingPages: numeric(landing),
      devices: numeric(devices), countries: numeric(countries), events: numeric(events),
    };
  } catch (error) { return { problem: accessProblem(error, "ga4", propertyId) }; }
}

export async function ga4Realtime(body: Body) {
  const propertyId = ga4PropertyOf(body);
  if (!propertyId) return { problem: { state: "not-configured", message: "Aucune propriété GA4 configurée." } satisfies AccessProblem };
  try {
    const [byCountry, byPage, byDevice] = await Promise.all([
      runRealtimeReport({ propertyId, metrics: ["activeUsers"], dimensions: ["country"], limit: 20 }),
      runRealtimeReport({ propertyId, metrics: ["activeUsers", "screenPageViews"], dimensions: ["unifiedScreenName"], limit: 20 }),
      runRealtimeReport({ propertyId, metrics: ["activeUsers"], dimensions: ["deviceCategory"], limit: 5 }),
    ]);
    const total = byDevice.rows.reduce((a: number, x: Record<string, string>) => a + n(x.activeUsers), 0);
    return { propertyId, activeUsers: total, countries: byCountry.rows, pages: byPage.rows, devices: byDevice.rows };
  } catch (error) { return { problem: accessProblem(error, "ga4", propertyId) }; }
}

// ─── Bing Webmaster Tools ──────────────────────────────────────────────────

const BING = "https://ssl.bing.com/webmaster/api.svc/json";
/** Clé Bing : celle du tenant (jamais renvoyée au navigateur), sinon celle de la plateforme. */
export const bingKeyFor = (tenant?: Tenant) => tenant?.bingApiKey || process.env.BING_WEBMASTER_API_KEY || "";
/** "/Date(1700000000000-0800)/" → "2023-11-14" */
export const bingDate = (v: unknown) => { const m = /\/Date\((-?\d+)/.exec(String(v)); return m ? iso(new Date(Number(m[1]))) : String(v ?? ""); };

type BingFetch = (url: string) => Promise<Response>;
async function bing(method: string, key: string, params: Record<string, string>, f: BingFetch): Promise<any> {
  const res = await f(`${BING}/${method}?${new URLSearchParams({ ...params, apikey: key })}`);
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`Bing ${method}: HTTP ${res.status} ${text.slice(0, 200).replace(/apikey=[^&\s"]+/gi, "apikey=***")}`), { status: res.status });
  const json = JSON.parse(text || "{}");
  return json.d ?? json;
}

export async function bingPerformance(body: Body, tenant: Tenant | undefined, f: BingFetch = (u) => fetch(u)) {
  const key = bingKeyFor(tenant);
  const siteUrl = str(body.bingSite) ?? (str(body.url) ? `${new URL(String(body.url)).origin}/` : undefined);
  if (!key) return { problem: { state: "not-configured", message: "Clé API Bing Webmaster non configurée.", steps: ["Bing Webmaster Tools → Paramètres → Accès API → Clé API (gratuite) → copier la clé.", "Console → Tracking → Paramètres : coller la clé (administrateur du client)."] } satisfies AccessProblem };
  if (!siteUrl) return { problem: { state: "not-configured", message: "Aucun site Bing configuré (ex. https://www.exemple.fr/)." } satisfies AccessProblem };
  const days = num(body.days, 28, 1, 480);
  const p = periodOf(days, 1);
  const inRange = (d: string, s: string, e: string) => d >= s && d <= e;
  try {
    const [traffic, queries, pages] = await Promise.all([
      bing("GetRankAndTrafficStats", key, { siteUrl }, f), bing("GetQueryStats", key, { siteUrl }, f), bing("GetPageStats", key, { siteUrl }, f),
    ]);
    const tr = (traffic as any[]).map((x) => ({ date: bingDate(x.Date), clicks: n(x.Clicks), impressions: n(x.Impressions) })).sort((a, b) => a.date.localeCompare(b.date));
    const sum = (rows: { clicks: number; impressions: number }[]) => rows.reduce((a, x) => ({ clicks: a.clicks + x.clicks, impressions: a.impressions + x.impressions }), { clicks: 0, impressions: 0 });
    const cur = sum(tr.filter((x) => inRange(x.date, p.start, p.end))); const prev = sum(tr.filter((x) => inRange(x.date, p.prevStart, p.prevEnd)));
    /** Bing agrège requêtes et pages par semaine : on regroupe sur la période. */
    const group = (rows: any[], keyName: string) => {
      const map = new Map<string, { clicks: number; impressions: number; posSum: number; posW: number }>();
      for (const x of rows) {
        const d = bingDate(x.Date); if (!inRange(d, p.start, p.end)) continue;
        const k = String(x.Query ?? ""); const m = map.get(k) ?? { clicks: 0, impressions: 0, posSum: 0, posW: 0 };
        m.clicks += n(x.Clicks); m.impressions += n(x.Impressions); m.posSum += n(x.AvgImpressionPosition) * n(x.Impressions); m.posW += n(x.Impressions); map.set(k, m);
      }
      return [...map].map(([k, m]) => ({ [keyName]: k, clicks: m.clicks, impressions: m.impressions, ctr: m.impressions ? m.clicks / m.impressions : 0, position: m.posW ? m.posSum / m.posW : 0 }))
        .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, num(body.rowLimit, 100, 1, 5000));
    };
    return {
      siteUrl, period: p,
      totals: { ...cur, ctr: cur.impressions ? cur.clicks / cur.impressions : 0 }, previous: { ...prev, ctr: prev.impressions ? prev.clicks / prev.impressions : 0 },
      deltas: { clicks: delta(cur.clicks, prev.clicks), impressions: delta(cur.impressions, prev.impressions) },
      trend: tr.filter((x) => inRange(x.date, p.start, p.end)), queries: group(queries as any[], "query"), pages: group(pages as any[], "page"),
      notes: ["L'API Bing Webmaster ne fournit pas de ventilation par appareil ni par pays : seules les requêtes, les pages et la tendance sont disponibles."],
    };
  } catch (error) {
    const status = (error as { status?: number }).status;
    return { problem: { state: status === 400 || status === 401 || status === 403 ? "no-access" : "error", message: (error as Error).message, steps: ["Vérifiez que le site est ajouté et validé dans Bing Webmaster Tools avec le compte qui a généré la clé API, et que l'URL du site est exacte (https://…/)."] } satisfies AccessProblem };
  }
}

// ─── Statut des accès ──────────────────────────────────────────────────────

export async function trackingStatus(body: Body, tenant: Tenant | undefined, f: BingFetch = (u) => fetch(u)) {
  const email = serviceAccountEmail();
  const property = str(body.property); const ga4 = ga4PropertyOf(body);
  const out: Record<string, unknown> = { serviceAccount: { installed: Boolean(email), email } };
  if (email) {
    try {
      const sites = await listSearchConsoleSites();
      out.gsc = { sites, configured: property ?? null, hasAccess: property ? sites.some((s) => s.siteUrl === property) : null };
    } catch (error) { out.gsc = { error: (error as Error).message }; }
    try {
      const auth = await getAuthClient();
      const res = await google.analyticsadmin({ version: "v1beta", auth: auth as any }).accountSummaries.list({ pageSize: 200 });
      const properties = (res.data.accountSummaries ?? []).flatMap((a) => (a.propertySummaries ?? []).map((p) => ({ account: a.displayName, propertyId: String(p.property ?? "").replace(/^properties\//, ""), name: p.displayName })));
      out.ga4 = { properties, configured: ga4 ?? null, hasAccess: ga4 ? properties.some((p) => p.propertyId === ga4) : null };
    } catch (error) { out.ga4 = { error: (error as Error).message }; }
  }
  const key = bingKeyFor(tenant);
  const bingSite = str(body.bingSite) ?? null;
  if (key) {
    try {
      const sites = (await bing("GetUserSites", key, {}, f)) as any[];
      const list = sites.map((s) => ({ url: s.Url, verified: Boolean(s.IsVerified) }));
      out.bing = { keyConfigured: true, keySource: tenant?.bingApiKey ? "tenant" : "platform", sites: list, configured: bingSite, hasAccess: bingSite ? list.some((s) => s.url === bingSite) : null };
    } catch (error) { out.bing = { keyConfigured: true, error: (error as Error).message }; }
  } else out.bing = { keyConfigured: false, configured: bingSite };
  if (str(body.url)) out.tags = await auditGtmInstallation({ url: String(body.url) }).catch((e) => ({ error: (e as Error).message }));
  return out;
}

export const analyticsRoutes: ConsoleRoute[] = [
  { path: "/search/performance", needsUrl: false, handler: async ({ body }) => searchPerformance(body) },
  { path: "/search/query-pages", needsUrl: false, handler: async ({ body }) => searchQueryPages(body) },
  { path: "/search/sitemaps", needsUrl: false, handler: async ({ body }) => searchSitemaps(body) },
  { path: "/ga4/overview", needsUrl: false, handler: async ({ body }) => ga4Overview(body) },
  { path: "/ga4/realtime", needsUrl: false, handler: async ({ body }) => ga4Realtime(body) },
  { path: "/bing/performance", needsUrl: false, handler: async ({ body, tenancy }) => bingPerformance(body, tenancy?.tenant ?? undefined) },
  { path: "/tracking/status", needsUrl: false, handler: async ({ body, tenancy }) => trackingStatus(body, tenancy?.tenant ?? undefined) },
];
