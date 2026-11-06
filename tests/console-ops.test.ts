import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { addPrompt, listPrompts, removePrompt, addRankKeyword, listRankKeywords, insertRankSnapshot, lastRankSnapshots, listRankSnapshots, insertAlert, listAlerts, acknowledgeAlert, readAutomationConfig, writeAutomationConfig, recordVisibilityRun, listVisibilityRuns, closeOpsStores } from "../src/console/ops-store.js";
import { runVisibilityCheck, engineStatuses, visibilityDelta } from "../src/console/visibility-runner.js";
import { extractOrganicPositions, checkKeywordRank, runRankCheck, rankBoard, alertForRankDrop } from "../src/console/rank-tracking.js";
import { buildBrief, buildDraftSkeleton, produceDraft, qualityGates, wpConfigFromEnv, publishToWordPress } from "../src/console/content-ops.js";
import { runDueJobs, stopScheduler, alertOnVisibilityLoss } from "../src/console/ops-scheduler.js";
import { TenantStore, type Tenant } from "../src/tenants/store.js";

const dir = () => mkdtempSync(path.join(tmpdir(), "ops-"));
afterEach(() => { closeOpsStores(); stopScheduler(); vi.unstubAllEnvs(); });

describe("ops store (T-2/T-4/T-11)", () => {
  it("manages the prompt pool with dedupe and bounds", () => {
    process.env.OPS_STORE_PATH = dir();
    addPrompt("acme", "quel est le meilleur outil GA4 ?");
    expect(() => addPrompt("acme", "quel est le meilleur outil GA4 ?")).toThrow(/déjà suivi/);
    expect(listPrompts("acme")).toHaveLength(1);
    expect(removePrompt("acme", listPrompts("acme")[0].id)).toBe(true);
    expect(removePrompt("acme", "missing")).toBe(false);
  });
  it("stores rank keywords, snapshots and computes latest per keyword", () => {
    process.env.OPS_STORE_PATH = dir();
    const k = addRankKeyword("acme", "audit SEO", "fr-fr");
    insertRankSnapshot("acme", { id: "s1", keywordId: k.id, checkedAt: "2026-01-01T00:00:00Z", position: 12, url: "https://acme.fr/a", aiOverview: false, citedInAiOverview: false });
    insertRankSnapshot("acme", { id: "s2", keywordId: k.id, checkedAt: "2026-01-02T00:00:00Z", position: 7, url: "https://acme.fr/a", aiOverview: true, citedInAiOverview: true });
    expect(lastRankSnapshots("acme").get(k.id)?.position).toBe(7);
    expect(listRankSnapshots("acme", k.id).map((s) => s.position)).toEqual([12, 7]);
    expect(listRankKeywords("acme")).toHaveLength(1);
  });
  it("stores alerts with acknowledge flow and automation config", () => {
    process.env.OPS_STORE_PATH = dir();
    const alert = insertAlert("acme", { kind: "rank-drop", severity: "warn", title: "chute", detail: "détail", payload: { a: 1 } });
    expect(listAlerts("acme", false)).toHaveLength(1);
    expect(listAlerts("acme", false)[0].payload).toEqual({ a: 1 });
    expect(acknowledgeAlert("acme", alert.id)).toBe(true);
    expect(listAlerts("acme", false)).toHaveLength(0);
    expect(readAutomationConfig("acme")).toEqual({});
    writeAutomationConfig("acme", { promptChecks: { enabled: true, intervalHours: 24, engines: ["openai"] } });
    expect(readAutomationConfig("acme").promptChecks?.enabled).toBe(true);
  });
});

describe("visibility runner (T-1)", () => {
  it("runs a bounded check through the mocked OpenAI transport and stores a dataset", async () => {
    const storeDir = dir();
    process.env.OPS_STORE_PATH = storeDir;
    process.env.AI_VISIBILITY_PATH = path.join(storeDir, "ai-visibility");
    process.env.AI_VISIBILITY_OPENAI_KEY_ACME = "sk-test";
    addPrompt("acme", "quel outil pour auditer GA4 ?");
    const transport = vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "Pour auditer GA4, Acme est l'outil de référence selon les études 2026.", annotations: [] }] }] }),
    }) as unknown as Response);
    const { run, results } = await runVisibilityCheck("acme", { engines: ["openai"], brands: [{ name: "Acme" }], transport: transport as unknown as typeof fetch });
    expect(run.succeeded).toBe(1);
    expect(results[0].datasetId).toBeTruthy();
    expect(listVisibilityRuns("acme")).toHaveLength(1);
    // The dataset landed in the competition store (existing review workflow).
    const { listDatasets, closeVisibilityStores } = await import("../src/console/ai-visibility-store.js");
    const datasets = listDatasets<{ brands: unknown[]; observations: unknown[] }>("acme");
    expect(datasets).toHaveLength(1);
    expect(datasets[0].observations).toHaveLength(1);
    closeVisibilityStores();
  });
  it("reports unconfigured engines without failing the run", async () => {
    process.env.OPS_STORE_PATH = dir();
    addPrompt("acme", "test prompt");
    const { results } = await runVisibilityCheck("acme", { engines: ["gemini"], brands: [{ name: "Acme" }] });
    expect(results[0].error).toMatch(/Clé API non configurée/);
  });
  it("lists engine statuses and computes dataset deltas", () => {
    expect(engineStatuses("acme").map((e) => e.id)).toEqual(["openai", "gemini"]);
    expect(visibilityDelta([{ id: "1", createdAt: "", count: 3 }, { id: "2", createdAt: "", count: 5 }])).toEqual({ previous: 3, current: 5, delta: 2 });
    expect(visibilityDelta([{ id: "1", createdAt: "", count: 3 }])).toBeNull();
  });
});

