/** Console routes for the native AI tracker — /api/console/ai-tracker/*.
 * Tenant-scoped by the console middleware; admin routes marked adminOnly. */
import type { ConsoleRoute } from "./util.js";
import { str } from "./util.js";
import { validTenantId } from "../tenants/store.js";
import { getBrand, getPrompt, getRun, insertPrompt, listBrands, listEngineStates, listOpportunities, listPrompts, listRuns, mentionsForRun, normalizeDomain, runsForWindow, setBrandActive, setOpportunityStatus, setPromptActive, upsertBrand } from "../ai-tracker/store.js";
import { judgeVersion, trackerConfig, trackerEnabled } from "../ai-tracker/config.js";
import { validateEngines, validatePromptText, validateTags } from "../ai-tracker/prompt-validation.js";
import { manualRun, runDailyQueue, rejudgeWindow, today } from "../ai-tracker/worker.js";
import { consoleBrandMetrics, generateOpportunities, opportunitiesFor, resolveOpportunity, windowSince } from "../ai-tracker/opportunities.js";
import { brandMetrics, citationAggregates, latestMentions, trend } from "../ai-tracker/metrics.js";
import type { TrackedBrand, TrackedCompany } from "../ai-tracker/types.js";
import { logger } from "../utils/logger.js";

const tenantOf = (ctx: { tenancy?: { tenant?: { id: string } } }): string => {
  const id = ctx.tenancy?.tenant?.id ?? "";
  if (!validTenantId(id)) throw new Error("Select a tenant");
  return id;
};
const strings = (value: unknown, max: number): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0 && v.length < 200).map(v => v.trim()).slice(0, max) : [];
const competitorList = (value: unknown): TrackedCompany[] => {
  if (!Array.isArray(value) || value.length > 10) throw new Error("A brand tracks at most 10 competitors");
  return value.map((item, index) => {
    const entry = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const name = str(entry.name);
    if (!name) throw new Error("Each competitor needs a name");
    return { companyId: str(entry.companyId) ?? `competitor-${index + 1}`, type: "competitor" as const, name, aliases: strings(entry.aliases, 10), domains: strings(entry.domains, 5).map(normalizeDomain) };
  });
};

