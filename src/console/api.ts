/**
 * Console API — /api/console/* — protected by Keycloak (OIDC bearer tokens).
 *
 * Every route takes JSON with a `url` (the domain or page to analyse) and, for
 * Google-backed routes, an optional `property` (Search Console siteUrl such as
 * "sc-domain:kayroslab.com"). Targets go through the same SSRF guard as the
 * public free read.
 */

import express, { type Express, type Request, type Response, type Router } from "express";
import { checkTarget } from "../http/public-api.js";
import { requireOidc, oidcConfigFromEnv, type JwksLoader, type OidcConfig, type TokenClaims } from "./auth.js";
import { TenantStore, TenantConflictError, normalizeHost, tenantOwnsProperty, tenantOwnsUrl, tenantOwnsGa4, tenantOwnsBingSite, tenantOwnsGtmContainer, type Tenant } from "../tenants/store.js";
import { resolveTenant, TenantAccessError, type TenantContext } from "../tenants/context.js";
import { tenantLeads, listTenantReports, readTenantReport } from "../tenants/data.js";
import { KeycloakAdmin, keycloakAdminFromEnv } from "../tenants/keycloak-admin.js";
import { inviteUser, provisionTenant, type ProvisionInput } from "../tenants/provision.js";
import { collectSitemapEntries, runSiteGeoAudit } from "../geo/site.js";
import { buildSitemapMap } from "../freeread/sitemap-map.js";
import { buildSitemap } from "../geosuite/sitemap-builder.js";
import { runCitability } from "../geo/citability.js";
import { generateLlmsTxt } from "../geo/generate/llms.js";
import { auditLlms } from "../geo/audit/llms.js";
import { checkLlmsDrift } from "../geo/drift.js";
import { auditRobots } from "../geo/audit/robots.js";
import { generateRobotsFix } from "../geo/generate/robots.js";
import { extractSitemaps } from "../geo/robots.js";
import { auditSchema } from "../geo/audit/schema.js";
import { HtmlDoc } from "../geo/html.js";
import { fetchQuiet, fetchText } from "../geo/http.js";
import { runPagespeed } from "../google/pagespeed.js";
import { queryCrux } from "../google/crux.js";
import { measurePageWeight } from "./weight.js";
import { logger } from "../utils/logger.js";
import { phase2Routes } from "./phase2.js";
import { runGeoAudit } from "../geo/audit.js";
import { buildPlatformReadiness } from "../geo/platforms.js";
import { auditIndexNow } from "../indexnow/readiness.js";
import { buildAnalysisBoard } from "../analysis/board.js";
import { phase3Routes } from "./phase3.js";
import { aiVisibilityRoutes } from "./ai-visibility.js";
import { aiConnectionRoutes } from "./ai-connections.js";
import { aiProviderRoutes } from "./ai-visibility-providers.js";
import { competitionRoutes } from "./competition.js";
import { operationsRoutes } from "./ops-routes.js";
import { analyticsRoutes } from "./analytics.js";
import { gtmRoutes } from "./gtm-console.js";
import { localSeoRoutes } from "./local-seo.js";
import { applyPreviewRoutes } from "./apply-routes.js";
import { withCredential } from "../auth/service-account.js";
import { fetchPublicPage } from "../http/public-fetch.js";
import { analyzePositioning } from "../geo/positioning.js";
import { extractOnboardingProfile } from "./onboarding-profile.js";
import { visualCatalogRoutes } from "./visual-catalog.js";
import { dataAgentRoutes } from "./data-agent.js";

import { str, num, type Body, type ConsoleRoute } from "./util.js";
export type { ConsoleRoute, Handler } from "./util.js";

