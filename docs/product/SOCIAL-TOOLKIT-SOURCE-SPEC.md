# GTM Growth - Social Toolkit
## Functional Specification - ZenML Edition

**Version:** 1.0 - Draft for review
**Date:** 2026-11-14
**Owner:** KayrosLab / GTM Growth
**Scope:** Scheduling, Social Analytics, Influencer Discovery
**Orchestration:** ZenML (replaces n8n)
**License posture:** KayrosLab core Apache-2.0. ZenML Apache-2.0. Postiz, Twenty, Metabase kept as separate AGPL services via API, never embedded.

---

## 1. Purpose and Principles

### 1.1 Purpose
Add a Social Toolkit to GTM Growth that lets an agency or multi-client team plan, approve, publish, measure and grow social presence, and discover and manage creators, without losing the auditability that GTM Growth already provides for GEO, GA4, Search Console and GTM.

### 1.2 Non-negotiable principles
1. **Approval first, never auto-publish.** No post, no outreach message, no creator vetting is published or sent without an explicit human approval in the GTM Growth console. This mirrors the existing WordPress rule: draft first, publish only after approval.
2. **Pipelines as code, artifacts as proof.** Every social action is a ZenML pipeline run with versioned inputs, outputs and lineage. If it is not in a pipeline run, it did not happen.
3. **Read-only Slack.** The existing Slack data agent stays read-only. Slack receives notifications and summaries. Approvals happen in the console, API or CLI, never by reacting in Slack.
4. **Official APIs first.** Publishing and analytics use official APIs: Meta Graph API, LinkedIn API, TikTok API, YouTube Data API, X API. Scraping is research-only, never a production dependency.
5. **Separation of licenses.** AGPL services (Postiz, Twenty, Metabase) run as separate containers and are called via HTTP / MCP. ZenML itself is Apache-2.0 and can live in the KayrosLab repo.
6. **Multi-client by design.** Every object belongs to a Workspace and a Client. No cross-client leakage in pipelines, artifacts or MCP tools.

### 1.3 Users
| Role | Can do |
| --- | --- |
| Owner / Admin | Connect social accounts, manage workspaces, approve, publish, manage creators |
| Strategist | Create campaigns, briefs, drafts, request approval, vet creators |
| Creator / Contributor | Submit drafts, view own posts, respond to feedback |
| Viewer / Client | View dashboards, approvals history, read-only reports |
| System / MCP Agent | Call MCP tools, trigger pipelines, read artifacts, never approve on its own |

---

## 2. Why ZenML Instead of n8n

### 2.1 What changes
n8n is a visual automation tool with hundreds of SaaS connectors. ZenML is a Python-first MLOps / AI orchestration framework. It does not replace n8n 1:1. It replaces it with a more auditable, testable, code-reviewed model that fits KayrosLab.

ZenML is an open-source MLOps framework that decouples pipeline logic from infrastructure so pipelines run portably from local to cloud. It defines workflows as pipelines (DAGs) of steps and executes them on configurable stacks, with artifacts and metadata tracked by default.

### 2.2 Comparison
| Need | n8n pattern | ZenML pattern in this spec |
| --- | --- | --- |
| Workflow definition | Drag and drop canvas, JSON stored in DB | Python `@pipeline` + `@step`, reviewed in Git, versioned |
| Execution | n8n runner | ZenML Stack: Orchestrator + Artifact Store + Container Registry + Secrets |
| Data passing | Nodes pass JSON | Steps return typed artifacts, materialized to S3 / MinIO, with lineage |
| Caching / rerun | Manual | Step cache keyed on code, params and inputs, rerun only changed steps |
| Scheduling | Built-in cron | Delegated to stack orchestrator. OSS ZenML delegates schedules to the orchestrator. In prod, use Airflow / K8s Cron / ZenML schedule on supported orchestrator |
| Event trigger | Webhook node | Thin FastAPI gateway receives webhook, then calls `pipeline.run()` via ZenML Client / CLI. ZenML pipelines are invoked, scheduled, or deployed, they do not subscribe to external events directly |
| Human approval | Wait node / Slack button | `wait()` in a dynamic pipeline pauses the run for a human and resumes later from dashboard, CLI or API. Timeout default 600s in examples, in this spec timeout is configurable to days, run goes to PAUSED and can be torn down |
| Connectors | 400+ built-in | Thin adapter steps written once: `postiz_adapter.py`, `twenty_adapter.py`, `mautic_adapter.py`, `meta_api.py`, etc. |
| Observability | Execution list | ZenML run, step, artifact lineage + Postgres mirror for fast console queries |
| License | Fair-code | Apache-2.0, same as KayrosLab core |

