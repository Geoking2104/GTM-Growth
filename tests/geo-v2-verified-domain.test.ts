import { describe, expect, it } from "vitest";
import { authorizeVerifiedAuditTarget } from "../src/geo/rendering/verified-domain.js";

const now = new Date("2026-11-09T12:00:00Z");
const grant = {
  hostname: "example.com", status: "verified" as const,
  verifiedAt: "2026-11-08T12:00:00Z", expiresAt: "2026-12-09T12:00:00Z",
};

describe("verified domain audit admission", () => {
  it("accepts an exact verified HTTPS host and path", () => {
    expect(authorizeVerifiedAuditTarget("https://example.com/a?b=1", grant, now))
      .toEqual({ url: "https://example.com/a?b=1", hostname: "example.com" });
  });
  it.each([
    "http://example.com", "https://sub.example.com", "https://example.com.evil.tld",
    "https://example.com:8443", "https://user@example.com", "https://example.com/#frag",
    "https://127.0.0.1", "https://localhost", "file:///etc/passwd",
  ])("rejects unapproved target %s", (url) => {
    expect(() => authorizeVerifiedAuditTarget(url, grant, now)).toThrow();
  });
  it("rejects an expired, pending or revoked grant", () => {
    for (const status of ["pending", "revoked"] as const) {
      expect(() => authorizeVerifiedAuditTarget("https://example.com", { ...grant, status }, now)).toThrow();
    }
    expect(() => authorizeVerifiedAuditTarget("https://example.com", { ...grant, expiresAt: now.toISOString() }, now)).toThrow();
  });
});
