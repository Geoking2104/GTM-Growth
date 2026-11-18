/** Server-side Apply Mode registry. Persisted approvals/backups never execute a remote write. */
import fs from "node:fs";
import path from "node:path";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import Database from "better-sqlite3";
import { authorizeVerifiedAuditTarget, type VerifiedDomainGrant } from "../geo/rendering/verified-domain.js";
import { nextApplyState, type ApplyState, type TrustedApplyApproval } from "./approval.js";
import { verifyApplyProposal, type ApplyProposal } from "./proposal.js";
import { deriveApplyKey, digest, openText, sealText, SNAPSHOT_LIMIT_BYTES, type SealedPayload } from "./sealed-payload.js";
import type { ApplyPrincipal } from "./principal.js";

interface ProposalRow {
  proposal_id: string; tenant_id: string; target_url: string; state: ApplyState;
  preview_sha: string; preview_nonce: Buffer | null; preview_tag: Buffer | null;
  preview_cipher: Buffer | null; observed_sha: string; diff_sha: string;
}
interface ApprovalRow {
  proposal_id: string; tenant_id: string; actor_id: string; diff_sha: string;
  approved_at: string; expires_at: string; consumed_at: string | null;
  revoked_at: string | null;
}
interface SnapshotRow {
  id: string; proposal_id: string; tenant_id: string; content_sha: string;
  nonce: Buffer | null; tag: Buffer | null; ciphertext: Buffer | null;
  expires_at: string; purged_at: string | null;
}
export type AttemptKind = "write" | "rollback";
export type AttemptStatus = "applying" | "verifying" | "verified" | "to_verify" | "uncertain" | "failed" | "rolling_back" | "rolled_back";
interface AttemptRow {
  attempt_id: string; tenant_id: string; proposal_id: string; kind: string;
  target_kind: string; target_url: string; idempotency_key: string; status: string;
  http_status: number | null; written_sha256: string | null; verified_sha256: string | null;
  created_at: string; completed_at: string | null;
}
export interface ApplyAttempt {
  attemptId: string; proposalId: string; kind: AttemptKind; status: AttemptStatus;
  targetKind: string; targetUrl: string; idempotencyKey: string;
  httpStatus: number | null; writtenSha256: string | null; verifiedSha256: string | null;
  createdAt: string; completedAt: string | null;
}
interface RollbackApprovalRow {
  proposal_id: string; tenant_id: string; actor_id: string;
  approved_at: string; expires_at: string; consumed_at: string | null; revoked_at: string | null;
}
export interface ApplyAuditEvent {
  id: number; tenantId: string; actorId: string; proposalId: string;
  action: string; occurredAt: string; previousDigest: string; digest: string;
}
interface EventRow {
  id: number; tenant_id: string; actor_id: string; proposal_id: string;
  action: string; occurred_at: string; previous_digest: string; digest: string;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const GENESIS = "0".repeat(64);
const DAY_MS = 24 * 60 * 60 * 1000;
const APPROVAL_TTL_MS = 5 * 60 * 1000;

/** Implemented by the trusted, tenant-scoped domain registry — never request JSON. */
export interface TenantDomainGrantReader {
  activeGrant(tenantId: string, hostname: string, now: Date): VerifiedDomainGrant | undefined;
}

function validTime(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid Apply Mode timestamp");
  return now.toISOString();
}
function principalCheck(principal: ApplyPrincipal): void {
  if (!ID_PATTERN.test(principal.tenantId) || !ID_PATTERN.test(principal.actorId) ||
      !["reader", "editor", "approver", "admin"].includes(principal.role))
    throw new Error("Invalid trusted Apply Mode principal");
}
function validIdempotencyKey(key: string): string {
  if (typeof key !== "string" || !/^[a-zA-Z0-9_-]{16,128}$/.test(key))
    throw new Error("A valid idempotency key of 16-128 URL-safe characters is required");
  return key;
}
function sanitizeAttempt(row: AttemptRow): ApplyAttempt {
  return { attemptId: row.attempt_id, proposalId: row.proposal_id, kind: row.kind as AttemptKind,
    status: row.status as AttemptStatus, targetKind: row.target_kind, targetUrl: row.target_url,
    idempotencyKey: row.idempotency_key, httpStatus: row.http_status,
    writtenSha256: row.written_sha256, verifiedSha256: row.verified_sha256,
    createdAt: row.created_at, completedAt: row.completed_at };
}
function requireApprover(principal: ApplyPrincipal): void {
  principalCheck(principal);
  if (principal.role !== "approver" && principal.role !== "admin")
    throw new Error("An authenticated Apply Mode approver or admin is required");
}
function proposalContext(tenantId: string, id: string): string {
  return "proposal:v1:" + tenantId + ":" + id;
}
function backupContext(tenantId: string, id: string, sha: string): string {
  return "backup:v1:" + tenantId + ":" + id + ":" + sha;
}
function sealed(row: { nonce: Buffer | null; tag: Buffer | null; ciphertext: Buffer | null },
  contentSha: string): SealedPayload {
  if (!row.nonce || !row.tag || !row.ciphertext) throw new Error("Apply Mode encrypted payload unavailable");
  return { nonce: row.nonce, tag: row.tag, ciphertext: row.ciphertext, sha256: contentSha };
}

/** The caller must supply a fresh 32-byte operator-managed key, never an HTTP body value. */
export class ApplyRegistry {
  private readonly db: Database.Database;
  private readonly key: Buffer;
  private readonly journalKey: Buffer;
  private readonly retentionDays: number;
  private readonly grants: TenantDomainGrantReader;

