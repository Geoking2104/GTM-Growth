/** AI visibility from tenant-owned, explicitly imported observations.
 * This first implementation stores one versioned, reviewable panel per import. */
import { resolveAIAccount, accountHeaders, type AICredential } from "./ai-connections.js";
import { createHash, randomUUID } from "node:crypto";
import { validTenantId } from "../tenants/store.js";
import type { ConsoleRoute } from "./util.js";
import { listDatasets, getDataset, insertDataset, updateDataset } from "./ai-visibility-store.js";
import { visualUrl } from "./visual-catalog.js";

type Sentiment = "positive" | "neutral" | "negative" | "mixed" | "unknown";
interface Brand { name: string; aliases: string[]; website?: string; logoUrl?: string }
interface InputResponse { prompt: string; answer: string; source: string; observedAt: string; citations?: string[]; citationSpans?: Array<{ start: number; end: number; url: string }> }
interface Observation extends InputResponse { id: string; mentions: Array<{ brand: string; evidence: string; sentiment: Sentiment; method: string; status?: "confirmed" | "rejected" }> }
export interface Dataset { id: string; createdAt: string; brands: Brand[]; observations: Observation[]; audit?: Array<{ at: string; actor: string; responseId: string; brand: string; status: string; sentiment: string }> }
const LIMIT = 1000;
const clean = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.trim().length <= max ? v.trim() : "";
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pattern = (alias: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(alias)}(?![\\p{L}\\p{N}])`, "iu");
const positive = /\b(excellent|reliable|trusted|great|good|recommandé|fiable|excellent|efficace|utile|satisfaisant)\b/iu;
const negative = /\b(poor|bad|unreliable|expensive|weak|médiocre|mauvais|coûteux|cher|lent|décevant)\b/iu;
const ambiguous = /\b(not|no|never|isn't|isnt|pas|jamais|sans|aucun|aucune|ni)\b/iu;

export function normalizeImport(input: unknown): Dataset {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid import");
  const body = input as Record<string, unknown>;
  if (!Array.isArray(body.brands) || body.brands.length < 1 || body.brands.length > 10 || !Array.isArray(body.responses) || body.responses.length < 1 || body.responses.length > LIMIT) throw new Error("Import requires 1–10 brands and 1–1000 responses");
  const seenAliases = new Set<string>();
  const brands: Brand[] = body.brands.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid brand");
    const b = item as Record<string, unknown>; const name = clean(b.name, 100); const raw = b.aliases ?? [];
    if (!name || name.length < 3 || !Array.isArray(raw) || raw.length > 10) throw new Error("Invalid brand or aliases");
    const aliases = [...new Set([name, ...raw.map((v) => clean(v, 100))])];
    if (aliases.some((a) => a.length < 3)) throw new Error("Aliases must contain at least three characters");
    for (const alias of aliases) { const key = alias.toLocaleLowerCase(); if (seenAliases.has(key)) throw new Error("An alias belongs to multiple brands"); seenAliases.add(key); }
    const website = b.website ? visualUrl(b.website) : null, logoUrl = b.logoUrl ? visualUrl(b.logoUrl) : null;
    if (b.website && !website || b.logoUrl && !logoUrl) throw new Error("Brand website and logo require public HTTPS URLs");
    return { name, aliases, ...(website ? { website } : {}), ...(logoUrl ? { logoUrl } : {}) };
  });
  const hashes = new Set<string>();
  const observations: Observation[] = body.responses.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid response");
    const r = item as Record<string, unknown>; const prompt = clean(r.prompt, 2000), answer = clean(r.answer, 20000), source = clean(r.source, 100), observedAt = clean(r.observedAt, 40);
    if (!prompt || !answer || !source || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(observedAt) || !Number.isFinite(Date.parse(observedAt))) throw new Error("Each response requires prompt, answer, source and an ISO timestamp with timezone");
    const rawCitations = r.citations ?? []; if (!Array.isArray(rawCitations) || rawCitations.length > 100) throw new Error("Invalid citations");
    const citations = rawCitations.map((u) => { if (typeof u !== "string" || u.length > 2048) throw new Error("Invalid citation URL"); let parsed: URL; try { parsed = new URL(u); } catch { throw new Error("Invalid citation URL"); } if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("Invalid citation URL"); return parsed.href; });
    const rawSpans = r.citationSpans ?? []; if (!Array.isArray(rawSpans) || rawSpans.length > 100) throw new Error("Invalid citation spans");
    const citationSpans = rawSpans.map((v) => { if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Invalid citation span"); const span = v as Record<string, unknown>; if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || Number(span.start) < 0 || Number(span.end) <= Number(span.start) || Number(span.end) > answer.length || typeof span.url !== "string" || !citations.includes(span.url)) throw new Error("Invalid citation span"); return { start: Number(span.start), end: Number(span.end), url: span.url }; }).sort((a, b) => a.start - b.start);
    if (citationSpans.some((v, i) => i > 0 && v.start < citationSpans[i - 1].end)) throw new Error("Overlapping citation spans");
    const normalizedDate = new Date(observedAt).toISOString(); const id = createHash("sha256").update(JSON.stringify([prompt, answer, source, normalizedDate])).digest("hex"); if (hashes.has(id)) throw new Error("Duplicate response in import"); hashes.add(id);
    const sentences = answer.split(/(?<=[.!?])\s+|\n+/u).filter(Boolean);
    const mentions = brands.flatMap((brand) => {
      const found = sentences.filter((sentence) => brand.aliases.some((alias) => pattern(alias).test(sentence))); if (!found.length) return [];
      let pos = false, neg = false;
      for (const sentence of found) { const differentBrands = brands.filter((other) => other.aliases.some((alias) => pattern(alias).test(sentence))).length > 1; if (differentBrands || ambiguous.test(sentence)) continue; pos ||= positive.test(sentence); neg ||= negative.test(sentence); }
      const sentiment: Sentiment = pos && neg ? "mixed" : pos ? "positive" : neg ? "negative" : "unknown";
      return [{ brand: brand.name, evidence: found[0].slice(0, 500), sentiment, method: "heuristic-v1-unvalidated" }];
    });
    return { id, prompt, answer, source, observedAt: normalizedDate, citations, citationSpans, mentions };
  });
  return { id: randomUUID(), createdAt: new Date().toISOString(), brands, observations };
}

export function summarize(dataset: Dataset, source = "", brand = "") {
  const activeBrand = dataset.brands.some((b) => b.name === brand) ? brand : dataset.brands[0].name;
  const observations = dataset.observations.filter((r) => !source || r.source === source);
  const counts = dataset.brands.map((b) => ({ brand: b.name, count: observations.filter((r) => r.mentions.some((m) => m.brand === b.name && m.status !== "rejected")).length }));
  const count = counts.find((x) => x.brand === activeBrand)?.count ?? 0; const totalMentions = counts.reduce((n, c) => n + c.count, 0);
  const sentiment = { positive: 0, neutral: 0, negative: 0, mixed: 0, unknown: 0 };
  for (const r of observations) { const m = r.mentions.find((x) => x.brand === activeBrand && x.status !== "rejected"); if (m) sentiment[m.sentiment]++; }
  const days = new Map<string, { date: string; total: number; count: number }>();
  for (const r of observations) { const date = r.observedAt.slice(0, 10), row = days.get(date) ?? { date, total: 0, count: 0 }; row.total++; if (r.mentions.some((m) => m.brand === activeBrand && m.status !== "rejected")) row.count++; days.set(date, row); }
  return { panel: dataset.id, createdAt: dataset.createdAt, brand: activeBrand, brands: dataset.brands, sources: [...new Set(dataset.observations.map((r) => r.source))].sort(), responses: observations, total: observations.length, count, visibility: observations.length ? count / observations.length * 100 : null, shareOfVoice: totalMentions ? count / totalMentions * 100 : null, presenceDenominator: totalMentions, counts, sentiment, trend: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}
/** One bounded, explicit Gemini collection. No key is returned, logged or stored. */
export async function collectGemini(input: unknown, key: string, transport: typeof fetch = fetch) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid collection request");
  const body = input as Record<string, unknown>;
  if (body.confirmed !== true || !Array.isArray(body.prompts) || body.prompts.length < 1 || body.prompts.length > 5) throw new Error("Confirm 1–5 prompts before collection");
  const prompts = body.prompts.map((v) => clean(v, 2000));
  if (prompts.some((p) => !p) || new Set(prompts).size !== prompts.length) throw new Error("Prompts must be nonempty and unique");
  // Validate all local data before making any billable call.
  normalizeImport({ brands: body.brands, responses: prompts.map((prompt) => ({ prompt, answer: "Validation", source: "validation", observedAt: "2026-01-01T00:00:00Z" })) });
  if (!key) throw new Error("Client Gemini key is not configured");
  const successes: InputResponse[] = []; const failures: Array<{ prompt: string; reason: string }> = [];
  for (const prompt of prompts) {
    try {
      const response = await transport("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }), signal: AbortSignal.timeout(25000), redirect: "error" });
      if (!response.ok) { failures.push({ prompt, reason: `HTTP ${response.status}` }); continue; }
      const result = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> }; groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string } }> } }> };
      const candidate = result.candidates?.[0]; const answer = candidate?.content?.parts?.filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("\n").trim();
      if (!answer || answer.length > 20000) { failures.push({ prompt, reason: "No usable answer" }); continue; }
      const citations = (candidate?.groundingMetadata?.groundingChunks ?? []).flatMap((chunk) => { try { const u = new URL(chunk.web?.uri ?? ""); return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password ? [u.href] : []; } catch { return []; } }).slice(0, 100);
      successes.push({ prompt, answer, source: "Gemini API + Google Search (gemini-2.5-flash)", observedAt: new Date().toISOString(), citations });
    } catch { failures.push({ prompt, reason: "Request failed or timed out" }); }
  }
  return { successes, failures, brands: body.brands };
}
export async function collectOpenAI(input: unknown, key: string, transport: typeof fetch = fetch, account?: AICredential) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid collection request");
  const body = input as Record<string, unknown>;
  if (body.confirmed !== true || !Array.isArray(body.prompts) || body.prompts.length < 1 || body.prompts.length > 5) throw new Error("Confirm 1–5 prompts before collection");
  const prompts = body.prompts.map((v) => clean(v, 2000));
  if (prompts.some((p) => !p) || new Set(prompts).size !== prompts.length) throw new Error("Prompts must be nonempty and unique");
  normalizeImport({ brands: body.brands, responses: prompts.map((prompt) => ({ prompt, answer: "Validation", source: "validation", observedAt: "2026-01-01T00:00:00Z" })) });
  if (!key) throw new Error("Client OpenAI key is not configured");
  const successes: InputResponse[] = []; const failures: Array<{ prompt: string; reason: string }> = [];
  for (const prompt of prompts) {
    try {
      const response = await transport("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", ...accountHeaders("openai", account || { key }) }, body: JSON.stringify({ model: "gpt-4.1-mini", store: false, input: prompt, max_output_tokens: 1500, tools: [{ type: "web_search" }] }), signal: AbortSignal.timeout(25000), redirect: "error" });
      if (!response.ok) { failures.push({ prompt, reason: `HTTP ${response.status}` }); continue; }
      const result = await response.json() as { status?: string; output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string; annotations?: Array<{ type?: string; url?: string; start_index?: number; end_index?: number }> }> }> };
      if (result.status !== "completed") { failures.push({ prompt, reason: "Incomplete response" }); continue; }
      let answer = ""; const spans: Array<{ start: number; end: number; url: string }> = []; let invalid = false;
      for (const part of (result.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? [])) {
        if (part.type !== "output_text" || typeof part.text !== "string") continue;
        if (answer) answer += "\n"; const offset = answer.length; answer += part.text;
        for (const annotation of part.annotations ?? []) {
          if (annotation.type !== "url_citation") continue;
          try {
            const url = new URL(annotation.url ?? ""); const start = annotation.start_index, end = annotation.end_index;
            if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !Number.isInteger(start) || !Number.isInteger(end) || start! < 0 || end! <= start! || end! > part.text.length) { invalid = true; continue; }
            spans.push({ start: offset + start!, end: offset + end!, url: url.href });
          } catch { invalid = true; }
        }
      }
      const leading = answer.length - answer.trimStart().length;
      const trimmed = answer.trim();
      for (const span of spans) { span.start -= leading; span.end -= leading; if (span.start < 0 || span.end > trimmed.length) invalid = true; }
      answer = trimmed;
      spans.sort((a, b) => a.start - b.start); if (spans.some((span, i) => i > 0 && span.start < spans[i - 1].end)) invalid = true;
      if (!answer.trim() || answer.length > 20000 || invalid) { failures.push({ prompt, reason: "No usable answer or citation metadata" }); continue; }
      successes.push({ prompt, answer, source: "OpenAI API + web search (gpt-4.1-mini)", observedAt: new Date().toISOString(), citations: [...new Set(spans.map((span) => span.url))], citationSpans: spans });
    } catch { failures.push({ prompt, reason: "Request failed or timed out" }); }
  }
  return { successes, failures, brands: body.brands };
}
function openAIKey(tenantId: string) { if (!validTenantId(tenantId)) return ""; return process.env[`AI_VISIBILITY_OPENAI_KEY_${tenantId.toUpperCase().replace(/-/g, "_")}`] ?? ""; }
function geminiKey(tenantId: string) { if (!validTenantId(tenantId)) return ""; return process.env[`AI_VISIBILITY_GEMINI_KEY_${tenantId.toUpperCase().replace(/-/g, "_")}`] ?? ""; }
const tenant = (ctx: { tenancy?: { tenant: { id: string } | null } }) => { if (!ctx.tenancy?.tenant) throw new Error("Select a tenant"); return ctx.tenancy.tenant.id; };
export const aiVisibilityRoutes: ConsoleRoute[] = [
  { path: "/ai-visibility/gemini-status", needsUrl: false, adminOnly: true, handler: async (ctx) => ({ configured: Boolean(geminiKey(tenant(ctx))), enabled: false, model: "gemini-2.5-flash", maxCalls: 5 }) },
  // Fail closed until Search Suggestions can be safely displayed alongside the response.
  { path: "/ai-visibility/gemini-run", needsUrl: false, adminOnly: true, handler: async () => { throw new Error("Gemini Search is disabled pending compliant Search Suggestions display"); } },
  { path: "/ai-visibility/openai-status", needsUrl: false, adminOnly: true, handler: async (ctx) => ({ configured: Boolean(openAIKey(tenant(ctx))), model: "gpt-4.1-mini", maxCalls: 5 }) },
  { path: "/ai-visibility/openai-run", needsUrl: false, adminOnly: true, handler: async (ctx) => { const tenantId = tenant(ctx), account = resolveAIAccount(tenantId, "openai", ctx.body.accountId), result = await collectOpenAI(ctx.body, account.key, fetch, account); if (!result.successes.length) return { id: null, succeeded: 0, failed: result.failures }; const dataset = normalizeImport({ brands: result.brands, responses: result.successes }); insertDataset(tenantId, dataset); return { id: dataset.id, succeeded: result.successes.length, failed: result.failures }; } },
  { path: "/ai-visibility/import-preview", needsUrl: false, adminOnly: true, handler: async ({ body }) => { const data = normalizeImport(body); return { brands: data.brands, count: data.observations.length, sources: [...new Set(data.observations.map((r) => r.source))], warning: "Heuristic sentiment requires human review; no external calls." }; } },
  { path: "/ai-visibility/import", needsUrl: false, adminOnly: true, handler: async (ctx) => { const data = normalizeImport(ctx.body); insertDataset(tenant(ctx), data); return { id: data.id, count: data.observations.length }; } },
  { path: "/ai-visibility/datasets", needsUrl: false, handler: async (ctx) => ({ datasets: listDatasets<Dataset>(tenant(ctx)).map(({ id, createdAt, brands, observations }) => ({ id, createdAt, brands, count: observations.length })) }) },
  { path: "/ai-visibility/review", needsUrl: false, adminOnly: true, handler: async (ctx) => {
    const tenantId = tenant(ctx), status = ctx.body.status, sentiment = ctx.body.sentiment;
    if (typeof ctx.body.datasetId !== "string" || (status !== "confirmed" && status !== "rejected") || !["positive", "neutral", "negative", "mixed", "unknown"].includes(String(sentiment))) throw new Error("Invalid review");
    updateDataset<Dataset>(tenantId, ctx.body.datasetId, (data) => {
      const response = data.observations.find((x) => x.id === ctx.body.responseId); const mention = response?.mentions.find((x) => x.brand === ctx.body.brand);
      if (!response || !mention) throw new Error("Invalid review");
      mention.status = status; mention.sentiment = sentiment as Sentiment; mention.method = "human-v1";
      (data.audit ??= []).push({ at: new Date().toISOString(), actor: ctx.user?.sub ?? "unknown", responseId: response.id, brand: mention.brand, status, sentiment: String(sentiment) });
    }); return { ok: true };
  } },
  { path: "/ai-visibility/report", needsUrl: false, handler: async (ctx) => { const selected = typeof ctx.body.datasetId === "string" ? getDataset<Dataset>(tenant(ctx), ctx.body.datasetId) : undefined; if (!selected) throw new Error("Dataset not found"); return summarize(selected, typeof ctx.body.source === "string" ? ctx.body.source : "", typeof ctx.body.brand === "string" ? ctx.body.brand : ""); } },
];
