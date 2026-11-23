import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { normalizeImport } from "../src/console/ai-visibility.js";
import { closeVisibilityStores, insertDataset, updateCompetitionState } from "../src/console/ai-visibility-store.js";
import { readVisibilityComparison } from "../src/console/visibility-comparison.js";
import { competitionRoutes } from "../src/console/competition.js";
import type { HandlerContext } from "../src/console/util.js";
import { parseHTML } from "linkedom";

const brands = [{ name: "Alpha", website: "https://alpha.example" }, { name: "Beta" }];
const yesterday = "2026-11-20", today = "2026-11-21";
const now = new Date("2026-11-22T12:00:00Z");
const original = { engine: "OpenAI", model: "v1", mode: "api", market: "FR", language: "fr" };
const row = (date: string, answer: string, prompt = "Question", measurement: Record<string, string> | undefined = original, source = "Provider") =>
  ({ observedAt: `${date}T12:00:00Z`, answer, prompt, source, measurement });
const input = (datasetId: string) => ({ datasetId, from: today, to: today, brand: "Alpha" });
const compare = (body: Record<string, unknown>, time = now, minimum = 1) => readVisibilityComparison("acme", body, {
  now: time, alert: { datasetId: String(body.datasetId), brand: "Alpha", windowDays: 1, threshold: 20, minPerWindow: minimum },
});
let store: string;
beforeEach(() => { store = mkdtempSync(path.join(tmpdir(), "visibility-cohorts-")); vi.stubEnv("AI_VISIBILITY_PATH", store); });
afterEach(() => { closeVisibilityStores(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); rmSync(store, { recursive: true, force: true }); });

it("weights shared cohorts equally and exposes unmatched context and share-of-voice coverage", () => {
  const panel = normalizeImport({ brands, responses: [
    row(yesterday, "Alpha mentions", "A"),
    row(yesterday, "No matching brand", "B"),
    row(today, "Alpha and Beta", "A"), row(today, "Only Alpha", "A"),
    row(today, "Alpha", "B"),
    row(today, "Beta from a newer model", "A", { ...original, model: "v2" }),
    row(today, "Beta from another market", "A", { ...original, market: "BE" }),
    row(today, "Beta in another language", "A", { ...original, language: "en" }),
    row(today, "Beta in another mode", "A", { ...original, mode: "consumer" }),
  ] });
  insertDataset("acme", panel);
  const report = compare(input(panel.id));
  expect(report.state).toBe("comparable");
  expect(report.windows.map((window) => window.responses)).toEqual([2, 7]);
  expect(report.visibility).toEqual({ sharedCohorts: 2, included: [2, 3], previous: 50, current: 100, delta: 50 });
  expect(report.shareOfVoice).toMatchObject({ sharedCohorts: 1, included: [1, 2], previous: 100 });
  expect(report.shareOfVoice.current).toBeCloseTo(200 / 3);
  expect(report.shareOfVoice.delta).toBeCloseTo(-100 / 3);
  expect(compare(input(panel.id), now, 3).visibility).toMatchObject({ delta: null, included: [2, 3] });
  expect(compare(input(panel.id), new Date(`${today}T15:00:00Z`))).toMatchObject({ state: "incomplete", visibility: { delta: null } });
});

it("includes only compatible workspace history and preserves the selected panel's review during deduplication", () => {
  const response = row(today, "Alpha appears", "Shared");
  const selected = normalizeImport({ brands, responses: [response, row(today, "Beta", "Other")] });
  selected.observations[0].mentions[0].status = "rejected";
  const compatible = normalizeImport({ brands: [...brands].reverse(), responses: [response, row(yesterday, "Alpha appeared", "Shared")] });
  const incompatible = normalizeImport({ brands: [{ ...brands[0], website: "https://changed.example" }, brands[1]], responses: [row(yesterday, "Alpha unrelated", "Shared")] });
  const otherTenant = normalizeImport({ brands, responses: [row(yesterday, "Alpha elsewhere", "Shared")] });
  for (const panel of [selected, compatible, incompatible]) insertDataset("acme", panel);
  insertDataset("globex", otherTenant);
  const group = { id: "g1", name: "Shared", datasetId: selected.id, prompts: ["Shared"] };
  updateCompetitionState("acme", { groups: [group] }, () => {});
  const filters = { ...input(selected.id), groupId: group.id, source: "Provider" };
  expect(compare(filters)).toMatchObject({ state: "insufficient", datasets: 1 });
  expect(compare({ ...filters, includeHistory: true })).toMatchObject({
    state: "comparable", datasets: 2, visibility: { previous: 100, current: 0, delta: -100, included: [1, 1] },
  });
  expect(() => readVisibilityComparison("globex", filters, { now })).toThrow("Dataset not found");
  expect(() => compare({ ...filters, groupId: "unknown" })).toThrow("Group not found");
});

