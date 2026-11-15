import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHmac, randomBytes } from "node:crypto";
import { closeEcommerceStores, claimWebhookEvent, upsertOrder, listOrders, upsertProducts, listProducts, getConnection, saveConnection, removeConnection, listConnections } from "../src/ecommerce/store.js";
import { ingestOrder, ingestProducts } from "../src/ecommerce/ingest.js";
import { attributeOrder, isLikelyCrawler, pseudonym } from "../src/ecommerce/attribute.js";
import { sealSecret, openSecret, decodeEcommerceKey } from "../src/ecommerce/secrets.js";
import { verifyHmac } from "../src/ecommerce/providers/provider.js";
import { mapShopifyOrder, mapShopifyProduct, ShopifyProvider, shopifyOrderId } from "../src/ecommerce/providers/shopify/client.js";
import { PrestaShopProvider, prestashopOrderId } from "../src/ecommerce/providers/prestashop/client.js";
import { buildFeedReport, feedCsv } from "../src/ecommerce/feed.js";
import { commerceRoutes } from "../src/console/commerce.js";
import type { HandlerContext } from "../src/console/util.js";
import type { Order, Product } from "../src/ecommerce/types.js";

const dir = () => { process.env.ECOMMERCE_STORE_PATH = mkdtempSync(path.join(tmpdir(), "ecom-")); return process.env.ECOMMERCE_STORE_PATH; };
afterEach(() => { closeEcommerceStores(); vi.unstubAllEnvs(); });

const secret = randomBytes(32);
const order = (overrides: Partial<Order> = {}): Order => ({
  id: "shopify-test:1001", storeId: "shopify-test", number: "1001", createdAt: "2026-11-01T10:00:00Z", currency: "EUR",
  total: 120, subtotal: 100, discount: 5, shipping: 10, tax: 5, status: "paid",
  lines: [{ productId: "shopify:Product/1", sku: "SKU-1", title: "Produit A", quantity: 2, unitPrice: 50, total: 100 }],
  customerRef: null, attribution: { channel: "unknown", engine: null, referrer: null, landingPage: null, utm: {}, method: "none", confidence: "low", firstTouch: true, windowDays: 30 },
  source: "web", ...overrides,
});

describe("e-commerce ingestion (US-03)", () => {
  it("replaying the same webhook ten times yields exactly one order", () => {
    dir();
    const results = Array.from({ length: 10 }, () => ingestOrder({ tenantId: "acme", provider: "shopify", storeId: "shopify-test", eventId: "evt-1", customerId: "cust-42", pseudonymSecret: secret, order: order() }));
    expect(results.filter((r) => r.inserted)).toHaveLength(1);
    expect(results.filter((r) => r.duplicate)).toHaveLength(9);
    expect(listOrders("acme", "shopify-test")).toHaveLength(1);
  });
  it("pseudonymizes the customer at the boundary — no raw id in storage", () => {
    dir();
    ingestOrder({ tenantId: "acme", provider: "shopify", storeId: "shopify-test", eventId: "evt-2", customerId: "cust-42", pseudonymSecret: secret, order: order() });
    const stored = listOrders("acme", "shopify-test")[0];
    expect(stored.customerRef).toMatch(/^cust_[a-f0-9]{24}$/);
    expect(JSON.stringify(stored)).not.toContain("cust-42");
  });
  it("upserts out-of-order deliveries instead of duplicating", () => {
    dir();
    upsertOrder("acme", order({ status: "paid" }));
    upsertOrder("acme", order({ status: "fulfilled" }));
    const stored = listOrders("acme", "shopify-test");
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe("fulfilled");
  });
  it("never lets tenant A read tenant B orders", () => {
    dir();
    upsertOrder("acme", order());
    upsertOrder("other", order({ id: "shopify-test:2002", number: "2002" }));
    expect(listOrders("acme", "shopify-test").map((o) => o.number)).toEqual(["1001"]);
    expect(listOrders("other", "shopify-test").map((o) => o.number)).toEqual(["2002"]);
  });
});

