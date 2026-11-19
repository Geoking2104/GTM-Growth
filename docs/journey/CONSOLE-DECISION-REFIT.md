# Console decision cockpit refit

The refit keeps the existing Node/TypeScript, Express/Keycloak, SQLite and
buildless bilingual console stack. This release connects the four requested
workflows; it does not claim the remaining impact-annotation/reminder work.

## Delivery status

| Area | Implemented | Limits |
| --- | --- | --- |
| Navigation | Five business areas, top three existing audit recommendations, evidence drawer, 30 specialist routes and search | Portfolio is an additional member-only destination, not a sixth area for single-workspace users |
| Unified inbox | Native Social/GBP rows plus persisted WordPress, robots preview, GTM and CRM-link proposals; filters, exact payload, origin, author, expiry, approval and explicit execution | Social/GBP distribution remains in its native module; robots diffs are not executed; WordPress creates drafts |
| Intent | Two-column product planner and retrieved GSC/Bing/AI evidence; stage selection synchronizes; persistent page/stage associations and contextual article brief | AI answers have no fabricated search volume; Bing provides no invented query/page mapping; associations are editorial |
| Measurement | Four existing engines orchestrated, selected scope and live version, persisted audit, completeness and four states; health above GA4/CRM | Up to five static pages; dynamic consent and actual event delivery need separate runtime validation; older than seven days is stale |
| Portfolio | Explicit member workspaces, separate authenticated requests, two concurrent reads, per-card errors, latest stored audit and native report links | No platform-admin enumeration, combined revenue, invented histories or new cross-client permission |
| Impact extensions | Existing analytics and CRM remain accessible | Verified deployment milestones, chart overlays and J+14/J+28 reminders still required |

The RFC targets (<3 minute activation, +40% action conversion, halved approval
latency, >65% proof adoption) are hypotheses to measure, not achieved outcomes.

## Navigation and compatibility

| Primary destination | Subviews | Existing specialist destinations retained |
| --- | --- | --- |
| `#overview` | Priorities, scenarios, reports | `#overview/plan`, `#calculators`, `#report` |
| `#diagnose` | Technical/AI, tracking, intent, local | `#geo`, `#audit`, `#sitemap`, `#performance`, `#journey`, `#keywords`, `#competition`, `#local_seo` |
| `#ops` | Approvals, content, diffs, social, indexing | `#ops/articles`, `#ops/prompts`, `#ops/rank`, `#ops/alerts`, `#generators`, `#apply_mode`, `#social` |
| `#impact` | Visibility, analytics, local, CRM | `#gsc`, `#bing`, `#ai_visibility`, `#ga4`, `#crm` |
| `#settings` | Sources, locations, agents, access | `#tracking`, `#commerce`, `#agents`, `#billing`, admin-only `#platform` |

All 30 specialist screens remain routable. Search finds tools and individual tabs;
the selected business area stays highlighted on legacy links. New area/subview
links survive Keycloak sign-in through the existing allowlisted handoff. The
navigation changes no workspace membership and creates no provider permissions.

Only confirmed-access data cards appear in the main Impact hubs. Unconfigured,
restricted, unknown and failed connection states remain distinct in a closed
**Enrich my evidence** drawer. Source setup and specialist deep links stay
available. Missing observations never become zeros. Configured GBP additionally
requires an associated listing; CRM collection must be enabled. These states do
not claim successful data collection, complete history or valid measurement.
The social results card checks configured Postiz accounts; manual observation
imports remain accessible from the drawer without a connector. AI evidence cards
check for an existing dataset. The cockpit also collapses missing data panels and
workspace setup instead of putting empty charts ahead of its priorities.

Initial background preload is limited to overview and tracking status, plus the
existing visual context. Other analyses load when requested by their view. This
avoids launching 27 unrelated analyses merely by entering the workspace.

## Contract corrections identified in the existing stack

### Profiles

The stored assistant profile accepts `owner`, `marketer`, `agency`, `technical`,
with goals including `local`. It does not accept the RFC's `solo`,
`marketing_team` or `network_hq` role values. Use an explicit UI mapping
(`owner` → solo, `marketer` → marketing team), and combine the local goal with
an explicit user choice for headquarters. Never infer head-office privileges or
multi-tenant access from a business persona. No profile migration is included here.

### Approval and deployment semantics

Social and GBP expose scoped approvals. The inbox calls their existing guarded
commands, preserving independent approvers, digest and expiry. Unreadable sources
are labelled unavailable and the pending count is explicitly partial.

Other proposals are immutable, tenant-scoped records with an author, origin,
SHA-256 digest, target, seven-day expiry (technical previews retain their shorter
expiry), approval rationale and receipt. Approval alone never calls a provider.
GTM inventories include a revision of raw resource data; changes after proposal
block execution. Publication also requires typing the current public container
ID. WordPress quality checks are recomputed on the server and its target is
bound to the proposal. CRM IDs are hashed using the existing HMAC mechanism;
source scope, proof and contact eligibility are rechecked before linking.

The state transition reserves `executing` before sending a provider request.
Success stores `completed` with its receipt; ambiguous errors store `uncertain`.
Neither state can be automatically dispatched again. A process interruption may
leave `executing`; inspect the native destination before preparing a replacement.
Technical previews can be approved but never executed by this module.

### AI evidence to editorial impact

From an AI answer, pin the observation and its citations to an owned page and
an Intent stage. The pin fixes the question, source, tracked brand and capture
context. Open the linked brief in Articles, save a revision and submit it to the
inbox. Approval and draft creation use the existing WordPress checks. Later
edits create a new revision and preserve the approved draft in the inbox.