describe("rank tracking (T-3/T-4)", () => {
  it("extracts tenant positions from SERP html", () => {
    const html = `<div><a href="https://other.com/x">Other</a><a href="https://acme.fr/guide">Guide Acme</a><a href="https://www.acme.fr/other">Acme autre</a></div>`;
    const found = extractOrganicPositions(html, "acme.fr");
    expect(found.map((f) => f.url)).toEqual(["https://acme.fr/guide", "https://www.acme.fr/other"]);
  });
  it("checks a keyword, stores a snapshot and alerts on drops", async () => {
    process.env.OPS_STORE_PATH = dir();
    const k = addRankKeyword("acme", "audit SEO");
    insertRankSnapshot("acme", { id: "prev", keywordId: k.id, checkedAt: "2026-01-01T00:00:00Z", position: 4, url: "https://acme.fr/a", aiOverview: false, citedInAiOverview: false });
    const supplier = vi.fn(async () => ({ positions: [{ position: 3, url: "https://acme.fr/a", title: "Guide" }, { position: 8, url: "https://sub.acme.fr/b", title: "Sub" }], aiOverview: { present: true, citedUrls: ["https://acme.fr/a"] } }));
    const outcome = await checkKeywordRank("acme", k, "acme.fr", supplier as unknown as never, { alertThreshold: 3 });
    expect(outcome.snapshot?.position).toBe(3);
    expect(outcome.snapshot?.citedInAiOverview).toBe(true);
    expect(outcome.changed).toBe(true);
    // 4 -> 3 is an improvement: no alert expected.
    expect(listAlerts("acme", true).filter((a) => a.kind === "rank-drop")).toHaveLength(0);
    // Now a real drop 3 -> 14 creates a critical alert.
    const supplier2 = vi.fn(async () => ({ positions: [{ position: 14, url: "https://acme.fr/a", title: "Guide" }] }));
    await checkKeywordRank("acme", k, "acme.fr", supplier2 as unknown as never, { alertThreshold: 3 });
    const drops = listAlerts("acme", true).filter((a) => a.kind === "rank-drop");
    expect(drops).toHaveLength(1);
    expect(drops[0].severity).toBe("critical");
  });
  it("alerts only at or beyond the threshold", () => {
    process.env.OPS_STORE_PATH = dir();
    alertForRankDrop("acme", "kw", 5, 7, 3);
    expect(listAlerts("acme", true).filter((a) => a.kind === "rank-drop")).toHaveLength(0);
    alertForRankDrop("acme", "kw2", 5, 8, 3);
    expect(listAlerts("acme", true).filter((a) => a.kind === "rank-drop")).toHaveLength(1);
  });
  it("surfaces the board with history", async () => {
    process.env.OPS_STORE_PATH = dir();
    const k = addRankKeyword("acme", "audit SEO");
    insertRankSnapshot("acme", { id: "s1", keywordId: k.id, checkedAt: "2026-01-01T00:00:00Z", position: 9, url: null, aiOverview: false, citedInAiOverview: false });
    const board = rankBoard("acme");
    expect(board[0].position).toBe(9);
    expect(board[0].history).toEqual([9]);
  });
});

