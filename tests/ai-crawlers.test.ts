import { describe, expect, it } from "vitest";
import {
  AI_CRAWLER_LOGS_MAX_LINES,
  analyzeAiCrawlerLogs,
  classifyCrawler,
  sectionOf,
} from "../src/ai-crawlers/logs.js";
import { buildAiCrawlerPolicyDraft, parseCrawlerChoices } from "../src/ai-crawlers/policy.js";

const accessLine = (bot: string, path: string, status = 200, date = "23/Nov/2026:10:00:00 +0100") =>
  `203.0.113.5 - - [${date}] "GET ${path} HTTP/1.1" ${status} 512 "-" "Mozilla/5.0 (compatible; ${bot}/1.0; +https://example.com/bot)"`;
const browserLine = (path: string) =>
  `203.0.113.9 - - [23/Nov/2026:12:00:00 +0100] "GET ${path} HTTP/1.1" 200 2048 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/120.0"`;

describe("AI-crawler log analytics (R6)", () => {
  it("classifies the registry bots by longest token and leaves the rest unknown", () => {
    expect(classifyCrawler("Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)")).toBe("GPTBot");
    expect(classifyCrawler("Mozilla/5.0 AppleWebKit PerplexityBot/1.0")).toBe("PerplexityBot");
    expect(classifyCrawler("Mozilla/5.0 (compatible; OAI-SearchBot/1.0)")).toBe("OAI-SearchBot");
    expect(classifyCrawler("Mozilla/5.0 (compatible; ClaudeBot/1.0)")).toBe("ClaudeBot");
    expect(classifyCrawler("Mozilla/5.0 (compatible; AI2Bot-Dolma/1.0)")).toBe("AI2Bot-Dolma");
    expect(classifyCrawler("Mozilla/5.0 Firefox/120.0")).toBeNull();
  });

  it("splits paths into first-level sections, root included", () => {
    expect(sectionOf("/blog/mon-article?utm=x")).toBe("/blog");
    expect(sectionOf("/produits/fiche")).toBe("/produits");
    expect(sectionOf("/")).toBe("/");
    expect(sectionOf("index.html")).toBe("/index.html");
  });

  it("measures per-crawler and per-section coverage over the supplied lines only", () => {
    const logs = [
      accessLine("GPTBot", "/blog/guide-gtm"),
      accessLine("GPTBot", "/blog/guide-gtm?type=x", 200, "23/Nov/2026:11:30:00 +0100"),
      accessLine("ClaudeBot", "/produits/fiche", 404),
      accessLine("PerplexityBot", "/"),
      accessLine("OAI-SearchBot", "/blog/guide-gtm"),
      browserLine("/blog/guide-gtm"),
      browserLine("/"),
      "this line is not a parsable access log entry",
    ].join("\n");
    const stats = analyzeAiCrawlerLogs({ logs, now: new Date("2026-11-23T14:00:00Z") });
    expect(stats.version).toBe("ai-crawler-logs-v1");
    expect(stats.provenance).toMatchObject({ source: "tenant-supplied-access-logs", parsedAt: "2026-11-23T14:00:00.000Z", logFormat: "nginx-combined" });
    expect(stats.totals).toEqual({ lines: 8, parsed: 7, ignored: 1, crawlerRequests: 5, otherRequests: 2 });
    expect(stats.crawlers[0]).toMatchObject({ bot: "GPTBot", requests: 2, pages: 2, served: 2, errors: 0 });
    expect(stats.crawlers.some((row: any) => row.bot === "ClaudeBot" && row.errors === 1)).toBe(true);
    expect(stats.crawlers.some((row: any) => row.bot === "OAI-SearchBot")).toBe(true);
    expect(stats.sections[0]).toMatchObject({ section: "/blog", requests: 3, pages: 2 });
    expect(stats.sections.find((row: any) => row.section === "/blog").byCrawler).toEqual({ GPTBot: 2, "OAI-SearchBot": 1 });
    expect(stats.sections.some((row: any) => row.section === "/")).toBe(true);
    expect(stats.firstSeenAt).toBe("2026-11-23T09:00:00.000Z");
    expect(stats.lastSeenAt).toBe("2026-11-23T11:00:00.000Z");
    expect(stats.totals.lines).toBe(8);
  });

  it("refuses oversized or empty log payloads with explicit French errors", () => {
    expect(() => analyzeAiCrawlerLogs({ logs: "" })).toThrow("Aucune ligne de journal fournie");
    expect(() => analyzeAiCrawlerLogs({ logs: "  \n \n" })).toThrow("Aucune ligne de journal fournie");
    const tooManyLines = Array.from({ length: AI_CRAWLER_LOGS_MAX_LINES + 1 }, () => `1.1.1.1 - - [23/Nov/2026:00:00:00 +0000] "GET /a HTTP/1.1" 200 1 "-" "x"`).join("\n");
    expect(() => analyzeAiCrawlerLogs({ logs: tooManyLines })).toThrow(/Trop de lignes/);
    const tooHeavy = `${accessLine("GPTBot", "/")}\n${"x".repeat(600 * 1024)}`;
    expect(() => analyzeAiCrawlerLogs({ logs: tooHeavy })).toThrow(/volumineux/);
  });

  it("keeps unknown crawlers honest: no fabricated coverage", () => {
    const stats = analyzeAiCrawlerLogs({ logs: [browserLine("/"), browserLine("/prix"), "garbage"].join("\n") });
    expect(stats.crawlers).toEqual([]);
    expect(stats.sections).toEqual([]);
    expect(stats.totals).toMatchObject({ parsed: 2, crawlerRequests: 0, otherRequests: 2 });
    expect(stats.note).toContain("inventée");
  });
});

