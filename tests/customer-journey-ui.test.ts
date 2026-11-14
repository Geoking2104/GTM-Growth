import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { renderJourneyPreview } from "../site/console/customer-journey.js";
const data = { url: "https://example.test/", finalUrl: "https://example.test/", journeyContext: { url: "https://example.test/", brand: "Acme", brandSource: "schema:organization", products: [{ id: "one", name: "Leather derby", kind: "Product", url: "https://example.test/derby", sourceUrl: "https://example.test/", source: "schema", category: "leather shoes", description: "Leather derby shoes", attributes: {} }], links: [] } };
beforeEach(() => { const { window, document } = parseHTML("<html><body></body></html>"); vi.stubGlobal("document", document); vi.stubGlobal("Event", window.Event); });
afterEach(() => vi.unstubAllGlobals());
function confirm(panel: HTMLElement) {
  const inputs = panel.querySelectorAll<HTMLInputElement>(".journey-context-fields input");
  inputs[1].value = "leather shoes"; inputs[2].value = "wedding guests"; inputs[3].value = "a summer wedding";
  panel.querySelectorAll<HTMLOptionElement>(".journey-context-fields option")[1].selected = true;
  panel.querySelector<HTMLFormElement>("form")!.onsubmit!({ preventDefault() {} } as SubmitEvent);
}
describe("context confirmation UI", () => {
  it("requires confirmation and clears all old questions on a context change", () => {
    const panel = renderJourneyPreview({ data, language: "en" }); document.body.append(panel);
    expect(panel.querySelectorAll("textarea")).toHaveLength(0); confirm(panel);
    expect(panel.querySelectorAll("textarea")).toHaveLength(3);
    const input = panel.querySelectorAll<HTMLInputElement>(".journey-context-fields input")[3]; input.value = "winter walking"; input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(panel.querySelectorAll("textarea")).toHaveLength(0); expect(panel.textContent).toContain("Confirm it");
  });
  it("does not save or export a question the customer has emptied", async () => {
    const savePrompt = vi.fn(), writeText = vi.fn().mockResolvedValue(undefined); vi.stubGlobal("navigator", { clipboard: { writeText } });
    const panel = renderJourneyPreview({ data, language: "en", savePrompt }); document.body.append(panel); confirm(panel);
    const textarea = panel.querySelector<HTMLTextAreaElement>("textarea")!, previous = textarea.value; textarea.value = ""; textarea.oninput!({} as Event);
    const save = [...panel.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Track this question")!; await save.onclick!({} as MouseEvent); expect(savePrompt).not.toHaveBeenCalled();
    const copy = [...panel.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Copy selected questions")!; await copy.onclick!({} as MouseEvent); expect(writeText.mock.calls[0][0]).not.toContain(previous);
  });
  it("rejects a product read that redirects to another brand", async () => {
    const readPage = vi.fn().mockResolvedValue({ ...data, journeyContext: { ...data.journeyContext, url: "https://other.test/" } });
    const panel = renderJourneyPreview({ data, language: "en", readPage }); document.body.append(panel);
    panel.querySelector<HTMLInputElement>('input[type="url"]')!.value = "https://example.test/product";
    await [...panel.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Read my product")!.onclick!({} as MouseEvent);
    expect(panel.textContent).toContain("Insufficient or unavailable source"); expect(panel.querySelectorAll("textarea")).toHaveLength(0);
    expect(panel.querySelector<HTMLInputElement>(".journey-context-fields input")!.value).toBe("Acme");
  });
  it("ignores a stale source response after the customer edits context", async () => {
    let resolve!: (v: unknown) => void; const readPage = vi.fn(() => new Promise(r => { resolve = r; }));
    const panel = renderJourneyPreview({ data, language: "en", readPage }); document.body.append(panel);
    panel.querySelector<HTMLInputElement>('input[type="url"]')!.value = "https://example.test/product";
    const pending = [...panel.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Read my product")!.onclick!({} as MouseEvent);
    const brand = panel.querySelector<HTMLInputElement>(".journey-context-fields input")!; brand.value = "Chosen brand"; brand.dispatchEvent(new Event("input", { bubbles: true }));
    resolve(data); await pending; expect(brand.value).toBe("Chosen brand"); expect(panel.querySelectorAll("textarea")).toHaveLength(0);
  });
});
