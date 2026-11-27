/** Native AI tracker — shared types. Evidence first, scores second. */

export type CollectionMode = "consumer-ui" | "api-approximation";
export type Sentiment = "positive" | "neutral" | "negative" | "mixed";
export type EngineId = "chatgpt" | "gemini" | "google-ai-mode" | "perplexity" | "bing-ai-mode" | "claude" | "mistral";
export type EngineHealth = "ok" | "degraded" | "paused" | "disabled";
export type OpportunityType = "visibility-drop" | "no-mention" | "competitor-ahead" | "citation-missing";

export interface TrackedCompany {
  companyId: string;
  type: "brand" | "competitor";
  name: string;
  aliases: string[];
  domains: string[];
}

export interface TrackedBrand {
  brandId: string;
  tenantId: string;
  name: string;
  aliases: string[];
  domains: string[];
  competitors: TrackedCompany[];
  locale: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
}

export interface TrackedPrompt {
  promptId: string;
  tenantId: string;
  brandId: string;
  promptText: string;
  promptHash: string;
  tags: string[];
  locale: string;
  engines: EngineId[];
  active: boolean;
  createdAt: string;
  createdBy: string;
  source: string;
}

export interface Citation { url: string; title?: string }

export interface StoredRun {
  runId: string;
  tenantId: string;
  brandId: string;
  promptId: string;
  engine: string;
  provider: string;
  collectionMode: CollectionMode;
  runDate: string;
  startedAt: string;
  finishedAt: string;
  rawText: string;
  citations: Citation[];
  fanOut: string[];
  model: string | null;
  source: string;
}

export interface MentionJudgement {
  runId: string;
  companyId: string;
  companyType: "brand" | "competitor";
  counted: boolean;
  status: "judged" | "error";
  passage: string | null;
  sentiment: Sentiment | null;
  position: number | null;
  judgeVersion: string;
  judgedAt: string;
}

export interface Opportunity {
  opportunityId: string;
  tenantId: string;
  brandId: string;
  promptId: string;
  engine: string;
  type: OpportunityType;
  title: string;
  evidence: unknown;
  status: string;
  createdAt: string;
}

export interface EngineStatus {
  tenantId: string;
  engine: string;
  health: EngineHealth;
  consecutiveFailures: number;
  lastCheckedAt: string;
  note: string;
}

/** Normalised answer returned by every collector (API or scraper). */
export interface CollectedAnswer {
  engine: string;
  provider: string;
  collectionMode: CollectionMode;
  rawText: string;
  citations: Citation[];
  fanOut: string[];
  model: string | null;
  startedAt: string;
  finishedAt: string;
  screenshotPath?: string;
}
