# Changelog

## Unreleased

### Citation gaps in the visibility panel (R2)

- The citation-source gap analysis delivered with the observation model is
  now surfaced in the console panel: a "Citation gaps" section renders next
  to the cited-domains list for every reader, from the read-only
  `/ai-visibility/citation-gaps` route. It displays the panel-scope note, the
  observation and mention totals (observations, with citations, citations,
  prompts mentioning the brand, prompts mentioning the brand with an
  own-site citation) without summing shares, per-category bars (own site
  always shown — the benchmark's own-zero is a finding, not an absence —
  plus competitor, Reddit, YouTube, LinkedIn, Wikipedia, other web), the
  top cited hosts with a clickable example link (`noopener noreferrer`),
  and one evidence row per answer that mentions the brand without an
  own-site citation, with the stored proof and the cited URLs.
- A brand without a declared website keeps unknown evidence honest: the
  section shows the standing "declare the brand website" note, renders no
  gap row and shows `—` instead of a zero share. If the view fails, the
  report still renders unchanged.

### Visibility panel: tracker import and share-of-voice UI (R1)

- The visibility panel now exposes the normalised tracker imports in the
  console itself: tenant administrators open "Import a tracker export",
  choose the provider (Meteoria, Peec AI, Qwairy, Profound) and format, paste
  the exported CSV/JSON contents and declare the brands. The same
  review-then-commit discipline as the JSON import applies — nothing is
  stored before a successful preview, any edit re-disables the commit, and
  the preview feedback lists the recognised count, engines, ignored columns
  and normalised dates with the standing measurement warning. The stored
  dataset becomes the panel's selected dataset.
- A "Share of voice per engine" section renders alongside the report for
  every reader of the panel (not only administrators): one bar per engine
  for the active brand, an all-engines row, and `null` shares rendered as
  an explicit `—`. The section keeps the measured scope note (proportions
  of the stored panel only, not engine market share, not consumer
  sessions) and disappears without breaking the report when the view is
  unavailable.

### Normalised tracker imports and share-of-voice views (R1)

- Datasets the tenant already owns from a dedicated AI-visibility tracker can
  now be imported without any re-typing: CSV or JSON exports from **Meteoria,
  Peec AI, Qwairy or Profound** are mapped onto the canonical observation
  model through two console routes, `import-tracker-preview` and
  `import-tracker`. The tenant declares the brand (name, aliases) in the
  request; the export never re-declares what counts as the tenant's own
  brand, so the declaration stays explicit and tenant-verified.
- The mapping is strict and bilingual (English and French export headers):
  documented field aliases per canonical column (prompt, answer, date,
  engine, citations), an RFC-4180 CSV parser (quotes, escaped quotes,
  embedded line breaks, CRLF, UTF-8 BOM) and accepted date forms (ISO,
  ISO date, French `DD/MM/YYYY`). One malformed row refuses the whole
  import with its spreadsheet row number; unknown columns are reported
  (`ignoredColumns`), never silently repurposed; partial dates are counted
  (`normalisedDates`) so the preview shows exactly what was normalised.
  Imports stay bounded (5 MB text, 1000 answers) and tagged provenance
  `imported`; no provider call, no sampling, no invented data.
