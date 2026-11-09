import { CATEGORY_WEIGHTS, GRID_VERSION, validateGrid } from "./rubric.js";
import type { ControlDefinition, ScoreGrid, V2Category, V2Profile } from "./rubric.js";

/**
 * Owner-approved GEO v2 control allocations (42 controls / 100 points).
 * Control definitions and measurement contracts are versioned with the grid.
 * A measurement is not a proof until an instrument actually supplies it.
 */
type Row = readonly [id: string, title: string, points: number,
  method: string, expectedProof: string, threshold: number, fixType: string,
  effort: "S" | "M" | "L"];
const ROWS: Record<V2Category, readonly Row[]> = {
  "robots": [
    ["R01","robots.txt accessible",3,"GET /robots.txt; HTTP 200 and parsable directives","robots.txt response",1,"robots","S"],
    ["R02","AI search crawlers permitted",4,"Resolve effective User-agent rules for citation bots","effective rules per crawler",1,"robots","M"],
    ["R03","No contradictory blocking of audited URL",3,"Compare robots rules and X-Robots-Tag/meta directives","page and robots directives",1,"robots","M"],
    ["R04","Declared accessible sitemap",2,"Parse Sitemap directives and confirm HTTP/XML","sitemap HTTP/XML evidence",1,"robots","S"],
    ["R05","Generic and specific bot rule consistency",2,"Compare fallback * rules to specific citation bots","normalized rule comparison",1,"robots","M"],
  ],
  "llms": [
    ["L01","llms.txt accessible",3,"GET /llms.txt; HTTP 200 and valid text","llms.txt response",1,"llms","S"],
    ["L02","Site and activity identification",2,"Extract site H1 and identity statement","llms heading and excerpt",1,"llms","S"],
    ["L03","Concise LLM-readable summary",2,"Extract summary from llms.txt and validate nonempty prose","summary excerpt",1,"llms","S"],
    ["L04","Markdown structure and valid document links",3,"Parse sections and validate absolute/relative links","section/link samples",1,"llms","M"],
    ["L05","Documentation depth > 1000 words",2,"Count words in llms.txt; strict greater-than threshold","word count and file hash",1,"llms","M"],
    ["L06","Deep documentation structure > 1000 words",2,"Require >1000 words in llms.txt plus structured deep documentation","word count and depth/sections",1,"llms","M"],
  ],
  "jsonld": [
    ["J01","Parseable JSON-LD",3,"Parse script[type=application/ld+json] without errors","script parse result",1,"jsonld","S"],
    ["J02","Organization or relevant business entity",2,"Inspect @type against permitted business types","JSON-LD @type and identifier",1,"jsonld","S"],
    ["J03","Entity identifiers coherent",3,"Compare @id, url and identifiers across JSON-LD objects","entity graph excerpt",1,"jsonld","M"],
    ["J04","WebSite and page relationships",2,"Validate WebSite/WebPage isPartOf and URL links","JSON-LD relationship excerpt",1,"jsonld","M"],
    ["J05","Content-appropriate structured data",2,"Choose and validate schema relevant to detected page type","page type and matching schema",1,"jsonld","M"],
    ["J06","Visible content agrees with structured data",2,"Compare name, description and headline to rendered/document content","field-level comparison",1,"jsonld","M"],
  ],
  "meta": [
    ["M01","Descriptive title",3,"Read title; nonempty and coherent with page intent","title string",1,"meta","S"],
    ["M02","Useful meta description",2,"Read meta description and verify nonempty description","description string",1,"meta","S"],
    ["M03","Consistent canonical URL",2,"Normalize rel=canonical against audited URL","canonical URL",1,"meta","S"],
    ["M04","Open Graph sharing metadata",2,"Inspect og:title, og:description and og:image","Open Graph field list",1,"meta","S"],
    ["M05","Consistent indexing directives",1,"Compare robots meta and X-Robots-Tag to desired indexing","indexing directives",1,"meta","S"],
  ],
  "content": [
    ["C01","Identifiable value proposition",3,"Extract prominent heading and leading explanatory text","H1 and introductory excerpt",1,"content","M"],
    ["C02","Direct answers to user questions",3,"Extract answer passages for declared question intents","answer passage excerpt",1,"content","L"],
    ["C03","Extractable heading hierarchy",2,"Parse H1-H6 sequence and semantic grouping","heading structure",1,"content","S"],
    ["C04","Verifiable factual statements",2,"Identify attributed factual claims with checkable sources","claim and referenced evidence",1,"content","L"],
    ["C05","Relevant sources and references",2,"Validate source links and their contextual anchors","references and anchors",1,"content","M"],
    ["C06","Machine-extractable passages",2,"Parse structured lists/tables and self-contained paragraphs","extractable passage",1,"content","M"],
    ["C07","Reliable freshness evidence",2,"Compare visible updated date and structured modified date","dated source excerpt",1,"content","M"],
    ["C08","Contextual internal linking",2,"Analyze internal links and topic-related anchors","internal link sample",1,"content","M"],
  ],
  "brand": [
    ["B01","Consistent brand identity",3,"Compare names across title, HTML and organization schema","normalized brand values",1,"brand","M"],
    ["B02","Organization and contact details",2,"Inspect contact/about metadata and organization data","contact proof excerpt",1,"brand","S"],
    ["B03","Coherent declared social profiles",2,"Compare outbound social links and sameAs; do not assume backlinks","social URLs with source labels",1,"brand","M"],
    ["B04","Externally verified entity references",2,"Check externally sourced attribution, never infer from self-links","independent external reference URL",1,"brand","L"],
    ["B05","Expertise and authority signals",1,"Validate authorship and attributable expertise declarations","author/entity proof",1,"brand","M"],
  ],
  "discovery": [
    ["D01","Accessible AI discovery resources",3,"Probe documented AI discovery endpoints and validate content","endpoint status and extract",1,"discovery","M"],
    ["D02","Important pages represented in sitemap",3,"Compare declared key URLs to sitemap coverage","sitemap XML and URL comparison",1,"discovery","M"],
    ["D03","Discoverable documentation entrypoints",2,"Verify navigable docs/FAQ/service routes and crosslinks","entrypoint URL and response",1,"discovery","M"],
  ],
  "rendering": [
    ["P01","Essential content in initial HTML",4,"Compare primary content of raw HTTP HTML to rendered page","HTML and DOM excerpt pair",1,"rendering","L"],
    ["P02","Raw HTML and rendered DOM agree",3,"Diff semantic content and structured data after Playwright rendering","bounded HTML/DOM diff",1,"rendering","L"],
    ["P03","Crawler can access rendered content",3,"Run isolated crawler-identity load with controlled network policy","HTTP/network/render logs",1,"rendering","L"],
    ["P04","Stable render without blockers",2,"Check deterministic timeout, console errors and content availability","timing and error log",1,"rendering","M"],
  ],
};

export const GEO_V2_CONTROLS: readonly ControlDefinition[] = Object.freeze(
  (Object.entries(ROWS) as Array<[V2Category, readonly Row[]]>).flatMap(([category, rows]) =>
    rows.map(([id, title, maxPoints, measurementMethod, expectedProof, successThreshold, fixType, effort]) => ({
      id, category, title,
      definition: title + ". " + measurementMethod,
      measurementMethod, expectedProof, maxPoints,
      successThreshold, fixType, effort,
    }))
  )
);

export function approvedV2Grid(profile: V2Profile = "general"): ScoreGrid {
  const grid: ScoreGrid = {
    version: GRID_VERSION,
    profile,
    categoryWeights: CATEGORY_WEIGHTS,
    controls: GEO_V2_CONTROLS,
  };
  validateGrid(grid);
  if (grid.controls.length !== 42) throw new Error("GEO v2 requires exactly 42 approved controls");
  return grid;
}
