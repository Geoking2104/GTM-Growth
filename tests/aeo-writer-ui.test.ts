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

const score = {
  datasetId: "panel-1",
  brand: "Acme",
  observedAt: "2026-11-05T00:00:00Z",
  provenance: { source: "stored-panel", datasetId: "panel-1", content: "tenant-supplied" },
  promptCount: 2, evaluated: 2, covered: 1, partial: 0, absent: 1,
  coverageScore: 50, citabilityScore: 62,
  citabilitySignals: { strengths: ["Les listes structurées sont présentes."], gaps: ["Aucune statistique chiffrée citée."] , methods: [] },
  score: 55,
  rows: [
    { prompt: "comment faire un audit GEO", observedAt: "2026-11-05T00:00:00Z", status: "covered", matchedTerms: ["audit", "geo"], missingTerms: [], evidence: "L'audit GEO commence par le schema." },
    { prompt: "tarif consulting mondial", observedAt: "2026-11-06T00:00:00Z", status: "absent", matchedTerms: [], missingTerms: ["tarif", "consulting", "mondial"], evidence: null },
  ],
  note: "Analyse heuristique locale…",
};
const drafts = {
  datasetId: "panel-1", brand: "Acme", sourcePrompts: 2,
  drafts: [
    {
      prompt: "tarif consulting mondial", status: "absent",
      titles: [{ text: "Tarif consulting mondial : le guide complet 2026", chars: 47 }],
      outline: { h1: "Tarif consulting mondial", sections: [{ h2: "Qu'est-ce que le tarif consulting mondial ?", h3: ["Définition"] }], faq: ["Tarif consulting mondial, c'est quoi exactement ?"] },
      review: "Brouillon généré localement : relisez avant tout usage.",
    },
  ],
  note: "Brouillons heuristiques fondés sur les prompts du panneau stocké.",
};

const apiWith = () => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const api: any = async (route: string, body: Record<string, unknown>) => {
    calls.push([route, body]);
    if (route === "/aeo-writer/score") return score;
    if (route === "/aeo-writer/drafts") return drafts;
    throw new Error("unexpected route");
  };
  api.mock = { calls };
  return api;
};

it.each(["fr", "en"] as const)("renders the bilingual panel with enabled actions and no call yet in %s", async lang => {
  const { document } = dom(lang);
  const api = apiWith();
  const { renderOpsAeoWriter } = await import("../site/console/aeo-writer.js");
  const root = renderOpsAeoWriter({ api, me: { role: "member", tenant: { domains: ["example.com"] } } });
  document.body.append(root!);
  expect(root!.querySelector("h3")!.textContent).toBe(lang === "fr" ? "AEO Writer : score ancré sur les réponses IA" : "AEO Writer: answer-grounded scoring");
  const buttons = [...root!.querySelectorAll<HTMLButtonElement>("button")];
  expect(buttons.length).toBe(2);
  for (const b of buttons) expect(b.disabled).toBe(false);
  expect(api.mock.calls.length).toBe(0);
  expect(root!.querySelector("textarea")).toBeTruthy();
});

it.each(["fr", "en"] as const)("scores pasted content and renders the coverage table with provenance in %s", async lang => {
  const { document } = dom(lang);
  const api = apiWith();
  const { renderOpsAeoWriter } = await import("../site/console/aeo-writer.js");
  const root = renderOpsAeoWriter({ api, me: { role: "member", tenant: { domains: ["example.com"] } } });
  document.body.append(root!);
  const [scoreButton] = [...root!.querySelectorAll<HTMLButtonElement>("button")];
  const content = root!.querySelector<HTMLTextAreaElement>("textarea")!;
  content.value = "L'audit GEO sérieux exige du schema, des statistiques et des listes claires pour les moteurs.";
  scoreButton!.click();
  await vi.waitFor(() => expect(root!.querySelector("table")!.textContent).toContain("audit GEO"));
  expect(api.mock.calls[0]![0]).toBe("/aeo-writer/score");
  expect(root!.textContent).toContain(lang === "fr" ? "panneau stocké du tenant" : "tenant stored panel");
  expect(root!.textContent).toContain("panel-1");
  expect(root!.textContent).toContain("55"); // combined score
  expect(root!.textContent).toContain(lang === "fr" ? "couvert" : "covered");
  expect(root!.textContent).toContain(lang === "fr" ? "absent" : "absent");
  expect(root!.textContent).toContain("tarif, consulting, mondial");
  expect(root!.textContent).toContain("L'audit GEO commence par le schema.");
});

it.each(["fr", "en"] as const)("renders drafts under details with the review note in %s", async lang => {
  const { document } = dom(lang);
  const api = apiWith();
  const { renderOpsAeoWriter } = await import("../site/console/aeo-writer.js");
  const root = renderOpsAeoWriter({ api, me: { role: "member", tenant: { domains: ["example.com"] } } });
  document.body.append(root!);
  const [, draftsButton] = [...root!.querySelectorAll<HTMLButtonElement>("button")];
  draftsButton!.click();
  await vi.waitFor(() => expect(root!.querySelector("details")!.textContent).toContain("Tarif consulting mondial"));
  expect(api.mock.calls[0]![0]).toBe("/aeo-writer/drafts");
  const details = root!.querySelector("details")!;
  expect(details.textContent).toContain("Qu'est-ce que le tarif consulting mondial ?");
  expect(details.textContent).toContain("relisez");
  expect(root!.textContent).toContain("Brouillons heuristiques");
});

it.each(["fr", "en"] as const)("surfaces errors from the routes without inventing data in %s", async lang => {
  const { document } = dom(lang);
  const failApi: any = async () => { throw new Error("Panneau de visibilité IA introuvable pour ce tenant."); };
  const { renderOpsAeoWriter } = await import("../site/console/aeo-writer.js");
  const root = renderOpsAeoWriter({ api: failApi, me: { role: "member", tenant: { domains: ["example.com"] } } });
  document.body.append(root!);
  const [scoreButton] = [...root!.querySelectorAll<HTMLButtonElement>("button")];
  scoreButton!.click();
  await vi.waitFor(() => expect(root!.querySelector('[role="status"]')!.textContent).toContain("Panneau de visibilité IA introuvable"));
  expect(root!.querySelector("table")).toBeFalsy();
});
