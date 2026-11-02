import { CATEGORY_MAX } from "./config.js";
import type { GeoCategory } from "./config.js";
import { HtmlDoc } from "./html.js";
import { fetchQuiet, fetchText } from "./http.js";
import type { Fetcher, FetchResult } from "./http.js";
import { auditAiDiscovery } from "./audit/ai-discovery.js";
import { auditBrand } from "./audit/brand.js";
import { auditContent } from "./audit/content.js";
import { auditLlms } from "./audit/llms.js";
import { auditMeta } from "./audit/meta.js";
import { auditRobots } from "./audit/robots.js";
import { auditSchema } from "./audit/schema.js";
import { auditSignals } from "./audit/signals.js";
import { bandOf, buildRecommendations, computeBreakdown, scoreOf } from "./score.js";
import type { GeoAuditResult } from "./types.js";

export interface GeoAuditOptions {
  url: string;
  fetcher?: Fetcher;
  timeoutMs?: number;
  /** Skip the /ai/*.json probes when the site is known not to publish them. */
  includeAiDiscovery?: boolean;
}

/** Normalize user input into an absolute http(s) URL. */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("url is required");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withScheme);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }
  return parsed.toString();
}

function rootUrl(base: string, path: string): string {
  return new URL(path, new URL(base).origin).toString();
}

function emptyDetails(baseUrl: string) {
  const doc = HtmlDoc.parse("");
  const schema = auditSchema(doc).data;
  const meta = auditMeta(doc, {}).data;
  const content = auditContent(doc, baseUrl).data;
  const signals = auditSignals(doc, schema).data;
  const brand = auditBrand(doc, schema, meta, content).data;
  const nullResponse = { status: 0, body: null };
  return {
    robots: auditRobots(null, 0).data,
    llms: auditLlms(null, 0, null).data,
    schema,
    meta,
    content,
    signals,
    brand_entity: brand,
    ai_discovery: auditAiDiscovery({
      wellKnownAi: nullResponse,
      summary: nullResponse,
      faq: nullResponse,
      service: nullResponse,
    }).data,
  };
}

/**
 * Run the full GEO audit for one page: the page itself plus every artifact an
 * AI crawler reads before citing it (robots.txt, llms.txt, AI discovery).
 */
