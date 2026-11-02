import { describe, expect, it } from "vitest";
import { HtmlDoc } from "../src/geo/html.js";
import { classifyBot, extractSitemaps, parseRobots } from "../src/geo/robots.js";
import { auditRobots } from "../src/geo/audit/robots.js";
import { auditLlms } from "../src/geo/audit/llms.js";
import { auditSchema } from "../src/geo/audit/schema.js";
import { auditMeta } from "../src/geo/audit/meta.js";
import { auditContent } from "../src/geo/audit/content.js";
import { auditSignals } from "../src/geo/audit/signals.js";
import { auditBrand } from "../src/geo/audit/brand.js";
import { auditAiDiscovery } from "../src/geo/audit/ai-discovery.js";
import { bandOf, buildRecommendations, computeBreakdown, scoreOf } from "../src/geo/score.js";
import { runGeoAudit } from "../src/geo/audit.js";
import { generateLlmsTxt } from "../src/geo/generate/llms.js";
import { generateJsonLd, renderJsonLdScript } from "../src/geo/generate/schema.js";
import { generateRobotsFix } from "../src/geo/generate/robots.js";
import {
  belongsToDomain,
  isSitemapIndex,
  parseSitemap,
  parseSitemapIndex,
} from "../src/geo/sitemap.js";
import type { Fetcher, FetchResult } from "../src/geo/http.js";
import { CATEGORY_MAX } from "../src/geo/config.js";
import { tools } from "../src/tools/index.js";

describe("html reader", () => {
  it("reads attributes in any order and decodes entities", () => {
    const doc = HtmlDoc.parse(
      `<html lang="en"><head><title>Acme &amp; Co</title>` +
        `<meta content="A description" name="description"></head><body><h1>Acme</h1></body></html>`
    );
    expect(doc.title()).toBe("Acme & Co");
    expect(doc.htmlLang()).toBe("en");
    expect(doc.metaByName("description")?.attrs.content).toBe("A description");
    expect(doc.textOf(doc.first("h1")!)).toBe("Acme");
  });

  it("ignores markup inside script tags and excludes scripts from body text", () => {
    const doc = HtmlDoc.parse(
      `<body><p>Visible 42</p><script>if (a < b) { console.log("<h1>fake</h1>") }</script></body>`
    );
    expect(doc.all("h1")).toHaveLength(0);
    expect(doc.bodyText()).toContain("Visible 42");
    expect(doc.bodyText()).not.toContain("console.log");
  });
});

describe("robots.txt", () => {
  it("classifies wildcard, explicit and blocked bots", () => {
    const groups = parseRobots(
      "User-agent: *\nDisallow: /private\n\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: OAI-SearchBot\nAllow: /\n"
    );
    expect(classifyBot("PerplexityBot", groups).status).toBe("allowed");
    expect(classifyBot("PerplexityBot", groups).viaWildcard).toBe(true);
    expect(classifyBot("GPTBot", groups).status).toBe("blocked");
    expect(classifyBot("OAI-SearchBot", groups).status).toBe("allowed");
    expect(classifyBot("OAI-SearchBot", groups).viaWildcard).toBe(false);
  });

  it("treats Disallow: / plus narrow Allow as partial", () => {
    const groups = parseRobots("User-agent: ClaudeBot\nDisallow: /\nAllow: /blog\n");
    expect(classifyBot("ClaudeBot", groups).status).toBe("partial");
  });

  it("extracts sitemaps and crawl-delay", () => {
    const content =
      "User-agent: *\nDisallow:\nCrawl-delay: 30\nSitemap: https://example.com/sitemap.xml\n";
    expect(extractSitemaps(content)).toEqual(["https://example.com/sitemap.xml"]);
    expect(parseRobots(content)["*"].crawlDelay).toBe(30);
  });

  it("scores explicit citation rules above wildcard-only access", () => {
    const explicit = auditRobots(
      "User-agent: OAI-SearchBot\nAllow: /\nUser-agent: Claude-SearchBot\nAllow: /\n" +
        "User-agent: PerplexityBot\nAllow: /\nUser-agent: Googlebot\nAllow: /\nUser-agent: Applebot\nAllow: /\n",
      200
    );
    const wildcard = auditRobots("User-agent: *\nAllow: /\n", 200);
    const blocked = auditRobots("User-agent: *\nDisallow: /\n", 200);

    expect(explicit.checks.find((c) => c.id === "robots.citation_bots")?.earned).toBe(13);
    expect(wildcard.checks.find((c) => c.id === "robots.citation_bots")?.earned).toBe(10);
    expect(blocked.checks.find((c) => c.id === "robots.citation_bots")?.earned).toBe(0);
  });

  it("reports a missing robots.txt as zero", () => {
    const result = auditRobots(null, 404);
    expect(result.data.found).toBe(false);
    expect(result.checks.find((c) => c.id === "robots.found")?.earned).toBe(0);
  });
});

