import { afterEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApplyRegistry } from "../src/apply/registry.js";
import type { ApplyPrincipal } from "../src/apply/principal.js";
import { createPostApplyProposal } from "../src/apply/post-proposal.js";
import { executeApprovedProposal, rollbackProposal, type ApplyWriter } from "../src/apply/execution.js";
import { digest } from "../src/apply/sealed-payload.js";
import { createWordpressRestWriter, type HttpTransport } from "../src/apply/writers/wordpress-rest.js";
import { createApplyMutationRoutes, applyWriteRoutes } from "../src/console/apply-routes.js";
import type { HandlerContext } from "../src/console/util.js";

const t0 = new Date("2026-11-18T12:00:00Z");
const t1 = new Date(t0.getTime() + 30_000);
const t2 = new Date(t0.getTime() + 60_000);
const t3 = new Date(t0.getTime() + 90_000);

const observedText = "My page\n\nHello world";
const proposedText = "My page\n\nHello fixed world";

const reader: ApplyPrincipal = { tenantId: "acme", actorId: "oidc-reader", role: "reader" };
const approver: ApplyPrincipal = { tenantId: "acme", actorId: "oidc-approver", role: "approver" };
const other: ApplyPrincipal = { tenantId: "other", actorId: "oidc-other", role: "admin" };
const registries: ApplyRegistry[] = [];
afterEach(() => { for (const registry of registries.splice(0)) registry.close(); });

function createFixture() {
  const file = join(mkdtempSync(join(tmpdir(), "apply-execution-")), "apply.sqlite3");
  const key = randomBytes(32);
  const grant = { hostname: "example.com", status: "verified" as const,
    verifiedAt: "2026-11-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z" };
  const lookup = { activeGrant: vi.fn((tenantId: string, hostname: string, _at: Date) =>
    tenantId === "acme" && hostname === "example.com" ? grant : undefined) };
  const registry = new ApplyRegistry(file, key, lookup, 30);
  registries.push(registry);
  return { registry, lookup };
}

function postProposal(now: Date, after = proposedText) {
  return createPostApplyProposal({
    tenantId: "acme", siteUrl: "https://example.com", restType: "pages", postId: 12,
    observed: { text: observedText, status: "publish" }, proposed: { text: after }, now,
  });
}

/** Mutable in-memory adapter: records bounded calls only, never any network. */
function fakeWriter(initial: string) {
  let current = initial;
  const calls = { inspect: 0, write: 0 };
  let writeImpl = async (content: string): Promise<{ httpStatus: number }> => {
    current = content;
    return { httpStatus: 200 };
  };
  const writer: ApplyWriter = {
    inspect: async () => {
      calls.inspect++;
      return { content: current, httpStatus: 200, status: "publish" };
    },
    write: async (content: string, idempotencyKey: string) => {
      calls.write++;
      if (!/^[a-zA-Z0-9_-]{16,128}$/.test(idempotencyKey))
        throw new Error("A valid idempotency key is required");
      return writeImpl(content);
    },
  };
  return {
    writer, calls,
    get current() { return current; },
    restore(text: string) { current = text; },
    failWrites() {
      writeImpl = async () => { throw new Error("connection reset before ACK"); };
    },
    tamperOnWrite() {
      writeImpl = async () => { current = "Tampered\n\nbody"; return { httpStatus: 200 }; };
    },
  };
}

