import { createHmac } from "node:crypto";
import type { ProviderId } from "./types.js";
export function canonicalCustomer(provider: ProviderId, raw: string) {
  const value = raw
    .replace(/^(shopify|prestashop)-cust:/, "")
    .replace(/^gid:\/\/shopify\/Customer\//, "");
  if (!value || value.length > 240)
    throw new Error("Invalid customer identity");
  return value;
}
export function scopedCustomerRef(
  tenant: string,
  store: string,
  provider: ProviderId,
  raw: string,
  key: Buffer,
) {
  return (
    "cust_" +
    createHmac("sha256", key)
      .update(
        JSON.stringify([
          tenant,
          store,
          provider,
          canonicalCustomer(provider, raw),
        ]),
      )
      .digest("hex")
      .slice(0, 24)
  );
}