  constructor(file: string, key: Buffer, grants: TenantDomainGrantReader, retentionDays = 30) {
    if (!Buffer.isBuffer(key) || key.length !== 32 || !Number.isInteger(retentionDays) ||
        retentionDays < 1 || retentionDays > 90 || !grants || typeof grants.activeGrant !== "function")
      throw new Error("Apply Mode requires a 32-byte key and retention of 1–90 days");
    this.key = Buffer.from(key);
    this.journalKey = deriveApplyKey(this.key, "audit-journal");
    this.retentionDays = retentionDays;
    this.grants = grants;
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true, mode: 0o700 });
    try { fs.closeSync(fs.openSync(file, "wx", 0o600)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    fs.chmodSync(file, 0o600);
    this.db = new Database(file, { timeout: 10000 });
    this.db.pragma("busy_timeout = 10000");
    this.db.pragma("journal_mode = DELETE");
    this.db.pragma("synchronous = FULL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec([
      "CREATE TABLE IF NOT EXISTS apply_proposals (",
      "proposal_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, target_url TEXT NOT NULL,",
      "state TEXT NOT NULL, preview_sha TEXT NOT NULL, preview_nonce BLOB, preview_tag BLOB,",
      "preview_cipher BLOB, observed_sha TEXT NOT NULL, diff_sha TEXT NOT NULL,",
      "created_at TEXT NOT NULL, expires_at TEXT NOT NULL, redacted_at TEXT,",
      "UNIQUE(tenant_id, proposal_id))",
      "; CREATE INDEX IF NOT EXISTS apply_proposals_tenant ON apply_proposals(tenant_id, created_at)",
      "; CREATE TABLE IF NOT EXISTS apply_approvals (",
      "proposal_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, actor_id TEXT NOT NULL,",
      "diff_sha TEXT NOT NULL, approved_at TEXT NOT NULL, expires_at TEXT NOT NULL,",
      "consumed_at TEXT, revoked_at TEXT,",
      "FOREIGN KEY(tenant_id,proposal_id) REFERENCES apply_proposals(tenant_id,proposal_id))",
      "; CREATE TABLE IF NOT EXISTS apply_snapshots (",
      "id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, proposal_id TEXT NOT NULL UNIQUE,",
      "content_sha TEXT NOT NULL, nonce BLOB, tag BLOB, ciphertext BLOB,",
      "created_at TEXT NOT NULL, expires_at TEXT NOT NULL, purged_at TEXT,",
      "FOREIGN KEY(tenant_id,proposal_id) REFERENCES apply_proposals(tenant_id,proposal_id))",
      "; CREATE TABLE IF NOT EXISTS apply_attempts (",
      "attempt_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, proposal_id TEXT NOT NULL,",
      "kind TEXT NOT NULL, target_kind TEXT NOT NULL, target_url TEXT NOT NULL,",
      "idempotency_key TEXT NOT NULL, status TEXT NOT NULL, http_status INTEGER,",
      "written_sha256 TEXT, verified_sha256 TEXT, created_at TEXT NOT NULL, completed_at TEXT,",
      "FOREIGN KEY(tenant_id,proposal_id) REFERENCES apply_proposals(tenant_id,proposal_id))",
      "; CREATE UNIQUE INDEX IF NOT EXISTS apply_attempts_lock ON apply_attempts(tenant_id,target_url)",
      "WHERE status IN ('applying','verifying','rolling_back','uncertain')",
      "; CREATE INDEX IF NOT EXISTS apply_attempts_proposal ON apply_attempts(tenant_id,proposal_id,created_at)",
      "; CREATE TABLE IF NOT EXISTS apply_rollback_approvals (",
      "proposal_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, actor_id TEXT NOT NULL,",
      "approved_at TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT, revoked_at TEXT,",
      "FOREIGN KEY(tenant_id,proposal_id) REFERENCES apply_proposals(tenant_id,proposal_id))",
      "; CREATE TABLE IF NOT EXISTS apply_audit_events (",
      "id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, actor_id TEXT NOT NULL,",
      "proposal_id TEXT NOT NULL, action TEXT NOT NULL, occurred_at TEXT NOT NULL,",
      "previous_digest TEXT NOT NULL, digest TEXT NOT NULL)",
      "; CREATE INDEX IF NOT EXISTS apply_events_tenant ON apply_audit_events(tenant_id,id)",
    ].join(" "));
  }

