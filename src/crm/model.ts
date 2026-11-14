import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
export const id = z
  .string()
  .min(1)
  .max(180)
  .regex(/^[a-zA-Z0-9_.:-]+$/);
export const iso = z
  .string()
  .datetime({ offset: true })
  .transform((v) => new Date(v).toISOString());
export const channels = [
  "web",
  "social",
  "manual",
  "shopify",
  "prestashop",
] as const;
export const channel = z.enum(channels);
export const identityKinds = [
  "crm_id",
  "web_user",
  "web_session",
  "social_user",
  "shopify_customer",
  "prestashop_customer",
] as const;
export const identityInput = z
  .object({
    kind: z.enum(identityKinds),
    scope: id,
    value: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .regex(/^[a-zA-Z0-9_:.\/-]+$/),
  })
  .strict();
export type Identity = z.infer<typeof identityInput>;
export const safeUrl = z
  .string()
  .url()
  .max(2048)
  .refine((v) => {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password;
  })
  .transform((v) => {
    const u = new URL(v);
    u.search = "";
    u.hash = "";
    return u.href;
  });
export const proofInput = z
  .object({
    reference: z.string().trim().min(5).max(500),
    url: safeUrl.optional(),
    validFrom: iso.optional(),
    validUntil: iso.optional(),
  })
  .strict();
export type Proof = z.infer<typeof proofInput>;
export const contactInput = z
  .object({
    label: z.string().trim().min(2).max(120),
    externalUrl: safeUrl.optional(),
  })
  .strict();
export const eventTypes = [
  "page_view",
  "form_submitted",
  "login",
  "social_click",
  "social_comment",
  "social_message",
  "call",
  "meeting",
  "note",
  "order_created",
  "order_status",
  "crm_update",
] as const;
export const eventInput = z
  .object({
    eventId: id,
    channel,
    type: z.enum(eventTypes),
    occurredAt: iso,
    timeBasis: z.enum(["source", "observed"]).default("source"),
    summary: z.string().trim().min(2).max(280),
    identity: identityInput.optional(),
    sourceUrl: safeUrl.optional(),
    proof: proofInput,
    details: z
      .object({
        pageUrl: safeUrl.optional(),
        productUrl: safeUrl.optional(),
        socialPostId: id.optional(),
        campaignId: id.optional(),
        orderNumber: z.string().max(100).optional(),
        orderStatus: z.string().max(40).optional(),
        amount: z.number().finite().nonnegative().max(1e12).optional(),
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .optional(),
        note: z.string().max(1500).optional(),
      })
      .strict()
      .default({}),
    supersedes: id.optional(),
  })
  .strict();
export type EventInput = z.infer<typeof eventInput>;
export type Contact = {
  id: string;
  label: string;
  externalUrl?: string;
  status: "active" | "paused";
  mode: "native" | "plugin";
  createdAt: string;
  updatedAt: string;
  version: number;
};
export type Binding = {
  id: string;
  key: string;
  kind: string;
  scope: string;
  profileId: string;
  method: "native" | "human_declared" | "source_asserted";
  proof: Proof;
  actor: string;
  at: string;
};
export type Event = Omit<EventInput, "identity" | "eventId"> & {
  id: string;
  eventId: string;
  source: string;
  identityKey: string;
  identityKind: string;
  identityScope: string;
  authorization?: string;
  provenance: "human_declared" | "source_asserted" | "commerce_observed";
  receivedAt: string;
  hash: string;
};
export type Settings = {
  enabled: boolean;
  mode: "native" | "plugin";
  roles: Record<string, "reader" | "editor">;
};
export const hash = (x: unknown) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
export const uuid = () => randomUUID();
export const now = () => new Date().toISOString();
export function assertEvent(input: EventInput) {
  if (Date.parse(input.occurredAt) > Date.now() + 300000)
    throw new Error("CRM_FUTURE_EVENT");
  const expected: Record<string, readonly string[]> = {
    web: ["page_view", "form_submitted", "login"],
    social: ["social_click", "social_comment", "social_message"],
    manual: ["call", "meeting", "note", "crm_update"],
    shopify: ["order_created", "order_status"],
    prestashop: ["order_created", "order_status"],
  };
  if (!expected[input.channel].includes(input.type))
    throw new Error("CRM_EVENT_CHANNEL");
}
export function assertProof(kind: string, proof: Proof) {
  if (
    proof.validFrom &&
    proof.validUntil &&
    Date.parse(proof.validFrom) > Date.parse(proof.validUntil)
  )
    throw new Error("CRM_INVALID_INTERVAL");
  if (
    kind === "web_session" &&
    (!proof.validFrom ||
      !proof.validUntil ||
      Date.parse(proof.validUntil) - Date.parse(proof.validFrom) > 86400000)
  )
    throw new Error("CRM_SESSION_INTERVAL_REQUIRED");
}
