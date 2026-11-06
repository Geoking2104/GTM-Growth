/** Scheduled AI-visibility collection (T-1): run the tenant prompt pool
 * through the existing BYOK collectors (OpenAI / Gemini) and store the
 * results as competition datasets, exactly like a manual import.
 * Deterministic orchestration, injectable transports, bounded calls. */
import { randomUUID } from "node:crypto";
import { collectGemini, collectOpenAI, normalizeImport } from "./ai-visibility.js";
import { insertDataset } from "./ai-visibility-store.js";
import { addPrompt, listPrompts, recordVisibilityRun, type VisibilityRun, type TrackedPrompt } from "./ops-store.js";

export type EngineId = "openai" | "gemini";
export interface EngineStatus { id: EngineId; label: string; configured: boolean; model: string }
export interface PromptCheckResult { engine: EngineId; prompts: number; succeeded: number; failed: Array<{ prompt: string; reason: string }>; datasetId: string | null; error: string | null }

const MAX_PROMPTS_PER_RUN = 5;
const MAX_BATCHES_PER_RUN = 2;

export function engineStatuses(tenantId: string): EngineStatus[] {
  const suffix = tenantId.toUpperCase().replace(/-/g, "_");
  return [
    { id: "openai", label: "ChatGPT (OpenAI)", configured: Boolean(process.env[`AI_VISIBILITY_OPENAI_KEY_${suffix}`]), model: "gpt-4.1-mini" },
    { id: "gemini", label: "Gemini (Google)", configured: Boolean(process.env[`AI_VISIBILITY_GEMINI_KEY_${suffix}`]), model: "gemini-2.5-flash" },
  ];
}

function engineKey(engine: EngineId, tenantId: string): string {
  const suffix = tenantId.toUpperCase().replace(/-/g, "_");
  return process.env[`AI_VISIBILITY_${engine.toUpperCase()}_KEY_${suffix}`] ?? "";
}

export interface RunnerDeps { transport?: typeof fetch; brands: Array<{ name: string; aliases?: string[] }>; }

/** One bounded visibility run over the prompt pool. Results become a reviewable
 * competition dataset (mentions heuristic + human confirm/reject, unchanged). */
export async function runVisibilityCheck(
  tenantId: string,
  options: { engines: EngineId[]; brands: Array<{ name: string; aliases?: string[] }>; prompts?: TrackedPrompt[]; transport?: typeof fetch; limit?: number },
): Promise<{ run: VisibilityRun; results: PromptCheckResult[] }> {
  const prompts = options.prompts ?? listPrompts(tenantId);
  if (!prompts.length) throw new Error("Aucun prompt suivi. Ajoutez des prompts à suivre.");
  const brands = options.brands;
  if (!Array.isArray(brands) || brands.length < 1 || brands.length > 10) throw new Error("Provide 1–10 brands (from tenant AI-visibility settings).");
  const engines = options.engines.length ? options.engines : (["openai"] as EngineId[]);
  const transport = options.transport ?? fetch;
  const limit = Math.min(options.limit ?? MAX_PROMPTS_PER_RUN, MAX_PROMPTS_PER_RUN);
  const batches = Math.min(Math.ceil(prompts.length / limit), MAX_BATCHES_PER_RUN);
  const results: PromptCheckResult[] = [];
  for (const engine of engines) {
    let succeeded = 0; let failed: Array<{ prompt: string; reason: string }> = []; let datasetId: string | null = null; let error: string | null = null;
    const key = engineKey(engine, tenantId);
    if (!key) { results.push({ engine, prompts: prompts.length, succeeded: 0, failed: [], datasetId: null, error: "Clé API non configurée pour ce client (AI_VISIBILITY_*_KEY_<TENANT>)." }); continue; }
    try {
      const collected: Array<{ prompt: string; answer: string; source: string; observedAt: string; citations?: string[]; citationSpans?: Array<{ start: number; end: number; url: string }> }> = [];
      for (let batch = 0; batch < batches; batch++) {
        const slice = prompts.slice(batch * limit, (batch + 1) * limit);
        if (!slice.length) break;
        const raw = slice.map((p) => p.prompt);
        const outcome = engine === "openai"
          ? await collectOpenAI({ brands, prompts: raw, confirmed: true }, key, transport)
          : await collectGemini({ brands, prompts: raw, confirmed: true }, key, transport);
        succeeded += outcome.successes.length;
        failed = failed.concat(outcome.failures);
        collected.push(...outcome.successes);
      }
      if (collected.length) {
        const dataset = normalizeImport({ brands, responses: collected });
        insertDataset(tenantId, dataset);
        datasetId = dataset.id;
      }
    } catch (e) {
      error = (e as Error).message;
    }
    results.push({ engine, prompts: prompts.length, succeeded, failed, datasetId, error });
  }
  const run: VisibilityRun = { id: randomUUID(), ranAt: new Date().toISOString(), engine: engines.join("+"), prompts: prompts.length, succeeded: results.reduce((n, r) => n + r.succeeded, 0), failed: results.reduce((n, r) => n + r.failed.length, 0), datasetId: results.find((r) => r.datasetId)?.datasetId ?? null, error: results.every((r) => r.error) ? results.map((r) => r.error).join(" / ") : null };
  recordVisibilityRun(tenantId, run);
  return { run, results };
}

/** Convenience for tests and the scheduler: single-prompt add + run. */
export async function trackAndRun(tenantId: string, prompt: string, options: RunnerDeps & { engines: EngineId[] }) {
  addPrompt(tenantId, prompt);
  return runVisibilityCheck(tenantId, { ...options, prompts: undefined });
}

/** Delta between the two most recent datasets of a tenant (for alerts). */
export function visibilityDelta(list: Array<{ id: string; createdAt: string; count: number }>): { previous: number; current: number; delta: number } | null {
  if (list.length < 2) return null;
  const current = list[list.length - 1], previous = list[list.length - 2];
  return { previous: previous.count, current: current.count, delta: current.count - previous.count };
}
