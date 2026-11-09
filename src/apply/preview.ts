import { createHash } from "node:crypto";
import { generateRobotsFix } from "../geo/generate/robots.js";
import type { Fetcher } from "../geo/http.js";
import { fetchPublicPage } from "../http/public-fetch.js";

/** Phase 0: read-only proposal. This module contains no external write API. */
export type ApplyFileKind = "robots" | "llms" | "llms-full";
export type ApplyFixId = "robots-ai";

export interface FileApplyPreview {
  version: "apply-preview-v1";
  proposalId: string;
  tenantId: string;
  fixId: ApplyFixId;
  target: { kind: ApplyFileKind; url: string; path: string };
  observed: { status: 200 | 404; sha256: string; fetchedFrom: string };
  proposedSha256: string;
  diffSha256: string;
  before: string;
  after: string;
  diff: string;
  changed: boolean;
  createdAt: string;
  expiresAt: string;
  manualReview: string[];
  /** Preview does not confer permission to write to a website. */
  mode: "dry-run";
}

const LIMIT_BYTES = 64 * 1024;
const LIMIT_LINES = 400;
const sha256 = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
const paths: Record<ApplyFileKind, string> = {
  robots: "/robots.txt", llms: "/llms.txt", "llms-full": "/llms-full.txt",
};

function fingerprint(input: FileApplyPreview): string {
  return sha256(JSON.stringify({ tenant: input.tenantId, fix: input.fixId,
    targetUrl: input.target.url, observedStatus: input.observed.status,
    observedSha: input.observed.sha256, proposedSha: input.proposedSha256,
    diffHash: input.diffSha256, manualReview: input.manualReview,
    createdAt: input.createdAt, expiresAt: input.expiresAt }));
}

function boundedText(value: string, label: string): string {
  if (Buffer.byteLength(value, "utf8") > LIMIT_BYTES || value.includes("\0") ||
      value.split("\n").length > LIMIT_LINES) {
    throw new Error(`${label} exceeds the safe text/diff budget`);
  }
  return value;
}

function lines(text: string): string[] {
  // Terminal newline is deliberately preserved as an empty final line.
  return text ? text.replace(/\r\n/g, "\n").split("\n") : [];
}

/** Bounded LCS diff: no shell, no external diff process and no file writes. */
export function unifiedFileDiff(kind: ApplyFileKind, before: string, after: string): string {
  boundedText(before, "Current file");
  boundedText(after, "Proposed file");
  const original = lines(before), proposed = lines(after);
  if (before === after) return "";
  const width = proposed.length + 1;
  const matrix = new Uint16Array((original.length + 1) * width);
  for (let i = original.length - 1; i >= 0; i--) {
    for (let j = proposed.length - 1; j >= 0; j--) {
      matrix[i * width + j] = original[i] === proposed[j]
        ? 1 + matrix[(i + 1) * width + j + 1]
        : Math.max(matrix[(i + 1) * width + j], matrix[i * width + j + 1]);
    }
  }
  const changes: string[] = [];
  let i = 0, j = 0;
  while (i < original.length || j < proposed.length) {
    if (i < original.length && j < proposed.length && original[i] === proposed[j]) {
      changes.push(` ${original[i]}`); i++; j++;
    } else if (i < original.length &&
        (j === proposed.length || matrix[(i + 1) * width + j] >= matrix[i * width + j + 1])) {
      changes.push(`-${original[i++]}`);
    } else {
      changes.push(`+${proposed[j++]}`);
    }
  }
  if (before.endsWith("\n") !== after.endsWith("\n") || before.includes("\r\n") !== after.includes("\r\n")) {
    changes.push("\\ File newline representation changed (see exact SHA-256 hashes)");
  }
  return [`--- a${paths[kind]}`, `+++ b${paths[kind]}`,
    `@@ -1,${original.length} +1,${proposed.length} @@`, ...changes, ""].join("\n");
}

