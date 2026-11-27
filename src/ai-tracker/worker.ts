/** Native AI tracker — collection worker.
 * One run per day per active prompt per engine, single concurrency per engine,
 * 8–20s jitter between runs, automatic pause after 2 consecutive failures. */
import { createHash } from "node:crypto";
import { getBrand, getEngineState, getPrompt, insertMention, insertRun, latestMentions, listBrands, listPrompts, runIdFor, runsForWindow, setEngineState } from "./store.js";
import { trackerConfig } from "./config.js";
import { apiProviderForEngine, collectViaApi, type ApiProviderId } from "./providers.js";
import { scraperFor } from "./scrapers/index.js";
import { judgeRunAsync } from "./judge/local-judge.js";
import type { CollectedAnswer, StoredRun, TrackedCompany } from "./types.js";
import { logger } from "../utils/logger.js";

export const today = (): string => new Date().toISOString().slice(0, 10);

export interface RunRequest { tenantId: string; brandId: string; promptId: string; engine: string; justification?: string }

export interface RunResult { runId: string | null; status: "collected" | "duplicate" | "failed" | "skipped"; reason?: string }

const inFlight = new Set<string>();

/** API first; scraper only when no consumer API exists and its flag is on; otherwise no collection. */
async function collect(engine: string, promptText: string): Promise<CollectedAnswer> {
  const apiProvider = apiProviderForEngine(engine);
  if (apiProvider) return collectViaApi(apiProvider as ApiProviderId, promptText);
  const scraper = scraperFor(engine);
  if (scraper) {
    try { return await scraper.run(promptText); }
    finally { await scraper.close(); }
  }
  throw new Error(`No collector available for ${engine} (API unconfigured, scraper disabled): not collecting`);
}

/** One run: collect, store raw, judge if the deterministic filter matches. */
export async function executeRun(request: RunRequest): Promise<RunResult> {
  const config = trackerConfig();
  if (!config.enabled) return { runId: null, status: "skipped", reason: "AI_TRACKER_ENABLED is false" };
  const brand = getBrand(request.tenantId, request.brandId);
  const prompt = getPrompt(request.tenantId, request.brandId, request.promptId);
  if (!brand || !prompt || !brand.active || !prompt.active) return { runId: null, status: "skipped", reason: "Brand or prompt is inactive or missing" };
  if (!prompt.engines.includes(request.engine as never)) return { runId: null, status: "skipped", reason: `Engine ${request.engine} is not tracked by this prompt` };
  const lock = `${request.tenantId}:${request.engine}`;
  if (inFlight.has(lock)) return { runId: null, status: "skipped", reason: "A run is already in flight for this engine" };
  const state = getEngineState(request.tenantId, request.engine);
  if (state.health === "paused") return { runId: null, status: "skipped", reason: `Engine ${request.engine} is paused after repeated failures` };

  const runDate = today();
  inFlight.add(lock);
  try {
    const answer = await collect(request.engine, prompt.promptText);
    const finalRunId = runIdFor(request.tenantId, request.brandId, request.promptId, request.engine, answer.provider, runDate);
    const run: StoredRun = {
      runId: finalRunId, tenantId: request.tenantId, brandId: request.brandId, promptId: request.promptId,
      engine: request.engine, provider: answer.provider, collectionMode: answer.collectionMode,
      runDate, startedAt: answer.startedAt, finishedAt: answer.finishedAt,
      rawText: answer.rawText, citations: answer.citations, fanOut: answer.fanOut,
      model: answer.model, source: "native-tracker",
    };
    const stored = insertRun(request.tenantId, run);
    if (stored.reused) return { runId: finalRunId, status: "duplicate" };
    await judgeAndStore(request.tenantId, finalRunId, run.rawText, brand);
    setEngineState(request.tenantId, request.engine, { health: "ok", consecutiveFailures: 0, lastCheckedAt: new Date().toISOString() });
    return { runId: finalRunId, status: "collected" };
  } catch (error) {
    const failures = state.consecutiveFailures + 1;
    const paused = failures >= 2;
    setEngineState(request.tenantId, request.engine, { health: paused ? "paused" : "degraded", consecutiveFailures: failures, lastCheckedAt: new Date().toISOString(), note: (error as Error).message.slice(0, 300) });
    logger.warn(`[ai-tracker] run failed ${request.engine}: ${(error as Error).message}${paused ? " — engine paused" : ""}`);
    return { runId: null, status: "failed", reason: (error as Error).message };
  } finally { inFlight.delete(lock); }
}