describe("webhook security (§6.4, §10)", () => {
  it("verifies HMAC-SHA256 on the raw body and rejects a forged signature", () => {
    const body = JSON.stringify({ id: 1001, name: "#1001" });
    const mac = createHmac("sha256", "whs").update(body).digest("base64");
    expect(verifyHmac(body, "whs", mac)).toBe(true);
    expect(verifyHmac(body + " ", "whs", mac)).toBe(false);
    expect(verifyHmac(body, "wrong-secret", mac)).toBe(false);
  });
  it("claims an event exactly once (idempotence key)", () => {
    dir();
    expect(claimWebhookEvent("acme", "shopify:evt-9")).toBe(true);
    expect(claimWebhookEvent("acme", "shopify:evt-9")).toBe(false);
  });
  it("seals connector credentials with AES-256-GCM and binds them to their tenant context", () => {
    const key = randomBytes(32);
    const sealed = sealSecret(key, "acme:shop.myshopify.com:credentials", "shpat_xxx");
    expect(sealed.c).not.toContain("shpat_xxx");
    expect(openSecret(key, "acme:shop.myshopify.com:credentials", sealed)).toBe("shpat_xxx");
    expect(() => openSecret(key, "other:shop.myshopify.com:credentials", sealed)).toThrow(/authentification|authentication/i);
    expect(() => decodeEcommerceKey("short")).toThrow();
  });
});

describe("attribution (US-04, §9)", () => {
  it("maps AI referrers and UTMs to engines with high confidence", () => {
    const chatgpt = attributeOrder({ referrer: "https://chatgpt.com/" });
    expect(chatgpt).toMatchObject({ channel: "ai_assistant", engine: "chatgpt", method: "referrer", confidence: "high" });
    const perplexity = attributeOrder({ utmSource: "perplexity" });
    expect(perplexity).toMatchObject({ channel: "ai_assistant", engine: "perplexity", method: "utm", confidence: "high" });
    const grok = attributeOrder({ utmSource: "xai" });
    expect(grok).toMatchObject({ channel: "ai_assistant", engine: "grok" });
    const claude = attributeOrder({ referrer: "https://claude.ai/chat" });
    expect(claude).toMatchObject({ channel: "ai_assistant", engine: "claude" });
    const bingChat = attributeOrder({ referrer: "https://www.bing.com/chat?q=x" });
    expect(bingChat).toMatchObject({ channel: "ai_assistant", engine: "copilot" });
  });
  it("classifies classic channels without inventing signals", () => {
    expect(attributeOrder({ utmSource: "newsletter", utmMedium: "email" })).toMatchObject({ channel: "email", method: "utm" });
    expect(attributeOrder({ utmSource: "google", utmMedium: "cpc" })).toMatchObject({ channel: "paid" });
    expect(attributeOrder({ referrer: "https://t.co/abc" })).toMatchObject({ channel: "social" });
    expect(attributeOrder({ referrer: "https://www.google.com/search" })).toMatchObject({ channel: "organic" });
    expect(attributeOrder({})).toMatchObject({ channel: "direct", confidence: "low" });
  });
  it("keeps masked referrers as unknown, never silently reclassified", () => {
    const masked = attributeOrder({ referrer: null, landingPage: "https://shop.fr/products/a", ga4SessionId: null });
    expect(masked.channel).toBe("unknown");
    expect(masked.confidence).toBe("low");
  });
  it("filters crawler user-agents out of session traffic", () => {
    expect(isLikelyCrawler("Mozilla/5.0 (compatible; GPTBot/1.0)")).toBe(true);
    expect(isLikelyCrawler("Mozilla/5.0 (Windows NT 10.0) Chrome/120")).toBe(false);
  });
  it("derives a stable pseudonym that never leaks the source id", () => {
    const first = pseudonym("acme", "shopify-cust:123", secret);
    expect(pseudonym("acme", "shopify-cust:123", secret)).toBe(first);
    expect(pseudonym("other", "shopify-cust:123", secret)).not.toBe(first);
    expect(first).not.toContain("123");
  });
});

