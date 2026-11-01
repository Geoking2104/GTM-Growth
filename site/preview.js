/**
 * URL-shape checks used by the landing page's free read.
 *
 * Pure functions only: no DOM, no network. The free read never pretends to see
 * the page — it inspects the URL the visitor typed, which is why it can run
 * entirely in the browser and stay honest about what it knows.
 */

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
export function normalizeTarget(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return { ok: false, error: "Enter a website URL to run the free read." };

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error: "That does not look like a URL. Try example.com or https://example.com." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http(s) URLs are supported." };
  }
  if (!url.hostname.includes(".") || url.hostname.endsWith(".")) {
    return { ok: false, error: "That host is incomplete. Try a domain such as example.com." };
  }
  if (/\s/.test(url.hostname)) {
    return { ok: false, error: "Hostnames cannot contain spaces." };
  }
  return { ok: true, url };
}

/** Score the URL itself (10 checks) — not the page behind it. */
export function auditUrlShape(url) {
  const checks = [];
  const add = (id, label, ok, evidence, fix) =>
    checks.push({ id, label, status: ok ? "pass" : "fail", evidence, fix });

  const segments = url.pathname.split("/").filter(Boolean);
  const length = url.href.length;

  add(
    "url.https",
    "Served over HTTPS",
    url.protocol === "https:",
    url.protocol,
    "Serve the site over HTTPS — plain HTTP is downgraded and distrusted."
  );
  add(
    "url.host",
    "Hostname is well formed",
    /^[a-z0-9.-]+$/i.test(url.hostname) && !url.hostname.includes("_") && !isIp(url.hostname),
    url.hostname,
    "Use a normal domain: no underscores, not an IP address."
  );
  add(
    "url.case",
    "Path is lowercase",
    url.pathname === url.pathname.toLowerCase(),
    url.pathname || "/",
    "Keep paths lowercase; mixed case creates duplicate variants of the same page."
  );
  add(
    "url.depth",
    "Path depth is 3 or less",
    segments.length <= 3,
    `${segments.length} segment(s)`,
    "Flatten deep paths — short URLs survive copy/paste and stay stable."
  );
  add(
    "url.params",
    "No tracking parameters",
    !hasTracking(url.search),
    url.search || "none",
    "Strip utm_/gclid parameters from canonical URLs; they split citations across variants."
  );
  add(
    "url.fragment",
    "No fragment in the shared URL",
    !url.hash,
    url.hash || "none",
    "Drop #fragments — they never reach the server and are not part of the addressable page."
  );
  add(
    "url.length",
    "URL is under 100 characters",
    length <= 100,
    `${length} characters`,
    "Shorten the URL; long addresses get truncated in answers and chat previews."
  );
  add(
    "url.ip",
    "Uses a domain, not an IP",
    !isIp(url.hostname),
    url.hostname,
    "Point a domain at the host; IP addresses are not citable entities."
  );
  add(
    "url.file",
    "No file extension in the path",
    !FILE_EXTENSION.test(url.pathname),
    url.pathname || "/",
    "Prefer extensionless routes (/pricing, not /pricing.php)."
  );
  add(
    "url.slashes",
    "No duplicated slashes",
    !url.pathname.includes("//"),
    url.pathname || "/",
    "Normalise duplicate slashes; they create near-duplicate URLs."
  );

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
export function verdict(score) {
  if (score >= 90) return "Clean address — nothing in the URL is fighting you.";
  if (score >= 70) return "Usable address with a few fixable habits.";
  if (score >= 40) return "Several URL patterns will cost you citations.";
  return "The URL itself is working against the page.";
}
