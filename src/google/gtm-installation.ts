/**
 * GTM installation audit — verifies the deployment described in
 * `docs/GTM_IMPLEMENTATION.md` against a live page.
 *
 * This is page-level: it answers "is the container installed correctly?"
 * (head snippet, noscript fallback, dataLayer order, consent default, duplicate
 * containers). Container contents are audited through the Tag Manager API by
 * the other GTM tools.
 */

import { HtmlDoc } from "../geo/html.js";
import type { HtmlNode } from "../geo/html.js";
import { fetchQuiet, fetchText } from "../geo/http.js";
import type { Fetcher } from "../geo/http.js";

export interface GtmInstallationCheck {
  id: string;
  label: string;
  status: "pass" | "fail" | "warn";
  required: boolean;
  evidence: string;
  fix?: string;
}

export interface GtmInstallationResult {
  url: string;
  finalUrl: string;
  httpStatus: number;
  containerIds: string[];
  checks: GtmInstallationCheck[];
  /** Share of required checks that pass, 0–100. */
  score: number;
  passedRequired: number;
  requiredTotal: number;
  error?: string;
}

/**
 * GTM container ids are `GTM-` plus 4–12 uppercase alphanumerics and, in
 * practice, always contain a digit. Requiring one keeps page copy such as
 * `"event": "GTM-INIT"` from being read as a second container.
 */
