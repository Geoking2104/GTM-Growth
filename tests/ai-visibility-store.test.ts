import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { closeVisibilityStores, getDataset, insertDataset, listDatasets } from "../src/console/ai-visibility-store.js";
const execFileAsync = promisify(execFile);
const oldPath = process.env.AI_VISIBILITY_PATH;
afterEach(() => { closeVisibilityStores(); if (oldPath === undefined) delete process.env.AI_VISIBILITY_PATH; else process.env.AI_VISIBILITY_PATH = oldPath; });

describe("AI visibility transactional storage", () => {
  it("migrates existing JSON once without deleting it and isolates tenants", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ai-store-")); process.env.AI_VISIBILITY_PATH = dir;
    const legacy = { id: "legacy", createdAt: "2026-01-01T00:00:00Z", brands: [], observations: [] };
    writeFileSync(path.join(dir, "acme.json"), JSON.stringify([legacy]));
    expect(listDatasets("acme")).toEqual([legacy]); expect(listDatasets("globex")).toEqual([]);
    expect(listDatasets("acme")).toEqual([legacy]); expect(existsSync(path.join(dir, "acme.json"))).toBe(true);
  });
  it("rolls back failed migration without marking the file imported", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ai-store-")); process.env.AI_VISIBILITY_PATH = dir; const file = path.join(dir, "acme.json");
    writeFileSync(file, "not json"); expect(() => listDatasets("acme")).toThrow();
    writeFileSync(file, JSON.stringify([{ id: "fixed", createdAt: "2026-01-01", brands: [], observations: [] }]));
    expect(listDatasets("acme")).toHaveLength(1);
  });
  it("preserves simultaneous inserts and updates from multiple processes", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ai-store-")); process.env.AI_VISIBILITY_PATH = dir;
    insertDataset("acme", { id: "shared", createdAt: "2026-01-01", brands: [], observations: [], count: 0 });
    const worker = path.resolve("tests/fixtures/visibility-worker.mjs");
    await Promise.all(["one", "two", "three"].map((id) => execFileAsync(process.execPath, ["--import", "tsx", worker, id], { env: { ...process.env, AI_VISIBILITY_PATH: dir }, timeout: 30000 })));
    expect(listDatasets("acme")).toHaveLength(37);
    expect(getDataset<{ id: string; createdAt: string; brands: unknown[]; observations: unknown[]; count: number }>("acme", "shared")?.count).toBe(36);
    expect(getDataset("globex", "shared")).toBeUndefined();
  }, 45000);
});
