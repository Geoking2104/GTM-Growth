/** Perplexity scraper — perplexity.ai, account-free search first.
 * If a login is required, stop cleanly and switch to the Sonar API. Never bypass. */
import type { CollectedAnswer } from "../types.js";
import { BaseScraper, BlockStopError } from "./base.js";

export class PerplexityScraper extends BaseScraper {
  engine = "perplexity";

  async run(prompt: string): Promise<CollectedAnswer> {
    const ctx = await this.context();
    const page = await ctx.newPage();
    const startedAt = new Date().toISOString();
    try {
      await page.goto("https://www.perplexity.ai/", { waitUntil: "domcontentloaded" });
      await this.sleep(1500, 3000);
      const body = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
      if (body.includes("log in") && !(await page.getByRole("textbox").first().isVisible().catch(() => false))) {
        throw new BlockStopError("Perplexity requires a login: switch to the Sonar API instead of bypassing");
      }
      const box = page.getByRole("textbox").first();
      await box.click();
      await box.fill(prompt);
      await this.sleep(500, 1200);
      await page.keyboard.press("Enter");
      const rawText = await this.waitForStabilisation(page, "main");
      await this.guard(page);
      const citations = await this.extractCitations(page, "main");
      return { engine: this.engine, provider: "native-scraper", collectionMode: "consumer-ui", rawText, citations, fanOut: [], model: null, startedAt, finishedAt: new Date().toISOString() };
    } catch (error) {
      await this.screenshotOnFailure(page);
      throw error;
    } finally { await page.close(); }
  }
}
