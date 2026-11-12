# Global and local SEO — offline-first console increment

Implementation date: 2026-11-12. Source: the owner's Global/Local SEO specification v1.1 (2026-11-12). This document is an implementation status report, not a claim that all five delivery lots or all 34 acceptance scenarios have shipped.

The existing business planning workspace from PR #36 is preserved in a second tab, including declared citation comparisons, public-address-only LocalBusiness drafts and JSON dossier import/export. Its browser-local dossier remains separate from the persisted network registry.

## Available behavior

- English and French landing pages and the public console expose a free business-type checklist. Physical, service-area and web-only businesses receive different preparation steps. This is a declared plan, not a measured audit, an AI-generated recommendation or a Maps rank. No signup, paid account, collection or publication is triggered.
- The authenticated console has a **Global and local SEO** workspace. Tenant administrators import a registry through a bounded CSV/JSON upload, inspect accepted and rejected rows, then explicitly confirm the accepted rows. Stable IDs update existing locations; matching by name or shared domain is never performed. Up to 1,000 locations per tenant are supported by the data contract; load qualification remains pending.
- Country, business languages and IANA time zone are separate fields. Interface language never rewrites them. A single Brussels location can retain `fr-BE` and `nl-BE`. The registry accepts registered tenant-domain pages but does not treat registration as ownership verification or launch Playwright.
- Local users have no location access by default. Tenant admins grant exact location IDs to an SSO subject. Empty grants revoke access. Reads, exports, evidence imports and action mutations reload the grant server-side. Platform administrators have no implicit editorial access. Service accounts and the `ai-agent` realm role cannot use this human console module.
- Rank observations are declared imports with source, method, author, collection date and import date. Maps, local-pack and organic are separate surfaces. Error/unresolved points never become ranks; valid not-found points remain in the denominator. Duplicate imports are idempotent. Coordinates and language can be missing for archival viewing, but automatic comparison is then disabled.
- Coverage, presence, top-three coverage, found median and bounded visibility are deterministic. With 25 planned points, 20 valid and 6 top-three, coverage is 80% and top-three coverage is 30%. Unknown results remain `null`, never zero. Historical observations are displayed with their observation dates; they are not presented as current measurements.
- Comparable series require the same location, declared identity, source/method, surface, query, country, language, device, depth and point geometry. The previous comparable observation is selected chronologically; changes are percentage points. Identity is declared by the importer, not independently verified against Google.
- Evidence-backed manual actions retain target, content language, owner, UTC deadline and observation IDs. Draft submission and approval are separate. A different tenant administrator approves the exact version; edits invalidate approval. Approved actions can move to manual application awaiting verification. There is intentionally no verified/done button or outbound publication endpoint.
- SQLite immediate transactions persist state and audit events across process restarts. No extra runtime dependency was added. No new paid provider, model, Maps collector or commercial workflow node is called.

## API contract

All routes are authenticated `POST /api/console/local-seo/<command>` routes. Tenant and actor come from validated Keycloak claims, never from the body. Error codes are stable and translated by the new UI. The common console middleware also applies existing tenant and request size checks.

| Command | Input | Result |
| --- | --- | --- |
| `state`, `export` | Empty body | Scope-filtered sites, observations, metrics, comparable changes, actions, audit and capabilities |
| `registry` | `rows`, optional `confirm: true` and preview `hash` | Accepted rows, rejected row numbers and saved count; admin only |
| `grant` | `user` (SSO subject), `sites` (exact IDs) | Replaces that user's location grant; admin only |
| `import` | `observation` | Immutable rank evidence, metrics and comparable-series fingerprint |
| `action` | `action`; optional existing `id` and expected `version` | New/updated draft; edits invalidate approval |
| `transition` | `id`, expected `version`, `op` | `submit`, `approve`, `reject`, or `manual` |

The machine-readable JSON export uses English contract keys and state codes, preserving measurement dates in UTC and business language codes unchanged. `reportLocale` records the selected UI locale. This is not a translated narrative report. Private addresses are not accepted in the registry schema; arbitrary free-text draft content must still be reviewed before any external reuse. No public registry export exists.

### Registry CSV

UTF-8, optional BOM, comma delimiter, quoted fields and doubled quotes are supported. Use semicolons inside `languages`. Unknown columns, including private address columns, are rejected. The browser limits uploads to 1 MB; backend arrays are independently bounded. JSON callers cannot bypass schema or scope validation.

```csv
id,name,brand,country,languages,timezone,kind,page,phone
brussels,Brussels,Example,BE,fr-BE;nl-BE,Europe/Brussels,physical,https://example.com/brussels,+3225550101
```

