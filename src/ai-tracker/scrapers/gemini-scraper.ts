/** Gemini scraper — gemini.google.com/app, dedicated tracker session, never a personal account. */
import type { CollectedAnswer } from "../types.js";
import { BaseScraper } from "./base.js";

export class GeminiScraper extends BaseScraper {
  engine = "gemini";

  async run(prompt: string): Promise<CollectedAnswer> {
    const ctx = await this.context();
    const page = await ctx.newPage();
    const startedAt = new Date().toISOString();
    try {
      await page.goto("https://gemini.google.com/app", { waitUntil: "domcontentloaded" });
      await this.sleep(1500, 3000);
      await this.guard(page);
      const box = page.getByRole("textbox").first();
      await box.click();
      await box.fill(prompt);
      await this.sleep(500, 1200);
      await page.keyboard.press("Enter");
      // Response area: last conversation turn, role-based where possible.
      const rawText = await this.waitForStabilisation(page, "main");
      await this.guard(page);
      const citations = await this.extractCitations(page, "main");
      return {
        engine: this.engine, provider: "native-scraper", collectionMode: "consumer-ui",
        rawText, citations, fanOut: [], model: null, startedAt, finishedAt: new Date().toISOString(),
      };
    } catch (error) {
      await this.screenshotOnFailure(page);
      throw error;
    } finally { await page.close(); }
  }
}
