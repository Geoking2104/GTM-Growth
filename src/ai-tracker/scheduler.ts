/** Native AI tracker — standalone worker entry: one pass per day at the fixed hour.
 * Run with: pnpm ai-tracker:worker (single process, sequential queue per engine). */
import { runDailyQueue } from "./worker.js";
import { engineHealthCheck } from "./worker.js";
import { listEngineStates } from "./store.js";
import { trackerConfig, trackerEnabled } from "./config.js";
import { logger } from "../utils/logger.js";

async function pass() {
  const config = trackerConfig();
  if (!trackerEnabled()) { logger.info("[ai-tracker] AI_TRACKER_ENABLED is false: worker idle"); return; }
  const now = new Date();
  logger.info(`[ai-tracker] daily pass started at ${now.toISOString()}`);
  // The worker is tenant-agnostic: the tenant id comes from the environment.
  // In the single-tenant VPS deployment the tenant id comes from the environment.
  const tenantId = process.env.AI_TRACKER_TENANT_ID ?? "";
  if (!tenantId) { logger.warn("[ai-tracker] AI_TRACKER_TENANT_ID is unset: no tenant to process"); return; }
  for (const engine of listEngineStates(tenantId)) {
    const health = await engineHealthCheck(tenantId, engine.engine);
    logger.info(`[ai-tracker] engine ${engine.engine}: ${health}`);
  }
  const results = await runDailyQueue(tenantId);
  const failed = results.filter(r => r.status === "failed").length;
  logger.info(`[ai-tracker] daily pass done: ${results.length} runs, ${failed} failures`);
}

function hourMatches(): boolean {
  const [hour, minute] = trackerConfig().runHour.split(":").map(Number);
  const now = new Date();
  return now.getHours() === hour && now.getMinutes() >= minute && now.getMinutes() < minute + 5;
}

async function main() {
  logger.info(`[ai-tracker] worker up; run hour ${trackerConfig().runHour}`);
  let lastRunDate = "";
  for (;;) {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== lastRunDate && hourMatches()) {
      lastRunDate = today;
      try { await pass(); } catch (error) { logger.error(`[ai-tracker] pass failed: ${(error as Error).message}`); }
    }
    await new Promise(resolve => setTimeout(resolve, 60_000));
  }
}

main().catch(error => { logger.error(`[ai-tracker] worker crashed: ${(error as Error).message}`); process.exit(1); });
