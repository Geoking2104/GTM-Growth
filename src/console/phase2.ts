/** Phase 2 console routes: Search (GSC live), keyword opportunities, calculators, PDF export. */

import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { querySearchAnalytics, inspectUrl } from "../google/search-console.js";
import { runGeoAudit } from "../geo/audit.js";
import { buildPlatformReadiness } from "../geo/platforms.js";
import { runCitability } from "../geo/citability.js";
import { writeGeoReportPdf } from "../report/pdf.js";
import { clusterQueries, ctrTable, losingPages, scoreOpportunities, seoBudget, seoRoi, trafficValue } from "./keywords.js";
import { str, num, type ConsoleRoute } from "./util.js";
import { saveTenantReport } from "../tenants/data.js";
const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
/** GSC data lags ~2–3 days. */
const LAG = 3;

/** Property already checked against the tenant by the router; defaults to the tenant's first one. */
export function propertyOf(body: Record<string, unknown>): string {
  const p = str(body.property);
  if (!p) throw new Error("Propriété Search Console requise (ex. sc-domain:exemple.fr ou https://www.exemple.fr/).");
  return p;
}

const n = (v: unknown, d = 0) => num(v, d, 0, 1e12);

export const phase2Routes: ConsoleRoute[] = [
  {
    path: "/search/queries", needsUrl: false,
    handler: async ({ body }) => {
      const days = num(body.days, 28, 1, 480);
      const { rows } = await querySearchAnalytics({ siteUrl: propertyOf(body), startDate: day(days + LAG), endDate: day(LAG), dimensions: ["query"], rowLimit: num(body.rowLimit, 250, 1, 5000) });
      return { period: { start: day(days + LAG), end: day(LAG) }, rows: rows.map((r) => ({ query: r.keys?.[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })) };
    },
  },
  {
    path: "/search/trends", needsUrl: false,
    handler: async ({ body }) => {
      const days = num(body.days, 90, 7, 480);
      const { rows } = await querySearchAnalytics({ siteUrl: propertyOf(body), startDate: day(days + LAG), endDate: day(LAG), dimensions: ["date"], rowLimit: 500 });
      return { rows: rows.map((r) => ({ date: r.keys?.[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })) };
    },
  },
  {
    path: "/search/losing-pages", needsUrl: false,
    handler: async ({ body }) => {
      const days = num(body.days, 28, 7, 240);
      const siteUrl = propertyOf(body);
      const [cur, prev] = await Promise.all([
        querySearchAnalytics({ siteUrl, startDate: day(days + LAG), endDate: day(LAG), dimensions: ["page"], rowLimit: 1000 }),
        querySearchAnalytics({ siteUrl, startDate: day(2 * days + LAG), endDate: day(days + LAG + 1), dimensions: ["page"], rowLimit: 1000 }),
      ]);
      return { period: days, pages: losingPages(cur.rows, prev.rows) };
    },
  },
  {
    path: "/search/inspect", needsUrl: false,
    handler: async ({ body }) => {
      const inspectionUrl = str(body.inspectUrl) ?? str(body.url);
      if (!inspectionUrl) throw new Error("URL à inspecter requise.");
      return inspectUrl({ siteUrl: propertyOf(body), inspectionUrl, languageCode: "fr-FR" });
    },
  },
  {
    path: "/keywords/opportunities", needsUrl: false,
    handler: async ({ body }) => {
      const days = num(body.days, 28, 7, 480);
      const { rows } = await querySearchAnalytics({ siteUrl: propertyOf(body), startDate: day(days + LAG), endDate: day(LAG), dimensions: ["query", "page"], rowLimit: 5000 });
      const opportunities = scoreOpportunities(rows, { targetPosition: num(body.targetPosition, 3, 1, 10), minImpressions: num(body.minImpressions, 20, 0, 1e6) });
      return { opportunities: opportunities.slice(0, 200), clusters: clusterQueries(opportunities).slice(0, 50) };
    },
  },
  { path: "/calc/ctr", needsUrl: false, handler: async () => ({ curve: ctrTable(), source: "Moyennes publiques du secteur, à titre indicatif" }) },
  { path: "/calc/traffic-value", needsUrl: false, handler: async ({ body }) => trafficValue({ searchVolume: n(body.searchVolume), position: num(body.position, 1, 1, 100), clicks: body.clicks ? n(body.clicks) : undefined, cpc: n(body.cpc) }) },
  { path: "/calc/roi", needsUrl: false, handler: async ({ body }) => seoRoi({ monthlyTraffic: n(body.monthlyTraffic), conversionRate: n(body.conversionRate), averageOrderValue: n(body.averageOrderValue), margin: num(body.margin, 100, 0, 100), monthlyCost: n(body.monthlyCost) }) },
  { path: "/calc/budget", needsUrl: false, handler: async ({ body }) => seoBudget({ targetRevenue: n(body.targetRevenue), conversionRate: n(body.conversionRate), averageOrderValue: n(body.averageOrderValue), costPerVisit: n(body.costPerVisit) }) },
  {
    path: "/report/pdf",
    handler: async ({ url, body, tenancy }) => {
      const audit = await runGeoAudit({ url });
      const citability = await runCitability({ url }).catch(() => undefined);
      const outPath = join(tmpdir(), `gtm-console-${randomUUID()}.pdf`);
      await writeGeoReportPdf({ audit, platforms: buildPlatformReadiness(audit), citability, outPath, brandName: str(body.brandName) });
      try {
        const pdf = await readFile(outPath);
        if (tenancy?.tenant) saveTenantReport(tenancy.tenant.id, url, pdf);
        return pdf;
      } finally { await unlink(outPath).catch(() => undefined); }
    },
  },
];
