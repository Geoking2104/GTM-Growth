/** MCP tools for the native AI tracker — read-only by default, tenant-scoped.
 * No tool deletes data. No tool launches paid collection without an explicit flag. */
import { z } from "zod";
import { strict } from "./schema.js";
import { success, fail } from "./response.js";
import type { ToolDefinition } from "./index.js";
import { currentMcpAuth, hasScope, MCP_WRITE_SCOPES } from "../mcp/context.js";
import { validTenantId } from "../tenants/store.js";
import { getRun, listBrands, listOpportunities, listPrompts, mentionsForRun, runsForWindow } from "../ai-tracker/store.js";
import { trackerEnabled } from "../ai-tracker/config.js";
import { validatePromptText, validateEngines, validateTags } from "../ai-tracker/prompt-validation.js";
import { brandMetrics, citationAggregates, trend } from "../ai-tracker/metrics.js";
import { latestMentions } from "../ai-tracker/store.js";
import { insertPrompt } from "../ai-tracker/store.js";
import { windowSince } from "../ai-tracker/opportunities.js";
import { logger } from "../utils/logger.js";

const tenantArg = z.string().min(1).max(64);
const requireTenant = (args: { tenantId?: string }): string => {
  const id = args.tenantId ?? "";
  if (!validTenantId(id)) throw new Error("A valid tenantId is required and must match the scoped token");
  const auth = currentMcpAuth();
  if (auth?.mode === "oauth" && (!auth.platformAdmin || auth.tenant) && auth.tenant?.id !== id) {
    throw new Error("The tracker tenant must match the selected tenant");
  }
  return id;
};
const logCall = (tool: string, args: Record<string, unknown>, outcome: string) =>
  logger.info(`[mcp] ai_tracker.${tool} tenant=${String(args.tenantId ?? "?")} result=${outcome}`);

