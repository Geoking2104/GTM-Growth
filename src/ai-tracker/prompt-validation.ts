/** Native AI tracker — prompt validation. Buyer questions only: no PII, no secrets, no injection. */
import { promptHash } from "./store.js";

export const PROMPT_MAX_LENGTH = 500;

const INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+|the\s+)?(?:previous|prior|above)\s+instructions/i,
  /system\s*prompt/i,
  /\bdisregard\b.*\binstructions?\b/i,
  /\byou\s+are\s+now\b/i,
  /\bdeveloper\s+mode\b/i,
];
const PII_PATTERNS = [
  // E-mail addresses and phone numbers are the minimal buyer-prompt contract.
  /[\w.+-]+@[\w-]+\.[\w.]{2,}/,
  /(?:\+?\d[\s.-]?){9,}/,
  // Government identifiers (French examples kept generic).
  /\b\d{2}[ .]\d{3}[ .]\d{3}[ .]?\d{2}\b/,
];
const SECRET_PATTERNS = [
  /\bsk-[a-zA-Z0-9]{16,}/,
  /\b(?:api[_-]?key|secret|token|password|passwd|bearer)\b\s*[:=]/i,
];

export interface PromptValidation { ok: boolean; reason?: string; hash: string }

export function validatePromptText(text: unknown): PromptValidation {
  const value = typeof text === "string" ? text.trim() : "";
  if (!value) return { ok: false, reason: "Prompt is required", hash: "" };
  if (value.length > PROMPT_MAX_LENGTH) return { ok: false, reason: `Prompt must be at most ${PROMPT_MAX_LENGTH} characters`, hash: "" };
  if (value.includes("://")) return { ok: false, reason: "Prompts must not contain URLs", hash: "" };
  for (const pattern of INJECTION_PATTERNS) if (pattern.test(value)) return { ok: false, reason: "Prompt looks like an instruction injection", hash: "" };
  for (const pattern of PII_PATTERNS) if (pattern.test(value)) return { ok: false, reason: "Prompts must not contain personal data", hash: "" };
  for (const pattern of SECRET_PATTERNS) if (pattern.test(value)) return { ok: false, reason: "Prompts must not contain secrets", hash: "" };
  return { ok: true, hash: promptHash(value) };
}

const ENGINE_IDS = ["chatgpt", "gemini", "google-ai-mode", "perplexity", "bing-ai-mode", "claude", "mistral"] as const;
export function validateEngines(engines: unknown): string[] | null {
  if (!Array.isArray(engines) || engines.length < 1 || engines.length > 7) return null;
  const list = engines.filter((e): e is string => typeof e === "string" && (ENGINE_IDS as readonly string[]).includes(e));
  return new Set(list).size === engines.length ? list : null;
}

export function validateTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.filter((t): t is string => typeof t === "string" && /^[a-z0-9-]{1,30}$/i.test(t.trim())).map(t => t.trim().toLowerCase()))].slice(0, 10);
}
