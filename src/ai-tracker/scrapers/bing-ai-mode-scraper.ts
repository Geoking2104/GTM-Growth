/** Bing AI Mode scraper — bing.com/copilotsearch, the clean alternative to the Copilot app.
 * Requires a signed-in session; if the session is missing or expired, stop cleanly. */
import type { CollectedAnswer } from "../types.js";
import { BaseScraper, BlockStopError } from "./base.js";

export class BingAiModeScraper extends BaseScraper {
  engine = "bing-ai-mode";

  async run(prompt: string): Promise<CollectedAnswer> {
    const ctx = await this.context();
    const page = await ctx.newPage();
    const startedAt = new Date().toISOString();
    try {
      await page.goto("https://www.bing.com/copilotsearch?q=" + encodeURIComponent(prompt), { waitUntil: "domcontentloaded" });
      await this.sleep(2000, 4000);
      const body = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
      if (body.includes("sign in") && !body.includes(prompt.slice(0, 20).toLowerCase())) {
        throw new BlockStopError("Bing AI Mode requires a valid session: refresh the storageState, do not bypass");
      }
      await this.guard(page);
      const rawText = await this.waitForStabilisation(page, "main", 60000);
      await this.guard(page);
      const citations = await this.extractCitations(page, "main");
      return { engine: this.engine, provider: "native-scraper", collectionMode: "consumer-ui", rawText, citations, fanOut: [], model: null, startedAt, finishedAt: new Date().toISOString() };
    } catch (error) {
      await this.screenshotOnFailure(page);
      throw error;
    } finally { await page.close(); }
  }
}
