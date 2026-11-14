import { it, expect, vi } from "vitest";
import express from "express";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID, createHash, createHmac } from "node:crypto";
import { crmPluginRouter } from "../src/crm/plugins.js";
import { configure, overview } from "../src/crm/service.js";
import { closeCrmStores } from "../src/crm/store.js";
import {
  TenantStore,
  closeTenantStores,
  type Tenant,
} from "../src/tenants/store.js";
import { ecommerceWebhookRouter } from "../src/console/ecommerce-webhooks.js";
import {
  saveConnection,
  listOrders,
  closeEcommerceStores,
} from "../src/ecommerce/store.js";
import { sealSecret } from "../src/ecommerce/secrets.js";
it("authenticates scoped plugin HTTP requests and verifies JSON webhooks on their original bytes", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "crm-http-"));
  vi.stubEnv("TENANTS_PATH", path.join(dir, "tenants.json"));
  vi.stubEnv("CRM_PATH", path.join(dir, "crm.db"));
  vi.stubEnv("ECOMMERCE_STORE_PATH", path.join(dir, "commerce"));
  const secret = Buffer.alloc(32, 9);
  vi.stubEnv("ECOMMERCE_DATA_KEY_B64", secret.toString("base64"));
  vi.stubEnv("CRM_PLUGINS_FILE", path.join(dir, "plugins.json"));
  const tenant: Tenant = {
    id: "acme",
    name: "Acme",
    mode: "organization",
    issuer: "https://sso.example",
    domains: ["example.com"],
    emailDomains: [],
    gscProperties: [],
    branding: {},
    identityProviders: [],
    status: "active",
    createdAt: "2026-11-01T00:00:00Z",
  };
  new TenantStore().upsert(tenant);
  const principal = { tenant, actor: "admin", admin: true };
  configure(principal, randomUUID(), { enabled: true, mode: "plugin" });
  const token = "synthetic_server_test_token_12345678";
  const config = {
    tenant: "acme",
    id: "client-crm",
    name: "Test CRM",
    permissions: ["contacts:write"],
    channels: ["web"],
    identifiers: [],
    recordHosts: [],
    requestsPerHour: 2,
  };
  const writeConfig = () =>
    writeFileSync(
      process.env.CRM_PLUGINS_FILE!,
      JSON.stringify({
        [createHash("sha256").update(token).digest("hex")]: config,
      }),
    );
  writeConfig();
  saveConnection("acme", {
    id: "connected-shop",
    provider: "shopify",
    domain: "example.myshopify.com",
    currency: "EUR",
    timezone: "UTC",
    connectedAt: tenant.createdAt,
    status: "connected",
    credentialsSealed: "fixture",
    webhookSecretSealed: JSON.stringify(
      sealSecret(
        secret,
        "acme:connected-shop:webhook",
        "synthetic-webhook-secret",
      ),
    ),
    scopes: [],
  });
  const app = express();
  app.use("/webhooks", ecommerceWebhookRouter());
  app.use(express.json({ limit: "4mb" }));
  app.use("/api/integrations/crm", crmPluginRouter());
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  try {
    const send = (
      operation: string,
      body: unknown,
      credential: string | null = token,
    ) =>
      fetch(origin + "/api/integrations/crm/" + operation, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(credential ? { Authorization: "Bearer " + credential } : {}),
        },
        body: JSON.stringify(body),
      });
    expect((await send("contacts", {}, null)).status).toBe(401);
    expect(
      (await send("contacts", {}, "wrong_token_with_valid_length_123456789"))
        .status,
    ).toBe(403);
    const input = {
      key: "create-contact-001",
      externalId: "crm-customer-001",
      contact: { label: "Contact One" },
    };
    const created = await send("contacts", input);
    expect(created.status).toBe(200);
    expect(created.headers.get("cache-control")).toBe("no-store");
    expect((await created.json()).profileId).toBeTruthy();
    expect((await send("contacts", input)).status).toBe(200);
    expect((await send("contacts", input)).status).toBe(429);
    expect(overview(principal).counts.contacts).toBe(1);
    writeFileSync(process.env.CRM_PLUGINS_FILE!, "{}");
    expect((await send("contacts", input)).status).toBe(403);
    writeConfig();
    new TenantStore().upsert({ ...tenant, status: "suspended" });
    expect((await send("contacts", input)).status).toBe(403);
    new TenantStore().upsert(tenant);
    const body = JSON.stringify({
      id: 101,
      name: "#101",
      created_at: "2026-11-01T10:00:00Z",
      updated_at: "2026-11-01T11:00:00Z",
      currency: "EUR",
      total_price: "120",
      subtotal_price: "100",
      total_tax: "20",
      total_discounts: "0",
      financial_status: "paid",
      customer: { id: 7 },
      line_items: [],
    });
    const signature = createHmac("sha256", "synthetic-webhook-secret")
      .update(body)
      .digest("base64");
    const webhook = (raw: string, eventId: string) =>
      fetch(origin + "/webhooks/shopify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Shop-Domain": "example.myshopify.com",
          "X-Shopify-Topic": "orders/create",
          "X-Shopify-Webhook-Id": eventId,
          "X-Shopify-Hmac-Sha256": signature,
        },
        body: raw,
      });
    expect((await webhook(body + " ", "forged-event")).status).toBe(200);
    expect(listOrders("acme", "connected-shop")).toHaveLength(0);
    expect((await webhook(body, "verified-event")).status).toBe(200);
    expect(listOrders("acme", "connected-shop")).toHaveLength(1);
    expect(listOrders("acme", "connected-shop")[0].customerRef).toMatch(
      /^cust_[a-f0-9]{24}$/,
    );
    await webhook(body, "verified-event");
    expect(listOrders("acme", "connected-shop")).toHaveLength(1);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    closeCrmStores();
    closeEcommerceStores();
    closeTenantStores();
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  }
}, 15000);
