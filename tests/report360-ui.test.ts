import { describe, expect, it, vi, afterEach } from "vitest";
import { parseHTML } from "linkedom";
import { readFileSync } from "node:fs";
import { renderFreeReport360 } from "../site/console/report360.js";

const baseReport = {
  schemaVersion: 1, method: "geo-v1-public-page", scope: "single_public_url",
  sourceUrl: "https://example.com/products", observedAt: "2026-11-16T10:20:00Z",
  pillars: [
    { id: "seo", coverage: "measured", score: null, observedChecks: 6, needsAttention: 2 },
    { id: "geo", coverage: "measured", score: 56, observedChecks: 10, needsAttention: 4 },
    { id: "ai", coverage: "partial", score: null, observedChecks: null, needsAttention: null },
    { id: "crm", coverage: "not_measured", score: null, observedChecks: null, needsAttention: null },
    { id: "social", coverage: "partial", score: null, observedChecks: null, needsAttention: null, observedCount: 0 },
  ],
  actions: [
    { id: "seo.title", code: "title", pillar: "seo", kind: "observed_fix", priority: "high", effort: "low", owner: "content", points: null, proof: { label: "Title", value: "missing <script>alert(1)</script>", note: "Observed HTML", sourceUrl: "https://example.com/products", observedAt: "2026-11-16T10:20:00Z" } },
    { id: "ai.connect_measurement", code: "ai_measurement", pillar: "ai", kind: "next_step", priority: "medium", effort: "medium", owner: "marketing", points: null, proof: null },
    { id: "crm.connect_conversions", code: "crm_measurement", pillar: "crm", kind: "next_step", priority: "medium", effort: "medium", owner: "analytics", points: null, proof: null },
    { id: "social.validate_presence", code: "social_presence", pillar: "social", kind: "next_step", priority: "low", effort: "low", owner: "marketing", points: null, proof: null },
  ],
};

afterEach(() => vi.unstubAllGlobals());
function render(lang: "fr" | "en") {
  const { document, window } = parseHTML("<html><body></body></html>");
  vi.stubGlobal("document", document); vi.stubGlobal("window", window);
  const tree = renderFreeReport360(baseReport, lang);
  document.body.append(tree);
  return { document, window, tree };
}

describe("bilingual free 360 report", () => {
  it.each(["fr", "en"] as const)("renders five distinct pillars, source, proof and an actionable plan in %s", (lang) => {
    const { document, tree } = render(lang);
    expect(tree.querySelectorAll(".report360-pillar")).toHaveLength(5);
    expect(tree.querySelectorAll(".report360-action")).toHaveLength(4);
    expect(tree.querySelectorAll(".report360-steps li")).toHaveLength(12);
    expect(tree.querySelectorAll(".report360-proof code")).toHaveLength(1);
    expect(tree.textContent).toContain(lang === "fr" ? "Moteurs IA" : "AI engines");
    expect(tree.textContent).toContain(lang === "fr" ? "Non mesuré" : "Not measured");
    expect(tree.textContent).not.toContain("0/100");
    expect(tree.querySelector(".report360-source")?.getAttribute("href")).toBe("https://example.com/products");
    expect(tree.querySelector(".report360-workspace")?.getAttribute("href")).toBe("#c-login-form");
    expect(tree.querySelectorAll(".report360-copy")).toHaveLength(4);
    expect(document.querySelector("script")).toBeNull(); // untrusted text cannot run
    expect(tree.querySelector(".report360-proof code")?.textContent).toContain("<script>");
  });

  it("filters actual actions without removing conditional steps or claiming a CRM failure", () => {
    const { tree } = render("fr");
    const button = [...tree.querySelectorAll(".report360-filter")].find(b => b.dataset.pillar === "crm");
    button?.onclick?.();
    expect(button?.getAttribute("aria-pressed")).toBe("true");
    expect([...tree.querySelectorAll(".report360-action")].filter(a => !a.hidden).map(a => a.dataset.pillar)).toEqual(["crm"]);
    expect(tree.querySelector(".report360-action-crm")?.textContent).toContain("Étape conditionnelle");
  });

  it("copies the human-readable steps with dated source proof", async () => {
    const { tree } = render("en");
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const button = tree.querySelector(".report360-action-seo .report360-copy");
    await button?.onclick?.();
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).toContain("https://example.com/products");
    expect(writeText.mock.calls[0][0]).toContain("2026-11-16T10:20:00Z");
    expect(button?.textContent).toBe("Action copied");
  });

  it("offers an actual print action and includes A4 print CSS", () => {
    const { tree, window } = render("en");
    const print = vi.fn(); vi.stubGlobal("window", Object.assign(window, { print }));
    const button = tree.querySelector(".report360-print");
    button?.onclick?.();
    expect(print).toHaveBeenCalledOnce();
    expect([...tree.querySelectorAll(".report360-detail")].every(d => d.open)).toBe(true);
    const css = readFileSync("site/console/shell.css", "utf8");
    expect(css).toContain("@page { size:A4 portrait");
    expect(css).toContain("#c-public-read > :not(.free-report360)");
  });
});
