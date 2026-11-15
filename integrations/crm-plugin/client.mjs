/** Node 20+ server-side reference client. Never ship this token to a browser. */
import { randomUUID } from "node:crypto";
export function createCrmPlugin({
  baseUrl,
  token,
  fetch: transport = globalThis.fetch,
}) {
  const base = new URL(baseUrl);
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error("CRM requires a clean HTTPS base URL");
  if (!/^[a-zA-Z0-9_-]{32,256}$/.test(token))
    throw new Error("Invalid CRM plugin token");
  async function send(operation, body) {
    const encoded = JSON.stringify(body);
    if (Buffer.byteLength(encoded) > 256000)
      throw new Error("CRM_PAYLOAD_LIMIT");
    const response = await transport(
      new URL("/api/integrations/crm/" + operation, base),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: encoded,
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.body) throw new Error("CRM_EMPTY_RESPONSE");
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 2000000) {
          await reader.cancel();
          throw new Error("CRM_RESPONSE_LIMIT");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    let result;
    try {
      result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new Error("CRM_INVALID_RESPONSE");
    }
    if (!response.ok)
      throw new Error(
        /^CRM_[A-Z_]+$/.test(result.error)
          ? result.error
          : "CRM_HTTP_" + response.status,
      );
    return result;
  }
  return Object.freeze({
    upsertContact: ({ key = randomUUID(), externalId, contact }) =>
      send("contacts", { key, externalId, contact }),
    identify: ({ key = randomUUID(), externalId, identity, proof }) =>
      send("identify", { key, externalId, identity, proof }),
    events: (events, authorization) =>
      send("events", { events, authorization }),
    timeline: (query) => send("timeline", query),
  });
}
