# Changelog

## Unreleased

### Added

- LOC-01–24 deterministic evidence rules; operator-configured tenant-specific GBP profile/review reads; durable private Node-RED jobs; supervised phone/URL publication with separate approval, conflict checks and readback. FR/EN console, tests and activation guide included. Live Google access and publication remain opt-in.

- Offline-first global/local SEO workspace: tenant-scoped registry previews, CSV/JSON imports, exact local access grants, deterministic rank metrics and comparisons, durable manual actions with independent approval, and scoped JSON exports.
- Free FR/EN local presence planner for physical, service-area and web-only businesses. The public free planner introduces no paid provider or external publication. See `docs/product/GLOBAL-LOCAL-SEO.md` for remaining specification scope.
- FR/EN regression coverage, locale-aware console number formatting and repaired console text encoding.

- **Richer brand profile in guided onboarding**: `/api/console/onboarding/profile` now prefers the JSON-LD `name` (source shown in the wizard: “name read from structured data”), falls back to `og:site_name`, then `title`; description falls back meta description → og:description → schema; and surfaces `lang` and detected schema types as hints in the wizard. No LLM, no paid API — pure HTML reading.
- **Keycloak multi-tenant for GTM Growth clients**:
  - Keycloak 26 Organizations, one per client, in the shared realm `gtm-growth`, with an optional dedicated realm `tenant-<id>`.
  - Tenant resolved from the token (`organization` claim plus `/tenants/<id>/<role>` groups, or the issuer for dedicated realms).
  - Strict API scoping of domains, GSC properties, leads and PDF reports.
  - Roles `tenant-admin`, `tenant-user` and `platform-admin`.
  - Provisioning through the Keycloak Admin REST API (`npm run tenant:provision`, `POST /api/platform/tenants`), with organization, groups, redirect URI, optional IdP (Google, Microsoft Entra, OIDC, SAML) and an invite email for the first admin (password and TOTP).
  - Public discovery `GET /api/tenants/discover` by email domain, subdomain `<client>.gtm.kayroslab.com` or `?tenant=`.
  - `gtm-growth` Keycloak theme, "Mon compte" link to the account console, tenant switcher and branding in the console.
  - Isolation tests.

- **Live console `/console/` with Keycloak SSO**: OIDC Authorization Code + PKCE (realm `gtm-growth`, public client `gtm-console`, role `console-user`); `/api/console/*` validates bearer tokens via JWKS. Keycloak 26 (production mode, Postgres) added to the VPS compose with realm import and an `auth.kayroslab.com` Nginx vhost.
- **Phase 1**: Sitemap (map, GEO audit, builder), GEO (citability, llms.txt validate/generate/drift, AI robots, schema), Performance (PageSpeed, CrUX, page weight).
- **Phase 2**: Search (queries, trends, pages losing clicks, URL inspection), keyword opportunity score and clustering from GSC, calculators (CTR, traffic value, ROI, budget), PDF export.
- **Phase 3**: technical audit crawler (canonical, Hn, redirects, broken links, duplicates), SERP preview, title/meta/outline generators (templates or self-hosted Ollama). No paid APIs.

## 0.22.0 — 2026-11-04

### Added

- **GeoSuite toolkit ports (MIT)**: poppy_check and poppy_generate for /.well-known/poppy.json (Personal Agent Protocol draft 0.3, including the RFC 9728 / RFC 8414 chain), and geo_sitemap_build to crawl a site and emit a sitemap.xml. CLI: poppy-check, poppy-generate, sitemap-build. Credited to Matteo Perino and GeoSuite.
- **Analysis console** on the landing page: five tabs (Overview, GEO, Search, IndexNow, Tracking) combining the audit, citability, IndexNow and tracking signals in one surface, with the sample rows labelled.
- **Toolkit section** mapping the five GeoSuite tools to what runs here.

### Changed

- IndexNow has no dedicated section or nav entry: it is a card in Solutions, with the key generator inline.
- Tool count 93 → 96.

## 0.21.0 — 2026-11-04

### Changed

- **Rename to gtm-growth, everywhere**: package name and both binaries, MCP server id, skill directory (`skills/google-growth` → `skills/gtm-growth`), Grok plugin directory, Worker name (`gtm-growth-api`), install paths, and all 129 identifier occurrences across 28 files. The prose brand was already **GTM Growth**; this closes the remaining gap so no `google-growth` string survives in the repository.
- README rewritten around the current surface: a "What's new" table, a full **IndexNow & Bing** explainer (protocol, four steps, key-file rules, response codes, what ships, operating rules), the IndexNow tool table and an IndexNow rollout workflow.

### Fixed

- **The six IndexNow tools were never registered in the MCP registry.** `indexnow_keygen`, `indexnow_verify`, `indexnow_submit`, `indexnow_readiness`, `indexnow_explain` and `analysis_board` existed, were documented and worked in the CLI, but `src/tools/index.ts` never imported them — MCP clients saw 87 tools instead of 93. Registration added, and `tests/tool-registry.test.ts` now fails if a documented tool is missing from the registry.

