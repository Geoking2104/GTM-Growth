/**
 * Phase 0.4 execution engine: turns one double-approved proposal into a
 * journalled write attempt via a scoped adapter, then verifies. This module
 * contains no HTTP code and no credentials; the ApplyWriter adapter owns the
 * network operation and only reports bounded, receipt-grade observations.
 */
import { randomUUID } from "node:crypto";
import { digest } from "./sealed-payload.js";
import type { ApplyAttempt, ApplyRegistry } from "./registry.js";
import type { ApplyPrincipal } from "./principal.js";
import type { ApplyProposal } from "./proposal.js";

/** Trusted, target-scoped adapter. `write` must be idempotent under one key. */
export interface ApplyWriter {
  inspect(): Promise<{ content: string; httpStatus: number; status?: string }>;
  write(content: string, idempotencyKey: string): Promise<{ httpStatus: number }>;
}

export interface ApplyExecutionReceipt {
  proposalId: string;
  attempt: ApplyAttempt;
  outcome: "verified" | "to_verify" | "uncertain" | "failed";
  expectedSha256: string;
  observedSha256: string | null;
  httpStatus: number | null;
}

export interface ApplyRollbackReceipt {
  proposalId: string;
  attempt: ApplyAttempt;
  outcome: "rolled_back" | "uncertain" | "failed";
  restoredSha256: string | null;
  httpStatus: number | null;
}

const EXECUTABLE_VERSION = "apply-post-v1";

function boundedReason(error: unknown): string {
  return String((error as Error | undefined)?.message ?? error).replace(/\s+/g, " ").slice(0, 300);
}

function executable(proposal: ApplyProposal | null): ApplyProposal {
  if (!proposal) throw new Error("Unknown Apply Mode proposal in this tenant");
  if (proposal.version !== EXECUTABLE_VERSION)
    throw new Error("Only WordPress REST post proposals are executable in this milestone");
  return proposal;
}

/**
 * One pre-approved write. Order is load-bearing:
 * inspect (drift CAS) -> backup -> reserve attempt -> adapter write ->
 * re-inspect -> verdict. Every registry step is journaled; an unexpected
 * adapter failure leaves a receipt in `uncertain` and keeps the target lock
 * until an operator reconciles.
 */
export async function executeApprovedProposal(input: {
  registry: ApplyRegistry;
  principal: ApplyPrincipal;
  proposalId: string;
  writer: ApplyWriter;
  idempotencyKey?: string;
  now?: Date;
}): Promise<ApplyExecutionReceipt> {
  const { registry, principal, writer } = input;
  const now = input.now ?? new Date();
  const proposal = executable(registry.readPreview(principal, input.proposalId));
  if (typeof input.idempotencyKey === "string" && !/^[a-zA-Z0-9_-]{16,128}$/.test(input.idempotencyKey))
    throw new Error("A valid idempotency key of 16-128 URL-safe characters is required");
  const expectedSha256 = proposal.proposedSha256;

  let current: { content: string; httpStatus: number };
  try { current = await writer.inspect(); }
  catch (error) { throw new Error(`Pre-write inspection failed: ${boundedReason(error)}`); }
  if (digest(current.content) !== proposal.observed.sha256)
    throw new Error("Target drifted since the reviewed proposal; create a fresh proposal");

  // Journal-verified backup of the exact bytes about to be replaced.
  registry.backup(principal, input.proposalId, current.content, now);
  const begin = registry.beginExecution(principal, input.proposalId,
    input.idempotencyKey ?? randomUUID(), now);

  let written: { httpStatus: number };
  try { written = await writer.write(proposal.after, begin.idempotencyKey); }
  catch {
    const attempt = registry.completeExecution(principal, input.proposalId, begin.attemptId, {
      httpStatus: 0, writtenSha256: null, verifiedSha256: null, outcome: "uncertain",
    }, now);
    return { proposalId: input.proposalId, attempt, outcome: "uncertain",
      expectedSha256, observedSha256: null, httpStatus: 0 };
  }

  let after: { content: string; httpStatus: number };
  try { after = await writer.inspect(); }
  catch {
    const attempt = registry.completeExecution(principal, input.proposalId, begin.attemptId, {
      httpStatus: written.httpStatus, writtenSha256: expectedSha256, verifiedSha256: null, outcome: "uncertain",
    }, now);
    return { proposalId: input.proposalId, attempt, outcome: "uncertain",
      expectedSha256, observedSha256: null, httpStatus: written.httpStatus };
  }

  const observedSha256 = digest(after.content);
  const outcome: "verified" | "to_verify" = observedSha256 === expectedSha256 ? "verified" : "to_verify";
  const attempt = registry.completeExecution(principal, input.proposalId, begin.attemptId, {
    httpStatus: after.httpStatus ?? written.httpStatus, writtenSha256: expectedSha256,
    verifiedSha256: observedSha256, outcome,
  }, now);
  return { proposalId: input.proposalId, attempt, outcome,
    expectedSha256, observedSha256, httpStatus: after.httpStatus ?? written.httpStatus };
}

