import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { TenantConflictError, TenantStore, closeTenantStores, type Tenant } from "../src/tenants/store.js";
const exec = promisify(execFile);
const tenant: Tenant = { id: "acme", name: "Acme", mode: "organization", issuer: "https://example.org", domains: ["acme.fr"], emailDomains: [], gscProperties: [], branding: {}, identityProviders: [], status: "active", createdAt: "2026-01-01" };
afterEach(() => closeTenantStores());
describe("tenant registry transactions", () => {
  it("migrates the existing registry once and preserves the original", () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "tenant-store-")), "tenants.json");
    writeFileSync(file, JSON.stringify([tenant])); const store = new TenantStore(file);
    expect(store.list()).toEqual([tenant]); expect(existsSync(file)).toBe(true);
    store.upsert({ ...tenant, name: "Updated" }); expect(new TenantStore(file).get("acme")?.name).toBe("Updated");
  });
  it("rolls back invalid migration and can retry", () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "tenant-store-")), "tenants.json");
    writeFileSync(file, "invalid"); const store = new TenantStore(file); expect(() => store.list()).toThrow();
    writeFileSync(file, JSON.stringify([tenant])); expect(store.list()).toEqual([tenant]);
  });
  it("rejects a stale update to the same tenant", () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "tenant-store-")), "tenants.json");
    const a = new TenantStore(file); const b = new TenantStore(file); a.upsert(tenant);
    const old = a.get("acme")!; b.upsert({ ...old, name: "New" }, old);
    expect(() => a.upsert({ ...old, domains: ["changed.fr"] }, old)).toThrow(TenantConflictError);
    expect(a.get("acme")?.name).toBe("New");
  });
  it("preserves concurrent inserts from multiple processes", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "tenant-store-")), "tenants.json");
    const worker = path.resolve("tests/fixtures/tenant-worker.mjs");
    await Promise.all(["one", "two", "three"].map((name) => exec(process.execPath, ["--import", "tsx", worker, name], { env: { ...process.env, TEST_TENANT_REGISTRY: file }, timeout: 30000 })));
    expect(new TenantStore(file).list()).toHaveLength(45);
  }, 45000);
});
