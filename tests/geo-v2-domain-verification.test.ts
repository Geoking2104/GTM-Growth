import { describe, expect, it, vi } from "vitest";
import { evaluateDomainChallenge, issueDomainChallenge, verificationValue, DNS_PREFIX, HTTPS_PATH } from "../src/geo/rendering/domain-verification.js";
import type { VerificationTransport } from "../src/geo/rendering/domain-verification.js";

const issuedAt = new Date("2026-11-09T12:00:00Z");
const checkedAt = new Date("2026-11-09T12:01:00Z");

function fakeTransport(): VerificationTransport {
  return {
    resolveTxt: vi.fn(async () => []),
    readHttpsFile: vi.fn(async () => ({ status: 404, finalUrl: "", body: "", contentType: "text/plain" })),
  };
}

describe("GEO v2 ownership challenges", () => {
  it("creates a unique 256-bit token and a 30-minute challenge", () => {
    const a = issueDomainChallenge("example.com", "dns-txt", issuedAt);
    const b = issueDomainChallenge("example.com", "dns-txt", issuedAt);
    expect(a.token).toMatch(/^[a-f0-9]{64}$/);
    expect(a.token).not.toBe(b.token);
    expect(Date.parse(a.expiresAt) - Date.parse(a.issuedAt)).toBe(30 * 60 * 1000);
  });

  it("verifies a single exact DNS TXT record", async () => {
    const challenge = issueDomainChallenge("example.com", "dns-txt", issuedAt);
    const transport = fakeTransport();
    transport.resolveTxt = vi.fn(async () => [verificationValue(challenge)]);
    const grant = await evaluateDomainChallenge(challenge, transport, checkedAt);
    expect(grant.status).toBe("verified");
    expect(grant.hostname).toBe("example.com");
    expect(transport.resolveTxt).toHaveBeenCalledWith(`${DNS_PREFIX}example.com`);
  });

  it("rejects DNS records for a different token or ambiguous record sets", async () => {
    const challenge = issueDomainChallenge("example.com", "dns-txt", issuedAt);
    for (const records of [["gtm-growth-verification=wrong"], [verificationValue(challenge), "unrelated"]]) {
      const transport = fakeTransport();
      transport.resolveTxt = vi.fn(async () => records);
      await expect(evaluateDomainChallenge(challenge, transport, checkedAt)).rejects.toThrow();
    }
  });

  it("verifies exact HTTPS text with no redirect", async () => {
    const challenge = issueDomainChallenge("example.com", "https-file", issuedAt);
    const url = `https://example.com${HTTPS_PATH}`;
    const transport = fakeTransport();
    transport.readHttpsFile = vi.fn(async () => ({ status: 200, finalUrl: url, body: `${verificationValue(challenge)}\n`, contentType: "text/plain; charset=utf-8" }));
    await expect(evaluateDomainChallenge(challenge, transport, checkedAt)).resolves.toMatchObject({ hostname: "example.com", status: "verified" });
    expect(transport.readHttpsFile).toHaveBeenCalledWith(url);
  });

  it("rejects redirects, HTML, and missing files", async () => {
    const challenge = issueDomainChallenge("example.com", "https-file", issuedAt);
    const url = `https://example.com${HTTPS_PATH}`;
    for (const invalid of [
      { status: 302, finalUrl: url, body: verificationValue(challenge), contentType: "text/plain" },
      { status: 200, finalUrl: "https://evil.tld/", body: verificationValue(challenge), contentType: "text/plain" },
      { status: 200, finalUrl: url, body: verificationValue(challenge), contentType: "text/html" },
    ]) {
      const transport = fakeTransport();
      transport.readHttpsFile = vi.fn(async () => invalid);
      await expect(evaluateDomainChallenge(challenge, transport, checkedAt)).rejects.toThrow();
    }
  });

  it("rejects expired or already consumed challenges before network access", async () => {
    const challenge = issueDomainChallenge("example.com", "dns-txt", issuedAt);
    const transport = fakeTransport();
    await expect(evaluateDomainChallenge(challenge, transport, new Date("2026-11-09T12:31:00Z"))).rejects.toThrow();
    await expect(evaluateDomainChallenge({ ...challenge, consumedAt: checkedAt.toISOString() }, transport, checkedAt)).rejects.toThrow();
    expect(transport.resolveTxt).not.toHaveBeenCalled();
  });

  it("rejects localhost, IP literals and malformed ownership hostnames", () => {
    for (const hostname of ["localhost", "127.0.0.1", "[::1]", "evil.local", "example.com/path", "EXAMPLE.COM"]) {
      expect(() => issueDomainChallenge(hostname, "dns-txt", issuedAt)).toThrow();
    }
  });
});
