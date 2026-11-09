# Apply Mode — architecture and phased delivery (ADR, 2026-11-09)

**Status:** proposed scope, safe foundation in progress. **No production-write adapter is enabled.**

This ADR incorporates the [owner-supplied *Cahier des charges — Mode Appliquer v1.0*](../specs/APPLY-MODE-v1-2026-11-09.md) into the GTM Growth roadmap. The core principle is **copilot, never autopilot**: inspect the evidence, show a concrete diff, preview, obtain an authenticated approval, back up, write to one declared target, independently verify, and offer rollback. The approved GEO v2 score rubric and its incomplete-evidence safeguards remain separate.

## 1. Boundaries and ownership

| Component | Responsibility | Trust boundary |
|---|---|---|
| GEO v1 / v2 audits | Measurements, evidence, recoverable points, proposed fixes | No mutations. V2 `score: null` stays null while proof is incomplete. |
| Fix planner | Immutable `before`/`after`, scoped target, validation, content hashes, reviewable diff | No remote credentials or writes. Input resource must be observed and bounded. |
| Approval service | Keycloak identity, tenant, role, exact verified host, approval of a **specific immutable diff**, expiry, idempotency | Must load approval/grant from trusted storage, never trust flags from a JSON request alone. |
| Adapter (WordPress/GTM) | Snapshot, compare-and-swap, one bounded write, idempotency, verification | Explicit per-site write grant; no general filesystem, FTP, arbitrary URL or GTM publish permission. |
| Journal and snapshots | Append-only events, encrypted restore material, verification proofs, rollback event | Tenant-separated storage and scoped access. No passwords/tokens in diff or logs. |

```mermaid
flowchart TD
  A["Audit and evidence"] --> B["Bounded fix proposal"]
  B --> C["Diff and dry-run preview"]
  C --> D{"Trusted approval?"}
  D -->|No| C
  D -->|Yes| E["Snapshot and CAS check"]
  E --> F["One scoped adapter write"]
  F --> G["External verification"]
  G -->|Proof matches| H["Verified; refresh score"]
  G -->|Inconclusive| I["To verify; score unchanged"]
  G -->|Failure| J["Rollback proposal and event"]
```

The preview stage is the only one currently enabled. The actual `execute` and `rollback` transport paths are deferred until roles, connection method and recovery guarantees have been validated.

## 2. v1 product scope

1. **Files:** `robots.txt`, `llms.txt`, `llms-full.txt`; detect missing vs existing resources and conflicting WordPress virtual/physical robots rules. No arbitrary path writing.
2. **Structured data:** Organization, WebSite, Article, FAQPage and Breadcrumb; detect duplicate generation from Yoast, Rank Math and SEOPress before proposing injection.
3. **Page metadata:** title, description and H1 — propose with a preview; do not rewrite arbitrary page bodies.
4. **GTM/GA4:** propose changes in a dedicated **draft workspace**, test preview and consent, and require separate review for any version publication. Do not silently remove existing tags.
5. **WordPress:** minimal tenant/site-scoped connector, draft-only content creation, independent external check and rollback/revert proposal. Preserve the current content-ops workflow until its authorization semantics are reconciled.
6. **Console:** client board, action list, fix detail, diff/preview, approval, verification result, immutable history/rollback. Single fix/target at first; same-scope batches follow later.
7. **Interfaces:** `geo-apply` dry-run first; later CLI `geo-verify`, `geo-rollback`; proposed MCP and REST routes are **not** silently activated.

**Deferred:** automatic Git/FTP/SFTP deployments, Next.js/Shopify/Webflow writers, multilingual CMS editing, body-content rewrites, white-label reporting, batch transactions across systems.

## 3. Minimal persisted model

```text
fix_proposals  (id, tenant_id, domain, target_kind, target_path, base_snapshot_hash,
                proposed_hash, diff_hash, evidence_refs, risk, created_by, expires_at, status)
approvals      (id, tenant_id, fix_id, principal_sub, role, approved_diff_hash,
                explicit_confirmed_at, expires_at, consumed_at)
apply_attempts (id, fix_id, idempotency_key, target_etag, status, created_at,
                started_at, completed_at, verifier_report_id)
snapshots      (id, attempt_id, target_kind, encrypted_before_ref, encrypted_after_ref,
                sha256_before, sha256_after, created_at)
verification   (id, attempt_id, observed_http, evidence_hash, checks, status, checked_at)
audit_events   (id, tenant_id, actor_sub, target, event, correlation_id, timestamp, digest)
```

