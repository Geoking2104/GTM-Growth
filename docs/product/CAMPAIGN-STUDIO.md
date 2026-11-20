# Campaign Studio

[Project](../../README.md) · [Capability register](../journey/CAPABILITIES.md) · [Approved target specification](CAMPAIGN-STUDIO-JOINTJS-SPEC-2026-11-20.md)

Implementation increment: **20 November 2026, Europe/Paris**. This guide describes
the implemented planning workflow. Source delivery and a production deployment
are separate milestones.

## Customer workflow

Open **Studio & Approvals → Campaign scenarios**, or follow **Create a scenario
from these findings** beneath the cockpit priorities. The stable console address
is `#studio/campaigns`; `#ops/campaigns` opens the same editor.

1. Create a campaign with its objective, audience, calendar dates, time zone,
   currency, budget and selected channels. Select findings already available in
   the workspace. A blank campaign works without an AI account.
2. Add actions manually or choose **Suggest a plan**. The local guided mode creates
   editable preparation and verification steps by channel. The AI mode uses a
   configured account after the user selects it and authorises the request.
3. Inspect the proposed additions, changes, removed steps, dates and budgets.
   Accepting a proposal updates the plan. It does not approve or execute an
   external campaign.
4. Organise the visual graph, adjust the same actions in the table or schedule,
   and set owners, deadlines, effort, budget, dependencies, checklists and KPIs.
5. Open the relevant native module to prepare the actual deliverable. Its existing
   approval and execution rules still apply. Record sourced results in the plan,
   discuss the campaign and revise it as new evidence arrives.

Both languages use the same editor and API. On mobile the table is the initial
view; every meaningful graph operation is also available through labelled forms.

## Views and interactions

| Surface | Implemented behavior |
| --- | --- |
| Campaign list | Paginated summaries, search over loaded campaigns, progress, dates, channels, archive filter and load more |
| Visual scenario | Locally bundled JointJS Community canvas; move cards, connect ports, zoom, fit and arrange by channel |
| Schedule | Calendar bars grouped by channel; select an action to edit dates or request a dependency reschedule preview |
| Table | Shared action records, keyboard controls, progress selection and inspector access |
| Inspector | Step type, channel, dates, responsible role, optional verified account, effort, costs, checklist, evidence, KPI and lock |
| Proposal review | Before/after node changes, dependency and budget changes, explicit accept or dismiss |
| Collaboration | Workspace comments, optional step references, immutable version history and reviewable restoration |
| Export and reuse | JSON, CSV, Markdown, browser Print / Save as PDF, duplicate and archive |

The semantic graph is stored separately from visual positions. Changing the view
does not create another campaign. Draft saves use an expected version; another
editor's save produces a conflict instead of overwriting it. Failed edits remain
available in the current browser session for recovery or download. Undo/redo is
local to the current editing session. A restoration creates a new version after
review; it does not rewrite history.

The interface uses a strict Content Security Policy without remote scripts or
inline stylesheet exceptions. Its JointJS Paper subclass uses an external local
stylesheet. If the diagram bundle is unavailable, the table and schedule remain
usable. The editor does not depend on JointJS+ commercial components.

## Evidence and measurement

The server captures bounded recommendation snapshots after a successful,
tenant-owned `/overview` audit. Existing stored demand observations and tracking
audit findings can also feed a scenario. Historic cockpit score-only records do
not acquire invented recommendations; run an analysis to create those snapshots.

Observed evidence is resolved by identifier on the server. A browser cannot
submit arbitrary text as a measured audit. Each campaign keeps its immutable
snapshots, source date and scope. Current domain, property and resource access is
rechecked on reads and changes, including after the rolling observation cache has
moved on. A manual finding remains **declared** or **hypothetical**.

KPI baseline, target and actual values have distinct meanings. Missing values
remain `null`, exported as empty cells. An actual result requires a source and an
observation timestamp. A generated plan cannot manufacture a baseline or actual
result, change an existing measurement into another metric, or mark an action as
already completed. Targets and estimated costs remain planning assumptions.

