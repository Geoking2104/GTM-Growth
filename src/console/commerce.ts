/** Console routes for the e-commerce connectors (Shopify & PrestaShop):
 * connect/disconnect, catalogue & order backfill, commerce dashboard with
 * attribution, product-page GEO audit and feed readiness. Tenant-scoped,
 * admin-gated for writes, credentials sealed at rest. */
import { randomUUID } from "node:crypto";
import type { ConsoleRoute, HandlerContext } from "../console/util.js";
import { str, num } from "../console/util.js";
import { decodeEcommerceKey, openSecret, sealSecret } from "../ecommerce/secrets.js";
import {
  listConnections, saveConnection, removeConnection, getConnection, publicStore,
  listProducts, listOrders, upsertProducts, upsertOrder, readCursor, writeCursor,
} from "../ecommerce/store.js";
import { attributeOrder } from "../ecommerce/attribute.js";
import { ShopifyProvider, shopifyOrderId } from "../ecommerce/providers/shopify/client.js";
import { PrestaShopProvider, prestashopOrderId } from "../ecommerce/providers/prestashop/client.js";
import { buildFeedReport } from "../ecommerce/feed.js";
import type { Order, Product, ProviderId } from "../ecommerce/types.js";

const PROVIDERS: ProviderId[] = ["shopify", "prestashop"];
const nowIso = () => new Date().toISOString();

function tenantOf(ctx: HandlerContext): string {
  if (!ctx.tenancy?.tenant) throw new Error("SÃ©lectionnez un tenant.");
  return ctx.tenancy.tenant.id;
}

function dataKey(): Buffer {
  return decodeEcommerceKey(process.env.ECOMMERCE_DATA_KEY_B64);
}

function providerFromConnection(input: { provider: ProviderId; domain: string; credentialsSealed: string; webhookSecretSealed: string | null }, tenantId: string): ShopifyProvider | PrestaShopProvider {
  const key = dataKey();
  const credential = openSecret(key, `${tenantId}:${input.domain}:credentials`, JSON.parse(input.credentialsSealed));
  const webhookSecret = input.webhookSecretSealed ? openSecret(key, `${tenantId}:${input.domain}:webhook`, JSON.parse(input.webhookSecretSealed)) : undefined;
  if (input.provider === "shopify") return new ShopifyProvider({ shopDomain: input.domain, accessToken: credential, webhookSecret });
  return new PrestaShopProvider({ shopUrl: `https://${input.domain}`, apiKey: credential, webhookSecret });
}

/* ---------------- connection management ---------------- */

export const commerceConnectionRoutes: ConsoleRoute[] = [
  {
    path: "/commerce/connect", needsUrl: false, adminOnly: true,
    handler: async (ctx) => {
      const tenantId = tenantOf(ctx);
      const provider = str(ctx.body.provider);
      if (!provider || !PROVIDERS.includes(provider as ProviderId)) throw new Error("provider requis : shopify ou prestashop.");
      const domain = str(ctx.body.domain)?.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
      if (!domain) throw new Error("Domaine de boutique requis.");
      const accessToken = str(ctx.body.accessToken);
      const apiKey = str(ctx.body.apiKey);
      const webhookSecret = str(ctx.body.webhookSecret);
      if (provider === "shopify" && !accessToken) throw new Error("Jeton dâ€™accÃ¨s Admin API requis (custom app).");
      if (provider === "prestashop" && !apiKey) throw new Error("ClÃ© webservice requise.");
      const credential = provider === "shopify" ? accessToken! : apiKey!;
      const key = dataKey();
      const storeId = provider === "shopify" ? domain : new URL(`https://${domain}`).hostname;
      const provider_ = provider === "shopify"
        ? new ShopifyProvider({ shopDomain: domain, accessToken: credential, webhookSecret })
        : new PrestaShopProvider({ shopUrl: `https://${domain}`, apiKey: credential, webhookSecret });
      const identity = await provider_.connect({ provider: provider as ProviderId, endpoint: domain, accessToken, apiKey });
      const existing = listConnections(tenantId).find((c) => c.id === storeId);
      const connection = {
        id: storeId, provider: provider as ProviderId, domain: identity.domain,
        currency: identity.currency, timezone: identity.timezone,
        connectedAt: existing?.connectedAt ?? nowIso(), status: identity.status,
        scopes: [],
        credentialsSealed: JSON.stringify(sealSecret(key, `${tenantId}:${storeId}:credentials`, credential)),
        webhookSecretSealed: webhookSecret ? JSON.stringify(sealSecret(key, `${tenantId}:${storeId}:webhook`, webhookSecret)) : null,
      };
      saveConnection(tenantId, connection);
      return { store: publicStore(connection), note: identity.status === "insufficient_scopes" ? "ConnectÃ©, mais des droits sont manquants (read_products / read_orders, ou ressources webservice products/orders)." : undefined };
    },
  },
  {
    path: "/commerce/stores", needsUrl: false,
    handler: async (ctx) => ({ stores: listConnections(tenantOf(ctx)).map(publicStore) }),
  },
  {
    path: "/commerce/disconnect", needsUrl: false, adminOnly: true,
    handler: async (ctx) => {
      const tenantId = tenantOf(ctx);
      const storeId = str(ctx.body.storeId);
      if (!storeId) throw new Error("storeId requis.");
      if (!removeConnection(tenantId, storeId)) throw new Error("Boutique introuvable.");
      return { disconnected: true };
    },
  },
];

