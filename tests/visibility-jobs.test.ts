import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectAIAccount } from "../src/console/ai-connections.js";
import { normalizeImport } from "../src/console/ai-visibility.js";
import { closeVisibilityStores, getDataset, insertDataset, removeAIConnection } from "../src/console/ai-visibility-store.js";
import { addPrompt, closeOpsStores } from "../src/console/ops-store.js";
import type { HandlerContext } from "../src/console/util.js";
import { collectScheduledAnswer } from "../src/visibility-jobs/provider.js";
import { visibilityScheduleRoutes } from "../src/visibility-jobs/routes.js";
import { processVisibilityJob, startVisibilityJobs } from "../src/visibility-jobs/runtime.js";
import { VisibilityJobStore, type Claim, type ScheduleInput } from "../src/visibility-jobs/store.js";

const dbUrl = process.env.TEST_AUDIT_DATABASE_URL;
const redisUrl = process.env.TEST_AUDIT_REDIS_URL;
const fixtureKey = "fixture-encrypted-account-key";
const panel = () => normalizeImport({ brands: [{ name: "Alpha", website: "https://alpha.example" }], responses: [
  { prompt: "Initial?", answer: "Alpha", source: "Fixture", observedAt: "2026-11-19T12:00:00Z" },
] });
const settings: ScheduleInput = { panelId: "panel", provider: "openai", accountId: "account", maxDailyCalls: 30, intervalHours: 24,
  estimateUsdMicros: 100, maxDailyUsdMicros: 10000 };
const prompts = (size: number) => Array.from({ length: size }, (_, index) => ({
  id: `prompt-${index}`, prompt: `Question ${index}?`, locale: "fr" as const, group: "test", createdAt: "",
}));
const completeReply = () => new Response(JSON.stringify({
  status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "Alpha works.", annotations: [] }] }],
}), { status: 200 });
const call = (tenantId: string, body: Record<string, unknown> = {}) => ({ tenancy: { tenant: { id: tenantId } }, body } as HandlerContext);

it.each([429, 503, 401])("classifies HTTP %i without replaying the request", async (status) => {
  const input = { config: settings, payload: prompts(1)[0], tenant_id: "acme", brands: panel().brands } as Claim;
  const transport = vi.fn(async () => new Response("redacted provider details", { status }));
  expect((await collectScheduledAnswer(input, { key: fixtureKey }, transport)).state).toBe(status === 429 ? "rate_limited" : status === 503 ? "uncertain" : "failed");
  expect(transport).toHaveBeenCalledTimes(1);
});
it("preserves the saved-account headers and declared prompt language", async () => {
  const input = { config: settings, payload: prompts(1)[0], tenant_id: "acme", brands: panel().brands } as Claim;
  const transport = vi.fn(async (_url, request) => { expect(request.headers["OpenAI-Project"]).toBe("proj_fixture"); return completeReply(); });
  expect(await collectScheduledAnswer(input, { key: fixtureKey, project: "proj_fixture" }, transport)).toMatchObject({ state: "succeeded", answer: { measurement: { language: "fr", mode: "api" } } });
});
it("keeps scheduling opt-in and protects its write operations", async () => {
  const routes = visibilityScheduleRoutes();
  expect(await routes[0].handler(call("acme"))).toEqual({ available: false });
  for (const route of routes.slice(1)) {
    expect(route.adminOnly).toBe(true);
    await expect(route.handler(call("acme"))).rejects.toThrow("Scheduled visibility is disabled");
  }
});

