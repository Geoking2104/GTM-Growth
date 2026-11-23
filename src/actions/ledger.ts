/**
 * Operation ledger for the pre-approved action catalog (R11): one append-only
 * journal per operation — proposal (entry rule: catalog validation + proposal
 * TTL), approval bound to the exact terms digest (exit rule: approval TTL),
 * atomic execution claim (duplicate execution impossible: a replay returns the
 * existing attempt status), terminal outcome, and a reconciliation state for
 * ambiguous provider outcomes that never silently resolves itself. Every
 * transition writes an audit event. SQLite is the authority across processes.
 */
import Database from "better-sqlite3";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { catalogEntry, isCatalogAction, normaliseTerms, termsDigest, ACTION_CATALOG_VERSION } from "./catalog.js";

export type OperationState = "proposed" | "approved" | "executing" | "reconciling" | "succeeded" | "failed" | "cancelled";
export type OperationOrigin = "console" | "pap";

export interface ActionOperation {
  id: string;
  tenantId: string;
  action: string;
  catalogVersion: string;
  terms: Record<string, unknown>;
  termsSha: string;
  revision: number;
  state: OperationState;
  origin: OperationOrigin;
  createdBy: string;
  approvedBy: string | null;
  createdAt: number;
  proposalExpiresAt: number;
  approvalExpiresAt: number | null;
  attempts: number;
}

export interface ActionAttempt {
  id: string;
  operationId: string;
  status: "executing" | "succeeded" | "failed" | "reconciling";
  outcome: "succeeded" | "failed" | "ambiguous" | null;
  detail: string | null;
  result: string | null;
  startedAt: number;
  completedAt: number | null;
}

export interface AuditEvent {
  seq: number;
  tenantId: string;
  operationId: string;
  actor: string;
  event: string;
  detail: string;
  occurredAt: number;
}

const EVENTS_LIMIT = 200;
/** A claim this old without a completion is a dead process, not a live
 * duplicate: it reconciles instead of replaying (exit rule, T22). */
export const EXECUTION_STALE_MS = 15 * 60_000;
const detailOf = (text: unknown): string => String(text ?? "").replace(/\s+/g, " ").slice(0, 300);

