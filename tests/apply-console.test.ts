import { afterEach, describe, expect, it, vi } from "vitest";
import { createApplyPreviewRoutes } from "../src/console/apply-routes.js";
import { createFileApplyPreview } from "../src/apply/preview.js";
import type { HandlerContext } from "../src/console/util.js";
import type { Fetcher } from "../src/geo/http.js";

const target = "https://example.com/robots.txt";
const before = "User-agent: *\nAllow: /\n";

function context(url = "https://example.com"): HandlerContext {
  return {
    url,
    body: { url, fix: "robots-ai", mode: "dry-run" },
    user: { sub: "oidc-sub-123" },
    tenancy: {
      tenant: { id: "acme", domains: ["example.com"], status: "active" },
      role: "tenant-user", platformAdmin: false, memberships: [],
    },
  } as unknown as HandlerContext;
}

describe("Apply Mode — authenticated tenant preview route", () => {
  const fetcher = vi.fn<Fetcher>(async url => ({ url, status: 200, ok: true, headers: {}, body: before }));
  const route = createApplyPreviewRoutes(fetcher)[0];
  afterEach(() => fetcher.mockClear());

  it("derives tenant from the authenticated session and issues one read-only GET", async () => {
    const ctx = context(); ctx.body.tenantId = "globex"; // client-supplied tenant must be ignored
    const response = await route.handler(ctx) as {
      preview: { tenantId: string; target: { url: string }; mode: string; changed: boolean };
      writesEnabled: boolean; actionsAvailable: string[];
    };
    expect(response.preview.tenantId).toBe("acme");
    expect(response.preview.target.url).toBe(target);
    expect(response.preview.mode).toBe("dry-run");
    expect(response.preview.changed).toBe(true);
    expect(response.writesEnabled).toBe(false);
    expect(response.actionsAvailable).toEqual(["preview"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(target);
  });

  it("rejects foreign domains and unregistered subdomains before any fetch", async () => {
    for (const url of ["https://other.com", "https://blog.example.com", "https://127.0.0.1", "https://localhost"]) {
      await expect(route.handler(context(url))).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    }
    const elevated = context("https://other.com");
    elevated.tenancy!.platformAdmin = true;
    await expect(route.handler(elevated)).rejects.toThrow("not registered");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated, inactive or missing-tenant contexts", async () => {
    const noUser = context(); noUser.user = undefined;
    await expect(route.handler(noUser)).rejects.toThrow("authenticated tenant");
    const noTenant = context(); noTenant.tenancy!.tenant = null;
    await expect(route.handler(noTenant)).rejects.toThrow("authenticated tenant");
    const inactive = context(); inactive.tenancy!.tenant!.status = "suspended";
    await expect(route.handler(inactive)).rejects.toThrow("authenticated tenant");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed on apply/confirmation flags, unsupported fixes and insecure URLs", async () => {
    for (const bodyPart of [
      { confirm: true }, { apply: true }, { mode: "apply" }, { fix: "llms" },
    ]) {
      const ctx = context(); ctx.body = { ...ctx.body, ...bodyPart };
      await expect(route.handler(ctx)).rejects.toThrow();
    }
    for (const url of ["http://example.com", "https://u:p@example.com", "https://example.com:444",
      "https://example.com/?q=1", "https://example.com/#h"]) {
      await expect(route.handler(context(url))).rejects.toThrow();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("allows the registered www alias, but still previews the exact HTTPS host", async () => {
    const ctx = context("https://www.example.com/article");
    const result = await route.handler(ctx) as { preview: { target: { url: string } } };
    expect(result.preview.target.url).toBe("https://www.example.com/robots.txt");
    expect(fetcher.mock.calls[0][0]).toBe("https://www.example.com/robots.txt");
  });
});

class ElementStub {
  children: ElementStub[] = [];
  textContent = "";
  value = "";
  className = "";
  disabled = false;
  type = "";
  required = false;
  onsubmit?: (event: { preventDefault(): void }) => Promise<void>;
  constructor(public tagName: string) {}
  append(...nodes: ElementStub[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: ElementStub[]) { this.children = nodes; }
  setAttribute(_name: string, _value: string) {}
}
const flatten = (node: ElementStub): ElementStub[] => [node, ...node.children.flatMap(flatten)];

describe("Apply Mode — console presentation", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
  it("shows a safe diff and never renders an Apply/publish action", async () => {
    vi.stubGlobal("location", { search: "" });
    vi.stubGlobal("localStorage", { getItem: () => "fr", setItem: () => {} });
    vi.stubGlobal("document", { documentElement: { lang: "fr" },
      createElement: (tag: string) => new ElementStub(tag) });
    const { renderApplyMode } = await import("../site/console/apply.js");
    const { t } = await import("../site/console/i18n.js");
    expect(t("s_apply_mode")).toBe("Correctifs GEO");
    const preview = createFileApplyPreview({
      tenantId: "acme", fixId: "robots-ai", kind: "robots", siteUrl: "https://example.com",
      sourceUrl: target, observedStatus: 200, before,
      after: `${before}User-agent: OAI-SearchBot\nAllow: /\n`,
      manualReview: ["Existing rule blocks a bot"],
      now: new Date("2026-11-09T12:00:00Z"),
    });
    const api = vi.fn(async () => ({ preview, writesEnabled: false }));
    const root = renderApplyMode({ api, me: { tenant: { domains: ["example.com"] } }, url: target }) as ElementStub;
    const form = flatten(root).find(node => node.tagName === "form");
    expect(form).toBeDefined();
    await form!.onsubmit!({ preventDefault() {} });
    expect(api).toHaveBeenCalledWith("/apply/preview", { url: target, fix: "robots-ai", mode: "dry-run" });
    const nodes = flatten(root);
    expect(nodes.some(node => node.textContent.includes("+User-agent: OAI-SearchBot"))).toBe(true);
    expect(nodes.some(node => node.textContent.includes("Existing rule blocks a bot"))).toBe(true);
    expect(nodes.filter(node => node.tagName === "button")).toHaveLength(1);
    expect(nodes.find(node => node.tagName === "button")?.textContent).toMatch(/Prévisualiser/);
    expect(nodes.some(node => node.textContent.includes("Aucune écriture effectuée"))).toBe(true);
  });
});
