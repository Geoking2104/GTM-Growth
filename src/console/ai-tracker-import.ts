/** Normalised import connectors (R1) for datasets the tenant already owns
 * from a dedicated AI-visibility tracker: Meteoria, Peec AI, Qwairy or
 * Profound CSV/JSON exports. The export is mapped onto the canonical
 * observation model without any provider call, sampling or estimation: what
 * the tracker measured is what the workspace stores, tagged `imported`.
 *
 * The tenant declares the brand (name, aliases) at import time. A tracker
 * export never re-declares what counts as the tenant's own brand, so the
 * declaration stays explicit and tenant-verified, never inferred.
 *
 * Fail-closed: one malformed row refuses the whole import with its row
 * number; unknown columns are never silently repurposed, they are reported.
 * Row numbers in errors are the export file's own spreadsheet row (header is row 1).
 */
import type { Provenance } from "./ai-visibility.js";
import { normalizeMeasurement } from "./visibility-measurement.js";

export type TrackerProvider = "meteoria" | "peec" | "qwairy" | "profound" | "generic";
export const TRACKER_PROVIDERS: TrackerProvider[] = ["meteoria", "peec", "qwairy", "profound", "generic"];
const PROVIDER_LABELS: Record<TrackerProvider, string> = { meteoria: "Meteoria", peec: "Peec AI", qwairy: "Qwairy", profound: "Profound", generic: "Generic" };
const TRACKER_PROVENANCE: Provenance = "imported";
export const TRACKER_IMPORT_WARNING = "Tracker imports keep the tracker's own measurement; sentiment stays heuristic-v1-unvalidated and requires human review. No external call was made.";
export const MAX_TRACKER_PAYLOAD_CHARS = 5_000_000;
const MAX_ROWS = 1000;

export function parseTrackerProvider(value: unknown): TrackerProvider | null {
  return typeof value === "string" && TRACKER_PROVIDERS.includes(value as TrackerProvider) ? value as TrackerProvider : null;
}

/** Header/key matching ignores case, accents, spaces and punctuation, so
 * `Answer`, `AI answer`, `Réponse` and `ai_answer` all resolve. */
const key = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

/** Documented field aliases per canonical column. Shared core plus each
 * provider's own export vocabulary; nothing outside this map is read. */
const ALIASES: Record<TrackerProvider, { prompt: string[]; answer: string[]; date: string[]; engine: string[]; citations: string[] }> = {
  generic: {
    prompt: ["prompt", "question", "query", "requete"],
    answer: ["answer", "response", "reponse"],
    date: ["observedat", "date", "timestamp"],
    engine: ["source", "engine", "model", "moteur"],
    citations: ["citations", "citedurls", "sources", "liens"],
  },
  meteoria: {
    prompt: ["prompt", "question", "query", "questionposee"],
    answer: ["answer", "response", "aianswer", "reponse", "answerstext"],
    date: ["date", "observedat", "answerdate", "datedelobservation", "timestamp"],
    engine: ["engine", "model", "aiengine", "aimodel", "plateforme"],
    citations: ["citations", "citationurls", "citedurls", "liens", "sources", "urls", "links", "references"],
  },
  peec: {
    prompt: ["prompt", "query", "question", "searchquery"],
    answer: ["answer", "aianswer", "response", "reponse", "modelresponse"],
    date: ["date", "answerdate", "observedat", "rundate", "timestamp"],
    engine: ["engine", "model", "aimodel", "source"],
    citations: ["citations", "citationurls", "citedurls", "sources", "links", "liens", "urls"],
  },
  qwairy: {
    prompt: ["requete", "question", "prompt", "query", "searchinput"],
    answer: ["reponse", "answer", "response", "aianswer", "generatedanswer"],
    date: ["date", "datedereponse", "observedat", "timestamp", "createdat"],
    engine: ["moteur", "engine", "model", "aimodel", "plateforme"],
    citations: ["liens", "links", "sources", "citations", "urls", "sourcescitees"],
  },
  profound: {
    prompt: ["question", "prompt", "query", "userquestion"],
    answer: ["answer", "response", "modelresponse", "aianswer", "output"],
    date: ["date", "observedat", "answerdate", "createdat", "timestamp"],
    engine: ["model", "engine", "aimodel", "llm", "platform"],
    citations: ["citations", "citedurls", "sources", "links", "references", "urls"],
  },
};

const CONTEXT_ALIASES = {
  model: ["modelversion", "modelid"],
  mode: ["capturemode", "collectionmode", "modedecollecte"],
  language: ["language", "locale", "langue"],
  market: ["market", "country", "marche", "pays"],
};
const mappingFor = (provider: TrackerProvider) => ({ ...ALIASES[provider], ...CONTEXT_ALIASES });

interface TrackerImportInput { provider: unknown; format: unknown; payload: unknown; brands: unknown }

