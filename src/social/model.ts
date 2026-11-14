import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
export const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const platforms = [
  "linkedin",
  "linkedin-page",
  "x",
  "bluesky",
  "mastodon",
  "threads",
  "facebook",
  "instagram",
  "instagram-standalone",
  "tiktok",
  "youtube",
  "pinterest",
] as const;
export const platform = z.enum(platforms);
export const https = z
  .string()
  .url()
  .max(2048)
  .refine((v) => {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password;
  });
export const iso = z.string().datetime({ offset: true });
export const campaignInput = z
  .object({
    name: z.string().trim().min(2).max(160),
    brand: z.string().trim().min(1).max(160),
    website: https,
    language: z.string().min(2).max(35),
    ga4Property: z.string().regex(/^\d+$/).optional(),
    objective: z.enum([
      "AWARENESS",
      "LEADS",
      "SALES",
      "GEO_VISIBILITY",
      "COMMUNITY",
    ]),
    audience: z.string().trim().min(5).max(1000),
    brief: z.string().trim().min(10).max(5000),
    products: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(160),
            url: https,
            facts: z.string().trim().min(5).max(2000),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    start: iso,
    end: iso,
    budgetCents: z.number().int().nonnegative().max(100000000).default(0),
    currency: z.enum(["EUR", "USD", "GBP"]).default("EUR"),
    utmRequired: z.boolean().default(true),
  })
  .strict()
  .refine((v) => Date.parse(v.end) > Date.parse(v.start), "Invalid dates");
export type Campaign = z.infer<typeof campaignInput> & {
  id: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";
  version: number;
  createdBy: string;
  createdAt: string;
};
export const mediaSchema = z
  .object({
    id,
    path: https,
    alt: z.string().min(1).max(1000),
    rights: z.enum(["OWNED", "LICENSED"]),
    proof: z.string().min(3).max(1000),
  })
  .strict();
export const postInput = z
  .object({
    campaignId: id,
    title: z.string().trim().min(2).max(160),
    productUrl: https,
    variants: z
      .array(
        z
          .object({
            platform,
            accountId: id,
            caption: z.string().trim().min(1).max(10000),
            link: https.optional(),
            media: z.array(mediaSchema).max(10).default([]),
          })
          .strict(),
      )
      .min(1)
      .max(10),
    scheduledAt: iso,
  })
  .strict();
export type Post = z.infer<typeof postInput> & {
  id: string;
  version: number;
  createdBy: string;
  status: string;
  connectorDigest: string;
  approvalId?: string;
  policy: { passed: boolean; errors: string[]; warnings: string[] };
  targets: Target[];
  createdAt: string;
};
export type Target = {
  accountId: string;
  platform: string;
  status:
    | "pending"
    | "sending"
    | "accepted"
    | "published"
    | "failed"
    | "uncertain";
  externalId?: string;
  url?: string;
  error?: string;
};
export const creatorInput = z
  .object({
    campaignId: id,
    name: z.string().trim().min(1).max(160),
    platform,
    handle: z.string().trim().min(1).max(160),
    url: https,
    source: https,
    observedAt: iso,
    followers: z.number().int().nonnegative().nullable(),
    posts: z
      .array(
        z
          .object({
            date: iso,
            likes: z.number().int().nonnegative().nullable(),
            comments: z.number().int().nonnegative().nullable(),
            shares: z.number().int().nonnegative().nullable(),
            saves: z.number().int().nonnegative().nullable(),
          })
          .strict(),
      )
      .max(20)
      .default([]),
    fit: z.number().min(0).max(100).nullable().default(null),
    fitEvidence: z.string().max(2000).default(""),
  })
  .strict();
export type Creator = z.infer<typeof creatorInput> & {
  id: string;
  version: number;
  status: string;
  createdBy: string;
  approvalId?: string;
  score: {
    engagement: number | null;
    fit: number | null;
    composite: null;
    coverage: string;
    flags: string[];
  };
};
export const outreachInput = z
  .object({
    creatorId: id,
    campaignId: id,
    channel: z.enum(["EMAIL", "DM", "FORM"]),
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(10).max(10000),
    consentEvidence: z.string().trim().min(5).max(2000),
  })
  .strict();
export type Outreach = z.infer<typeof outreachInput> & {
  id: string;
  createdBy: string;
  version: number;
  status: string;
  approvalId?: string;
  sentAt?: string;
  deliveryEvidence?: string;
};
export type Approval = {
  id: string;
  type: "POST_APPROVE" | "CREATOR_VET" | "OUTREACH_APPROVE";
  entityId: string;
  digest: string;
  requestedBy: string;
  requestedAt: string;
  expiresAt: string;
  status:
    | "PENDING"
    | "APPROVED"
    | "REJECTED"
    | "CHANGES_REQUESTED"
    | "EXPIRED"
    | "INVALIDATED";
  context: unknown;
  decision?: { actor: string; decision: string; comment: string; at: string };
};
const count = z.number().int().nonnegative().nullable();
export const observationInput = z
  .object({
    postId: id,
    accountId: id,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    source: z.string().trim().min(3).max(500),
    observedAt: iso,
    impressions: count,
    reach: count,
    likes: count,
    comments: count,
    shares: count,
    saves: count,
    clicks: count,
    ga4Sessions: count,
    ga4Conversions: z.number().nonnegative().nullable(),
  })
  .strict();
