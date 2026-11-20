import { describe, expect, it, vi, afterEach } from "vitest";
import { parseHTML } from "linkedom";
import { CATEGORY_ICONS, FALLBACK_CATEGORY_ICON, categoryIconName, completionLabel, completionStats, renderCategoryIcon, renderCompletionDonut } from "../site/console/completion-donut.js";
import { renderFreeReport360 } from "../site/console/report360.js";

afterEach(() => vi.unstubAllGlobals());
function dom() {
  const { document, window } = parseHTML("<html><body></body></html>");
  vi.stubGlobal("document", document); vi.stubGlobal("window", window);
  return document;
}
const c = (status: string, category = "robots") => ({ status, category });

describe("completion statistics", () => {
  it("counts only observed controls as complete; unknown never counts", () => {
    const s = completionStats([c("measured"), c("measured"), c("unknown"), c("unknown")]);
    expect(s).toMatchObject({ observed: 2, unknown: 2, notApplicable: 0, total: 4, percent: 50 });
    expect(completionStats([c("unknown"), c("unknown")]).percent).toBe(0);
  });
  it("keeps not-applicable as its own segment and rounds the observed share", () => {
    const s = completionStats([c("measured"), c("not_applicable"), c("unknown")]);
    expect(s.percent).toBe(33);
    expect(s.notApplicable).toBe(1);
    expect(s.observedShare + s.notApplicableShare).toBeCloseTo(66.67, 1);
  });
  it("returns a neutral state for empty or missing data", () => {
    expect(completionStats([]).percent).toBeNull();
    expect(completionStats(undefined as any)).toMatchObject({ total: 0, percent: null });
  });
  it.each([["fr", "5 sur 5 observés, 100\u00a0%"], ["en", "5 of 5 observed, 100%"]] as const)("labels in %s", (lang, label) => {
    expect(completionLabel(completionStats(Array(5).fill(c("measured"))), lang)).toBe(label);
  });
  it("mentions unknown and not-applicable counts in the accessible label", () => {
    const label = completionLabel(completionStats([c("measured"), c("unknown"), c("unknown"), c("not_applicable")]), "fr");
    expect(label).toBe("1 sur 4 observé, 25\u00a0% (2 inconnus, 1 non applicable)");
  });
});

describe("donut and pictograms", () => {
  it("renders an accessible donut with visible text", () => {
    dom();
    const donut = renderCompletionDonut(completionStats([c("measured"), c("unknown")]), "en");
    expect(donut.getAttribute("role")).toBe("img");
    expect(donut.getAttribute("aria-label")).toBe("1 of 2 observed, 50% (1 unknown)");
    expect(donut.textContent).toBe("50%");
    expect(donut.style.getPropertyValue("--gg-done")).toBe("50.00%");
  });
  it("renders 0/0 as neutral, not as 0 %", () => {
    dom();
    const donut = renderCompletionDonut(completionStats([]), "fr");
    expect(donut.className).toContain("gg-donut-empty");
    expect(donut.textContent).toBe("—");
  });
  it("uses a distinct icon per known category and a fallback otherwise", () => {
    const names = Object.values(CATEGORY_ICONS);
    expect(new Set(names).size).toBe(8);
    expect(names).not.toContain(FALLBACK_CATEGORY_ICON);
    expect(categoryIconName("future_category")).toBe(FALLBACK_CATEGORY_ICON);
    expect(categoryIconName("toString")).toBe(FALLBACK_CATEGORY_ICON);
    dom();
    const node = renderCategoryIcon("robots");
    expect(node.getAttribute("aria-hidden")).toBe("true");
    expect(node.querySelector("svg")).not.toBeNull();
  });
});

describe("v2 grid integration", () => {
  const controls = [
    { controlId: "R01", category: "robots", status: "measured", outcome: "pass" },
    { controlId: "R02", category: "robots", status: "unknown" },
    { controlId: "X01", category: "future_category", status: "measured" },
  ];
  const report = {
    schemaVersion: 1, method: "geo-v2-public-evidence", scope: "single_public_url", sourceUrl: "https://example.com/", observedAt: "2026-11-16T10:20:00Z",
    pillars: [{ id: "geo", coverage: "partial", score: null, observedChecks: 2, needsAttention: 0 }], actions: [],
    geoV2: { gridVersion: "v2.0.0", controls },
  };
  it.each(["fr", "en"] as const)("adds a donut and pictogram to every category row and the summary in %s", (lang) => {
    const document = dom();
    const tree = renderFreeReport360(report, lang); document.body.append(tree);
    const rows = [...tree.querySelectorAll(".report360-v2-category")];
    expect(rows).toHaveLength(9); // 8 known categories + the unknown key, never dropped
    for (const row of rows) {
      expect(row.querySelector("summary .gg-donut[role=img]")).not.toBeNull();
      expect(row.querySelector("summary .gg-category-icon svg")).not.toBeNull();
    }
    const robots = tree.querySelector('[data-category="robots"] .gg-donut');
    expect(robots?.textContent).toBe(lang === "fr" ? "50\u00a0%" : "50%");
    expect(tree.querySelector('[data-category="llms"] .gg-donut')?.className).toContain("gg-donut-empty");
    expect(tree.querySelector('[data-category="future_category"] .gg-category-icon')?.getAttribute("data-icon")).toBe(FALLBACK_CATEGORY_ICON);
    expect(tree.querySelector(".report360-v2-overall .gg-donut")?.getAttribute("aria-label")).toContain(lang === "fr" ? "2 sur 3 observés, 67" : "2 of 3 observed, 67");
  });
});

describe("content security policy", () => {
  it("never writes inline style attributes from site scripts (CSP style-src 'self')", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(import.meta.dirname, "../site");
    const offenders: string[] = [];
    const walk = (dir: string) => { for (const entry of readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (entry.name.endsWith(".js") && /setAttribute\(\s*["']style["']/.test(readFileSync(full, "utf8"))) offenders.push(path.relative(root, full)); } };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
