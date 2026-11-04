/**
 * GEO / AEO rubric constants.
 *
 * The weights follow the published 8-category, 100-point rubric of the
 * geo-optimizer-skill model (https://github.com/Auriti-Labs/geo-optimizer-skill):
 *
 *   robots.txt 18 · llms.txt 18 · Schema JSON-LD 16 · Meta tags 14
 *   Content 12 · Brand & Entity 10 · Signals 6 · AI discovery 6
 *
 * Every point in the model is attributed to exactly one check below, so the
 * per-category score is the sum of its checks and can never drift from the cap.
 */

export type GeoCategory =
  | "robots"
  | "llms"
  | "schema"
  | "meta"
  | "content"
  | "brand_entity"
  | "signals"
  | "ai_discovery";

export type ScoreBand = "excellent" | "good" | "foundation" | "critical";

/** AI crawlers worth auditing, grouped by what they do with the page. */
export const BOT_TIERS: Record<"training" | "search" | "user", string[]> = {
  training: [
    "GPTBot",
    "ClaudeBot",
    "Google-Extended",
    "Google-CloudVertexBot",
    "Applebot-Extended",
    "cohere-ai",
    "Bytespider",
    "meta-externalagent",
    "PetalBot",
    "AI2Bot",
    "AI2Bot-Dolma",
    "CCBot",
  ],
  search: [
    "OAI-SearchBot",
    "Claude-SearchBot",
    "PerplexityBot",
    "Googlebot",
    "Applebot",
    "Bingbot",
    "DuckAssistBot",
    "YouBot",
    "Amazonbot",
    "xAI-Bot",
  ],
  user: [
    "ChatGPT-User",
    "Claude-User",
    "Perplexity-User",
    "Meta-ExternalFetcher",
    "facebookexternalhit",
  ],
};

export const AI_BOTS: Record<string, string> = {
  GPTBot: "OpenAI (ChatGPT training)",
  "OAI-SearchBot": "OpenAI (ChatGPT search citations)",
  "ChatGPT-User": "OpenAI (ChatGPT on-demand fetch)",
  ClaudeBot: "Anthropic (Claude training)",
  "Claude-SearchBot": "Anthropic (Claude search citations)",
  "Claude-User": "Anthropic (Claude on-demand fetch)",
  PerplexityBot: "Perplexity AI (index builder)",
  "Perplexity-User": "Perplexity (citation fetch on-demand)",
  Googlebot: "Google (Search + AI Overviews)",
  "Google-Extended": "Google (Gemini/Vertex training opt-out — not a crawler)",
  "Google-CloudVertexBot": "Google (Vertex AI)",
  Bingbot: "Microsoft (Bing/Copilot search)",
  "Applebot-Extended": "Apple (AI training)",
  "cohere-ai": "Cohere (language models)",
  DuckAssistBot: "DuckDuckGo AI",
  Bytespider: "ByteDance/TikTok AI",
  "meta-externalagent": "Meta AI (Facebook/Instagram AI)",
  "Meta-ExternalFetcher": "Meta (content fetch on-demand)",
  facebookexternalhit: "Meta (social preview + AI)",
  Amazonbot: "Amazon (Alexa/search AI)",
  AI2Bot: "Allen Institute (AI research)",
  "AI2Bot-Dolma": "Allen Institute (Dolma dataset)",
  "xAI-Bot": "xAI (Grok search citations)",
  Applebot: "Apple (general web crawl + Siri AI)",
  PetalBot: "Huawei (PetalSearch AI, EU/Asia)",
  YouBot: "You.com AI search",
  CCBot: "Common Crawl (used by many AI labs)",
};

/** Search-tier bots that actually drive AI citations — the ones that must be allowed. */
export const CITATION_BOTS = [
  "OAI-SearchBot",
  "Claude-SearchBot",
  "PerplexityBot",
  "Googlebot",
  "Applebot",
];

export const CITATION_BOTS_DISPLAY = CITATION_BOTS.join(", ");
export const KEY_BOTS_DISPLAY = "GPTBot, ClaudeBot, PerplexityBot";

/** Points per check. Category totals must equal CATEGORY_MAX. */
export const WEIGHTS = {
  // robots.txt — 18
  robots_found: 5,
  robots_citation_ok: 13,
  // llms.txt — 18
  llms_found: 5,
  llms_h1: 2,
  llms_blockquote: 1,
  llms_sections: 2,
  llms_links: 2,
  llms_depth: 2,
  llms_depth_high: 2,
  llms_full: 2,
  // Schema JSON-LD — 16
  schema_any_valid: 2,
  schema_richness: 3,
  schema_faq: 3,
  schema_article: 3,
  schema_organization: 3,
  schema_website: 2,
  // Meta tags — 14
  meta_title: 5,
  meta_description: 2,
  meta_canonical: 3,
  meta_og: 4,
  // Content — 12
  content_h1: 2,
  content_numbers: 1,
  content_links: 1,
  content_word_count: 2,
  content_heading_hierarchy: 2,
  content_lists_or_tables: 2,
  content_front_loading: 2,
  // Signals — 6
  signals_lang: 3,
  signals_rss: 2,
  signals_freshness: 1,
  // AI discovery — 6
  ai_discovery_well_known: 2,
  ai_discovery_summary: 2,
  ai_discovery_faq: 1,
  ai_discovery_service: 1,
  // Brand & Entity — 10
  brand_name_coherence: 2,
  brand_desc_coherence: 1,
  brand_kg_readiness: 3,
  brand_about_link: 1,
  brand_contact_info: 1,
  brand_geo_identity: 1,
  brand_topic_authority: 1,
} as const;

