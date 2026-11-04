import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeGeoReportPdf } from "../src/report/pdf.js";
import type { GeoAuditResult } from "../src/geo/types.js";

const audit = {
  url: "https://example.com",
  finalUrl: "https://example.com/",
  score: 71,
  band: "good",
  scoreBreakdown: {
    robots: 15,
    llms: 12,
    schema: 13,
    meta: 14,
    content: 11,
    brand_entity: 3,
    signals: 3,
    ai_discovery: 0,
  },
  scoreMax: {
    robots: 18,
    llms: 18,
    schema: 16,
    meta: 14,
    content: 12,
    brand_entity: 10,
    signals: 6,
    ai_discovery: 6,
  },
  recoverablePoints: 29,
  projectedScore: 100,
  details: {
    schema: {
      foundTypes: ["Organization", "WebSite", "FAQPage"],
      hasArticle: false,
      hasSameAs: false,
      hasDateModified: false,
    },
  },
  recommendations: [
    { priority: "high", category: "robots", checkId: "robots.citation_bots", points: 3, action: "Add explicit User-agent rules for the citation bots." },
    { priority: "medium", category: "schema", checkId: "schema.article", points: 3, action: "Add Article schema with author and dates." },
  ],
} as unknown as GeoAuditResult;

const platforms = [
  {
    id: "chatgpt" as const,
    label: "ChatGPT",
    score: 100,
    band: "ready" as const,
    signals: [],
    mainGap: "No blocking gap found",
  },
  {
    id: "perplexity" as const,
    label: "Perplexity",
    score: 65,
    band: "partial" as const,
    signals: [],
    mainGap: "Outbound citations",
  },
];

const citability = {
  url: "https://example.com",
  score: 53,
  points: 19,
  max: 36,
  methods: [
    { id: "citability.statistics", label: "Concrete statistics", points: 3, max: 3, evidence: "17 numeric tokens" },
    { id: "citability.quotations", label: "Quotable passages", points: 0, max: 3, evidence: "0 blockquotes" },
  ],
  strengths: ["Concrete statistics"],
  gaps: ["Quotable passages"],
};

describe("PDF report", () => {
  it("writes a multi-page PDF with the cover, tables and plan", async () => {
    const out = path.join(os.tmpdir(), `geo-report-${Date.now()}.pdf`);
    const result = await writeGeoReportPdf({
      audit,
      platforms: platforms as never,
      citability: citability as never,
      outPath: out,
      contactUrl: "https://example.com/contact",
    });

    // cover, dashboard, console guide, summary, categories, platforms, entity graph,
    // citability, plan, marketing plays, limits
    expect(result.pages).toBe(11);
    expect(result.bytes).toBeGreaterThan(8000);
    const bytes = fs.readFileSync(out);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");

    fs.unlinkSync(out);
  });

  it("still produces a report without platforms or citability", async () => {
    const out = path.join(os.tmpdir(), `geo-report-min-${Date.now()}.pdf`);
    const result = await writeGeoReportPdf({ audit, outPath: out });
    // without platforms, citability or schema details the two optional pages drop out
    expect(result.pages).toBeGreaterThanOrEqual(8);
    expect(fs.existsSync(out)).toBe(true);
    fs.unlinkSync(out);
  });
});