### 2.3 What ZenML does NOT provide, and how this spec compensates
1. **No visual builder.** Compensation: GTM Growth console provides the UI. Pipelines stay in code.
2. **No SaaS connector library.** Compensation: Adapter layer, Section 4. Each adapter is a single Python module with retries, rate-limit handling and idempotency keys.
3. **No long-lived event listener.** Compensation: FastAPI Gateway + Redis queue in front of ZenML. Gateway validates, deduplicates, writes an intent record, then triggers a pipeline.
4. **No built-in approval UI.** Compensation: Approval is a first-class entity in GTM Growth, Section 7. ZenML `wait()` pauses, the console resolves it.

---

## 3. System Architecture

### 3.1 Components
```
[GTM Growth Console + API + MCP Server]
        |  REST / MCP / CLI
        v
[FastAPI Gateway: auth, validation, idempotency, intents]
        |  triggers pipeline.run()
        v
[ZenML Server + ZenML Pipelines]
        |  steps call adapters
        v
[Adapters] -> [Postiz] [Twenty] [Mautic] [Meta/LinkedIn/TikTok/YouTube/X APIs]
        |  writes artifacts
        v
[Artifact Store: MinIO / S3] + [Postgres App DB] + [Warehouse: Postgres / ClickHouse]
        |  reads
        v
[Apache Superset Dashboards] + [Slack Read-Only Notifier]
```

### 3.2 ZenML Stack
| Stack component | Dev | Prod recommended |
| --- | --- | --- |
| Orchestrator | Local | Kubernetes or Airflow orchestrator |
| Artifact Store | Local filesystem / MinIO | S3-compatible, MinIO or cloud S3 |
| Container Registry | Local Docker | Private registry, pinned images |
| Secrets Manager | Local / env | ZenML Secrets + Vault / cloud secrets |
| Experiment Tracker | ZenML default | ZenML + MLflow optional for scoring experiments |
| Alerter | Console log | Slack alerter, read-only channel |

Stack is defined as code: `zenml stack register gtm-social-prod --orchestrator ... --artifact-store ...` and stored in repo under `infra/zenml/stacks/`.

### 3.3 Adapter Layer
All external calls go through adapters, never directly from steps to SaaS. Each adapter:
- Takes typed input, returns typed output
- Uses idempotency key: `workspace_id + campaign_id + external_key`
- Handles OAuth refresh, rate limits, exponential backoff
- Logs request and response hash to pipeline artifact, never secrets

Adapters:
- `postiz_adapter`: create draft, schedule, publish, fetch post insights, list accounts
- `social_api_adapter`: Meta, LinkedIn, TikTok, YouTube, X read APIs
- `twenty_adapter`: create / update Creator, Collaboration, list pipeline
- `mautic_adapter`: create contact, add to sequence, log message
- `warehouse_adapter`: write to analytics tables, upsert daily rollups
- `slack_notify_adapter`: send read-only notification, no interactive approval in Slack

---

## 4. ZenML Pipelines Inventory

All pipelines use `@pipeline` and `@step`. Steps are pure, testable functions. No step publishes without an approved `ApprovalRequest`.

### 4.1 P1: social_content_intake
**Trigger:** MCP `social_draft_create`, console draft form, WordPress / GEO article published, manual CSV import.
**Steps:**
1. `validate_brief`: check workspace, client, campaign exists, brand voice, required fields.
2. `generate_variants`: LLM generates per-platform variants from brief + content asset. Output: `DraftVariants` artifact, JSON with caption, hashtags, CTA, media refs.
3. `check_policy`: brand safety, banned words, link check, media rights check. Output: `PolicyReport`.
4. `create_draft_post`: writes `social_posts` rows in DRAFT, creates media refs. No call to Postiz yet, or Postiz draft in draft mode only.
5. `request_approval`: creates `ApprovalRequest` of type `POST_APPROVE`, notifies Slack read-only.

**Outputs:** `DraftVariants`, `PolicyReport`, `ApprovalRequest` ID.

### 4.2 P2: social_publish (split pipeline, approval-gated)
This is the core publishing pipeline. It is split into two runs to allow days-long approval.

