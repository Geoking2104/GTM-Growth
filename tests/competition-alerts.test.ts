import { expect, it } from "vitest";
import { visibilityAlert } from "../src/console/competition-alerts.js";
const config = { datasetId: "d", brand: "Alpha", windowDays: 1, minPerWindow: 5, threshold: 20 };
const now = new Date("2026-11-05T12:00:00Z");
const day = (date: string, count: number, positive: number, prompt = "Q") => Array.from({ length: count }, (_, i) => ({ id: `${date}-${i}`, prompt, source: "Engine", observedAt: `${date}T12:00:00Z`, mentions: i < positive ? [{ brand: "Alpha" }] : [] }));
it("alerts only after two comparable consecutive drops", () => {
  const base = day("2026-11-02", 5, 5), mid = day("2026-11-03", 5, 2), late = day("2026-11-04", 5, 1);
  const result = visibilityAlert([...base, ...mid, ...late], config, now);
  expect(result.state).toBe("down"); expect(result.counts).toEqual([5, 5, 5]);
  expect(visibilityAlert([...base, ...mid, ...day("2026-11-04", 5, 5)], config, now).state).toBe("stable");
  expect(visibilityAlert([...base, ...mid, ...day("2026-11-04", 5, 1, "other")], config, now).state).toBe("insufficient");
  expect(visibilityAlert([...base, ...mid, ...late.slice(0, 4)], config, now).state).toBe("insufficient");
});
