import { describe, expect, it } from "vitest";
import { normalizeImport, summarize, collectGemini, collectOpenAI } from "../src/console/ai-visibility.js";
const input = { brands: [{ name: "Alpha", aliases: ["Alpha Inc"] }, { name: "Beta", aliases: [] }], responses: [
  { prompt: "Quel service ?", answer: "Alpha est fiable. Beta est lent.", source: "Import A", observedAt: "2026-11-01T12:00:00Z", citations: ["https://example.org/a"] },
  { prompt: "Comparer ?", answer: "Alpha est excellent. Alpha est fiable.", source: "Import A", observedAt: "2026-11-02T12:00:00Z" },
  { prompt: "Autre ?", answer: "Alphabet est excellent.", source: "Import B", observedAt: "2026-11-03T12:00:00Z" },
  { prompt: "Avis ?", answer: "Alpha n'est pas fiable.", source: "Import B", observedAt: "2026-11-04T12:00:00Z" },
] };
describe("AI visibility imported observations", () => {
  it("calculates presence and share using one count per brand and response", () => {
    const result = summarize(normalizeImport(input), "", "Alpha");
    expect(result.total).toBe(4); expect(result.count).toBe(3); expect(result.visibility).toBe(75);
    expect(result.presenceDenominator).toBe(4); expect(result.shareOfVoice).toBe(75);
    expect(result.sentiment).toEqual({ positive: 2, neutral: 0, negative: 0, mixed: 0, unknown: 1 });
    expect(result.responses[2].mentions).toEqual([]);
  });
  it("honors source filtering and preserves missing data", () => {
    const dataset = normalizeImport(input); const a = summarize(dataset, "Import A", "Beta");
    expect(a.total).toBe(2); expect(a.count).toBe(1); expect(a.visibility).toBe(50);
    const empty = summarize(dataset, "unknown", "Beta"); expect(empty.total).toBe(0); expect(empty.visibility).toBeNull(); expect(empty.shareOfVoice).toBeNull();
  });
  it("rejects ambiguous aliases, duplicate answers and unsafe citations", () => {
    expect(() => normalizeImport({ ...input, brands: [{ name: "Alpha" }, { name: "Beta", aliases: ["alpha"] }] })).toThrow(/alias/i);
    expect(() => normalizeImport({ ...input, responses: [input.responses[0], input.responses[0]] })).toThrow(/duplicate/i);
    expect(() => normalizeImport({ ...input, responses: [{ ...input.responses[0], citations: ["javascript:alert(1)"] }] })).toThrow(/citation/i);
  });
  it("does not assign tone to negated or multi-brand sentences", () => {
    const result = normalizeImport({ brands: input.brands, responses: [{ prompt: "Avis ?", answer: "Alpha est excellent, Beta est mauvais. Alpha n'est pas fiable.", source: "A", observedAt: "2026-11-01T12:00:00Z" }] });
    expect(result.observations[0].mentions.map((m) => m.sentiment)).toEqual(["unknown", "unknown"]);
  });
});

describe("client-owned Gemini connector", () => {
  it("never calls a provider before consent and validation", async () => {
    let calls = 0; const mock = (async () => { calls++; return new Response("{}", { status: 200 }); }) as typeof fetch;
    await expect(collectGemini({ brands: [{ name: "Alpha" }], prompts: ["Question?"] }, "client-key", mock)).rejects.toThrow(/confirm/i);
    await expect(collectGemini({ confirmed: true, brands: [{ name: "Al" }], prompts: ["Question?"] }, "client-key", mock)).rejects.toThrow();
    expect(calls).toBe(0);
  });
  it("keeps successful observations and isolates failures", async () => {
    let calls = 0; const mock = (async (_url: string | URL | Request, init?: RequestInit) => { calls++; expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("client-key"); if (calls === 2) return new Response("failed", { status: 429 }); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Alpha est fiable." }] }, groundingMetadata: { groundingChunks: [{ web: { uri: "https://example.org/" } }] } }] }), { status: 200 }); }) as typeof fetch;
    const result = await collectGemini({ confirmed: true, brands: [{ name: "Alpha" }], prompts: ["Première ?", "Deuxième ?"] }, "client-key", mock);
    expect(calls).toBe(2); expect(result.successes).toHaveLength(1); expect(result.failures).toHaveLength(1);
    expect(result.successes[0].source).toMatch(/Gemini API/); expect(result.successes[0].citations).toEqual(["https://example.org/"]);
    expect(JSON.stringify(result)).not.toContain("client-key");
  });
});

describe("client-owned OpenAI connector", () => {
  it("requires confirmation, uses a client key and keeps inline citation offsets", async () => {
    let calls = 0;
    const mock = (async (_url: string | URL | Request, init?: RequestInit) => { calls++; expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer client-key"); return new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "  Alpha est fiable.  ", annotations: [{ type: "url_citation", start_index: 2, end_index: 7, url: "https://example.org/" }] }] }] }), { status: 200 }); }) as typeof fetch;
    const body = { brands: [{ name: "Alpha" }], prompts: ["Qui choisir ?"] };
    await expect(collectOpenAI(body, "client-key", mock)).rejects.toThrow(/confirm/i); expect(calls).toBe(0);
    const result = await collectOpenAI({ ...body, confirmed: true }, "client-key", mock);
    expect(calls).toBe(1); expect(result.successes[0].answer).toBe("Alpha est fiable.");
    expect(result.successes[0].citationSpans).toEqual([{ start: 0, end: 5, url: "https://example.org/" }]);
    expect(normalizeImport({ brands: body.brands, responses: result.successes }).observations[0].citationSpans).toEqual(result.successes[0].citationSpans);
    expect(JSON.stringify(result)).not.toContain("client-key");
  });
  it("rejects invalid or overlapping citation spans before storing", () => {
    expect(() => normalizeImport({ ...input, responses: [{ ...input.responses[0], citationSpans: [{ start: 0, end: 1000, url: "https://example.org/a" }] }] })).toThrow(/span/i);
  });
});
