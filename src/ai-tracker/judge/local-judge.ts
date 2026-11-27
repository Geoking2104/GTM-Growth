/** Native AI tracker — local Ollama judge. No external call, strict JSON, versioned judgements.
 * One judge call per run covering brand + competitors together, so positions stay consistent. */
import type { MentionJudgement, Sentiment, TrackedCompany } from "../types.js";
import { judgeVersion, trackerConfig } from "../config.js";
import { deterministicMatch } from "./match-filter.js";

const SENTIMENTS: Sentiment[] = ["positive", "neutral", "negative", "mixed"];
const MAX_RAW = 8000;
const MAX_PASSAGE = 300;

interface JudgeResult {
  companies: Array<{ companyId: string; counted: boolean; sentiment: Sentiment | null; position: number | null; passage?: string; reason?: string }>;
}

function buildJudgePrompt(rawText: string, companies: TrackedCompany[]): string {
  const roster = companies.map(c => `- ${c.companyId} (${c.type}): ${c.name}` + (c.aliases.length ? `, alias: ${c.aliases.join(", ")}` : "") + (c.domains.length ? `, domaines: ${c.domains.join(", ")}` : "")).join("\n");
  return `Tu es un juge de mention de marque. Réponds en JSON strict, sans autre texte.

Entreprises suivies :
${roster}

Réponse à juger :
"""
${rawText.slice(0, MAX_RAW)}
"""

Questions :
1. La réponse parle-t-elle vraiment de chaque entreprise suivie, ou d'une autre entreprise ou d'un mot homonyme ?
2. Quel est le sentiment envers chaque entreprise mentionnée : positive, neutral, negative, mixed ?
3. Quelle est sa position parmi les entreprises nommées, en commençant à 1 ?
4. Cite le passage exact qui justifie ta décision, maximum ${MAX_PASSAGE} caractères.

Retourne exactement :
{"companies":[{"companyId":"...","counted":true,"sentiment":"positive","position":1,"passage":"...","reason":"..."}]}

Si tu ne peux pas trancher pour une entreprise, counted true. Si une entreprise n'est pas mentionnée, counted false.`;
}

function extractJson(value: string): unknown {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Judge returned no JSON");
  return JSON.parse(value.slice(start, end + 1));
}

export interface JudgeOutcome { mentions: MentionJudgement[]; judgeVersion: string }

/** Full judge flow with the local model. One Ollama call per run, strict JSON, fail-safe. */
export async function judgeRunAsync(rawText: string, companies: TrackedCompany[], transport: typeof fetch = fetch, overrides?: { url?: string; model?: string }): Promise<JudgeOutcome> {
  const config = trackerConfig();
  const url = overrides?.url ?? config.ollamaUrl;
  const model = overrides?.model ?? config.ollamaModel;
  const version = judgeVersion();
  const judgedAt = new Date().toISOString();
  const candidates = deterministicMatch(rawText, companies);
  const candidateIds = new Set(candidates.map(c => c.companyId));
  const mentions: MentionJudgement[] = [];
  for (const company of companies.filter(c => !candidateIds.has(c.companyId))) {
    mentions.push({ runId: "", companyId: company.companyId, companyType: company.type, counted: false, status: "judged", passage: null, sentiment: null, position: null, judgeVersion: version, judgedAt });
  }
  const toJudge = companies.filter(c => candidateIds.has(c.companyId));
  if (!toJudge.length) return { mentions, judgeVersion: version };
  try {
    const response = await transport(`${url}/api/generate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, stream: false, format: "json", prompt: buildJudgePrompt(rawText, toJudge) }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    const payload = extractJson(String(objectText(await response.json())));
    const parsed = parseJudgeResult(payload, toJudge);
    for (const company of toJudge) {
      const entry = parsed.find(p => p.companyId === company.companyId);
      if (!entry) { mentions.push(errorMention(company.companyId, company.type, version, judgedAt)); continue; }
      mentions.push({
        runId: "", companyId: company.companyId, companyType: company.type,
        counted: entry.counted, status: "judged",
        passage: entry.passage && rawText.includes(entry.passage.slice(0, 40)) ? entry.passage.slice(0, MAX_PASSAGE) : null,
        sentiment: entry.sentiment, position: entry.position,
        judgeVersion: version, judgedAt,
      });
    }
  } catch {
    // Invalid judge output is an error, never an invented passage.
    for (const company of toJudge) mentions.push(errorMention(company.companyId, company.type, version, judgedAt));
  }
  return { mentions, judgeVersion: version };
}

const objectText = (value: unknown): string => (value && typeof value === "object" && typeof (value as { response?: unknown }).response === "string" ? (value as { response: string }).response : JSON.stringify(value));

function errorMention(companyId: string, companyType: "brand" | "competitor", version: string, judgedAt: string): MentionJudgement {
  // A judge error is never a negative mention and never an invented passage.
  return { runId: "", companyId, companyType, counted: false, status: "error", passage: null, sentiment: null, position: null, judgeVersion: version, judgedAt };
}

function parseJudgeResult(payload: unknown, companies: TrackedCompany[]): JudgeResult["companies"] {
  const data = payload && typeof payload === "object" ? payload as { companies?: unknown } : {};
  if (!Array.isArray(data.companies)) throw new Error("Judge JSON is missing the companies array");
  const valid = new Set(companies.map(c => c.companyId));
  return (data.companies as Array<Record<string, unknown>>).flatMap(entry => {
    const companyId = typeof entry.companyId === "string" && valid.has(entry.companyId) ? entry.companyId : null;
    if (!companyId || typeof entry.counted !== "boolean") return [];
    const sentiment = SENTIMENTS.find(s => entry.sentiment === s) ?? null;
    const position = Number.isInteger(entry.position) && (entry.position as number) >= 1 && (entry.position as number) <= 20 ? entry.position as number : null;
    return [{ companyId, counted: entry.counted, sentiment, position, passage: typeof entry.passage === "string" ? entry.passage : undefined, reason: typeof entry.reason === "string" ? entry.reason : undefined }];
  });
}
