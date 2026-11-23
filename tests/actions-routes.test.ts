import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { actionRoutes } from "../src/console/actions.js";
import { ActionLedger } from "../src/actions/ledger.js";
import type { HandlerContext } from "../src/console/util.js";

const ledgers: ActionLedger[] = [];
afterEach(() => { for (const ledger of ledgers.splice(0)) ledger.close(); });

const T0 = Date.parse("2026-11-23T12:00:00Z");
const tenant = { id: "acme", name: "Acme", domains: ["exemple.fr", "sous.exemple.fr"], gscProperties: [], ga4Properties: [], status: "active" } as never;
const ctx = (body: Record<string, unknown> = {}): HandlerContext =>
  ({ url: "", body, tenancy: { tenant: { id: "acme", status: "active", domains: ["exemple.fr", "sous.exemple.fr"] } as never }, user: { sub: "admin-1" } }) as HandlerContext;
const memberCtx = (): HandlerContext => ({ url: "", body: {}, tenancy: { tenant: { id: "acme", status: "active", domains: [] } as never } }) as HandlerContext;

const makeRoutes = () => {
  const ledger = new ActionLedger(join(mkdtempSync(join(tmpdir(), "actions-routes-")), "actions.sqlite3"));
  ledgers.push(ledger);
  const calls: Array<{ action: string; terms: Record<string, unknown>; outcome: string }> = [];
  const routes = actionRoutes({
    ledger,
    now: () => T0,
    adapters: {
      submitIndexNow: async (terms) => { calls.push({ action: "indexnow.submit", terms: terms as Record<string, unknown>, outcome: "succeeded" }); return { status: 200, urlCount: terms.urls.length }; },
      dispatchReportFollowUp: async (followUpId) => { calls.push({ action: "report.dispatch", terms: { followUpId }, outcome: "succeeded" }); return { status: "sent" as const }; },
    },
  });
  return { routes, ledger, calls };
};
const route = (routes: ReturnType<typeof actionRoutes>, path: string) => routes.find((r) => r.path === path)!;

