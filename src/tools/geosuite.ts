/**
 * GeoSuite toolkit tools — the two capabilities this repo did not have.
 *
 * Source of the checks: the MIT-licensed GeoSuite toolkit
 * (https://github.com/TryGeoSuite/geo-toolkit and .../poppy-json,
 * © 2026 Matteo Perino and GeoSuite). Their AI Crawl Check, llms.txt generator
 * and schema templates already exist here as geo_crawler_access,
 * geo_generate_llms_txt and geo_generate_schema; poppy and the sitemap builder
 * are new ports.
 */

import { z } from "zod";
import { probePoppy, generatePoppy } from "../geosuite/poppy.js";
import { buildSitemap } from "../geosuite/sitemap-builder.js";
import { success, fail } from "./response.js";
import { strict } from "./schema.js";

export const geoSuiteTools = [
  {
    name: "poppy_check",
    description:
      "Check /.well-known/poppy.json (Personal Agent Protocol draft 0.3) the way a personal agent reads it: file present, protocol version, organization domain against the serving host, channels, and the OAuth discovery chain when sign-in is offered. Ported from GeoSuite's MIT poppy-json checker. Read-only.",
    schema: strict({
      url: z.string(),
    }),
    handler: async (args: any) => {
      try {
        const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(args.url) ? args.url : `https://${args.url}`).hostname;
        return success(await probePoppy(host));
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "poppy_generate",
    description:
      "Generate a valid poppy.json for a domain, plus the two OAuth documents an agent needs when sign-in is offered (RFC 9728 protected-resource metadata and RFC 8414 issuer metadata). Returns the JSON bodies and the exact URLs to serve them at. Ported from GeoSuite's MIT poppy-json generator.",
    schema: strict({
      name: z.string(),
      domain: z.string(),
      issuer: z.string().optional(),
      signIn: z.array(z.enum(["direct", "device", "mediated"])).optional(),
      mcp: z.array(z.string()).optional(),
      openapi: z.array(z.string()).optional(),
      agent: z.string().optional(),
      browser: z.string().optional(),
    }),
    handler: async (args: any) => {
      try {
        return success(generatePoppy(args));
      } catch (err) {
        return fail(err);
      }
    },
  },
  {
    name: "geo_sitemap_build",
    description:
      "Build a sitemap.xml by crawling a site from its homepage: same host only, assets and admin paths skipped, robots.txt honoured, hard caps on pages. Ported from GeoSuite's MIT sitemap-builder. Returns the XML, the URLs kept, what was skipped and why.",
    schema: strict({
      url: z.string(),
      maxUrls: z.number().optional(),
    }),
    handler: async (args: any) => {
      try {
        return success(await buildSitemap({ url: args.url, maxUrls: args.maxUrls }));
      } catch (err) {
        return fail(err);
      }
    },
  },
];