export const aiTrackerRoutes: ConsoleRoute[] = [
  // Status and health
  { path: "/ai-tracker/status", needsUrl: false, handler: async ctx => {
    const tenant = tenantOf(ctx);
    return { enabled: trackerEnabled(), config: { runHour: trackerConfig().runHour, defaultLocale: trackerConfig().defaultLocale, scraperEngines: trackerConfig().scraperEngines, ollamaModel: trackerConfig().ollamaModel }, judgeVersion: judgeVersion(), engines: listEngineStates(tenant), warning: "Scores are sampled measurements, not causal proof. Every score shows its run count and collection mode." };
  } },
  { path: "/ai-tracker/health", needsUrl: false, handler: async ctx => ({ engines: listEngineStates(tenantOf(ctx)) }) },

  // Brands (CU-01)
  { path: "/ai-tracker/brand", needsUrl: false, adminOnly: true, handler: async ctx => {
    const tenant = tenantOf(ctx);
    const body = ctx.body;
    const name = str(body.name);
    if (!name || name.length > 100) throw new Error("Brand name is required (max 100 characters)");
    const brandId = str(body.brandId) ?? name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 50);
    const brand: Omit<TrackedBrand, "tenantId"> = {
      brandId, name, aliases: strings(body.aliases, 10), domains: strings(body.domains, 10).map(normalizeDomain),
      competitors: competitorList(body.competitors), locale: str(body.locale) ?? trackerConfig().defaultLocale,
      active: body.active !== false, createdAt: new Date().toISOString(), createdBy: ctx.user?.preferred_username ?? ctx.user?.sub ?? "unknown",
    };
    upsertBrand(tenant, brand);
    logger.info(`[ai-tracker] brand upserted for tenant ${tenant}: ${brandId}`);
    return { brandId };
  } },
  { path: "/ai-tracker/brands", needsUrl: false, handler: async ctx => ({ brands: listBrands(tenantOf(ctx)) }) },
  { path: "/ai-tracker/brand/set-active", needsUrl: false, adminOnly: true, handler: async ctx => {
    const tenant = tenantOf(ctx);
    const brandId = str(ctx.body.brandId);
    if (!brandId) throw new Error("brandId is required");
    setBrandActive(tenant, brandId, ctx.body.active !== false);
    return { brandId, active: ctx.body.active !== false };
  } },

  // Prompts (CU-02)
  { path: "/ai-tracker/prompt", needsUrl: false, adminOnly: true, handler: async ctx => {
    const tenant = tenantOf(ctx);
    const body = ctx.body;
    const validation = validatePromptText(body.promptText);
    if (!validation.ok) throw new Error(validation.reason);
    const brandId = str(body.brandId);
    const engines = validateEngines(body.engines);
    if (!brandId || !getBrand(tenant, brandId)) throw new Error("Unknown brand");
    if (!engines) throw new Error("Provide 1 to 7 valid engines: chatgpt, gemini, google-ai-mode, perplexity, bing-ai-mode, claude, mistral");
    const promptId = str(body.promptId) ?? `p-${Date.now().toString(36)}`;
    const result = insertPrompt(tenant, {
      promptId, brandId, promptText: String(body.promptText).trim(), promptHash: validation.hash,
      tags: validateTags(body.tags), locale: str(body.locale) ?? trackerConfig().defaultLocale,
      engines: engines as never, active: body.active !== false,
      createdAt: new Date().toISOString(), createdBy: ctx.user?.preferred_username ?? ctx.user?.sub ?? "unknown",
      source: str(body.source) ?? "manual",
    });
    return { promptId, reused: result.reused };
  } },
  { path: "/ai-tracker/prompts", needsUrl: false, handler: async ctx => {
    const tenant = tenantOf(ctx);
    return { prompts: listPrompts(tenant, str(ctx.body.brandId)) };
  } },
  { path: "/ai-tracker/prompt/set-active", needsUrl: false, adminOnly: true, handler: async ctx => {
    const tenant = tenantOf(ctx);
    const { brandId, promptId } = ctx.body;
    if (!str(brandId) || !str(promptId)) throw new Error("brandId and promptId are required");
    setPromptActive(tenant, String(brandId), String(promptId), ctx.body.active !== false);
    return { ok: true };
  } },

  // Metrics (CU-05)
  { path: "/ai-tracker/visibility", needsUrl: false, handler: async ctx => {
    const tenant = tenantOf(ctx);
    const body = ctx.body;
    const brandId = str(body.brandId);
    const brand = brandId ? getBrand(tenant, brandId) : listBrands(tenant)[0];
    if (!brand) throw new Error("No brand to display");
    const days = Number(body.days ?? 90);
    const window = windowSince(Number.isFinite(days) ? Math.min(Math.max(days, 7), 365) : 90);
    const runs = runsForWindow(tenant, brand.brandId, str(body.promptId), str(body.engine), window.from, window.to, str(body.mode));
    const mentionsByRun = latestMentions(tenant, runs.map(r => r.runId));
    const perMode = brandMetrics(brand, runs, mentionsByRun, window.from, window.to);
    const countedRunIds = new Set(runs.filter(run => (mentionsByRun.get(run.runId) ?? []).some(m => m.companyId === brand.brandId && m.counted && m.status === "judged")).map(run => run.runId));
    const filtered = str(body.mode) ? runs.filter(r => r.collectionMode === str(body.mode)) : runs;
    return { brandId: brand.brandId, window, byMode: perMode, trend: trend(filtered, countedRunIds), citations: citationAggregates(filtered).slice(0, 50), warning: "Sampled scores; each value carries its run count and collection mode." };
  } },
  { path: "/ai-tracker/metrics", needsUrl: false, handler: async ctx => {
    const tenant = tenantOf(ctx);
    const brandId = str(ctx.body.brandId);
    const brand = brandId ? getBrand(tenant, brandId) : listBrands(tenant)[0];
    if (!brand) throw new Error("No brand to display");
    return consoleBrandMetrics(tenant, brand);
  } },

  // Runs and audit (CU-06)
  { path: "/ai-tracker/runs", needsUrl: false, handler: async ctx => {
    const tenant = tenantOf(ctx);
    const body = ctx.body;
    const page = listRuns(tenant, {
      brandId: str(body.brandId), promptId: str(body.promptId), engine: str(body.engine), mode: str(body.mode),
      from: str(body.from), to: str(body.to), cursor: str(body.cursor), limit: Number(body.limit ?? 50) || 50,
    });
    return { runs: page.runs.map(run => ({ ...run, rawText: run.rawText.slice(0, 500) })), nextCursor: page.nextCursor };
  } },
  { path: "/ai-tracker/run", needsUrl: false, handler: async ctx => {
    const tenant = tenantOf(ctx);
    const runId = str(ctx.body.runId);
    if (!runId) throw new Error("runId is required");
    const run = getRun(tenant, runId);
    if (!run) throw new Error("Run not found");
    return { run, mentions: mentionsForRun(tenant, runId) };
  } },

  // Collection control (CU-03, CU-08)
  { path: "/ai-tracker/run-now", needsUrl: false, adminOnly: true, handler: async ctx => {
    const tenant = tenantOf(ctx);
    if (!trackerEnabled()) throw new Error("AI_TRACKER_ENABLED is false: collection is off");
    return { results: await runDailyQueue(tenant) };
  } },
  { path: "/ai-tracker/manual-run", needsUrl: false, adminOnly: true, handler: async ctx => {
    const tenant = tenantOf(ctx);
    const body = ctx.body;
    const [brandId, promptId, engine, justification] = [str(body.brandId), str(body.promptId), str(body.engine), str(body.justification)];
    if (!brandId || !promptId || !engine || !justification) throw new Error("brandId, promptId, engine and a written justification are required");
    return manualRun({ tenantId: tenant, brandId, promptId, engine, justification });
  } },
  { path: "/ai-tracker/rejudge", needsUrl: false, adminOnly: true, handler: async ctx => {
    const tenant = tenantOf(ctx);
    const brandId = str(ctx.body.brandId);
    if (!brandId) throw new Error("brandId is required");
    return { rejudged: await rejudgeWindow(tenant, brandId), judgeVersion: judgeVersion() };
  } },

  // Opportunities (CU-07)
  { path: "/ai-tracker/opportunities", needsUrl: false, handler: async ctx => ({ opportunities: opportunitiesFor(tenantOf(ctx), str(ctx.body.status) ?? undefined) }) },
  { path: "/ai-tracker/opportunities/generate", needsUrl: false, adminOnly: true, handler: async ctx => {
    const tenant = tenantOf(ctx);
    const brandId = str(ctx.body.brandId);
    const brand = brandId ? getBrand(tenant, brandId) : listBrands(tenant)[0];
    if (!brand) throw new Error("No brand to analyse");
    return { generated: generateOpportunities(tenant, brand, Number(ctx.body.days ?? 14) || 14).length };
  } },
  { path: "/ai-tracker/opportunity/draft", needsUrl: false, adminOnly: true, handler: async ctx => {
    const tenant = tenantOf(ctx);
    const opportunityId = str(ctx.body.opportunityId);
    if (!opportunityId) throw new Error("opportunityId is required");
    const opportunity = listOpportunities(tenant).find(o => o.opportunityId === opportunityId);
    if (!opportunity) throw new Error("Opportunity not found");
    if (ctx.body.confirmed !== true) throw new Error("Explicit confirmation is required to create a draft");
    // The draft flows through the existing GEO action approval circuit; nothing is executed here.
    resolveOpportunity(tenant, opportunityId, "drafted");
    return { draft: { title: opportunity.title, type: opportunity.type, engine: opportunity.engine, promptId: opportunity.promptId, evidence: opportunity.evidence, next: "GEO action approval workflow" }, opportunityId };
  } },
  { path: "/ai-tracker/opportunity/set-status", needsUrl: false, adminOnly: true, handler: async ctx => {
    const tenant = tenantOf(ctx);
    const [opportunityId, status] = [str(ctx.body.opportunityId), str(ctx.body.status)];
    if (!opportunityId || !["open", "dismissed", "drafted"].includes(status ?? "")) throw new Error("opportunityId and a valid status are required");
    setOpportunityStatus(tenant, opportunityId, status!);
    return { ok: true };
  } },
];
