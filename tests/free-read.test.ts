import { describe, expect, it } from "vitest";
import { runFreeRead } from "../src/freeread/index.js";
import { findTagIds } from "../src/freeread/analytics.js";
import type { FetchResult, Fetcher } from "../src/geo/http.js";

const HTML = `<!doctype html>
<html lang="en">
<head>
  <title>Acme analytics for B2B teams</title>
  <meta name="description" content="Acme measures what search and AI assistants do with your pages, with evidence for every number in the report.">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://acme.com/">
  <meta property="og:title" content="Acme">
  <meta property="og:image" content="https://acme.com/og.png">
  <meta name="google-site-verification" content="abc123">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme","sameAs":["https://www.linkedin.com/company/acme"]}</script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('consent','default',{ad_storage:'denied'})</script>
</head>
<body>
  <h1>Acme</h1>
  <h2>What we measure</h2>
  <p>We measure sessions, clicks and citations across five engines.</p>
  <h2>How it works</h2>
  <ul><li>Read the page</li><li>Score the signals</li><li>Rank the fixes</li></ul>
  <a href="/pricing">Pricing</a>
  <a href="https://developers.google.com/search">Google docs</a>
  <img src="/hero.png" alt="Dashboard">
  <img src="/icon.png">
</body>
</html>`;

const ROBOTS = "User-agent: *\nAllow: /\n\nSitemap: https://acme.com/sitemap.xml\n";
const SITEMAP = `<?xml version="1.0"?><urlset><url><loc>https://acme.com/</loc><lastmod>2026-10-30</lastmod></url><url><loc>https://acme.com/pricing</loc><lastmod>2026-10-29</lastmod></url></urlset>`;

function fakeFetcher(): Fetcher {
  return async (url: string): Promise<FetchResult> => {
    const respond = (body: string, status = 200): FetchResult => ({
      url,
      status,
      ok: status < 400,
      headers: { "content-type": "text/html" },
      body,
    });
    if (url.endsWith("/robots.txt")) return respond(ROBOTS);
    if (url.endsWith("/sitemap.xml")) return respond(SITEMAP);
    if (url.includes("/sitemap_index.xml")) return respond("not found", 404);
    if (url.includes("/llms.txt")) return respond("not found", 404);
    if (url.includes("/ai/") || url.includes("/.well-known/ai.txt")) return respond("not found", 404);
    return respond(HTML);
  };
}