describe.skipIf(!dbUrl)("durable visibility with PostgreSQL", () => {
  let pool: Pool, store: VisibilityJobStore, workdir: string;
  beforeEach(async () => {
    workdir = mkdtempSync(join(tmpdir(), "gtm-visibility-jobs-"));
    vi.stubEnv("AI_VISIBILITY_PATH", join(workdir, "visibility"));
    vi.stubEnv("OPS_STORE_PATH", join(workdir, "ops"));
    vi.stubEnv("AI_CONNECTIONS_MASTER_KEY", "");
    pool = new Pool({ connectionString: dbUrl, max: 12 });
    store = new VisibilityJobStore(pool);
    await store.migrate();
    await pool.query("TRUNCATE gtm_visibility_units,gtm_visibility_runs,gtm_visibility_schedules,gtm_visibility_daily");
  });
  afterEach(async () => {
    await pool.end();
    closeVisibilityStores(); closeOpsStores();
    vi.unstubAllEnvs();
    rmSync(workdir, { recursive: true, force: true });
  });

  async function account() {
    return connectAIAccount("acme", { provider: "openai", label: "Fixture account", confirmed: true, key: fixtureKey },
      async () => new Response('{"data":[]}'));
  }
  async function plan(input = settings, size = 1) {
    await store.save("acme", input);
    const schedule = (await store.schedule("acme"))!;
    await store.plan(schedule, panel().brands, prompts(size), null);
  }

  it("stages more than ten prompts exactly once and blocks a second panel on the daily call and estimate caps", async () => {
    await store.save("acme", { ...settings, maxDailyCalls: 15 });
    const schedule = (await store.schedule("acme"))!;
    await Promise.all(Array.from({ length: 5 }, () => store.plan(schedule, panel().brands, prompts(12), null)));
    expect(await store.dispatchable()).toHaveLength(12);
    expect(await store.history("acme")).toMatchObject([{ planned: 12, reserved_micros: 1200, counts: { pending: 12 } }]);
    await plan({ ...settings, maxDailyCalls: 15 }, 12); // Same scope and UTC slot.
    expect(await store.history("acme")).toHaveLength(1);
    await plan({ ...settings, panelId: "other", maxDailyCalls: 15 }, 4);
    await plan({ ...settings, panelId: "another", maxDailyUsdMicros: 1250 });
    expect((await store.history("acme")).map((run) => run.decision)).toEqual(expect.arrayContaining([null, "quota_calls", "quota_cost"]));
    expect((await pool.query("SELECT calls,micros FROM gtm_visibility_daily")).rows).toEqual([{ calls: 12, micros: "1200" }]);
    expect(await store.history("globex")).toEqual([]);
  });

  it("recovers a lease before dispatch and fences both late results and paid replays after dispatch", async () => {
    await plan();
    const [id] = await store.dispatchable();
    const otherPool = new Pool({ connectionString: dbUrl, max: 2 });
    try {
      const other = new VisibilityJobStore(otherPool);
      const claims = await Promise.all([store.claim(id), other.claim(id)]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      const old = claims.find(Boolean)!;
      await pool.query("UPDATE gtm_visibility_units SET lease_until=now()-interval '1 second' WHERE id=$1", [id]);
      await other.recover();
      expect(await other.dispatchable()).toEqual([id]);
      const fresh = (await other.claim(id))!;
      expect(await store.beforeCall(old)).toBe(false);
      expect(await other.beforeCall(fresh)).toBe(true);
      await pool.query("UPDATE gtm_visibility_units SET lease_until=now()-interval '1 second' WHERE id=$1", [id]);
      await other.recover();
      expect(await store.finish(fresh, "succeeded", { observed: true })).toBe(false);
      expect(await other.dispatchable()).toEqual([]);
      expect(await store.history("acme")).toMatchObject([{ counts: { uncertain: 1 } }]);
    } finally { await otherPool.end(); }
  });

  it("stops paid dispatch for a disconnected account and preserves the run", async () => {
    const saved = await account();
    await plan({ ...settings, accountId: saved.id });
    const [id] = await store.dispatchable();
    removeAIConnection("acme", saved.id);
    vi.stubEnv("AI_VISIBILITY_OPENAI_KEY_ACME", "legacy-key-must-not-be-used");
    const collect = vi.fn();
    await processVisibilityJob(store, id, () => {}, collect);
    expect(collect).not.toHaveBeenCalled();
    expect(await store.history("acme")).toMatchObject([{ counts: { revoked: 1 } }]);
  });

  it("pauses pending work and accepts billed amounts only for finished runs owned by the workspace", async () => {
    await plan();
    const [id] = await store.dispatchable();
    const [run] = await store.history("acme");
    expect(await store.recordBilledCost("acme", run.id, 78)).toBe(false);
    await store.pause("acme");
    await store.recover();
    expect(await store.claim(id)).toBeNull();
    expect(await store.recordBilledCost("globex", run.id, 78)).toBe(false);
    expect(await store.recordBilledCost("acme", run.id, 78)).toBe(true);
    expect(await store.history("acme")).toMatchObject([{ billed_micros: 78, counts: { revoked: 1 } }]);
  });

  it.skipIf(!redisUrl)("drains a real BullMQ queue and publishes one legacy-compatible panel", async () => {
    vi.stubEnv("VISIBILITY_JOBS_ENABLED", "true");
    vi.stubEnv("AUDIT_DATABASE_URL", dbUrl);
    vi.stubEnv("AUDIT_REDIS_URL", redisUrl);
    const saved = await account();
    const seed = panel();
    insertDataset("acme", seed);
    for (const item of prompts(12)) addPrompt("acme", item.prompt, item.group, { locale: "fr" });
    await store.save("acme", { ...settings, panelId: seed.id, accountId: saved.id });
    const collect = vi.fn(async (claim: Claim, credential) => collectScheduledAnswer(claim, credential,
      async () => claim.payload.prompt === "Question 0?" ? new Response("", { status: 429 }) : completeReply()));
    const runtime = await startVisibilityJobs(undefined, { isActive: (id) => id === "acme", collect });
    try {
      await vi.waitFor(async () => {
        const [run] = await store.history("acme");
        expect(run).toMatchObject({ dataset_id: expect.any(String), counts: { succeeded: 11, rate_limited: 1 } });
        expect(getDataset("acme", run.dataset_id)?.observations).toHaveLength(11);
        expect(getDataset("globex", run.dataset_id)).toBeUndefined();
      }, { timeout: 20_000, interval: 250 });
      expect(collect).toHaveBeenCalledTimes(12);
      expect(JSON.stringify((await pool.query("SELECT config FROM gtm_visibility_runs")).rows)).not.toContain(fixtureKey);
    } finally { await runtime?.close(); }
  }, 30_000);
});
