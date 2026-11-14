import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import * as social from "../src/social/service.js";
import {
  readState,
  updateState,
  closeSocialStores,
} from "../src/social/store.js";
import { claim, executeJob, readback } from "../src/social/worker.js";
import { SocialProvider, capabilities } from "../src/social/provider.js";
import {
  digest,
  expire,
  type Campaign,
  type Post,
} from "../src/social/model.js";
import { scoreCreator, analytics } from "../src/social/policy.js";
import { socialMcpDefinitions } from "../src/console/social-mcp.js";
import { socialPrincipal } from "../src/console/social.js";
import type { Tenant } from "../src/tenants/store.js";
const tenant: Tenant = {
  id: "acme",
  name: "Acme",
  mode: "organization",
  issuer: "https://sso.example",
  domains: ["example.com"],
  emailDomains: [],
  gscProperties: [],
  branding: {},
  identityProviders: [],
  status: "active",
  createdAt: new Date().toISOString(),
};
const author = { tenant, actor: "author", admin: true },
  reviewer = { tenant, actor: "reviewer", admin: true };
const key = () => randomUUID();
let dir: string;
let now: number;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "social-qa-"));
  vi.stubEnv("SOCIAL_PATH", path.join(dir, "social.db"));
  vi.stubEnv("SOCIAL_CONNECTIONS_DIR", dir);
  writeFileSync(
    path.join(dir, "acme.json"),
    JSON.stringify({
      postiz: {
        baseUrl: "https://postiz.example/api/public/v1",
        apiKey: "fixture-secret-only",
        writeEnabled: true,
        accounts: [
          { id: "account1", platform: "linkedin" },
          { id: "account2", platform: "bluesky" },
        ],
      },
    }),
  );
  now = Date.now();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
});
afterEach(() => {
  closeSocialStores();
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function campaign() {
  const c = social.saveCampaign(author, key(), {
    name: "Winter editorial",
    brand: "Acme",
    website: "https://example.com",
    language: "en",
    objective: "LEADS",
    audience: "Shoe buyers",
    brief: "Discuss hand-made shoes and fit.",
    products: [
      {
        name: "Bel Air",
        url: "https://example.com/bel-air",
        facts: "Leather shoes made in France.",
      },
    ],
    start: new Date(now - 86400000).toISOString(),
    end: new Date(now + 30 * 86400000).toISOString(),
  }).campaign;
  return social.transitionCampaign(author, key(), {
    id: c.id,
    version: c.version,
    status: "ACTIVE",
  }).campaign;
}
function draft(c = campaign(), many = false) {
  return social.savePost(author, key(), {
    post: {
      campaignId: c.id,
      title: "Bel Air shoes",
      productUrl: c.products[0].url,
      scheduledAt: new Date(now + 60000).toISOString(),
      variants: (many
        ? [
            ["account1", "linkedin"],
            ["account2", "bluesky"],
          ]
        : [["account1", "linkedin"]]
      ).map(([accountId, platform]) => ({
        platform,
        accountId,
        caption: "Bel Air: leather shoes made in France.",
        link: `https://example.com/bel-air?utm_source=${platform}&utm_medium=social&utm_campaign=${c.id}`,
        media: [],
      })),
    },
  }).post;
}
function approval(post: Post) {
  const a = social.requestApproval(author, key(), {
    type: "POST_APPROVE",
    entityId: post.id,
  }).approval;
  social.decide(reviewer, key(), {
    id: a.id,
    digest: a.digest,
    decision: "APPROVE",
    comment: "Content, account and date checked.",
  });
  return a;
}
function fakeProvider() {
  return {
    accounts: vi.fn(async () => [
      { id: "account1", platform: "linkedin", status: "ACTIVE" },
      { id: "account2", platform: "bluesky", status: "ACTIVE" },
    ]),
    publish: vi.fn(async (_p: Post, account: string) => "external-" + account),
    readPosts: vi.fn(async () => ({
      posts: [
        {
          id: "external-account1",
          integration: { id: "account1" },
          state: "PUBLISHED",
          releaseURL: "https://social.example/post/1",
        },
        {
          id: "external-account2",
          integration: { id: "account2" },
          state: "PUBLISHED",
          releaseURL: "https://social.example/post/2",
        },
      ],
    })),
  } as unknown as SocialProvider;
}
function publishJob(a: ReturnType<typeof approval>) {
  const result = social.execute(reviewer, key(), { approvalId: a.id });
  vi.setSystemTime(now + 60001);
  const j = claim(tenant.id, ["social_publish_execute"])!;
  expect(j.id).toBe(result.pipelineRunId);
  return { ...j, zenmlRunId: randomUUID() };
}
it("isolates client state, defaults to viewer and rejects off-client context", () => {
  const c = campaign(),
    p = draft(c);
  expect(
    social.socialState({ ...author, tenant: { ...tenant, id: "other" } }).posts,
  ).toEqual([]);
  expect(() =>
    social.saveCampaign({ ...author, admin: false }, key(), { ...c }),
  ).toThrow();
  const { id, version, status, createdBy, createdAt, ...input } = c;
  expect(() =>
    social.saveCampaign(author, key(), {
      ...input,
      website: "https://evil.test",
    }),
  ).toThrow("SOCIAL_SOURCE_OUTSIDE_CLIENT");
  expect(() =>
    social.requestApproval(
      { ...reviewer, tenant: { ...tenant, id: "other" } },
      key(),
      { type: "POST_APPROVE", entityId: p.id },
    ),
  ).toThrow("SOCIAL_NOT_FOUND");
});
it("requires exact independent human approval and keeps agents away from decision tools", () => {
  const p = draft(),
    a = social.requestApproval(author, key(), {
      type: "POST_APPROVE",
      entityId: p.id,
    }).approval;
  expect(() =>
    social.decide(author, key(), {
      id: a.id,
      digest: a.digest,
      decision: "APPROVE",
      comment: "yes",
    }),
  ).toThrow("SOCIAL_INDEPENDENT_APPROVER_REQUIRED");
  expect(() =>
    social.decide({ ...reviewer, agent: true }, key(), {
      id: a.id,
      digest: a.digest,
      decision: "APPROVE",
      comment: "yes",
    }),
  ).toThrow("SOCIAL_HUMAN_APPROVAL_REQUIRED");
  expect(
    socialMcpDefinitions
      .map((d) => d.name)
      .some((n) => /approve|publish|send|grant/.test(n)),
  ).toBe(false);
  expect(() =>
    socialPrincipal({
      tenancy: { tenant, role: "tenant-admin" },
      user: { sub: "bot", realm_access: { roles: ["ai-agent"] } },
    } as any),
  ).toThrow("SOCIAL_ACCESS");
});
it("idempotency returns the original object and rejects reuse with different input", () => {
  const c = campaign(),
    k = key();
  const p = {
    post: {
      campaignId: c.id,
      title: "Bel Air",
      productUrl: c.products[0].url,
      scheduledAt: new Date(now + 60000).toISOString(),
      variants: [
        {
          platform: "linkedin",
          accountId: "account1",
          caption: "Bel Air shoes",
          media: [],
        },
      ],
    },
  };
  const first = social.savePost(author, k, p);
  expect(social.savePost(author, k, p)).toEqual(first);
  expect(readState(tenant.id).posts).toHaveLength(1);
  expect(() =>
    social.savePost(author, k, { post: { ...p.post, title: "Changed" } }),
  ).toThrow("SOCIAL_IDEMPOTENCY_CONFLICT");
});
it("binds approval to account, content, date and campaign; edits revoke scheduled intents", () => {
  const p = draft(),
    a = approval(p);
  social.execute(reviewer, key(), { approvalId: a.id });
  const {
    id,
    version,
    createdAt,
    createdBy,
    status,
    targets,
    policy,
    connectorDigest,
    ...input
  } = p;
  social.savePost(author, key(), {
    id,
    version,
    post: {
      ...input,
      variants: [{ ...p.variants[0], caption: "Bel Air: revised facts." }],
    },
  });
  expect(readState(tenant.id).approvals[0].status).toBe("INVALIDATED");
  expect(
    readState(tenant.id).jobs.find(
      (j) => j.pipeline === "social_publish_execute",
    )?.status,
  ).toBe("revoked");
  expect(() => social.execute(reviewer, key(), { approvalId: a.id })).toThrow(
    "SOCIAL_APPROVAL_REQUIRED",
  );
});
it("campaign pause invalidates review and blocks pending publication", () => {
  const c = campaign(),
    p = draft(c),
    a = approval(p);
  social.execute(reviewer, key(), { approvalId: a.id });
  social.transitionCampaign(author, key(), {
    id: c.id,
    version: c.version,
    status: "PAUSED",
  });
  expect(readState(tenant.id).posts[0].status).toBe("NEEDS_REVISION");
  vi.setSystemTime(now + 60001);
  expect(claim(tenant.id, ["social_publish_execute"])).toBeNull();
});
it("keeps contributor drafts private to their author and denies edits to another author", () => {
  const p = draft();
  social.grant(author, key(), { actor: "writer", role: "contributor" });
  const writer = { tenant, actor: "writer", admin: false };
  expect(social.socialState(writer).posts).toHaveLength(0);
  const {
    id,
    version,
    createdAt,
    createdBy,
    status,
    targets,
    policy,
    connectorDigest,
    ...input
  } = p;
  expect(() =>
    social.savePost(writer, key(), { id, version, post: input }),
  ).toThrow("SOCIAL_CHANGED");
  expect(() =>
    social.queue(writer, key(), { pipeline: "social_account_sync" }),
  ).toThrow("SOCIAL_ACCESS");
});
it("uses the real account and checks readback before claiming a publication", async () => {
  const p = draft(),
    j = publishJob(approval(p)),
    provider = fakeProvider();
  provider.readPosts = vi.fn(async () => ({ posts: [] }));
  expect((await executeJob(tenant, j, provider, () => true)).status).toBe(
    "completed",
  );
  expect(readState(tenant.id).posts[0].status).toBe("ACCEPTED");
  expect(provider.publish).toHaveBeenCalledTimes(1);
  await expect(executeJob(tenant, j, provider, () => true)).rejects.toThrow(
    "SOCIAL_LEASE_EXPIRED",
  );
  provider.readPosts = vi.fn(async () => ({
    posts: [
      {
        id: "external-account1",
        integration: { id: "wrong-client" },
        state: "PUBLISHED",
        releaseURL: "https://social.example/1",
      },
    ],
  }));
  await readback(tenant.id, p.id, provider);
  expect(readState(tenant.id).posts[0].status).toBe("ACCEPTED");
  provider.readPosts = fakeProvider().readPosts;
  await readback(tenant.id, p.id, provider);
  expect(readState(tenant.id).posts[0].status).toBe("PUBLISHED");
  expect(provider.publish).toHaveBeenCalledTimes(1);
});
it("never replays a partial or ambiguous multi-account dispatch, including after expiry", async () => {
  const p = draft(campaign(), true),
    j = publishJob(approval(p)),
    provider = fakeProvider();
  provider.publish = vi.fn(async (_p: Post, account: string) => {
    if (account === "account2") throw new Error("timeout after acceptance");
    return "external-account1";
  });
  expect((await executeJob(tenant, j, provider, () => true)).status).toBe(
    "uncertain",
  );
  expect(readState(tenant.id).posts[0].targets.map((t) => t.status)).toEqual([
    "accepted",
    "uncertain",
  ]);
  vi.setSystemTime(now + 8 * 86400000);
  social.socialState(author);
  expect(readState(tenant.id).posts[0].status).toBe("UNCERTAIN");
  expect(claim(tenant.id, ["social_publish_execute"])).toBeNull();
  expect(provider.publish).toHaveBeenCalledTimes(2);
});
it("rechecks client activation and token validity immediately before dispatch", async () => {
  const p = draft(),
    j = publishJob(approval(p)),
    provider = fakeProvider();
  provider.accounts = vi.fn(async () => [
    {
      id: "account1",
      platform: "linkedin",
      name: "Account",
      status: "REVOKED",
      observedAt: new Date().toISOString(),
    },
  ]);
  expect((await executeJob(tenant, j, provider, () => true)).status).toBe(
    "failed",
  );
  expect(provider.publish).not.toHaveBeenCalled();
});
it("approval expiry and worker lease expiry cannot trigger an automatic resend", () => {
  const p = draft(),
    a = approval(p);
  social.execute(reviewer, key(), { approvalId: a.id });
  vi.setSystemTime(now + 8 * 86400000);
  expect(claim(tenant.id, ["social_publish_execute"])).toBeNull();
  expect(readState(tenant.id).approvals[0].status).toBe("EXPIRED");
});
it("scopes provider accounts and uses documented Postiz authorization and payload", async () => {
  const p = draft(),
    fetcher = vi.fn(
      async (url: any, init: any) =>
        new Response(
          JSON.stringify(
            init.method === "POST"
              ? [{ postId: "external-id", integration: "account1" }]
              : [
                  { id: "other", name: "Other client", identifier: "linkedin" },
                  { id: "account1", name: "Acme", identifier: "linkedin" },
                ],
          ),
          { status: 200 },
        ),
    );
  const provider = new SocialProvider(tenant.id, fetcher as any);
  expect((await provider.accounts()).map((a) => a.id)).toEqual(["account1"]);
  await provider.publish(p, "account1");
  const req = fetcher.mock.calls[1][1];
  expect(req.headers.Authorization).toBe("fixture-secret-only");
  const body = JSON.parse(req.body);
  expect(body.type).toBe("now");
  expect(body.posts[0].integration.id).toBe("account1");
  expect(body.posts[0].value[0].content).toContain(
    "utm_content=" + p.id + "_account1",
  );
  expect(req.redirect).toBe("error");
  expect(JSON.stringify(social.socialState(author))).not.toContain(
    "fixture-secret-only",
  );
});
it("keeps unknown creator metrics unknown and requires evidence for manual fit", () => {
  const score = scoreCreator({
    campaignId: "c",
    name: "Creator",
    platform: "youtube",
    handle: "creator",
    url: "https://youtube.com/creator",
    source: "https://youtube.com/creator",
    observedAt: new Date().toISOString(),
    followers: null,
    posts: [],
    fit: 100,
    fitEvidence: "",
  });
  expect(score).toMatchObject({ engagement: null, fit: null, composite: null });
  expect(score.flags).toContain("AUTHENTICITY_NOT_ESTABLISHED");
});
it("supports explicit vetting and exact outreach review without sending messages", () => {
  const c = campaign();
  const creator = social.saveCreator(author, key(), {
    campaignId: c.id,
    name: "Creator",
    platform: "youtube",
    handle: "channel",
    url: "https://youtube.com/channel/id",
    source: "https://youtube.com/channel/id",
    observedAt: new Date().toISOString(),
    followers: null,
  }).creator;
  const message = {
    creatorId: creator.id,
    campaignId: c.id,
    channel: "EMAIL",
    subject: "Collaboration",
    body: "Would you consider our Bel Air product?",
    consentEvidence: "Creator supplied a public business contact.",
  };
  expect(() => social.saveOutreach(author, key(), message)).toThrow(
    "SOCIAL_VETTING_REQUIRED",
  );
  const a = social.requestApproval(author, key(), {
    type: "CREATOR_VET",
    entityId: creator.id,
  }).approval;
  social.decide(reviewer, key(), {
    id: a.id,
    digest: a.digest,
    decision: "APPROVE",
    comment: "Profile and source reviewed.",
  });
  const o = social.saveOutreach(author, key(), message).outreach;
  const b = social.requestApproval(author, key(), {
    type: "OUTREACH_APPROVE",
    entityId: o.id,
  }).approval;
  social.decide(reviewer, key(), {
    id: b.id,
    digest: b.digest,
    decision: "APPROVE",
    comment: "Exact copy and consent checked.",
  });
  expect(readState(tenant.id).outreach[0].status).toBe("APPROVED");
  social.recordOutreach(reviewer, key(), {
    approvalId: b.id,
    sentAt: new Date().toISOString(),
    deliveryEvidence: "https://crm.example/receipt/1",
  });
  expect(readState(tenant.id).outreach[0].status).toBe("SENT");
  expect(capabilities(tenant.id).outreachDelivery).toBe(
    "manual-after-approval",
  );
});
it("keeps revisions append-only, distinguishes zero from missing and never sums reach", () => {
  const p = draft(),
    r = {
      postId: p.id,
      accountId: "account1",
      date: new Date(now).toISOString().slice(0, 10),
      source: "Manual platform export",
      observedAt: new Date().toISOString(),
      impressions: 100,
      reach: 70,
      likes: 0,
      comments: null,
      shares: null,
      saves: null,
      clicks: 0,
      ga4Sessions: null,
      ga4Conversions: null,
    };
  social.importAnalytics(author, key(), [r]);
  social.importAnalytics(author, key(), [
    { ...r, impressions: 200, clicks: 10 },
  ]);
  const report = social.analyticsReport(author, { from: r.date, to: r.date });
  expect(readState(tenant.id).observations).toHaveLength(2);
  expect(report.rows).toHaveLength(1);
  expect(report.rows[0].ctr).toBe(5);
  expect(report.rows[0].engagementRate).toBeNull();
  expect(report.reachTotal).toBeNull();
  expect(() =>
    social.importAnalytics(author, key(), [{ ...r, date: "2026-02-30" }]),
  ).toThrow("SOCIAL_INVALID");
});
it("hides worker leases from exports and maintains a verifiable audit chain", () => {
  const p = draft(),
    j = publishJob(approval(p));
  expect(JSON.stringify(social.exportSocial(author))).not.toContain(j.lease);
  let previous = "";
  for (const { hash, ...entry } of readState(tenant.id).audit) {
    expect(entry.previous).toBe(previous);
    expect(hash).toBe(digest(entry));
    previous = hash;
  }
});
it("enforces caption limits including attribution link and refuses unknown product context", () => {
  const p = draft();
  const s = readState(tenant.id),
    c = s.campaigns[0];
  const {
    id,
    version,
    createdAt,
    createdBy,
    status,
    targets,
    policy,
    connectorDigest,
    ...input
  } = p;
  const revised = social.savePost(author, key(), {
    id,
    version,
    post: {
      ...input,
      variants: [
        {
          ...p.variants[0],
          platform: "x",
          caption: "Bel Air " + "a".repeat(260),
        },
      ],
    },
  }).post;
  expect(revised.policy.errors).toContain("CAPTION_TOO_LONG");
  expect(() =>
    social.requestApproval(author, key(), {
      type: "POST_APPROVE",
      entityId: p.id,
    }),
  ).toThrow("SOCIAL_POLICY_REQUIRED");
  expect(c.id).toBe(p.campaignId);
});

it("invalidates publication when operator changes provider settings after review", async () => {
  const p = draft(),
    a = approval(p);
  writeFileSync(
    path.join(dir, "acme.json"),
    JSON.stringify({
      postiz: {
        baseUrl: "https://other-provider.example/api/public/v1",
        apiKey: "fixture-secret-only",
        writeEnabled: true,
        accounts: [{ id: "account1", platform: "linkedin" }],
      },
    }),
  );
  expect(() => social.execute(reviewer, key(), { approvalId: a.id })).toThrow(
    "SOCIAL_CHANGED",
  );
});
it("revised creator evidence invalidates vetting and any pending outreach approval", () => {
  const c = campaign(),
    input = {
      campaignId: c.id,
      name: "Maker",
      platform: "youtube",
      handle: "maker",
      url: "https://youtube.com/maker",
      source: "https://youtube.com/maker",
      observedAt: new Date().toISOString(),
      followers: 1000,
      posts: [],
      fit: 80,
      fitEvidence: "Relevant public leather craft tutorials.",
    };
  const maker = social.saveCreator(author, key(), input).creator,
    a = social.requestApproval(author, key(), {
      type: "CREATOR_VET",
      entityId: maker.id,
    }).approval;
  social.decide(reviewer, key(), {
    id: a.id,
    digest: a.digest,
    decision: "APPROVE",
    comment: "Reviewed.",
  });
  const o = social.saveOutreach(author, key(), {
      creatorId: maker.id,
      campaignId: c.id,
      channel: "DM",
      subject: "Collaboration",
      body: "We would like to discuss Bel Air shoes.",
      consentEvidence: "Creator supplied professional contact.",
    }).outreach,
    b = social.requestApproval(author, key(), {
      type: "OUTREACH_APPROVE",
      entityId: o.id,
    }).approval;
  social.updateCreator(author, key(), {
    id: maker.id,
    version: 1,
    creator: {
      ...input,
      fit: 20,
      fitEvidence: "Recent posts concern a different subject.",
    },
  });
  const state = readState(tenant.id);
  expect(state.approvals.find((x) => x.id === a.id)?.status).toBe(
    "INVALIDATED",
  );
  expect(state.approvals.find((x) => x.id === b.id)?.status).toBe(
    "INVALIDATED",
  );
  expect(state.outreach[0].status).toBe("NEEDS_REVISION");
});
it("can revise a rejected outreach draft without retaining its old approval", () => {
  const c = campaign(),
    maker = social.saveCreator(author, key(), {
      campaignId: c.id,
      name: "Maker",
      platform: "youtube",
      handle: "maker",
      url: "https://youtube.com/maker",
      source: "https://youtube.com/maker",
      observedAt: new Date().toISOString(),
      followers: null,
    }).creator,
    a = social.requestApproval(author, key(), {
      type: "CREATOR_VET",
      entityId: maker.id,
    }).approval;
  social.decide(reviewer, key(), {
    id: a.id,
    digest: a.digest,
    decision: "APPROVE",
    comment: "Reviewed.",
  });
  const input = {
      creatorId: maker.id,
      campaignId: c.id,
      channel: "EMAIL",
      subject: "Collaboration",
      body: "Discuss our Bel Air leather shoes.",
      consentEvidence: "Creator provided business contact.",
    },
    o = social.saveOutreach(author, key(), input).outreach,
    b = social.requestApproval(author, key(), {
      type: "OUTREACH_APPROVE",
      entityId: o.id,
    }).approval;
  social.decide(reviewer, key(), {
    id: b.id,
    digest: b.digest,
    decision: "CHANGES_REQUESTED",
    comment: "Explain the proposed collaboration.",
  });
  const revised = social.updateOutreach(author, key(), {
    id: o.id,
    version: 1,
    outreach: { ...input, body: "Would you review our Bel Air leather shoes?" },
  }).outreach;
  expect(revised.status).toBe("DRAFT");
  expect(revised.version).toBe(2);
  expect("approvalId" in revised).toBe(false);
});

it("reports a verified platform rejection separately and locks partial publication against replay", async () => {
  const post = draft(campaign(), true),
    job = publishJob(approval(post)),
    provider = fakeProvider();
  provider.readPosts = vi.fn(async () => ({
    posts: [
      {
        id: "external-account1",
        integration: { id: "account1" },
        state: "PUBLISHED",
        releaseURL: "https://social.example/1",
      },
      {
        id: "external-account2",
        integration: { id: "account2" },
        state: "ERROR",
        releaseURL: null,
      },
    ],
  }));
  await executeJob(tenant, job, provider, () => true);
  expect(readState(tenant.id).posts[0].status).toBe("PARTIAL");
  expect(readState(tenant.id).posts[0].targets[1].status).toBe("failed");
  expect(() =>
    social.requestApproval(author, key(), {
      type: "POST_APPROVE",
      entityId: post.id,
    }),
  ).toThrow("SOCIAL_CHANGED");
  expect(provider.publish).toHaveBeenCalledTimes(2);
});
