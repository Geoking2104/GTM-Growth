import { CITATION_BOTS } from "../../config.js";
import { HtmlDoc, type HtmlNode } from "../../html.js";
import { analyzeSocialLinks } from "../../social-links.js";
import { isSitemapIndex, parseSitemap } from "../../sitemap.js";
import type { GeoAuditResult } from "../../types.js";
import { GEO_V2_CONTROLS } from "./approved-grid.js";
import type { CoverageObservation } from "./coverage.js";

/** Existing, already fetched evidence only. Never fetch an arbitrary link here. */
export interface V2SupplementalSources {
  pageHtml?: string;
  sitemap?: { url: string; valid: boolean; xml?: string };
  /** Must be configured by the verified domain owner on the trusted server side. */
  ownerImportantUrls?: readonly string[];
}

type RuleGroup = { allow: string[]; disallow: string[] };
type RuleSet = Record<string, RuleGroup>;
const truncate = (value: string, max = 220): string => value.replace(/\s+/g, " ").trim().slice(0, max);
const hasType = (node: Record<string, unknown>, type: string): boolean =>
  node["@type"] === type || (Array.isArray(node["@type"]) && node["@type"].includes(type));

function normalizedUrl(value: string, base: string, stripHash = true): string | null {
  try {
    const url = new URL(value, base);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    if (stripHash) url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** A conservative prefix-only subset. Wildcards/end anchors require a full rules engine. */
function allowedFor(bot: string, groups: RuleSet, path: string): boolean | null {
  const key = Object.keys(groups).find(name => name.toLowerCase() === bot.toLowerCase());
  const rules = groups[key ?? "*"];
  if (!rules) return true; // RFC 9309: no matching rules means no restriction.
  let longest = -1;
  let allowed = true;
  for (const [allow, patterns] of [[false, rules.disallow], [true, rules.allow]] as const) {
    for (const pattern of patterns) {
      if (!pattern) continue;
      if (!pattern.startsWith("/") || /[*$]/.test(pattern)) return null;
      if (path.startsWith(pattern) && (pattern.length > longest || (allow && pattern.length === longest))) {
        longest = pattern.length;
        allowed = allow;
      }
    }
  }
  return allowed;
}

function contentAnchor(node: HtmlNode): boolean {
  let parent = node.parent;
  while (parent) {
    if (["nav", "header", "footer"].includes(parent.tag)) return false;
    if (["p", "li", "article", "main"].includes(parent.tag)) return true;
    parent = parent.parent;
  }
  return false;
}

function outsideNavigation(node: HtmlNode): boolean {
  let parent = node.parent;
  while (parent) {
    if (["nav", "header", "footer"].includes(parent.tag)) return false;
    parent = parent.parent;
  }
  return true;
}

function visibleDate(value: string): string | null {
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? new Date(millis).toISOString().slice(0, 10) : null;
}

/**
 * Complete the remaining non-rendering GEO v2 evidence contracts.
 * Unknown is deliberate when identity, reachability or semantics cannot be
 * established from the single already-fetched audit snapshot.
 */
export function collectSupplementalV2(
  audit: GeoAuditResult,
  sources: V2SupplementalSources = {},
): CoverageObservation[] {
  const out: CoverageObservation[] = [];
  const maxById = new Map(GEO_V2_CONTROLS.map(control => [control.id, control.maxPoints]));
  const pageUrl = audit.finalUrl;
  const origin = new URL(pageUrl).origin;
  const isPage = audit.httpStatus === 200 || audit.httpStatus === 203;
  const doc = isPage && typeof sources.pageHtml === "string" ? HtmlDoc.parse(sources.pageHtml) : null;
  const { robots, llms, schema, meta, ai_discovery: discovery } = audit.details;
  const observe = (id: string, pass: boolean, proof: string, url = pageUrl): void => {
    out.push({ controlId: id, status: "measured", earned: pass ? maxById.get(id)! : 0,
      proof: { type: "extract", value: truncate(proof, 700), url } });
  };
  const unknown = (id: string, reason: string): void => { out.push({ controlId: id, status: "unknown", reason }); };

  // robots.txt + actual page directives: no route-level block is inferred from a root-only status.
  if (!isPage || robots.status === 0 || !robots.found) {
    unknown("R03", "Audited HTML and a parseable robots.txt are both required");
    unknown("R05", "Specific and fallback bot rules were not both observable");
  } else {
    const audited = new URL(pageUrl);
    const path = audited.pathname + audited.search;
    const decisions = CITATION_BOTS.map(bot => [bot, allowedFor(bot, robots.groups, path)] as const);
    const noindex = /(?:^|[,\s])(?:noindex|none)(?:$|[,\s])/i.test(meta.robotsMeta ?? "") || meta.xRobotsNoindex;
    const scopedHeader = /(?:^|,)\s*[a-z0-9_-]+\s*:\s*(?:noindex|index|none)/i.test(meta.xRobotsTag ?? "");
    if (scopedHeader || decisions.some(([, allowed]) => allowed === null)) {
      unknown("R03", "Robots wildcard/end-anchor or crawler-scoped header requires more specific path/agent evaluation");
    } else {
      observe("R03", !noindex && decisions.every(([, allowed]) => allowed),
        `Path ${path}; bot access ${JSON.stringify(decisions)}; meta=${meta.robotsMeta ?? "default"}; X-Robots-Tag=${meta.xRobotsTag ?? "default"}`,
        new URL("/robots.txt", origin).href);
    }
    const wildcard = robots.groups["*"];
    const fallback = wildcard ? allowedFor("*", { "*": wildcard }, path) : true;
    const specific = decisions.filter(([bot]) => Object.keys(robots.groups).some(key => key.toLowerCase() === bot.toLowerCase()));
    if (fallback === null || specific.some(([, allowed]) => allowed === null)) {
      unknown("R05", "Specific/fallback rules use patterns requiring a fully qualified matcher");
    } else {
      observe("R05", specific.every(([, allowed]) => allowed === fallback),
        `Path ${path}; wildcard=${fallback}; specific=${JSON.stringify(specific)}; unspecified bots inherit fallback`,
        new URL("/robots.txt", origin).href);
    }
  }

  if (llms.status === 200 && llms.found) {
    const heading = llms.siteHeading ?? "";
    const summary = llms.summary ?? "";
    observe("L02", heading.length >= 3 && summary.length >= 20,
      `# ${truncate(heading, 120)}; identity: ${truncate(summary)}`, new URL("/llms.txt", origin).href);
    observe("L03", summary.length >= 20 && summary.length <= 500 && summary.split(/\s+/).length >= 4,
      `LLM summary (${summary.length} chars): ${truncate(summary)}`, new URL("/llms.txt", origin).href);
    if (typeof llms.validLinkCount === "number" && typeof llms.invalidLinkCount === "number") {
      observe("L04", llms.hasSections && llms.validLinkCount > 0 && llms.invalidLinkCount === 0,
        `Sections=${llms.sectionsCount}; valid links=${llms.validLinkCount}; invalid links=${llms.invalidLinkCount}; samples=${JSON.stringify(llms.linkSamples)}`,
        new URL("/llms.txt", origin).href);
    } else unknown("L04", "Full Markdown link parse results are not present in the llms.txt snapshot");
  } else {
    for (const id of ["L02", "L03", "L04"]) unknown(id, "No successfully read llms.txt document to inspect");
  }

  if (isPage) {
    const pairs = schema.objects.filter(node => typeof node["@id"] === "string" && typeof node.url === "string");
    const resolved = pairs.map(node => ({ id: normalizedUrl(node["@id"] as string, pageUrl),
      url: normalizedUrl(node.url as string, pageUrl) }));
    const uniqueIds = new Map<string, string>();
    let coherent = resolved.length > 0;
    for (const pair of resolved) {
      if (!pair.id || !pair.url || pair.id !== pair.url ||
          (uniqueIds.has(pair.id) && uniqueIds.get(pair.id) !== pair.url)) coherent = false;
      if (pair.id && pair.url) uniqueIds.set(pair.id, pair.url);
    }
    observe("J03", coherent, `JSON-LD @id/url pairs ${JSON.stringify(resolved.slice(0, 6))}`);

    const sites = schema.objects.filter(node => hasType(node, "WebSite"));
    const pages = schema.objects.filter(node => hasType(node, "WebPage"));
    const siteIds = new Set(sites.flatMap(node => [node["@id"], node.url])
      .filter((value): value is string => typeof value === "string")
      .map(value => normalizedUrl(value, pageUrl)).filter((value): value is string => value !== null));
    const linkedPages = pages.filter(node => {
      const parent = node.isPartOf;
      const ref = typeof parent === "string" ? parent : parent && typeof parent === "object"
        ? ((parent as Record<string, unknown>)["@id"] ?? (parent as Record<string, unknown>).url) : null;
      return typeof ref === "string" && siteIds.has(normalizedUrl(ref, pageUrl) ?? "") &&
        typeof node.url === "string" && normalizedUrl(node.url, pageUrl) === normalizedUrl(pageUrl, pageUrl);
    });
    observe("J04", sites.length > 0 && linkedPages.length > 0,
      `WebSite=${sites.length}; WebPage=${pages.length}; isPartOf links=${linkedPages.length}`);

    const pathname = new URL(pageUrl).pathname;
    const pageType = pathname === "/" || pathname === "/index.html" ? "homepage"
      : doc?.first("article") ? "article"
      : /\/(faq|faqs|questions)\/?$/i.test(pathname) ? "faq"
      : /\/(product|products)\//i.test(pathname) ? "product" : null;
    if (!pageType) unknown("J05", "No page type could be classified deterministically from the URL and HTML");
    else {
      const pass = pageType === "homepage" ? schema.hasWebsite && schema.hasOrganization
        : pageType === "article" ? schema.hasArticle
        : pageType === "faq" ? schema.hasFaq : schema.hasProduct;
      observe("J05", pass, `Page type=${pageType}; schema types=${schema.foundTypes.join(", ") || "none"}`);
    }

    const robotsMeta = (meta.robotsMeta ?? "").toLowerCase();
    const xRobots = (meta.xRobotsTag ?? "").toLowerCase();
    const token = (text: string, word: string): boolean => new RegExp(`(?:^|[,\\s])${word}(?:$|[,\\s])`).test(text);
    const metaNoindex = token(robotsMeta, "noindex") || token(robotsMeta, "none");
    const xNoindex = token(xRobots, "noindex") || token(xRobots, "none");
    const scopedHeader = /(?:^|,)\s*[a-z0-9_-]+\s*:\s*(?:noindex|index|none)/.test(xRobots);
    const contradicts = (metaNoindex && token(xRobots, "index")) || (xNoindex && token(robotsMeta, "index"));
    if (scopedHeader) unknown("M05", "Crawler-scoped X-Robots-Tag cannot be compared to a global indexing policy");
    else if (contradicts) observe("M05", false, `Conflicting indexing directives: meta=${robotsMeta}; header=${xRobots}`);
    else if (metaNoindex || xNoindex) {
      unknown("M05", "Indexing is restricted or crawler-scoped; owner's intended indexing policy is unverified");
    } else observe("M05", true, `No conflicting indexing directives: meta=${robotsMeta || "default"}; header=${xRobots || "default"}`);
  } else {
    for (const id of ["J03", "J04", "J05", "M05"]) unknown(id, "Successful HTML response required");
  }

  if (!doc) {
    for (const id of ["C01", "C02", "C06", "C07", "C08", "B03", "B05", "D03"])
      unknown(id, "Already-fetched raw HTML was not supplied to the v2 collector");
  } else {
    const paragraphs = doc.all("p").filter(outsideNavigation).map(node => doc.textOf(node))
      .filter(text => text.length >= 45);
    const h1 = doc.first("h1");
    const heading = h1 ? doc.textOf(h1) : "";
    observe("C01", heading.length >= 5 && paragraphs.length > 0,
      `H1: ${truncate(heading, 120)}; introduction: ${truncate(paragraphs[0] ?? "(absent)")}`);

    const questions = schema.objects.filter(node => hasType(node, "FAQPage"))
      .flatMap(node => Array.isArray(node.mainEntity) ? node.mainEntity as Record<string, unknown>[] : []);
    if (!questions.length) unknown("C02", "No declared question intents or linked answer corpus were supplied");
    else {
      const visible = doc.bodyText().replace(/\s+/g, " ").toLowerCase();
      const valid = questions.filter(question => {
        const answer = question.acceptedAnswer;
        const answerText = answer && typeof answer === "object" ? (answer as Record<string, unknown>).text : null;
        return typeof question.name === "string" && question.name.length >= 10 &&
          typeof answerText === "string" && answerText.length >= 25 &&
          visible.includes(question.name.toLowerCase()) && visible.includes(answerText.toLowerCase());
      });
      observe("C02", valid.length > 0 && valid.length === questions.length,
        `Declared FAQ Q/A=${questions.length}; visible matched passages=${valid.length}; example=${truncate(String(questions[0]?.name ?? ""))}`);
    }

    const listEntries = [...doc.all("li"), ...doc.all("tr")].map(node => doc.textOf(node))
      .filter(text => text.length >= 18);
    observe("C06", paragraphs.length > 0 && listEntries.length > 0,
      `Paragraph: ${truncate(paragraphs[0] ?? "(absent)")}; list/table: ${truncate(listEntries[0] ?? "(absent)")}`);

    const dateModified = schema.objects.filter(node => ["WebPage", "Article", "BlogPosting", "NewsArticle"]
      .some(type => hasType(node, type))).map(node => node.dateModified)
      .find((value): value is string => typeof value === "string" && Boolean(visibleDate(value)));
    const datedText = doc.all("time").filter(node =>
      node.attrs.itemprop?.toLowerCase() === "datemodified" ||
      /(?:updated|modified|last revised|mis à jour|modifi[ée]|actualis[ée])/i.test(doc.textOf(node)))
      .map(node => node.attrs.datetime || doc.textOf(node))
      .map(visibleDate).find((value): value is string => Boolean(value));
    if (!dateModified && !datedText) observe("C07", false, "No visible <time> date or JSON-LD dateModified");
    else observe("C07", Boolean(dateModified && datedText && visibleDate(dateModified) === datedText),
      `JSON-LD dateModified=${dateModified ?? "absent"}; visible <time> date=${datedText ?? "absent"}`);

    const internalLinks = doc.all("a").filter(contentAnchor).flatMap(node => {
      const href = node.attrs.href?.trim() ?? "";
      if (!href || href.startsWith("#") || href.startsWith("?")) return [];
      const url = normalizedUrl(href, pageUrl);
      const anchor = doc.textOf(node);
      if (!url || url === normalizedUrl(pageUrl, pageUrl) ||
          new URL(url).hostname !== new URL(pageUrl).hostname ||
          anchor.length < 8 || /^(?:read more|click here|learn more|en savoir plus|voir plus)$/i.test(anchor)) return [];
      return [{ url, anchor: truncate(anchor, 80) }];
    });
    const distinctLinks = [...new Map(internalLinks.map(link => [link.url, link])).values()];
    observe("C08", distinctLinks.length >= 2,
      `Contextual internal links ${distinctLinks.length}: ${JSON.stringify(distinctLinks.slice(0, 4))}`);

    const social = analyzeSocialLinks(pageUrl, sources.pageHtml!);
    const mismatched = new Set(social.outboundProfiles.map(profile => profile.platform)).size !== social.outboundProfiles.length;
    observe("B03", social.outboundProfiles.length > 0 && !mismatched &&
      social.outboundProfiles.every(profile => profile.sources.includes("anchor") && profile.sources.includes("schema_sameAs")),
      `Social outbound links: ${JSON.stringify(social.outboundProfiles.map(item => ({ platform: item.platform, url: item.url, sources: item.sources })))}`);

    const articles = schema.objects.filter(node => ["Article", "BlogPosting", "NewsArticle"].some(type => hasType(node, type)));
    if (!articles.length) unknown("B05", "No editorial article or verified expertise declaration is in the audited page snapshot");
    else {
      const persons = schema.objects.filter(node => hasType(node, "Person"));
      const authorNames = articles.flatMap(node => {
        const authors = Array.isArray(node.author) ? node.author : [node.author];
        return authors.map(author => typeof author === "string" ? author : author && typeof author === "object"
          ? (author as Record<string, unknown>).name : null).filter((value): value is string => typeof value === "string");
      });
      const visible = doc.bodyText().toLowerCase();
      const expert = persons.some(person => typeof person.name === "string" && authorNames.includes(person.name) &&
        [person.knowsAbout, person.jobTitle, person.description].some(value => typeof value === "string" && value.trim().length >= 8) &&
        visible.includes(person.name.toLowerCase()));
      observe("B05", expert, `Attributed authors=${JSON.stringify(authorNames.slice(0, 4))}; visible expert Person declaration=${expert}`);
    }

    const docsEndpoints = [
      { path: "/ai/faq.json", status: discovery.endpointStatus.faq, good: discovery.hasFaq && discovery.faqCount > 0 },
      { path: "/ai/service.json", status: discovery.endpointStatus.service, good: discovery.hasService },
    ];
    const links = doc.all("a").map(node => normalizedUrl(node.attrs.href || "", pageUrl));
    const verified = docsEndpoints.filter(endpoint => endpoint.status === 200 && endpoint.good &&
      links.includes(normalizedUrl(endpoint.path, origin)));
    if (verified.length) observe("D03", true,
      `Navigable validated entrypoints: ${verified.map(item => item.path).join(", ")}`);
    else unknown("D03", "No crosslinked documentation entrypoint has a verified successful response");
  }

  if (!sources.ownerImportantUrls?.length) unknown("D02", "Verified domain owner has not declared the important URL set");
  else if (!sources.sitemap?.valid || !sources.sitemap.xml || isSitemapIndex(sources.sitemap.xml))
    unknown("D02", "A parsed page sitemap, not merely an index, is required to compare owner-declared URLs");
  else {
    const candidates = sources.ownerImportantUrls.slice(0, 100).map(url => normalizedUrl(url, origin));
    if (candidates.some(url => !url || new URL(url).origin !== origin) ||
        sources.ownerImportantUrls.length > 100) {
      unknown("D02", "Owner important URLs must be at most 100 valid same-origin absolute/relative web URLs");
    } else {
      const mapped = new Set(parseSitemap(sources.sitemap.xml).map(item => normalizedUrl(item.url, origin)));
      const missing = candidates.filter(url => !mapped.has(url));
      observe("D02", missing.length === 0,
        `Owner important URLs=${candidates.length}; missing=${JSON.stringify(missing.slice(0, 8))}`,
        sources.sitemap.url);
    }
  }

  // Semantic claims and independent sources need *real* proof, not plausible HTML.
  unknown("C04", "No independently checkable claim-to-source evidence was collected");
  unknown("C05", "Relevance and reachability of external references were not independently verified");
  unknown("B04", "Independent backlinks/mentions cannot be inferred from sameAs or outbound social links");
  return out;
}
