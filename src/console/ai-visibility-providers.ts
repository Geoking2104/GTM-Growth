/** Explicit, bounded API observations; never consumer-app visibility estimates. */
import type { ConsoleRoute } from "./util.js";
import { validTenantId } from "../tenants/store.js";
import { normalizeImport } from "./ai-visibility.js";
import { insertDataset } from "./ai-visibility-store.js";

export const AI_PROVIDERS = {
  claude: { name: "Claude", model: "claude-sonnet-4-6", endpoint: "https://api.anthropic.com/v1/messages" },
  mistral: { name: "Mistral", model: "mistral-medium-latest", endpoint: "https://api.mistral.ai/v1/conversations" },
  grok: { name: "Grok", model: "grok-4.7", endpoint: "https://api.x.ai/v1/responses" },
} as const;
export type AIProvider = keyof typeof AI_PROVIDERS;
type ObjectValue = Record<string, unknown>;
const object = (v: unknown): ObjectValue => v && typeof v === "object" && !Array.isArray(v) ? v as ObjectValue : {};
const array = (v: unknown): ObjectValue[] => Array.isArray(v) ? v.map(object) : [];
const text = (v: unknown) => typeof v === "string" ? v : "";
interface Answer { answer: string; citations: string[]; citationSpans: Array<{ start: number; end: number; url: string }>; searchUsed: boolean }

function citationUrl(value: unknown) {
  const url = new URL(text(value));
  if (text(value).length > 2048 || !["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid citation");
  return url.href;
}
export function parseProviderAnswer(provider: AIProvider, raw: unknown): Answer {
  const data = object(raw), result: Answer = { answer: "", citations: [], citationSpans: [], searchUsed: false };
  let hasText = false;
  const addUrl = (value: unknown) => { const url = citationUrl(value); if (!result.citations.includes(url)) result.citations.push(url); if (result.citations.length > 100) throw new Error("Too many citations"); return url; };
  const reference = (value: unknown) => { const url = addUrl(value), start = result.answer.length; result.answer += ` [${result.citations.indexOf(url) + 1}]`; result.citationSpans.push({ start: start + 1, end: result.answer.length, url }); };
  if (provider === "claude") {
    if (data.stop_reason !== "end_turn") throw new Error("Incomplete answer");
    for (const block of array(data.content)) {
      if (block.type === "web_search_tool_result") {
        if (object(block.content).type === "web_search_tool_result_error") throw new Error("Search failed");
        result.searchUsed = true;
      }
      if (block.type !== "text") continue;
      if (result.answer) result.answer += "\n";
      result.answer += text(block.text);
      hasText ||= Boolean(text(block.text).trim());
      for (const citation of array(block.citations)) if (citation.type === "web_search_result_location") reference(citation.url);
    }
  } else if (provider === "mistral") {
    const outputs = array(data.outputs);
    if (outputs.at(-1)?.type !== "message.output" || outputs.some(o => o.type === "tool.execution" && (o.error || o.status === "failed"))) throw new Error("Incomplete answer");
    result.searchUsed = outputs.some(o => o.type === "tool.execution" && o.name === "web_search");
    // Only the final assistant answer is measured, not intermediate tool commentary.
    const final = outputs.at(-1)!;
    if (final.role && final.role !== "assistant") throw new Error("No assistant answer");
    if (typeof final.content === "string") { result.answer = final.content; hasText = Boolean(final.content.trim()); }
    else for (const chunk of array(final.content)) {
      if (chunk.type === "text") { result.answer += text(chunk.text); hasText ||= Boolean(text(chunk.text).trim()); }
      if (chunk.type === "tool_reference") reference(chunk.url);
    }
  } else {
    if (data.status !== "completed") throw new Error("Incomplete answer");
    const outputs = array(data.output);
    if (outputs.some(o => o.type === "web_search_call" && o.status !== "completed")) throw new Error("Search failed");
    result.searchUsed = outputs.some(o => o.type === "web_search_call");
    for (const message of outputs.filter(o => o.type === "message")) {
      if (message.status && message.status !== "completed") throw new Error("Incomplete answer");
      for (const part of array(message.content)) {
        if (part.type !== "output_text") continue;
        const content = text(part.text); if (result.answer) result.answer += "\n"; const offset = result.answer.length; result.answer += content;
        hasText ||= Boolean(content.trim());
        for (const annotation of array(part.annotations)) {
          if (annotation.type !== "url_citation") continue;
          const url = addUrl(annotation.url), start = Number(annotation.start_index), end = Number(annotation.end_index);
          if (annotation.start_index === undefined && annotation.end_index === undefined) { reference(url); continue; }
          // xAI offsets use Python's Unicode-code-point convention, not JS UTF-16.
          const points = [...content];
          if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > points.length) throw new Error("Invalid citation offsets");
          result.citationSpans.push({ start: offset + points.slice(0, start).join("").length, end: offset + points.slice(0, end).join("").length, url });
        }
      }
    }
  }
  const leading = result.answer.length - result.answer.trimStart().length;
  result.answer = result.answer.trim();
  for (const span of result.citationSpans) { span.start -= leading; span.end -= leading; }
  result.citationSpans.sort((a, b) => a.start - b.start);
  if (!hasText || !result.answer || result.answer.length > 20000 || result.citationSpans.length > 100 || result.citationSpans.some((s, i) => s.start < 0 || s.end > result.answer.length || i > 0 && s.start < result.citationSpans[i - 1].end)) throw new Error("No usable answer or citation metadata");
  return result;
}

