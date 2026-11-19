/**
 * Public report delivery. Email verification grants access to ONE saved public
 * snapshot and any evidence explicitly copied to that invitation, never to a
 * tenant, CRM identity or authenticated console resource.
 * Codes are single-use and HMAC-peppered; sessions are opaque, short-lived and
 * stored only as digests. No code or session token is logged.
 */
import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { FreeReport360 } from "../freeread/report360.js";
import type { WhiteLabelBrand } from "./brand.js";
import { sealAddress, openAddress, FOLLOWUP_MAX_ATTEMPTS, type DueFollowUp, type FollowUpChoice, type ScheduledMilestone } from "./follow-ups.js";
import { planFollowUps } from "../impact/follow-ups.js";

export type ReportLanguage = "fr" | "en";
export interface ReportInvitation {
  id: string;
  code: string;
  email: string;
  language: ReportLanguage;
  url: string;
  expiresAt: number;
}

export type MailSender = (invitation: ReportInvitation) => Promise<void>;
export type ReportReader = (url: string) => Promise<FreeReport360>;
export interface PrivateVisibilityEvidence { source: string; observedAt: string; excerpt?: string; citations: string[] }

interface RecordRow {
  id: string; email_digest: string; ip_digest: string; code_digest: string;
  payload: string; language: ReportLanguage; brand: string | null; created_at: number;
  expires_at: number; attempts: number; consumed_at: number | null;
}

const CODE_TTL_MS = 15 * 60_000;
const SESSION_TTL_MS = 60 * 60_000;
const RETENTION_MS = 7 * 24 * 60 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_EMAIL_DAY = 4;
const MAX_IP_HOUR = 8;
const MAX_REPORT_BYTES = 500_000;
/** Follow-up rows outlive invitations (J+28 needs 28 days; invitations go after 7). */
const FOLLOWUP_RETENTION_MS = 90 * 24 * 60 * 60_000;

export class ReportAccessError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}

export function normaliseReportEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]{1,64}@[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?\.[a-z]{2,}$/i.test(email)) return null;
  if (email.includes("..")) return null;
  return email;
}

export class ReportAccessService {
  private readonly db: Database.Database;
  private readonly secret: string;
  private readonly now: () => number;

