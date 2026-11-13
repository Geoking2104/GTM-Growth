/**
 * Public webhook endpoints for the e-commerce connectors: /webhooks/shopify and
 * /webhooks/prestashop. HMAC-SHA256 verification on the raw body, tenant
 * resolution from the shop domain, idempotent ingestion, fast 200 (< 5 s).
 * Invalid signature → silent 200 + log (no oracle for attackers).
 */
import { randomUUID } from "node:crypto";
import express, { type Request, type Response, type Router } from "express";
import { logger } from "../utils/logger.js";
import { openSecret, decodeEcommerceKey } from "../ecommerce/secrets.js";
import { listConnections, type StoreConnection } from "../ecommerce/store.js";
import { ingestOrder, ingestProducts } from "../ecommerce/ingest.js";
import { ShopifyProvider } from "../ecommerce/providers/shopify/client.js";
import { PrestaShopProvider } from "../ecommerce/providers/prestashop/client.js";
import type { Order, Product, ProviderId } from "../ecommerce/types.js";
import { TenantStore } from "../tenants/store.js";

/** Lazy tenant registry: opened on first webhook, shared afterwards. */
let tenants: TenantStore | null = null;
function tenantStore(): TenantStore {
  if (!tenants) tenants = new TenantStore();
  return tenants;
}

/** All tenant connections — used only to route a webhook to its tenant. */
function allConnections(): Array<{ tenantId: string; connections: StoreConnection[] }> {
  return tenantStore().list().map((tenant) => ({ tenantId: tenant.id, connections: listConnections(tenant.id) }));
}

function tenantForDomain(domain: string): { tenantId: string; connection: StoreConnection } | null {
  if (!domain) return null;
  const normalized = domain.toLowerCase();
  for (const { tenantId, connections } of allConnections()) {
    const connection = connections.find((c) => c.domain?.toLowerCase() === normalized || c.id.toLowerCase() === normalized);
    if (connection) return { tenantId, connection };
  }
  return null;
}

function webhookSecretFor(tenantId: string, connection: StoreConnection): string | null {
  if (!connection.webhookSecretSealed) return null;
  try { return openSecret(decodeEcommerceKey(process.env.ECOMMERCE_DATA_KEY_B64), `${tenantId}:${connection.id}:webhook`, JSON.parse(connection.webhookSecretSealed)); } catch { return null; }
}

function providerFor(tenantId: string, connection: StoreConnection): { verifyWebhook: (headers: Record<string, string>, rawBody: string) => boolean; parseWebhook: (rawBody: string) => Promise<Order | Product | null> } {
  const webhookSecret = webhookSecretFor(tenantId, connection) ?? undefined;
  if (connection.provider === "shopify") {
    const provider = new ShopifyProvider({ shopDomain: connection.domain, accessToken: "webhook-only", webhookSecret });
    return { verifyWebhook: (h, b) => provider.verifyWebhook(h, b), parseWebhook: (b) => provider.parseWebhook(b) };
  }
  const provider = new PrestaShopProvider({ shopUrl: `https://${connection.domain}`, apiKey: "0".repeat(16), webhookSecret });
  return { verifyWebhook: (h, b) => provider.verifyWebhook(h, b), parseWebhook: (b) => provider.parseWebhook(b) };
}

function ingestWebhookOrder(tenantId: string, connection: StoreConnection, eventId: string, order: Order): void {
  const key = decodeEcommerceKey(process.env.ECOMMERCE_DATA_KEY_B64);
  ingestOrder({
    tenantId, provider: connection.provider, storeId: connection.id, eventId,
    customerId: order.customerRef, pseudonymSecret: key, order,
    signals: { referrer: order.attribution.referrer, landingPage: order.attribution.landingPage },
  });
}

export function ecommerceWebhookRouter(): Router {
  const router = express.Router();

  router.post("/shopify", express.raw({ type: "*/*", limit: "1mb" }), async (req: Request, res: Response) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body ?? "");
    const domain = String(req.headers["x-shopify-shop-domain"] ?? "");
    const topic = String(req.headers["x-shopify-topic"] ?? "");
    const eventId = String(req.headers["x-shopify-webhook-id"] ?? randomUUID());
    try {
      const match = tenantForDomain(domain);
      if (!match) { logger.info(`[webhook:shopify] boutique inconnue : ${domain}`); return void res.status(200).end(); }
      const { verifyWebhook, parseWebhook } = providerFor(match.tenantId, match.connection);
      if (!verifyWebhook(req.headers as Record<string, string>, rawBody)) {
        logger.info(`[webhook:shopify] signature invalide pour ${domain}`);
        return void res.status(200).end(); // silent reject, logged
      }
      if (topic.includes("products")) {
        const product = await parseWebhook(rawBody) as Product | null;
        if (product) ingestProducts({ tenantId: match.tenantId, storeId: match.connection.id, eventId, provider: "shopify", products: [{ ...product, storeId: match.connection.id }] });
      } else if (topic.includes("orders") || topic.includes("refunds")) {
        const order = await parseWebhook(rawBody) as Order | null;
        if (order) ingestWebhookOrder(match.tenantId, match.connection, eventId, { ...order, storeId: match.connection.id });
      } else if (topic === "app/uninstalled") {
        logger.info(`[webhook:shopify] app désinstallée pour ${domain} — jeton révoqué`);
      } else if (topic.startsWith("customers/") || topic === "shop/redact") {
        logger.info(`[webhook:shopify] sujet de conformité ${topic} reçu pour ${domain}`);
      }
      return void res.status(200).end();
    } catch (error) {
      logger.info(`[webhook:shopify] erreur : ${(error as Error).message}`);
      return void res.status(200).end();
    }
  });

  router.post("/prestashop", express.raw({ type: "*/*", limit: "1mb" }), async (req: Request, res: Response) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body ?? "");
    try {
      const event = JSON.parse(rawBody) as { shop_domain?: string; resource?: string; event_id?: string };
      const domain = String(event.shop_domain ?? req.headers["x-gtm-shop-domain"] ?? "");
      const match = tenantForDomain(domain);
      if (!match) { logger.info(`[webhook:prestashop] boutique inconnue : ${domain}`); return void res.status(200).end(); }
      const { verifyWebhook, parseWebhook } = providerFor(match.tenantId, match.connection);
      if (!verifyWebhook(req.headers as Record<string, string>, rawBody)) {
        logger.info(`[webhook:prestashop] signature invalide pour ${domain}`);
        return void res.status(200).end();
      }
      const eventId = event.event_id ?? String(req.headers["x-gtm-event-id"] ?? randomUUID());
      if (event.resource === "product") {
        const product = await parseWebhook(rawBody) as Product | null;
        if (product) ingestProducts({ tenantId: match.tenantId, storeId: match.connection.id, eventId, provider: "prestashop", products: [{ ...product, storeId: match.connection.id }] });
      } else if (event.resource === "order") {
        const order = await parseWebhook(rawBody) as Order | null;
        if (order) ingestWebhookOrder(match.tenantId, match.connection, eventId, { ...order, storeId: match.connection.id });
      }
      return void res.status(200).end();
    } catch (error) {
      logger.info(`[webhook:prestashop] erreur : ${(error as Error).message}`);
      return void res.status(200).end();
    }
  });

  return router;
}
