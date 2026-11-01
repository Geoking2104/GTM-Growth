import { describe, expect, it } from "vitest";
import { auditUrlShape, normalizeTarget, verdict } from "../site/preview.js";

describe("landing free read — URL parsing", () => {
  it("accepts a bare domain and upgrades it to https", () => {
    const parsed = normalizeTarget("example.com");
    expect(parsed.ok).toBe(true);
    expect(parsed.url.protocol).toBe("https:");
    expect(parsed.url.hostname).toBe("example.com");
  });

  it("keeps an explicit http scheme", () => {
    const parsed = normalizeTarget("http://example.com/path");
    expect(parsed.ok).toBe(true);
    expect(parsed.url.protocol).toBe("http:");
  });

  it("rejects empty, malformed, non-http and host-only inputs", () => {
    expect(normalizeTarget("").ok).toBe(false);
    expect(normalizeTarget("not a url").ok).toBe(false);
    expect(normalizeTarget("ftp://example.com").ok).toBe(false);
    expect(normalizeTarget("localhost").ok).toBe(false);
  });
});

describe("landing free read — URL shape score", () => {
  it("scores a clean address highly", () => {
    const { url } = normalizeTarget("https://example.com/pricing");
    const report = auditUrlShape(url);
    expect(report.total).toBe(10);
    expect(report.score).toBe(100);
    expect(report.checks.every((check) => check.status === "pass")).toBe(true);
  });

  it("catches the habits that cost citations", () => {
    const { url } = normalizeTarget(
      "http://Example.com/Products/Widgets/Details/view.php?utm_source=news&gclid=123#buy"
    );
    const report = auditUrlShape(url);
    const failed = report.checks.filter((check) => check.status === "fail").map((check) => check.id);

    expect(failed).toContain("url.https");
    expect(failed).toContain("url.case");
    expect(failed).toContain("url.depth");
    expect(failed).toContain("url.params");
    expect(failed).toContain("url.fragment");
    expect(failed).toContain("url.file");
    expect(report.score).toBeLessThan(50);
  });

  it("keeps the score inside 0–100 and explains it", () => {
    const { url } = normalizeTarget("https://example.com");
    const report = auditUrlShape(url);
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.passed).toBeLessThanOrEqual(report.total);
    expect(verdict(report.score)).toMatch(/address|URL/i);
  });

  it("treats an IP address and duplicate slashes as findings", () => {
    const { url } = normalizeTarget("https://192.168.0.1//page");
    const failed = auditUrlShape(url).checks.filter((check) => check.status === "fail").map((check) => check.id);
    expect(failed).toContain("url.ip");
    expect(failed).toContain("url.slashes");
  });
});
