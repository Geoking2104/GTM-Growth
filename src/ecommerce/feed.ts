/**
 * Feed readiness (US-07): checks the fields expected by shopping surfaces
 * (Google Merchant, conversational agents) on the synchronized catalogue.
 * Deterministic, local, no external call.
 */
import type { Product } from "./types.js";

export const FEED_FIELDS = ["id", "title", "description", "link", "image_link", "availability", "price", "brand", "gtin"] as const;
export type FeedField = (typeof FEED_FIELDS)[number];

export interface FeedRow {
  id: string;
  title: string;
  url: string;
  imageUrl: string | null;
  availability: string;
  price: number | null;
  sku: string | null;
  gtin: string | null;
  category: string | null;
  missing: FeedField[];
  completeness: number;
}

/** Product → shopping-feed row with missing-field detection. */
export function feedRow(product: Product): FeedRow {
  const missing: FeedField[] = [];
  if (!product.id) missing.push("id");
  if (!product.title?.trim()) missing.push("title");
  // description: canonical products carry title only; category acts as a fallback signal.
  if (!product.url) missing.push("link");
  if (!product.imageUrl) missing.push("image_link");
  if (product.availability === "unknown") missing.push("availability");
  if (!product.price || product.price <= 0) missing.push("price");
  if (!product.sku) missing.push("brand");
  if (!product.gtin) missing.push("gtin");
  const filled = FEED_FIELDS.length - missing.length;
  return {
    id: product.id, title: product.title, url: product.url, imageUrl: product.imageUrl,
    availability: product.availability, price: product.price > 0 ? product.price : null,
    sku: product.sku, gtin: product.gtin, category: product.category,
    missing, completeness: Math.round((filled / FEED_FIELDS.length) * 100),
  };
}

export interface FeedReport {
  products: number;
  averageCompleteness: number;
  readyCount: number;
  missingFieldCounts: Array<{ field: FeedField; products: number }>;
  rows: FeedRow[];
}

export function buildFeedReport(products: Product[]): FeedReport {
  const rows = products.map(feedRow);
  const counts = new Map<FeedField, number>();
  for (const row of rows) for (const field of row.missing) counts.set(field, (counts.get(field) ?? 0) + 1);
  return {
    products: rows.length,
    averageCompleteness: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.completeness, 0) / rows.length) : 0,
    readyCount: rows.filter((row) => !row.missing.length).length,
    missingFieldCounts: [...counts.entries()].map(([field, products]) => ({ field, products })).sort((a, b) => b.products - a.products),
    rows,
  };
}

/** CSV export of missing fields per product (US-07 export). */
export function feedCsv(report: FeedReport): string {
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [["id", "title", "url", "completeness", "missing"].map(escape).join(",")];
  for (const row of report.rows) lines.push([row.id, row.title, row.url, `${row.completeness}%`, row.missing.join("|")].map(escape).join(","));
  return lines.join("\n");
}
