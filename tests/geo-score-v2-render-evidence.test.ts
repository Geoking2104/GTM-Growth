import { describe, expect, it } from "vitest";
import { captureAuditSnapshot } from "../src/geo/proof/snapshot.js";
import type { Fetcher } from "../src/geo/http.js";
import { canonicalJson, sha256 } from "../src/geo/score/v2/calculate.js";
import { mapOfflineRenderingToV2 } from "../src/geo/score/v2/render-evidence.js";
import type { RenderEvidence } from "../src/render/offline.js";

const url = "https://example.org/";
const html = "<html><body><h1>Accessible text</h1></body></html>";
const fetcher = (page: string): Fetcher => async requestUrl => ({
  url: requestUrl, status: requestUrl === url ? 200 : 404,
  ok: requestUrl === url, headers: { "content-type": "text/html" },
  body: requestUrl === url ? page : "",
});
const textLength = (markup: string) => (markup.match(/<h1>(.*?)<\/h1>/)?.[1] ?? "").length;

async function evidence(snapshotHash: string, source: string, rendered: string): Promise<RenderEvidence> {
  return {
    status: "measured", reason: null, snapshotHash,
    renderedHtmlHash: await sha256(canonicalJson(rendered)),
    initialTextLength: textLength(source), renderedTextLength: textLength(rendered),
    blockedRequests: [], renderedHtml: rendered,
  };
}

describe("offline Playwright to GEO v2 proof adapter", () => {
  it("credits proven raw/DOM parity without claiming crawler identity or stability", async () => {
    const envelope = await captureAuditSnapshot(url, fetcher(html), "2026-11-09T12:00:00Z");
    const findings = await mapOfflineRenderingToV2(envelope, await evidence(envelope.snapshotHash, html, html));
    expect(findings).toHaveLength(4);
    expect(findings[0]).toMatchObject({ controlId: "P01", status: "measured", earned: 4 });
    expect(findings[1]).toMatchObject({ controlId: "P02", status: "measured", earned: 3 });
    expect(findings[2]).toMatchObject({ controlId: "P03", status: "unknown" });
    expect(findings[3]).toMatchObject({ controlId: "P04", status: "unknown" });
  });

  it("recognizes proven client-only content as zero on P01", async () => {
    const initial = "<html><body><div id='root'></div></body></html>";
    const envelope = await captureAuditSnapshot(url, fetcher(initial), "2026-11-09T12:00:00Z");
    const findings = await mapOfflineRenderingToV2(envelope, await evidence(envelope.snapshotHash, initial, html));
    expect(findings[0]).toMatchObject({ controlId: "P01", status: "measured", earned: 0 });
    expect(findings[1]).toMatchObject({ controlId: "P02", status: "measured", earned: 0 });
  });

  it("refuses mixed snapshots, tampering and incomplete replay evidence", async () => {
    const envelope = await captureAuditSnapshot(url, fetcher(html), "2026-11-09T12:00:00Z");
    const proof = await evidence(envelope.snapshotHash, html, html);
    await expect(mapOfflineRenderingToV2(envelope, { ...proof, snapshotHash: "wrong" }))
      .rejects.toThrow("snapshot hash mismatch");
    await expect(mapOfflineRenderingToV2(envelope, { ...proof, renderedHtml: "<html>changed</html>" }))
      .rejects.toThrow("Rendered HTML hash mismatch");
    const incomplete = await mapOfflineRenderingToV2(envelope,
      { ...proof, status: "incomplete", reason: "uncaptured script" });
    expect(incomplete.every(item => item.status === "unknown")).toBe(true);
    const blocked = await mapOfflineRenderingToV2(envelope,
      { ...proof, blockedRequests: ["https://example.org/missing.js"] });
    expect(blocked.every(item => item.status === "unknown")).toBe(true);
  });
});
