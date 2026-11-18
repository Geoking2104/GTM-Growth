/**
 * Phase 0.4: bounded WordPress post/page title+content proposal for the Apply
 * Mode execution pipeline. Same encrypted-registry contract as file proposals;
 * the write itself only ever updates `title` and `content` of one existing
 * REST resource — never `status`, `slug`, theme files or arbitrary paths.
 */
import { createHash } from "node:crypto";
import { boundedLcsDiff } from "./preview.js";

export type PostRestType = "posts" | "pages";
export type PostApplyFixId = "wordpress-post";

export interface PostApplyProposal {
  version: "apply-post-v1";
  proposalId: string;
  tenantId: string;
  fixId: PostApplyFixId;
  target: { kind: "wordpress-post"; url: string; path: string };
  observed: { status: 200; sha256: string; fetchedFrom: string };
  proposedSha256: string;
  diffSha256: string;
  /** before/after use the rendered `title\n\ncontent` representation. */
  before: string;
  after: string;
  diff: string;
  changed: boolean;
  createdAt: string;
  expiresAt: string;
  manualReview: string[];
  /** A proposal is a plan, never authorization or an executed write. */
  mode: "dry-run";
}

const LIMIT_BYTES = 64 * 1024;
const LIMIT_LINES = 400;
const TTL_MS = 15 * 60_000;
const sha256 = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
const SEPARATOR = "\n\n";

/** Canonical rendered representation of a post: first line title, blank line, then content. */
export function renderPost(title: string, content: string): string {
  return `${title}${SEPARATOR}${content}`;
}

/** Splits a rendered proposal text back into its title and content parts. */
export function parseRenderedPost(text: string): { title: string; content: string } {
  const at = text.indexOf(SEPARATOR);
  if (at < 0) throw new Error("A post proposal must start with a title line followed by a blank line");
  return { title: text.slice(0, at), content: text.slice(at + SEPARATOR.length) };
}

function boundedText(value: string, label: string): string {
  if (Buffer.byteLength(value, "utf8") > LIMIT_BYTES || value.includes("\0") || value.split("\n").length > LIMIT_LINES)
    throw new Error(`${label} exceeds the safe Apply Mode text budget`);
  return value;
}

function fingerprint(input: PostApplyProposal): string {
  return sha256(JSON.stringify({ tenant: input.tenantId, fix: input.fixId,
    targetUrl: input.target.url, observedStatus: input.observed.status,
    observedSha: input.observed.sha256, proposedSha: input.proposedSha256,
    diffHash: input.diffSha256, manualReview: input.manualReview,
    createdAt: input.createdAt, expiresAt: input.expiresAt }));
}

/** Parse and re-derive the canonical REST target of a post proposal. */
function parseRestTarget(target: { url: string; path: string }): { restType: PostRestType; postId: number; origin: string } | null {
  const match = /^\/wp-json\/wp\/v2\/(posts|pages)\/([1-9][0-9]{0,9})$/.exec(target.path);
  if (!match) return null;
  let url: URL;
  try { url = new URL(target.url); } catch { return null; }
  if (url.protocol !== "https:" || url.port || url.username || url.password ||
      url.hash || url.search || !url.hostname.includes(".") ||
      new URL(target.path, url.origin).href !== url.href)
    return null;
  return { restType: match[1] as PostRestType, postId: Number(match[2]), origin: url.origin };
}

/** Builds one immutable, self-verifying proposal. No credentials, no write. */
export function createPostApplyProposal(input: {
  tenantId: string;
  siteUrl: string;
  restType: PostRestType;
  postId: number;
  observed: { text: string; status?: string };
  proposed: { text: string };
  manualReview?: string[];
  now?: Date;
}): PostApplyProposal {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(input.tenantId))
    throw new Error("Tenant identifier is invalid");
  let siteUrl = input.siteUrl;
  if (!/^https?:\/\//i.test(siteUrl)) siteUrl = `https://${siteUrl}`;
  const site = new URL(siteUrl);
  const probe = parseRestTargetTarget(site, input.restType, input.postId);
  if (!probe) throw new Error("A public HTTPS origin and a bounded posts|pages REST id are required");
  const before = boundedText(input.observed.text, "Current post");
  const after = boundedText(input.proposed.text, "Proposed post");
  if (!after.trim()) throw new Error("An empty post proposal cannot be applied");
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid proposal date");
  const manualReview = [...new Set([
    ...(input.manualReview ?? []),
    ...(input.observed.status && input.observed.status !== "publish"
      ? [`Post status is ${input.observed.status}; execution only updates title and content, never the status.`] : []),
  ])].filter(note => typeof note === "string" && note.length <= 500);
  const proposal: PostApplyProposal = {
    version: "apply-post-v1", proposalId: "", tenantId: input.tenantId, fixId: "wordpress-post",
    target: { kind: "wordpress-post", url: probe.url, path: probe.path },
    observed: { status: 200, sha256: sha256(before), fetchedFrom: probe.url },
    proposedSha256: sha256(after), diffSha256: "",
    before, after, diff: "", changed: before !== after,
    createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
    manualReview, mode: "dry-run",
  };
  proposal.diff = boundedLcsDiff(probe.path, probe.path, before, after);
  proposal.diffSha256 = sha256(proposal.diff);
  proposal.proposalId = fingerprint(proposal);
  return proposal;
}

/** Structural integrity check mirroring verifyFileApplyPreview for the post kind. */
export function verifyPostApplyProposal(preview: PostApplyProposal): boolean {
  try {
    const probe = parseRestTarget(preview.target);
    if (!probe) return false;
    const created = Date.parse(preview.createdAt), expires = Date.parse(preview.expiresAt);
    return preview.version === "apply-post-v1" && preview.mode === "dry-run" &&
      preview.fixId === "wordpress-post" && preview.target.kind === "wordpress-post" &&
      /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(preview.tenantId) &&
      Array.isArray(preview.manualReview) &&
      preview.manualReview.every(note => typeof note === "string" && note.length <= 500) &&
      Number.isFinite(created) && Number.isFinite(expires) && expires - created === TTL_MS &&
      preview.observed.status === 200 && preview.observed.fetchedFrom === preview.target.url &&
      preview.observed.sha256 === sha256(preview.before) &&
      preview.proposedSha256 === sha256(preview.after) &&
      preview.diff === boundedLcsDiff(preview.target.path, preview.target.path, preview.before, preview.after) &&
      preview.diffSha256 === sha256(preview.diff) &&
      preview.changed === (preview.before !== preview.after) &&
      preview.proposalId === fingerprint(preview);
  } catch { return false; }
}

function parseRestTargetTarget(site: URL, restType: PostRestType, postId: number):
  { url: string; path: string } | null {
  if (site.protocol !== "https:" || site.port || site.username || site.password ||
      site.hash || site.search || !site.hostname.includes(".") || site.pathname !== "/" ||
      !Number.isInteger(postId) || postId < 1 || postId > 10_000_000 || !["posts", "pages"].includes(restType))
    return null;
  const path = `/wp-json/wp/v2/${restType}/${postId}`;
  return { url: new URL(path, site.origin).href, path };
}
