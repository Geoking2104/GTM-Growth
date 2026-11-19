import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { Pool } from "pg";
import { listAIAccounts, resolveAIAccount, type AICredential } from "../console/ai-connections.js";
import { type Dataset, normalizeImport } from "../console/ai-visibility.js";
import { getDataset, hasVisibilityDatasetCapacity, insertDataset } from "../console/ai-visibility-store.js";
import { listPrompts } from "../console/ops-store.js";
import { TenantStore } from "../tenants/store.js";
import { logger } from "../utils/logger.js";
import type { CloudAccess } from "../billing/access.js";
import { collectScheduledAnswer, isScheduledProvider } from "./provider.js";
import { VisibilityJobStore, type Claim } from "./store.js";

const QUEUE = "visibility-collections";
function accountFor(claim: Claim, authorize: (tenantId: string, consume: boolean) => void): AICredential {
  authorize(claim.tenant_id, false);
  if (!isScheduledProvider(claim.config.provider) || claim.config.accountId === "server") throw new Error("Account unavailable");
  return resolveAIAccount(claim.tenant_id, claim.config.provider, claim.config.accountId);
}

export async function processVisibilityJob(
  store: VisibilityJobStore,
  id: string,
  authorize: (tenantId: string, consume: boolean) => void,
  collect = collectScheduledAnswer,
) {
  const claim = await store.claim(id);
  if (!claim) return;
  // Credentials are resolved again after the durable call marker. A failure before a
  // provider request is a revoked unit, while a lost response remains uncertain.
  try {
    accountFor(claim, authorize);
  } catch {
    await store.finish(claim, "revoked");
    return;
  }
  if (!await store.beforeCall(claim)) {
    await store.finish(claim, "revoked");
    return;
  }
  let credential: AICredential;
  try {
    credential = accountFor(claim, authorize);
    authorize(claim.tenant_id, true);
  } catch {
    await store.finish(claim, "revoked");
    return;
  }
  let result;
  try { result = await collect(claim, credential); }
  catch { result = { state: "uncertain" as const }; }
  await store.finish(claim, result.state, result.answer);
}

export async function startVisibilityJobs(
  cloud?: CloudAccess, options: { isActive?: (tenantId: string) => boolean; collect?: typeof collectScheduledAnswer } = {},
) {
  if (process.env.VISIBILITY_JOBS_ENABLED !== "true") return null;
  if (!process.env.AUDIT_DATABASE_URL || !process.env.AUDIT_REDIS_URL) throw new Error("Scheduled visibility requires the audit PostgreSQL and Redis services");
  const tenantStore = new TenantStore();
  const pool = new Pool({ connectionString: process.env.AUDIT_DATABASE_URL, max: 4, connectionTimeoutMillis: 5000, statement_timeout: 10_000 });
  const redis = new Redis(process.env.AUDIT_REDIS_URL, { maxRetriesPerRequest: null, connectTimeout: 5000 });
  const store = new VisibilityJobStore(pool);
  pool.on("error", () => logger.info("[visibility-jobs] database interrupted"));
  redis.on("error", () => logger.info("[visibility-jobs] queue interrupted"));
  const startupTimer = setTimeout(() => redis.disconnect(), 8000);
  startupTimer.unref();
  try {
    await store.migrate();
    const policy = await redis.config("GET", "maxmemory-policy") as string[];
    if (policy[1] !== "noeviction") throw new Error("Visibility queue Redis requires noeviction");
  } catch (error) {
    redis.disconnect();
    await pool.end();
    throw error;
  } finally { clearTimeout(startupTimer); }

  const authorize = (tenantId: string, consume: boolean) => {
    const active = options.isActive ? options.isActive(tenantId) : tenantStore.get(tenantId)?.status === "active";
    if (!active) throw new Error("Workspace unavailable");
    cloud?.authorize(tenantId, "/scheduler/visibility", { consume });
  };
  const publisher = redis.duplicate({ maxRetriesPerRequest: 1, commandTimeout: 5000 });
  publisher.on("error", () => logger.info("[visibility-jobs] publisher interrupted"));
  const queue = new Queue<{ id: string }>(QUEUE, { connection: publisher });
  const worker = new Worker<{ id: string }>(QUEUE, message => processVisibilityJob(store, message.data.id, authorize, options.collect),
    { connection: redis, concurrency: 2, limiter: { max: 20, duration: 60_000 } });
  queue.on("error", () => logger.info("[visibility-jobs] queue unavailable"));
  worker.on("error", () => logger.info("[visibility-jobs] worker interrupted"));
  worker.on("failed", () => logger.info("[visibility-jobs] unit state will be recovered from PostgreSQL"));

  let active: Promise<void> | undefined, lastPrune = 0;
  async function cycle() {
    for (const schedule of await store.due()) {
      try {
        const panel = getDataset<Dataset>(schedule.tenantId, schedule.panelId);
        let blocked = !panel ? "panel_unavailable" : !hasVisibilityDatasetCapacity(schedule.tenantId) ? "panel_storage_full" : null;
        try {
          authorize(schedule.tenantId, false);
          if (!listAIAccounts(schedule.tenantId, schedule.provider).some((account) => account.kind === "saved" && account.id === schedule.accountId)) blocked = "account_unavailable";
        } catch { blocked = "access_unavailable"; }
        await store.plan(schedule, panel?.brands ?? [], listPrompts(schedule.tenantId), blocked);
      } catch { logger.info("[visibility-jobs] schedule deferred"); }
    }
    await store.recover();
    const ids = await store.dispatchable();
    if (ids.length) {
      try { await queue.addBulk(ids.map((id) => ({ name: "visibility-answer", data: { id }, opts: { jobId: id, removeOnComplete: true, removeOnFail: true } }))); }
      catch { logger.info("[visibility-jobs] dispatch deferred"); }
    }
    for (const run of await store.pendingPublications()) {
      try {
        const dataset = normalizeImport({ brands: run.brands, responses: run.responses }, "collected");
        const stored = insertDataset(run.tenant_id, dataset, `visibility-run:${run.id}`);
        await store.published(run.id, stored.id);
      } catch {
        await store.publicationError(run.id);
      }
    }
    if (Date.now() - lastPrune > 3_600_000) { await store.prune(); lastPrune = Date.now(); }
  }
  function tick() {
    active ??= cycle().catch(() => logger.info("[visibility-jobs] reconciliation deferred")).finally(() => { active = undefined; });
  }
  const timer = setInterval(tick, 5000);
  timer.unref();
  tick();
  return {
    store,
    async close() {
      clearInterval(timer);
      await active;
      await worker.close();
      await queue.close();
      publisher.disconnect();
      redis.disconnect();
      await pool.end();
    },
  };
}