**P2a: social_publish_prepare**
Steps: `load_approved_draft` -> `render_final_post` -> `create_postiz_draft` -> `create_approval_request` -> `wait_for_approval`

**Wait semantics:** `wait()` pauses the run for a human. The run polls for the answer for a configurable timeout. If nobody answers, the run is marked paused and orchestration can be torn down instead of sitting open for days. In this spec, timeout is set to 7 days for posts, 14 days for creator outreach. On timeout, status becomes `APPROVAL_EXPIRED`, post returns to `NEEDS_REVISION`.

**P2b: social_publish_execute**
Triggered only after approval is resolved to APPROVED in the console.
Steps: `verify_approval` (re-read DB, check signature, expiry) -> `publish_via_postiz` (or direct API) -> `confirm_published` (poll Postiz / platform until URL returned) -> `write_analytics_seed` -> `notify_slack_published`.

If approval is REJECTED or CHANGES_REQUESTED, P2b never runs. A new P2a run is created from the revised draft.

### 4.3 P3: social_analytics_daily
**Trigger:** Cron daily 02:00 UTC per workspace, or MCP `social_analytics_refresh`.
**Steps:**
1. `list_active_posts`: posts published in last 90 days.
2. `fetch_platform_insights`: per platform via Postiz + direct APIs, with rate-limit batching.
3. `fetch_ga4_utm`: join UTM params to GA4 sessions / conversions from existing GTM Growth GA4 connector.
4. `compute_rollups`: per post, per campaign, per platform, per client: impressions, reach, engagement rate, CTR, saves, shares, cost if ads, GA4 conversions.
5. `detect_anomalies`: drop >30 percent vs 7-day median, spike, zero impressions after 24h. Output: `AnomalyReport`.
6. `publish_dashboard_seed`: upsert `analytics_daily_post`, `analytics_daily_campaign`.
7. `notify_if_anomaly`: Slack read-only alert.

**Outputs:** `DailyAnalytics` artifact, Parquet + Postgres rows.

### 4.4 P4: influencer_discovery
**Trigger:** MCP `influencer_search`, campaign brief, scheduled weekly discovery.
**Steps:**
1. `parse_brief`: niche, language, region, platform, follower range, budget, brand safety rules.
2. `search_sources`: SearXNG + YouTube Data API + TikTok Research API + Meta Content Library. No scraping at scale.
3. `deduplicate_candidates`: by platform handle + normalized name, merge across sources.
4. `fetch_public_profile`: public bio, follower count, recent posts metadata, links.
5. `create_candidate_records`: writes `creators` with status `DISCOVERED`, creates `creator_platform_profiles` and `creator_snapshots`.
6. `enqueue_scoring`: triggers P5 for each candidate batch.

**Outputs:** `DiscoveryBatch` artifact, list of candidate IDs.

### 4.5 P5: influencer_scoring_vetting
**Trigger:** After P4, or MCP `influencer_score`.
**Steps:**
1. `compute_engagement`: last 20 posts, engagement rate = (likes + comments + shares + saves) / followers, with outlier trimming.
2. `compute_growth`: follower delta from snapshots, velocity, consistency.
3. `compute_brand_fit`: pgvector semantic similarity between creator recent captions and campaign brief + brand voice. Score 0-100.
4. `compute_risk`: fake follower heuristics (follower/following ratio, comment quality via LLM classifier, sudden spikes, bought engagement patterns), brand safety (banned topics, past controversies from public sources).
5. `compute_composite`: weighted score: fit 35 percent, engagement 30 percent, growth 15 percent, risk penalty 20 percent. Output: `CreatorScore` artifact.
6. `create_vetting_request`: ApprovalRequest type `CREATOR_VET`. Human must validate before any outreach. No auto-vet.

### 4.6 P6: influencer_outreach
**Trigger:** After creator vetted, campaign manager clicks Request Outreach.
**Steps:**
1. `verify_vetted`: creator status must be `VETTED`, campaign active.
2. `draft_outreach`: LLM drafts personalized email / DM from creator profile + campaign brief. Output: `OutreachDraft`.
3. `request_approval`: ApprovalRequest type `OUTREACH_APPROVE` + `wait()`.
4. `send_via_mautic`: after approval, create contact in Mautic, add to sequence, log `outreach_messages` row. DM only if creator opted in.
5. `sync_to_twenty`: create / update Collaboration in Twenty, stage = `OUTREACHED`.
6. `schedule_followup`: if no reply in 5 days, create follow-up ApprovalRequest, never auto-send second message without approval.