export function providerConfig(provider: AIProvider, tenantId: string) {
  if (!validTenantId(tenantId)) throw new Error("Invalid tenant");
  const suffix = tenantId.toUpperCase().replace(/-/g, "_"), prefix = `AI_VISIBILITY_${provider.toUpperCase()}`;
  const keyVariable = `${prefix}_KEY_${suffix}`, model = process.env[`${prefix}_MODEL_${suffix}`] || AI_PROVIDERS[provider].model;
  if (!/^[a-zA-Z0-9._:-]{1,70}$/.test(model)) throw new Error("Invalid provider model configuration");
  return { key: process.env[keyVariable] || "", keyVariable, model };
}

export async function collectProvider(provider: AIProvider, input: unknown, key: string, model: string = AI_PROVIDERS[provider].model, transport: typeof fetch = fetch) {
  const body = object(input);
  if (body.confirmed !== true || !Array.isArray(body.prompts) || body.prompts.length < 1 || body.prompts.length > 5) throw new Error("Confirm 1–5 prompts before collection");
  const prompts = body.prompts.map(v => text(v).trim());
  if (prompts.some(p => !p || p.length > 2000) || new Set(prompts).size !== prompts.length) throw new Error("Prompts must be nonempty, unique and at most 2000 characters");
  normalizeImport({ brands: body.brands, responses: prompts.map(prompt => ({ prompt, answer: "Validation", source: "validation", observedAt: "2026-01-01T00:00:00Z" })) });
  if (!key) throw new Error(`Client ${AI_PROVIDERS[provider].name} key is not configured`);
  if (!/^[a-zA-Z0-9._:-]{1,70}$/.test(model)) throw new Error("Invalid provider model configuration");
  const successes = [], failures: Array<{ prompt: string; reason: string }> = [];
  for (const prompt of prompts) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json", ...(provider === "claude" ? { "x-api-key": key, "anthropic-version": "2023-06-01" } : { Authorization: `Bearer ${key}` }) };
      const payload = provider === "claude" ? { model, max_tokens: 1500, messages: [{ role: "user", content: prompt }], tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }] }
        : provider === "mistral" ? { model, inputs: prompt, store: false, stream: false, tools: [{ type: "web_search" }], completion_args: { max_tokens: 1500 } }
        : { model, input: [{ role: "user", content: prompt }], store: false, max_output_tokens: 1500, tools: [{ type: "web_search" }] };
      const response = await transport(AI_PROVIDERS[provider].endpoint, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(25000), redirect: "error" });
      if (!response.ok) { failures.push({ prompt, reason: `HTTP ${response.status}` }); continue; }
      const parsed = parseProviderAnswer(provider, await response.json());
      const observation = { prompt, answer: parsed.answer, citations: parsed.citations, citationSpans: parsed.citationSpans, source: `${AI_PROVIDERS[provider].name} API${parsed.searchUsed ? " + web search" : ""} (${model})`, observedAt: new Date().toISOString() };
      normalizeImport({ brands: body.brands, responses: [observation] });
      successes.push(observation);
    } catch { failures.push({ prompt, reason: "Request failed, timed out, or returned an incomplete answer/citations" }); }
  }
  return { successes, failures, brands: body.brands };
}
const running = new Set<string>();
export const aiProviderRoutes: ConsoleRoute[] = (Object.keys(AI_PROVIDERS) as AIProvider[]).flatMap(provider => [
  { path: `/ai-visibility/${provider}-status`, needsUrl: false, adminOnly: true, handler: async ctx => {
    if (!ctx.tenancy?.tenant) throw new Error("Select a tenant");
    const { key, ...config } = providerConfig(provider, ctx.tenancy.tenant.id);
    return { ...config, configured: Boolean(key), enabled: true, maxCalls: 5, name: AI_PROVIDERS[provider].name };
  } },
  { path: `/ai-visibility/${provider}-run`, needsUrl: false, adminOnly: true, handler: async ctx => {
    if (!ctx.tenancy?.tenant) throw new Error("Select a tenant");
    const id = ctx.tenancy.tenant.id, lock = `${id}:${provider}`;
    if (running.has(lock)) throw new Error("A collection is already running for this provider and workspace");
    const config = providerConfig(provider, id); running.add(lock);
    try {
      const result = await collectProvider(provider, ctx.body, config.key, config.model);
      if (!result.successes.length) return { id: null, succeeded: 0, failed: result.failures };
      const dataset = normalizeImport({ brands: result.brands, responses: result.successes }); insertDataset(id, dataset);
      return { id: dataset.id, succeeded: result.successes.length, failed: result.failures };
    } finally { running.delete(lock); }
  } },
]);
