import { WEIGHTS } from "../config.js";
import type { HtmlDoc } from "../html.js";
import type { CategoryResult, GeoCheck, MetaAudit } from "../types.js";

/**
 * Audit the head-level signals AI engines and classic crawlers both read:
 * title, description, canonical, Open Graph, and the directives that can
 * silently remove a page from AI answers (noindex, noai).
 */
export function auditMeta(
  doc: HtmlDoc,
  headers: Record<string, string>
): CategoryResult<MetaAudit> {
  const title = doc.title();
  const description = doc.metaByName("description")?.attrs.content?.trim() || null;
  const canonical = doc.linkByRel("canonical")?.attrs.href?.trim() || null;
  const ogTitle = doc.metaByProperty("og:title")?.attrs.content?.trim() || null;
  const ogDescription = doc.metaByProperty("og:description")?.attrs.content?.trim() || null;
  const ogImage = doc.metaByProperty("og:image")?.attrs.content?.trim() || null;
  const robotsMeta = doc.metaByName("robots")?.attrs.content?.trim() || null;
  const hasNoai = robotsMeta ? /noai|noimageai/i.test(robotsMeta) : false;
  const xRobotsTag = headers["x-robots-tag"] ?? null;
  const xRobotsNoindex = xRobotsTag ? /noindex/i.test(xRobotsTag) : false;

  const data: MetaAudit = {
    title,
    titleLength: title?.length ?? 0,
    description,
    descriptionLength: description?.length ?? 0,
    canonical,
    hasOgTitle: Boolean(ogTitle),
    hasOgDescription: Boolean(ogDescription),
    hasOgImage: Boolean(ogImage),
    robotsMeta,
    hasNoai,
    xRobotsTag,
    xRobotsNoindex,
  };

  const check = (
    id: string,
    label: string,
    earned: number,
    max: number,
    status: GeoCheck["status"],
    evidence: string,
    fix?: string
  ): GeoCheck => ({ id, category: "meta", label, earned, max, status, evidence, fix });

  const checks: GeoCheck[] = [
    check(
      "meta.title",
      "Title tag",
      title ? WEIGHTS.meta_title : 0,
      WEIGHTS.meta_title,
      title ? "pass" : "fail",
      title ? `${data.titleLength} characters: "${title.slice(0, 80)}"` : "No <title>",
      title ? undefined : "Add a <title> that names the entity and the page topic — the strongest on-page signal."
    ),
    check(
      "meta.description",
      "Meta description",
      description ? WEIGHTS.meta_description : 0,
      WEIGHTS.meta_description,
      description ? "pass" : "fail",
      description ? `${data.descriptionLength} characters` : "No meta description",
      description ? undefined : "Add a 150–160 character meta description that states what the page answers."
    ),
    check(
      "meta.canonical",
      "Canonical URL",
      canonical ? WEIGHTS.meta_canonical : 0,
      WEIGHTS.meta_canonical,
      canonical ? "pass" : "fail",
      canonical ?? "No <link rel=\"canonical\">",
      canonical ? undefined : "Add a canonical URL so duplicate variants do not split AI citations."
    ),
    check(
      "meta.og",
      "Open Graph tags",
      data.hasOgTitle && data.hasOgDescription ? WEIGHTS.meta_og : 0,
      WEIGHTS.meta_og,
      data.hasOgTitle && data.hasOgDescription ? "pass" : "fail",
      `og:title ${data.hasOgTitle ? "✓" : "✗"} · og:description ${
        data.hasOgDescription ? "✓" : "✗"
      } · og:image ${data.hasOgImage ? "✓" : "✗"}`,
      data.hasOgTitle && data.hasOgDescription
        ? undefined
        : "Add og:title, og:description and og:image — they feed previews and entity extraction."
    ),
  ];

  // Blockers carry no points: they are binary page-level switches.
  if (xRobotsNoindex) {
    checks.push({
      id: "meta.x_robots_noindex",
      category: "meta",
      label: "X-Robots-Tag allows indexing",
      earned: 0,
      max: 0,
      status: "fail",
      evidence: `HTTP header X-Robots-Tag: ${xRobotsTag}`,
      fix: "Remove noindex from the X-Robots-Tag response header — AI crawlers skip the page entirely.",
    });
  }

  if (hasNoai) {
    checks.push({
      id: "meta.noai",
      category: "meta",
      label: "No noai directive",
      earned: 0,
      max: 0,
      status: "fail",
      evidence: `meta robots: ${robotsMeta}`,
      fix: "Remove noai/noimageai from meta robots if you want AI engines to cite this content.",
    });
  }

  return { data, checks };
}