describe("llms.txt", () => {
  it("awards points only for the structure that is present", () => {
    const result = auditLlms(
      "# Acme\n\n> Summary\n\n## Docs\n\n- [API](https://example.com/api)\n",
      200,
      null
    );
    const earned = Object.fromEntries(result.checks.map((c) => [c.id, c.earned]));
    expect(earned["llms.found"]).toBe(5);
    expect(earned["llms.h1"]).toBe(2);
    expect(earned["llms.blockquote"]).toBe(1);
    expect(earned["llms.sections"]).toBe(2);
    expect(earned["llms.links"]).toBe(2);
    expect(earned["llms.depth"]).toBe(0);
    expect(earned["llms.full"]).toBe(0);
  });

  it("caps at 18 points for a depth-complete file", () => {
    const body =
      "# Acme\n\n> Summary\n\n## Docs\n\n- [API](https://example.com/api)\n\n" + "word ".repeat(5100);
    const result = auditLlms(body, 200, "expanded");
    expect(result.checks.reduce((sum, c) => sum + c.earned, 0)).toBe(18);
  });
});

describe("schema", () => {
  it("flags parse errors and incomplete types", () => {
    const doc = HtmlDoc.parse(`
      <body>
        <script type="application/ld+json">{ not json }</script>
        <script type="application/ld+json">
          {"@context":"https://schema.org","@type":"WebSite","name":"Acme"}
        </script>
      </body>`);
    const result = auditSchema(doc);
    expect(result.data.parseErrors).toBe(1);
    expect(result.data.incompleteTypes).toContain("WebSite");
    expect(result.data.missingFields.WebSite).toEqual(["url"]);
    expect(result.checks.find((c) => c.id === "schema.website")?.earned).toBe(1);
  });

  it("flattens @graph and scores richness", () => {
    const doc = HtmlDoc.parse(`
      <body><script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[
        {"@type":"WebSite","name":"Acme","url":"https://example.com","description":"d","inLanguage":"en","potentialAction":{}},
        {"@type":"Organization","name":"Acme","url":"https://example.com","logo":"l","sameAs":["https://www.wikipedia.org/wiki/Acme"],"telephone":"+1"}
      ]}
      </script></body>`);
    const result = auditSchema(doc);
    expect(result.data.foundTypes).toEqual(expect.arrayContaining(["WebSite", "Organization"]));
    expect(result.data.sameAsUrls).toHaveLength(1);
    expect(result.data.richnessScore).toBeGreaterThan(0);
  });
});

describe("meta", () => {
  it("treats noindex and noai as zero-point blockers", () => {
    const doc = HtmlDoc.parse(
      `<html><head><title>Acme</title><meta name="robots" content="noindex, noai"></head></html>`
    );
    const result = auditMeta(doc, { "x-robots-tag": "noindex, follow" });
    const ids = result.checks.filter((c) => c.status === "fail").map((c) => c.id);
    expect(ids).toContain("meta.x_robots_noindex");
    expect(ids).toContain("meta.noai");
    expect(result.checks.filter((c) => c.max === 0)).toHaveLength(2);
  });
});

