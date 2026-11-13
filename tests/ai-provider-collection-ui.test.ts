import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
function dom(lang = "en") {
  const { document, window } = parseHTML("<html><body></body></html>");
  Object.defineProperty(window.HTMLSelectElement.prototype, "value", { configurable: true, get() { return [...this.options].find(o => o.selected)?.value || ""; }, set(v) { for (const o of this.options) o.removeAttribute("selected"); [...this.options].find(o => o.value === v)?.setAttribute("selected", ""); } });
  window.open = vi.fn(); vi.stubGlobal("document", document); vi.stubGlobal("window", window); vi.stubGlobal("Node", window.Node);
  vi.stubGlobal("location", { search: `?lang=${lang}` }); vi.stubGlobal("localStorage", { getItem: () => lang, setItem: vi.fn() });
  return { document, window };
}
const accounts = [{ id: "account-a", label: "Agency", kind: "saved" }, { id: "account-b", label: "Client", kind: "saved" }];
it.each(["fr", "en"])("shows all providers with working setup and manual import in %s", async lang => {
  const { document, window } = dom(lang); const { renderAiVisibility } = await import("../site/console/ai-visibility.js");
  const api = vi.fn(async (route: string) => route.endsWith("/datasets") ? { datasets: [] } : route.endsWith("/accounts") ? { accounts: [] } : { enabled: true, model: "test-model" });
  const root = renderAiVisibility({ api, me: { role: "tenant-admin" } }); document.body.append(root);
  await vi.waitFor(() => expect(root.querySelectorAll(".ai-provider")).toHaveLength(5));
  await vi.waitFor(() => expect(root.textContent).toContain(lang === "fr" ? "Aucun compte API" : "No API account"));
  expect(api.mock.calls.filter(([route]) => route.endsWith("-status"))).toHaveLength(5);
  for (const panel of root.querySelectorAll<HTMLElement>(".ai-provider")) {
    const connect = panel.querySelector<HTMLButtonElement>(".ai-collect")!; expect(connect.disabled).toBe(false); connect.click();
    expect(panel.querySelector<HTMLElement>(".ai-account-setup")!.hidden).toBe(false);
    expect(panel.querySelector<HTMLAnchorElement>(".ai-account-setup a")!.rel).toBe("noopener noreferrer");
  }
  expect(window.open).toHaveBeenCalledTimes(5); expect(api.mock.calls.some(([r]) => r.endsWith("-run"))).toBe(false);
  const manualImport = [...root.querySelectorAll<HTMLDetailsElement>("details.ai-import")].find(d => d.querySelector("summary")?.textContent === (lang === "fr" ? "Importer des réponses JSON" : "Import answers as JSON"))!;
  manualImport.open = false;
  [...root.querySelector('.ai-provider[data-provider="openai"]')!.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === (lang === "fr" ? "Importer des réponses sauvegardées" : "Import saved answers"))!.click();
  expect(manualImport.open).toBe(true);
});
it.each(["openai", "claude", "mistral", "grok"])("collects %s using only the explicitly selected account and consent", async provider => {
  const { document } = dom(); const { renderProviderCollection } = await import("../site/console/ai-provider-collection.js");
  const onCollected = vi.fn(), api = vi.fn(async (route: string, _body: unknown) => route.endsWith("/accounts") ? { accounts } : route.endsWith("-status") ? { enabled: true, model: "test" } : { id: "saved-dataset", succeeded: 1, failed: [{ prompt: "Second?", reason: "HTTP 429" }] });
  const root = renderProviderCollection({ provider, api, onCollected, onImport: vi.fn() }); document.body.append(root);
  await vi.waitFor(() => expect(root.querySelectorAll("select option")).toHaveLength(3));
  const run = root.querySelector<HTMLButtonElement>(".ai-collect")!, select = root.querySelector("select")!, consent = root.querySelector<HTMLInputElement>("[data-collection-consent]")!;
  run.click(); expect(root.textContent).toContain("Choose the API account");
  select.value = "account-a"; select.dispatchEvent(new window.Event("change"));
  run.click(); expect(root.textContent).toContain("First confirm");
  consent.checked = true; select.value = "account-b"; select.dispatchEvent(new window.Event("change")); expect(consent.checked).toBe(false);
  root.querySelector<HTMLInputElement>('input[placeholder="Your actual brand name"]')!.value = "Alpha"; root.querySelector("textarea")!.value = "First?\nSecond?";
  consent.checked = true; run.click(); run.click();
  await vi.waitFor(() => expect(onCollected).toHaveBeenCalledWith(expect.objectContaining({ id: "saved-dataset" })));
  const runs = api.mock.calls.filter(([route]) => route.endsWith("-run")); expect(runs).toHaveLength(1); expect(runs[0][1]).toMatchObject({ accountId: "account-b", confirmed: true, brands: [{ name: "Alpha", aliases: [] }] });
  expect(root.textContent).toContain("Quota or rate limit reached");
});
it("saves a named account without generation, clears the key and selects the returned ID", async () => {
  dom(); const { renderProviderCollection } = await import("../site/console/ai-provider-collection.js"); let saved = false;
  const api = vi.fn(async (route: string, _body: unknown) => { if (route.endsWith("/connect")) { saved = true; return { id: "account-b" }; } return route.endsWith("/accounts") ? { accounts: saved ? accounts : [] } : { enabled: true, model: "test" }; });
  const root = renderProviderCollection({ provider: "openai", api, onCollected: vi.fn(), onImport: vi.fn() });
  await vi.waitFor(() => expect(root.textContent).toContain("No API account")); root.querySelector<HTMLButtonElement>(".ai-collect")!.click();
  const setup = root.querySelector<HTMLElement>(".ai-account-setup")!;
  setup.querySelector<HTMLInputElement>('input[type="text"]')!.value = "Client"; const key = setup.querySelector<HTMLInputElement>('input[type="password"]')!; key.value = "sk-fixture-never-real-key";
  const save = [...setup.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "3. Verify and save account")!;
  save.click(); expect(api.mock.calls.some(([r]) => r.endsWith("/connect"))).toBe(false);
  setup.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked = true; save.click(); expect(key.value).toBe("");
  await vi.waitFor(() => expect(root.querySelector("select")!.value).toBe("account-b"));
  expect(api.mock.calls.some(([r]) => r.endsWith("-run"))).toBe(false);
  expect(vi.mocked(localStorage.setItem).mock.calls.every(([key]) => key === "gtm-console-lang")).toBe(true);
});
it("shows Gemini's real blocker and import recovery instead of an inactive button", async () => {
  dom(); const { renderProviderCollection } = await import("../site/console/ai-provider-collection.js"); const onImport = vi.fn();
  const api = vi.fn(async (r: string) => r.endsWith("/accounts") ? { accounts } : { enabled: false, model: "test" });
  const root = renderProviderCollection({ provider: "gemini", api, onCollected: vi.fn(), onImport });
  await vi.waitFor(() => expect(root.textContent).toContain("Google suggestions")); const select = root.querySelector("select")!; select.value = "account-a"; select.dispatchEvent(new window.Event("change")); root.querySelector<HTMLButtonElement>(".ai-collect")!.click();
  expect(onImport).toHaveBeenCalled(); expect(api.mock.calls.some(([r]) => r.endsWith("-run"))).toBe(false);
});
it("keeps setup available when datasets or account status cannot load", async () => {
  dom(); const { renderAiVisibility } = await import("../site/console/ai-visibility.js");
  const root = renderAiVisibility({ api: vi.fn().mockRejectedValue(new Error("Data unavailable")), me: { role: "tenant-admin" } });
  await vi.waitFor(() => expect(root.querySelectorAll(".ai-provider")).toHaveLength(5));
  await vi.waitFor(() => expect(root.textContent).toContain("Could not load accounts"));
  root.querySelector<HTMLButtonElement>(".ai-collect")!.click(); expect(root.querySelector<HTMLElement>(".ai-account-setup")!.hidden).toBe(false);
  expect(root.textContent).toContain("Data unavailable");
});
