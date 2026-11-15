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

| Stage / capability | Source status | Activation or scope | Evidence / reference |
| --- | --- | --- | --- |
| Diagnose: public read | Implemented | One public page, GEO v1/SEO evidence; no private analytics or measured AI mentions | [Free read](../../src/freeread/index.ts), [public API](../PUBLIC_API.md) |
| Diagnose: GEO, citability, sitemap, performance | Implemented | Authorised URLs; lab/field data and readiness remain distinct | [GEO](../GEO.md), [CLI](../CLI.md) |
| Diagnose: GEO v2 | Foundation; 42-control integration deferred | Category budgets, calculator, ownership registry and offline rendering code exist on main. Live isolated browser execution is not a public service | [Rubric](../../src/geo/score/v2/rubric.ts), [offline worker](../../src/render/worker.ts), [pilot ADR](../architecture/GEO-V2-PLAYWRIGHT-PILOT.md); [PR #30](https://github.com/Geoking2104/GTM-Growth/pull/30) open at review |
| Understand: buyer questions | Implemented | Actual Product/Service context and explicit confirmation; at most two selected comparable offers; unsupported stages stay empty | [Current contract](../product/CUSTOMER-JOURNEY-INTEGRATION.md), [model](../../site/console/customer-journey-model.js) |
| Understand: products/pages | Implemented | Bounded public metadata sample or previewed admin JSON import; not an exhaustive crawl | [Console readiness](../product/CONSOLE-READINESS.md), [catalog API](../../src/console/visual-catalog.ts) |
| Understand: search/keywords | Implemented | Authorised GSC property, date range and tracking configuration | [Google adapters](../../src/google/), [keywords](../../src/console/keywords.ts) |
| Prepare: generators/content ops | Implemented | Templates or optional model configuration; approved WordPress creation is draft-only | [Content ops](../../src/console/content-ops.ts), [Ops routes](../../src/console/ops-routes.ts) |
| Prepare: Apply Mode | Preview implemented; execution foundation | Robots diff; encrypted snapshot/approval registry is library-only. No connected production writer or real rollback | [Apply ADR](../architecture/APPLY-MODE-MVP.md), [preview routes](../../src/console/apply-routes.ts) |
| Prepare: Social | Implemented + optional integration | Roles, exact independent approvals, explicit scheduling, Postiz accounts and ZenML worker. Outreach sending remains manual | [Reviewed contract](../product/SOCIAL-TOOLKIT-SPEC-REVIEW.md), [operations](../../deploy/social/README.md) |
| Prepare: IndexNow / Google writes | Implemented | Tool-specific enablement/confirmation; receipt is not indexing proof | [IndexNow](../INDEXNOW.md), [GTM writes](../PHASE3_WRITE.md) |
| Measure: GA4/GSC/GTM | Implemented | Service account, enabled APIs and exact resource access | [Tracking integration](../GTM_INTEGRATION.md), [Google modules](../../src/google/) |
| Measure: AI imports | Implemented | Sourced, dated answer dataset and tenant authorisation | [Provider guide](../product/AI-VISIBILITY-PROVIDERS.md) |
| Measure: API collection | Implemented for OpenAI, Claude, Mistral, Grok; Gemini collection blocked | Selected API account, explicit collection/cost confirmation. Consumer chat subscription/login is not API authorisation | [Collectors](../../src/console/ai-visibility-providers.ts), [account guide](../product/AI-VISIBILITY-PROVIDERS.md) |
| Measure: commerce | Implemented; live store qualification required | Shopify custom app / PrestaShop webservice, sealed credentials, sync/webhook; real-time PrestaShop needs an external companion module | [Commerce spec](../specs/ECOMMERCE-CONNECTORS-v1-2026-11-13.md), [current KPI limitations](../marketing/MEASUREMENT.md#known-commerce-limitations-in-this-revision) |
| Measure: native CRM / client plugin | Implemented; collection off until enabled | Explicit CRM roles and exact identity proof; server adapter for external CRM/web/social sources. Vendor-specific CRM adapters are not included | [CRM spec](../product/CRM-CUSTOMER-JOURNEY-SPEC.md), [plugin API](../../integrations/crm-plugin/README.md) |
| Coordinate: global/local SEO | Implemented | Registry, exact location grants, declared ranks, 24 LOC controls and audits. Several controls need declared evidence | [Global/local](../product/GLOBAL-LOCAL-SEO.md), [operations](../product/LOCAL-SEO-OPERATIONS.md) |
| Coordinate: GBP dashboard | Implemented; operator setup required | On-demand reviews/performance, partial success; review sample up to 50; transient data | [Retail spec](../product/GBP-RETAIL-SPEC.md), [dashboard](../../src/local-seo/dashboard.ts) |
| Coordinate: GBP jobs and writes | Implemented + optional Node-RED | Five queued-job pollers; only phone/website writes after separate approval/readback. WF-04 scheduled performance collection remains pending | [Node-RED](../../deploy/node-red/README.md), [publication](../../src/local-seo/publication.ts) |
| Coordinate: data assistant | Implemented | Guided tenant-authorised reads and preferences; no model key for console answers | [Assistant contract](../product/DATA-AGENT-JOURNEY.md), [service](../../src/data-agent/service.ts) |
| Coordinate: Slack/Eve | Optional integration | Separate Node 26 service, model credentials and exact workspace/channel/user binding; five curated reads including customer journey | [Eve runbook](../../integrations/eve-data-agent/README.md), [bridge](../../src/data-agent/bridge.ts) |
| Cross-cutting: Cloud billing | Deferred | €39 Solo / €149 Agency are hypotheses. No active checkout, quotas or subscription entitlements | [Shared website copy](../../site/journey-content.js), [website contract](../product/WEBSITE-CUSTOMER-JOURNEY.md) |

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
