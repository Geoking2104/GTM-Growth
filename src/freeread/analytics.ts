/**
 * GA4 and Search Console blocks for the free read.
 *
 * Two layers, never mixed:
 *  - **Measured signals** — what the page and its robots/sitemap actually show
 *    (tag IDs, consent mode, verification, sitemap entries). Real, no account.
 *  - **Traffic report** — sessions, conversions, clicks, impressions. These need
 *    a Google credential, so when none is available the rows are returned with
 *    `sample: true` and the UI must label them as illustrative.
 *
 * The rule the whole repository follows: a number is either measured or marked
 * as sample. Nothing in between.
 */

import type { HtmlDoc } from "../geo/html.js";
import type { DataTable, TableRow } from "./seo.js";

const clamp = (text: string, max = 80): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

export interface AnalyticsInput {
  doc: HtmlDoc;
  finalUrl: string;
  robotsTxt: string | null;
  sitemapXml: string | null;
  headers: Record<string, string>;
}

export interface TagIds {
  ga4: string[];
  ua: string[];
  gtm: string[];
  ads: string[];
}

/** Every measurement identifier present in the delivered HTML. */
export function findTagIds(html: string): TagIds {
  const unique = (matches: RegExpMatchArray | null): string[] => [...new Set(matches ?? [])];
  return {
    ga4: unique(html.match(/\bG-[A-Z0-9]{6,12}\b/g)),
    ua: unique(html.match(/\bUA-\d{4,10}-\d{1,4}\b/g)),
    gtm: unique(html.match(/\bGTM-[A-Z0-9]{5,9}\b/g)),
    ads: unique(html.match(/\bAW-\d{9,12}\b/g)),
  };
}

function sitemapFacts(xml: string | null): { urls: number; lastmods: number; index: boolean } {
  if (!xml) return { urls: 0, lastmods: 0, index: false };
  const urls = (xml.match(/<url>/g) ?? []).length;
  const sitemaps = (xml.match(/<sitemap>/g) ?? []).length;
  const lastmods = (xml.match(/<lastmod>/g) ?? []).length;
  return { urls, lastmods, index: sitemaps > 0 && urls === 0 };
}