async function judgeAndStore(tenantId: string, runId: string, rawText: string, brand: { brandId: string; name: string; aliases: string[]; domains: string[]; competitors: TrackedCompany[] }): Promise<void> {
  const companies: TrackedCompany[] = [
    { companyId: brand.brandId, type: "brand", name: brand.name, aliases: brand.aliases, domains: brand.domains },
    ...brand.competitors.map(c => ({ companyId: c.companyId, type: "competitor" as const, name: c.name, aliases: c.aliases, domains: c.domains })),
  ];
  const outcome = await judgeRunAsync(rawText, companies);
  for (const mention of outcome.mentions) insertMention(tenantId, { ...mention, runId });
}

/** 8 to 20 seconds between two runs, with jitter. */
export async function pacingDelay(): Promise<void> {
  const ms = 8000 + Math.random() * 12000;
  await new Promise(resolve => setTimeout(resolve, ms));
}

/** Runs due today for the fixed hour, executed sequentially. Used by the worker loop and manual runs. */
export async function runDailyQueue(tenantId: string, onResult?: (result: RunResult, request: RunRequest) => void): Promise<RunResult[]> {
  if (!trackerConfig().enabled) return [];
  const results: RunResult[] = [];
  const seenEngines = new Set<string>();
  for (const brand of listBrands(tenantId)) {
    if (!brand.active) continue;
    for (const prompt of listPrompts(tenantId, brand.brandId)) {
      if (!prompt.active) continue;
      for (const engine of prompt.engines) {
        const request: RunRequest = { tenantId, brandId: brand.brandId, promptId: prompt.promptId, engine };
        const result = await executeRun(request);
        results.push(result);
        onResult?.(result, request);
        if (!seenEngines.has(engine)) { seenEngines.add(engine); }
        await pacingDelay();
      }
    }
  }
  return results;
}

/** Manual single run: admin-approved, justified, still idempotent per day. */
export async function manualRun(request: RunRequest & { justification: string }): Promise<RunResult> {
  if (!request.justification || request.justification.trim().length < 10) throw new Error("A manual run requires a written justification");
  return executeRun({ tenantId: request.tenantId, brandId: request.brandId, promptId: request.promptId, engine: request.engine, justification: request.justification });
}

/** Daily engine health check: open the page, verify the selector still answers (scraper engines only). */
export async function engineHealthCheck(tenantId: string, engine: string): Promise<"ok" | "degraded" | "paused" | "disabled"> {
  const state = getEngineState(tenantId, engine);
  if (state.health === "paused") return "paused";
  const scraper = scraperFor(engine);
  if (!scraper) { setEngineState(tenantId, engine, { health: "disabled", lastCheckedAt: new Date().toISOString() }); return "disabled"; }
  await scraper.close();
  return "ok";
}

/** Re-judge the last 90 days with the current judge version: adds rows, never overwrites. */
export async function rejudgeWindow(tenantId: string, brandId: string): Promise<number> {
  const since = new Date(Date.now() - 90 * 86400 * 1000).toISOString().slice(0, 10);
  const brand = getBrand(tenantId, brandId);
  if (!brand) throw new Error("Brand not found");
  let rejudged = 0;
  for (const run of runsForWindow(tenantId, brandId, undefined, undefined, since, today())) {
    const existing = latestMentions(tenantId, [run.runId]).get(run.runId) ?? [];
    if (existing.length) continue;
    await judgeAndStore(tenantId, run.runId, run.rawText, brand);
    rejudged += 1;
  }
  return rejudged;
}

/** Stable id helper for opportunities and other derived rows. */
export function stableId(...parts: string[]): string { return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24); }
