import { z } from "zod";
import { tenantOwnsUrl, type Tenant } from "../tenants/store.js";
import { readState, updateState } from "./store.js";
import { capabilities, publicationContext } from "./provider.js";
import { analytics, postPolicy, scoreCreator } from "./policy.js";
import {
  id,
  iso,
  https,
  campaignInput,
  postInput,
  creatorInput,
  outreachInput,
  observationInput,
  entitySnapshot,
  expire,
  enqueue,
  audit,
  digest,
  uuid,
  stamp,
  type SocialState,
  type Approval,
  type Post,
  type Campaign,
  type Job,
} from "./model.js";
export type Principal = {
  tenant: Tenant;
  actor: string;
  admin: boolean;
  agent?: boolean;
};
const roles = ["strategist", "contributor", "viewer"] as const;
export function role(p: Principal, s = readState(p.tenant.id)) {
  return p.admin ? "admin" : s.roles[p.actor] || "viewer";
}
function allow(p: Principal, s: SocialState, allowed: string[]) {
  if (!allowed.includes(role(p, s))) throw new Error("SOCIAL_ACCESS");
}
function campaign(s: SocialState, id: string) {
  const c = s.campaigns.find((c) => c.id === id);
  if (!c) throw new Error("SOCIAL_NOT_FOUND");
  return c;
}
function owned(p: Principal, url: string) {
  if (!tenantOwnsUrl(p.tenant, url))
    throw new Error("SOCIAL_SOURCE_OUTSIDE_CLIENT");
}
function creator(s: SocialState, id: string) {
  const c = s.creators.find((c) => c.id === id);
  if (!c) throw new Error("SOCIAL_NOT_FOUND");
  return c;
}
const keySchema = z
  .string()
  .min(8)
  .max(120)
  .regex(/^[a-zA-Z0-9_-]+$/);
