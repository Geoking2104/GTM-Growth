import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aiTrackerRoutes } from "../src/console/ai-tracker.js";
import { GTM_TRACKER_DISCLAIMER_VERSION } from "../src/ai-tracker/config.js";
import { closeTrackerStores, database, getEngineSetting, insertOpportunity, listPrompts, upsertBrand } from "../src/ai-tracker/store.js";
import { scraperFor } from "../src/ai-tracker/scrapers/index.js";
import type { Tenant } from "../src/tenants/store.js";
import type { TenantContext } from "../src/tenants/context.js";

const tenant: Tenant = {
  id: "acme", name: "Acme", mode: "organization", issuer: "https://id.example", status: "active",
  domains: [], emailDomains: [], gscProperties: [], identityProviders: [], branding: {}, createdAt: "",
};
const admin: TenantContext = { tenant, role: "tenant-admin", memberships: [{ id: tenant.id, role: "tenant-admin" }], platformAdmin: false };
const reader: TenantContext = { ...admin, role: "tenant-user", memberships: [{ id: tenant.id, role: "tenant-user" }] };
function consoleApi(tenancy = admin) {
  return vi.fn(async (path: string, body: Record<string, unknown> = {}) => {
    const route = aiTrackerRoutes.find(entry => entry.path === path);
    if (!route) throw new Error(`Unexpected tracker route ${path}`);
    return route.handler({ tenancy, body, url: "", user: { sub: "operator-acme" } });
  });
}
function addBrand(id = "acme") {
  upsertBrand(tenant.id, { brandId: id, name: id, locale: "en", aliases: [], domains: [], competitors: [], active: true, createdAt: "2026-01-01", createdBy: "fixture" });
}
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "gtm-tracker-ui-"));
  vi.stubEnv("AI_TRACKER_DB_PATH", join(directory, "tracker.sqlite"));
  vi.stubEnv("AI_TRACKER_ENABLED", "true");
  vi.stubEnv("AI_TRACKER_SCRAPER_CHATGPT_ENABLED", "true");
});
afterEach(() => {
  closeTrackerStores();
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});
async function mount(lang: string, tab: string, api: (path: string, body?: Record<string, unknown>) => Promise<unknown>, me = admin) {
  const { document, window } = parseHTML("<html><body></body></html>");
  vi.stubGlobal("window", window);
  vi.stubGlobal("document", document);
  vi.stubGlobal("Node", window.Node);
  vi.stubGlobal("localStorage", { getItem: () => lang, setItem: vi.fn() });
  vi.stubGlobal("location", { search: `?lang=${lang}` });
  const { renderAiTracker } = await import("../site/console/ai-tracker.js");
  const root: HTMLElement = await renderAiTracker({ api, me, tab });
  document.body.append(root);
  expect(root.querySelector(".c-error")?.textContent).toBeUndefined();
  return root;
}
function action(root: ParentNode, label: string) {
  const button = [...root.querySelectorAll("button")].find(node => node.textContent === label);
  expect(button, label).toBeDefined();
  return button!;
}
function selectOption(select: HTMLSelectElement, value: string) {
  const option = [...select.options].find(item => item.value === value)!;
  option.setAttribute("selected", "");
}
// LinkeDOM does not implement default browser form submission. Check the real
// submit control before dispatching the browser's cancelable submit event.
function submit(form: HTMLFormElement) {
  expect(form.querySelector("button")?.type).toBe("submit");
  expect(form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))).toBe(false);
}
describe.each(["en", "fr"])("native AI tracker console (%s)", lang => {
  const label = (en: string, fr: string) => lang === "fr" ? fr : en;
  it("shows separate board metrics, sample counts, health and citations", async () => {
    const series = (value: number, runCount: number) => ({
      visibility: { value, runCount }, shareOfVoice: { value }, sentiment: { value: null }, position: { value: null },
    });
    const replies: Record<string, unknown> = {
      "/ai-tracker/status": { enabled: true, engines: [{ engine: "gemini", health: "paused" }] },
      "/ai-tracker/brands": { brands: [{ brandId: "acme", name: "Acme", active: true }] },
      "/ai-tracker/metrics": { runCount: 6, window: { from: "2026-01-01", to: "2026-01-02" },
        byMode: { "consumer-ui": series(25, 4), "api-approximation": series(100, 2) } },
      "/ai-tracker/visibility": { citations: [{ url: "https://acme.example/doc", domain: "acme.example", citingRuns: 3 }] },
    };
    const root = await mount(lang, "board", async path => replies[path]);
    const blocks = [...root.querySelectorAll(".c-metrics")];
    expect(blocks.map(b => b.previousElementSibling?.textContent)).toEqual([label("Consumer UI", "Interface consommateur"), "API (approximation)"]);
    expect(blocks.map(b => [...b.querySelectorAll("strong")].map(n => n.textContent))).toEqual([
      ["25 %", "25 %", "—", "—", "4"], ["100 %", "100 %", "—", "—", "2"],
    ]);
    expect(root.textContent).toContain(label("Scores are sampled", "Scores échantillonnés"));
    expect(root.textContent).toContain(label("Paused", "En pause"));
    expect(root.textContent).toContain("https://acme.example/doc");
  });
  it("creates the first brand, submits a multi-engine prompt, pauses and resumes it", async () => {
    const api = consoleApi();
    const root = await mount(lang, "prompts", api);
    root.querySelector("input")!.value = "Acme";
    submit(root.querySelector("form")!);
    await vi.waitFor(() => expect(root.querySelectorAll("select")).toHaveLength(2));
    const [brand, engines] = root.querySelectorAll("select");
    selectOption(brand, "acme");
    selectOption(engines, "chatgpt");
    selectOption(engines, "gemini");
    const input = root.querySelector("input")!;
    expect(input.maxLength).toBe(500);
    input.value = "Which analytics tools work for retailers?";
    submit(root.querySelector("form")!);
    await vi.waitFor(() => expect(root.querySelector("table")?.textContent).toContain(input.value));
    expect(api).toHaveBeenCalledWith("/ai-tracker/prompt", { brandId: "acme", promptText: input.value, engines: ["chatgpt", "gemini"] });
    action(root, label("Pause", "Mettre en pause")).click();
    await vi.waitFor(() => expect(root.textContent).toContain(label("Resume", "Réactiver")));
    expect(listPrompts(tenant.id)[0].active).toBe(false);
    action(root, label("Resume", "Réactiver")).click();
    await vi.waitFor(() => expect(root.textContent).toContain(label("Pause", "Mettre en pause")));
    expect(listPrompts(tenant.id)[0].active).toBe(true);
  });
  it("keeps earlier runs when loading more and opens the complete evidence", async () => {
    const rawText = "Full response ".repeat(20);
    const run = { runId: "one", runDate: "2026-01-02", engine: "chatgpt", provider: "openai", collectionMode: "api-approximation", rawText, startedAt: "09:00", finishedAt: "09:01" };
    const api = vi.fn(async (path: string, body: Record<string, unknown> = {}) => {
      if (path === "/ai-tracker/runs") return body.cursor
        ? { runs: [{ ...run, runId: "two", runDate: "2026-01-01", rawText: "Second response" }], nextCursor: null }
        : { runs: [run], nextCursor: "first-page-end" };
      if (path !== "/ai-tracker/run" || body.runId !== "one") throw new Error("Unexpected request");
      return { run: { ...run, citations: [{ url: "https://acme.example/proof" }], fanOut: ["retail analytics"] },
        mentions: [{ companyId: "Acme", counted: true, passage: "Full response", judgeVersion: "local-v2" }] };
    });
    const root = await mount(lang, "runs", api);
    const more = action(root, label("Load more", "Charger plus"));
    expect(root.textContent).not.toContain(rawText);
    more.click();
    await vi.waitFor(() => expect(more.hidden).toBe(true));
    expect(api).toHaveBeenCalledWith("/ai-tracker/runs", { cursor: "first-page-end", limit: 25 });
    expect(root.querySelectorAll("table tr")).toHaveLength(3);
    action(root, label("Open", "Ouvrir")).click();
    await vi.waitFor(() => expect(root.querySelector("pre")?.textContent).toBe(rawText));
    for (const proof of ["https://acme.example/proof", "local-v2", "retail analytics"]) expect(root.querySelector("details")?.textContent).toContain(proof);
  });
  it("scans the selected brand and changes only the chosen opportunity", async () => {
    addBrand("acme");
    addBrand("retail");
    for (const id of ["a", "b"]) insertOpportunity(tenant.id, { tenantId: tenant.id, opportunityId: id, brandId: "retail", promptId: "p1", engine: "chatgpt", type: "no-mention", title: `Review ${id}`, evidence: [], status: "open", createdAt: "2026-01-01" });
    const api = consoleApi();
    const root = await mount(lang, "opportunities", api);
    selectOption(root.querySelector("select")!, "retail");
    action(root, label("Scan for opportunities", "Analyser les opportunités")).click();
    await vi.waitFor(() => expect(api.mock.calls.filter(([p]) => p.endsWith("/opportunities")).length).toBe(2));
    expect(api).toHaveBeenCalledWith("/ai-tracker/opportunities/generate", { brandId: "retail" });
    const row = (id: string) => [...root.querySelectorAll("tr")].find(n => n.textContent?.includes(`Review ${id}`))!;
    action(row("a"), label("Create GEO action draft", "Créer un brouillon d'action GEO")).click();
    await vi.waitFor(() => expect(row("a").textContent).toContain("drafted"));
    expect(api).toHaveBeenCalledWith("/ai-tracker/opportunity/draft", { opportunityId: "a", confirmed: true });
    action(row("b"), label("Dismiss", "Écarter")).click();
    await vi.waitFor(() => expect(row("b").textContent).toContain("dismissed"));
  });
  it("requires current consent for one engine and tenant and can revoke it", async () => {
    const api = consoleApi();
    const root = await mount(lang, "engines", api);
    const card = () => [...root.querySelectorAll("details")].find(n => n.querySelector("summary")?.textContent?.startsWith("ChatGPT"))!;
    expect(root.querySelectorAll("details")).toHaveLength(5);
    expect(card().textContent).toContain(GTM_TRACKER_DISCLAIMER_VERSION);
    expect(card().textContent).toContain(label("GTM Growth notice", "Avertissement GTM Growth"));
    expect(scraperFor(tenant.id, "chatgpt")).toBeNull();
    const enable = action(card(), label("Enable scraper", "Activer le scraper"));
    enable.click();
    expect(card().querySelector('[role="status"]')?.textContent).toContain(label("Tick", "Cochez"));
    expect(api.mock.calls.some(([p]) => p.endsWith("/activate"))).toBe(false);
    card().querySelector("input")!.checked = true;
    enable.click();
    await vi.waitFor(() => expect(card().textContent).toContain("operator-acme"));
    expect(api).toHaveBeenCalledWith("/ai-tracker/engine/activate", { engine: "chatgpt", enable: true, disclaimerAccepted: true, disclaimerVersion: GTM_TRACKER_DISCLAIMER_VERSION });
    expect(scraperFor(tenant.id, "chatgpt")).not.toBeNull();
    expect(scraperFor("other-tenant", "chatgpt")).toBeNull();
    expect(scraperFor(tenant.id, "gemini")).toBeNull();
    action(card(), label("Disable scraper", "Désactiver le scraper")).click();
    await vi.waitFor(() => expect(card().querySelector("input")).not.toBeNull());
    expect(getEngineSetting(tenant.id, "chatgpt")).toMatchObject({ scraperEnabled: false, acceptedBy: "operator-acme", disclaimerVersion: GTM_TRACKER_DISCLAIMER_VERSION });
    expect(scraperFor(tenant.id, "chatgpt")).toBeNull();
  });
});
it("renders empty states and provides no write controls to a tenant member", async () => {
  for (const tab of ["board", "prompts", "runs", "opportunities", "engines"]) {
    const api = consoleApi(reader);
    const root = await mount("en", tab, api, reader);
    expect(root.textContent!.trim().length).toBeGreaterThan(0);
    if (tab === "board") expect(root.textContent).toContain("No tracked brand");
    expect(root.querySelector("form, input")).toBeNull();
    expect([...root.querySelectorAll("button")].filter(b => !b.hidden)).toHaveLength(0);
    expect(api.mock.calls.some(([p]) => /activate|generate|draft|set-active/.test(p))).toBe(false);
  }
});
it("denies platform-only admins and rejects missing or outdated consent on the server", async () => {
  const platform: TenantContext = { ...reader, platformAdmin: true, role: "platform-admin" };
  const root = await mount("en", "engines", consoleApi(platform), platform);
  expect(root.querySelector("button")).toBeNull();
  const path = "/ai-tracker/engine/activate";
  const activation = { engine: "chatgpt", enable: true, disclaimerAccepted: true, disclaimerVersion: GTM_TRACKER_DISCLAIMER_VERSION };
  for (const user of [reader, platform]) await expect(consoleApi(user)(path, activation)).rejects.toMatchObject({ status: 403 });
  const api = consoleApi();
  await expect(api(path, { ...activation, disclaimerAccepted: false })).rejects.toMatchObject({ status: 400 });
  await expect(api(path, { ...activation, disclaimerVersion: "old" })).rejects.toMatchObject({ status: 409 });
  expect(getEngineSetting(tenant.id, "chatgpt").scraperEnabled).toBe(false);
  await api(path, activation);
  vi.stubEnv("AI_TRACKER_SCRAPER_CHATGPT_ENABLED", "false");
  expect(scraperFor(tenant.id, "chatgpt")).toBeNull();
  vi.stubEnv("AI_TRACKER_SCRAPER_CHATGPT_ENABLED", "true");
  database().prepare("UPDATE ai_engine_settings SET disclaimer_version = 'old'").run();
  expect(scraperFor(tenant.id, "chatgpt")).toBeNull();
});
it("shows the API error when loading fails", async () => {
  await mount("en", "engines", consoleApi());
  const { renderAiTracker } = await import("../site/console/ai-tracker.js");
  const root = await renderAiTracker({ api: async () => { throw new Error("Service unavailable"); }, me: reader });
  expect(root.querySelector(".c-error")?.textContent).toBe("Service unavailable");
});
