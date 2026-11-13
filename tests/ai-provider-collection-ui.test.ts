import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
function dom(lang: string) {
  const { document, window } = parseHTML("<html><body></body></html>");
  Object.defineProperty(window.HTMLSelectElement.prototype, "value", { configurable: true, get() { return [...this.options].find(o => o.selected)?.value || ""; }, set(v) { for (const o of this.options) o.selected = o.value === v; } });
  vi.stubGlobal("document", document); vi.stubGlobal("window", window); vi.stubGlobal("Node", window.Node);
  vi.stubGlobal("location", { search: `?lang=${lang}` }); vi.stubGlobal("localStorage", { getItem: () => lang, setItem: vi.fn() });
  return document;
}
it.each(["fr", "en"])("shows all five providers on entry, with configuration and import help in %s", async lang => {
  const document = dom(lang); const { renderAiVisibility } = await import("../site/console/ai-visibility.js");
  const api = vi.fn(async (route: string) => route.endsWith("/datasets") ? { datasets: [] } : { configured: false, enabled: true, model: "configured-model", keyVariable: "AI_VISIBILITY_CLAUDE_KEY_ACME" });
  const root = renderAiVisibility({ api, me: { role: "tenant-admin" } }); document.body.append(root);
  await vi.waitFor(() => expect(root.querySelectorAll(".ai-provider")).toHaveLength(3));
  for (const name of ["Gemini", "OpenAI", "Claude", "Mistral", "Grok"]) expect([...root.querySelectorAll("summary")].some(s => s.textContent?.includes(`API ${name}`) || s.textContent?.includes(`${name} API`))).toBe(true);
  await vi.waitFor(() => expect(root.textContent).toContain(lang === "fr" ? "Clé absente" : "No key"));
  expect(api.mock.calls.filter(([route]) => route.endsWith("-status"))).toHaveLength(3);
  expect(api.mock.calls.some(([route]) => route.endsWith("-run"))).toBe(false);
  for (const panel of root.querySelectorAll(".ai-provider")) expect(panel.querySelector<HTMLButtonElement>(".btn")!.disabled).toBe(true);
  const manualImport = [...root.querySelectorAll<HTMLDetailsElement>("details.ai-import")].find(d => d.querySelector("summary")?.textContent === (lang === "fr" ? "Importer des réponses JSON" : "Import answers as JSON"))!;
  manualImport.open = false;
  const claude = root.querySelector('.ai-provider[data-provider="claude"]')!;
  [...claude.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === (lang === "fr" ? "Importer des réponses sauvegardées" : "Import saved answers"))!.click();
  expect(manualImport.open).toBe(true);
});
it.each(["claude", "mistral", "grok"])("collects %s only after consent and passes the saved dataset to the view", async provider => {
  const document = dom("en"); const { renderProviderCollection } = await import("../site/console/ai-provider-collection.js");
  const onCollected = vi.fn(), api = vi.fn(async (route: string) => route.endsWith("-status") ? { configured: true, enabled: true, model: "test-model" } : { id: "saved-dataset", succeeded: 1, failed: [{ prompt: "Second?", reason: "HTTP 429" }] });
  const root = renderProviderCollection({ provider, api, onCollected, onImport: vi.fn() }); document.body.append(root);
  const run = root.querySelector<HTMLButtonElement>(".btn")!;
  await vi.waitFor(() => expect(run.disabled).toBe(false));
  root.querySelector("textarea")!.value = JSON.stringify({ brands: [{ name: "Alpha" }], prompts: ["First?", "Second?"] });
  run.click(); expect(api).toHaveBeenCalledTimes(1);
  root.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked = true; run.click(); run.click();
  await vi.waitFor(() => expect(onCollected).toHaveBeenCalledWith(expect.objectContaining({ id: "saved-dataset" })));
  expect(api.mock.calls.filter(([route]) => route.endsWith("-run"))).toHaveLength(1);
  expect(root.textContent).toContain("Quota or rate limit reached");
  expect(run.disabled).toBe(false);
});
it("keeps collection disabled on a status failure and offers an explicit retry", async () => {
  dom("fr"); const { renderProviderCollection } = await import("../site/console/ai-provider-collection.js");
  const api = vi.fn().mockRejectedValueOnce(new Error("unavailable")).mockResolvedValueOnce({ configured: true, enabled: true, model: "test-model" });
  const root = renderProviderCollection({ provider: "claude", api, onCollected: vi.fn(), onImport: vi.fn() });
  await vi.waitFor(() => expect(root.textContent).toContain("Statut indisponible"));
  expect(root.querySelector<HTMLButtonElement>(".btn")!.disabled).toBe(true);
  [...root.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Vérifier la connexion")!.click();
  await vi.waitFor(() => expect(root.querySelector<HTMLButtonElement>(".btn")!.disabled).toBe(false));
});

it("still shows provider setup and manual import when loading datasets fails", async () => {
  dom("en"); const { renderAiVisibility } = await import("../site/console/ai-visibility.js");
  const api = vi.fn(async (route: string) => { if (route.endsWith("/datasets")) throw new Error("Data unavailable"); return { configured: false, enabled: true, model: "test-model" }; });
  const root = renderAiVisibility({ api, me: { role: "tenant-admin" } });
  await vi.waitFor(() => expect(root.querySelectorAll(".ai-provider")).toHaveLength(3));
  expect(root.textContent).toContain("Import answers as JSON");
  expect(root.textContent).toContain("Data unavailable");
  expect(api.mock.calls.some(([route]) => route.endsWith("-run"))).toBe(false);
});
