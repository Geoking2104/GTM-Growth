import { describe, expect, it } from "vitest";
import type { Browser } from "playwright-core";
import { captureAuditSnapshot } from "../src/geo/proof/snapshot.js";
import type { Fetcher } from "../src/geo/http.js";
import { renderOfflineSnapshot } from "../src/render/offline.js";

const HOME = "https://example.org/";
const HTML = "<html><body><h1>Accessible text</h1></body></html>";

const fetcher: Fetcher = async (url) => ({
  url, status: url === HOME ? 200 : 404, ok: url === HOME,
  headers: { "content-type": "text/html" }, body: url === HOME ? HTML : "",
});

function fakeBrowser(html: string, extraRequest?: string) {
  const observed: { url: string; allowed: boolean }[] = [];
  let handler: (route: { request(): { url(): string; resourceType(): string }; abort(reason: string): Promise<void>; fulfill(options: { status: number; body: string }): Promise<void> }) => Promise<void>;
  let closed = false;
  const context = {
    async route(_pattern: string, callback: typeof handler) { handler = callback; },
    async newPage() {
      return {
        setDefaultTimeout(_timeout: number) {},
        async goto(url: string) {
          for (const requestUrl of [url, ...(extraRequest ? [extraRequest] : [])]) {
            await handler({
              request: () => ({ url: () => requestUrl, resourceType: () => requestUrl.endsWith(".js") ? "script" : "document" }),
              abort: async () => { observed.push({ url: requestUrl, allowed: false }); },
              fulfill: async () => { observed.push({ url: requestUrl, allowed: true }); },
            });
          }
        },
        async content() { return html; },
      };
    },
    async close() { closed = true; },
  };
  const browser = { newContext: async () => context } as unknown as Browser;
  return { browser, observed, isClosed: () => closed };
}

describe("offline Playwright renderer boundary", () => {
  it("renders a captured document and blocks all unlisted requests", async () => {
    const snapshot = await captureAuditSnapshot(HOME, fetcher, "2026-11-08T10:00:00Z");
    const mock = fakeBrowser(HTML, "https://127.0.0.1/private.js");
    const result = await renderOfflineSnapshot(snapshot, mock.browser);
    expect(mock.observed).toEqual([
      { url: HOME, allowed: true },
      { url: "https://127.0.0.1/private.js", allowed: false },
    ]);
    expect(result.status).toBe("incomplete");
    expect(result.renderedHtmlHash).toMatch(/^[a-f0-9]{64}$/);
    expect(mock.isClosed()).toBe(true);
  });

  it("measures a complete static page without external dependencies", async () => {
    const snapshot = await captureAuditSnapshot(HOME, fetcher, "2026-11-08T10:00:00Z");
    const result = await renderOfflineSnapshot(snapshot, fakeBrowser(HTML).browser);
    expect(result.status).toBe("measured");
    expect(result.renderedTextLength).toBeGreaterThan(0);
  });

  it("returns unavailable for inaccessible source instead of awarding zero", async () => {
    const unavailable: Fetcher = async () => { throw new Error("offline"); };
    const snapshot = await captureAuditSnapshot(HOME, unavailable, "2026-11-08T10:00:00Z");
    const result = await renderOfflineSnapshot(snapshot, fakeBrowser(HTML).browser);
    expect(result.status).toBe("unavailable");
    expect(result.renderedTextLength).toBeNull();
  });

  it("rejects an unbounded timeout", async () => {
    const snapshot = await captureAuditSnapshot(HOME, fetcher, "2026-11-08T10:00:00Z");
    await expect(renderOfflineSnapshot(snapshot, fakeBrowser(HTML).browser, 100_000)).rejects.toThrow("timeout");
  });
});
