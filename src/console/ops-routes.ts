/** Console routes for the operations layer: prompt pool + live AI-visibility
 * (T-9/T-10), alerts and automation config (T-11). All tenant-scoped through
 * the standard scopeRequest guard; writes are explicit and bounded. */
import type { ConsoleRoute } from "./util.js";
import { str } from "./util.js";
import { addPrompt, listPrompts, removePrompt, listVisibilityRuns, addRankKeyword, removeRankKeyword, listAlerts, acknowledgeAlert, readAutomationConfig, writeAutomationConfig } from "./ops-store.js";
import { engineStatuses, runVisibilityCheck, type EngineId } from "./visibility-runner.js";
import { noSupplierError, rankBoard, runRankCheck, supplierFromEnv } from "./rank-tracking.js";
import { buildBrief, produceDraft, publishToWordPress, wpConfigFromEnv, articleAlert, type DraftMode } from "./content-ops.js";

const tenantId = (ctx: { tenancy?: { tenant: { id: string } | null } }) => { if (!ctx.tenancy?.tenant) throw new Error("SÃ©lectionnez un tenant."); return ctx.tenancy.tenant.id; };
const tenantHost = (ctx: { tenancy?: { tenant: { domains: string[] } | null } }) => {
  const t = ctx.tenancy?.tenant;
  if (!t?.domains?.length) throw new Error("Le tenant n'a aucun domaine configurÃ©.");
  return t.domains[0].replace(/^https?:\/\//, "").replace(/\/$/, "");
};

/* ---------------- T-1/T-2: prompt pool + visibility runs ---------------- */

export const visibilityRoutes: ConsoleRoute[] = [
  { path: "/visibility/prompts", needsUrl: false, handler: async (ctx) => ({ prompts: listPrompts(tenantId(ctx)), engines: engineStatuses(tenantId(ctx)) }) },
  { path: "/visibility/prompts/add", needsUrl: false, adminOnly: true, handler: async (ctx) => { const prompt = str(ctx.body.prompt); if (!prompt) throw new Error("Prompt requis."); return { prompt: addPrompt(tenantId(ctx), prompt, str(ctx.body.group) ?? "general") }; } },
  { path: "/visibility/prompts/remove", needsUrl: false, adminOnly: true, handler: async (ctx) => { const id = str(ctx.body.id); if (!id) throw new Error("id requis."); if (!removePrompt(tenantId(ctx), id)) throw new Error("Prompt introuvable."); return { removed: true }; } },
  { path: "/visibility/run", needsUrl: false, adminOnly: true, handler: async (ctx) => {
    const raw = ctx.body.engines;
    const engines = Array.isArray(raw) ? raw.filter((e): e is EngineId => e === "openai" || e === "gemini") : (["openai"] as EngineId[]);
    const brandsRaw = ctx.body.brands;
    const brands = Array.isArray(brandsRaw) ? brandsRaw.map((b) => (typeof b === "string" ? { name: b } : b as { name: string; aliases?: string[] })).slice(0, 10) : [];
    const { run, results } = await runVisibilityCheck(tenantId(ctx), { engines, brands });
    return { run, results, note: "Chaque exÃ©cution crÃ©e un jeu de donnÃ©es Concurrence Ã  vÃ©rifier (confirmer/rejeter les mentions)." };
  } },
  { path: "/visibility/runs", needsUrl: false, handler: async (ctx) => ({ runs: listVisibilityRuns(tenantId(ctx), 50) }) },
];

/* ---------------- T-3/T-4: rank tracking + AIO ---------------- */

export const rankRoutes: ConsoleRoute[] = [
  { path: "/rank/keywords", needsUrl: false, handler: async (ctx) => ({ board: rankBoard(tenantId(ctx)), supplier: supplierFromEnv()?.config ?? null }) },
  { path: "/rank/keywords/add", needsUrl: false, adminOnly: true, handler: async (ctx) => {
    const keyword = str(ctx.body.keyword); if (!keyword) throw new Error("Mot-clÃ© requis.");
    const { addRankKeyword } = await import("./ops-store.js");
    return { keyword: addRankKeyword(tenantId(ctx), keyword, str(ctx.body.locale) ?? "fr-fr") };
  } },
  { path: "/rank/keywords/remove", needsUrl: false, adminOnly: true, handler: async (ctx) => { const id = str(ctx.body.id); if (!id) throw new Error("id requis."); if (!removeRankKeyword(tenantId(ctx), id)) throw new Error("Mot-clÃ© introuvable."); return { removed: true }; } },
  { path: "/rank/check", needsUrl: false, adminOnly: true, handler: async (ctx) => {
    const supplier = supplierFromEnv();
    if (!supplier) throw new Error(noSupplierError());
    const limit = Number(ctx.body.limit ?? 25);
    const { checked, outcomes } = await runRankCheck(tenantId(ctx), tenantHost(ctx), supplier.supplier, Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 50) : 25);
    return { checked, outcomes };
  } },
];

/* ---------------- T-9/T-10: article pipeline + WordPress ---------------- */