### 4.7 P7: social_account_sync
**Trigger:** Hourly, or on OAuth reconnect.
Steps: `refresh_tokens` -> `sync_account_meta` -> `check_permissions` -> `alert_if_expired`.

---

## 5. MCP Tools Catalog

MCP Server: `gtm-social-mcp`. All tools require `workspace_id`, `client_id` where relevant, and a user token. No tool can approve its own request. Approval tools require a different human than the requester for publish and outreach in Phase 2+ (four-eyes rule, configurable).

### 5.1 Scheduling Tools
| Tool | Input | Output | Side effect | Approval |
| --- | --- | --- | --- | --- |
| `social_draft_create` | workspace_id, campaign_id, brief, platforms[], media_ids[], scheduled_at | draft_post_ids[], approval_request_id | Triggers P1 | No, creates draft only |
| `social_draft_list` | workspace_id, campaign_id, status | posts[] with variants | Read-only | No |
| `social_schedule` | post_id, scheduled_at, platforms[] | post_id, postiz_draft_id | Triggers P2a, creates ApprovalRequest | Yes, before publish |
| `social_publish_execute` | approval_request_id | publish_run_id | Triggers P2b only if approved | Must be APPROVED |

### 5.2 Analytics Tools
| Tool | Input | Output | Side effect | Approval |
| --- | --- | --- | --- | --- |
| `social_analytics_post` | post_id, date_range | impressions, reach, engagement, CTR, GA4 conversions | Read-only, or triggers P3 if stale | No |
| `social_analytics_campaign` | campaign_id, date_range, group_by | rollups, top posts, anomalies | Read-only | No |
| `social_analytics_refresh` | workspace_id, campaign_id | pipeline_run_id | Triggers P3 | No |
| `social_accounts_list` | workspace_id | accounts with health, token expiry | Read-only | No |

### 5.3 Influencer Tools
| Tool | Input | Output | Side effect | Approval |
| --- | --- | --- | --- | --- |
| `influencer_search` | workspace_id, brief, platforms[], filters | candidate_ids[], discovery_run_id | Triggers P4 | No |
| `influencer_score` | creator_ids[] or discovery_run_id | scores[], risk_flags | Triggers P5 | No |
| `influencer_vet` | creator_id, decision, notes | vetting_request_id | Creates ApprovalRequest CREATOR_VET | Yes, human vet |
| `influencer_list` | workspace_id, campaign_id, status, min_score | creators[] | Read-only | No |
| `influencer_outreach_request` | creator_id, campaign_id, channel | outreach_draft_id, approval_request_id | Triggers P6 draft | Yes, before send |

### 5.4 Campaign and Approval Tools
| Tool | Input | Output | Side effect | Approval |
| --- | --- | --- | --- | --- |
| `campaign_create` | workspace_id, client_id, name, objective, budget, dates | campaign_id | Creates campaign DRAFT | No |
| `campaign_status` | campaign_id | campaign, posts counts, spend, creators counts | Read-only | No |
| `approval_decide` | approval_request_id, decision (APPROVE / REJECT / CHANGES_REQUESTED), comment | approval_decision_id | Resolves `wait()`, triggers P2b if APPROVED | Must be human, not requester if four-eyes on |
| `approval_list` | workspace_id, status, type | requests[] with context | Read-only | No |

**Tool contract rules:**
- Every mutating tool returns `idempotency_key`, `pipeline_run_id` (if any), and `approval_request_id` (if any).
- Every tool logs to `pipeline_runs` mirror and to audit log.
- Tools never store secrets. They pass secret names to ZenML stack.
- Pagination: cursor-based, max 100 per page.
- Errors: typed, `ERR_VALIDATION`, `ERR_APPROVAL_REQUIRED`, `ERR_RATE_LIMIT`, `ERR_TOKEN_EXPIRED`, `ERR_NOT_FOUND`.

---

## 6. Data Model

### 6.1 ER Overview
```
Workspace 1--* Client 1--* Campaign 1--* SocialPost
Workspace 1--* SocialAccount
Campaign 1--* ContentAsset
Campaign 1--* Collaboration 1--* Creator
SocialPost 1--* ApprovalRequest 1--* ApprovalDecision
Creator 1--* CreatorPlatformProfile 1--* CreatorSnapshot
Collaboration 1--* OutreachMessage
SocialPost 1--* AnalyticsDailyPost
Campaign 1--* AnalyticsDailyCampaign
```

