# Local SEO operations: GBP, LOC controls and supervised writes

This increment provides code and optional deployment assets, not an activated Google connection. No paid provider, LLM, Maps scraper or community workflow node is used. UI copy is French/English; API contracts and repository documentation are English. The public free checklist remains available without credentials. Tenant credentials and publication authority are never exposed to that public journey.

## Google connection

The operator must obtain Google Business Profile API project approval, enable Business Information and My Business APIs, and obtain offline OAuth authorization with `https://www.googleapis.com/auth/business.manage` from an authorized listing manager. This release has no self-service OAuth callback. A service-account JSON file used elsewhere in the application is not reused.

API enablement, OAuth branding, OAuth client creation and listing-manager consent are separate steps. In Google Cloud, check Business Information API's **Quotas and system limits → Requests per minute**: `0` means the project has not received GBP API approval; Google documents `300` QPM as the approved state. An enabled API or a configured consent screen alone does not make synchronization operational. Follow Google's [basic API access request](https://support.google.com/business/workflow/16726127) with a verified profile managed by the applicant and active for at least 60 days. Do not request a routine quota increase to bypass this approval gate.

Mount a read-only secrets directory and set `GBP_CREDENTIALS_DIR` to it. For tenant `acme`, create `acme.json` with restrictive permissions, using real values only in the secret store:

```json
{
  "enabled": true,
  "writeEnabled": false,
  "clientId": "operator-supplied",
  "clientSecret": "operator-supplied",
  "refreshToken": "operator-supplied",
  "account": "accounts/123",
  "locations": ["locations/456"],
  "requestsPerHour": 100
}
```

Protect secrets and backups with the deployment platform's encryption and access controls. The application does not implement a credential vault. Configuration is reloaded for each request; removing authorization disables subsequent calls. Requests reserve a durable per-tenant hourly quota, including token refreshes. Responses are size-limited, redirects rejected and individual requests time out after 15 seconds. No token or Google error body is exported to console state or audit events.

A tenant administrator enters the exact local site ID and authorized `locations/...` resource, inspects Google's title and URL, then confirms the hashed preview. There is no fuzzy matching or automatic account discovery. Synchronization stores dated, source-labelled profile facts. Reviews are paginated up to 500 records; an incomplete collection remains unknown. Only review IDs, dates and reply presence are retained, not review text or reviewer identity. Review replies, special hours, addresses and performance are not written or fully collected in this release.

## LOC-01 to LOC-24

Every registered site receives 24 results: `pass`, `fail`, `unknown` or `not-applicable`. Missing/stale data never becomes a pass or zero. Snapshot freshness is 48 hours by default; collection and access controls apply their own cadence checks. Coverage excludes inapplicable controls; conformity is nullable and a summary is marked unreliable below 80% coverage. A passing declared fact is not independently certified by Google.

| Control | Deterministic rule | Input source in this release |
| --- | --- | --- |
| LOC-01 | Exactly one confirmed identity match | Confirmed GBP binding/read or declared evidence |
| LOC-02 | Successful authorized sync within 24 hours | GBP sync |
| LOC-03 | Last success within twice the configured cadence | GBP sync or declared evidence |
| LOC-04 | Prudently normalized names match | GBP/registry |
| LOC-05 | Valid E.164 phones match, or dated approved exception | GBP/registry |
| LOC-06 | Supported-country normalized address components match | Declared evidence |
| LOC-07 | Masked service-area address absent from declared public fields | Declared evidence; not a complete public crawl |
| LOC-08 | Time zone matches the registry and normalized intervals do not overlap | GBP periods or declared hours |
| LOC-09 | Required exceptional dates for next 30 days confirmed | Declared evidence |
| LOC-10 | Normalized listing and reference URLs match | GBP/registry; no redirect collector |
| LOC-11 | Complete review collection has no reply overdue by 48 hours | GBP reviews or declared evidence |
| LOC-12 | Expected page is HTTP 200, robots-allowed and indexable | Declared evidence |
| LOC-13 | Expected and observed canonical URLs match | Declared evidence |
| LOC-14 | Expected hreflang URLs are reciprocal and HTTP 200 | Declared evidence |
| LOC-15 | Confirmed structured identity matches | Declared evidence |
| LOC-16 | At least one internal link; zero requires complete coverage | Declared evidence |
| LOC-17 | Fresh, identity-matched citation values agree | Declared evidence |
| LOC-18 | Exact duplicates fail; ambiguous candidates remain unknown | Declared evidence |
| LOC-19 | Comparable rank imports both have ≥90% coverage; loss ≥15 percentage points fails | Existing rank imports |
| LOC-20 | Workflow deadline is not overdue or execution succeeded | Declared evidence |
| LOC-21 | Expected hash matches independent dated readback | Publication readback or declared evidence |
| LOC-22 | Allowlisted free connector is qualified and quota reserved | Declared evidence; no paid fallback |
| LOC-23 | Current digest, valid target language, unexpired approval and rights | Declared evidence |
| LOC-24 | Every factual AI assertion references accessible evidence | Declared assertions; accessible IDs are resolved server-side |

`src/local-seo/controls.ts` defines the versioned `loc-v1` schema and rules. Website/citation crawling, qualified local inference and automatic feeds for every control are pending. Web-only applicability is explicit. Raw evidence is available only through scoped authenticated reads; state exports expose snapshot metadata, not the snapshot body.

Example `POST /api/console/local-seo/evidence/import` body:

```json
{"snapshot":{"siteId":"brussels","observedAt":"2026-11-12T12:00:00Z","facts":{"indexing":{"expected":true,"status":200,"robotsAllowed":true,"noindex":false}}}}
```

Imports are always labelled `declared`; callers cannot impersonate GBP/system provenance. Maximum 5,000 snapshots per tenant, with atomic capacity refusal instead of silent pruning.

## Supervised publication

Only `websiteUri` and `phoneNumbers.primaryPhone` are writable. URLs must use HTTPS and a registered tenant domain; phone numbers use E.164. No free-text posts, replies, address edits, bulk publication or scheduled write is exposed.

1. An administrator selects a site, its business language and one new value. The backend reads the exact bound listing and calls Google's `validateOnly` endpoint. The stored before/after diff and digest are immutable.
2. A different tenant administrator approves that exact digest for 30 minutes.
3. The approving administrator explicitly presses Publish. Both `LOCAL_SEO_PUBLISH_ENABLED=true` and tenant `writeEnabled=true` are required. Default is disabled.
4. The backend rechecks scope, mapping, language, digest and expiry, obtains a per-target lease, rereads Google and refuses external drift before validating and writing the single-field update mask.
5. A separate GET must confirm the desired value before the publication becomes `verified`. This means API readback, not public Maps visibility.

Registry, grants and binding changes invalidate pending authority through a scope version. Platform admins, machine accounts and local users cannot publish through this module. SSO role freshness follows the existing JWT validation lifetime; this release does not add continuous identity-provider introspection.

A timeout after dispatch becomes `uncertain`: reconciliation reads only and never blindly repeats the PATCH. An expired preflight lease with no dispatch becomes failed. A successful remote update followed by a local failure can be recovered through readback. Conflicting external state requires human resolution. Google supplies no compare-and-swap transaction here; a residual race between final read and PATCH remains. Do not promise atomic remote conflict prevention. Rollback requires a fresh separately reviewed diff; no automatic compensation is attempted.

Routes under authenticated `POST /api/console/local-seo/`:

| Route | Required input |
| --- | --- |
| `gbp/bind` | `siteId`, `location`; confirmation also `confirm:true`, preview `hash` |
| `gbp/unbind`, `gbp/sync` | `siteId`; sync optionally `reviews:true` |
| `evidence/read` | Exact snapshot `id` |
| `jobs/enqueue` | `siteId`, supported `workflow` |
| `publication/preview` | `siteId`, `language`, `change:{field,value}` |
| `publication/approve`, `publication/execute` | Publication `id`, exact `digest` |
| `publication/verify`, `publication/cancel` | Publication `id` |

## Node-RED and durable jobs

See [the optional runtime setup](../../deploy/node-red/README.md). The ten exported workflow tabs explicitly distinguish operational pollers from manual/pending steps. Five core-node pollers execute queued work:

- WF-02: GBP profile synchronization.
- WF-03: profile and review synchronization.
- WF-07: evaluate deterministic controls; no generated recommendation or local LLM.
- WF-09: read-only publication reconciliation.
- WF-10: persist a control summary; no emailed/cohort narrative report.

WF-01 and WF-06 remain console operations. WF-04 performance collection is pending; WF-05 remains the separate verified-domain crawler pilot. WF-08 requires human console approval and execution and is intentionally absent from worker commands.

`LOCAL_SEO_WORKERS_FILE` points to a read-only JSON object mapping SHA-256 token hashes to `{ "tenant":"acme", "workflows":["WF-02","WF-03","WF-07","WF-09","WF-10"] }`. Generate a random base64url token of at least 32 characters; give its plaintext only to that tenant's Node-RED instance. Never commit tokens. The internal route accepts only `{ "workflow":"WF-02" }`, not a tenant, URL, diff or approval. Remove a hash to revoke future polling.

A console administrator enqueues work; polling does not itself create recurring collections. SQLite persists jobs, leases and attempts. Only one job per tenant runs at a time. A ten-minute lease survives restarts; at most three attempts are allowed, with one-hour quota backoff or one-minute transient backoff. Access/scope revocation stops work. Jobs and snapshots require explicit retention management when capacity is reached. This is a single-host pilot, not a distributed scheduler.

## Qualification and remaining gates

Unit/integration tests cover deterministic controls, tenant-scoped credentials and quotas, private worker authentication, durable retries/revocation, independent approvals, external drift, digest tampering, concurrent dispatch and timeout reconciliation. `scripts/qa-local-seo-flows.mjs` executes all five exported pollers on real pinned Node-RED against a local fixture. Browser QA checks FR/EN controls and publication previews; CI produces screenshots.

Before a live pilot: enable approved Google access, mount tenant-specific secrets, provision two distinct administrators, verify persistent-volume backup/restore, qualify the optional container's resource budget, run a read-only sync, and only then deliberately enable writes for an owner-authorized test listing. No production Google integration, publication or deployment is claimed by repository tests.

References: [Google prerequisites](https://developers.google.com/my-business/content/prereqs), [location patch/validateOnly](https://developers.google.com/my-business/reference/businessinformation/rest/v1/locations/patch), [offline OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Node-RED security](https://nodered.org/docs/user-guide/runtime/securing-node-red).

## On-demand GBP dashboard (14 November 2026)

The console now has a single-location dashboard. The authenticated `gbp/dashboard` route reads review totals/rating and one daily Performance metric for a selected month. Enable the Business Profile Performance API in the approved operator project in addition to the APIs above. Existing per-tenant OAuth credentials, location allowlist and confirmed binding are reused; users also need the matching local delegation.

Two independent bounded reads produce partial success when one API fails. Every network request, including token refresh, consumes the existing tenant quota. The review distribution covers only the first page (up to 50 reviews, update-time descending); names and comments are discarded. Dashboard data is transient, is not exported by `local-seo/export`, and does not populate evidence snapshots. `WF-04` scheduled performance collection remains unimplemented.

See [the retail specification](GBP-RETAIL-SPEC.md) for the reference layout, metric definitions, connection requirements, future editorial workflows and acceptance criteria. Live verification needs an authorised pilot account; fixture-based tests do not establish that production credentials are configured.