  /** Releases database + locally-held key material, not the operator's original key. */
  close(): void { this.db.close(); this.key.fill(0); this.journalKey.fill(0); }

  private appendEvent(principal: ApplyPrincipal, id: string, action: string, at: string): void {
    const last = this.db.prepare("SELECT digest FROM apply_audit_events WHERE tenant_id=? ORDER BY id DESC LIMIT 1")
      .get(principal.tenantId) as { digest: string } | undefined;
    const previous = last?.digest ?? GENESIS;
    const signed = JSON.stringify([principal.tenantId, principal.actorId, id, action, at, previous]);
    const mac = createHmac("sha256", this.journalKey).update(signed).digest("hex");
    this.db.prepare("INSERT INTO apply_audit_events (tenant_id,actor_id,proposal_id,action,occurred_at,previous_digest,digest) VALUES (?,?,?,?,?,?,?)")
      .run(principal.tenantId, principal.actorId, id, action, at, previous, mac);
  }

  private proposalRow(tenantId: string, id: string): ProposalRow | undefined {
    return this.db.prepare("SELECT * FROM apply_proposals WHERE tenant_id=? AND proposal_id=?")
      .get(tenantId, id) as ProposalRow | undefined;
  }
  private openPreview(row: ProposalRow): ApplyProposal {
    const data = openText(this.key, proposalContext(row.tenant_id, row.proposal_id),
      sealed({ nonce: row.preview_nonce, tag: row.preview_tag, ciphertext: row.preview_cipher }, row.preview_sha));
    const preview = JSON.parse(data) as ApplyProposal;
    if (!verifyApplyProposal(preview) || preview.proposalId !== row.proposal_id ||
        preview.tenantId !== row.tenant_id || preview.target.url !== row.target_url ||
        preview.observed.sha256 !== row.observed_sha || preview.diffSha256 !== row.diff_sha)
      throw new Error("Stored Apply Mode proposal failed integrity verification");
    return preview;
  }

  /** Public evidence can be recorded by a reader; payload still encrypted and tenant-scoped. */
  recordPreview(principal: ApplyPrincipal, preview: ApplyProposal, now = new Date()): string {
    principalCheck(principal);
    const at = validTime(now);
    if (!verifyApplyProposal(preview) || preview.tenantId !== principal.tenantId ||
        Date.parse(preview.createdAt) > now.getTime() || Date.parse(preview.expiresAt) <= now.getTime())
      throw new Error("Invalid, cross-tenant or expired Apply Mode preview");
    const json = JSON.stringify(preview);
    const payload = sealText(this.key, proposalContext(principal.tenantId, preview.proposalId), json);
    return this.db.transaction(() => {
      const existing = this.proposalRow(principal.tenantId, preview.proposalId);
      if (existing) {
        if (JSON.stringify(this.openPreview(existing)) !== json) throw new Error("Conflicting proposal identity");
        return preview.proposalId; // idempotent retry; no duplicate audit event
      }
      this.db.prepare("INSERT INTO apply_proposals (proposal_id,tenant_id,target_url,state,preview_sha,preview_nonce,preview_tag,preview_cipher,observed_sha,diff_sha,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(preview.proposalId, principal.tenantId, preview.target.url, "previewed", payload.sha256,
          payload.nonce, payload.tag, payload.ciphertext, preview.observed.sha256, preview.diffSha256,
          preview.createdAt, preview.expiresAt);
      this.appendEvent(principal, preview.proposalId, "preview_recorded", at);
      return preview.proposalId;
    }).immediate();
  }

  readPreview(principal: ApplyPrincipal, id: string): ApplyProposal | null {
    principalCheck(principal);
    if (!HEX64.test(id)) return null;
    const row = this.proposalRow(principal.tenantId, id);
    return row?.preview_cipher ? this.openPreview(row) : null;
  }