- New read-only route `share-of-voice`: per-engine proportions over one
  stored panel. For each engine (and overall): responses, mention counts per
  brand, share of voice (mentions within that engine's own mention total),
  visibility (mentions over responses) and sentiment per brand. An engine
  without mentions reports `null`, never a silent zero, and the response
  carries the standing note: this is not engine market share and not
  consumer sessions.
- Mentions are counted at most once per response and per brand, and mentions
  rejected through human review stay excluded from every share.

### Scheduled J+14/J+28 white-label client follow-ups

- Follow-up sending is now possible, but only through an explicit double
  opt-in: the agency chooses `followUp: "auto"` on a single invitation
  (strictly validated; `none` remains the default and anything else is
  rejected as `invalid_follow_up`), and the operator sets
  `REPORT_FOLLOW_UPS_ENABLED=true` on top of the existing report-access and
  SMTP configuration. Without both, nothing is scheduled or sent.
- The recipient address is stored AES-256-GCM sealed under an HKDF-derived
  key bound to the report-access secret (purpose-separated from codes and
  sessions); it is never kept in clear and never logged or surfaced through
  any API.
- The ops scheduler drains due follow-ups once per pass (bounded batch, after
  tenant jobs): it re-measures the exact same URL with the same public
  method, refuses a snapshot from another page (`scope_mismatch`), renders
  the fresh snapshot as one branded PDF through the existing A4 pipeline and
  sends the bilingual (fr/en) white-label email with the PDF attached over
  strict TLS. The fresh snapshot is kept on the row as dispatch evidence.
- Failures are bounded and legible: each milestone retries at most three
  times, then stays terminal `failed` with its last error; the plan is unique
  per (recipient, page, milestone) so a repeated identical invitation never
  doubles a send; rows are kept 90 days, beyond the 7-day invitation window.
- `GET /api/report-access/follow-ups` shows the verified recipient their own
  plan (milestones, due dates, pending/sent state, attempts) — and nothing
  else: no address, no cross-recipient data, no summed metrics. The scheduled
  reports keep the same anti-summing contract as the first report: one
  scope, one snapshot, no totals.

### Impact timeline, J+14/J+28 follow-ups and white-label client exports

- Added the per-scope impact timeline: `GET /api/audits/:id/timeline` builds,
  at read time and per requestor only, the consecutive pairwise comparisons of
  the requestor's own completed snapshots of that URL (bounded to the last 12
  retained observations). Every step carries its observation dates, grid
  versions, measured-coverage fractions and an `explicit confidence`
  (`high`/`medium`/`low`) with machine-checkable reasons: steps downgrade when
  the grid version changed, the observation window is under one day or over a
  year, or measured coverage is partial; a non-comparable pair stays visible
  with its guard reason instead of being dropped.
- Reminders are surfaces, not actions: each timeline response carries the
  J+14 and J+28 follow-up dates computed from the latest observation (UTC
  calendar days, `upcoming`/`due`), each with a bilingual
  (fr/en) suggested action — re-run the same URL with the same method, then
  send the white-label client report in the client's language. Nothing is
  emailed or scheduled automatically.
- Impact counters are never summed: the timeline reports per-step outcome
  counters only; no totals across steps, scopes or clients are computed, and
  points and scores remain withheld. A snapshot from another page refuses the
  whole timeline (`scope_mismatch`).
- Added per-client white-label branding to the email-verified report exports:
  `POST /api/report-access/invite` accepts one strictly validated brand
  (`name`, optional `tagline`, optional `accentColor`; no URLs, no unknown
  keys, bounded strings) persisted with the invitation, and the existing
  A4 PDF/Markdown pipeline renders it — branded header band with
  luminance-checked ink, branded metadata and download filename — in the
  invitation's language. The export stays one snapshot per report in one
  language; aggregated or multi-client metrics are refused at runtime.
  Existing invitations keep the house GTM Growth identity (additive
  `brand` column).

### Double-approved WordPress writer with verified execution and rollback

- Completed the persisted Apply Mode execution pipeline (ADR §3): `apply_attempts`
  and `apply_rollback_approvals` tables with a partial unique index holding at
  most one active attempt per tenant target, idempotency keys, HTTP status and
  written/verified digests, plus per-proposal hash-chained journal events for
  every state transition.
- Added the execution engine: on a backing-up drift check (observed digest must
  equal the reviewed proposal), an encrypted pre-write snapshot, an atomically
  consumed single-use approval, and a target-scoped attempt lock; the scoped
  writer is only invoked after the lock is held. A lost adapter ACK lands in
  `uncertain` and keeps the lock; a failing or mismatching re-inspection lands
  in `to_verify`; only a matching post-write digest yields `verified`.
- Added the rollback path: a second explicit re-approvable approval with a 5
  minute TTL, single-use consumption, snapshot retention checks and a
  drift-safe restore that never clobbers a target which moved on (the attempt
  ends `failed` and the encrypted snapshot is preserved); an already-restored
  target closes idempotently without a second write.
- Added the WordPress REST writer adapter (`title`+`content` only, never
  `status`/`slug`, JSON bodies bounded, errors bounded, credentials never in
  logs) and opt-in console mutation routes (`/apply/wordpress-post`, `/approve`,
  `/execute`, `/rollback`, `/attempt`) served by per-tenant `WP_*` environment
  credentials hostname-bound to the registered target. The default export is
  fail-closed: every mutating route refuses until the server opts in.