describe("Apply Mode execution engine (WordPress post slice)", () => {
  it("executes a double-approved write, verifies it and journals every step", async () => {
    const { registry } = createFixture();
    const proposal = postProposal(t0);
    const id = registry.recordPreview(reader, proposal, t0);
    registry.approve(approver, id, proposal.diffSha256, true, t1);
    const fake = fakeWriter(observedText);

    const receipt = await executeApprovedProposal({
      registry, principal: approver, proposalId: id, writer: fake.writer, now: t2,
    });
    expect(receipt.outcome).toBe("verified");
    expect(receipt.attempt).toMatchObject({ kind: "write", status: "verified", targetUrl: proposal.target.url });
    expect(receipt.attempt.verifiedSha256).toBe(proposal.proposedSha256);
    expect(registry.state(approver, id)).toBe("verified");
    expect(fake.current).toBe(proposal.after);
    // Approvals are single-use: a replay cannot start a second write.
    await expect(executeApprovedProposal({
      registry, principal: approver, proposalId: id, writer: fake.writer, now: t2,
    })).rejects.toThrow("drifted");

    registry.approveRollback(approver, id, true, t3);
    const rollback = await rollbackProposal({
      registry, principal: approver, proposalId: id, writer: fake.writer, now: t3,
    });
    expect(rollback.outcome).toBe("rolled_back");
    expect(rollback.attempt).toMatchObject({ kind: "rollback", status: "rolled_back" });
    expect(fake.current).toBe(observedText);
    expect(registry.state(approver, id)).toBe("rolled_back");
    expect(registry.verifyJournal("acme")).toBe(true);
    expect(registry.auditEvents(approver).map(event => event.action)).toEqual([
      "preview_recorded", "approval_recorded", "snapshot_encrypted", "execution_started",
      "execution_verified", "rollback_approved", "rollback_started", "execution_rolled_back",
    ]);
  });

  it("rejects drift before the backup without consuming the single-use approval", async () => {
    const { registry } = createFixture();
    const proposal = postProposal(t0);
    const id = registry.recordPreview(reader, proposal, t0);
    registry.approve(approver, id, proposal.diffSha256, true, t1);
    const drifted = fakeWriter("Someone edited\n\nmeanwhile");

    await expect(executeApprovedProposal({
      registry, principal: approver, proposalId: id, writer: drifted.writer, now: t2,
    })).rejects.toThrow("drifted");
    expect(drifted.calls.write).toBe(0);
    expect(registry.trustedApproval(approver, id)?.consumedAt).toBeNull();
    expect(registry.state(approver, id)).toBe("approved");
  });

  it("treats a lost adapter ACK as uncertain and keeps the target lock", async () => {
    const { registry } = createFixture();
    const proposal = postProposal(t0);
    const id = registry.recordPreview(reader, proposal, t0);
    registry.approve(approver, id, proposal.diffSha256, true, t1);
    const lost = fakeWriter(observedText);
    lost.failWrites();

    const receipt = await executeApprovedProposal({
      registry, principal: approver, proposalId: id, writer: lost.writer, now: t2,
    });
    expect(receipt.outcome).toBe("uncertain");
    expect(receipt.attempt.status).toBe("uncertain");
    expect(receipt.attempt.completedAt).toBeNull();
    expect(registry.state(approver, id)).toBe("uncertain");

    // A second proposal on the same target cannot reserve a new attempt.
    const second = createPostApplyProposal({
      tenantId: "acme", siteUrl: "https://example.com", restType: "pages", postId: 12,
      observed: { text: observedText, status: "publish" },
      proposed: { text: "My page\n\nHello other world" }, now: new Date(t0.getTime() + 1000),
    });
    const id2 = registry.recordPreview(reader, second, new Date(t0.getTime() + 1000));
    registry.approve(approver, id2, second.diffSha256, true, new Date(t0.getTime() + 2000));
    registry.backup(approver, id2, observedText, new Date(t0.getTime() + 3000));
    expect(() => registry.beginExecution(approver, id2, "0123456789abcdef",
      new Date(t0.getTime() + 4000))).toThrow("target lock");
  });

  it("lands in to_verify when the stored content differs from the proposal", async () => {
    const { registry } = createFixture();
    const proposal = postProposal(t0);
    const id = registry.recordPreview(reader, proposal, t0);
    registry.approve(approver, id, proposal.diffSha256, true, t1);
    const tampered = fakeWriter(observedText);
    tampered.tamperOnWrite();

    const receipt = await executeApprovedProposal({
      registry, principal: approver, proposalId: id, writer: tampered.writer, now: t2,
    });
    expect(receipt.outcome).toBe("to_verify");
    expect(receipt.attempt.status).toBe("to_verify");
    expect(receipt.attempt.verifiedSha256).toBe(digest("Tampered\n\nbody"));
    expect(receipt.observedSha256).not.toBe(receipt.expectedSha256);
    expect(registry.state(approver, id)).toBe("to_verify");
  });

  it("fails the rollback instead of clobbering a drifted target, and preserves the snapshot", async () => {
    const { registry } = createFixture();
    const proposal = postProposal(t0);
    const id = registry.recordPreview(reader, proposal, t0);
    registry.approve(approver, id, proposal.diffSha256, true, t1);
    const fake = fakeWriter(observedText);
    await executeApprovedProposal({ registry, principal: approver, proposalId: id, writer: fake.writer, now: t2 });

    fake.restore("A third party\n\nchanged the page");
    registry.approveRollback(approver, id, true, t3);
    const rollback = await rollbackProposal({
      registry, principal: approver, proposalId: id, writer: fake.writer, now: t3,
    });
    expect(rollback.outcome).toBe("failed");
    expect(registry.state(approver, id)).toBe("failed");
    expect(fake.calls.write).toBe(1); // no second PUT was attempted
    // The encrypted snapshot is still restorable for manual reconciliation.
    expect(registry.readBackup(approver, id, t3)).toBe(observedText);
  });

  it("treats an already-restored target as idempotent rolled_back with no second write", async () => {
    const { registry } = createFixture();
    const proposal = postProposal(t0);
    const id = registry.recordPreview(reader, proposal, t0);
    registry.approve(approver, id, proposal.diffSha256, true, t1);
    const fake = fakeWriter(observedText);
    await executeApprovedProposal({ registry, principal: approver, proposalId: id, writer: fake.writer, now: t2 });

    fake.restore(observedText); // the write never landed / was already undone
    registry.approveRollback(approver, id, true, t3);
    const rollback = await rollbackProposal({
      registry, principal: approver, proposalId: id, writer: fake.writer, now: t3,
    });
    expect(rollback.outcome).toBe("rolled_back");
    expect(fake.calls.write).toBe(1);
    expect(registry.state(approver, id)).toBe("rolled_back");
  });

  it("validates idempotency keys, cross-tenant access and rollback preconditions", async () => {
    const { registry } = createFixture();
    const proposal = postProposal(t0);
    const id = registry.recordPreview(reader, proposal, t0);
    registry.approve(approver, id, proposal.diffSha256, true, t1);
    registry.backup(approver, id, observedText, t2);

    expect(() => registry.beginExecution(approver, id, "short", t2)).toThrow("idempotency key");
    expect(registry.readPreview(other, id)).toBeNull();
    expect(() => registry.approveRollback(approver, id, false, t2)).toThrow("explicit confirmed");
    expect(() => registry.beginRollback(approver, id, "0123456789abcdef", t2)).toThrow("rollback-eligible");

    const begin = registry.beginExecution(approver, id, "0123456789abcdef", t2);
    expect(begin.kind).toBe("wordpress-post");
    registry.completeExecution(approver, id, begin.attemptId, {
      httpStatus: 200, writtenSha256: proposal.proposedSha256,
      verifiedSha256: proposal.proposedSha256, outcome: "verified",
    }, t2);
    // Double-approval is single-use: a consumed rollback approval cannot restart.
    registry.approveRollback(approver, id, true, t3);
    registry.beginRollback(approver, id, "0123456789abcdef1", t3);
    expect(() => registry.beginRollback(approver, id, "0123456789abcdef2", t3)).toThrow("rollback-eligible");
  });
});

