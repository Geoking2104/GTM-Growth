import { z } from "zod";
import { runGeoAudit } from "../geo/audit.js";
import { runSiteGeoAudit, collectSitemapEntries } from "../geo/site.js";
import { generateLlmsTxt } from "../geo/generate/llms.js";
import { generateJsonLd, renderJsonLdScript } from "../geo/generate/schema.js";
import { generateRobotsFix } from "../geo/generate/robots.js";
import { fetchText } from "../geo/http.js";
import { summarizeAudit } from "../geo/report.js";
import { runEeatAudit } from "../geo/audit/eeat.js";
import { runCitability } from "../geo/citability.js";
import { getCrawlerAccess } from "../geo/crawlers.js";
import { checkLlmsDrift } from "../geo/drift.js";
import { runContentRiskScan } from "../geo/risks.js";
import { analyzePositioning } from "../geo/positioning.js";
import { buildPlatformReadiness } from "../geo/platforms.js";
import { success, fail } from "./response.js";
import { strict } from "./schema.js";

export const geoTools = [
  {
    name: "geo_audit",
    description:
      "GEO/AEO readiness audit for one URL, scored 0-100 across 8 categories (robots.txt, llms.txt, schema, meta, content, brand, signals, AI discovery). Returns the per-category breakdown, every check with its evidence, and prioritized fixes ordered by recoverable points. Read-only: fetches the same public URLs an AI crawler reads.",
    schema: strict({
      url: z.string(),
      includeAiDiscovery: z.boolean().optional(),
    }),
    handler: async (args: any) => {
      try {
        const result = await runGeoAudit({
          url: args.url,
          includeAiDiscovery: args.includeAiDiscovery,
        });
        return success(summarizeAudit(result));
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "geo_audit_sitemap",
    description:
      "Audit a sample of pages from a site's sitemap (robots.txt sitemap first). Reports the average GEO score, the weakest pages with their top fixes, and the checks failing across most of the site — so one strong homepage cannot hide a site-wide gap. Keep maxUrls small (default 10).",
    schema: strict({
      url: z.string(),
      sitemapUrl: z.string().optional(),
      maxUrls: z.number().optional(),
    }),
    handler: async (args: any) => {
      try {
        return success(
          await runSiteGeoAudit({
            url: args.url,
            sitemapUrl: args.sitemapUrl,
            maxUrls: args.maxUrls,
          })
        );
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "geo_generate_llms_txt",
    description:
      "Generate an llms.txt from the site's sitemap: H1, blockquote summary, H2 sections and markdown links ordered by sitemap priority. Returns the file content ready to deploy at /llms.txt. Read-only — it does not write to the site.",
    schema: strict({
      url: z.string(),
      sitemapUrl: z.string().optional(),
      siteName: z.string().optional(),
      description: z.string().optional(),
      maxLinksPerSection: z.number().optional(),
    }),
    handler: async (args: any) => {
      try {
        const collected = await collectSitemapEntries({
          url: args.url,
          sitemapUrl: args.sitemapUrl,
        });
        const content = generateLlmsTxt({
          baseUrl: collected.sitemapUrl
            ? new URL(collected.sitemapUrl).origin
            : new URL(args.url.startsWith("http") ? args.url : `https://${args.url}`).origin,
          entries: collected.entries,
          siteName: args.siteName,
          description: args.description,
          maxLinksPerSection: args.maxLinksPerSection,
        });
        return success({
          sitemapUrl: collected.sitemapUrl,
          entriesFound: collected.entries.length,
          deployTo: "/llms.txt",
          content,
        });
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "geo_generate_schema",
    description:
      "Generate JSON-LD for the types that earn GEO points (website, organization, faq, article, product, localbusiness), plus the ready-to-paste <script> tag. Returns rich templates (5+ attributes) rather than generic name+url markup.",
    schema: strict({
      kind: z.enum(["website", "organization", "faq", "article", "product", "localbusiness"]),
      name: z.string(),
      url: z.string(),
      description: z.string().optional(),
      logo: z.string().optional(),
      sameAs: z.array(z.string()).optional(),
      author: z.string().optional(),
      headline: z.string().optional(),
      datePublished: z.string().optional(),
      dateModified: z.string().optional(),
      faqs: z
        .array(z.object({ question: z.string(), answer: z.string() }))
        .optional(),
      telephone: z.string().optional(),
      address: z.string().optional(),
      price: z.string().optional(),
      currency: z.string().optional(),
    }),
    handler: async (args: any) => {
      try {
        const schema = generateJsonLd(args);
        return success({ schema, script: renderJsonLdScript(schema) });
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "geo_generate_robots",
    description:
      "Generate the robots.txt rules an AI-citation-ready site needs. Reads the current robots.txt, appends explicit Allow groups for AI crawlers it does not cover, and reports bots that existing rules block (those are never overridden automatically). Read-only.",
    schema: strict({
      url: z.string(),
      sitemapUrl: z.string().optional(),
    }),
    handler: async (args: any) => {
      try {
        const base = new URL(args.url.startsWith("http") ? args.url : `https://${args.url}`);
        const robotsUrl = new URL("/robots.txt", base.origin).toString();
        const existingResponse = await fetchText(robotsUrl, { accept: "text/plain,*/*" }).catch(
          () => null
        );
        const existing =
          existingResponse && existingResponse.status === 200 ? existingResponse.body : null;
        const sitemaps = args.sitemapUrl
          ? [args.sitemapUrl]
          : existing
            ? existing
                .split(/\r?\n/)
                .filter((line) => /^sitemap:/i.test(line))
                .map((line) => line.slice(line.indexOf(":") + 1).trim())
            : undefined;

        const fix = generateRobotsFix({
          baseUrl: base.origin,
          existing,
          sitemaps,
        });
        return success({ robotsUrl, ...fix });
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "eeat_audit",
    description: "Evaluate on-page E-E-A-T signals with evidence; these heuristics do not prove quality.",
    schema: strict({ url: z.string() }),
    handler: async (args: any) => {
      try { return success(await runEeatAudit({ url: args.url })); } catch (err) { return fail(err); }
    },
  },
  {
    name: "geo_citability",
    description:
      "Content citability score (0-100) over 12 methods: statistics, quotations, lists/tables, question headings, answer-first, paragraph and sentence length, outbound citations, authorship, freshness, FAQ depth, entity clarity. Separate from the 8-category GEO score; each method returns its own evidence.",
    schema: strict({ url: z.string() }),
    handler: async (args: any) => {
      try {
        return success(await runCitability({ url: args.url }));
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "geo_crawler_access",
    description:
      "Per-bot AI crawler matrix from robots.txt, grouped by tier (training, search, user): allowed, partial, blocked or missing, plus wildcard-only access and blocked citation bots.",
    schema: strict({ url: z.string() }),
    handler: async (args: any) => {
      try {
        return success(await getCrawlerAccess({ url: args.url }));
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "geo_llms_drift",
    description:
      "Compare the deployed /llms.txt against the current sitemap: same-host links that are no longer in the sitemap (stale) and sitemap pages never linked (missing), with a coverage percentage. No per-link HTTP requests, so it is cheap enough to gate a deploy.",
    schema: strict({
      url: z.string(),
      sitemapUrl: z.string().optional(),
      maxUrls: z.number().optional(),
    }),
    handler: async (args: any) => {
      try {
        return success(
          await checkLlmsDrift({
            url: args.url,
            sitemapUrl: args.sitemapUrl,
            maxUrls: args.maxUrls,
          })
        );
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "geo_content_risks",
    description:
      "Defensive scan of your own page for patterns that suppress citation: hidden text, LLM instructions in copy or comments, invisible Unicode, CTA overload, thin content and keyword stuffing. Findings carry a severity and a fix; nothing is executed.",
    schema: strict({ url: z.string() }),
    handler: async (args: any) => {
      try {
        return success(await runContentRiskScan({ url: args.url }));
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "geo_positioning",
    description:
      "On-page competitive positioning: compare your page against 1-5 competitor URLs and report shared vocabulary (undifferentiated), themes unique to you, themes only competitors cover, and a 0-100 overlap score. Uses public page copy only — no rankings, traffic or SERP data.",
    schema: strict({
      url: z.string(),
      competitors: z.array(z.string()).min(1).max(5),
      maxTerms: z.number().optional(),
    }),
    handler: async (args: any) => {
      try {
        return success(
          await analyzePositioning({
            url: args.url,
            competitors: args.competitors,
            maxTerms: args.maxTerms,
          })
        );
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "geo_platform_readiness",
    description:
      "Per-platform readiness for Google AI Overviews, ChatGPT, Perplexity, Gemini and Microsoft Copilot, derived from the GEO audit: score, band, the signals behind it and each engine's main gap.",
    schema: strict({ url: z.string() }),
    handler: async (args: any) => {
      try {
        const audit = await runGeoAudit({ url: args.url });
        return success({
          url: audit.url,
          score: audit.score,
          projectedScore: audit.projectedScore,
          platforms: buildPlatformReadiness(audit),
        });
      } catch (err) { return fail(err); }
    },
  },
];
