import { describe, expect, it } from "vitest";
import { runGeoAudit } from "../src/geo/audit.js";
import type { Fetcher } from "../src/geo/http.js";
import {
  auditResourceUrls, captureAuditSnapshot, discoverScriptUrls, replaySnapshot, verifySnapshotEnvelope,
} from "../src/geo/proof/snapshot.js";

function fixtureFetcher(seed: number): Fetcher {
  return async (url) => {
    const path = new URL(url).pathname;
    const body = path === "/"
      ? `<html lang="fr"><head><title>Site ${seed}</title><meta name="description" content="Verified source"><link rel="canonical" href="${url}"></head><body><h1>Site ${seed}</h1><h2>Answers</h2><h3>Facts</h3><p>${"factual content ".repeat(160)}</p></body></html>`
      : path === "/robots.txt" ? "User-agent: *\nAllow: /\n"
      : path === "/llms.txt" ? `# Site ${seed}\n> Summary\n## Links\n- [Home](${new URL(url).origin})`
      : "";
    return { url, status: body ? 200 : 404, ok: Boolean(body), headers: { "content-type": "text/html" }, body };
  };
}

describe("GEO audit snapshot capture and replay", () => {
  it("captures only the explicit page and seven resource paths", () => {
    expect(auditResourceUrls("https://example.org/")).toHaveLength(8);
    expect(() => auditResourceUrls("file:///etc/passwd")).toThrow("HTTP(S)");
    expect(() => auditResourceUrls("https://user:password@example.org/")).toThrow("credential-free");
  });

  it("does not export sensitive HTTP response headers", async () => {
    const fetcher: Fetcher = async (url) => ({ url, status: 200, ok: true, body: "ok", headers: {
      "Set-Cookie": "session=secret", "authorization": "Bearer secret", "X-Api-Key": "secret",
      "Content-Type": "text/html", "X-Robots-Tag": "noindex",
    } });
    const envelope = await captureAuditSnapshot("https://example.org/", fetcher, "2026-11-08T10:00:00Z");
    expect(envelope.snapshot.resources[0].response?.headers).toEqual({
      "content-type": "text/html", "x-robots-tag": "noindex",
    });
    expect(JSON.stringify(envelope)).not.toContain("secret");
    await expect(verifySnapshotEnvelope(envelope)).resolves.toBeUndefined();
  });

  it("replays 20 snapshots offline with identical legacy audit results", async () => {
    for (let seed = 0; seed < 20; seed++) {
      const url = `https://example${seed}.org/`;
      const source = fixtureFetcher(seed);
      const envelope = await captureAuditSnapshot(url, source, "2026-11-08T10:00:00Z");
      await expect(verifySnapshotEnvelope(envelope)).resolves.toBeUndefined();
      const offline = await replaySnapshot(JSON.parse(JSON.stringify(envelope)));
      const expected = await runGeoAudit({ url, fetcher: source });
      const reproduced = await runGeoAudit({ url, fetcher: offline });
      expect(reproduced.score).toBe(expected.score);
      expect(reproduced.scoreBreakdown).toEqual(expected.scoreBreakdown);
      expect(reproduced.checks).toEqual(expected.checks);
      expect(envelope.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("rejects a changed body or removed resource", async () => {
    const envelope = await captureAuditSnapshot("https://example.org/", fixtureFetcher(1), "2026-11-08T10:00:00Z");
    envelope.snapshot.resources[0].response!.body = "tampered";
    await expect(replaySnapshot(envelope)).rejects.toThrow("hash mismatch");
    envelope.snapshot.resources.pop();
    await expect(replaySnapshot(envelope)).rejects.toThrow("Incomplete");
  });

  it("records failed fetches without fabricating page content", async () => {
    const unavailable: Fetcher = async () => { throw new Error("network unavailable"); };
    const envelope = await captureAuditSnapshot("https://example.org/", unavailable, "2026-11-08T10:00:00Z");
    expect(envelope.snapshot.resources.every((resource) => resource.response === null && resource.error === "fetch_failed")).toBe(true);
    const offline = await replaySnapshot(envelope);
    await expect(offline("https://example.org/")).rejects.toThrow("Original fetch failed");
  });

  it("discovers same-origin scripts, deduplicates, and refuses external sources", () => {
    const result = discoverScriptUrls(
      '<base href="/app/"><script src="./main.js"></script><script src="./main.js"></script>' +
      '<script src="https://cdn.example.net/lib.js"></script><script src="data:text/javascript,alert(1)"></script>',
      "https://example.org/",
    );
    expect(result.urls).toEqual(["https://example.org/app/main.js"]);
    expect(result.skipped).toHaveLength(2);
  });

  it("captures scripts, replays them offline, and detects modified script content", async () => {
    const fetchWithScript: Fetcher = async (url) => ({
      url, status: url.endsWith("/main.js") || url === "https://example.org/" ? 200 : 404,
      ok: true,
      headers: { "content-type": url.endsWith(".js") ? "application/javascript" : "text/html" },
      body: url === "https://example.org/" ? '<html><script src="/main.js"></script></html>'
        : url.endsWith("/main.js") ? 'document.body.textContent = "hello"' : "",
    });
    const envelope = await captureAuditSnapshot("https://example.org/", fetchWithScript, "2026-11-08T10:00:00Z");
    expect(envelope.snapshot.scriptAssets?.map((asset) => asset.requestUrl)).toEqual(["https://example.org/main.js"]);
    const offline = await replaySnapshot(envelope);
    expect((await offline("https://example.org/main.js")).body).toContain("hello");
    envelope.snapshot.scriptAssets![0].response!.body = "tampered";
    await expect(verifySnapshotEnvelope(envelope)).rejects.toThrow("hash mismatch");
  });

  it("marks external scripts as skipped without retrieving them", async () => {
    const calls: string[] = [];
    const fetcher: Fetcher = async (url) => {
      calls.push(url);
      return {
        url, status: 200, ok: true, headers: { "content-type": "text/html" },
        body: url === "https://example.org/" ? '<script src="https://cdn.example.net/tracker.js"></script>' : "",
      };
    };
    const envelope = await captureAuditSnapshot("https://example.org/", fetcher, "2026-11-08T10:00:00Z");
    expect(envelope.snapshot.skippedScripts).toEqual(["https://cdn.example.net/tracker.js"]);
    expect(calls).not.toContain("https://cdn.example.net/tracker.js");
  });
});
