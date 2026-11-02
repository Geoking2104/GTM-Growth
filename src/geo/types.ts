import type { GeoCategory, ScoreBand } from "./config.js";

export type CheckStatus = "pass" | "partial" | "fail" | "info";

/** One scored (or informational) audit finding. */
export interface GeoCheck {
  /** Stable id, e.g. `llms.blockquote`. */
  id: string;
  category: GeoCategory;
  label: string;
  earned: number;
  max: number;
  status: CheckStatus;
  /** What was observed, with the actual value — evidence, not a guess. */
  evidence: string;
  /** Concrete remediation, present when the check is not passing. */
  fix?: string;
}

/** Result of one category audit: the typed payload plus its checks. */
export interface CategoryResult<T> {
  data: T;
  checks: GeoCheck[];
}

export interface RobotsAudit {
  found: boolean;
  status: number;
  crawlDelay: number | null;
  sitemaps: string[];
  botsAllowed: string[];
  botsBlocked: string[];
  botsMissing: string[];
  botsPartial: string[];
  citationBotsOk: boolean;
  /** True when every citation bot has its own rule (not just `User-agent: *`). */
  citationBotsExplicit: boolean;
  groups: Record<string, { allow: string[]; disallow: string[] }>;
}

export interface LlmsAudit {
  found: boolean;
  status: number;
  hasH1: boolean;
  hasBlockquote: boolean;
  hasSections: boolean;
  sectionsCount: number;
  hasLinks: boolean;
  linksCount: number;
  wordCount: number;
  hasFull: boolean;
  warnings: string[];
  /** First ~400 chars of the file, so an agent can sanity-check the content. */
  excerpt: string;
}

export interface SchemaAudit {
  scriptCount: number;
  parseErrors: number;
  objects: Record<string, unknown>[];
  foundTypes: string[];
  hasWebsite: boolean;
  hasOrganization: boolean;
  hasFaq: boolean;
  hasArticle: boolean;
  hasProduct: boolean;
  hasHowTo: boolean;
  hasSameAs: boolean;
  sameAsUrls: string[];
  hasDateModified: boolean;
  avgAttributes: number;
  richnessScore: number;
  incompleteTypes: string[];
  missingFields: Record<string, string[]>;
  /** Schema `name`/`headline` appears in the page copy. */
  visibleMatch: boolean;
}

export interface MetaAudit {
  title: string | null;
  titleLength: number;
  description: string | null;
  descriptionLength: number;
  canonical: string | null;
  hasOgTitle: boolean;
  hasOgDescription: boolean;
  hasOgImage: boolean;
  /** `meta name="robots"` content, if present. */
  robotsMeta: string | null;
  hasNoai: boolean;
  /** `X-Robots-Tag` response header, if present. */
  xRobotsTag: string | null;
  xRobotsNoindex: boolean;
}

export interface ContentAudit {
  h1: string | null;
  headingCount: number;
  wordCount: number;
  numbersCount: number;
  externalLinksCount: number;
  hasHeadingHierarchy: boolean;
  hasListsOrTables: boolean;
  hasFrontLoading: boolean;
  imagesTotal: number;
  imagesWithAlt: number;
}

export interface SignalsAudit {
  lang: string | null;
  rssUrl: string | null;
  freshnessDate: string | null;
}

export interface BrandAudit {
  namesFound: string[];
  primaryName: string | null;
  brandNameConsistent: boolean;
  schemaDescMatchesMeta: boolean;
  kgPillarUrls: string[];
  kgPillarCount: number;
  hasAboutLink: boolean;
  hasContactInfo: boolean;
  hasGeoSignal: boolean;
  faqDepth: number;
  hasRecentArticles: boolean;
}

export interface AiDiscoveryAudit {
  hasWellKnownAi: boolean;
  hasSummary: boolean;
  summaryValid: boolean;
  hasFaq: boolean;
  faqCount: number;
  hasService: boolean;
}

export interface Recommendation {
  priority: "critical" | "high" | "medium" | "low";
  category: GeoCategory | "blockers";
  checkId: string;
  /** Points recoverable by fixing this item. */
  points: number;
  action: string;
}

export interface GeoAuditResult {
  url: string;
  finalUrl: string;
  httpStatus: number;
  pageSize: number;
  durationMs: number;
  score: number;
  band: ScoreBand;
  scoreBreakdown: Record<GeoCategory, number>;
  scoreMax: Record<GeoCategory, number>;
  /** Points still on the table across every failing check. */
  recoverablePoints: number;
  /** Score if every failing check were fixed, capped at 100. */
  projectedScore: number;
  checks: GeoCheck[];
  recommendations: Recommendation[];
  details: {
    robots: RobotsAudit;
    llms: LlmsAudit;
    schema: SchemaAudit;
    meta: MetaAudit;
    content: ContentAudit;
    signals: SignalsAudit;
    brand_entity: BrandAudit;
    ai_discovery: AiDiscoveryAudit;
  };
  /** Set when the page itself could not be analysed. */
  error?: string;
}

export interface SitemapAuditResult {
  baseUrl: string;
  sitemapUrl: string;
  pagesAudited: number;
  pagesFailed: number;
  averageScore: number;
  weakest: Array<{ url: string; score: number; band: ScoreBand; topFixes: string[] }>;
  missingAcrossSite: string[];
}
