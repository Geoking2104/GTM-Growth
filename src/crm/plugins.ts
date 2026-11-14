import fs from "node:fs";
import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { TenantStore, validTenantId, type Tenant } from "../tenants/store.js";
import {
  id,
  identityInput,
  eventInput,
  contactInput,
  proofInput,
  hash,
  channels,
} from "./model.js";
import { transaction, idempotent, audit, database } from "./store.js";
import {
  upsertExternal,
  externalProfile,
  keyForInput,
  bind,
  recordFromPlugin,
  query,
  enabled,
} from "./service.js";
const permissions = [
  "contacts:write",
  "identities:write",
  "events:write",
  "timeline:read",
] as const;
export const pluginSchema = z
  .object({
    tenant: z.string().refine(validTenantId),
    id: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),
    name: z.string().min(2).max(100),
    permissions: z.array(z.enum(permissions)).max(4),
    channels: z.array(z.enum(channels)).max(5),
    identifiers: z
      .array(z.object({ kind: identityInput.shape.kind, scope: id }).strict())
      .max(50),
    recordHosts: z.array(z.string().max(250)).max(30).default([]),
    requestsPerHour: z.number().int().min(1).max(10000).default(300),
  })
  .strict();
export type Plugin = z.infer<typeof pluginSchema>;
const configSchema = z.record(z.string().regex(/^[a-f0-9]{64}$/), pluginSchema);
function configs() {
  if (!process.env.CRM_PLUGINS_FILE) return {};
  try {
    return configSchema.parse(
      JSON.parse(fs.readFileSync(process.env.CRM_PLUGINS_FILE, "utf8")),
    );
  } catch {
    throw new Error("CRM_PLUGIN_UNAVAILABLE");
  }
}
export function capabilities(tenant: string) {
  try {
    return {
      configured: true,
      plugins: Object.values(configs())
        .filter((p) => p.tenant === tenant)
        .map((p) => ({
          id: p.id,
          name: p.name,
          permissions: p.permissions,
          channels: p.channels,
          identifiers: p.identifiers,
        })),
    };
  } catch {
    return { configured: false, plugins: [] };
  }
}
function permit(config: Plugin, permission: (typeof permissions)[number]) {
  if (!config.permissions.includes(permission))
    throw new Error("CRM_PLUGIN_PERMISSION");
}
function host(config: Plugin, url?: string) {
  if (url && !config.recordHosts.includes(new URL(url).hostname))
    throw new Error("CRM_SOURCE_SCOPE");
}
function identityAllowed(
  config: Plugin,
  identity: z.infer<typeof identityInput>,
) {
  if (
    !config.identifiers.some(
      (i) => i.kind === identity.kind && i.scope === identity.scope,
    )
  )
    throw new Error("CRM_SOURCE_SCOPE");
}
function quota(config: Plugin) {
  database().exec(
    "CREATE TABLE IF NOT EXISTS crm_plugin_quota(tenant TEXT NOT NULL,source TEXT NOT NULL,hour INTEGER NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(tenant,source))",
  );
  const hour = Math.floor(Date.now() / 3600000);
  transaction(config.tenant, () => {
    const row = database()
      .prepare(
        "SELECT hour,count FROM crm_plugin_quota WHERE tenant=? AND source=?",
      )
      .get(config.tenant, config.id) as
      | { hour: number; count: number }
      | undefined;
    const count = row?.hour === hour ? row.count + 1 : 1;
    if (count > config.requestsPerHour) throw new Error("CRM_RATE_LIMIT");
    database()
      .prepare(
        "INSERT INTO crm_plugin_quota VALUES (?,?,?,?) ON CONFLICT(tenant,source) DO UPDATE SET hour=excluded.hour,count=excluded.count",
      )
      .run(config.tenant, config.id, hour, count);
  });
}
export function pluginOperation(
  tenant: Tenant,
  config: Plugin,
  operation: string,
  raw: unknown,
) {
  enabled(tenant.id);
  if (tenant.id !== config.tenant || tenant.status !== "active")
    throw new Error("CRM_ACCESS");
  const actor = "plugin:" + config.id;
  if (operation === "contacts") {
    permit(config, "contacts:write");
    const i = z
      .object({
        key: z.string(),
        externalId: identityInput.shape.value,
        contact: contactInput,
      })
      .strict()
      .parse(raw);
    host(config, i.contact.externalUrl);
    return idempotent(
      tenant.id,
      actor,
      i.key,
      ["contact", hash(i.externalId), i.contact],
      () => upsertExternal(tenant, config.id, i.externalId, i.contact, actor),
    );
  }
  if (operation === "identify") {
    permit(config, "identities:write");
    const i = z
      .object({
        key: z.string(),
        externalId: identityInput.shape.value,
        identity: identityInput,
        proof: proofInput,
      })
      .strict()
      .parse(raw);
    identityAllowed(config, i.identity);
    host(config, i.proof.url);
    const key = keyForInput(tenant, i.identity);
    return idempotent(
      tenant.id,
      actor,
      i.key,
      ["identify", hash(i.externalId), key, i.proof],
      () => ({
        bindingId: bind(
          tenant.id,
          externalProfile(tenant, config.id, i.externalId),
          key,
          i.identity.kind,
          i.identity.scope,
          i.proof,
          actor,
          "source_asserted",
        ).id,
      }),
    );
  }
  if (operation === "events") {
    permit(config, "events:write");
    const i = z
      .object({
        events: z.array(eventInput).min(1).max(100),
        authorization: z.string().trim().min(5).max(500),
      })
      .strict()
      .parse(raw);
    for (const event of i.events) {
      if (!config.channels.includes(event.channel))
        throw new Error("CRM_SOURCE_SCOPE");
      if (event.identity) identityAllowed(config, event.identity);
      host(config, event.sourceUrl);
      host(config, event.proof.url);
      host(config, event.details.pageUrl);
      host(config, event.details.productUrl);
    }
    return transaction(tenant.id, () => {
      const results = i.events.map((e) =>
        recordFromPlugin(tenant, config.id, e, i.authorization),
      );
      audit(tenant.id, actor, "event-batch", String(results.length));
      return { results };
    });
  }
  if (operation === "timeline") {
    permit(config, "timeline:read");
    const i = z
      .object({
        externalId: identityInput.shape.value,
        channel: z.enum(["all", ...channels]).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        cursor: z.object({ at: z.string(), id }).optional(),
      })
      .strict()
      .parse(raw);
    return query(tenant.id, {
      profileId: externalProfile(tenant, config.id, i.externalId),
      channel: i.channel,
      from: i.from,
      to: i.to,
      cursor: i.cursor,
    });
  }
  throw new Error("CRM_NOT_FOUND");
}
export function crmPluginRouter() {
  const router = Router();
  router.post("/:operation", (req, res) => {
    try {
      const token = req
        .header("Authorization")
        ?.match(/^Bearer ([a-zA-Z0-9_-]{32,256})$/)?.[1];
      if (!token) return res.status(401).json({ error: "CRM_ACCESS" });
      const config =
        configs()[createHash("sha256").update(token).digest("hex")];
      if (!config) return res.status(403).json({ error: "CRM_ACCESS" });
      const tenant = new TenantStore().get(config.tenant);
      if (!tenant || tenant.status !== "active")
        return res.status(403).json({ error: "CRM_ACCESS" });
      if (Buffer.byteLength(JSON.stringify(req.body ?? {})) > 256000)
        return res.status(413).json({ error: "CRM_PAYLOAD_LIMIT" });
      quota(config);
      res.setHeader("Cache-Control", "no-store");
      return res.json(
        pluginOperation(tenant, config, req.params.operation, req.body),
      );
    } catch (error) {
      const code =
        error instanceof Error && /^CRM_[A-Z_]+$/.test(error.message)
          ? error.message
          : "CRM_INVALID";
      return res
        .status(
          code.includes("CONFLICT")
            ? 409
            : code === "CRM_RATE_LIMIT"
              ? 429
              : code.includes("PERMISSION") || code === "CRM_SOURCE_SCOPE"
                ? 403
                : 400,
        )
        .json({ error: code });
    }
  });
  return router;
}
