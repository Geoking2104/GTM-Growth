/**
 * Console routes for the partner market-data bridge (R4/R5): Google.fr-first
 * keyword volumes, Google SERP positions, GBP local rank grids and backlink
 * intelligence (domain overview, link gap versus named competitors, disavow
 * export) from an operator-configured, DataForSEO-compatible API. Fail-closed
 * behind `MARKET_DATA_ENABLED`: the operator owns the partner keys and the data
 * costs, nothing is ever billed to tenants. Every response carries provider,
 * provenance `partner-api`, locale, device and the observation date, so a
 * partner figure is never mistaken for a measurement made by this platform.
 * The disavow export is the exception: a pure, partner-free generation from a
 * tenant-supplied selection, explicitly labelled `tenant-selection`.
 */
import type { ConsoleRoute } from "./util.js";
import { str, num } from "./util.js";
import {
  gridPoints, marketDataConfig, marketDataDisabledError, marketGrid, marketSerp, marketVolumes, parseLocales,
  backlinkDisavowFile, marketBacklinkGap, marketBacklinkOverview,
  LOCAL_GRID_DEPTH, MARKET_DATA_PROVENANCE, PROVIDER_NAME,
  type MarketDataConfig, type MarketDevice,
} from "../market/provider.js";

/** Tenant-supplied keywords are bounded before any partner call. */
const keywordListOf = (raw: unknown, limit: number): string[] => {
  const items = (Array.isArray(raw) ? raw : []).filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  const keywords = [...new Set(items)];
  if (!keywords.length) throw new Error("Au moins un mot-clé est requis.");
  if (keywords.length > limit) throw new Error(`${limit} mots-clés maximum par appel.`);
  if (keywords.some((keyword) => keyword.length > 200)) throw new Error("Mot-clé trop long (200 caractères maximum).");
  return keywords;
};

const deviceOf = (raw: unknown): MarketDevice => (raw === "mobile" ? "mobile" : "desktop");

/** Tenant-supplied string list (domains, competitors): trimmed, deduped, bounded. */
const stringListOf = (raw: unknown, limit: number, label: string): string[] => {
  const items = (Array.isArray(raw) ? raw : []).filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  const list = [...new Set(items)];
  if (!list.length) throw new Error(`Au moins un ${label.slice(0, -1)} est requis.`);
  if (list.length > limit) throw new Error(`${limit} ${label} maximum par appel.`);
  return list;
};

export function marketRoutes(config: MarketDataConfig | null = marketDataConfig()): ConsoleRoute[] {
  const requireConfig = (): MarketDataConfig => {
    if (!config) throw new Error(marketDataDisabledError());
    return config;
  };
  return [
    { path: "/market/status", needsUrl: false, handler: async () => ({
      enabled: Boolean(config), locales: config?.locales ?? parseLocales(undefined),
      provider: PROVIDER_NAME, provenance: MARKET_DATA_PROVENANCE, localGridDepth: LOCAL_GRID_DEPTH,
      note: "Les volumes, positions et grilles locales viennent du pont partenaire de l'opérateur ; les coûts d'appels restent à l'opérateur et aucune valeur n'est inventée hors pont.",
    }) },
    { path: "/market/volumes", needsUrl: false, adminOnly: true, handler: async (ctx) => {
      const keywords = keywordListOf(ctx.body.keywords, 20);
      return await marketVolumes(requireConfig(), { keywords, locale: str(ctx.body.locale), device: deviceOf(ctx.body.device) });
    } },
    { path: "/market/serp", needsUrl: false, adminOnly: true, handler: async (ctx) => {
      const keyword = str(ctx.body.keyword) ?? "";
      if (!keyword) throw new Error("Mot-clé requis.");
      if (keyword.length > 200) throw new Error("Mot-clé trop long (200 caractères maximum).");
      return await marketSerp(requireConfig(), { keyword, locale: str(ctx.body.locale), device: deviceOf(ctx.body.device), depth: num(ctx.body.depth, 20, 1, 100) });
    } },
    { path: "/market/local-grid", needsUrl: false, adminOnly: true, handler: async (ctx) => {
      const keyword = str(ctx.body.keyword) ?? "";
      if (!keyword) throw new Error("Mot-clé requis.");
      if (keyword.length > 200) throw new Error("Mot-clé trop long (200 caractères maximum).");
      const latitude = num(ctx.body.latitude, Number.NaN, -90, 90);
      const longitude = num(ctx.body.longitude, Number.NaN, -180, 180);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("Coordonnées du centre de grille requises.");
      const grid = gridPoints({ latitude, longitude }, Math.trunc(num(ctx.body.columns, 5, 1, 7)), Math.trunc(num(ctx.body.rows, 5, 1, 7)), num(ctx.body.distanceKm, 1, 0.1, 20));
      return await marketGrid(requireConfig(), { keyword, locale: str(ctx.body.locale), device: ctx.body.device === "desktop" ? "desktop" : "mobile", grid });
    } },
    { path: "/market/backlinks/overview", needsUrl: false, adminOnly: true, handler: async (ctx) => {
      const domain = str(ctx.body.domain) ?? "";
      if (!domain) throw new Error("Nom de domaine requis.");
      return await marketBacklinkOverview(requireConfig(), { domain, referrersLimit: num(ctx.body.referrersLimit, 20, 1, 50), locale: str(ctx.body.locale) });
    } },
    { path: "/market/backlinks/gap", needsUrl: false, adminOnly: true, handler: async (ctx) => {
      const domain = str(ctx.body.domain) ?? "";
      if (!domain) throw new Error("Nom de domaine requis.");
      const competitors = stringListOf(ctx.body.competitors, 5, "concurrents");
      return await marketBacklinkGap(requireConfig(), { domain, competitors, locale: str(ctx.body.locale) });
    } },
    { path: "/market/backlinks/disavow", needsUrl: false, adminOnly: true, handler: async (ctx) => {
      const domains = stringListOf(ctx.body.domains, 200, "domaines");
      const file = backlinkDisavowFile({ domains });
      return { ...file, note: "Fichier généré depuis la sélection du client, sans appel partenaire ; relisez-le avant import dans Search Console.", provenance: "tenant-selection" };
    } },
  ];
}
