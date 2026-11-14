/** Eve authenticates Slack; this bridge independently binds that principal to one tenant. */
import express from "express";
import fs from "node:fs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { TenantStore, validTenantId } from "../tenants/store.js";
import { claimNonce, profileSchema } from "./profile.js";
import { readJourneyPage } from "../console/journey.js";
import { tenantOwnsUrl } from "../tenants/store.js";
import { buildJourneyPreview } from "../../site/console/customer-journey-model.js";
import { catalog, nextActions, querySchema, readModel } from "./service.js";

const id = z.string().regex(/^[A-Z][A-Z0-9]{1,80}$/);
export const bindingSchema = z.object({
  tenantId: z.string().refine(validTenantId), teamId: id,
  channelIds: z.array(id).min(1).max(50), userIds: z.array(id).min(1).max(100),
  secretEnv: z.string().regex(/^GTM_AGENT_SECRET_[A-Z0-9_]{1,60}$/),
  profile: profileSchema.default({}),
}).strict();
export type AgentBinding = z.infer<typeof bindingSchema>;
export function loadBindings(env = process.env): AgentBinding[] {
  if (!env.GTM_DATA_AGENT_BINDINGS_FILE) return [];
  const bindings = z.array(bindingSchema).max(100).parse(JSON.parse(fs.readFileSync(env.GTM_DATA_AGENT_BINDINGS_FILE, "utf8")));
  const channels = new Set<string>(); const secrets = new Set<string>();
  for (const binding of bindings) {
    // A shared key could impersonate a different installation; each binding gets its own.
    const secret = env[binding.secretEnv];
    if (!secret || secret.length < 32 || secrets.has(secret)) throw new Error("Invalid data agent binding secret");
    secrets.add(secret);
    for (const channel of binding.channelIds) {
      const key = `${binding.teamId}:${channel}`;
      if (channels.has(key)) throw new Error("Ambiguous data agent channel binding"); channels.add(key);
    }
  }
  return bindings;
}
const requestSchema = z.object({
  teamId: id, channelId: id, userId: id,
  operation: z.enum(["catalog", "definition", "query", "context", "journey"]),
  journey: z.object({
    url: z.string().url().max(2048), productId: z.string().max(50).optional(),
    brand: z.string().max(70).optional(), category: z.string().max(100).optional(),
    audience: z.string().max(100).optional(), goal: z.string().max(100).optional(),
    contextConfirmed: z.boolean().default(false),
    competitors: z.array(z.object({ url: z.string().url().max(2048), productId: z.string().max(50), comparable: z.boolean() }).strict()).max(2).default([]),
  }).strict().optional(),
  model: querySchema.shape.model.optional(), days: querySchema.shape.days.optional(),
  source: querySchema.shape.source, locale: querySchema.shape.locale,
}).strict();
export function bridgeSignature(secret: string, timestamp: string, nonce: string, raw: Buffer | string) {
  return createHmac("sha256", secret).update(`v1:${timestamp}:${nonce}:`).update(raw).digest("hex");
}
export function buildDataAgentBridge(options: { store?: TenantStore; env?: NodeJS.ProcessEnv } = {}) {
  const env = options.env ?? process.env; const store = options.store ?? new TenantStore(); const router = express.Router();
  // Mount before express.json in the HTTP server. Only signed, bounded payloads reach JSON parsing.
  router.post("/read", express.raw({ type: "application/json", limit: "16kb" }), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const bindings = loadBindings(env); if (!bindings.length) return res.status(503).json({ error: "Agent bridge not configured" });
      const raw: unknown = req.body;
      const ts = req.header("X-GTM-Timestamp") ?? "", nonce = req.header("X-GTM-Nonce") ?? "", signature = req.header("X-GTM-Signature") ?? "";
      const now = Math.floor(Date.now() / 1000);
      if (!Buffer.isBuffer(raw) || !/^\d{10}$/.test(ts) || Math.abs(now - Number(ts)) > 300 || !/^[a-f0-9-]{32,64}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) return res.status(401).json({ error: "Invalid agent authentication" });
      const input = requestSchema.parse(JSON.parse(raw.toString("utf8")));
      const binding = bindings.find(b => b.teamId === input.teamId && b.channelIds.includes(input.channelId) && b.userIds.includes(input.userId));
      if (!binding || !timingSafeEqual(Buffer.from(signature), Buffer.from(bridgeSignature(env[binding.secretEnv]!, ts, nonce, raw)))) return res.status(403).json({ error: "Agent access denied" });
      const tenant = store.get(binding.tenantId);
      if (!tenant || tenant.status !== "active") return res.status(403).json({ error: "Agent access denied" });
      if (!claimNonce(`${binding.teamId}:${binding.tenantId}`, nonce, now)) return res.status(409).json({ error: "Replayed agent request" });
      if (input.operation === "catalog") return res.json({ models: catalog });
      if (input.operation === "context") return res.json({ workspace: tenant.name, profile: binding.profile, actions: nextActions(binding.profile, input.locale), consolePath: `/console/?tenant=${encodeURIComponent(tenant.id)}&lang=${input.locale}`, capabilities: "read-only" });
      if (input.operation === "journey") {
        const selected = input.journey;
        if (!selected || !tenantOwnsUrl(tenant, selected.url)) return res.status(403).json({ error: "Select a page in this workspace" });
        const primary = await readJourneyPage(tenant, { pageUrl: selected.url, competitor: false });
        const competitors = await Promise.all(selected.competitors.map(async c => ({ ...c, context: (await readJourneyPage(tenant, { pageUrl: c.url, competitor: true })).journeyContext })));
        const journey = buildJourneyPreview({ ...primary, ...selected, url: primary.url, language: input.locale, competitors });
        return res.json({ context: primary.journeyContext, competitorContexts: competitors.map(c => c.context), journey, policy: "Only return the sourced questions in this result. Missing context or comparison evidence requires clarification. Never fill empty stages, infer a customer need, or create rival claims. No observed demand is implied." });
      }
      if (!input.model) return res.status(400).json({ error: "Model required" });
      if (input.operation === "definition") return res.json(catalog.find(m => m.id === input.model));
      return res.json(await readModel(tenant, { model: input.model, days: input.days, source: input.source, locale: input.locale }));
    } catch (error) {
      // No upstream details, credentials, raw payloads or tenant data in error responses/logs.
      return res.status(error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503).json({ error: "Agent read unavailable. Check configuration and selected source." });
    }
  });
  return router;
}