Readiness points are neither AI citation counts nor traffic/revenue forecasts.
The plan does not infer individuals, CRM identity links, attribution or causal
uplift from aggregate data.

## Dates, responsibility and budgets

Dates are **calendar days** (`YYYY-MM-DD`) in a named IANA time zone, with an
explicit campaign horizon. No hidden midnight conversion changes a day when a
viewer opens the schedule from another time zone. A finish-to-start relationship
means the successor starts on the following calendar day, plus any lag. A
start-to-start relationship uses the predecessor's start date. Measurement
feedback links can close a visual loop without entering the scheduling DAG.

Rescheduling prepares a preview of affected downstream dates. Locked nodes can
block the change. The preview must be accepted against the current version.
Ordinary date edits can retain a warning about a dependency; the plan checker
surfaces those warnings. The graph rejects scheduling cycles and broken references.

An owner is an editable responsibility label, for example “SEO lead” or
“Agency designer”. A verified account association is a separate field. The
current account is available; arbitrary external identities cannot be asserted as
workspace members. A complete organisation directory, invitation flow and workload
capacity calendars are not introduced by this module.

All monetary values use integer minor units and a campaign currency. A campaign
budget of zero means the ceiling is not yet defined; generation then proposes
zero-cost estimates until a person sets a budget. Positive ceilings are enforced
for generated proposals; manual allocations above a positive ceiling produce a
visible warning. Saving a plan never spends its budget.

## Generation contracts

| Mode | Input and output | Cost / prerequisite |
| --- | --- | --- |
| Guided plan | Deterministic channel templates grounded in selected findings; preparation and verification tasks, dates, roles and checklists | Local processing; no model account or provider request |
| AI copilot | Natural-language instruction plus authorised plan/evidence; validated JSON proposal; no tools or executable code | Member administrator, configured account, explicit confirmation; provider charges may apply |
| Selected steps | Revise only selected, unlocked steps; preserve the rest of the campaign | Same source, role, version and budget checks |
| Reschedule / restoration | Deterministic review of dependent dates or a previous version | Local processing and current-version acceptance |

The AI providers are **OpenAI, Claude, Mistral and Grok**, reusing the encrypted
tenant account resolver documented in [AI provider setup](AI-VISIBILITY-PROVIDERS.md).
Grok uses the local xAI mark. The model name is shown in the account selector.
Gemini generation is not exposed by Campaign Studio.

Provider endpoints are fixed. Requests have no browser fetch tools, publishing
tools, arbitrary webhooks or shell commands. Findings and user text are untrusted
data. Structured output is validated again on the server; IDs are assigned by the
server, evidence references must be known and protected steps remain unchanged.
Malformed output, an unavailable account or a timeout leaves the saved plan intact.
There is no automatic provider retry or fallback to another billed account.

Operational limits per workspace are 10 AI attempts per rolling hour, 50 per
rolling day and one in-process request at a time. Each request is bounded to
45 seconds, 45,000 input characters, 6,000 output tokens, a 200,000-byte response
and 30 generated steps. These are technical ceilings, not a quoted monetary price.
Unsuccessful dispatched attempts still consume the call allowance. The existing
Cloud gate applies; local draft edits do not consume analysis-operation quota.
Retained scenario reads and exports remain available when a Cloud subscription
becomes read-only.

Override a model for one tenant using
`SCENARIOS_<PROVIDER>_MODEL_<TENANT>`, with an uppercase tenant ID and hyphens
replaced by underscores, for example `SCENARIOS_GROK_MODEL_ACME_SHOES`.
The existing `AI_VISIBILITY_<PROVIDER>_MODEL_<TENANT>` setting is the fallback
before the provider default. Never put API keys into a scenario or source file.

## Permissions and native handoffs

Every endpoint requires an active, explicitly resolved human workspace membership.
A platform administrator without that membership and a service/AI account cannot
operate the studio. Member users create and edit their own campaigns; workspace
administrators can edit workspace campaigns. Other members can inspect authorised
campaigns, comment and duplicate them. Archived campaigns are read-only.