- Tests cover the full write→verify→rollback lifecycle, drift rejection without
  consuming the approval, lost-ACK uncertainty with the kept lock, `to_verify`
  on tampered writes, snapshot-preserving rollback failures, target locks
  across proposals, route fail-closure, and the wire contract of the writer
  on the real SQLite registry.

### Before/after public audit comparisons

- Completed audits served by `GET /api/audits/:id` now carry an additive
  `comparison` computed at read time from the requestor's own earlier
  completed snapshot of the same URL (same owner digest in the PostgreSQL
  ledger); it is never persisted in the snapshot and cross-requestor pairing
  is impossible by construction.
- Comparisons require the same method, scope and observed source URL;
  otherwise the answer is `not_comparable` with an explicit reason
  (`no_previous_snapshot`, `method_mismatch`, `scope_mismatch`).
- Matching snapshots expose outcome counters (improved, regressed, unchanged,
  newly observed/unavailable/applicability), the changed controls with their
  previous and current public outcomes, plan evolution by stable action id,
  and both observation dates.
- Public outcomes only (`pass`, `review`, `unknown`, `not_applicable`): earned
  points and scores remain withheld and the stored `report360.comparison`
  contract stays `null`. Tests cover the pure classifier plus requestor, URL
  and pending-state isolation on the real PostgreSQL ledger.

### Isolated GEO renderer and fail-closed HTTPS egress gateway

