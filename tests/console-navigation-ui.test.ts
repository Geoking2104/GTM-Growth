import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.doUnmock("../site/console/auth.js"); });

it.each(["fr", "en"])("opens every navigation entry with content or recovery steps in %s", async lang => {
  const { document, window } = parseHTML(readFileSync("site/console/index.html", "utf8"));
  // linkedom deliberately omits the browser's writable select.value API.
  Object.defineProperty(window.HTMLSelectElement.prototype, "value", {
    configurable: true,
    get() { return [...this.options].find(o => o.selected)?.value || ""; },
    set(value) { for (const option of this.options) option.selected = option.value === value; },
  });
  const memory = new Map<string, string>();
  const storage = { getItem: (key: string) => key.startsWith("gtm-console-wizard") ? "1" : memory.get(key) || "", setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) };
  const location = { pathname: "/console/", search: `?lang=${lang}`, hash: "#geo", hostname: "localhost", href: `http://localhost/console/?lang=${lang}#geo`, reload: vi.fn(), replace: vi.fn() };
  vi.stubGlobal("document", document); vi.stubGlobal("window", window); vi.stubGlobal("Node", window.Node);
  vi.stubGlobal("location", location); vi.stubGlobal("history", { replaceState: (_a: unknown, _b: string, hash: string) => { location.hash = hash; } });
  vi.stubGlobal("localStorage", storage); vi.stubGlobal("sessionStorage", storage);
  vi.stubGlobal("FormData", class {
    constructor(private form: HTMLFormElement) {}
    *[Symbol.iterator]() { for (const input of this.form.querySelectorAll<HTMLInputElement>("[name]")) yield [input.name, input.value]; }
  });
  vi.doMock("../site/console/auth.js", () => ({ handleRedirect: async () => ({}), accessToken: async () => "fixture-only", currentTenant: () => null, setTenant: vi.fn(), accountConsoleUrl: () => "#tracking", login: vi.fn(), logout: vi.fn() }));
  const tenant = { id: "acme", name: "Acme", domains: ["example.com"], gscProperties: [], ga4Properties: [], bingSites: [], gtmContainers: [], clarityProjects: [] };
  const fetcher = vi.fn(async (url: string, options?: { headers?: Record<string, string> }) => {
    const json = (value: unknown, ok = true, status = 200) => ({ ok, status, json: async () => value });
    if (url.endsWith("/me")) return json({ tenant: options?.headers?.["X-Tenant"] === "acme" ? tenant : null, platformAdmin: true, memberships: [{ id: "acme", role: "tenant-admin" }] });
    if (url.endsWith("/reports")) return json({ reports: [] });
    if (url.endsWith("/datasets")) return json({ datasets: [] });
    if (url.endsWith("/competition/state")) return json({ panels: {}, actions: [] });
    if (url.endsWith("/visibility/prompts")) return json({ prompts: [], engines: [] });
    if (url.endsWith("/visibility/runs")) return json({ runs: [] });
    if (url.endsWith("/rank/keywords")) return json({ board: [] });
    if (url.endsWith("/ops/alerts")) return json({ alerts: [] });
    if (url.endsWith("/platform/tenants")) return json({ tenants: [] });
    if (url.endsWith("/tracking/status")) return json({ serviceAccount: {}, gsc: {}, ga4: {}, bing: {}, gtm: {} });
    if (url.endsWith("/geo/llms")) return json({ validation: { checks: [] }, drift: { error: "Fixture: no sitemap" } });
    return json({ error: "Fixture: source unavailable" }, false, 503);
  });
  vi.stubGlobal("fetch", fetcher);
  await import("../site/console/app.js");
  await vi.waitFor(() => expect(document.querySelector(".c-out .c-raw")).toBeTruthy());
  expect(memory.get("gtm-console-selected")).toBe("acme");
  const nav = [...document.querySelectorAll<HTMLAnchorElement>(".app-nav a")];
  expect(nav.length).toBe(26);
  expect(document.querySelector("#c-nav-act a")?.getAttribute("href")).toBe("#journey");
  for (const link of nav) {
    link.click();
    await vi.waitFor(() => {
      const panel = document.querySelector("[role=tabpanel]");
      expect(panel?.textContent?.length, link.getAttribute("href") || "").toBeGreaterThan(25);
      expect(panel?.querySelector(".c-loading")).toBeNull();
    });
  }
  const calls = fetcher.mock.calls.filter(([url]) => url.startsWith("/api/console/") && !url.endsWith("/me"));
  expect(calls.every(([, options]) => options?.headers?.["X-Tenant"] === "acme")).toBe(true);
  expect(calls.some(([url]) => /\/(run|publish|import|add|remove)$/.test(url))).toBe(false);
  location.href = "http://localhost/console/#catalog";
  document.querySelector<HTMLAnchorElement>("#c-lang")!.click();
  const languageUrl = new URL(String(location.replace.mock.calls[0][0]));
  expect(languageUrl.searchParams.get("lang")).toBe(lang === "fr" ? "en" : "fr");
  expect(languageUrl.hash).toBe("#catalog");
// This is a complete 26-screen journey, with an assertion for every entry.
// Keep individual readiness waits bounded while allowing slower shared CI CPUs.
}, 20000);