export class ActionLedger {
  readonly db: Database.Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = DELETE");
    this.db.pragma("synchronous = FULL");
    this.db.pragma("busy_timeout = 10000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS action_operations (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, action TEXT NOT NULL,
        catalog_version TEXT NOT NULL, terms_json TEXT NOT NULL, terms_sha TEXT NOT NULL,
        revision INTEGER NOT NULL, state TEXT NOT NULL, origin TEXT NOT NULL,
        created_by TEXT NOT NULL, approved_by TEXT,
        created_at INTEGER NOT NULL, proposal_expires_at INTEGER NOT NULL, approval_expires_at INTEGER,
        attempts INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS action_operations_tenant ON action_operations(tenant_id, created_at);
      CREATE TABLE IF NOT EXISTS action_attempts (
        id TEXT PRIMARY KEY, operation_id TEXT NOT NULL, tenant_id TEXT NOT NULL,
        status TEXT NOT NULL, outcome TEXT, detail TEXT, result TEXT,
        started_at INTEGER NOT NULL, completed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS action_attempts_op ON action_attempts(operation_id);
      CREATE TABLE IF NOT EXISTS action_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL,
        operation_id TEXT NOT NULL, actor TEXT NOT NULL, event TEXT NOT NULL,
        detail TEXT NOT NULL, occurred_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS action_events_op ON action_events(operation_id, seq);
    `);
    if (path !== ":memory:") chmodSync(path, 0o600);
  }

  private rowToOperation(row: Record<string, unknown>): ActionOperation {
    return {
      id: row.id as string, tenantId: row.tenant_id as string, action: row.action as string,
      catalogVersion: row.catalog_version as string,
      terms: JSON.parse(row.terms_json as string) as Record<string, unknown>,
      termsSha: row.terms_sha as string, revision: row.revision as number,
      state: row.state as OperationState, origin: row.origin as OperationOrigin,
      createdBy: row.created_by as string, approvedBy: (row.approved_by as string | null) ?? null,
      createdAt: row.created_at as number, proposalExpiresAt: row.proposal_expires_at as number,
      approvalExpiresAt: (row.approval_expires_at as number | null) ?? null,
      attempts: row.attempts as number,
    };
  }

  private event(tenantId: string, operationId: string, actor: string, event: string, detail: unknown, at: number): void {
    this.db.prepare("INSERT INTO action_events (tenant_id, operation_id, actor, event, detail, occurred_at) VALUES (?,?,?,?,?,?)")
      .run(tenantId, operationId, actor, event, detailOf(detail), at);
    // Bound the per-operation trail: the journal keeps the latest events.
    this.db.prepare("DELETE FROM action_events WHERE operation_id=? AND seq NOT IN (SELECT seq FROM action_events WHERE operation_id=? ORDER BY seq DESC LIMIT ?)")
      .run(operationId, operationId, EVENTS_LIMIT);
  }

  get(tenantId: string, operationId: string): ActionOperation {
    const row = this.db.prepare("SELECT * FROM action_operations WHERE tenant_id=? AND id=?").get(tenantId, operationId) as Record<string, unknown> | undefined;
    if (!row) throw new Error("Opération introuvable pour ce client.");
    return this.rowToOperation(row);
  }

  list(tenantId: string, limit: number): ActionOperation[] {
    const rows = this.db.prepare("SELECT * FROM action_operations WHERE tenant_id=? ORDER BY created_at DESC, id DESC LIMIT ?")
      .all(tenantId, Math.max(1, Math.min(limit, 100))) as Record<string, unknown>[];
    return rows.map((row) => this.rowToOperation(row));
  }

  events(tenantId: string, operationId: string, limit: number): AuditEvent[] {
    this.get(tenantId, operationId); // tenant scoping check
    const rows = this.db.prepare("SELECT * FROM action_events WHERE tenant_id=? AND operation_id=? ORDER BY seq DESC LIMIT ?")
      .all(tenantId, operationId, Math.max(1, Math.min(limit, EVENTS_LIMIT))) as Record<string, unknown>[];
    return rows.map((row) => ({ seq: row.seq as number, tenantId: row.tenant_id as string, operationId: row.operation_id as string, actor: row.actor as string, event: row.event as string, detail: row.detail as string, occurredAt: row.occurred_at as number }));
  }

  /** Entry rule: catalog validation, exact-terms digest, proposal expiry. */
  propose(input: { tenantId: string; action: string; terms: unknown; origin: OperationOrigin; actor: string; now: number }): ActionOperation {
    if (!isCatalogAction(input.action)) throw new Error("Action hors catalogue : seule une action du catalogue pré-approuvé peut être proposée (les autres écritures gardent leur confirmation humaine dans le module concerné).");
    const entry = catalogEntry(input.action);
    const terms = normaliseTerms(input.action, input.terms);
    const termsSha = termsDigest(terms);
    const id = randomUUID();
    this.db.prepare(`INSERT INTO action_operations
      (id, tenant_id, action, catalog_version, terms_json, terms_sha, revision, state, origin, created_by, created_at, proposal_expires_at, attempts)
      VALUES (?,?,?,?,?,?,1,'proposed',?,?,?,?,0)`)
      .run(id, input.tenantId, input.action, ACTION_CATALOG_VERSION, JSON.stringify(terms), termsSha, input.origin, input.actor, input.now, input.now + entry.proposalTtlHours * 3600_000);
    this.event(input.tenantId, id, input.actor, "proposed", { action: input.action, origin: input.origin, termsSha }, input.now);
    return this.get(input.tenantId, id);
  }

  /** Exit rule: the approval covers the exact terms digest and expires. */
  approve(input: { tenantId: string; operationId: string; actor: string; now: number; ttlHours?: number }): ActionOperation {
    const row = this.db.prepare("SELECT * FROM action_operations WHERE tenant_id=? AND id=?").get(input.tenantId, input.operationId) as Record<string, unknown> | undefined;
    if (!row) throw new Error("Opération introuvable pour ce client.");
    const state = row.state as OperationState;
    if (state === "cancelled") throw new Error("Opération annulée : proposez une nouvelle opération.");
    if (state !== "proposed" && state !== "approved") throw new Error("Seule une opération proposée peut être approuvée.");
    if ((row.proposal_expires_at as number) <= input.now) throw new Error("Proposition expirée : la gouvernance exige une nouvelle opération avec des termes à jour.");
    const entry = catalogEntry(row.action as string);
    const ttl = Math.max(1, Math.min(Math.trunc(input.ttlHours ?? entry.approvalTtlHours), 168));
    if (state === "approved" && (row.approval_expires_at as number) > input.now) {
      // Re-approval of a live approval just extends the exit clock (same exact terms).
      this.db.prepare("UPDATE action_operations SET approval_expires_at=? WHERE tenant_id=? AND id=?").run(input.now + ttl * 3600_000, input.tenantId, input.operationId);
    } else {
      this.db.prepare("UPDATE action_operations SET state='approved', approved_by=?, approval_expires_at=? WHERE tenant_id=? AND id=?")
        .run(input.actor, input.now + ttl * 3600_000, input.tenantId, input.operationId);
    }
    this.event(input.tenantId, input.operationId, input.actor, "approved", { termsSha: row.terms_sha, ttlHours: ttl, actor: input.actor }, input.now);
    return this.get(input.tenantId, input.operationId);
  }

  cancel(input: { tenantId: string; operationId: string; actor: string; now: number }): ActionOperation {
    const row = this.get(input.tenantId, input.operationId);
    if (row.state !== "proposed" && row.state !== "approved") throw new Error("Seule une opération proposée ou approuvée peut être annulée.");
    this.db.prepare("UPDATE action_operations SET state='cancelled' WHERE tenant_id=? AND id=?").run(input.tenantId, input.operationId);
    this.event(input.tenantId, input.operationId, input.actor, "cancelled", { termsSha: row.termsSha }, input.now);
    return this.get(input.tenantId, input.operationId);
  }

  /** Atomic execution claim. A live duplicate claim replays the attempt; a
   * claim that is stale (a process died between steps, past
   * EXECUTION_STALE_MS) commits a reconciliation transition with its audit
   * event and reports it — an unfinished write is never resumable. */
  claim(input: { tenantId: string; operationId: string; actor: string; now: number }): { kind: "claimed" | "replay" | "stale"; attempt: ActionAttempt | null } {
    const checked = this.db.transaction((): { replay: boolean; stale: boolean; attempt: ActionAttempt } | null => {
      const row = this.db.prepare("SELECT * FROM action_operations WHERE tenant_id=? AND id=?").get(input.tenantId, input.operationId) as Record<string, unknown> | undefined;
      if (!row) throw new Error("Opération introuvable pour ce client.");
      const state = row.state as OperationState;
      const existing = this.db.prepare("SELECT * FROM action_attempts WHERE operation_id=? ORDER BY started_at ASC LIMIT 1").get(input.operationId) as Record<string, unknown> | undefined;
      if (existing) {
        const attempt = this.attemptOf(existing);
        if (state === "reconciling" || attempt.status === "reconciling") throw new Error("Issue ambiguë non réconciliée : la vérification du résultat externe doit être tranchée avant toute nouvelle tentative.");
        const stale = state === "executing" && attempt.status === "executing" && input.now - attempt.startedAt > EXECUTION_STALE_MS;
        return { replay: !stale, stale, attempt };
      }
      if (state !== "approved") throw new Error("Seule une opération approuvée peut être exécutée.");
      if ((row.approval_expires_at as number | null) === null || (row.approval_expires_at as number) <= input.now) throw new Error("Approbation expirée : le délai de gouvernance est écoulé, réapprouvez les termes exacts.");
      const attemptId = randomUUID();
      this.db.prepare("INSERT INTO action_attempts (id, operation_id, tenant_id, status, started_at) VALUES (?,?,?,'executing',?)")
        .run(attemptId, input.operationId, input.tenantId, input.now);
      this.db.prepare("UPDATE action_operations SET state='executing', attempts=attempts+1 WHERE tenant_id=? AND id=?").run(input.tenantId, input.operationId);
      this.event(input.tenantId, input.operationId, input.actor, "claimed", { attemptId, termsSha: row.terms_sha }, input.now);
      return null;
    }).immediate() as { replay: boolean; stale: boolean; attempt: ActionAttempt } | null;
    if (!checked) {
      const attemptRow = this.db.prepare("SELECT * FROM action_attempts WHERE operation_id=? ORDER BY started_at ASC LIMIT 1").get(input.operationId) as Record<string, unknown>;
      return { kind: "claimed", attempt: this.attemptOf(attemptRow) };
    }
    if (checked.stale) {
      // Committed reconciliation: the stale claim stays ambiguous until verified.
      this.db.transaction(() => {
        this.db.prepare("UPDATE action_attempts SET status='reconciling', outcome='ambiguous', detail=? WHERE id=?").run("claim orphelin détecté (processus interrompu pendant l'exécution)", checked.attempt.id);
        this.db.prepare("UPDATE action_operations SET state='reconciling' WHERE tenant_id=? AND id=?").run(input.tenantId, input.operationId);
        this.event(input.tenantId, input.operationId, input.actor, "stale-claim", "exécution interrompue : passage en réconciliation", input.now);
      }).immediate();
      return { kind: "stale", attempt: this.attemptOf(this.db.prepare("SELECT * FROM action_attempts WHERE id=?").get(checked.attempt.id) as Record<string, unknown>) };
    }
    return { kind: "replay", attempt: checked.attempt };
  }

  private attemptOf(row: Record<string, unknown>): ActionAttempt {
    return {
      id: row.id as string, operationId: row.operation_id as string, status: row.status as ActionAttempt["status"],
      outcome: (row.outcome as ActionAttempt["outcome"]) ?? null, detail: (row.detail as string | null) ?? null,
      result: (row.result as string | null) ?? null, startedAt: row.started_at as number,
      completedAt: (row.completed_at as number | null) ?? null,
    };
  }

  /** Terminal transition from a clean run. `ambiguous` keeps the operation
   * reconciling: a provider timeout is never proof of failure (T22). */
  complete(input: { tenantId: string; operationId: string; outcome: "succeeded" | "failed" | "ambiguous"; detail: string; result?: unknown; actor: string; now: number }): { operation: ActionOperation; attempt: ActionAttempt } {
    const row = this.get(input.tenantId, input.operationId);
    if (row.state !== "executing" && row.state !== "reconciling") throw new Error("Seule une opération en cours d'exécution peut être clôturée.");
    const attemptRow = this.db.prepare("SELECT * FROM action_attempts WHERE operation_id=? ORDER BY started_at ASC LIMIT 1").get(input.operationId) as Record<string, unknown> | undefined;
    if (!attemptRow) throw new Error("Aucune tentative d'exécution à clôturer.");
    const attemptId = attemptRow.id as string;
    const resultText = input.result === undefined ? null : detailOf(JSON.stringify(input.result)).slice(0, 1000);
    if (input.outcome === "ambiguous") {
      this.db.prepare("UPDATE action_attempts SET status='reconciling', outcome='ambiguous', detail=?, completed_at=? WHERE id=?").run(detailOf(input.detail), input.now, attemptId);
      this.db.prepare("UPDATE action_operations SET state='reconciling' WHERE tenant_id=? AND id=?").run(input.tenantId, input.operationId);
      this.event(input.tenantId, input.operationId, input.actor, "reconciling", input.detail, input.now);
    } else {
      this.db.prepare("UPDATE action_attempts SET status=?, outcome=?, detail=?, result=?, completed_at=? WHERE id=?")
        .run(input.outcome, input.outcome, detailOf(input.detail), resultText, input.now, attemptId);
      this.db.prepare("UPDATE action_operations SET state=? WHERE tenant_id=? AND id=?").run(input.outcome, input.tenantId, input.operationId);
      this.event(input.tenantId, input.operationId, input.actor, input.outcome, input.detail, input.now);
    }
    return { operation: this.get(input.tenantId, input.operationId), attempt: this.attemptOf(this.db.prepare("SELECT * FROM action_attempts WHERE id=?").get(attemptId) as Record<string, unknown>) };
  }

  /** Exit rule for reconciliation: only a verified external outcome resolves
   * an ambiguous attempt; a bare retry is refused. */
  resolve(input: { tenantId: string; operationId: string; outcome: "succeeded" | "failed"; detail: string; actor: string; now: number }): { operation: ActionOperation; attempt: ActionAttempt } {
    const row = this.get(input.tenantId, input.operationId);
    if (row.state !== "reconciling") throw new Error("Seule une opération non réconciliée peut être tranchée.");
    const attemptRow = this.db.prepare("SELECT * FROM action_attempts WHERE operation_id=? ORDER BY started_at ASC LIMIT 1").get(input.operationId) as Record<string, unknown>;
    this.db.prepare("UPDATE action_attempts SET status=?, outcome=?, detail=?, completed_at=? WHERE id=?")
      .run(input.outcome, input.outcome, `résolution vérifiée : ${detailOf(input.detail)}`, input.now, attemptRow.id as string);
    this.db.prepare("UPDATE action_operations SET state=? WHERE tenant_id=? AND id=?").run(input.outcome, input.tenantId, input.operationId);
    this.event(input.tenantId, input.operationId, input.actor, `resolved:${input.outcome}`, input.detail, input.now);
    return { operation: this.get(input.tenantId, input.operationId), attempt: this.attemptOf(this.db.prepare("SELECT * FROM action_attempts WHERE id=?").get(attemptRow.id as string) as Record<string, unknown>) };
  }

  close(): void { this.db.close(); }
}
