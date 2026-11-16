/**
 * Evidence-first public report. No new network calls, model calls or credentials.
 * A `null` metric means not measured, NEVER a score of zero.
 * This contract is shared by Node, the Cloudflare worker and the web report.
 */
import type { DataTable } from "./seo.js";
import type { FreeReadEvidence } from "./evidence.js";
import type { FreeReadOpportunity, FreeReadSocialProfile } from "./index.js";
import type { V2CoverageScore } from "../geo/score/v2/coverage.js";
import { publicV2Coverage, type PublicV2Coverage } from "../geo/score/v2/public.js";

export type ReportPillarId = "seo" | "geo" | "ai" | "crm" | "social";
export type ReportCoverage = "measured" | "partial" | "not_measured";
export type ReportPriority = "critical" | "high" | "medium" | "low";

export interface ReportProof {
  id: string;
  sourceUrl: string;
  observedAt: string;
  label: string;
  value: string;
  note: string;
  /** A textual observation, not a screenshot of the target site. */
  format: "html_observation" | "geo_check" | "geo_v2_control";
}

export interface ReportAction {
  id: string;
  pillar: ReportPillarId;
  /** Conditional onboarding steps must never be reported as failed checks. */
  kind: "observed_fix" | "next_step";
  code: string;
  checkId?: string;
  /** Approved v2 rubric title in its original language. */
  title?: string;
  priority: ReportPriority;
  effort: "low" | "medium" | "high";
  /** Operational change risk, not a computed SEO penalty. */
  risk: "low" | "medium" | "high";
  owner: "content" | "technical" | "marketing" | "analytics";
  points: number | null;
  proof: ReportProof | null;
}

export interface ReportPillar {
  id: ReportPillarId;
  coverage: ReportCoverage;
  /** Null means no publishable score, not zero. */
  score: number | null;
  observedChecks: number | null;
  needsAttention: number | null;
  observedCount: number | null;
  measurement: string;
  missing: string[];
}

export interface FreeReport360 {
  schemaVersion: 1;
  method: "geo-v1-public-page" | "geo-v2-public-evidence";
  scope: "single_public_url";
  observedAt: string;
  sourceUrl: string;
  httpStatus: number;
  pillars: ReportPillar[];
  actions: ReportAction[];
  comparison: null;
  /** Distinguishes uncollected private metrics from observed public facts. */
  unmeasured: string[];
  /** The complete, proof-bound 42-control GEO v2 ledger (never a v1 mapping). */
  geoV2?: PublicV2Coverage;
  /** Visual reconstruction of observed page metadata, NEVER a fabricated screenshot. */
  sourcePreview?: {
    kind: "observed_html_reconstruction";
    title: string; description: string; heading: string; subheadings: string[];
    observedAt: string; screenshotUrl: null;
  };
}

interface ReportInput {
  finalUrl: string;
  httpStatus: number;
  score: number;
  checksSummary: { passed: number; toImprove: number; total: number };
  opportunities: FreeReadOpportunity[];
  socialProfiles: FreeReadSocialProfile[];
  evidence: FreeReadEvidence;
  tables: DataTable[];
  geoV2?: V2CoverageScore;
  pageSignals?: { title: string; description: string; h1: string[]; h2: string[] };
}

const SEO_ACTIONS: Record<string, {
  code: string; priority: ReportPriority; effort: ReportAction["effort"]; owner: ReportAction["owner"];
}> = {
  "seo.meta:Title": { code: "title", priority: "high", effort: "low", owner: "content" },
  "seo.meta:Meta description": { code: "description", priority: "medium", effort: "low", owner: "content" },
  "seo.meta:Canonical": { code: "canonical", priority: "high", effort: "medium", owner: "technical" },
  "seo.meta:Robots meta": { code: "robots", priority: "critical", effort: "medium", owner: "technical" },
  "seo.meta:X-Robots-Tag": { code: "x_robots", priority: "critical", effort: "medium", owner: "technical" },
  "seo.meta:html lang": { code: "lang", priority: "medium", effort: "low", owner: "technical" },
  "seo.meta:Open Graph": { code: "open_graph", priority: "low", effort: "low", owner: "content" },
  "seo.content:H1": { code: "h1", priority: "high", effort: "low", owner: "content" },
  "seo.content:Outline": { code: "outline", priority: "medium", effort: "medium", owner: "content" },
  "seo.content:Words": { code: "content_review", priority: "low", effort: "medium", owner: "content" },
  "seo.technical:Internal links": { code: "internal_links", priority: "medium", effort: "medium", owner: "content" },
  "seo.technical:Images without alt": { code: "image_alt", priority: "medium", effort: "low", owner: "content" },
  "seo.technical:JSON-LD blocks": { code: "jsonld", priority: "medium", effort: "medium", owner: "technical" },
  "seo.technical:Schema types": { code: "schema", priority: "medium", effort: "medium", owner: "technical" },
};

