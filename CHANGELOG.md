# Changelog

## 0.13.0 — 2026-11-01

### Added

- `geo_citability` — a second 0–100 score over 12 content methods (statistics, quotations, lists/tables, question headings, answer-first, paragraph and sentence length, outbound citations, authorship, freshness, FAQ depth, entity clarity), each with its own evidence
- `geo_crawler_access` — per-bot matrix grouped by training / search / user tier, with wildcard-only access and blocked citation bots called out
- `geo_llms_drift` — compares the deployed `/llms.txt` with the sitemap (stale links, missing pages, share of links that resolve); `geo-drift` exits 1 when links are stale so it can gate a deploy
- `geo_content_risks` — defensive scan for hidden text, LLM instructions in copy or comments, invisible Unicode, CTA overload, thin copy and keyword stuffing
- `geo_positioning` — on-page competitive positioning against 1–5 URLs: shared vocabulary, themes unique to you, themes only competitors use, overlap score (public copy only)
- CLI: `geo-citability`, `geo-crawlers`, `geo-drift`, `geo-risks`, `geo-positioning`

### Changed

- README, `docs/GEO.md`, `docs/CLI.md` and the skill references now document the ten GEO tools
- `tests/geo-extras.test.ts` covers the five additions (12 tests)

## 0.12.0 — 2026-11-01

### Added

- `gtm_audit_installation` — page-level audit of a GTM deployment: container id, loader in `<head>`, `<noscript>` fallback, dataLayer order, duplicate containers and the consent default (advisory). Returns each check with its evidence and a 0–100 score over the required checks; no Google credentials needed
- `gtm_generate_snippet` — deployable `<head>` loader and `<noscript>` body fallback for a container id, with optional dataLayer initialization and default consent state; rejects ids that are not `GTM-XXXXXXX`
- `docs/GTM_IMPLEMENTATION.md` — the supplied installation guide, with every step mapped to the tool that verifies it
- `tests/gtm-installation.test.ts` — 16 fixture-based tests (missing noscript, loader in body, dataLayer order, duplicate containers, snippet generation, unreachable page)

### Changed

- README documents the installation check workflow and the two new tools

## 0.11.0 — 2026-11-01

### Added

- GTM reverse lookups: `find_tags_by_trigger` (what a trigger fires or blocks), `find_tags_using_variable` (tags referencing a variable, with an `unused` flag), `detect_duplicate_tags` (same GA4 event fired twice, or several configuration tags sharing a Measurement ID) and `get_built_in_variables`
- `src/utils/gtm-helpers.ts` — pure matching logic for variable references, trigger lookups and duplicate detection, covered by `tests/gtm.test.ts`

### Changed

- `docs/GTM_INTEGRATION.md` now reflects Phase 2 as implemented: all Must **and** Should tools are shipped, and the remaining edge cases are named explicitly
- GTM tool surface is 20 tools; the four new ones map to GTM-15, GTM-16, GTM-19 and GTM-20 in the spec

## 0.10.0 — 2026-10-30

### Added

- GEO / AEO capability: `geo_audit` scores a URL 0–100 across 8 categories (robots.txt 18, llms.txt 18, schema 16, meta 14, content 12, brand & entity 10, signals 6, AI discovery 6) and returns per-check evidence plus fixes ordered by recoverable points
- `geo_audit_sitemap` samples up to 25 sitemap pages and reports the site average, weakest pages and the checks failing across the site
- Generators: `geo_generate_llms_txt`, `geo_generate_schema` (website/organization/faq/article/product/localbusiness) and `geo_generate_robots` (append-only; blocked bots are reported, never overridden)
- CLI: `geo-audit`, `geo-sitemap`, `geo-llms`, `geo-schema`, `geo-robots`
- `npm run demo:geo` — offline before/after demo (9 → 96) used by the README example
- `docs/GEO.md` and `skills/google-growth/references/geo.md`

### Fixed

- `npm run typecheck` and `npm run build` exit 0 again: the googleapis type drift in CrUX, PageSpeed and Search Console is resolved. The Search Analytics REST docs name the request field `type`, while the generated schema still ships the deprecated `searchType` alias — the request body is typed with both
- CI runs lint, tests and an offline GEO smoke (`scripts/smoke-geo.mjs`) in addition to typecheck and build, matching what the README documents

### Notes

- All GEO tools are read-only: they fetch the same public URLs an AI crawler reads and compute locally, so no write flag or `confirm=true` is required
- The rubric is adapted from the open-source geo-optimizer-skill model (MIT). It is an independent TypeScript implementation inside this server, not a fork, and ships the published v1 rubric (the 20-point Google AI readiness category of v2 is not implemented)
- No LLM provider is called, so the audit measures readiness and never claims an engine cites the site
- `package.json` now matches the skill version (it was still 0.8.0 while the skill was 0.9.0)

## 0.9.0 — 2026-10-21

### Added

- Detailed cross-channel dashboard workflow with period-over-period KPI scorecards, data-confidence checks, 10+ watch points, and exactly three short-, medium-, and long-term priorities
- LLM evidence-to-hypothesis analysis sequence and safe formulas for scenario-based impact estimates
- Dashboard example template and clearer distinction between measured outcomes, hypotheses, and forecasts

### Notes

- This release updates the agent skill and its packaging metadata; the MCP server tools and API surface are unchanged

## 0.7.0 — 2026-10-16

### Added

- Search Console tools: sites, sitemaps, Search Analytics, URL inspection, gated sitemap submit
- Google Indexing API tools (read metadata, gated URL_UPDATED / URL_DELETED)
- PageSpeed Insights and Chrome UX Report (CrUX) tools
- Marketer-oriented skill workflows (briefing, SEO & performance audit)
- Claude Code and Codex install guides, plus `scripts/install-skill.sh`
- CLI commands: `list-search-sites`, `search-overview`, `top-queries`, `inspect-url`, `pagespeed`, `crux`

### Changed

- README, GROK_SETUP, DEPLOYMENT, and PRESENTATION cover the new domains
- `.env.example`, `.mcp.json`, `.grok/config.toml`, and `docker-compose.yml` document the new env vars
- Package version aligned with the skill at `0.7.0`

### Notes

- Writes stay disabled unless the matching env flag is `true` and the tool receives `confirm=true`
- Indexing API is officially intended for job postings and livestream structured data
