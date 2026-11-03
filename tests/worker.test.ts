import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { checkTarget, corsHeaders, isBlockedHost, underLimit, type Env } from "../src/worker/index.js";

const HTML = `<!doctype html><html lang="en"><head>
<title>Acme analytics for B2B teams</title>
<meta name="description" content="Acme measures what search and AI assistants do with your pages, with evidence for every number in the report.">
<link rel="canonical" href="https://acme.com/">
<script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script>
<script src="https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ"></script>
</head><body><h1>Acme</h1><h2>One</h2><p>Text.</p><h2>Two</h2><ul><li>a</li><li>b</li></ul>
<a href="/pricing">Pricing</a><img src="/a.png" alt="a"></body></html>`;

const ROBOTS = "User-agent: *\nAllow: /\nSitemap: https://acme.com/sitemap.xml\n";
const SITEMAP = '<?xml version="1.0"?><urlset><url><loc>https://acme.com/</loc><lastmod>2026-10-30</lastmod></url></urlset>';

function stubFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("formspree.io")) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (url.endsWith("/robots.txt")) return new Response(ROBOTS, { status: 200 });
      if (url.endsWith("/sitemap.xml")) return new Response(SITEMAP, { status: 200 });
      if (url.endsWith("/sitemap_index.xml")) return new Response("nope", { status: 404 });
      if (url.includes("/llms.txt") || url.includes("/ai/") || url.includes("/.well-known/")) {
        return new Response("nope", { status: 404 });
      }
      return new Response(HTML, { status: 200, headers: { "content-type": "text/html" } });
    }),
  );
}

function fakeKv() {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

const ctx = { waitUntil: (promise: Promise<unknown>) => void promise };
const env = (overrides: Partial<Env> = {}): Env => ({
  SITE_ORIGINS: "https://geoking2104.github.io",
  LEAD_FORWARD_URL: "https://formspree.io/f/test",
  ...overrides,
});

afterEach(() => vi.unstubAllGlobals());

describe("worker guards", () => {
  it("blocks private and internal hosts", () => {
    for (const host of ["localhost", "127.0.0.1", "10.1.2.3", "192.168.0.4", "169.254.169.254", "::1", "fd00::1", "box.internal", "printer.local"]) {
      expect(isBlockedHost(host), host).toBe(true);
    }
    for (const host of ["acme.com", "93.184.216.34", "sub.example.co.uk"]) {
      expect(isBlockedHost(host), host).toBe(false);
    }
  });

  it("rejects non-http, credentials and bare hosts", () => {
    expect(checkTarget("file:///etc/passwd").ok).toBe(false);
    expect(checkTarget("https://user:pass@acme.com").ok).toBe(false);
    expect(checkTarget("acme").ok).toBe(false);
    expect(checkTarget("acme.com").url).toBe("https://acme.com/");
  });

  it("echoes only allowed origins", () => {
    expect(corsHeaders("https://geoking2104.github.io", env())["Access-Control-Allow-Origin"]).toBe(
      "https://geoking2104.github.io",
    );
    expect(corsHeaders("https://evil.example", env())["Access-Control-Allow-Origin"]).toBe(
      "https://geoking2104.github.io",
    );
  });

  it("counts per window when a KV binding exists", async () => {
    const RATE = fakeKv() as never;
    expect(await underLimit(env({ RATE }), "lead", "1.2.3.4", 2, 1_000)).toBe(true);
    expect(await underLimit(env({ RATE }), "lead", "1.2.3.4", 2, 1_100)).toBe(true);
    expect(await underLimit(env({ RATE }), "lead", "1.2.3.4", 2, 1_200)).toBe(false);
    // A new window resets the counter.
    expect(await underLimit(env({ RATE }), "lead", "1.2.3.4", 2, 61_500)).toBe(true);
  });
});

describe("worker routes", () => {
  it("answers OPTIONS for the browser preflight", async () => {
    const response = await worker.fetch(
      new Request("https://api.test/api/lead", { method: "OPTIONS", headers: { Origin: "https://geoking2104.github.io" } }),
      env(),
      ctx,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  it("exposes a health route", async () => {
    const response = await worker.fetch(new Request("https://api.test/health"), env(), ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok", runtime: "worker" });
  });

  it("404s unknown routes with the route list", async () => {
    const response = await worker.fetch(new Request("https://api.test/nope"), env(), ctx);
    expect(response.status).toBe(404);
    expect((await response.json()).routes).toContain("POST /api/free-read");
  });

  it("stores and forwards a valid lead", async () => {
    stubFetch();
    const LEADS = fakeKv() as never;
    const response = await worker.fetch(
      new Request("https://api.test/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "9.9.9.9" },
        body: JSON.stringify({
          name: "Geoff",
          email: "geoff@example.com",
          website: "acme.fr",
          goal: "Full GEO audit",
          elapsedMs: 5000,
        }),
      }),
      env({ LEADS }),
      ctx,
    );
    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.id).toMatch(/[0-9a-f-]{36}/);
    expect([...(LEADS as unknown as { store: Map<string, string> }).store.keys()].length).toBe(1);
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find((args) =>
      String(args[0]).includes("formspree"),
    );
    expect(call).toBeTruthy();
  });

  it("rejects an invalid lead with the field list", async () => {
    stubFetch();
    const response = await worker.fetch(
      new Request("https://api.test/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "x", email: "nope", website: "" }),
      }),
      env(),
      ctx,
    );
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.fields).toContain("email");
  });

  it("answers 202 to a honeypot without storing anything", async () => {
    stubFetch();
    const LEADS = fakeKv() as never;
    const response = await worker.fetch(
      new Request("https://api.test/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Bot", email: "bot@example.com", website: "x.com", company: "ACME", elapsedMs: 9000 }),
      }),
      env({ LEADS }),
      ctx,
    );
    expect(response.status).toBe(202);
    expect((LEADS as unknown as { store: Map<string, string> }).store.size).toBe(0);
  });

  it("refuses an oversized body", async () => {
    stubFetch();
    const response = await worker.fetch(
      new Request("https://api.test/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "a".repeat(9000) }),
      }),
      env(),
      ctx,
    );
    expect(response.status).toBe(400);
  });

  it("returns the enriched free read", async () => {
    stubFetch();
    const response = await worker.fetch(
      new Request("https://api.test/api/free-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "acme.com" }),
      }),
      env(),
      ctx,
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.score).toBeGreaterThan(0);
    const ids = payload.tables.map((table: { id: string }) => table.id);
    expect(ids).toContain("seo.meta");
    expect(ids).toContain("ga4.readiness");
    expect(ids).toContain("gsc.readiness");
    expect(payload.tables.find((t: { id: string }) => t.id === "ga4.traffic").sample).toBe(true);
  });

  it("refuses to read a private target", async () => {
    stubFetch();
    const response = await worker.fetch(
      new Request("https://api.test/api/free-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "http://169.254.169.254/latest/meta-data" }),
      }),
      env(),
      ctx,
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("private");
  });
});
