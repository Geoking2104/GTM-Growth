/**
 * Public report delivery. Email verification grants access to ONE saved public
 * snapshot, never to a tenant, CRM identity or authenticated console resource.
 * Codes are single-use and HMAC-peppered; sessions are opaque, short-lived and
 * stored only as digests. No code or session token is logged.
 */
import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { FreeReport360 } from "../freeread/report360.js";

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

interface RecordRow {
  id: string; email_digest: string; ip_digest: string; code_digest: string;
  payload: string; language: ReportLanguage; created_at: number;
  expires_at: number; attempts: number; consumed_at: number | null;
}

const CODE_TTL_MS = 15 * 60_000;
const SESSION_TTL_MS = 60 * 60_000;
const RETENTION_MS = 7 * 24 * 60 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_EMAIL_DAY = 4;
const MAX_IP_HOUR = 8;
const MAX_REPORT_BYTES = 500_000;

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
    `);
    this.secret = options.secret;
    this.now = options.now ?? Date.now;
  }

  private digest(value: string): string {
    return createHmac("sha256", this.secret).update(value).digest("hex");
  }

  private cleanup(now: number): void {
    this.db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
    this.db.prepare("DELETE FROM invitations WHERE created_at < ?").run(now - RETENTION_MS);
  }

  async invite(input: { email: unknown; url: string; language: ReportLanguage; ip: string }, reader: ReportReader, send: MailSender): Promise<{ id: string; expiresIn: number }> {
    const email = normaliseReportEmail(input.email);
    if (!email) throw new ReportAccessError(400, "invalid_email");
    const now = this.now();
    const emailDigest = this.digest(`email:${email}`);
    const ipDigest = this.digest(`ip:${input.ip}`);
    this.cleanup(now);
    // The public URL is checked by the route before the reader is called.
    const report = await reader(input.url);
    if (report.schemaVersion !== 1 || report.scope !== "single_public_url") throw new ReportAccessError(502, "report_unavailable");
    const payload = JSON.stringify(report);
    if (Buffer.byteLength(payload, "utf8") > MAX_REPORT_BYTES) throw new ReportAccessError(413, "report_too_large");
    const id = randomUUID();
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expiresAt = now + CODE_TTL_MS;
    // Recheck quotas under a SQLite write lock: concurrent requests cannot both
    // consume the final permitted invitation slot.
    this.db.transaction(() => {
      const count = (column: "email_digest" | "ip_digest", digest: string, after: number): number =>
        (this.db.prepare(`SELECT COUNT(*) AS count FROM invitations WHERE ${column} = ? AND created_at > ?`).get(digest, after) as { count: number }).count;
      if (count("email_digest", emailDigest, now - 24 * 60 * 60_000) >= MAX_EMAIL_DAY || count("ip_digest", ipDigest, now - 60 * 60_000) >= MAX_IP_HOUR) {
        throw new ReportAccessError(429, "too_many_invitations");
      }
      this.db.prepare(`INSERT INTO invitations (id, email_digest, ip_digest, code_digest, payload, language, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, emailDigest, ipDigest, this.digest(`code:${id}:${emailDigest}:${code}`), payload, input.language, now, expiresAt);
    }).immediate();
    try {
      await send({ id, code, email, language: input.language, url: report.sourceUrl, expiresAt });
    } catch {
      this.db.prepare("DELETE FROM invitations WHERE id = ?").run(id);
      throw new ReportAccessError(503, "mail_unavailable");
    }
    return { id, expiresIn: CODE_TTL_MS / 1000 };
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

  authorisedReport(id: unknown, token: unknown): { report: FreeReport360; language: ReportLanguage } {
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id) || typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new ReportAccessError(401, "verification_required");
    }
    const row = this.db.prepare(`SELECT i.* FROM sessions s JOIN invitations i ON i.id = s.invitation_id
      WHERE s.token_digest = ? AND s.invitation_id = ? AND s.expires_at > ? AND i.created_at > ?`)
      .get(this.digest(`session:${token}`), id, this.now(), this.now() - RETENTION_MS) as RecordRow | undefined;
    if (!row) throw new ReportAccessError(401, "verification_required");
    return { report: JSON.parse(row.payload) as FreeReport360, language: row.language };
  }

  close(): void { this.db.close(); }
}
