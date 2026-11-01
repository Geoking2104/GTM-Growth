/**
 * URL-shape checks used by the landing page's free read.
 *
 * Pure functions only: no DOM, no network. The free read never pretends to see
 * the page — it inspects the URL the visitor typed, which is why it can run
 * entirely in the browser and stay honest about what it knows.
 *
 * Copy comes from `i18n.js`; pass a dictionary to localise the result.
 */

import { dictFor } from "./i18n.js";

const TRACKING_PARAMS = ["utm_", "gclid", "fbclid", "msclkid", "mc_cid", "igshid", "gbraid"];
const FILE_EXTENSION = /\.(php|html?|aspx?|jsp)$/i;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

function isIp(hostname) {
  return IPV4.test(hostname) || hostname.includes(":");
}

function hasTracking(search) {
  if (!search) return false;
  const params = [...new URLSearchParams(search).keys()];
  return params.some((key) => TRACKING_PARAMS.some((tracking) => key.toLowerCase().startsWith(tracking)));
}

/**
 * Accept "example.com", "https://example.com/path" or a full URL.
 * Returns `{ ok: true, url }` or `{ ok: false, error }`.
 */
export function normalizeTarget(input, dict) {
  const t = dict ?? dictFor("en");
  const raw = String(input ?? "").trim();
  if (!raw) return { ok: false, error: t.errors.empty };

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error: t.errors.invalid };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: t.errors.protocol };
  }
  if (!url.hostname.includes(".") || url.hostname.endsWith(".")) {
    return { ok: false, error: t.errors.host };
  }
  if (/\s/.test(url.hostname)) {
    return { ok: false, error: t.errors.spaces };
  }
  return { ok: true, url };
}

/** Score the URL itself (10 checks) — not the page behind it. */
export function auditUrlShape(url, dict) {
  const t = dict ?? dictFor("en");
  const segments = url.pathname.split("/").filter(Boolean);
  const values = {
    protocol: url.protocol,
    host: url.hostname,
    path: url.pathname || "/",
    depth: segments.length,
    search: url.search,
    hash: url.hash,
    length: url.href.length,
  };

  const results = [
    ["url.https", url.protocol === "https:"],
    [
      "url.host",
      /^[a-z0-9.-]+$/i.test(url.hostname) && !url.hostname.includes("_") && !isIp(url.hostname),
    ],
    ["url.case", url.pathname === url.pathname.toLowerCase()],
    ["url.depth", segments.length <= 3],
    ["url.params", !hasTracking(url.search)],
    ["url.fragment", !url.hash],
    ["url.length", url.href.length <= 100],
    ["url.ip", !isIp(url.hostname)],
    ["url.file", !FILE_EXTENSION.test(url.pathname)],
    ["url.slashes", !url.pathname.includes("//")],
  ];

  const checks = results.map(([id, ok]) => {
    const copy = t.checks[id];
    return {
      id,
      label: copy.label,
      status: ok ? "pass" : "fail",
      evidence: copy.evidence(values),
      fix: ok ? undefined : copy.fix,
    };
  });

  const passed = checks.filter((check) => check.status === "pass").length;
  return {
    host: url.hostname.replace(/^www\./, ""),
    score: Math.round((passed / checks.length) * 100),
    passed,
    total: checks.length,
    checks,
  };
}

/** One-line summary used above the score ring. */
export function verdict(score, dict) {
  const t = dict ?? dictFor("en");
  if (score >= 90) return t.verdicts.clean;
  if (score >= 70) return t.verdicts.usable;
  if (score >= 40) return t.verdicts.costly;
  return t.verdicts.poor;
}