  constructor(options: { dbPath: string; secret: string; now?: () => number }) {
    if (options.secret.length < 32) throw new Error("REPORT_ACCESS_SECRET must be at least 32 characters");
    if (options.dbPath !== ":memory:") mkdirSync(path.dirname(path.resolve(options.dbPath)), { recursive: true, mode: 0o700 });
    this.db = new Database(options.dbPath, { timeout: 10_000 });
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("journal_mode = DELETE");
    this.db.pragma("busy_timeout = 10000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS invitations (
        id TEXT PRIMARY KEY, email_digest TEXT NOT NULL, ip_digest TEXT NOT NULL,
        code_digest TEXT NOT NULL, payload TEXT NOT NULL, language TEXT NOT NULL,
        created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, consumed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS invite_email_idx ON invitations(email_digest, created_at);
      CREATE INDEX IF NOT EXISTS invite_ip_idx ON invitations(ip_digest, created_at);
      CREATE TABLE IF NOT EXISTS sessions (
        token_digest TEXT PRIMARY KEY, invitation_id TEXT NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS invitation_evidence (
        invitation_id TEXT NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
        tenant_id TEXT NOT NULL, pin_id TEXT NOT NULL, payload TEXT NOT NULL,
        PRIMARY KEY(invitation_id, tenant_id, pin_id)
      );
      CREATE TABLE IF NOT EXISTS invitation_requests (
        request_digest TEXT PRIMARY KEY, email_digest TEXT NOT NULL, ip_digest TEXT NOT NULL,
        input_digest TEXT NOT NULL, invitation_id TEXT, state TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS invitation_request_email ON invitation_requests(email_digest,created_at);
      CREATE INDEX IF NOT EXISTS invitation_request_ip ON invitation_requests(ip_digest,created_at);
      CREATE TABLE IF NOT EXISTS follow_ups (
        id TEXT PRIMARY KEY,
        email_digest TEXT NOT NULL,
        email_sealed TEXT NOT NULL,
        language TEXT NOT NULL,
        brand TEXT,
        url TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        milestone TEXT NOT NULL CHECK(milestone IN ('J14','J28')),
        due_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        sent_at INTEGER,
        error TEXT,
        fresh_payload TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS follow_ups_once ON follow_ups(email_digest, url, milestone);
      CREATE INDEX IF NOT EXISTS follow_ups_due_idx ON follow_ups(status, due_at);
    `);
    // White-label branding column (additive migration for existing installs).
    const columns = this.db.prepare("PRAGMA table_info(invitations)").all() as { name: string }[];
    if (!columns.some(column => column.name === "brand")) this.db.exec("ALTER TABLE invitations ADD COLUMN brand TEXT");
    this.secret = options.secret;
    this.now = options.now ?? Date.now;
  }

  private digest(value: string): string {
    return createHmac("sha256", this.secret).update(value).digest("hex");
  }

  private cleanup(now: number): void {
    this.db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
    this.db.prepare("DELETE FROM invitations WHERE created_at < ?").run(now - RETENTION_MS);
    this.db.prepare("DELETE FROM invitation_requests WHERE created_at < ?").run(now - RETENTION_MS);
    this.db.prepare("DELETE FROM follow_ups WHERE created_at < ?").run(now - FOLLOWUP_RETENTION_MS);
  }

  async invite(input: { email: unknown; url: string; language: ReportLanguage; ip: string; requestKey?: string; snapshotId?: string; brand?: WhiteLabelBrand | null; followUp?: FollowUpChoice | null }, reader: ReportReader, send: MailSender): Promise<{ id: string; expiresIn: number }> {
    const email = normaliseReportEmail(input.email);
    if (!email) throw new ReportAccessError(400, "invalid_email");
    const followUp = input.followUp ?? "none";
    if (followUp !== "none" && followUp !== "auto") throw new ReportAccessError(400, "invalid_follow_up");
    const now = this.now();
    const emailDigest = this.digest(`email:${email}`);
    const ipDigest = this.digest(`ip:${input.ip}`);
    this.cleanup(now);
    if (input.requestKey !== undefined && !/^[A-Za-z0-9_-]{43}$/.test(input.requestKey)) throw new ReportAccessError(400, "invalid_request_key");
    const requestDigest = this.digest(`invite-request:${input.requestKey || randomBytes(32).toString("base64url")}`);
    const inputDigest = this.digest(JSON.stringify([emailDigest, input.url, input.language, input.snapshotId || "", input.brand ?? null, followUp]));
    // Reserve before any read or SMTP work, including concurrent requests from other processes.
    const reused = this.db.transaction(() => {
      const previous = this.db.prepare("SELECT * FROM invitation_requests WHERE request_digest=?").get(requestDigest) as { input_digest: string; state: string; invitation_id: string | null } | undefined;
      if (previous) {
        if (previous.input_digest !== inputDigest) throw new ReportAccessError(409, "request_key_conflict");
        if (previous.state !== "sent") throw new ReportAccessError(409, "invitation_requires_review");
        const row = this.db.prepare("SELECT expires_at FROM invitations WHERE id=?").get(previous.invitation_id) as { expires_at: number } | undefined;
        if (!row || row.expires_at <= now) throw new ReportAccessError(410, "invitation_expired");
        return { id: previous.invitation_id!, expiresIn: Math.ceil((row.expires_at - now) / 1000) };
      }
      const count = (column: "email_digest" | "ip_digest", value: string, after: number) =>
        (this.db.prepare(`SELECT COUNT(*) AS count FROM invitation_requests WHERE ${column}=? AND created_at>?`).get(value, after) as { count: number }).count;
      // Count historic invitations too during the first retention window after migration.
      const historic = (column: "email_digest" | "ip_digest", value: string, after: number) =>
        (this.db.prepare(`SELECT COUNT(*) AS count FROM invitations i WHERE ${column}=? AND created_at>? AND NOT EXISTS
          (SELECT 1 FROM invitation_requests r WHERE r.invitation_id=i.id)`).get(value, after) as { count: number }).count;
      if (count("email_digest", emailDigest, now - 86400_000) + historic("email_digest", emailDigest, now - 86400_000) >= MAX_EMAIL_DAY ||
          count("ip_digest", ipDigest, now - 3600_000) + historic("ip_digest", ipDigest, now - 3600_000) >= MAX_IP_HOUR) throw new ReportAccessError(429, "too_many_invitations");
      this.db.prepare("INSERT INTO invitation_requests VALUES(?,?,?,?,NULL,'preparing',?)").run(requestDigest, emailDigest, ipDigest, inputDigest, now);
      return null;
    }).immediate();
    if (reused) return reused;
    let report: FreeReport360;
    try { report = await reader(input.url); }
    catch { this.db.prepare("UPDATE invitation_requests SET state='failed' WHERE request_digest=?").run(requestDigest); throw new ReportAccessError(502, "report_unavailable"); }
    if (report.schemaVersion !== 1 || report.scope !== "single_public_url") throw new ReportAccessError(502, "report_unavailable");
    const payload = JSON.stringify(report);
    if (Buffer.byteLength(payload, "utf8") > MAX_REPORT_BYTES) throw new ReportAccessError(413, "report_too_large");
    const id = randomUUID();
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expiresAt = this.now() + CODE_TTL_MS;
    // Commit the saved snapshot and its dispatch state together after admission.
    this.db.transaction(() => {
      this.db.prepare(`INSERT INTO invitations (id, email_digest, ip_digest, code_digest, payload, language, brand, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, emailDigest, ipDigest, this.digest(`code:${id}:${emailDigest}:${code}`), payload, input.language, input.brand ? JSON.stringify(input.brand) : null, now, expiresAt);
      this.db.prepare("UPDATE invitation_requests SET invitation_id=?,state='sending' WHERE request_digest=?").run(id, requestDigest);
    }).immediate();
    try {
      await send({ id, code, email, language: input.language, url: report.sourceUrl, expiresAt });
    } catch {
      this.db.prepare("DELETE FROM invitations WHERE id = ?").run(id);
      // SMTP may have accepted the email before disconnecting. Never automatically resend it.
      this.db.prepare("UPDATE invitation_requests SET state='uncertain' WHERE request_digest=?").run(requestDigest);
      throw new ReportAccessError(503, "mail_unavailable");
    }
    this.db.prepare("UPDATE invitation_requests SET state='sent' WHERE request_digest=?").run(requestDigest);
    // Agency explicitly opted into J+14/J+28 follow-ups: seal the recipient
    // address and plan both milestones from the observed date. Nothing is
    // scheduled when the choice stays "none" (the default).
    if (followUp === "auto") this.scheduleFollowUps(email, emailDigest, input.language, input.brand ?? null, report, now);
    return { id, expiresIn: CODE_TTL_MS / 1000 };
  }

  /** Idempotent per (recipient, page, milestone): a repeated identical
   * invitation never doubles the plan. The address is stored sealed. */
  private scheduleFollowUps(email: string, emailDigest: string, language: ReportLanguage, brand: WhiteLabelBrand | null, report: FreeReport360, now: number): void {
    const plan = planFollowUps(report.observedAt);
    if (!plan) return;
    const insert = this.db.prepare(`INSERT OR IGNORE INTO follow_ups
      (id, email_digest, email_sealed, language, brand, url, observed_at, milestone, due_at, status, attempts, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`);
    for (const item of plan) {
      insert.run(randomUUID(), emailDigest, sealAddress(this.secret, email), language, brand ? JSON.stringify(brand) : null,
        report.sourceUrl, report.observedAt, item.label.replace("+", ""), Date.parse(item.dueAt), now);
    }
  }

  /** Due pending follow-ups, oldest first, decrypted inside the store. */
  dueFollowUps(now: number, limit: number): DueFollowUp[] {
    const rows = this.db.prepare(`SELECT * FROM follow_ups WHERE status='pending' AND due_at <= ? ORDER BY due_at, id LIMIT ?`)
      .all(now, Math.max(1, Math.min(limit, 20))) as Array<RecordRow & { email_sealed: string; url: string; observed_at: string; milestone: string; due_at: number; attempts: number }>;
    const due: DueFollowUp[] = [];
    for (const row of rows) {
      const email = openAddress(this.secret, row.email_sealed);
      if (!email) { this.db.prepare(`UPDATE follow_ups SET status='failed', error='unsealed', attempts=attempts+1 WHERE id=?`).run(row.id); continue; }
      due.push({ id: row.id, email, language: row.language, brand: row.brand ? JSON.parse(row.brand) as WhiteLabelBrand : null,
        url: row.url, observedAt: row.observed_at, milestone: row.milestone as ScheduledMilestone, dueAt: new Date(row.due_at).toISOString(), attempts: row.attempts });
    }
    return due;
  }

  /** Terminal on success; capped retry on failure. The fresh snapshot kept on
   * the row is the dispatch evidence (never summed, single scope). */
  completeFollowUp(id: string, outcome: { status: "sent" | "failed"; error?: string; freshPayload?: string }): void {
    const now = this.now();
    if (outcome.status === "sent") {
      if (outcome.freshPayload !== undefined && Buffer.byteLength(outcome.freshPayload, "utf8") > MAX_REPORT_BYTES) throw new Error("Follow-up snapshot too large");
      this.db.prepare(`UPDATE follow_ups SET status='sent', sent_at=?, error=NULL, fresh_payload=? WHERE id=? AND status='pending'`)
        .run(now, outcome.freshPayload ?? null, id);
      return;
    }
    const row = this.db.prepare("SELECT attempts FROM follow_ups WHERE id=?").get(id) as { attempts: number } | undefined;
    if (!row) return;
    const attempts = row.attempts + 1;
    const status = attempts >= FOLLOWUP_MAX_ATTEMPTS ? "failed" : "pending";
    this.db.prepare("UPDATE follow_ups SET attempts=?, status=?, error=? WHERE id=?").run(attempts, status, outcome.error?.slice(0, 160) ?? null, id);
  }

  /** Follow-up plan for a verified session (recipient and page only; the
   * address itself never leaves the store). */
  authorisedFollowUps(id: unknown, token: unknown): { followUps: Array<{ milestone: string; dueAt: string; status: string; sentAt: number | null; attempts: number }> } {
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id) || typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new ReportAccessError(401, "verification_required");
    }
    const now = this.now();
    const row = this.db.prepare(`SELECT i.payload AS payload, i.email_digest AS email_digest FROM sessions s
      JOIN invitations i ON i.id = s.invitation_id
      WHERE s.token_digest = ? AND s.invitation_id = ? AND s.expires_at > ? AND i.created_at > ?`)
      .get(this.digest(`session:${token}`), id, now, now - RETENTION_MS) as { payload: string; email_digest: string } | undefined;
    if (!row) throw new ReportAccessError(401, "verification_required");
    const url = (JSON.parse(row.payload) as FreeReport360).sourceUrl;
    const rows = this.db.prepare(`SELECT milestone, due_at, status, sent_at, attempts FROM follow_ups
      WHERE email_digest = ? AND url = ? ORDER BY due_at`).all(row.email_digest, url) as
      Array<{ milestone: string; due_at: number; status: string; sent_at: number | null; attempts: number }>;
    return { followUps: rows.map(r => ({ milestone: r.milestone, dueAt: new Date(r.due_at).toISOString(), status: r.status, sentAt: r.sent_at, attempts: r.attempts })) };
  }

