import { describe, expect, it } from "vitest";
import { runGeoAudit } from "../src/geo/audit.js";
import { collectAutomaticV2 } from "../src/geo/score/v2/automatic.js";
import type { V2CoverageScore } from "../src/geo/score/v2/coverage.js";
import type { Fetcher, FetchResult } from "../src/geo/http.js";

const BASE = "https://acme.test/";
const SITEMAP = `<?xml version="1.0"?><urlset>
<url><loc>https://acme.test/</loc></url>
<url><loc>https://acme.test/docs</loc></url></urlset>`;
const LLMS = `# Acme
> Acme provides comprehensive, evidence-based AI search analysis and practical guidance for product teams.

## Documentation
- [Product documentation](/docs)
- [Plans and pricing](https://acme.test/pricing)
`;

const HOME = `<html><head><title>Acme AI search audits</title>
<meta name="robots" content="index, follow">
<meta name="description" content="Acme provides evidence-driven GEO analysis and practical recommendations for teams.">
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org", "@graph": [
    { "@type": "Organization", "@id": "https://acme.test/#org", url: BASE,
      name: "Acme", sameAs: ["https://www.instagram.com/acme", "https://x.com/acme"] },
    { "@type": "WebSite", "@id": "https://acme.test/#site", url: BASE, name: "Acme" },
    { "@type": "WebPage", "@id": "https://acme.test/#page", url: BASE,
      isPartOf: { "@id": "https://acme.test/#site" }, dateModified: "2026-11-08" },
    { "@type": "FAQPage", mainEntity: [
      { "@type": "Question", name: "How can teams improve their AI search visibility?",
        acceptedAnswer: { "@type": "Answer", text: "Teams can compare evidence, fix missing structure, and monitor changes over time." } },
    ] },
  ],
})}</script></head>
<body><main><h1>Acme helps teams improve AI visibility</h1>
<p>Acme provides practical guidance on measuring AI visibility through evidence, structured audits and repeatable monitoring.</p>
<h2>Questions</h2><p>How can teams improve their AI search visibility?</p>
<p>Teams can compare evidence, fix missing structure, and monitor changes over time.</p>
<ul><li>Compare structured evidence for each important search surface</li></ul>
<time datetime="2026-11-08">Updated 8 November 2026</time>
<p><a href="/docs">Read our practical product documentation</a> and
<a href="/pricing">Explore our monthly pricing plans</a> to understand the service.</p>
<a href="https://www.instagram.com/acme">Acme on Instagram</a>
<a href="https://x.com/acme">Acme on X</a>
<a href="/ai/faq.json">Frequently asked questions in machine-readable JSON</a>
</main></body></html>`;

const FAQ = JSON.stringify({ faqs: [{ question: "What does the audit cover?", answer: "A detailed GEO evidence snapshot for the entire requested page." }] });

function fakeFetcher(page = HOME, robots = "User-agent: *\nAllow: /\n", llms = LLMS): Fetcher {
  return async (url: string): Promise<FetchResult> => {
    const path = new URL(url).pathname;
    const response = path === "/" ? { status: 200, body: page } :
      path === "/robots.txt" ? { status: 200, body: robots } :
      path === "/llms.txt" ? { status: 200, body: llms } :
      path === "/ai/faq.json" ? { status: 200, body: FAQ } :
      { status: 404, body: "not found" };
    return { url, status: response.status, body: response.body,
      ok: response.status < 400, headers: { "content-type": "text/html" } };
  };
}

function control(result: V2CoverageScore, id: string) {
  const row = result.controls.find(item => item.controlId === id);
  if (!row) throw new Error(`Missing control ${id}`);
  return row;
}