export function mutate<T>(
  p: Principal,
  key: string,
  input: unknown,
  op: (s: SocialState) => T,
): T {
  keySchema.parse(key);
  return updateState(p.tenant.id, (s) => {
    expire(s);
    const receipt = p.actor + ":" + key,
      hash = digest(input);
    const prior = s.receipts[receipt];
    if (prior) {
      if (prior.hash !== hash) throw new Error("SOCIAL_IDEMPOTENCY_CONFLICT");
      return prior.value as T;
    }
    if (Object.keys(s.receipts).length >= 50000)
      throw new Error("SOCIAL_CAPACITY");
    const value = op(s);
    s.receipts[receipt] = { hash, value };
    return value;
  });
}
export function socialState(p: Principal) {
  return updateState(p.tenant.id, (s) => {
    expire(s);
    const own = role(p, s) === "contributor";
    const posts = s.posts.filter((x) => !own || x.createdBy === p.actor),
      ids = new Set(posts.map((x) => x.id));
    return {
      actor: p.actor,
      role: role(p, s),
      campaigns: s.campaigns,
      posts,
      approvals: s.approvals.filter(
        (a) => !own || ids.has(a.entityId) || a.requestedBy === p.actor,
      ),
      creators: own ? [] : s.creators,
      outreach: own ? [] : s.outreach,
      accounts: s.accounts,
      jobs: s.jobs
        .filter((j) => !own || j.requestedBy === p.actor)
        .slice(-100)
        .map(({ lease, leaseUntil, ...job }) => job),
      audit: s.audit.filter((a) => !own || a.actor === p.actor).slice(-100),
      capabilities: capabilities(p.tenant.id),
      roles: p.admin ? s.roles : undefined,
    };
  });
}
export function saveCampaign(p: Principal, key: string, raw: unknown) {
  const input = campaignInput.parse(raw);
  if (input.ga4Property && !p.tenant.ga4Properties?.includes(input.ga4Property))
    throw new Error("SOCIAL_ACCESS");
  owned(p, input.website);
  input.products.forEach((x) => owned(p, x.url));
  return mutate(p, key, ["campaign", input], (s) => {
    allow(p, s, ["admin", "strategist"]);
    const c: Campaign = {
      ...input,
      id: uuid(),
      version: 1,
      status: "DRAFT",
      createdBy: p.actor,
      createdAt: stamp(),
    };
    s.campaigns.push(c);
    audit(s, p.actor, "campaign-created", c.id);
    return { campaign: c, idempotencyKey: key };
  });
}
export function transitionCampaign(p: Principal, key: string, raw: unknown) {
  const i = z
    .object({
      id,
      version: z.number().int(),
      status: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]),
    })
    .strict()
    .parse(raw);
  return mutate(p, key, ["campaign-status", i], (s) => {
    allow(p, s, ["admin", "strategist"]);
    const c = campaign(s, i.id);
    if (
      c.version !== i.version ||
      c.status === "ARCHIVED" ||
      (c.status === "COMPLETED" && i.status !== "ARCHIVED")
    )
      throw new Error("SOCIAL_CHANGED");
    if (c.status === i.status) throw new Error("SOCIAL_CHANGED");
    c.status = i.status;
    c.version++;
    for (const a of s.approvals) {
      const entity =
        a.type === "POST_APPROVE"
          ? s.posts.find((x) => x.id === a.entityId)
          : a.type === "OUTREACH_APPROVE"
            ? s.outreach.find((x) => x.id === a.entityId)
            : undefined;
      if (
        entity?.campaignId === c.id &&
        ["PENDING", "APPROVED"].includes(a.status)
      ) {
        a.status = "INVALIDATED";
        if (
          ["PENDING_APPROVAL", "APPROVED", "SCHEDULED"].includes(entity.status)
        )
          entity.status = "NEEDS_REVISION";
      }
    }
    for (const j of s.jobs)
      if (
        j.pipeline === "social_publish_execute" &&
        j.status === "queued" &&
        s.posts.some((p) => p.id === j.entityId && p.campaignId === c.id)
      )
        j.status = "revoked";
    audit(s, p.actor, "campaign-" + i.status, c.id);
    return { campaign: c };
  });
}
export function savePost(p: Principal, key: string, raw: unknown) {
  const i = z
    .object({
      post: postInput,
      id: id.optional(),
      version: z.number().int().optional(),
    })
    .strict()
    .parse(raw);
  owned(p, i.post.productUrl);
  i.post.variants.forEach((v) => {
    if (v.link) owned(p, v.link);
    v.media.forEach((m) => owned(p, m.path));
  });
  return mutate(p, key, ["post", i], (s) => {
    allow(p, s, ["admin", "strategist", "contributor"]);
    const c = campaign(s, i.post.campaignId);
    if (["ARCHIVED", "COMPLETED"].includes(c.status))
      throw new Error("SOCIAL_CAMPAIGN_INACTIVE");
    const old = i.id ? s.posts.find((x) => x.id === i.id) : undefined;
    if (i.id && !old) throw new Error("SOCIAL_NOT_FOUND");
    if (
      old &&
      (old.version !== i.version ||
        ["PUBLISHING", "PUBLISHED", "ACCEPTED", "UNCERTAIN"].includes(
          old.status,
        ) ||
        (role(p, s) === "contributor" && old.createdBy !== p.actor))
    )
      throw new Error("SOCIAL_CHANGED");
    if (old)
      for (const job of s.jobs)
        if (
          job.entityId === old.id &&
          job.pipeline === "social_publish_execute" &&
          job.status === "queued"
        )
          job.status = "revoked";
    if (old?.approvalId) {
      const a = s.approvals.find((a) => a.id === old.approvalId);
      if (a) a.status = "INVALIDATED";
    }
    const postId = old?.id || uuid();
    const variants = i.post.variants.map((v) => {
      if (!v.link) return v;
      const u = new URL(v.link);
      u.searchParams.set("utm_content", postId + "_" + v.accountId);
      return { ...v, link: u.href };
    });
    const post: Post = {
      ...i.post,
      variants,
      connectorDigest: publicationContext(p.tenant.id, i.post),
      id: postId,
      version: (old?.version || 0) + 1,
      createdBy: old?.createdBy || p.actor,
      createdAt: old?.createdAt || stamp(),
      status: "DRAFT",
      targets: [],
      policy: postPolicy({ ...i.post, variants }, c),
    };
    if (old) s.posts[s.posts.indexOf(old)] = post;
    else s.posts.push(post);
    const job = enqueue(
      s,
      "social_content_intake",
      post.id,
      entitySnapshot(s, "POST_APPROVE", post.id),
      p.actor,
    );
    audit(s, p.actor, "draft-saved", post.id);
    return { post, pipelineRunId: job.id, idempotencyKey: key };
  });
}
export function requestApproval(p: Principal, key: string, raw: unknown) {
  const i = z
    .object({
      type: z.enum(["POST_APPROVE", "CREATOR_VET", "OUTREACH_APPROVE"]),
      entityId: id,
    })
    .strict()
    .parse(raw);
  return mutate(p, key, ["approval-request", i], (s) => {
    allow(p, s, ["admin", "strategist", "contributor"]);
    const context = entitySnapshot(s, i.type, i.entityId);
    let entity;
    if (i.type === "POST_APPROVE") {
      entity = s.posts.find((x) => x.id === i.entityId)!;
      if (role(p, s) === "contributor" && entity.createdBy !== p.actor)
        throw new Error("SOCIAL_ACCESS");
      const c = campaign(s, entity.campaignId);
      if (entity.connectorDigest !== publicationContext(p.tenant.id, entity))
        throw new Error("SOCIAL_CHANGED");
      entity.policy = postPolicy(entity, c);
      if (!entity.policy.passed) throw new Error("SOCIAL_POLICY_REQUIRED");
      if (c.status !== "ACTIVE") throw new Error("SOCIAL_CAMPAIGN_INACTIVE");
      if (
        Date.parse(entity.scheduledAt) < Date.now() ||
        Date.parse(entity.scheduledAt) > Date.now() + 7 * 86400000
      )
        throw new Error("SOCIAL_SCHEDULE_WINDOW");
      if (
        ["PUBLISHING", "PUBLISHED", "ACCEPTED", "UNCERTAIN"].includes(
          entity.status,
        )
      )
        throw new Error("SOCIAL_CHANGED");
    } else {
      allow(p, s, ["admin", "strategist"]);
      entity =
        i.type === "CREATOR_VET"
          ? creator(s, i.entityId)
          : s.outreach.find((x) => x.id === i.entityId)!;
      if (
        i.type === "OUTREACH_APPROVE" &&
        creator(s, (entity as { creatorId: string }).creatorId).status !==
          "VETTED"
      )
        throw new Error("SOCIAL_VETTING_REQUIRED");
    }
    if (
      s.approvals.some(
        (a) =>
          a.entityId === entity.id &&
          a.type === i.type &&
          ["PENDING", "APPROVED"].includes(a.status),
      )
    )
      throw new Error("SOCIAL_APPROVAL_EXISTS");
    const a: Approval = {
      id: uuid(),
      type: i.type,
      entityId: entity.id,
      digest: digest(context),
      requestedBy: p.actor,
      requestedAt: stamp(),
      expiresAt: new Date(
        Date.now() + (i.type === "OUTREACH_APPROVE" ? 14 : 7) * 86400000,
      ).toISOString(),
      status: "PENDING",
      context,
    };
    s.approvals.push(a);
    entity.approvalId = a.id;
    entity.status = "PENDING_APPROVAL";
    const job = enqueue(
      s,
      i.type === "POST_APPROVE"
        ? "social_publish_prepare"
        : i.type === "CREATOR_VET"
          ? "influencer_scoring_vetting"
          : "influencer_outreach",
      entity.id,
      context,
      p.actor,
    );
    audit(s, p.actor, "approval-requested", a.id);
    return { approval: a, pipelineRunId: job.id, idempotencyKey: key };
  });
}
export function decide(p: Principal, key: string, raw: unknown) {
  const i = z
    .object({
      id,
      digest: z.string().length(64),
      decision: z.enum(["APPROVE", "REJECT", "CHANGES_REQUESTED"]),
      comment: z.string().trim().min(1).max(2000),
    })
    .strict()
    .parse(raw);
  if (!p.admin || p.agent) throw new Error("SOCIAL_HUMAN_APPROVAL_REQUIRED");
  return mutate(p, key, ["decision", i], (s) => {
    const a = s.approvals.find((a) => a.id === i.id);
    if (!a) throw new Error("SOCIAL_NOT_FOUND");
    if (a.requestedBy === p.actor)
      throw new Error("SOCIAL_INDEPENDENT_APPROVER_REQUIRED");
    if (
      a.status !== "PENDING" ||
      a.digest !== i.digest ||
      digest(entitySnapshot(s, a.type, a.entityId)) !== a.digest
    )
      throw new Error("SOCIAL_CHANGED");
    a.status =
      i.decision === "APPROVE"
        ? "APPROVED"
        : i.decision === "REJECT"
          ? "REJECTED"
          : "CHANGES_REQUESTED";
    a.decision = {
      actor: p.actor,
      decision: i.decision,
      comment: i.comment,
      at: stamp(),
    };
    const entity =
      a.type === "POST_APPROVE"
        ? s.posts.find((x) => x.id === a.entityId)!
        : a.type === "CREATOR_VET"
          ? creator(s, a.entityId)
          : s.outreach.find((x) => x.id === a.entityId)!;
    entity.status =
      i.decision === "APPROVE"
        ? a.type === "CREATOR_VET"
          ? "VETTED"
          : "APPROVED"
        : i.decision === "REJECT"
          ? "REJECTED"
          : "NEEDS_REVISION";
    audit(s, p.actor, "approval-" + a.status, a.id);
    return { approval: a };
  });
}
export function verifyApproval(
  s: SocialState,
  approvalId: string,
  type: Approval["type"],
) {
  expire(s);
  const a = s.approvals.find((a) => a.id === approvalId);
  if (
    !a ||
    a.type !== type ||
    a.status !== "APPROVED" ||
    !a.decision ||
    a.decision.actor === a.requestedBy ||
    Date.parse(a.expiresAt) <= Date.now()
  )
    throw new Error("SOCIAL_APPROVAL_REQUIRED");
  if (digest(entitySnapshot(s, a.type, a.entityId)) !== a.digest)
    throw new Error("SOCIAL_CHANGED");
  return a;
}
export function execute(p: Principal, key: string, raw: unknown) {
  const i = z.object({ approvalId: id }).strict().parse(raw);
  if (!p.admin || p.agent) throw new Error("SOCIAL_HUMAN_APPROVAL_REQUIRED");
  if (!capabilities(p.tenant.id).publishing)
    throw new Error("SOCIAL_WRITE_DISABLED");
  return mutate(p, key, ["execute", i], (s) => {
    const a = verifyApproval(s, i.approvalId, "POST_APPROVE");
    if (a.decision!.actor !== p.actor) throw new Error("SOCIAL_ACCESS");
    const post = s.posts.find((x) => x.id === a.entityId)!;
    if (post.connectorDigest !== publicationContext(p.tenant.id, post))
      throw new Error("SOCIAL_CHANGED");
    owned(p, post.productUrl);
    post.variants.forEach((v) => {
      if (v.link) owned(p, v.link);
      v.media.forEach((m) => owned(p, m.path));
    });
    if (campaign(s, post.campaignId).status !== "ACTIVE")
      throw new Error("SOCIAL_CAMPAIGN_INACTIVE");
    if (post.status !== "APPROVED")
      throw new Error("SOCIAL_ALREADY_DISPATCHED");
    post.status = "SCHEDULED";
    const job = enqueue(
      s,
      "social_publish_execute",
      post.id,
      entitySnapshot(s, "POST_APPROVE", post.id),
      p.actor,
      Math.max(Date.now(), Date.parse(post.scheduledAt)),
    );
    audit(s, p.actor, "publication-scheduled", post.id);
    return { postId: post.id, pipelineRunId: job.id, idempotencyKey: key };
  });
}
export function saveCreator(p: Principal, key: string, raw: unknown) {
  const i = creatorInput.parse(raw);
  if (Date.parse(i.observedAt) > Date.now() + 300000)
    throw new Error("SOCIAL_INVALID");
  return mutate(p, key, ["creator", i], (s) => {
    allow(p, s, ["admin", "strategist"]);
    campaign(s, i.campaignId);
    const exists = s.creators.find(
      (x) =>
        x.campaignId === i.campaignId &&
        x.platform === i.platform &&
        x.handle.toLowerCase() === i.handle.toLowerCase(),
    );
    if (exists) return { creator: exists };
    const c = {
      ...i,
      id: uuid(),
      createdBy: p.actor,
      version: 1,
      status: "DISCOVERED",
      score: scoreCreator(i),
    };
    s.creators.push(c);
    const job = enqueue(s, "influencer_scoring_vetting", c.id, i, p.actor);
    audit(s, p.actor, "creator-added", c.id);
    return { creator: c, pipelineRunId: job.id };
  });
}
export function saveOutreach(p: Principal, key: string, raw: unknown) {
  const i = outreachInput.parse(raw);
  return mutate(p, key, ["outreach", i], (s) => {
    allow(p, s, ["admin", "strategist"]);
    const c = creator(s, i.creatorId);
    if (c.status !== "VETTED" || c.campaignId !== i.campaignId)
      throw new Error("SOCIAL_VETTING_REQUIRED");
    if (campaign(s, i.campaignId).status !== "ACTIVE")
      throw new Error("SOCIAL_CAMPAIGN_INACTIVE");
    const o = {
      ...i,
      id: uuid(),
      createdBy: p.actor,
      version: 1,
      status: "DRAFT",
    };
    s.outreach.push(o);
    const job = enqueue(s, "influencer_outreach", o.id, i, p.actor);
    audit(s, p.actor, "outreach-drafted", o.id);
    return { outreach: o, pipelineRunId: job.id };
  });
}
export function recordOutreach(p: Principal, key: string, raw: unknown) {
  const i = z
    .object({ approvalId: id, deliveryEvidence: https, sentAt: iso })
    .strict()
    .parse(raw);
  if (!p.admin || p.agent) throw new Error("SOCIAL_HUMAN_APPROVAL_REQUIRED");
  return mutate(p, key, ["outreach-receipt", i], (s) => {
    const a = verifyApproval(s, i.approvalId, "OUTREACH_APPROVE");
    if (a.decision!.actor !== p.actor) throw new Error("SOCIAL_ACCESS");
    const o = s.outreach.find((o) => o.id === a.entityId)!;
    if (
      o.status !== "APPROVED" ||
      Date.parse(i.sentAt) > Date.now() + 300000 ||
      Date.parse(i.sentAt) < Date.parse(a.decision!.at)
    )
      throw new Error("SOCIAL_CHANGED");
    o.status = "SENT";
    o.sentAt = i.sentAt;
    o.deliveryEvidence = i.deliveryEvidence;
    audit(s, p.actor, "outreach-manual-receipt", o.id);
    return { outreach: o };
  });
}
export function importAnalytics(p: Principal, key: string, raw: unknown) {
  const rows = z.array(observationInput).min(1).max(1000).parse(raw);
  return mutate(p, key, ["analytics-import", rows], (s) => {
    allow(p, s, ["admin", "strategist"]);
    for (const r of rows) {
      const post = s.posts.find((p) => p.id === r.postId);
      if (!post || !post.variants.some((v) => v.accountId === r.accountId))
        throw new Error("SOCIAL_NOT_FOUND");
      if (
        !Number.isFinite(Date.parse(r.date + "T00:00:00Z")) ||
        new Date(r.date + "T00:00:00Z").toISOString().slice(0, 10) !== r.date ||
        Date.parse(r.observedAt) > Date.now() + 300000
      )
        throw new Error("SOCIAL_INVALID");
      const prior = s.observations.filter(
        (x) =>
          x.postId === r.postId &&
          x.accountId === r.accountId &&
          x.date === r.date &&
          x.source === r.source &&
          x.kind === "declared",
      );
      s.observations.push({
        ...r,
        id: uuid(),
        revision: prior.length + 1,
        importedBy: p.actor,
        kind: "declared",
      });
    }
    audit(s, p.actor, "analytics-import", String(rows.length));
    return { imported: rows.length };
  });
}
export function analyticsReport(p: Principal, raw: unknown) {
  const i = z
      .object({
        campaignId: id.optional(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .strict()
      .parse(raw),
    s = readState(p.tenant.id);
  allow(p, s, ["admin", "strategist", "viewer"]);
  const ids = new Set(
    s.posts
      .filter((x) => !i.campaignId || x.campaignId === i.campaignId)
      .map((x) => x.id),
  );
  if (i.from > i.to) throw new Error("SOCIAL_INVALID");
  return {
    ...analytics(
      s.observations.filter((x) => ids.has(x.postId)),
      i.from,
      i.to,
    ),
    providerMetrics: s.providerMetrics
      .filter((x) => ids.has(x.postId))
      .map((x) => ({
        ...x,
        series: x.series.map((m) => ({
          ...m,
          data: m.data.filter(
            (d) => d.date.slice(0, 10) >= i.from && d.date.slice(0, 10) <= i.to,
          ),
        })),
      })),
  };
}
export function queue(p: Principal, key: string, raw: unknown) {
  const i = z
    .object({
      pipeline: z.enum([
        "social_analytics_daily",
        "influencer_discovery",
        "social_account_sync",
      ]),
      campaignId: id.optional(),
    })
    .strict()
    .parse(raw);
  return mutate(p, key, ["queue", i], (s) => {
    allow(p, s, ["admin", "strategist"]);
    if (i.pipeline !== "social_account_sync" && !i.campaignId)
      throw new Error("SOCIAL_INVALID");
    const c = i.campaignId ? campaign(s, i.campaignId) : null;
    const job = enqueue(
      s,
      i.pipeline,
      c?.id || "accounts",
      { campaign: c, requestedAt: stamp() },
      p.actor,
    );
    audit(s, p.actor, "pipeline-requested", job.id);
    return { pipelineRunId: job.id };
  });
}
export function grant(p: Principal, key: string, raw: unknown) {
  if (!p.admin || p.agent) throw new Error("SOCIAL_ACCESS");
  const i = z
    .object({ actor: z.string().min(1).max(300), role: z.enum(roles) })
    .strict()
    .parse(raw);
  return mutate(p, key, ["role", i], (s) => {
    s.roles[i.actor] = i.role;
    audit(s, p.actor, "role-changed", i.actor);
    return { saved: true };
  });
}
export function exportSocial(p: Principal) {
  const state = socialState(p),
    s = readState(p.tenant.id);
  return {
    exportedAt: stamp(),
    ...state,
    ...(state.role !== "contributor"
      ? { observations: s.observations, providerMetrics: s.providerMetrics }
      : {}),
  };
}

export function updateCreator(p: Principal, key: string, raw: unknown) {
  const i = z
    .object({ id, version: z.number().int(), creator: creatorInput })
    .strict()
    .parse(raw);
  if (Date.parse(i.creator.observedAt) > Date.now() + 300000)
    throw new Error("SOCIAL_INVALID");
  return mutate(p, key, ["creator-update", i], (s) => {
    allow(p, s, ["admin", "strategist"]);
    const old = creator(s, i.id);
    if (
      old.version !== i.version ||
      old.campaignId !== i.creator.campaignId ||
      old.platform !== i.creator.platform ||
      old.handle !== i.creator.handle
    )
      throw new Error("SOCIAL_CHANGED");
    for (const a of s.approvals)
      if (
        ["PENDING", "APPROVED"].includes(a.status) &&
        ((a.type === "CREATOR_VET" && a.entityId === old.id) ||
          (a.type === "OUTREACH_APPROVE" &&
            s.outreach.some(
              (o) => o.id === a.entityId && o.creatorId === old.id,
            )))
      ) {
        a.status = "INVALIDATED";
        const o = s.outreach.find((o) => o.id === a.entityId);
        if (o && o.status !== "SENT") o.status = "NEEDS_REVISION";
      }
    const updated = {
      ...i.creator,
      id: old.id,
      createdBy: old.createdBy,
      version: old.version + 1,
      status: "SCORED",
      score: scoreCreator(i.creator),
    };
    s.creators[s.creators.indexOf(old)] = updated;
    audit(s, p.actor, "creator-revised", old.id);
    return { creator: updated };
  });
}
export function updateOutreach(p: Principal, key: string, raw: unknown) {
  const i = z
    .object({ id, version: z.number().int(), outreach: outreachInput })
    .strict()
    .parse(raw);
  return mutate(p, key, ["outreach-update", i], (s) => {
    allow(p, s, ["admin", "strategist"]);
    const old = s.outreach.find((o) => o.id === i.id);
    if (
      !old ||
      old.version !== i.version ||
      old.status === "SENT" ||
      old.creatorId !== i.outreach.creatorId ||
      old.campaignId !== i.outreach.campaignId
    )
      throw new Error("SOCIAL_CHANGED");
    if (creator(s, old.creatorId).status !== "VETTED")
      throw new Error("SOCIAL_VETTING_REQUIRED");
    for (const a of s.approvals)
      if (a.entityId === old.id && ["PENDING", "APPROVED"].includes(a.status))
        a.status = "INVALIDATED";
    const updated = {
      ...i.outreach,
      id: old.id,
      createdBy: old.createdBy,
      version: old.version + 1,
      status: "DRAFT",
    };
    s.outreach[s.outreach.indexOf(old)] = updated;
    audit(s, p.actor, "outreach-revised", old.id);
    return { outreach: updated };
  });
}