describe("content pipeline (T-9)", () => {
  it("builds a deterministic brief with intent detection", () => {
    const brief = buildBrief({ keyword: "audit GA4", brand: "Acme", audience: "PME" });
    expect(brief.intent).toBe("informational");
    expect(buildBrief({ keyword: "logiciel audit GA4 vs alternatives" }).intent).toBe("commercial");
    expect(brief.faq.length).toBeGreaterThanOrEqual(4);
    expect(brief.angles.length).toBeGreaterThanOrEqual(3);
  });
  it("produces a deterministic draft skeleton that passes structure gates", async () => {
    process.env.OPS_STORE_PATH = dir();
    const brief = buildBrief({ keyword: "audit GA4", brand: "Acme" });
    const skeleton = buildDraftSkeleton(brief);
    expect(skeleton.slug).toMatch(/^[a-z0-9-]+$/);
    expect(skeleton.outline.length).toBeGreaterThan(3);
    const draft = await produceDraft(brief, "deterministic");
    expect(draft.generatedBy).toBe("deterministic");
    expect(draft.gates.some((g) => g.check === "title.length" && g.passed)).toBe(true);
    expect(draft.outline.some((s) => /FAQ/i.test(s.h2))).toBe(true);
  });
  it("quality gates fail short word counts and missing faq", () => {
    const gates = qualityGates({ title: "ok title length around forty chars", metaDescription: "x".repeat(130), outline: [{ h2: "Intro", bullets: [] }], body: "court" });
    const map = Object.fromEntries(gates.map((g) => [g.check, g.passed]));
    expect(map["word-count"]).toBe(false);
    expect(map["faq-section"]).toBe(false);
  });
});

describe("wordpress publishing (T-10)", () => {
  it("reads config from env and publishes as draft via mocked transport", async () => {
    process.env.WP_SITE_URL_ACME = "https://acme.fr";
    process.env.WP_USERNAME_ACME = "editor";
    process.env.WP_APP_PASSWORD_ACME = "xxxx xxxx xxxx xxxx";
    const config = wpConfigFromEnv("acme");
    expect(config?.siteUrl).toBe("https://acme.fr");
    const transport = vi.fn(async () => ({ ok: true, json: async () => ({ id: 42, link: "https://acme.fr/?p=42" }) }) as unknown as Response);
    const result = await publishToWordPress(config!, { title: "Test", slug: "test", body: "Contenu" }, transport as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.postId).toBe(42); expect(result.link).toContain("acme.fr"); }
    const [, init] = transport.mock.calls[0] as [unknown, RequestInit];
    expect(JSON.parse(String(init.body)).status).toBe("draft");
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
  });
  it("returns a typed error on failure", async () => {
    const transport = vi.fn(async () => ({ ok: false, text: async () => "forbidden" }) as unknown as Response);
    const result = await publishToWordPress({ siteUrl: "https://acme.fr", username: "u", appPassword: "p" }, { title: "t", slug: "t", body: "b" }, transport as unknown as typeof fetch);
    expect(result.ok).toBe(false);
  });
});

describe("automation scheduler (T-11)", () => {
  it("runs due jobs for tenants with automation enabled and records last-run stamps", async () => {
    const storeDir = dir();
    process.env.OPS_STORE_PATH = storeDir;
    process.env.AI_VISIBILITY_PATH = path.join(storeDir, "ai-visibility");
    const tenants = new TenantStore(path.join(storeDir, "tenants.json"));
    const t: Tenant = { id: "acme", name: "Acme", mode: "organization", issuer: "https://example.org", domains: ["acme.fr"], emailDomains: [], gscProperties: [], branding: {}, identityProviders: [], status: "active", createdAt: "2026-01-01" };
    tenants.upsert(t);
    // No automation configured: nothing to run.
    const first = await runDueJobs({ tenantStore: tenants });
    expect(first.jobs).toBe(0);
    // Enable rank checks with a mocked supplier through env-driven transport.
    writeAutomationConfig("acme", { rankChecks: { enabled: true, intervalHours: 1 } });
    process.env.RANK_SUPPLIER_URL = "https://serp.example/api";
    process.env.RANK_SUPPLIER_TOKEN = "tok";
    addRankKeyword("acme", "audit SEO");
    const { supplierFromEnv } = await import("../src/console/rank-tracking.js");
    const mocked = vi.spyOn(await import("../src/console/rank-tracking.js"), "supplierFromEnv").mockReturnValue({ supplier: async () => ({ positions: [{ position: 5, url: "https://acme.fr/guide", title: "g" }] }), config: { provider: "test", note: "" } });
    void supplierFromEnv;
    const second = await runDueJobs({ tenantStore: tenants });
    expect(second.jobs).toBe(1);
    expect(second.details[0]?.status).toBe("ok:1");
    expect(readAutomationConfig("acme").lastRankRun).toBeTruthy();
    mocked.mockRestore();
  });
  it("records a visibility-loss alert when mentions drop", () => {
    process.env.OPS_STORE_PATH = dir();
    alertOnVisibilityLoss("acme", { count: 2 }, { count: 5 });
    const alerts = listAlerts("acme", true).filter((a) => a.kind === "visibility-loss");
    expect(alerts).toHaveLength(1);
    alertOnVisibilityLoss("acme", { count: 6 }, { count: 5 });
    expect(listAlerts("acme", true).filter((a) => a.kind === "visibility-loss")).toHaveLength(1);
  });
});
