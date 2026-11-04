import { describe, it, expect } from "vitest";
import { gtmWrite, gtmPublish, containerOf } from "../src/console/gtm-console.js";
import { ga4Ecommerce, ga4Technology } from "../src/console/analytics.js";

const tenant = { id: "t", gtmContainers: ["accounts/1/containers/2"] } as any;
const fakeApi = (calls: string[]) => ({ accounts: { containers: {
  get: async () => ({ data: { publicId: "GTM-ABC" } }),
  versions: { publish: async ({ path }: any) => { calls.push(`publish ${path}`); return { data: { containerVersion: { containerVersionId: "7" } } }; } },
  workspaces: { create: async () => ({ data: { path: "accounts/1/containers/2/workspaces/9" } }), delete: async ({ path }: any) => { calls.push(`del ${path}`); }, tags: { create: async ({ parent, requestBody }: any) => { calls.push(`tag ${parent} ${requestBody.name}`); return { data: { tagId: "5" } }; } } },
} } }) as any;

describe("GTM console", () => {
  it("defaults to tenant container and rejects foreign paths", async () => {
    expect(containerOf({}, tenant)).toBe("accounts/1/containers/2");
    const r: any = await gtmWrite({ op: "create", kind: "tags", workspace: "accounts/9/containers/9/workspaces/1" }, tenant, fakeApi([]));
    expect(r.problem.message).toMatch(/hors du conteneur/);
  });
  it("dry run sends nothing", async () => {
    const calls: string[] = [];
    const r: any = await gtmWrite({ op: "create", kind: "tags", workspace: "accounts/1/containers/2/workspaces/3", resource: '{"name":"x"}', dryRun: true }, tenant, fakeApi(calls));
    expect(r.dryRun).toBe(true); expect(calls).toEqual([]);
  });
  it("creates a tag in a workspace", async () => {
    const calls: string[] = [];
    await gtmWrite({ op: "create", kind: "tags", workspace: "accounts/1/containers/2/workspaces/3", resource: { name: "x" } }, tenant, fakeApi(calls));
    expect(calls).toEqual(["tag accounts/1/containers/2/workspaces/3 x"]);
  });
  it("publish requires typing the public id", async () => {
    const calls: string[] = [];
    const r: any = await gtmPublish({ version: "7", confirm: "nope" }, tenant, fakeApi(calls));
    expect(r.needsConfirmation).toBe(true); expect(calls).toEqual([]);
    const ok: any = await gtmPublish({ version: "7", confirm: "GTM-ABC" }, tenant, fakeApi(calls));
    expect(ok.published).toBe(true); expect(calls).toEqual(["publish accounts/1/containers/2/versions/7"]);
  });
});

describe("GA4 ecommerce & technology", () => {
  const report = async (p: any) => ({ rows: p.dimensions?.[0] === "eventName" ? [{ eventName: "purchase", eventCount: "3", totalUsers: "2" }] : p.dimensions?.length ? [{ [p.dimensions[0]]: "X", sessions: "10", purchaseRevenue: "12.5" }] : [{ purchaseRevenue: "100", transactions: "4", averagePurchaseRevenue: "25" }] });
  it("computes totals, funnel and breakdowns", async () => {
    const d: any = await ga4Ecommerce({ ga4Property: "123" }, report as any);
    expect(d.totals.purchaseRevenue).toBe(100); expect(d.hasEcommerce).toBe(true);
    expect(d.funnel.find((f: any) => f.step === "purchase").users).toBe(2);
  });
  it("OS / browser breakdown", async () => {
    const d: any = await ga4Technology({ ga4Property: "123" }, report as any);
    expect(d.os[0]).toMatchObject({ operatingSystem: "X", sessions: 10 }); expect(d.browser.length).toBe(1);
  });
});