- Added the verified-domain rendering pilot (PR #29): a one-shot Playwright
  renderer that authorises the target and every in-page request against the
  tenant-domain grant read-only, an HTTPS CONNECT egress gateway admitting only
  the verified hostname on 443 at public IPv4 addresses (DNS answers resolved
  and inspected before connecting), and a trusted verification transport that
  pins public IPv4 addresses, forbids redirects and bounds responses for the
  operator CLI.
- Added the isolated deployment topology: internal Docker bridge with isolated
  gateway mode, one-connection egress service, resource-capped read-only
  containers and the Playwright seccomp profile, plus an offline Chromium
  sandbox smoke and a CI network-boundary assertion that host, direct-internet
  and cloud-metadata egress stay blocked. No production deployment, public API
  route or queue consumer is part of this merge.
- Closed PR #30 as superseded after a full audit against current `main`: the
  42-control scoring contracts and llms evidence enrichment already exist
  byte-identical on main, and the free-read/site integration it proposed was
  replaced by the newer public coverage model; the mapping is recorded in the
  pull request.

### AI observation provenance and citation gaps

- Added observation provenance to stored AI-answer panels: `imported`
  (tenant-reviewed import) or `collected` (explicit bounded provider API run),
  with pre-existing datasets summarized as `unverified` instead of being
  silently relabeled. Re-importing stored observations preserves their origin.
- Added citation gap analysis for one stored panel: every cited URL is
  classified (own declared website, other tracked brands, Reddit, YouTube,
  LinkedIn, Wikipedia, web) with citation counts, cited prompts and share of
  citations, top cited hosts, and a bounded list of prompts that mention the
  brand while citing other sources. Exposed as the read-only
  `/ai-visibility/citation-gaps` console route with the same dataset, source
  and brand filters as the report.
- Evidence rules kept explicit: a brand without a declared website leaves the
  own-source gap unknown (never zero), and a response without citations is
  absent evidence, not a gap. No provider call, market sampling or engine
  market-share estimate is added; the console panel UI is outside this
  increment. Specification:
  `docs/specs/AI-VISIBILITY-OBSERVATION-MODEL-v1-2026-11-18.md`.

### Reliable public audit pilot

- Added transactional PostgreSQL admission/outbox, a dedicated BullMQ/Redis queue,
  bounded separate workers, stable request IDs, retries and stale-write fencing.
- Added resumable EN/FR browser progress and reuse of the exact server snapshot
  for email-code reports. Invitation quotas now reserve before reads/SMTP and
  successful request replays reuse the existing invitation.
- Added protected Prometheus monitoring, dependency/worker readiness, isolated
  OVH services and real PostgreSQL/Redis integration CI. Updated core images and
  CI to maintained Node 24. Remaining module-store migration and live provider
  activation are outside this increment; see the audit pipeline runbook.

### Free report 360° (base merged; production qualification pending)

- Added a versioned, evidence-led public `report360` payload with five distinct
  SEO/GEO/AI/CRM/Social pillars, explicit `null` for unmeasured scores, dated
  source proofs, suggested owners/effort/change risk and conditional connection
  steps. No new target fetch or customer credentials.
- Added the bilingual executive view, filterable action plan, three-step guides,
  source excerpts (not screenshots) and A4 browser Print/Save as PDF layout.
  Preserved the current free-read diagnostics, local SEO, journey and sign-in.
- Added an opt-in saved-snapshot workflow: request a one-time report access code
  by TLS SMTP, return to `/report/`, enter email and code, then unlock the
  bilingual HTML report and direct server-generated A4 PDF/Markdown exports.
  Session cookies are HttpOnly, Secure and SameSite Strict; OTPs are HMAC-peppered,
  single-use, short-lived and attempt/rate-limited. The database persists on the
  app data volume; mail delivery remains disabled until SMTP is configured.
- Documented scope and release gates in
  [the free-report plan](docs/product/FREE-REPORT-360.md); historical comparison,
  real AI citations and private CRM signals are still out of scope.

### Documentation and journey integration

- Reorganised the README into a short entry point, a documentation hub, equally detailed marketing/technical tracks and a shared five-stage customer journey. Added six Mermaid diagrams, an evidence/KPI guide, integration map, operations guide and prioritised repository audit.
- Centralised source/activation/release status and corrected unsupported deployment-success claims against GitHub Actions. Preserved specialist guide paths and explicitly labelled historical/planned scope.
- Aligned EN/FR journey catalog copy with actual Product/Service extraction and explicit context confirmation. Removed superseded heading-match/manual-outline claims from current guides.
- Documented existing commerce aggregation/attribution limitations and the general MCP operator trust boundary; runtime behavior is unchanged.
- Added a local Markdown path/anchor check to the package and CI.


### Added

- Journey-led FR/EN website: five stages, four starting paths and a searchable catalog of 31 functions, each with benefits, outputs, prerequisites and a real console destination. Detailed examples remain expandable and linkable.
- Shared console purpose/next-action guidance and allowlisted feature destinations preserved across sign-in without changing workspace permissions. The landing read now highlights up to three evidence-backed fixes and continues to the free customer-question explorer.
- Clear availability for optional Slack, disabled Gemini collection, preview-only Apply Mode, future GEO v2 and inactive Cloud billing; pilot CTAs now lead to contact rather than an unsupported billing route.

- Contextual FR/EN data assistant in the public scan, onboarding and every authenticated console section; personal role, goal, audience, lifecycle stage and optional 28-day target. Guided answers use tenant-scoped sources with explicit periods and missing-data states, without model credentials.
- Optional Eve Slack agent with five curated read-only tools, exact workspace/channel/user bindings, signed tenant bridge, durable replay protection and tenant-preserving console links. Live Slack installation and credentials remain separate from the OVH core release.
- **E-commerce connectors (Shopify & PrestaShop)**: store-scoped idempotent ingestion, sealed credentials, signed webhooks, catalogue/order sync and four read-only MCP tools. Current CRM integration adds a durable commerce delivery outbox and store-scoped customer pseudonyms. The current [capability register](docs/journey/CAPABILITIES.md) and [measurement limitations](docs/marketing/MEASUREMENT.md) supersede the original summary's complete-GA4-join and missing-referrer claims. A pseudonymous customer key is not anonymous data; CRM labels/notes/source references remain retained content.
- **CRM**: native contacts or a client server plugin; exact scoped identity assertions, source-labelled immutable events, clickable FR/EN timelines, explicit roles, collection pause/erasure and Shopify/PrestaShop order observations. Named vendor adapters and live credentials remain separate setup.
- **Social**: product-grounded campaigns/variants, independent reviews, explicit scheduling, Postiz dispatch/readback, sourced observations, creator vetting and manually sent reviewed outreach. Optional ZenML worker/provider activation is separate.

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