export const CATEGORY_MAX: Record<GeoCategory, number> = {
  robots: 18,
  llms: 18,
  schema: 16,
  meta: 14,
  content: 12,
  brand_entity: 10,
  signals: 6,
  ai_discovery: 6,
};

export const CATEGORY_LABEL: Record<GeoCategory, string> = {
  robots: "Robots.txt",
  llms: "llms.txt",
  schema: "Schema JSON-LD",
  meta: "Meta tags",
  content: "Content",
  brand_entity: "Brand & Entity",
  signals: "Signals",
  ai_discovery: "AI discovery",
};

export const SCORE_BANDS: Record<ScoreBand, [number, number]> = {
  excellent: [86, 100],
  good: [68, 85],
  foundation: [36, 67],
  critical: [0, 35],
};

/** Points awarded to robots.txt when AI bots are only allowed through `*`. */
export const ROBOTS_PARTIAL_SCORE = 10;

/** robots.txt larger than the RFC 9309 cap is truncated before parsing. */
export const ROBOTS_MAX_BYTES = 500 * 1024;

export const CONTENT_MIN_WORDS = 300;
export const LLMS_DEPTH_WORDS = 1000;
export const LLMS_DEPTH_HIGH_WORDS = 5000;
export const FRONT_LOADING_MIN_WORDS = 50;

/** Schema richness: average non-generic attributes per JSON-LD object. */
export const SCHEMA_RICHNESS = { low: 3, medium: 4, high: 5 };

export const AI_DISCOVERY = {
  summaryNameMinLen: 3,
  summaryDescriptionMinLen: 20,
  faqQuestionMinLen: 10,
  faqAnswerMinLen: 20,
  serviceNameMinLen: 3,
};

/** Knowledge-graph pillars that disambiguate a brand entity. */
export const KG_PILLAR_DOMAINS = [
  "wikipedia.org",
  "wikidata.org",
  "linkedin.com",
  "crunchbase.com",
];

export const ABOUT_LINK_PATTERNS = [
  "/about",
  "/chi-siamo",
  "/qui-sommes-nous",
  "/uber-uns",
  "/sobre-nosotros",
  "/over-ons",
  "/company",
  "/team",
  "/a-propos",
];

/** Title separators used to read the brand name out of a title or H1. */
export const TITLE_SEPARATORS = [" — ", " – ", " - ", " | ", " · ", " :: "];

/** Legal suffixes stripped before comparing brand names. */
export const BRAND_LEGAL_SUFFIXES = [
  "inc",
  "inc.",
  "llc",
  "ltd",
  "ltd.",
  "limited",
  "corp",
  "corp.",
  "corporation",
  "gmbh",
  "s.a.",
  "s.a.s.",
  "sarl",
  "s.r.l.",
  "srl",
  "s.p.a.",
  "spa",
  "b.v.",
  "bv",
  "nv",
  "ag",
  "oy",
  "ab",
  "pty",
  "pte",
];

export const ARTICLE_TYPES = [
  "Article",
  "BlogPosting",
  "NewsArticle",
  "TechArticle",
  "ScholarlyArticle",
];

export const ORGANIZATION_TYPES = [
  "Organization",
  "LocalBusiness",
  "Corporation",
  "NGO",
  "EducationalOrganization",
  "GovernmentOrganization",
  "OnlineBusiness",
  "SoftwareApplication",
];

/** Required fields per schema type, used for partial credit on incomplete markup. */
export const SCHEMA_REQUIRED: Record<string, string[]> = {
  website: ["url", "name"],
  organization: ["name", "url"],
  faqpage: ["mainEntity"],
  article: ["headline", "author"],
  blogposting: ["headline", "author"],
  newsarticle: ["headline", "author"],
  techarticle: ["headline", "author"],
  scholarlyarticle: ["headline", "author"],
  localbusiness: ["name", "address"],
  webapplication: ["name", "url"],
  product: ["name", "description"],
  person: ["name"],
};

export const USER_AGENT =
  "GTMGrowthGEO/1.0 (+https://github.com/Geoking2104/GTM-Growth)";