| Channel | Planning handoff |
| --- | --- |
| SEO / GEO | Existing audit and optimisation views |
| Content | Article/WordPress preparation; existing review flow |
| Local | Scoped local network and native GBP validation |
| Social | Existing Social campaigns, content and independent approvals |
| Email / CRM | CRM planning context; no message delivery |
| Paid media | Planning only; no ad-platform writer |
| Analytics / CRO | Existing GA4 / impact views and sourced observations |

A linked native resource must belong to the selected workspace and pass its
specific read scope. A campaign “tracking” status only describes progress in this
planner. It is not a scheduled job, publisher receipt or proof that an external
action happened. This module does not create a universal execution engine or
replace existing Social campaign records.

## Persistence and operating limits

The SQLite file defaults to `scenarios.sqlite3` beside `TENANTS_PATH`, normally
`data/scenarios.sqlite3`; `SCENARIOS_PATH` can override it. Preserve the existing
data volume. No new network service is required. This local store follows the
current single-API-writer deployment; do not run independently writable replicas
with separate copies of this file.

| Limit | Value |
| --- | --- |
| Graph | 300 nodes, 1,000 links, 500 evidence snapshots |
| Draft size | 2 MB JSON character bound, within the API body limit |
| Campaign horizon | At most ten years |
| Workspace | 500 campaigns, 128 MiB stored JSON payload across the module tables |
| Campaign history | 5,000 revisions; latest 100 listed, exact version retrievable |
| Comments | 2,000 per campaign; latest 200 shown |
| Campaign list | 30 summaries by default, maximum 50 per page |

The storage limit is a payload bound, not the physical SQLite/WAL disk size. At
capacity the transaction is rolled back and the user receives a capacity error.
Reads and exports remain usable; a new save, duplicate or archive may require
operator retention work. History is never silently discarded to make a save pass.
Back up with SQLite's backup facilities or a stopped writer, rather than copying
only a live database while omitting its WAL. Tenant erasure must include all
`scenario_*` tables and any backup according to the operator's retention policy.

## Source map and verification

| Area | Source |
| --- | --- |
| Domain constraints | `src/scenarios/model.ts` |
| SQLite, immutable source snapshots and limits | `src/scenarios/store.ts` |
| Versions, proposals, rescheduling and exports | `src/scenarios/service.ts` |
| Trusted analysis adapters | `src/scenarios/evidence.ts` |
| Local templates and AI adapters | `src/scenarios/generation.ts` |
| Scoped console routes | `src/console/scenarios.ts` |
| Editor, UI helpers and styles | `site/console/scenarios.{js,css}`, `site/console/scenarios-model.js` |
| Reproducible dependency assets | `scripts/vendor-joint.mjs`, `site/assets/vendor/joint-core/` |
| Behavior and security tests | `tests/scenarios-*.test.ts` |
| Real browser flow and CSP | `scripts/qa-scenarios.mjs` |

Run `pnpm run vendor:check`, `pnpm run typecheck`, `pnpm run lint`, `pnpm test`,
`pnpm run build`, `pnpm run docs:check`, `pnpm run site:check` and
`pnpm run qa:scenarios`. Browser QA uses synthetic tenants, temporary databases
and the real planning handlers. It exercises both languages, desktop/mobile,
JointJS editing, autosaves, channel schedule, proposal review, locked steps and
comments without paid calls or external campaign writes. CI retains screenshots.

The repository pins `@joint/core` and esbuild; regenerate the vendored ESM using
`pnpm run vendor:joint` after an intentional dependency update. The local
[notice](../../site/assets/vendor/joint-core/NOTICE.md) includes the MPL-2.0 license
and exact upstream source archive. The OVH nginx configuration explicitly serves
the ESM file as JavaScript, including on nginx installations whose MIME table
does not recognise `.mjs`.

## Scope beyond this increment

The target specification also describes capacity/holiday calendars, timed
automation, granular contributor roles, a complete member directory, realtime
coediting, automatic metric refresh and network rollouts. Those require additional
module contracts and acceptance work. This implementation provides the editable,
evidence-based planning and AI proposal workflow; it does not claim those later
execution and organisation features are active.