### 6.2 Core Tables

**workspaces**
- id (uuid, pk), name, slug, owner_id, created_at, updated_at, settings_json

**clients**
- id, workspace_id (fk), name, brand_voice_json, banned_topics_json, website, created_at

**social_accounts**
- id, workspace_id, client_id, platform (enum: instagram, facebook, threads, linkedin, tiktok, youtube, x, bluesky, pinterest, mastodon), external_account_id, handle, display_name, oauth_token_ref (secret name, never value), token_expires_at, scopes_json, status (ACTIVE, TOKEN_EXPIRED, REVOKED, ERROR), last_sync_at

**campaigns**
- id, workspace_id, client_id, name, slug, objective (enum: AWARENESS, LEADS, SALES, GEO_VISIBILITY, COMMUNITY), brief_text, target_audience_json, budget_cents, currency, start_date, end_date, status (DRAFT, ACTIVE, PAUSED, COMPLETED, ARCHIVED), created_by, created_at

**content_assets**
- id, workspace_id, campaign_id, type (IMAGE, VIDEO, CAROUSEL, TEXT, LINK), storage_key, mime, width, height, duration_sec, rights_status (OWNED, LICENSED, UGC, PENDING), alt_text, created_at

**social_posts**
- id, workspace_id, campaign_id, content_asset_id (nullable), title, base_text, status (DRAFT, PENDING_APPROVAL, APPROVED, SCHEDULED, PUBLISHING, PUBLISHED, FAILED, REJECTED, NEEDS_REVISION, EXPIRED), scheduled_at, published_at, postiz_draft_id, postiz_post_id, platform_urls_json, created_by, created_at, updated_at
- Index: (workspace_id, status, scheduled_at), (campaign_id, status)

**post_variants**
- id, social_post_id, platform, caption, hashtags_json, cta, media_order_json, status, variant_hash
- Unique: (social_post_id, platform)

**approval_requests**
- id, workspace_id, type (POST_APPROVE, CREATOR_VET, OUTREACH_APPROVE, CAMPAIGN_PUBLISH), entity_type, entity_id, campaign_id, requested_by, requested_at, status (PENDING, APPROVED, REJECTED, CHANGES_REQUESTED, EXPIRED), expires_at, zenml_run_id, zenml_wait_id, context_json (diff, preview URLs, scores)
- Index: (workspace_id, status, expires_at)

**approval_decisions**
- id, approval_request_id, decided_by, decision, comment, decided_at
- Constraint: one decision per request unless CHANGES_REQUESTED reopens with new request

**creators**
- id, workspace_id, display_name, normalized_name, email (nullable, encrypted), primary_platform, primary_handle, status (DISCOVERED, SCORED, VETTING, VETTED, REJECTED, CONTACTED, NEGOTIATING, ACTIVE, PAUSED, BLOCKED), composite_score, brand_fit_score, engagement_score, risk_score, risk_flags_json, vetted_by, vetted_at, created_at
- Index: (workspace_id, status, composite_score)

**creator_platform_profiles**
- id, creator_id, platform, handle, profile_url, follower_count, following_count, bio_text, is_verified, last_fetched_at
- Unique: (creator_id, platform)

**creator_snapshots**
- id, creator_platform_profile_id, fetched_at, follower_count, post_count, avg_engagement_rate, raw_json_ref (artifact store key)

**collaborations**
- id, workspace_id, campaign_id, creator_id, twenty_collab_id, status (PROPOSED, OUTREACHED, REPLIED, NEGOTIATING, AGREED, CONTENT_DUE, PUBLISHED, PAID, CLOSED), deliverables_json, fee_cents, currency, due_date, created_at

**outreach_sequences**
- id, collaboration_id, channel (EMAIL, DM, FORM), subject, template_id, status (DRAFT, PENDING_APPROVAL, SENT, REPLIED, BOUNCED)

**outreach_messages**
- id, outreach_sequence_id, approval_request_id, body_text, sent_at, sent_by, mautic_message_id, status

**analytics_daily_post**
- id, social_post_id, date, platform, impressions, reach, likes, comments, shares, saves, clicks, ctr, engagement_rate, ga4_sessions, ga4_conversions, spend_cents
- Unique: (social_post_id, date)

**analytics_daily_campaign**
- id, campaign_id, date, impressions, reach, engagement_rate, ga4_sessions, ga4_conversions, top_post_ids_json

