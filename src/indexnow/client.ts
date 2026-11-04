/**
 * IndexNow — the protocol Bing, Yandex, Seznam and Naver share.
 *
 * Four steps, per the spec (https://www.indexnow.org/documentation):
 *   1. generate a key         8–128 characters of [A-Za-z0-9-]
 *   2. host the key file      https://<host>/<key>.txt, UTF-8, containing the key
 *   3. submit URLs            POST JSON, up to 10 000 per request
 *   4. verify                 HTTP 200/202 means received, not indexed
 *
 * Everything here is deterministic except the key itself, and submission is a
 * write to a third party: callers must pass `confirm: true` explicitly.
 */

export const INDEXNOW_MAX_URLS = 10_000;

/** Participating endpoints. `indexnow` fans out to every member engine. */
export const INDEXNOW_ENDPOINTS: Record<string, string> = {
  indexnow: "https://api.indexnow.org/indexnow",
  bing: "https://www.bing.com/indexnow",
  yandex: "https://yandex.com/indexnow",
};

/** The protocol's key grammar: [A-Za-z0-9-], 8–128 characters. */
export const KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

export interface KeyMaterial {
  key: string;
  fileName: string;
  filePath: string;
  fileUrl: string;
  content: string;
  /** Ready-to-serve response for a static host. */
  headers: Record<string, string>;
}

export class IndexNowError extends Error {
  constructor(
    message: string,
    readonly code: "invalid-key" | "invalid-url" | "host-mismatch" | "too-many-urls" | "confirm-required" | "network"
  ) {
    super(message);
    this.name = "IndexNowError";
  }
}

/**
 * A 32-hex-character key (a UUID without dashes). Hex keeps it inside the
 * protocol grammar and makes it look like nothing else in a repository.
 */
export function generateKey(random: () => string = () => crypto.randomUUID()): string {
  const key = random().replace(/-/g, "").toLowerCase();
  if (!KEY_PATTERN.test(key)) {
    throw new IndexNowError(`generated key does not match the protocol grammar: ${key}`, "invalid-key");
  }
  return key;
}

