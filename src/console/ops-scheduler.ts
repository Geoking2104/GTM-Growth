/** Automation scheduler (T-11): periodic jobs per tenant.
 * Generalizes the competition-surveillance idea: one interval timer per
 * process, iterating tenants with automation enabled, running bounded
 * visibility checks (T-1) and rank checks (T-4) and recording alerts.
 * Designed to be started from the HTTP server; safe to start twice
 * (second start is a no-op). */
import { listPrompts, listRankKeywords, readAutomationConfig, writeAutomationConfig, insertAlert } from "./ops-store.js";
import { runVisibilityCheck, engineStatuses } from "./visibility-runner.js";
import { runRankCheck, supplierFromEnv } from "./rank-tracking.js";
import { TenantStore, type Tenant } from "../tenants/store.js";
import { logger } from "../utils/logger.js";

export interface SchedulerOptions { intervalMinutes?: number; tenantStore?: TenantStore; transport?: typeof fetch; now?: () => Date }
let timer: NodeJS.Timeout | null = null;

export function startScheduler(options: SchedulerOptions = {}): void {
  if (timer) return;
  const intervalMinutes = options.intervalMinutes ?? Math.max(1, Number(process.env.OPS_SCHEDULER_MINUTES) || 15);
  const tick = async () => { try { await runDueJobs(options); } catch (error) { logger.warn(`[ops-scheduler] ${error instanceof Error ? error.message : error}`); } };
  void tick();
  timer = setInterval(() => { void tick(); }, intervalMinutes * 60_000);
  timer.unref?.();
  logger.info(`[ops-scheduler] started (every ${intervalMinutes} min)`);
}

export function stopScheduler(): void { if (timer) { clearInterval(timer); timer = null; } }

/** Brands for visibility checks come from the tenant's latest competition
 * dataset when present; otherwise the check is skipped (nothing to match). */
async function brandsForTenant(tenantId: string): Promise<Array<{ name: string; aliases?: string[] }>> {
  const { listDatasets } = await import("./ai-visibility-store.js");
  const datasets = listDatasets<{ id: string; createdAt: string; brands: Array<{ name: string; aliases: string[] }>; observations: unknown[] }>(tenantId);
  const last = datasets[datasets.length - 1];
  return last?.brands ?? [];
}

/** Run one scheduler pass: for every active tenant with automation enabled,
 * run prompt checks and rank checks that are due. Bounded and sequential. */
export async function runDueJobs(options: SchedulerOptions = {}): Promise<{ tenants: number; jobs: number; details: Array<{ tenant: string; job: string; status: string }> }> {
  const store = options.tenantStore ?? new TenantStore();
  const now = options.now ?? (() => new Date());
  const details: Array<{ tenant: string; job: string; status: string }> = [];
  let jobs = 0;
  for (const tenant of store.list().filter((t) => t.status === "active")) {
    const config = readAutomationConfig(tenant.id);
    // Prompt checks (T-1): due when enabled, prompts exist, engine key exists.
    if (config.promptChecks?.enabled) {
      const due = !config.lastPromptRun || now().getTime() - Date.parse(config.lastPromptRun) >= config.promptChecks.intervalHours * 3600_000;
      if (due) {
        const prompts = listPrompts(tenant.id);
        const engines = (config.promptChecks.engines ?? ["openai"]).filter((e) => engineStatuses(tenant.id).find((s) => s.id === e)?.configured);
        if (prompts.length && engines.length) {
          jobs++;
          try {
            const brands = await brandsForTenant(tenant.id);
            if (brands.length) {
              const { run } = await runVisibilityCheck(tenant.id, { engines: engines as Array<"openai" | "gemini">, brands, transport: options.transport });
              writeAutomationConfig(tenant.id, { ...config, lastPromptRun: run.ranAt });
              details.push({ tenant: tenant.id, job: "visibility", status: `ok:${run.succeeded}/${run.prompts}` });
            } else details.push({ tenant: tenant.id, job: "visibility", status: "skipped:no-brands" });
          } catch (error) {
            details.push({ tenant: tenant.id, job: "visibility", status: `error:${(error as Error).message.slice(0, 80)}` });
          }
        }
      }
    }
    // Rank checks (T-4): due when enabled, keywords exist, supplier configured.
    if (config.rankChecks?.enabled) {
      const due = !config.lastRankRun || now().getTime() - Date.parse(config.lastRankRun) >= config.rankChecks.intervalHours * 3600_000;
      if (due) {
        const keywords = listRankKeywords(tenant.id);
        const supplier = supplierFromEnv();
        const host = tenant.domains[0]?.replace(/^https?:\/\//, "").replace(/\/$/, "");
        if (keywords.length && supplier && host) {
          jobs++;
          try {
            const { checked } = await runRankCheck(tenant.id, host, supplier.supplier);
            writeAutomationConfig(tenant.id, { ...readAutomationConfig(tenant.id), lastRankRun: new Date().toISOString() });
            details.push({ tenant: tenant.id, job: "rank", status: `ok:${checked}` });
          } catch (error) {
            details.push({ tenant: tenant.id, job: "approval", status: `error:${(error as Error).message.slice(0, 80)}` });
          }
        }
      }
    }
  }
  return { tenants: store.list().length, jobs, details };
}

/** Record a lost-mention alert by comparing the two latest datasets (used by
 * the scheduler after each visibility run; kept here for cohesion). */
export function alertOnVisibilityLoss(tenantId: string, latest: { count: number }, previous: { count: number } | null): void {
  if (!previous || latest.count >= previous.count) return;
  const lost = previous.count - latest.count;
  void insertAlert(tenantId, { kind: "visibility-loss", severity: lost >= 3 ? "critical" : "warn", title: `${lost} mention(s) IA perdue(s)`, detail: `Le dernier contrÃ´le de visibilitÃ© montre ${latest.count} mentions contre ${previous.count} prÃ©cÃ©demment.`, payload: { previous: previous.count, current: latest.count } });
}