function routeContext(body: Record<string, unknown>): HandlerContext {
  return {
    url: "",
    body,
    user: { sub: "oidc-approver" },
    tenancy: {
      tenant: { id: "acme", domains: ["example.com"], status: "active" },
      role: "tenant-admin", platformAdmin: true, memberships: [],
    },
  } as unknown as HandlerContext;
}

describe("Apply Mode console mutation routes", () => {
  it("fails closed when writes are disabled or no registry is configured", async () => {
    const routes = createApplyMutationRoutes({ registry: null, writesEnabled: false });
    const execute = routes.find(route => route.path === "/apply/execute")!;
    const rollback = routes.find(route => route.path === "/apply/rollback")!;
    await expect(execute.handler(routeContext({ proposalId: "x" }))).rejects.toThrow("disabled");
    await expect(rollback.handler(routeContext({ proposalId: "x", confirm: true }))).rejects.toThrow("disabled");
    await expect(applyWriteRoutes.find(route => route.path === "/apply/execute")!
      .handler(routeContext({ proposalId: "x" }))).rejects.toThrow("disabled");
  });

  it("runs the full lifecycle through the routes with a real registry", async () => {
    const { registry } = createFixture();
    const fake = fakeWriter(observedText);
    const routes = createApplyMutationRoutes({
      registry, writesEnabled: true,
      writerFor: (tenantId, target) =>
        tenantId === "acme" && target.origin === "https://example.com" ? fake.writer : null,
    });
    const handler = (path: string) => {
      const route = routes.find(candidate => candidate.path === path);
      if (!route) throw new Error(`Missing route ${path}`);
      return route.handler.bind(route);
    };

    const created = await handler("/apply/wordpress-post")(routeContext({
      url: "https://example.com", restType: "pages", postId: 12,
      title: "My page", content: "Hello fixed world",
    })) as { proposal: { proposalId: string; diffSha256: string; diff: string }; writesEnabled: boolean };
    expect(created.writesEnabled).toBe(true);
    expect(created.proposal.diff).toContain("+Hello fixed world");

    const approval = await handler("/apply/approve")(routeContext({
      proposalId: created.proposal.proposalId, diffSha256: created.proposal.diffSha256, confirm: true,
    })) as { approved: boolean };
    expect(approval.approved).toBe(true);

    const executed = await handler("/apply/execute")(routeContext({
      proposalId: created.proposal.proposalId,
    })) as { outcome: string; attempt: { status: string } };
    expect(executed.outcome).toBe("verified");
    expect(executed.attempt.status).toBe("verified");
    expect(fake.current).toBe(proposedText);

    const state = await handler("/apply/attempt")(routeContext({
      proposalId: created.proposal.proposalId,
    })) as { state: string; attempt: { kind: string; status: string } | null };
    expect(state.state).toBe("verified");
    expect(state.attempt).toMatchObject({ kind: "write", status: "verified" });

    const rolled = await handler("/apply/rollback")(routeContext({
      proposalId: created.proposal.proposalId, confirm: true,
    })) as { outcome: string };
    expect(rolled.outcome).toBe("rolled_back");
    expect(fake.current).toBe(observedText);
    expect(registry.verifyJournal("acme")).toBe(true);
  });

  it("requires a scoped writer and rejects unregistered or malformed targets", async () => {
    const { registry } = createFixture();
    const routes = createApplyMutationRoutes({
      registry, writesEnabled: true, writerFor: () => null,
    });
    const handler = routes.find(route => route.path === "/apply/wordpress-post")!;
    await expect(handler.handler(routeContext({
      url: "https://example.com", restType: "pages", postId: 12,
      title: "My page", content: "Hello fixed world",
    }))).rejects.toThrow("No scoped WordPress writer");
    const unregistered = createApplyMutationRoutes({
      registry, writesEnabled: true, writerFor: () => fakeWriter(observedText).writer,
    });
    await expect(unregistered.find(route => route.path === "/apply/wordpress-post")!.handler(routeContext({
      url: "https://not-registered.com", restType: "pages", postId: 12,
      title: "My page", content: "Hello fixed world",
    }))).rejects.toThrow("not registered");
  });
});

