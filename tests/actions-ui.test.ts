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

const event = (seq: number, name: string, detail = "") =>
  ({ seq, tenantId: "acme", operationId: "op-1", actor: "user-1", event: name, detail, occurredAt: 1_763_900_000_000 });
const operation = (state: string, attempts = 0) => ({
  id: "op-1", action: "indexnow.submit", catalogVersion: "preapproved-actions-v1",
  terms: { host: "exemple.fr", key: "abc123", urls: ["https://exemple.fr/page"] }, termsSha: "sha",
  revision: 0, state, origin: "console", createdBy: "user-1", approvedBy: null,
  createdAt: 1_763_900_000_000, proposalExpiresAt: 1_764_158_000_000, approvalExpiresAt: null, attempts,
});
const catalog = {
  version: "preapproved-actions-v1",
  actions: [
    { id: "indexnow.submit", version: "indexnow-submit-v1", title: { fr: "Soumission IndexNow", en: "IndexNow submission" }, summary: { fr: "Jusqu'à 100 URLs du domaine du client.", en: "Up to 100 URLs of the tenant's domain." }, proposalTtlHours: 72, approvalTtlHours: 24 },
    { id: "draft.generate", version: "draft-generate-v1", title: { fr: "Génération de brouillon", en: "Draft generation" }, summary: { fr: "Brouillon local à relire.", en: "Local draft for review." }, proposalTtlHours: 72, approvalTtlHours: 24 },
    { id: "report.dispatch", version: "report-dispatch-v1", title: { fr: "Envoi d'un suivi de rapport dû", en: "Dispatch of a due report follow-up" }, summary: { fr: "Suivi J+14/J+28 déjà dû.", en: "Already due J+14/J+28 follow-up." }, proposalTtlHours: 72, approvalTtlHours: 24 },
  ],
  excluded: [
    { id: "apply.robots-meta", fr: "Écritures robots.txt / meta (Apply Mode)", en: "robots.txt / meta writes (Apply Mode)", module: "src/apply" },
    { id: "wordpress.publish", fr: "Publications WordPress", en: "WordPress publications", module: "src/console/content-ops.ts" },
    { id: "gbp.write", fr: "Écritures Google Business Profile", en: "Google Business Profile writes", module: "src/local-seo" },
    { id: "crm.write", fr: "Écritures CRM", en: "CRM writes", module: "src/crm" },
    { id: "social.publish", fr: "Publications sociales", en: "Social publications", module: "src/console/social.ts" },
  ],
  note: "Une action du catalogue est exécutable en un clic mais reste journalisée.",
};

/** api() double: fixed catalog, a ledger of one proposed operation, graceful gestures. */
const apiWith = () => vi.fn(async (route: string, body?: Record<string, unknown>) => {
  if (route === "/actions/catalog") return catalog;
  if (route === "/actions/operations") return { version: catalog.version, operations: [operation("proposed")] };
  if (route === "/actions/propose") return { operation: operation("proposed"), auditTrail: [event(1, "proposed")] };
  if (route === "/actions/execute")
    return { replay: false, operation: operation("succeeded", 1), attempt: { id: "att-1", status: "succeeded", outcome: "succeeded", detail: "", result: null, startedAt: 1_763_900_000_100, completedAt: 1_763_900_001_000 }, auditTrail: [event(1, "approved"), event(2, "claimed"), event(3, "succeeded")] };
  throw new Error(`unexpected route ${route} ${JSON.stringify(body)}`);
});

/** The operations table is the one that lists the fixture operation id. */
const opsTable = (root: HTMLElement) => [...root!.querySelectorAll("table")].find((t) => t.textContent?.includes("op-1"))!;