/** The file to host, and where the protocol expects it. */
export function keyMaterial(key: string, host: string): KeyMaterial {
  if (!KEY_PATTERN.test(key)) {
    throw new IndexNowError(
      `invalid key: use 8–128 characters of a-z, A-Z, 0-9 or dash (got ${key.length})`,
      "invalid-key",
    );
  }
  const cleanHost = host.replace(/^https?:\/\//i, "").replace(/\/$/, "").toLowerCase();
  const fileName = `${key}.txt`;
  return {
    key,
    fileName,
    filePath: `/${fileName}`,
    fileUrl: `https://${cleanHost}/${fileName}`,
    // The spec: UTF-8 text file "listing the key in the file".
    content: `${key}\n`,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  };
}

export function hostOf(input: string): string {
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`).hostname.toLowerCase();
  } catch {
    throw new IndexNowError(`not a URL: ${input}`, "invalid-url");
  }
}

export interface VerifyResult {
  ok: boolean;
  keyFileUrl: string;
  status: number | null;
  /** What the file actually contained, trimmed and truncated for display. */
  found: string | null;
  problems: string[];
  nextStep: string;
}

/**
 * Check that the key file is published and contains the key.
 * A 200 with the key is the only passing state; every other case names its fix.
 */
export async function verifyKeyFile(
  key: string,
  host: string,
  options: { fetcher?: typeof fetch; timeoutMs?: number; keyLocation?: string } = {},
): Promise<VerifyResult> {
  const material = keyMaterial(key, host);
  const url = options.keyLocation ?? material.fileUrl;
  const fetcher = options.fetcher ?? fetch;
  const problems: string[] = [];

  let status: number | null = null;
  let body: string | null = null;
  try {
    const response = await fetcher(url, {
      headers: { "User-Agent": "GTMGrowthGEO/1.0 (+https://github.com/Geoking2104/GTM-Growth)" },
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      redirect: "follow",
    });
    status = response.status;
    body = (await response.text()).slice(0, 4096);
  } catch (error) {
    problems.push(`The key file could not be fetched: ${(error as Error).message}`);
  }

  if (status !== null) {
    if (status === 404) problems.push(`404 at ${url} — the file is not published at that path.`);
    else if (status !== 200) problems.push(`HTTP ${status} at ${url}.`);
  }

  const trimmed = body?.trim() ?? null;
  if (status === 200 && trimmed !== null) {
    if (!trimmed) problems.push("The file is empty: it must contain the key.");
    else if (trimmed !== key) {
      problems.push(
        trimmed.length > 200
          ? "The file does not contain the key (it looks like an HTML page — a rewrite rule is probably serving the app shell)."
          : `The file contains “${trimmed.slice(0, 64)}”, not the key.`,
      );
    }
  }

  const ok = problems.length === 0;
  return {
    ok,
    keyFileUrl: url,
    status,
    found: trimmed === null ? null : trimmed.slice(0, 200),
    problems,
    nextStep: ok
      ? "Key file valid. Submit URLs with indexnow_submit — twice in a row at most, then wait for the crawl."
      : status === 404
        ? `Publish ${material.fileName} at the site root (or any path, then pass keyLocation).`
        : "Serve the key file as text/plain, UTF-8, containing exactly the key.",
  };
}

export interface SubmitInput {
  host: string;
  key: string;
  urls: string[];
  keyLocation?: string;
  endpoint?: keyof typeof INDEXNOW_ENDPOINTS | string;
  confirm?: boolean;
}

export interface SubmitResult {
  submitted: boolean;
  endpoint: string;
  host: string;
  urlCount: number;
  status: number | null;
  outcome: string;
  meaning: string;
  fix?: string;
  responseBody?: string;
}

/** Human reading of every documented status code. */
export function explainStatus(status: number): { outcome: string; meaning: string; fix?: string } {
  switch (status) {
    case 200:
      return { outcome: "accepted", meaning: "URLs received. This confirms receipt, not indexing." };
    case 202:
      return {
        outcome: "pending-key-validation",
        meaning: "The engine received the URLs but has not validated the key yet.",
        fix: "Do nothing: validation is asynchronous. Check Bing Webmaster Tools in a few hours.",
      };
    case 400:
      return {
        outcome: "bad-request",
        meaning: "The body was malformed — usually a missing host, key or urlList.",
        fix: "Send JSON with host, key and a urlList array of absolute URLs.",
      };
    case 403:
      return {
        outcome: "key-not-valid",
        meaning: "The key file was not found, or does not contain the key.",
        fix: "Publish https://<host>/<key>.txt containing the key, then verify it before resubmitting.",
      };
    case 422:
      return {
        outcome: "urls-mismatch",
        meaning: "The URLs do not belong to the host, or the key does not match the protocol grammar.",
        fix: "Send absolute URLs on exactly this host; with keyLocation, URLs must sit under its path.",
      };
    case 429:
      return {
        outcome: "rate-limited",
        meaning: "Too many submissions in a short window.",
        fix: "Back off — one batch per publish, not per page.",
      };
    default:
      return {
        outcome: `http-${status}`,
        meaning: "Undocumented status: treat as a failure and re-check the key file and payload.",
      };
  }
}

/** Validate everything the protocol validates, before a byte leaves the process. */
export function validateSubmission(input: SubmitInput): string[] {
  const problems: string[] = [];
  if (!KEY_PATTERN.test(input.key ?? "")) {
    problems.push("key must be 8–128 characters of a-z, A-Z, 0-9 or dash");
  }
  if (!input.host) problems.push("host is required");
  if (!Array.isArray(input.urls) || input.urls.length === 0) problems.push("urls must contain at least one URL");
  if (input.urls?.length > INDEXNOW_MAX_URLS) {
    problems.push(`at most ${INDEXNOW_MAX_URLS} URLs per request (got ${input.urls.length})`);
  }
  if (input.keyLocation && !/^https?:\/\//i.test(input.keyLocation)) {
    problems.push("keyLocation must be an absolute https URL");
  }

  let host = "";
  try {
    host = input.host.replace(/^https?:\/\//i, "").replace(/\/$/, "").toLowerCase();
  } catch {
    problems.push("host is not a hostname");
  }

  for (const url of input.urls ?? []) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") problems.push(`not http(s): ${url}`);
      else if (parsed.hostname.toLowerCase() !== host) problems.push(`not on ${host}: ${url}`);
    } catch {
      problems.push(`not an absolute URL: ${url}`);
    }
  }

  return [...new Set(problems)];
}

/**
 * Submit URLs. Refuses to run without `confirm: true` — this is a write to a
 * third party that consumes crawl quota.
 */
export async function submitUrls(
  input: SubmitInput,
  options: { fetcher?: typeof fetch; timeoutMs?: number } = {},
): Promise<SubmitResult> {
  if (input.confirm !== true) {
    throw new IndexNowError("submission requires confirm=true", "confirm-required");
  }

  const problems = validateSubmission(input);
  if (problems.length) {
    throw new IndexNowError(problems.join("; "), problems[0].includes("key") ? "invalid-key" : "invalid-url");
  }

  const endpointKey = input.endpoint ?? "indexnow";
  const endpoint = INDEXNOW_ENDPOINTS[endpointKey] ?? endpointKey;
  const host = input.host.replace(/^https?:\/\//i, "").replace(/\/$/, "").toLowerCase();
  const payload: Record<string, unknown> = {
    host,
    key: input.key,
    urlList: input.urls,
  };
  if (input.keyLocation) payload.keyLocation = input.keyLocation;

  let status: number | null = null;
  let body = "";
  try {
    const response = await (options.fetcher ?? fetch)(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "GTMGrowthGEO/1.0 (+https://github.com/Geoking2104/GTM-Growth)",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
    status = response.status;
    body = (await response.text()).slice(0, 500);
  } catch (error) {
    throw new IndexNowError(`network failure: ${(error as Error).message}`, "network");
  }

  const explained = explainStatus(status ?? 0);
  return {
    submitted: (status ?? 0) < 300,
    endpoint,
    host,
    urlCount: input.urls.length,
    status,
    ...explained,
    responseBody: body || undefined,
  };
}
