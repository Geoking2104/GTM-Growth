import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { Dataset } from "../console/ai-visibility.js";
import type { TrackedPrompt } from "../console/ops-store.js";
import type { ConnectionProvider } from "../console/ai-connections.js";

export type ScheduledProvider = Exclude<ConnectionProvider, "gemini">;
export interface ScheduleInput {
  panelId: string; provider: ScheduledProvider; accountId: string; intervalHours: number;
  maxDailyCalls: number; estimateUsdMicros: number; maxDailyUsdMicros: number;
}
export type Schedule = ScheduleInput & { tenantId: string; version: string; enabled: boolean; nextAt: string };
type Unit = { id: string; run_id: string; payload: Pick<TrackedPrompt, "prompt" | "locale">; lease: string };
export type Claim = Unit & { tenant_id: string; config: Schedule; brands: Dataset["brands"] };
export type Outcome = "succeeded" | "failed" | "rate_limited" | "uncertain" | "revoked" | "expired";
const HOUR = 3_600_000;
const utcDate = (time: number) => new Date(time).toISOString().slice(0, 10);

export class VisibilityJobStore {
  constructor(private pool: Pool) {}

  async migrate() {
    await this.transaction(async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(59471703)");
      await db.query(`
        CREATE TABLE IF NOT EXISTS gtm_visibility_schedules (
          tenant_id text PRIMARY KEY, version uuid NOT NULL, enabled boolean NOT NULL,
          next_at timestamptz NOT NULL, config jsonb NOT NULL
        );
        CREATE TABLE IF NOT EXISTS gtm_visibility_runs (
          id uuid PRIMARY KEY, tenant_id text NOT NULL, slot timestamptz NOT NULL,
          deadline timestamptz NOT NULL, panel_id text NOT NULL, provider text NOT NULL, account_id text NOT NULL,
          config jsonb NOT NULL, brands jsonb NOT NULL, planned integer NOT NULL, reserved_micros bigint NOT NULL,
          decision text, dataset_id uuid, publish_retry_at timestamptz, publish_failed boolean NOT NULL DEFAULT false,
          billed_micros integer,
          UNIQUE (tenant_id, panel_id, slot, provider, account_id)
        );
        CREATE TABLE IF NOT EXISTS gtm_visibility_units (
          id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES gtm_visibility_runs(id) ON DELETE CASCADE,
          prompt_id text NOT NULL, payload jsonb NOT NULL, state text NOT NULL DEFAULT 'pending',
          lease uuid, lease_until timestamptz, result jsonb, UNIQUE (run_id, prompt_id)
        );
        CREATE INDEX IF NOT EXISTS gtm_visibility_pending ON gtm_visibility_units(state, lease_until, id);
        CREATE INDEX IF NOT EXISTS gtm_visibility_runs_history ON gtm_visibility_runs(tenant_id, slot DESC, id);
        CREATE TABLE IF NOT EXISTS gtm_visibility_daily (
          tenant_id text NOT NULL, day date NOT NULL, calls integer NOT NULL, micros bigint NOT NULL,
          PRIMARY KEY (tenant_id, day)
        );
      `);
    });
  }

  private async transaction<T>(operation: (db: PoolClient) => Promise<T>) {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      const result = await operation(db);
      await db.query("COMMIT");
      return result;
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally { db.release(); }
  }

  async save(tenantId: string, input: ScheduleInput, now = new Date()) {
    const version = randomUUID();
    const nextAt = new Date(Math.floor(now.getTime() / HOUR) * HOUR);
    await this.pool.query(`INSERT INTO gtm_visibility_schedules VALUES ($1,$2,true,$3,$4)
      ON CONFLICT (tenant_id) DO UPDATE SET version=EXCLUDED.version,enabled=true,next_at=EXCLUDED.next_at,config=EXCLUDED.config
      WHERE NOT gtm_visibility_schedules.enabled OR gtm_visibility_schedules.config IS DISTINCT FROM EXCLUDED.config`,
      [tenantId, version, nextAt, input]);
  }

  async pause(tenantId: string) {
    await this.pool.query("UPDATE gtm_visibility_schedules SET enabled=false WHERE tenant_id=$1", [tenantId]);
  }

  async schedule(tenantId: string): Promise<Schedule | null> {
    const { rows } = await this.pool.query(
      "SELECT tenant_id,version,enabled,next_at,config FROM gtm_visibility_schedules WHERE tenant_id=$1", [tenantId]);
    return rows[0] ? this.readSchedule(rows[0]) : null;
  }

  private readSchedule(row: { tenant_id: string; version: string; enabled: boolean; next_at: Date; config: ScheduleInput }): Schedule {
    return { ...row.config, tenantId: row.tenant_id, version: row.version, enabled: row.enabled, nextAt: row.next_at.toISOString() };
  }

  async due(now = new Date()): Promise<Schedule[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM gtm_visibility_schedules WHERE enabled AND next_at <= $1 ORDER BY next_at,tenant_id LIMIT 25", [now]);
    return rows.map((row) => this.readSchedule(row));
  }

  async plan(schedule: Schedule, brands: Dataset["brands"], prompts: TrackedPrompt[], blocked: string | null, now = new Date()) {
    return this.transaction(async (db) => {
      const locked = await db.query("SELECT * FROM gtm_visibility_schedules WHERE tenant_id=$1 FOR UPDATE", [schedule.tenantId]);
      if (!locked.rows[0]) return;
      const current = this.readSchedule(locked.rows[0]);
      if (!current.enabled || current.version !== schedule.version || current.nextAt !== schedule.nextAt || now.getTime() < Date.parse(current.nextAt)) return;
      const interval = current.intervalHours * HOUR;
      const due = Date.parse(current.nextAt);
      const start = due + Math.floor((now.getTime() - due) / interval) * interval;
      await db.query("UPDATE gtm_visibility_schedules SET next_at=$2 WHERE tenant_id=$1", [current.tenantId, new Date(start + interval)]);

      const day = utcDate(now.getTime());
      const deadline = new Date(Date.parse(`${day}T00:00:00Z`) + 24 * HOUR);
      const usage = await db.query("SELECT calls,micros FROM gtm_visibility_daily WHERE tenant_id=$1 AND day=$2", [current.tenantId, day]);
      const used = usage.rows[0] ?? { calls: 0, micros: 0 };
      const estimate = prompts.length * current.estimateUsdMicros;
      const decision = blocked ?? (!prompts.length ? "no_prompts"
        : used.calls + prompts.length > current.maxDailyCalls ? "quota_calls"
        : Number(used.micros) + estimate > current.maxDailyUsdMicros ? "quota_cost" : null);
      const id = randomUUID();
      const created = await db.query(`INSERT INTO gtm_visibility_runs
        (id,tenant_id,slot,deadline,panel_id,provider,account_id,config,brands,planned,reserved_micros,decision)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (tenant_id, panel_id, slot, provider, account_id) DO NOTHING RETURNING id`,
        [id, current.tenantId, new Date(start), deadline, current.panelId, current.provider, current.accountId, current,
          JSON.stringify(brands), prompts.length, decision ? 0 : estimate, decision]);
      if (!created.rowCount || decision) return;
      await db.query(`INSERT INTO gtm_visibility_daily VALUES ($1,$2,$3,$4)
        ON CONFLICT (tenant_id,day) DO UPDATE SET calls=gtm_visibility_daily.calls + EXCLUDED.calls,micros=gtm_visibility_daily.micros + EXCLUDED.micros`,
        [current.tenantId, day, prompts.length, estimate]);
      await db.query(`INSERT INTO gtm_visibility_units (id,run_id,prompt_id,payload)
        SELECT item.id,$1,item.prompt_id,item.payload
        FROM jsonb_to_recordset($2::jsonb) AS item(id uuid,prompt_id text,payload jsonb)`,
        [id, JSON.stringify(prompts.map(({ id: prompt_id, prompt, locale }) => ({ id: randomUUID(), prompt_id, payload: { prompt, locale } })))]);
    });
  }

  async recover() {
    await this.pool.query(`UPDATE gtm_visibility_units u SET
        state=CASE WHEN u.state='calling' THEN 'uncertain' WHEN NOT s.enabled OR s.version::text <> r.config->>'version' THEN 'revoked'
          WHEN r.deadline <= now() THEN 'expired' ELSE 'pending' END,
        lease=NULL,lease_until=NULL
      FROM gtm_visibility_runs r JOIN gtm_visibility_schedules s ON s.tenant_id=r.tenant_id WHERE u.run_id=r.id AND
        ((u.state IN ('leased','calling') AND u.lease_until <= now())
          OR (u.state IN ('pending','leased') AND (NOT s.enabled OR s.version::text <> r.config->>'version'))
          OR (u.state='pending' AND r.deadline <= now()))`);
  }

  async dispatchable(): Promise<string[]> {
    const { rows } = await this.pool.query(`SELECT u.id FROM gtm_visibility_units u JOIN gtm_visibility_runs r ON r.id=u.run_id
      WHERE u.state='pending' AND r.deadline > now() ORDER BY r.slot,u.id LIMIT 250`);
    return rows.map((row) => row.id);
  }

  async claim(id: string, leaseMs = 90_000): Promise<Claim | null> {
    const { rows } = await this.pool.query(`UPDATE gtm_visibility_units u SET state='leased',lease=$2,lease_until=now()+($3::int * interval '1 millisecond')
      FROM gtm_visibility_runs r WHERE u.id=$1 AND r.id=u.run_id AND u.state='pending' AND r.deadline > now()
      RETURNING u.id,u.run_id,u.payload,u.lease,r.tenant_id,r.config,r.brands`, [id, randomUUID(), leaseMs]);
    return rows[0] ?? null;
  }

  async beforeCall(claim: Claim) {
    return this.transaction(async (db) => {
      const schedule = await db.query("SELECT enabled,version FROM gtm_visibility_schedules WHERE tenant_id=$1 FOR UPDATE", [claim.tenant_id]);
      if (!schedule.rows[0]?.enabled || schedule.rows[0].version !== claim.config.version) return false;
      const result = await db.query(`UPDATE gtm_visibility_units u SET state='calling'
        FROM gtm_visibility_runs r WHERE u.id=$1 AND u.run_id=r.id AND u.lease=$2 AND u.state='leased'
        AND u.lease_until > clock_timestamp() AND r.deadline > clock_timestamp()`, [claim.id, claim.lease]);
      return result.rowCount === 1;
    });
  }

  async finish(claim: Claim, state: Outcome, result?: unknown) {
    const updated = await this.pool.query(`UPDATE gtm_visibility_units SET state=$3, result=$4, lease=NULL,lease_until=NULL
      WHERE id=$1 AND lease=$2 AND lease_until > now()
      AND (state='calling' OR (state='leased' AND $3 IN ('revoked','expired')))`,
      [claim.id, claim.lease, state, result === undefined ? null : JSON.stringify(result)]);
    return updated.rowCount === 1;
  }

  async pendingPublications(): Promise<Array<{ id: string; tenant_id: string; brands: Dataset["brands"]; responses: unknown[] }>> {
    const { rows } = await this.pool.query(`SELECT r.id,r.tenant_id,r.brands,
      (SELECT jsonb_agg(u.result ORDER BY u.prompt_id) FROM gtm_visibility_units u WHERE u.run_id=r.id AND u.state='succeeded') AS responses
      FROM gtm_visibility_runs r WHERE dataset_id IS NULL AND (publish_retry_at IS NULL OR publish_retry_at <= now())
      AND EXISTS (SELECT 1 FROM gtm_visibility_units u WHERE u.run_id=r.id AND u.state='succeeded')
      AND NOT EXISTS (SELECT 1 FROM gtm_visibility_units u WHERE u.run_id=r.id AND u.state IN ('pending','leased','calling'))
      ORDER BY r.slot LIMIT 10`);
    return rows;
  }

  async published(id: string, datasetId: string) {
    await this.pool.query("UPDATE gtm_visibility_runs SET dataset_id=$2,publish_failed=false WHERE id=$1 AND dataset_id IS NULL", [id, datasetId]);
  }

  async publicationError(id: string) {
    await this.pool.query("UPDATE gtm_visibility_runs SET publish_failed=true,publish_retry_at=now()+interval '1 minute' WHERE id=$1 AND dataset_id IS NULL", [id]);
  }

  async history(tenantId: string) {
    const { rows } = await this.pool.query(`SELECT r.id,r.slot,r.panel_id,r.provider,r.planned,r.reserved_micros::int,r.decision,r.billed_micros,
        r.dataset_id,r.publish_failed,
        (SELECT jsonb_object_agg(counts.state,counts.quantity) FROM
          (SELECT state,count(*)::int AS quantity FROM gtm_visibility_units WHERE run_id=r.id GROUP BY state) counts) AS counts
      FROM gtm_visibility_runs r WHERE r.tenant_id=$1 ORDER BY r.slot DESC,r.id LIMIT 20`, [tenantId]);
    return rows;
  }

  async recordBilledCost(tenantId: string, id: string, micros: number) {
    const updated = await this.pool.query(`UPDATE gtm_visibility_runs r SET billed_micros=$3
      WHERE r.tenant_id=$1 AND r.id=$2 AND r.decision IS NULL
      AND NOT EXISTS (SELECT 1 FROM gtm_visibility_units u WHERE u.run_id=r.id AND u.state IN ('pending','leased','calling'))`,
      [tenantId, id, micros]);
    return updated.rowCount === 1;
  }

  async prune() {
    await this.pool.query("DELETE FROM gtm_visibility_runs WHERE deadline < now()-interval '30 days'");
    await this.pool.query("DELETE FROM gtm_visibility_daily WHERE day < (now() AT TIME ZONE 'UTC')::date-30");
  }
}
