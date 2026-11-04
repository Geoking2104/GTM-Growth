import { describe, expect, it, vi } from "vitest";
import { generatePoppy, probePoppy, validatePoppyDocument } from "../src/geosuite/poppy.js";
import { buildSitemap, buildSitemapXml, extractLinks } from "../src/geosuite/sitemap-builder.js";
import { HtmlDoc } from "../src/geo/html.js";

const validDoc = {
  protocol_version: "0.3",
  organization: { name: "Acme", domain: "acme.com" },
  apis: [{ type: "mcp", url: "https://acme.com/mcp", description: "Orders" }],
};

describe("poppy.json validation", () => {
  it("accepts a minimal valid document", () => {
    expect(validatePoppyDocument(validDoc, "acme.com")).toEqual({ valid: true, issues: [] });
  });

  it("rejects a non-object", () => {
    expect(validatePoppyDocument([], "acme.com").issues).toEqual(["not_an_object"]);
  });

  it("flags a missing version and an unsupported one", () => {
    expect(validatePoppyDocument({ organization: { name: "A", domain: "acme.com" }, apis: validDoc.apis }, "acme.com").issues).toContain("missing_protocol_version");
    expect(validatePoppyDocument({ ...validDoc, protocol_version: "0.2" }, "acme.com").issues).toContain("unsupported_version");
  });

  it("flags a domain that is not the serving host", () => {
    expect(validatePoppyDocument({ ...validDoc, organization: { name: "A", domain: "other.com" } }, "acme.com").issues).toContain("domain_mismatch");
  });

  it("flags a document with no channel", () => {
    expect(validatePoppyDocument({ protocol_version: "0.3", organization: { name: "A", domain: "acme.com" } }, "acme.com").issues).toContain("no_channels");
  });

  it("flags a non-https API and a missing description", () => {
    const doc = { ...validDoc, apis: [{ type: "mcp", url: "http://acme.com/mcp" }] };
    expect(validatePoppyDocument(doc, "acme.com").issues).toContain("invalid_api_entry");
  });

  it("flags sign-in offered without an issuer, and the disabled conflict", () => {
    expect(validatePoppyDocument({ ...validDoc, auth: { sign_in: ["direct"] } }, "acme.com").issues).toContain("sign_in_without_issuer");
    expect(
      validatePoppyDocument({ ...validDoc, auth: { disabled: true, issuer: "https://auth.acme.com" } }, "acme.com").issues,
    ).toContain("sign_in_conflict");
  });

  it("accepts camelCase variants the spec allows", () => {
    const camel = { protocolVersion: "0.3", organization: { name: "Acme", domain: "acme.com" }, apis: validDoc.apis };
    expect(validatePoppyDocument(camel, "acme.com").valid).toBe(true);
  });
});

describe("poppy probe", () => {
  const respond = (body: unknown, status = 200) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("reports a missing file without failing", async () => {
    const fetcher = vi.fn(async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
    const report = await probePoppy("acme.com", { fetcher });
    expect(report.present).toBe(false);
    expect(report.valid).toBe(false);
    expect(report.verdict).toContain("No poppy.json");
  });

  it("accepts a published, valid file", async () => {
    const report = await probePoppy("acme.com", { fetcher: respond(validDoc) });
    expect(report.present).toBe(true);
    expect(report.valid).toBe(true);
    expect(report.channels).toContain("MCP server");
  });

  it("checks the issuer chain when sign-in is offered", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("poppy.json")) {
        return new Response(
          JSON.stringify({ ...validDoc, auth: { issuer: "https://auth.acme.com", sign_in: ["direct"] } }),
          { status: 200 },
        );
      }
      if (url.includes("oauth-protected-resource")) {
        return new Response(JSON.stringify({ resource: "https://acme.com", authorization_servers: ["https://auth.acme.com"] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          issuer: "https://auth.acme.com",
          protected_resources: ["https://acme.com"],
          grant_types_supported: ["refresh_token"],
          token_endpoint: "https://auth.acme.com/token",
          revocation_endpoint: "https://auth.acme.com/revoke",
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const report = await probePoppy("acme.com", { fetcher });
    expect(report.valid).toBe(true);
    expect(report.issuer).toBe("https://auth.acme.com");
  });

  it("catches an issuer that does not list the domain", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("poppy.json")) {
        return new Response(JSON.stringify({ ...validDoc, auth: { issuer: "https://auth.acme.com", sign_in: ["direct"] } }), { status: 200 });
      }
      if (url.includes("oauth-protected-resource")) {
        return new Response(JSON.stringify({ authorization_servers: ["https://auth.acme.com"] }), { status: 200 });
      }
      return new Response(JSON.stringify({ issuer: "https://auth.acme.com", protected_resources: ["https://other.com"], grant_types_supported: ["refresh_token"], token_endpoint: "https://a/t", revocation_endpoint: "https://a/r" }), { status: 200 });
    }) as unknown as typeof fetch;

    const report = await probePoppy("acme.com", { fetcher });
    expect(report.issues).toContain("domain_not_in_issuer");
  });
});

