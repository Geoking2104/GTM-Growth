import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
const scopes = ["gtm:workspace:read", "gtm:search:read", "gtm:analytics:read", "gtm:visibility:read", "gtm:operations:read"];
const context = { workspaces: [{ id: "acme", name: "Acme" }], tenant: { id: "acme", name: "Acme" }, role: "tenant-user", user: "user", resources: { domains: ["acme.example"], search: ["sc-domain:acme.example"], analytics: ["123"] }, policy: { enabled: true, clients: ["https://agent.example/client.json"] }, allowedClients: ["https://agent.example/client.json"], scopes, grants: [] };
afterEach(() => vi.unstubAllGlobals());
function dom(lang: string) {
    vi.resetModules();
    const { document, window } = parseHTML('<html lang="en"><body></body></html>');
    vi.stubGlobal("document", document);
    vi.stubGlobal("window", window);
    vi.stubGlobal("location", { pathname: "/console/agents.html", search: `?lang=${lang}`, href: `https://gtm.example/console/agents.html?lang=${lang}`, assign: vi.fn() });
    vi.stubGlobal("localStorage", { getItem: () => lang, setItem() { } });
    vi.stubGlobal("sessionStorage", { getItem: () => null, setItem() { }, removeItem() { } });
    return document;
}
it.each(["en", "fr"])("requires explicit unchecked consent and selected sources in %s", async (lang) => {
    const document = dom(lang);
    const { renderConnectedAgents } = await import("../site/console/connected-agents.js");
    const api = vi.fn(async (path, body) => path === "context" ? { ...context, request: { clientName: "Pilot agent", client: "https://agent.example/client.json", scopes, allowed: true } } : { redirect: "https://agent.example/callback?code=test" });
    document.body.append(await renderConnectedAgents({ request: "request", api }));
    const boxes = [...document.querySelectorAll('input[type="checkbox"]')];
    expect(boxes).toHaveLength(8);
    expect(boxes.every(x => !x.checked)).toBe(true);
    boxes[0].checked = true;
    boxes[5].checked = true;
    const approve = [...document.querySelectorAll("button")].find(x => x.textContent.includes(lang === "fr" ? "Autoriser" : "Allow"))!;
    await approve.onclick();
    expect(api).toHaveBeenLastCalledWith("consent", { request: "request", approve: true, tenant: "acme", scopes: [scopes[0]], resources: { domains: ["acme.example"], search: [], analytics: [] } });
    expect(document.body.textContent).toContain(lang === "fr" ? "30 jours" : "30 days");
    expect(document.body.textContent).toContain(lang === "fr" ? "déconnexion" : "logout");
});
it.each(["en", "fr"])("shows authorization details and durable revoke feedback in %s", async (lang) => {
    const document = dom(lang);
    const { renderConnectedAgents } = await import("../site/console/connected-agents.js");
    let revoked = false;
    const api = vi.fn(async (path) => { if (path === "revoke") {
        revoked = true;
        return { revoked: true };
    } return { ...context, grants: [{ id: "g", user: "user", client: "https://agent.example/client.json", clientName: "Pilot agent", scopes: [scopes[0]], resources: context.resources, created: 1000, expires: Date.now() / 1000 + 1000, lastUsed: null, revoked: revoked ? 1001 : null }] }; });
    document.body.append(await renderConnectedAgents({ tenant: "acme", api }));
    expect(document.body.textContent).toContain("agent.example");
    expect(document.body.textContent).toContain("sc-domain:acme.example");
    const button = [...document.querySelectorAll("button")].find(x => x.textContent.includes(lang === "fr" ? "Révoquer" : "Revoke"))!;
    await button.onclick();
    expect(api).toHaveBeenCalledWith("revoke", { tenant: "acme", grant: "g" });
    expect(document.querySelector('[role="status"]')?.textContent).toContain(lang === "fr" ? "bloquées" : "blocked");
});
it("allows denial without an eligible workspace and never renders API error details", async () => {
    const document = dom("en");
    const { renderConnectedAgents } = await import("../site/console/connected-agents.js");
    const api = vi.fn(async (path) => path === "context" ? { workspaces: [], request: { client: "https://agent.example/client.json" } } : Promise.reject(new Error("secret token")));
    document.body.append(await renderConnectedAgents({ request: "r", api }));
    const decline = document.querySelector("button")!;
    expect(decline.textContent).toBe("Decline");
    await decline.onclick();
    expect(document.body.textContent).not.toContain("secret token");
    expect(document.querySelector('[role="status"]')?.textContent).toContain("failed");
});
