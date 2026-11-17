# Console decision cockpit refit

This implementation follows the customer-provided console refit RFC. The first
release changes navigation and progressive disclosure while preserving existing
backend engines, tenant guards, approvals and publication rules. It does not claim
that all four RFC delivery lots are complete.

## Delivery status

| RFC lot | Current scope | Still required |
| --- | --- | --- |
| 1 Navigation and decluttering | Five business areas, business subviews, source-aware evidence drawer, preserved tool bookmarks, searchable specialist tools, preview badge, top three existing audit recommendations | Profile-specific defaults belong to the later portfolio/profile work |
| 2 Execution bridges and unified inbox | Review workflows are grouped in Studio; individual module lists and confirmations remain intact | Normalised inbox rows, context-prefill contracts, durable audit snapshot handoff |
| 3 Intent and measurement reliability | Planner and observed query sources are discoverable in one business view; an explicit unknown measurement state avoids a false green signal | Synchronized two-column intent workspace and a complete, dated integrity assessment |
| 4 Impact and portfolio | Existing analytics, GBP and CRM views are grouped under Impact | Verified deployment milestones, chart overlays, J+14/J+28 reminders and authorised cross-workspace aggregation |

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

Social and GBP already expose scoped approval state. WordPress draft generation,
Apply previews, GTM confirmations and CRM identity linking do not share a durable
approval queue. A shared inbox must preserve each object's origin, actor, digest,
expiry, grants and independent-approver rules. Do not manufacture pending objects
from an empty response or treat an unreadable source as an empty queue.

An approved object is not a deployed action. WordPress creates `status=draft`;
Apply Mode supports only a read-only `robots-ai` preview, not arbitrary llms.txt,
JSON-LD or meta diffs. A real deployment marker must come from an execution receipt
and, where supported, successful readback. A user-reported deployment must be
labelled as such. Do not announce an unpublished WordPress draft to IndexNow.

### Measurement integrity

`/tracking/status` exposes page-level `auditGtmInstallation` observations. The
remaining GA4 setup and duplicate-tag audit engines exist as MCP tools, but the
console has no unified persisted run covering all RFC checks. Add **Not assessed**
as a fourth state. An access check, a detected tag or absence of saved failures
cannot imply **Measurement intact**. A later read adapter can reuse the existing
engines, but needs a scoped, dated completeness contract before any green state.

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
reuse platform-admin listings as an agency entitlement. No cross-tenant reads are
added by this navigation release.

## Acceptance and release

Tests traverse all five business areas and all 30 legacy screens in FR/EN,
exercise tool search, verify differentiated icons, and assert tenant headers and
absence of automatic mutation calls. Source-state tests cover denied, unavailable,
configured-without-listing and disabled CRM cases. Browser QA checks the actual
console shell on desktop/mobile, the three priorities and collapsed source drawer.

Deploy through the existing protected OVH workflow. Keep new backend contracts and
their approval/receipt semantics separately reviewable before implementing lots
2–4. The refit does not require a new framework, paid service or model provider.
