import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DomainVerificationRegistry } from "../src/geo/rendering/domain-registry.js";
import { verificationValue, HTTPS_PATH } from "../src/geo/rendering/domain-verification.js";
import type { PendingChallenge } from "../src/geo/rendering/domain-registry.js";
import type { VerificationTransport } from "../src/geo/rendering/domain-verification.js";

const started = new Date("2026-11-09T12:00:00Z");
const verified = new Date("2026-11-09T12:01:00Z");
const directories: string[] = [];
const registries: DomainVerificationRegistry[] = [];

function registry(): DomainVerificationRegistry {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-geo-domains-"));
  directories.push(dir);
  const store = new DomainVerificationRegistry(path.join(dir, "domains.sqlite3"));
  registries.push(store);
  return store;
}
afterEach(() => {
  for (const store of registries.splice(0)) store.close();
  for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function dnsProof(challenge: PendingChallenge): VerificationTransport {
  return {
    resolveTxt: vi.fn(async () => [verificationValue(challenge)]),
    readHttpsFile: vi.fn(async () => { throw new Error("wrong verification method"); }),
  };
}

describe("SQLite ownership registry", () => {
  it("consumes a DNS challenge once and enforces tenant isolation", async () => {
    const db = registry();
    const challenge = db.issue("tenant-a", "admin-a", "example.com", "dns-txt", started);
    expect(db.activeGrant("tenant-a", "example.com", verified)).toBeUndefined();
    await db.verify("tenant-a", "admin-a", challenge, dnsProof(challenge), verified);
    expect(db.activeGrant("tenant-a", "example.com", verified)?.status).toBe("verified");
    expect(db.activeGrant("tenant-b", "example.com", verified)).toBeUndefined();
    await expect(db.verify("tenant-a", "admin-a", challenge, dnsProof(challenge), verified)).rejects.toThrow(/consumed/);
    await expect(db.verify("tenant-b", "admin-a", challenge, dnsProof(challenge), verified)).rejects.toThrow();
    expect(() => db.issue("tenant-b", "admin-b", "example.com", "dns-txt", verified)).toThrow(/another tenant/);
    expect(db.auditEvents("tenant-a", "example.com").map((event) => event.action))
      .toEqual(["challenge_issued", "verified"]);
    expect(db.auditEvents("tenant-b", "example.com")).toEqual([]);
  });

  it("blocks forged token, wrong actor, and stale superseded challenges", async () => {
    const db = registry();
    const first = db.issue("tenant-a", "admin-a", "example.com", "dns-txt", started);
    const forged = { ...first, token: "0".repeat(64) };
    await expect(db.verify("tenant-a", "admin-a", forged, dnsProof(forged), verified)).rejects.toThrow();
    await expect(db.verify("tenant-a", "other-admin", first, dnsProof(first), verified)).rejects.toThrow();
    const second = db.issue("tenant-a", "admin-a", "example.com", "dns-txt", verified);
    await expect(db.verify("tenant-a", "admin-a", first, dnsProof(first), verified)).rejects.toThrow();
    await db.verify("tenant-a", "admin-a", second, dnsProof(second), verified);
    expect(db.activeGrant("tenant-a", "example.com", verified)).toBeDefined();
  });

  it("revokes verified grants and pending challenges", async () => {
    const db = registry();
    const initial = db.issue("tenant-a", "admin-a", "example.com", "dns-txt", started);
    await db.verify("tenant-a", "admin-a", initial, dnsProof(initial), verified);
    const pending = db.issue("tenant-a", "admin-a", "example.com", "https-file", verified);
    db.revoke("tenant-a", "admin-a", "example.com", new Date("2026-11-09T12:02:00Z"));
    expect(db.activeGrant("tenant-a", "example.com", verified)).toBeUndefined();
    await expect(db.verify("tenant-a", "admin-a", pending, {
      resolveTxt: async () => [],
      readHttpsFile: async (url) => ({ status: 200, finalUrl: url, body: verificationValue(pending), contentType: "text/plain" }),
    }, verified)).rejects.toThrow();
    expect(db.auditEvents("tenant-a", "example.com").at(-1)?.action).toBe("revoked");
  });

  it("expires grants and supports an exact HTTPS file proof", async () => {
    const db = registry();
    const challenge = db.issue("tenant-a", "admin-a", "site.example.com", "https-file", started);
    const transport: VerificationTransport = {
      resolveTxt: async () => [],
      readHttpsFile: vi.fn(async (url) => ({ status: 200, finalUrl: url, body: verificationValue(challenge), contentType: "text/plain" })),
    };
    await db.verify("tenant-a", "admin-a", challenge, transport, verified);
    expect(transport.readHttpsFile).toHaveBeenCalledWith(`https://site.example.com${HTTPS_PATH}`);
    expect(db.activeGrant("tenant-a", "site.example.com", new Date("2026-11-17T12:01:00Z"))).toBeUndefined();
    expect(db.activeGrant("tenant-a", "example.com", verified)).toBeUndefined();
  });
});
