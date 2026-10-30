#!/usr/bin/env node
/**
 * Reproducible before/after demo for the GEO audit.
 *
 * The "before" page is a typical un-optimised site: no robots.txt, no llms.txt,
 * no structured data, no social tags, thin copy. The "after" page is the same
 * site with the artifacts this server generates (robots.txt, llms.txt, JSON-LD)
 * plus the editorial fixes the audit asks for (meta, headings, figures).
 *
 * Everything runs offline against the built engine. Numbers printed here are
 * the ones quoted in the README — run `npm run demo:geo` to reproduce.
 */
import { runGeoAudit } from "../dist/geo/audit.js";
import { CATEGORY_LABEL } from "../dist/geo/config.js";
import { generateJsonLd, renderJsonLdScript } from "../dist/geo/generate/schema.js";
import { generateLlmsTxt } from "../dist/geo/generate/llms.js";
import { generateRobotsFix } from "../dist/geo/generate/robots.js";

const ORIGIN = "https://acme-widgets.example";
const DESCRIPTION =
  "Acme turns messy usage data into a weekly revenue report for subscription teams.";

// ─── "Before": what most sites look like on day one ────────────────────────
const beforeHtml = `<!doctype html>
<html>
<head><title>Acme Widgets</title></head>
<body>
  <h1>Acme Widgets</h1>
  <p>We make widgets for teams.</p>
</body>
</html>`;

// ─── "After": generated artifacts + the editorial fixes the audit asks for ──
const jsonLd = [
  generateJsonLd({
    kind: "website",
    name: "Acme",
    url: ORIGIN,
    description: DESCRIPTION,
  }),
  generateJsonLd({
    kind: "organization",
    name: "Acme",
    url: ORIGIN,
    description: DESCRIPTION,
    logo: `${ORIGIN}/logo.png`,
    sameAs: [
      "https://en.wikipedia.org/wiki/Acme",
      "https://www.wikidata.org/wiki/Q1",
      "https://www.linkedin.com/company/acme",
      "https://www.crunchbase.com/organization/acme",
    ],
    telephone: "+1 555 0100",
    address: "1 Main St, Springfield",
  }),
  generateJsonLd({
    kind: "faq",
    name: "Acme",
    url: `${ORIGIN}/faq`,
    description: DESCRIPTION,
    faqs: [
      { question: "What does Acme do?", answer: "Acme turns usage data into a weekly revenue report." },
      { question: "Who is Acme for?", answer: "Subscription and finance teams that need revenue visibility." },
      { question: "How long does setup take?", answer: "About 20 minutes: connect billing, pick a report day." },
    ],
  }),
  generateJsonLd({
    kind: "article",
    name: "Acme",
    url: `${ORIGIN}/methodology`,
    headline: "How Acme calculates weekly recurring revenue",
    description: "Methodology behind the weekly revenue report.",
    author: "Acme Research",
    datePublished: "2026-09-01",
    dateModified: "2026-09-20",
  }),
]
  .map(renderJsonLdScript)
  .join("\n  ");

const body = `
  <h1>Acme</h1>
  <p>In 2026, Acme measured 42 subscription businesses and found that 900 teams still rebuild the
  same revenue report by hand every week. Acme connects to billing, normalises 12 event types and
  publishes one weekly report your finance team can defend.</p>
  <h2>What you get</h2>
  <h3>One number, every Monday</h3>
  <ul>
    <li>Weekly recurring revenue, net of refunds and credits</li>
    <li>Plan and cohort breakdowns with 3 drill-down levels</li>
    <li>A change log you can attach to the board deck</li>
  </ul>
  <h3>Method you can audit</h3>
  <p>Every figure traces back to a billing event, with the 4 adjustments listed in the
  <a href="https://schema.org/QuantitativeValue">methodology reference</a>. Export the ledger as CSV
  and reconcile it against your invoice run; the totals match to the cent, and any mismatch is
  surfaced as a warning instead of silently averaged away.</p>
  <h3>Built for finance reviews</h3>
  <p>Each report ships with a reconciliation tab, a 12-month trend and a list of every adjustment
  applied that week. If billing changes mid-month, the report shows the plan before and after the
  change, so nobody has to reconstruct the bridge in a meeting. Finance signs off once, and the same
  definition is reused for the next 11 months instead of being re-argued every quarter.</p>
  <h2>Why teams switch</h2>
  <p>Most teams run 5 spreadsheets and 3 definitions of "active subscription". Acme keeps one
  definition, versioned and dated, so a number quoted in January still means the same thing in June.
  That is the whole product: fewer meetings about which number is right, more decisions about what to
  do next.</p>
  <h2>Pricing</h2>
  <p>Starter is 49 per month for up to 1,000 subscriptions, Growth is 199 per month with cohort
  reporting, and annual plans include 2 months free. Every plan starts with a 14-day trial, no card,
  and a sample report built from your own data before you decide.</p>
  <h2>Company</h2>
  <p>Acme is a team of 11 people across 3 time zones, founded in 2021. We publish our methodology,
  our changelog and our status page, and we answer support mail within one business day.</p>
  <a href="/about">About Acme</a>
`;