  /** Explicit, single-use authorization record; this still does NOT apply a fix. */
  approve(principal: ApplyPrincipal, id: string, reviewedDiffSha256: string,
    confirmed: boolean, now = new Date()): TrustedApplyApproval {
    requireApprover(principal);
    const at = validTime(now);
    if (!confirmed || !HEX64.test(id) || !HEX64.test(reviewedDiffSha256))
      throw new Error("Explicit confirmed approval and a reviewed diff digest are required");
    return this.db.transaction(() => {
      const row = this.proposalRow(principal.tenantId, id);
      if (!row || row.state !== "previewed") throw new Error("No pending Apply Mode proposal in this tenant");
      const preview = this.openPreview(row);
      if (!preview.changed || preview.manualReview.length || preview.diffSha256 !== reviewedDiffSha256 ||
          Date.parse(preview.createdAt) > now.getTime() || Date.parse(preview.expiresAt) <= now.getTime())
        throw new Error("Proposal is unchanged, conflicted, expired or its reviewed diff differs");
      const grant = this.grants.activeGrant(principal.tenantId, new URL(preview.target.url).hostname, now);
      if (!grant) throw new Error("A current tenant-scoped domain verification grant is required");
      authorizeVerifiedAuditTarget(preview.target.url, grant, now);
      const expiry = new Date(Math.min(Date.parse(preview.expiresAt), now.getTime() + APPROVAL_TTL_MS)).toISOString();
      this.db.prepare("INSERT INTO apply_approvals (proposal_id,tenant_id,actor_id,diff_sha,approved_at,expires_at) VALUES (?,?,?,?,?,?)")
        .run(id, principal.tenantId, principal.actorId, reviewedDiffSha256, at, expiry);
      this.db.prepare("UPDATE apply_proposals SET state=? WHERE tenant_id=? AND proposal_id=?")
        .run(nextApplyState(row.state, "approved"), principal.tenantId, id);
      this.appendEvent(principal, id, "approval_recorded", at);
      return { proposalId: id, tenantId: principal.tenantId, actorId: principal.actorId,
        reviewedDiffSha256, confirmed: true, approvedAt: at, expiresAt: expiry, consumedAt: null };
    }).immediate();
  }

  trustedApproval(principal: ApplyPrincipal, id: string): TrustedApplyApproval | null {
    requireApprover(principal);
    const row = this.db.prepare("SELECT * FROM apply_approvals WHERE tenant_id=? AND proposal_id=? AND actor_id=?")
      .get(principal.tenantId, id, principal.actorId) as ApprovalRow | undefined;
    if (!row || row.revoked_at) return null;
    return { proposalId: row.proposal_id, tenantId: row.tenant_id, actorId: row.actor_id,
      reviewedDiffSha256: row.diff_sha, confirmed: true, approvedAt: row.approved_at,
      expiresAt: row.expires_at, consumedAt: row.consumed_at };
  }

  /** Called only with bytes freshly read by a trusted scoped adapter. No remote writes here. */
  backup(principal: ApplyPrincipal, id: string, observedContent: string, now = new Date()): string {
    requireApprover(principal);
    const at = validTime(now);
    return this.db.transaction(() => {
      const row = this.proposalRow(principal.tenantId, id);
      const approval = this.trustedApproval(principal, id);
      if (!row || row.state !== "approved" || !approval || approval.consumedAt ||
          Date.parse(approval.expiresAt) <= now.getTime())
        throw new Error("An unexpired trusted approval is required before backup");
      const preview = this.openPreview(row);
      if (digest(observedContent) !== preview.observed.sha256)
        throw new Error("Target drifted since the reviewed preview; create a fresh proposal");
      const payload = sealText(this.key, backupContext(principal.tenantId, id, preview.observed.sha256),
        observedContent, SNAPSHOT_LIMIT_BYTES);
      const snapshotId = randomUUID();
      const expiry = new Date(now.getTime() + this.retentionDays * DAY_MS).toISOString();
      this.db.prepare("INSERT INTO apply_snapshots (id,tenant_id,proposal_id,content_sha,nonce,tag,ciphertext,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(snapshotId, principal.tenantId, id, payload.sha256, payload.nonce, payload.tag,
          payload.ciphertext, at, expiry);
      this.db.prepare("UPDATE apply_proposals SET state=? WHERE tenant_id=? AND proposal_id=?")
        .run(nextApplyState(row.state, "backed_up"), principal.tenantId, id);
      this.appendEvent(principal, id, "snapshot_encrypted", at);
      return snapshotId;
    }).immediate();
  }

