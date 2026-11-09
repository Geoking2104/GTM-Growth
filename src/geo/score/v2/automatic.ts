import type { GeoAuditResult } from "../../types.js";
import { approvedV2Grid } from "./approved-grid.js";
import { calculateV2Coverage } from "./coverage.js";
import type { CoverageObservation, V2CoverageScore } from "./coverage.js";
import { collectSupplementalV2, type V2SupplementalSources } from "./supplemental.js";

/**
 * First HTTP-only GEO v2 collectors. No v1 points are reused. Each measured
 * item is derived from an explicit v2 predicate over the observed response.
 * Unimplemented/inconclusive controls stay unknown, including all rendering.
 */
export interface V2HttpExtras extends V2SupplementalSources {}

export async function collectAutomaticV2(
  audit: GeoAuditResult,
  renderFindings: readonly CoverageObservation[] = [],
  extras: V2HttpExtras = {},
): Promise<V2CoverageScore> {
  const grid = approvedV2Grid();
  const origin = new URL(audit.finalUrl).origin;
  const pageUrl = audit.finalUrl;
  const robotsUrl = new URL("/robots.txt", origin).href;
  const llmsUrl = new URL("/llms.txt", origin).href;
  const values: CoverageObservation[] = [];
  const measured = (id: string, pass: boolean, evidence: string, url: string): void => {
    const control = grid.controls.find(item => item.id === id);
    if (!control) throw new Error(`Unknown v2 collector ID ${id}`);
    values.push({
      controlId: id,
      status: "measured",
      earned: pass ? control.maxPoints : 0,
      proof: { type: "extract", value: evidence, url },
    });
  };
  const unknown = (id: string, reason: string): void => {
    values.push({ controlId: id, status: "unknown", reason });
  };
  const { robots, llms, schema, meta, content, brand_entity: brand, ai_discovery: discovery } = audit.details;

  // A missing resource is a verified failure only when the response status
  // is known. Timeouts/network failures (status 0) remain unknown.
  if (robots.status > 0) {
    measured("R01", robots.found, `robots.txt HTTP ${robots.status}`, robotsUrl);
    if (robots.found) {
      measured("R02", robots.citationBotsOk,
        `AI search bots allowed: ${robots.botsAllowed.join(", ") || "none"}; blocked: ${robots.botsBlocked.join(", ") || "none"}`, robotsUrl);
    } else {
      unknown("R02", "Effective crawler rules cannot be evaluated from absent robots.txt");
    }
  } else {
    unknown("R01", "robots.txt fetch failed without a verified HTTP response");
    unknown("R02", "Crawler rules were not observed");
  }

  if (robots.status > 0) {
    if (!robots.found || robots.sitemaps.length === 0) {
      measured("R04", false, "No Sitemap directive in reachable robots.txt", robotsUrl);
    } else if (extras.sitemap) {
      const declared = robots.sitemaps.some(entry => {
        try { return new URL(entry, origin).href === new URL(extras.sitemap!.url).href; }
        catch { return false; }
      });
      measured("R04", declared && extras.sitemap.valid,
        `Declared sitemaps: ${robots.sitemaps.join(", ")}; fetched ${extras.sitemap.url}; XML valid: ${extras.sitemap.valid}`,
        extras.sitemap.url);
    } else {
      unknown("R04", "Sitemap declared, but its HTTP/XML content was not verified");
    }
  } else {
    unknown("R04", "Cannot verify sitemap declaration without robots response");
  }

  const discoveryStatuses = Object.values(discovery.endpointStatus);
  if (discoveryStatuses.every(status => status > 0)) {
    measured("D01", discovery.hasWellKnownAi && discovery.summaryValid,
      `Discovery HTTP: ${JSON.stringify(discovery.endpointStatus)}; well-known: ${discovery.hasWellKnownAi}; summary valid: ${discovery.summaryValid}`,
      new URL("/.well-known/ai.txt", origin).href);
  } else {
    unknown("D01", "One or more AI discovery endpoints returned no verified HTTP status");
  }

  if (llms.status > 0) {
    measured("L01", llms.found, `llms.txt HTTP ${llms.status}; ${llms.wordCount} words`, llmsUrl);
    if (llms.found) {
      measured("L05", llms.wordCount > 1000,
        `llms.txt word count ${llms.wordCount}; required >1000`, llmsUrl);
      measured("L06", llms.wordCount > 1000 && llms.hasSections && llms.hasLinks,
        `Word count ${llms.wordCount}; sections ${llms.sectionsCount}; links ${llms.linksCount}`, llmsUrl);
    } else {
      unknown("L05", "Depth cannot be assessed from absent llms.txt");
      unknown("L06", "Deep-documentation structure cannot be assessed from absent llms.txt");
    }
  } else {
    unknown("L01", "llms.txt fetch did not provide a verified HTTP response");
    unknown("L05", "llms.txt depth not observed");
    unknown("L06", "llms.txt structure not observed");
  }

  if (audit.httpStatus === 200 || audit.httpStatus === 203) {
    measured("J01", schema.scriptCount > 0 && schema.parseErrors === 0 && schema.objects.length > 0,
      `JSON-LD scripts ${schema.scriptCount}; parse errors ${schema.parseErrors}; objects ${schema.objects.length}`, pageUrl);
    measured("J02", schema.hasOrganization,
      `JSON-LD types: ${schema.foundTypes.join(", ") || "none"}`, pageUrl);
    if (schema.objects.length > 0) {
      measured("J06", schema.visibleMatch,
        `Structured name/headline matches visible copy: ${schema.visibleMatch}`, pageUrl);
    } else {
      unknown("J06", "No valid structured entity fields to compare against visible copy");
    }
    measured("M01", Boolean(meta.title?.trim()),
      `HTML title: ${meta.title || "(absent)"}`, pageUrl);
    measured("M02", Boolean(meta.description?.trim()),
      `Meta description: ${meta.description || "(absent)"}`, pageUrl);
    let canonicalMatches = false;
    if (meta.canonical) {
      try {
        const canonical = new URL(meta.canonical, pageUrl);
        const target = new URL(pageUrl);
        canonical.hash = "";
        target.hash = "";
        canonicalMatches = canonical.href.replace(/\/$/, "") === target.href.replace(/\/$/, "");
      } catch { /* invalid canonical fails this measured check */ }
    }
    measured("M03", canonicalMatches,
      `Canonical: ${meta.canonical || "(absent)"}; audited URL: ${pageUrl}`, pageUrl);
    measured("M04", meta.hasOgTitle && meta.hasOgDescription && meta.hasOgImage,
      `og:title=${meta.hasOgTitle}; og:description=${meta.hasOgDescription}; og:image=${meta.hasOgImage}`, pageUrl);
    measured("C03", Boolean(content.h1) && content.hasHeadingHierarchy,
      `H1: ${content.h1 || "(absent)"}; hierarchy valid: ${content.hasHeadingHierarchy}`, pageUrl);
    if (brand.primaryName) {
      measured("B01", brand.brandNameConsistent,
        `Brand identity: ${brand.primaryName}; consistent: ${brand.brandNameConsistent}`, pageUrl);
    } else {
      unknown("B01", "A primary brand identity was not established");
    }
    measured("B02", brand.hasContactInfo && brand.hasAboutLink,
      `About link: ${brand.hasAboutLink}; contact information: ${brand.hasContactInfo}`, pageUrl);
  } else {
    for (const id of ["J01", "J02", "J06", "M01", "M02", "M03", "M04", "C03", "B01", "B02"]) {
      unknown(id, "Page HTML was not successfully fetched");
    }
  }

  for (const finding of collectSupplementalV2(audit, extras)) {
    if (values.some(item => item.controlId === finding.controlId)) {
      throw new Error(`Duplicate HTTP v2 observation: ${finding.controlId}`);
    }
    values.push(finding);
  }

  for (const finding of renderFindings) {
    if (!["P01", "P02", "P03", "P04"].includes(finding.controlId)) {
      throw new Error(`Unexpected rendering evidence control: ${finding.controlId}`);
    }
    if (values.some(item => item.controlId === finding.controlId)) {
      throw new Error(`Duplicate rendering observation: ${finding.controlId}`);
    }
    values.push(finding);
  }

  // Rendering observations may only be supplied by a verified Playwright
  // snapshot/replay; do not award them from a raw HTTP fetch.
  const renderingMissing: Record<string, string> = {
    P01: "Requires initial-HTML versus verified Playwright snapshot evidence",
    P02: "Requires semantic HTML/DOM comparison from the same verified render snapshot",
    P03: "Requires isolated crawler-identity network/render logs on a verified domain",
    P04: "Requires bounded real-browser timing and error logs on a verified domain",
  };
  for (const control of grid.controls) {
    if (!values.some(item => item.controlId === control.id)) {
      unknown(control.id, renderingMissing[control.id] ?? "Collector or sufficient independent evidence not yet available");
    }
  }

  return calculateV2Coverage(grid, {
    finalUrl: audit.finalUrl,
    httpStatus: audit.httpStatus,
    details: audit.details,
  }, values, Boolean(audit.error) || (audit.httpStatus !== 200 && audit.httpStatus !== 203));
}
