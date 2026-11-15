/**
 * Deterministic order attribution: UTM first, then referrer, then GA4 session
 * join, else unknown. Every attribution carries its signal, method and
 * confidence so the console can explain — never reclassify silently.
 */
import { createHmac } from "node:crypto";
import type { AiEngine, Channel } from "./types.js";

export interface AttributionSignals {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrer?: string | null;
  landingPage?: string | null;
  /** Known GA4 session id at purchase time, when available. */
  ga4SessionId?: string | null;
}

export interface AttributionOutcome {
  channel: Channel;
  engine: AiEngine | null;
  referrer: string | null;
  landingPage: string | null;
  utm: { source?: string; medium?: string; campaign?: string };
  method: "utm" | "referrer" | "ga4_join" | "none";
  confidence: "high" | "medium" | "low";
  firstTouch: boolean;
  windowDays: number;
}

export const ATTRIBUTION_WINDOW_DAYS = 30;

/** Referrer/UTM patterns per AI engine (see §9.2 of the specification). */
export const AI_ENGINE_MATCHERS: Array<{ engine: AiEngine; patterns: RegExp }> = [
  { engine: "chatgpt", patterns: /(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/i },
  { engine: "claude", patterns: /(^|\.)claude\.ai$/i },
  { engine: "perplexity", patterns: /(^|\.)perplexity\.ai$/i },
  { engine: "copilot", patterns: /(^|\.)copilot\.microsoft\.com$|(^|\.)bing\.com\/chat/i },
  { engine: "gemini", patterns: /(^|\.)gemini\.google\.com$/i },
  { engine: "grok", patterns: /(^|\.)grok\.com$|(^|\.)x\.com\/i\/grok/i },
];

/** Known AI sources accepted in utm_source (first match wins). */
export const AI_UTM_SOURCES: Record<string, AiEngine> = {
  chatgpt: "chatgpt", "openai": "chatgpt", "chat-openai": "chatgpt",
  claude: "claude", "anthropic": "claude",
  perplexity: "perplexity",
  copilot: "copilot", "microsoft-copilot": "copilot", "bing-copilot": "copilot",
  gemini: "gemini", "google-gemini": "gemini",
  grok: "grok", "xai": "grok", "x-grok": "grok",
};

const socialPatterns = /(^|\.)(t\.co|twitter\.com|x\.com|facebook\.com|instagram\.com|linkedin\.com|tiktok\.com|pinterest\.com|youtube\.com)$/i;
const emailMedium = /^(email|e-mail|newsletter|mail)$/i;
const paidMedium = /^(cpc|ppc|paid|paidsearch|paid-social|display|retargeting)$/i;

function hostOf(url: string): string | null {
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}

function matchEngine(referrer: string): AiEngine | null {
  for (const { engine, patterns } of AI_ENGINE_MATCHERS) if (patterns.test(referrer) || patterns.test(hostOf(referrer) ?? "")) return engine;
  return null;
}

/** Priority: 1) explicit UTM source 2) referrer 3) GA4 session join 4) unknown. */
export function attributeOrder(signals: AttributionSignals, now: Date = new Date()): AttributionOutcome {
  const utm = { source: signals.utmSource?.trim() || undefined, medium: signals.utmMedium?.trim() || undefined, campaign: signals.utmCampaign?.trim() || undefined };
  const referrer = signals.referrer?.trim() || null;
  const landingPage = signals.landingPage?.trim() || null;

  // 1. Explicit UTM source (strongest signal, high confidence).
  if (utm.source) {
    const key = utm.source.toLowerCase().replace(/\s+/g, "-");
    const aiEngine = AI_UTM_SOURCES[key];
    if (aiEngine) return { channel: "ai_assistant", engine: aiEngine, referrer, landingPage, utm, method: "utm", confidence: "high", firstTouch: true, windowDays: ATTRIBUTION_WINDOW_DAYS };
    const medium = utm.medium?.toLowerCase();
    if (medium && emailMedium.test(medium)) return { channel: "email", engine: null, referrer, landingPage, utm, method: "utm", confidence: "high", firstTouch: true, windowDays: ATTRIBUTION_WINDOW_DAYS };
    if (medium && paidMedium.test(medium)) return { channel: "paid", engine: null, referrer, landingPage, utm, method: "utm", confidence: "high", firstTouch: true, windowDays: ATTRIBUTION_WINDOW_DAYS };
    if (medium === "social" || (medium ?? "").includes("social")) return { channel: "social", engine: null, referrer, landingPage, utm, method: "utm", confidence: "high", firstTouch: true, windowDays: ATTRIBUTION_WINDOW_DAYS };
    return { channel: "referral", engine: null, referrer, landingPage, utm, method: "utm", confidence: "medium", firstTouch: true, windowDays: ATTRIBUTION_WINDOW_DAYS };
  }

  // 2. Referrer hostname (high confidence when it maps to a known engine).
  const refHost = referrer ? hostOf(referrer) : null;
  if (refHost) {
    const engine = matchEngine(referrer!);
    if (engine) return { channel: "ai_assistant", engine, referrer, landingPage, utm, method: "referrer", confidence: "high", firstTouch: true, windowDays: ATTRIBUTION_WINDOW_DAYS };
    if (paidMedium.test(utm.medium ?? "")) return { channel: "paid", engine: null, referrer, landingPage, utm, method: "referrer", confidence: "medium", firstTouch: true, windowDays: ATTRIBUTION_WINDOW_DAYS };
    if (socialPatterns.test(refHost)) return { channel: "social", engine: null, referrer, landingPage, utm, method: "referrer", confidence: "medium", firstTouch: true, windowDays: ATTRIBUTION_WINDOW_DAYS };
    if (refHost === "google.com" || refHost.endsWith(".google.com")) return { channel: "organic", engine: null, referrer, landingPage, utm, method: "referrer", confidence: "medium", firstTouch: true, windowDays: ATTRIBUTION_WINDOW_DAYS };
    if (refHost === "bing.com" || refHost.endsWith(".bing.com") || refHost === "duckduckgo.com" || refHost.endsWith(".search.yahoo.com")) return { channel: "organic", engine: null, referrer, landingPage, utm, method: "referrer", confidence: "medium", firstTouch: true, windowDays: ATTRIBUTION_WINDOW_DAYS };
    return { channel: "referral", engine: null, referrer, landingPage, utm, method: "referrer", confidence: "medium", firstTouch: true, windowDays: ATTRIBUTION_WINDOW_DAYS };
  }

  // 3. GA4 session join: no referrer, product landing page, known session.
  if (signals.ga4SessionId && landingPage) {
    return { channel: "unknown", engine: null, referrer, landingPage, utm, method: "ga4_join", confidence: "medium", firstTouch: true, windowDays: ATTRIBUTION_WINDOW_DAYS };
  }

  // 4. No signal: direct remains direct only with a landing page at the shop
  // root; anything else stays unknown and is never silently reclassified.
  if (!referrer && !landingPage) return { channel: "direct", engine: null, referrer, landingPage, utm, method: "none", confidence: "low", firstTouch: true, windowDays: ATTRIBUTION_WINDOW_DAYS };
  return { channel: "unknown", engine: null, referrer, landingPage, utm, method: "none", confidence: "low", firstTouch: true, windowDays: ATTRIBUTION_WINDOW_DAYS };
}

/** Bot traffic (AI crawlers without engagement) must not count as sessions. */
const CRAWLER_UA = /(gptbot|chatgpt-user|oai-searchbot|claudebot|anthropic-ai|perplexitybot|ccbot|google-extended|applebot-extended|meta-externalagent|bingbot|crawler|spider|bot)/i;
export const isLikelyCrawler = (userAgent: string | null | undefined): boolean => Boolean(userAgent && CRAWLER_UA.test(userAgent.trim()));

/** Stable pseudonym for a customer reference — keyed HMAC, no PII. */
export function pseudonym(tenantId: string, providerCustomerRef: string, key: Buffer): string {
  return `cust_${createHmac("sha256", key).update(`${tenantId}:${providerCustomerRef}`).digest("hex").slice(0, 24)}`;
}

export default { attributeOrder };