/* ---------------- backfill ---------------- */

export const commerceBackfillRoutes: ConsoleRoute[] = [
  {
    path: "/commerce/sync/products", needsUrl: false, adminOnly: true,
    handler: async (ctx) => {
      const tenantId = tenantOf(ctx);
      const storeId = str(ctx.body.storeId);
      if (!storeId) throw new Error("storeId requis.");
      const connection = getConnection(tenantId, storeId);
      if (!connection) throw new Error("Boutique introuvable.");
      const provider = providerFromConnection(connection, tenantId);
      const cursor = readCursor(tenantId, "products");
      writeCursor(tenantId, { storeId, resource: "products", cursor: cursor?.cursor ?? null, lastSyncedAt: nowIso(), status: "running" });
      try {
        let page = await provider.listProducts(cursor?.cursor ?? null, 250);
        upsertProducts(tenantId, page.items);
        writeCursor(tenantId, { storeId, resource: "products", cursor: page.nextCursor, lastSyncedAt: nowIso(), status: "idle" });
        return { imported: page.items.length, nextCursor: page.nextCursor, done: page.nextCursor === null };
      } catch (error) {
        writeCursor(tenantId, { storeId, resource: "products", cursor: cursor?.cursor ?? null, lastSyncedAt: nowIso(), status: "failed", error: (error as Error).message });
        throw error;
      }
    },
  },
  {
    path: "/commerce/sync/orders", needsUrl: false, adminOnly: true,
    handler: async (ctx) => {
      const tenantId = tenantOf(ctx);
      const storeId = str(ctx.body.storeId);
      if (!storeId) throw new Error("storeId requis.");
      const connection = getConnection(tenantId, storeId);
      if (!connection) throw new Error("Boutique introuvable.");
      const provider = providerFromConnection(connection, tenantId);
      const cursor = readCursor(tenantId, "orders");
      writeCursor(tenantId, { storeId, resource: "orders", cursor: cursor?.cursor ?? null, lastSyncedAt: nowIso(), status: "running" });
      try {
        const page = await provider.listOrders(cursor?.cursor ?? null, 250);
        for (const order of page.items) upsertOrder(tenantId, order);
        writeCursor(tenantId, { storeId, resource: "orders", cursor: page.nextCursor, lastSyncedAt: nowIso(), status: "idle" });
        return { imported: page.items.length, nextCursor: page.nextCursor, done: page.nextCursor === null };
      } catch (error) {
        writeCursor(tenantId, { storeId, resource: "orders", cursor: cursor?.cursor ?? null, lastSyncedAt: nowIso(), status: "failed", error: (error as Error).message });
        throw error;
      }
    },
  },
];

/* ---------------- dashboard ---------------- */

