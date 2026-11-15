import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
vi.mock("../src/google/data-api.js", () => ({ runReport: vi.fn() }));
vi.mock("../src/auth/service-account.js", () => ({
  withCredential: vi.fn(async (_credential, run) => run()),
}));
import { runReport } from "../src/google/data-api.js";
import { closeSocialStores, readState } from "../src/social/store.js";
import * as social from "../src/social/service.js";
import { claim, executeJob } from "../src/social/worker.js";
import { SocialProvider } from "../src/social/provider.js";
import type { Tenant } from "../src/tenants/store.js";
const tenant: Tenant = {
  id: "social-analytics",
  name: "Example",
  mode: "organization",
  issuer: "https://sso.example",
  domains: ["example.com"],
  emailDomains: [],
  gscProperties: [],
  ga4Properties: ["123", "456"],
  branding: {},
  identityProviders: [],
  status: "active",
  createdAt: new Date().toISOString(),
};
const p = { tenant, actor: "author", admin: true };
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "social-analytics-"));
  vi.stubEnv("SOCIAL_PATH", path.join(dir, "db"));
  vi.stubEnv("SOCIAL_CONNECTIONS_DIR", path.join(dir, "unconfigured"));
  vi.mocked(runReport).mockReset();
});
afterEach(() => {
  closeSocialStores();
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
function context(property?: string) {
  const c = social.saveCampaign(p, randomUUID(), {
    name: "Shoes",
    brand: "Example",
    website: "https://example.com",
    language: "en",
    objective: "LEADS",
    audience: "Leather shoe buyers",
    brief: "Explain our leather shoes.",
    products: [
      {
        name: "Bel Air",
        url: "https://example.com/product",
        facts: "Leather shoes made in France.",
      },
    ],
    start: new Date().toISOString(),
    end: new Date(Date.now() + 86400000 * 30).toISOString(),
    ...(property ? { ga4Property: property } : {}),
  }).campaign;
  const post = social.savePost(p, randomUUID(), {
    post: {
      campaignId: c.id,
      title: "Bel Air",
      productUrl: c.products[0].url,
      scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      variants: [
        {
          platform: "linkedin",
          accountId: "first",
          caption: "Bel Air leather shoes",
          media: [],
          link: `https://example.com/product?utm_source=linkedin&utm_medium=social&utm_campaign=${c.id}`,
        },
        {
          platform: "bluesky",
          accountId: "second",
          caption: "Bel Air leather shoes",
          media: [],
          link: `https://example.com/product?utm_source=bluesky&utm_medium=social&utm_campaign=${c.id}`,
        },
      ],
    },
  }).post;
  social.queue(p, randomUUID(), {
    pipeline: "social_analytics_daily",
    campaignId: c.id,
  });
  const j = claim(tenant.id, ["social_analytics_daily"])!;
  return { c, post, j: { ...j, zenmlRunId: randomUUID() } };
}
it("attributes GA4 rows to the exact post/account and selected authorised property", async () => {
  const { post, j, c } = context("456");
  vi.mocked(runReport).mockResolvedValue({
    rows: [
      {
        date: "20261110",
        sessionManualAdContent: post.id + "_second",
        sessions: "12",
        keyEvents: "2",
      },
      {
        date: "20261110",
        sessionManualAdContent: "foreign-post_second",
        sessions: "999",
        keyEvents: "9",
      },
    ],
  } as any);
  expect(
    (await executeJob(tenant, j, new SocialProvider(tenant.id), () => true))
      .status,
  ).toBe("completed");
  const rows = readState(tenant.id).observations;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    accountId: "second",
    source: "GA4 456",
    ga4Sessions: 12,
    ga4Conversions: 2,
    impressions: null,
  });
  expect(runReport).toHaveBeenCalledWith(
    expect.objectContaining({
      propertyId: "456",
      dimensions: ["date", "sessionManualAdContent"],
    }),
  );
  expect(JSON.stringify(vi.mocked(runReport).mock.calls[0])).toContain(c.id);
});
it("does not silently pick the first property when several are authorised", async () => {
  const { j } = context();
  const result = await executeJob(
    tenant,
    j,
    new SocialProvider(tenant.id),
    () => true,
  );
  expect(result.status).toBe("failed");
  expect("error" in result && result.error).toBe(
    "SOCIAL_GA4_PROPERTY_REQUIRED",
  );
  expect(runReport).not.toHaveBeenCalled();
});
it("rejects another client property before saving a campaign", () => {
  expect(() => context("999")).toThrow("SOCIAL_ACCESS");
  expect(readState(tenant.id).campaigns).toHaveLength(0);
});
