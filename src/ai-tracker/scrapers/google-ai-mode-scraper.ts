/** Google AI Mode / AI Overviews scraper — classic Google search in a browser.
 * The AI block is extracted separately from blue links, so the two never mix.
 * The most useful and most stable surface for GEO. */
import type { CollectedAnswer } from "../types.js";
import { BaseScraper } from "./base.js";

export class GoogleAiModeScraper extends BaseScraper {
  engine = "google-ai-mode";

  async run(prompt: string): Promise<CollectedAnswer> {
    const ctx = await this.context();
    const page = await ctx.newPage();
    const startedAt = new Date().toISOString();
    try {
      await page.goto(`https://www.google.com/search?q=${encodeURIComponent(prompt)}`, { waitUntil: "domcontentloaded" });
      await this.sleep(2000, 4000);
      await this.guard(page);
      // AI Overview / AI Mode block, scoped so organic results are excluded.
      const aiBlock = page.locator("[data-attrid], [id^='AiOverview'], div[class*='ai-overview']").first();
      const exists = await aiBlock.isVisible().catch(() => false);
      if (!exists) {
        // No AI block on this query: an explicit absence, not a failed run.
        const rawText = "(no AI overview on this query)";
        return { engine: this.engine, provider: "native-scraper", collectionMode: "consumer-ui", rawText, citations: [], fanOut: [], model: null, startedAt, finishedAt: new Date().toISOString() };
      }
      const rawText = await this.waitForStabilisation(page, "[data-attrid], [id^='AiOverview'], div[class*='ai-overview']", 30000);
      await this.guard(page);
      const citations = await aiBlock.locator("a[href^='http']").evaluateAll(els =>
        els.map(a => ({ url: (a as { href: string }).href })).filter(c => /^https?:\/\//.test(c.url) && !c.url.includes("google.")));
      return { engine: this.engine, provider: "native-scraper", collectionMode: "consumer-ui", rawText, citations, fanOut: [], model: null, startedAt, finishedAt: new Date().toISOString() };
    } catch (error) {
      await this.screenshotOnFailure(page);
      throw error;
    } finally { await page.close(); }
  }
}