describe("content", () => {
  it("counts CJK characters as words", () => {
    const doc = HtmlDoc.parse(`<body><h1>标题</h1><p>${"内容".repeat(200)}</p></body>`);
    const result = auditContent(doc, "https://example.com");
    expect(result.data.wordCount).toBeGreaterThanOrEqual(300);
  });

  it("detects front-loading only when the opening carries a figure", () => {
    const withNumber = HtmlDoc.parse(
      `<body><h1>T</h1><p>${"Revenue grew 42 percent across 900 teams. ".repeat(30)}</p></body>`
    );
    const withoutNumber = HtmlDoc.parse(
      `<body><h1>T</h1><p>${"Revenue grew across many teams and markets. ".repeat(30)}</p></body>`
    );
    expect(auditContent(withNumber, "https://example.com").data.hasFrontLoading).toBe(true);
    expect(auditContent(withoutNumber, "https://example.com").data.hasFrontLoading).toBe(false);
  });
});

describe("brand & signals", () => {
  it("recognises a consistent brand and Knowledge Graph pillars", () => {
    const html = `<html lang="en"><head>
      <title>Acme — Analytics</title>
      <meta property="og:title" content="Acme — Analytics">
      <meta name="description" content="Acme measures AI answer visibility for marketing teams across markets.">
      <link rel="alternate" type="application/rss+xml" href="/feed.xml">
      <link rel="alternate" hreflang="en" href="https://example.com/">
      </head><body><h1>Acme</h1><a href="/about">About</a>
      <script type="application/ld+json">{"@graph":[
        {"@type":"WebSite","name":"Acme","url":"https://example.com"},
        {"@type":"Organization","name":"Acme","url":"https://example.com","description":"Acme measures AI answer visibility for marketing teams across markets.","telephone":"+1","address":{"streetAddress":"1 Main"},"sameAs":["https://wikipedia.org/wiki/Acme","https://wikidata.org/wiki/Q1","https://linkedin.com/company/acme"]}
      ]}</script></body></html>`;
    const doc = HtmlDoc.parse(html);
    const schema = auditSchema(doc).data;
    const meta = auditMeta(doc, {}).data;
    const content = auditContent(doc, "https://example.com").data;
    const brand = auditBrand(doc, schema, meta, content).data;
    const signals = auditSignals(doc, schema).data;

    expect(brand.brandNameConsistent).toBe(true);
    expect(brand.primaryName).toBe("Acme");
    expect(brand.kgPillarCount).toBe(3);
    expect(brand.hasAboutLink).toBe(true);
    expect(brand.hasContactInfo).toBe(true);
    expect(brand.hasGeoSignal).toBe(true);
    expect(signals.lang).toBe("en");
    expect(signals.rssUrl).toBe("/feed.xml");
  });

  it("does not read a sentence-length H1 as the brand name", () => {
    const html = `<html><head><title>Stripe | Payments</title>
      <meta property="og:title" content="Stripe | Payments">
      <meta name="description" content="Stripe builds financial infrastructure for the internet.">
      </head><body><h1>Financial infrastructure to grow your revenue. Accept payments today.</h1>
      <script type="application/ld+json">{"@type":"WebSite","name":"Stripe","url":"https://stripe.com"}</script>
      </body></html>`;
    const doc = HtmlDoc.parse(html);
    const schema = auditSchema(doc).data;
    const meta = auditMeta(doc, {}).data;
    const content = auditContent(doc, "https://stripe.com").data;
    const brand = auditBrand(doc, schema, meta, content).data;

    expect(brand.primaryName).toBe("Stripe");
    expect(brand.namesFound).not.toContain("Financial infrastructure to grow your revenue");
  });
});