describe("Shopify mapping (§6)", () => {
  const gqlOrder = {
    id: "gid://shopify/Order/1001", name: "#1001", createdAt: "2026-11-01T10:00:00Z", updatedAt: "2026-11-01T10:05:00Z",
    currencyCode: "EUR", financialStatus: "paid", fulfillmentStatus: null, customer: { id: "gid://shopify/Customer/7" },
    landingSite: "/products/a?utm_source=chatgpt", referrerUrl: "https://chatgpt.com/",
    totalPriceSet: { shopMoney: { amount: "120.00" } }, subtotalPriceSet: { shopMoney: { amount: "100.00" } },
    totalTaxSet: { shopMoney: { amount: "8.33" } }, totalShippingPriceSet: { shopMoney: { amount: "10.00" } }, totalDiscountsSet: { shopMoney: { amount: "5.00" } },
    lineItems: { edges: [{ node: { id: "li1", name: "Produit A", quantity: 2, sku: "SKU-1", product: { id: "gid://shopify/Product/1" }, originalUnitPriceSet: { shopMoney: { amount: "50.00" } }, discountedTotalSet: { shopMoney: { amount: "100.00" } } } }] },
  };
  it("converts string money amounts and full order lifecycle", () => {
    const mapped = mapShopifyOrder("shop.myshopify.com", gqlOrder);
    expect(mapped).toMatchObject({ total: 120, subtotal: 100, tax: 8.33, shipping: 10, discount: 5, status: "paid", number: "1001" });
    expect(mapped.lines[0]).toMatchObject({ quantity: 2, unitPrice: 50, total: 100 });
    expect(mapped.id).toBe(shopifyOrderId("gid://shopify/Order/1001"));
  });
  it("verifies webhook HMAC exactly like Shopify does (raw body, base64)", async () => {
    const provider = new ShopifyProvider({ shopDomain: "shop.myshopify.com", accessToken: "x", webhookSecret: "whs" });
    const body = JSON.stringify({ id: 1001 });
    const mac = createHmac("sha256", "whs").update(body).digest("base64");
    expect(provider.verifyWebhook({ "x-shopify-hmac-sha256": mac }, body)).toBe(true);
    expect(provider.verifyWebhook({ "x-shopify-hmac-sha256": mac }, body + "x")).toBe(false);
  });
  it("parses REST-shaped webhook payloads into canonical orders", async () => {
    const provider = new ShopifyProvider({ shopDomain: "shop.myshopify.com", accessToken: "x", webhookSecret: "whs" });
    const parsed = await provider.parseWebhook(JSON.stringify({ id: 1001, name: "#1001", financial_status: "paid", total_price: "89.90", currency: "EUR", line_items: [{ product_id: 1, sku: "S1", name: "A", quantity: 1, price: "89.90" }], customer: { id: 7 } })) as Order;
    expect(parsed).toMatchObject({ number: "1001", total: 89.9, status: "paid" });
    expect(parsed.lines[0].productId).toBe("shopify:Product/1");
  });
});

describe("PrestaShop mapping (§7)", () => {
  it("indexes orders by provider id and keeps tax-inclusive totals", async () => {
    expect(prestashopOrderId(42)).toBe("prestashop:42");
  });
  it("rejects a non-https shop URL unless explicitly allowed", () => {
    expect(() => new PrestaShopProvider({ shopUrl: "http://boutique.fr", apiKey: "A".repeat(32) })).toThrow(/https/);
    process.env.PRESTASHOP_ALLOW_HTTP = "true";
    expect(() => new PrestaShopProvider({ shopUrl: "http://boutique.fr", apiKey: "A".repeat(32) })).not.toThrow();
  });
  it("verifies the module's HMAC signature", async () => {
    const provider = new PrestaShopProvider({ shopUrl: "https://boutique.fr", apiKey: "A".repeat(32), webhookSecret: "whs" });
    const body = JSON.stringify({ resource: "order", order: { id: 42 } });
    const mac = createHmac("sha256", "whs").update(body).digest("hex");
    expect(provider.verifyWebhook({ "x-gtm-hmac-sha256": mac }, body)).toBe(true);
    expect(provider.verifyWebhook({ "x-gtm-hmac-sha256": mac }, "tampered")).toBe(false);
  });
  it("sends JSON requests with Basic auth and never the key in the URL", async () => {
    const transport = vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ prestashop: { products: [] } }) }) as unknown as Response);
    const provider = new PrestaShopProvider({ shopUrl: "https://boutique.fr", apiKey: "K".repeat(32), fetch: transport as unknown as typeof fetch });
    await provider.listProducts(null, 10);
    const [url, init] = transport.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("output_format=JSON");
    expect(url).not.toContain("K".repeat(32));
    expect(String(init.headers?.Authorization)).toMatch(/^Basic /);
  });
});

