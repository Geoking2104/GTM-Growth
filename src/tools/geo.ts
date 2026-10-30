import { z } from "zod";
import { runGeoAudit } from "../geo/audit.js";
import { runSiteGeoAudit, collectSitemapEntries } from "../geo/site.js";
import { generateLlmsTxt } from "../geo/generate/llms.js";
import { generateJsonLd, renderJsonLdScript } from "../geo/generate/schema.js";
import { generateRobotsFix } from "../geo/generate/robots.js";
import { fetchText } from "../geo/http.js";
import { summarizeAudit } from "../geo/report.js";
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
];
