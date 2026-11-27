# Changelog

## [Unreleased]

### Added

- On-entry bilingual GTM coach, goal-based next actions, illustrated customer
  journey and distinct colours for the five console areas.
- Contextual explanations for cards, fields, charts, columns and actions, showing
  origin, related workflows, effects and freshness without reading field values.
- Bounded live operations and GA4 realtime reads, with visibility/offline pause,
  stale-scope protection and explicit last-successful-read timestamps.
- Strict-CSP console-coach browser QA in FR/EN on desktop and mobile.

- Campaign Studio: evidence-backed, editable JointJS scenarios with synchronized
  graph, schedule and table views; dates, responsible roles, channel actions,
  dependencies, locks, checklists, budgets and sourced KPIs in FR/EN.
- Tenant-scoped durable drafts, optimistic version checks, immutable revisions,
  discussion, dependency rescheduling previews, reviewable restoration and exports.
- Local guided plans and explicit BYOK AI proposals through OpenAI, Claude,
  Mistral and Grok, with server validation, preserved human work and bounded usage.
- Pinned local JointJS assets, reproducible vendor validation and strict-CSP
  browser QA against the real planning handlers with synthetic data.

- Native AI tracker module (`ai-tracker`): dedicated SQLite storage
  (`ai_brands`, `ai_prompts`, `ai_runs`, `ai_mentions`, `ai_opportunities`,
  `ai_engine_state`, `ai_engine_settings`), official-API collectors for OpenAI,
  Anthropic, Gemini, Mistral and Perplexity (mode `api-approximation`), a native
  Playwright scraper per engine (mode `consumer-ui` — no stealth, no CAPTCHA
  bypass, clean stop on verification), a local Ollama judge (deterministic
  whole-word filter then strict JSON, version stored per judgement), metrics
  computed at read time (visibility, share of voice, sentiment, position,
  citations; `consumer-ui` and `api-approximation` series never mixed),
  readable opportunity rules (never concluding from a single run; GEO draft
  only after human validation), an idempotent worker (one run per day per
  prompt and engine, automatic pause after two consecutive failures) and MCP
  tools `ai_tracker.*` (reads plus `create_prompt` behind
  `AI_TRACKER_ENABLED` and an explicit confirmation). Fail-closed everywhere;
  raw answers are never truncated or deleted; prompts are validated server
  side against PII, secrets and injection.
- Bilingual console front `#ai_tracker` (Impact > Visibility) with five tabs:
  Board (per-mode visibility, share of voice, sentiment, engine health and the
  standing sampled-trend warning), Prompts (admin creation bounded to 500
  characters, pause/reactivate), Runs (cursor pagination, full raw answer,
  judgements by judge version), Opportunities (admin scan, GEO draft after
  validation, dismiss) and Engines (per-engine health and scraper activation
  behind the disclaimer). Integrated with the existing console patterns
  (`render.js` helpers, `L(fr,en)` i18n, `tab-icons.js`, existing CSS classes).
- Tenant-gated scraper activation with a versioned GTM Growth disclaimer:
  scrapers (`chatgpt`, `gemini`, `perplexity`, `bing-ai-mode`,
  `google-ai-mode`) are off by default for every tenant; a tenant admin
  activates one only after accepting the current disclaimer version
  (`GTM_TRACKER_DISCLAIMER_VERSION`), recorded per tenant and engine in
  `ai_engine_settings` (`accepted_by`, `disclaimer_accepted_at`,
  `disclaimer_version`). The server refuses activation without
  `disclaimerAccepted` or with an outdated version, the worker re-checks the
  current consent before each collection, and
  `AI_TRACKER_SCRAPER_<ENGINE>_ENABLED=false` locks an engine on a deployment
  even after acceptance. Official APIs and manual import remain available
  without the disclaimer.

### Fixed

- Replace the generic automatic setup modal with the nonblocking coach welcome;
  retain the setup wizard for explicit onboarding requests.
- Replace the static "Live" date with the time of a successful response, and
  retain source-specific observation dates and reporting delays.

- Serve the unchanged local JointJS bundle as `joint.js`, using standard
  JavaScript MIME handling so Campaign Studio loads on existing Nginx hosts
  without a live proxy configuration change.
- Include Claude and Grok in the seven-engine readiness table and use the xAI
  provider mark for Grok. Missing evidence remains unknown.

## [0.23.0] - 2026-11-19

### Added

