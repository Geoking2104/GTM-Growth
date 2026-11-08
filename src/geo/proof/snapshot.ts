import type { Fetcher, FetchResult } from "../http.js";
import { HtmlDoc } from "../html.js";
import { canonicalJson, sha256 } from "../score/v2/calculate.js";

export const SNAPSHOT_FORMAT = "gtm-geo-snapshot-v1" as const;
const MAX_RESOURCE_CHARS = 5 * 1024 * 1024;
const MAX_SCRIPT_COUNT = 24;
const MAX_SCRIPT_BYTES = 8 * 1024 * 1024;
const EXPORTABLE_HEADERS = new Set(["content-type", "x-robots-tag", "last-modified", "etag", "cache-control"]);

export interface SnapshotResource {
  requestUrl: string;
  response: FetchResult | null;
  error: "fetch_failed" | null;
}

/** Capture timing is envelope metadata, not an input to score calculation. */
export interface AuditSnapshot {
  format: typeof SNAPSHOT_FORMAT;
  url: string;
  resources: SnapshotResource[];
  /** Optional for backward compatibility with previously exported snapshots. */
  scriptAssets?: SnapshotResource[];
  /** Scripts we deliberately could not capture; rendering must be incomplete. */
  skippedScripts?: string[];
}

export interface SnapshotEnvelope {
  snapshot: AuditSnapshot;
  snapshotHash: string;
  capturedAt: string;
}

export function auditResourceUrls(url: string): string[] {
  const page = new URL(url);
  if (!["http:", "https:"].includes(page.protocol) || page.username || page.password) {
    throw new Error("Only credential-free HTTP(S) URLs may be audited");
  }
  const base = page.origin;
  return [
    page.href,
    "/robots.txt", "/llms.txt", "/llms-full.txt", "/.well-known/ai.txt",
    "/ai/summary.json", "/ai/faq.json", "/ai/service.json",
  ].map((path, index) => index === 0 ? path : new URL(path, base).href);
}

function copyResponse(response: FetchResult): FetchResult {
  if (!Number.isSafeInteger(response.status) || response.status < 0 || response.status > 599 ||
      response.body.length > MAX_RESOURCE_CHARS || !/^https?:\/\//.test(response.url)) {
    throw new Error("Invalid or oversized snapshot response");
  }
  return {
    url: response.url,
    status: response.status,
    ok: response.ok,
    headers: Object.fromEntries(Object.entries(response.headers)
      .map(([key, value]) => [key.toLowerCase(), value] as const)
      .filter(([key]) => EXPORTABLE_HEADERS.has(key))
      .sort(([a], [b]) => a.localeCompare(b))),
    body: response.body,
  };
}

/** Only absolute same-origin HTTP(S) script URLs; never follow an external base. */
export function discoverScriptUrls(html: string, pageUrl: string): { urls: string[]; skipped: string[] } {
  const origin = new URL(pageUrl).origin;
  const doc = HtmlDoc.parse(html);
  const baseHref = doc.first("base")?.attrs.href;
  let documentBase = pageUrl;
  if (baseHref) {
    try {
      const candidate = new URL(baseHref, pageUrl);
      if (candidate.origin === origin) documentBase = candidate.href;
    } catch { /* A malformed base does not create an additional fetch target. */ }
  }
  const urls: string[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const script of doc.all("script")) {
    const src = script.attrs.src?.trim();
    if (!src) continue;
    let resolved: URL;
    try { resolved = new URL(src, documentBase); } catch { skipped.push(src); continue; }
    if (seen.has(resolved.href)) continue;
    seen.add(resolved.href);
    if (!["http:", "https:"].includes(resolved.protocol) || resolved.origin !== origin ||
        resolved.username || resolved.password || urls.length >= MAX_SCRIPT_COUNT) {
      skipped.push(resolved.href);
      continue;
    }
    urls.push(resolved.href);
  }
  return { urls, skipped };
}

/**
 * Captures one immutable input bundle. The supplied fetcher MUST enforce SSRF,
 * redirect, timeout and size policies; this module never bypasses those guards.
 */