describe("free read", () => {
  it("returns the GEO score and the fixes that move it", async () => {
    const result = await runFreeRead({ url: "https://acme.com/", fetcher: fakeFetcher() });
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.topFixes.length).toBeLessThanOrEqual(3);
    expect(result.scoreVersion).toBe("v1");
    expect(result.v2Evidence.scoringStatus).toBe("not_scored");
    expect(result.v2Measurement.gridVersion).toBe("v2.0.0");
    expect(result.v2Measurement.status).toBe("incomplete");
    expect(result.v2Measurement.score).toBeNull();
    expect(result.v2Measurement.applicableMaximum).toBeGreaterThan(0);
    expect(result.v2Measurement.unknownMaximum).toBeGreaterThan(0);
    expect(result.v2Measurement.unmeasuredControls).toContain("P01");
    expect(result.v2Evidence.categories.rendering).toEqual({ budget: 12, observed: 0, unavailable: 1 });
    expect(result.v2Evidence.categories.jsonld.observed).toBeGreaterThan(0);
    expect(result.v2Evidence.findings.some(f => f.sourceCheckId === "rendering.playwright" && f.status === "unavailable")).toBe(true);
    expect(Object.keys(result.scoreBreakdown)).toHaveLength(8);
    expect(Object.keys(result.scoreMax)).toHaveLength(8);
    expect(Object.values(result.scoreBreakdown).reduce((sum, points) => sum + points, 0)).toBe(result.score);
    expect(Object.values(result.scoreMax).reduce((sum, points) => sum + points, 0)).toBe(100);
    expect(result.headline.find((row) => row.label === "GEO score")?.value).toMatch(/^\d+\/100$/);
  });

  it("includes the SEO tables", async () => {
    const result = await runFreeRead({ url: "https://acme.com/", fetcher: fakeFetcher() });
    const ids = result.tables.map((table) => table.id);
    expect(ids).toContain("seo.meta");
    expect(ids).toContain("seo.content");
    expect(ids).toContain("seo.technical");
    const meta = result.tables.find((table) => table.id === "seo.meta")!;
    expect(meta.sample).toBeFalsy();
    expect(meta.rows.find((row) => row.label === "Title")?.status).toBe("pass");
    expect(meta.rows.find((row) => row.label === "Canonical")?.status).toBe("pass");
  });

  it("includes observed social outbound links in the public URL report", async () => {
    const result = await runFreeRead({ url: "https://acme.com/", fetcher: fakeFetcher() });
    expect(result.scoreVersion).toBe("v1");
    expect(result.socialLinks.outboundProfiles).toEqual([
      expect.objectContaining({ platform: "linkedin", inbound: "not_checked" }),
    ]);
    expect(result.socialLinks.inboundObservationCount).toBe(0);
    const socialTable = result.tables.find(table => table.id === "geo.social");
    expect(socialTable?.rows[0].value).toBe("https://www.linkedin.com/company/acme");
    expect(result.limitations.join(" ")).toContain("not automatically verified");
  });

  it("returns sitemap-only map metrics", async () => {
    const result = await runFreeRead({ url: "https://acme.com/", fetcher: fakeFetcher() });
    expect(result.sitemapMap?.nodeCount).toBe(2);
    expect(result.sitemapMap?.metrics.lastmodCoveragePercent).toBe(100);
    expect(result.sitemapMap?.nodes.map((node) => node.url)).toContain("https://acme.com/pricing");
  });

  it("reads the GA4 and Search Console signals without a Google account", async () => {
    const result = await runFreeRead({ url: "https://acme.com/", fetcher: fakeFetcher() });
    const ga4 = result.tables.find((table) => table.id === "ga4.readiness")!;
    const gsc = result.tables.find((table) => table.id === "gsc.readiness")!;
    expect(ga4.rows.find((row) => row.label === "GA4 measurement IDs")?.value).toBe("G-ABC123XYZ");
    expect(ga4.rows.find((row) => row.label === "Consent mode")?.status).toBe("pass");
    expect(gsc.rows.find((row) => row.label === "Sitemap")?.value).toContain("2 URL");
    expect(gsc.rows.find((row) => row.label === "Indexability")?.status).toBe("pass");
  });

  it("marks traffic reports as sample unless a property is connected", async () => {
    const result = await runFreeRead({ url: "https://acme.com/", fetcher: fakeFetcher() });
    const traffic = result.tables.filter((table) => table.id.endsWith(".traffic"));
    expect(traffic).toHaveLength(2);
    for (const table of traffic) {
      expect(table.sample).toBe(true);
      expect(table.connected).toBe(false);
      expect(table.subtitle).toContain("sample");
    }
  });

  it("flags a connected property as live", async () => {
    const result = await runFreeRead({
      url: "https://acme.com/",
      fetcher: fakeFetcher(),
      traffic: {
        connected: true,
        ga4: { period: "Last 28 days", rows: [{ label: "Sessions", value: "1,204" }] },
        gsc: { period: "Last 28 days", rows: [{ label: "Clicks", value: "88" }] },
      },
    });
    const ga4 = result.tables.find((table) => table.id === "ga4.traffic")!;
    expect(ga4.sample).toBe(false);
    expect(ga4.connected).toBe(true);
    expect(ga4.rows[0].value).toBe("1,204");
  });

  it("states its limits", async () => {
    const result = await runFreeRead({ url: "https://acme.com/", fetcher: fakeFetcher() });
    expect(result.limitations.join(" ")).toContain("sample data");
  });

  it("detects the tag identifiers in the delivered HTML", () => {
    const ids = findTagIds(HTML + "<script>gtag('config','G-SECOND123')</script>");
    expect(ids.ga4).toEqual(["G-ABC123XYZ", "G-SECOND123"]);
    expect(ids.gtm).toEqual([]);
  });
});
