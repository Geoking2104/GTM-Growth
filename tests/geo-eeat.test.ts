import { describe, expect, it } from "vitest";
import { HtmlDoc } from "../src/geo/html.js";
import { evaluateEeat } from "../src/geo/audit/eeat.js";

describe("E-E-A-T evidence", () => {
  it("scores expert and trust signals above an anonymous page, deterministically", () => {
    const url = "https://example.com/article";
    const expert = HtmlDoc.parse('<html><head><meta name="author" content="Jane Smith"></head><body><p>Our study: we tested 300 samples. Methodology: results improved 20%.</p><a href="/authors/jane">Jane Smith</a><a href="/contact">Contact</a><a href="/privacy">Privacy</a><time datetime="2026-01-01">2026</time></body></html>');
    const anonymous = HtmlDoc.parse('<body><p>Generic content.</p></body>');
    const result = evaluateEeat(expert, url);
    expect(result).toEqual(evaluateEeat(expert, url));
    expect(result.expertise.score).toBeGreaterThan(evaluateEeat(anonymous, url).expertise.score);
    expect(result.trustworthiness.score).toBeGreaterThan(evaluateEeat(anonymous, url).trustworthiness.score);
    for (const dimension of [result.experience, result.expertise, result.authoritativeness, result.trustworthiness]) {
      expect(dimension.signals.every(signal => !!signal.evidence)).toBe(true);
    }
  });
});
