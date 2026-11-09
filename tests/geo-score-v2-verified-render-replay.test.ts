import { describe, expect, it } from "vitest";
import { captureAuditSnapshot } from "../src/geo/proof/snapshot.js";
import type { Fetcher } from "../src/geo/http.js";
import { canonicalJson, sha256 } from "../src/geo/score/v2/calculate.js";
import { replayVerifiedV2Rendering } from "../src/geo/score/v2/verified-render-replay.js";
import type { RenderEvidence } from "../src/render/offline.js";
import type { VerifiedDomainGrant } from "../src/geo/rendering/verified-domain.js";

const url = "https://example.org/";
const html = "<html><head><title>Acme</title></head><body><h1>Readable page</h1></body></html>";
const fetcher: Fetcher = async target => ({
  url: target, status: target === url ? 200 : 404, ok: target === url,
  headers: { "content-type": "text/html" }, body: target === url ? html : "",
});
const grant: VerifiedDomainGrant = {
  hostname: "example.org", status: "verified",
  verifiedAt: "2026-11-01T00:00:00Z", expiresAt: "2026-12-01T00:00:00Z",
};
const now = new Date("2026-11-09T12:00:00Z");

async function render(snapshotHash: string): Promise<RenderEvidence> {
  return {
    status: "measured", reason: null, snapshotHash,
    renderedHtml: html, renderedHtmlHash: await sha256(canonicalJson(html)),
    initialTextLength: "Readable page".length,
    renderedTextLength: "Readable page".length, blockedRequests: [],
  };
}

describe("verified, offline Playwright-to-v2 integration", () => {
  it("scores only proven rendering controls from the same authorized snapshot", async () => {
    const snapshot = await captureAuditSnapshot(url, fetcher, now.toISOString());
    const result = await replayVerifiedV2Rendering(snapshot, await render(snapshot.snapshotHash), grant, now);
    expect(result.controls.find(control => control.controlId === "P01")).toMatchObject({
      status: "measured", earned: 4,
    });
    expect(result.controls.find(control => control.controlId === "P02")).toMatchObject({
      status: "measured", earned: 3,
    });
    expect(result.controls.find(control => control.controlId === "C01")).toMatchObject({
      status: "measured", earned: 0,
    });
    expect(result.controls.find(control => control.controlId === "B03")).toMatchObject({
      status: "measured", earned: 0,
    });
    expect(result.controls.find(control => control.controlId === "P03")?.status).toBe("unknown");
    expect(result.status).toBe("incomplete");
    expect(result.score).toBeNull();
  });

  it("rejects expired, revoked and wrong-host verification", async () => {
    const snapshot = await captureAuditSnapshot(url, fetcher, now.toISOString());
    const proof = await render(snapshot.snapshotHash);
    await expect(replayVerifiedV2Rendering(snapshot, proof,
      { ...grant, status: "revoked" }, now)).rejects.toThrow("not verified");
    await expect(replayVerifiedV2Rendering(snapshot, proof,
      { ...grant, expiresAt: "2026-11-02T00:00:00Z" }, now)).rejects.toThrow("expired");
    await expect(replayVerifiedV2Rendering(snapshot, proof,
      { ...grant, hostname: "sub.example.org" }, now)).rejects.toThrow("exact verified");
  });

  it("rejects rendering evidence from a different snapshot", async () => {
    const snapshot = await captureAuditSnapshot(url, fetcher, now.toISOString());
    await expect(replayVerifiedV2Rendering(snapshot, await render("forged"), grant, now))
      .rejects.toThrow("snapshot hash mismatch");
  });
});