  /** Restore bytes for a separately authorized rollback. This method never changes a site. */
  readBackup(principal: ApplyPrincipal, id: string, now = new Date()): string {
    requireApprover(principal);
    validTime(now);
    const row = this.db.prepare("SELECT * FROM apply_snapshots WHERE tenant_id=? AND proposal_id=?")
      .get(principal.tenantId, id) as SnapshotRow | undefined;
    if (!row || row.purged_at || Date.parse(row.expires_at) <= now.getTime())
      throw new Error("Rollback snapshot is absent or past retention");
    return openText(this.key, backupContext(principal.tenantId, id, row.content_sha),
      sealed(row, row.content_sha), SNAPSHOT_LIMIT_BYTES);
  }

  revokeApproval(principal: ApplyPrincipal, id: string, now = new Date()): void {
    requireApprover(principal);
    const at = validTime(now);
    this.db.transaction(() => {
      const row = this.proposalRow(principal.tenantId, id);
      const approval = this.trustedApproval(principal, id);
      if (!row || !approval || approval.consumedAt ||
          (row.state !== "approved" && row.state !== "backed_up"))
        throw new Error("No revocable approval from this actor and tenant");
      this.db.prepare("UPDATE apply_approvals SET revoked_at=? WHERE tenant_id=? AND proposal_id=? AND revoked_at IS NULL")
        .run(at, principal.tenantId, id);
      this.db.prepare("UPDATE apply_proposals SET state=? WHERE tenant_id=? AND proposal_id=?")
        .run(nextApplyState(row.state, "failed"), principal.tenantId, id);
      this.appendEvent(principal, id, "approval_revoked", at);
    }).immediate();
  }

  state(principal: ApplyPrincipal, id: string): ApplyState | null {
    principalCheck(principal);
    return this.proposalRow(principal.tenantId, id)?.state ?? null;
  }

  /**
   * Reserves one execution: atomically consumes the single-use approval, takes the
   * target-scoped active-attempt lock and transitions backed_up -> applying.
   * The writer adapter is called only after this returns.
   */
  beginExecution(principal: ApplyPrincipal, id: string, idempotencyKey: string, now = new Date()):
    { attemptId: string; idempotencyKey: string; kind: string; targetUrl: string } {
    requireApprover(principal);
    const key = validIdempotencyKey(idempotencyKey);
    const at = validTime(now);
    return this.db.transaction(() => {
      const row = this.proposalRow(principal.tenantId, id);
      const approval = this.trustedApproval(principal, id);
      if (!row || row.state !== "backed_up" || !approval)
        throw new Error("A backed-up proposal with an unexpired trusted approval is required");
      const approvalRow = this.db.prepare("SELECT * FROM apply_approvals WHERE tenant_id=? AND proposal_id=? AND actor_id=?")
        .get(principal.tenantId, id, principal.actorId) as ApprovalRow | undefined;
      if (!approvalRow || approvalRow.revoked_at || approvalRow.consumed_at ||
          Date.parse(approvalRow.expires_at) <= now.getTime() || approvalRow.diff_sha !== row.diff_sha)
        throw new Error("The stored approval is expired, consumed or does not bind this reviewed diff");
      const snapshot = this.db.prepare("SELECT id FROM apply_snapshots WHERE tenant_id=? AND proposal_id=? AND purged_at IS NULL")
        .get(principal.tenantId, id) as { id: string } | undefined;
      if (!snapshot) throw new Error("No restorable pre-write backup exists for this proposal");
      const preview = this.openPreview(row);
      const consumed = this.db.prepare("UPDATE apply_approvals SET consumed_at=? WHERE tenant_id=? AND proposal_id=? AND actor_id=? AND consumed_at IS NULL")
        .run(at, principal.tenantId, id, principal.actorId);
      if (consumed.changes !== 1) throw new Error("This approval has already been consumed");
      const attemptId = randomUUID();
      try {
        this.db.prepare("INSERT INTO apply_attempts (attempt_id,tenant_id,proposal_id,kind,target_kind,target_url,idempotency_key,status,created_at) VALUES(?,?,?,'write',?,?,?,'applying',?)")
          .run(attemptId, principal.tenantId, id, preview.target.kind, row.target_url, key, at);
      } catch (error) {
        if ((error as { code?: string }).code?.startsWith("SQLITE_CONSTRAINT"))
          throw new Error("Another active attempt already owns this target lock");
        throw error;
      }
      this.db.prepare("UPDATE apply_proposals SET state=? WHERE tenant_id=? AND proposal_id=?")
        .run(nextApplyState(row.state, "applying"), principal.tenantId, id);
      this.appendEvent(principal, id, "execution_started", at);
      return { attemptId, idempotencyKey: key, kind: preview.target.kind, targetUrl: row.target_url };
    }).immediate();
  }