**pipeline_runs (mirror of ZenML)**
- id, zenml_run_id, pipeline_name, workspace_id, campaign_id, status (RUNNING, PAUSED, COMPLETED, FAILED, CACHED), triggered_by, triggered_via (MCP, CONSOLE, CRON, WEBHOOK), started_at, finished_at, artifact_keys_json

### 6.3 Data Rules
- All tables have `workspace_id` except `workspaces` itself.
- Soft delete for posts and creators: `deleted_at`, never hard delete if linked to analytics.
- PII: creator email encrypted at rest, access logged.
- Analytics are append-only daily rows, never mutated, corrections via new row with `is_correction=true`.
- Approval context must include a diff: before / after caption, media preview, scheduled time, platforms.

---

## 7. Campaign + Approval Flow

### 7.1 Campaign Lifecycle
```
DRAFT -> ACTIVE -> PAUSED -> ACTIVE -> COMPLETED -> ARCHIVED
  |          |         |
  +-> ARCHIVED  +-> ARCHIVED
```
- DRAFT: brief, assets, no publishing allowed.
- ACTIVE: posts can be scheduled, discovery can run.
- PAUSED: no new publishes, running `wait()` runs stay PAUSED.
- COMPLETED: no new posts, analytics continue for 90 days.
- ARCHIVED: read-only.

### 7.2 Post Lifecycle and Approval
```
DRAFT -> PENDING_APPROVAL -> APPROVED -> SCHEDULED -> PUBLISHING -> PUBLISHED
  |            |                |             |              |
  +-> ...   NEEDS_REVISION ----+        FAILED -> SCHEDULED (retry, max 3)
  |            |
  +-> REJECTED, EXPIRED
```
**Step-by-step:**
1. Strategist creates draft via `social_draft_create`. Status DRAFT. P1 runs.
2. Strategist clicks Request Approval. P2a runs, creates ApprovalRequest POST_APPROVE, status PENDING_APPROVAL. ZenML run enters `wait()`.
3. Slack read-only notifier posts: Campaign, preview link, scheduled time, platforms, diff summary. No approval button in Slack.
4. Approver opens console Approval Queue. Sees: before / after, media preview, policy report, scheduled time, platform variants, risk flags.
5. Approver decides via `approval_decide`:
   - APPROVE: P2b runs, status SCHEDULED then PUBLISHING then PUBLISHED. Postiz URL stored.
   - CHANGES_REQUESTED: status NEEDS_REVISION, comment required, ZenML run marked completed with reason. New draft version created.
   - REJECT: status REJECTED, reason required.
6. On publish failure: status FAILED, retry count +1, alert. After 3 failures, needs manual review.
7. On approval timeout (7 days): status EXPIRED, ApprovalRequest EXPIRED, ZenML run PAUSED then marked expired.

### 7.3 Creator Vetting Flow
```
DISCOVERED -> SCORED -> VETTING -> VETTED -> CONTACTED -> NEGOTIATING -> ACTIVE
                         |         |
                       REJECTED  REJECTED
```
1. P4 discovers, status DISCOVERED.
2. P5 scores, status SCORED.
3. Strategist requests vetting. ApprovalRequest CREATOR_VET created, with score breakdown, recent posts, risk flags.
4. Human vetter approves or rejects. No auto-vet, even if score >90.
5. If VETTED, outreach can be requested. If REJECTED, creator stays in DB for audit, never contacted.

### 7.4 Outreach Flow
```
DRAFT -> PENDING_APPROVAL -> APPROVED -> SENT -> REPLIED / NO_REPLY -> FOLLOWUP_REQUESTED
```
- Follow-up requires a new ApprovalRequest. No automatic second email.
- All messages logged in `outreach_messages` with approval ID for audit.

### 7.5 Approval Queue UI (Console)
**Screens:**
- `/social/approvals`: list, filters by type, campaign, status, expiry. Columns: Type, Campaign, Entity, Requester, Expires, Score / Preview.
- `/social/approvals/:id`: detail, diff viewer, media preview, policy report, creator score if relevant, comment box, buttons Approve / Request Changes / Reject.
- `/social/campaigns/:id`: campaign header, posts kanban by status, creators pipeline, analytics summary.
- `/social/posts/:id`: post detail, variants per platform, history, pipeline runs linked.
- `/social/creators/:id`: creator profile, snapshots chart, scores, risk flags, collaborations.

---

## 8. Phases 1 + 2 + 3

