import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_PROVIDERS, collectProvider, parseProviderAnswer, providerConfig, type AIProvider } from "../src/console/ai-visibility-providers.js";
import { normalizeImport } from "../src/console/ai-visibility.js";
const body = { confirmed: true, brands: [{ name: "Alpha" }], prompts: ["Who should I choose?"] };
const fixtures = {
  claude: { stop_reason: "end_turn", content: [{ type: "web_search_tool_result", content: [] }, { type: "text", text: " Alpha is useful.", citations: [{ type: "web_search_result_location", url: "https://example.org/" }] }] },
  mistral: { outputs: [{ type: "tool.execution", name: "web_search" }, { type: "message.output", role: "assistant", content: [{ type: "text", text: "Alpha is useful." }, { type: "tool_reference", url: "https://example.org/", tool: "web_search" }] }] },
  grok: { status: "completed", output: [{ type: "web_search_call", status: "completed" }, { type: "message", status: "completed", content: [{ type: "output_text", text: "😀 Alpha [1]", annotations: [{ type: "url_citation", url: "https://example.org/", start_index: 8, end_index: 11 }] }] }] },
};
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe.each(Object.keys(AI_PROVIDERS) as AIProvider[])("%s API collection", provider => {
  it("validates consent, brand panel, prompts and key before any provider call", async () => {
    const fetcher = vi.fn();
    for (const invalid of [{ ...body, confirmed: false }, { ...body, brands: [{ name: "Al" }] }, { ...body, prompts: ["same", "same"] }, { ...body, prompts: Array.from({ length: 6 }, (_, i) => String(i)) }]) await expect(collectProvider(provider, invalid, "fixture-key", undefined, fetcher)).rejects.toThrow();
    await expect(collectProvider(provider, body, "", undefined, fetcher)).rejects.toThrow(/key/);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses the official endpoint and tenant key, preserves inline citations and partial successes", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(fixtures[provider]))).mockResolvedValueOnce(new Response("do not echo secret", { status: 429 }));
    const result = await collectProvider(provider, { ...body, prompts: ["First?", "Second?"] }, "fixture-key", undefined, fetcher);
    expect(fetcher.mock.calls[0][0]).toBe(AI_PROVIDERS[provider].endpoint);
    const options = fetcher.mock.calls[0][1];
    expect(options.headers[provider === "claude" ? "x-api-key" : "Authorization"]).toBe(provider === "claude" ? "fixture-key" : "Bearer fixture-key");
    expect(options.redirect).toBe("error"); expect(options.signal).toBeInstanceOf(AbortSignal);
    const payload = JSON.parse(options.body); expect(payload.tools[0].type).toMatch(/web_search/);
    expect(payload.model).toBe(AI_PROVIDERS[provider].model);
    if (provider === "mistral") expect(payload).toMatchObject({ store: false, inputs: "First?", completion_args: { max_tokens: 1500 } });
    expect(result.successes).toHaveLength(1); expect(result.failures).toEqual([{ prompt: "Second?", reason: "HTTP 429" }]);
    expect(result.successes[0].source).toContain(`${AI_PROVIDERS[provider].name} API + web search`);
    const saved = normalizeImport({ brands: body.brands, responses: result.successes });
    expect(saved.observations[0].citations).toEqual(["https://example.org/"]);
    const span = saved.observations[0].citationSpans![0]; expect(saved.observations[0].answer.slice(span.start, span.end)).toBe("[1]");
    expect(JSON.stringify(result)).not.toMatch(/fixture-key|do not echo secret/);
  });
  it("never echoes provider exception bodies or retries failed requests", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("fixture-key inside transport error"));
    const result = await collectProvider(provider, body, "fixture-key", undefined, fetcher);
    expect(result.successes).toHaveLength(0); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("fixture-key");
  });
  it("uses only the selected tenant's key and optional model", () => {
    vi.stubEnv(`AI_VISIBILITY_${provider.toUpperCase()}_KEY_ACME`, "fixture-key");
    vi.stubEnv(`AI_VISIBILITY_${provider.toUpperCase()}_MODEL_ACME`, "model-version");
    expect(providerConfig(provider, "acme")).toMatchObject({ key: "fixture-key", model: "model-version" });
    expect(providerConfig(provider, "globex").key).toBe("");
  });
});
it("rejects incomplete Claude turns and tool errors even on HTTP 200", () => {
  expect(() => parseProviderAnswer("claude", { ...fixtures.claude, stop_reason: "pause_turn" })).toThrow();
  expect(() => parseProviderAnswer("claude", { ...fixtures.claude, content: [...fixtures.claude.content, { type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "unavailable" } }] })).toThrow();
});
it("does not turn uncited answers into search observations or accept citation-only answers", () => {
  expect(parseProviderAnswer("mistral", { outputs: [{ type: "message.output", content: "Alpha is useful." }] }).searchUsed).toBe(false);
  expect(() => parseProviderAnswer("mistral", { outputs: [{ type: "message.output", content: [{ type: "tool_reference", url: "https://example.org" }] }] })).toThrow();
  expect(() => parseProviderAnswer("mistral", { outputs: [{ type: "tool.execution", name: "web_search" }] })).toThrow();
});
it("rejects unsafe citations and invalid Unicode citation offsets", () => {
  expect(() => parseProviderAnswer("mistral", { outputs: [{ type: "message.output", content: [{ type: "text", text: "Alpha" }, { type: "tool_reference", url: "javascript:alert(1)" }] }] })).toThrow();
  expect(() => parseProviderAnswer("grok", { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "Alpha", annotations: [{ type: "url_citation", url: "https://example.org", start_index: 0, end_index: 99 }] }] }] })).toThrow();
});
