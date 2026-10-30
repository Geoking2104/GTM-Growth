/**
 * HTTP access for GEO audits.
 *
 * Reads are unauthenticated and read-only: the auditor fetches the exact public
 * URLs an AI crawler would fetch (homepage, robots.txt, llms.txt, sitemap, AI
 * discovery endpoints). A `Fetcher` can be injected so audits are testable
 * without network access.
 */

import { USER_AGENT } from "./config.js";

export interface FetchResult {
  url: string;
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
}

export type Fetcher = (
  url: string,
  init?: { accept?: string; timeoutMs?: number }
) => Promise<FetchResult>;

export interface FetchOptions {
  timeoutMs?: number;
  /** Maximum body size in bytes; larger responses are truncated. */
  maxBytes?: number;
  accept?: string;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

/** Fetch a URL and return the body as text. Throws on network failure. */
export const fetchText: Fetcher = async (url, init) => {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: init?.accept ?? "text/html,application/xhtml+xml,text/plain,*/*;q=0.8",
      "Accept-Language": "en;q=0.9",
    },
    signal: AbortSignal.timeout(init?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  const body = await readCapped(response, DEFAULT_MAX_BYTES);
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  return {
    url: response.url || url,
    status: response.status,
    ok: response.ok,
    headers,
    body,
  };
};

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      chunks.push(value.slice(0, Math.max(0, maxBytes - (total - value.byteLength))));
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

/** Fetch that never throws: returns `null` for network errors. */
export async function fetchQuiet(
  fetcher: Fetcher,
  url: string,
  options: FetchOptions = {}
): Promise<FetchResult | null> {
  try {
    return await fetcher(url, {
      accept: options.accept,
      timeoutMs: options.timeoutMs,
    });
  } catch {
    return null;
  }
}