describe("poppy generation", () => {
  it("produces a document its own validator accepts", () => {
    const { json } = generatePoppy({ name: "Acme", domain: "acme.com", mcp: ["https://acme.com/mcp"] });
    expect(validatePoppyDocument(json, "acme.com").valid).toBe(true);
  });

  it("emits both OAuth documents when an issuer is given", () => {
    const result = generatePoppy({ name: "Acme", domain: "acme.com", issuer: "https://auth.acme.com", mcp: ["https://acme.com/mcp"] });
    expect(result.protectedResource?.url).toContain("oauth-protected-resource");
    expect(result.issuerMetadata?.json.protected_resources).toEqual(["https://acme.com"]);
  });

  it("emits no OAuth document without an issuer", () => {
    const result = generatePoppy({ name: "Acme", domain: "acme.com", mcp: ["https://acme.com/mcp"] });
    expect(result.protectedResource).toBeNull();
    expect(result.issuerMetadata).toBeNull();
  });
});

describe("sitemap builder", () => {
  const html = `<html><body>
    <a href="/about">About</a>
    <a href="/pricing/">Pricing</a>
    <a href="/logo.png">logo</a>
    <a href="https://other.com/x">external</a>
    <a href="mailto:a@b.co">mail</a>
    <a href="/about#team">anchor</a>
  </body></html>`;

  it("keeps same-host pages, drops assets, externals and anchors", () => {
    const links = extractLinks(HtmlDoc.parse(html), "https://acme.com/", "acme.com");
    expect(links).toContain("https://acme.com/about");
    expect(links).toContain("https://acme.com/pricing");
    expect(links).not.toContain("https://acme.com/logo.png");
    expect(links.some((link) => link.includes("other.com"))).toBe(false);
    expect(links.filter((link) => link.includes("/about")).length).toBe(1);
  });

  it("emits valid sitemap XML", () => {
    const xml = buildSitemapXml("acme.com", [
      { loc: "https://acme.com/", lastmod: "2026-11-01" },
      { loc: "https://acme.com/about?a=1&b=2", lastmod: null },
    ]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("<loc>https://acme.com/</loc>");
    expect(xml).toContain("a=1&amp;b=2");
  });

  it("crawls breadth-first and respects the page cap", async () => {
    const fetcher = async (url: string) => {
      const page = url.endsWith("/robots.txt")
        ? "User-agent: *\nDisallow: /private\n"
        : url.includes("/about")
          ? '<a href="/pricing">P</a>'
          : '<a href="/about">A</a><a href="/private/x">X</a>';
      return { url, status: 200, ok: true, headers: {}, body: page };
    };

    // Cap of 1: the crawl must stop and say so.
    const capped = await buildSitemap({ url: "https://acme.com/", maxUrls: 1, fetcher: fetcher as never });
    expect(capped.urls.length).toBe(1);
    expect(capped.stats.capped).toBe(true);

    // Generous cap: every link is explored, and the disallowed path is skipped.
    const full = await buildSitemap({ url: "https://acme.com/", maxUrls: 10, fetcher: fetcher as never });
    expect(full.urls.map((entry) => entry.loc)).toEqual(
      expect.arrayContaining(["https://acme.com/", "https://acme.com/about", "https://acme.com/pricing"]),
    );
    expect(full.skipped.some((entry) => entry.reason.includes("robots"))).toBe(true);
    expect(full.stats.blocked).toBeGreaterThan(0);
  });
});
