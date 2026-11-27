/** Native AI tracker — scraper registry. One file per engine, one interface. */
import { ChatGPTScraper } from "./chatgpt-scraper.js";
import { GeminiScraper } from "./gemini-scraper.js";
import { GoogleAiModeScraper } from "./google-ai-mode-scraper.js";
import { PerplexityScraper } from "./perplexity-scraper.js";
import { BingAiModeScraper } from "./bing-ai-mode-scraper.js";
import type { NativeScraper } from "./base.js";
import { scraperEnabled } from "../config.js";
import { getEngineSetting } from "../store.js";

const SCRAPERS: Record<string, new (tenantId: string) => NativeScraper> = {
  "chatgpt": ChatGPTScraper,
  "gemini": GeminiScraper,
  "google-ai-mode": GoogleAiModeScraper,
  "perplexity": PerplexityScraper,
  "bing-ai-mode": BingAiModeScraper,
};

export function scraperFor(tenantId: string, engine: string): NativeScraper | null {
  if (!scraperEnabled(engine) || !getEngineSetting(tenantId, engine).scraperEnabled) return null;
  const Scraper = SCRAPERS[engine];
  return Scraper ? new Scraper(tenantId) : null;
}

export { BaseScraper, BlockStopError } from "./base.js";
export type { NativeScraper } from "./base.js";