  /**
   * Finalizes one execution attempt: applying -> verifying -> outcome. A lost
   * ACK lands in `uncertain` and keeps the target lock until reconciliation.
   */
  completeExecution(principal: ApplyPrincipal, id: string, attemptId: string, result: {
    httpStatus: number; writtenSha256: string | null; verifiedSha256: string | null;
    outcome: "verified" | "to_verify" | "uncertain" | "failed";
  }, now = new Date()): ApplyAttempt {
    requireApprover(principal);
    const at = validTime(now);
    return this.db.transaction(() => {
      const row = this.proposalRow(principal.tenantId, id);
      if (!row) throw new Error("Unknown Apply Mode proposal in this tenant");
      if (!this.mutableAttempt(principal.tenantId, id, attemptId, "applying"))
        throw new Error("No applying attempt matches this execution receipt");
      this.db.prepare("UPDATE apply_proposals SET state=? WHERE tenant_id=? AND proposal_id=?")
        .run(nextApplyState("applying", "verifying"), principal.tenantId, id);
      this.db.prepare("UPDATE apply_proposals SET state=? WHERE tenant_id=? AND proposal_id=?")
        .run(nextApplyState("verifying", result.outcome), principal.tenantId, id);
      const completed = result.outcome === "uncertain" ? null : at;
      this.db.prepare("UPDATE apply_attempts SET status=?,http_status=?,written_sha256=?,verified_sha256=?,completed_at=? WHERE tenant_id=? AND attempt_id=?")
        .run(result.outcome, result.httpStatus, result.writtenSha256, result.verifiedSha256,
          completed, principal.tenantId, attemptId);
      this.appendEvent(principal, id, `execution_${result.outcome}`, at);
      return this.attempt(principal, id)!;
    }).immediate();
  }

  /** A second, explicit approval that authorizes restoring the pre-write backup. */
  approveRollback(principal: ApplyPrincipal, id: string, confirmed: boolean, now = new Date()): TrustedApplyApproval {
    requireApprover(principal);
    const at = validTime(now);
    if (!confirmed || !HEX64.test(id))
      throw new Error("An explicit confirmed rollback approval is required");
    return this.db.transaction(() => {
      const row = this.proposalRow(principal.tenantId, id);
      if (!row || !["verified", "to_verify", "failed", "uncertain"].includes(row.state) ||
          !this.mutableAttempt(principal.tenantId, id, null, null, ["verified", "to_verify", "uncertain", "failed"]))
        throw new Error("Only a finished or uncertain execution can be rolled back");
      const existing = this.db.prepare("SELECT * FROM apply_rollback_approvals WHERE tenant_id=? AND proposal_id=?")
        .get(principal.tenantId, id) as RollbackApprovalRow | undefined;
      const expiry = new Date(now.getTime() + APPROVAL_TTL_MS).toISOString();
      if (existing && !existing.revoked_at && !existing.consumed_at) {
        this.db.prepare("UPDATE apply_rollback_approvals SET actor_id=?,approved_at=?,expires_at=? WHERE tenant_id=? AND proposal_id=?")
          .run(principal.actorId, at, expiry, principal.tenantId, id);
      } else if (existing) {
        throw new Error("The previous rollback approval was consumed or revoked; ask the owner to re-decide");
      } else {
        this.db.prepare("INSERT INTO apply_rollback_approvals (proposal_id,tenant_id,actor_id,approved_at,expires_at) VALUES(?,?,?,?,?)")
          .run(id, principal.tenantId, principal.actorId, at, expiry);
      }
      this.appendEvent(principal, id, "rollback_approved", at);
      return { proposalId: id, tenantId: principal.tenantId, actorId: principal.actorId,
        reviewedDiffSha256: row.diff_sha, confirmed: true, approvedAt: at, expiresAt: expiry, consumedAt: null };
    }).immediate();
  }

