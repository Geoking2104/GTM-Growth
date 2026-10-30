import { ABOUT_LINK_PATTERNS, KG_PILLAR_DOMAINS, ORGANIZATION_TYPES, WEIGHTS } from "../config.js";
import type { HtmlDoc } from "../html.js";
import { cutAtFirstSeparator, normalizeBrandName } from "../text.js";
import type {
  BrandAudit,
  CategoryResult,
  ContentAudit,
  GeoCheck,
  MetaAudit,
  SchemaAudit,
} from "../types.js";

const PRIMARY_SCHEMA_TYPES = ["WebSite", "WebApplication", "SoftwareApplication"];

function typesOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}

/**
 * Audit brand and entity signals: is the same name used everywhere, is the
 * entity linked to the Knowledge Graph, and does the page expose the
 * about/contact/geo facts an engine needs to resolve "who is this?".
 */
export function auditBrand(
  doc: HtmlDoc,
  schema: SchemaAudit,
  meta: MetaAudit,
  content: ContentAudit
): CategoryResult<BrandAudit> {
  const h1Name = content.h1 ? cutAtFirstSeparator(content.h1) : "";
  const titleName = meta.title ? cutAtFirstSeparator(meta.title) : "";
  const ogTitle = doc.metaByProperty("og:title")?.attrs.content?.trim() || "";
  const ogName = ogTitle ? cutAtFirstSeparator(ogTitle) : "";

  const names: string[] = [];
  const primarySchemaNames: string[] = [];
  const orgSchemaNames: string[] = [];

  for (const name of [h1Name, titleName, ogName]) {
    if (name) names.push(name);
  }

  for (const object of schema.objects) {
    const name = object["name"];
    if (typeof name !== "string" || !name.trim()) continue;
    const types = typesOf(object["@type"]);
    if (types.some((type) => PRIMARY_SCHEMA_TYPES.includes(type))) {
      names.push(name);
      primarySchemaNames.push(name);
    } else if (types.some((type) => ORGANIZATION_TYPES.includes(type))) {
      names.push(name);
      orgSchemaNames.push(name);
    }
  }

  let primaryName: string | null = null;
  if (primarySchemaNames.length) primaryName = primarySchemaNames[0];
  else if (orgSchemaNames.length) primaryName = orgSchemaNames[0];
  else if (names.length) {
    const counts = new Map<string, number>();
    for (const name of names) {
      const key = normalizeBrandName(name);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const [topKey, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    primaryName =
      topCount >= 2 ? names.find((name) => normalizeBrandName(name) === topKey) ?? names[0] : names[0];
  }

  // One vote per source: head (title + og:title), H1, and schema.
  const sources: Array<Set<string>> = [];
  const headNames = new Set(
    [titleName, ogName].filter(Boolean).map((name) => normalizeBrandName(name))
  );
  if (headNames.size) sources.push(headNames);
  if (h1Name) sources.push(new Set([normalizeBrandName(h1Name)]));
  const schemaNames = new Set(
    [...primarySchemaNames, ...orgSchemaNames].map((name) => normalizeBrandName(name))
  );
  if (schemaNames.size) sources.push(schemaNames);

  let brandNameConsistent = false;
  if (sources.length >= 2) {
    const counts = new Map<string, number>();
    for (const source of sources) {
      for (const name of source) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    brandNameConsistent = Math.max(...counts.values()) >= 2;
  }

  let schemaDescMatchesMeta = false;
  if (meta.description) {
    const metaDesc = meta.description.toLowerCase().slice(0, 100);
    schemaDescMatchesMeta = schema.objects.some((object) => {
      const description = object["description"];
      if (typeof description !== "string" || !description) return false;
      const schemaDesc = description.toLowerCase().slice(0, 100);
      return (
        metaDesc.slice(0, 30) === schemaDesc.slice(0, 30) ||
        schemaDesc.includes(metaDesc.slice(0, 30)) ||
        metaDesc.includes(schemaDesc.slice(0, 30))
      );
    });
  }

  const kgPillarUrls = schema.sameAsUrls.filter((url) =>
    KG_PILLAR_DOMAINS.some((domain) => url.toLowerCase().includes(domain))
  );

  const hasAboutLink = doc
    .all("a")
    .some((a) => {
      const href = (a.attrs.href || "").toLowerCase();
      return href.length > 0 && ABOUT_LINK_PATTERNS.some((pattern) => href.includes(pattern));
    });

  const hasContactInfo = schema.objects.some((object) => {
    const types = typesOf(object["@type"]);
    if (types.some((type) => ORGANIZATION_TYPES.includes(type))) {
      return Boolean(
        object["address"] || object["telephone"] || object["email"] || object["contactPoint"]
      );
    }
    return (
      types.includes("Person") &&
      Boolean(object["jobTitle"] || object["hasCredential"] || object["alumniOf"])
    );
  });

  const hasHreflang = doc
    .all("link")
    .some((link) => (link.attrs.rel || "").toLowerCase() === "alternate" && Boolean(link.attrs.hreflang));
  const hasGeoSignal =
    hasHreflang ||
    schema.objects.some((object) => {
      const types = typesOf(object["@type"]);
      return (
        types.includes("LocalBusiness") ||
        Boolean(object["areaServed"]) ||
        (types.some((type) => ORGANIZATION_TYPES.includes(type)) && Boolean(object["address"]))
      );
    });

  let faqDepth = 0;
  for (const object of schema.objects) {
    if (!typesOf(object["@type"]).includes("FAQPage")) continue;
    const mainEntity = object["mainEntity"];
    if (Array.isArray(mainEntity)) faqDepth += mainEntity.length;
  }

  const hasRecentArticles = schema.hasDateModified && schema.hasArticle;

  const data: BrandAudit = {
    namesFound: [...new Set(names)].slice(0, 10),
    primaryName,
    brandNameConsistent,
    schemaDescMatchesMeta,
    kgPillarUrls,
    kgPillarCount: kgPillarUrls.length,
    hasAboutLink,
    hasContactInfo,
    hasGeoSignal,
    faqDepth,
    hasRecentArticles,
  };

  const check = (
    id: string,
    label: string,
    earned: number,
    max: number,
    status: GeoCheck["status"],
    evidence: string,
    fix?: string
  ): GeoCheck => ({
    id,
    category: "brand_entity",
    label,
    earned,
    max,
    status,
    evidence,
    fix,
  });

  const kgPoints =
    data.kgPillarCount >= 3
      ? WEIGHTS.brand_kg_readiness
      : data.kgPillarCount === 2
        ? WEIGHTS.brand_kg_readiness - 1
        : data.kgPillarCount === 1
          ? WEIGHTS.brand_kg_readiness - 2
          : 0;

  const checks: GeoCheck[] = [
    check(
      "brand.name_coherence",
      "Brand name is consistent",
      brandNameConsistent ? WEIGHTS.brand_name_coherence : 0,
      WEIGHTS.brand_name_coherence,
      brandNameConsistent ? "pass" : "fail",
      data.namesFound.length
        ? `Names found: ${data.namesFound.join(" · ")}`
        : "No brand name could be extracted from title/H1/schema",
      brandNameConsistent
        ? undefined
        : "Use one brand name across <title>, og:title, H1 and Organization schema so the entity resolves cleanly."
    ),
    check(
      "brand.desc_coherence",
      "Schema and meta descriptions agree",
      schemaDescMatchesMeta ? WEIGHTS.brand_desc_coherence : 0,
      WEIGHTS.brand_desc_coherence,
      schemaDescMatchesMeta ? "pass" : "fail",
      schemaDescMatchesMeta
        ? "Schema description overlaps the meta description"
        : "Schema and meta descriptions do not overlap",
      schemaDescMatchesMeta
        ? undefined
        : "Reuse the same positioning sentence in Organization schema description and the meta description."
    ),
    check(
      "brand.kg_readiness",
      "Knowledge Graph links (sameAs)",
      kgPoints,
      WEIGHTS.brand_kg_readiness,
      kgPoints === WEIGHTS.brand_kg_readiness ? "pass" : kgPoints > 0 ? "partial" : "fail",
      `${data.kgPillarCount}/4 pillars linked${data.kgPillarUrls.length ? `: ${data.kgPillarUrls.join(", ")}` : ""}`,
      kgPoints === WEIGHTS.brand_kg_readiness
        ? undefined
        : "Add sameAs URLs to Wikipedia, Wikidata, LinkedIn and Crunchbase in Organization schema."
    ),
    check(
      "brand.about_link",
      "About page linked",
      data.hasAboutLink ? WEIGHTS.brand_about_link : 0,
      WEIGHTS.brand_about_link,
      data.hasAboutLink ? "pass" : "fail",
      data.hasAboutLink ? "A /about-style link is present" : "No about/company link found",
      data.hasAboutLink ? undefined : "Link a visible /about or /company page from the homepage."
    ),
    check(
      "brand.contact_info",
      "Contact details in schema",
      data.hasContactInfo ? WEIGHTS.brand_contact_info : 0,
      WEIGHTS.brand_contact_info,
      data.hasContactInfo ? "pass" : "fail",
      data.hasContactInfo
        ? "Organization/Person schema exposes contact details"
        : "No address, telephone, email or contactPoint",
      data.hasContactInfo
        ? undefined
        : "Add address, telephone or contactPoint to Organization schema — it validates the entity."
    ),
    check(
      "brand.geo_identity",
      "Geographic identity",
      data.hasGeoSignal ? WEIGHTS.brand_geo_identity : 0,
      WEIGHTS.brand_geo_identity,
      data.hasGeoSignal ? "pass" : "fail",
      data.hasGeoSignal ? "Geo schema or hreflang present" : "No areaServed/address or hreflang",
      data.hasGeoSignal ? undefined : "Add areaServed/address (or hreflang) so local and regional queries can resolve you."
    ),
    check(
      "brand.topic_authority",
      "Topic authority signals",
      data.faqDepth >= 3 || data.hasRecentArticles ? WEIGHTS.brand_topic_authority : 0,
      WEIGHTS.brand_topic_authority,
      data.faqDepth >= 3 || data.hasRecentArticles ? "pass" : "fail",
      `FAQ items: ${data.faqDepth} · dated articles: ${data.hasRecentArticles ? "yes" : "no"}`,
      data.faqDepth >= 3 || data.hasRecentArticles
        ? undefined
        : "Add a 3+ question FAQ or dated Article markup to show topical depth."
    ),
  ];

  return { data, checks };
}
