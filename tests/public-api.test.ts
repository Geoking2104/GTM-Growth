import { describe, expect, it } from "vitest";
import { checkTarget, isPrivateAddress } from "../src/http/public-api.js";

const publicLookup = (async () => [{ address: "93.184.216.34", family: 4 }]) as never;
const privateLookup = (async () => [{ address: "10.0.0.7", family: 4 }]) as never;

describe("public API guards", () => {
  it("flags every private range", () => {
    for (const address of ["10.1.2.3", "127.0.0.1", "172.16.4.4", "192.168.1.1", "169.254.169.254", "100.64.1.1", "::1", "fd00::1", "fe80::1"]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it("lets public addresses through", () => {
    for (const address of ["93.184.216.34", "8.8.8.8", "2606:4700::1111"]) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it("rejects non-http protocols", async () => {
    const result = await checkTarget("file:///etc/passwd", { resolve: publicLookup });
    expect(result.ok).toBe(false);
  });

  it("rejects credentials embedded in the URL", async () => {
    const result = await checkTarget("https://user:pass@example.com", { resolve: publicLookup });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("credentials");
  });

  it("rejects a host that resolves to a private address", async () => {
    const result = await checkTarget("https://internal.example.com", { resolve: privateLookup });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("private");
  });

  it("accepts a normal public URL and adds the scheme", async () => {
    const result = await checkTarget("example.com/pricing", { resolve: publicLookup });
    expect(result.ok).toBe(true);
    expect(result.url).toBe("https://example.com/pricing");
  });

  it("rejects an unresolvable host", async () => {
    const failing = (async () => {
      throw new Error("ENOTFOUND");
    }) as never;
    const result = await checkTarget("https://nope.invalid", { resolve: failing });
    expect(result.ok).toBe(false);
  });

  it("rejects empty input", async () => {
    expect((await checkTarget("", { resolve: publicLookup })).ok).toBe(false);
    expect((await checkTarget(undefined, { resolve: publicLookup })).ok).toBe(false);
  });
});
