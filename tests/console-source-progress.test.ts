import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { runSources, renderSourceProgress } from "../site/console/source-progress.js";

beforeEach(() => { const { document, window } = parseHTML("<html><body></body></html>"); vi.stubGlobal("document", document); vi.stubGlobal("window", window); });
afterEach(() => { vi.unstubAllGlobals(); });

const copy = {
  title: "Chargement séquentiel des sources", intro: "Deux au maximum.",
  overall: (d: number, n: number) => `${d}/${n}`,
  states: { queued: "En attente", running: "En cours", done: "Terminé", error: "Erreur", skipped: "Non connecté" },
  sources: { geo: { label: "Audit GEO", explain: "≈ 20 s" }, status: { label: "Accès", explain: "" }, gsc: { label: "Search Console", explain: "" }, ga4: { label: "GA4", explain: "" }, bing: { label: "Bing", explain: "" } },
};

describe("per-source console loading", () => {
  it("keeps at most two requests in flight, honours dependencies and records real states", async () => {
    let active = 0, peak = 0; const order: string[] = []; const snapshots: Array<Array<{ id: string; state: string }>> = [];
    const slow = (id: string, value: unknown, ms = 5) => async () => { order.push(id); active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, ms)); active--; return value; };
    const results = await runSources([
      { id: "geo", run: slow("geo", { score: 70 }, 20) },
      { id: "status", run: slow("status", { gsc: { hasAccess: true }, ga4: { hasAccess: false }, bing: { hasAccess: true } }) },
      { id: "gsc", after: ["status"], skip: (r) => (r.status as any)?.gsc?.hasAccess ? false : "off", run: slow("gsc", { trend: [] }) },
      { id: "ga4", after: ["status"], skip: (r) => (r.status as any)?.ga4?.hasAccess ? false : "off", run: slow("ga4", {}) },
      { id: "bing", after: ["status"], run: async () => { throw new Error("Bing 403"); } },
    ], { concurrency: 2, onChange: (jobs) => snapshots.push(jobs) });
    expect(peak).toBeLessThanOrEqual(2);
    expect(order.indexOf("gsc")).toBeGreaterThan(order.indexOf("status"));
    expect(order).not.toContain("ga4");
    const final = snapshots.at(-1)!;
    expect(Object.fromEntries(final.map((j) => [j.id, j.state]))).toEqual({ geo: "done", status: "done", gsc: "done", ga4: "skipped", bing: "error" });
    expect(snapshots.some((s) => s.some((j) => j.state === "running"))).toBe(true);
    expect((results.bing as { loadError: Error }).loadError.message).toBe("Bing 403");
    expect(results.ga4).toBeNull();
  });

  it("marks API problems as errors without inventing a percentage", async () => {
    const results = await runSources([{ id: "gsc", run: async () => ({ problem: { message: "quota" } }) }]);
    expect(results.gsc).toEqual({ problem: { message: "quota" } });
    const panel = renderSourceProgress([
      { id: "geo", state: "running", detail: "" }, { id: "status", state: "done", detail: "" },
      { id: "gsc", state: "error", detail: "quota" }, { id: "ga4", state: "skipped", detail: "Non connecté" }, { id: "bing", state: "queued", detail: "" },
    ], copy);
    const bars = [...panel.querySelectorAll('[role="progressbar"]')];
    expect(bars).toHaveLength(6);
    expect(bars[0].getAttribute("aria-valuenow")).toBe("3");
    expect(bars[0].getAttribute("aria-valuemax")).toBe("5");
    const running = panel.querySelector('[data-source="geo"] [role="progressbar"]')!;
    expect(running.hasAttribute("aria-valuenow")).toBe(false);
    expect(running.getAttribute("aria-valuetext")).toBe("En cours");
    expect(panel.querySelector('[data-source="bing"] [role="progressbar"]')!.getAttribute("aria-valuenow")).toBe("0");
    expect(panel.querySelector('[data-source="gsc"] .c-source-detail')?.textContent).toBe("quota");
    expect(panel.getAttribute("aria-busy")).toBe("true");
    expect(panel.textContent).toContain("Chargement séquentiel des sources");
  });
});
