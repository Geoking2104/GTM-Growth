/**
 * Console routes for the partner market-data bridge (R4). Reading the badge is
 * free for every console reader; every partner call is an explicit
 * administrator action because each request spends operator-owned partner
 * credits. Grid results can propose (not import) a Global & local SEO
 * observation: the agency stays the importer of record.
 */
import { z } from "zod";
import { LOCAL_GRID_DEPTH, MARKET_DATA_PROVENANCE, PROVIDER_NAME, gridPoints, marketDataConfig, marketDataDisabledError, marketGrid, marketSerp, marketVolumes } from "../market/provider.js";
import type { ConsoleRoute, HandlerContext } from "./util.js";

const input = <T extends z.ZodTypeAny>(schema: T, ctx: HandlerContext): z.infer<T> => schema.parse(ctx.body ?? {});

const gridBody = z.object({
  keyword: z.string().trim().min(1).max(200),
  locale: z.string().trim().regex(/^[A-Za-z]{2}$/).optional(),
  device: z.enum(["desktop", "mobile"]).optional(),
  siteId: z.string().trim().min(1).max(80).optional(),
  geometry: z.object({
    latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
    columns: z.number().int().min(1).max(7), rows: z.number().int().min(1).max(7),
    distanceKm: z.number().min(0.1).max(20),
  }).strict().optional(),
  points: z.array(z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict()).min(1).max(49).optional(),
}).strict().superRefine((value, ctx) => {
  const hasGeometry = value.geometry !== undefined;
  const hasPoints = (value.points?.length ?? 0) > 0;
  if (hasGeometry === hasPoints) ctx.addIssue({ code: "custom", message: "Fournissez soit une géométrie de grille (centre, colonnes, lignes, distance), soit une liste de points, jamais les deux." });
});

const tenantHost = (ctx: HandlerContext): string | null => {
  const tenant = ctx.tenancy?.tenant;
  const domain = tenant?.domains?.[0];
  return domain ? domain.replace(/^https?:\/\//, "").replace(/\/+$/, "") : null;
};

/** Tenant positions inside one partner SERP, same best-effort host match as T-4. */
function tenantPositions(host: string | null, positions: Array<{ position: number | null; url: string }>) {
  const normalise = (value: string) => { try { return new URL(value).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; } };
  const target = host ? host.replace(/^www\./, "").toLowerCase() : null;
  const mine = positions.filter((row) => { const h = normalise(row.url); return h !== null && target !== null && (h === target || h.endsWith(`.${target}`)); });
  return { tenantRank: mine[0]?.position ?? null, tenantUrl: mine[0]?.url ?? null };
}

/**
 * Proposed import into the Global & local SEO observation ledger: declared
 * evidence with the partner as source, maps surface and the agency as the
 * importer of record (the console `local-seo/import` route re-validates site,
 * country and duplicates against the tenant state).
 */
export function proposedLocalSeoObservation(
  siteId: string,
  result: { keyword: string; locale: string; device: "desktop" | "mobile"; observedAt: string; results: Array<{ id: string; latitude: number; longitude: number; rank: number | null; status: "found" | "not-found" }> },
) {
  return {
    observation: {
      siteId,
      source: `${PROVIDER_NAME} (${MARKET_DATA_PROVENANCE})`,
      method: "partner-local-grid",
      observedAt: result.observedAt,
      country: result.locale,
      surface: "maps" as const,
      query: result.keyword,
      device: result.device,
      depth: LOCAL_GRID_DEPTH,
      identity: "partner-grid-v1",
      points: result.results.map((point) => ({
        id: point.id, latitude: point.latitude, longitude: point.longitude,
        status: point.status, ...(point.rank !== null ? { rank: point.rank } : {}),
      })),
    },
  };
}

export function marketDataRoutes(transport: typeof fetch = fetch): ConsoleRoute[] {
  const requireConfig = () => {
    const config = marketDataConfig();
    if (!config) throw new Error(marketDataDisabledError());
    return config;
  };
  return [
    { path: "/market/config", needsUrl: false, handler: async () => {
      const config = marketDataConfig();
      return { provider: PROVIDER_NAME, enabled: Boolean(config), locales: config?.locales ?? [], provenance: MARKET_DATA_PROVENANCE };
    } },
    { path: "/market/volumes", needsUrl: false, adminOnly: true, handler: async (ctx) => {
      const config = requireConfig();
      const body = input(z.object({ keywords: z.array(z.string().trim().min(1).max(200)).min(1).max(50), locale: z.string().trim().regex(/^[A-Za-z]{2}$/).optional(), device: z.enum(["desktop", "mobile"]).optional() }).strict(), ctx);
      return marketVolumes(config, { keywords: body.keywords, locale: body.locale?.toUpperCase(), device: body.device }, transport);
    } },
    { path: "/market/serp", needsUrl: false, adminOnly: true, handler: async (ctx) => {
      const config = requireConfig();
      const body = input(z.object({ keyword: z.string().trim().min(1).max(200), locale: z.string().trim().regex(/^[A-Za-z]{2}$/).optional(), device: z.enum(["desktop", "mobile"]).optional(), depth: z.number().int().min(1).max(100).optional() }).strict(), ctx);
      const result = await marketSerp(config, { keyword: body.keyword, locale: body.locale?.toUpperCase(), device: body.device, depth: body.depth }, transport);
      const { tenantRank, tenantUrl } = tenantPositions(tenantHost(ctx), result.results);
      return { ...result, tenantRank, tenantUrl };
    } },
    { path: "/market/grid", needsUrl: false, adminOnly: true, handler: async (ctx) => {
      const config = requireConfig();
      const body = input(gridBody, ctx);
      const grid = body.geometry
        ? gridPoints(body.geometry, body.geometry.columns, body.geometry.rows, body.geometry.distanceKm)
        : (body.points ?? []).map((point, index) => ({ id: `p${index}`, latitude: point.latitude, longitude: point.longitude }));
      const result = await marketGrid(config, { keyword: body.keyword, locale: body.locale?.toUpperCase(), device: body.device, grid }, transport);
      return { ...result, ...(body.siteId ? proposedLocalSeoObservation(body.siteId, { ...result, keyword: body.keyword }) : {}) };
    } },
  ];
}
