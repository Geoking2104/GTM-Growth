/**
 * PrestaShop connector â€” webservice /api/ (JSON via output_format=JSON, Basic
 * auth with the key as user and an empty password). Covers 1.7, 8.x and 9.x;
 * the new Admin API (9+, OAuth2) is a later addition. One concurrent request
 * per shop, incremental sync through date_upd filters.
 */
import { money, providerFetch, verifyHmac, header } from "../provider.js";
import type { ConnectInput, EcommerceProvider, Order, OrderLine, OrderStatus, Page, Product, Store } from "../../types.js";

const USER_AGENT = "gtm-growth/1.0 (+https://gtm.kayroslab.com)";

/** Standard order state ids (map confirmed through order_states at connect). */
const DEFAULT_STATE_MAP: Record<string, OrderStatus> = {
  "1": "pending", "2": "paid", "3": "fulfilled", "4": "fulfilled", "5": "fulfilled",
  "6": "cancelled", "7": "refunded", "8": "partial_refund", "9": "refunded", "10": "unknown" as OrderStatus, "11": "paid", "12": "pending",
};

export const prestashopProductKey = (id: string | number) => `prestashop:${id}`;
export const prestashopOrderId = (id: string | number) => `prestashop:${id}`;

export interface PrestaShopClientOptions {
  shopUrl: string;        // https://www.exemple.fr (or with /prestashop subfolder)
  apiKey: string;
  webhookSecret?: string;
  fetch?: typeof fetch;
  /** Multistore: restrict calls to one shop. */
  idShop?: number;
}

export class PrestaShopProvider implements EcommerceProvider {
  readonly id = "prestashop" as const;
  private readonly options: PrestaShopClientOptions;
  private readonly transport: typeof fetch;
  private orderStates: Record<string, { name: string; status: OrderStatus }> = {};