- `gtm-growth doctor` checks the Node runtime, installed dependencies, S
QLite
  binding and optional PostgreSQL and Redis connectivity without emitting credentials.
- Release readiness checks align the CLI, agent skill, changelog and capability register.
  CI installs the actual packaged CLI in a clean directory and exercises its exit codes.

### Changed

- Migrate the repository and standalone Eve integration to pinned pnpm lockfiles.
- Dispatch CLI subcommands through `gtm-growth`. Keep the MCP server entry point
  for existing installations using `gtm-growth` with server flags or no arguments.
- Use exit status 1 for a failed audit gate and 2 for an audit that cannot run.

Release reference is available after the signed tag exists. [v0.23.0](https://github.com/Geoking2104/GTM-Growth/releases/tag/v0.23.0)

### OVH production deployment evidence (24 November 2026)

- Record the observed production deployment in the capability register's dated
  release-evidence section: OVH
  [run #61](https://github.com/Geoking2104/GTM-Growth/actions/runs/45451046004)
  on `main` (workflow_dispatch, `DEPLOY` confirmation, production review
  approved) completed successfully, fast-forwarding the production host from
  `e4d3718` (run #60, 20 November) to `73e9730`, 17 commits, with Docker
  rebuild and app/Keycloak readiness checks.
- Post-deploy public checks on gtm.kayroslab.com: `/health` 200, the EN homepage
  at the root and the FR homepage at `/fr/` serve the refreshed trust band and
  plan badges, console public-read pages and EN/FR reading guides return 200.
- Correct the stale public-read register row ("implemented in feature branch;
  not yet merged/deployed") to the observed deployed state, keeping
  authenticated client sessions, the optional GEO v2 renderer service, Apply
  Mode writers and live billing explicitly unverified.

### Third-party consultation refresh: professional README and commercial landing

- The project README is rewritten for external review: at-a-glance fact table,
  a five-stage capability map covering every shipped mod
ule, the four
  interfaces (bilingual console, public CLI, 100 documented MCP tool
  contracts, opt-in PAP agents), the enforced honesty rules, the OVH
  deployment kit, the reading tracks and an explicit status split between
  implemented, fail-closed-by-default and not-yet-implemented. The preserved
  legacy anchors are retained.
- The bilingual landing gains a commercial trust band before the plans
  (open source and self-hosted, proof on every figure, console/CLI/MCP
  interfaces, documented GDPR posture with the trust pack on GitHub) and each
  plan card now carries a positioning badge (self-hosted, popular,
  multi-client, custom) with hover elevation; the pricing lede is sharper
  while the pilot honesty contract stays verbatim (39/149, HT/TTC, Mollie not
  yet active, three contact CTAs).
- Site contracts unchanged and revalidated: shared layout with 324 dictionary
  keys per locale, 8 FAQ entries, 6 Ops stages, 3 roadmap phases, 7 toolkit
  levers, generated parity check and the structural EN/FR equality.

### Trust pack: partner-cost metering (R10, second increment)

- The partner-reported cost of every successful market-data call (volumes,
  SERP, local grid, backlink overview, link gap) is metered into the billing
  usage ledger: metric `partner-data-usd-micros`, integer micro-USD
  accumulated per account and UTC month, wired through
  `CloudAccess.meterPartnerCost` from the console composition root only when
  billing is configured. Measurement only: tenants are never billed from it,
  and the pricing decision stays a human one.
- Fail-honest bounds: a non-enrolled tenant, a tenant without a billing
  account, or an unknown/invalid cost is never metered; the partner-free
  disavow export meters nothing; a metering failure is swallowed so the
  partner answer always wins over the measurement.
- The Mollie activation runbook's partner-cost item is closed: the metering is
  delivered, visible through the billing usage surfaces, and nothing about it
  is i
nvoiced.

### Trust pack: GDPR, DPA, hosting, security, status, Mollie runbooks (R10, first increment)

- New trust documentation set (`docs/trust/`): GDPR posture with a per-module
  data map, retention and sub-processor list; the customer DPA template;
  the OVH hosting page (isolation, TLS, secrets, backups); the public
  security-page content with the responsible-disclosure policy; the
  status-page policy (components, incident posting, measured-availability-only
  claims); and the Mollie activation runbook with the final-quota gates.
- The runbook documents the fail-closed activation the code already enforces
  (`src/billing/config.ts`): test→live gates (owner approval, prices approved,
  tax-inclusive amounts, terms URLs, `BILLING_LIMITS_JSON` quotas,
  reconciliation token). Live activation, TLS/SMTP enablement and publishing
  the security/status pages stay explicit operator acts.
- Honest scope: partner-cost metering into the billing ledger is stated as
  the remaining R10 code item, not claimed as delivered by this increment.

### Answer-grounded AEO Writer (R8)

- New answer-grounded content scoring: a tenant-supplied content (page or
  draft, text or HTML, 40..20000 chars) is scored against the prompts of the
  tenant's stored AI-visibility panel (imported or collected answers, R1/R2),
  with strict intent-term coverage per prompt (covered/partial/absent,
  evidence sentence returned, prompts without usable terms stay unevaluated)
  on top of the existing citability audit; combined score 0.6×coverage +
  0.4×citability, unevaluated (null, never zero) without usable prompts.
- Local AEO-Writer drafts: for the uncovered prompts (bounded to 5), three
  title proposals and a full outline with FAQ via the open-source generators;
  every draft carries its review note, nothing is published.
- Routes `/aeo-writer/score` and `/aeo-writer/drafts` (active tenant, members
  can read; no network call, nothing stored) and a bilingual Operations panel
  (`#ops/writer`)
 with provenance line, per-prompt table (missing terms and
  evidence), citability strengths/gaps and drafts under review notes.

### Pre-approved action catalog (R11, third increment: console panel)

- Bilingual Operations tab `#ops/actions` (own symbol): every member reads the
  catalog version, the three eligible actions with their titles and summaries
  in the reader's language, the explicit never-eligible list and the standing
  governance note; only tenant administrators act.
- Admin gestures per ledger state: propose (select of the three catalog
  entries plus a strict-terms JSON textarea, malformed terms refused locally
  without any call), one-click execution (`approve: true`) on proposed/approved
  operations with the ambiguity/stale-claim notes rendered verbatim, cancel,
  and the resolved block for `reconciling` (verified outcome plus the
  external-verification detail).
- Every gesture refreshes the tenant ledger from the routes and renders the
  audit trail of the last console act (operation id, event, actor, detail,
  timestamp); a refused gesture surfaces the French error and leaves the
  recorded state untouched. Members see the ledger without any gesture button.
- New linkedom UI suite covers FR/EN wording, the propose flow and its local
  JSON refusal, the stale-claim note, the resolve flow, member read-only
  gating and the refused-gesture error path. With this increment R11 has no
  remaining code item.

### Pre-approved action catalog (R11, second increment)

- PAP L2 propose surface behind `PAP_OPERATIONS_ENABLED` (fail-closed, off by
  default): the `gtm:operations:propose` scope and
  `POST /api/poppy/operations/propose` let a delegated agent *propose* a
  catalog operation for the exact token tenant; approval and execution stay
  human console acts. The proposal runs the same strict entry rules
  (`normaliseTerms`), IndexNow proposals must target a tenant-owned domain,
  and the operation is journalled in both audit trails with the actor
  
`agent:<client_id>` in the governed ledger (origin `pap`).
- Honesty in advertising is enforced in code: while the flag is off the
  propose scope is refused at consent, absent from `/.well-known/poppy.json`,
  the OAuth protected-resource metadata and the OpenAPI facade, and the route
  answers 503. Consent now accepts up to six scopes (five reads + propose).
- Stable MCP tool contracts: docs/mcp/TOOLS.md documents all 100 server tools
  (GA4, GTM read/audit/write, Search Console, sGTM, Measurement Protocol
  secrets, Indexing API, IndexNow, CrUX/PageSpeed, commerce, GEO suite, PAP
  discovery, custom events) with their read/write classification,
  confirmation gates and bounds, generated from the tool sources so the two
  cannot drift.

### Pre-approved action catalog (R11, first increment)

- Versioned catalog of three pre-approved actions (`indexnow.submit`, bounded
  HTTPS submissions to the exact tenant host; `draft.generate`, pure local
  titles/meta/outline drafting; `report.dispatch`, dispatch of an already-due
  J+14/J+28 follow-up through the existing pipeline), with explicit
  exclusions that are never eligible (`apply.robots-meta`, `wordpress.publish`,
  `gbp.write`, `crm.write`, `social.publish`); every other write keeps its
  human confirmation.
- Governed ledger (`ACTIONS_DB_PATH`, SQLite `0600`) with strict entry rules
  (terms text identical to the catalog, proposition expiring after 72 h) and
  exit rules (approval tied to the exact digest of the approved terms,
  execution claims are atomic under an immediate transaction, replays return
  the existing state without re-running, ambiguous results become
  `reconciling` and never auto-retry, external reconciliation on verified
  results only, stale claims beyond 15 minutes become `reconciling`, cancel
  only from `proposed`/`approved`).
- Per-execution audit trail (`action_events`, latest first, capped 200 per
  operation) including stale-claim and reconciliation events.
- One-click execution gestur
e: `/actions/execute` accepts
  `{operationId, approve:true}` and executes an already-approved operation
  atomically; operations are also resolvable from a verified external result
  through `/actions/resolve`.
- Console routes (`/actions/catalog`, `/actions/operations`, propose/approve/
  execute/cancel/resolve), IndexNow submissions gated on the exact tenant host,
  `TenantAccessError` outside the tenant, admin-only governance routes.
- Refactor: the J+14/J+28 dispatch loop and the env-gated scheduler runtime
  now share the exported `dispatchOneFollowUp` and `reportFollowUpsRuntime`
  helpers so the catalog dispatcher and the ops scheduler stay one pipeline
  (no behaviour change; existing tests unchanged).

### Backlink intelligence (R5)

- Domain netlinking overview on the operator's partner bridge: backlinks and
  referring-domain counts plus a bounded referring-domain list (1..50 shown,
  default 20) for any normalised tenant-supplied domain (scheme tolerated,
  `www.` stripped, strict hostname rules). Unknown counts stay `null`, never
  zero; the answer keeps the full partner provenance (`partner-api`,
  observation date, locale, partner cost). Tenant-admin only, like every
  partner call; call costs stay with the operator.
- Link gap versus up to five named competitors: the bridge lists the domains
  citing a declared competitor without citing the tenant domain, capped at 50
  and sorted by competitor coverage; only declared competitors appear in the
  citation columns. The tenant domain as its own competitor is refused.
- Google disavow export from a tenant-supplied selection: pure text
  generation, ≤200 validated domains, deduplicated, French header carrying
  the `sélection client` provenance and the manual-review warning. No partner
  call, nothing stored, works with the bridge off; the Search Console import
  stays a manual operator act, and the file is never pushed anywhere.
- The bilingual Operations market panel gains the backlink overview, the li
nk
  gap and the disavow boxes: every partner answer keeps its provenance line,
  member accounts stay gated, and the disavow export remains available to
  tenant administrators even while the bridge is off.

### AI-crawler analytics and access drafts (R6)

- AI-crawler log analytics: tenant-supplied server/CDN access logs (nginx
  combined, bounded to 5,000 lines / 512 KB) are parsed to report GPTBot,
  ClaudeBot, PerplexityBot, OAI-SearchBot and the other registered AI crawlers
  per site section. Longest-token classification against the platform registry,
  served/error splits, covered period and ignored-line counts; every answer
  carries the tenant-supplied provenance and its parse date, sections not
  crawled in the period stay unknown, never zero. Nothing is stored: the
  analysis is free and stateless; no partner call.
- Inside Apply Mode, a dry-run policy draft builds the per-crawler robots
  choices (allow/disallow per registry token): explicit `User-agent` groups are
  appended without ever rewriting existing rules (kept and reported for manual
  review; a specific group is proposed in append-only mode when only the
  generic `*` group covers the crawler), plus a bounded llms.txt skeleton whose
  descriptions stay to be filled by the operator — no description is invented.
  The drafts are text-only: `writesEnabled: false`, no writer is wired, the
  existing read-only robots-ai preview is unchanged.
- A bilingual "AI crawlers" Operations tab surfaces both: the coverage tables
  with their provenance line, and the per-crawler choice form with the draft
  diffs and the standing dry-run note. Both actions are tenant-admin only.

### Partner market-data console panel (R4 follow-up)

- A bilingual FR/EN "Market data" panel in Operations surfaces the bridge: search
  volumes, Google SERP positions and a GBP local rank grid in the same tab. The
  status line shows whether the operator enabled the bridge and its locale
  allowlist; when it is off, the partner butt
ons stay disabled and the panel
  states that no data is invented in the meantime.
- Partner calls remain tenant-admin only and every answer renders its origin
  (`provenance partner-api`), observation date, locale, device and the
  partner-reported cost. Unknown values render "—", never zero; grid points
  beyond the depth stay "not found", never padded.
- Linkedom UI tests cover the disabled/enabled states, the admin gate, the
  three bounded partner requests and the provenance line in both languages.

### Partner market-data bridge (R4)

- Operator-configured partner API (DataForSEO-compatible) for keyword search
  volumes, Google SERP positions and GBP local rank grids. Google.fr first:
  other locales are enabled through `MARKET_DATA_LOCALES` only, and a locale
  outside the operator allowlist is refused, never silently sampled.
- Fail-closed behind `MARKET_DATA_ENABLED=true` plus complete credentials:
  without it, partner calls degrade with an explicit French error and the
  platform invents no data. The operator owns the partner keys and the call
  costs; nothing is billed to tenants.
- Every answer carries `provider: "market-data"`, `provenance: "partner-api"`,
  the locale, the device, the observation date and the partner-reported cost,
  so a partner figure is never mistaken for a measurement made by this
  platform. Unknown values stay `null`, never zero; local ranks beyond the
  grid depth are `not-found`, never padded.
- Tenant-supplied requests are bounded before any partner call: at most 20
  keywords of 200 characters per volumes call, one keyword per SERP call with
  a clamped depth, and a latitude-compensated local grid capped at 7×7 points
  with validated centre coordinates.
- Console routes: `/market/status` for every console member (retained,
  quota-free), tenant-admin-only `/market/volumes`, `/market/serp` and
  `/market/local-grid`, which consume request quota like other metered reads.
  No console panel ships in this slice.

### Public imp
act timeline panel (R9)

- The public read page now renders the impact trajectory of the requestor's
  own snapshots right after the report invitation, authorised by the run
  token of the audit job. A timeline renders one block per consecutive
  snapshot pair: both observation dates, the interval in days, the
  deterministic confidence chip and its machine-checkable reasons, and the
  seven outcome counters plus the resolved/new/unchanged action counts. The
  counters stay per step; nothing is ever summed across steps, scopes or
  clients, and points and scores remain withheld.
- `insufficient_observations` renders the observation count recorded for the
  requestor; `scope_mismatch` renders the refusal note only. The J+14/J+28
  client follow-ups of the latest observation are displayed with their due or
  upcoming status and the standing bilingual suggestion, and the timeline
  and follow-up notes are displayed verbatim. Without a run token, or when
  the timeline API is unavailable, the panel disappears without breaking the
  read.

### Visibility evidence, durable collections, matched-cohort comparison and editorial impact

- Answer evidence now records an explicit measurement context — engine, model,
  mode (`api`, `consumer`, `tracker`, `manual`), language and market — next to
  a declared and an effective provenance and a collection-verified flag, and
  citation metadata is tracked as available or missing. Re-imported tracker
  exports reuse the stored dataset by fingerprint instead of duplicating
  panels, and per-tenant dataset capacity is enforced by the store.
- Panels that share a brand signature can be compared across collection
  periods through matched-cohort observations (`matched-cohorts-v1`): each
  side keeps its scope (source, dates, prompt groups), observations are
  matched by cohort key, cohorts without a comparable pair are excluded and
  reported, and the comparison exports to CSV with injection-safe cells.
- Scheduled visibility collections 
run durably: a PostgreSQL job store and a
  Redis queue claim and run per-tenant collection jobs with the tenant's own
  AI account, bounded by dataset capacity and explicit job states (queued,
  claimed, calling, succeeded, failed, provider rate limit, quota, panel or
  account unavailable). The legacy in-process ops scheduler stands down when
  `VISIBILITY_JOBS_ENABLED=true`, the queue is opt-in and off by default, and
  the console exposes a bilingual schedule console with per-job histories.
- Editorial decisions pin verified AI evidence: an answer pin records the
  dataset, dataset scope and snapshot date it was read from, drafts are
  checked against the editorial quality gates with optimistic revision
  checks, WordPress publication remains double-verified against the approved
  revision, and J+14/J+28 client follow-ups are planned from the verified
  impact reads of the pinned scope.

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
  gap row and shows `—` instead of a ze
ro share. If the view fails, the
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
  e
mbedded line breaks, CRLF, UTF-8 BOM) and accepted date forms (ISO,
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
  method, refuses a snapshot from another page (`sco
pe_mismatch`), renders
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
  emailed or schedul
ed automatically.
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
  drift-safe resto
re that never clobbers a target which moved on (the attempt
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
  contract stays `null`. 
Tests cover the pure classifier plus requestor, URL
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
  gateway mode

... [Content truncated]