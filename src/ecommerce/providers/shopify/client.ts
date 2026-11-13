/**
 * Shopify connector â€” GraphQL Admin API (pinned version), HMAC webhooks,
 * cursor pagination, cost-aware throttling. v1 targets a custom app installed
 * by the merchant (no App Store review); the OAuth flow is structured so a
 * public app can reuse it later.
 */
import { money, providerFetch, verifyHmac, header } from "../provider.js";
import type { ConnectInput, EcommerceProvider, Order, OrderLine, OrderStatus, Page, Product, Store } from "../../types.js";

const GRAPHQL_VERSION = process.env.SHOPIFY_API_VERSION ?? "2026-01";
const REQUIRED_SCOPES = ["read_products", "read_orders"] as const;

interface ShopifyProductNode {
  id: string; title: string; handle: string; status: string; updatedAt: string;
  productType: string | null; onlineStoreUrl: string | null; featuredImage: { url: string } | null;
  variants: { edges: Array<{ node: { sku: string | null; barcode: string | null; price: string; compareAtPrice: string | null; availableForSale: boolean; inventoryPolicy: string } }> };
}

interface ShopifyOrderNode {
  id: string; name: string; createdAt: string; updatedAt: string; currencyCode: string; financialStatus: string; fulfillmentStatus: string | null;
  totalPriceSet: { shopMoney: { amount: string } }; subtotalPriceSet: { shopMoney: { amount: string } }; totalTaxSet: { shopMoney: { amount: string } };
  totalShippingPriceSet: { shopMoney: { amount: string } }; totalDiscountsSet: { shopMoney: { amount: string } };
  customer: { id: string } | null; landingSite: string | null; referrerUrl: string | null;
  lineItems: { edges: Array<{ node: { id: string; name: string; quantity: number; sku: string | null; product: { id: string } | null; originalUnitPriceSet: { shopMoney: { amount: string } }; discountedTotalSet: { shopMoney: { amount: string } } } }> };
}

const orderStatus = (financial: string, fulfillment: string | null | undefined): OrderStatus => {
  if (financial === "refunded") return "refunded";
  if (financial === "partially_refunded") return "partial_refund";
  if (financial === "voided") return "cancelled";
  if (fulfillment === "fulfilled") return "fulfilled";
  if (financial === "paid" || financial === "partially_paid") return "paid";
  return "pending";
};

export const shopifyOrderId = (gid: string) => `shopify:${gid}`;
export const shopifyProductKey = (gid: string) => `shopify:${gid.replace(/^gid:\/\/shopify\//, "")}`;

export function mapShopifyProduct(storeId: string, node: ShopifyProductNode): Product {
  const variant = node.variants.edges[0]?.node;
  return {
    id: shopifyProductKey(node.id), storeId, sku: variant?.sku ?? null, gtin: variant?.barcode ?? null,
    title: node.title, url: node.onlineStoreUrl ?? `https://${storeId}/products/${node.handle}`, imageUrl: node.featuredImage?.url ?? null,
    price: money(variant?.price ?? 0), compareAtPrice: variant?.compareAtPrice ? money(variant.compareAtPrice) : null,
    currency: "", availability: node.status === "active" ? (variant?.availableForSale ? "in_stock" : "out_of_stock") : "unknown",
    category: node.productType || null, updatedAt: node.updatedAt,
  };
}