Allowed kinds: `physical`, `service-area`, `web-only`. The page domain must be registered to the authenticated tenant. `phone` is optional and must use international E.164 form. No private address field is stored.

### Rank import

```json
{
  "observation": {
    "siteId": "brussels",
    "source": "Owner survey",
    "method": "manual",
    "observedAt": "2026-11-10T12:00:00Z",
    "language": "fr-BE",
    "country": "BE",
    "surface": "maps",
    "query": "example service",
    "device": "mobile",
    "depth": 20,
    "identity": "owner-confirmed-external-id",
    "points": [
      {"id":"centre","latitude":50.85,"longitude":4.35,"status":"found","rank":2},
      {"id":"east","latitude":50.85,"longitude":4.36,"status":"not-found"},
      {"id":"west","latitude":50.85,"longitude":4.34,"status":"error"}
    ]
  }
}
```

A source label is provenance supplied by the importer, never an instruction to enable a provider. No imported field can initiate an outbound request. At most 1,000 points per observation, 1,000 observations, 5,000 actions and 50,000 audit events per tenant are accepted. Capacity errors fail atomically; they do not silently prune evidence.

## Persistence and operation

`LOCAL_SEO_PATH` optionally points to the SQLite file; default: `local-seo.sqlite3` next to `TENANTS_PATH` (or under `data/`). The file is created with mode 0600. Keep it on the existing persistent volume, not an ephemeral container layer. Back it up consistently with the tenant registry; test restore before deploying a production pilot. No migration of existing datasets is needed; the table is created lazily. Multi-host database sharing is not supported. Quotas here bound stored objects, not Google API throughput or worker memory.

No scheduler, Node-RED container, model download, secret change, payment change or production restart is bundled. Existing paid AI tools elsewhere in GTM Growth are unchanged and are not called by this module. The free local SEO path has no paid dependency.

## Remaining specification scope

| Area | Status and dependency |
| --- | --- |
| H.O./local access | Tenant admin and exact local grants implemented; country/region roles, cross-tenant franchise delegation and expiring mandates remain pending |
| LOC-01–LOC-24 | Full diagnostic rules catalogue and qualified snapshot sources remain pending; rank formulas and evidence checks here are not a substitute for the catalogue |
| WF-01 | Registry preview/confirmation and persistence implemented; no deployed Node-RED flow |
| WF-06 | Rank import and comparison implemented; citation import remains pending |
| WF-07 | Manual evidence-backed drafts implemented; deterministic recommendation engine and qualified local inference remain pending |
| WF-02/03/04 | GBP profiles, reviews and performance adapters and authorized Google access remain pending; existing GSC tools are separate |
| WF-05 | Existing verified-domain audit pilot remains separate; this module cannot launch unrestricted Playwright |
| WF-08/09 | External publication, reconciliation, verification and compensation remain disabled; manual-pending is never called verified |
| WF-10 | Scoped JSON export available; cohort reports, scheduled summaries and localized narrative reports remain pending |
| Node-RED | Selected architecture, not installed or deployed; authenticated job contracts, durable queue, resource reservations and flow fixtures still required |
| Local model | Optional, unavailable; requires pinned licensed artifacts, hardware capacity and per-language qualification |
| Maps grid acquisition | Not provided; declared imports only, no paid fallback or scraping |
| Multi-site campaigns | Frozen target sets, per-language review, DST-aware scheduling and batch reconciliation remain pending |
| Privacy | Structured private addresses rejected; full free-text redaction and publication/export privacy checks still required before external publishing |

Do not market pending capabilities as available. Do not activate a connector merely because a key exists in the environment. The v1.1 no-paid-provider constraint supersedes earlier DataForSEO/Anthropic integration ideas for this module. Node-RED is the selected open-source orchestrator; n8n is not a runtime dependency.

## Validation

`tests/local-seo-network.test.ts` covers deterministic denominators, comparison boundaries, invalid imports, preview confirmation, stable IDs, persistence after reopening SQLite, tenant isolation, exact grants and immediate revocation, evidence deduplication, separate approval, stale-version refusal, approval invalidation and web-only applicability. `tests/local-seo-network-ui.test.ts` covers CSV quoting/hostile columns and FR/EN rendering without changing research language. The landing browser QA checks the free planner on desktop/mobile in both languages.

This increment covers portions of REC-01/02/03/04/05/06/07/11/13/23/25/30. It does not claim full acceptance of those scenarios or the complete specification. In particular, revocation tests cover synchronous commands, not future jobs, since no local SEO job executor is shipped.
