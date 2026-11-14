import { createHmac, randomUUID } from "node:crypto";
import { slackIdentity, type Principal } from "./access.ts";
type Read = { journey?: { url: string; productId?: string; brand?: string; category?: string; audience?: string; goal?: string; contextConfirmed?: boolean; competitors?: Array<{ url: string; productId: string; comparable: boolean }> }; operation: "catalog" | "definition" | "query" | "context" | "journey"; model?: string; days?: number; source?: string; locale?: string };
export async function readGtm(auth: Principal, input: Read, signal?: AbortSignal) {
  const identity = slackIdentity(auth); if (!identity) throw new Error("Access denied");
  const url = new URL(process.env.GTM_AGENT_BRIDGE_URL ?? "");
  const secret = process.env.GTM_AGENT_BRIDGE_SECRET ?? "";
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || secret.length < 32) throw new Error("Agent bridge not configured");
  // Input cannot set tenant IDs, identity, credentials, bridge endpoints or arbitrary tool names. Public page URLs are validated by the core.
  const body = JSON.stringify({ ...input, ...identity });
  const timestamp = String(Math.floor(Date.now() / 1000)), nonce = randomUUID();
  const signature = createHmac("sha256", secret).update(`v1:${timestamp}:${nonce}:`).update(body).digest("hex");
  try {
    const response = await fetch(url, { method: "POST", redirect: "error", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(40000)]) : AbortSignal.timeout(40000),
      headers: { "Content-Type": "application/json", "X-GTM-Timestamp": timestamp, "X-GTM-Nonce": nonce, "X-GTM-Signature": signature }, body });
    if (!response.ok) throw new Error("Unavailable");
    // Bounded streaming read; never return backend errors verbatim to Slack.
    const reader = response.body?.getReader(); if (!reader) throw new Error("Unavailable");
    const chunks: Uint8Array[] = []; let bytes = 0;
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 65536) { await reader.cancel(); throw new Error("Too large"); } chunks.push(value); } }
    finally { reader.releaseLock(); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch { throw new Error("GTM data is unavailable. Check access or retry later; no result was obtained."); }
}