  /** Consumes the rollback approval, takes the lock and marks rollback_requested. */
  beginRollback(principal: ApplyPrincipal, id: string, idempotencyKey: string, now = new Date()):
    { attemptId: string; idempotencyKey: string } {
    requireApprover(principal);
    const key = validIdempotencyKey(idempotencyKey);
    const at = validTime(now);
    return this.db.transaction(() => {
      const row = this.proposalRow(principal.tenantId, id);
      if (!row || !["verified", "to_verify", "failed", "uncertain"].includes(row.state))
        throw new Error("This proposal is not in a rollback-eligible state");
      const approval = this.db.prepare("SELECT * FROM apply_rollback_approvals WHERE tenant_id=? AND proposal_id=?")
        .get(principal.tenantId, id) as RollbackApprovalRow | undefined;
      if (!approval || approval.actor_id !== principal.actorId || approval.revoked_at ||
          approval.consumed_at || Date.parse(approval.expires_at) <= now.getTime())
        throw new Error("No unexpired rollback approval from this actor");
      const snapshot = this.db.prepare("SELECT id FROM apply_snapshots WHERE tenant_id=? AND proposal_id=? AND purged_at IS NULL")
        .get(principal.tenantId, id) as { id: string } | undefined;
      if (!snapshot || Date.parse((this.db.prepare("SELECT expires_at FROM apply_snapshots WHERE tenant_id=? AND proposal_id=?")
        .get(principal.tenantId, id) as { expires_at: string }).expires_at) <= now.getTime())
        throw new Error("The encrypted rollback snapshot is absent or past retention");
      const preview = this.openPreview(row);
      const consumed = this.db.prepare("UPDATE apply_rollback_approvals SET consumed_at=? WHERE tenant_id=? AND proposal_id=? AND consumed_at IS NULL")
        .run(at, principal.tenantId, id);
      if (consumed.changes !== 1) throw new Error("This rollback approval has already been consumed");
      const attemptId = randomUUID();
      try {
        this.db.prepare("INSERT INTO apply_attempts (attempt_id,tenant_id,proposal_id,kind,target_kind,target_url,idempotency_key,status,created_at) VALUES(?,?,?,'rollback',?,?,?,'rolling_back',?)")
          .run(attemptId, principal.tenantId, id, preview.target.kind, row.target_url, key, at);
      } catch (error) {
        if ((error as { code?: string }).code?.startsWith("SQLITE_CONSTRAINT"))
          throw new Error("Another active attempt already owns this target lock");
        throw error;
      }
      this.db.prepare("UPDATE apply_proposals SET state=? WHERE tenant_id=? AND proposal_id=?")
        .run(nextApplyState(row.state as ApplyState, "rollback_requested"), principal.tenantId, id);
      this.appendEvent(principal, id, "rollback_started", at);
      return { attemptId, idempotencyKey: key };
    }).immediate();
  }

  /** Finalizes the restore: rollback_requested -> rolled_back | uncertain | failed. */
  completeRollback(principal: ApplyPrincipal, id: string, attemptId: string, result: {
    httpStatus: number; restoredSha256: string | null; outcome: "rolled_back" | "uncertain" | "failed";
  }, now = new Date()): ApplyAttempt {
    requireApprover(principal);
    const at = validTime(now);
    return this.db.transaction(() => {
      const row = this.proposalRow(principal.tenantId, id);
      if (!row || row.state !== "rollback_requested")
        throw new Error("No rollback in progress for this proposal");
      if (!this.mutableAttempt(principal.tenantId, id, attemptId, "rolling_back"))
        throw new Error("No rolling-back attempt matches this rollback receipt");
      this.db.prepare("UPDATE apply_proposals SET state=? WHERE tenant_id=? AND proposal_id=?")
        .run(nextApplyState("rollback_requested", result.outcome === "rolled_back" ? "rolled_back" : result.outcome), principal.tenantId, id);
      this.db.prepare("UPDATE apply_attempts SET status=?,http_status=?,verified_sha256=?,completed_at=? WHERE tenant_id=? AND attempt_id=?")
        .run(result.outcome, result.httpStatus, result.restoredSha256,
          result.outcome === "uncertain" ? null : at, principal.tenantId, attemptId);
      this.appendEvent(principal, id, `execution_${result.outcome}`, at);
      return this.attempt(principal, id)!;
    }).immediate();
  }

  /** Latest attempt of a proposal, sanitized for console display. */
  attempt(principal: ApplyPrincipal, id: string): ApplyAttempt | null {
    principalCheck(principal);
    if (!HEX64.test(id)) return null;
    const row = this.db.prepare("SELECT * FROM apply_attempts WHERE tenant_id=? AND proposal_id=? ORDER BY created_at DESC, attempt_id LIMIT 1")
      .get(principal.tenantId, id) as AttemptRow | undefined;
    return row ? sanitizeAttempt(row) : null;
  }

