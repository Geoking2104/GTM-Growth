# Social Toolkit — reviewed specification and implementation contract

Reviewed 14 November 2026 against the supplied [source specification](SOCIAL-TOOLKIT-SOURCE-SPEC.md), the existing GTM Growth code and official integration contracts. The source specification is retained unchanged. This document identifies deliberate adaptations, implemented functionality and remaining work; it does not certify a production deployment.

## Product journey and delivered scope

The same Social workspace appears in English and French under **Social networks**, with eight views. Every request uses the existing selected client, Keycloak identity and tenant membership.

| View | Action | Result and prerequisites |
| --- | --- | --- |
| Campaigns | Define the brand, specific product/service, source URL, verified facts, audience, brief, objective, language and period; activate or pause | A client-owned editorial context; an exact product page can populate facts through the existing catalogue reader. No substitute product is selected when extraction fails. GA4 property selection is optional but must belong to the client. |
| Content | Prepare platform/account variants, attributed links and rights-declared media; edit after review feedback | Persistent drafts and policy findings. Suggestions reuse supplied product facts; no unconfigured LLM is represented as active. Page and media URLs must be on authorised client domains. |
| Approvals | Review exact text, media, account, date, source context and digest; approve, reject or request changes with a comment | A durable, expiring decision by a different tenant administrator. A decision alone does not dispatch a publication. |
| Calendar | Inspect planned content in chronological order; confirm an approved schedule from Content | An immutable queued publication intent. The worker checks consent, current context, date, active client/campaign and account immediately before dispatch. |
| Results | Read Postiz observations, pull GA4 attribution or import sourced daily measurements | Explicit provenance, null for unknown data, append-only corrections to daily imports, separate platform series and GA4 data. No cross-platform reach total or invented ROI. |
| Creators and outreach | Discover YouTube profiles when configured, add sourced profiles, complete evidence, request vetting, draft exact outreach copy | Nullable metrics, human fit assessment with evidence, independent vetting and separate message approval. Outreach is sent manually outside GTM, then a receipt is recorded; there is no automated Mautic/Twenty sequence in this release. |
| Accounts | Inspect scoped Postiz accounts and assign Social roles | Operator-maintained account allowlist; actual account status comes from Postiz. No secret entry in the browser. |
| Runs | Inspect queued intents, actual ZenML run IDs, failures and audit events; export authorised scope | Queued work is distinguished from executed work. No synthetic ZenML run ID, no publication claim until exact provider readback. |

The public website's shared catalogue and pre-login handoff explain the benefit, result and setup of Social. Existing SEO, GBP, commerce and read-only Slack paths remain intact. Social is not added to Slack as a write channel.

## Decisions from the technical review

| Proposed assumption | Verified constraint | Implementation decision |
| --- | --- | --- |
| A normal static ZenML step calls `wait(approval_id, ...)` for up to seven days | The current `wait()` API is for dynamic pipelines; its first argument is an optional response schema. Pipeline pause/resume and a business approval expiry are different contracts. | Durable approvals and deadlines live in GTM SQLite. Separate short, uncached P2a and P2b runs surround the human decision. No sleeping worker or seven-day Python process. |
| New FastAPI gateway and separate social SSO | GTM already has Node 20, TypeScript, Express, Keycloak, client membership and resource scoping | Reuse the existing console API, add `/api/mcp/social`, and keep a separate least-privileged internal worker API. No parallel identity system. |
| Immediate Kubernetes/Airflow/S3/warehouse rollout | Current production is a single OVH VPS with Docker Compose and SQLite for durable workflow state | Optional Python 3.11 / `zenml[local]==0.96.2` container, persistent client-specific runtime volume, bounded resources. No new Kubernetes cluster or shared warehouse required. |
| Replace all n8n-style workflows | Existing GBP automation uses Node-RED and has its own operational contract | ZenML applies to Social. GBP Node-RED flows are preserved. |
| TikTok Research and Meta research access provide commercial creator prospecting | TikTok explicitly excludes commercial users from Research Tools; Meta Content Library access is research-oriented and is not assumed to authorise commercial prospecting | No such scraper/connector is activated. Use an approved official YouTube key or source-labelled manual profiles. No guarantee of 20 results or two platforms when sources are unavailable. |
| A single stats row per post/day | A post can target multiple platform accounts; sources and corrections must remain distinguishable | Daily observations key on client/post/account/day/source/kind plus revision. Raw provider series remain separate, with their own observation date and unestablished cumulative semantics. |
| Always return engagement/authenticity/composite scores | Missing follower, post and historical data cannot support those assertions | Engagement only from complete observed inputs; fit only with a human rationale. Authenticity, growth and the composite remain unknown. No fake-follower accusation. |
| Retry every failed step | A POST timeout can occur after the external platform accepted content | All ZenML steps have caching disabled. Internal idempotency, transactional leases and per-account dispatch markers guard writes. Ambiguous writes become `UNCERTAIN`, require investigation and are never automatically repeated. |
| A Postiz acceptance is a published post | POST returns a provider job ID; GET may still report `QUEUE`, `DRAFT` or `ERROR` | `ACCEPTED` is distinct from `PUBLISHED`. Verification requires the exact provider ID, account ID, `PUBLISHED` state and an HTTPS release URL. |
| Separate containers eliminate AGPL obligations | Licences apply to the actual software and deployment; separation alone is not a blanket exemption | No Postiz/Twenty/Metabase source is copied into the Apache repository. Operators review and meet the licences of separately deployed services. No paid SaaS fallback is activated. |