/** Phase 1 routes: Sitemap, GEO, Performance. */
export const phase1Routes: ConsoleRoute[] = [
  {
    path: "/onboarding/profile",
    // Démarrage guidé : profil de marque lu sur la page d'accueil. Nom depuis le
    // JSON-LD en priorité (avec la source), puis og:site_name ; description depuis
    // la meta, puis og:description, puis le schema ; langue et types détectés.
    handler: async ({ url }) => {
      const page = await fetchPublicPage(url);
      if (!page.ok) throw new Error(`HTTP ${page.status}`);
      return { profile: extractOnboardingProfile(HtmlDoc.parse(page.body), page.url, page.status) };
    },
  },
  {
    path: "/geo/positioning",
    handler: async ({ url, body }) => {
      const competitors = body.competitors;
      if (!Array.isArray(competitors) || competitors.length < 1 || competitors.length > 5 || competitors.some((item) => typeof item !== "string" || item.length > 2048)) throw new Error("Provide 1 to 5 competitor URLs");
      return analyzePositioning({ url, competitors, fetcher: fetchPublicPage });
    },
  },
  {
    // Vue d'ensemble : même charge utile que l'outil MCP analysis-board (audit GEO,
    // préparation par moteur, citabilité, IndexNow) pour le tableau de bord de la console.
    path: "/overview",
    handler: async ({ url, body }) => {
      const audit = await runGeoAudit({ url, fetcher: fetchPublicPage });
      const platforms = buildPlatformReadiness(audit);
      const citability = await runCitability({ url: audit.finalUrl, fetcher: fetchPublicPage }).catch(() => undefined);
      const host = new URL(audit.finalUrl).hostname;
      const indexnow = await auditIndexNow({ host, https: audit.finalUrl.startsWith("https:"), audit, key: str(body.indexnowKey) ?? null });
      const board = buildAnalysisBoard({ audit, platforms, citability, indexnow });
      return {
        url: audit.finalUrl, generatedAt: board.generatedAt,
        geo: { score: audit.score, projectedScore: audit.projectedScore, band: audit.band, breakdown: audit.scoreBreakdown, max: audit.scoreMax, recommendations: audit.recommendations },
        platforms: platforms.map((p) => ({ id: p.id, label: p.label, score: p.score, band: p.band, mainGap: p.mainGap })),
        citability: citability ? { score: citability.score, points: citability.points, max: citability.max } : null,
        indexnow, board,
      };
    },
  },
  {
    path: "/sitemap/map",
    handler: async ({ url }) => {
      const collected = await collectSitemapEntries({ url });
      const res = await fetchQuiet(fetchText, collected.sitemapUrl, { accept: "application/xml,text/xml,*/*" });
      return { sitemapUrl: collected.sitemapUrl, entries: collected.entries.length, map: buildSitemapMap(res?.body ?? null, collected.sitemapUrl, new URL(url).hostname) };
    },
  },
  { path: "/sitemap/audit", handler: async ({ url, body }) => runSiteGeoAudit({ url, sitemapUrl: str(body.sitemapUrl), maxUrls: num(body.maxUrls, 10, 1, 25) }) },
  { path: "/sitemap/build", handler: async ({ url, body }) => buildSitemap({ url, maxUrls: num(body.maxUrls, 50, 1, 500) }) },
  { path: "/geo/citability", handler: async ({ url }) => runCitability({ url }) },
  {
    path: "/geo/llms",
    handler: async ({ url, body }) => {
      const origin = new URL(url).origin;
      const [llms, full] = await Promise.all([fetchQuiet(fetchText, `${origin}/llms.txt`), fetchQuiet(fetchText, `${origin}/llms-full.txt`)]);
      const validation = auditLlms(llms?.body ?? null, llms?.status ?? 0, full?.status === 200 ? full.body : null);
      let generated: string | null = null;
      let drift: unknown = null;
      try {
        const collected = await collectSitemapEntries({ url: origin });
        generated = generateLlmsTxt({ baseUrl: origin, entries: collected.entries, siteName: str(body.siteName), description: str(body.description) });
      } catch (error) {
        generated = null;
        logger.info(`[console] llms generate: ${(error as Error).message}`);
      }
      try { drift = await checkLlmsDrift({ url: origin }); } catch (error) { drift = { error: (error as Error).message }; }
      return { llmsUrl: `${origin}/llms.txt`, validation, generated, drift };
    },
  },
  {
    path: "/geo/robots",
    handler: async ({ url }) => {
      const origin = new URL(url).origin;
      const robots = await fetchQuiet(fetchText, `${origin}/robots.txt`);
      const body = robots?.status === 200 ? robots.body : null;
      return { robotsUrl: `${origin}/robots.txt`, audit: auditRobots(body, robots?.status ?? 0), fix: generateRobotsFix({ baseUrl: origin, existing: body, sitemaps: body ? extractSitemaps(body) : [] }) };
    },
  },
  {
    path: "/geo/schema",
    handler: async ({ url }) => {
      const page = await fetchQuiet(fetchText, url);
      if (!page) throw new Error(`Impossible de joindre ${url}`);
      return { url: page.url, status: page.status, audit: auditSchema(HtmlDoc.parse(page.body)) };
    },
  },
  {
    path: "/performance/pagespeed",
    handler: async ({ url, body }) => runPagespeed({ url, strategy: body.strategy === "desktop" ? "desktop" : "mobile", locale: "fr" }),
  },
  {
    path: "/performance/crux",
    handler: async ({ url, body }) => {
      const formFactor = (["PHONE", "DESKTOP", "TABLET", "ALL_FORM_FACTORS"] as const).find((f) => f === body.formFactor);
      return body.scope === "url" ? queryCrux({ url, formFactor }) : queryCrux({ origin: new URL(url).origin, formFactor });
    },
  },
  { path: "/performance/weight", handler: async ({ url, body }) => measurePageWeight(url, { maxResources: num(body.maxResources, 60, 1, 150) }) },
];