export interface TrackerImportMeta {
  provider: TrackerProvider; format: "csv" | "json"; rows: number;
  engines: string[]; ignoredColumns: string[]; normalisedDates: number; provenance: Provenance;
  mapping: Record<string, string[]>;
}
export interface TrackerNormalisedImport { body: { brands: unknown; responses: Array<Record<string, unknown>> }; meta: TrackerImportMeta }

/** RFC 4180 subset CSV parser: quoted fields with escaped quotes, embedded
 * commas and line breaks, CRLF/CR/LF endings, UTF-8 BOM. No dependencies. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === "\"") { if (text[i + 1] === "\"") { field += "\""; i++; } else quoted = false; }
      else field += c;
      continue;
    }
    if (c === "\"") { quoted = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      continue;
    }
    field += c;
  }
  if (quoted) throw new Error("Invalid CSV: unterminated quoted field");
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

/** Accepted date forms: full ISO (kept as-is), ISO date (midnight UTC),
 * French `DD/MM/YYYY` with optional `HH:mm`. Anything else refuses the row:
 * a wrong date is never guessed or defaulted silently. */
export function normaliseTrackerDate(value: string, rowNumber: number): { observedAt: string; partial: boolean } {
  const iso = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
  const isoDateOnly = /^(\d{4}-\d{2}-\d{2})$/;
  const french = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}:\d{2}))?$/;
  const isoMatch = iso.exec(value);
  if (isoMatch) { const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) throw new Error(`Row ${rowNumber}: unparsable observation date`); return { observedAt: parsed.toISOString(), partial: false }; }
  if (isoDateOnly.exec(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) throw new Error(`Row ${rowNumber}: unparsable observation date`);
    return { observedAt: parsed.toISOString(), partial: true };
  }
  const fr = french.exec(value);
  if (fr) {
    const day = Number(fr[1]), month = Number(fr[2]), year = Number(fr[3]);
    if (day < 1 || day > 31 || month < 1 || month > 12) throw new Error(`Row ${rowNumber}: unparsable observation date`);
    const parsed = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${fr[4] ?? "00:00"}:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.getUTCDate() !== day || parsed.getUTCMonth() !== month - 1) throw new Error(`Row ${rowNumber}: unparsable observation date`);
    return { observedAt: parsed.toISOString(), partial: !fr[4] };
  }
  throw new Error(`Row ${rowNumber}: observation date must be ISO or DD/MM/YYYY`);
}

/** Split one citations cell: list separators `;`, `|` or whitespace, in any
 * mix. Later validation (normalizeImport) enforces public http(s) URLs. */
function splitCitations(value: string): string[] {
  return value.split(/[;|\s]+/).map((v) => v.trim()).filter(Boolean);
}

/** Map one raw record (object for JSON, indexed row for CSV) onto a canonical
 * response with the provider's import label. Fails closed with the row number. */
function mapRow(provider: TrackerProvider, record: Record<string, string> | Record<string, unknown>, rowNumber: number): { response: Record<string, unknown>; engine: string | null; normalisedDate: boolean } {
  const aliases = ALIASES[provider];
  const find = (names: string[]): string | undefined => {
    for (const name of names) { const value = record[name]; if (typeof value === "string" && value.trim()) return value; if (typeof value === "number" && Number.isFinite(value)) return String(value); }
    return undefined;
  };
  const prompt = find(aliases.prompt), answer = find(aliases.answer), date = find(aliases.date);
  if (!prompt || !answer || !date) throw new Error(`Row ${rowNumber}: prompt, answer and date columns are required`);
  const engine = find(aliases.engine) ?? null;
  const citationsRaw = aliases.citations.map((name) => record[name]).find((v) => typeof v === "string" && v.trim() || Array.isArray(v));
  let citations: string[] = [];
  if (Array.isArray(citationsRaw)) citations = citationsRaw.map((v) => String(v).trim()).filter(Boolean);
  else if (typeof citationsRaw === "string") citations = splitCitations(citationsRaw);
  const normalised = normaliseTrackerDate(date.trim(), rowNumber);
  const source = `${PROVIDER_LABELS[provider]} import${engine ? ` (${engine.slice(0, 60)})` : ""}`.slice(0, 100);
  const response: Record<string, unknown> = { prompt, answer, source, observedAt: normalised.observedAt, provenance: TRACKER_PROVENANCE };
  if (citationsRaw !== undefined) response.citations = citations;
  const context = Object.fromEntries(Object.entries(CONTEXT_ALIASES).map(([field, names]) => [field, find(names)]));
  try {
    const measurement = normalizeMeasurement(context);
    if (measurement) response.measurement = { ...(engine ? { engine: engine.trim().slice(0, 100) } : {}), ...measurement };
  } catch (error) {
    throw new Error(`Row ${rowNumber}: ${(error as Error).message}`);
  }
  return { response, engine, normalisedDate: normalised.partial };
}

