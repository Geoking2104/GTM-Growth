import type { Express } from "express";
import { timingSafeEqual } from "node:crypto";
import { AuditError, type AuditStore } from "./store.js";
import { compareAuditSnapshots } from "./comparison.js";
import { auditRegistry, auditJobs, auditHttp } from "./metrics.js";
export function auditResponse(job: { id: string; status: string; attempts: number; created_at: string; expires_at: string; result: unknown; error_code: string | null }) {
  return { id: job.id, status: job.status, attempts: job.attempts, createdAt: Number(job.created_at), expiresAt: Number(job.expires_at),
    ...(job.status === "completed" ? { result: job.result } : {}), ...(job.status === "failed" ? { error: job.error_code } : {}) };
}
export function mountAuditRoutes(app: Express, runtime: { store: AuditStore; ready(): Promise<void> } | null) {
  app.use((req, res, next) => {
    const route = req.path === "/api/free-read" ? "free_read" : /^\/api\/audits\/[^/]+$/.test(req.path) ? "audit_status" : req.path.startsWith("/api/report-access/") ? "report_access" : null;
    if (route) {
      const end = auditHttp.startTimer({ route });
      res.once("finish", () => end({ status: String(res.statusCode) }));
    }
    next();
  });
  app.get("/api/health/liveness", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/health/readiness", async (_req, res) => {
    try { await runtime?.ready(); res.json({ status: "ok", auditJobs: Boolean(runtime) }); }
    catch { res.status(503).json({ status: "unavailable" }); }
  });
  app.get("/api/audits/:id", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    if (!runtime) return res.status(503).json({ error: "audit_jobs_disabled" });
    try {
      const job = await runtime.store.authorised(req.params.id, req.get("Authorization")?.replace(/^Bearer /, ""));
      const response = auditResponse(job);
      if (job.status !== "completed" || !job.result) return res.json(response);
      // Pair only this requestor's own earlier snapshot of the same URL; compareAuditSnapshots re-checks method and scope.
      const previous = await runtime.store.previousCompleted(job.owner_digest, job.url, job.id, job.created_at);
      return res.json({ ...response, comparison: compareAuditSnapshots(previous?.result, job.result) });
    }
    catch (e) { return res.status(e instanceof AuditError ? e.status : 503).json({ error: e instanceof AuditError ? e.code : "audit_unavailable" }); }
  });
  app.get("/api/metrics", async (req, res) => {
    const expected = process.env.METRICS_TOKEN || "", supplied = req.get("Authorization")?.replace(/^Bearer /, "") || "";
    if (!expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return res.status(404).end();
    try {
      if (runtime) {
        auditJobs.reset();
        for (const row of await runtime.store.counts()) auditJobs.set({ status: row.status }, Number(row.count));
      }
      res.set("Content-Type", auditRegistry.contentType).send(await auditRegistry.metrics());
    } catch { res.status(503).end(); }
  });
}
