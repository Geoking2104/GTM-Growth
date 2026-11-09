/** Node-only persistence. API handlers must derive tenant and actor from verified auth claims. */
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { canonicalVerifiedHostname } from "./verified-domain.js";
import { evaluateDomainChallenge, issueDomainChallenge } from "./domain-verification.js";
import type { DomainChallenge, VerificationMethod, VerificationTransport } from "./domain-verification.js";
import type { VerifiedDomainGrant } from "./verified-domain.js";

interface ChallengeRow {
  id: string; tenant_id: string; actor_id: string; hostname: string;
  method: VerificationMethod; token_hash: string; issued_at: string;
  expires_at: string; consumed_at: string | null; status: string;
}

interface GrantRow {
  hostname: string; tenant_id: string; actor_id: string;
  verified_at: string; expires_at: string; status: "verified" | "revoked";
}

export interface PendingChallenge extends DomainChallenge { id: string; }

const hashToken = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;
function assertIdentity(tenantId: string, actorId: string): void {
  if (!idPattern.test(tenantId) || !idPattern.test(actorId)) throw new Error("Invalid tenant or actor identity");
}

/** The caller provides verified tenant-admin or platform-admin authorization. */
export class DomainVerificationRegistry {
  private readonly db: Database.Database;

  constructor(file = process.env.GEO_DOMAIN_REGISTRY_PATH ?? "/data/domain-verifications.sqlite3") {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true, mode: 0o700 });
    try { const fd = fs.openSync(file, "wx", 0o600); fs.closeSync(fd); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    this.db = new Database(file, { timeout: 10000 });
    this.db.pragma("busy_timeout = 10000");
    this.db.pragma("journal_mode = DELETE");
    this.db.pragma("synchronous = FULL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS domain_challenges (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, actor_id TEXT NOT NULL,
        hostname TEXT NOT NULL, method TEXT NOT NULL, token_hash TEXT NOT NULL,
        issued_at TEXT NOT NULL, expires_at TEXT NOT NULL,
        consumed_at TEXT, status TEXT NOT NULL CHECK(status IN ('pending','consumed','revoked'))
      );
      CREATE INDEX IF NOT EXISTS domain_challenges_scope ON domain_challenges(tenant_id, hostname, status);
      CREATE TABLE IF NOT EXISTS domain_grants (
        hostname TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, actor_id TEXT NOT NULL,
        verified_at TEXT NOT NULL, expires_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('verified','revoked'))
      );
      CREATE TABLE IF NOT EXISTS domain_verification_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        occurred_at TEXT NOT NULL, tenant_id TEXT NOT NULL, actor_id TEXT NOT NULL,
        hostname TEXT NOT NULL, action TEXT NOT NULL, challenge_id TEXT
      );
    `);
  }

  close(): void { this.db.close(); }

  private event(tenantId: string, actorId: string, hostname: string, action: string, challengeId: string | null, now: Date): void {
    this.db.prepare(`INSERT INTO domain_verification_events
      (occurred_at,tenant_id,actor_id,hostname,action,challenge_id) VALUES (?,?,?,?,?,?)`)
      .run(now.toISOString(), tenantId, actorId, hostname, action, challengeId);
  }

  issue(tenantId: string, actorId: string, hostname: string, method: VerificationMethod, now = new Date()): PendingChallenge {
    assertIdentity(tenantId, actorId);
    canonicalVerifiedHostname(hostname);
    const challenge = issueDomainChallenge(hostname, method, now);
    const result = { ...challenge, id: randomUUID() };
    this.db.transaction(() => {
      const owner = this.db.prepare("SELECT tenant_id FROM domain_grants WHERE hostname = ?")
        .get(hostname) as { tenant_id: string } | undefined;
      if (owner && owner.tenant_id !== tenantId) throw new Error("Domain belongs to another tenant; manual transfer required");
      // Supersede outstanding challenges for the same tenant/host to prevent old proofs from regranting.
      this.db.prepare("UPDATE domain_challenges SET status = 'revoked' WHERE tenant_id = ? AND hostname = ? AND status = 'pending'")
        .run(tenantId, hostname);
      this.db.prepare(`INSERT INTO domain_challenges
        (id,tenant_id,actor_id,hostname,method,token_hash,issued_at,expires_at,consumed_at,status)
        VALUES (?,?,?,?,?,?,?,?,NULL,'pending')`)
        .run(result.id, tenantId, actorId, hostname, method, hashToken(result.token), result.issuedAt, result.expiresAt);
      this.event(tenantId, actorId, hostname, "challenge_issued", result.id, now);
    }).immediate();
    return result;
  }

  /** Fetches the externally published proof, then atomically consumes the challenge. */
  async verify(
    tenantId: string, actorId: string, supplied: PendingChallenge,
    transport: VerificationTransport, now = new Date(),
  ): Promise<VerifiedDomainGrant> {
    assertIdentity(tenantId, actorId);
    const row = this.db.prepare("SELECT * FROM domain_challenges WHERE id = ? AND tenant_id = ?")
      .get(supplied.id, tenantId) as ChallengeRow | undefined;
    if (!row || row.status !== "pending" || row.consumed_at || row.actor_id !== actorId ||
        row.hostname !== supplied.hostname || row.method !== supplied.method ||
        row.issued_at !== supplied.issuedAt || row.expires_at !== supplied.expiresAt ||
        row.token_hash !== hashToken(supplied.token)) {
      throw new Error("Unknown, superseded or consumed verification challenge");
    }
    const grant = await evaluateDomainChallenge(supplied, transport, now);
    this.db.transaction(() => {
      const changed = this.db.prepare(`UPDATE domain_challenges SET status = 'consumed', consumed_at = ?
        WHERE id = ? AND tenant_id = ? AND actor_id = ? AND status = 'pending' AND consumed_at IS NULL`)
        .run(now.toISOString(), supplied.id, tenantId, actorId);
      if (changed.changes !== 1) throw new Error("Verification challenge already consumed");
      const existing = this.db.prepare("SELECT tenant_id FROM domain_grants WHERE hostname = ?")
        .get(supplied.hostname) as { tenant_id: string } | undefined;
      if (existing && existing.tenant_id !== tenantId) throw new Error("Domain belongs to another tenant");
      this.db.prepare(`INSERT INTO domain_grants (hostname,tenant_id,actor_id,verified_at,expires_at,status)
        VALUES (?,?,?,?,?,'verified') ON CONFLICT(hostname) DO UPDATE SET
        actor_id=excluded.actor_id,verified_at=excluded.verified_at,
        expires_at=excluded.expires_at,status='verified'`)
        .run(grant.hostname, tenantId, actorId, grant.verifiedAt, grant.expiresAt);
      this.event(tenantId, actorId, grant.hostname, "verified", supplied.id, now);
    }).immediate();
    return grant;
  }

  /** Fail closed: a tenant cannot read another tenant's grant or an expired one. */
  activeGrant(tenantId: string, hostname: string, now = new Date()): VerifiedDomainGrant | undefined {
    canonicalVerifiedHostname(hostname);
    const row = this.db.prepare("SELECT * FROM domain_grants WHERE hostname = ? AND tenant_id = ?")
      .get(hostname, tenantId) as GrantRow | undefined;
    if (!row || row.status !== "verified" || Date.parse(row.expires_at) <= now.getTime()) return undefined;
    return { hostname, status: "verified", verifiedAt: row.verified_at, expiresAt: row.expires_at };
  }

  revoke(tenantId: string, actorId: string, hostname: string, now = new Date()): void {
    assertIdentity(tenantId, actorId);
    canonicalVerifiedHostname(hostname);
    this.db.transaction(() => {
      this.db.prepare("UPDATE domain_grants SET status = 'revoked' WHERE tenant_id = ? AND hostname = ?")
        .run(tenantId, hostname);
      this.db.prepare("UPDATE domain_challenges SET status = 'revoked' WHERE tenant_id = ? AND hostname = ? AND status = 'pending'")
        .run(tenantId, hostname);
      this.event(tenantId, actorId, hostname, "revoked", null, now);
    }).immediate();
  }

  auditEvents(tenantId: string, hostname: string): Array<{ occurred_at: string; action: string; actor_id: string }> {
    canonicalVerifiedHostname(hostname);
    return this.db.prepare(`SELECT occurred_at,action,actor_id FROM domain_verification_events
      WHERE tenant_id = ? AND hostname = ? ORDER BY id`).all(tenantId, hostname) as Array<{ occurred_at: string; action: string; actor_id: string }>;
  }
}
