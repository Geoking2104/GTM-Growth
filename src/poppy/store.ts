import Database from "better-sqlite3";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { demand, hash, now, random, type Grant } from "./types.js";
/** SQLite is the authority, including replay protection across processes/restarts. */
export class PapStore {
    readonly db: Database.Database;
    constructor(path: string) {
        if (path !== ":memory:")
            mkdirSync(dirname(path), { recursive: true });
        this.db = new Database(path);
        this.db.pragma("journal_mode = DELETE");
        this.db.pragma("synchronous = FULL");
        this.db.pragma("busy_timeout = 10000");
        this.db.exec(`CREATE TABLE IF NOT EXISTS pap_records (bucket TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(bucket,id));
      CREATE INDEX IF NOT EXISTS pap_expiry ON pap_records(expires);
      CREATE TABLE IF NOT EXISTS pap_audit (id TEXT PRIMARY KEY, at INTEGER NOT NULL, tenant TEXT NOT NULL, grant_id TEXT, action TEXT NOT NULL, outcome TEXT NOT NULL, model TEXT, duration_ms INTEGER);
      CREATE INDEX IF NOT EXISTS pap_audit_time ON pap_audit(at);`);
        if (!(this.db.pragma("table_info(pap_audit)") as {
            name: string;
        }[]).some(c => c.name === "duration_ms"))
            this.db.exec("ALTER TABLE pap_audit ADD COLUMN duration_ms INTEGER");
        if (path !== ":memory:")
            chmodSync(path, 0o600);
    }
    atomic<T>(fn: () => T): T { return this.db.transaction(fn).immediate(); }
    get<T>(bucket: string, id: string): T | undefined {
        const row = this.db.prepare("SELECT value FROM pap_records WHERE bucket=? AND id=? AND expires>?").get(bucket, id, now()) as {
            value: string;
        } | undefined;
        return row ? JSON.parse(row.value) as T : undefined;
    }
    put(bucket: string, id: string, value: unknown, expires: number) { this.db.prepare("INSERT INTO pap_records VALUES(?,?,?,?) ON CONFLICT(bucket,id) DO UPDATE SET value=excluded.value, expires=excluded.expires").run(bucket, id, JSON.stringify(value), expires); }
    remove(bucket: string, id: string) { this.db.prepare("DELETE FROM pap_records WHERE bucket=? AND id=?").run(bucket, id); }
    all<T>(bucket: string): T[] { return (this.db.prepare("SELECT value FROM pap_records WHERE bucket=? AND expires>?").all(bucket, now()) as {
        value: string;
    }[]).map(r => JSON.parse(r.value) as T); }
    replay(bucket: string, id: string, expires: number) {
        return this.atomic(() => { if (this.get(bucket, hash(id)))
            return false; this.put(bucket, hash(id), true, expires); return true; });
    }
    grant(id: string) { return this.get<Grant>("grant", id); }
    saveGrant(g: Grant) { this.put("grant", g.id, g, g.expires + 90 * 86400); }
    active(id: string) { const g = this.grant(id); demand(g && !g.revoked && g.expires > now(), "invalid_token", 401); return g; }
    revoke(id: string) { this.atomic(() => { const g = this.grant(id); if (g && !g.revoked) {
        g.revoked = now();
        this.saveGrant(g);
        this.audit(g.tenant, id, "revoke", "ok");
    } }); }
    audit(tenant: string, grant: string | null, action: string, outcome: string, model?: string, requestId = random(), durationMs?: number) {
        this.db.prepare("INSERT OR IGNORE INTO pap_audit (id,at,tenant,grant_id,action,outcome,model,duration_ms) VALUES(?,?,?,?,?,?,?,?)").run(requestId, now(), tenant, grant, action, outcome, model ?? null, durationMs ?? null);
    }
    rate(key: string, limit: number, seconds = 60) {
        const slot = Math.floor(now() / seconds);
        const id = hash(`${key}:${slot}`);
        this.atomic(() => { const hits = this.get<number>("rate", id) ?? 0; demand(hits < limit, "rate_limited", 429); this.put("rate", id, hits + 1, (slot + 1) * seconds); });
    }
    lease(tenant: string): () => void {
        const id = random();
        this.atomic(() => { const list = this.all<{
            tenant: string;
        }>("lease"); demand(list.filter(x => x.tenant === tenant).length < 2, "rate_limited", 429); this.put("lease", id, { tenant }, now() + 300); });
        const heartbeat = setInterval(() => this.put("lease", id, { tenant }, now() + 300), 30000);
        heartbeat.unref();
        return () => { clearInterval(heartbeat); this.remove("lease", id); };
    }
    prune() { this.db.prepare("DELETE FROM pap_records WHERE expires<=?").run(now()); this.db.prepare("DELETE FROM pap_audit WHERE at<?").run(now() - 90 * 86400); }
    close() { this.db.close(); }
}