### 8.1 Phase 1 - Publish with Approval (MVP)
**Goal:** Replace manual copy-paste publishing with a governed pipeline. Prove ZenML + Postiz + approval works for one workspace.

**In scope:**
- P1, P2a + P2b, P7
- MCP: `social_draft_create`, `social_draft_list`, `social_schedule`, `social_publish_execute`, `approval_decide`, `approval_list`, `campaign_create`, `campaign_status`, `social_accounts_list`
- Data model: workspaces, clients, social_accounts, campaigns, content_assets, social_posts, post_variants, approval_requests, approval_decisions, pipeline_runs
- UI: Campaigns list + detail, Draft editor, Approval Queue, Post detail
- Integrations: Postiz (draft + publish), Slack read-only notifications, MinIO artifacts

**Out of scope:** Analytics warehouse, influencer discovery, Mautic, Twenty, Superset dashboards. Basic per-post insights from Postiz only.

**Acceptance criteria:**
- AC1: A strategist can create a draft for 3 platforms, request approval, and an approver can approve from the queue. Post publishes via Postiz and URL is stored.
- AC2: No post publishes without an ApprovalRequest in APPROVED state. Test: call `social_publish_execute` with PENDING request, expect ERR_APPROVAL_REQUIRED.
- AC3: ZenML run lineage shows draft -> policy -> approval -> publish artifacts. All steps cached correctly on rerun.
- AC4: Approval timeout after 7 days moves post to EXPIRED and pauses run.
- AC5: Token expiry triggers alert and blocks publish with clear error.

**Risks:** OAuth app review delays for Meta / TikTok. Mitigation: start with LinkedIn + X + Bluesky, add Meta after review.

### 8.2 Phase 2 - Measure and Prove ROI
**Goal:** Connect social to GA4 / GTM truth. Show which posts and campaigns drive sessions and conversions, not just likes.

**In scope:**
- P3 social_analytics_daily + anomaly detection
- MCP: `social_analytics_post`, `social_analytics_campaign`, `social_analytics_refresh`
- Data model: `analytics_daily_post`, `analytics_daily_campaign`, `mentions` (basic)
- UI: Campaign analytics tab, Post analytics, Anomaly feed, Superset embedded dashboards (or linked)
- Integrations: GA4 connector reuse, Postiz insights, Superset, Warehouse (Postgres / ClickHouse)
- Approval: Four-eyes rule for publish and outreach becomes configurable, default ON for clients with >2 users.

**Acceptance criteria:**
- AC1: Daily pipeline runs at 02:00 UTC, populates analytics tables for all published posts in last 90 days.
- AC2: Campaign dashboard shows impressions, engagement rate, CTR, GA4 sessions, GA4 conversions, top 5 posts, with date filter.
- AC3: Anomaly: drop >30 percent vs 7-day median creates Slack alert and anomaly row.
- AC4: UTM in post links is validated, missing UTM blocks scheduling with warning, not error, in Phase 2, error in Phase 3 if client setting requires it.
- AC5: Analytics refresh via MCP returns pipeline_run_id and completes within 15 min for <500 posts.

**Out of scope:** Influencer discovery, paid ads optimization, full listening.

### 8.3 Phase 3 - Discover and Manage Creators
**Goal:** Turn influencer work from spreadsheets into a governed pipeline: discover, score, vet, outreach, track.

**In scope:**
- P4, P5, P6
- MCP: `influencer_search`, `influencer_score`, `influencer_vet`, `influencer_list`, `influencer_outreach_request`
- Data model: creators, creator_platform_profiles, creator_snapshots, collaborations, outreach_sequences, outreach_messages
- UI: Creator discovery, Creator detail with score breakdown, Vetting queue, Collaboration kanban, Outreach editor with approval
- Integrations: Twenty (Collaboration sync), Mautic (email sequences), SearXNG, YouTube / TikTok / Meta APIs, pgvector scoring, 4CAT for research (optional)
- Approval: Creator vetting mandatory, outreach approval mandatory, follow-up approval mandatory.

**Acceptance criteria:**
- AC1: From a campaign brief, P4 returns at least 20 deduplicated candidates across 2 platforms, with snapshots stored.
- AC2: P5 computes engagement, growth, brand fit, risk and composite scores. Score breakdown is visible in UI and in MCP output.
- AC3: No creator can be contacted before status VETTED. Test: outreach request for SCORED creator returns ERR_APPROVAL_REQUIRED.
- AC4: Outreach draft requires approval, sent message is logged with approval ID and synced to Twenty as Collaboration OUTREACHED.
- AC5: No automatic follow-up. Second message requires new approval.