  verify(input: { id: unknown; email: unknown; code: unknown }): { token: string; expiresIn: number } {
    const now = this.now();
    const email = normaliseReportEmail(input.email);
    const id = typeof input.id === "string" && /^[0-9a-f-]{36}$/.test(input.id) ? input.id : "";
    const code = typeof input.code === "string" && /^\d{6}$/.test(input.code) ? input.code : "";
    if (!email || !id || !code) throw new ReportAccessError(401, "invalid_or_expired_code");
    const digest = this.digest(`email:${email}`);
    const row = this.db.prepare("SELECT * FROM invitations WHERE id = ?").get(id) as RecordRow | undefined;
    if (!row || row.expires_at <= now || row.consumed_at !== null || row.attempts >= MAX_ATTEMPTS) throw new ReportAccessError(401, "invalid_or_expired_code");
    const proposed = this.digest(`code:${id}:${digest}:${code}`);
    const matches = timingSafeEqual(Buffer.from(proposed, "hex"), Buffer.from(row.code_digest, "hex"));
    if (!matches || digest !== row.email_digest) {
      this.db.prepare("UPDATE invitations SET attempts = attempts + 1 WHERE id = ? AND consumed_at IS NULL").run(id);
      throw new ReportAccessError(401, "invalid_or_expired_code");
    }

    const token = randomBytes(32).toString("base64url");
    const consume = this.db.transaction(() => {
      const claimed = this.db.prepare("UPDATE invitations SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL AND attempts < ? AND expires_at > ?").run(now, id, MAX_ATTEMPTS, now);
      if (claimed.changes !== 1) throw new ReportAccessError(401, "invalid_or_expired_code");
      this.db.prepare("INSERT INTO sessions (token_digest, invitation_id, expires_at) VALUES (?, ?, ?)")
        .run(this.digest(`session:${token}`), id, now + SESSION_TTL_MS);
    });
    consume.immediate();
    return { token, expiresIn: SESSION_TTL_MS / 1000 };
  }

