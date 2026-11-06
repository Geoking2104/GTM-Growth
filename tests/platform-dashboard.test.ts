import { afterEach, expect, it, vi } from "vitest";
class NodeStub {
  children: NodeStub[] = []; textContent = ""; value = ""; onclick?: () => void; oninput?: () => void;
  constructor(public tagName: string) {}
  append(...nodes: NodeStub[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: NodeStub[]) { this.children = nodes; }
  setAttribute() {}
}
const flatten = (node: NodeStub): NodeStub[] => [node, ...node.children.flatMap(flatten)];
afterEach(() => vi.unstubAllGlobals());
it("loads authenticated platform clients and selects a tenant", async () => {
  vi.stubGlobal("location", { search: "", pathname: "/console/", hostname: "localhost" }); vi.stubGlobal("localStorage", { getItem: () => "fr" });
  vi.stubGlobal("document", { documentElement: { lang: "fr" }, createElement: (tag: string) => new NodeStub(tag), createTextNode: (text: string) => { const n = new NodeStub("text"); n.textContent = text; return n; } });
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tenants: [{ id: "acme", name: "Acme", status: "active", usageType: "company", domains: ["acme.fr"], gscProperties: [], ga4Properties: [], gtmContainers: [] }] }) }); vi.stubGlobal("fetch", fetcher);
  const { renderPlatformDashboard } = await import("../site/console/platform-dashboard.js"); const open = vi.fn();
  const root = await renderPlatformDashboard(async () => "token", open) as unknown as NodeStub;
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBe("Bearer token");
  const button = flatten(root).find((n) => n.textContent === "Ouvrir cet espace"); expect(button).toBeDefined(); button!.onclick!(); expect(open).toHaveBeenCalledWith("acme");
});

