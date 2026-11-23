/**
 * Partner market-data bridge (R4): keyword volumes, Google SERP positions and
 * local rank grids from an operator-configured, DataForSEO-compatible API.
 * Google.fr first (locale allowlist, default FR); every other locale ships
 * behind the same `MARKET_DATA_LOCALES` flag. The partner keys and the data
 * costs stay the operator's; nothing is billed to tenants. Every result
 * carries provider, observation date, locale, device and provenance
 * `partner-api`, so a partner figure is never mistaken for a measurement made
 * by this platform.
 */

export const MARKET_DATA_PROVENANCE = "partner-api";
export const PROVIDER_NAME = "market-data";
/** Local grid ranks are capped at this depth; deeper or missing ranks are not-found, never zero. */
export const LOCAL_GRID_DEPTH = 20;

export interface MarketDataConfig {
  /** Base URL of the operator's DataForSEO-compatible bridge. */
  baseUrl: string;
  /** Uppercase ISO country codes enabled by the operator (default: FR first). */
  locales: string[];
  login: string;
  password: string;
}

export interface MarketMeta {
  provider: typeof PROVIDER_NAME;
  provenance: typeof MARKET_DATA_PROVENANCE;
  locale: string;
  device: "desktop" | "mobile";
  observedAt: string;
  costUsd: number | null;
}

export interface MarketVolume {
  keyword: string;
  /** Monthly searches as reported by the partner, `null` when unknown. */
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
  currency: string | null;
}

export interface MarketSerpPosition { position: number | null; url: string; title: string }
export interface MarketGridPoint { id: string; latitude: number; longitude: number; rank: number | null; status: "found" | "not-found" }
export type MarketDevice = "desktop" | "mobile";

const LOCALE_PATTERN = /^[A-Z]{2}$/;

/**
 * Operator configuration, fail-closed: the bridge is only active with the
 * explicit `MARKET_DATA_ENABLED=true` flag AND the three credentials, never
 * merely because a key exists in the environment.
 */
export function marketDataConfig(env: NodeJS.ProcessEnv = process.env): MarketDataConfig | null {
  if (env.MARKET_DATA_ENABLED !== "true") return null;
  const baseUrl = env.MARKET_DATA_API_URL?.trim() ?? "";
  const login = env.MARKET_DATA_API_LOGIN?.trim() ?? "";
  const password = env.MARKET_DATA_API_PASSWORD?.trim() ?? "";
  if (!baseUrl || !login || !password) return null;
  try { new URL(baseUrl); } catch { return null; }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), locales: parseLocales(env.MARKET_DATA_LOCALES), login, password };
}

/** Default: France first. Any additional locale is an explicit operator opt-in. */
export function parseLocales(raw: string | undefined): string[] {
  const list = (raw ?? "FR").split(",").map((code) => code.trim().toUpperCase()).filter((code) => LOCALE_PATTERN.test(code));
  return [...new Set(list)].sort();
}

export function marketDataDisabledError(): string {
  return "Aucun pont données de marché activé (MARKET_DATA_ENABLED=true avec MARKET_DATA_API_URL, MARKET_DATA_API_LOGIN et MARKET_DATA_API_PASSWORD).";
}

export function marketLocaleError(locale: string, locales: string[]): string {
  return `Locale « ${locale} » non activée pour les données de marché (MARKET_DATA_LOCALES : ${locales.join(", ")}).`;
}

const normaliseLocale = (requested: string | undefined, config: MarketDataConfig): string => {
  const locale = (requested ?? config.locales[0] ?? "FR").trim().toUpperCase();
  if (!LOCALE_PATTERN.test(locale)) throw new Error("Locale de données de marché invalide (code pays à deux lettres attendu).");
  if (!config.locales.includes(locale)) throw new Error(marketLocaleError(locale, config.locales));
  return locale;
};

