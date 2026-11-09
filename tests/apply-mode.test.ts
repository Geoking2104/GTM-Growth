import { describe, expect, it } from "vitest";
import { createFileApplyPreview, previewRobotsAiFix, unifiedFileDiff,
  verifyFileApplyPreview, type FileApplyPreview } from "../src/apply/preview.js";
import { evaluateApplyAuthorization, nextApplyState,
  type ApplyAuthorizationContext } from "../src/apply/approval.js";
import type { Fetcher } from "../src/geo/http.js";

const now = new Date("2026-11-09T12:00:00.000Z");
const site = "https://example.com";
const target = `${site}/robots.txt`;

function proposal(before = "User-agent: *\nAllow: /\n", after = "User-agent: *\nAllow: /\nUser-agent: OAI-SearchBot\nAllow: /\n") {
  return createFileApplyPreview({
    tenantId: "acme", fixId: "robots-ai", kind: "robots", siteUrl: site,
    sourceUrl: target, observedStatus: 200, before, after, now,
  });
}

function context(fix: FileApplyPreview): ApplyAuthorizationContext {
  return {
    tenantId: "acme", actorId: "user-123", role: "approver",
    writeFeatureEnabled: true,
    now: new Date(now.getTime() + 60_000),
    domainGrant: { hostname: "example.com", status: "verified",
      verifiedAt: "2026-11-01T00:00:00Z", expiresAt: "2026-12-01T00:00:00Z" },
    approval: { tenantId: "acme", actorId: "user-123", proposalId: fix.proposalId,
      reviewedDiffSha256: fix.diffSha256, confirmed: true,
      approvedAt: new Date(now.getTime() + 30_000).toISOString(),
      expiresAt: new Date(now.getTime() + 5 * 60_000).toISOString(), consumedAt: null },
    preflight: { currentResourceSha256: fix.observed.sha256,
      backupContentSha256: fix.observed.sha256, activeAttemptExists: false,
      adapterWriteAllowed: true, idempotencyKey: "preview-unique-key-1234" },
  };
}

