import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { resolveWorkspace } from "../site/console/workspace-context.js";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("workspace selection", () => {
  it("resolves the only membership before loading customer data", async () => {
    const load = vi.fn(async (id: string) => id ? { tenant: { id }, memberships: [{ id }] } : { tenant: null, memberships: [{ id: "acme" }] });
    const remember = vi.fn();
    expect((await resolveWorkspace(load, "", remember)).tenant.id).toBe("acme");
    expect(load.mock.calls).toEqual([[""], ["acme"]]);
    expect(remember).toHaveBeenCalledWith("acme");
  });
  it("never guesses among customers or silently replaces an explicit selection", async () => {
    const remember = vi.fn();
    const load = vi.fn(async () => ({ tenant: null, memberships: [{ id: "a" }, { id: "b" }] }));
    await resolveWorkspace(load, "", remember);
    expect(load).toHaveBeenCalledTimes(1); expect(remember).not.toHaveBeenCalled();
    const denied = vi.fn().mockRejectedValue(new Error("Forbidden"));
    await expect(resolveWorkspace(denied, "previous", remember)).rejects.toThrow("Forbidden");
    expect(denied).toHaveBeenCalledTimes(1);
  });
});

describe.each(["fr", "en"])("first-click console entry (%s)", lang => {
  beforeEach(() => {
    const { window, document } = parseHTML("<html><body></body></html>");
    vi.stubGlobal("window", window); vi.stubGlobal("document", document); vi.stubGlobal("Node", window.Node);
    vi.stubGlobal("location", { search: `?lang=${lang}`, hash: "#geo" });
    vi.stubGlobal("localStorage", { getItem: () => lang, setItem: vi.fn() });
    vi.stubGlobal("FormData", class {
      constructor(private form: HTMLFormElement) {}
      *[Symbol.iterator]() { for (const input of this.form.querySelectorAll<HTMLInputElement>("[name]")) yield [input.name, input.value]; }
    });
  });

  it("runs an allowed read without submitting a detached form, and renders its result", async () => {
    const { renderAction } = await import("../site/console/action-view.js");
    const api = vi.fn().mockResolvedValue({ measured: 42 });
    const card = renderAction({ label: "Audit", route: "/geo/llms", render: (data: { measured: number }) => {
      const p = document.createElement("p"); p.textContent = `Measured ${data.measured}`; return p;
    } }, { state: { url: "https://example.com" }, api, automaticRoutes: new Set(["/geo/llms"]) });
    expect(card.isConnected).toBe(false);
    await vi.waitFor(() => expect(card.textContent).toContain("Measured 42"));
    expect(api).toHaveBeenCalledTimes(1); expect(api).toHaveBeenCalledWith("/geo/llms", { url: "https://example.com", property: undefined });
  });

  it("explains missing scope and never automatically calls writes, generation or paid collection", async () => {
    const { renderAction } = await import("../site/console/action-view.js");
    const api = vi.fn(); const automaticRoutes = new Set(["/geo/llms", "/search/queries"]);
    const missing = renderAction({ label: "Audit", route: "/geo/llms" }, { state: {}, api, automaticRoutes });
    expect(missing.querySelector(".c-data-guide ol")?.children.length).toBeGreaterThan(1);
    const search = renderAction({ label: "Search", route: "/search/queries", needsUrl: false }, { state: {}, api, automaticRoutes });
    expect(search.querySelector('a[href="#tracking/settings"]')).toBeTruthy();
    for (const route of ["/ai-visibility/openai-run", "/visibility/run", "/content/publish", "/generate/titles"]) {
      const card = renderAction({ label: "Action", route }, { state: { url: "https://example.com" }, api, automaticRoutes });
      expect(card.querySelector(".c-out")?.textContent?.length).toBeGreaterThan(20);
    }
    expect(api).not.toHaveBeenCalled();
  });

  it("shows a recovery procedure when a read fails or returns a structured problem", async () => {
    const { renderAction } = await import("../site/console/action-view.js");
    for (const api of [vi.fn().mockRejectedValue(new Error("HTTP 503")), vi.fn().mockResolvedValue({ problem: { message: "No access" } })]) {
      const card = renderAction({ label: "Search", route: "/search/queries", needsUrl: false }, { state: { property: "sc-domain:example.com" }, api, automaticRoutes: new Set(["/search/queries"]) });
      await vi.waitFor(() => expect(card.querySelector(".c-data-guide")).toBeTruthy());
      expect(card.querySelector(".c-data-guide button")?.textContent).toBe(lang === "fr" ? "Réessayer" : "Retry");
      expect(card.querySelector('a[href="#tracking/settings"]')).toBeTruthy();
    }
  });

  it("automatically reads a journey and supplies a labelled manual outline on failure", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 503 }); vi.stubGlobal("fetch", fetcher);
    const { renderCustomerJourneyWorkspace } = await import("../site/console/customer-journey-workspace.js");
    const api = vi.fn();
    const panel = renderCustomerJourneyWorkspace({ state: { url: "https://example.com", me: { tenant: { domains: ["example.com"] }, role: "tenant-admin" } }, api });
    await vi.waitFor(() => expect(panel.querySelectorAll(".journey-stage").length).toBe(5));
    expect(panel.textContent).toContain(lang === "fr" ? "aucun contenu de page n’a été observé" : "no page content was observed");
    expect(fetcher).toHaveBeenCalledTimes(1); expect(api).not.toHaveBeenCalled();
  });

  it("does not read unauthorised journey domains", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const { renderCustomerJourneyWorkspace } = await import("../site/console/customer-journey-workspace.js");
    const panel = renderCustomerJourneyWorkspace({ state: { url: "https://foreign.test", me: { tenant: { domains: ["example.com"] } } }, api: vi.fn() });
    expect(panel.querySelector(".c-data-guide")).toBeTruthy(); expect(fetcher).not.toHaveBeenCalled();
  });

  it("loads Competition automatically and links the empty state to a real import flow", async () => {
    const { renderCompetition } = await import("../site/console/competition.js");
    const api = vi.fn(async (route: string) => route.includes("datasets") ? { datasets: [] } : { panels: {}, actions: [] });
    const panel = renderCompetition({ api, me: { role: "tenant-admin" } });
    await vi.waitFor(() => expect(panel.querySelector('a[href="#ai_visibility"]')).toBeTruthy());
    expect(panel.querySelectorAll("ol li").length).toBe(3);
    expect(api.mock.calls.map(([route]) => route).sort()).toEqual(["/ai-visibility/datasets", "/competition/state"]);
  });

  it("loads saved operations on entry without running collections", async () => {
    const { renderOpsPrompts, renderOpsRank, renderOpsAlerts } = await import("../site/console/ops.js");
    const api = vi.fn(async () => ({ prompts: [], engines: [], runs: [], board: [], alerts: [] }));
    const me = { role: "tenant-admin" };
    const panels = [renderOpsPrompts({ api, me }), renderOpsRank({ api, me }), renderOpsAlerts({ api, me })];
    await vi.waitFor(() => expect(api).toHaveBeenCalledWith("/visibility/runs", {}));
    expect(new Set(api.mock.calls.map(([route]) => route))).toEqual(new Set(["/visibility/prompts", "/visibility/runs", "/rank/keywords", "/ops/alerts"]));
    expect(panels.every(panel => panel.textContent.length > 100)).toBe(true);
  });

  it("keeps local access restrictions visible with import and account instructions", async () => {
    const { renderLocalSeo } = await import("../site/console/local-seo-network.js");
    const api = vi.fn().mockRejectedValue(Object.assign(new Error("LOCAL_ACCESS"), { status: 403 }));
    const panel = await renderLocalSeo({ api, me: { platformAdmin: true } });
    expect(panel.querySelector('a[href="#local_seo/planning"]')).toBeTruthy();
    expect(panel.textContent).toContain(lang === "fr" ? "administrateur plateforme est exclu" : "platform administrator role is excluded");
    expect(api).toHaveBeenCalledTimes(1); expect(api).toHaveBeenCalledWith("/local-seo/state", {});
  });
});
