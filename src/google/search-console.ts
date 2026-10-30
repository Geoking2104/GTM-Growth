import { google } from "googleapis";
import type { webmasters_v3 } from "googleapis";
import { getAuthClient } from "../auth/service-account.js";

async function getWebmasters() {
  const auth = await getAuthClient();
  return google.webmasters({ version: "v3", auth });
}

async function getSearchConsole() {
  const auth = await getAuthClient();
  return google.searchconsole({ version: "v1", auth });
}

/** List all Search Console properties the Service Account can access. */
export async function listSearchConsoleSites() {
  const wm = await getWebmasters();
  const res = await wm.sites.list();
  return (res.data.siteEntry || []).map((s) => ({
    siteUrl: s.siteUrl,
    permissionLevel: s.permissionLevel,
  }));
}

/** Get details of a single Search Console property. */
export async function getSearchConsoleSite(siteUrl: string) {
  const wm = await getWebmasters();
  const res = await wm.sites.get({ siteUrl });
  return res.data;
}

/** List sitemaps submitted for a property. */
export async function listSitemaps(siteUrl: string) {
  const wm = await getWebmasters();
  const res = await wm.sitemaps.list({ siteUrl });
  return res.data.sitemap || [];
}

/** Get details of one sitemap (processing status, errors, warnings). */
export async function getSitemap(siteUrl: string, feedpath: string) {
  const wm = await getWebmasters();
  const res = await wm.sitemaps.get({ siteUrl, feedpath });
  return res.data;
}

/**
 * Submit (add) a sitemap to a Search Console property.
 * Requires the full `webmasters` scope and write permission on the property.
 */
export async function submitSitemap(siteUrl: string, feedpath: string) {
  const wm = await getWebmasters();
  await wm.sitemaps.submit({ siteUrl, feedpath });
  return { siteUrl, feedpath, submitted: true };
}

export interface SearchAnalyticsArgs {
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimensions?: string[];
  type?: string;
  aggregationType?: string;
  rowLimit?: number;
  startRow?: number;
  dimensionFilterGroups?: any[];
}

/**
 * The Search Analytics REST docs name this field `type` and mark `searchType`
 * as deprecated; the generated googleapis schema still only exposes
 * `searchType`. The intersection keeps the call typed while sending the field
 * the API actually documents.
 */
type SearchAnalyticsRequestBody = webmasters_v3.Schema$SearchAnalyticsQueryRequest & {
  type?: string | null;
};

/**
 * Run a Search Analytics query (clicks, impressions, CTR, position).
 * Uses webmasters v3 searchanalytics.query.
 */
export async function querySearchAnalytics(args: SearchAnalyticsArgs) {
  const wm = await getWebmasters();
  const requestBody: SearchAnalyticsRequestBody = {
    startDate: args.startDate,
    endDate: args.endDate,
    dimensions: args.dimensions,
    type: args.type,
    aggregationType: args.aggregationType,
    rowLimit: args.rowLimit,
    startRow: args.startRow,
    dimensionFilterGroups: args.dimensionFilterGroups,
  };
  const res = await wm.searchanalytics.query({
    siteUrl: args.siteUrl,
    requestBody,
  });
  return {
    rows: res.data.rows || [],
    responseAggregationType: res.data.responseAggregationType,
  };
}

/**
 * Inspect a URL's index status (verdict, coverage, last crawl, canonicals, robots).
 * Equivalent to the URL Inspection tool in Search Console.
 */
export async function inspectUrl(args: {
  siteUrl: string;
  inspectionUrl: string;
  languageCode?: string;
}) {
  const sc = await getSearchConsole();
  const res = await sc.urlInspection.index.inspect({
    requestBody: {
      inspectionUrl: args.inspectionUrl,
      siteUrl: args.siteUrl,
      languageCode: args.languageCode || "en-US",
    },
  });
  return res.data;
}