- Store secrets and encrypted snapshot bytes only server-side. Prefer per-tenant keys and a separately validated retention/erasure policy. Append-only *audit events* need not imply indefinite retention of secret-bearing snapshot payloads.
- Use SQLite transactions on the existing VPS (Phase 0), with unique `(tenant_id, target_kind, target_path, active_attempt)` locks and idempotency keys. Never hold a DB transaction open across an external CMS/GTM network call.
- Capture the exact pre-write content plus version/ETag when possible. Re-fetch and compare the observed SHA-256 **just before** writing; any drift means a fresh proposal and diff are required.
- Attempt states: `proposed → previewed → approved → backed_up → applying → verifying → verified`. Explicit branches: `to_verify`, `failed`, `uncertain` (lost ACK; reconcile **before retry**), `rollback_requested → rolled_back`. A rollback is a *new* event and needs authorization.

## 4. Permission and mutation gates

All of the following must pass **server-side** before any adapter write:

1. Keycloak-authenticated principal and explicit tenant membership; tenant IDs must be derived from the session, not trusted from a client parameter.
2. `approver` or `admin` role on that tenant; the existing `tenant-user`/`tenant-admin` model is insufficient to represent all four proposed roles. **Do not infer `approver` from a client-supplied boolean.**
3. Exact, current, non-revoked verified-domain grant, and a site-bound credential with write capability enabled for *this* target and category. A DNS/HTTPS ownership grant alone does not authorize a CMS write.
4. A stored, unexpired, single-use approval record binding actor, tenant, target, proposal SHA, diff SHA and verification/preflight policy. An API `confirm=true` is necessary but **not sufficient**.
5. Full diff shown to the approver; pre-write snapshot captured and restorable; backend permission verified; no conflicting active attempt; optimistic concurrency precondition satisfied.
6. Feature flags default **off** for all external writers. GTM publication is a separate explicit workflow, never a side effect of creating a draft workspace.

**Retry policy:** only read/verify operations may be retried automatically (`+10`, `+30` minutes with rate bounds). Never blindly retry a write after a network timeout; first reconcile the remote state and idempotency key. The score actually earned stays unchanged until verified.

## 5. Adapter contracts

```ts
interface ApplyAdapter {
  kind: 'wordpress' | 'gtm_workspace';
  inspect(target: ScopedTarget): Promise<ObservedTarget>; // read-only
  preview(fix: ApprovedFix): Promise<PreviewArtifact>;     // no public write
  backup(fix: ApprovedFix): Promise<RestoreHandle>;        // must complete first
  apply(fix: ApprovedFix, precondition: VersionTag): Promise<WriteReceipt>;
  verify(receipt: WriteReceipt): Promise<VerificationReport>;
  rollback(receipt: WriteReceipt, approval: RollbackApproval): Promise<WriteReceipt>;
}
```

This is an architectural contract, **not** a claim that the methods have been wired to live systems.

### WordPress

- Existing `publishToWordPress` sends `status: "draft"` to `/wp-json/wp/v2/posts`; that is useful for content drafts but not a generic files/schema writer.
- A dedicated lightweight connector needs site-scoped revocable authorization, a health/read-only handshake, plugin collision inspection, explicit selection for `robots.txt` virtual vs physical, versioned snapshots and a controlled regeneration hook.
- Never announce an unpublished WordPress draft through IndexNow; postpone any search-engine notification until an independently verified published URL exists.
- Avoid writing `wp-config.php`, theme/plugin files or global rewrite rules in MVP.

### GTM/GA4

- Reuse existing GTM APIs to inspect tags/triggers/variables. A new draft workspace must be isolated, backed up and previewed. GTM publish is *not* part of the default Apply action.
- Preview success and GA4 event receipt are separate proofs; if measurement/consent evidence is missing, return `to_verify`, never report a live score gain.
- Existing console GTM `/gtm/write` and `/gtm/publish` routes must not be represented as compliant with this new approval contract until their authorization, backup, preview and audit trail are reviewed.

## 6. API/UX rollout without production writes

### Owner-spec coverage register

