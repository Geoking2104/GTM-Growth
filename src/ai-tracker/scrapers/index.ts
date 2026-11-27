/** Native AI tracker — scraper registry. One file per engine, one interface. */
import { ChatGPTScraper } from "./chatgpt-scraper.js";
import { GeminiScraper } from "./gemini-scraper.js";
import { GoogleAiModeScraper } from "./google-ai-mode-scraper.js";
import { PerplexityScraper } from "./perplexity-scraper.js";
import { BingAiModeScraper } from "./bing-ai-mode-scraper.js";
import type { NativeScraper } from "./base.js";
import { scraperEnabled } from "../config.js";

const SCRAPERS: Record<string, new () => NativeScraper> = {
  "chatgpt": ChatGPTScraper,
  "gemini": GeminiScraper,
  "google-ai-mode": GoogleAiModeScraper,
  "perplexity": PerplexityScraper,
  "bing-ai-mode": BingAiModeScraper,
};

export function scraperFor(engine: string): NativeScraper | null {
  if (!scraperEnabled(engine)) return null;
  const Scraper = SCRAPERS[engine];
  return Scraper ? new Scraper() : null;
}

export { BaseScraper, BlockStopError } from "./base.js";
export type { NativeScraper } from "./base.js";