export type Observation = z.infer<typeof observationInput> & {
  id: string;
  revision: number;
  importedBy: string;
  kind: "declared" | "ga4" | "provider";
};
export const pipelines = [
  "social_content_intake",
  "social_publish_prepare",
  "social_publish_execute",
  "social_analytics_daily",
  "influencer_discovery",
  "influencer_scoring_vetting",
  "influencer_outreach",
  "social_account_sync",
] as const;
export type Job = {
  id: string;
  pipeline: (typeof pipelines)[number];
  entityId: string;
  inputHash: string;
  requestedBy: string;
  status:
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "uncertain"
    | "revoked";
  createdAt: string;
  notBefore: number;
  attempt: number;
  lease?: string;
  leaseUntil?: number;
  zenmlRunId?: string;
  resultHash?: string;
  error?: string;
  finishedAt?: string;
};
export type SocialState = {
  campaigns: Campaign[];
  posts: Post[];
  approvals: Approval[];
  creators: Creator[];
  outreach: Outreach[];
  observations: Observation[];
  providerMetrics: Array<{
    postId: string;
    accountId: string;
    observedAt: string;
    error?: string;
    series: Array<{
      label: string;
      data: Array<{ date: string; total: string }>;
    }>;
  }>;
  jobs: Job[];
  roles: Record<string, "strategist" | "contributor" | "viewer">;
  accounts: Array<{
    id: string;
    platform: string;
    name: string;
    status: string;
    observedAt: string;
  }>;
  audit: Array<{
    id: string;
    at: string;
    actor: string;
    event: string;
    target: string;
    previous: string;
    hash: string;
  }>;
  receipts: Record<string, { hash: string; value: unknown }>;
  quota?: { period: number; count: number };
};
export const initial = (): SocialState => ({
  campaigns: [],
  posts: [],
  approvals: [],
  creators: [],
  outreach: [],
  observations: [],
  providerMetrics: [],
  jobs: [],
  roles: {},
  accounts: [],
  audit: [],
  receipts: {},
});
export const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const uuid = () => randomUUID();
export const stamp = () => new Date().toISOString();
export function audit(
  s: SocialState,
  actor: string,
  event: string,
  target: string,
) {
  const row = {
    id: uuid(),
    at: stamp(),
    actor,
    event,
    target,
    previous: s.audit.at(-1)?.hash || "",
  };
  s.audit.push({ ...row, hash: digest(row) });
}
export function enqueue(
  s: SocialState,
  pipeline: Job["pipeline"],
  entityId: string,
  input: unknown,
  actor: string,
  notBefore = Date.now(),
) {
  const inputHash = digest(input),
    existing = s.jobs.find(
      (j) =>
        j.pipeline === pipeline &&
        j.entityId === entityId &&
        j.inputHash === inputHash &&
        !["failed", "revoked"].includes(j.status),
    );
  if (existing) return existing;
  const job: Job = {
    id: uuid(),
    pipeline,
    entityId,
    inputHash,
    requestedBy: actor,
    status: "queued",
    createdAt: stamp(),
    notBefore,
    attempt: 0,
  };
  s.jobs.push(job);
  return job;
}
export function entitySnapshot(
  s: SocialState,
  type: Approval["type"],
  entityId: string,
) {
  if (type === "POST_APPROVE") {
    const p = s.posts.find((x) => x.id === entityId);
    const c = s.campaigns.find((x) => x.id === p?.campaignId);
    if (!p || !c) throw new Error("SOCIAL_NOT_FOUND");
    return {
      post: {
        ...p,
        status: undefined,
        targets: undefined,
        approvalId: undefined,
        policy: undefined,
      },
      campaign: c,
    };
  }
  if (type === "CREATOR_VET") {
    const c = s.creators.find((x) => x.id === entityId);
    if (!c) throw new Error("SOCIAL_NOT_FOUND");
    return { ...c, status: undefined, approvalId: undefined };
  }
  const o = s.outreach.find((x) => x.id === entityId),
    c = s.creators.find((x) => x.id === o?.creatorId),
    campaign = s.campaigns.find((x) => x.id === o?.campaignId);
  if (!o || !c || !campaign) throw new Error("SOCIAL_NOT_FOUND");
  return {
    outreach: {
      ...o,
      status: undefined,
      approvalId: undefined,
      sentAt: undefined,
      deliveryEvidence: undefined,
    },
    creator: c,
    campaign,
  };
}
export function expire(s: SocialState) {
  for (const a of s.approvals)
    if (
      ["PENDING", "APPROVED"].includes(a.status) &&
      Date.parse(a.expiresAt) <= Date.now()
    ) {
      a.status = "EXPIRED";
      const entity =
        a.type === "POST_APPROVE"
          ? s.posts.find((x) => x.id === a.entityId)
          : a.type === "CREATOR_VET"
            ? s.creators.find((x) => x.id === a.entityId)
            : s.outreach.find((x) => x.id === a.entityId);
      if (
        entity &&
        ["PENDING_APPROVAL", "APPROVED", "SCHEDULED", "VETTED"].includes(
          entity.status,
        )
      )
        entity.status = "EXPIRED";
      for (const job of s.jobs)
        if (
          job.entityId === a.entityId &&
          job.pipeline === "social_publish_execute" &&
          job.status === "queued"
        )
          job.status = "revoked";
      audit(s, "system", "approval-expired", a.id);
    }
}