export async function captureAuditSnapshot(url: string, fetcher: Fetcher, capturedAt: string): Promise<SnapshotEnvelope> {
  if (!Number.isFinite(Date.parse(capturedAt))) throw new Error("Invalid capture timestamp");
  const urls = auditResourceUrls(url);
  const resources: SnapshotResource[] = [];
  for (const requestUrl of urls) {
    let response: FetchResult;
    try {
      response = await fetcher(requestUrl);
    } catch {
      resources.push({ requestUrl, response: null, error: "fetch_failed" });
      continue;
    }
    resources.push({ requestUrl, response: copyResponse(response), error: null });
  }
  const page = resources[0].response;
  const pageRedirectedOffOrigin = page && new URL(page.url).origin !== new URL(urls[0]).origin;
  const discovered = page && (page.status === 200 || page.status === 203) && !pageRedirectedOffOrigin
    ? discoverScriptUrls(page.body, page.url)
    : { urls: [], skipped: pageRedirectedOffOrigin ? ["cross-origin page redirect"] : [] };
  const scriptAssets: SnapshotResource[] = [];
  let totalScriptBytes = 0;
  for (const requestUrl of discovered.urls) {
    let response: FetchResult;
    try { response = await fetcher(requestUrl, { accept: "text/javascript,application/javascript,*/*", timeoutMs: 8_000 }); }
    catch { scriptAssets.push({ requestUrl, response: null, error: "fetch_failed" }); continue; }
    // A redirected script can cross the origin boundary: never store it as safe.
    if (response.url !== requestUrl) {
      discovered.skipped.push(requestUrl);
      continue;
    }
    const safeResponse = copyResponse(response);
    totalScriptBytes += new TextEncoder().encode(safeResponse.body).byteLength;
    if (totalScriptBytes > MAX_SCRIPT_BYTES) {
      discovered.skipped.push(requestUrl);
      continue;
    }
    scriptAssets.push({ requestUrl, response: safeResponse, error: null });
  }
  const snapshot: AuditSnapshot = {
    format: SNAPSHOT_FORMAT, url: urls[0], resources,
    scriptAssets, skippedScripts: discovered.skipped,
  };
  return { snapshot, snapshotHash: await sha256(canonicalJson(snapshot)), capturedAt };
}

/** Reject tampering and incomplete bundles before any scoring or replay. */
export async function verifySnapshotEnvelope(envelope: SnapshotEnvelope): Promise<void> {
  const { snapshot, snapshotHash } = envelope;
  if (snapshot?.format !== SNAPSHOT_FORMAT || !Array.isArray(snapshot.resources)) {
    throw new Error("Unsupported snapshot format");
  }
  const expected = auditResourceUrls(snapshot.url);
  if (snapshot.resources.length !== expected.length || snapshot.resources.some((item, index) =>
    item.requestUrl !== expected[index] ||
    (item.response === null) !== (item.error === "fetch_failed") ||
    (item.response !== null && (item.error !== null || item.response.body.length > MAX_RESOURCE_CHARS))
  )) throw new Error("Incomplete or invalid snapshot resources");
  const scripts = snapshot.scriptAssets ?? [];
  if (!Array.isArray(scripts) || scripts.length > MAX_SCRIPT_COUNT ||
      (snapshot.skippedScripts !== undefined && !Array.isArray(snapshot.skippedScripts))) {
    throw new Error("Invalid script manifest");
  }
  const seen = new Set<string>();
  let totalBytes = 0;
  for (const asset of scripts) {
    let parsed: URL;
    try { parsed = new URL(asset.requestUrl); } catch { throw new Error("Invalid script asset URL"); }
    if (parsed.origin !== new URL(snapshot.url).origin || seen.has(asset.requestUrl) ||
        (asset.response === null) !== (asset.error === "fetch_failed") ||
        (asset.response !== null && (asset.error !== null || asset.response.url !== asset.requestUrl))) {
      throw new Error("Unsafe or duplicated script asset");
    }
    seen.add(asset.requestUrl);
    if (asset.response) totalBytes += new TextEncoder().encode(asset.response.body).byteLength;
  }
  if (totalBytes > MAX_SCRIPT_BYTES) throw new Error("Oversized script assets");
  if (snapshotHash !== await sha256(canonicalJson(snapshot))) throw new Error("Snapshot hash mismatch");
}

/** Build an offline replay fetcher; no network request can be made by it. */
export async function replaySnapshot(envelope: SnapshotEnvelope): Promise<Fetcher> {
  await verifySnapshotEnvelope(envelope);
  const resources = new Map([...envelope.snapshot.resources, ...(envelope.snapshot.scriptAssets ?? [])]
    .map((resource) => [resource.requestUrl, resource]));
  return async (url) => {
    const resource = resources.get(url);
    if (!resource) throw new Error(`URL not present in snapshot: ${url}`);
    if (!resource.response) throw new Error(`Original fetch failed: ${url}`);
    return copyResponse(resource.response);
  };
}