### Notes

- Renaming the Worker creates a **new** Cloudflare Worker on the next deploy; the previous `google-growth-api` stays orphaned until it is deleted.
- MCP clients that stored the server under the key `google-growth` must be updated to `gtm-growth` (see `docs/CLAUDE_SETUP.md`, `docs/CODEX_SETUP.md`, `.mcp.json`).

## 0.20.0 — 2026-11-04

### Added

- **IndexNow (Bing, Yandex, Seznam, Naver)**: `src/indexnow/client.ts` generates keys inside the protocol grammar, builds the key file and its headers, verifies that the published file contains the key, and submits up to 10 000 URLs in one POST. Every documented status (200, 202, 400, 403, 422, 429) is translated into a meaning and a fix.
- **IndexNow readiness panel** — 0–100 outside the GEO rubric: key grammar (10), key file published (35), file contains the key (10), Bing verification (10), Bingbot allowed (15), sitemap declared (10), HTTPS (10).
- **`analysis_board`** — one payload combining GEO, citability, platform readiness and IndexNow, with a ranked action list. IndexNow blockers rank above GEO points because a blocked crawler or a missing key file makes every other indexation fix worthless. Deterministic ordering, impact = the check's own weight.
- MCP tools: `indexnow_keygen`, `indexnow_verify`, `indexnow_submit` (requires `confirm=true`), `indexnow_readiness`, `indexnow_explain`, `analysis_board`.
- CLI: `indexnow-keygen`, `indexnow-verify` (exit 1 on a bad key file, so it works in CI), `indexnow-submit`, `analysis-board`.
- Landing page: an **IndexNow section with a browser-side key generator** — key, file name, URL, content, `.txt` download and the exact `curl` — run locally, nothing sent anywhere.
- `docs/INDEXNOW.md`: the four-step architecture, the data flow into the board, the customisation paths and the operating rules.

### Changed

- Nav gains an **IndexNow** entry on both language pages; the free-read FAQ sentence about "never fetching the page" now describes the two layers accurately.

### Notes

- A 200 from IndexNow means *received*, never *indexed* — the tool says so in every response.
- Google does not participate in IndexNow; the board never implies otherwise.

## 0.19.0 — 2026-11-03

### Added

- **Cloudflare Worker** (`src/worker/index.ts`, `wrangler.toml`): the same two public routes as the Node server — `POST /api/free-read`, `POST /api/lead`, `GET /health` — from the same shared modules. 96 KiB bundle, no Node built-in in the graph.
- `docs/WORKER.md`: deploy, KV bindings, CORS allowlist, rate-limit rule, guard table and the differences from the Node server.
- `npm run site:api -- <url>`: writes the `gg-api` meta tag in both language pages, so pointing the site at a deployed Worker is one command.
- `tests/worker.test.ts` (13 tests): private-host guard, CORS echo, rate windows, 201/400/202 paths, oversized bodies, free-read tables, metadata-address refusal.

### Changed

- `src/geo/http.ts` and `src/geo/robots.ts` are Buffer-free (`TextEncoder`/`TextDecoder`), so the audit runs unchanged on `workerd`.
- Lead validation moved to `src/leads/validate.ts` (no `node:` imports); `store.ts` keeps the filesystem append and re-exports for existing callers.
- `npm run typecheck` now checks two projects: the Node build and `tsconfig.worker.json`.

### Fixed

- The Worker no longer 500s when the local runtime exposes `caches` without a usable `default` cache; caching is strictly optional and failures are logged.

## 0.18.0 — 2026-11-03

### Added

- **Contact form without a mail client**: `POST /api/lead` validates, normalises and appends the request to JSONL (`LEADS_PATH`), with an optional webhook forward. The page posts in-place and only shows “sent” after a 2xx; a failed post is queued on the device (`localStorage`) and flushed on the next visit. Honeypot, 1.2 s minimum, 5 posts/min per IP.
- **Enriched free read**: `POST /api/free-read` returns the GEO score, the three fixes that move it most, three SEO tables (metadata, content structure, links/media/structured data), a GA4 measurement-readiness table and a Search Console indexation table — all measured on the fetched HTML, `robots.txt` and sitemap.
- **Traffic report previews**: GA4 and GSC performance tables ship with `sample: true` and a visible badge until a property is connected; the same code path serves measured rows.
- `geo-free-read` and `leads` CLI commands; `docs/PUBLIC_API.md` documents both routes, the guards and the environment.
- Free-read page: seven data tables rendered from the API payload, `gg-api` / `gg-form` meta switches so a static deploy can still send the form.

### Security

- The public read refuses non-`http(s)`, credentials in the URL, and any host resolving to a private, loopback, link-local or metadata address (IPv4 and IPv6, `::ffff:` mapped included); 12 s timeout, capped bodies, per-IP token buckets and a 10-minute response cache.