## Data and controls

- GTM's tenant is the client boundary. An agency uses its existing explicit client selector; caller-supplied workspace/client IDs do not override the authenticated tenant.
- Viewer: reads and exports. Contributor: creates/edits their own drafts and requests review, with only their own posts and approvals returned. Strategist: campaigns, content, creators, outreach drafts and imports. Tenant administrator: also assigns roles and makes independent human decisions. Platform-wide administrators and AI service accounts cannot use the human console write flow.
- Social MCP uses OIDC and requires `X-Tenant`. Its six tools read state/analytics or prepare campaign, post, creator and outreach drafts. MCP callers are non-admin, default to viewer, and need an explicit Social strategist/contributor grant for draft writes. There is no approval, publication, message-send or permission-grant tool.
- Post review binds the full text, media declarations, product/campaign context, target accounts, provider destination/settings and exact scheduled time. Credential rotation is allowed; changing provider destination/settings requires a new saved draft and review. Editing a scheduled draft revokes its pending publication intent. Pausing a campaign invalidates its pending/approved publication and outreach reviews.
- Post/creator approvals expire after seven days; outreach approvals after fourteen. Expiry cannot turn an in-flight or uncertain post into an editable draft. Rejected or changes-requested content can be edited and reviewed again.
- Execution is explicitly confirmed by the human reviewer. Publishing defaults to disabled in operator configuration. The client must remain active, campaign active, domain scope valid, account allowed and provider status active. The worker cannot approve any request.
- No arbitrary webhooks or caller-supplied provider hosts. Operator-configured Postiz base URLs are trusted administrative input; redirects are disabled and responses are bounded. Quotas are client-scoped. OAuth credentials remain inside Postiz; its server API key and YouTube key stay in server-only secret files.
- A worker token is bound to one client and allowed pipeline names. The file holds only SHA-256 token hashes. Every claim/execute request rechecks client activation. A lease locks the client to one running intent and a write lease is never reissued after interruption. Read-only interrupted work may be retried at most three times.
- The Social SQLite file stores business state and append-only hash-chained audit entries, not social tokens. A hash chain supports integrity checking, not a claim of tamper-proof storage. Exports omit worker leases and connector secrets. Personal outreach addresses are not stored by this implementation.
- `utm_content` is set to the specific post/account identity when saving a linked variant. GA4 reads the selected authorised property (or the sole property when unambiguous), exact campaign ID and social medium. Missing property selection is an actionable failure, not a silent choice across several properties.
- Social provider series are read for up to five least-recently-read published targets per analytics run, over the provider's last 30 days. GA4 reads up to 10,000 rows over 90 days. Imports accept up to 1,000 rows. Reports are bounded samples, not an exhaustive warehouse. Missing/unsupported platform metrics remain unavailable.

## ZenML pipeline contract