const CONTAINER_ID_RE = /GTM-(?=[A-Z0-9]*[0-9])[A-Z0-9]{4,12}/gi;
const GTM_LOADER_RE = /googletagmanager\.com\/gtm\.js|['"]gtm\.start['"]/i;
const DATALAYER_INIT_RE = /window\.dataLayer\s*=\s*window\.dataLayer\s*\|\|/i;
const CONSENT_DEFAULT_RE = /gtag\(\s*['"]consent['"]\s*,\s*['"]default['"]/i;

function isInside(node: HtmlNode, tag: string): boolean {
  let current: HtmlNode | null = node.parent;
  while (current) {
    if (current.tag === tag) return true;
    current = current.parent;
  }
  return false;
}

/** Unique container IDs, normalized to upper case. */
export function extractContainerIds(html: string): string[] {
  const ids = (html.match(CONTAINER_ID_RE) ?? []).map((id) => id.toUpperCase());
  return [...new Set(ids)];
}

/** Pure check set over the HTML — exported for fixture tests. */
export function auditGtmHtml(html: string): {
  containerIds: string[];
  checks: GtmInstallationCheck[];
} {
  const doc = HtmlDoc.parse(html);
  const containerIds = extractContainerIds(html);
  const scripts = doc.all("script");
  const loaderScripts = scripts.filter((script) => GTM_LOADER_RE.test(doc.textOf(script)));
  const headLoader = loaderScripts.some((script) => isInside(script, "head"));
  const noscript = /<noscript[^>]*>[\s\S]*?ns\.html\?id=GTM-/i.test(html);

  const gtmIndex = Math.min(
    ...[
      html.search(/googletagmanager\.com\/gtm\.js/i),
      html.search(/['"]gtm\.start['"]/i),
    ].filter((index) => index >= 0),
    Number.POSITIVE_INFINITY
  );
  const dataLayerIndex = html.search(DATALAYER_INIT_RE);
  const consentIndex = html.search(CONSENT_DEFAULT_RE);

  const checks: GtmInstallationCheck[] = [];

  checks.push({
    id: "gtm.container",
    label: "GTM container present",
    status: containerIds.length ? "pass" : "fail",
    required: true,
    evidence: containerIds.length
      ? `Container(s): ${containerIds.join(", ")}`
      : "No GTM-XXXXXXX id found in the HTML",
    fix: containerIds.length
      ? undefined
      : "Install the container snippet from GTM (Admin → Install Google Tag Manager) or generate it with gtm_generate_snippet.",
  });

  checks.push({
    id: "gtm.head_snippet",
    label: "Loader is in <head>",
    status: headLoader ? "pass" : "fail",
    required: true,
    evidence: headLoader
      ? `${loaderScripts.length} inline loader(s) found, at least one inside <head>`
      : loaderScripts.length
        ? "Loader found but outside <head> — it should load as early as possible"
        : "No gtm.js loader or gtm.start push found",
    fix: headLoader
      ? undefined
      : "Place the GTM loader script as high as possible in <head>, before other scripts that push to dataLayer.",
  });

  checks.push({
    id: "gtm.noscript",
    label: "<noscript> fallback present",
    status: noscript ? "pass" : "fail",
    required: true,
    evidence: noscript
      ? "noscript iframe pointing at ns.html?id=GTM-… found"
      : "No noscript iframe for GTM",
    fix: noscript
      ? undefined
      : "Place the GTM <noscript> iframe immediately after the opening <body> tag.",
  });

  const dataLayerBefore = dataLayerIndex >= 0 && dataLayerIndex < gtmIndex;
  checks.push({
    id: "gtm.datalayer_order",
    label: "dataLayer initialized before GTM",
    status: dataLayerBefore ? "pass" : "fail",
    required: true,
    evidence:
      dataLayerIndex < 0
        ? "window.dataLayer = window.dataLayer || [] not found"
        : dataLayerBefore
          ? "dataLayer initialization precedes the GTM loader"
          : "dataLayer initialization appears after the GTM loader",
    fix: dataLayerBefore
      ? undefined
      : "Declare window.dataLayer = window.dataLayer || [] before the GTM snippet so early events are not lost.",
  });

  checks.push({
    id: "gtm.single_container",
    label: "Single container id",
    status: containerIds.length <= 1 ? "pass" : "fail",
    required: true,
    evidence:
      containerIds.length <= 1
        ? containerIds.length === 1
          ? containerIds[0]
          : "No container id to compare"
        : `Multiple containers installed: ${containerIds.join(", ")}`,
    fix:
      containerIds.length <= 1
        ? undefined
        : "Remove the duplicate container — two GTM containers on one page double-fire tags and corrupt analytics.",
  });

  const consentBefore = consentIndex >= 0 && (gtmIndex === Number.POSITIVE_INFINITY || consentIndex < gtmIndex);
  checks.push({
    id: "gtm.consent_default",
    label: "Consent default set before GTM (recommended)",
    status: consentBefore ? "pass" : "warn",
    required: false,
    evidence: consentIndex < 0
      ? "No gtag('consent', 'default', …) call found"
      : consentBefore
        ? "Default consent state is set before the GTM loader"
        : "Consent default appears after the GTM loader",
    fix: consentBefore
      ? undefined
      : "Set gtag('consent', 'default', {…}) before GTM loads so tags respect the initial state (GDPR/CCPA).",
  });

  return { containerIds, checks };
}

export interface GtmAuditOptions {
  url: string;
  fetcher?: Fetcher;
  timeoutMs?: number;
}

/** Fetch a page and audit its GTM installation. */
export async function auditGtmInstallation(
  options: GtmAuditOptions
): Promise<GtmInstallationResult> {
  const fetcher = options.fetcher ?? fetchText;
  const url = /^https?:\/\//i.test(options.url) ? options.url : `https://${options.url}`;
  const page = await fetchQuiet(fetcher, url, { timeoutMs: options.timeoutMs });

  if (!page) {
    return {
      url,
      finalUrl: url,
      httpStatus: 0,
      containerIds: [],
      checks: [],
      score: 0,
      passedRequired: 0,
      requiredTotal: 0,
      error: `Unable to reach ${url}`,
    };
  }

  const { containerIds, checks } = auditGtmHtml(page.body);
  const required = checks.filter((check) => check.required);
  const passedRequired = required.filter((check) => check.status === "pass").length;

  return {
    url,
    finalUrl: page.url,
    httpStatus: page.status,
    containerIds,
    checks,
    score: required.length ? Math.round((passedRequired / required.length) * 100) : 0,
    passedRequired,
    requiredTotal: required.length,
    error: page.status === 200 ? undefined : `HTTP ${page.status}`,
  };
}

// ─── Snippet generation ────────────────────────────────────────────────────

export interface GtmSnippetOptions {
  containerId: string;
  /** Include `window.dataLayer = window.dataLayer || []` before the loader. */
  includeDataLayer?: boolean;
  /** Include a default consent state before the loader. */
  consentDefault?: { ad_storage?: "granted" | "denied"; analytics_storage?: "granted" | "denied" };
}

export interface GtmSnippet {
  containerId: string;
  dataLayer?: string;
  consent?: string;
  head: string;
  body: string;
  /** Everything in deployment order. */
  all: string;
}

const CONTAINER_ID_SHAPE = /^GTM-[A-Z0-9]{4,12}$/;

/**
 * Generate the snippets from the installation guide for a container id.
 * Throws on an id that is not `GTM-XXXXXXX`, instead of emitting broken markup.
 */
export function generateGtmSnippet(options: GtmSnippetOptions): GtmSnippet {
  const containerId = options.containerId.trim().toUpperCase();
  if (!CONTAINER_ID_SHAPE.test(containerId)) {
    throw new Error(`Invalid GTM container id "${options.containerId}" — expected GTM-XXXXXXX`);
  }

  const dataLayer = options.includeDataLayer === false
    ? undefined
    : `<script>\n  window.dataLayer = window.dataLayer || [];\n</script>`;

  const consent = options.consentDefault
    ? `<script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag('consent', 'default', ${JSON.stringify(
        {
          ad_storage: options.consentDefault.ad_storage ?? "denied",
          analytics_storage: options.consentDefault.analytics_storage ?? "denied",
        },
        null,
        2
      )
        .split("\n")
        .map((line, index, lines) => (index === 0 || index === lines.length - 1 ? line : `  ${line}`))
        .join("\n")});\n</script>`
    : undefined;

  const head = `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${containerId}');</script>
<!-- End Google Tag Manager -->`;

  const body = `<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${containerId}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->`;

  const all = [dataLayer, consent, head, body].filter(Boolean).join("\n\n");

  return { containerId, dataLayer, consent, head, body, all };
}
