# Capability and delivery register

[Documentation hub](../README.md) · [Marketing](../marketing/README.md) · [Technical](../technical/README.md)

Reviewed **15 November 2026 (Asia/Shanghai)** against source revision
[`353e658`](https://github.com/Geoking2104/GTM-Growth/commit/353e65878f8142627430549968ecce31d43cc9a2).
This is a dated register, not a live service monitor. “Implemented” means present
in the reviewed source. It does not mean deployed, connected or accepted by a live customer.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| **Implemented** | Source and a user/API path exist; configuration may still be required |
| **Optional integration** | Separate deployment/provider setup required |
| **Foundation** | Library/contract exists but the complete user workflow is not wired |
| **Blocked / deferred** | User action disabled or end-to-end capability absent |

## Capabilities by journey

Release review **0.23.0** · **2026-11-19**. The pnpm migration, CLI bootstrap,
`doctor` and release checks are available in source. Publication and runtime
activation require their own evidence. [Upgrade guide](../UPGRADING.md)

Increment of **20 November 2026 (Europe/Paris)**: [Campaign Studio](../product/CAMPAIGN-STUDIO.md)
is implemented in source: JointJS graph, channel schedule and table; durable
workspace campaigns, evidence snapshots, dates, responsible roles, dependencies,
locks, checklists, budgets, sourced KPIs, comments and version history. Local
rules and explicit configured AI accounts produce reviewable draft changes.
Native module approvals and external execution remain separate. Full directory
assignment, timed automation and realtime coediting are outside this increment.
Source validation and CI receipts belong to the implementation PR; this entry
is not a production activation receipt.

Increment of 18 November 2026: [durable public audit pilot](../technical/AUDIT-PIPELINE.md)
is implemented in source with PostgreSQL admission/outbox, bounded BullMQ workers,
resumable browser progress, snapshot-based invitations and protected metrics.
It does not establish an OVH release, real SMTP acceptance, live Mollie activation
or migration of the remaining module stores. See the exact pipeline tests/runbook.

Increment of 18 November 2026: AI observation **provenance** (`imported` / `collected`,
with pre-existing panels summarized as `unverified`) and **citation gap analysis** are
implemented in source: every stored answer keeps its origin across re-imports, and the
read-only `/ai-visibility/citation-gaps` route classifies the panel's cited URLs (own,
competitor, Reddit, YouTube, LinkedIn, Wikipedia, web) with bounded gap lists. A brand
without a declared website is unknown evidence, never zero; no provider call, market
sampling or console panel UI is added. See the
[observation model specification](../specs/AI-VISIBILITY-OBSERVATION-MODEL-v1-2026-11-18.md).
Not part of the 15 November reviewed revision `353e658`.

