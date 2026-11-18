import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { Pool } from "pg";
import { runFreeRead } from "../freeread/index.js";
import { fetchPublicPage } from "../http/public-fetch.js";
import { logger } from "../utils/logger.js";
import { AuditStore, AUDIT_ATTEMPTS } from "./store.js";
import { auditAttempts, auditCompleted, auditDuration, auditWait } from "./metrics.js";

const QUEUE = "public-audits";
export async function startAuditRuntime(options: { worker?: boolean; reader?: typeof runFreeRead } = {}) {
  if (process.env.AUDIT_JOBS_ENABLED !== "true") return null;
  if (!process.env.AUDIT_DATABASE_URL || !process.env.AUDIT_REDIS_URL) throw new Error("Audit database and dedicated queue Redis must be configured");
  const pool = new Pool({ connectionString: process.env.AUDIT_DATABASE_URL, max: options.worker ? 3 : 5, connectionTimeoutMillis: 5000, statement_timeout: 10_000 });
  pool.on("error", () => logger.info("[audit] database connection interrupted"));
  const store = new AuditStore(pool, process.env.AUDIT_JOBS_SECRET || "");
  await store.migrate();
  const redis = new Redis(process.env.AUDIT_REDIS_URL, { maxRetriesPerRequest: null, connectTimeout: 5000 });
  redis.on("error", () => logger.info("[audit] queue connection interrupted"));
  await redis.ping();
  const policy = await redis.config("GET", "maxmemory-policy") as string[];
  if (policy[1] !== "noeviction") { redis.disconnect(); await store.close(); throw new Error("Audit queue Redis requires noeviction"); }
  const queue = new Queue(QUEUE, { connection: redis });
  queue.on("error", () => logger.info("[audit] queue unavailable"));
  let dispatching = false;
  const dispatch = async () => {
    if (dispatching) return;
    dispatching = true;
    try {
      for (const job of await store.dispatchable()) {
        const previous = await queue.getJob(job.id);
        if (previous && await previous.getState() === "failed") await previous.retry();
        await queue.add("public-read", { id: job.id }, {
          jobId: job.id, attempts: AUDIT_ATTEMPTS, backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: { age: 2 * 24 * 3600 }, removeOnFail: { age: 2 * 24 * 3600 },
        });
        await store.queued(job.id);
      }
    } catch { logger.info("[audit] dispatch deferred; requests remain in the database"); }
    finally { dispatching = false; }
  };
  const worker = options.worker ? new Worker(QUEUE, async message => {
    const job = await store.begin(message.data.id);
    if (!job) return;
    const started = Date.now();
    if (job.attempts === 1) auditWait.observe(Math.max(0, (started - Number(job.created_at)) / 1000));
    try {
      const result = await (options.reader ?? runFreeRead)({ url: job.url, timeoutMs: 8000, fetcher: fetchPublicPage });
      if (result.httpStatus < 200 || result.httpStatus >= 400) throw new Error("audit_unavailable");
      if (await store.complete(job, result)) auditCompleted.inc();
      auditAttempts.inc({ status: "completed" }); auditDuration.observe({ status: "completed" }, (Date.now() - started) / 1000);
    } catch {
      await store.fail(job);
      auditAttempts.inc({ status: "failed" }); auditDuration.observe({ status: "failed" }, (Date.now() - started) / 1000);
      throw new Error("audit_unavailable");
    }
  }, { connection: redis, concurrency: 2, limiter: { max: 20, duration: 60_000 }, maxStalledCount: 2 }) : null;
  worker?.on("error", () => logger.info("[audit] worker connection interrupted"));
  worker?.on("failed", () => logger.info("[audit] read failed; bounded retry policy applies"));
  const timer = setInterval(() => void dispatch(), 5000); timer.unref();
  void dispatch();
  return {
    store,
    async ready() {
      await Promise.all([store.ping(), redis.ping()]);
      if (!options.worker && !(await queue.getWorkers()).length) throw new Error("No audit worker");
    },
    async close() { clearInterval(timer); await worker?.close(); await queue.close(); redis.disconnect(); await store.close(); },
  };
}