interface MappedBody { responses: Array<Record<string, unknown>>; engines: string[]; ignored: string[]; normalisedDates: number; headers: string[] }

function csvBody(provider: TrackerProvider, payload: string): MappedBody {
  const rows = parseCsv(payload);
  if (rows.length < 2) throw new Error("CSV export requires a header row and at least one data row");
  const known = Object.values(mappingFor(provider)).flat();
  const header = rows[0];
  const used = header.map((h) => known.includes(key(h)));
  if (!header.some((h, i) => used[i])) throw new Error("CSV export has no recognised column; expected prompt, answer and date columns");
  const ignored = [...new Set(header.filter((h, i) => h.trim() && !used[i]))];
  const engines = new Set<string>();
  const responses: Array<Record<string, unknown>> = [];
  let normalisedDates = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every((cell) => cell.trim() === "")) continue;
    if (i > MAX_ROWS) throw new Error(`Tracker exports are bounded to ${MAX_ROWS} rows`);
    const record: Record<string, string> = {};
    header.forEach((h, index) => { record[key(h)] = row[index] ?? ""; });
    const mapped = mapRow(provider, record, i + 1);
    if (mapped.engine) engines.add(mapped.engine);
    if (mapped.normalisedDate) normalisedDates++;
    responses.push(mapped.response);
  }
  return { responses, engines: [...engines], ignored, normalisedDates, headers: header };
}

function jsonBody(provider: TrackerProvider, payload: string): MappedBody {
  let parsed: unknown;
  try { parsed = JSON.parse(payload); } catch { throw new Error("JSON export is not parsable"); }
  let list: unknown[] = [];
  if (Array.isArray(parsed)) list = parsed;
  else if (parsed && typeof parsed === "object") {
    const container = parsed as Record<string, unknown>;
    const candidate = ["rows", "data", "responses", "answers", "results", "items"].map((k) => container[key(k)]).find(Array.isArray);
    if (!candidate) throw new Error("JSON export must be an array of answers or an object with a rows/data/responses array");
    list = candidate as unknown[];
  }
  if (!list.length) throw new Error("JSON export contains no answers");
  if (list.length > MAX_ROWS) throw new Error(`Tracker exports are bounded to ${MAX_ROWS} rows`);
  const known = Object.values(mappingFor(provider)).flat();
  const engines = new Set<string>();
  const ignored = new Set<string>();
  const headers = new Set<string>();
  const responses: Array<Record<string, unknown>> = [];
  let normalisedDates = 0;
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`Row ${i + 1}: each answer must be an object`);
    const record = item as Record<string, unknown>;
    for (const k of Object.keys(record)) {
      headers.add(k);
      if (k.trim() && !known.includes(key(k))) ignored.add(k.trim());
    }
    const mapped = mapRow(provider, Object.fromEntries(Object.entries(record).map(([k, v]) => [key(k), v])), i + 1);
    if (mapped.engine) engines.add(mapped.engine);
    if (mapped.normalisedDate) normalisedDates++;
    responses.push(mapped.response);
  }
  return { responses, engines: [...engines], ignored: [...ignored], normalisedDates, headers: [...headers] };
}

/** Normalise one tracker export to the canonical import body. The brands
 * declaration comes from the request: the export never re-declares it. */
export function normalizeTrackerExport(input: unknown): TrackerNormalisedImport {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid tracker import");
  const body = input as TrackerImportInput;
  const provider = parseTrackerProvider(body.provider);
  if (!provider) throw new Error("Unknown tracker provider: expected generic, meteoria, peec, qwairy or profound");
  if (body.format !== "csv" && body.format !== "json") throw new Error("Tracker import format must be csv or json");
  if (typeof body.payload !== "string" || !body.payload.trim()) throw new Error("Tracker import requires the exported payload as text");
  if (body.payload.length > MAX_TRACKER_PAYLOAD_CHARS) throw new Error("Tracker export exceeds the 5 MB import bound");
  if (!Array.isArray(body.brands) || body.brands.length < 1) throw new Error("Tracker import requires the tenant brand declaration (1–10 brands)");
  const parsed = body.format === "csv" ? csvBody(provider, body.payload) : jsonBody(provider, body.payload);
  const mapping = Object.fromEntries(Object.entries(mappingFor(provider)).map(([field, aliases]) => [field, parsed.headers.filter((header) => aliases.includes(key(header)))]));
  return {
    body: { brands: body.brands, responses: parsed.responses },
    meta: { provider, format: body.format, rows: parsed.responses.length, engines: parsed.engines, ignoredColumns: parsed.ignored, normalisedDates: parsed.normalisedDates, provenance: TRACKER_PROVENANCE, mapping },
  };
}