describe("GEO v2 remaining evidence collectors", () => {
  it("instruments deterministically observable controls using the existing snapshot", async () => {
    const audit = await runGeoAudit({ url: BASE, fetcher: fakeFetcher() });
    const result = await collectAutomaticV2(audit, [], {
      pageHtml: HOME,
      sitemap: { url: `${BASE}sitemap.xml`, valid: true, xml: SITEMAP },
      ownerImportantUrls: [BASE, `${BASE}docs`],
    });
    for (const id of ["R03", "R05", "L02", "L03", "L04", "J03", "J04", "J05",
      "M05", "C01", "C02", "C06", "C07", "C08", "B03", "D02", "D03"]) {
      expect(control(result, id), id).toMatchObject({ status: "measured", earned: expect.any(Number) });
      expect(control(result, id).proof?.value.length).toBeGreaterThan(0);
    }
    expect(control(result, "D02").earned).toBe(3);
    expect(control(result, "B03").earned).toBe(2);
    expect(control(result, "J04").earned).toBe(2);
    expect(control(result, "C02").earned).toBe(3);
    expect(result.controls).toHaveLength(42);
    expect(result.score).toBeNull();
    expect(result.status).toBe("incomplete");
    for (const id of ["C04", "C05", "B04", "P01", "P02", "P03", "P04"]) {
      expect(control(result, id).status, id).toBe("unknown");
    }
    expect(control(result, "B04").proof).toBeNull();
  });

  it("reports bot exclusions and specific-vs-wildcard disagreement, not false passes", async () => {
    const robots = "User-agent: *\nAllow: /\nUser-agent: OAI-SearchBot\nDisallow: /\n";
    const audit = await runGeoAudit({ url: BASE, fetcher: fakeFetcher(HOME, robots) });
    const result = await collectAutomaticV2(audit, [], { pageHtml: HOME });
    expect(control(result, "R03")).toMatchObject({ status: "measured", earned: 0 });
    expect(control(result, "R05")).toMatchObject({ status: "measured", earned: 0 });
    expect(control(result, "M05").earned).toBe(1);
  });

  it("holds ambiguous wildcard and indexing policy as unknown", async () => {
    const robots = "User-agent: *\nDisallow: /*private$\n";
    const html = HOME.replace('content="index, follow"', 'content="noindex, follow"');
    const audit = await runGeoAudit({ url: BASE, fetcher: fakeFetcher(html, robots) });
    const result = await collectAutomaticV2(audit, [], { pageHtml: html });
    expect(control(result, "R03").status).toBe("unknown");
    expect(control(result, "R05").status).toBe("unknown");
    expect(control(result, "M05").status).toBe("unknown");
  });

  it("does not credit unsafe Markdown links or a missing substantive llms summary", async () => {
    const badLlms = "# Acme\n> Short\n## Links\n[Unsafe](javascript:alert%281%29)\n";
    const audit = await runGeoAudit({ url: BASE, fetcher: fakeFetcher(HOME, undefined, badLlms) });
    const result = await collectAutomaticV2(audit);
    for (const id of ["L02", "L03", "L04"]) {
      expect(control(result, id)).toMatchObject({ status: "measured", earned: 0 });
    }
    expect(audit.details.llms.invalidLinkCount).toBe(1);
  });

  it("requires owner-declared key pages and verified page sitemap coverage", async () => {
    const audit = await runGeoAudit({ url: BASE, fetcher: fakeFetcher() });
    const defaultResult = await collectAutomaticV2(audit, [], {
      pageHtml: HOME, sitemap: { url: `${BASE}sitemap.xml`, valid: true, xml: SITEMAP },
    });
    expect(control(defaultResult, "D02").status).toBe("unknown");
    const missingPage = await collectAutomaticV2(audit, [], {
      pageHtml: HOME, sitemap: { url: `${BASE}sitemap.xml`, valid: true, xml: SITEMAP },
      ownerImportantUrls: [BASE, `${BASE}important-but-absent`],
    });
    expect(control(missingPage, "D02")).toMatchObject({ status: "measured", earned: 0 });
    const invalidHost = await collectAutomaticV2(audit, [], {
      pageHtml: HOME, sitemap: { url: `${BASE}sitemap.xml`, valid: true, xml: SITEMAP },
      ownerImportantUrls: ["https://unrelated.test/"],
    });
    expect(control(invalidHost, "D02").status).toBe("unknown");
    const index = await collectAutomaticV2(audit, [], {
      sitemap: { url: `${BASE}sitemap.xml`, valid: true,
        xml: "<sitemapindex><sitemap><loc>https://acme.test/other.xml</loc></sitemap></sitemapindex>" },
      ownerImportantUrls: [BASE],
    });
    expect(control(index, "D02").status).toBe("unknown");
  });

  it("does not infer social backlinks or an author from self-declared profile links", async () => {
    const altered = HOME.replace('"https://x.com/acme"', '"https://x.com/different-profile"');
    const audit = await runGeoAudit({ url: BASE, fetcher: fakeFetcher(altered) });
    const result = await collectAutomaticV2(audit, [], { pageHtml: altered });
    expect(control(result, "B03")).toMatchObject({ status: "measured", earned: 0 });
    expect(control(result, "B04").status).toBe("unknown");
    expect(control(result, "B05").status).toBe("unknown");
  });

  it("verifies a visible author with a matching Person expertise declaration", async () => {
    const article = `<html><head><title>Evidence article</title><script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org", "@graph": [
        { "@type": "Article", headline: "Practical AI search", author: { "@type": "Person", name: "Jane Doe" } },
        { "@type": "Person", name: "Jane Doe", jobTitle: "Technical SEO researcher" },
      ],
    })}</script></head><body><article><h1>Practical AI search</h1><p>Written by Jane Doe. This page compares observable structured evidence with documented audit methods.</p></article></body></html>`;
    const audit = await runGeoAudit({ url: BASE, fetcher: fakeFetcher(article) });
    const result = await collectAutomaticV2(audit, [], { pageHtml: article });
    expect(control(result, "B05")).toMatchObject({ status: "measured", earned: 1 });
  });

  it("rejects inconsistent structured entity URLs and mismatched freshness evidence", async () => {
    const html = HOME.replace("https://acme.test/#org", "https://unrelated.test/#org")
      .replace('datetime="2026-11-08"', 'datetime="2026-10-01"');
    const audit = await runGeoAudit({ url: BASE, fetcher: fakeFetcher(html) });
    const result = await collectAutomaticV2(audit, [], { pageHtml: html });
    expect(control(result, "J03")).toMatchObject({ status: "measured", earned: 0 });
    expect(control(result, "C07")).toMatchObject({ status: "measured", earned: 0 });
  });

  it("keeps scoped indexing headers unknown, but marks direct conflicts as failures", async () => {
    const page = HOME.replace('content="index, follow"', 'content="noindex, follow"');
    const base = fakeFetcher(page);
    const fetcher: Fetcher = async (url, init) => {
      const result = await base(url, init);
      return url === BASE ? { ...result, headers: { ...result.headers, "x-robots-tag": "index" } } : result;
    };
    const audit = await runGeoAudit({ url: BASE, fetcher });
    const conflict = await collectAutomaticV2(audit, [], { pageHtml: page });
    expect(control(conflict, "M05")).toMatchObject({ status: "measured", earned: 0 });
    audit.details.meta.xRobotsTag = "Googlebot: index";
    const scoped = await collectAutomaticV2(audit, [], { pageHtml: page });
    expect(control(scoped, "M05").status).toBe("unknown");
    expect(control(scoped, "R03").status).toBe("unknown");
  });

  it("keeps content and social controls unknown without the already fetched HTML", async () => {
    const audit = await runGeoAudit({ url: BASE, fetcher: fakeFetcher() });
    const result = await collectAutomaticV2(audit);
    for (const id of ["C01", "C02", "C06", "C07", "C08", "B03", "B05", "D03"]) {
      expect(control(result, id).status, id).toBe("unknown");
    }
    expect(result.score).toBeNull();
  });
});