| Requested capability | Current state on this branch | Delivery gate |
|---|---|---|
| GEO v2 audit → prioritized fixes → projected score | Audit/scoring remains in the independent GEO v2 track (#30); no speculative score increase | Evidence/fix-ID mapping after the scorer is integrated |
| `robots.txt` AI crawler correction | **Implemented:** bounded public GET, deterministic diff, SHA-256 preview and manual conflict flags | Read-only; no WordPress filesystem write |
| `llms.txt`, `llms-full.txt` | Existing generators; Apply-specific proposal, preview and site adapter pending | File ownership/source detection and plugin selection |
| Organization, WebSite, Article, FAQPage, Breadcrumb JSON-LD | Existing schema generation primitives; diff/reconciliation pending | Duplicate/plugin conflict detection before injection |
| title, description, H1 | Existing audit evidence; page metadata edits pending | Scoped WordPress page/post versioning |
| WordPress content draft | Existing adapter creates `status: draft`; legacy console now reports **draft created** and never announces it to IndexNow | New connector authorization and rollback before making it an Apply action |
| GTM/GA4 tags, consent, duplicates | Existing inspection and write APIs; Apply draft workspace pending | Staging, tag-diff review, consent evidence and no auto-publish |
| Reader/editor/approver/admin and tenant isolation | **Implemented as a pure deny-by-default policy**; tenant-authenticated storage and mappings pending | Keycloak-backed grants and immutable approvals |
| Diff, preview, approval, explicit confirmation | **Implemented:** deterministic file preview + guard/state policy; no production approval UI/API | Persistent single-use approvals and audited UX |
| Backup, atomicity, verification, rollback | State contract documented; no live adapter | Encrypted snapshot, CAS lock, independent checks and rollback rehearsal |
| CLI, REST and MCP interfaces | **Implemented:** `geo-apply --dry-run`; REST/MCP writes not registered | Each interface must use the same trusted approval service |
| Console board, 3-click path and immutable history | Product flow specified; UI/history backend pending | No writes from overview, same-tenant event history |
| Owned/verified domain and private score publication | Existing GEO v2 verification work stays separate; no public score release | Explicit owner consent, exact-domain grant and external rescan |

The owner-approved 42-control Score GEO v2 rubric remains the measurement authority. Apply Mode consumes its evidence and fix recommendations **only after** a scorer result is available; it does not alter weights or award projected points as earned points. Treat PR #30 and this Apply Mode branch as two independently reviewable streams until their contracts can be integrated.

| Phase | Deliverable | Safety gate |
|---|---|---|
| 0.1 | Scoped immutable proposal, line diff, `geo-apply --dry-run`, unit tests, English-first docs | No external write, no stored secrets. |
| 0.2 | `GET /apply/fixes`, `POST /apply/preview`, console Diff/Preview, per-tenant audit read view | Read-only API, URL SSRF guard and tenant isolation tests. |
| 0.3 | Approval registry, four-role mapping, idempotency + locking, encrypted snapshot store | Deny by default; all negative authorization tests must pass. |
| 0.4 | WordPress draft adapter and read-only plugin conflict probe; then scoped file changes behind flag | Owner selects file management mode and connector strategy; backup and rollback smoke-tested in staging. |
| 0.5 | GTM draft workspace/preview adapter, independent GA4 verification | No publish in MVP; separate release approval required. |
| 0.6 | Pilot for verified owned domains, post-write external rescan and scored delta | Green verification + rollback rehearsal before wider rollout. |

Planned REST: `POST /api/apply/preview`, `POST /api/apply/:id/approve`, `POST /api/apply/:id/execute`, `GET /api/apply/:id/verify`, `POST /api/apply/:id/rollback`. Every mutation endpoint requires server-recorded approval, not merely an HTTP parameter. The frontend must show projected and measured scores distinctly.

## 7. Open product decisions **before enabling writes**

1. **WordPress authentication:** new scoped GTM Growth connector token vs existing WordPress Application Password, plus per-site token rotation and revocation policy. Proposed default: plugin-specific scoped token with a read-only handshake.
2. **GTM publication:** section 3 prohibits direct publishing, while section 8 permits it after another approval. Proposed MVP default: draft workspace only; consider a separate post-MVP publish flow with dedicated approval.
3. **Snapshot retention:** requirement says history cannot be removed; privacy/security demand finite retention for secret-bearing payloads. Proposed default: append-only metadata, encrypted payloads with a configurable retention window.
4. **WordPress robots source:** physical file vs virtual/plugin-managed rules must be detected and resolved with the owner before a writer is enabled.

No production deployment or PR merge is authorized by this ADR. The first implementation milestone can ship as a reviewable branch independently from the GEO v2 scorer PR #30.
