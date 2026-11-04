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
import { phase3Routes } from "./phase3.js";

import { str, num, type Body, type ConsoleRoute } from "./util.js";
export type { ConsoleRoute, Handler } from "./util.js";

/** Phase 1 routes: Sitemap, GEO, Performance. */
export const phase1Routes: ConsoleRoute[] = [
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

export function buildConsoleRouter(routes: ConsoleRoute[], options: { config?: OidcConfig | null; jwksLoader?: JwksLoader } = {}): Router {
  const router = express.Router();
  const config = options.config === undefined ? oidcConfigFromEnv() : options.config;
  router.use(requireOidc(config, options.jwksLoader));

  router.get("/me", (_req, res) => {
    const user = (res.locals as { user?: TokenClaims }).user;
    res.json({ username: user?.preferred_username ?? user?.sub, email: user?.email ?? null, roles: user?.realm_access?.roles ?? [], defaults: { url: process.env.CONSOLE_DEFAULT_URL ?? null, property: process.env.CONSOLE_DEFAULT_PROPERTY ?? null } });
  });

  for (const route of routes) {
    router.post(route.path, async (req: Request, res: Response) => {
      const body = (req.body ?? {}) as Body;
      let url = "";
      if (route.needsUrl !== false) {
        const check = await checkTarget(body.url);
        if (!check.ok || !check.url) return res.status(400).json({ error: check.reason ?? "url invalide" });
        url = check.url;
      }
      try {
        const data = await route.handler({ url, body, user: (res.locals as { user?: TokenClaims }).user });
        if (Buffer.isBuffer(data)) return res.type("application/pdf").setHeader("Content-Disposition", "attachment; filename=rapport-geo.pdf").send(data);
        return res.json(data);
      } catch (error) {
        logger.info(`[console] ${route.path} failed: ${(error as Error).message}`);
        return res.status(502).json({ error: (error as Error).message });
      }
    });
  }
  return router;
}

export function allConsoleRoutes(): ConsoleRoute[] {
  return [...phase1Routes, ...phase2Routes, ...phase3Routes];
}

export function mountConsoleApi(app: Express, options: { config?: OidcConfig | null; jwksLoader?: JwksLoader; routes?: ConsoleRoute[] } = {}): void {
  app.use("/api/console", buildConsoleRouter(options.routes ?? allConsoleRoutes(), options));
}