After publication in WordPress, verify the completed inbox item from the brief.
WordPress must return a public, password-free post or page at the pinned URL
with the approved title and content. If the draft was applied to an existing
post or page, enter that published item's ID and type. The effective date uses
the later of publication and last modification reported by WordPress in UTC.
The verified record preserves the submitted version and WordPress post ID.
[WordPress post fields](https://developer.wordpress.org/rest-api/reference/posts/)

J+14 and J+28 compare equal, closed UTC windows on either side of that date.
The comparison excludes the intervention day and requires the pinned cohort
and at least five observations in each window. The brief shows the reason for
an unavailable comparison. Source-only comparisons are marked as limited
confidence. Causal attribution requires separate evidence.

A workspace admin can share the displayed answer excerpt and individual
citations with a specific private web report. Use the `id` from the report link,
the exact report page and the recipient's email. The invitation or verified
session must still be active. The recipient opens the evidence through the
report's normal email-code login. PDF and Markdown exports contain the base
report. An admin can revoke this workspace's evidence for that report from
Intent. Grants expire with the report and use its existing access store.

### Measurement integrity

`/decision/measurement/run` reuses page installation, GA4 setup and duplicate-tag
engines under the active workspace credential. Fresh audit reads bypass Redis;
GA4/GTM clients are constructed per credential context. Suppressed Google access
failures now carry coverage metadata. Missing live-version/status access,
unpublished workspace edits or incomplete GA4 comparison prevent a passed run.
Known critical findings remain critical even when other checks are incomplete.

The stored scope includes container, workspace, GA4 property and selected owned
pages. `/decision/measurement/latest` revalidates ownership and marks audits older
than seven days stale. The banner is informational: it does not block existing
analytics or imply a causal revenue claim.

### Durable state and API

`DECISION_PATH` defaults to `decision.sqlite3` beside `TENANTS_PATH`, normally in
the persistent `data` volume. SQLite immediate transactions protect transitions
and optimistic intent versions; files are created with mode 0600. Per workspace:
1,000 proposals, 500 pins, 500 retrieved observations, 30 audits, 5,000 log entries,
and an 8 MB payload bound. Capacity failures are explicit. Back up the data volume
with the existing deployment procedure; no extra daemon or migration is required.

| Console POST route | Contract |
| --- | --- |
| `/decision/inbox` | Read normalized visible reviews and per-source availability |
| `/decision/propose` | Member admin prepares an immutable WordPress/diff/GTM/CRM proposal |
| `/decision/decide` | Admin decision on exact digest, rationale and explicit review confirmation |
| `/decision/execute` | Separate admin confirmation; recheck and reserve before dispatch |
| `/decision/intent` | Read scoped stage/page pins and state version |
| `/decision/intent/evidence` | Retrieve existing GSC/Bing/AI observations; no model generation |
| `/decision/intent/pin`, `/remove` | Admin edits using expected state version; no client-supplied metrics |
| `/decision/intent/ai-pin` | Admin pins a stored answer by workspace panel and observation IDs |
| `/decision/editorial/brief`, `/save` | Read a page-linked brief and save with an expected revision |
| `/decision/editorial/verify`, `/follow-ups` | Verify a published WordPress revision and read its J+14 and J+28 cohort comparisons |
| `/decision/editorial/share-evidence`, `/revoke-evidence` | Grant or revoke selected evidence on one private report |
| `/decision/measurement/run`, `/latest` | Explicit admin audit / member read of latest valid scope |
| `/decision/portfolio/card` | One explicitly authorized member workspace per request |

Read-only state routes remain accessible under the existing billing read policy;
new provider reads and mutations use normal Cloud authorization. Each response
uses `Cache-Control: no-store`. Invalid schemas return 400; stale intent/proposal
versions return 409. The UI reloads pins after a conflict so the user can retry
against current state. All external content is rendered as text, not HTML.

### Audit continuity and impact

Current public sign-in handoff preserves the analysed URL, not a tenant-bound
snapshot. The newer report-access snapshot is governed by its email-code access
flow. Linking that snapshot to a workspace needs an explicit ownership/access
check; matching a domain does not grant access to another user's private report.

The current stores do not provide a universal `ActionMilestone` stream. Normalise
existing execution receipts first, preserve source identifiers and currencies,
and label chart annotations **Actions deployed during the period**. Correlation
must not become causal attribution. Scheduled reminders need durable idempotent
state and a worker; browser storage is not an adequate substitute.

The Portfolio must read only explicit memberships returned for the current user,
re-authorise each tenant request and preserve inaccessible/unknown states. Do not
reuse platform-admin listings as an agency entitlement. Each Portfolio card supplies its own `X-Tenant` header and never mutates the active
workspace selector. A membership is checked again on the server.

## Acceptance and release

Tests traverse all five business areas and all 30 legacy screens in FR/EN,
exercise tool search, verify differentiated icons, and assert tenant headers and
absence of automatic mutation calls. Source-state tests cover denied, unavailable,
configured-without-listing and disabled CRM cases. Browser QA checks the actual
console shell on desktop/mobile, the three priorities and collapsed source drawer.

Deploy through the existing protected OVH workflow. CI exercises proposal conflicts, expiry, source failures, tenant boundaries,
credential isolation, no automatic publication and the four browser journeys. The refit does not require a new framework, paid service or model provider.