it.each(["fr", "en"])("renders the catalog, the exclusions and the operations table in %s", async lang => {
  const { document } = dom(lang);
  const api = apiWith();
  const { renderOpsActions } = await import("../site/console/actions.js");
  const root = renderOpsActions({ api, me: { role: "tenant-admin" } });
  document.body.append(root!);
  await vi.waitFor(() => expect(root!.textContent).toContain("preapproved-actions-v1"));
  expect(root!.querySelector("h3")!.textContent).toBe(lang === "fr" ? "Catalogue d'actions pré-approuvées" : "Pre-approved action catalog");
  expect(root!.textContent).toContain(lang === "fr" ? "Soumission IndexNow" : "IndexNow submission");
  expect(root!.textContent).toContain("draft.generate");
  expect(root!.textContent).toContain("report.dispatch");
  expect(root!.textContent).toContain(lang === "fr" ? "Jamais éligibles" : "Never eligible");
  expect(root!.textContent).toContain("apply.robots-meta");
  expect(root!.textContent).toContain("social.publish");
  expect(root!.textContent).toContain(lang === "fr" ? "3 actions éligibles" : "3 eligible actions");
  const headings = [...root!.querySelectorAll("h4")].map((h) => h.textContent);
  expect(headings).toContain(lang === "fr" ? "Proposer une opération" : "Propose an operation");
  expect(headings).toContain(lang === "fr" ? "Opérations du client" : "Tenant operations");
  expect(root!.textContent).toContain("indexnow.submit");
  expect(root!.textContent).toContain(lang === "fr" ? "proposée" : "proposed");
  expect(root!.textContent).toContain(lang === "fr" ? "console" : "console");
});

