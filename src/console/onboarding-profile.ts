/**
 * Onboarding profile — the "verify brand profile" step of the guided setup.
 *
 * Reads the tenant's homepage once and pre-fills what a human would otherwise
 * type: brand name (JSON-LD `name`, then og:site_name), description (meta
 * description, then og:description, then schema description), html lang and
 * schema types. No LLM, no paid API: the user corrects real values instead of
 * typing from scratch (pattern observed on geoptie.com/app/onboarding).
 */

import { HtmlDoc, type HtmlNode } from "../geo/html.js";
import { auditSchema } from "../geo/audit/schema.js";

export interface OnboardingProfile {
  url: string;
  httpStatus: number;
  siteName: string | null;
  title: string | null;
  description: string | null;
  lang: string | null;
  schemaTypes: string[];
  sameAs: string[];
  /** Where the brand name came from, so the UI can say what was read. */
  siteNameSource: "schema" | "meta" | null;
}

const metaContent = (node: HtmlNode | null): string | null => {
  const value = node?.attrs?.content?.trim();
  return value ? value : null;
};

export function extractOnboardingProfile(doc: HtmlDoc, finalUrl: string, httpStatus: number): OnboardingProfile {
  const schema = auditSchema(doc).data;
  const named = schema.objects.find((o) => [o["@type"]].flat().some(t => ["Organization", "Brand", "WebSite", "LocalBusiness"].includes(String(t))) && typeof o["name"] === "string" && String(o["name"]).trim().length >= 2);
  const schemaName = typeof named?.["name"] === "string" ? named["name"].trim() : null;
  const metaSiteName = metaContent(doc.metaByProperty("og:site_name"));
  const siteName = schemaName ?? metaSiteName;
  const schemaDescription = typeof named?.["description"] === "string" ? String(named["description"]).trim() : null;
  const description =
    metaContent(doc.metaByName("description")) ??
    metaContent(doc.metaByProperty("og:description")) ??
    schemaDescription;
  return {
    url: finalUrl,
    httpStatus,
    siteName: siteName || null,
    title: doc.title(),
    description: description || null,
    lang: doc.htmlLang(),
    schemaTypes: schema.foundTypes.slice(0, 8),
    sameAs: schema.sameAsUrls.slice(0, 6),
    siteNameSource: schemaName ? "schema" : metaSiteName ? "meta" : null,
  };
}
