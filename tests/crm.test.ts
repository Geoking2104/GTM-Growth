import { commerceRoutes } from "../src/console/commerce.js";
import { sealSecret } from "../src/ecommerce/secrets.js";
import { ShopifyProvider } from "../src/ecommerce/providers/shopify/client.js";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import * as crm from "../src/crm/service.js";
import {
  closeCrmStores,
  database,
  transaction,
  identityKey,
} from "../src/crm/store.js";
import { eventInput, identityInput } from "../src/crm/model.js";
import { pluginOperation, pluginSchema } from "../src/crm/plugins.js";
import { crmPrincipal } from "../src/console/crm.js";
import { drainCommerce } from "../src/crm/commerce.js";
import {
  closeEcommerceStores,
  saveConnection,
  listOrders,
  readCursor,
  writeCursor,
  pendingCrmOrders,
  database as commerceDb,
} from "../src/ecommerce/store.js";
import { ingestOrder } from "../src/ecommerce/ingest.js";
import { mapShopifyOrder } from "../src/ecommerce/providers/shopify/client.js";
import { scopedCustomerRef } from "../src/ecommerce/identity.js";
import type { Tenant } from "../src/tenants/store.js";
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
const admin = { tenant, actor: "admin1", admin: true };
const key = () => randomUUID();
const secret = Buffer.alloc(32, 7);
let dir: string;
const config = () =>
  pluginSchema.parse({
    tenant: "acme",
    id: "client-crm",
    name: "Client CRM",
    permissions: [
      "contacts:write",
      "identities:write",
      "events:write",
      "timeline:read",
    ],
    channels: ["web", "social"],
    identifiers: [
      { kind: "web_user", scope: "example.com" },
      { kind: "web_session", scope: "example.com" },
      { kind: "social_user", scope: "linkedin-account1" },
    ],
    recordHosts: ["example.com", "crm.example.com"],
  });
const operate = (op: string, input: unknown, p = config()) =>
  pluginOperation(tenant, p, op, input);
const create = () =>
  crm.createNative(admin, key(), { label: "Contact 001" }).profileId;
const event = (overrides: Record<string, unknown> = {}) =>
  eventInput.parse({
    eventId: key(),
    channel: "web",
    type: "page_view",
    occurredAt: "2026-11-01T10:00:00Z",
    summary: "Product page opened",
    identity: { kind: "web_user", scope: "example.com", value: "user-123" },
    proof: { reference: "Authenticated application event" },
    sourceUrl: "https://example.com/product?token=not-stored#fragment",
    ...overrides,
  });
