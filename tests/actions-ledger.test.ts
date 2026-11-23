import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionLedger } from "../src/actions/ledger.js";

const ledgers: ActionLedger[] = [];
const makeLedger = (): ActionLedger => {
  const ledger = new ActionLedger(join(mkdtempSync(join(tmpdir(), "actions-")), "actions.sqlite3"));
  ledgers.push(ledger);
  return ledger;
};
afterEach(() => { for (const ledger of ledgers.splice(0)) ledger.close(); });

const T0 = Date.parse("2026-11-23T12:00:00Z");
const HOUR = 3600_000;
const draftTerms = { kind: "titles", input: { keyword: "audit seo", brand: null, topic: null, audience: null, benefit: null, existingTitle: null, existingHeadings: [] } };

describe("action ledger lifecycle (R11)", () => {
  it("proposes an operation with its exact-terms digest, catalog version and entry/expiry rules", () => {
    const ledger = makeLedger();
    const op = ledger.propose({ tenantId: "acme", action: "draft.generate", terms: draftTerms, origin: "console", actor: "admin-1", now: T0 });
    expect(op.state).toBe("proposed");
    expect(op.revision).toBe(1);
    expect(op.origin).toBe("console");
    expect(op.proposalExpiresAt).toBe(T0 + 72 * HOUR);
    expect(op.termsSha).toMatch(/^[0-9a-f]{64}$/);
    expect(op.terms).toEqual(draftTerms);
    expect(() => ledger.propose({ tenantId: "acme", action: "gbp.write", terms: {}, origin: "console", actor: "admin-1", now: T0 })).toThrow("hors catalogue");
    expect(() => ledger.get("other", op.id)).toThrow("introuvable"); // tenant isolation on read
  });

  it("approves the exact terms and refuses to approve an expired proposal", () => {
    const ledger = makeLedger();
    const op = ledger.propose({ tenantId: "acme", action: "draft.generate", terms: draftTerms, origin: "console", actor: "admin-1", now: T0 });
    const approved = ledger.approve({ tenantId: "acme", operationId: op.id, actor: "admin-1", now: T0 + HOUR });
    expect(approved.state).toBe("approved");
    expect(approved.approvedBy).toBe("admin-1");
    expect(approved.approvalExpiresAt).toBe(T0 + HOUR + 24 * HOUR);
    const late = ledger.propose({ tenantId: "acme", action: "draft.generate", terms: draftTerms, origin: "console", actor: "admin-1", now: T0 });
    expect(() => ledger.approve({ tenantId: "acme", operationId: late.id, actor: "admin-1", now: T0 + 73 * HOUR })).toThrow("Proposition expirée");
  });

  it("claims atomically: a second live claim replays the attempt, no duplicate execution", () => {
    const ledger = makeLedger();
    const op = ledger.propose({ tenantId: "acme", action: "draft.generate", terms: draftTerms, origin: "console", actor: "a", now: T0 });
    ledger.approve({ tenantId: "acme", operationId: op.id, actor: "a", now: T0 + 1 });
    const first = ledger.claim({ tenantId: "acme", operationId: op.id, actor: "a", now: T0 + 2 });
    expect(first.kind).toBe("claimed");
    expect(first.attempt?.status).toBe("executing");
    const replay = ledger.claim({ tenantId: "acme", operationId: op.id, actor: "a", now: T0 + 3 });
    expect(replay.kind).toBe("replay");
    expect(replay.attempt?.id).toBe(first.attempt?.id);
    const op2 = ledger.get("acme", op.id);
    expect(op2.attempts).toBe(1);
  });

  it("refuses to execute without a live approval", () => {
    const ledger = makeLedger();
    const op = ledger.propose({ tenantId: "acme", action: "draft.generate", terms: draftTerms, origin: "console", actor: "a", now: T0 });
    expect(() => ledger.claim({ tenantId: "acme", operationId: op.id, actor: "a", now: T0 + 1 })).toThrow("approuvée");
    ledger.approve({ tenantId: "acme", operationId: op.id, actor: "a", now: T0 + 1 });
    expect(() => ledger.claim({ tenantId: "acme", operationId: op.id, actor: "a", now: T0 + 1 + 25 * HOUR })).toThrow("Approbation expirée");
  });

  it("journals every transition as an audit event per execution", () => {
    const ledger = makeLedger();
    const op = ledger.propose({ tenantId: "acme", action: "draft.generate", terms: draftTerms, origin: "console", actor: "a", now: T0 });
    ledger.approve({ tenantId: "acme", operationId: op.id, actor: "a", now: T0 + 1 });
    ledger.claim({ tenantId: "acme", operationId: op.id, actor: "a", now: T0 + 2 });
    ledger.complete({ tenantId: "acme", operationId: op.id, outcome: "succeeded", detail: "Brouillon généré localement.", actor: "a", now: T0 + 3 });
    const events = ledger.events("acme", op.id, 50);
    expect(events.map((e) => e.event)).toEqual(["succeeded", "claimed", "approved", "proposed"]) // latest first;
    expect(events.every((e) => e.tenantId === "acme" && e.operationId === op.id)).toBe(true);
    expect(ledger.get("acme", op.id).state).toBe("succeeded");
  });

  it("keeps an ambiguous outcome reconciling until a verified resolution, and refuses bare retries", () => {
    const ledger = makeLedger();
    const op = ledger.propose({ tenantId: "acme", action: "indexnow.submit", terms: { host: "exemple.fr", key: "A1b2C3d4E5", urls: ["https://exemple.fr/a"] }, origin: "console", actor: "a", now: T0 });
    ledger.approve({ tenantId: "acme", operationId: op.id, actor: "a", now: T0 + 1 });
    ledger.claim({ tenantId: "acme", operationId: op.id, actor: "a", now: T0 + 2 });
    const { operation, attempt } = ledger.complete({ tenantId: "acme", operationId: op.id, outcome: "ambiguous", detail: "IndexNow : délai dépassé sans réponse (HTTP —).", actor: "a", now: T0 + 3 });
    expect(operation.state).toBe("reconciling");
    expect(attempt.outcome).toBe("ambiguous");
    expect(() => ledger.claim({ tenantId: "acme", operationId: op.id, actor: "a", now: T0 + 4 })).toThrow("réconciliée");
    const resolved = ledger.resolve({ tenantId: "acme", operationId: op.id, outcome: "succeeded", detail: "Soumission visible dans la Search Console de l'exploitant.", actor: "a", now: T0 + 10 * HOUR });
    expect(resolved.operation.state).toBe("succeeded");
    expect(resolved.attempt.status).toBe("succeeded");
  });

  it("detects a stale claim (process died between steps) and keeps it ambiguous, never resumable", () => {
    const ledger = makeLedger();
    const op = ledger.propose({ tenantId: "acme", action: "draft.generate", terms: draftTerms, origin: "console", actor: "a", now: T0 });
    ledger.approve({ tenantId: "acme", operationId: op.id, actor: "a", now: T0 + 1 });
    ledger.claim({ tenantId: "acme", operationId: op.id, actor: "a", now: T0 + 2 });
    // A live in-flight claim just replays within the freshness window…
    const live = ledger.claim({ tenantId: "acme", operationId: op.id, actor: "a", now: T0 + 3 * 60_000 });
    expect(live.kind).toBe("replay");
    expect(ledger.get("acme", op.id).state).toBe("executing");
    // …but a claim old enough without any completion is a dead process: reconcile, never resume.
    const stale = ledger.claim({ tenantId: "acme", operationId: op.id, actor: "other-process", now: T0 + 20 * 60_000 });
    expect(stale.kind).toBe("stale");
    expect(ledger.get("acme", op.id).state).toBe("reconciling");
    const events = ledger.events("acme", op.id, 50);
    expect(events.map((e) => e.event)).toContain("stale-claim");
  });

  it("cancels only a proposed or approved operation", () => {
    const ledger = makeLedger();
    const op = ledger.propose({ tenantId: "acme", action: "draft.generate", terms: draftTerms, origin: "pap", actor: "agent-1", now: T0 });
    const cancelled = ledger.cancel({ tenantId: "acme", operationId: op.id, actor: "admin-1", now: T0 + 1 });
    expect(cancelled.state).toBe("cancelled");
    expect(() => ledger.approve({ tenantId: "acme", operationId: op.id, actor: "a", now: T0 + 2 })).toThrow("annulée");
  });

  it("lists tenant-scoped operations only", () => {
    const ledger = makeLedger();
    const a = ledger.propose({ tenantId: "acme", action: "draft.generate", terms: draftTerms, origin: "console", actor: "a", now: T0 });
    ledger.propose({ tenantId: "other", action: "draft.generate", terms: draftTerms, origin: "console", actor: "b", now: T0 });
    const list = ledger.list("acme", 10);
    expect(list.map((o) => o.id)).toEqual([a.id]);
  });
});
