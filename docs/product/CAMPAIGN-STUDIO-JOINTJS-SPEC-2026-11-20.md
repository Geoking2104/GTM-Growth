# GTM Growth — Campaign Studio: functional and technical specification

**Version:** 1.0 — 2026-11-20  
**Status:** specification / proposed implementation, NOT shipped  
**Primary user language:** French and English (same functionality)  
**Sources:** [GTM Growth](https://github.com/Geoking2104/GTM-Growth), [JointJS Community](https://github.com/clientIO/joint), [JointJS licensing](https://www.jointjs.com/license).

## 1. Executive decision

Build **Campaign Studio**, an evidence-driven visual planning layer connecting existing GTM Growth audits, decision priorities, Social campaign drafts, content preparation, local SEO operations, AI visibility observations, CRM and analytics. A campaign is a **versioned plan of human and automated tasks**, not a blanket authorization for connector writes.

Use **JointJS Community (MPL-2.0)** to draw and edit graph nodes and links; implement the domain palette, property inspector, calendar, swimlanes, accessibility fallback, export and templates in GTM Growth itself. **Do not import paid JointJS+ widgets** (notably packaged Stencil, Inspector or advanced exporters) into the Apache-2.0 repository. Review MPL source-file obligations, notices and version pinning before release. No unlicensed JointJS+ code.

Maintain the five-stage product language: **Diagnose → Understand → Prepare → Measure → Coordinate**. Users can begin from a sourced audit finding, a confirmed business objective, an approved template or a request to an AI assistant. AI always proposes a **draft**; publication, payment, account changes, outbound messages and remote fixes require their existing explicit authorization paths.

## 2. Existing implementation — reuse, do not duplicate

| Existing component | Evidence in repository | Campaign Studio usage |
| --- | --- | --- |
| GEO and technical SEO | src/geo/audit.ts, src/geo/types.ts, site/console/decision-workspace.js | Findings, scores, evidence URLs, recommended fix and priority as typed intake |
| Customer journey | docs/journey/README.md | Buyer context, five awareness stages; hypotheses never presented as observed search demand |
| Social | src/social/model.ts, src/social/service.ts, src/console/social.ts | Existing Campaign/Post/Approval contracts, roles, connector receipts; Studio links to them via typed references |
| Social workflow | docs/product/SOCIAL-TOOLKIT-SPEC-REVIEW.md | Durable approvals and short ZenML jobs, retries/idempotency; no sleeping scheduler |
| Local operations | src/local-seo/ | Country/locale/site/location-scoped tasks; use available Node-RED adapters when permitted |
| AI visibility | src/console/ai-visibility-providers.ts, docs/specs/AI-VISIBILITY-OBSERVATION-MODEL-v1-2026-11-18.md | Prompt observations / evidence, never confuse readiness with actual mentions |
| Measurement | docs/marketing/MEASUREMENT.md, src/google/, src/crm/ | Source-, period-, denominator- and consent-aware outcomes |
| Infrastructure / identity | docs/technical/README.md | Node 24, TypeScript, Keycloak, server-verified tenant/scope, persistent module stores, OVH |

**Key constraint:** The existing Social Campaign (a channel campaign with drafts and publication workflow) must not be silently replaced by the Studio's cross-channel CampaignPlan. Link through \`linkedResource\` and honor existing approval guards. Implement or mark each bridge unavailable; never represent a merely configured connector as operational.

## 3. Jobs to be done / personas

1. **Solo owner:** “Tell me the next actions, effort, due date and expected improvement; propose a plan I can edit in 5 minutes.” Can assign themselves, choose low-cost channels and export.
2. **Marketing lead:** “Coordinate SEO, GEO, content, Social, paid, email and CRM activities in one diagram; assign owners and budget caps; review dependencies.” Can compare plan versions.
3. **Agency:** “Generate a per-client plan without ever leaking another client's resources or accounts.” Agency admin switches explicit client context; no cross-tenant joins.
4. **Head office / franchise:** “Use a global template with per-country/language/local-site variations and delegated approvals.” Global changes create proposed revisions and do not overwrite local modifications.
5. **Contributor / reviewer:** “See only my assigned tasks, comment, provide proof and request approval.” No rights to change an unrelated connector or publish.
6. **Analyst:** “Compare baseline, target and actual results from the same scopes.” Unknown is not zero; correlation is not causal attribution.

## 4. User journeys and screens

### 4.1 Entry points

- **Audit → ‘Créer un scénario’**: pass selected finding IDs and snapshot IDs (not raw untrusted prompts), source URLs, measured date, impacted pages, confidence, affected regions and suggested corrective actions.
- **Decision cockpit → ‘Transformer les priorités en campagne’**: source the top ranked, evidence-backed opportunities.
- **Campaign Studio → ‘Nouveau scénario’**: choose objective, template, horizon, market, product/site and channels.
- **Assistant → ‘Construire un plan pour…’**: use tenant-authorized inputs only, return an editable proposal; show missing sources and assumptions.
- **From existing Social campaign or task**: import as linked reference; no duplicate execution intent.

### 4.2 Wizard (maximum 4 steps)

1. **Context:** client, authorized domain/product/location, objective (leads, sales, GEO visibility, SEO, local discovery, retention), audience, language/country.
2. **Constraints:** start/end in IANA timezone; budget and currency; capacity by person/team; supported channels; required approvers; cannot-contact rules.
3. **Evidence:** choose audits, AI citations, GSC/GA4 and CRM observations; show timestamps, provenance, data gaps and confirmation toggles.
4. **Proposal:** show overview, actions, assumptions, costs, dependencies and accountability; choose “Ouvrir le diagramme” or “Revoir avec l'IA”. Generation is not automatic on navigation.

### 4.3 Main workspace: three synchronized views

**A. Visual canvas (default desktop):** JointJS graph (drag, position, connect, duplicate, multiselect, zoom, pan, keyboard focus); colored *channel* swimlanes or grouped containers (SEO, GEO/AEO, content, Social, local SEO, paid search, email/CRM, analytics), but never rely solely on color. Node cards display title, channel icon, owner avatar/initials, planned due date, status, effort, priority, evidence badge and blockers. Edges represent \`finish_to_start\`, \`start_to_start\`, \`approval_gate\` or \`measurement_feedback\`, with visible explanations. Fit-to-view and minimap implemented in-house if needed.

**B. Timeline / calendar:** Gantt-like weeks/months plus agenda and accessible list. Drag dates with safe rescheduling preview; dependencies, public holidays, capacity conflicts, timezone/DST and milestones reflected across views. Calendar is not a paid JointJS+ feature dependency.

**C. Action table / mobile fallback:** filter by channel, owner, location, date, approval, KPI, status; bulk reschedule/assign subject to authorization. All editing functions available without pointer drag. Mobile defaults to task list and action editor, with read-only simplified graph optional.

**Right-hand task inspector:** descriptive name, decision rationale, evidence (click-through to audit snapshot), expected output, checklist, owner and backups, start/end/deadline/timezone, estimated hours/cost, channel and destination account, locale, requirements, attachment references, predecessor/successor rules, approval gate, measurement KPI and baseline, comments, version history, accessible save/cancel. Unsaved changes warning and explicit conflict resolution.

**Top bar:** undo/redo, save state, draft status, preview, regenerate selected branch, scenario comparison, share scoped view, export, request validation. Keep FR/EN parity and established GTM Growth CSS/logo/unique navigation icons.

### 4.4 AI controls

- “Générer mon scénario” from the chosen evidence and constraints.
- “Réduis le budget à 500 €”, “Concentre les actions sur le GEO”, “Décale d'une semaine”, “Ajoute LinkedIn et l'email”, “Répartis le travail entre les personnes disponibles”.
- “Régénérer uniquement cette branche” while **preserving locked nodes, human edits and approvals**.
- Show side-by-side **diff**: added/changed/removed tasks, moved dates, new external actions, budget delta, staffing conflicts. User explicitly chooses **Apply** (save plan only) or Cancel.
- An AI suggestion never changes an approved publication payload in place. Such changes invalidate approval according to the owning module.
- Unknown provider access, uncollected figures, estimated effects, guessed contacts and unavailable labor capacity are flagged, never invented.

## 5. Visual grammar / nodes

| Node type | Meaning | Required properties |
| --- | --- | --- |
| evidence | Immutable source result / finding | snapshotRef, findingRef, observedAt, scope, confidence/coverage |
| objective | User-confirmed business goal | metricId, target (nullable), horizon |
| action | Human/connector-supported work | channel, owner, dates, effort, output, status |
| content | Page/article/social/email asset draft | contentRef, locale, review requirements |
| decision | Branch condition based on comparable measurement | predicate, evidence source, else route |
| approval | Human authorization checkpoint | approvalRef, role, expiry, fingerprint |
| milestone | Deadline/checkpoint | date, deliverable |
| observation | KPI readback | source, measuredAt, interval, denominator, unit |
| wait | Scheduled observation or human task reminder | dueAt, expiration, fallback |
| group | Market/channel/team container | scope, immutable tenantId |

No arbitrary executable scripts, URL-fetching nodes or user-defined network destinations in v1. Graph links are typed and validated; errors point to specific nodes.

## 6. Channel action catalog

| Channel | Suggested actions | Execution boundary | Typical evidence/KPIs |
| --- | --- | --- | --- |
| SEO technical | indexation, sitemap, internal linking, metadata, schema | preview/draft or existing authorized adapter | GSC impressions, indexing, sampled crawl |
| GEO / AEO | passage rewriting, entity signals, FAQ, robots/llms.txt, AI citation measurement | user approval and authorized CMS; no guaranteed LLM mention | sourced readiness checks; sampled provider mentions separately |
| Content / WordPress | briefs, drafts, edits, internal links, review | WordPress draft/approval; no silent publish | organic landing sessions, observed conversions |
| Local SEO | listing completeness, location pages, review replies, local citations | role/territory-scoped workflows; provider verification | verified listing state, local actions where available |
| Social | LinkedIn, X, Instagram, Facebook, TikTok, etc. | existing Social role, account, content digest, review and provider receipt | account-scoped published URL, reach, clicks |
| Email / CRM | segmentation proposal, nurture series, consent review | opt-in/source authorization, send only through approved connector | delivered, clicked, converted with coverage |
| Paid media | budget split, landing page, creatives, experiment | planning-only until independently approved paid connector exists | spend, CPC, CPA/ROAS when genuinely observed |
| Analytics / CRO | GA4 validation, event plan, funnel experiment | read/preview or adapter-specific write approval | observed events, confidence and attribution caveats |

The catalog is capability-driven: absent provider means a **manual task or disabled executor**, not a fake “connected” button. Data scope includes tenant, domain, property, country, language, platform account and observation period.

## 7. Data contracts

All persisted objects have UUIDs, tenantId, createdBy, createdAt, updatedAt, \`version\` for optimistic concurrency, and audit trail; children inherit tenant scope server-side.

\`\`\`ts
type ScenarioStatus = 'DRAFT'|'IN_REVIEW'|'APPROVED'|'ACTIVE'|'PAUSED'|'COMPLETED'|'ARCHIVED';
type NodeType = 'evidence'|'objective'|'action'|'content'|'decision'|'approval'|'milestone'|'observation'|'wait'|'group';
type ActionStatus = 'PROPOSED'|'READY'|'BLOCKED'|'IN_PROGRESS'|'AWAITING_APPROVAL'|'DONE'|'FAILED'|'UNCERTAIN'|'CANCELLED';
type EdgeType = 'finish_to_start'|'start_to_start'|'approval_gate'|'measurement_feedback';
interface CampaignPlan {
  id: string; tenantId: string; version: number; name: string; status: ScenarioStatus;
  objective: string; siteRefs: string[]; locales: string[]; markets: string[];
  startsAt: string; endsAt: string; timeZone: string;
  budget: { currency: string; ceilingMinorUnits: number|null };
  graphRevisionId: string; sourceSnapshotIds: string[];
  createdBy: string; createdAt: string; updatedAt: string;
}
interface PlanNode {
  id: string; type: NodeType; title: string; channel?: string;
  plannedStart?: string; plannedEnd?: string; assigneeId?: string;
  effortHours?: number|null; costMinorUnits?: number|null;
  status?: ActionStatus; sourceRefs: string[]; linkedResource?: {module:string; id:string};
  locked?: boolean; payload: Record<string,unknown>; x?: number; y?: number;
}
interface PlanEdge { id:string; from:string; to:string; kind:EdgeType; condition?:string; }
\`\`\`

Store **semantic graph data separately from visual layout**. Persist node position as optional UI metadata; the backend validates actions from typed semantic schema, never accepts JointJS JSON as executable authority. Versioned plan revisions, immutable evidence snapshots, comments and command audit events support reconstruction and diff. References are resolved with tenant ACL on every access.

## 8. AI planning service — strict workflow

1. **Collect** only authorized evidence snapshots and explicit user constraints via server APIs.
2. **Normalize** opportunities into a deterministic \`Opportunity\` schema: source, timestamp, location, finding, impact rubric, dependency, urgency, confidence, limitations.
3. **Prioritize** via transparent rule-based ordering (hard blockers first; expected effort; cost, readiness; user objective); AI may explain or propose alternatives but never fabricate effect sizes.
4. **Generate** structured JSON conforming to a Zod schema, maximum nodes/edges/budget caps, declared provider capabilities; require output IDs to be server-generated.
5. **Validate** provenance, dates/timezone, quotas, owner roles, channel allowlist, graph acyclicity for scheduling links, no orphan approval, reachable milestones, dependencies, cost ceilings and resource conflicts. Measurement-feedback links may form conceptual loops but are excluded from DAG scheduling.
6. **Preview** recommendation source references, “AI-proposed” badge, missing inputs, deterministic errors and diff against current revision.
7. **Human accept** saves an editable revision only; no external action.
8. **Execute separately** via module-specific authorization, approval and worker contracts. Read back provider receipts and preserve \`UNCERTAIN\` without blind retry.
9. **Learn** from sourced observations (not training on client data without explicit policy/consent); prompt logs and model settings respect tenant privacy.

Provide LLM selection through currently approved provider configuration / BYOK. An inaccessible provider offers manual templates, no silent API call. Time, tokens and cost per generation capped per subscription/tenant. Prompt-injection resistance: treat retrieved web documents as data, prevent tool calls and arbitrary URL accesses.

## 9. Scheduling and collaboration

- Validate due dates, calendars, assignee availability, hours per week, task effort and dependencies before activation.
- Suggest an earliest feasible schedule using critical-path DAG traversal and working calendars; show unknown capacity when no schedule is connected.
- Recalculate downstream start dates only in **preview**, with locked nodes preserved. Ask before applying to all affected tasks.
- Store an IANA time zone and UTC instants; show human dates in locale, handle DST and deadlines across markets.
- Comments and mentions are tenant-scoped; notifications only through configured consented email/Slack channels; in-app inbox as reliable baseline.
- Roles: viewer (view/export), contributor (edit assigned draft tasks), strategist (create/edit plan, assign authorized members), reviewer (approve designated gates), tenant admin (manage roles). Human reviewers cannot approve their own restricted execution action; backend checks both permission and separation of duties.
- Explicit assignments and handoff receipts; no sending invitations to arbitrary addresses from an untrusted node.

## 10. Measuring impact

Show a scorecard per plan and channel: baseline, target, latest observed value, source, data range, denominator, coverage, collection status. Label *projected*, *target*, *observed*, *unknown* independently. Never transform a GEO readiness score into actual AI citations, or observed traffic into causal uplift.

Support checkpoints at D+7, D+30 and D+60 as **editable examples** rather than universal promises. When an observation is absent, show “non mesuré / not measured”, “Connect source”, “Import evidence” or “Create a manual measurement task”. For comparable observed series, compute changes with units and disclose incomplete coverage. Capture pre/post intervention timestamps and confounders; A/B causal claims require valid experiment evidence.

## 11. UX details and accessibility

- GTM brand: current light palette, typography, icon conventions and FR/EN copy; no alternate login or secondary navigation.
- Desktop: canvas + sidebar; tablet: collapsible sidebar; mobile: list/calendar first.
- Loading, empty, disconnected, permission-denied, unsupported, simulated, draft, approved, executing, uncertain and failed states are distinct.
- WCAG 2.2 AA target: full keyboard task creation/editing, labelled graph controls, semantic table mirror, no color-only distinctions, accessible focus and reduced-motion behavior.
- Autosave may save **draft graph revisions only**. Include undo/redo scoped to local edit session, visible save errors and conflict resolution; never autosave an authorization or dispatch command.
- Export: JSON/CSV and server-produced Markdown/PDF. SVG/PNG export built in-house if available; do not assume JointJS+ exporter.
- Support 100 nodes initially in browser, target 300 after profiling; no hard failure with oversized graphs—offer channel filters and collapsed groups.

## 12. API and persistence proposal

\`\`\`text
POST /api/console/scenarios/list
POST /api/console/scenarios/create
POST /api/console/scenarios/get
POST /api/console/scenarios/update-draft  { id, expectedVersion, changes }
POST /api/console/scenarios/generate-preview
POST /api/console/scenarios/preview-revision
POST /api/console/scenarios/accept-revision
POST /api/console/scenarios/validate
POST /api/console/scenarios/activation-request
POST /api/console/scenarios/assign
POST /api/console/scenarios/comments
POST /api/console/scenarios/observations
POST /api/console/scenarios/export
\`\`\`

Route shapes are illustrative and must follow existing authenticated console conventions, not introduce unauthenticated APIs. Default deny for unknown tenant/membership; expected-version compare-and-swap. Separate \`scenario_execution_intent\` from diagram edits, with explicit approval reference, immutable payload digest, idempotency key, provider target, operator enablement and readback. Persist to a dedicated tenant-scoped SQLite module on the existing volume for initial pilot; reevaluate PostgreSQL for multi-instance concurrent writes rather than assuming Redis cache is durable. Audit logs must not contain access tokens or raw contact PII.

Suggested code locations:
- \`src/scenarios/{model,store,prioritize,planner,validation,api,execution-bridge}.ts\`
- \`site/console/{campaign-studio,scenario-graph,scenario-calendar,scenario-inspector}.js\`
- \`site/console/scenario-studio.css\`
- \`tests/scenarios-*.test.ts\`, browser QA fixtures FR/EN
- Docs in \`docs/product/\`, link from \`docs/journey/CAPABILITIES.md\` and Track 1/2 index only after implementation.

## 13. Nonfunctional / security / compliance

**Security:** strict tenant boundaries; Zod validation; CSP-safe DOM/SVG; sanitize imported labels/notes; block script/HTML injection; bounded graph size; permission checks on each linked resource; CSRF/CSRF-equivalent controls according to existing token-based architecture; SSRF-safe link handling; audit trail. Diagram edges never carry executable JavaScript.

**Compliance:** GDPR data minimization, controller/processor allocation, retention and deletion; contact consent before outbound email or DM; market-specific communication rules; ad-account policy and media rights. AI outputs need human review; clearly label suggested content, claims and predicted performance.

**Reliability:** draft edit operations idempotent, snapshots immutable, optimistic locking, safe retry of read-only operations, uncertain external writes reconciled against provider before retry. Backups/migrations and rollback to previous version. No background promise without actual durable worker/queue.

**License:** pin JointJS Community under pnpm lockfile and preserve MPL notices; modify covered JointJS source files only with required MPL source availability. Do not redistribute JointJS+ artifacts; audit transitive dependencies and exported code. Keep GTM Growth source Apache-2.0 unless separately justified.

## 14. Acceptance criteria (release gates)

1. A user selects two sourced audit findings and creates a plan containing **at least six actionable, evidence-linked nodes**, with no invented scores.
2. Seven kinds of tasks across at least three channels can be visually added/linked; invalid scheduling cycles are rejected with a precise message.
3. Changing an assignee/date/channel in canvas updates table/calendar/inspector consistently and persists on reload.
4. French and English offer identical functions, translated dates, accessible mobile list mode, keyboard editing and brand-consistent CSS.
5. AI can generate a validated editable plan, change only one unlocked branch, show human-readable diff and respect a budget cap.
6. Missing LLM, Social, CRM or GA4 connector yields a manual/disabled alternative rather than a false success.
7. An action with required approval cannot reach an execution bridge through saving a diagram, moving a node, accepting AI diff or sharing a plan.
8. Changing an approved exact Social payload invalidates its review per existing contract; an uncertain dispatch is never automatically repeated.
9. Cross-tenant reads/writes/exports and foreign resource references fail closed; agency permissions are explicit.
10. Concurrent edits show version conflict; exact previous version can be restored without restoring stale approvals.
11. KPI view labels targets vs actual observations with source/date/denominator and shows unknown when unavailable.
12. Automated tests cover unit graph schema, scheduling, auth, audit mapping, AI validation, execution guards, license/asset checks and FR/EN browser runs.

## 15. Phased delivery and illustrative workload

| Phase | Scope | Exit criteria | Estimate (team engineering days, not commitment) |
| --- | --- | --- | --- |
| P0 — design spike | Verify JointJS core package/API/license, graph rendering in existing console, mobility/a11y, source-to-node mapping | 3-channel clickable fixture, license note, architecture decision | 3–5 |
| P1 — usable MVP | Canvas, action inspector, date/owner/channel, calendar/table, evidence import, save/versions, manual draft, templates | Criteria 1–4, 9–10 | 12–20 |
| P2 — AI copilot | source-aware plan generator, constraint and budget validation, diff, branch regeneration, approvals preview | Criteria 5–7, 11 | 10–16 |
| P3 — controlled operations | social/WordPress/local adapter links, assignment notifications, durable tracking and status reconciliation | Criteria 7–8, 11 | 12–20 |
| P4 — network/global | agency portfolio, country-local overrides, advanced capacity, experiment comparison and templates | Multi-tenant and local governance E2E | 12–20 |

**Priority:** P0 → P1 before AI/execution. A useful, editable and evidence-backed planner is more valuable than an impressive diagram that cannot be saved, audited or operated. Estimates depend on code-level integration and team capacity.

## 16. Example customer campaign (illustrative, not actual GTM Growth results)

- **Campaign:** Raise an authorized product site's technical discoverability and grow qualified visits, 2026-12-01 through 2027-01-31, Europe/Paris.
- **Week 1:** Analyst confirms audit evidence, chooses observed baselines and validates priority with Marketing Lead.
- **Week 2:** SEO owner repairs indexing/canonical defects; Content owner prepares two answer-first pages and schema drafts.
- **Week 3:** Marketing owner prepares a LinkedIn Social draft, then requests separate approval for the exact payload, account and date.
- **Week 4:** Local manager reviews any authorized location listings; blocked sites remain manual tasks.
- **Week 5–8:** Analyst compares GSC/GA4 series and separately collected AI mentions; human adjusts content based on verified outcomes.
- **Dependencies:** indexing prerequisite before promotion; every external write gated by native module approval; missing data leads to a measurement task, not a zero.
- **Example assignees:** role labels, not invented actual users. **Example budgets/results:** user-defined, not computed without evidence.

## 17. Explicit exclusions from MVP

No guaranteed AI search rankings, no unapproved autonomous publishing, no paid ads management without a separately authorized adapter, no inferred contact identities, no direct arbitrary webhooks/scripts, no JointJS+ without license, no replacing existing Social/ZenML or local Node-RED contracts, no actual customer notifications without configured delivery and permission.

## References

- [GTM Growth architecture](../technical/README.md)
- [Customer journey](../journey/README.md)
- [Measurement requirements](../marketing/MEASUREMENT.md)
- [Social toolkit review](SOCIAL-TOOLKIT-SPEC-REVIEW.md)
- [JointJS community source](https://github.com/clientIO/joint)
- [JointJS / JointJS+ licensing](https://www.jointjs.com/license)
- [JointJS documentation](https://docs.jointjs.com/)
