import {
  ARTICLE_TYPES,
  ORGANIZATION_TYPES,
  SCHEMA_REQUIRED,
  SCHEMA_RICHNESS,
  WEIGHTS,
} from "../config.js";
import type { HtmlDoc } from "../html.js";
import { fold } from "../text.js";
import type { CategoryResult, GeoCheck, SchemaAudit } from "../types.js";

type JsonObject = Record<string, unknown>;

function typesOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}

/** Flatten a JSON-LD payload: top-level object(s) plus `@graph` nodes. */
export function flattenJsonLd(payload: unknown, out: JsonObject[] = []): JsonObject[] {
  if (Array.isArray(payload)) {
    for (const item of payload) flattenJsonLd(item, out);
    return out;
  }
  if (!payload || typeof payload !== "object") return out;
  const object = payload as JsonObject;
  if (Array.isArray(object["@graph"])) {
    for (const node of object["@graph"]) flattenJsonLd(node, out);
  } else {
    out.push(object);
  }
  return out;
}

/**
 * Audit JSON-LD structured data: which types exist, how rich each object is,
 * whether required fields are present, and whether the declared name actually
 * appears in the visible copy (schema that contradicts the page is not trust).
 */
export function auditSchema(doc: HtmlDoc): CategoryResult<SchemaAudit> {
  const scripts = doc
    .all("script")
    .filter((s) => (s.attrs.type || "").toLowerCase().includes("application/ld+json"));

  const objects: JsonObject[] = [];
  let parseErrors = 0;

  for (const script of scripts) {
    const raw = doc.textOf(script);
    if (!raw.trim()) continue;
    try {
      flattenJsonLd(JSON.parse(raw), objects);
    } catch {
      parseErrors += 1;
    }
  }

  const capped = objects.slice(0, 50);
  const foundTypes: string[] = [];
  const sameAsUrls: string[] = [];
  let hasWebsite = false;
  let hasOrganization = false;
  let hasFaq = false;
  let hasArticle = false;
  let hasProduct = false;
  let hasHowTo = false;
  let hasDateModified = false;

  const incompleteTypes: string[] = [];
  const missingFields: Record<string, string[]> = {};

  for (const object of capped) {
    const types = typesOf(object["@type"]);
    for (const type of types) {
      foundTypes.push(type);
      if (type === "WebSite") hasWebsite = true;
      else if (type === "FAQPage") hasFaq = true;
      else if (ARTICLE_TYPES.includes(type)) hasArticle = true;
      else if (ORGANIZATION_TYPES.includes(type)) hasOrganization = true;
      else if (type === "Product") hasProduct = true;
      else if (type === "HowTo") hasHowTo = true;

      const required = SCHEMA_REQUIRED[type.toLowerCase()];
      if (required) {
        const missing = required.filter((field) => !(field in object));
        if (missing.length && !incompleteTypes.includes(type)) {
          incompleteTypes.push(type);
          missingFields[type] = missing;
        }
      }
    }

    const sameAs = object["sameAs"];
    if (typeof sameAs === "string") sameAsUrls.push(sameAs);
    else if (Array.isArray(sameAs)) {
      for (const url of sameAs) if (typeof url === "string") sameAsUrls.push(url);
    }
    if (object["dateModified"]) hasDateModified = true;
  }

  const genericKeys = new Set(["@context", "@type", "@id"]);
  const attrCounts = capped.map(
    (object) => Object.keys(object).filter((key) => !genericKeys.has(key)).length
  );
  const avgAttributes = attrCounts.length
    ? Math.round((attrCounts.reduce((a, b) => a + b, 0) / attrCounts.length) * 10) / 10
    : 0;
  const richnessScore =
    avgAttributes >= SCHEMA_RICHNESS.high
      ? WEIGHTS.schema_richness
      : avgAttributes >= SCHEMA_RICHNESS.medium
        ? 2
        : avgAttributes >= SCHEMA_RICHNESS.low
          ? 1
          : 0;

  const visibleText = fold(doc.bodyText());
  const visibleMatch = capped.some((object) =>
    ["name", "headline"].some((field) => {
      const value = object[field];
      return (
        typeof value === "string" &&
        value.trim().length >= 3 &&
        visibleText.includes(fold(value))
      );
    })
  );

  const data: SchemaAudit = {
    scriptCount: scripts.length,
    parseErrors,
    objects: capped,
    foundTypes: [...new Set(foundTypes)],
    hasWebsite,
    hasOrganization,
    hasFaq,
    hasArticle,
    hasProduct,
    hasHowTo,
    hasSameAs: sameAsUrls.length > 0,
    sameAsUrls: [...new Set(sameAsUrls)].slice(0, 10),
    hasDateModified,
    avgAttributes,
    richnessScore,
    incompleteTypes,
    missingFields,
    visibleMatch,
  };

  const anyValid = data.foundTypes.length > 0;
  const check = (
    id: string,
    label: string,
    earned: number,
    max: number,
    status: GeoCheck["status"],
    evidence: string,
    fix?: string
  ): GeoCheck => ({ id, category: "schema", label, earned, max, status, evidence, fix });

  const typeList = data.foundTypes.length ? data.foundTypes.join(", ") : "none";
  const checks: GeoCheck[] = [
    check(
      "schema.any_valid",
      "Valid JSON-LD is present",
      anyValid ? WEIGHTS.schema_any_valid : 0,
      WEIGHTS.schema_any_valid,
      anyValid ? "pass" : "fail",
      anyValid
        ? `${scripts.length} script tag(s), types: ${typeList}`
        : `${scripts.length} script tag(s), no parseable @type found`,
      anyValid
        ? undefined
        : "Add a JSON-LD block with WebSite and Organization (geo_generate_schema can produce it)."
    ),
    check(
      "schema.richness",
      "Schema objects are rich (≥5 attributes)",
      richnessScore,
      WEIGHTS.schema_richness,
      richnessScore === WEIGHTS.schema_richness ? "pass" : richnessScore > 0 ? "partial" : "fail",
      `Average ${avgAttributes} non-generic attribute(s) per object`,
      richnessScore === WEIGHTS.schema_richness
        ? undefined
        : "Enrich schema with description, logo, sameAs, contactPoint, areaServed — generic name+url markup earns little."
    ),
    check(
      "schema.website",
      "WebSite schema",
      hasWebsite ? (incompleteTypes.includes("WebSite") ? 1 : WEIGHTS.schema_website) : 0,
      WEIGHTS.schema_website,
      hasWebsite ? (incompleteTypes.includes("WebSite") ? "partial" : "pass") : "fail",
      hasWebsite
        ? `WebSite${incompleteTypes.includes("WebSite") ? ` (missing ${missingFields.WebSite?.join(", ")})` : ""}`
        : "No WebSite schema",
      hasWebsite ? undefined : "Add WebSite schema with name, url and a SearchAction potentialAction."
    ),
    check(
      "schema.organization",
      "Organization schema",
      hasOrganization
        ? incompleteTypes.includes("Organization")
          ? 1
          : WEIGHTS.schema_organization
        : 0,
      WEIGHTS.schema_organization,
      hasOrganization
        ? incompleteTypes.includes("Organization")
          ? "partial"
          : "pass"
        : "fail",
      hasOrganization
        ? `Organization${
            incompleteTypes.includes("Organization")
              ? ` (missing ${missingFields.Organization?.join(", ")})`
              : ""
          }`
        : "No Organization schema",
      hasOrganization
        ? undefined
        : "Add Organization schema with name, url, logo, sameAs and contactPoint."
    ),
    check(
      "schema.faq",
      "FAQPage schema",
      hasFaq ? (incompleteTypes.includes("FAQPage") ? 1 : WEIGHTS.schema_faq) : 0,
      WEIGHTS.schema_faq,
      hasFaq ? (incompleteTypes.includes("FAQPage") ? "partial" : "pass") : "fail",
      hasFaq
        ? `FAQPage${
            incompleteTypes.includes("FAQPage") ? " (missing mainEntity)" : ""
          }`
        : "No FAQPage schema",
      hasFaq
        ? undefined
        : "Mark up the site FAQ as FAQPage — question/answer pairs are the easiest content for AI engines to quote."
    ),
    check(
      "schema.article",
      "Article schema",
      hasArticle
        ? incompleteTypes.some((type) => ARTICLE_TYPES.includes(type))
          ? 1
          : WEIGHTS.schema_article
        : 0,
      WEIGHTS.schema_article,
      hasArticle
        ? incompleteTypes.some((type) => ARTICLE_TYPES.includes(type))
          ? "partial"
          : "pass"
        : "fail",
      hasArticle
        ? `Article-type schema present${hasDateModified ? " with dateModified" : ""}`
        : "No Article/BlogPosting schema",
      hasArticle
        ? undefined
        : "Add Article or BlogPosting schema (headline, author, datePublished, dateModified) to editorial pages."
    ),
  ];

  if (!visibleMatch && anyValid) {
    checks.push({
      id: "schema.visible_match",
      category: "schema",
      label: "Schema name matches visible copy",
      earned: 0,
      max: 0,
      status: "fail",
      evidence: "No schema name/headline was found in the page text",
      fix: "Use the exact brand name in schema name/headline that the page displays — mismatched entities weaken trust.",
    });
  }

  if (parseErrors > 0) {
    checks.push({
      id: "schema.parse_errors",
      category: "schema",
      label: "JSON-LD parses cleanly",
      earned: 0,
      max: 0,
      status: "fail",
      evidence: `${parseErrors} JSON-LD block(s) failed to parse`,
      fix: "Validate each JSON-LD block (schema.org/validator); a single syntax error discards the whole block.",
    });
  }

  return { data, checks };
}