/** Shared mapping of one partner call: Basic auth, JSON body, bounded timeout. */
async function callPartner(
  config: MarketDataConfig,
  path: string,
  payload: unknown,
  transport: typeof fetch,
): Promise<{ observedAt: string | null; costUsd: number | null; data: Record<string, unknown> }> {
  const response = await transport(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.login}:${config.password}`).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Pont données de marché HTTP ${response.status}`);
  const data = await response.json() as Record<string, unknown>;
  const observedAt = typeof data.observedAt === "string" && Number.isFinite(Date.parse(data.observedAt)) ? data.observedAt : null;
  const cost = data.costUsd ?? data.cost_usd;
  const costUsd = typeof cost === "number" && Number.isFinite(cost) && cost >= 0 ? Math.round(cost * 1_000_000) / 1_000_000 : null;
  return { observedAt, costUsd, data };
}

const meta = (config: MarketDataConfig, locale: string, device: MarketDevice, observedAt: string | null, costUsd: number | null, now: () => string): MarketMeta =>
  ({ provider: PROVIDER_NAME, provenance: MARKET_DATA_PROVENANCE, locale, device, observedAt: observedAt ?? now(), costUsd });

/**
 * Keyword volumes, Google side. Partner contract: `POST {base}/volumes` with
 * `{ keywords, locale, device }` returns `{ observedAt?, costUsd?, volumes: [{ keyword, search_volume, cpc, competition, currency }] }`
 * (DataForSEO-style field names; unknown values are null, never zero).
 */
export async function marketVolumes(
  config: MarketDataConfig,
  input: { keywords: string[]; locale?: string; device?: MarketDevice },
  transport: typeof fetch,
  now: () => string = () => new Date().toISOString(),
): Promise<MarketMeta & { results: MarketVolume[] }> {
  const locale = normaliseLocale(input.locale, config);
  const device = input.device ?? "desktop";
  const { observedAt, costUsd, data } = await callPartner(config, "/volumes", { keywords: input.keywords, locale, device }, transport);
  const rows = new Map<string, MarketVolume>();
  for (const raw of Array.isArray(data.volumes) ? data.volumes : []) {
    const row = raw as Record<string, unknown>;
    const keyword = typeof row.keyword === "string" ? row.keyword : "";
    if (!keyword) continue;
    rows.set(keyword, {
      keyword,
      searchVolume: typeof row.search_volume === "number" && Number.isFinite(row.search_volume) ? row.search_volume : null,
      cpc: typeof row.cpc === "number" && Number.isFinite(row.cpc) ? row.cpc : null,
      competition: typeof row.competition === "number" && Number.isFinite(row.competition) ? row.competition : null,
      currency: typeof row.currency === "string" && row.currency.length <= 3 ? row.currency : null,
    });
  }
  const results = input.keywords.map((keyword) => rows.get(keyword) ?? { keyword, searchVolume: null, cpc: null, competition: null, currency: null });
  return { ...meta(config, locale, device, observedAt, costUsd, now), results };
}

/**
 * One organic Google SERP. Partner contract: `POST {base}/serp` with
 * `{ keyword, locale, device, depth }` returns `{ observedAt?, costUsd?, organic_results: [{ position, link, title }], ai_overview?: { present, cited_urls } }`.
 */
export async function marketSerp(
  config: MarketDataConfig,
  input: { keyword: string; locale?: string; device?: MarketDevice; depth?: number },
  transport: typeof fetch,
  now: () => string = () => new Date().toISOString(),
): Promise<MarketMeta & { results: MarketSerpPosition[]; aiOverview: { present: boolean; citedUrls: string[] } | null }> {
  const locale = normaliseLocale(input.locale, config);
  const device = input.device ?? "desktop";
  const depth = Math.min(Math.max(Math.trunc(input.depth ?? 20), 1), 100);
  const { observedAt, costUsd, data } = await callPartner(config, "/serp", { keyword: input.keyword, locale, device, depth }, transport);
  const results = (Array.isArray(data.organic_results) ? data.organic_results : []).slice(0, depth).map((raw) => {
    const row = raw as Record<string, unknown>;
    const url = typeof row.link === "string" ? row.link : "";
    return { position: typeof row.position === "number" && Number.isFinite(row.position) && row.position > 0 ? Math.trunc(row.position) : null, url, title: typeof row.title === "string" ? row.title : "" };
  }).filter((row) => row.url);
  const rawOverview = data.ai_overview as Record<string, unknown> | undefined;
  const aiOverview = rawOverview
    ? { present: Boolean(rawOverview.present), citedUrls: Array.isArray(rawOverview.cited_urls) ? rawOverview.cited_urls.filter((u): u is string => typeof u === "string") : [] }
    : null;
  return { ...meta(config, locale, device, observedAt, costUsd, now), results, aiOverview };
}

