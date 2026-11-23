import type { Dataset } from "./ai-visibility.js";

export interface MeasurementContext {
  engine?: string;
  model?: string;
  mode?: "api" | "consumer" | "tracker" | "manual";
  language?: string;
  market?: string;
}

export type ComparisonObservation = Pick<Dataset["observations"][number], "id" | "prompt" | "source" | "observedAt">
  & Partial<Pick<Dataset["observations"][number], "provenance" | "collectionVerified" | "measurement">>
  & { mentions: Array<{ brand: string; status?: string }> };

export function normalizeMeasurement(value: unknown): MeasurementContext | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid measurement context");
  const input = value as Record<string, unknown>;
  const output: MeasurementContext = {};
  for (const field of ["engine", "model", "mode", "language", "market"] as const) {
    const raw = input[field];
    if (raw === undefined) continue;
    if (typeof raw !== "string" || !raw.trim() || raw.trim().length > 100 || /[\u0000-\u001f\u007f]/.test(raw.trim())) throw new Error(`Invalid measurement ${field}`);
    const text = raw.trim();
    if (field === "mode") {
      if (text !== "api" && text !== "consumer" && text !== "tracker" && text !== "manual") throw new Error("Invalid measurement mode");
      output.mode = text;
    } else if (field === "language") {
      if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/i.test(text)) throw new Error("Invalid measurement language");
      output.language = text.toLowerCase();
    } else if (field === "market") {
      if (!/^[a-z]{2}$/i.test(text)) throw new Error("Invalid measurement market");
      output.market = text.toUpperCase();
    } else output[field] = text;
  }
  return Object.keys(output).length ? output : undefined;
}

export function observationOrigin(row: Pick<ComparisonObservation, "provenance" | "collectionVerified">) {
  if (row.provenance === "collected" && row.collectionVerified) return "collected";
  return row.provenance === "imported" ? "imported" : "unverified";
}

export function cohortKey(row: ComparisonObservation) {
  const { engine, model, mode, language, market } = row.measurement ?? {};
  return JSON.stringify([row.prompt, row.source, observationOrigin(row), engine, model, mode, language, market]);
}

export function panelSignature(brands: Dataset["brands"]) {
  const signatures = brands.map((brand) => JSON.stringify([brand.name, [...(brand.aliases ?? [])].sort(), brand.website ?? null]));
  return JSON.stringify(signatures.sort());
}