**Out of scope:** Automated negotiation, payments, contracts, UGC rights management. Those are Phase 4 candidates.

---

## 9. API, Webhooks and CLI

### 9.1 REST (Gateway)
- `POST /api/v1/social/drafts` -> triggers P1
- `POST /api/v1/social/posts/:id/schedule` -> triggers P2a
- `POST /api/v1/approvals/:id/decide` -> resolves wait()
- `POST /api/v1/social/analytics/refresh` -> triggers P3
- `POST /api/v1/influencers/search` -> triggers P4
- `GET /api/v1/social/campaigns/:id` -> campaign status
- Webhooks: `POST /webhooks/postiz`, `POST /webhooks/twenty`, `POST /webhooks/mautic` -> validate signature, enqueue pipeline if needed.

### 9.2 CLI
- `gtm-social pipeline run social_publish --post-id <id>`
- `gtm-social approval list --status PENDING`
- `gtm-social approval decide <id> --decision APPROVE --comment "OK"`
- `gtm-social analytics refresh --campaign-id <id>`
- `gtm-social influencer search --campaign-id <id> --platform youtube`

CLI uses same MCP / API layer, never bypasses approval.

---

## 10. Security, Compliance and Licensing

- OAuth tokens stored as ZenML secrets, referenced by name, never in artifacts or logs.
- Creator email encrypted, access logged, GDPR: delete request removes PII but keeps anonymized analytics.
- Publishing respects platform ToS. No scraping for publishing. Discovery uses public APIs and SearXNG, not credentialed scraping.
- AGPL services stay separate. No AGPL code copied into KayrosLab repo.
- Audit log: every approval, publish, outreach, score change is immutable, with actor, timestamp, pipeline run ID.
- Rate limits: per platform, per workspace, with backoff. Failed steps retry max 3, then alert.

---

## 11. Observability

- ZenML run page linked from every post / creator / campaign.
- Metrics: pipeline success rate, approval time median, publish latency, analytics freshness, discovery candidates per brief, vetting conversion.
- Alerts: pipeline failure, token expiry, approval expiring in 24h, anomaly, outreach bounce.
- Logs: structured JSON, `workspace_id`, `campaign_id`, `pipeline_run_id`, `step_name`.

---

## 12. Open Decisions
1. Orchestrator for prod: Kubernetes vs Airflow. Recommendation: start with Kubernetes orchestrator, move to Airflow if cron complexity grows.
2. Warehouse: Postgres vs ClickHouse. Recommendation: Postgres for Phase 1-2, ClickHouse if daily rows exceed 5M.
3. Four-eyes: default ON for teams >2, OFF for solo. Configurable per workspace.
4. UTM enforcement: warning in Phase 2, error in Phase 3 if client opts in.

---

## Appendix A - Example ZenML Pipeline Skeleton

```python
from zenml import pipeline, step

@step
def validate_brief(brief: dict) -> dict:
    # validate workspace, campaign, platforms
    return brief

@step
def generate_variants(brief: dict) -> dict:
    # LLM variants per platform
    return {"variants": [...]}

@step
def request_approval(post_id: str) -> str:
    # create ApprovalRequest in Postgres, return approval_request_id
    return approval_request_id

@step
def wait_for_approval(approval_request_id: str) -> dict:
    # ZenML wait() pauses until console resolves approval
    from zenml import wait
    decision = wait(approval_request_id, timeout=7*24*3600)
    return decision

@pipeline
def social_publish(brief: dict):
    brief = validate_brief(brief)
    variants = generate_variants(brief)
    approval_id = request_approval("post-id")
    decision = wait_for_approval(approval_id)
    # P2b runs only if decision == APPROVED, verified again in DB
```

## Appendix B - ApprovalRequest Context Example
```json
{
  "type": "POST_APPROVE",
  "entity_type": "social_post",
  "entity_id": "post_123",
  "campaign_id": "camp_456",
  "preview": {
    "caption_before": "",
    "caption_after": "New GEO audit...",
    "media": ["s3://gtm-social/media/abc.jpg"],
    "platforms": ["linkedin", "x", "threads"],
    "scheduled_at": "2026-11-20T09:00:00Z"
  },
  "policy": {"passed": true, "warnings": []},
  "zenml_run_id": "run_789",
  "expires_at": "2026-11-21T09:00:00Z"
}
```
