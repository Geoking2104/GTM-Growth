#!/usr/bin/env node
/**
 * Offline smoke test for the compiled GEO engine (dist/).
 *
 * No network: the fetcher is a fixture, so CI proves that the built audit runs,
 * scores, and generates artifacts. Exits non-zero on the first mismatch.
 */
import { runGeoAudit } from "../dist/geo/audit.js";
import { generateJsonLd, renderJsonLdScript } from "../dist/geo/generate/schema.js";
import { generateLlmsTxt } from "../dist/geo/generate/llms.js";
import { generateRobotsFix } from "../dist/geo/generate/robots.js";

const page = `<!doctype html>
<html lang="en"><head>
<title>Smoke Test</title>
<meta name="description" content="Offline fixture used by the CLI smoke test.">
<link rel="canonical" href="https://example.com/">
<meta property="og:title" content="Smoke Test">
<meta property="og:description" content="Offline fixture used by the CLI smoke test.">
<meta property="og:image" content="https://example.com/og.png">
<script type="application/ld+json">{"@type":"Organization","name":"Smoke Test","url":"https://example.com"}</script>
</head><body>
<h1>Smoke Test</h1><h2>One</h2><h3>Two</h3>
<ul><li>a</li></ul>
<p>We measured 3 answer engines across 2026 and found 12 citations.</p>
</body></html>`;

const fixtures = {
  "https://example.com/": page,
  "https://example.com/robots.txt": "User-agent: *\nAllow: /\n",
  "https://example.com/llms.txt":
    "# Smoke Test\n\n> Offline fixture\n\n## Docs\n\n- [Home](https://example.com/)\n",
};

const fetcher = async (url) => ({
  url,
  status: fixtures[url] ? 200 : 404,
  ok: Boolean(fixtures[url]),
  headers: {},
  body: fixtures[url] ?? "",
});

function assert(condition, message) {
  if (!condition) {
    console.error(`GEO smoke failed: ${message}`);
    process.exit(1);
  }
}

const audit = await runGeoAudit({ url: "https://example.com", fetcher, includeAiDiscovery: false });

assert(audit.score > 0 && audit.score <= 100, `score out of range: ${audit.score}`);
assert(audit.checks.length > 0, "audit returned no checks");
assert(audit.recommendations.length > 0, "audit returned no recommendations");
assert(audit.scoreBreakdown.meta === 14, `meta should be 14/14, got ${audit.scoreBreakdown.meta}`);
assert(audit.scoreBreakdown.robots === 15, `robots should be 15/18, got ${audit.scoreBreakdown.robots}`);

const script = renderJsonLdScript(
  generateJsonLd({ kind: "organization", name: "Smoke Test", url: "https://example.com" })
);
assert(script.includes('"@type": "Organization"'), "schema generator returned no Organization");

const llms = generateLlmsTxt({
  baseUrl: "https://example.com",
  siteName: "Smoke Test",
  entries: [{ url: "https://example.com/", priority: 1, changefreq: null, lastmod: null }],
});
assert(llms.startsWith("# Smoke Test"), "llms.txt generator returned no H1");

const robots = generateRobotsFix({
  baseUrl: "https://example.com",
  existing: "User-agent: *\nAllow: /\n",
});
assert(robots.added.length > 0, "robots generator added no AI crawler rule");

console.log(
  `GEO smoke OK — ${audit.score}/100, ${audit.checks.length} checks, ` +
    `${audit.recommendations.length} recommendations, generators OK`
);