export const contentRoutes: ConsoleRoute[] = [
  { path: "/content/brief", needsUrl: false, handler: async (ctx) => {
    const keyword = str(ctx.body.keyword); if (!keyword) throw new Error("Mot-clÃ© requis.");
    return { brief: buildBrief({ keyword, audience: str(ctx.body.audience), brand: str(ctx.body.brand), existingHeadings: Array.isArray(ctx.body.existingHeadings) ? (ctx.body.existingHeadings as unknown[]).filter((h): h is string => typeof h === "string") : undefined }) };
  } },
  { path: "/content/draft", needsUrl: false, adminOnly: true, handler: async (ctx) => {
    const keyword = str(ctx.body.keyword); if (!keyword) throw new Error("Mot-clÃ© requis.");
    const brief = buildBrief({ keyword, audience: str(ctx.body.audience), brand: str(ctx.body.brand) });
    const mode: DraftMode = ctx.body.mode === "ollama" ? "ollama" : "deterministic";
    const ollama = mode === "ollama" ? (process.env.OLLAMA_URL ? { url: process.env.OLLAMA_URL, model: process.env.OLLAMA_MODEL || "mistral" } : null) : null;
    if (mode === "ollama" && !ollama) throw new Error("Mode Ollama demandÃ© mais OLLAMA_URL n'est pas configurÃ©.");
    const draft = await produceDraft(brief, mode, { ollama });
    articleAlert(tenantId(ctx), draft, "Brouillon gÃ©nÃ©rÃ©");
    return { draft };
  } },
  { path: "/content/publish", needsUrl: false, adminOnly: true, handler: async (ctx) => {
    const draft = ctx.body.draft as { title?: string; slug?: string; body?: string; gates?: Array<{ passed: boolean }>; approved?: boolean } | undefined;
    if (!draft || typeof draft.title !== "string" || typeof draft.slug !== "string" || typeof draft.body !== "string") throw new Error("Draft requis (title, slug, body).");
    if (draft.approved !== true) throw new Error("Le brouillon doit être confirmé explicitement avant son enregistrement dans WordPress.");
    const failed = (draft.gates ?? []).filter((g) => !g.passed);
    if (failed.length) throw new Error(`Quality gates non passÃ©s : ${failed.map((g) => (g as { check?: string }).check ?? "?").join(", ")}. Corrigez le brouillon avant publication.`);
    const config = wpConfigFromEnv(tenantId(ctx));
    if (!config) throw new Error("WordPress non configurÃ© pour ce client (WP_SITE_URL_<TENANT>, WP_USERNAME_<TENANT>, WP_APP_PASSWORD_<TENANT>).");
    const result = await publishToWordPress(config, { title: draft.title, slug: draft.slug, body: draft.body });
    if (!result.ok) { articleAlert(tenantId(ctx), draft, "Échec de création du brouillon WordPress"); throw new Error(result.error); }
    // The WordPress adapter always creates status=draft: never announce its URL to IndexNow.
    // This legacy route is not the future Mode Appliquer approval/write adapter.
    articleAlert(tenantId(ctx), draft, "Brouillon WordPress créé");
    return { created: true, published: false, publicationStatus: "draft", postId: result.postId,
      postUrl: routeLink(config.siteUrl, result.link), indexNow: null };
  } },
];

function routeLink(siteUrl: string, link: string): string { return link; }

/* ---------------- T-11: alerts + automation config ---------------- */

export const opsRoutes: ConsoleRoute[] = [
  { path: "/ops/alerts", needsUrl: false, handler: async (ctx) => ({ alerts: listAlerts(tenantId(ctx), false) }) },
  { path: "/ops/alerts/ack", needsUrl: false, adminOnly: true, handler: async (ctx) => { const id = str(ctx.body.id); if (!id) throw new Error("id requis."); if (!acknowledgeAlert(tenantId(ctx), id)) throw new Error("Alerte introuvable."); return { acknowledged: true }; } },
  { path: "/ops/automation", needsUrl: false, adminOnly: true, handler: async (ctx) => readAutomationConfig(tenantId(ctx)) },
  { path: "/ops/automation/save", needsUrl: false, adminOnly: true, handler: async (ctx) => {
    const current = readAutomationConfig(tenantId(ctx));
    const next = {
      promptChecks: typeof ctx.body.promptChecks === "object" && ctx.body.promptChecks ? {
        enabled: Boolean((ctx.body.promptChecks as Record<string, unknown>).enabled),
        intervalHours: Math.min(Math.max(Number((ctx.body.promptChecks as Record<string, unknown>).intervalHours) || 24, 1), 168),
        engines: Array.isArray((ctx.body.promptChecks as Record<string, unknown>).engines) ? ((ctx.body.promptChecks as Record<string, unknown>).engines as unknown[]).filter((e): e is string => e === "openai" || e === "gemini") : current.promptChecks?.engines ?? ["openai"],
      } : current.promptChecks,
      rankChecks: typeof ctx.body.rankChecks === "object" && ctx.body.rankChecks ? {
        enabled: Boolean((ctx.body.rankChecks as Record<string, unknown>).enabled),
        intervalHours: Math.min(Math.max(Number((ctx.body.rankChecks as Record<string, unknown>).intervalHours) || 72, 1), 336),
      } : current.rankChecks,
      lastPromptRun: current.lastPromptRun,
      lastRankRun: current.lastRankRun,
    };
    writeAutomationConfig(tenantId(ctx), next);
    return { automation: next };
  } },
];

/** All operations routes, mounted by allConsoleRoutes(). */
export const operationsRoutes: ConsoleRoute[] = [...visibilityRoutes, ...rankRoutes, ...contentRoutes, ...opsRoutes];