export const aiTrackerTools: ToolDefinition[] = [
  { name: "ai_tracker.list_brands", description: "List the tracked brands and competitors of the tenant.", schema: strict({ tenantId: tenantArg }),
    handler: async args => { try { const data = { brands: listBrands(requireTenant(args)) }; logCall("list_brands", args, "ok"); return success(data); } catch (err) { return fail(err); } } },
  { name: "ai_tracker.list_prompts", description: "List the AI-tracker prompts of the tenant, with tags and engines.", schema: strict({ tenantId: tenantArg, brandId: z.string().optional() }),
    handler: async args => { try { const data = { prompts: listPrompts(requireTenant(args), args.brandId) }; logCall("list_prompts", args, "ok"); return success(data); } catch (err) { return fail(err); } } },
  { name: "ai_tracker.get_visibility", description: "Visibility, share of voice, sentiment, position and trend per prompt and engine. Series are separated by collection mode.", schema: strict({ tenantId: tenantArg, brandId: z.string(), promptId: z.string().optional(), engine: z.string().optional(), days: z.number().int().min(7).max(365).optional() }),
    handler: async args => { try { const tenantId = requireTenant(args); const brand = listBrands(tenantId).find(b => b.brandId === args.brandId); if (!brand) return fail("Unknown brand"); const window = windowSince(args.days ?? 90); const runs = runsForWindow(tenantId, brand.brandId, args.promptId, args.engine, window.from, window.to); const mentionsByRun = latestMentions(tenantId, runs.map(r => r.runId)); const counted = new Set(runs.filter(run => (mentionsByRun.get(run.runId) ?? []).some(m => m.companyId === brand.brandId && m.counted && m.status === "judged")).map(run => run.runId)); logCall("get_visibility", args, "ok"); return success({ brandId: brand.brandId, window, byMode: brandMetrics(brand, runs, mentionsByRun, window.from, window.to), trend: trend(runs, counted), warning: "Sampled scores; run counts and collection modes are included." }); } catch (err) { return fail(err); } } },
  { name: "ai_tracker.get_citations", description: "Cited URLs grouped by domain with the number of citing runs.", schema: strict({ tenantId: tenantArg, brandId: z.string(), days: z.number().int().min(7).max(365).optional() }),
    handler: async args => { try { const tenantId = requireTenant(args); const window = windowSince(args.days ?? 90); const runs = runsForWindow(tenantId, args.brandId, undefined, undefined, window.from, window.to); logCall("get_citations", args, "ok"); return success({ citations: citationAggregates(runs).slice(0, 100), runCount: runs.length }); } catch (err) { return fail(err); } } },
  { name: "ai_tracker.get_fanout", description: "Web searches launched by the engine before answering, when visible.", schema: strict({ tenantId: tenantArg, brandId: z.string(), days: z.number().int().min(7).max(365).optional() }),
    handler: async args => { try { const tenantId = requireTenant(args); const window = windowSince(args.days ?? 90); const runs = runsForWindow(tenantId, args.brandId, undefined, undefined, window.from, window.to); logCall("get_fanout", args, "ok"); return success({ fanout: runs.flatMap(run => run.fanOut.map(query => ({ runId: run.runId, engine: run.engine, runDate: run.runDate, query }))) }); } catch (err) { return fail(err); } } },
  { name: "ai_tracker.get_run", description: "One raw run with its judged passages. Proof before score.", schema: strict({ tenantId: tenantArg, runId: z.string() }),
    handler: async args => { try { const tenantId = requireTenant(args); const run = getRun(tenantId, args.runId ?? ""); if (!run) return fail("Run not found"); logCall("get_run", args, "ok"); return success({ run, mentions: mentionsForRun(tenantId, run.runId) }); } catch (err) { return fail(err); } } },
  { name: "ai_tracker.get_opportunities", description: "Generated opportunities with evidence and status.", schema: strict({ tenantId: tenantArg, status: z.string().optional() }),
    handler: async args => { try { const data = { opportunities: listOpportunities(requireTenant(args), args.status) }; logCall("get_opportunities", args, "ok"); return success(data); } catch (err) { return fail(err); } } },
  { name: "ai_tracker.create_prompt", description: "Create a tracker prompt (write). Requires AI_TRACKER_ENABLED and explicit admin validation; refuses PII, secrets and injection.", schema: strict({ tenantId: tenantArg, brandId: z.string(), promptText: z.string().min(1).max(500), engines: z.array(z.string()).min(1).max(7), tags: z.array(z.string()).optional(), locale: z.string().optional(), confirmed: z.boolean() }),
    handler: async args => {
      try {
        const tenantId = requireTenant(args);
        const auth = currentMcpAuth();
        if (auth?.mode === "oauth" && (!hasScope(auth, MCP_WRITE_SCOPES) || (!auth.platformAdmin && auth.role !== "tenant-admin"))) {
          return fail("Creating a tracker prompt requires administrator access and write scope");
        }
        if (!trackerEnabled()) return fail("AI_TRACKER_ENABLED is false: the tracker is disabled");
        if (args.confirmed !== true) return fail("Explicit admin confirmation (confirmed: true) is required");
        const validation = validatePromptText(args.promptText);
        if (!validation.ok) return fail(validation.reason);
        const engines = validateEngines(args.engines);
        if (!engines) return fail("Provide 1 to 7 valid engines");
        const promptId = `p-${Date.now().toString(36)}`;
        const result = insertPrompt(tenantId, { promptId, brandId: args.brandId, promptText: args.promptText.trim(), promptHash: validation.hash, tags: validateTags(args.tags ?? []), locale: args.locale ?? "fr-FR", engines: engines as never, active: true, createdAt: new Date().toISOString(), createdBy: "mcp", source: "mcp" });
        logCall("create_prompt", args, result.reused ? "duplicate" : "ok");
        return success({ promptId, reused: result.reused });
      } catch (err) { return fail(err); }
    } },
];