const revenueByChannel = (orders: Order[], days: number, now = Date.now()) => {
  const since = now - days * 86400000;
  const rows = new Map<string, { channel: string; orders: number; revenue: number }>();
  for (const order of orders) {
    if (Date.parse(order.createdAt) < since) continue;
    if (order.status === "cancelled" || order.status === "refunded") continue;
    const channel = order.attribution.channel;
    const row = rows.get(channel) ?? { channel, orders: 0, revenue: 0 };
    row.orders += 1;
    row.revenue += order.total;
    rows.set(channel, row);
  }
  return [...rows.values()].sort((a, b) => b.revenue - a.revenue);
};

const aiRevenueShare = (byChannel: Array<{ channel: string; revenue: number }>): number => {
  const total = byChannel.reduce((sum, row) => sum + row.revenue, 0);
  const ai = byChannel.filter((row) => row.channel === "ai_assistant").reduce((sum, row) => sum + row.revenue, 0);
  return total > 0 ? Math.round((ai / total) * 100) : 0;
};

export const commerceDashboardRoutes: ConsoleRoute[] = [
  {
    path: "/commerce/dashboard", needsUrl: false,
    handler: async (ctx) => {
      const tenantId = tenantOf(ctx);
      const days = num(ctx.body.days, 30, 7, 90);
      const connections = listConnections(tenantId);
      const stores: Array<Record<string, unknown>> = [];
      let allOrders: Order[] = [];
      for (const connection of connections) {
        const orders = listOrders(tenantId, connection.id, 1000);
        allOrders = allOrders.concat(orders);
        stores.push({ ...publicStore(connection), orders: orders.length });
      }
      const byChannel = revenueByChannel(allOrders, days);
      const attributed = allOrders.filter((o) => o.attribution.channel !== "unknown").length;
      return {
        stores, days,
        revenueByChannel: byChannel,
        aiRevenueShare: aiRevenueShare(byChannel),
        attributedShare: allOrders.length ? Math.round((attributed / allOrders.length) * 100) : 0,
        note: "Attribution dÃ©terministe et affichÃ©e : UTM, puis referrer, puis jointure GA4. Jamais de reclassement silencieux des commandes inconnues.",
      };
    },
  },
  {
    path: "/commerce/orders", needsUrl: false,
    handler: async (ctx) => {
      const tenantId = tenantOf(ctx);
      const storeId = str(ctx.body.storeId);
      const orders = storeId ? listOrders(tenantId, storeId, num(ctx.body.limit, 100, 1, 500)) : listConnections(tenantId).flatMap((c) => listOrders(tenantId, c.id, 100));
      return {
        orders: orders.map((order) => ({
          number: order.number, createdAt: order.createdAt, status: order.status, total: order.total, currency: order.currency,
          channel: order.attribution.channel, engine: order.attribution.engine, method: order.attribution.method, confidence: order.attribution.confidence,
          lines: order.lines.length, storeId: order.storeId,
        })),
      };
    },
  },
  {
    path: "/commerce/products", needsUrl: false,
    handler: async (ctx) => {
      const tenantId = tenantOf(ctx);
      const storeId = str(ctx.body.storeId);
      const connections = storeId ? [getConnection(tenantId, storeId)].filter(Boolean) : listConnections(tenantId);
      const products = connections.flatMap((c) => listProducts(tenantId, c!.id));
      return { products: products.slice(0, 500) };
    },
  },
  {
    path: "/commerce/feed/readiness", needsUrl: false,
    handler: async (ctx) => {
      const tenantId = tenantOf(ctx);
      const storeId = str(ctx.body.storeId);
      const connections = storeId ? [getConnection(tenantId, storeId)].filter(Boolean) : listConnections(tenantId);
      const products = connections.flatMap((c) => listProducts(tenantId, c!.id));
      const report = buildFeedReport(products);
      return { feed: { products: report.products, averageCompleteness: report.averageCompleteness, ready: report.readyCount, missing: report.missingFieldCounts }, rows: report.rows.slice(0, 200) };
    },
  },
];

/** All commerce routes, mounted by allConsoleRoutes(). */
export const commerceRoutes: ConsoleRoute[] = [...commerceConnectionRoutes, ...commerceBackfillRoutes, ...commerceDashboardRoutes];