export interface ConsoleOptions {
  config?: OidcConfig | null;
  jwksLoader?: JwksLoader;
  routes?: ConsoleRoute[];
  store?: TenantStore;
  keycloakAdmin?: KeycloakAdmin | null;
}

type Locals = { user?: TokenClaims; tenancy?: TenantContext };

const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });

export function withTrust(config: OidcConfig | null, store: TenantStore): OidcConfig | null {
  if (!config) return null;
  return { ...config, trustIssuer: (iss) => Boolean(store.byIssuer(iss)?.status === "active") || Boolean(config.trustIssuer?.(iss)) };
}

/** Tenant resolution middleware (after token verification). */
export function tenancyMiddleware(config: OidcConfig | null, store: TenantStore) {
  return (req: Request, res: Response, next: () => void) => {
    const locals = res.locals as Locals;
    const requested = str(req.headers["x-tenant"]);
    try {
      locals.tenancy = resolveTenant(locals.user ?? {}, store, config?.issuer ?? "", requested);
      return next();
    } catch (error) {
      return fail(res, error instanceof TenantAccessError ? error.status : 403, (error as Error).message);
    }
  };
}

/** Data scoping: every url / property in the request must belong to the tenant. */
async function scopeRequest(route: ConsoleRoute, body: Body, tenancy: TenantContext): Promise<{ url: string } | { status: number; error: string }> {
  const { tenant, platformAdmin } = tenancy;
  if (!platformAdmin && !tenant) return { status: 403, error: "Aucun tenant sélectionné." };
  if (route.adminOnly && !(platformAdmin || tenancy.role === "tenant-admin")) return { status: 403, error: "Réservé aux administrateurs du tenant." };
  let url = "";
  const wantsUrl = route.needsUrl !== false || str(body.url) !== undefined;
  if (wantsUrl && !(route.needsUrl === false && body.usePage === "non")) {
    // Tenant ownership first (no DNS lookup for foreign domains).
    const raw = str(body.url);
    if (raw && tenant && !platformAdmin && !tenantOwnsUrl(tenant, raw)) return { status: 403, error: `Le domaine ${normalizeHost(raw)} n'appartient pas au tenant ${tenant.id}.` };
    const check = await checkTarget(body.url);
    if (!check.ok || !check.url) {
      if (route.needsUrl !== false) return { status: 400, error: check.reason ?? "url invalide" };
    } else {
      if (tenant && !platformAdmin && !tenantOwnsUrl(tenant, check.url)) return { status: 403, error: `Le domaine ${new URL(check.url).hostname} n'appartient pas au tenant ${tenant.id}.` };
      url = check.url;
    }
  }
  const inspect = str(body.inspectUrl);
  if (inspect && tenant && !platformAdmin && !tenantOwnsUrl(tenant, inspect)) return { status: 403, error: "URL à inspecter hors du périmètre du tenant." };
  const property = str(body.property);
  if (property) {
    if (tenant && !platformAdmin && !tenantOwnsProperty(tenant, property)) return { status: 403, error: `La propriété ${property} n'appartient pas au tenant ${tenant.id}.` };
  } else if (tenant?.gscProperties.length && !route.path.startsWith("/data-agent/")) {
    body.property = tenant.gscProperties[0];
  }
  const ga4 = str(body.ga4Property);
  if (ga4) {
    if (tenant && !platformAdmin && !tenantOwnsGa4(tenant, ga4)) return { status: 403, error: `La propriété GA4 ${ga4} n'appartient pas au tenant ${tenant.id}.` };
  } else if (tenant?.ga4Properties?.length && !route.path.startsWith("/data-agent/")) {
    body.ga4Property = tenant.ga4Properties[0];
  }
  const bingSite = str(body.bingSite);
  if (bingSite) {
    if (tenant && !platformAdmin && !tenantOwnsBingSite(tenant, bingSite)) return { status: 403, error: `Le site Bing ${bingSite} n'appartient pas au tenant ${tenant.id}.` };
  } else if (tenant?.bingSites?.length && !route.path.startsWith("/data-agent/")) {
    body.bingSite = tenant.bingSites[0];
  }
  for (const key of ["container", "workspace", "path"] as const) {
    const v = str(body[key]);
    if (v && v.startsWith("accounts/") && tenant && !platformAdmin && !tenantOwnsGtmContainer(tenant, v)) return { status: 403, error: `Le conteneur GTM ${v} n'appartient pas au tenant ${tenant.id}.` };
  }
  return { url };
}

