/** Native AI tracker — official API providers. Always labelled api-approximation, never consumer-ui. */
import type { CollectedAnswer } from "./types.js";

export interface ApiProviderConfig { engine: string; endpoint: string; model: string; keyVariable: string; toolName: string }

export const API_PROVIDERS: Record<string, ApiProviderConfig> = {
  openai: { engine: "chatgpt", endpoint: "https://api.openai.com/v1/responses", model: "gpt-4.1-mini", keyVariable: "AI_TRACKER_OPENAI_KEY", toolName: "web_search" },
  anthropic: { engine: "claude", endpoint: "https://api.anthropic.com/v1/messages", model: "claude-sonnet-4-6", keyVariable: "AI_TRACKER_ANTHROPIC_KEY", toolName: "web_search" },
  gemini: { engine: "gemini", endpoint: "https://generativelanguage.googleapis.com/v1beta/models", model: "gemini-2.0-flash", keyVariable: "AI_TRACKER_GEMINI_KEY", toolName: "google_search" },
  mistral: { engine: "mistral", endpoint: "https://api.mistral.ai/v1/conversations", model: "mistral-medium-latest", keyVariable: "AI_TRACKER_MISTRAL_KEY", toolName: "web_search" },
  perplexity: { engine: "perplexity", endpoint: "https://api.perplexity.ai/chat/completions", model: "sonar", keyVariable: "AI_TRACKER_PERPLEXITY_KEY", toolName: "sonar" },
};
export type ApiProviderId = keyof typeof API_PROVIDERS;
type ObjectValue = Record<string, unknown>;
const object = (v: unknown): ObjectValue => v && typeof v === "object" && !Array.isArray(v) ? v as ObjectValue : {};
const array = (v: unknown): ObjectValue[] => Array.isArray(v) ? v.map(object) : [];
const text = (v: unknown): string => typeof v === "string" ? v : "";

export function providerKey(provider: ApiProviderId): string { return process.env[API_PROVIDERS[provider].keyVariable] ?? ""; }

