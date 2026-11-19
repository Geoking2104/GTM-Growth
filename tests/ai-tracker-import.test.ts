import { describe, expect, it } from "vitest";
import { parseCsv, normalizeTrackerExport, parseTrackerProvider, MAX_TRACKER_PAYLOAD_CHARS } from "../src/console/ai-tracker-import.js";
import { shareOfVoiceView } from "../src/console/ai-share-of-voice.js";
import { normalizeImport } from "../src/console/ai-visibility.js";

const brands = [{ name: "Alpha", aliases: [] }, { name: "Beta", aliases: [] }];

describe("AI visibility tracker import connectors (R1)", () => {
  it("parses RFC-4180 CSV with BOM, CRLF, quoted fields and escaped quotes", () => {
    const csv = "\uFEFF\"Prompt, said the\",\"Answer \"\"ok\"\", avec virgule\"\r\nQ1,\"Ligne\nen deux\",2026-11-01T09:00:00Z\r\nQ2,\"Suite\",2026-11-02T10:00:00Z";
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(["Prompt, said the", "Answer \"ok\", avec virgule"]);
    expect(rows[1]).toEqual(["Q1", "Ligne\nen deux", "2026-11-01T09:00:00Z"]);
    expect(rows[2]).toEqual(["Q2", "Suite", "2026-11-02T10:00:00Z"]);
    expect(() => parseCsv("a,\"unterminated\nc")).toThrow(/quoted/i);
  });

  it("maps a Meteoria CSV export with French headers, multi-URL citations and partial dates", () => {
    const payload = ["Question posée,Réponse,Date de l'observation,Plateforme,Citations,Nb tokens",
      "\"Quel CRM choisir ?\",Alpha est fiable pour les PME.,01/11/2026,ChatGPT,\"https://example.org/a;https://example.net/b\",42",
      "\"Et pour le SEO ?\",Beta est lent mais éprouvé.,2026-11-02T08:30:00Z,Perplexity,https://example.org/c,7"].join("\n");
    const parsed = normalizeTrackerExport({ provider: "meteoria", format: "csv", payload, brands });
    expect(parsed.meta.rows).toBe(2);
    expect(parsed.meta.engines).toEqual(["ChatGPT", "Perplexity"]);
    expect(parsed.meta.ignoredColumns).toEqual(["Nb tokens"]);
    expect(parsed.meta.normalisedDates).toBe(1);
    const dataset = normalizeImport(parsed.body);
    expect(dataset.observations[0].source).toBe("Meteoria import (ChatGPT)");
    expect(dataset.observations[0].observedAt).toBe("2026-11-01T00:00:00.000Z");
    expect(dataset.observations[0].citations).toEqual(["https://example.org/a", "https://example.net/b"]);
    expect(dataset.observations[0].mentions.map((m) => m.brand)).toEqual(["Alpha"]);
    expect(dataset.observations[1].mentions.map((m) => m.brand)).toEqual(["Beta"]);
    expect(dataset.brands.map((b) => b.name)).toEqual(["Alpha", "Beta"]);
  });

  it("maps a Peec CSV with an engine column and mixed citation separators", () => {
    const payload = ["Search Query,AI Answer,Answer Date,Model,Cited URLs",
      "Comparer les hébergeurs,Alpha est recommandé.,2026-10-05,Gemini,https://host.example/x|https://other.example/y",
      "Prix ?,Beta est cher.,2026-10-06,Claude,https://host.example/z"].join("\n");
    const parsed = normalizeTrackerExport({ provider: "peec", format: "csv", payload, brands });
    expect(parsed.meta.engines).toEqual(["Gemini", "Claude"]);
    const dataset = normalizeImport(parsed.body);
    expect(dataset.observations[1].source).toBe("Peec AI import (Claude)");
    expect(dataset.observations[0].citations).toEqual(["https://host.example/x", "https://other.example/y"]);
  });

  it("maps a Qwairy JSON export (accents, list links) and a Profound JSON array", () => {
    const qwairy = JSON.stringify({ rows: [{ "Requête": "Meilleur outil ?", "Réponse": "Alpha est fiable.", "Date de réponse": "15/10/2026 09:30", Moteur: "Le Chat", Liens: ["https://example.org/a", ""] }] });
    const parsedQ = normalizeTrackerExport({ provider: "qwairy", format: "json", payload: qwairy, brands });
    expect(parsedQ.meta.engines).toEqual(["Le Chat"]);
    expect(parsedQ.meta.ignoredColumns).toEqual([]);
    const datasetQ = normalizeImport(parsedQ.body);
    expect(datasetQ.observations[0].source).toBe("Qwairy import (Le Chat)");
    expect(datasetQ.observations[0].observedAt).toBe("2026-10-15T09:30:00.000Z");
    expect(datasetQ.observations[0].citations).toEqual(["https://example.org/a"]);

    const profound = JSON.stringify([{ question: "Which CRM?", answer: "Alpha is reliable.", date: "2026-11-10", model: "GPT-4o", citations: ["https://example.com/a", "https://example.com/b"], tracking_id: "x1" }]);
    const parsedP = normalizeTrackerExport({ provider: "profound", format: "json", payload: profound, brands });
    const datasetP = normalizeImport(parsedP.body);
    expect(datasetP.observations[0].source).toBe("Profound import (GPT-4o)");
    expect(datasetP.observations[0].citations).toEqual(["https://example.com/a", "https://example.com/b"]);
    expect(parsedP.meta.ignoredColumns).toEqual(["tracking_id"]);
    expect(parsedP.meta.normalisedDates).toBe(1);
  });

  it("fails closed per row and on unknown providers, formats and payloads", () => {
    expect(parseTrackerProvider("peec")).toBe("peec");
    expect(parseTrackerProvider("peec-ai")).toBeNull();
    expect(() => normalizeTrackerExport({ provider: "scrunch", format: "csv", payload: "Prompt,Answer,Date\nQ?,A,2026-11-01", brands })).toThrow(/provider/i);
    expect(() => normalizeTrackerExport({ provider: "peec", format: "xlsx", payload: "x", brands })).toThrow(/format/i);
    expect(() => normalizeTrackerExport({ provider: "peec", format: "csv", payload: "", brands })).toThrow(/payload/i);
    expect(() => normalizeTrackerExport({ provider: "peec", format: "csv", payload: "Prompt,Answer,Date\nQ?,A,2026-11-01", brands: [] })).toThrow(/brand/i);
    expect(() => normalizeTrackerExport({ provider: "peec", format: "csv", payload: "Prompt,Answer,Date\nQ?,A,2026-13-01", brands })).toThrow(/Row 2.*date/i);
    expect(() => normalizeTrackerExport({ provider: "peec", format: "csv", payload: "Prompt,Answer,Date\nQ1,A1,2026-11-01\n,A2,2026-11-02", brands })).toThrow(/Row 3/i);
    expect(() => normalizeTrackerExport({ provider: "peec", format: "csv", payload: "Token,Weight\nQ?,12", brands })).toThrow(/recognised column/i);
    expect(() => normalizeTrackerExport({ provider: "peec", format: "json", payload: "{}", brands })).toThrow(/rows|array/i);
    expect(() => normalizeTrackerExport({ provider: "peec", format: "json", payload: JSON.stringify([{ Prompt: "Q?", Answer: "A" }]), brands })).toThrow(/Row 1/i);
    expect(() => normalizeTrackerExport({ provider: "peec", format: "csv", payload: "x".repeat(MAX_TRACKER_PAYLOAD_CHARS + 1), brands })).toThrow(/5 MB/i);
    expect(() => normalizeTrackerExport({ provider: "peec", format: "json", payload: JSON.stringify([{ Prompt: "Q?", Answer: "Alpha est fiable.", "Answer Date": "2026-11-01" }]), brands })).not.toThrow();
  });

  it("keeps exports bounded to the observation model limits", () => {
    const small = ["Prompt,Answer,Date", ...Array.from({ length: 100 }, (_, i) => `Q${i},Alpha est fiable.,2026-11-01`)].join("\n");
    expect(normalizeTrackerExport({ provider: "peec", format: "csv", payload: small, brands }).meta.rows).toBe(100);
    const tooBig = ["Prompt,Answer,Date", ...Array.from({ length: 1001 }, (_, i) => `Q${i},Alpha est fiable.,2026-11-01`)].join("\n");
    expect(() => normalizeTrackerExport({ provider: "peec", format: "csv", payload: tooBig, brands })).toThrow(/bounded to 1000/i);
  });

  it("computes per-engine share of voice without inventing denominators", () => {
    const input = { brands, responses: [
      { prompt: "Un ?", answer: "Alpha est fiable.", source: "Meteoria import (ChatGPT)", observedAt: "2026-11-01T09:00:00Z" },
      { prompt: "Deux ?", answer: "Alpha est excellent.", source: "Meteoria import (ChatGPT)", observedAt: "2026-11-02T09:00:00Z" },
      { prompt: "Trois ?", answer: "Beta est lent.", source: "Peec AI import (Gemini)", observedAt: "2026-11-03T09:00:00Z" },
      { prompt: "Quatre ?", answer: "Aucun nom connu.", source: "Peec AI import (Gemini)", observedAt: "2026-11-04T09:00:00Z" },
    ] };
    const dataset = normalizeImport(input);
    const view = shareOfVoiceView(dataset, "", "Alpha");
    expect(view.brand).toBe("Alpha");
    expect(view.engines).toHaveLength(2);
    const chat = view.engines.find((e) => e.engine === "Meteoria import (ChatGPT)")!;
    expect(chat.responses).toBe(2);
    expect(chat.brands.find((b) => b.brand === "Alpha")!.shareOfVoice).toBe(100);
    const gemini = view.engines.find((e) => e.engine === "Peec AI import (Gemini)")!;
    expect(gemini.brands.map((b) => [b.brand, b.shareOfVoice])).toEqual([["Alpha", 0], ["Beta", 100]]);
    expect(Math.round(view.overall.brands.find((b) => b.brand === "Alpha")!.shareOfVoice!)).toBe(67);
    expect(view.overall.responses).toBe(4);
    expect(view.note).toContain("not engine market share");
    const only = shareOfVoiceView(dataset, "Peec AI import (Gemini)", "Alpha");
    expect(only.engines).toHaveLength(1);
    expect(only.source).toBe("Peec AI import (Gemini)");
    const empty = shareOfVoiceView(dataset, "Aucune source", "Alpha");
    expect(empty.totalResponses).toBe(0);
    expect(empty.overall.brands.every((b) => b.shareOfVoice === null && b.visibility === null)).toBe(true);
  });

  it("counts each mention at most once per response and excludes rejected reviews", () => {
    const input = { brands, responses: [
      { prompt: "Un ?", answer: "Alpha est fiable. Alpha est excellent.", source: "S", observedAt: "2026-11-01T09:00:00Z" },
      { prompt: "Deux ?", answer: "Alpha est lent.", source: "S", observedAt: "2026-11-02T09:00:00Z" },
    ] };
    const dataset = normalizeImport(input);
    dataset.observations[1].mentions[0].status = "rejected";
    const view = shareOfVoiceView(dataset, "", "Alpha");
    expect(view.totalMentions).toBe(1);
    expect(view.overall.brands.find((b) => b.brand === "Alpha")!.sentiment.positive).toBe(1);
    expect(view.overall.brands.find((b) => b.brand === "Beta")!.mentions).toBe(0);
  });

  it("keeps tracker-imported provenance visible across engines", () => {
    const payload = ["Requête,Réponse,Date,Moteur", "\"CRM ?\",Alpha est fiable.,2026-11-01,ChatGPT", "\"SEO ?\",Beta est éprouvé.,2026-11-02,Gemini"].join("\n");
    const parsed = normalizeTrackerExport({ provider: "qwairy", format: "csv", payload, brands });
    const dataset = normalizeImport(parsed.body);
    expect(dataset.observations.every((o) => o.provenance === "imported")).toBe(true);
    const view = shareOfVoiceView(dataset);
    expect(view.engines.flatMap((e) => e.brands.filter((b) => b.shareOfVoice === 100).map((b) => b.brand))).toEqual(["Alpha", "Beta"]);
  });
});