  shareVisibilityEvidence(input: { id: string; email: string; tenantId: string; pinId: string; page: string; evidence: PrivateVisibilityEvidence }): void {
    const email = normaliseReportEmail(input.email), now = this.now();
    const payload = JSON.stringify(input.evidence);
    if (!email || payload.length > 25000) throw new ReportAccessError(400, 'invalid_evidence_grant');
    this.db.transaction(() => {
      const row = this.db.prepare(`SELECT payload FROM invitations i WHERE i.id=? AND i.email_digest=? AND i.created_at>?
        AND ((i.consumed_at IS NULL AND i.expires_at>?) OR EXISTS (
          SELECT 1 FROM sessions s WHERE s.invitation_id=i.id AND s.expires_at>?
        ))`).get(input.id, this.digest(`email:${email}`), now - RETENTION_MS, now, now) as { payload: string } | undefined;
      if (!row || new URL((JSON.parse(row.payload) as FreeReport360).sourceUrl).href !== input.page) throw new ReportAccessError(404, 'report_scope_unavailable');
      const existing = this.db.prepare('SELECT 1 FROM invitation_evidence WHERE invitation_id=? AND tenant_id=? AND pin_id=?').get(input.id, input.tenantId, input.pinId);
      const count = this.db.prepare('SELECT count(*) AS total FROM invitation_evidence WHERE invitation_id=?').get(input.id) as { total: number };
      if (!existing && count.total >= 20) throw new ReportAccessError(409, 'report_evidence_limit');
      this.db.prepare(`INSERT INTO invitation_evidence VALUES (?,?,?,?) ON CONFLICT(invitation_id,tenant_id,pin_id) DO UPDATE SET payload=excluded.payload`)
        .run(input.id, input.tenantId, input.pinId, payload);
    }).immediate();
  }

