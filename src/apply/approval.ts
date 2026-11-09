import { authorizeVerifiedAuditTarget, type VerifiedDomainGrant } from "../geo/rendering/verified-domain.js";
import { verifyFileApplyPreview, type FileApplyPreview } from "./preview.js";

export type ApplyRole = "reader" | "editor" | "approver" | "admin";

/** The server must load this from its own approval registry; never from request JSON. */
export interface TrustedApplyApproval {
  proposalId: string;
  tenantId: string;
  actorId: string;
  reviewedDiffSha256: string;
  confirmed: boolean;
  approvedAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

/** Preflight observations from a scoped, trusted adapter, not client-declared flags. */
export interface TrustedApplyPreflight {
  currentResourceSha256: string;
  backupContentSha256: string | null;
  adapterWriteAllowed: boolean;
  activeAttemptExists: boolean;
  idempotencyKey: string;
}

export interface ApplyAuthorizationContext {
  tenantId: string;
  actorId: string;
  role: ApplyRole;
  domainGrant: VerifiedDomainGrant | null;
  approval: TrustedApplyApproval | null;
  preflight: TrustedApplyPreflight;
  writeFeatureEnabled: boolean;
  now?: Date;
}

export interface ApplyAuthorizationDecision {
  allowed: boolean;
  reasons: string[];
}

/**
 * Pure deny-by-default security policy. Does not execute any write.
 * Callers must authenticate, load trusted approval/grant and reserve an
 * idempotency lock *before* invoking their eventual adapter.
 */
export function evaluateApplyAuthorization(
  preview: FileApplyPreview,
  context: ApplyAuthorizationContext,
): ApplyAuthorizationDecision {
  const reasons: string[] = [];
  const now = context.now ?? new Date();
  const current = now.getTime();
  if (!Number.isFinite(current)) return { allowed: false, reasons: ["Invalid current time"] };
  if (!context.writeFeatureEnabled) reasons.push("Production write feature flag is disabled");
  // Fail closed before dereferencing potentially malformed client data.
  if (!verifyFileApplyPreview(preview))
    return { allowed: false, reasons: [...reasons, "Proposal contents or review diff have been tampered with"] };
  if (preview.version !== "apply-preview-v1" || preview.mode !== "dry-run")
    reasons.push("Unrecognized proposal version or mode");
  if (!preview.changed) reasons.push("Proposal contains no change");
  if (preview.manualReview.length) reasons.push("A manual conflict review is required");
  if (context.tenantId !== preview.tenantId) reasons.push("Cross-tenant proposal rejected");
  if (context.role !== "approver" && context.role !== "admin")
    reasons.push("A tenant approver or admin is required");
  if (!context.actorId.trim()) reasons.push("Authenticated actor is missing");
  const created = Date.parse(preview.createdAt), expires = Date.parse(preview.expiresAt);
  if (!Number.isFinite(created) || !Number.isFinite(expires) ||
      created > current || expires <= current || expires <= created) {
    reasons.push("Proposal expired or has invalid timestamps");
  }
  if (!context.domainGrant) reasons.push("Trusted domain verification grant is missing");
  else {
    try { authorizeVerifiedAuditTarget(preview.target.url, context.domainGrant, now); }
    catch { reasons.push("Target is not a currently verified exact HTTPS domain"); }
  }
  const approval = context.approval;
  if (!approval) reasons.push("Stored approval not found");
  else {
    if (approval.proposalId !== preview.proposalId || approval.reviewedDiffSha256 !== preview.diffSha256 ||
        approval.tenantId !== context.tenantId || approval.actorId !== context.actorId || !approval.confirmed)
      reasons.push("Approval actor, tenant, confirmation or reviewed diff do not match");
    const approvedAt = Date.parse(approval.approvedAt), approvalExpiry = Date.parse(approval.expiresAt);
    if (!Number.isFinite(approvedAt) || !Number.isFinite(approvalExpiry) ||
        approvedAt < created || approvedAt > current || approvalExpiry <= current ||
        approvalExpiry > expires || approvalExpiry <= approvedAt)
      reasons.push("Stored approval is expired or outside the proposal window");
    if (approval.consumedAt !== null) reasons.push("Approval has already been consumed");
  }
  const preflight = context.preflight;
  if (preflight.currentResourceSha256 !== preview.observed.sha256)
    reasons.push("Target content changed since the diff was reviewed");
  if (preflight.backupContentSha256 !== preview.observed.sha256)
    reasons.push("Verified pre-write backup is missing or does not match");
  if (!preflight.adapterWriteAllowed) reasons.push("Scoped adapter write permission is missing");
  if (preflight.activeAttemptExists) reasons.push("Another attempt already owns the target lock");
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(preflight.idempotencyKey))
    reasons.push("A valid persisted idempotency key is required");
  return { allowed: reasons.length === 0, reasons };
}

export type ApplyState = "proposed" | "previewed" | "approved" | "backed_up" |
  "applying" | "verifying" | "verified" | "to_verify" | "failed" |
  "uncertain" | "rollback_requested" | "rolled_back";

const transitions: Record<ApplyState, readonly ApplyState[]> = {
  proposed: ["previewed"],
  previewed: ["approved"],
  approved: ["backed_up", "failed"],
  backed_up: ["applying", "failed"],
  applying: ["verifying", "uncertain", "failed"],
  verifying: ["verified", "to_verify", "failed", "uncertain"],
  verified: ["rollback_requested"],
  to_verify: ["verifying", "rollback_requested"],
  failed: ["rollback_requested"],
  uncertain: ["verifying", "rollback_requested"],
  rollback_requested: ["rolled_back", "failed", "uncertain"],
  rolled_back: [],
};

/** State mutation must be journaled atomically by the eventual server store. */
export function nextApplyState(current: ApplyState, next: ApplyState): ApplyState {
  if (!transitions[current]?.includes(next)) {
    throw new Error(`Invalid Apply Mode transition: ${current} -> ${next}`);
  }
  return next;
}