describe("ai discovery", () => {
  it("requires a name and description in summary.json", () => {
    const result = auditAiDiscovery({
      wellKnownAi: { status: 200, body: "allow" },
      summary: { status: 200, body: JSON.stringify({ name: "Acme", description: "short" }) },
      faq: { status: 404, body: null },
      service: { status: 404, body: null },
    });
    expect(result.data.hasSummary).toBe(true);
    expect(result.data.summaryValid).toBe(false);
    expect(result.checks.find((c) => c.id === "ai_discovery.summary")?.earned).toBe(0);
    expect(result.checks.find((c) => c.id === "ai_discovery.well_known")?.earned).toBe(2);
  });
});

describe("scoring", () => {
  it("keeps the category caps and maps bands", () => {
    const breakdown = computeBreakdown([
      {
        id: "robots.found",
        category: "robots",
        label: "",
        earned: 99,
        max: 5,
        status: "pass",
        evidence: "",
      },
    ]);
    expect(breakdown.robots).toBe(CATEGORY_MAX.robots);
    expect(scoreOf(breakdown)).toBe(18);
    expect(bandOf(100)).toBe("excellent");
    expect(bandOf(70)).toBe("good");
    expect(bandOf(50)).toBe("foundation");
    expect(bandOf(10)).toBe("critical");
  });

  it("orders recommendations by priority, then recoverable points", () => {
    const recommendations = buildRecommendations([
      {
        id: "signals.lang",
        category: "signals",
        label: "",
        earned: 0,
        max: 3,
        status: "fail",
        evidence: "",
        fix: "lang",
      },
      {
        id: "meta.title",
        category: "meta",
        label: "",
        earned: 0,
        max: 5,
        status: "fail",
        evidence: "",
        fix: "title",
      },
      {
        id: "meta.noai",
        category: "meta",
        label: "",
        earned: 0,
        max: 0,
        status: "fail",
        evidence: "",
        fix: "noai",
      },
      {
        id: "llms.links",
        category: "llms",
        label: "",
        earned: 0,
        max: 2,
        status: "fail",
        evidence: "",
        fix: "links",
      },
    ]);
    expect(recommendations.map((r) => r.checkId)).toEqual([
      "meta.noai",
      "meta.title",
      "llms.links",
      "signals.lang",
    ]);
    expect(recommendations[0].priority).toBe("critical");
  });
});

describe("generators", () => {
  it("builds an llms.txt with sections, skips assets and foreign hosts", () => {
    const content = generateLlmsTxt({
      baseUrl: "https://example.com",
      siteName: "Acme",
      description: "Acme analytics",
      entries: [
        { url: "https://example.com/pricing", priority: 0.9, changefreq: null, lastmod: null },
        {
          url: "https://example.com/docs/get-started",
          priority: 0.8,
          changefreq: null,
          lastmod: null,
        },
        { url: "https://example.com/logo.png", priority: 0.7, changefreq: null, lastmod: null },
        { url: "https://other.com/blog/post", priority: 0.6, changefreq: null, lastmod: null },
        { url: "https://example.com/about", priority: 0.5, changefreq: null, lastmod: null },
      ],
    });
    expect(content.startsWith("# Acme")).toBe(true);
    expect(content).toContain("> Acme analytics");
    expect(content).toContain("## Product");
    expect(content).toContain("- [Pricing](https://example.com/pricing)");
    expect(content).toContain("## Documentation");
    expect(content).toContain("## Company");
    expect(content).not.toContain("logo.png");
    expect(content).not.toContain("other.com");
  });

  it("generates rich JSON-LD and escapes the script terminator", () => {
    const schema = generateJsonLd({
      kind: "organization",
      name: "Acme",
      url: "https://example.com",
      sameAs: ["https://wikipedia.org/wiki/Acme"],
      telephone: "+1",
      address: "1 Main St </script>",
    });
    expect(schema["@type"]).toBe("Organization");
    expect(Object.keys(schema).length).toBeGreaterThanOrEqual(5);
    const script = renderJsonLdScript(schema);
    expect(script).toContain('<script type="application/ld+json">');
    expect(script).toContain("<\\/script>");
  });

  it("refuses an FAQ schema without questions", () => {
    expect(() =>
      generateJsonLd({ kind: "faq", name: "Acme", url: "https://example.com" })
    ).toThrow(/at least one item/);
  });

  it("never overrides an explicit block, but adds missing bots", () => {
    const fix = generateRobotsFix({
      baseUrl: "https://example.com",
      existing: "User-agent: GPTBot\nDisallow: /\n",
    });
    expect(fix.blocked).toContain("GPTBot");
    expect(fix.added).toContain("OAI-SearchBot");
    expect(fix.content).toContain("User-agent: GPTBot\nDisallow: /");
    expect(fix.content).toContain("User-agent: OAI-SearchBot");
    expect(fix.appendOnly).toBe(true);
  });
});