  revokeVisibilityEvidence(id: string, tenantId: string): void {
    this.db.prepare('DELETE FROM invitation_evidence WHERE invitation_id=? AND tenant_id=?').run(id, tenantId);
  }

  authorisedReport(id: unknown, token: unknown, includeEvidence = false): { report: FreeReport360; language: ReportLanguage; brand: WhiteLabelBrand | null; visibilityEvidence?: PrivateVisibilityEvidence[] } {
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id) || typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new ReportAccessError(401, "verification_required");
    }
    const row = this.db.prepare(`SELECT i.* FROM sessions s JOIN invitations i ON i.id = s.invitation_id
      WHERE s.token_digest = ? AND s.invitation_id = ? AND s.expires_at > ? AND i.created_at > ?`)
      .get(this.digest(`session:${token}`), id, this.now(), this.now() - RETENTION_MS) as RecordRow | undefined;
    if (!row) throw new ReportAccessError(401, "verification_required");
    const evidence = includeEvidence ? this.db.prepare('SELECT payload FROM invitation_evidence WHERE invitation_id=? ORDER BY rowid').all(row.id) as Array<{ payload: string }> : [];
    return { report: JSON.parse(row.payload) as FreeReport360, language: row.language, brand: row.brand ? JSON.parse(row.brand) as WhiteLabelBrand : null,
      ...(evidence.length ? { visibilityEvidence: evidence.map(item => JSON.parse(item.payload) as PrivateVisibilityEvidence) } : {}) };
  }

  close(): void { this.db.close(); }
}