describe("WordPress REST writer adapter", () => {
  const config = {
    siteUrl: "https://example.com", username: "editor", appPassword: "secret abcd efgh ijkl",
    restType: "pages" as const, postId: 12,
  };

  it("builds a fail-closed writer only for a public HTTPS origin and bounded resource", () => {
    expect(() => createWordpressRestWriter({ ...config, siteUrl: "http://example.com" })).toThrow();
    expect(() => createWordpressRestWriter({ ...config, postId: 0 })).toThrow();
    expect(() => createWordpressRestWriter({ ...config, restType: "media" as never })).toThrow();
    expect(() => createWordpressRestWriter({ ...config, appPassword: "" })).toThrow();
  });

  it("issues one authenticated edit-context GET and renders title+content", async () => {
    const transport = vi.fn<HttpTransport>();
    const writer = createWordpressRestWriter(config, transport);
    transport.mockResolvedValueOnce(new Response(JSON.stringify({
      title: { raw: "My page" }, content: { raw: "Hello world" }, status: "publish",
    }), { status: 200 }));
    const observed = await writer.inspect();
    expect(observed.content).toBe("My page\n\nHello world");
    expect(observed.status).toBe("publish");
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe("https://example.com/wp-json/wp/v2/pages/12?context=edit");
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from("editor:secret abcd efgh ijkl").toString("base64")}`,
    });
  });

  it("PUTs exactly title and content with the idempotency header — never status or slug", async () => {
    const transport = vi.fn<HttpTransport>();
    const writer = createWordpressRestWriter(config, transport);
    transport.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await writer.write("New title\n\nFixed body", "idem-key-0123456789");
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe("https://example.com/wp-json/wp/v2/pages/12");
    expect(init.method).toBe("PUT");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-GTM-Apply-Idempotency-Key": "idem-key-0123456789",
    });
    expect(JSON.parse(String(init.body))).toStrictEqual({ title: "New title", content: "Fixed body" });
  });

  it("bounds errors and never leaks credentials on non-2xx responses", async () => {
    const transport = vi.fn<HttpTransport>();
    const writer = createWordpressRestWriter(config, transport);
    transport.mockResolvedValueOnce(new Response("<forbidden/>", { status: 403 }));
    await expect(writer.write("A\n\nB", "idem-key-0123456789")).rejects.toThrow("HTTP 403");
    transport.mockResolvedValueOnce(new Response("{}", { status: 404 }));
    await expect(writer.inspect()).rejects.toThrow("404");
    const calls = transport.mock.calls.map(([url]) => url).join(" ");
    expect(calls).not.toContain("secret");
  });
});