describe("feed readiness (US-07)", () => {
  const product = (overrides: Partial<Product> = {}): Product => ({
    id: "shopify:1", storeId: "s", sku: "SKU-1", gtin: "1234567890123", title: "Produit A", url: "https://shop.fr/p/a",
    imageUrl: "https://shop.fr/img/a.jpg", price: 49.9, compareAtPrice: null, currency: "EUR", availability: "in_stock",
    category: "vetements", updatedAt: "2026-11-01T00:00:00Z", ...overrides,
  });
  it("scores complete products 100 and lists missing fields", () => {
    const report = buildFeedReport([product(), product({ id: "shopify:2", gtin: null, sku: null, imageUrl: null })]);
    expect(report.products).toBe(2);
    expect(report.readyCount).toBe(1);
    const missing = new Map(report.missingFieldCounts.map((m) => [m.field, m.products]));
    expect(missing.get("gtin")).toBe(1);
    expect(missing.get("image_link")).toBe(1);
  });
  it("exports missing fields as CSV", () => {
    const csv = feedCsv(buildFeedReport([product({ gtin: null })]));
    expect(csv.split("\n")[0]).toContain("\"missing\"");
    expect(csv.split("\n")[1]).toContain("gtin");
  });
});

describe("commerce console routes", () => {
  const ctx = (body: Record<string, unknown>, tenant = "acme") => ({ url: "", body, tenancy: { tenant: { id: tenant } } }) as unknown as HandlerContext;
  it("connect (mocked transport), dashboard, products and orders flow end to end", async () => {
    vi.stubEnv("ECOMMERCE_STORE_PATH", dir());
    process.env.ECOMMERCE_DATA_KEY_B64 = randomBytes(32).toString("base64");
    const shopifyTransport = vi.fn(async () => ({ ok: true, json: async () => ({ data: { shop: { name: "Shop", myshopifyDomain: "shop.myshopify.com", currencyCode: "EUR", ianaTimezone: "Europe/Paris" }, shopifyAppInstallation: { accessTokenScopes: [{ handle: "read_products" }, { handle: "read_orders" }] } } }) }) as unknown as Response);
    vi.stubGlobal("fetch", shopifyTransport);
    const connect = commerceRoutes.find((r) => r.path === "/commerce/connect")!;
    const connected = await connect.handler(ctx({ provider: "shopify", domain: "shop.myshopify.com", accessToken: "shpat_test" })) as { store: { id: string; status: string } };
    expect(connected.store.status).toBe("connected");
    // Credentials sealed, never returned in clear.
    const raw = JSON.stringify(listConnections("acme"));
    expect(raw).toContain("credentialsSealed");
    expect(raw).not.toContain("shpat_test");
    // Dashboard sees orders ingested through the normalized path.
    ingestOrder({ tenantId: "acme", provider: "shopify", storeId: connected.store.id, eventId: "w-1", customerId: "c1", pseudonymSecret: secret, order: order({ id: `${connected.store.id}:1001`, storeId: connected.store.id }), signals: { referrer: "https://chatgpt.com/" } });
    const dashboard = commerceRoutes.find((r) => r.path === "/commerce/dashboard")!;
    const result = await dashboard.handler(ctx({ days: 30 })) as { revenueByChannel: Array<{ channel: string; revenue: number }>; aiRevenueShare: number };
    expect(result.revenueByChannel.find((r) => r.channel === "ai_assistant")?.revenue).toBe(120);
    expect(result.aiRevenueShare).toBe(100);
  });
  it("rejects an invalid provider or missing credentials", async () => {
    vi.stubEnv("ECOMMERCE_STORE_PATH", dir());
    process.env.ECOMMERCE_DATA_KEY_B64 = randomBytes(32).toString("base64");
    const connect = commerceRoutes.find((r) => r.path === "/commerce/connect")!;
    await expect(connect.handler(ctx({ provider: "amazon", domain: "x" }))).rejects.toThrow(/shopify ou prestashop/);
    await expect(connect.handler(ctx({ provider: "shopify", domain: "shop.myshopify.com" }))).rejects.toThrow(/Jeton/);
  });
});