function ingest(
  storeId = "shop-a",
  eventId = key(),
  customerId = "gid://shopify/Customer/7",
  updatedAt = "2026-11-01T11:00:00Z",
) {
  const order = mapShopifyOrder(storeId, {
    id: "gid://shopify/Order/1001",
    name: "#1001",
    createdAt: "2026-11-01T09:00:00Z",
    updatedAt,
    financialStatus: "PAID",
    subtotalPriceSet: { shopMoney: { amount: "100" } },
    totalDiscountsSet: { shopMoney: { amount: "0" } },
    totalShippingPriceSet: { shopMoney: { amount: "10" } },
    totalTaxSet: { shopMoney: { amount: "10" } },
    currencyCode: "EUR",
    totalPriceSet: { shopMoney: { amount: "120", currencyCode: "EUR" } },
    lineItems: { edges: [] },
    customer: { id: customerId },
  } as any);
  return ingestOrder({
    tenantId: tenant.id,
    provider: "shopify",
    storeId,
    eventId,
    customerId: order.customerRef,
    pseudonymSecret: secret,
    order,
  });
}
function store(id = "shop-a", provider: "shopify" | "prestashop" = "shopify") {
  saveConnection(tenant.id, {
    id,
    provider,
    domain: "example.com",
    currency: "EUR",
    timezone: "UTC",
    connectedAt: "2026-11-01T00:00:00Z",
    status: "connected",
    credentialsSealed: "fixture",
    webhookSecretSealed: null,
    scopes: [],
  });
}
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "crm-"));
  vi.stubEnv("CRM_PATH", path.join(dir, "crm.db"));
  vi.stubEnv("ECOMMERCE_STORE_PATH", path.join(dir, "commerce"));
  vi.stubEnv("ECOMMERCE_DATA_KEY_B64", secret.toString("base64"));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-15T10:00:00Z"));
  crm.configure(admin, key(), { enabled: true, mode: "native" });
});
afterEach(() => {
  closeCrmStores();
  closeEcommerceStores();
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
it("requires opt-in and explicit CRM roles; platform/service identities cannot enter the console", () => {
  crm.configure(admin, key(), { enabled: false, mode: "native" });
  expect(create).toThrow("CRM_DISABLED");
  const reader = { ...admin, actor: "viewer", admin: false };
  expect(() => crm.overview(reader)).toThrow("CRM_ACCESS");
  crm.grant(admin, key(), { actor: "viewer", role: "reader" });
  expect(crm.overview(reader).role).toBe("reader");
  expect(() => crm.createNative(reader, key(), { label: "Contact" })).toThrow(
    "CRM_ACCESS",
  );
  for (const ctx of [
    { tenancy: { tenant, platformAdmin: true }, user: { sub: "root" } },
    {
      tenancy: { tenant, role: "tenant-admin" },
      user: { sub: "bot", preferred_username: "service-account-crm" },
    },
    {
      tenancy: { tenant, role: "tenant-admin" },
      user: { sub: "bot", realm_access: { roles: ["ai-agent"] } },
    },
  ])
    expect(() => crmPrincipal(ctx as any)).toThrow("CRM_ACCESS");
});
it("shows web, social, manual and both commerce channels on one explicitly linked contact", () => {
  const profileId = create();
  for (const identity of [
    { kind: "web_user", scope: "example.com", value: "user-123" },
    { kind: "social_user", scope: "linkedin-account1", value: "social-7" },
  ])
    crm.linkIdentity(admin, key(), {
      profileId,
      identity,
      proof: { reference: "Reviewed exact account association" },
    });
  operate("events", {
    authorization: "Consent receipt 001",
    events: [
      event(),
      event({
        eventId: "social-evt",
        channel: "social",
        type: "social_message",
        identity: {
          kind: "social_user",
          scope: "linkedin-account1",
          value: "social-7",
        },
        summary: "Inbound message",
      }),
    ],
  });
  crm.addManual(admin, key(), {
    profileId,
    type: "call",
    occurredAt: "2026-11-02T10:00:00Z",
    summary: "Fit discussed",
    proof: { reference: "Call log checked by advisor" },
  });
  for (const provider of ["shopify", "prestashop"] as const) {
    const storeId = provider + "-store";
    store(storeId, provider);
    crm.linkIdentity(admin, key(), {
      profileId,
      identity: { kind: provider + "_customer", scope: storeId, value: "7" },
      proof: { reference: "Customer record association reviewed" },
    });
    const order = mapShopifyOrder(storeId, {
      id: "gid://shopify/Order/1001",
      name: "#1001",
      createdAt: "2026-11-01T10:00:00Z",
      updatedAt: "2026-11-02T11:00:00Z",
      financialStatus: "PAID",
      subtotalPriceSet: { shopMoney: { amount: "100" } },
      totalDiscountsSet: { shopMoney: { amount: "0" } },
      totalShippingPriceSet: { shopMoney: { amount: "10" } },
      totalTaxSet: { shopMoney: { amount: "10" } },
      currencyCode: "EUR",
      totalPriceSet: { shopMoney: { amount: "120" } },
      lineItems: { edges: [] },
    } as any);
    ingestOrder({
      tenantId: "acme",
      provider,
      storeId,
      eventId: "order-1",
      customerId: "7",
      pseudonymSecret: secret,
      order,
    });
  }
  expect(drainCommerce(tenant).imported).toBe(2);
  const timeline = crm.timeline(admin, { profileId });
  expect(new Set(timeline.events.map((e) => e.channel))).toEqual(
    new Set(["web", "social", "manual", "shopify", "prestashop"]),
  );
  expect(timeline.events.every((e) => e.match?.profileId === profileId)).toBe(
    true,
  );
  expect(timeline.events.find((e) => e.channel === "web")?.authorization).toBe(
    "Consent receipt 001",
  );
  expect(timeline.events.find((e) => e.channel === "web")?.sourceUrl).toBe(
    "https://example.com/product",
  );
});
it("keeps anonymous events unlinked, rejects aggregate or invented identity fields and does not match campaigns", () => {
  const profileId = create();
  operate("events", {
    authorization: "Receipt 001",
    events: [
      event({ identity: undefined, details: { campaignId: "campaign1" } }),
    ],
  });
  expect(crm.timeline(admin, { profileId }).events).toHaveLength(0);
  expect(crm.timeline(admin, { unlinked: true }).events).toHaveLength(1);
  expect(() => event({ ip: "127.0.0.1" })).toThrow();
  expect(() => event({ type: "impressions" })).toThrow();
  expect(() =>
    identityInput.parse({
      kind: "email",
      scope: "web",
      value: "x@example.com",
    }),
  ).toThrow();
});
it("blocks cross-client and cross-source access with scoped plugin permissions", () => {
  const p = config();
  expect(() =>
    pluginOperation({ ...tenant, id: "other" }, p, "contacts", {}),
  ).toThrow();
  expect(() =>
    operate(
      "events",
      { authorization: "Receipt", events: [event()] },
      { ...p, permissions: ["timeline:read"] },
    ),
  ).toThrow("CRM_PLUGIN_PERMISSION");
  expect(() =>
    operate("events", {
      authorization: "Receipt",
      events: [
        event({
          identity: {
            kind: "web_user",
            scope: "foreign.example",
            value: "user-123",
          },
        }),
      ],
    }),
  ).toThrow("CRM_SOURCE_SCOPE");
  expect(() =>
    operate("events", {
      authorization: "Receipt",
      events: [event({ sourceUrl: "https://evil.example/record" })],
    }),
  ).toThrow("CRM_SOURCE_SCOPE");
  expect(identityKey("acme", "web_user", "example.com", "7")).not.toBe(
    identityKey("other", "web_user", "example.com", "7"),
  );
});
it("supports a client CRM plugin without storing raw external IDs or returning unrelated contacts", () => {
  const externalId = "crm-opaque-778899";
  const input = {
    key: key(),
    externalId,
    contact: {
      label: "External contact",
      externalUrl: "https://crm.example.com/contact/record",
    },
  };
  const created = operate("contacts", input) as { profileId: string };
  expect(operate("contacts", input)).toEqual(created);
  operate("identify", {
    key: key(),
    externalId,
    identity: { kind: "web_user", scope: "example.com", value: "user-123" },
    proof: { reference: "Exact account record from CRM" },
  });
  operate("events", { authorization: "Receipt 001", events: [event()] });
  expect((operate("timeline", { externalId }) as any).events).toHaveLength(1);
  expect(() => operate("timeline", { externalId: "another-record" })).toThrow(
    "CRM_NOT_FOUND",
  );
  const stored = database()
    .prepare(
      "SELECT payload FROM crm_contacts UNION ALL SELECT payload FROM crm_events UNION ALL SELECT payload FROM crm_bindings UNION ALL SELECT payload FROM crm_receipts UNION ALL SELECT payload FROM crm_audit",
    )
    .all();
  expect(JSON.stringify(stored)).not.toContain(externalId);
  expect(JSON.stringify(stored)).not.toContain("user-123");
  expect(
    JSON.stringify(crm.detail(admin, { profileId: created.profileId })),
  ).not.toContain("identityKey");
});
it("rejects ambiguous identity links, and unlink recomputes the timeline", () => {
  const a = create(),
    b = create(),
    identity = { kind: "web_user", scope: "example.com", value: "user-123" },
    proof = { reference: "Reviewed account 123" };
  const linked = crm.linkIdentity(admin, key(), {
    profileId: a,
    identity,
    proof,
  });
  operate("events", { authorization: "Receipt", events: [event()] });
  expect(() =>
    crm.linkIdentity(admin, key(), { profileId: b, identity, proof }),
  ).toThrow("CRM_IDENTITY_CONFLICT");
  crm.unlink(admin, key(), {
    profileId: a,
    bindingId: linked.bindingId,
    reason: "Incorrect association reviewed",
  });
  expect(crm.timeline(admin, { profileId: a }).events).toHaveLength(0);
  expect(crm.timeline(admin, { unlinked: true }).events).toHaveLength(1);
});
it("limits web session binding to an explicit 24-hour window, including offset normalisation", () => {
  const profileId = create(),
    identity = {
      kind: "web_session",
      scope: "example.com",
      value: "session-123",
    };
  expect(() =>
    crm.linkIdentity(admin, key(), {
      profileId,
      identity,
      proof: { reference: "Session login" },
    }),
  ).toThrow("CRM_SESSION_INTERVAL_REQUIRED");
  crm.linkIdentity(admin, key(), {
    profileId,
    identity,
    proof: {
      reference: "Session login/logout receipt",
      validFrom: "2026-11-01T18:00:00+08:00",
      validUntil: "2026-11-01T19:00:00+08:00",
    },
  });
  operate("events", {
    authorization: "Receipt",
    events: [
      event({ identity, occurredAt: "2026-11-01T10:30:00Z" }),
      event({ identity, occurredAt: "2026-11-01T11:30:00Z" }),
    ],
  });
  expect(crm.timeline(admin, { profileId }).events).toHaveLength(1);
  expect(crm.timeline(admin, { unlinked: true }).events).toHaveLength(1);
});
it("enforces immutable idempotent events and atomic batches; corrections keep the original", () => {
  const e = event({ eventId: "evt-immutable" });
  expect(
    (operate("events", { authorization: "Receipt", events: [e, e] }) as any)
      .results[1].duplicate,
  ).toBe(true);
  expect(() =>
    operate("events", {
      authorization: "Receipt",
      events: [event({ eventId: "rolled-back" }), { ...e, summary: "Changed" }],
    }),
  ).toThrow("CRM_EVENT_CONFLICT");
  expect(crm.timeline(admin, {}).events).toHaveLength(1);
  operate("events", {
    authorization: "Receipt",
    events: [
      event({
        eventId: "correction",
        supersedes: e.eventId,
        summary: "Corrected observation",
      }),
    ],
  });
  expect(crm.timeline(admin, {}).events).toHaveLength(2);
  expect(() =>
    operate("events", {
      authorization: "Receipt",
      events: [
        event({
          supersedes: e.eventId,
          identity: {
            kind: "web_user",
            scope: "example.com",
            value: "other-user",
          },
        }),
      ],
    }),
  ).toThrow("CRM_INVALID_CORRECTION");
});
it("paginates tied timestamps without duplicates and exports the complete selected contact", () => {
  const profileId = create();
  crm.linkIdentity(admin, key(), {
    profileId,
    identity: { kind: "web_user", scope: "example.com", value: "user-123" },
    proof: { reference: "Reviewed association" },
  });
  operate("events", {
    authorization: "Receipt",
    events: Array.from({ length: 75 }, (_, i) =>
      event({ eventId: "page-" + i }),
    ),
  });
  const first = crm.timeline(admin, { profileId, limit: 30 }),
    second = crm.timeline(admin, {
      profileId,
      limit: 100,
      cursor: first.nextCursor,
    });
  expect(first.events).toHaveLength(30);
  expect(second.events).toHaveLength(45);
  expect(
    new Set([...first.events, ...second.events].map((e) => e.id)).size,
  ).toBe(75);
  expect(crm.exportContact(admin, { profileId }).events).toHaveLength(75);
});
it("pause blocks new source and manual events; erasure blocks routine identity re-import", () => {
  const externalId = "external-1",
    created = operate("contacts", {
      key: key(),
      externalId,
      contact: { label: "Contact One" },
    }) as { profileId: string };
  operate("identify", {
    key: key(),
    externalId,
    identity: { kind: "web_user", scope: "example.com", value: "user-123" },
    proof: { reference: "Account association" },
  });
  operate("events", { authorization: "Receipt", events: [event()] });
  crm.setContactStatus(admin, key(), {
    profileId: created.profileId,
    version: 1,
    status: "paused",
  });
  expect(
    (operate("events", { authorization: "Receipt", events: [event()] }) as any)
      .results[0].accepted,
  ).toBe(false);
  expect(() =>
    crm.addManual(admin, key(), {
      profileId: created.profileId,
      type: "note",
      occurredAt: "2026-11-02T10:00:00Z",
      summary: "Should not be added",
      proof: { reference: "Manual receipt" },
    }),
  ).toThrow("CRM_COLLECTION_BLOCKED");
  crm.erase(admin, key(), {
    profileId: created.profileId,
    version: 2,
    confirmation: "ERASE",
  });
  expect(crm.timeline(admin, {}).events).toHaveLength(0);
  expect(() =>
    operate("contacts", {
      key: key(),
      externalId,
      contact: { label: "Contact One" },
    }),
  ).toThrow("CRM_COLLECTION_BLOCKED");
  expect(
    (operate("events", { authorization: "Receipt", events: [event()] }) as any)
      .results[0].accepted,
  ).toBe(false);
});
it("keeps order/customer/cursor/event keys isolated by store and normalises Shopify REST/GraphQL IDs", () => {
  store("shop-a");
  store("shop-b");
  ingest("shop-a", "same-event");
  ingest("shop-b", "same-event", "7");
  expect(listOrders("acme", "shop-a")).toHaveLength(1);
  expect(listOrders("acme", "shop-b")).toHaveLength(1);
  expect(listOrders("acme", "shop-a")[0].id).not.toBe(
    listOrders("acme", "shop-b")[0].id,
  );
  expect(listOrders("acme", "shop-a")[0].customerRef).not.toBe(
    listOrders("acme", "shop-b")[0].customerRef,
  );
  expect(
    scopedCustomerRef(
      "acme",
      "shop-a",
      "shopify",
      "shopify-cust:gid://shopify/Customer/7",
      secret,
    ),
  ).toBe(scopedCustomerRef("acme", "shop-a", "shopify", "7", secret));
  for (const storeId of ["shop-a", "shop-b"])
    writeCursor("acme", {
      storeId,
      resource: "orders",
      cursor: storeId,
      lastSyncedAt: "2026-11-01T00:00:00Z",
      status: "idle",
    });
  expect(readCursor("acme", "orders", "shop-a")?.cursor).toBe("shop-a");
  expect(readCursor("acme", "orders", "shop-b")?.cursor).toBe("shop-b");
});
it("does not overwrite newer snapshots, and replays commerce delivery after lost acknowledgement", () => {
  store();
  ingest();
  ingest("shop-a", key(), "7", "2026-11-01T10:00:00Z");
  expect(listOrders("acme", "shop-a")[0].updatedAt).toBe(
    "2026-11-01T11:00:00Z",
  );
  expect(pendingCrmOrders("acme")).toHaveLength(1);
  drainCommerce(tenant);
  expect(crm.timeline(admin, {}).events).toHaveLength(2);
  commerceDb()
    .prepare("UPDATE commerce_crm_outbox SET delivered=0 WHERE tenant_id=?")
    .run("acme");
  drainCommerce(tenant);
  expect(crm.timeline(admin, {}).events).toHaveLength(2);
  expect(pendingCrmOrders("acme")).toHaveLength(0);
});
it("rolls back an identity-link conflict with all writes in the transaction", () => {
  const profileId = create();
  expect(() =>
    transaction("acme", () => {
      crm.linkIdentity(admin, key(), {
        profileId,
        identity: {
          kind: "web_user",
          scope: "example.com",
          value: "rollback-user",
        },
        proof: { reference: "Transaction proof" },
      });
      throw new Error("interrupted");
    }),
  ).toThrow();
  expect(crm.detail(admin, { profileId }).bindings).toHaveLength(1);
});
it("mounts raw verified ecommerce webhooks before JSON decoding and keeps CRM out of shared MCP routes", () => {
  const server = readFileSync("src/server.ts", "utf8");
  expect(
    server.indexOf('app.use("/api/integrations/commerce/webhooks"'),
  ).toBeLessThan(server.indexOf("app.use(express.json"));
  const api = readFileSync("src/console/api.ts", "utf8");
  expect(api).toContain("crmRoutes");
  expect(readFileSync("src/console/crm.ts", "utf8")).toContain("platformAdmin");
});

it("uses the authoritative connection store ID even when a webhook parser supplies the shop domain", () => {
  store("shop-a");
  const order = mapShopifyOrder("example.myshopify.com", {
    id: "gid://shopify/Order/999",
    name: "#999",
    createdAt: "2026-11-01T10:00:00Z",
    updatedAt: "2026-11-01T11:00:00Z",
    currencyCode: "EUR",
    financialStatus: "PAID",
    fulfillmentStatus: null,
    totalPriceSet: { shopMoney: { amount: "120" } },
    subtotalPriceSet: { shopMoney: { amount: "100" } },
    totalTaxSet: { shopMoney: { amount: "20" } },
    totalShippingPriceSet: { shopMoney: { amount: "0" } },
    totalDiscountsSet: { shopMoney: { amount: "0" } },
    lineItems: { edges: [] },
    customer: { id: "gid://shopify/Customer/7" },
    landingSite: null,
    referrerUrl: null,
  });
  ingestOrder({
    tenantId: "acme",
    provider: "shopify",
    storeId: "shop-a",
    eventId: "parsed-domain-order",
    customerId: order.customerRef,
    pseudonymSecret: secret,
    order,
  });
  expect(listOrders("acme", "shop-a")[0]).toMatchObject({
    storeId: "shop-a",
    status: "paid",
  });
  expect(listOrders("acme", "example.myshopify.com")).toHaveLength(0);
});

it("opens backfill credentials with the connection ID and pseudonymises the fetched customer", async () => {
  saveConnection("acme", {
    id: "shop-a",
    provider: "shopify",
    domain: "example.myshopify.com",
    currency: "EUR",
    timezone: "UTC",
    connectedAt: "2026-11-01T00:00:00Z",
    status: "connected",
    credentialsSealed: JSON.stringify(
      sealSecret(secret, "acme:shop-a:credentials", "synthetic-shop-token"),
    ),
    webhookSecretSealed: null,
    scopes: [],
  });
  const order = mapShopifyOrder("example.myshopify.com", {
    id: "gid://shopify/Order/999",
    name: "#999",
    createdAt: "2026-11-01T10:00:00Z",
    updatedAt: "2026-11-01T11:00:00Z",
    currencyCode: "EUR",
    financialStatus: "PAID",
    fulfillmentStatus: null,
    totalPriceSet: { shopMoney: { amount: "120" } },
    subtotalPriceSet: { shopMoney: { amount: "100" } },
    totalTaxSet: { shopMoney: { amount: "20" } },
    totalShippingPriceSet: { shopMoney: { amount: "0" } },
    totalDiscountsSet: { shopMoney: { amount: "0" } },
    lineItems: { edges: [] },
    customer: { id: "gid://shopify/Customer/7" },
    landingSite: null,
    referrerUrl: null,
  });
  const fetchOrders = vi
    .spyOn(ShopifyProvider.prototype, "listOrders")
    .mockResolvedValue({ items: [order], nextCursor: null });
  try {
    const route = commerceRoutes.find(
      (r) => r.path === "/commerce/sync/orders",
    )!;
    await route.handler({
      body: { storeId: "shop-a" },
      tenancy: { tenant, role: "tenant-admin" },
      user: { sub: "admin1" },
    } as any);
    expect(fetchOrders).toHaveBeenCalledWith(null, 250);
    expect(listOrders("acme", "shop-a")[0].customerRef).toBe(
      scopedCustomerRef("acme", "shop-a", "shopify", "7", secret),
    );
    expect(readCursor("acme", "orders", "shop-a")?.status).toBe("idle");
  } finally {
    fetchOrders.mockRestore();
  }
});