describe("AI-bot robots and llms.txt policy drafts (R6)", () => {
  it("validates crawler choices against the exact registry tokens", () => {
    expect(parseCrawlerChoices([{ agent: "GPTBot", action: "allow" }])).toEqual([{ agent: "GPTBot", action: "allow" }]);
    expect(() => parseCrawlerChoices([])).toThrow("au moins un crawler");
    expect(() => parseCrawlerChoices([{ agent: "NotABot", action: "allow" }])).toThrow("Crawler IA inconnu");
    expect(() => parseCrawlerChoices([{ agent: "GPTBot", action: "maybe" }])).toThrow("Action invalide");
    expect(() => parseCrawlerChoices([{ agent: "GPTBot", action: "allow" }, { agent: "GPTBot", action: "disallow" }])).toThrow("en double");
  });

  it("appends explicit rules without touching existing groups and reports them for review", () => {
    const draft = buildAiCrawlerPolicyDraft({
      baseUrl: "https://example.com/",
      currentRobots: "User-agent: GPTBot\nDisallow:\n\nUser-agent: *\nDisallow: /private/\n",
      currentLlms: null,
      choices: [
        { agent: "GPTBot", action: "allow" },
        { agent: "PerplexityBot", action: "disallow" },
      ],
    });
    expect(draft.mode).toBe("dry-run");
    expect(draft.changed).toBe(true);
    expect(draft.robots.before).toContain("User-agent: GPTBot");
    expect(draft.robots.before).toContain("User-agent: *");
    expect(draft.robots.after).toContain("User-agent: PerplexityBot");
    expect(draft.robots.after).toContain("Disallow: /");
    expect(draft.robots.after).toContain("User-agent: GPTBot");
    expect(draft.robots.diff).toContain("+User-agent: PerplexityBot");
    expect(draft.robots.manualReview.some((note: string) => note.includes("GPTBot"))).toBe(true);
    expect(draft.robots.manualReview.some((note: string) => note.includes("llms.txt"))).toBe(true);
    expect(draft.llms.before).toBeNull();
    expect(draft.llms.diff).toBeNull();
    expect(draft.llms.after).toContain("# example.com");
    expect(draft.llms.after).toContain("- PerplexityBot (Perplexity AI (index builder)) : refusé");
    expect(draft.llms.after).toContain("https://example.com/robots.txt");
  });

  it("diffs the llms draft against a supplied current file", () => {
    const draft = buildAiCrawlerPolicyDraft({
      baseUrl: "https://example.com",
      currentRobots: "",
      currentLlms: "# Old\n> old summary",
      choices: [{ agent: "ClaudeBot", action: "allow" }],
    });
    expect(draft.llms.before).toBe("# Old\n> old summary");
    expect(draft.llms.changed).toBe(true);
    expect(draft.llms.diff).toContain("+# example.com");
    expect(draft.robots.after).toContain("User-agent: ClaudeBot");
    expect(draft.robots.after).toContain("Allow: /");
  });

  it("refuses invalid inputs before any text is produced", () => {
    expect(() => buildAiCrawlerPolicyDraft({ baseUrl: "http://example.com", currentRobots: "", currentLlms: null, choices: [{ agent: "GPTBot", action: "allow" }] })).toThrow("HTTPS");
    expect(() => buildAiCrawlerPolicyDraft({ baseUrl: "https://example.com/path", currentRobots: "", currentLlms: null, choices: [{ agent: "GPTBot", action: "allow" }] })).toThrow("HTTPS");
    expect(() => buildAiCrawlerPolicyDraft({ baseUrl: "https://example.com", currentRobots: `${"x".repeat(70 * 1024)}`, currentLlms: null, choices: [{ agent: "GPTBot", action: "allow" }] })).toThrow("budget");
  });

  it("reports when no robots change is needed because every choice is already covered", () => {
    const draft = buildAiCrawlerPolicyDraft({
      baseUrl: "https://example.com",
      currentRobots: "User-agent: GPTBot\nAllow: /\n",
      currentLlms: null,
      choices: [{ agent: "GPTBot", action: "disallow" }],
    });
    expect(draft.robots.changed).toBe(false);
    expect(draft.robots.after).toBe(draft.robots.before);
    expect(draft.robots.manualReview.some((note: string) => note.includes("Aucun changement robots"))).toBe(true);
  });
});
