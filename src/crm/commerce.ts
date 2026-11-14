/** Durable, idempotent projection. No provider API is called when viewing a journey. */
import {
  listConnections,
  listOrders,
  queueCrmOrder,
  pendingCrmOrders,
  acknowledgeCrmOrder,
  getConnection,
} from "../ecommerce/store.js";
import type { Order } from "../ecommerce/types.js";
import type { Tenant } from "../tenants/store.js";
import { eventInput, iso, hash } from "./model.js";
import { transaction, settings, identityKey, one, audit } from "./store.js";
import { record, commerceKey } from "./service.js";
export function drainCommerce(tenant: Tenant, seed = false) {
  if (!settings(tenant.id).enabled)
    return { imported: 0, failed: 0, disabled: true };
  let seeded = 0,
    legacySkipped = 0;
  if (seed)
    for (const store of listConnections(tenant.id).slice(0, 20))
      for (const order of listOrders(tenant.id, store.id, 100)) {
        if (
          order.customerRef &&
          !/^cust_[a-f0-9]{24}$/.test(order.customerRef)
        ) {
          legacySkipped++;
          continue;
        }
        queueCrmOrder(tenant.id, { ...order, provider: store.provider });
        seeded++;
      }
  let imported = 0,
    failed = 0;
  const pending = pendingCrmOrders(tenant.id, 250);
  for (const row of pending) {
    try {
      const order = JSON.parse(row.payload) as Order,
        store = getConnection(tenant.id, order.storeId);
      if (!store) {
        acknowledgeCrmOrder(tenant.id, row.id);
        continue;
      }
      const provider = order.provider ?? store.provider;
      if (!["shopify", "prestashop"].includes(provider))
        throw new Error("CRM_INVALID_PROVIDER");
      const source = provider + ":" + store.id,
        subject = order.customerRef
          ? {
              key: commerceKey(tenant.id, store.id, order.customerRef),
              kind: provider + "_customer",
              scope: store.id,
            }
          : {
              key: identityKey(tenant.id, "event_only", source, order.id),
              kind: "event_only",
              scope: source,
            };
      const sourceTime = iso.safeParse(order.updatedAt),
        creation = iso.safeParse(order.createdAt);
      const numeric = order.id.match(/(?:Order\/|prestashop:)(\d+)$/)?.[1];
      const sourceUrl =
        provider === "shopify" && numeric
          ? "https://" + store.domain + "/admin/orders/" + numeric
          : undefined;
      transaction(tenant.id, () => {
        const creationId = hash([store.id, order.id, "created"]);
        if (
          !one(
            "SELECT payload FROM crm_events WHERE tenant=? AND source=? AND event_key=?",
            tenant.id,
            source,
            creationId,
          )
        )
          record(
            tenant.id,
            source,
            eventInput.parse({
              eventId: creationId,
              channel: provider,
              type: "order_created",
              occurredAt: creation.success ? creation.data : row.observed_at,
              timeBasis: creation.success ? "source" : "observed",
              summary: "Order " + order.number,
              sourceUrl,
              proof: { reference: "Connected store order creation record" },
              details: { orderNumber: order.number },
            }),
            "commerce_observed",
            subject,
          );
        record(
          tenant.id,
          source,
          eventInput.parse({
            eventId: row.id,
            channel: provider,
            type: "order_status",
            occurredAt: sourceTime.success ? sourceTime.data : row.observed_at,
            timeBasis: sourceTime.success ? "source" : "observed",
            summary: "Order " + order.number + " · " + order.status,
            sourceUrl,
            proof: {
              reference: "Committed order snapshot from connected store",
            },
            details: {
              orderNumber: order.number,
              orderStatus: order.status,
              amount: order.total,
              ...(/^[A-Z]{3}$/.test(order.currency)
                ? { currency: order.currency }
                : {}),
            },
          }),
          "commerce_observed",
          subject,
        );
      });
      acknowledgeCrmOrder(tenant.id, row.id);
      imported++;
    } catch {
      failed++;
    }
  }
  if (imported)
    audit(tenant.id, "commerce", "snapshots-imported", String(imported));
  return {
    imported,
    failed,
    seeded,
    legacySkipped,
    hasMore: pendingCrmOrders(tenant.id, 1).length > 0,
  };
}