const publicTenant = (t: Tenant) => ({ id: t.id, name: t.name, mode: t.mode, domains: t.domains, gscProperties: t.gscProperties, ga4Properties: t.ga4Properties ?? [], bingSites: t.bingSites ?? [], gtmContainers: t.gtmContainers ?? [], clarityProjects: t.clarityProjects ?? [], bingKeyConfigured: Boolean(t.bingApiKey), emailDomains: t.emailDomains, branding: t.branding, siteProfiles: t.siteProfiles ?? {}, usageType: t.usageType ?? null, watchedQueries: t.watchedQueries ?? {}, identityProviders: t.identityProviders, status: t.status });

export function buildConsoleRouter(routes: ConsoleRoute[], options: ConsoleOptions = {}): Router {
  const router = express.Router();
  const store = options.store ?? new TenantStore();
  const config = withTrust(options.config === undefined ? oidcConfigFromEnv() : options.config, store);
  const kcAdmin = options.keycloakAdmin === undefined ? (keycloakAdminFromEnv() ? new KeycloakAdmin(keycloakAdminFromEnv()!) : null) : options.keycloakAdmin;
  router.use(requireOidc(config, options.jwksLoader));
  router.use(tenancyMiddleware(config, store));

  router.get("/me", (_req, res) => {
    const { user, tenancy } = res.locals as Locals;
    res.json({
      username: user?.preferred_username ?? user?.sub, email: user?.email ?? null,
      role: tenancy?.role, platformAdmin: tenancy?.platformAdmin ?? false,
      tenant: tenancy?.tenant ? publicTenant(tenancy.tenant) : null,
      memberships: tenancy?.memberships ?? [],
      accountConsole: user?.iss ? `${user.iss}/account/` : null,
    });
  });

  router.get("/leads", (_req, res) => {
    const { tenancy } = res.locals as Locals;
    if (!tenancy?.tenant) return fail(res, 400, "Sélectionnez un tenant.");
    return res.json({ leads: tenantLeads(tenancy.tenant) });
  });
  router.get("/reports", (_req, res) => {
    const { tenancy } = res.locals as Locals;
    if (!tenancy?.tenant) return fail(res, 400, "Sélectionnez un tenant.");
    return res.json({ reports: listTenantReports(tenancy.tenant.id) });
  });
  router.get("/reports/:file", (req, res) => {
    const { tenancy } = res.locals as Locals;
    if (!tenancy?.tenant) return fail(res, 400, "Sélectionnez un tenant.");
    try { return res.type("application/pdf").send(readTenantReport(tenancy.tenant.id, req.params.file)); } catch { return fail(res, 404, "Rapport introuvable."); }
  });

  // Tenant administration (tenant-admin of this tenant, or platform super-admin).
  const isAdmin = (t?: TenantContext) => Boolean(t && (t.platformAdmin || t.role === "tenant-admin"));
  router.put("/tenant/settings", (req, res) => {
    const { tenancy } = res.locals as Locals;
    if (!tenancy?.tenant) return fail(res, 400, "Sélectionnez un tenant.");
    if (!isAdmin(tenancy)) return fail(res, 403, "Réservé aux administrateurs du tenant.");
    const body = (req.body ?? {}) as Body;
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 50) : undefined);
    const branding = (body.branding ?? {}) as Record<string, unknown>;
    const color = str(branding.primaryColor);
    const logo = str(branding.logoUrl);
    if (color && !/^#[0-9a-f]{6}$/i.test(color)) return fail(res, 400, "Couleur invalide (#rrggbb).");
    if (logo && !/^https:\/\//.test(logo)) return fail(res, 400, "Le logo doit être une URL https.");
    const t = tenancy.tenant;
    const ga4List = list(body.ga4Properties)?.map((x) => x.replace(/^properties\//, ""));
    if (ga4List?.some((x) => !/^\d{5,15}$/.test(x))) return fail(res, 400, "Propriété GA4 invalide (identifiant numérique).");
    const gtmList = list(body.gtmContainers);
    if (gtmList?.some((x) => !/^accounts\/\d+\/containers\/\d+$/.test(x))) return fail(res, 400, "Conteneur GTM invalide (accounts/<id>/containers/<id>).");
    if (!tenancy.platformAdmin && gtmList?.some((x) => !(tenancy.tenant?.gtmContainers ?? []).includes(x))) return fail(res, 403, "L’association d’un nouveau conteneur doit être validée par l’administration de la plateforme.");
    const clarityList = list(body.clarityProjects);
    if (clarityList?.some((x) => !/^[a-z0-9]{6,16}$/i.test(x))) return fail(res, 400, "Projet Clarity invalide.");
    const bingList = list(body.bingSites);
    if (bingList?.some((x) => !/^https?:\/\//.test(x))) return fail(res, 400, "Site Bing invalide (URL https://…/).");
    const bingKey = typeof body.bingApiKey === "string" ? body.bingApiKey.trim() : undefined;
    if (bingKey && !/^[A-Za-z0-9]{16,64}$/.test(bingKey)) return fail(res, 400, "Clé API Bing invalide.");
    let usageType = t.usageType;
    if (body.usageType !== undefined) {
      if (body.usageType !== "company" && body.usageType !== "agency") return fail(res, 400, "Usage invalide.");
      usageType = body.usageType;
    }
    let watchedQueries = t.watchedQueries;
    if (body.watchedQueries !== undefined) {
      const selection = body.watchedQueries as Record<string, unknown>;
      if (!selection || typeof selection !== "object" || Array.isArray(selection) || typeof selection.property !== "string" || !t.gscProperties.includes(selection.property) || !Array.isArray(selection.queries) || selection.queries.length > 10 || selection.queries.some((q) => typeof q !== "string" || !q.trim() || q.length > 200)) return fail(res, 400, "Sélection de requêtes invalide.");
      watchedQueries = { ...t.watchedQueries, [selection.property]: [...new Set((selection.queries as string[]).map((q) => q.trim()))] };
    }
    let siteProfiles = t.siteProfiles;
    if (body.siteProfile !== undefined) {
      const profile = body.siteProfile as Record<string, unknown>;
      if (!profile || typeof profile !== "object" || Array.isArray(profile) || typeof profile.domain !== "string" || !t.domains.includes(profile.domain) || [profile.name, profile.description, profile.industry].some((v) => typeof v !== "string") || String(profile.name).length > 200 || String(profile.description).length > 500 || String(profile.industry).length > 200) return fail(res, 400, "Profil du site invalide.");
      siteProfiles = { ...t.siteProfiles, [profile.domain]: { name: String(profile.name).trim(), description: String(profile.description).trim(), industry: String(profile.industry).trim() } };
    }
    let updated: Tenant;
    try { updated = store.upsert({ ...t, usageType, watchedQueries, siteProfiles, ga4Properties: ga4List ?? t.ga4Properties, bingSites: bingList ?? t.bingSites, gtmContainers: gtmList ?? t.gtmContainers, clarityProjects: clarityList ?? t.clarityProjects, bingApiKey: bingKey === undefined ? t.bingApiKey : bingKey || undefined, domains: list(body.domains) ?? t.domains, gscProperties: list(body.gscProperties) ?? t.gscProperties, branding: { ...t.branding, ...(color ? { primaryColor: color } : {}), ...(logo ? { logoUrl: logo } : {}), ...(str(branding.displayName) ? { displayName: str(branding.displayName) } : {}) } }, t); } catch (error) {
      if (error instanceof TenantConflictError) return fail(res, 409, error.message);
      throw error;
    }
    return res.json({ tenant: publicTenant(updated) });
  });
  router.post("/tenant/users", async (req, res) => {
    const { tenancy } = res.locals as Locals;
    if (!tenancy?.tenant) return fail(res, 400, "Sélectionnez un tenant.");
    if (!isAdmin(tenancy)) return fail(res, 403, "Réservé aux administrateurs du tenant.");
    if (!kcAdmin) return fail(res, 503, "Provisionnement Keycloak non configuré.");
    const body = (req.body ?? {}) as Body;
    const email = str(body.email);
    if (!email) return fail(res, 400, "E-mail requis.");
    try {
      const userId = await inviteUser(tenancy.tenant, { email, role: body.role === "tenant-admin" ? "tenant-admin" : "tenant-user" }, { admin: kcAdmin });
      return res.status(201).json({ userId, invited: email });
    } catch (error) { return fail(res, 502, (error as Error).message); }
  });

  for (const route of routes) {
    router.post(route.path, async (req: Request, res: Response) => {
      if (route.path.startsWith("/ai-visibility/accounts") || route.path.startsWith("/data-agent/")) res.setHeader("Cache-Control", "no-store");
      const body = { ...((req.body ?? {}) as Body) };
      const { user, tenancy } = res.locals as Locals;
      const scoped = await scopeRequest(route, body, tenancy!);
      if ("error" in scoped) return fail(res, scoped.status, scoped.error);
      try {
        const data = await withCredential(tenancy?.tenant?.googleCredential, () => route.handler({ url: scoped.url, body, user, tenancy }));
        if (Buffer.isBuffer(data)) return res.type("application/pdf").setHeader("Content-Disposition", "attachment; filename=rapport-geo.pdf").send(data);
        return res.json(data);
      } catch (error) {
        logger.info(`[console] ${route.path} failed: ${(error as Error).message}`);
        return fail(res, error instanceof TenantAccessError ? error.status : 502, (error as Error).message);
      }
    });
  }
  return router;
}

/** Platform API (KayrosLab super-admin): list and provision client tenants. */
export function buildPlatformRouter(options: ConsoleOptions = {}): Router {
  const router = express.Router();
  const store = options.store ?? new TenantStore();
  const config = withTrust(options.config === undefined ? oidcConfigFromEnv() : options.config, store);
  const envAdmin = keycloakAdminFromEnv();
  const kcAdmin = options.keycloakAdmin === undefined ? (envAdmin ? new KeycloakAdmin(envAdmin) : null) : options.keycloakAdmin;
  router.use(requireOidc(config, options.jwksLoader));
  router.use((_req, res, next) => {
    const user = (res.locals as Locals).user;
    if (user?.iss !== config?.issuer || !(user?.realm_access?.roles ?? []).includes("platform-admin")) return fail(res, 403, "Réservé au super-administrateur de la plateforme.");
    return next();
  });
  router.get("/tenants", (_req, res) => res.json({ tenants: store.list().map(publicTenant) }));
  router.post("/tenants", async (req, res) => {
    if (!kcAdmin || !config) return fail(res, 503, "Provisionnement Keycloak non configuré (KEYCLOAK_INTERNAL_URL, KEYCLOAK_ADMIN_CLIENT_ID, KEYCLOAK_ADMIN_CLIENT_SECRET).");
    try {
      const result = await provisionTenant(req.body as ProvisionInput, { admin: kcAdmin, store, publicKeycloakUrl: new URL(config.issuer).origin, consoleDomain: process.env.CONSOLE_DOMAIN });
      return res.status(201).json({ tenant: publicTenant(result.tenant), steps: result.steps });
    } catch (error) { return fail(res, 400, (error as Error).message); }
  });
  return router;
}

/**
 * Public tenant discovery for the login page: by email domain, by subdomain
 * (<id>.gtm.kayroslab.com) or by explicit id. Returns only what the login page
 * needs (issuer, organization alias, branding) — never domains or properties.
 */
export function discoverTenant(store: TenantStore, query: { email?: string; host?: string; tenant?: string }, consoleDomain = process.env.CONSOLE_DOMAIN ?? "gtm.kayroslab.com") {
  let tenant: Tenant | undefined;
  if (query.tenant) tenant = store.get(query.tenant);
  if (!tenant && query.host) {
    const host = query.host.toLowerCase().split(":")[0];
    if (host.endsWith(`.${consoleDomain}`)) tenant = store.get(host.slice(0, -consoleDomain.length - 1));
  }
  if (!tenant && query.email) tenant = store.byEmailDomain(query.email);
  if (!tenant || tenant.status !== "active") return null;
  return { id: tenant.id, name: tenant.branding.displayName ?? tenant.name, mode: tenant.mode, issuer: tenant.issuer, organization: tenant.mode === "organization" ? tenant.id : null, branding: { logoUrl: tenant.branding.logoUrl ?? null, primaryColor: tenant.branding.primaryColor ?? null } };
}

export function allConsoleRoutes(): ConsoleRoute[] {
  return [...phase1Routes, ...phase2Routes, ...phase3Routes, ...analyticsRoutes, ...gtmRoutes, ...aiVisibilityRoutes, ...aiProviderRoutes, ...aiConnectionRoutes, ...competitionRoutes, ...operationsRoutes, ...applyPreviewRoutes, ...localSeoRoutes, ...visualCatalogRoutes, ...dataAgentRoutes];
}

export function mountConsoleApi(app: Express, options: ConsoleOptions = {}): void {
  const store = options.store ?? new TenantStore();
  const opts = { ...options, store };
  const limiter = new Map<string, number[]>();
  app.get("/api/tenants/discover", (req, res) => {
    // Small per-IP limit: discovery must not become a tenant enumeration oracle.
    const ip = req.ip ?? "?"; const now = Date.now();
    const hits = (limiter.get(ip) ?? []).filter((t) => now - t < 60_000); hits.push(now); limiter.set(ip, hits);
    if (hits.length > 20) return fail(res, 429, "Trop de requêtes.");
    const q = { email: str(req.query.email), host: str(req.query.host) ?? req.headers["x-forwarded-host"]?.toString() ?? req.headers.host, tenant: str(req.query.tenant) };
    const found = discoverTenant(store, q);
    return found ? res.json(found) : fail(res, 404, "Aucun espace client trouvé.");
  });
  app.use("/api/platform", buildPlatformRouter(opts));
  app.use("/api/console", buildConsoleRouter(options.routes ?? allConsoleRoutes(), opts));
}
