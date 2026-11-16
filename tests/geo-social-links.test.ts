import { describe, expect, it } from "vitest";
import { analyzeSocialLinks } from "../src/geo/social-links.js";

const siteUrl = "https://example.com/";
const html = `<html><head><script type="application/ld+json">{
  "@context":"https://schema.org", "@type":"Organization",
  "sameAs":["https://instagram.com/example","https://x.com/example","https://www.reddit.com/user/example"]
}</script></head><body>
  <a href="https://instagram.com/example">Instagram</a>
  <a href="https://discord.gg/example">Community</a>
  <a href="https://www.tiktok.com/@example">TikTok</a>
  <a href="https://instagram.com.evil.example/impersonation">Fake</a>
  <a href="javascript:alert(1)">Bad link</a>
</body></html>`;

describe("GEO social discovery and bidirectional proof", () => {
  it("discovers Instagram, X, Reddit, Discord, TikTok and deduplicates sameAs", () => {
    const result = analyzeSocialLinks(siteUrl, html);
    expect(result.outboundProfiles.map(link => link.platform))
      .toEqual(["discord", "instagram", "reddit", "tiktok", "x_twitter"]);
    expect(result.outboundProfiles.find(link => link.platform === "instagram")?.sources)
      .toEqual(["anchor", "schema_sameAs"]);
    expect(result.inboundObservationCount).toBe(0);
    expect(result.inboundVerifiedCount).toBe(0);
    expect(result.outboundProfiles.every(link => link.inbound === "not_checked")).toBe(true);
  });

  it("marks supplied social proof as an observation, never an authenticated backlink", () => {
    const result = analyzeSocialLinks(siteUrl, html, [
      { profileUrl: "https://instagram.com/example/", html: '<a href="https://example.com/about">Site</a>' },
      { profileUrl: "https://x.com/example", html: '<a href="https://other.example.com/">Other</a>' },
    ]);
    expect(result.outboundProfiles.find(link => link.platform === "instagram")?.inbound)
      .toBe("observed_in_supplied_html");
    expect(result.outboundProfiles.find(link => link.platform === "x_twitter")?.inbound)
      .toBe("not_observed");
    expect(result.inboundObservationCount).toBe(1);
    expect(result.inboundVerifiedCount).toBe(0);
  });

  it("rejects credentials, lookalike domains and non-http social links", () => {
    const result = analyzeSocialLinks(siteUrl,
      '<a href="https://instagram.com.evil.invalid/a">fake</a>' +
      '<a href="https://user:pass@instagram.com/a">credentials</a>' +
      '<a href="mailto:team@instagram.com">email</a>');
    expect(result.outboundProfiles).toHaveLength(0);
  });
});