const afterHtml = `<!doctype html>
<html lang="en">
<head>
  <title>Acme — Weekly revenue reporting</title>
  <meta name="description" content="${DESCRIPTION}">
  <link rel="canonical" href="${ORIGIN}/">
  <meta property="og:title" content="Acme — Weekly revenue reporting">
  <meta property="og:description" content="${DESCRIPTION}">
  <meta property="og:image" content="${ORIGIN}/og.png">
  <link rel="alternate" type="application/rss+xml" href="/feed.xml">
  <link rel="alternate" hreflang="en" href="${ORIGIN}/">
  ${jsonLd}
</head>
<body>${body}</body>
</html>`;

const robots = generateRobotsFix({ baseUrl: ORIGIN, existing: "" });
const llms = generateLlmsTxt({
  baseUrl: ORIGIN,
  siteName: "Acme",
  description: DESCRIPTION,
  entries: [
    { url: `${ORIGIN}/pricing`, priority: 0.9, changefreq: null, lastmod: null },
    { url: `${ORIGIN}/docs/get-started`, priority: 0.8, changefreq: null, lastmod: null },
    { url: `${ORIGIN}/about`, priority: 0.5, changefreq: null, lastmod: null },
  ],
});

const site = (html, extras) => ({
  [`${ORIGIN}/`]: html,
  ...extras,
});

const before = site(beforeHtml, {});
const after = site(afterHtml, {
  [`${ORIGIN}/robots.txt`]: robots.content,
  [`${ORIGIN}/llms.txt`]: llms,
  [`${ORIGIN}/llms-full.txt`]: "Expanded corpus for retrieval.",
  [`${ORIGIN}/.well-known/ai.txt`]: "Allow: all\nSitemap: /sitemap.xml",
  [`${ORIGIN}/ai/summary.json`]: JSON.stringify({ name: "Acme", description: DESCRIPTION }),
  [`${ORIGIN}/ai/faq.json`]: JSON.stringify({
    faqs: [{ question: "What does Acme do?", answer: "Weekly revenue reporting for subscription teams." }],
  }),
  [`${ORIGIN}/ai/service.json`]: JSON.stringify({ name: "Acme", capabilities: ["revenue-report"] }),
});

const fetcherFor = (fixtures) => async (url) => ({
  url,
  status: fixtures[url] ? 200 : 404,
  ok: Boolean(fixtures[url]),
  headers: {},
  body: fixtures[url] ?? "",
});

const run = (fixtures) => runGeoAudit({ url: ORIGIN, fetcher: fetcherFor(fixtures) });

const beforeAudit = await run(before);
const afterAudit = await run(after);

const categories = Object.keys(CATEGORY_LABEL);
const rows = categories.map((key) => ({
  key,
  label: CATEGORY_LABEL[key],
  before: beforeAudit.scoreBreakdown[key],
  after: afterAudit.scoreBreakdown[key],
  max: beforeAudit.scoreMax[key],
}));

const pad = (value, width) => String(value).padEnd(width);
const num = (value, width) => String(value).padStart(width);

console.log(`# GEO before/after — ${ORIGIN}\n`);
console.log(`| Category | Before | After | Max |`);
console.log(`|---|---:|---:|---:|`);
for (const row of rows) {
  console.log(`| ${pad(row.label, 16)} | ${num(row.before, 6)} | ${num(row.after, 5)} | ${num(row.max, 3)} |`);
}
console.log(`| **Total** | **${beforeAudit.score}** | **${afterAudit.score}** | **100** |`);
console.log(`\nBefore band: ${beforeAudit.band} · After band: ${afterAudit.band}`);
console.log(`After top recommendation: ${afterAudit.recommendations[0]?.action ?? "none"}`);
