import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomBytes } from "node:crypto";
import express from "express";
import { AuditStore } from "../src/audit-jobs/store.js";
import { mountAuditRoutes } from "../src/audit-jobs/routes.js";
import { runFreeRead } from "../src/freeread/index.js";
import { startAuditRuntime } from "../src/audit-jobs/runtime.js";
import { mountPublicApi } from "../src/http/public-api.js";
import { mountReportAccessApi } from "../src/report-access/router.js";
import { ReportAccessService, type ReportInvitation } from "../src/report-access/service.js";
import { Redis } from "ioredis";
const key = () => randomBytes(32).toString("base64url");
const secret = "test-audit-secret-at-least-32-characters";
const dbUrl = process.env.TEST_AUDIT_DATABASE_URL;
const redisUrl = process.env.TEST_AUDIT_REDIS_URL;
const stores: AuditStore[] = [];
let time = Date.now();
const open = () => { const s = new AuditStore(new Pool({ connectionString: dbUrl, max: 5 }), secret, () => time); stores.push(s); return s; };
afterEach(async () => { await Promise.all(stores.splice(0).map(s => s.close())); vi.unstubAllEnvs(); });
describe.skipIf(!dbUrl)("PostgreSQL audit admission and recovery", () => {
  beforeEach(async () => { time = Date.now(); const s = open(); await s.migrate(); await s.pool.query("TRUNCATE gtm_audit_jobs"); });
  it("coalesces concurrent admissions from independent connections and rejects changed inputs", async () => {
    const first = open(), other = open(), token = key();
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? first : other).submit("https://example.com/Case", token, "one-ip")));
    expect(new Set(results.map(r => r.id)).size).toBe(1);
    await expect(other.submit("https://example.com/case", token, "one-ip")).rejects.toMatchObject({ status: 409 });
    await expect(other.authorised(results[0].id, key())).rejects.toMatchObject({ status: 404 });
    expect((await other.authorised(results[0].id, token)).status).toBe("pending");
  });
  it("reserves the final quota slot once, before workers perform any calls", async () => {
    const first = open(), other = open();
    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => (i % 2 ? first : other).submit("https://example.com/", key(), "same-ip")));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(8);
    expect(results.filter(r => r.status === "rejected").every(r => (r as PromiseRejectedResult).reason.status === 429)).toBe(true);
  });
  it("recovers the outbox after reopening and fences obsolete execution results", async () => {
    const token = key(), first = open();
    const requested = await first.submit("https://example.com/", token, "restart-ip");
    const reopened = open();
    expect((await reopened.dispatchable()).map(j => j.id)).toContain(requested.id);
    await reopened.queued(requested.id);
    const stale = (await reopened.begin(requested.id))!;
    const current = (await reopened.begin(requested.id))!;
    const report = await runFreeRead({ url: requested.url, fetcher: async url => ({ url, status: 200, ok: true, headers: {}, body: "<html><title>Real fixture</title><h1>Test</h1></html>" }) });
    expect(await first.complete(stale, report)).toBe(false);
    expect(await reopened.complete(current, report)).toBe(true);
    expect((await first.authorised(requested.id, token)).result?.report360).toEqual(report.report360);
    expect(await first.begin(requested.id)).toBeNull();
    time += 86400_001;
    await expect(first.authorised(requested.id, token)).rejects.toMatchObject({ status: 404 });
  });
  it("protects results and monitoring, and reports dependency failures separately from liveness", async () => {
    const app = express(), store = open(), token = key();
    const job = await store.submit("https://example.com/", token, "route-ip");
    vi.stubEnv("METRICS_TOKEN", "test-metrics-token");
    mountAuditRoutes(app, { store, ready: async () => { throw new Error("private database details"); } });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(done => server.once("listening", done));
    const port = (server.address() as { port: number }).port, base = `http://127.0.0.1:${port}`;
    try {
      expect((await fetch(`${base}/api/audits/${job.id}`)).status).toBe(404);
      const result = await fetch(`${base}/api/audits/${job.id}`, { headers: { Authorization: `Bearer ${token}` } });
      expect(result.headers.get("cache-control")).toContain("no-store");
      expect(await result.json()).toMatchObject({ id: job.id, status: "pending" });
      expect((await fetch(`${base}/api/health/liveness`)).status).toBe(200);
      expect((await fetch(`${base}/api/health/readiness`)).status).toBe(503);
      expect((await fetch(`${base}/api/metrics`)).status).toBe(404);
      const metrics = await fetch(`${base}/api/metrics`, { headers: { Authorization: "Bearer test-metrics-token" } });
      const text = await metrics.text(); expect(metrics.status).toBe(200); expect(text).toContain("gtm_growth_audit_jobs");
      expect(text).not.toContain("example.com"); expect(text).not.toContain("campaign_id"); expect(text).not.toContain(token);
    } finally { await new Promise<void>(done => server.close(() => done())); }
  });
  it.skipIf(!redisUrl)("drains an admission created before Redis dispatch and retries one read without duplicate completion", async () => {
    vi.stubEnv("AUDIT_JOBS_ENABLED", "true"); vi.stubEnv("AUDIT_DATABASE_URL", dbUrl!);
    vi.stubEnv("AUDIT_REDIS_URL", redisUrl!); vi.stubEnv("AUDIT_JOBS_SECRET", secret);
    const store = open(), token = key(), job = await store.submit("https://example.com/queue-test", token, "worker-ip");
    const fixture = await runFreeRead({ url: job.url, fetcher: async url => ({ url, status: 200, ok: true, headers: {}, body: "<html><title>Queue fixture</title></html>" }) });
    const reader = vi.fn().mockRejectedValueOnce(new Error("temporary disconnect")).mockResolvedValue(fixture);
    const runtime = await startAuditRuntime({ worker: true, reader });
    try {
      const deadline = Date.now() + 25_000;
      let result = await store.authorised(job.id, token);
      while (result.status !== "completed" && Date.now() < deadline) {
        await new Promise(done => setTimeout(done, 100)); result = await store.authorised(job.id, token);
      }
      expect(result.status).toBe("completed"); expect(result.attempts).toBe(2); expect(reader).toHaveBeenCalledTimes(2);
      expect(result.result?.report360).toEqual(fixture.report360);
      const duplicate = await store.submit(job.url, token, "worker-ip"); expect(duplicate.id).toBe(job.id);
    } finally { await runtime?.close(); }
  }, 30_000);
  it.skipIf(!redisUrl)("serves the exact queued snapshot through email verification and both exports without rescanning", async () => {
    vi.stubEnv("AUDIT_JOBS_ENABLED", "true"); vi.stubEnv("AUDIT_DATABASE_URL", dbUrl!);
    vi.stubEnv("AUDIT_REDIS_URL", redisUrl!); vi.stubEnv("AUDIT_JOBS_SECRET", secret);
    const fixture = await runFreeRead({ url: "https://example.com/Original", fetcher: async url => ({ url, status: 200, ok: true, headers: {}, body: "<html><title>Original snapshot</title><h1>Original</h1></html>" }) });
    const read = vi.fn().mockResolvedValue(fixture);
    const runtime = (await startAuditRuntime({ worker: true, reader: read }))!;
    const service = new ReportAccessService({ dbPath: ":memory:", secret });
    let sent: ReportInvitation | undefined;
    const legacyRead = vi.fn().mockRejectedValue(new Error("Must not rescan"));
    const check = async (url: unknown) => ({ ok: true, url: String(url) });
    const app = express(); app.use(express.json());
    mountAuditRoutes(app, runtime); mountPublicApi(app, { audits: runtime.store, validateTarget: check });
    mountReportAccessApi(app, { service, audits: runtime.store, send: async data => { sent = data; }, reader: legacyRead, validateUrl: check, publicOrigin: "http://localhost" });
    const server = app.listen(0, "127.0.0.1"); await new Promise<void>(done => server.once("listening", done));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`, token = key();
    const submit = () => fetch(`${base}/api/free-read`, { method: "POST", headers: { "Content-Type": "application/json", Prefer: "respond-async", "Idempotency-Key": token }, body: JSON.stringify({ url: fixture.url }) });
    try {
      const [a, b] = await Promise.all([submit(), submit()]);
      expect(a.status).toBe(202); const id = (await a.json()).auditJob.id; expect((await b.json()).auditJob.id).toBe(id);
      const deadline = Date.now() + 15_000; let job;
      do {
        job = await (await fetch(`${base}/api/audits/${id}`, { headers: { Authorization: `Bearer ${token}` } })).json();
        if (job.status !== "completed") await new Promise(done => setTimeout(done, 100));
      } while (job.status !== "completed" && Date.now() < deadline);
      expect(job.result.report360).toEqual(fixture.report360);
      const invite = await fetch(`${base}/api/report-access/invite`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key() }, body: JSON.stringify({ email: "owner@example.com", language: "en", url: fixture.url, auditId: id, auditToken: token }) });
      expect(invite.status).toBe(201); const invitationId = (await invite.json()).id;
      const verified = await fetch(`${base}/api/report-access/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: invitationId, email: sent!.email, code: sent!.code }) });
      expect(verified.status).toBe(200); const cookie = verified.headers.get("set-cookie")!.split(";")[0];
      const opened = await (await fetch(`${base}/api/report-access/report?id=${invitationId}`, { headers: { Cookie: cookie } })).json();
      expect(opened.report360).toEqual(fixture.report360);
      const md = await fetch(`${base}/api/report-access/download?id=${invitationId}&format=md`, { headers: { Cookie: cookie } });
      const markdown = await md.text();
      expect(markdown).toContain("Original snapshot"); expect(markdown).toContain(fixture.url); expect(markdown).toMatch(/Observed: .+UTC/);
      const pdf = await fetch(`${base}/api/report-access/download?id=${invitationId}&format=pdf`, { headers: { Cookie: cookie } });
      expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
      expect(legacyRead).not.toHaveBeenCalled(); expect(read).toHaveBeenCalledTimes(1);
    } finally { await new Promise<void>(done => server.close(() => done())); service.close(); await runtime.close(); }
  }, 30_000);
  it.skipIf(!redisUrl)("reconstructs queued transport after Redis loss from the PostgreSQL ledger", async () => {
    vi.stubEnv("AUDIT_JOBS_ENABLED", "true"); vi.stubEnv("AUDIT_DATABASE_URL", dbUrl!);
    vi.stubEnv("AUDIT_REDIS_URL", redisUrl!); vi.stubEnv("AUDIT_JOBS_SECRET", secret);
    time -= 70_000;
    const store = open(), token = key(), job = await store.submit("https://example.com/redis-recovery", token, "redis-recovery-ip");
    await store.queued(job.id); time += 70_000;
    const redis = new Redis(redisUrl!); await redis.flushdb(); await redis.quit();
    const fixture = await runFreeRead({ url: job.url, fetcher: async url => ({ url, status: 200, ok: true, headers: {}, body: "<title>Recovered</title>" }) });
    const runtime = await startAuditRuntime({ worker: true, reader: async () => fixture });
    try {
      const deadline = Date.now() + 10_000; let result = await store.authorised(job.id, token);
      while (result.status !== "completed" && Date.now() < deadline) {
        await new Promise(done => setTimeout(done, 100)); result = await store.authorised(job.id, token);
      }
      expect(result.status).toBe("completed"); expect(result.result?.pageSignals.title).toBe("Recovered");
    } finally { await runtime?.close(); }
  }, 15_000);
});
