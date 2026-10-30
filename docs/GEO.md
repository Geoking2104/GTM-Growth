# GEO — AI search readiness (AEO / LLM SEO)

Classic SEO asks "does this page rank?". GEO asks a different question: **when an
assistant answers a buyer's question, can it read, parse and cite this page?**

`google-growth` now audits that second question with the same read-only posture as
its Google tools: it fetches the public URLs an AI crawler fetches, scores the site
0–100, and returns the fixes ordered by how many points they recover.

The rubric is adapted from the open-source
[geo-optimizer-skill](https://github.com/Auriti-Labs/geo-optimizer-skill) model
(MIT). This is an independent TypeScript implementation inside the MCP server, not
a fork: same published categories, weights and bands, no Python dependency.

---

## 1. What is scored

Eight categories, exactly 100 points. Every point belongs to one check, so the
per-category score is the sum of its checks and can never drift from its cap.

| Category | Max | What earns the points |
|---|---:|---|
| **robots.txt** | 18 | File reachable (5). The five citation crawlers — `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`, `Googlebot`, `Applebot` — explicitly allowed (13), or allowed only via `User-agent: *` (10). |
| **llms.txt** | 18 | File present (5), H1 (2), `>` blockquote (1), H2 sections (2), markdown links (2), ≥1,000 words (2), ≥5,000 words (2), `/llms-full.txt` companion (2). |
| **Schema JSON-LD** | 16 | Any valid type (2), richness ≥5 attributes per object (3), FAQPage (3), Article (3), Organization (3), WebSite (2). Incomplete types earn 1 point instead of full credit. |
| **Meta tags** | 14 | `<title>` (5), meta description (2), canonical (3), Open Graph title + description (4). |
| **Content** | 12 | H1 (2), ≥300 words (2), H2 + H3 hierarchy (2), lists/tables (2), key facts + a figure in the first 30% (2), ≥3 numeric tokens (1), outbound citations (1). |
| **Brand & Entity** | 10 | One brand name across title/og/H1/schema (2), schema description matches meta (1), `sameAs` to Wikipedia/Wikidata/LinkedIn/Crunchbase (3, graded), about link (1), contact details (1), geo signal (1), FAQ depth or dated articles (1). |
| **Signals** | 6 | `<html lang>` (3), RSS/Atom feed (2), valid `dateModified`/`datePublished` (1). |
| **AI discovery** | 6 | `/.well-known/ai.txt` (2), valid `/ai/summary.json` (2), `/ai/faq.json` (1), `/ai/service.json` (1). |

**Bands:** 86–100 excellent · 68–85 good · 36–67 foundation · 0–35 critical.

Blockers carry no points but appear first in the fix list because they make
everything else irrelevant: `X-Robots-Tag: noindex`, `noai` in meta robots, a
page that needs JavaScript to render, and JSON-LD that fails to parse.

---

## 2. The five tools

| Tool | What it does | Read-only |
|---|---|:--:|
| `geo_audit` | Full audit of one URL: score, per-category breakdown, every check with its evidence, prioritized fixes. | ✅ |
| `geo_audit_sitemap` | Audits up to 25 pages from the sitemap, reports the site average, the weakest pages, and the checks failing across the site. | ✅ |
| `geo_generate_llms_txt` | Builds `/llms.txt` from the sitemap: H1, blockquote, H2 sections, markdown links by priority. | ✅ |
| `geo_generate_schema` | Builds rich JSON-LD (`website`, `organization`, `faq`, `article`, `product`, `localbusiness`) plus the `<script>` tag. | ✅ |
| `geo_generate_robots` | Reads the current `robots.txt`, appends explicit `Allow` groups for uncovered AI crawlers, and reports bots that existing rules block — it never overrides a deliberate block. | ✅ |

Every tool is a read of public URLs plus a local computation. Nothing is written
to the site, to GA4, or to GTM, so no write flag and no `confirm=true` is needed.

### Example prompts

```
Audit https://example.com for AI search readiness.
Which pages on my sitemap are least ready to be cited by ChatGPT?
Generate an llms.txt for https://example.com from its sitemap.
My robots.txt blocks GPTBot — show me what to change.
```

---

## 3. CLI

```bash
npm run cli -- geo-audit --url https://example.com
npm run cli -- geo-audit --url https://example.com --no-ai-discovery
npm run cli -- geo-sitemap --url https://example.com --max-urls 10
npm run cli -- geo-llms --url https://example.com --out ./public/llms.txt
npm run cli -- geo-schema --kind organization --name "Acme" --url https://acme.com \
  --same-as "https://wikipedia.org/wiki/Acme,https://linkedin.com/company/acme" \
  --out ./public/schema.html
npm run cli -- geo-robots --url https://example.com --out ./public/robots.txt
```

`geo-audit` prints the same JSON an agent receives: score, breakdown, checks and
recommendations. `geo-llms`, `geo-schema` and `geo-robots` write the generated
artifact when `--out` is given, otherwise print it to stdout.

---

## 4. How to act on the result

1. **Clear blockers first.** `noindex`/`noai` and JS-only rendering make the rest
   of the score meaningless.
2. **Open the door.** Explicitly allow the citation bots; append-only robot fixes
   are safe to deploy.
3. **Feed the index.** Publish `llms.txt` (and `llms-full.txt` for documentation
   sites) generated from the sitemap.
4. **Make the page quotable.** FAQPage markup, an answer with a number in the
   first 30% of the copy, H2/H3 structure, lists and tables.
5. **Resolve the entity.** One brand name, `sameAs` to Knowledge Graph pillars,
   contact details, a real `/about`.
6. **Re-run `geo_audit` and compare.** The score is deterministic for a given
   page, so a diff is meaningful evidence, not a vibe.

---

## 5. Scope and limits

- **Rubric v1 (8 categories).** The upstream model also ships a v2 rubric with a
  20-point Google AI readiness category; that is not implemented here. The v1
  rubric is the one published in the model's README and is stable.
- **No citation sampling.** "Does ChatGPT actually cite me?" needs a provider API
  key (Perplexity, OpenAI, Gemini, MiniMax, DeepSeek). This server does not call
  LLM providers, so it cannot answer that question — it measures readiness, which
  is the part you can control.
- **No JavaScript execution.** The auditor reads raw HTML, exactly like most AI
  crawlers. If the audit reports low word counts on an SPA, that is a real finding.
- **No CDN/WAF probing.** `fetch` uses one honest user agent; a 403 is reported as
  an HTTP error rather than guessed at.
- **Politeness.** `geo_audit_sitemap` audits sequentially and caps at 25 pages.
- **Not affiliated** with Auriti Labs or GeoReady; the rubric is credited above.

---

## 6. Where the code lives

```text
src/geo/
  config.ts          rubric weights, bot catalogue, thresholds, bands
  html.ts            dependency-free HTML reader
  http.ts            injectable fetcher (tests use a fixture, not the network)
  robots.ts          RFC 9309 robots parser
  sitemap.ts         urlset / sitemap index reader
  audit/*.ts         one module per category, each returns checks with evidence
  score.ts           breakdown, bands, prioritized recommendations
  audit.ts           full single-page audit
  site.ts            sitemap sampling and site-level rollup
  generate/*.ts      llms.txt, JSON-LD, robots.txt generators
src/tools/geo.ts     the five MCP tools
tests/geo.test.ts    25 tests, including a page that must score exactly 100
```