/** GA4 measurement readiness — measured, no Google account needed. */
export function ga4Table(input: AnalyticsInput, html: string): DataTable {
  const ids = findTagIds(html);
  const consentMode = /gtag\(\s*['"]consent['"]/.test(html) || /consent\s*:\s*\{/.test(html);
  const gtagLoads = (html.match(/googletagmanager\.com\/gtag\/js/g) ?? []).length;
  const gtmLoads = (html.match(/googletagmanager\.com\/gtm\.js/g) ?? []).length;
  const dataLayer = /dataLayer\s*=/.test(html);
  const serverSide = /measurementProtocol|mp\/collect|\/g\/collect/i.test(html);

  const rows: TableRow[] = [
    {
      label: "GA4 measurement IDs",
      value: ids.ga4.length ? ids.ga4.join(", ") : "none",
      status: ids.ga4.length === 1 ? "pass" : ids.ga4.length === 0 ? "fail" : "warn",
      note: ids.ga4.length > 1 ? "More than one GA4 property on the page: sessions can be double-counted." : "",
    },
    {
      label: "Universal Analytics",
      value: ids.ua.length ? ids.ua.join(", ") : "none",
      status: ids.ua.length ? "fail" : "pass",
      note: ids.ua.length ? "UA stopped collecting in 2023 — this tag is dead weight." : "",
    },
    {
      label: "Tag Manager containers",
      value: ids.gtm.length ? ids.gtm.join(", ") : "none",
      status: ids.gtm.length === 1 ? "pass" : ids.gtm.length === 0 ? "warn" : "warn",
      note: ids.gtm.length > 1 ? "Several containers: the deployment order decides which one wins." : "",
    },
    {
      label: "Loader duplication",
      value: `gtag ${gtagLoads} · gtm ${gtmLoads}`,
      status: gtagLoads + gtmLoads <= 1 ? "pass" : "warn",
      note: gtagLoads + gtmLoads > 1 ? "Two loaders on the same page is the classic source of duplicated events." : "",
    },
    { label: "dataLayer initialised", value: dataLayer ? "yes" : "no", status: dataLayer ? "pass" : "fail" },
    {
      label: "Consent mode",
      value: consentMode ? "declared" : "not found",
      status: consentMode ? "pass" : "warn",
      note: consentMode ? "" : "No consent signal in the HTML: EEA measurement depends on it.",
    },
    {
      label: "Server-side hints",
      value: serverSide ? "collect endpoint referenced" : "none",
      status: "info",
      note: serverSide ? "" : "No sGTM/MP reference in the page source — expected on static sites.",
    },
    { label: "Ads conversion IDs", value: ids.ads.length ? ids.ads.join(", ") : "none", status: "info" },
  ];

  return {
    id: "ga4.readiness",
    title: "GA4 — measurement readiness",
    subtitle: "Read from the served HTML. No Google account required.",
    rows,
  };
}

/** Search Console readiness — measured from the page, robots.txt and sitemap. */
export function gscTable(input: AnalyticsInput): DataTable {
  const verification = input.doc.metaByName("google-site-verification")?.attrs.content ?? "";
  const host = (() => {
    try {
      return new URL(input.finalUrl).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  const sitemap = sitemapFacts(input.sitemapXml);
  const robotsSitemaps = (input.robotsTxt ?? "").match(/^sitemap:\s*\S+/gim) ?? [];
  const robotsBlocksAll = /user-agent:\s*\*[\s\S]*?disallow:\s*\/\s*($|\n)/i.test(input.robotsTxt ?? "");
  const noindex = (input.headers["x-robots-tag"] ?? "").toLowerCase().includes("noindex");
  const canonical = input.doc.linkByRel("canonical")?.attrs.href ?? "";

  const rows: TableRow[] = [
    {
      label: "Verification meta",
      value: verification ? "google-site-verification present" : "not found",
      status: verification ? "pass" : "info",
      note: verification ? "" : "A DNS or file verification may still exist — this only checks the meta tag.",
    },
    {
      label: "robots.txt",
      value: input.robotsTxt ? `${input.robotsTxt.split(/\r?\n/).length} line(s)` : "missing",
      status: !input.robotsTxt ? "fail" : robotsBlocksAll ? "fail" : "pass",
      note: robotsBlocksAll ? "robots.txt blocks everything for all agents." : "",
    },
    {
      label: "Sitemap declared in robots.txt",
      value: robotsSitemaps.length ? `${robotsSitemaps.length}` : "none",
      status: robotsSitemaps.length ? "pass" : "warn",
      note: robotsSitemaps.length ? clamp(String(robotsSitemaps[0] ?? "")) : "Declare the sitemap so Search Console finds it.",
    },
    {
      label: "Sitemap",
      value: input.sitemapXml ? `${sitemap.urls} URL(s)${sitemap.index ? " · index file" : ""}` : "missing",
      status: !input.sitemapXml ? "fail" : sitemap.urls > 0 ? "pass" : "warn",
    },
    {
      label: "Lastmod coverage",
      value: input.sitemapXml && sitemap.urls ? `${Math.round((sitemap.lastmods / sitemap.urls) * 100)}%` : "n/a",
      status: !input.sitemapXml ? "info" : sitemap.lastmods ? "pass" : "warn",
      note: sitemap.lastmods ? "" : "No lastmod: recrawl decisions fall back to guesswork.",
    },
    {
      label: "Indexability",
      value: noindex ? "noindex header" : "indexable",
      status: noindex ? "fail" : "pass",
    },
    {
      label: "Canonical host",
      value: canonical ? clamp(canonical, 50) : "missing",
      status: canonical.includes(host) ? "pass" : canonical ? "warn" : "fail",
      note: canonical && !canonical.includes(host) ? "Canonical points at another host." : "",
    },
  ];

  return {
    id: "gsc.readiness",
    title: "Search Console — indexation readiness",
    subtitle: "Read from the page, robots.txt and sitemap. No Google account required.",
    rows,
  };
}

export interface TrafficSample {
  period: string;
  rows: { label: string; value: string }[];
}

/**
 * The traffic reports a connected property returns. Used verbatim as the
 * `sample: true` preview, and replaced by real API rows when credentials exist.
 */
export const TRAFFIC_SAMPLE = {
  ga4: {
    period: "Last 28 days",
    rows: [
      { label: "Sessions", value: "18,420" },
      { label: "Engaged sessions", value: "11,905 (64.6%)" },
      { label: "Key events", value: "412" },
      { label: "Top landing page", value: "/tarifs — 3,180 sessions" },
      { label: "Organic share", value: "58%" },
    ],
  },
  gsc: {
    period: "Last 28 days",
    rows: [
      { label: "Clicks", value: "2,940" },
      { label: "Impressions", value: "184,200" },
      { label: "Average CTR", value: "1.6%" },
      { label: "Average position", value: "14.2" },
      { label: "Top query", value: "dpe maison — 610 clicks" },
    ],
  },
};

/** Traffic tables; `connected` is true only when real API rows are passed in. */
export function trafficTable(
  id: "ga4" | "gsc",
  data: TrafficSample | null,
  connected: boolean
): DataTable {
  const payload = data ?? TRAFFIC_SAMPLE[id];
  return {
    id: `${id}.traffic`,
    title: id === "ga4" ? "GA4 — traffic report" : "Search Console — performance report",
    subtitle: connected
      ? `${payload.period} · read from the connected property (read-only).`
      : `${payload.period} · illustrative sample, not your property.`,
    connected,
    sample: !connected,
    rows: payload.rows.map((row) => ({ label: row.label, value: row.value, status: "info" as const })),
  };
}
