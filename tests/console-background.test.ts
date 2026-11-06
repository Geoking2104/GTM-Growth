import { describe, expect, it, vi } from "vitest";
import { createBackgroundLoader } from "../site/console/background.js";

describe("background console loading", () => {
  it("runs bounded reads, deduplicates requests and records skipped and failed jobs", async () => {
    let active = 0, peak = 0;
    const fetchData = vi.fn(async (route: string) => { active++; peak = Math.max(peak, active); await new Promise((resolve) => setTimeout(resolve, 5)); active--; if (route === "/broken") throw new Error("unavailable"); return { route }; });
    const loader = createBackgroundLoader(fetchData);
    await loader.start("tenant-a", [{ label: "one", route: "/one", body: {} }, { label: "same", route: "/one", body: {} }, { label: "bad", route: "/broken", body: {} }, { label: "missing", skip: "not configured" }], 2);
    expect(peak).toBeLessThanOrEqual(2); expect(fetchData).toHaveBeenCalledTimes(2);
    expect(loader.snapshot().map((x: { state: string }) => x.state)).toEqual(["done", "done", "error", "skipped"]);
    await loader.request("tenant-b", "/one", {}); expect(fetchData).toHaveBeenCalledTimes(3);
  });
  it("does not reuse results that resolve after a reset", async () => {
    let finish!: (data: unknown) => void; const fetchData = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValue({ version: 2 });
    const loader = createBackgroundLoader(fetchData); const old = loader.request("a", "/one", {}); loader.reset(); finish({ version: 1 }); await old;
    expect(await loader.request("a", "/one", {})).toEqual({ version: 2 });
  });
});