| Pipeline | Implemented operation | External side effect |
| --- | --- | --- |
| `social_content_intake` (P1) | Check immutable draft context and publication policy | None; factual draft preparation happens in the console/MCP |
| `social_publish_prepare` (P2a) | Validate the exact version awaiting human review | None; no `wait()` shortcut and no auto-approval |
| `social_publish_execute` (P2b) | Dispatch confirmed, due intent through Postiz and read back | Postiz POST, one attempt per account; ambiguous outcomes never replayed |
| `social_analytics_daily` (P3) | Read provider measurements and scoped GA4, persist sourced observations | Read-only provider APIs |
| `influencer_discovery` (P4) | Official YouTube channel discovery for campaign brand/audience/language | Read-only; configured key required |
| `influencer_scoring_vetting` (P5) | Compute supported metrics from sourced inputs | None; vetting decision remains human |
| `influencer_outreach` (P6) | Record draft/review workflow receipt | None; automatic sequences are not implemented |
| `social_account_sync` (P7) | Read accounts, intersect exact operator allowlist, record status | Read-only |

With `autoRefresh: true`, worker claims enqueue one account-sync intent per hour and one analytics intent per active campaign per UTC day; these are polling buckets, not a promise of a particular local publication time. A publication uses the explicitly stored ISO-8601 time. With auto-refresh off, refreshes are requested manually in the console. P1/P2/P5/P6 are driven by specific human or permitted draft actions.

ZenML parameters contain only intent ID and input digest; artifacts contain execution IDs/digests/status. The lease and worker token are read from environment/secret file inside the step. The runtime smoke executes all eight real pipelines and repeats the same input to verify that caching is disabled; it scans runtime files for the fixture token and lease.

## Deferred acceptance criteria — do not advertise as delivered

- Open-ended LLM variants and image generation; autonomous campaign optimisation; guaranteed recommendations based on unavailable social/competitor data. Current content preparation uses explicit product facts and human editing.
- Commercial multi-platform creator discovery, historical audience growth/authenticity signals, embeddings/composite ranking, automated contracts and ROI attribution.
- Automatic Mautic/Twenty outreach, reply ingestion, follow-up sequences and reminder notifications. Each future message/follow-up must retain its own human approval and consent evidence.
- Self-service account OAuth in GTM, Postiz provisioning, media upload, platform-specific video transcoding and API approval/quotas. The current adapter accepts pre-uploaded media IDs and configured provider settings; operators qualify each intended platform on a test account before enabling writes.
- Drag/drop rescheduling, campaign editing after creation, deletion/retention administration, batch approval and multi-client aggregate dashboards. Pausing and completing/archiving campaigns are available through the API; scope exports are available in the UI.
- Separate warehouse, pgvector, Metabase/Superset, cloud ZenML or a Kubernetes/Airflow stack. These need capacity, licence and operational decisions before deployment.

## Validation and rollout gates

1. Typecheck, existing regression suite and focused tests: client isolation, roles, human independence, immutable review, operator setting drift, campaign pause, expiry, idempotency, partial dispatch, exact readback, revision/unknown metrics and audit/secret boundaries.
2. FR/EN browser checks at desktop and phone widths for all eight actual views, exact approval payload and viewer restrictions; screenshots labelled synthetic test data.
3. Real pinned ZenML execution with a local fixture; no platform account or message is contacted.
4. CI builds both production Node image and optional Python worker image.
5. Merge source only after passing CI. Existing OVH workflow remains the release authority; its production environment approval must complete. Then verify live asset bytes/health and authenticated smoke separately.
6. Real social publication requires configured client-specific Postiz accounts, a ZenML worker and an independent reviewer. A live pilot must publish approved test content on each chosen platform, verify exact readback, then check insights/GA4 coverage. Source integration tests do not establish successful live social publication.

## Primary references checked

- [ZenML 0.96.2 execution API](https://sdkdocs.zenml.io/0.96.2/core_code_docs/core-execution.html) and [dynamic pipelines](https://docs.zenml.io/concepts/steps_and_pipelines/dynamic_pipelines).
- [Postiz public API introduction](https://docs.postiz.com/public-api/introduction), [create posts](https://docs.postiz.com/public-api/posts/create), [list posts](https://docs.postiz.com/public-api/posts/list), [integrations](https://docs.postiz.com/public-api/integrations/list), [analytics](https://docs.postiz.com/public-api/analytics/post), and [OpenAPI contract](https://docs.postiz.com/public-api/openapi.json).
- [TikTok Research FAQ](https://developers.tiktok.com/docs/en/research-api-faq), [Meta Content Library access](https://developers.facebook.com/docs/content-library-and-api/get-access), [YouTube search API](https://developers.google.com/youtube/v3/docs/search/list), [GA4 Data API schema](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema).
- [ZenML licence](https://github.com/zenml-io/zenml/blob/main/LICENSE), [Postiz licence](https://github.com/gitroomhq/postiz-app/blob/main/LICENSE).