/** One collector per provider: raw text, native citations, and fan-out searches when exposed. */
export async function collectViaApi(provider: ApiProviderId, prompt: string, transport: typeof fetch = fetch, modelOverride?: string): Promise<CollectedAnswer> {
  const config = API_PROVIDERS[provider];
  const key = providerKey(provider);
  const model = modelOverride ?? process.env[`${config.keyVariable}_MODEL`] ?? config.model;
  if (!key) throw new Error(`Provider ${provider} is not configured: ${config.keyVariable} is unset`);
  if (!/^[a-zA-Z0-9._:-]{1,70}$/.test(model)) throw new Error("Invalid provider model configuration");
  const startedAt = new Date().toISOString();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (provider === "anthropic") { headers["x-api-key"] = key; headers["anthropic-version"] = "2023-06-01"; }
  else if (provider === "gemini") headers["x-goog-api-key"] = key;
  else headers.Authorization = `Bearer ${key}`;

  let url = config.endpoint, body: ObjectValue;
  if (provider === "openai") body = { model, input: [{ role: "user", content: prompt }], store: false, max_output_tokens: 1500, tools: [{ type: "web_search" }] };
  else if (provider === "anthropic") body = { model, max_tokens: 1500, messages: [{ role: "user", content: prompt }], tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }] };
  else if (provider === "gemini") { url = `${config.endpoint}/${model}:generateContent`; body = { contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ googleSearch: {} }] }; }
  else if (provider === "mistral") body = { model, inputs: prompt, store: false, stream: false, tools: [{ type: "web_search" }], completion_args: { max_tokens: 1500 } };
  else body = { model, messages: [{ role: "user", content: prompt }] };

  const response = await transport(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(60000), redirect: "error" });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${provider}`);
  const raw: ObjectValue = object(await response.json());
  const answer = extractAnswer(provider, raw);
  if (!answer.rawText.trim()) throw new Error(`No usable answer from ${provider}`);
  return {
    engine: config.engine, provider, collectionMode: "api-approximation",
    rawText: answer.rawText, citations: answer.citations, fanOut: answer.fanOut,
    model: answer.exposedModel || model, startedAt, finishedAt: new Date().toISOString(),
  };
}

interface ExtractedAnswer { rawText: string; citations: Array<{ url: string; title?: string }>; fanOut: string[]; exposedModel: string }

function extractAnswer(provider: ApiProviderId, raw: ObjectValue): ExtractedAnswer {
  const result: ExtractedAnswer = { rawText: "", citations: [], fanOut: [], exposedModel: text(raw.model) };
  const pushUrl = (value: unknown, title?: unknown) => {
    const url = text(value);
    try { const parsed = new URL(url); if (!["https:", "http:"].includes(parsed.protocol)) return; const href = parsed.href; if (result.citations.length < 100 && !result.citations.some(c => c.url === href)) result.citations.push({ url: href, ...(typeof title === "string" && title ? { title } : {}) }); } catch { /* not a citation */ }
  };
  if (provider === "openai") {
    if (raw.status !== "completed") throw new Error("Incomplete answer");
    for (const item of array(raw.output)) {
      if (item.type === "web_search_call") { if (text(item.action?.query)) result.fanOut.push(text(item.action.query)); if (item.status !== "completed") throw new Error("Search failed"); }
      if (item.type !== "message") continue;
      for (const part of array(item.content)) {
        if (part.type !== "output_text") continue;
        result.rawText += (result.rawText ? "\n" : "") + text(part.text);
        for (const annotation of array(part.annotations)) if (annotation.type === "url_citation") pushUrl(annotation.url, annotation.title);
      }
    }
  } else if (provider === "anthropic") {
    if (raw.stop_reason !== "end_turn") throw new Error("Incomplete answer");
    for (const block of array(raw.content)) {
      if (block.type === "web_search_tool_result") { if (object(block.content).type === "web_search_tool_result_error") throw new Error("Search failed"); result.fanOut.push(...array(block.content).map(c => text(c.title)).filter(Boolean)); }
      if (block.type !== "text") continue;
      result.rawText += (result.rawText ? "\n" : "") + text(block.text);
      for (const citation of array(block.citations)) if (citation.type === "web_search_result_location") pushUrl(citation.url, citation.title);
    }
  } else if (provider === "gemini") {
    const candidates = array(raw.candidates);
    if (!candidates.length) throw new Error("Incomplete answer");
    for (const part of array(array(candidates[0].content).parts)) {
      if (typeof part.text === "string") result.rawText += part.text;
      const grounding = object(object(part.groundingMetadata).groundingChunks) ?? {};
      for (const chunk of array(grounding)) pushUrl(object(chunk.web).uri, object(chunk.web).title);
    }
  } else if (provider === "mistral") {
    const outputs = array(raw.outputs);
    if (outputs.at(-1)?.type !== "message.output" || outputs.some(o => o.type === "tool.execution" && (o.error || o.status === "failed"))) throw new Error("Incomplete answer");
    for (const output of outputs) if (output.type === "tool.execution" && text(output.name) === "web_search") result.fanOut.push("web_search");
    const final = outputs.at(-1)!;
    if (typeof final.content === "string") result.rawText = final.content;
    else for (const chunk of array(final.content)) { if (chunk.type === "text") result.rawText += text(chunk.text); if (chunk.type === "tool_reference") pushUrl(chunk.url); }
  } else {
    const message = array(raw.choices)[0];
    if (raw.status === "failed" || !message) throw new Error("Incomplete answer");
    result.rawText = text(message.message?.content ?? message.delta?.content);
    for (const citation of array(raw.search_results ?? message.message?.search_results)) pushUrl(citation.url, citation.title);
  }
  return result;
}


/** Engines that have an official consumer-grade API, by provider id. */
export function apiProviderForEngine(engine: string): ApiProviderId | null {
  for (const [id, config] of Object.entries(API_PROVIDERS)) if (config.engine === engine && providerKey(id as ApiProviderId)) return id as ApiProviderId;
  return null;
}