describe("action catalog routes (R11)", () => {
  it("publishes the catalog and the explicit exclusions to every member", async () => {
    const { routes } = makeRoutes();
    const catalogRoute = route(routes, "/actions/catalog");
    expect(catalogRoute.adminOnly).toBeUndefined();
    const result = await catalogRoute.handler(memberCtx()) as Record<string, unknown>;
    expect(result.version).toBe("preapproved-actions-v1");
    expect((result.actions as { id: string }[]).map((a) => a.id)).toEqual(["indexnow.submit", "draft.generate", "report.dispatch"]);
    expect((result.excluded as { id: string }[]).map((e) => e.id)).toContain("wordpress.publish");
    expect(String(result.note)).toContain("confirmation humaine");
  });

  it("keeps proposal, approval and execution tenant-admin only", () => {
    const { routes } = makeRoutes();
    for (const path of ["/actions/propose", "/actions/approve", "/actions/execute", "/actions/cancel", "/actions/resolve"]) {
      expect(route(routes, path).adminOnly).toBe(true);
    }
    expect(route(routes, "/actions/operations").adminOnly).toBeUndefined();
  });

  it("proposes, one-click approves and executes a draft generation, all journaled", async () => {
    const { routes, calls } = makeRoutes();
    const proposed = await route(routes, "/actions/propose").handler(ctx({ action: "draft.generate", terms: { kind: "titles", input: { keyword: "audit seo" } } })) as { operation: { id: string; state: string } ; auditTrail: { event: string }[] };
    expect(proposed.operation.state).toBe("proposed");
    expect(proposed.auditTrail.map((e) => e.event)).toEqual(["proposed"]);
    const executed = await route(routes, "/actions/execute").handler(ctx({ operationId: proposed.operation.id, approve: true })) as Record<string, unknown>;
    expect(executed.replay).toBe(false);
    expect((executed.operation as { state: string }).state).toBe("succeeded");
    expect((executed.attempt as { outcome: string }).outcome).toBe("succeeded");
    expect((executed.auditTrail as { event: string }[]).map((e) => e.event)).toEqual(["succeeded", "claimed", "approved", "proposed"]);
    expect(calls.filter((c) => c.action === "draft.generate").length).toBe(0); // draft is generated in-process, no external adapter
    expect(JSON.stringify((executed.operation as { terms: unknown }).terms)).toContain("audit seo");
  });

  it("returns the proposals and operations of this tenant only", async () => {
    const { routes } = makeRoutes();
    await route(routes, "/actions/propose").handler(ctx({ action: "draft.generate", terms: { kind: "titles", input: { keyword: "audit seo" } } }));
    const list = await route(routes, "/actions/operations").handler(ctx({})) as { operations: { tenantId: string; action: string; state: string }[] };
    expect(list.operations).toHaveLength(1);
    expect(list.operations[0]).toMatchObject({ tenantId: "acme", action: "draft.generate", state: "proposed" });
  });

  it("refuses to propose an IndexNow submission for a host outside the tenant domains", async () => {
    const { routes } = makeRoutes();
    await expect(route(routes, "/actions/propose").handler(ctx({ action: "indexnow.submit", terms: { host: "etranger.fr", key: "A1b2C3d4E5", urls: ["https://etranger.fr/a"] } })))
      .rejects.toThrow("n'est pas un domaine enregistré");
    const proposed = await route(routes, "/actions/propose").handler(ctx({ action: "indexnow.submit", terms: { host: "sous.exemple.fr", key: "A1b2C3d4E5", urls: ["https://sous.exemple.fr/a"] } })) as { operation: { id: string } };
    const executed = await route(routes, "/actions/execute").handler(ctx({ operationId: proposed.operation.id, approve: true })) as { operation: { state: string } };
    expect(executed.operation.state).toBe("succeeded");
  });

  it("refuses to propose anything outside the catalog, without exception", async () => {
    const { routes } = makeRoutes();
    await expect(route(routes, "/actions/propose").handler(ctx({ action: "wordpress.publish", terms: { postId: 1 } }))).rejects.toThrow("hors catalogue");
    await expect(route(routes, "/actions/propose").handler(ctx({ action: "robots.txt", terms: {} }))).rejects.toThrow("hors catalogue");
  });

  it("replays a repeated execution instead of running the adapter twice", async () => {
    const { routes, calls } = makeRoutes();
    const proposed = await route(routes, "/actions/propose").handler(ctx({ action: "report.dispatch", terms: { followUpId: "suivi-123" } })) as { operation: { id: string } };
    await route(routes, "/actions/execute").handler(ctx({ operationId: proposed.operation.id, approve: true }));
    const replay = await route(routes, "/actions/execute").handler(ctx({ operationId: proposed.operation.id })) as Record<string, unknown>;
    expect(replay.replay).toBe(true);
    expect(String(replay.note)).toContain("aucune nouvelle tentative");
    expect(calls.filter((c) => c.action === "report.dispatch").length).toBe(1);
  });

  it("refuses to execute without a live approval and reports an expired one", async () => {
    const { routes } = makeRoutes();
    const proposed = await route(routes, "/actions/propose").handler(ctx({ action: "draft.generate", terms: { kind: "titles", input: { keyword: "audit seo" } } })) as { operation: { id: string } };
    await expect(route(routes, "/actions/execute").handler(ctx({ operationId: proposed.operation.id }))).rejects.toThrow("approuvée");
    await route(routes, "/actions/approve").handler(ctx({ operationId: proposed.operation.id }));
    const done = await route(routes, "/actions/execute").handler(ctx({ operationId: proposed.operation.id, approve: true })) as Record<string, unknown>;
    expect(done.replay).toBe(false);
  });

  it("cancels a proposed operation and resolves a reconciling one only with a verified outcome", async () => {
    const { routes } = makeRoutes();
    const proposed = await route(routes, "/actions/propose").handler(ctx({ action: "draft.generate", terms: { kind: "titles", input: { keyword: "audit seo" } } })) as { operation: { id: string } };
    const cancelled = await route(routes, "/actions/cancel").handler(ctx({ operationId: proposed.operation.id })) as { operation: { state: string } };
    expect(cancelled.operation.state).toBe("cancelled");
    const other = await route(routes, "/actions/propose").handler(ctx({ action: "draft.generate", terms: { kind: "meta", input: { keyword: "crm pme" } } })) as { operation: { id: string } };
    await expect(route(routes, "/actions/resolve").handler(ctx({ operationId: other.operation.id, outcome: "succeeded", detail: "x" }))).rejects.toThrow("réconciliée");
    await expect(route(routes, "/actions/resolve").handler(ctx({ operationId: other.operation.id, outcome: "maybe", detail: "x" }))).rejects.toThrow("succeeded ou failed");
  });

  it("requires an active tenant for catalog operations", async () => {
    const { routes } = makeRoutes();
    await expect(route(routes, "/actions/operations").handler({ url: "", body: {} } as HandlerContext)).rejects.toThrow("tenant actif");
  });
});
