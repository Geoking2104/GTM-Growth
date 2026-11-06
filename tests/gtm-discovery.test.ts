import { describe, expect, it, vi } from "vitest";
import { gtmContainers } from "../src/console/gtm-console.js";
import type { Tenant } from "../src/tenants/store.js";
const tenant: Tenant = { id: "acme", name: "Acme", mode: "organization", issuer: "https://example.org", domains: [], emailDomains: [], gscProperties: [], gtmContainers: ["accounts/1/containers/2"], branding: {}, identityProviders: [], status: "active", createdAt: "" };
describe("GTM container discovery", () => {
  it("fetches all pages but restricts clients to assigned containers", async () => {
    const listAccounts = vi.fn(async ({ pageToken }: { pageToken?: string }) => ({ data: pageToken ? { account: [{ path: "accounts/2", name: "B" }] } : { account: [{ path: "accounts/1", name: "A" }], nextPageToken: "next" } }));
    const listContainers = vi.fn(async ({ parent, pageToken }: { parent: string; pageToken?: string }) => ({ data: parent === "accounts/2" ? { container: [{ path: "accounts/2/containers/9", name: "B" }] } : pageToken ? { container: [{ path: "accounts/1/containers/3", name: "Other" }] } : { container: [{ path: "accounts/1/containers/2", name: "Acme" }], nextPageToken: "next" } }));
    const api = { accounts: { list: listAccounts, containers: { list: listContainers } } } as any;
    const client: any = await gtmContainers(tenant, false, api); expect(client.containers.map((c: any) => c.path)).toEqual(["accounts/1/containers/2"]);
    const admin: any = await gtmContainers(tenant, true, api); expect(admin.containers.map((c: any) => c.path)).toEqual(["accounts/1/containers/2", "accounts/1/containers/3", "accounts/2/containers/9"]);
  });
});
