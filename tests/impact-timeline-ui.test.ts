import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
function dom(lang = "en") {
  const { document, window } = parseHTML("<html><body></body></html>");
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  vi.stubGlobal("Node", window.Node);
  vi.stubGlobal("location", { search: `?lang=${lang}` });
  vi.stubGlobal("localStorage", { getItem: () => lang, setItem: vi.fn() });
  return { document, window };
}

const NOTE = "One timeline per scope: each step compares one consecutive pair of the requestor's own snapshots. Outcome counters are reported per step and never summed across steps, scopes or clients. Earned points and private scores remain withheld. Reminders are surfaced to the requestor only; nothing is sent or scheduled automatically.";
const FOLLOW_UP_NOTE_FRAGMENT = "Reminders are surfaced to the requestor only; nothing is sent or scheduled automatically.";
const suggestion = {
  fr: "Relancez la même URL avec la même méthode, comparez avec le relevé précédent, puis envoyez le rapport client en marque blanche dans la langue du client (fr ou en).",
  en: "Re-run the same URL with the same method, compare with the previous observation, then send the white-label client report in the client's language (fr or en).",
};
const followUps = [
  { label: "J+14", daysAfter: 14, dueAt: "2026-10-06T00:00:00.000Z", status: "due", suggestion },
  { label: "J+28", daysAfter: 28, dueAt: "2026-10-20T00:00:00.000Z", status: "upcoming", suggestion },
];
const comparison = {
  status: "compared", method: "pages-only-v2", scope: "single_public_url", url: "https://benchmark.example/",
  gridVersion: "2026-11-18", previousObservedAt: "2026-09-01T09:00:00Z", currentObservedAt: "2026-09-22T09:00:00Z",
  summary: { improved: 1, regressed: 0, unchanged: 40, newlyObserved: 1, newlyUnavailable: 0, newlyApplicable: 0, noLongerApplicable: 0 },
  controls: [],
  actions: { resolved: ["Préparer une FAQ"], new: ["Déclarer une URL canonique"], unchanged: 2 },
  note: "Comparison of public outcomes only: earned points and private scores remain withheld.",
};
const timelineResult = {
  status: "timeline", url: "https://benchmark.example/", observationCount: 2,
  observedDates: ["2026-09-01T09:00:00Z", "2026-09-22T09:00:00Z"], latestObservedAt: "2026-09-22T09:00:00Z",
  steps: [{
    previousObservedAt: "2026-09-01T09:00:00Z", currentObservedAt: "2026-09-22T09:00:00Z", intervalDays: 21,
    gridVersions: { previous: "2026-11-18", current: "2026-11-18" },
    measuredCoverage: { previous: 1, current: 1 },
    comparison, confidence: "high",
    confidenceReasons: ["comparable_pair", "same_grid_version", "measured_coverage_1.00_1.00", "interval_days_21"],
  }],
  followUps, note: NOTE,
};

it.each(["fr", "en"])("renders the per-step impact timeline with J+14/J+28 reminders in %s", async lang => {
  const { document } = dom(lang);
  const fetch = vi.fn(async () => ({ ok: true, json: async () => timelineResult }));
  vi.stubGlobal("fetch", fetch);
  const { renderImpactTimeline } = await import("../site/console/impact-timeline.js");
  const root = renderImpactTimeline({ id: "job-1", token: "run-token" }, lang);
  expect(root).not.toBeNull();
  document.body.append(root!);
  expect(fetch.mock.calls.length).toBe(1);
  expect(fetch.mock.calls[0]![0]).toBe("/api/audits/job-1/timeline");
  expect(fetch.mock.calls[0]![1]).toMatchObject({ headers: { Authorization: "Bearer run-token", Accept: "application/json" }, cache: "no-store" });
  await vi.waitFor(() => expect(root!.querySelector("div.impact-step")).not.toBeNull());
  expect(root!.querySelector("h2")!.textContent).toBe(lang === "fr" ? "Impact relevé entre vos observations" : "Measured impact across your observations");
  const head = root!.querySelector("div.impact-step-head")!;
  expect(head.textContent).toContain(lang === "fr" ? "Étape 1" : "Step 1");
  expect(head.textContent).toContain("2026");
  expect(head.textContent).toContain(lang === "fr" ? "21 jours" : "21 days");
  expect(head.textContent).toContain(lang === "fr" ? "Confiance : Haute" : "Confidence : High");
  expect(root!.querySelector("details.impact-reasons")!.textContent).toContain("same_grid_version");
  const counters = root!.querySelector("ul.impact-counters")!;
  expect(counters.textContent).toContain(lang === "fr" ? "améliorés : 1" : "improved : 1");
  expect(counters.textContent).toContain(lang === "fr" ? "nouvellement observés : 1" : "newly observed : 1");
  expect(counters.textContent).toContain(lang === "fr" ? "inchangés : 40" : "unchanged : 40");
  const actions = root!.querySelector("p.impact-actions")!;
  expect(actions.textContent).toContain(lang === "fr" ? "actions résolues : 1" : "actions resolved : 1");
  expect(actions.textContent).toContain(lang === "fr" ? "actions nouvelles : 1" : "new actions : 1");
  const reminders = [...root!.querySelectorAll("div.impact-followup")];
  expect(reminders).toHaveLength(2);
  expect(reminders[0]!.textContent).toContain("J+14");
  expect(reminders[0]!.textContent).toContain(lang === "fr" ? "à faire" : "due");
  expect(reminders[0]!.textContent).toContain(lang === "fr" ? suggestion.fr : suggestion.en);
  expect(reminders[1]!.textContent).toContain("J+28");
  expect(reminders[1]!.textContent).toContain(lang === "fr" ? "à venir" : "upcoming");
  expect(reminders[1]!.textContent).toContain(lang === "fr" ? suggestion.fr : suggestion.en);
  expect(root!.textContent).toContain("never summed");
  expect(root!.textContent).toContain(FOLLOW_UP_NOTE_FRAGMENT);
});