describe("Apply Mode — safe preview foundation", () => {
  it("returns an immutable-in-practice bounded line diff with content and proposal digests", () => {
    const fix = proposal();
    expect(fix.mode).toBe("dry-run");
    expect(fix.version).toBe("apply-preview-v1");
    expect(fix.diff).toContain("--- a/robots.txt");
    expect(fix.diff).toContain("+User-agent: OAI-SearchBot");
    expect(fix.diff).not.toContain("-User-agent: *");
    expect(fix.observed.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fix.diffSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fix.proposalId).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyFileApplyPreview(fix)).toBe(true);
    expect(fix.expiresAt).toBe("2026-11-09T12:15:00.000Z");
  });

  it("never writes: only one public GET, with human review on existing bot blocks", async () => {
    const calls: string[] = [];
    const fetcher: Fetcher = async url => {
      calls.push(url);
      return { url, status: 200, ok: true, headers: {},
        body: "User-agent: *\nAllow: /\nUser-agent: OAI-SearchBot\nDisallow: /\n" };
    };
    const result = await previewRobotsAiFix({ url: site, tenantId: "acme", fetcher, now });
    expect(calls).toEqual([target]);
    expect(result.target.url).toBe(target);
    expect(result.manualReview.some(note => note.includes("OAI-SearchBot"))).toBe(true);
    expect(result.after).toContain("Disallow: /");
    expect(evaluateApplyAuthorization(result, context(result)).allowed).toBe(false);
  });

  it("allows a 404 preview but fails closed on redirects, transport errors and unsafe status", async () => {
    const absent: Fetcher = async url => ({ url, status: 404, ok: false, headers: {}, body: "not found" });
    const preview = await previewRobotsAiFix({ url: site, tenantId: "acme", fetcher: absent, now });
    expect(preview.observed.status).toBe(404);
    expect(preview.before).toBe("");
    expect(preview.changed).toBe(true);
    const blocked: Fetcher = async url => ({ url, status: 403, ok: false, headers: {}, body: "blocked" });
    await expect(previewRobotsAiFix({ url: site, tenantId: "acme", fetcher: blocked }))
      .rejects.toThrow("Cannot safely preview");
    const redirected: Fetcher = async () => ({ url: `${site}/wrong.txt`, status: 200, ok: true, headers: {}, body: "" });
    await expect(previewRobotsAiFix({ url: site, tenantId: "acme", fetcher: redirected }))
      .rejects.toThrow("unexpected redirect");
    const networkFailure: Fetcher = async () => { throw new Error("timeout"); };
    await expect(previewRobotsAiFix({ url: site, tenantId: "acme", fetcher: networkFailure }))
      .rejects.toThrow("timeout");
  });

  it("rejects mismatched targets, insecure schemes, unobserved status and oversized diffs", () => {
    const baseline = { tenantId: "acme", fixId: "robots-ai" as const, kind: "robots" as const,
      siteUrl: site, sourceUrl: target, observedStatus: 200 as const,
      before: "a", after: "b", now };
    expect(() => createFileApplyPreview({ ...baseline, sourceUrl: `${site}/.env` })).toThrow("Source/target");
    expect(() => createFileApplyPreview({ ...baseline, siteUrl: "http://example.com" })).toThrow("public HTTPS");
    expect(() => createFileApplyPreview({ ...baseline, observedStatus: 500 as 200 })).toThrow("HTTP 200 or 404");
    expect(() => createFileApplyPreview({ ...baseline, before: "a\n".repeat(450) })).toThrow("budget");
    expect(unifiedFileDiff("robots", "same", "same")).toBe("");
  });

  it("requires a trusted explicit approval, actor, exact grant, backup, lock and matching current content", () => {
    const fix = proposal();
    const good = context(fix);
    expect(evaluateApplyAuthorization(fix, good)).toEqual({ allowed: true, reasons: [] });
    for (const [field, changed] of [
      ["read-only role", { role: "editor" }],
      ["wrong tenant", { tenantId: "other" }],
      ["feature off", { writeFeatureEnabled: false }],
      ["missing grant", { domainGrant: null }],
      ["already locked", { preflight: { ...good.preflight, activeAttemptExists: true } }],
      ["stale target", { preflight: { ...good.preflight, currentResourceSha256: "stale" } }],
      ["no backup", { preflight: { ...good.preflight, backupContentSha256: null } }],
    ] as const) {
      expect(evaluateApplyAuthorization(fix, { ...good, ...changed } as ApplyAuthorizationContext).allowed,
        field).toBe(false);
    }
    expect(evaluateApplyAuthorization(fix, { ...good, approval: null }).allowed).toBe(false);
    expect(evaluateApplyAuthorization(fix, { ...good,
      approval: { ...good.approval!, confirmed: false } }).allowed).toBe(false);
    expect(evaluateApplyAuthorization(fix, { ...good,
      approval: { ...good.approval!, reviewedDiffSha256: "another-diff" } }).allowed).toBe(false);
    expect(evaluateApplyAuthorization(fix, { ...good,
      approval: { ...good.approval!, consumedAt: now.toISOString() } }).allowed).toBe(false);
    expect(evaluateApplyAuthorization(fix, { ...good,
      domainGrant: { ...good.domainGrant!, hostname: "other.example.com" } }).allowed).toBe(false);
    expect(evaluateApplyAuthorization(fix, { ...good,
      now: new Date("2026-11-09T13:00:00Z") }).allowed).toBe(false);
  });

  it("detects tampered proposed text or review diff before any authorization", () => {
    const fix = proposal();
    const ctx = context(fix);
    const modified = { ...fix, after: "malicious replacement" };
    expect(verifyFileApplyPreview(modified)).toBe(false);
    expect(evaluateApplyAuthorization(modified, ctx).allowed).toBe(false);
    expect(verifyFileApplyPreview({ ...fix, diffSha256: "forged" })).toBe(false);
    expect(verifyFileApplyPreview({ ...fix, target: { ...fix.target, path: "/private" } })).toBe(false);
    expect(verifyFileApplyPreview({ ...fix, manualReview: ["forged warning"] })).toBe(false);
    expect(verifyFileApplyPreview({ ...fix, expiresAt: "2027-01-01T00:00:00Z" })).toBe(false);
    expect(verifyFileApplyPreview({ ...fix, manualReview: null as unknown as string[] })).toBe(false);
    expect(evaluateApplyAuthorization({ ...fix, manualReview: null as unknown as string[] }, ctx).allowed).toBe(false);
    const noChange = proposal("same", "same");
    expect(noChange.changed).toBe(false);
    expect(evaluateApplyAuthorization(noChange, context(noChange)).allowed).toBe(false);
  });

  it("enforces the application/verification/rollback sequence, never skipping backup", () => {
    expect(nextApplyState("proposed", "previewed")).toBe("previewed");
    expect(nextApplyState("previewed", "approved")).toBe("approved");
    expect(nextApplyState("approved", "backed_up")).toBe("backed_up");
    expect(nextApplyState("backed_up", "applying")).toBe("applying");
    expect(nextApplyState("applying", "uncertain")).toBe("uncertain");
    expect(nextApplyState("uncertain", "verifying")).toBe("verifying");
    expect(nextApplyState("verifying", "verified")).toBe("verified");
    expect(nextApplyState("verified", "rollback_requested")).toBe("rollback_requested");
    expect(nextApplyState("rollback_requested", "rolled_back")).toBe("rolled_back");
    expect(() => nextApplyState("previewed", "applying")).toThrow("Invalid Apply Mode transition");
    expect(() => nextApplyState("uncertain", "applying")).toThrow("Invalid Apply Mode transition");
    expect(() => nextApplyState("rolled_back", "applying")).toThrow("Invalid Apply Mode transition");
  });
});