### Changed

- Free plan now advertises the SEO, GA4 and Search Console tables; the hero hint no longer claims the read only inspects the URL.
- `site/app.js` lost its `mailto` fallback entirely; `scripts/check-site.mjs` fails the build if one comes back.
- Lead form wired to Formspree (`gg-form` meta) so the published static site sends requests without a mail client; form-backend error payloads are surfaced instead of a bare status code.

## 0.17.0 — 2026-11-02

### Added

- `geo-report` CLI — a client-ready A4 PDF generated with pdfkit, no headless browser: cover with the brand mark, score and projection, executive summary, colour-coded category bars, five-platform table, the 12 citability methods, the ordered action plan and a method/limits page
- PDF **dashboard page**: score trajectory (cumulative points, one step per fix), category bars, five-engine radar, citability grid and a band ladder — vector, and every value read from the audit
- PDF **entity-graph page**: present and missing schema nodes, the exact `sameAs` block to paste, and a four-step path to a resolved entity
- Colour language shared by HTML and PDF: green at 80+, amber at 60+, red below; pictograms drawn as vectors (search, bars, layers, list, shield, spark, check, alert, target, bot) so no icon font is shipped
- HTML sample report: six data-driven SVG figures regenerated from the audit snapshot with `npm run figures` (trajectory, radar, category bars, citability, band ladder, entity graph), a download band and a download link on both landing pages
- Sample PDF at `site/reports/opendpe.pdf` (9 pages, ~43 kB), linked from the HTML report, the landing pages and `llms.txt`
- `tests/pdf.test.ts` (multi-page `%PDF`, with and without platform/citability data) and `tests/charts.test.ts` (the trajectory reaches `score + recoverablePoints` exactly; band colours follow the published thresholds)

### Changed

- New brand mark across the site, favicon, sample report and PDF cover: PNG at 512/128/64 px, white tile on dark surfaces, embedded in the PDF cover
- README, `docs/GEO.md` and the GEO skill document the PDF deliverable, its charts and `geo-report`

## 0.16.0 — 2026-11-02

### Added

- `geo_platform_readiness` — per-engine readiness for Google AI Overviews, ChatGPT, Perplexity, Gemini and Microsoft Copilot, derived from the same audit evidence; each platform returns a 0–100 score, a band, its signals and the main gap. CLI: `geo-platforms`
- `projectedScore` and `recoverablePoints` on every audit result and in the compact summary — an audit now states what the page would score if every failing check were fixed (capped at 100)
- Full sample report at `/reports/opendpe.html` with the raw JSON snapshot beside it, produced by `scripts/collect-sample.mjs` from a live audit of www.opendpe.net (71/100, projected 100)
- Proof section on both homepages with repository numbers (87 tools, 103 tests, 11 GEO checks, 22 GTM tools, 5 platforms, Apache-2.0)
- npm packaging: `files` whitelist, `prepublishOnly` (build + tests), public publish config, 0.16.0 tarball validated with `npm pack --dry-run` (228 kB, 316 files).

### Notes

- Publishing to npm requires the owner's registry credentials; until then `npx` instructions point at the repository build.
- Site copy and docs now say 87 tools / 11 GEO checks.

## 0.15.0 — 2026-11-01

### Added

- French version of the landing page at `/fr/`: translated copy, French metadata, JSON-LD and FAQ, its own canonical URL
- Real `hreflang` pair (en / fr / x-default) on both pages, plus a header language switch that works without JavaScript
- `site/i18n.js` — dictionary for the strings the browser generates (10 URL checks, verdicts, validation errors, lead-form messages); `app.js` selects it from `<html lang>` and `preview.js` accepts it as an argument
- `sitemap.xml` lists both URLs with `xhtml:link` alternates; `llms.txt` links the French page
- `scripts/check-site.mjs` now validates the language pair, hreflang links and `/fr/` relative assets; `tests/site.test.ts` covers the French dictionary

### Changed

- Site docs explain the two-page structure and how to add a language

## 0.14.0 — 2026-11-01

### Added

- Static landing page in `site/`, published to GitHub Pages by `.github/workflows/pages.yml`: hero, URL-first free read, six solution cards, GTM measurement section, plans, lead form, FAQ and JSON-LD
- Free read: 10 URL-shape checks computed in the browser (`site/preview.js`), with copy that states plainly it never fetches the page
- Lead capture in two modes: JSON POST to a configurable endpoint, or a prefilled `mailto:` fallback — no backend is bundled
- The site ships its own `robots.txt`, `sitemap.xml` and `llms.txt`
- `scripts/check-site.mjs` (hooks, JSON-LD, canonical, sitemap, local assets) and `tests/site.test.ts` (7 tests); CI now runs the site check

### Changed

- README links the site, its docs index and the project layout

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
- `docs/GEO.md` and `skills/gtm-growth/references/geo.md`

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