it("proposes a strict-catalog operation and refreshes the ledger", async () => {
  const { document } = dom("en");
  const api = apiWith();
  const { renderOpsActions } = await import("../site/console/actions.js");
  const root = renderOpsActions({ api, me: { role: "tenant-admin" } });
  document.body.append(root!);
  await vi.waitFor(() => expect(root!.textContent).toContain("preapproved-actions-v1"));
  const textarea = root!.querySelector("textarea")!;
  textarea.value = '{"host":"exemple.fr","key":"abc123","urls":["https://exemple.fr/page"]}';
  const propose = [...root!.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Propose")!;
  propose.click();
  await vi.waitFor(() => expect(api.mock.calls.some((call: any[]) => call[0] === "/actions/propose" && call[1].action === "indexnow.submit" && call[1].terms.host === "exemple.fr")).toBe(true));
  await vi.waitFor(() => expect(api.mock.calls.filter((call: any[]) => call[0] === "/actions/operations").length).toBeGreaterThanOrEqual(2));
  expect(root!.textContent).toContain("Operation proposed");
});

it("refuses malformed terms JSON locally without any call", async () => {
  const { document } = dom("en");
  const api = apiWith();
  const { renderOpsActions } = await import("../site/console/actions.js");
  const root = renderOpsActions({ api, me: { role: "tenant-admin" } });
  document.body.append(root!);
  await vi.waitFor(() => expect(root!.textContent).toContain("preapproved-actions-v1"));
  const textarea = root!.querySelector("textarea")!;
  textarea.value = '{"host": oops}';
  const propose = [...root!.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Propose")!;
  const callsBefore = api.mock.calls.length;
  propose.click();
  await vi.waitFor(() => expect(root!.textContent).toContain("Invalid terms: JSON expected"));
  expect(api.mock.calls.length).toBe(callsBefore);
});

it("runs the one-click execution, journals the audit trail and shows a stale-claim note", async () => {
  const { document } = dom("en");
  let executed = false;
  const api = vi.fn(async (route: string, body?: Record<string, unknown>) => {
    if (route === "/actions/catalog") return catalog;
    if (route === "/actions/operations") return { version: catalog.version, operations: [operation(executed ? "reconciling" : "approved", executed ? 1 : 0)] };
    if (route === "/actions/execute") {
      executed = true;
      return { stale: true, operation: operation("reconciling", 1), attempt: { id: "att-1", status: "reconciling", outcome: null, detail: "timeout", result: null, startedAt: 1_763_900_000_100, completedAt: null }, auditTrail: [event(1, "stale-claim")], note: "Exécution interrompue détectée : l'opération passe en réconciliation jusqu'à vérification du résultat externe ; aucun nouvel essai automatique." };
    }
    throw new Error(`unexpected route ${route} ${JSON.stringify(body)}`);
  });
  const { renderOpsActions } = await import("../site/console/actions.js");
  const root = renderOpsActions({ api, me: { role: "tenant-admin" } });
  document.body.append(root!);
  await vi.waitFor(() => expect(opsTable(root!).textContent).toContain("approved"));
  const run = [...root!.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Run (one click)")!;
  run.click();
  await vi.waitFor(() => expect(api.mock.calls.some((call: any[]) => call[0] === "/actions/execute" && call[1].operationId === "op-1" && call[1].approve === true)).toBe(true));
  await vi.waitFor(() => expect(root!.textContent).toContain("aucun nouvel essai automatique"));
  await vi.waitFor(() => expect(root!.textContent).toContain("reconciling"));
  /* The audit trail of the last gesture renders as a details block with its events. */
  expect(root!.querySelector("details")!.textContent).toContain("stale-claim");
  expect(root!.querySelector("details")!.textContent).toContain("user-1");
});

it("resolves a reconciling operation on a verified external outcome", async () => {
  const { document } = dom("en");
  const api = vi.fn(async (route: string, body?: Record<string, unknown>) => {
    if (route === "/actions/catalog") return catalog;
    if (route === "/actions/operations") return { version: catalog.version, operations: [operation("reconciling", 1)] };
    if (route === "/actions/resolve") return { operation: operation("succeeded", 1), attempt: { id: "att-1", status: "succeeded", outcome: "succeeded", detail: "verified", result: null, startedAt: 1_763_900_000_100, completedAt: 1_763_900_002_000 }, auditTrail: [event(1, "resolved", "verified")] };
    if (route === "/actions/cancel") return { operation: operation("cancelled"), auditTrail: [event(1, "cancelled")] };
    throw new Error(`unexpected route ${route} ${JSON.stringify(body)}`);
  });
  const { renderOpsActions } = await import("../site/console/actions.js");
  const root = renderOpsActions({ api, me: { role: "tenant-admin" } });
  document.body.append(root!);
  await vi.waitFor(() => expect(opsTable(root!).textContent).toContain("reconciling"));
  const detail = root!.querySelector<HTMLInputElement>("input[placeholder='external verification']")!;  detail.value = "provider console shows the submission";
  const resolve = [...root!.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Resolve")!;
  resolve.click();
  await vi.waitFor(() => expect(api.mock.calls.some((call: any[]) => call[0] === "/actions/resolve" && call[1].operationId === "op-1" && call[1].outcome === "succeeded" && call[1].detail === "provider console shows the submission")).toBe(true));
  await vi.waitFor(() => expect(root!.querySelector("details")!.textContent).toContain("resolved"));
});

it("keeps every gesture read-only for a member: catalog and ledger only", async () => {
  const { document } = dom("en");
  const api = apiWith();
  const { renderOpsActions } = await import("../site/console/actions.js");
  const root = renderOpsActions({ api, me: { role: "member" } });
  document.body.append(root!);
  await vi.waitFor(() => expect(root!.textContent).toContain("preapproved-actions-v1"));
  expect(root!.textContent).toContain("Only tenant administrators can propose, approve, execute or resolve an operation.");
  expect(root!.querySelector("textarea")).toBeNull();
  expect(root!.querySelector("select")).toBeNull();
  const buttons = [...root!.querySelectorAll<HTMLButtonElement>("button")];
  expect(buttons.length).toBe(0);
  expect(api.mock.calls.map((call: any[]) => call[0]).sort()).toEqual(["/actions/catalog", "/actions/operations"]);
  expect(root!.textContent).toContain("proposed");
  expect(root!.textContent).toContain("Attempts");
});

it("surfaces a refused gesture without inventing a state", async () => {
  const { document } = dom("en");
  const api = vi.fn(async (route: string) => {
    if (route === "/actions/catalog") return catalog;
    if (route === "/actions/operations") return { version: catalog.version, operations: [operation("proposed")] };
    throw new Error("L'hôte IndexNow n'est pas un domaine enregistré de ce tenant.");
  });
  const { renderOpsActions } = await import("../site/console/actions.js");
  const root = renderOpsActions({ api, me: { role: "tenant-admin" } });
  document.body.append(root!);
  await vi.waitFor(() => expect(root!.textContent).toContain("proposed"));
  const run = [...root!.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Run (one click)")!;
  run.click();
  await vi.waitFor(() => expect(root!.textContent).toContain("L'hôte IndexNow n'est pas un domaine enregistré de ce tenant."));
  /* The ledger table still shows the recorded state, never an invented one. */
  expect(opsTable(root!).textContent).toContain("proposed");
});
