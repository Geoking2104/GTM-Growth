import { describe, expect, it } from "vitest";
import { createPublicFetcher, publicIpv4 } from "../src/http/public-fetch.js";
import type { FetchResult } from "../src/geo/http.js";
const result = (url: URL, status: number, location?: string): FetchResult => ({ url: url.href, status, ok: status === 200, headers: location ? { location } : {}, body: "ok" });
describe("public page fetch", () => {
  it("rejects private, reserved and IPv6 addresses", () => {
    for (const ip of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.1", "198.51.100.3", "::1", "224.0.0.1"]) expect(publicIpv4(ip)).toBe(false);
    expect(publicIpv4("8.8.8.8")).toBe(true);
  });
  it("pins the resolved address and revalidates every redirect", async () => {
    const calls: string[] = [];
    const fetcher = createPublicFetcher({ resolve: async (host) => host === "private.example" ? ["127.0.0.1"] : ["8.8.8.8"], send: async (url, address) => { calls.push(`${url.hostname}:${address}`); return result(url, 302, "http://private.example/"); } });
    await expect(fetcher("https://public.example/")).rejects.toThrow(/public IPv4/);
    expect(calls).toEqual(["public.example:8.8.8.8"]);
  });
  it("refuses a mixed public and private DNS response and redirect loops", async () => {
    const mixed = createPublicFetcher({ resolve: async () => ["8.8.8.8", "10.0.0.1"], send: async (url) => result(url, 200) });
    await expect(mixed("https://public.example")).rejects.toThrow();
    let calls = 0;
    const loop = createPublicFetcher({ resolve: async () => ["8.8.8.8"], send: async (url) => { calls++; return result(url, 302, "/"); } });
    await expect(loop("https://public.example")).rejects.toThrow(/redirects/);
    expect(calls).toBe(4);
  });
});
