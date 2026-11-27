/** Native AI tracker — scraper registry. One file per engine, one interface.
 * Availability is decided by the worker (env flag or tenant activation after the ToS disclaimer). */
import { ChatGPTScraper } from "./scrapers/chatgpt-scraper.js";
import { GeminiScraper } from "./scrapers/gemini-scraper.js";
import { GoogleAiModeScraper } from "./scrapers/google-ai-mode-scraper.js";
import { PerplexityScraper } from "./scrapers/perplexity-scraper.js";
import { BingAiModeScraper } from "./scrapers/bing-ai-mode-scraper.js";
import type { NativeScraper } from "./scrapers/base.js";

const SCRAPERS: Record<string, new () => NativeScraper> = {
  "chatgpt": ChatGPTScraper,
  "gemini": GeminiScraper,
  "google-ai-mode": GoogleAiModeScraper,
  "perplexity": PerplexityScraper,
  "bing-ai-mode": BingAiModeScraper,
};

export function scraperFor(engine: string): NativeScraper | null {
  const Scraper = SCRAPERS[engine];
  return Scraper ? new Scraper() : null;
}

export { BaseScraper, BlockStopError } from "./scrapers/base.js";
export type { NativeScraper } from "./scrapers/base.js";