export function mapShopifyOrder(storeId: string, node: ShopifyOrderNode): Order {
  const lines: OrderLine[] = node.lineItems.edges.map(({ node: item }) => ({
    productId: item.product ? shopifyProductKey(item.product.id) : null,
    sku: item.sku ?? null, title: item.name, quantity: item.quantity,
    unitPrice: money(item.originalUnitPriceSet.shopMoney.amount), total: money(item.discountedTotalSet.shopMoney.amount),
  }));
  return {
    id: shopifyOrderId(node.id), storeId, number: node.name.replace(/^#/, ""), createdAt: node.createdAt, currency: node.currencyCode,
    total: money(node.totalPriceSet.shopMoney.amount), subtotal: money(node.subtotalPriceSet.shopMoney.amount),
    discount: money(node.totalDiscountsSet.shopMoney.amount), shipping: money(node.totalShippingPriceSet.shopMoney.amount),
    tax: money(node.totalTaxSet.shopMoney.amount), status: orderStatus(node.financialStatus, node.fulfillmentStatus),
    lines, customerRef: node.customer ? `shopify-cust:${node.customer.id}` : null,
    attribution: { channel: "unknown", engine: null, referrer: node.referrerUrl ?? null, landingPage: node.landingSite ?? null, utm: {}, method: "none", confidence: "low", firstTouch: true, windowDays: 30 },
    source: "web",
  };
}

export interface ShopifyClientOptions {
  shopDomain: string;     // *.myshopify.com
  accessToken: string;
  webhookSecret?: string;
  fetch?: typeof fetch;
}

export class ShopifyProvider implements EcommerceProvider {
  readonly id = "shopify" as const;
  private readonly options: ShopifyClientOptions;
  private readonly transport: typeof fetch;

  constructor(options: ShopifyClientOptions) {
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(options.shopDomain)) throw new Error("Domaine Shopify invalide (attendu : boutique.myshopify.com).");
    this.options = options;
    this.transport = options.fetch ?? providerFetch as unknown as typeof fetch;
  }

  private async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const response = await this.transport(`https://${this.options.shopDomain}/admin/api/${GRAPHQL_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": this.options.accessToken },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new Error(`Shopify HTTP ${response.status}`);
    const body = (await response.json()) as { data?: T; errors?: Array<{ message: string }>; extensions?: { cost?: { throttleStatus?: { maximumAvailable: number; currentlyAvailable: number } } } };
    if (body.errors?.length) throw new Error(`Shopify: ${body.errors.map((e) => e.message).join("; ")}`);
    // Read the leaky-bucket status before a 429 ever happens.
    const bucket = body.extensions?.cost?.throttleStatus;
    if (bucket && bucket.currentlyAvailable < 100) await new Promise((resolve) => setTimeout(resolve, 500));
    return body.data as T;
  }

  async connect(_input: ConnectInput): Promise<Store> {
    const data = await this.graphql<{ shop: { name: string; myshopifyDomain: string; currencyCode: string; ianaTimezone: string } }>(`query { shop { name myshopifyDomain currencyCode ianaTimezone } }`);
    const scopes = (await this.graphql<{ shopifyAppInstallation?: { accessTokenScopes?: Array<{ handle: string }> } }>(`query { shopifyAppInstallation { accessTokenScopes { handle } } }`).catch(() => ({ shopifyAppInstallation: undefined }))).shopifyAppInstallation?.accessTokenScopes?.map((s) => s.handle) ?? [];
    const missing = REQUIRED_SCOPES.filter((scope) => !scopes.includes(scope));
    return {
      id: this.options.shopDomain, provider: "shopify", domain: data.shop.myshopifyDomain, currency: data.shop.currencyCode,
      timezone: data.shop.ianaTimezone, connectedAt: new Date().toISOString(),
      status: missing.length ? "insufficient_scopes" : "connected",
    };
  }

  async listProducts(cursor: string | null, limit = 100): Promise<Page<Product>> {
    const data = await this.graphql<{ products: { edges: Array<{ cursor: string; node: ShopifyProductNode }>; pageInfo: { hasNextPage: boolean } } }>(
      `query Products($after: String, $limit: Int!) { products(first: $limit, after: $after) { edges { cursor node { id title handle status updatedAt productType onlineStoreUrl featuredImage { url } variants(first: 1) { edges { node { sku barcode price compareAtPrice availableForSale } } } } } pageInfo { hasNextPage } } }`,
      { after: cursor, limit: Math.min(limit, 250) },
    );
    return {
      items: data.products.edges.map((edge) => mapShopifyProduct(this.options.shopDomain, edge.node)),
      nextCursor: data.products.pageInfo.hasNextPage ? data.products.edges.at(-1)?.cursor ?? null : null,
    };
  }

  async listOrders(cursor: string | null, limit = 100): Promise<Page<Order>> {
    const data = await this.graphql<{ orders: { edges: Array<{ cursor: string; node: ShopifyOrderNode }>; pageInfo: { hasNextPage: boolean } } }>(
      `query Orders($after: String, $limit: Int!) { orders(first: $limit, after: $after, sortKey: CREATED_AT) { edges { cursor node { id name createdAt updatedAt currencyCode financialStatus fulfillmentStatus customer { id } landingSite referrerUrl totalPriceSet { shopMoney { amount } } subtotalPriceSet { shopMoney { amount } } totalTaxSet { shopMoney { amount } } totalShippingPriceSet { shopMoney { amount } } totalDiscountsSet { shopMoney { amount } } lineItems(first: 50) { edges { node { id name quantity sku product { id } originalUnitPriceSet { shopMoney { amount } } discountedTotalSet { shopMoney { amount } } } } } } } pageInfo { hasNextPage } } }`,
      { after: cursor, limit: Math.min(limit, 250) },
    );
    return {
      items: data.orders.edges.map((edge) => mapShopifyOrder(this.options.shopDomain, edge.node)),
      nextCursor: data.orders.pageInfo.hasNextPage ? data.orders.edges.at(-1)?.cursor ?? null : null,
    };
  }

  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean {
    return verifyHmac(rawBody, this.options.webhookSecret ?? "", header(headers, "X-Shopify-Hmac-Sha256"));
  }

  async parseWebhook(rawBody: string): Promise<Order | Product | null> {
    const event = JSON.parse(rawBody) as Record<string, unknown>;
    if (typeof event.id !== "string" && typeof event.id !== "number") return null;
    if ("line_items" in event || "financial_status" in event) return this.mapRestOrder(event as unknown as Record<string, never>);
    if ("title" in event && "variants" in event) return this.mapRestProduct(event as unknown as Record<string, never>);
    return null;
  }

  /** Shopify REST-shaped webhook payloads (orders/create etc. are REST JSON). */
  private mapRestOrder(raw: any): Order {
    const lines: OrderLine[] = (raw.line_items ?? []).map((item: any) => ({
      productId: item.product_id ? shopifyProductKey(`gid://shopify/Product/${item.product_id}`) : null,
      sku: item.sku ?? null, title: item.name ?? item.title ?? "", quantity: item.quantity ?? 1,
      unitPrice: money(item.price), total: money(item.price) * (item.quantity ?? 1),
    }));
    return {
      id: shopifyOrderId(`gid://shopify/Order/${raw.id}`), storeId: this.options.shopDomain, number: String(raw.name ?? raw.order_number ?? raw.id).replace(/^#/, ""),
      createdAt: raw.created_at ?? new Date().toISOString(), currency: raw.currency ?? "",
      total: money(raw.total_price), subtotal: money(raw.subtotal_price), discount: money(raw.total_discounts),
      shipping: money(raw.total_shipping_price_set?.shop_money?.amount ?? raw.shipping_lines?.[0]?.price ?? 0), tax: money(raw.total_tax),
      status: orderStatus(raw.financial_status ?? "pending", raw.fulfillment_status ?? null),
      lines, customerRef: raw.customer?.id ? `shopify-cust:${raw.customer.id}` : null,
      attribution: { channel: "unknown", engine: null, referrer: raw.referrer_url ?? null, landingPage: raw.landing_site ?? null, utm: {}, method: "none", confidence: "low", firstTouch: true, windowDays: 30 },
      source: "web",
    };
  }

  private mapRestProduct(raw: any): Product {
    const variant = (raw.variants ?? [])[0];
    return {
      id: shopifyProductKey(`gid://shopify/Product/${raw.id}`), storeId: this.options.shopDomain,
      sku: variant?.sku ?? null, gtin: variant?.barcode ?? null, title: raw.title ?? "",
      url: `https://${this.options.shopDomain}/products/${raw.handle ?? raw.id}`, imageUrl: raw.image?.src ?? raw.featured_image ?? null,
      price: money(variant?.price), compareAtPrice: variant?.compare_at_price ? money(variant.compare_at_price) : null,
      currency: "", availability: raw.status === "active" ? "in_stock" : "unknown", category: raw.product_type || null,
      updatedAt: raw.updated_at ?? new Date().toISOString(),
    };
  }
}
