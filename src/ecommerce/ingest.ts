/**
 * Single normalized ingestion path for both providers: signature verification
 * (handled by the route), idempotency, upsert and attribution. A webhook replay
 * (same event id) or an out-of-order delivery never duplicates an order.
 */
import { attributeOrder, pseudonym, type AttributionSignals } from "./attribute.js";
import { claimWebhookEvent, upsertOrder, upsertProducts, writeCursor } from "./store.js";
import type { Order, Product, ProviderId } from "./types.js";

export interface IngestOrderInput {
  tenantId: string;
  provider: ProviderId;
  storeId: string;
  eventId: string;
  /** Provider customer id — pseudonymized at the boundary, never stored raw. */
  customerId: string | null;
  pseudonymSecret: Buffer;
  order: Omit<Order, "id" | "customerRef" | "attribution"> & { id?: string };
  signals?: AttributionSignals;
}

export interface IngestResult { inserted: boolean; duplicate: boolean; orderId: string }

export function ingestOrder(input: IngestOrderInput): IngestResult {
  const { tenantId, provider, storeId, eventId } = input;
  if (!claimWebhookEvent(tenantId, `${provider}:${eventId}`)) return { inserted: false, duplicate: true, orderId: input.order.id ?? `${storeId}:${input.order.number}` };
  const attribution = attributeOrder(input.signals ?? {});
  const order: Order = {
    ...input.order,
    id: input.order.id ?? `${storeId}:${input.order.number}`,
    customerRef: input.customerId ? pseudonym(tenantId, input.customerId, input.pseudonymSecret) : null,
    attribution,
  };
  const result = upsertOrder(tenantId, order);
  writeCursor(tenantId, { storeId, resource: "orders", cursor: order.createdAt, lastSyncedAt: new Date().toISOString(), status: "idle" });
  return { inserted: result.inserted, duplicate: false, orderId: order.id };
}

export interface IngestProductsInput {
  tenantId: string;
  storeId: string;
  eventId: string;
  provider: ProviderId;
  products: Product[];
}

/** Catalogue upsert — same idempotent event claim as orders. */
export function ingestProducts(input: IngestProductsInput): { upserted: number; duplicate: boolean } {
  const { tenantId, storeId, eventId, provider } = input;
  if (!claimWebhookEvent(tenantId, `${provider}:${eventId}`)) return { upserted: 0, duplicate: true };
  if (input.products.length) upsertProducts(tenantId, input.products);
  writeCursor(tenantId, { storeId, resource: "products", cursor: input.products.at(-1)?.updatedAt ?? new Date().toISOString(), lastSyncedAt: new Date().toISOString(), status: "idle" });
  return { upserted: input.products.length, duplicate: false };
}
