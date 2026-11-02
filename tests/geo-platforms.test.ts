import { describe, expect, it } from "vitest";
import { buildPlatformReadiness } from "../src/geo/platforms.js";
import { geoTools } from "../src/tools/geo.js";
import { tools } from "../src/tools/index.js";
import type { GeoAuditResult } from "../src/geo/types.js";

const ALL_BOTS = [
  "Googlebot",
  "OAI-SearchBot",
  "PerplexityBot",
  "Bingbot",
  "GPTBot",
  "ClaudeBot",
  "Applebot",
];

function auditWith(overrides: { allowed?: string[] } = {}): GeoAuditResult {
  return {
    details: {
      robots: {
        found: true,
        status: 200,
        botsAllowed: overrides.allowed ?? ALL_BOTS,
        botsBlocked: [],
        botsMissing: [],
        botsPartial: [],
        crawlDelay: null,
        sitemaps: [],
        citationBotsOk: true,
        citationBotsExplicit: true,
        groups: {},
      },
      schema: {
        hasOrganization: true,
        hasWebsite: true,
        hasFaq: true,
        hasArticle: true,
        foundTypes: ["Organization", "WebSite", "FAQPage", "Article"],
        sameAsUrls: ["https://wikipedia.org/wiki/Acme"],
      },
      content: {
        hasHeadingHierarchy: true,
        hasListsOrTables: true,
        hasFrontLoading: true,
        numbersCount: 6,
        headingCount: 8,
        externalLinksCount: 4,
      },
      llms: { found: true, wordCount: 600, linksCount: 12 },
      signals: { freshnessDate: "2026-09-01" },
      brand_entity: { kgPillarCount: 3, brandNameConsistent: true },
    },
  } as unknown as GeoAuditResult;
}

describe("platform readiness", () => {
  it("scores all five platforms ready when every signal passes", () => {
    const platforms = buildPlatformReadiness(auditWith());
    expect(platforms.map((platform) => platform.id)).toEqual([
      "google_aio",
      "chatgpt",
      "perplexity",
      "gemini",
      "copilot",
    ]);
    for (const platform of platforms) {
      expect(platform.score).toBe(100);
      expect(platform.band).toBe("ready");
      expect(platform.mainGap).toMatch(/No blocking gap/);
    }
  });

  it("names the blocked bot as the main gap", () => {
    const platforms = buildPlatformReadiness(auditWith({ allowed: [] }));
    const chatgpt = platforms.find((platform) => platform.id === "chatgpt");
    expect(chatgpt?.score).toBe(75);
    expect(chatgpt?.band).toBe("partial");
    expect(chatgpt?.mainGap).toMatch(/OAI-SearchBot/);
    expect(chatgpt?.signals.find((signal) => signal.id === "oai_search")?.fix).toMatch(/robots/);
  });

  it("keeps each platform's weights at 100", () => {
    for (const platform of buildPlatformReadiness(auditWith())) {
      expect(platform.signals.reduce((sum, signal) => sum + signal.max, 0)).toBe(100);
    }
  });

  it("is exposed as a GEO tool and through the server", () => {
    expect(geoTools.map((tool) => tool.name)).toContain("geo_platform_readiness");
    expect(tools.map((tool) => tool.name)).toContain("geo_platform_readiness");
  });
});