  constructor(options: PrestaShopClientOptions) {
    const url = new URL(/^https?:\/\//.test(options.shopUrl) ? options.shopUrl : `https://${options.shopUrl}`);
    if (url.protocol !== "https:" && process.env.PRESTASHOP_ALLOW_HTTP !== "true") throw new Error("Lâ€™URL PrestaShop doit Ãªtre en https.");
    if (!/^[A-Za-z0-9]{16,64}$/.test(options.apiKey)) throw new Error("ClÃ© webservice PrestaShop invalide.");
    url.hash = ""; url.search = "";
    this.options = { ...options, shopUrl: url.origin + url.pathname.replace(/\/$/, "") };
    this.transport = options.fetch ?? providerFetch as unknown as typeof fetch;
  }

  private apiUrl(resource: string, params: Record<string, string> = {}): string {
    const url = new URL(`${this.options.shopUrl}/api/${resource}`);
    url.searchParams.set("output_format", "JSON");
    if (this.options.idShop) url.searchParams.set("id_shop", String(this.options.idShop));
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url.toString();
  }

  private async request<T>(resource: string, params: Record<string, string> = {}): Promise<T> {
    // Basic auth with the key as user and an empty password â€” never the key in the URL.
    const basic = Buffer.from(`${this.options.apiKey}:`, "utf8").toString("base64");
    const response = await this.transport(this.apiUrl(resource, params), {
      headers: { Authorization: `Basic ${basic}`, Accept: "application/json", "User-Agent": USER_AGENT },
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error(`PrestaShop ${response.status} : clÃ© sans droit sur Â« ${resource} Â».`);
      throw new Error(`PrestaShop HTTP ${response.status} sur ${resource}.`);
    }
    const text = await response.text();
    try { return JSON.parse(text) as T; } catch { throw new Error(`PrestaShop a renvoyÃ© du XML sur ${resource} (output_format=JSON attendu).`); }
  }

  private async loadOrderStates(): Promise<void> {
    if (Object.keys(this.orderStates).length) return;
    const raw = await this.request<{ order_states?: Array<{ id: string; name: string; delivered?: string; paid?: string; canceled?: string }> }>("order_states", { display: "[id,name]" });
    for (const state of raw.order_states ?? []) {
      this.orderStates[state.id] = { name: state.name, status: DEFAULT_STATE_MAP[state.id] ?? "unknown" };
    }
  }

  private statusOf(stateId: string | number | undefined): OrderStatus {
    if (stateId === undefined || stateId === null) return "unknown" as OrderStatus;
    return this.orderStates[String(stateId)]?.status ?? DEFAULT_STATE_MAP[String(stateId)] ?? "unknown" as OrderStatus;
  }

  async connect(_input: ConnectInput): Promise<Store> {
    // GET /api/ with the key: verifies auth + lists resource permissions.
    const basic = Buffer.from(`${this.options.apiKey}:`, "utf8").toString("base64");
    const base = new URL(`${this.options.shopUrl}/api/`);
    base.searchParams.set("output_format", "JSON");
    const response = await this.transport(base.toString(), { headers: { Authorization: `Basic ${basic}`, Accept: "application/json", "User-Agent": USER_AGENT } });
    if (response.status === 401) throw new Error("ClÃ© webservice refusÃ©e (401).");
    if (response.status === 403) throw new Error("ClÃ© webservice sans accÃ¨s (403) : vÃ©rifiez les permissions de la clÃ©.");
    if (!response.ok) throw new Error(`PrestaShop HTTP ${response.status} sur /api/.`);
    const text = await response.text();
    let resources: string[] = [];
    try { resources = Object.keys((JSON.parse(text) as { prestashop?: { resources?: Record<string, unknown> } }).prestashop?.resources ?? {}); } catch { /* XML listing is fine */ }
    const missing = ["products", "orders", "order_details"].filter((resource) => resources.length && !resources.includes(resource));
    const host = new URL(this.options.shopUrl).hostname;
    return {
      id: host, provider: "prestashop", domain: host, currency: "", timezone: "",
      connectedAt: new Date().toISOString(), status: missing.length ? "insufficient_scopes" : "connected",
    };
  }

  async listProducts(cursor: string | null, limit = 500): Promise<Page<Product>> {
    const params: Record<string, string> = { display: "full", limit: `0,${Math.min(limit, 500)}`, sort: "id_ASC" };
    if (cursor) { params.filter = `[date_upd]=[${cursor},NOW]`; params.date = "1"; }
    const raw = await this.request<{ prestashop?: { products?: Array<Record<string, any>> } }>("products", params);
    const items = (raw.prestashop?.products ?? []).map((node) => this.mapProduct(node));
    return { items, nextCursor: null };
  }

  private mapProduct(node: Record<string, any>): Product {
    const id = String(node.id ?? "");
    const association = node.associations?.combinations?.[0]?.id ?? null;
    return {
      id: prestashopProductKey(id), storeId: new URL(this.options.shopUrl).hostname,
      sku: node.reference || null, gtin: node.ean13 || node.upc || null, title: node.name ?? "",
      url: `${this.options.shopUrl}/index.php?controller=product&id_product=${id}`,
      imageUrl: node.id_default_image ? `${this.options.shopUrl}/api/images/products/${id}/${node.id_default_image}` : null,
      price: money(node.price), compareAtPrice: node.wholesale_price ? money(node.wholesale_price) : null,
      currency: "", availability: String(node.state ?? "") === "1" && Number(node.quantity ?? 0) > 0 ? "in_stock" : String(node.state ?? "") === "1" ? "out_of_stock" : "unknown",
      category: node.id_category_default ? String(node.id_category_default) : null,
      updatedAt: node.date_upd || node.date_add || new Date().toISOString(),
      ...(association ? {} : {}),
    };
  }

  async listOrders(cursor: string | null, limit = 500): Promise<Page<Order>> {
    await this.loadOrderStates();
    const params: Record<string, string> = { display: "full", limit: `0,${Math.min(limit, 500)}`, sort: "id_ASC" };
    if (cursor) { params.filter = `[date_upd]=[${cursor},NOW]`; params.date = "1"; }
    const raw = await this.request<{ prestashop?: { orders?: Array<Record<string, any>> } }>("orders", params);
    const items: Order[] = [];
    for (const node of raw.prestashop?.orders ?? []) {
      const details = await this.request<{ prestashop?: { order_details?: Array<Record<string, any>> } }>("order_details", { display: "full", "filter[id_order]": `[${node.id}]`, limit: "0,300" });
      items.push(this.mapOrder(node, details.prestashop?.order_details ?? []));
    }
    return { items, nextCursor: null };
  }

  private mapOrder(node: Record<string, any>, details: Array<Record<string, any>>): Order {
    const id = String(node.id ?? "");
    const lines: OrderLine[] = details.map((detail) => ({
      productId: detail.product_id ? prestashopProductKey(detail.product_id) : null,
      sku: detail.product_reference || null, title: detail.product_name ?? "",
      quantity: Number(detail.product_quantity ?? 1), unitPrice: money(detail.unit_price_tax_incl),
      total: money(detail.total_price_tax_incl),
    }));
    return {
      id: prestashopOrderId(id), storeId: new URL(this.options.shopUrl).hostname, number: node.reference ?? id,
      createdAt: node.date_add ?? new Date().toISOString(), currency: "", total: money(node.total_paid_tax_incl),
      subtotal: money(node.total_products_wt), discount: money(node.total_discounts), shipping: money(node.total_shipping_tax_incl ?? node.total_shipping),
      tax: money(money(node.total_paid_tax_incl) - money(node.total_paid_tax_ex)), status: this.statusOf(node.current_state),
      lines, customerRef: node.id_customer ? `prestashop-cust:${node.id_customer}` : null,
      attribution: { channel: "unknown", engine: null, referrer: null, landingPage: null, utm: {}, method: "none", confidence: "low", firstTouch: true, windowDays: 30 },
      source: "web",
    };
  }

  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean {
    return verifyHmac(rawBody, this.options.webhookSecret ?? "", header(headers, "X-Gtm-Hmac-Sha256") || header(headers, "X-Shopify-Hmac-Sha256") /* module reuses the header convention */);
  }

  async parseWebhook(rawBody: string): Promise<Order | Product | null> {
    const event = JSON.parse(rawBody) as { resource?: string; order?: Record<string, any>; product?: Record<string, any>; id_lang?: number };
    if (event.resource === "order" && event.order) return this.mapOrder(event.order, event.order.associations?.order_details ?? []);
    if (event.resource === "product" && event.product) return this.mapProduct(event.product);
    return null;
  }
}
