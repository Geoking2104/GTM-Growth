/**
 * E-commerce MCP tools: commerce_dashboard, commerce_orders, commerce_products,
 * ecommerce_feed_readiness. Read-only over the tenant-scoped connector store —
 * connection management stays in the console (credentials never transit MCP).
 */
import { z } from "zod";
import { strict } from "./schema.js";
import { success, fail } from "./response.js";
import { listConnections, listOrders, listProducts } from "../ecommerce/store.js";
import { buildFeedReport } from "../ecommerce/feed.js";
import type { Order } from "../ecommerce/types.js";

const TENANT = z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}$/);

function revenueByChannel(orders: Order[], days: number, now = Date.now()) {
  const since = now - days * 86400000;
  const rows = new Map<string, { channel: string; orders: number; revenue: number }>();
  for (const order of orders) {
    if (Date.parse(order.createdAt) < since) continue;
    if (order.status === "cancelled" || order.status === "refunded") continue;
    const row = rows.get(order.attribution.channel) ?? { channel: order.attribution.channel, orders: 0, revenue: 0 };
    row.orders += 1; row.revenue += order.total;
    rows.set(order.attribution.channel, row);
  }
  return [...rows.values()].sort((a, b) => b.revenue - a.revenue);
}

export const ecommerceTools = [
  {
    name: "commerce_dashboard",
    description: "E-commerce dashboard for a connected Shopify/PrestaShop store: revenue by acquisition channel (including AI assistants), attributed share and per-engine detail over the last N days. Read-only, tenant-scoped.",
    schema: strict({ tenantId: TENANT, days: z.number().int().min(7).max(90).optional() }),
    handler: async (args: any) => {
      try {
        const stores = listConnections(args.tenantId);
        const orders = stores.flatMap((store) => listOrders(args.tenantId, store.id, 1000));
        const days = args.days ?? 30;
        const byChannel = revenueByChannel(orders, days);
        const total = byChannel.reduce((sum, row) => sum + row.revenue, 0);
        const ai = byChannel.filter((row) => row.channel === "ai_assistant").reduce((sum, row) => sum + row.revenue, 0);
        const engines = new Map<string, { engine: string; orders: number; revenue: number }>();
        for (const order of orders) {
          if (order.attribution.channel !== "ai_assistant" || !order.attribution.engine) continue;
          if (Date.parse(order.createdAt) < Date.now() - days * 86400000) continue;
          const row = engines.get(order.attribution.engine) ?? { engine: order.attribution.engine, orders: 0, revenue: 0 };
          row.orders += 1; row.revenue += order.total;
          engines.set(order.attribution.engine, row);
        }
        return success({
          stores: stores.map((s) => ({ id: s.id, provider: s.provider, domain: s.domain, status: s.status })),
          days,
          revenueByChannel: byChannel,
          aiRevenue: Math.round(ai * 100) / 100,
          aiRevenueShare: total > 0 ? Math.round((ai / total) * 100) : 0,
          engines: [...engines.values()].sort((a, b) => b.revenue - a.revenue),
          note: "Attribution déterministe : UTM > referrer > jointure GA4. Les commandes inconnues restent unknown.",
        });
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "commerce_orders",
    description: "Recent orders from connected e-commerce stores with their attribution (channel, engine, method, confidence). Pseudonymized: no customer name, e-mail or address is ever returned.",
    schema: strict({ tenantId: TENANT, storeId: z.string().optional(), limit: z.number().int().min(1).max(500).optional() }),
    handler: async (args: any) => {
      try {
        const stores = args.storeId ? listConnections(args.tenantId).filter((s) => s.id === args.storeId) : listConnections(args.tenantId);
        const orders = stores.flatMap((store) => listOrders(args.tenantId, store.id, args.limit ?? 50));
        return success({
          orders: orders.slice(0, args.limit ?? 50).map((order) => ({
            number: order.number, createdAt: order.createdAt, status: order.status, total: order.total, currency: order.currency,
            channel: order.attribution.channel, engine: order.attribution.engine ?? null, method: order.attribution.method, confidence: order.attribution.confidence,
          })),
        });
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "commerce_products",
    description: "Catalogue synced from connected Shopify/PrestaShop stores: title, url, price, availability, sku/gtin — the basis for product-page GEO audits and feed readiness.",
    schema: strict({ tenantId: TENANT, storeId: z.string().optional(), limit: z.number().int().min(1).max(500).optional() }),
    handler: async (args: any) => {
      try {
        const stores = args.storeId ? listConnections(args.tenantId).filter((s) => s.id === args.storeId) : listConnections(args.tenantId);
        const products = stores.flatMap((store) => listProducts(args.tenantId, store.id));
        return success({ products: products.slice(0, args.limit ?? 100) });
      } catch (err) { return fail(err); }
    },
  },
  {
    name: "ecommerce_feed_readiness",
    description: "Feed readiness report (Google Merchant / conversational agents): id, title, description, link, image_link, availability, price, brand, gtin — with missing-field counts per product.",
    schema: strict({ tenantId: TENANT, storeId: z.string().optional() }),
    handler: async (args: any) => {
      try {
        const stores = args.storeId ? listConnections(args.tenantId).filter((s) => s.id === args.storeId) : listConnections(args.tenantId);
        const products = stores.flatMap((store) => listProducts(args.tenantId, store.id));
        const report = buildFeedReport(products);
        return success({
          feed: { products: report.products, averageCompleteness: report.averageCompleteness, ready: report.readyCount, missing: report.missingFieldCounts },
          worst: [...report.rows].sort((a, b) => a.completeness - b.completeness).slice(0, 20),
        });
      } catch ( err) { return fail(err); }
    },
  },
];
