/** PostgreSQL is the audit ledger and transactional outbox; Redis is transport only. */
import { createHash, createHmac, randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { FreeReadResult } from "../freeread/index.js";

export const AUDIT_RETENTION_MS = 24 * 60 * 60_000;
export const AUDIT_ATTEMPTS = 3;
export const validAuditToken = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export class AuditError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export interface AuditJob {
  id: string; url: string; status: "pending" | "queued" | "running" | "completed" | "failed";
  created_at: string; updated_at: string; expires_at: string; attempts: number;
  /** HMAC of the submitting IP; pairs this requestor's own snapshots only. */
  owner_digest: string;
  run_token: string | null; result: FreeReadResult | null; error_code: string | null;
}
export class AuditStore {
  constructor(readonly pool: Pool, private secret: string, private now = Date.now) {
    if (secret.length < 32) throw new Error("AUDIT_JOBS_SECRET must contain at least 32 characters");
  }
  async migrate() {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(7218041)");
      await client.query(`CREATE TABLE IF NOT EXISTS gtm_audit_jobs (
        id UUID PRIMARY KEY, token_digest TEXT UNIQUE NOT NULL, owner_digest TEXT NOT NULL,
        url TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','queued','running','completed','failed')),
        created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, expires_at BIGINT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, run_token UUID, result JSONB, error_code TEXT
      );
      CREATE INDEX IF NOT EXISTS gtm_audit_owner ON gtm_audit_jobs(owner_digest,created_at);
      CREATE INDEX IF NOT EXISTS gtm_audit_dispatch ON gtm_audit_jobs(status,updated_at);
      CREATE INDEX IF NOT EXISTS gtm_audit_expiry ON gtm_audit_jobs(expires_at)`);
      await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }
  }
  async submit(url: string, token: string, ip: string): Promise<AuditJob> {
    if (!validAuditToken(token)) throw new AuditError(400, "invalid_request_key");
    const now = this.now(), client = await this.pool.connect();
    const owner = createHmac("sha256", this.secret).update(`public-audit-ip:${ip}`).digest("hex");
    try {
      await client.query("BEGIN");
      // Short admission transaction: also serialises capacity and quota checks across API replicas.
      await client.query("SELECT pg_advisory_xact_lock(7218042)");
      await client.query("DELETE FROM gtm_audit_jobs WHERE expires_at <= $1", [now]);
      const previous = await client.query<AuditJob>("SELECT * FROM gtm_audit_jobs WHERE token_digest=$1", [digest(token)]);
      if (previous.rows[0]) {
        if (previous.rows[0].url !== url) throw new AuditError(409, "request_key_conflict");
        await client.query("COMMIT"); return previous.rows[0];
      }
      const count = await client.query<{ recent: string; active: string }>(`SELECT
        count(*) FILTER(WHERE owner_digest=$1 AND created_at>$2) AS recent,
        count(*) FILTER(WHERE status IN ('pending','queued','running')) AS active FROM gtm_audit_jobs`, [owner, now - 60 * 60_000]);
      if (Number(count.rows[0].recent) >= 8) throw new AuditError(429, "audit_quota_reached");
      if (Number(count.rows[0].active) >= 100) throw new AuditError(503, "audit_capacity_reached");
      const inserted = await client.query<AuditJob>(`INSERT INTO gtm_audit_jobs
        (id,token_digest,owner_digest,url,status,created_at,updated_at,expires_at)
        VALUES($1,$2,$3,$4,'pending',$5,$5,$6) RETURNING *`, [randomUUID(), digest(token), owner, url, now, now + AUDIT_RETENTION_MS]);
      await client.query("COMMIT"); return inserted.rows[0];
    } catch (e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }
  }
  async authorised(id: unknown, token: unknown): Promise<AuditJob> {
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id) || !validAuditToken(token)) throw new AuditError(404, "audit_not_found");
    const rows = await this.pool.query<AuditJob>("SELECT * FROM gtm_audit_jobs WHERE id=$1 AND token_digest=$2 AND expires_at>$3", [id, digest(token), this.now()]);
    if (!rows.rows[0]) throw new AuditError(404, "audit_not_found");
    return rows.rows[0];
  }
  /** Most recent completed snapshot of the same URL by the same requestor, before the given job. */
  async previousCompleted(ownerDigest: string, url: string, jobId: string, createdAt: string): Promise<AuditJob | null> {
    const rows = await this.pool.query<AuditJob>(`SELECT * FROM gtm_audit_jobs WHERE owner_digest=$1 AND url=$2 AND status='completed'
      AND result IS NOT NULL AND expires_at>$5 AND (created_at<$4 OR (created_at=$4 AND id<>$3))
      ORDER BY created_at DESC, id LIMIT 1`, [ownerDigest, url, jobId, Number(createdAt), this.now()]);
    return rows.rows[0] ?? null;
  }
  async dispatchable(): Promise<AuditJob[]> {
    const now = this.now();
    await this.pool.query("DELETE FROM gtm_audit_jobs WHERE expires_at<=$1", [now]);
    // Reconcile even queued jobs after a Redis restart. add(jobId) is idempotent.
    return (await this.pool.query<AuditJob>(`SELECT * FROM gtm_audit_jobs WHERE expires_at>$1 AND
      (status='pending' OR (status='queued' AND updated_at<$2) OR (status='running' AND updated_at<$3))
      ORDER BY created_at LIMIT 100`, [now, now - 60_000, now - 180_000])).rows;
  }
  async queued(id: string) {
    await this.pool.query("UPDATE gtm_audit_jobs SET status='queued',updated_at=$2 WHERE id=$1 AND status IN ('pending','queued')", [id, this.now()]);
  }
  async begin(id: string): Promise<AuditJob | null> {
    const now = this.now();
    const result = await this.pool.query<AuditJob>(`UPDATE gtm_audit_jobs SET status='running',attempts=attempts+1,run_token=$2,updated_at=$3
      WHERE id=$1 AND status NOT IN ('completed','failed') AND attempts<$4 AND expires_at>$3 RETURNING *`, [id, randomUUID(), now, AUDIT_ATTEMPTS]);
    if (!result.rows[0]) await this.pool.query(`UPDATE gtm_audit_jobs SET status='failed',error_code='audit_unavailable',updated_at=$2
      WHERE id=$1 AND status NOT IN ('completed','failed') AND attempts>=$3`, [id, now, AUDIT_ATTEMPTS]);
    return result.rows[0] ?? null;
  }
  async complete(job: AuditJob, result: FreeReadResult): Promise<boolean> {
    const payload = JSON.stringify(result);
    if (Buffer.byteLength(payload) > 1_500_000) throw new Error("audit_result_too_large");
    return (await this.pool.query(`UPDATE gtm_audit_jobs SET status='completed',result=$3::jsonb,error_code=NULL,updated_at=$4
      WHERE id=$1 AND run_token=$2 AND status='running'`, [job.id, job.run_token, payload, this.now()])).rowCount === 1;
  }
  async fail(job: AuditJob) {
    await this.pool.query(`UPDATE gtm_audit_jobs SET status=$3,error_code='audit_unavailable',updated_at=$4
      WHERE id=$1 AND run_token=$2 AND status='running'`, [job.id, job.run_token, job.attempts >= AUDIT_ATTEMPTS ? "failed" : "queued", this.now()]);
  }
  async counts(): Promise<Array<{ status: string; count: string }>> {
    return (await this.pool.query("SELECT status,count(*) FROM gtm_audit_jobs WHERE expires_at>$1 GROUP BY status", [this.now()])).rows;
  }
  async ping() { await this.pool.query("SELECT 1"); }
  async close() { await this.pool.end(); }
}