/**
 * Double-approved restore of the encrypted pre-write snapshot. Never clobbers
 * a target that has moved on: if the live content is neither the snapshot
 * already in place nor the bytes the write attempt delivered, the rollback
 * lands in `failed` and the snapshot is preserved for manual reconciliation.
 */
export async function rollbackProposal(input: {
  registry: ApplyRegistry;
  principal: ApplyPrincipal;
  proposalId: string;
  writer: ApplyWriter;
  idempotencyKey?: string;
  now?: Date;
}): Promise<ApplyRollbackReceipt> {
  const { registry, principal, writer } = input;
  const now = input.now ?? new Date();
  executable(registry.readPreview(principal, input.proposalId));
  if (typeof input.idempotencyKey === "string" && !/^[a-zA-Z0-9_-]{16,128}$/.test(input.idempotencyKey))
    throw new Error("A valid idempotency key of 16-128 URL-safe characters is required");

  // The latest attempt must still be the executed write, not this rollback.
  const write = registry.attempt(principal, input.proposalId);
  if (!write || write.kind !== "write" ||
      !["verified", "to_verify", "uncertain", "failed"].includes(write.status))
    throw new Error("Only a finished or uncertain write attempt can be rolled back");

  // Validates the snapshot is present, unpurged and inside retention.
  const snapshot = registry.readBackup(principal, input.proposalId, now);
  const snapshotSha256 = digest(snapshot);
  const begin = registry.beginRollback(principal, input.proposalId,
    input.idempotencyKey ?? randomUUID(), now);

  let live: { content: string; httpStatus: number };
  try { live = await writer.inspect(); }
  catch {
    const attempt = registry.completeRollback(principal, input.proposalId, begin.attemptId, {
      httpStatus: 0, restoredSha256: null, outcome: "uncertain",
    }, now);
    return { proposalId: input.proposalId, attempt, outcome: "uncertain",
      restoredSha256: null, httpStatus: 0 };
  }

  // Already-restored (or write never landed): idempotent success, no second write.
  if (digest(live.content) === snapshotSha256) {
    const attempt = registry.completeRollback(principal, input.proposalId, begin.attemptId, {
      httpStatus: live.httpStatus, restoredSha256: snapshotSha256, outcome: "rolled_back",
    }, now);
    return { proposalId: input.proposalId, attempt, outcome: "rolled_back",
      restoredSha256: snapshotSha256, httpStatus: live.httpStatus };
  }

  const expected = write.verifiedSha256 ?? write.writtenSha256;
  if (!expected || digest(live.content) !== expected) {
    const attempt = registry.completeRollback(principal, input.proposalId, begin.attemptId, {
      httpStatus: live.httpStatus, restoredSha256: null, outcome: "failed",
    }, now);
    return { proposalId: input.proposalId, attempt, outcome: "failed",
      restoredSha256: null, httpStatus: live.httpStatus };
  }

  try {
    const wrote = await writer.write(snapshot, begin.idempotencyKey);
    const restored = await writer.inspect();
    const restoredSha256 = digest(restored.content);
    const outcome: "rolled_back" | "uncertain" = restoredSha256 === snapshotSha256 ? "rolled_back" : "uncertain";
    const attempt = registry.completeRollback(principal, input.proposalId, begin.attemptId, {
      httpStatus: restored.httpStatus ?? wrote.httpStatus, restoredSha256, outcome,
    }, now);
    return { proposalId: input.proposalId, attempt, outcome,
      restoredSha256, httpStatus: restored.httpStatus ?? wrote.httpStatus };
  } catch {
    const attempt = registry.completeRollback(principal, input.proposalId, begin.attemptId, {
      httpStatus: 0, restoredSha256: null, outcome: "uncertain",
    }, now);
    return { proposalId: input.proposalId, attempt, outcome: "uncertain",
      restoredSha256: null, httpStatus: 0 };
  }
}
