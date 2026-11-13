/** Shared provider contract helpers: webhook signature verification (HMAC
 * SHA-256 over the raw body), event id extraction and bounded client fetch. */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Constant-time HMAC-SHA256 comparison over the raw request body. */
export function verifyHmac(rawBody: string | Buffer, secret: string, receivedHexOrBase64: string): boolean {
  if (!secret || !receivedHexOrBase64) return false;
  const digest = createHmac("sha256", Buffer.from(secret, "utf8")).update(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody).digest();
  const received = /^[a-f0-9]+$/i.test(receivedHexOrBase64) ? Buffer.from(receivedHexOrBase64, "hex") : Buffer.from(receivedHexOrBase64, "base64");
  return received.length === digest.length && timingSafeEqual(received, digest);
}

export const header = (headers: Record<string, string>, name: string): string => {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) if (key.toLowerCase() === target) return value;
  return "";
};

/** Bounded fetch with exponential backoff for provider APIs (no 429 loops). */
export async function providerFetch(url: string, init: RequestInit & { timeoutMs?: number } = {}, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 15000);
      try {
        return await fetch(url, { ...init, signal: controller.signal });
      } finally { clearTimeout(timeout); }
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 500));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Provider request failed");
}

/** Parse a money-ish value (Shopify sends strings, PrestaShop sends strings of floats). */
export const money = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
