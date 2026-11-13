/**
 * Canonical e-commerce model shared by the Shopify and PrestaShop connectors.
 * One ingestion path for both platforms: providers only map into these types.
 *
 * Privacy: no customer name, e-mail, phone or address is ever stored. Only a
 * stable pseudonym (`customerRef`, keyed HMAC of the provider customer id).
 */

export type ProviderId = "shopify" | "prestashop";

export type Channel =
  | "organic" | "paid" | "direct" | "email" | "social"
  | "ai_assistant" | "referral" | "unknown";

export type AiEngine =
  | "chatgpt" | "claude" | "perplexity" | "copilot" | "gemini" | "grok" | "other";

export type OrderStatus =
  | "pending" | "paid" | "fulfilled" | "cancelled" | "refunded" | "partial_refund";

export type Availability = "in_stock" | "out_of_stock" | "preorder" | "unknown";

export interface Store {
  id: string;                 // tenant id
  provider: ProviderId;
  domain: string;             // boutique.myshopify.com | www.exemple.fr
  currency: string;
  timezone: string;
  connectedAt: string;
  status: "connected" | "insufficient_scopes" | "error";
}

export interface Product {
  /** Prefixed provider id, e.g. "shopify:gid://shopify/Product/123" or "prestashop:42". */
  id: string;
  storeId: string;
  sku: string | null;
  gtin: string | null;
  title: string;
  url: string;
  imageUrl: string | null;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  availability: Availability;
  category: string | null;
  updatedAt: string;
}

export interface OrderLine {
  productId: string | null;
  sku: string | null;
  title: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Attribution {
  channel: Channel;
  engine: AiEngine | null;
  referrer: string | null;
  landingPage: string | null;
  utm: { source?: string; medium?: string; campaign?: string };
  method: "webhook" | "utm" | "referrer" | "ga4_join" | "manual" | "none";
  confidence: "high" | "medium" | "low";
  firstTouch: boolean;
  windowDays: number;
}

export interface Order {
  id: string;
  storeId: string;
  /** Provider order number — never the customer name. */
  number: string;
  createdAt: string;
  currency: string;
  total: number;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  status: OrderStatus;
  lines: OrderLine[];
  /** Stable pseudonym — never the e-mail. */
  customerRef: string | null;
  attribution: Attribution;
  source: "web" | "mobile" | "pos" | "marketplace" | "unknown";
}

export interface SyncCursor {
  storeId: string;
  resource: "products" | "orders";
  cursor: string | null;      // GraphQL cursor | PrestaShop date_upd bound
  lastSyncedAt: string;
  status: "idle" | "running" | "failed";
  error?: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  /** Quota consumed, when the provider exposes it (Shopify cost points). */
  cost?: { used: number; available: number };
}

export interface ConnectInput {
  provider: ProviderId;
  /** Shopify shop domain or PrestaShop root URL. */
  endpoint: string;
  accessToken?: string;
  webhookSecret?: string;
  /** PrestaShop webservice key. */
  apiKey?: string;
}

export interface EcommerceProvider {
  readonly id: ProviderId;
  /** Verifies access rights and returns the store identity. */
  connect(input: ConnectInput): Promise<Store>;
  listProducts(cursor: string | null, limit: number): Promise<Page<Product>>;
  listOrders(cursor: string | null, limit: number): Promise<Page<Order>>;
  /** Validates the webhook signature against the raw body. */
  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean;
  /** Normalizes a verified webhook payload into canonical types. */
  parseWebhook(rawBody: string): Promise<Order | Product | null>;
}
