/**
 * Offline browser renderer. All network requests are fulfilled exclusively from
 * an already verified snapshot. No arbitrary URL is ever fetched by Chromium.
 * Production browser execution must additionally be isolated by the VPS runtime.
 */
import type { Browser } from "playwright-core";
import { HtmlDoc } from "../geo/html.js";
import { canonicalJson, sha256 } from "../geo/score/v2/calculate.js";
import { verifySnapshotEnvelope } from "../geo/proof/snapshot.js";
import type { SnapshotEnvelope } from "../geo/proof/snapshot.js";

const MAX_HTML_CHARS = 5 * 1024 * 1024;
const DEFAULT_RENDER_TIMEOUT_MS = 8_000;

export type RenderStatus = "measured" | "incomplete" | "blocked" | "unavailable";

export interface RenderEvidence {
  status: RenderStatus;
  reason: string | null;
  snapshotHash: string;
  renderedHtmlHash: string | null;
  initialTextLength: number;
  renderedTextLength: number | null;
  blockedRequests: string[];
  /** Content-addressable output for subsequent replay; never publish unreviewed. */
  renderedHtml: string | null;
}

function textLength(html: string): number {
  return HtmlDoc.parse(html).bodyText().replace(/\s+/g, " ").trim().length;
}

/**
 * An empty or failed page is not a zero-score audit. Missing JS dependencies
 * produce `incomplete` rather than pretending the client-only page is empty.
 */
export async function renderOfflineSnapshot(
  envelope: SnapshotEnvelope,
  browser: Browser,
  timeoutMs = DEFAULT_RENDER_TIMEOUT_MS,
): Promise<RenderEvidence> {
  await verifySnapshotEnvelope(envelope);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 15_000) {
    throw new Error("Render timeout outside allowed bounds");
  }
  const entry = envelope.snapshot.resources[0];
  const source = entry.response;
  const base: RenderEvidence = {
    status: "unavailable", reason: "Page fetch failed", snapshotHash: envelope.snapshotHash,
    renderedHtmlHash: null, initialTextLength: source ? textLength(source.body) : 0,
    renderedTextLength: null, blockedRequests: [], renderedHtml: null,
  };
  if (!source || (source.status !== 200 && source.status !== 203)) return base;

  const allowed = new Map([...envelope.snapshot.resources, ...(envelope.snapshot.scriptAssets ?? [])]
    .filter((resource) => resource.response)
    .map((resource) => [resource.requestUrl, resource.response!]));
  const blocked = new Set<string>();
  let blockedExecutionResource = false;
  const context = await browser.newContext({
    javaScriptEnabled: true,
    serviceWorkers: "block",
    acceptDownloads: false,
    bypassCSP: false,
  });
  try {
    await context.route("**/*", async (route) => {
      const requestUrl = route.request().url();
      const response = allowed.get(requestUrl);
      if (!response) {
        blocked.add(requestUrl);
        if (["script", "document", "fetch", "xhr", "websocket"].includes(route.request().resourceType())) {
          blockedExecutionResource = true;
        }
        await route.abort("blockedbyclient");
        return;
      }
      await route.fulfill({
        status: response.status,
        body: response.body,
        headers: { "content-type": response.headers["content-type"] ?? "text/html; charset=utf-8" },
      });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    await page.goto(envelope.snapshot.url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const html = await page.content();
    if (html.length > MAX_HTML_CHARS) throw new Error("Rendered document too large");
    const renderedTextLength = textLength(html);
    const blockedRequests = [...blocked].sort().slice(0, 50);
    // A missing JS resource could contain all rendered content; do not score it.
    const captureIncomplete = blockedExecutionResource || (envelope.snapshot.skippedScripts?.length ?? 0) > 0 ||
      (envelope.snapshot.scriptAssets?.some((asset) => asset.response === null) ?? false);
    const status: RenderStatus = captureIncomplete ? "incomplete" : renderedTextLength === 0 ? "blocked" : "measured";
    return {
      ...base, status,
      reason: captureIncomplete ? "One or more execution resources were not captured" : status === "blocked" ? "No extractable rendered body" : null,
      renderedHtmlHash: await sha256(canonicalJson(html)),
      renderedTextLength, blockedRequests, renderedHtml: html,
    };
  } catch (error) {
    return { ...base, reason: error instanceof Error ? error.message : "Render failed", blockedRequests: [...blocked].sort().slice(0, 50) };
  } finally {
    await context.close();
  }
}
