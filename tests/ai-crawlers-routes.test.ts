import { describe, expect, it, vi, afterEach } from "vitest";
import { aiCrawlerRoutes } from "../src/console/ai-crawlers.js";

afterEach(() => vi.unstubAllGlobals());

const ctx = (body: Record<string, unknown> = {}) => ({
  url: "",
  body,
  user: { sub: "user-1" },
  tenancy: { tenant: { id: "acme", status: "active", domains: ["example.com"] } },
} as any);
const route = (path: string, fetcher?: any) => aiCrawlerRoutes(fetcher).find((r) => r.path === path)!;

describe("AI-crawler console routes (R6)", () => {
  it("keeps both routes tenant-admin only", () => {
    for (const r of aiCrawlerRoutes()) expect(r.adminOnly).toBe(true);
  });

  it("analyzes tenant-supplied logs and reports the provenance", async () => {
    const logs = '203.0.113.5 - - [23/Nov/2026:10:00:00 +0100] "GET /blog/guide HTTP/1.1" 200 512 "-" "Mozilla/5.0 (compatible; GPTBot/1.0)"';
    const result = await route("/ai-crawlers/analyze").handler(ctx({ logs })) as Record<string, any>;
    expect(result.provenance).toMatchObject({ source: "tenant-supplied-access-logs", logFormat: "nginx-combined" });
    expect(result.crawlers[0]).toMatchObject({ bot: "GPTBot", requests: 1 });
    expect(result.totals).toMatchObject({ parsed: 1, crawlerRequests: 1 });
    await expect(route("/ai-crawlers/analyze").handler(ctx({}))).rejects.toThrow("Aucune ligne de journal");
    await expect(route("/ai-crawlers/analyze").handler(ctx({ logs: "\n  \n" }))).rejects.toThrow("Aucune ligne de journal");
  });

  it("builds dry-run policy drafts and refuses write flags", async () => {
    const result = await route("/apply/ai-crawlers/policy").handler(ctx({
      url: "https://www.example.com",
      robots: "User-agent: *\nDisallow: /private/\n",
      llms: "",
      choices: [
        { agent: "GPTBot", action: "allow" },
        { agent: "PerplexityBot", action: "disallow" },
      ],
    })) as Record<string, any>;
    expect(result.writesEnabled).toBe(false);
    expect(result.actionsAvailable).toEqual(["draft"]);
    expect(result.requiresSeparateDomainVerificationAndApproval).toBe(true);
    expect(result.policy.robots.after).toContain("User-agent: PerplexityBot");
    expect(result.policy.robots.diff).toContain("+User-agent:");
    expect(result.policy.mode).toBe("dry-run");
    expect(result.policy.llms.after).toContain("# www.example.com");
    await expect(route("/apply/ai-crawlers/policy").handler(ctx({
      url: "https://www.example.com", robots: "", choices: [{ agent: "GPTBot", action: "allow" }], confirm: true,
    }))).rejects.toThrow("désactivées");
  });

  it("validates the site URL against the tenant's registered domains", async () => {
    await expect(route("/apply/ai-crawlers/policy").handler(ctx({
      url: "https://other.test", robots: "", choices: [{ agent: "GPTBot", action: "allow" }],
    }))).rejects.toThrow("enregistré");
    await expect(route("/apply/ai-crawlers/policy").handler(ctx({
      url: "not a url", robots: "", choices: [{ agent: "GPTBot", action: "allow" }],
    }))).rejects.toThrow("URL du site invalide");
    await expect(route("/apply/ai-crawlers/policy").handler(ctx({
      url: "https://www.example.com", robots: "", choices: [{ agent: "FakeBot", action: "allow" }],
    }))).rejects.toThrow("Crawler IA inconnu");
    await expect(route("/apply/ai-crawlers/policy").handler(ctx({
      url: "https://www.example.com", robots: "", choices: [],
    }))).rejects.toThrow("au moins un crawler");
  });

  it("reads the current robots.txt and llms.txt through the injected fetcher only", async () => {
    const fetched: string[] = [];
    const fetcher = async (url: string, init?: any) => {
      fetched.push(`${url}|${init?.accept ?? ""}`);
      if (url.endsWith("/robots.txt"))
        return { url, status: 200, body: "User-agent: *\nDisallow: /private/\n" };
      return { url, status: 404, body: "" };
    };
    const result = await route("/apply/ai-crawlers/policy", fetcher).handler(ctx({
      url: "https://www.example.com",
      fetchLlms: true,
      choices: [{ agent: "GPTBot", action: "allow" }],
    })) as Record<string, any>;
    expect(fetched).toEqual(["https://www.example.com/robots.txt|text/plain", "https://www.example.com/llms.txt|text/plain"]);
    expect(result.policy.robots.before).toContain("Disallow: /private/");
    expect(result.policy.llms.before).toBeNull();
    expect(result.policy.llms.diff).toBeNull();
    expect(result.policy.llms.changed).toBe(true);
  });
});
