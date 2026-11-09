/** Server-side Apply Mode registry. Persisted approvals/backups never execute a remote write. */
import fs from "node:fs";
import path from "node:path";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import Database from "better-sqlite3";
import { authorizeVerifiedAuditTarget, type VerifiedDomainGrant } from "../geo/rendering/verified-domain.js";
import { nextApplyState, type ApplyState, type TrustedApplyApproval } from "./approval.js";
import { verifyFileApplyPreview, type FileApplyPreview } from "./preview.js";
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
  private openPreview(row: ProposalRow): FileApplyPreview {
    const data = openText(this.key, proposalContext(row.tenant_id, row.proposal_id),
      sealed({ nonce: row.preview_nonce, tag: row.preview_tag, ciphertext: row.preview_cipher }, row.preview_sha));
    const preview = JSON.parse(data) as FileApplyPreview;
    if (!verifyFileApplyPreview(preview) || preview.proposalId !== row.proposal_id ||
        preview.tenantId !== row.tenant_id || preview.target.url !== row.target_url ||
        preview.observed.sha256 !== row.observed_sha || preview.diffSha256 !== row.diff_sha)
      throw new Error("Stored Apply Mode proposal failed integrity verification");
    return preview;
  }

  /** Public evidence can be recorded by a reader; payload still encrypted and tenant-scoped. */
  recordPreview(principal: ApplyPrincipal, preview: FileApplyPreview, now = new Date()): string {
    principalCheck(principal);
    const at = validTime(now);
    if (!verifyFileApplyPreview(preview) || preview.tenantId !== principal.tenantId ||
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

  readPreview(principal: ApplyPrincipal, id: string): FileApplyPreview | null {
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
