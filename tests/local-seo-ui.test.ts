import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
async function mount(lang: string) {
  vi.resetModules();
  const { document, window } = parseHTML(`<html lang="${lang}"><body></body></html>`);
  const storage = new Map<string, string>();
  vi.stubGlobal("document", document);
  vi.stubGlobal("location", { search: `?lang=${lang}` });
  vi.stubGlobal("localStorage", { getItem: (k: string) => storage.get(k), setItem: (k: string, v: string) => storage.set(k, v) });
  const { renderLocalSeoWorkspace } = await import("../site/console/local-seo.js");
  const panel = renderLocalSeoWorkspace({ state: { url: "https://example.fr" } });
  document.body.append(panel);
  const button = (text: string) => [...panel.querySelectorAll("button")].find(b => b.textContent === text)!;
  const run = () => panel.querySelector("form")!.dispatchEvent(new window.Event("submit", { cancelable: true }));
  return { panel, window, button, run };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("local SEO workspace interactions", () => {
  it.each(["fr", "en"])("renders and exports a declared plan in %s", async lang => {
    const { panel, button, run, window } = await mount(lang);
    run();
    expect(panel.textContent).toContain(lang === "fr" ? "aucune fiche" : "no listing");
    expect(panel.textContent).toContain(lang === "fr" ? "À compléter" : "Missing");
    let blob: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation(value => { blob = value as Blob; return "blob:test"; });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    button(lang === "fr" ? "Exporter le plan (.md)" : "Export plan (.md)").click();
    expect(await blob!.text()).toContain(lang === "fr" ? "Hypothèses" : "Query hypotheses");
    panel.querySelector("input")!.dispatchEvent(new window.Event("input", { bubbles: true }));
    expect(button(lang === "fr" ? "Exporter le plan (.md)" : "Export plan (.md)")).toBeUndefined();
  });
  it("caps citations, removes a row, and displays hostile input as text", async () => {
    const { panel, button, run } = await mount("en");
    for (let i = 0; i < 25; i++) button("Add a citation").click();
    expect(panel.querySelectorAll("fieldset")).toHaveLength(20);
    expect(button("Add a citation").disabled).toBe(true);
    button("Remove").click();
    expect(panel.querySelectorAll("fieldset")).toHaveLength(19);
    expect(button("Add a citation").disabled).toBe(false);
    panel.querySelector("fieldset input")!.value = '<img src=x onerror="alert(1)">';
    run();
    expect(panel.querySelector("img")).toBeNull();
    expect(panel.textContent).toContain('<img src=x onerror="alert(1)">');
  });
  it("round-trips dossiers and rejects oversized imports without replacing the form", async () => {
    const { panel, button, run } = await mount("en");
    const file = panel.querySelector('input[type="file"]')!;
    const data = { version: 1, profile: { name: "My business", website: "https://example.fr" }, citations: [{ directory: "Sample" }] };
    Object.defineProperty(file, "files", { configurable: true, value: [{ size: 100, text: async () => JSON.stringify(data) }] });
    await file.onchange!({} as Event);
    expect(panel.querySelector("input")!.value).toBe("My business");
    expect(panel.querySelectorAll("fieldset")).toHaveLength(1);
    let blob: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation(value => { blob = value as Blob; return "blob:test"; });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    button("Export JSON dossier").click();
    expect(JSON.parse(await blob!.text()).profile.name).toBe("My business");
    Object.defineProperty(file, "files", { configurable: true, value: [{ size: 100001 }] });
    await file.onchange!({} as Event);
    expect(panel.textContent).toContain("Invalid or oversized dossier");
    expect(panel.querySelector("input")!.value).toBe("My business");
    run();
  });
});