it("renders the observation count and the reminders when the observations are insufficient", async () => {
  const { document } = dom();
  const insufficient = { status: "insufficient_observations", url: "https://benchmark.example/", observationCount: 1, latestObservedAt: "2026-09-01T09:00:00Z", followUps: [followUps[0]!], note: NOTE };
  const fetch = vi.fn(async () => ({ ok: true, json: async () => insufficient }));
  vi.stubGlobal("fetch", fetch);
  const { renderImpactTimeline } = await import("../site/console/impact-timeline.js");
  const root = renderImpactTimeline({ id: "job-2", token: "run-token" }, "en");
  document.body.append(root!);
  await vi.waitFor(() => expect(root!.querySelector("div.impact-followup")).not.toBeNull());
  expect(root!.querySelector("h2")!.textContent).toBe("Measured impact across your observations");
  expect(root!.textContent).toContain("Not enough of your comparable reads yet for an impact trajectory.");
  expect(root!.textContent).toContain("Reads of this page recorded for you: 1");
  expect(root!.querySelectorAll("div.impact-step").length).toBe(0);
  expect(root!.querySelectorAll("div.impact-followup")).toHaveLength(1);
  expect(root!.textContent).toContain(FOLLOW_UP_NOTE_FRAGMENT);
});

it("renders only the refusal note on a scope mismatch", async () => {
  const { document } = dom();
  const mismatch = { status: "scope_mismatch", url: "https://benchmark.example/", note: "All snapshots must cover the same page; cross-scope timelines are never assembled." };
  const fetch = vi.fn(async () => ({ ok: true, json: async () => mismatch }));
  vi.stubGlobal("fetch", fetch);
  const { renderImpactTimeline } = await import("../site/console/impact-timeline.js");
  const root = renderImpactTimeline({ id: "job-3", token: "run-token" }, "en");
  document.body.append(root!);
  await vi.waitFor(() => expect(root!.textContent).toContain("cross-scope timelines are never assembled."));
  expect(root!.querySelectorAll("div.impact-step").length).toBe(0);
  expect(root!.querySelectorAll("div.impact-followup").length).toBe(0);
});

it("mounts nothing without an audit job and never calls the API", async () => {
  const { document } = dom();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const { renderImpactTimeline } = await import("../site/console/impact-timeline.js");
  expect(renderImpactTimeline(null, "fr")).toBeNull();
  expect(renderImpactTimeline({ id: "job-4" }, "fr")).toBeNull();
  expect(renderImpactTimeline({ token: "run-token" }, "fr")).toBeNull();
  expect(fetch.mock.calls.length).toBe(0);
  expect(document.body.children.length).toBe(0);
});

it("removes the panel when the timeline is unavailable or the request fails", async () => {
  const { document } = dom();
  const responses = [
    { ok: false },
    { ok: true, json: async () => { throw new Error("boom"); } },
  ];
  const fetch = vi.fn(async () => responses.shift());
  vi.stubGlobal("fetch", fetch);
  const { renderImpactTimeline } = await import("../site/console/impact-timeline.js");
  const first = renderImpactTimeline({ id: "job-5", token: "run-token" }, "en");
  document.body.append(first!);
  await vi.waitFor(() => expect(document.body.querySelector("section.impact-timeline")).toBeNull());
  const second = renderImpactTimeline({ id: "job-6", token: "run-token" }, "en");
  document.body.append(second!);
  await vi.waitFor(() => expect(document.body.querySelector("section.impact-timeline")).toBeNull());
  expect(fetch.mock.calls.length).toBe(2);
});
