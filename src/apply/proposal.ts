/** Discriminated union of trusted Apply Mode proposal shapes, dispatched by version. */
import { verifyFileApplyPreview, type FileApplyPreview } from "./preview.js";
import { verifyPostApplyProposal, type PostApplyProposal } from "./post-proposal.js";

export type ApplyProposal = FileApplyPreview | PostApplyProposal;

/** Fail-closed structural verification; an unshapely fake is never stored or approved. */
export function verifyApplyProposal(proposal: ApplyProposal): boolean {
  return proposal.version === "apply-preview-v1" ? verifyFileApplyPreview(proposal)
    : proposal.version === "apply-post-v1" ? verifyPostApplyProposal(proposal)
    : false;
}
