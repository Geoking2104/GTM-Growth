import { CATEGORY_WEIGHTS, GRID_VERSION } from "./rubric.js";
import type { V2Category } from "./rubric.js";
import type { GeoAuditResult, GeoCategory, GeoCheck } from "../../types.js";

/**
 * Lossless evidence inventory for the future GEO v2 control grid.
 * Never converts v1 points into v2 points: evidence coverage is not a score.
 */
export interface V2EvidenceFinding {
  sourceCheckId: string;
  category: V2Category;
  status: "observed" | "unavailable";
  observation: GeoCheck["status"] | null;
  evidence: string | null;
}

export interface V2EvidenceInventory {
  gridVersion: typeof GRID_VERSION;
  scoringStatus: "not_scored";
  source: "geo_v1_audit";
  categories: Record<V2Category, { budget: number; observed: number; unavailable: number }>;
  findings: V2EvidenceFinding[];
  limitations: string[];
}

const categoryMap: Record<GeoCategory, V2Category> = {
  robots: "robots",
  llms: "llms",
  schema: "jsonld",
  meta: "meta",
  content: "content",
  brand_entity: "brand",
  signals: "discovery",
  ai_discovery: "discovery",
};

export function collectV2Evidence(audit: GeoAuditResult): V2EvidenceInventory {
  const categories = Object.fromEntries(
    Object.entries(CATEGORY_WEIGHTS).map(([key, budget]) =>
      [key, { budget, observed: 0, unavailable: 0 }])
  ) as V2EvidenceInventory["categories"];

  const findings = audit.checks.map((check): V2EvidenceFinding => {
    const category = categoryMap[check.category];
    const observed = !audit.error && Boolean(check.evidence.trim());
    categories[category][observed ? "observed" : "unavailable"] += 1;
    return {
      sourceCheckId: check.id,
      category,
      status: observed ? "observed" : "unavailable",
      observation: observed ? check.status : null,
      evidence: observed ? check.evidence : null,
    };
  });

  // No render-vs-HTML comparison was performed by the HTTP-only audit.
  categories.rendering.unavailable = 1;
  findings.push({
    sourceCheckId: "rendering.playwright",
    category: "rendering",
    status: "unavailable",
    observation: null,
    evidence: null,
  });

  return {
    gridVersion: GRID_VERSION,
    scoringStatus: "not_scored",
    source: "geo_v1_audit",
    categories,
    findings,
    limitations: [
      "This is an evidence inventory, not a GEO v2 score or a mapping to the approved control weights.",
      "The v1 audit cannot certify applicability of the full v2 controls.",
      "Rendering and crawler accessibility require isolated Playwright observations on verified domains.",
    ],
  };
}
