/** Native AI tracker — clean Playwright scraper base.
 * No stealth plugin, no fingerprint spoofing, no proxy rotation, no CAPTCHA solving,
 * no auth bypass. A real browser, the client's own session, a low cadence, a clean stop. */
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { trackerConfig } from "../config.js";
import type { CollectedAnswer } from "../types.js";

export interface NativeScraper {
  engine: string;
  run(prompt: string): Promise<CollectedAnswer>;
  close(): Promise<void>;
}

export class BlockStopError extends Error {
  constructor(message: string) { super(message); this.name = "BlockStopError"; }
}

const VERIFY_MARKERS = ["captcha", "unusual activity", "verify you are", "verify that you're", "are you a robot", "access denied", "sign in to continue"];

export abstract class BaseScraper implements NativeScraper {
  constructor(private readonly tenantId: string) {}
  abstract engine: string;
  abstract run(prompt: string): Promise<CollectedAnswer>;
  protected browser: Browser | null = null;
  protected ctx: BrowserContext | null = null;

  /** Session is a storageState file on disk, outside the repo. Never a password in code. */
  protected sessionFile(): string {
    const { sessionDir } = trackerConfig();
    const scoped = path.join(sessionDir, this.tenantId, `${this.engine}.json`);
    if (fs.existsSync(scoped) || this.tenantId !== process.env.AI_TRACKER_TENANT_ID) return scoped;
    // Legacy single-tenant deployments explicitly identify the session owner.
    return path.join(sessionDir, `${this.engine}.json`);
  }

  protected async context(): Promise<BrowserContext> {
    if (this.ctx) return this.ctx;
    const session = this.sessionFile();
    if (!fs.existsSync(session)) throw new Error(`No session file for ${this.engine}: run the session bootstrap first`);
    this.browser = await chromium.launch({ headless: true, executablePath: process.env.AI_TRACKER_CHROMIUM_PATH || undefined });
    this.ctx = await this.browser.newContext({ storageState: session, locale: trackerConfig().defaultLocale });
    return this.ctx;
  }

  /** Human-ish delays between actions. */
  protected async sleep(minMs: number, maxMs: number): Promise<void> {
    const ms = minMs + Math.random() * (maxMs - minMs);
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Fail-closed on verification, CAPTCHA, or blocking. */
  protected async guard(page: Page): Promise<void> {
    const body = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
    if (VERIFY_MARKERS.some(marker => body.includes(marker))) throw new BlockStopError(`Verification or block detected on ${this.engine}: stopping cleanly`);
  }

  /** Wait for streaming to stabilise: text length unchanged for 3 consecutive checks. */
  protected async waitForStabilisation(page: Page, selector: string, maxMs = 90000): Promise<string> {
    const start = Date.now();
    let last = "", stable = 0;
    while (Date.now() - start < maxMs) {
      const current = await page.locator(selector).first().innerText().catch(() => "");
      if (current && current === last) { stable += 1; if (stable >= 3) return current; } else stable = 0;
      last = current;
      await this.sleep(800, 1600);
    }
    if (last.trim()) return last;
    throw new Error(`Answer never stabilised on ${this.engine}`);
  }

  /** Screenshot only on failure, for diagnosis, short retention. */
  protected async screenshotOnFailure(page: Page): Promise<string | undefined> {
    try {
      const dir = path.join(trackerConfig().sessionDir, this.tenantId, "failures");
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${this.engine}-${Date.now()}.png`);
      await page.screenshot({ path: file, fullPage: false });
      for (const existing of fs.readdirSync(dir)) {
        if (Date.now() - fs.statSync(path.join(dir, existing)).mtimeMs > 48 * 3600 * 1000) fs.rmSync(path.join(dir, existing));
      }
      return file;
    } catch { return undefined; }
  }

  protected async extractCitations(page: Page, scope: string): Promise<Array<{ url: string; title?: string }>> {
    return page.locator(`${scope} a[href^="http"]`).evaluateAll(els =>
      els.map(element => {
        const anchor = element as { href: string; textContent: string | null };
        return { url: anchor.href, title: anchor.textContent ?? undefined };
      }).filter(c => /^https?:\/\//.test(c.url)));
  }

  async close(): Promise<void> {
    await this.ctx?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
    this.ctx = null; this.browser = null;
  }
}
