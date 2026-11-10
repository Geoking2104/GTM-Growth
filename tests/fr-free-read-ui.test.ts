import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Small DOM stand-in: run the actual French form listener without a browser. */
class NodeStub {
  tagName: string;
  value = "";
  hidden = true;
  className = "";
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  children: NodeStub[] = [];
  listeners: Record<string, (event: { preventDefault: () => void }) => void> = {};
  private ownText = "";

  constructor(tagName = "div") { this.tagName = tagName; }
  get textContent(): string { return this.ownText + this.children.map((child) => child.textContent).join(" "); }
  set textContent(value: string) { this.ownText = String(value); this.children = []; }
  setAttribute(key: string, value: string) { this.attributes[key] = value; }
  get classList() {
    return { add: (name: string) => { this.className += ` ${name}`; } };
  }
  append(...nodes: NodeStub[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: NodeStub[]) { this.ownText = ""; this.children = nodes; }
  addEventListener(name: string, listener: (event: { preventDefault: () => void }) => void) { this.listeners[name] = listener; }
  focus() { /* browser-native; irrelevant to validation */ }
  scrollIntoView() { /* browser-native; irrelevant to validation */ }
  find(predicate: (node: NodeStub) => boolean): NodeStub | undefined {
    if (predicate(this)) return this;
    for (const child of this.children) { const found = child.find(predicate); if (found) return found; }
    return undefined;
  }
}

const nodes: Record<string, NodeStub> = {};

beforeEach(async () => {
  vi.resetModules();
  for (const key of Object.keys(nodes)) delete nodes[key];
  for (const id of ["url-form", "url-input", "form-msg", "read-result"]) nodes[id] = new NodeStub(id);
  vi.stubGlobal("document", {
    getElementById: (id: string) => nodes[id] ?? null,
    createElement: (tagName: string) => new NodeStub(tagName),
  });
  vi.stubGlobal("sessionStorage", { setItem: vi.fn() });
  await import("../site/fr/free-read.js");
});

afterEach(() => vi.unstubAllGlobals());

function submit(value: string) {
  nodes["url-input"].value = value;
  nodes["url-form"].listeners.submit({ preventDefault: () => undefined });
}

describe("French free read user flow", () => {
  it("rejects bad input without redirecting or calling the server", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    submit("not a url");
    expect(nodes["form-msg"].textContent).toMatch(/URL/);
    expect(nodes["read-result"].hidden).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders 10 URL checks immediately and marks fallback values as examples", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    submit("example.com");
    const result = nodes["read-result"];
    expect(result.hidden).toBe(false);
    const checks = result.find((node) => node.tagName === "ul" && node.className === "gg-checks");
    expect(checks?.children).toHaveLength(10);
    await vi.waitFor(() => expect(result.textContent).toContain("EXEMPLES"));
    expect(result.textContent).toContain("SEO — métadonnées");
    expect(fetchMock).toHaveBeenCalledWith("/api/free-read", expect.objectContaining({ method: "POST" }));
  });

  it("displays measured GEO score and French labels from the real payload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ score: 71, projectedScore: 100, durationMs: 125, tables: [
        { id: "seo.meta", title: "SEO — metadata", rows: [{ label: "Title", value: "48 chars", status: "pass" }] },
      ] }),
    })));
    submit("example.com");
    await vi.waitFor(() => expect(nodes["read-result"].textContent).toContain("Score GEO mesuré : 71/100"));
    expect(nodes["read-result"].textContent).toContain("SEO — métadonnées");
    expect(nodes["read-result"].textContent).toContain("48 caractères");
    expect(nodes["read-result"].textContent).not.toContain("SEO — metadata");
  });
});