export function createFileApplyPreview(input: {
  tenantId: string;
  fixId: ApplyFixId;
  kind: ApplyFileKind;
  siteUrl: string;
  sourceUrl: string;
  observedStatus: 200 | 404;
  before: string;
  after: string;
  manualReview?: string[];
  now?: Date;
}): FileApplyPreview {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(input.tenantId))
    throw new Error("Tenant identifier is invalid");
  if (input.fixId !== "robots-ai" || input.kind !== "robots")
    throw new Error("Only the robots-ai preview adapter is enabled in this milestone");
  const site = new URL(input.siteUrl);
  if (site.protocol !== "https:" || site.port || site.username || site.password ||
      site.hash || !site.hostname.includes(".")) throw new Error("Apply preview requires a public HTTPS site origin");
  const targetUrl = new URL(paths[input.kind], site.origin).href;
  if (input.sourceUrl !== targetUrl) throw new Error("Source/target URL mismatch or redirect; re-read required");
  if (input.observedStatus !== 200 && input.observedStatus !== 404)
    throw new Error("Only observed HTTP 200 or 404 may be planned as a bounded file fix");
  if (input.observedStatus === 404 && input.before) throw new Error("Missing resource cannot have existing content");
  const before = boundedText(input.before, "Current file");
  const after = boundedText(input.after, "Proposed file");
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid proposal date");
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 15 * 60_000).toISOString();
  const diff = unifiedFileDiff(input.kind, before, after);
  const observedSha = sha256(before);
  const proposedSha = sha256(after);
  const diffHash = sha256(diff);
  const preview: FileApplyPreview = {
    version: "apply-preview-v1", proposalId: "", tenantId: input.tenantId,
    fixId: input.fixId, target: { kind: input.kind, url: targetUrl, path: paths[input.kind] },
    observed: { status: input.observedStatus, sha256: observedSha, fetchedFrom: input.sourceUrl },
    proposedSha256: proposedSha, diffSha256: diffHash,
    before, after, diff, changed: before !== after,
    createdAt, expiresAt, manualReview: [...new Set(input.manualReview ?? [])], mode: "dry-run",
  };
  preview.proposalId = fingerprint(preview);
  return preview;
}

/** Verify content, target, diff and proposal identity before considering approval. */
export function verifyFileApplyPreview(preview: FileApplyPreview): boolean {
  try {
    const expectedUrl = new URL(paths[preview.target.kind], new URL(preview.target.url).origin).href;
    const created = Date.parse(preview.createdAt), expires = Date.parse(preview.expiresAt);
    return preview.version === "apply-preview-v1" && preview.mode === "dry-run" &&
      preview.fixId === "robots-ai" && preview.target.kind === "robots" &&
      /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(preview.tenantId) &&
      Array.isArray(preview.manualReview) &&
      preview.manualReview.every(note => typeof note === "string" && note.length <= 500) &&
      Number.isFinite(created) && Number.isFinite(expires) && expires - created === 15 * 60_000 &&
      (preview.observed.status === 200 || preview.observed.status === 404) &&
      (preview.observed.status !== 404 || preview.before.length === 0) &&
      preview.target.path === paths[preview.target.kind] && preview.target.url === expectedUrl &&
      preview.observed.fetchedFrom === expectedUrl &&
      preview.observed.sha256 === sha256(preview.before) &&
      preview.proposedSha256 === sha256(preview.after) &&
      preview.diff === unifiedFileDiff(preview.target.kind, preview.before, preview.after) &&
      preview.diffSha256 === sha256(preview.diff) &&
      preview.changed === (preview.before !== preview.after) &&
      preview.proposalId === fingerprint(preview);
  } catch { return false; }
}

/** Public GET only. Missing/blocked/redirected/unreachable resources are never silently overwritten. */
export async function previewRobotsAiFix(input: {
  url: string;
  tenantId: string;
  fetcher?: Fetcher;
  now?: Date;
}): Promise<FileApplyPreview> {
  const site = new URL(/^https?:\/\//i.test(input.url) ? input.url : `https://${input.url}`);
  if (site.protocol !== "https:" || site.port || site.username || site.password || !site.hostname.includes("."))
    throw new Error("Apply preview requires a public HTTPS site");
  const target = new URL("/robots.txt", site.origin).href;
  const response = await (input.fetcher ?? fetchPublicPage)(target, { accept: "text/plain", timeoutMs: 12_000 });
  if (response.url !== target || (response.status !== 200 && response.status !== 404))
    throw new Error(`Cannot safely preview robots.txt (HTTP ${response.status} or unexpected redirect)`);
  const before = response.status === 200 ? response.body : "";
  const fix = generateRobotsFix({ baseUrl: site.origin, existing: before });
  return createFileApplyPreview({
    tenantId: input.tenantId, fixId: "robots-ai", kind: "robots", siteUrl: site.origin,
    sourceUrl: target, observedStatus: response.status as 200 | 404,
    before, after: fix.content, now: input.now,
    manualReview: fix.blocked.map(bot => `Existing rule blocks ${bot}; no automatic override proposed.`),
  });
}
