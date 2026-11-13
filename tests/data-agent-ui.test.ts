import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { readFileSync } from "node:fs";

afterEach(() => vi.unstubAllGlobals());
function dom() {
  const { document, window } = parseHTML("<html><body></body></html>"); vi.stubGlobal("document", document);
  vi.stubGlobal("location", { search: "?lang=en" }); vi.stubGlobal("localStorage", { getItem: () => "en", setItem() {} });
  Object.defineProperty(window.HTMLSelectElement.prototype, "value", { configurable: true, get() { return [...this.options].find(o => o.selected)?.value || ""; }, set(value) { for (const o of this.options) o.removeAttribute("selected"); const selected = [...this.options].find(o => o.value === value); if (selected) selected.setAttribute("selected", ""); } });
  return { document, window };
}
it.each(["fr", "en"])("opens a scoped assistant, persists choices, explains real data and handles errors in %s", async language => {
  const { document, window } = dom();
  const { createDataAgent } = await import("../site/console/data-agent.js");
  const profile = { role: "owner", goal: "leads", stage: "activate", audience: "", target: { metric: "sessions", value: 50 } };
  const api = vi.fn(async (path, input) => {
    if (path.endsWith("context")) return { profile: { ...profile }, actions: [{ href: "#ga4", title: "GA4", reason: "Goal" }], slack: "not-configured" };
    if (path.endsWith("profile")) { Object.assign(profile, input); return { profile }; }
    return { state: "ready", summary: "Observed totals", source: "GA4", readAt: "2026-11-01T12:00:00Z", period: { start: "2026-10-01", end: "2026-10-28" }, metrics: [{ id: "sessions", label: "Sessions", value: 42, unit: "count" }], caveats: ["Key events are not sales"], href: "#ga4" };
  });
  const agent = createDataAgent({ api, language, workspaceName: "Acme" }); document.body.append(agent.element);
  expect(api).not.toHaveBeenCalled(); agent.element.open = true; agent.element.dispatchEvent(new window.Event("toggle"));
  await vi.waitFor(() => expect(document.querySelectorAll("form").length).toBe(2));
  expect(api.mock.calls[0]).toEqual(["/data-agent/context", { locale: language, section: "overview" }]);
  const forms = document.querySelectorAll("form"); const selects = forms[0].querySelectorAll("select"); selects[0].value = "agency"; selects[0].onchange();
  await forms[0].onsubmit({ preventDefault() {} }); expect(profile.role).toBe("agency");
  await document.querySelectorAll("form")[1].onsubmit({ preventDefault() {} });
  await vi.waitFor(() => expect(document.querySelector(".c-agent-answer").textContent).toContain("42 / 50"));
  expect(document.querySelector(".c-agent-answer").textContent).toContain("2026-10-01");
  expect(document.querySelector(".c-agent-answer a").getAttribute("href")).toBe("#ga4");
  expect(document.querySelector(".c-agent-slack").textContent).toContain(language === "fr" ? "administrateur" : "administrator");
  api.mockRejectedValueOnce(new Error("secret upstream"));
  await document.querySelectorAll("form")[1].onsubmit({ preventDefault() {} });
  await vi.waitFor(() => expect(document.querySelector(".c-agent-answer").textContent).toContain(language === "fr" ? "indisponibles" : "unavailable"));
  expect(document.body.textContent).not.toContain("secret upstream");
});
it("clears a previous view while loading the new context and ignores stale query results", async () => {
  const { document, window } = dom(); let finish;
  const { createDataAgent } = await import("../site/console/data-agent.js");
  const api = vi.fn(async path => path.endsWith("context") ? { profile: { role: "owner", goal: "traffic", stage: "activate", audience: "", target: null }, actions: [] } : new Promise(resolve => { finish = resolve; }));
  const agent = createDataAgent({ api }); document.body.append(agent.element); agent.element.open = true; agent.element.dispatchEvent(new window.Event("toggle"));
  await vi.waitFor(() => expect(document.querySelectorAll("form").length).toBe(2));
  document.querySelectorAll("form")[1].onsubmit({ preventDefault() {} });
  agent.setSection("ga4"); finish({ summary: "stale private result", metrics: [] });
  await vi.waitFor(() => expect(api).toHaveBeenCalledWith("/data-agent/context", { locale: "en", section: "ga4" }));
  expect(document.body.textContent).not.toContain("stale private result");
});
it.each(["fr", "en"])("public discovery explains the current scan without authenticated or model calls in %s", async language => {
  const { document } = dom(); const { renderPublicAgent } = await import("../site/console/data-agent.js"); document.body.append(renderPublicAgent({ url: "https://example.com" }, language));
  expect(document.body.textContent).toContain("https://example.com"); expect(document.querySelector("a").getAttribute("href")).toBe("#c-login-form");
});
it("all suggested navigation paths exist and the global surface is in the common shell", async () => {
  const app = readFileSync("site/console/app.js", "utf8");
  const { nextActions } = await import("../src/data-agent/service.js"); const { profileSchema } = await import("../src/data-agent/profile.js");
  for (const role of ["owner", "marketer", "agency", "technical"]) for (const goal of ["traffic", "leads", "sales", "ai-visibility", "local"]) for (const stage of ["discover", "activate", "grow", "retain", "expand"]) {
    for (const action of nextActions(profileSchema.parse({ role, goal, stage }), "en")) expect(app).toContain(`id: "${action.href.slice(1).split("/")[0]}"`);
  }
  expect(readFileSync("site/console/index.html", "utf8")).toContain('id="c-data-agent"');
});

it("preserves the requested tenant and section through SSO without accepting stale or unsafe targets", async () => {
  const { workspaceHandoff, resolveWorkspace } = await import("../site/console/workspace-context.js");
  const memory = new Map(); const storage = { getItem: k => memory.get(k), setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) };
  expect(workspaceHandoff({ search: "?tenant=acme&lang=en", hash: "#ops/alerts" }, storage, 1000)).toMatchObject({ tenant: "acme", hash: "#ops/alerts" });
  expect(workspaceHandoff({ search: "?code=callback", hash: "" }, storage, 2000)).toMatchObject({ tenant: "acme", hash: "#ops/alerts" });
  const remember = vi.fn(); const load = vi.fn(async () => { throw new Error("Denied"); });
  await expect(resolveWorkspace(load, "acme", remember)).rejects.toThrow("Denied"); expect(remember).not.toHaveBeenCalled(); expect(load).toHaveBeenCalledTimes(1);
  expect(workspaceHandoff({ search: "", hash: "" }, storage, 700000)).toBe(null);
  expect(workspaceHandoff({ search: "?tenant=acme", hash: "#javascript:bad" }, storage, 800000).hash).toBe("#overview");
  expect(workspaceHandoff({ search: "?tenant=acme", hash: "#ga4/ecommerce" }, storage, 900000).hash).toBe("#ga4/ecommerce");
});