Increment of 18 November 2026: the **isolated Playwright renderer** and the
**fail-closed HTTPS egress gateway** for verified-domain GEO v2 audits are merged
(PR #29): the renderer authorises every request against the tenant-domain grant
read-only, and the egress gateway admits only the verified hostname on 443 at
public IPv4 addresses, inside a resource-capped, read-only Docker topology with a
network-boundary CI smoke. No public service, domain-verification route or
production deployment is included. PR #30 was closed as superseded because its
42-control contracts and evidence enrichment already exist on main; the mapping
is recorded in the pull request. Not part of the 15 November reviewed revision
`353e658`.

Increment of 18 November 2026: **before/after public audit comparisons** are
implemented at the audit API level: a completed `GET /api/audits/:id` response
now pairs the requestor's own earlier completed snapshot of the same URL
(matching method and observed page required) and reports outcome-level counters,
changed controls, plan evolution and observation dates. Only public outcomes
are compared; points and scores stay withheld and the stored snapshot contract
is unchanged. Console UI display of the comparison is not part of this
increment. See the [audit pipeline runbook](../technical/AUDIT-PIPELINE.md).

Increment of 18 November 2026: the **first Phase 0.4 execution slice** of Apply
Mode is implemented. A scoped WordPress REST writer updates exactly the
reviewed `title`+`content` of one existing post or page, only after a drift
compare-and-swap, an encrypted pre-write snapshot and the atomic consumption of
a single-use approval under a one-active-attempt target lock. The engine
verifies by re-inspection (`verified`, `to_verify`, or `uncertain` with the lock
kept), and a second explicit approval authorizes a drift-safe rollback that
never clobbers a target that moved on. Console mutation routes are opt-in from the server composition root with
per-tenant `WP_*` environment credentials and fail closed by default; the
`APPLY_*` registry key/database flags are documented in the ADR but their
production server wiring remains a later increment. robots.txt file writers
are still pending the owner's file-connector selection and GTM publication
remains out of scope. Not part of the 15 November reviewed revision
`353e658`.

Increment of 18 November 2026: **per-scope impact timelines and white-label
client exports** are implemented. `GET /api/audits/:id/timeline` compares the
requestor's own consecutive completed snapshots of one URL, pairwise through
the existing public-outcome classifier, with an explicit per-step confidence
(grid version, measured coverage, observation window) — and counters are
never summed across steps, scopes or clients. J+14 and J+28 follow-ups are
surfaced as bilingual suggested dates only; nothing is emailed or scheduled
automatically. Email-verified invitations accept one strictly validated client
brand rendered by the existing A4 PDF/Markdown pipeline, still one snapshot
per report and one language per client, with no metric aggregation. The
public read page now renders the per-step timeline and the follow-up dates
after the report invitation (run-token authorised); the panel disappears
without breaking the read when the trajectory is unavailable. Not part of the 15 November reviewed
revision `353e658`.

| Stage / capability | Source status | Activation or scope | Evidence / reference |
| --- | --- | --- | --- |
| Diagnose: public read / 360° report | Implemented in feature branch; **not yet merged/deployed** | One public page, GEO v1/SEO evidence, five distinct pillars, evidence-linked FR/EN actions and A4 browser print. Private metrics and score gains remain unknown; before/after comparisons exist at the audit API level for public outcomes with matching method and URL | [Free report contract](../product/FREE-REPORT-360.md), [free read](../../src/freeread/index.ts), [public API](../PUBLIC_API.md) |
| Diagnose: GEO, citability, sitemap, performance | Implemented | Authorised URLs; lab/field data and readiness remain distinct | [GEO](../GEO.md), [CLI](../CLI.md) |
| Diagnose: GEO v2 | Foundation; renderer and egress gate merged | 42-control contracts, ownership registry and offline rendering code are on main; the isolated renderer and the fail-closed egress gateway are merged with CI smokes but not deployed as a public service. Verified-domain grants are operator-issued; before/after comparisons are not inferred | [Rubric](../../src/geo/score/v2/rubric.ts), [renderer](../../src/geo/rendering/geo-renderer.ts), [egress gate](../../src/geo/rendering/geo-egress.ts), [deploy guide](../../deploy/geo-renderer/README.md), [pilot ADR](../architecture/GEO-V2-PLAYWRIGHT-PILOT.md) |
| Understand: buyer questions | Implemented | Actual Product/Service context and explicit confirmation; at most two selected comparable offers; unsupported stages stay empty | [Current contract](../product/CUSTOMER-JOURNEY-INTEGRATION.md), [model](../../site/console/customer-journey-model.js) |
| Understand: products/pages | Implemented | Bounded public metadata sample or previewed admin JSON import; not an exhaustive crawl | [Console readiness](../product/CONSOLE-READINESS.md), [catalog API](../../src/console/visual-catalog.ts) |
| Understand: search/keywords | Implemented | Authorised GSC property, date range and tracking configuration | [Google adapters](../../src/google/), [keywords](../../src/console/keywords.ts) |
| Prepare: generators/content ops | Implemented | Templates or optional model configuration; approved WordPress creation is draft-only | [Content ops](../../src/console/content-ops.ts), [Ops routes](../../src/console/ops-routes.ts) |
| Prepare: Apply Mode | Preview implemented; first execution slice implemented behind opt-in flags | Robots diff; encrypted snapshot/approval registry; WordPress REST `title`+`content` writer with single-use approval, target lock, verified execution receipt and second-approved rollback. Off by default; no robots.txt file writer or GTM publication | [Apply ADR](../architecture/APPLY-MODE-MVP.md), [execution engine](../../src/apply/execution.ts), [routes](../../src/console/apply-routes.ts) |
| Prepare: Social | Implemented + optional integration | Roles, exact independent approvals, explicit scheduling, Postiz accounts and ZenML worker. Outreach sending remains manual | [Reviewed contract](../product/SOCIAL-TOOLKIT-SPEC-REVIEW.md), [operations](../../deploy/social/README.md) |
| Prepare: IndexNow / Google writes | Implemented | Tool-specific enablement/confirmation; receipt is not indexing proof | [IndexNow](../INDEXNOW.md), [GTM writes](../PHASE3_WRITE.md) |
| Measure: GA4/GSC/GTM | Implemented | Service account, enabled APIs and exact resource access | [Tracking integration](../GTM_INTEGRATION.md), [Google modules](../../src/google/) |
| Measure: AI imports | Implemented | Sourced, dated answer dataset and tenant authorisation; normalised CSV/JSON connectors for tracker exports (Meteoria, Peec AI, Qwairy, Profound) with the brand declared by the tenant, fail-closed per row, provenance `imported`; console panel offers preview-then-commit import to administrators | [Provider guide](../product/AI-VISIBILITY-PROVIDERS.md), [connector](../../src/console/ai-tracker-import.ts), [panel](../../site/console/ai-visibility.js) |
| Measure: share-of-voice views | Implemented (19 November 2026 increment; not in the reviewed `353e658` revision) | Per-engine proportions over one stored panel (mentions, share of voice, visibility, sentiment); mentions counted once per response; rejected reviews excluded; `null` not zero (rendered `—` in the panel); no market-share estimation; rendered per engine in the console panel | [Share of voice](../../src/console/ai-share-of-voice.ts), [panel](../../site/console/ai-visibility.js) |
| Measure: evidence coverage and comparable periods | Implemented (visibility stack increment; durable jobs opt-in, see next row) | Observations carry measurement context (engine, model, mode, language, market), declared/effective provenance and a collection-verified flag; tracker imports reuse stored datasets by fingerprint; panels with the same brand signature are compared across periods through matched cohorts (`matched-cohorts-v1`) with excluded cohorts reported, CSV export and console/white-label surfacing | [Comparison](../../src/console/visibility-comparison.ts), [measurement](../../src/console/visibility-measurement.ts), [store](../../src/console/ai-visibility-store.ts) |
| Measure: durable scheduled collections | Implemented behind `VISIBILITY_JOBS_ENABLED=false` (off by default); durable jobs require PostgreSQL and Redis services | Per-tenant scheduled visibility collections on a PostgreSQL job store and Redis queue with the tenant's own AI account, dataset-capacity bounds, explicit job states and a bilingual console schedule view; the legacy in-process ops scheduler stands down when enabled | [Jobs](../../src/visibility-jobs/), [runtime](../../src/visibility-jobs/runtime.ts), [schedule view](../../site/console/visibility-schedule.js) |
| Understand: partner market data | Implemented behind `MARKET_DATA_ENABLED=false` (off by default); operator-owned DataForSEO-compatible partner keys, call costs are the operator's, nothing billed to tenants | Google.fr-first keyword volumes, Google SERP positions and GBP local rank grids from the operator's partner bridge: bounded tenant-admin-only calls, locale allowlist (`MARKET_DATA_LOCALES`), 7×7 latitude-compensated grid, provenance `partner-api`, observation dates and partner costs on every answer; unknown stays `null`, not-found beyond depth 20, never zero; quota-free `/market/status`; bilingual Operations panel renders volumes, SERP and the local grid with the provenance line and the disabled-bridge state | [Provider](../../src/market/provider.ts), [routes](../../src/console/market.ts), [panel](../../site/console/market.js), [runbook](../technical/MARKET-DATA.md) |
| Understand: backlink intelligence | Implemented (R5); partner overview/gap calls behind `MARKET_DATA_ENABLED=false`, disavow export free and available with the bridge off | Domain backlink overview (backlinks, referring domains, bounded referrer list) and a link gap versus one to five named competitors (domains citing a competitor without the tenant domain, capped 50, sorted by coverage) through the same operator bridge, each with `partner-api` provenance; strict domain normalisation, unknown stays `null`, never zero; tenant-admin-only partner calls, operator pays. The disavow export is a pure tenant selection (provenance `tenant-selection`): ≤200 validated domains, no partner call, nothing stored, manual Search Console import stays the operator's act | [Provider](../../src/market/provider.ts), [routes](../../src/console/market.ts), [panel](../../site/console/market.js), [runbook](../technical/MARKET-DATA.md) |
| Understand: AI-crawler analytics | Implemented; self-hosted and free, no partner call | Tenant-supplied server/CDN access logs (nginx combined, bounded) parsed into per-crawler and per-section crawl coverage (GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot and the registry bots) with served/error splits, covered period and tenant-supplied provenance; sections not crawled stay unknown, never zero; nothing stored. Inside Apply Mode, a dry-run policy draft builds per-crawler robots choices (existing rules never rewritten, append-only specific groups with precedence notes) plus a description-free llms.txt skeleton; text drafts only, no writer wired; bilingual Operations panel, tenant-admin gated | [Logs](../../src/ai-crawlers/logs.ts), [policy drafts](../../src/ai-crawlers/policy.ts), [routes](../../src/console/ai-crawlers.ts), [panel](../../site/console/ai-crawlers.js), [runbook](../technical/AI-CRAWLERS.md) |
| Act: pre-approved action catalog | Implemented (R11, first increment); no console panel yet, routes first | Three versioned pre-approved actions (`indexnow.submit` bounded HTTPS submissions to the exact tenant host, `draft.generate` pure local drafting, `report.dispatch` of an already-due J+14/J+28 follow-up) with explicit exclusions never eligible (`apply.robots-meta`, `wordpress.publish`, `gbp.write`, `crm.write`, `social.publish`); governed SQLite ledger (`0600`), strict terms entry with 72 h expiry, approval tied to the exact terms digest, atomic execution claims, replay-safe, ambiguous results become `reconciling` and never auto-retry, external reconciliation only, per-execution audit events (capped 200 per operation); one-click `/actions/execute` `{operationId, approve:true}` gesture; every write outside the catalog keeps its human confirmation | [Catalog](../../src/actions/catalog.ts), [ledger](../../src/actions/ledger.ts), [routes](../../src/console/actions.ts), [runbook](../technical/ACTIONS.md) |
| Measure: API collection | Implemented for OpenAI, Claude, Mistral, Grok; Gemini collection blocked | Selected API account, explicit collection/cost confirmation. Consumer chat subscription/login is not API authorisation | [Collectors](../../src/console/ai-visibility-providers.ts), [account guide](../product/AI-VISIBILITY-PROVIDERS.md) |
| Measure: citation gaps | Implemented (18 November 2026 increment, console view 19 November 2026; not in the reviewed `353e658` revision) | One stored/collected panel; provenance kept across re-imports; brand website must be declared, unknown stays unevaluated (`—` in the panel, never zero); rendered as a "Citation gaps" section with per-category bars, top hosts and per-answer evidence rows | [Observation model](../specs/AI-VISIBILITY-OBSERVATION-MODEL-v1-2026-11-18.md), [citations](../../src/console/ai-citations.ts), [panel](../../site/console/ai-visibility.js) |
| Measure: commerce | Implemented; live store qualification required | Shopify custom app / PrestaShop webservice, sealed credentials, sync/webhook; real-time PrestaShop needs an external companion module | [Commerce spec](../specs/ECOMMERCE-CONNECTORS-v1-2026-11-13.md), [current KPI limitations](../marketing/MEASUREMENT.md#known-commerce-limitations-in-this-revision) |
| Report: impact timeline and J+14/J+28 reminders | Implemented (18 November 2026 increment; not in the reviewed `353e658` revision) | One requestor, one public-URL scope; consecutive snapshot pairs with explicit per-step confidence; J+14/J+28 are surfaced dates only, never automatic actions; outcome counters are never summed across steps, scopes or clients; the public read page renders the per-step trajectory and the J+14/J+28 date plan after the report invitation, run-token authorised | [Timeline](../../src/impact/timeline.ts), [follow-ups](../../src/impact/follow-ups.ts), [panel](../../site/console/impact-timeline.js), [pipeline runbook](../technical/AUDIT-PIPELINE.md) |
| Report: scheduled J+14/J+28 dispatch | Implemented (19 November 2026 increment; not in the reviewed `353e658` revision) | Double opt-in only: per-invitation agency choice (`followUp: "auto"`) plus the operator gate `REPORT_FOLLOW_UPS_ENABLED`; the scheduler re-measures the same URL, refuses another page, and sends one branded bilingual PDF through the A4 pipeline; recipient address sealed AES-256-GCM; three-attempt cap; session-visible plan without any address; no summed metrics | [Scheduled follow-ups](../../src/report-access/follow-ups.ts), [scheduler drain](../../src/console/ops-scheduler.ts), [pipeline runbook](../technical/AUDIT-PIPELINE.md) |
| Report: white-label client export | Implemented (18 November 2026 increment; not in the reviewed `353e658` revision) | One strictly validated brand per email-verified invitation (bounded name/tagline/color); the branded A4 PDF/Markdown export reuses the same saved snapshot: one report, one language, no metric aggregation | [Brand validation](../../src/report-access/brand.ts), [export](../../src/report-access/export.ts) |
| Measure: native CRM / client plugin | Implemented; collection off until enabled | Explicit CRM roles and exact identity proof; server adapter for external CRM/web/social sources. Vendor-specific CRM adapters are not included | [CRM spec](../product/CRM-CUSTOMER-JOURNEY-SPEC.md), [plugin API](../../integrations/crm-plugin/README.md) |
| Coordinate: global/local SEO | Implemented | Registry, exact location grants, declared ranks, 24 LOC controls and audits. Several controls need declared evidence | [Global/local](../product/GLOBAL-LOCAL-SEO.md), [operations](../product/LOCAL-SEO-OPERATIONS.md) |
| Coordinate: GBP dashboard | Implemented; operator setup required | On-demand reviews/performance, partial success; review sample up to 50; transient data | [Retail spec](../product/GBP-RETAIL-SPEC.md), [dashboard](../../src/local-seo/dashboard.ts) |
| Coordinate: GBP jobs and writes | Implemented + optional Node-RED | Five queued-job pollers; only phone/website writes after separate approval/readback. WF-04 scheduled performance collection remains pending | [Node-RED](../../deploy/node-red/README.md), [publication](../../src/local-seo/publication.ts) |
| Coordinate: data assistant | Implemented | Guided tenant-authorised reads and preferences; no model key for console answers | [Assistant contract](../product/DATA-AGENT-JOURNEY.md), [service](../../src/data-agent/service.ts) |
| Coordinate: Slack/Eve | Optional integration | Separate Node 26 service, model credentials and exact workspace/channel/user binding; five curated reads including customer journey | [Eve runbook](../../integrations/eve-data-agent/README.md), [bridge](../../src/data-agent/bridge.ts) |
| Cross-cutting: Cloud billing | Implemented, disabled by default | €39 Solo / €149 Agency are hypotheses. Verified payment access, configured quotas and bilingual management exist; live merchant setup and sandbox acceptance remain pending | [Shared website copy](../../site/journey-content.js), [website contract](../product/WEBSITE-CUSTOMER-JOURNEY.md) |

## Release evidence

GitHub Actions observations retrieved on 15 November 2026 (Asia/Shanghai):

| Evidence | Observed state | What can be concluded |
| --- | --- | --- |
| [CI 43620735464](https://github.com/Geoking2104/GTM-Growth/actions/runs/43620735464), head `353e658` | Completed / success | CI passed for the reviewed main revision |
| [OVH 43522090712](https://github.com/Geoking2104/GTM-Growth/actions/runs/43522090712), dispatch head `83c8720` | Waiting; deploy job waiting; no successful conclusion | The old README claim that this run completed is unsupported by the current Actions record |
| [OVH 43519283364](https://github.com/Geoking2104/GTM-Growth/actions/runs/43519283364), dispatch head `4eb312d` | Completed / success; created 14 November 2026 at 06:26 Asia/Shanghai | Latest successful OVH workflow found in the retrieved manual-run list; not proof that current main or every connector is live |
| [OVH 43270543975](https://github.com/Geoking2104/GTM-Growth/actions/runs/43270543975), dispatch head `5c83519` | Waiting | The earlier README also cited this waiting run as a completed deployment |
| [GEO PR #30](https://github.com/Geoking2104/GTM-Growth/pull/30) | Open / unmerged | Its proposed 42-control integration must not be presented as main-branch delivery |

This documentation pass did not dispatch a deployment or verify live authenticated
customer connections. The workflow performs a source update: identify the actual
deployed SHA from execution evidence, not only its dispatch head. Use the
[release sequence](../technical/OPERATIONS.md#release-sequence) for production acceptance.

## Update rule

When a capability changes, update its source status and prerequisites here, then
update the two reading tracks and the relevant contract. Add a dated release row
only from an observed run and deployment evidence. Do not copy “live” labels into
multiple guides; link to this register. Historical specifications describe intent,
not proof of current availability.

## Personal agent access (PAP 1.0)

Read-only facade, delegated Session verification, explicit workspace/resource consent, live Keycloak membership checks, rotating tokens and durable revocation are implemented behind `PAP_ENABLED=false`. The EN/FR console includes Connected agents. Deployed Keycloak qualification, upstream validator results and real-agent production compatibility remain **not verified**. See [scope and acceptance](../PAP.md) and [runbook](../technical/PAP-RUNBOOK.md). PAP access events are not CRM touchpoints. L2 writes and L3 merchant/customer identity integration are outside this release.