export async function runGeoAudit(options: GeoAuditOptions): Promise<GeoAuditResult> {
  const started = Date.now();
  const fetcher = options.fetcher ?? fetchText;
  const baseUrl = normalizeUrl(options.url);

  const page = await fetchQuiet(fetcher, baseUrl, { timeoutMs: options.timeoutMs });

  if (!page) {
    return {
      url: baseUrl,
      finalUrl: baseUrl,
      httpStatus: 0,
      pageSize: 0,
      durationMs: Date.now() - started,
      score: 0,
      band: "critical",
      recoverablePoints: 0,
      projectedScore: 0,
      scoreBreakdown: Object.fromEntries(
        Object.keys(CATEGORY_MAX).map((category) => [category, 0])
      ) as Record<GeoCategory, number>,
      scoreMax: { ...CATEGORY_MAX },
      checks: [],
      recommendations: [
        {
          priority: "critical",
          category: "blockers",
          checkId: "audit.fetch",
          points: 0,
          action: `Unable to reach ${baseUrl}. Check the URL, DNS and any WAF that blocks non-browser user agents.`,
        },
      ],
      details: emptyDetails(baseUrl),
      error: `Unable to reach ${baseUrl}`,
    };
  }

  if (page.status !== 200 && page.status !== 203) {
    return {
      url: baseUrl,
      finalUrl: page.url,
      httpStatus: page.status,
      pageSize: page.body.length,
      durationMs: Date.now() - started,
      score: 0,
      band: "critical",
      recoverablePoints: 0,
      projectedScore: 0,
      scoreBreakdown: Object.fromEntries(
        Object.keys(CATEGORY_MAX).map((category) => [category, 0])
      ) as Record<GeoCategory, number>,
      scoreMax: { ...CATEGORY_MAX },
      checks: [],
      recommendations: [
        {
          priority: "critical",
          category: "blockers",
          checkId: "audit.http_status",
          points: 0,
          action: `The page returned HTTP ${page.status}. Fix the server response (or the WAF rule) before auditing content.`,
        },
      ],
      details: emptyDetails(baseUrl),
      error: `HTTP ${page.status}`,
    };
  }

  const doc = HtmlDoc.parse(page.body);
  const schemaResult = auditSchema(doc);
  const metaResult = auditMeta(doc, page.headers);
  const contentResult = auditContent(doc, page.url);
  const signalsResult = auditSignals(doc, schemaResult.data);
  const brandResult = auditBrand(doc, schemaResult.data, metaResult.data, contentResult.data);

  const includeAiDiscovery = options.includeAiDiscovery !== false;
  const [robotsRes, llmsRes, llmsFullRes, wellKnown, summary, faq, service] =
    await Promise.all([
      fetchQuiet(fetcher, rootUrl(baseUrl, "/robots.txt"), {
        timeoutMs: options.timeoutMs,
        accept: "text/plain,*/*",
      }),
      fetchQuiet(fetcher, rootUrl(baseUrl, "/llms.txt"), {
        timeoutMs: options.timeoutMs,
        accept: "text/plain,*/*",
      }),
      fetchQuiet(fetcher, rootUrl(baseUrl, "/llms-full.txt"), {
        timeoutMs: options.timeoutMs,
        accept: "text/plain,*/*",
      }),
      includeAiDiscovery
        ? fetchQuiet(fetcher, rootUrl(baseUrl, "/.well-known/ai.txt"), {
            timeoutMs: options.timeoutMs,
          })
        : Promise.resolve(null),
      includeAiDiscovery
        ? fetchQuiet(fetcher, rootUrl(baseUrl, "/ai/summary.json"), {
            timeoutMs: options.timeoutMs,
          })
        : Promise.resolve(null),
      includeAiDiscovery
        ? fetchQuiet(fetcher, rootUrl(baseUrl, "/ai/faq.json"), {
            timeoutMs: options.timeoutMs,
          })
        : Promise.resolve(null),
      includeAiDiscovery
        ? fetchQuiet(fetcher, rootUrl(baseUrl, "/ai/service.json"), {
            timeoutMs: options.timeoutMs,
          })
        : Promise.resolve(null),
    ]);

  const robotsResult = auditRobots(
    robotsRes?.status === 200 ? robotsRes.body : null,
    robotsRes?.status ?? 0
  );
  const llmsResult = auditLlms(
    llmsRes?.status === 200 ? llmsRes.body : null,
    llmsRes?.status ?? 0,
    llmsFullRes?.status === 200 ? llmsFullRes.body : null
  );
  const discoveryResult = auditAiDiscovery({
    wellKnownAi: toEndpoint(wellKnown),
    summary: toEndpoint(summary),
    faq: toEndpoint(faq),
    service: toEndpoint(service),
  });

  const checks = [
    ...robotsResult.checks,
    ...llmsResult.checks,
    ...schemaResult.checks,
    ...metaResult.checks,
    ...contentResult.checks,
    ...signalsResult.checks,
    ...brandResult.checks,
    ...discoveryResult.checks,
  ];

  const scoreBreakdown = computeBreakdown(checks);
  const score = scoreOf(scoreBreakdown);
  const recoverablePoints = checks
    .filter((check) => check.max > check.earned)
    .reduce((sum, check) => sum + (check.max - check.earned), 0);
  const projectedScore = Math.min(100, score + recoverablePoints);

  return {
    url: baseUrl,
    finalUrl: page.url,
    httpStatus: page.status,
    pageSize: page.body.length,
    durationMs: Date.now() - started,
    score,
    band: bandOf(score),
    recoverablePoints,
    projectedScore,
    scoreBreakdown,
    scoreMax: { ...CATEGORY_MAX },
    checks,
    recommendations: buildRecommendations(checks),
    details: {
      robots: robotsResult.data,
      llms: llmsResult.data,
      schema: schemaResult.data,
      meta: metaResult.data,
      content: contentResult.data,
      signals: signalsResult.data,
      brand_entity: brandResult.data,
      ai_discovery: discoveryResult.data,
    },
  };
}

function toEndpoint(result: FetchResult | null): { status: number; body: string | null } {
  if (!result) return { status: 0, body: null };
  return { status: result.status, body: result.body };
}