it("keeps legacy rows separate from known capture contexts and verified collections separate from imports", () => {
  const { measurement: _measurement, ...before } = row(yesterday, "Alpha", "Legacy");
  const after = row(today, "Alpha", "Legacy");
  const manual = normalizeImport({ brands, responses: [before, after, row(yesterday, "Alpha from a file", "Verified")] });
  const verified = normalizeImport({ brands, responses: [row(today, "Alpha from an API", "Verified")] }, "collected");
  insertDataset("acme", manual); insertDataset("acme", verified);
  const report = compare({ ...input(manual.id), includeHistory: true });
  expect(report.windows.map((window) => window.withoutContext)).toEqual([1, 0]);
  expect(report.visibility).toMatchObject({ sharedCohorts: 0, delta: null });
});

it("uses the panel threshold in the read-only route and exports exactly the reported windows", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const panel = normalizeImport({ brands, responses: [row(yesterday, "Alpha", "Question", original, "=source"), row(today, "Beta", "Question", original, "=source")] });
  insertDataset("acme", panel);
  updateCompetitionState("acme", { panels: {}, actions: [], alert: { datasetId: panel.id, brand: "Alpha", minPerWindow: 9 } }, () => {});
  const filters = { ...input(panel.id), source: "=source" };
  const route = competitionRoutes.find((item) => item.path === "/competition/comparison")!;
  const result = await route.handler({ body: filters, tenancy: { tenant: { id: "acme" } } } as HandlerContext);
  expect(route.adminOnly).toBeFalsy();
  expect(result).toMatchObject({ minimumPerWindow: 9, state: "insufficient" });
  vi.stubGlobal("location", { search: "" });
  vi.stubGlobal("localStorage", { getItem: () => "en", setItem: () => {} });
  vi.stubGlobal("document", parseHTML("<html><body></body></html>").document);
  const { comparisonCsv } = await import("../site/console/competition-period.js");
  const csv = comparisonCsv(compare(filters));
  expect(csv.split("\r\n")).toHaveLength(5);
  expect(csv).toContain('"matched-cohorts-v1","comparable"');
  expect(csv).toContain('"' + "'=source" + '"');
  expect(csv).toContain('"visibility","current","2026-11-21","2026-11-21","1","0","1","0","1","0","-100"');
});

it("derives the dates from a tenant action and excludes its completion day", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-24T12:00:00Z"));
  const panel = normalizeImport({ brands, responses: [row(yesterday, "Alpha"), row(today, "Beta after the change"), row("2026-11-22", "Alpha in the new window")] });
  insertDataset("acme", panel);
  const action = { id: "action", datasetId: panel.id, status: "done", completedAt: `${today}T10:00:00Z`, prompt: "Question" };
  updateCompetitionState("acme", { panels: {}, actions: [action] }, () => {});
  const route = competitionRoutes.find((item) => item.path === "/competition/comparison")!;
  const body = { datasetId: panel.id, actionId: action.id };
  const request = (id: string) => ({ body, tenancy: { tenant: { id } } } as HandlerContext);
  const result = await route.handler(request("acme"));
  expect(result).toMatchObject({
    filters: { actionId: "action", prompt: "Question" },
    windows: [{ from: "2026-10-22", to: "2026-11-20", responses: 1 }, { from: "2026-11-22", to: "2026-12-21", responses: 1 }],
  });
  await expect(route.handler(request("globex"))).rejects.toThrow("Completed action not found");
});

it.each(["fr", "en"])("shows coverage instead of a delta for an undersampled period in %s", async (language) => {
  vi.resetModules();
  vi.stubGlobal("location", { search: `?lang=${language}` });
  vi.stubGlobal("localStorage", { getItem: () => language, setItem: () => {} });
  const { document } = parseHTML("<html><body></body></html>");
  vi.stubGlobal("document", document);
  const { renderPeriodComparison } = await import("../site/console/competition-period.js");
  const panel = normalizeImport({ brands, responses: [row(yesterday, "Alpha"), row(today, "Beta")] });
  insertDataset("acme", panel);
  const filters = input(panel.id);
  const report = compare(filters, now, 5);
  const api = vi.fn(async () => report);
  const root = renderPeriodComparison(api, filters);
  document.body.append(root);
  await vi.waitFor(() => expect(root.textContent).toContain(language === "fr" ? "Couverture insuffisante" : "Insufficient coverage"));
  expect(root.textContent).toContain(language === "fr" ? "1/1 réponses comparées" : "1/1 answers matched");
  expect(root.textContent).toContain(language === "fr" ? "Évolution indisponible" : "Change unavailable");
  expect(api).toHaveBeenCalledWith("/competition/comparison", filters);
});
