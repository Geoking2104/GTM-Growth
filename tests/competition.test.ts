import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeVisibilityStores, insertDataset } from "../src/console/ai-visibility-store.js";
import { competitionRoutes } from "../src/console/competition.js";
import type { HandlerContext } from "../src/console/util.js";
const previous = process.env.AI_VISIBILITY_PATH;
afterEach(() => { closeVisibilityStores(); if (previous === undefined) delete process.env.AI_VISIBILITY_PATH; else process.env.AI_VISIBILITY_PATH = previous; });
const ctx = (id: string, body: Record<string, unknown> = {}) => ({ url: "", body, tenancy: { tenant: { id } } } as HandlerContext);
const route = (path: string) => competitionRoutes.find((r) => r.path === path)!;
describe("competition tenant data", () => {
  it("isolates panels and actions, checks dataset ownership and restricts mutation routes", async () => {
    process.env.AI_VISIBILITY_PATH = mkdtempSync(path.join(tmpdir(), "competition-"));
    insertDataset("acme", { id: "d1", createdAt: "2026-01-01", brands: [{ name: "Alpha" }, { name: "Beta" }], observations: [] });
    expect(route("/competition/panel").adminOnly).toBe(true); expect(route("/competition/action").adminOnly).toBe(true);
    await expect(route("/competition/panel").handler(ctx("globex", { datasetId: "d1", brand: "Alpha" }))).rejects.toThrow();
    await expect(route("/competition/panel").handler(ctx("acme", { datasetId: "d1", brand: "Missing" }))).rejects.toThrow();
    await route("/competition/panel").handler(ctx("acme", { datasetId: "d1", brand: "Alpha" }));
    await route("/competition/action").handler(ctx("acme", { datasetId: "d1", title: "Improve comparison", owner: "Marie", prompt: "Question", status: "todo" }));
    const state = await route("/competition/state").handler(ctx("acme")) as { panels: Record<string, string>; actions: Array<{ id: string; title: string }> };
    expect(state.panels.d1).toBe("Alpha"); expect(state.actions).toHaveLength(1);
    expect(await route("/competition/state").handler(ctx("globex"))).toEqual({ panels: {}, actions: [] });
    await expect(route("/competition/action").handler(ctx("globex", { id: state.actions[0].id, datasetId: "d1", title: "Change", status: "done" }))).rejects.toThrow();
    await expect(route("/competition/action").handler(ctx("acme", { datasetId: "d1", title: "Invalid", status: "bogus" }))).rejects.toThrow();
  });
  it("versions an edited panel without changing the original observations", async () => {
    process.env.AI_VISIBILITY_PATH = mkdtempSync(path.join(tmpdir(), "competition-"));
    const { normalizeImport } = await import("../src/console/ai-visibility.js");
    const original = normalizeImport({ brands: [{ name: "Alpha" }], responses: [{ prompt: "Who?", answer: "Beta is good.", source: "Manual", observedAt: "2026-01-01T00:00:00Z" }] });
    insertDataset("acme", original);
    const revised = await route("/competition/revise-panel").handler(ctx("acme", { datasetId: original.id, brands: [{ name: "Alpha" }, { name: "Beta" }] })) as { id: string };
    const { getDataset } = await import("../src/console/ai-visibility-store.js");
    expect(revised.id).not.toBe(original.id);
    expect(getDataset("acme", original.id)).toEqual(original);
    expect(getDataset("globex", revised.id)).toBeUndefined();
    expect(route("/competition/revise-panel").adminOnly).toBe(true);
  });
  it("persists per-question priority and rejects another tenant's page", async () => {
    process.env.AI_VISIBILITY_PATH = mkdtempSync(path.join(tmpdir(), "competition-"));
    insertDataset("acme", { id: "d1", createdAt: "2026-01-01", brands: [], observations: [{ prompt: "Who?" }] });
    const tenantCtx = (body: Record<string, unknown>) => ({ url: "", body, tenancy: { tenant: { id: "acme", domains: ["acme.test"] } } } as HandlerContext);
    const body = { datasetId: "d1", prompt: "Who?", importance: 3, effort: 1, page: "https://acme.test/compare" };
    expect(route("/competition/priority").adminOnly).toBe(true);
    await route("/competition/priority").handler(tenantCtx(body));
    const state = await route("/competition/state").handler(tenantCtx({})) as { priorities: Array<typeof body> };
    expect(state.priorities).toEqual([body]);
    await expect(route("/competition/priority").handler(tenantCtx({ ...body, page: "https://evil.test/" }))).rejects.toThrow();
    await expect(route("/competition/priority").handler(tenantCtx({ ...body, prompt: "not in data" }))).rejects.toThrow();
    expect(await route("/competition/state").handler(ctx("globex"))).toEqual({ panels: {}, actions: [] });
  });
  it("isolates alert settings, validates thresholds, and permits disabling", async () => {
    process.env.AI_VISIBILITY_PATH = mkdtempSync(path.join(tmpdir(), "competition-"));
    insertDataset("acme", { id: "d1", createdAt: "2026-01-01", brands: [{ name: "Alpha", aliases: ["Alpha"] }], observations: [] });
    const config = { datasetId: "d1", brand: "Alpha", windowDays: 7, minPerWindow: 5, threshold: 10 };
    expect(route("/competition/alert-config").adminOnly).toBe(true);
    await expect(route("/competition/alert-config").handler(ctx("globex", config))).rejects.toThrow();
    await expect(route("/competition/alert-config").handler(ctx("acme", { ...config, minPerWindow: 1 }))).rejects.toThrow();
    await route("/competition/alert-config").handler(ctx("acme", config));
    expect((await route("/competition/alert").handler(ctx("acme")) as { state: string }).state).toBe("insufficient");
    expect(await route("/competition/alert").handler(ctx("globex"))).toEqual({ state: "not-configured" });
    await route("/competition/alert-config").handler(ctx("acme", { disabled: true }));
    expect(await route("/competition/alert").handler(ctx("acme"))).toEqual({ state: "not-configured" });
  });
  it("keeps groups and filtered reports tenant-scoped", async () => {
    process.env.AI_VISIBILITY_PATH = mkdtempSync(path.join(tmpdir(), "competition-"));
    const { normalizeImport } = await import("../src/console/ai-visibility.js");
    const data = normalizeImport({ brands: [{ name: "Alpha" }], responses: [
      { prompt: "One?", answer: "Alpha and Beta", source: "A", observedAt: "2026-01-01T00:00:00Z" },
      { prompt: "Two?", answer: "Gamma", source: "A", observedAt: "2026-01-02T00:00:00Z" },
    ] }); insertDataset("acme", data);
    const config = { datasetId: data.id, name: "One", prompts: ["One?"] };
    expect(route("/competition/group").adminOnly).toBe(true);
    await expect(route("/competition/group").handler(ctx("globex", config))).rejects.toThrow();
    const state = await route("/competition/group").handler(ctx("acme", config)) as { groups: Array<{ id: string }> };
    const report = await route("/competition/report").handler(ctx("acme", { datasetId: data.id, groupId: state.groups[0].id })) as { total: number };
    expect(report.total).toBe(1);
    await expect(route("/competition/report").handler(ctx("globex", { datasetId: data.id }))).rejects.toThrow();
    await expect(route("/competition/report").handler(ctx("acme", { datasetId: data.id, from: "2026-02-30" }))).rejects.toThrow();
    const found = await route("/competition/discovery").handler(ctx("acme", { datasetId: data.id })) as { candidates: Array<{ name: string }> };
    expect(found.candidates.some((c) => c.name === "Gamma")).toBe(true);
    expect(found.candidates.some((c) => c.name === "Alpha")).toBe(false);
  });
});