const PRIORITY_ORDER: Record<ReportPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function buildFreeReport360(input: ReportInput): FreeReport360 {
  const sourceUrl = input.evidence.page.url || input.finalUrl;
  const observedAt = input.evidence.observedAt;
  const seoRows = input.tables.filter(t => t.id.startsWith("seo.") && !t.sample).flatMap(t =>
    t.rows.filter(row => row.status !== "info").map(row => ({ table: t.id, row }))
  );
  const seoFindings = seoRows.filter(({ row }) => row.status === "fail" || row.status === "warn");
  const seoActions: ReportAction[] = seoFindings.flatMap(({ table, row }) => {
    const config = SEO_ACTIONS[`${table}:${row.label}`];
    if (!config) return [];
    return [{
      id: `seo.${config.code}`, pillar: "seo" as const, code: config.code,
      kind: "observed_fix" as const, priority: config.priority, effort: config.effort,
      risk: ["canonical", "robots", "x_robots"].includes(config.code) ? "high" as const : "low" as const,
      owner: config.owner, points: null,
      proof: {
        id: `${table}:${row.label}`, sourceUrl, observedAt, label: row.label,
        value: row.value.slice(0, 512), note: (row.note ?? "").slice(0, 512),
        format: "html_observation" as const,
      },
    }];
  }).sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]).slice(0, 8);

  const v2 = input.geoV2;
  // Only failed *measured* v2 checks become observed corrections. Unknown is
  // never a defect, and no legacy v1 score/point is borrowed for this report.
  const failingV2 = (v2?.controls ?? []).filter(control =>
    control.status === "measured" && control.earned !== null && control.earned < control.maxPoints
  ).sort((a, b) => (b.maxPoints - (b.earned ?? 0)) - (a.maxPoints - (a.earned ?? 0)));
  const geoActions: ReportAction[] = failingV2.slice(0, 8).map(control => ({
    id: `geo.v2.${control.controlId}`, pillar: "geo", kind: "observed_fix", code: "geo_v2_check",
    checkId: control.controlId, title: control.title,
    priority: control.category === "robots" || control.category === "rendering" ? "high" : "medium",
    effort: "medium", owner: "technical", risk: "medium",
    points: null, // Publishing projected v2 points requires a resolved audit and owner consent.
    proof: {
      id: `geo-v2:${control.controlId}`, sourceUrl: control.proof!.url,
      observedAt, label: `${control.controlId} · ${control.title}`,
      value: control.proof!.value.slice(0, 512), note: `GEO v2.0.0 · ${control.category}`,
      format: "geo_v2_control",
    },
  }));

  const nextSteps: ReportAction[] = [
    { id: "ai.connect_measurement", pillar: "ai", kind: "next_step", code: "ai_measurement", priority: "medium", effort: "medium", risk: "high", owner: "marketing", points: null, proof: null },
    { id: "crm.connect_conversions", pillar: "crm", kind: "next_step", code: "crm_measurement", priority: "medium", effort: "medium", risk: "high", owner: "analytics", points: null, proof: null },
    { id: "social.validate_presence", pillar: "social", kind: "next_step", code: "social_presence", priority: "low", effort: "low", risk: "low", owner: "marketing", points: null, proof: null },
  ];

  return {
    schemaVersion: 1,
    method: "geo-v2-public-evidence",
    scope: "single_public_url",
    sourceUrl, observedAt, httpStatus: input.httpStatus,
    pillars: [
      { id: "seo", coverage: "measured", score: null, observedChecks: seoRows.length, needsAttention: seoFindings.length, observedCount: null, measurement: "html_seo_checks", missing: ["site_wide_audit", "competitor_keywords", "search_positions"] },
      { id: "geo", coverage: v2?.status === "complete" ? "measured" : v2?.controls.some(c => c.status === "measured") ? "partial" : "not_measured",
        score: null, observedChecks: v2?.controls.filter(c => c.status === "measured").length ?? 0,
        needsAttention: failingV2.length, observedCount: null, measurement: "geo_v2_evidence",
        missing: [...(v2?.unmeasuredControls ?? []), "owner_score_publication_consent", "ai_citations"] },
      { id: "ai", coverage: "partial", score: null, observedChecks: null, needsAttention: null, observedCount: null, measurement: "page_readiness_only", missing: ["actual_ai_citations", "engine_queries", "ai_referrals"] },
      { id: "crm", coverage: "not_measured", score: null, observedChecks: null, needsAttention: null, observedCount: null, measurement: "requires_authorised_property", missing: ["actual_conversions", "lead_attribution", "customer_journey"] },
      { id: "social", coverage: "partial", score: null, observedChecks: null, needsAttention: null, observedCount: input.socialProfiles.length, measurement: "outbound_profile_links_on_page", missing: ["inbound_links", "engagement", "social_referrals"] },
    ],
    actions: [...seoActions, ...geoActions, ...nextSteps],
    comparison: null,
    unmeasured: ["ai_citations", "ai_rankings", "crm_conversions", "social_inbound_backlinks", "historical_comparison", "unverified_domain_rendering"],
    geoV2: v2 ? publicV2Coverage(v2) : undefined,
    sourcePreview: {
      kind: "observed_html_reconstruction",
      title: (input.pageSignals?.title ?? "").slice(0, 130),
      description: (input.pageSignals?.description ?? "").slice(0, 180),
      heading: (input.pageSignals?.h1?.[0] ?? "").slice(0, 130),
      subheadings: (input.pageSignals?.h2 ?? []).slice(0, 4).map(heading => heading.slice(0, 130)),
      observedAt, screenshotUrl: null,
    },
  };
}