describe("sitemaps", () => {
  it("parses a urlset and an index", () => {
    const urlset = `<urlset><url><loc>https://example.com/a</loc><priority>0.8</priority></url></urlset>`;
    expect(parseSitemap(urlset)).toEqual([
      { url: "https://example.com/a", priority: 0.8, changefreq: null, lastmod: null },
    ]);
    const index = `<sitemapindex><sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap></sitemapindex>`;
    expect(isSitemapIndex(index)).toBe(true);
    expect(parseSitemapIndex(index)).toEqual(["https://example.com/sitemap-1.xml"]);
    expect(belongsToDomain("https://www.example.com/x", "example.com")).toBe(true);
    expect(belongsToDomain("https://other.com/x", "example.com")).toBe(false);
  });
});

describe("MCP surface", () => {
  it("registers the GEO tools on the server", () => {
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "geo_audit",
        "geo_audit_sitemap",
        "geo_generate_llms_txt",
        "geo_generate_schema",
        "geo_generate_robots",
      ])
    );
  });
});

// ─── End-to-end: a page that satisfies every check must score exactly 100 ───

function respond(body: string, contentType: string): FetchResult {
  return {
    url: "",
    status: 200,
    ok: true,
    headers: { "content-type": contentType },
    body,
  };
}

function perfectSite(): Record<string, FetchResult> {
  const description =
    "Acme measures AI answer visibility for marketing teams across every major answer engine and market.";
  const paragraphs = Array.from(
    { length: 40 },
    (_, i) => `Paragraph ${i} explains how teams measure answers with 42 signals and 900 citations.`
  ).join(" ");
  const html = `<!doctype html>
<html lang="en">
<head>
  <title>Acme — Answer analytics</title>
  <meta content="${description}" name="description">
  <meta property="og:title" content="Acme — Answer analytics">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="https://example.com/og.png">
  <link rel="canonical" href="https://example.com/">
  <link rel="alternate" type="application/rss+xml" href="/feed.xml">
  <link rel="alternate" hreflang="en" href="https://example.com/">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@graph":[
    {"@type":"WebSite","name":"Acme","url":"https://example.com","description":"${description}","inLanguage":"en","potentialAction":{}},
    {"@type":"Organization","name":"Acme","url":"https://example.com","description":"${description}","logo":"https://example.com/logo.png","sameAs":["https://wikipedia.org/wiki/Acme","https://wikidata.org/wiki/Q1","https://linkedin.com/company/acme","https://crunchbase.com/organization/acme"],"telephone":"+1 555 0100","address":{"@type":"PostalAddress","streetAddress":"1 Main St"}},
    {"@type":"FAQPage","name":"Acme FAQ","url":"https://example.com/faq","description":"FAQ","mainEntity":[{"@type":"Question","name":"Q1","acceptedAnswer":{"@type":"Answer","text":"A1"}},{"@type":"Question","name":"Q2","acceptedAnswer":{"@type":"Answer","text":"A2"}},{"@type":"Question","name":"Q3","acceptedAnswer":{"@type":"Answer","text":"A3"}}]},
    {"@type":"Article","headline":"Acme methodology","url":"https://example.com/methodology","description":"How Acme measures answers","author":{"@type":"Person","name":"Acme Team"},"publisher":{"@type":"Organization","name":"Acme"},"datePublished":"2026-01-01","dateModified":"2026-01-02"}
  ]}
  </script>
</head>
<body>
  <h1>Acme</h1>
  <p>Acme measured 42 answer engines across 900 teams in 2026.</p>
  <h2>Method</h2>
  <h3>Sampling</h3>
  <ul><li>Prompt sets</li><li>Citation capture</li></ul>
  <p>${paragraphs}</p>
  <p><a href="https://schema.org/FAQPage">Schema reference</a></p>
  <a href="/about">About</a>
</body>
</html>`;

  const llms = `# Acme\n\n> Acme measures AI answer visibility.\n\n## Product\n\n- [Pricing](https://example.com/pricing)\n\n## Docs\n\n- [API](https://example.com/docs)\n\n${"word ".repeat(5100)}`;

  return {
    "https://example.com/": respond(html, "text/html"),
    "https://example.com": respond(html, "text/html"),
    "https://example.com/robots.txt": respond(
      "User-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: Claude-SearchBot\nAllow: /\n\n" +
        "User-agent: PerplexityBot\nAllow: /\n\nUser-agent: Googlebot\nAllow: /\n\nUser-agent: Applebot\nAllow: /\n\n" +
        "Sitemap: https://example.com/sitemap.xml\n",
      "text/plain"
    ),
    "https://example.com/llms.txt": respond(llms, "text/plain"),
    "https://example.com/llms-full.txt": respond("Expanded corpus", "text/plain"),
    "https://example.com/.well-known/ai.txt": respond("allow: all", "text/plain"),
    "https://example.com/ai/summary.json": respond(
      JSON.stringify({
        name: "Acme",
        description: "AI answer visibility analytics for marketing teams.",
      }),
      "application/json"
    ),
    "https://example.com/ai/faq.json": respond(
      JSON.stringify({
        faqs: [
          {
            question: "What does Acme do?",
            answer: "Acme measures AI answer visibility for marketing teams.",
          },
        ],
      }),
      "application/json"
    ),
    "https://example.com/ai/service.json": respond(
      JSON.stringify({ name: "Acme", capabilities: ["geo-audit"] }),
      "application/json"
    ),
  };
}