  /** The current domain-ownership grant for a proposal's target, or null. */
  activeDomainGrant(principal: ApplyPrincipal, id: string, grantHostname: string, now = new Date()): VerifiedDomainGrant | null {
    principalCheck(principal);
    return this.grants.activeGrant(principal.tenantId, grantHostname, now) ?? null;
  }

  private mutableAttempt(tenantId: string, proposalId: string, attemptId: string | null,
    status: string | null, anyOf: string[] = [status ?? "applying"]): AttemptRow | undefined {
    const row = this.db.prepare("SELECT * FROM apply_attempts WHERE tenant_id=? AND proposal_id=? ORDER BY created_at DESC, attempt_id LIMIT 1")
      .get(tenantId, proposalId) as AttemptRow | undefined;
    if (!row || !anyOf.includes(row.status) || (attemptId !== null && row.attempt_id !== attemptId)) return undefined;
    return row;
  }

  /** Purge expired encrypted bytes for both proposals and backups; keep audit metadata. */
  pruneExpiredPayloads(tenantId: string, now = new Date()): { snapshots: number; previews: number } {
    if (!ID_PATTERN.test(tenantId)) throw new Error("Invalid tenant for retention operation");
    const at = validTime(now);
    const previewCutoff = new Date(now.getTime() - this.retentionDays * DAY_MS).toISOString();
    return this.db.transaction(() => {
      const expired = this.db.prepare("SELECT proposal_id FROM apply_snapshots WHERE tenant_id=? AND expires_at<=? AND purged_at IS NULL")
        .all(tenantId, at) as Array<{ proposal_id: string }>;
      for (const row of expired) {
        this.db.prepare("UPDATE apply_snapshots SET nonce=NULL,tag=NULL,ciphertext=NULL,purged_at=? WHERE tenant_id=? AND proposal_id=? AND purged_at IS NULL")
          .run(at, tenantId, row.proposal_id);
        this.appendEvent({ tenantId, actorId: "retention-job", role: "admin" }, row.proposal_id, "snapshot_expired", at);
      }
      const oldPreviews = this.db.prepare("SELECT proposal_id FROM apply_proposals WHERE tenant_id=? AND expires_at<=? AND redacted_at IS NULL")
        .all(tenantId, previewCutoff) as Array<{ proposal_id: string }>;
      for (const row of oldPreviews) {
        this.db.prepare("UPDATE apply_proposals SET preview_nonce=NULL,preview_tag=NULL,preview_cipher=NULL,redacted_at=? WHERE tenant_id=? AND proposal_id=? AND redacted_at IS NULL")
          .run(at, tenantId, row.proposal_id);
        this.appendEvent({ tenantId, actorId: "retention-job", role: "admin" }, row.proposal_id, "preview_redacted", at);
      }
      return { snapshots: expired.length, previews: oldPreviews.length };
    }).immediate();
  }

  /** Event content never includes source files, credentials, or plaintext backups. */
  auditEvents(principal: ApplyPrincipal, limit = 100): ApplyAuditEvent[] {
    requireApprover(principal);
    if (!this.verifyJournal(principal.tenantId)) throw new Error("Apply Mode audit journal authentication failed");
    const count = Math.min(Math.max(Math.trunc(limit), 1), 200);
    const rows = this.db.prepare("SELECT * FROM apply_audit_events WHERE tenant_id=? ORDER BY id DESC LIMIT ?")
      .all(principal.tenantId, count) as EventRow[];
    return rows.reverse().map(row => ({ id: row.id, tenantId: row.tenant_id, actorId: row.actor_id,
      proposalId: row.proposal_id, action: row.action, occurredAt: row.occurred_at,
      previousDigest: row.previous_digest, digest: row.digest }));
  }

  /** Per-tenant HMAC hash-chain check; external checkpointing will strengthen deletion detection. */
  verifyJournal(tenantId: string): boolean {
    if (!ID_PATTERN.test(tenantId)) return false;
    const rows = this.db.prepare("SELECT * FROM apply_audit_events WHERE tenant_id=? ORDER BY id")
      .all(tenantId) as EventRow[];
    let previous = GENESIS;
    for (const row of rows) {
      if (row.previous_digest !== previous || !HEX64.test(row.digest)) return false;
      const data = JSON.stringify([row.tenant_id, row.actor_id, row.proposal_id, row.action, row.occurred_at, previous]);
      const expected = createHmac("sha256", this.journalKey).update(data).digest();
      if (!timingSafeEqual(expected, Buffer.from(row.digest, "hex"))) return false;
      previous = row.digest;
    }
    return true;
  }
}
