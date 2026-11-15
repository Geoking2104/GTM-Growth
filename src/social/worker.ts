import { CloudAccessError, type CloudAccess } from "../billing/access.js";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import {
  TenantStore,
  validTenantId,
  tenantOwnsUrl,
  type Tenant,
} from "../tenants/store.js";
import { withCredential } from "../auth/service-account.js";
import { runReport } from "../google/data-api.js";
import { readState, updateState } from "./store.js";
import {
  SocialProvider,
  socialConfig,
  publicationContext,
} from "./provider.js";
import { verifyApproval } from "./service.js";
import { postPolicy, scoreCreator } from "./policy.js";
import {
  pipelines,
  id,
  enqueue,
  uuid,
  stamp,
  digest,
  audit,
  expire,
  entitySnapshot,
  type Job,
  type SocialState,
} from "./model.js";
const code = (e: unknown) =>
  e instanceof Error && /^SOCIAL_[A-Z0-9_]+$/.test(e.message)
    ? e.message
    : "SOCIAL_PROVIDER_ERROR";
function jobFor(s: SocialState, jobId: string, lease: string) {
  const j = s.jobs.find((j) => j.id === jobId);
  if (
    !j ||
    j.status !== "running" ||
    j.lease !== lease ||
    j.leaseUntil! < Date.now()
  )
    throw new Error("SOCIAL_LEASE_EXPIRED");
  return j;
}
export function claim(tenant: string, allowed: readonly string[]) {
  return updateState(tenant, (s) => {
    expire(s);
    const now = Date.now();
    let auto = false;
    try {
      auto = socialConfig(tenant).autoRefresh;
    } catch {}
    if (auto) {
      const due = (
        pipeline: Job["pipeline"],
        entityId: string,
        input: unknown,
      ) => {
        const hash = digest(input);
        if (
          !s.jobs.some(
            (j) =>
              j.pipeline === pipeline &&
              j.entityId === entityId &&
              j.inputHash === hash,
          )
        )
          enqueue(s, pipeline, entityId, input, "scheduler");
      };
      if (allowed.includes("social_account_sync"))
        due("social_account_sync", "accounts", {
          hour: Math.floor(now / 3600000),
        });
      if (allowed.includes("social_analytics_daily"))
        for (const c of s.campaigns.filter((c) => c.status === "ACTIVE"))
          due("social_analytics_daily", c.id, {
            day: Math.floor(now / 86400000),
          });
    }
    for (const j of s.jobs)
      if (j.status === "running" && j.leaseUntil! <= now) {
        j.status =
          j.pipeline === "social_publish_execute"
            ? "uncertain"
            : j.attempt >= 3
              ? "failed"
              : "queued";
        j.error = "SOCIAL_WORKER_INTERRUPTED";
        if (j.status === "queued") {
          j.zenmlRunId = undefined;
          j.lease = undefined;
        } else if (j.pipeline === "social_publish_execute") {
          const p = s.posts.find((p) => p.id === j.entityId);
          if (p && ["SCHEDULED", "PUBLISHING"].includes(p.status))
            p.status = "UNCERTAIN";
        }
      }
    if (s.jobs.some((j) => j.status === "running")) return null;
    const j = s.jobs.find(
      (j) =>
        j.status === "queued" &&
        j.notBefore <= now &&
        allowed.includes(j.pipeline),
    );
    if (!j) return null;
    j.status = "running";
    j.attempt++;
    j.lease = uuid();
    j.leaseUntil = now + 300000;
    return {
      id: j.id,
      pipeline: j.pipeline,
      inputHash: j.inputHash,
      lease: j.lease,
    };
  });
}
async function publish(
  client: Tenant,
  job: Job,
  provider: SocialProvider,
  active: () => boolean,
) {
  const tenant = client.id;
  let s = readState(tenant),
    post = s.posts.find((p) => p.id === job.entityId);
  if (!post) throw new Error("SOCIAL_NOT_FOUND");
  const accounts = await provider.accounts();
  for (const variant of post.variants) {
    if (!active()) throw new Error("SOCIAL_ACCESS");
    const selected = updateState(tenant, (current) => {
      jobFor(current, job.id, job.lease!);
      const p = current.posts.find((p) => p.id === job.entityId)!;
      verifyApproval(current, p.approvalId || "", "POST_APPROVE");
      if (p.connectorDigest !== publicationContext(tenant, p))
        throw new Error("SOCIAL_CHANGED");
      if (
        ![
          p.productUrl,
          ...p.variants.flatMap((v) => [
            ...(v.link ? [v.link] : []),
            ...v.media.map((m) => m.path),
          ]),
        ].every((url) => tenantOwnsUrl(client, url))
      )
        throw new Error("SOCIAL_SOURCE_OUTSIDE_CLIENT");
      const c = current.campaigns.find((c) => c.id === p.campaignId)!;
      if (c.status !== "ACTIVE" || !postPolicy(p, c).passed)
        throw new Error("SOCIAL_CAMPAIGN_INACTIVE");
      if (Date.parse(p.scheduledAt) > Date.now())
        throw new Error("SOCIAL_NOT_DUE");
      let target = p.targets.find((t) => t.accountId === variant.accountId);
      if (target && ["accepted", "published"].includes(target.status))
        return null;
      if (target && ["sending", "uncertain"].includes(target.status))
        throw new Error("SOCIAL_UNCERTAIN");
      if (
        !accounts.some(
          (a) =>
            a.id === variant.accountId &&
            a.platform === variant.platform &&
            a.status === "ACTIVE",
        )
      )
        throw new Error("SOCIAL_TOKEN_EXPIRED");
      if (!target) {
        target = {
          accountId: variant.accountId,
          platform: variant.platform,
          status: "pending",
        };
        p.targets.push(target);
      }
      target.status = "sending";
      p.status = "PUBLISHING";
      audit(current, "zenml", "dispatch-start", p.id + ":" + variant.accountId);
      return structuredClone(p);
    });
    if (!selected) continue;
    try {
      const externalId = await provider.publish(selected, variant.accountId);
      updateState(tenant, (current) => {
        const p = current.posts.find((p) => p.id === job.entityId)!,
          t = p.targets.find((t) => t.accountId === variant.accountId)!;
        t.externalId = externalId;
        t.status = "accepted";
        audit(
          current,
          "zenml",
          "provider-accepted",
          p.id + ":" + variant.accountId,
        );
      });
    } catch (error) {
      updateState(tenant, (current) => {
        const p = current.posts.find((p) => p.id === job.entityId)!,
          t = p.targets.find((t) => t.accountId === variant.accountId)!;
        t.status = "uncertain";
        t.error = code(error);
        p.status = "UNCERTAIN";
        audit(
          current,
          "zenml",
          "dispatch-uncertain",
          p.id + ":" + variant.accountId,
        );
      });
      throw new Error("SOCIAL_UNCERTAIN");
    }
  }
  updateState(tenant, (current) => {
    const p = current.posts.find((p) => p.id === job.entityId)!;
    p.status = "ACCEPTED";
  });
  // Readback is safe to repeat; never repeats an external POST.
  return readback(tenant, job.entityId, provider);
}
export async function readback(
  tenant: string,
  postId: string,
  provider = new SocialProvider(tenant),
) {
  const post = readState(tenant).posts.find((p) => p.id === postId);
  if (!post) throw new Error("SOCIAL_NOT_FOUND");
  const date = Date.parse(post.scheduledAt),
    raw = await provider.readPosts(
      new Date(date - 86400000).toISOString(),
      new Date(date + 86400000).toISOString(),
    );
  const rows = z
    .object({
      posts: z
        .array(
          z.object({
            id: z.string(),
            state: z.string().optional(),
            releaseURL: z.string().nullable().optional(),
            integration: z.object({ id: z.string() }).optional(),
          }),
        )
        .max(10000),
    })
    .safeParse(raw);
  if (!rows.success) throw new Error("SOCIAL_PROVIDER_ERROR");
  return updateState(tenant, (s) => {
    const p = s.posts.find((p) => p.id === postId)!;
    for (const target of p.targets) {
      const row = rows.data.posts.find(
        (r) =>
          r.id === target.externalId && r.integration?.id === target.accountId,
      );
      if (row?.state === "ERROR" && target.status !== "published") {
        target.status = "failed";
        target.error = "SOCIAL_PLATFORM_REJECTED";
      }
      if (row?.state === "PUBLISHED" && row.releaseURL) {
        let u;
        try {
          u = new URL(row.releaseURL);
        } catch {
          continue;
        }
        if (u.protocol === "https:" && !u.username && !u.password) {
          target.status = "published";
          target.url = u.href;
        }
      }
    }
    if (
      p.targets.length === p.variants.length &&
      p.targets.every((t) => t.status === "published")
    )
      p.status = "PUBLISHED";
    else if (
      p.targets.length === p.variants.length &&
      p.targets.every((t) => t.status === "failed")
    )
      p.status = "FAILED";
    else if (
      p.targets.some((t) => t.status === "published") &&
      p.targets.some((t) => t.status === "failed")
    )
      p.status = "PARTIAL";
    audit(s, "zenml", "publication-readback", p.id);
    return { postId: p.id, status: p.status };
  });
}
async function analyticsRefresh(
  tenant: Tenant,
  campaignId: string,
  provider: SocialProvider,
  active: () => boolean,
) {
  let providerCount = 0;
  const posts = readState(tenant.id).posts.filter(
    (p) => p.campaignId === campaignId && p.status === "PUBLISHED",
  );
  let hasPostiz = false;
  try {
    hasPostiz = !!socialConfig(tenant.id).postiz;
  } catch {}
  if (hasPostiz)
    for (const { p, target } of posts
      .flatMap((p) =>
        p.targets
          .filter((t) => t.status === "published" && t.externalId)
          .map((target) => ({ p, target })),
      )
      .sort((a, b) =>
        (
          readState(tenant.id).providerMetrics.find(
            (m) => m.postId === a.p.id && m.accountId === a.target.accountId,
          )?.observedAt || ""
        ).localeCompare(
          readState(tenant.id).providerMetrics.find(
            (m) => m.postId === b.p.id && m.accountId === b.target.accountId,
          )?.observedAt || "",
        ),
      )
      .slice(0, 5)) {
      let series: Awaited<ReturnType<SocialProvider["metrics"]>> = [],
        error: string | undefined;
      try {
        series = await provider.metrics(target.externalId!);
      } catch (e) {
        error = code(e);
      }
      if (!active()) throw new Error("SOCIAL_ACCESS");
      updateState(tenant.id, (s) => {
        const value = {
          postId: p.id,
          accountId: target.accountId,
          observedAt: stamp(),
          series,
          error,
        };
        const index = s.providerMetrics.findIndex(
          (x) => x.postId === p.id && x.accountId === target.accountId,
        );
        if (index < 0) s.providerMetrics.push(value);
        else s.providerMetrics[index] = value;
      });
      providerCount++;
    }
  if (!tenant.ga4Properties?.length && hasPostiz)
    return { providerCount, ga4: "unavailable" };
  if (!tenant.ga4Properties?.length) throw new Error("SOCIAL_GA4_UNAVAILABLE");
  const c = readState(tenant.id).campaigns.find((c) => c.id === campaignId);
  if (!c) throw new Error("SOCIAL_NOT_FOUND");
  const property =
    c.ga4Property ||
    (tenant.ga4Properties.length === 1 ? tenant.ga4Properties[0] : undefined);
  if (!property || !tenant.ga4Properties.includes(property))
    throw new Error("SOCIAL_GA4_PROPERTY_REQUIRED");
  const report = await withCredential(tenant.googleCredential, () =>
    runReport({
      propertyId: property,
      metrics: ["sessions", "keyEvents"],
      dimensions: ["date", "sessionManualAdContent"],
      startDate: "90daysAgo",
      endDate: "yesterday",
      limit: 10000,
      dimensionFilter: {
        andGroup: {
          expressions: [
            {
              filter: {
                fieldName: "sessionCampaignName",
                stringFilter: { matchType: "EXACT", value: c.id },
              },
            },
            {
              filter: {
                fieldName: "sessionMedium",
                stringFilter: { matchType: "EXACT", value: "social" },
              },
            },
          ],
        },
      },
    }),
  );
  if (!active()) throw new Error("SOCIAL_ACCESS");
  return updateState(tenant.id, (s) => {
    let imported = 0;
    for (const row of report.rows ?? []) {
      const r = row as Record<string, unknown>,
        post = s.posts.find(
          (p) =>
            p.campaignId === c.id &&
            p.variants.some(
              (v) => p.id + "_" + v.accountId === r.sessionManualAdContent,
            ),
        );
      const variant = post?.variants.find(
        (v) => post.id + "_" + v.accountId === r.sessionManualAdContent,
      );
      if (!post || !variant) continue;
      const day = String(r.date || "");
      if (!/^\d{8}$/.test(day)) continue;
      const date =
          day.slice(0, 4) + "-" + day.slice(4, 6) + "-" + day.slice(6, 8),
        sessions = Number(r.sessions),
        conversions = Number(r.keyEvents);
      if (
        !Number.isSafeInteger(sessions) ||
        sessions < 0 ||
        !Number.isFinite(conversions) ||
        conversions < 0
      )
        continue;
      const source = "GA4 " + property,
        revision =
          s.observations.filter(
            (x) =>
              x.postId === post.id && x.date === date && x.source === source,
          ).length + 1;
      s.observations.push({
        id: uuid(),
        postId: post.id,
        accountId: variant.accountId,
        date,
        source,
        observedAt: stamp(),
        kind: "ga4",
        revision,
        importedBy: "zenml",
        impressions: null,
        reach: null,
        likes: null,
        comments: null,
        shares: null,
        saves: null,
        clicks: null,
        ga4Sessions: sessions,
        ga4Conversions: conversions,
      });
      imported++;
    }
    return { imported, providerCount };
  });
}
export async function executeJob(
  tenant: Tenant,
  input: { id: string; lease: string; zenmlRunId: string },
  provider = new SocialProvider(tenant.id),
  active = () => {
    const current = new TenantStore().get(tenant.id);
    return (
      current?.status === "active" &&
      digest([
        current.domains,
        current.ga4Properties,
        current.googleCredential,
      ]) ===
        digest([tenant.domains, tenant.ga4Properties, tenant.googleCredential])
    );
  },
) {
  if (!active()) throw new Error("SOCIAL_ACCESS");
  const job = updateState(tenant.id, (s) => {
    const j = jobFor(s, input.id, input.lease);
    if (j.zenmlRunId) throw new Error("SOCIAL_ALREADY_DISPATCHED");
    j.zenmlRunId = input.zenmlRunId;
    audit(s, "zenml", "pipeline-start", j.id);
    return structuredClone(j);
  });
  try {
    let result: unknown;
    if (job.pipeline === "social_publish_execute")
      result = await publish(tenant, job, provider, active);
    else if (job.pipeline === "social_account_sync") {
      const accounts = await provider.accounts();
      if (!active()) throw new Error("SOCIAL_ACCESS");
      result = updateState(tenant.id, (s) => {
        s.accounts = accounts;
        return { count: accounts.length };
      });
    } else if (job.pipeline === "social_analytics_daily")
      result = await analyticsRefresh(tenant, job.entityId, provider, active);
    else if (job.pipeline === "influencer_discovery") {
      const c = readState(tenant.id).campaigns.find(
        (c) => c.id === job.entityId,
      );
      if (!c) throw new Error("SOCIAL_NOT_FOUND");
      const rows = await provider.discover(
        [c.brand, c.audience, c.language].join(" ").slice(0, 180),
      );
      if (!active()) throw new Error("SOCIAL_ACCESS");
      result = updateState(tenant.id, (s) => {
        let count = 0;
        for (const r of rows) {
          if (
            s.creators.some(
              (x) =>
                x.campaignId === c.id &&
                x.platform === "youtube" &&
                x.handle === r.handle,
            )
          )
            continue;
          const candidate = {
            ...r,
            source: r.url,
            campaignId: c.id,
            platform: "youtube" as const,
            observedAt: stamp(),
            followers: null,
            posts: [],
            fit: null,
            fitEvidence: "",
          };
          s.creators.push({
            ...candidate,
            id: uuid(),
            version: 1,
            createdBy: job.requestedBy,
            status: "DISCOVERED",
            score: scoreCreator(candidate),
          });
          count++;
        }
        return { candidates: count };
      });
    } else
      result = updateState(tenant.id, (s) => {
        jobFor(s, job.id, input.lease);
        if (
          ["social_content_intake", "social_publish_prepare"].includes(
            job.pipeline,
          )
        ) {
          const p = s.posts.find((p) => p.id === job.entityId)!;
          if (
            !p ||
            digest(entitySnapshot(s, "POST_APPROVE", p.id)) !== job.inputHash
          )
            throw new Error("SOCIAL_CHANGED");
          p.policy = postPolicy(
            p,
            s.campaigns.find((c) => c.id === p.campaignId)!,
          );
          return { entityId: p.id, policy: p.policy };
        }
        if (job.pipeline === "influencer_scoring_vetting") {
          const c = s.creators.find((c) => c.id === job.entityId)!;
          if (!c) throw new Error("SOCIAL_NOT_FOUND");
          if (digest(entitySnapshot(s, "CREATOR_VET", c.id)) !== job.inputHash)
            throw new Error("SOCIAL_CHANGED");
          c.score = scoreCreator(c);
          if (c.status === "DISCOVERED") c.status = "SCORED";
          return { entityId: c.id, score: c.score };
        }
        const o = s.outreach.find((o) => o.id === job.entityId);
        if (!o) throw new Error("SOCIAL_NOT_FOUND");
        if (
          digest(entitySnapshot(s, "OUTREACH_APPROVE", o.id)) !== job.inputHash
        )
          throw new Error("SOCIAL_CHANGED");
        return {
          entityId: o.id,
          status: o.status,
          delivery: "manual-after-approval",
        };
      });
    return updateState(tenant.id, (s) => {
      const j = jobFor(s, job.id, input.lease);
      j.status = "completed";
      j.finishedAt = stamp();
      j.resultHash = digest(result);
      audit(s, "zenml", "pipeline-completed", j.id);
      return {
        jobId: j.id,
        zenmlRunId: j.zenmlRunId,
        status: j.status,
        inputHash: j.inputHash,
        resultHash: j.resultHash,
      };
    });
  } catch (error) {
    return updateState(tenant.id, (s) => {
      const j = s.jobs.find((j) => j.id === job.id)!;
      if (j.lease !== input.lease) throw new Error("SOCIAL_LEASE_EXPIRED");
      j.error = code(error);
      j.status =
        job.pipeline === "social_publish_execute" &&
        ["SOCIAL_UNCERTAIN", "SOCIAL_PROVIDER_ERROR"].includes(j.error)
          ? "uncertain"
          : "failed";
      j.finishedAt = stamp();
      audit(s, "zenml", "pipeline-" + j.status, j.id);
      return {
        jobId: j.id,
        status: j.status,
        error: j.error,
        zenmlRunId: j.zenmlRunId,
      };
    });
  }
}
const workersSchema = z.record(
  z.string().regex(/^[a-f0-9]{64}$/),
  z
    .object({
      tenant: z.string().refine(validTenantId),
      pipelines: z.array(z.enum(pipelines)).min(1),
    })
    .strict(),
);
export function socialWorkerRouter(cloud?: CloudAccess) {
  const router = Router();
  router.use((req, res, next) => {
    try {
      const token = req.headers.authorization?.match(
        /^Bearer ([a-zA-Z0-9_-]{32,256})$/,
      )?.[1];
      if (!token) return res.status(401).json({ error: "SOCIAL_ACCESS" });
      if (!process.env.SOCIAL_WORKERS_FILE)
        return res.status(503).json({ error: "SOCIAL_WORKER_UNAVAILABLE" });
      const config = workersSchema.parse(
        JSON.parse(fs.readFileSync(process.env.SOCIAL_WORKERS_FILE, "utf8")),
      )[createHash("sha256").update(token).digest("hex")];
      if (!config) return res.status(403).json({ error: "SOCIAL_ACCESS" });
      const tenant = new TenantStore().get(config.tenant);
      if (tenant?.status !== "active")
        return res.status(403).json({ error: "SOCIAL_ACCESS" });
      cloud?.authorize(tenant.id, "/worker/social", { consume: req.path === "/execute" });
      res.locals.worker = { config, tenant };
      next();
    } catch (error) {
      if (error instanceof CloudAccessError) return res.status(error.status).json({ error: error.code });
      return res.status(503).json({ error: "SOCIAL_WORKER_UNAVAILABLE" });
    }
  });
  router.post("/claim", (req, res) => {
    try {
      z.object({}).strict().parse(req.body);
      const { config } = res.locals.worker;
      res.json({ job: claim(config.tenant, config.pipelines) });
    } catch {
      res.status(400).json({ error: "SOCIAL_INVALID" });
    }
  });
  router.post("/execute", async (req, res) => {
    try {
      const i = z
        .object({ id, lease: z.string().uuid(), zenmlRunId: z.string().uuid() })
        .strict()
        .parse(req.body);
      const { config, tenant } = res.locals.worker;
      const job = readState(tenant.id).jobs.find((j) => j.id === i.id);
      if (!job || !config.pipelines.includes(job.pipeline))
        return res.status(403).json({ error: "SOCIAL_ACCESS" });
      res.json(await executeJob(tenant, i));
    } catch (e) {
      res.status(400).json({ error: code(e) });
    }
  });
  return router;
}