const SITE = perfectSite();

const fetcher: Fetcher = async (url) => {
  const hit = SITE[url];
  if (!hit) return { url, status: 404, ok: false, headers: {}, body: "" };
  return { ...hit, url };
};

describe("full audit", () => {
  it("scores a fully optimised page 100/100", async () => {
    const result = await runGeoAudit({ url: "https://example.com", fetcher });
    const failing = result.checks.filter((check) => check.status === "fail" && check.max > 0);
    expect(failing.map((check) => check.id)).toEqual([]);
    expect(result.score).toBe(100);
    expect(result.band).toBe("excellent");
    expect(result.recoverablePoints).toBe(0);
    expect(result.projectedScore).toBe(100);
    expect(result.scoreBreakdown).toEqual(CATEGORY_MAX);
  });

  it("counts unreachable pages as an error with an actionable recommendation", async () => {
    const offline: Fetcher = async () => {
      throw new Error("ENOTFOUND");
    };
    const result = await runGeoAudit({ url: "https://nope.example", fetcher: offline });
    expect(result.score).toBe(0);
    expect(result.error).toBeTruthy();
    expect(result.recommendations[0].checkId).toBe("audit.fetch");
  });

  it("keeps a blocked page at zero instead of auditing the error body", async () => {
    const blocked: Fetcher = async (url) => ({
      url,
      status: 403,
      ok: false,
      headers: {},
      body: "<html>WAF</html>",
    });
    const result = await runGeoAudit({ url: "https://example.com", fetcher: blocked });
    expect(result.httpStatus).toBe(403);
    expect(result.score).toBe(0);
    expect(result.checks).toHaveLength(0);
    expect(result.projectedScore).toBe(0);
  });
});
