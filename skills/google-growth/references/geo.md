# GEO — AI search readiness

Use this reference when the user asks whether AI engines (ChatGPT, Claude,
Perplexity, Gemini, Google AI Overviews) can read, understand or cite their site.

## Tools

| Tool | Use it for | Args |
|---|---|---|
| `geo_audit` | Score one page 0–100 with evidence per check | `url`, `includeAiDiscovery?` |
| `geo_audit_sitemap` | Find site-wide gaps, weakest pages | `url`, `sitemapUrl?`, `maxUrls?` |
| `geo_generate_llms_txt` | Produce `/llms.txt` from the sitemap | `url`, `sitemapUrl?`, `siteName?`, `description?`, `maxLinksPerSection?` |
| `geo_generate_schema` | Produce JSON-LD + `<script>` tag | `kind`, `name`, `url`, `description?`, `logo?`, `sameAs?`, `faqs?`, … |
| `geo_generate_robots` | Append-only robots.txt fix for AI crawlers | `url`, `sitemapUrl?` |

All five are read-only. None needs a write flag or `confirm=true`.

## Workflow

1. **Audit** `geo_audit` on the homepage. Report: score, band, the three or four
   categories with the most recoverable points, then the fix list in the order the
   tool returned it (critical → high → medium → low).
2. **Site check** `geo_audit_sitemap` with `maxUrls` ≤ 10 unless the user asks for
   more. Lead with `missingAcrossSite`: a check failing on most pages is a template
   or server problem, not a page problem.
3. **Generate** only what the audit says is missing:
   - `llms.found` / `llms.*` → `geo_generate_llms_txt`
   - `schema.*` → `geo_generate_schema` (one call per type)
   - `robots.*` → `geo_generate_robots`
4. **Verify** with `geo_audit` again after deployment and compare the breakdown.

## How to read the result

- **Score bands:** 86–100 excellent · 68–85 good · 36–67 foundation · 0–35 critical.
- **`points`** on a recommendation is what fixing it recovers. Never reorder by
  opinion; the server already sorted by priority and recoverable points.
- **Blockers** (`meta.x_robots_noindex`, `meta.noai`) have `points: 0` but come
  first because they make every other fix irrelevant.
- **Evidence is literal.** Quote the check evidence (bot names, word counts, schema
  types) instead of restating it as an estimate.

## Hard rules

- Do not claim an AI engine cites the site. This server measures **readiness**; it
  never queries ChatGPT, Perplexity or Gemini, so citation claims would be invented.
- Do not overwrite a deliberate `Disallow` for an AI bot. `geo_generate_robots`
  reports blocked bots (`blocked`) and leaves the existing rules intact; tell the
  user which rule blocks which bot and let them decide.
- Do not invent `geo_audit` numbers. If the page returns 403 or times out, report
  the HTTP status and stop.
- Generated `llms.txt` and JSON-LD are **content**, not deployments. Say where to
  put the file (`/llms.txt`, `<head>`) and let the user ship it.
- `geo_generate_schema` with `kind: "faq"` requires real question/answer pairs.
  Ask the user for them rather than inventing FAQ copy.

## Fix order that actually moves the score

| Order | Fix | Typical gain |
|---|---|---|
| 1 | Remove `noindex` / `noai` | unblocks everything |
| 2 | Explicitly allow `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`, `Googlebot`, `Applebot` | robots 5 → 18 |
| 3 | Publish `/llms.txt` + `/llms-full.txt` | llms 0 → 10–18 |
| 4 | Add Organization + WebSite + FAQPage JSON-LD, rich attributes | schema 0 → 8–16 |
| 5 | Front-load an answer with a number, add H2/H3 and a table | content 0 → 8–12 |
| 6 | One brand name + `sameAs` pillars + contact details | brand 0 → 7–10 |
| 7 | `/ai/summary.json` and friends | discovery 0 → 6 |

## Reference

Full rubric, CLI examples and limits: `docs/GEO.md` in the repository.
