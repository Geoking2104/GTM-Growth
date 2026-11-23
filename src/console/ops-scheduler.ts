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
import { ReportAccessService } from "../report-access/service.js";
import { createSmtpFollowUpSender, smtpSettings } from "../report-access/mailer.js";
import { dispatchDueFollowUps, followUpsEnabled, FOLLOWUP_REPORT_NOTE, type FollowUpReader, type FollowUpSender, type FollowUpStore } from "../report-access/follow-ups.js";
import { renderReportPdf } from "../report-access/export.js";
import { followUpSuggestionFor } from "../impact/follow-ups.js";
import type { FreeReport360 } from "../freeread/report360.js";
import { runFreeRead } from "../freeread/index.js";
import { fetchPublicPage } from "../http/public-fetch.js";

export interface SchedulerOptions { cloud?: import("../billing/access.js").CloudAccess; intervalMinutes?: number; tenantStore?: TenantStore; transport?: typeof fetch; now?: () => Date; reportFollowUps?: { store: FollowUpStore; sender: FollowUpSender; reader: FollowUpReader; limit?: number } }
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
    // When durable scheduled visibility (visibility-jobs) is enabled, the legacy
    // in-process prompt checks are skipped so each answer is collected only once.
    if (config.promptChecks?.enabled && process.env.VISIBILITY_JOBS_ENABLED !== "true") {
      const due = !config.lastPromptRun || now().getTime() - Date.parse(config.lastPromptRun) >= config.promptChecks.intervalHours * 3600_000;
      if (due) {
        const prompts = listPrompts(tenant.id);
        const available = new Set(engineStatuses(tenant.id).filter((engine) => engine.enabled && engine.configured).map((engine) => engine.id));
        const engines = (config.promptChecks.engines ?? ["openai"]).filter((engine) => available.has(engine as "openai" | "gemini"));
        if (prompts.length && engines.length) {
          jobs++;
          try {
            const brands = await brandsForTenant(tenant.id);
            if (brands.length) {
              options.cloud?.authorize(tenant.id, "/scheduler/visibility");
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
            options.cloud?.authorize(tenant.id, "/scheduler/rank");
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
  // R9 scheduled follow-ups pass (outside the tenant loop: report-access
  // follow-ups are recipient+page scoped, not tenant scoped).
  const followUpPass = await drainReportFollowUps(options, now);
  return { tenants: store.list().length, jobs: jobs + followUpPass.jobs, details: [...details, ...followUpPass.details] };
}

/** Scheduled R9 follow-ups pass, drained once per tick after tenant jobs.
 * The default wiring is env-gated and fail-closed (REPORT_FOLLOW_UPS_ENABLED);
 * tests inject a store/sender/reader through the same options. */
export async function drainReportFollowUps(options: SchedulerOptions, now: () => Date): Promise<{ tenants: number; jobs: number; details: Array<{ tenant: string; job: string; status: string }> }> {
  const details: Array<{ tenant: string; job: string; status: string }> = [];
  let jobs = 0;
  const injected = options.reportFollowUps;
  const settings = process.env.REPORT_ACCESS_ENABLED === "true" ? smtpSettings() : null;
  const runtime = injected ?? (followUpsEnabled() && settings && process.env.REPORT_ACCESS_SECRET && process.env.REPORT_ACCESS_SECRET.length >= 32
    ? {
      store: new ReportAccessService({ dbPath: process.env.REPORT_ACCESS_DB_PATH || "data/report-access.sqlite3", secret: process.env.REPORT_ACCESS_SECRET }),
      sender: createSmtpFollowUpSender(settings),
      reader: followUpReaderFromEnv(),
    }
    : null);
  if (!runtime) return { tenants: 0, jobs, details };
  // When this pass built the store itself, close it again: the next tick
  // reopens fresh, so no database handle accumulates on a long-lived scheduler.
  const ownsStore = !injected;
  jobs++;
  try {
    const result = await dispatchDueFollowUps({
      store: runtime.store, reader: runtime.reader, send: runtime.sender,
      renderPdf: (report, language, opts) => renderReportPdf(report as FreeReport360, language, { brand: opts?.brand ?? null }),
      suggestionFor: (milestone) => followUpSuggestionFor(milestone),
      reportNote: FOLLOWUP_REPORT_NOTE,
      limit: injected?.limit ?? 5, now,
    });
    details.push({ tenant: "report-access", job: "report-follow-ups", status: `sent:${result.sent}/failed:${result.failed}` });
  } finally {
    if (ownsStore && runtime.store instanceof ReportAccessService) runtime.store.close();
  }
  return { tenants: 0, jobs, details };
}

/** Same public read method as the report-access invitations (one live HTTP
 * fetch of the same page, deterministic checks). */
function followUpReaderFromEnv(): FollowUpReader {
  return async (url: string) => {
    const result = await runFreeRead({ url, timeoutMs: 12_000, fetcher: fetchPublicPage });
    if (result.httpStatus < 200 || result.httpStatus >= 400) throw new Error("unreadable_page");
    return { observedAt: result.report360.observedAt, sourceUrl: result.report360.sourceUrl, blob: JSON.stringify(result.report360) };
  };
}

/** Record a lost-mention alert by comparing the two latest datasets (used by
 * the scheduler after each visibility run; kept here for cohesion). */
export function alertOnVisibilityLoss(tenantId: string, latest: { count: number }, previous: { count: number } | null): void {
  if (!previous || latest.count >= previous.count) return;
  const lost = previous.count - latest.count;
  void insertAlert(tenantId, { kind: "visibility-loss", severity: lost >= 3 ? "critical" : "warn", title: `${lost} mention(s) IA perdue(s)`, detail: `Le dernier contrôle de visibilité montre ${latest.count} mentions contre ${previous.count} précédemment.`, payload: { previous: previous.count, current: latest.count } });
}