/**
 * Equal-step geographic grid (points ordered row by row, ids `r<r>c<c>`).
 * A 5×5 grid with `distanceKm: 2` spreads 25 points 2 km wide around the
 * centre; the east-west step compensates latitude with cos(latitude).
 */
export function gridPoints(
  centre: { latitude: number; longitude: number },
  columns: number,
  rows: number,
  distanceKm: number,
): Array<{ id: string; latitude: number; longitude: number }> {
  if (!Number.isFinite(centre.latitude) || centre.latitude < -90 || centre.latitude > 90) throw new Error("Latitude du centre de grille invalide.");
  if (!Number.isFinite(centre.longitude) || centre.longitude < -180 || centre.longitude > 180) throw new Error("Longitude du centre de grille invalide.");
  if (!Number.isInteger(columns) || columns < 1 || columns > 7 || !Number.isInteger(rows) || rows < 1 || rows > 7) throw new Error("Grille bornée à 7×7 points maximum.");
  if (!Number.isFinite(distanceKm) || distanceKm < 0.1 || distanceKm > 20) throw new Error("Distance de grille invalide (0,1 à 20 km).");
  const step = distanceKm / Math.max(columns - 1, rows - 1, 1);
  const dLat = step / 111.32;
  const cosLat = Math.max(Math.abs(Math.cos((centre.latitude * Math.PI) / 180)), 0.1);
  const dLng = step / (111.32 * cosLat);
  const points: Array<{ id: string; latitude: number; longitude: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const latitude = centre.latitude + (r - (rows - 1) / 2) * dLat;
      const longitude = centre.longitude + (c - (columns - 1) / 2) * dLng;
      points.push({ id: `r${r}c${c}`, latitude: Math.round(latitude * 1e6) / 1e6, longitude: Math.round(Math.min(Math.max(longitude, -180), 180) * 1e6) / 1e6 });
    }
  }
  return points;
}

/**
 * Local (Google Maps / GBP) rank grid. Partner contract: `POST
 * {base}/local-grid` with `{ keyword, locale, device, grid }` returns
 * `{ observedAt?, costUsd?, points: [{ rank?, title? }] }` aligned with the
 * requested grid order; ranks above the grid depth are not-found, never zero.
 */
export async function marketGrid(
  config: MarketDataConfig,
  input: { keyword: string; locale?: string; device?: MarketDevice; grid: Array<{ latitude: number; longitude: number }> },
  transport: typeof fetch,
  now: () => string = () => new Date().toISOString(),
): Promise<MarketMeta & { results: MarketGridPoint[] }> {
  const locale = normaliseLocale(input.locale, config);
  const device = input.device ?? "mobile";
  const { observedAt, costUsd, data } = await callPartner(config, "/local-grid", { keyword: input.keyword, locale, device, grid: input.grid }, transport);
  const rows = Array.isArray(data.points) ? data.points : [];
  const results = input.grid.map((point, index): MarketGridPoint => {
    const row = rows[index] as Record<string, unknown> | undefined;
    const rawRank = typeof row?.rank === "number" && Number.isFinite(row.rank) ? Math.trunc(row.rank) : null;
    const rank = rawRank !== null && rawRank >= 1 && rawRank <= LOCAL_GRID_DEPTH ? rawRank : null;
    return { id: `p${index}`, latitude: point.latitude, longitude: point.longitude, rank, status: rank === null ? "not-found" : "found" };
  });
  return { ...meta(config, locale, device, observedAt, costUsd, now), results };
}
