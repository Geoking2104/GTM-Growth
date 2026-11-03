var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/geo/config.ts
var AI_BOTS = {
  GPTBot: "OpenAI (ChatGPT training)",
  "OAI-SearchBot": "OpenAI (ChatGPT search citations)",
  "ChatGPT-User": "OpenAI (ChatGPT on-demand fetch)",
  ClaudeBot: "Anthropic (Claude training)",
  "Claude-SearchBot": "Anthropic (Claude search citations)",
  "Claude-User": "Anthropic (Claude on-demand fetch)",
  PerplexityBot: "Perplexity AI (index builder)",
  "Perplexity-User": "Perplexity (citation fetch on-demand)",
  Googlebot: "Google (Search + AI Overviews)",
  "Google-Extended": "Google (Gemini/Vertex training opt-out \u2014 not a crawler)",
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
  CCBot: "Common Crawl (used by many AI labs)"
};
var CITATION_BOTS = [
  "OAI-SearchBot",
  "Claude-SearchBot",
  "PerplexityBot",
  "Googlebot",
  "Applebot"
];
var CITATION_BOTS_DISPLAY = CITATION_BOTS.join(", ");
var WEIGHTS = {
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
  brand_topic_authority: 1
};
var CATEGORY_MAX = {
  robots: 18,
  llms: 18,
  schema: 16,
  meta: 14,
  content: 12,
  brand_entity: 10,
  signals: 6,
  ai_discovery: 6
};
var SCORE_BANDS = {
  excellent: [86, 100],
  good: [68, 85],
  foundation: [36, 67],
  critical: [0, 35]
};
var ROBOTS_PARTIAL_SCORE = 10;
var ROBOTS_MAX_BYTES = 500 * 1024;
var CONTENT_MIN_WORDS = 300;
var LLMS_DEPTH_WORDS = 1e3;
var LLMS_DEPTH_HIGH_WORDS = 5e3;
var FRONT_LOADING_MIN_WORDS = 50;
var SCHEMA_RICHNESS = { low: 3, medium: 4, high: 5 };
var AI_DISCOVERY = {
  summaryNameMinLen: 3,
  summaryDescriptionMinLen: 20,
  faqQuestionMinLen: 10,
  faqAnswerMinLen: 20,
  serviceNameMinLen: 3
};
var KG_PILLAR_DOMAINS = [
  "wikipedia.org",
  "wikidata.org",
  "linkedin.com",
  "crunchbase.com"
];
var ABOUT_LINK_PATTERNS = [
  "/about",
  "/chi-siamo",
  "/qui-sommes-nous",
  "/uber-uns",
  "/sobre-nosotros",
  "/over-ons",
  "/company",
  "/team",
  "/a-propos"
];
var TITLE_SEPARATORS = [" \u2014 ", " \u2013 ", " - ", " | ", " \xB7 ", " :: "];
var BRAND_LEGAL_SUFFIXES = [
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
  "pte"
];
var ARTICLE_TYPES = [
  "Article",
  "BlogPosting",
  "NewsArticle",
  "TechArticle",
  "ScholarlyArticle"
];
var ORGANIZATION_TYPES = [
  "Organization",
  "LocalBusiness",
  "Corporation",
  "NGO",
  "EducationalOrganization",
  "GovernmentOrganization",
  "OnlineBusiness",
  "SoftwareApplication"
];
var SCHEMA_REQUIRED = {
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
  person: ["name"]
};
var USER_AGENT = "GoogleGrowthGEO/1.0 (+https://github.com/Geoking2104/Google-Growth)";

// src/geo/html.ts
var VOID_TAGS = /* @__PURE__ */ new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);
var RAW_TEXT_TAGS = /* @__PURE__ */ new Set(["script", "style", "textarea", "title"]);
var ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " "
};
function decodeEntities(input) {
  return input.replace(
    /&#x([0-9a-f]+);/gi,
    (_m, hex) => String.fromCodePoint(parseInt(hex, 16))
  ).replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10))).replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}
__name(decodeEntities, "decodeEntities");
var ATTR_RE = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
function parseAttrs(raw) {
  const attrs = {};
  let match;
  ATTR_RE.lastIndex = 0;
  while (match = ATTR_RE.exec(raw)) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (!(name in attrs)) attrs[name] = decodeEntities(value);
  }
  return attrs;
}
__name(parseAttrs, "parseAttrs");
function makeNode(tag, attrs, parent) {
  return { tag, attrs, children: [], parent, text: "" };
}
__name(makeNode, "makeNode");
var HtmlDoc = class _HtmlDoc {
  static {
    __name(this, "HtmlDoc");
  }
  root;
  constructor(root) {
    this.root = root;
  }
  static parse(html) {
    const root = makeNode("#document", {}, null);
    const stack = [root];
    const source = html.replace(/<!--[\s\S]*?-->/g, "");
    let index = 0;
    const appendText = /* @__PURE__ */ __name((text) => {
      if (!text) return;
      const parent = stack[stack.length - 1];
      const node = makeNode("#text", {}, parent);
      node.text = decodeEntities(text);
      parent.children.push(node);
    }, "appendText");
    while (index < source.length) {
      const lt = source.indexOf("<", index);
      if (lt === -1) {
        appendText(source.slice(index));
        break;
      }
      if (lt > index) appendText(source.slice(index, lt));
      if (source[lt + 1] === "!" || source[lt + 1] === "?") {
        const end = source.indexOf(">", lt);
        index = end === -1 ? source.length : end + 1;
        continue;
      }
      const gt = source.indexOf(">", lt);
      if (gt === -1) {
        appendText(source.slice(lt));
        break;
      }
      const raw = source.slice(lt + 1, gt);
      if (raw.startsWith("/")) {
        const name = raw.slice(1).trim().toLowerCase();
        for (let i = stack.length - 1; i > 0; i--) {
          if (stack[i].tag === name) {
            stack.length = i;
            break;
          }
        }
        index = gt + 1;
        continue;
      }
      const selfClosing = raw.endsWith("/");
      const body = selfClosing ? raw.slice(0, -1) : raw;
      const nameMatch = /^([a-zA-Z][^\s/>]*)/.exec(body);
      if (!nameMatch) {
        index = gt + 1;
        continue;
      }
      const tag = nameMatch[1].toLowerCase();
      const attrs = parseAttrs(body.slice(nameMatch[1].length));
      const parent = stack[stack.length - 1];
      const node = makeNode(tag, attrs, parent);
      parent.children.push(node);
      if (VOID_TAGS.has(tag) || selfClosing) {
        index = gt + 1;
        continue;
      }
      if (RAW_TEXT_TAGS.has(tag)) {
        const closer = new RegExp(`</${tag}\\s*>`, "i");
        const rest = source.slice(gt + 1);
        const found = closer.exec(rest);
        const content = found ? rest.slice(0, found.index) : rest;
        if (content) {
          const textNode = makeNode("#text", {}, node);
          textNode.text = tag === "title" ? decodeEntities(content) : content;
          node.children.push(textNode);
        }
        index = found ? gt + 1 + found.index + found[0].length : source.length;
        continue;
      }
      stack.push(node);
      index = gt + 1;
    }
    return new _HtmlDoc(root);
  }
  all(tag) {
    const target = tag.toLowerCase();
    const out = [];
    const walk = /* @__PURE__ */ __name((node) => {
      for (const child of node.children) {
        if (child.tag === target) out.push(child);
        walk(child);
      }
    }, "walk");
    walk(this.root);
    return out;
  }
  first(tag) {
    return this.all(tag)[0] ?? null;
  }
  /** `<html lang>` — the language signal AI engines use to route content. */
  htmlLang() {
    const html = this.first("html");
    const lang = html?.attrs.lang?.trim();
    return lang ? lang : null;
  }
  title() {
    const node = this.first("title");
    const text = node ? this.textOf(node).trim() : "";
    return text || null;
  }
  metaByName(name) {
    const wanted = name.toLowerCase();
    return this.all("meta").find(
      (m) => (m.attrs.name || "").toLowerCase() === wanted
    ) ?? null;
  }
  metaByProperty(property) {
    const wanted = property.toLowerCase();
    return this.all("meta").find(
      (m) => (m.attrs.property || "").toLowerCase() === wanted
    ) ?? null;
  }
  linkByRel(rel) {
    const wanted = rel.toLowerCase();
    return this.all("link").find(
      (l) => (l.attrs.rel || "").toLowerCase().split(/\s+/).includes(wanted)
    ) ?? null;
  }
  /** Concatenated, whitespace-normalized text of a subtree. */
  textOf(node) {
    if (node.tag === "#text") return node.text;
    let out = "";
    for (const child of node.children) {
      out += child.tag === "#text" ? ` ${child.text} ` : ` ${this.textOf(child)} `;
    }
    return out.replace(/\s+/g, " ").trim();
  }
  /** Visible copy: `<body>` text without script/style/noscript/template. */
  bodyText() {
    const body = this.first("body") ?? this.root;
    return this.visibleText(body);
  }
  visibleText(node) {
    if (node.tag === "#text") return node.text;
    if (["script", "style", "noscript", "template"].includes(node.tag)) return "";
    let out = "";
    for (const child of node.children) out += ` ${this.visibleText(child)} `;
    return out;
  }
};

// src/geo/http.ts
var DEFAULT_TIMEOUT_MS = 12e3;
var DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
var fetchText = /* @__PURE__ */ __name(async (url, init) => {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: init?.accept ?? "text/html,application/xhtml+xml,text/plain,*/*;q=0.8",
      "Accept-Language": "en;q=0.9"
    },
    signal: AbortSignal.timeout(init?.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  });
  const body = await readCapped(response, DEFAULT_MAX_BYTES);
  const headers = {};
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return {
    url: response.url || url,
    status: response.status,
    ok: response.ok,
    headers,
    body
  };
}, "fetchText");
async function readCapped(response, maxBytes) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      chunks.push(value.slice(0, Math.max(0, maxBytes - (total - value.byteLength))));
      await reader.cancel().catch(() => void 0);
      break;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}
__name(readCapped, "readCapped");
async function fetchQuiet(fetcher, url, options = {}) {
  try {
    return await fetcher(url, {
      accept: options.accept,
      timeoutMs: options.timeoutMs
    });
  } catch {
    return null;
  }
}
__name(fetchQuiet, "fetchQuiet");

// src/geo/audit/ai-discovery.ts
function parseJson(body) {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}
__name(parseJson, "parseJson");
function auditAiDiscovery(responses) {
  const wellKnownOk = responses.wellKnownAi.status === 200 && (responses.wellKnownAi.body ?? "").trim().length > 0;
  const summaryData = parseJson(responses.summary.body);
  const hasSummary = responses.summary.status === 200 && summaryData !== null;
  const summaryValid = hasSummary && typeof summaryData === "object" && summaryData !== null && String(summaryData.name ?? "").length >= AI_DISCOVERY.summaryNameMinLen && String(summaryData.description ?? "").length >= AI_DISCOVERY.summaryDescriptionMinLen;
  const faqData = parseJson(responses.faq.body);
  const faqList = Array.isArray(faqData) ? faqData : faqData && typeof faqData === "object" ? faqData.faqs : null;
  const faqCount = Array.isArray(faqList) ? faqList.filter((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item;
    return String(record.question ?? "").length >= AI_DISCOVERY.faqQuestionMinLen && String(record.answer ?? "").length >= AI_DISCOVERY.faqAnswerMinLen;
  }).length : 0;
  const hasFaq = responses.faq.status === 200 && faqData !== null;
  const serviceData = parseJson(responses.service.body);
  const hasService = responses.service.status === 200 && serviceData !== null && typeof serviceData === "object" && String(serviceData.name ?? "").length >= AI_DISCOVERY.serviceNameMinLen && Array.isArray(serviceData.capabilities) && serviceData.capabilities.length > 0;
  const data = {
    hasWellKnownAi: wellKnownOk,
    hasSummary,
    summaryValid,
    hasFaq,
    faqCount,
    hasService
  };
  const check = /* @__PURE__ */ __name((id, label, earned, max, status2, evidence, fix) => ({
    id,
    category: "ai_discovery",
    label,
    earned,
    max,
    status: status2,
    evidence,
    fix
  }), "check");
  const checks = [
    check(
      "ai_discovery.well_known",
      "/.well-known/ai.txt exists",
      wellKnownOk ? WEIGHTS.ai_discovery_well_known : 0,
      WEIGHTS.ai_discovery_well_known,
      wellKnownOk ? "pass" : "fail",
      wellKnownOk ? "Endpoint returned content" : `HTTP ${responses.wellKnownAi.status}`,
      "Publish /.well-known/ai.txt describing crawler permissions and key resources."
    ),
    check(
      "ai_discovery.summary",
      "/ai/summary.json is valid",
      summaryValid ? WEIGHTS.ai_discovery_summary : 0,
      WEIGHTS.ai_discovery_summary,
      summaryValid ? "pass" : "fail",
      summaryValid ? "JSON with name and description" : hasSummary ? "JSON present but name/description too short" : `HTTP ${responses.summary.status}`,
      'Publish /ai/summary.json with {"name": "...", "description": "..."} (description \u2265 20 chars).'
    ),
    check(
      "ai_discovery.faq",
      "/ai/faq.json exists",
      hasFaq ? WEIGHTS.ai_discovery_faq : 0,
      WEIGHTS.ai_discovery_faq,
      hasFaq ? "pass" : "fail",
      hasFaq ? `${faqCount} valid FAQ item(s)` : `HTTP ${responses.faq.status}`,
      "Publish /ai/faq.json with question/answer pairs an assistant can quote."
    ),
    check(
      "ai_discovery.service",
      "/ai/service.json describes capabilities",
      hasService ? WEIGHTS.ai_discovery_service : 0,
      WEIGHTS.ai_discovery_service,
      hasService ? "pass" : "fail",
      hasService ? "name + capabilities present" : `HTTP ${responses.service.status}`,
      'Publish /ai/service.json with {"name": "...", "capabilities": [...]} for agent discovery.'
    )
  ];
  return { data, checks };
}
__name(auditAiDiscovery, "auditAiDiscovery");

// src/geo/text.ts
var CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g;
function countWords(text) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return 0;
  const cjk = normalized.match(CJK_RE)?.length ?? 0;
  const nonCjk = normalized.replace(CJK_RE, " ").trim();
  const latin = nonCjk ? nonCjk.split(/\s+/).filter(Boolean).length : 0;
  return cjk + latin;
}
__name(countWords, "countWords");
function cutAtFirstSeparator(text) {
  const hits = TITLE_SEPARATORS.map((sep) => text.indexOf(sep)).filter((i) => i > 0);
  return hits.length ? text.slice(0, Math.min(...hits)).trim() : text.trim();
}
__name(cutAtFirstSeparator, "cutAtFirstSeparator");
function normalizeBrandName(name) {
  let normalized = name.trim().toLowerCase().replace(/,$/, "");
  for (const suffix of BRAND_LEGAL_SUFFIXES) {
    if (normalized.endsWith(` ${suffix}`)) {
      normalized = normalized.slice(0, -(suffix.length + 1)).trim();
      break;
    }
  }
  return normalized;
}
__name(normalizeBrandName, "normalizeBrandName");
function fold(text) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}
__name(fold, "fold");

// src/geo/audit/brand.ts
var PRIMARY_SCHEMA_TYPES = ["WebSite", "WebApplication", "SoftwareApplication"];
function looksLikeBrand(text) {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 60) return false;
  return !/[.!?]\s/.test(trimmed);
}
__name(looksLikeBrand, "looksLikeBrand");
function typesOf(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string");
  return [];
}
__name(typesOf, "typesOf");
function auditBrand(doc, schema, meta, content) {
  const h1Name = content.h1 && looksLikeBrand(content.h1) ? cutAtFirstSeparator(content.h1) : "";
  const titleName = meta.title ? cutAtFirstSeparator(meta.title) : "";
  const ogTitle = doc.metaByProperty("og:title")?.attrs.content?.trim() || "";
  const ogName = ogTitle ? cutAtFirstSeparator(ogTitle) : "";
  const names = [];
  const primarySchemaNames = [];
  const orgSchemaNames = [];
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
  let primaryName = null;
  if (primarySchemaNames.length) primaryName = primarySchemaNames[0];
  else if (orgSchemaNames.length) primaryName = orgSchemaNames[0];
  else if (names.length) {
    const counts = /* @__PURE__ */ new Map();
    for (const name of names) {
      const key = normalizeBrandName(name);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const [topKey, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    primaryName = topCount >= 2 ? names.find((name) => normalizeBrandName(name) === topKey) ?? names[0] : names[0];
  }
  const sources = [];
  const headNames = new Set(
    [titleName, ogName].filter(Boolean).map((name) => normalizeBrandName(name))
  );
  if (headNames.size) sources.push(headNames);
  if (h1Name) sources.push(/* @__PURE__ */ new Set([normalizeBrandName(h1Name)]));
  const schemaNames = new Set(
    [...primarySchemaNames, ...orgSchemaNames].map((name) => normalizeBrandName(name))
  );
  if (schemaNames.size) sources.push(schemaNames);
  let brandNameConsistent = false;
  if (sources.length >= 2) {
    const counts = /* @__PURE__ */ new Map();
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
      return metaDesc.slice(0, 30) === schemaDesc.slice(0, 30) || schemaDesc.includes(metaDesc.slice(0, 30)) || metaDesc.includes(schemaDesc.slice(0, 30));
    });
  }
  const kgPillarUrls = schema.sameAsUrls.filter(
    (url) => KG_PILLAR_DOMAINS.some((domain) => url.toLowerCase().includes(domain))
  );
  const hasAboutLink = doc.all("a").some((a) => {
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
    return types.includes("Person") && Boolean(object["jobTitle"] || object["hasCredential"] || object["alumniOf"]);
  });
  const hasHreflang = doc.all("link").some((link) => (link.attrs.rel || "").toLowerCase() === "alternate" && Boolean(link.attrs.hreflang));
  const hasGeoSignal = hasHreflang || schema.objects.some((object) => {
    const types = typesOf(object["@type"]);
    return types.includes("LocalBusiness") || Boolean(object["areaServed"]) || types.some((type) => ORGANIZATION_TYPES.includes(type)) && Boolean(object["address"]);
  });
  let faqDepth = 0;
  for (const object of schema.objects) {
    if (!typesOf(object["@type"]).includes("FAQPage")) continue;
    const mainEntity = object["mainEntity"];
    if (Array.isArray(mainEntity)) faqDepth += mainEntity.length;
  }
  const hasRecentArticles = schema.hasDateModified && schema.hasArticle;
  const data = {
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
    hasRecentArticles
  };
  const check = /* @__PURE__ */ __name((id, label, earned, max, status2, evidence, fix) => ({
    id,
    category: "brand_entity",
    label,
    earned,
    max,
    status: status2,
    evidence,
    fix
  }), "check");
  const kgPoints = data.kgPillarCount >= 3 ? WEIGHTS.brand_kg_readiness : data.kgPillarCount === 2 ? WEIGHTS.brand_kg_readiness - 1 : data.kgPillarCount === 1 ? WEIGHTS.brand_kg_readiness - 2 : 0;
  const checks = [
    check(
      "brand.name_coherence",
      "Brand name is consistent",
      brandNameConsistent ? WEIGHTS.brand_name_coherence : 0,
      WEIGHTS.brand_name_coherence,
      brandNameConsistent ? "pass" : "fail",
      data.namesFound.length ? `Names found: ${data.namesFound.join(" \xB7 ")}` : "No brand name could be extracted from title/H1/schema",
      brandNameConsistent ? void 0 : "Use one brand name across <title>, og:title, H1 and Organization schema so the entity resolves cleanly."
    ),
    check(
      "brand.desc_coherence",
      "Schema and meta descriptions agree",
      schemaDescMatchesMeta ? WEIGHTS.brand_desc_coherence : 0,
      WEIGHTS.brand_desc_coherence,
      schemaDescMatchesMeta ? "pass" : "fail",
      schemaDescMatchesMeta ? "Schema description overlaps the meta description" : "Schema and meta descriptions do not overlap",
      schemaDescMatchesMeta ? void 0 : "Reuse the same positioning sentence in Organization schema description and the meta description."
    ),
    check(
      "brand.kg_readiness",
      "Knowledge Graph links (sameAs)",
      kgPoints,
      WEIGHTS.brand_kg_readiness,
      kgPoints === WEIGHTS.brand_kg_readiness ? "pass" : kgPoints > 0 ? "partial" : "fail",
      `${data.kgPillarCount}/4 pillars linked${data.kgPillarUrls.length ? `: ${data.kgPillarUrls.join(", ")}` : ""}`,
      kgPoints === WEIGHTS.brand_kg_readiness ? void 0 : "Add sameAs URLs to Wikipedia, Wikidata, LinkedIn and Crunchbase in Organization schema."
    ),
    check(
      "brand.about_link",
      "About page linked",
      data.hasAboutLink ? WEIGHTS.brand_about_link : 0,
      WEIGHTS.brand_about_link,
      data.hasAboutLink ? "pass" : "fail",
      data.hasAboutLink ? "A /about-style link is present" : "No about/company link found",
      data.hasAboutLink ? void 0 : "Link a visible /about or /company page from the homepage."
    ),
    check(
      "brand.contact_info",
      "Contact details in schema",
      data.hasContactInfo ? WEIGHTS.brand_contact_info : 0,
      WEIGHTS.brand_contact_info,
      data.hasContactInfo ? "pass" : "fail",
      data.hasContactInfo ? "Organization/Person schema exposes contact details" : "No address, telephone, email or contactPoint",
      data.hasContactInfo ? void 0 : "Add address, telephone or contactPoint to Organization schema \u2014 it validates the entity."
    ),
    check(
      "brand.geo_identity",
      "Geographic identity",
      data.hasGeoSignal ? WEIGHTS.brand_geo_identity : 0,
      WEIGHTS.brand_geo_identity,
      data.hasGeoSignal ? "pass" : "fail",
      data.hasGeoSignal ? "Geo schema or hreflang present" : "No areaServed/address or hreflang",
      data.hasGeoSignal ? void 0 : "Add areaServed/address (or hreflang) so local and regional queries can resolve you."
    ),
    check(
      "brand.topic_authority",
      "Topic authority signals",
      data.faqDepth >= 3 || data.hasRecentArticles ? WEIGHTS.brand_topic_authority : 0,
      WEIGHTS.brand_topic_authority,
      data.faqDepth >= 3 || data.hasRecentArticles ? "pass" : "fail",
      `FAQ items: ${data.faqDepth} \xB7 dated articles: ${data.hasRecentArticles ? "yes" : "no"}`,
      data.faqDepth >= 3 || data.hasRecentArticles ? void 0 : "Add a 3+ question FAQ or dated Article markup to show topical depth."
    )
  ];
  return { data, checks };
}
__name(auditBrand, "auditBrand");

// src/geo/audit/content.ts
var NUMBER_RE = /\b\d+[%€$£]|\b\d+\.\d+|\b\d{3,}\b/g;
function auditContent(doc, pageUrl) {
  const h1 = doc.first("h1");
  const headings = ["h1", "h2", "h3", "h4"].flatMap((tag) => doc.all(tag));
  const bodyText = doc.bodyText().replace(/\s+/g, " ").trim();
  const words = bodyText.split(/\s+/).filter(Boolean);
  const numbers = bodyText.match(NUMBER_RE) ?? [];
  let baseHost = "";
  try {
    baseHost = new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    baseHost = "";
  }
  const links = doc.all("a").filter((a) => a.attrs.href?.startsWith("http"));
  const externalLinks = links.filter((a) => {
    try {
      const host = new URL(a.attrs.href).hostname.replace(/^www\./, "");
      return baseHost ? host !== baseHost && !host.endsWith(`.${baseHost}`) : true;
    } catch {
      return false;
    }
  });
  const images = doc.all("img");
  const imagesWithAlt = images.filter((img) => (img.attrs.alt ?? "").trim().length > 0).length;
  const body = doc.first("body") ?? doc.root;
  const hasListsOrTables = doc.all("ul").length > 0 || doc.all("ol").length > 0 || doc.all("table").length > 0;
  void body;
  const hasHeadingHierarchy = doc.all("h2").length > 0 && doc.all("h3").length > 0;
  const wordCount = countWords(bodyText);
  const first30 = words.slice(0, Math.max(1, Math.floor(words.length * 0.3)));
  const hasFrontLoading = first30.length >= FRONT_LOADING_MIN_WORDS && first30.some((word) => /\d/.test(word));
  const data = {
    h1: h1 ? doc.textOf(h1).trim() || null : null,
    headingCount: headings.length,
    wordCount,
    numbersCount: numbers.length,
    externalLinksCount: externalLinks.length,
    hasHeadingHierarchy,
    hasListsOrTables,
    hasFrontLoading,
    imagesTotal: images.length,
    imagesWithAlt
  };
  const check = /* @__PURE__ */ __name((id, label, earned, max, status2, evidence, fix) => ({ id, category: "content", label, earned, max, status: status2, evidence, fix }), "check");
  const checks = [
    check(
      "content.h1",
      "Single H1 states the topic",
      data.h1 ? WEIGHTS.content_h1 : 0,
      WEIGHTS.content_h1,
      data.h1 ? "pass" : "fail",
      data.h1 ? `H1: "${data.h1.slice(0, 100)}"` : "No H1",
      data.h1 ? void 0 : "Add one H1 that states what the page answers, not a slogan."
    ),
    check(
      "content.word_count",
      `At least ${CONTENT_MIN_WORDS} words`,
      wordCount >= CONTENT_MIN_WORDS ? WEIGHTS.content_word_count : 0,
      WEIGHTS.content_word_count,
      wordCount >= CONTENT_MIN_WORDS ? "pass" : "fail",
      `${wordCount} words`,
      wordCount >= CONTENT_MIN_WORDS ? void 0 : `Expand to ${CONTENT_MIN_WORDS}+ words of substance \u2014 AI engines need extractable facts to cite a page.`
    ),
    check(
      "content.heading_hierarchy",
      "H2 + H3 hierarchy",
      hasHeadingHierarchy ? WEIGHTS.content_heading_hierarchy : 0,
      WEIGHTS.content_heading_hierarchy,
      hasHeadingHierarchy ? "pass" : "fail",
      `${doc.all("h2").length} H2 \xB7 ${doc.all("h3").length} H3`,
      hasHeadingHierarchy ? void 0 : "Add H2 sections and H3 sub-points so an answer engine can lift the relevant passage."
    ),
    check(
      "content.lists_or_tables",
      "Lists or tables present",
      hasListsOrTables ? WEIGHTS.content_lists_or_tables : 0,
      WEIGHTS.content_lists_or_tables,
      hasListsOrTables ? "pass" : "fail",
      hasListsOrTables ? `${doc.all("ul").length + doc.all("ol").length} list(s), ${doc.all("table").length} table(s)` : "No <ul>, <ol> or <table>",
      hasListsOrTables ? void 0 : "Structure comparisons and steps as lists or tables \u2014 the format AI answers quote most often."
    ),
    check(
      "content.front_loading",
      "Key facts in the first 30%",
      hasFrontLoading ? WEIGHTS.content_front_loading : 0,
      WEIGHTS.content_front_loading,
      hasFrontLoading ? "pass" : "fail",
      hasFrontLoading ? "First 30% of the copy contains concrete figures" : `First 30% (${first30.length} words) has no concrete figure`,
      hasFrontLoading ? void 0 : "Put the direct answer, with a number or date, in the first 30% of the page \u2014 engines select snippets from there."
    ),
    check(
      "content.numbers",
      "Concrete statistics",
      numbers.length >= 3 ? WEIGHTS.content_numbers : 0,
      WEIGHTS.content_numbers,
      numbers.length >= 3 ? "pass" : "fail",
      `${numbers.length} numeric token(s)`,
      numbers.length >= 3 ? void 0 : "Add concrete numbers (prices, percentages, dates) \u2014 quantified claims are cited more often."
    ),
    check(
      "content.links",
      "Outbound citations",
      externalLinks.length > 0 ? WEIGHTS.content_links : 0,
      WEIGHTS.content_links,
      externalLinks.length > 0 ? "pass" : "fail",
      `${externalLinks.length} external link(s)`,
      externalLinks.length > 0 ? void 0 : "Cite authoritative external sources \u2014 it raises perceived credibility."
    )
  ];
  if (images.length > 0 && imagesWithAlt / images.length < 0.9) {
    checks.push({
      id: "content.image_alt",
      category: "content",
      label: "Images have alt text",
      earned: 0,
      max: 0,
      status: "fail",
      evidence: `${images.length - imagesWithAlt}/${images.length} image(s) without alt`,
      fix: "Add descriptive alt text \u2014 multimodal engines read images through it."
    });
  }
  return { data, checks };
}
__name(auditContent, "auditContent");

// src/geo/audit/llms.ts
var LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;
function auditLlms(body, status2, fullBody) {
  const text = (body ?? "").replace(/^\uFEFF/, "");
  const found = status2 === 200 && body !== null && text.trim().length > 0;
  const lines = found ? text.split(/\r?\n/) : [];
  const hasH1 = lines.some((line) => line.startsWith("# "));
  const hasBlockquote = lines.some((line) => line.startsWith("> "));
  const sections = lines.filter((line) => line.startsWith("## "));
  const links = [...found ? text.matchAll(LINK_RE) : []];
  const wordCount = found ? countWords(text) : 0;
  const hasFull = (fullBody ?? "").trim().length > 0;
  const warnings = [];
  if (found) {
    if (!hasBlockquote) warnings.push("llms.txt should have a > blockquote description after the H1");
    const firstNonEmpty = lines.find((line) => line.trim());
    if (firstNonEmpty && !firstNonEmpty.startsWith("# ")) {
      warnings.push("llms.txt should start with an H1 (# Site name)");
    }
    if (!links.length) warnings.push("llms.txt should contain markdown links to site pages");
    if (wordCount < 100) warnings.push("llms.txt is very short \u2014 add topics and links");
  }
  const data = {
    found,
    status: status2,
    hasH1,
    hasBlockquote,
    hasSections: sections.length > 0,
    sectionsCount: sections.length,
    hasLinks: links.length > 0,
    linksCount: links.length,
    wordCount,
    hasFull,
    warnings,
    excerpt: found ? text.slice(0, 400) : ""
  };
  const check = /* @__PURE__ */ __name((id, label, earned, max, status3, evidence, fix) => ({ id, category: "llms", label, earned, max, status: status3, evidence, fix }), "check");
  const checks = [
    check(
      "llms.found",
      "/llms.txt exists",
      found ? WEIGHTS.llms_found : 0,
      WEIGHTS.llms_found,
      found ? "pass" : "fail",
      found ? `HTTP 200, ${wordCount} words` : `No usable /llms.txt (HTTP ${status2})`,
      found ? void 0 : "Generate /llms.txt from your sitemap (geo_generate_llms_txt) and deploy it at the site root."
    ),
    check(
      "llms.h1",
      "H1 title present",
      hasH1 ? WEIGHTS.llms_h1 : 0,
      WEIGHTS.llms_h1,
      hasH1 ? "pass" : "fail",
      hasH1 ? "File starts with an H1 heading" : "No `# Site name` heading found",
      hasH1 ? void 0 : "Start llms.txt with `# <Site name>` so agents can identify the source."
    ),
    check(
      "llms.blockquote",
      "Blockquote summary present",
      hasBlockquote ? WEIGHTS.llms_blockquote : 0,
      WEIGHTS.llms_blockquote,
      hasBlockquote ? "pass" : "fail",
      hasBlockquote ? "A `>` summary line was found" : "No `> description` line found",
      hasBlockquote ? void 0 : "Add a one-line `> What this site offers` blockquote directly under the H1."
    ),
    check(
      "llms.sections",
      "H2 topic sections",
      sections.length ? WEIGHTS.llms_sections : 0,
      WEIGHTS.llms_sections,
      sections.length ? "pass" : "fail",
      `${sections.length} H2 section(s)`,
      sections.length ? void 0 : "Organize links under H2 sections (## Docs, ## Product, ## Company) so agents can route by topic."
    ),
    check(
      "llms.links",
      "Markdown links to key pages",
      links.length ? WEIGHTS.llms_links : 0,
      WEIGHTS.llms_links,
      links.length ? "pass" : "fail",
      `${links.length} markdown link(s)`,
      links.length ? void 0 : "Add markdown links to the pages AI engines should cite, with a short description per link."
    ),
    check(
      "llms.depth",
      `Content depth \u2265 ${LLMS_DEPTH_WORDS} words`,
      wordCount >= LLMS_DEPTH_WORDS ? WEIGHTS.llms_depth : 0,
      WEIGHTS.llms_depth,
      wordCount >= LLMS_DEPTH_WORDS ? "pass" : "fail",
      `${wordCount} words`,
      wordCount >= LLMS_DEPTH_WORDS ? void 0 : "Expand llms.txt with product, documentation and company sections \u2014 thin files carry little signal."
    ),
    check(
      "llms.depth_high",
      `Content depth \u2265 ${LLMS_DEPTH_HIGH_WORDS} words`,
      wordCount >= LLMS_DEPTH_HIGH_WORDS ? WEIGHTS.llms_depth_high : 0,
      WEIGHTS.llms_depth_high,
      wordCount >= LLMS_DEPTH_HIGH_WORDS ? "pass" : "fail",
      `${wordCount} words`,
      wordCount >= LLMS_DEPTH_HIGH_WORDS ? void 0 : "For a full reference, ship /llms-full.txt and link it from llms.txt."
    ),
    check(
      "llms.full",
      "/llms-full.txt companion",
      hasFull ? WEIGHTS.llms_full : 0,
      WEIGHTS.llms_full,
      hasFull ? "pass" : "fail",
      hasFull ? "Companion file found" : "No /llms-full.txt",
      hasFull ? void 0 : "Publish /llms-full.txt with the expanded corpus and link it from llms.txt."
    )
  ];
  return { data, checks };
}
__name(auditLlms, "auditLlms");

// src/geo/audit/meta.ts
function auditMeta(doc, headers) {
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
  const data = {
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
    xRobotsNoindex
  };
  const check = /* @__PURE__ */ __name((id, label, earned, max, status2, evidence, fix) => ({ id, category: "meta", label, earned, max, status: status2, evidence, fix }), "check");
  const checks = [
    check(
      "meta.title",
      "Title tag",
      title ? WEIGHTS.meta_title : 0,
      WEIGHTS.meta_title,
      title ? "pass" : "fail",
      title ? `${data.titleLength} characters: "${title.slice(0, 80)}"` : "No <title>",
      title ? void 0 : "Add a <title> that names the entity and the page topic \u2014 the strongest on-page signal."
    ),
    check(
      "meta.description",
      "Meta description",
      description ? WEIGHTS.meta_description : 0,
      WEIGHTS.meta_description,
      description ? "pass" : "fail",
      description ? `${data.descriptionLength} characters` : "No meta description",
      description ? void 0 : "Add a 150\u2013160 character meta description that states what the page answers."
    ),
    check(
      "meta.canonical",
      "Canonical URL",
      canonical ? WEIGHTS.meta_canonical : 0,
      WEIGHTS.meta_canonical,
      canonical ? "pass" : "fail",
      canonical ?? 'No <link rel="canonical">',
      canonical ? void 0 : "Add a canonical URL so duplicate variants do not split AI citations."
    ),
    check(
      "meta.og",
      "Open Graph tags",
      data.hasOgTitle && data.hasOgDescription ? WEIGHTS.meta_og : 0,
      WEIGHTS.meta_og,
      data.hasOgTitle && data.hasOgDescription ? "pass" : "fail",
      `og:title ${data.hasOgTitle ? "\u2713" : "\u2717"} \xB7 og:description ${data.hasOgDescription ? "\u2713" : "\u2717"} \xB7 og:image ${data.hasOgImage ? "\u2713" : "\u2717"}`,
      data.hasOgTitle && data.hasOgDescription ? void 0 : "Add og:title, og:description and og:image \u2014 they feed previews and entity extraction."
    )
  ];
  if (xRobotsNoindex) {
    checks.push({
      id: "meta.x_robots_noindex",
      category: "meta",
      label: "X-Robots-Tag allows indexing",
      earned: 0,
      max: 0,
      status: "fail",
      evidence: `HTTP header X-Robots-Tag: ${xRobotsTag}`,
      fix: "Remove noindex from the X-Robots-Tag response header \u2014 AI crawlers skip the page entirely."
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
      fix: "Remove noai/noimageai from meta robots if you want AI engines to cite this content."
    });
  }
  return { data, checks };
}
__name(auditMeta, "auditMeta");

// src/geo/robots.ts
var encoder = new TextEncoder();
var decoder = new TextDecoder("utf-8");
function byteLength(text) {
  return encoder.encode(text).byteLength;
}
__name(byteLength, "byteLength");
function sliceBytes(text, maxBytes) {
  return decoder.decode(encoder.encode(text).subarray(0, maxBytes)).replace(/\uFFFD$/, "");
}
__name(sliceBytes, "sliceBytes");
function parseRobots(content) {
  let text = content.replace(/^\uFEFF/, "");
  if (byteLength(text) > ROBOTS_MAX_BYTES) {
    text = sliceBytes(text, ROBOTS_MAX_BYTES);
  }
  const groups = {};
  let currentAgents = [];
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon === -1) {
      lastWasAgent = false;
      continue;
    }
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).split("#")[0].trim();
    if (key === "user-agent") {
      if (!lastWasAgent) currentAgents = [];
      const agent = value;
      if (agent) {
        if (!groups[agent]) {
          groups[agent] = { allow: [], disallow: [], crawlDelay: null, explicit: agent !== "*" };
        }
        currentAgents.push(agent);
      }
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!currentAgents.length) continue;
    for (const agent of currentAgents) {
      const rules = groups[agent];
      if (key === "disallow") rules.disallow.push(value);
      else if (key === "allow") rules.allow.push(value);
      else if (key === "crawl-delay") {
        const delay = Number.parseFloat(value);
        if (Number.isFinite(delay) && delay >= 0 && rules.crawlDelay === null) {
          rules.crawlDelay = delay;
        }
      }
    }
  }
  return groups;
}
__name(parseRobots, "parseRobots");
function isPathAllowed(path, rules) {
  let bestLength = -1;
  let decision = null;
  for (const disallow of rules.disallow) {
    if (!disallow) continue;
    if (path.startsWith(disallow) || disallow === "/") {
      if (disallow.length > bestLength) {
        bestLength = disallow.length;
        decision = false;
      }
    }
  }
  for (const allow of rules.allow) {
    if (!allow) continue;
    if (path.startsWith(allow) || allow === "/") {
      if (allow.length > bestLength) {
        bestLength = allow.length;
        decision = true;
      } else if (allow.length === bestLength) {
        decision = true;
      }
    }
  }
  return decision;
}
__name(isPathAllowed, "isPathAllowed");
function classifyBot(bot, groups) {
  const match = Object.keys(groups).find((a) => a.toLowerCase() === bot.toLowerCase());
  const viaWildcard = !match && Object.prototype.hasOwnProperty.call(groups, "*");
  const agent = match ?? (viaWildcard ? "*" : null);
  if (!agent) {
    return { bot, status: "missing", viaWildcard: false, matchedAgent: null };
  }
  const rules = groups[agent];
  const blockedAtRoot = rules.disallow.some((d) => d === "/" || d === "/*");
  const allowedAtRoot = rules.allow.some((a) => a === "/" || a === "/*");
  if (blockedAtRoot && !allowedAtRoot) {
    const specificAllows = rules.allow.filter((a) => a && a !== "/" && a !== "/*");
    return {
      bot,
      status: specificAllows.length ? "partial" : "blocked",
      viaWildcard,
      matchedAgent: agent
    };
  }
  if (!rules.disallow.length || rules.disallow.every((d) => d === "")) {
    return { bot, status: "allowed", viaWildcard, matchedAgent: agent };
  }
  const decision = isPathAllowed("/", rules);
  return {
    bot,
    status: decision === false ? "blocked" : "allowed",
    viaWildcard,
    matchedAgent: agent
  };
}
__name(classifyBot, "classifyBot");
function extractSitemaps(content) {
  const out = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const colon = rawLine.indexOf(":");
    if (colon === -1) continue;
    const key = rawLine.slice(0, colon).trim().toLowerCase();
    const value = rawLine.slice(colon + 1).split("#")[0].trim();
    if (key === "sitemap" && /^https?:\/\//i.test(value)) out.push(value);
  }
  return out;
}
__name(extractSitemaps, "extractSitemaps");

// src/geo/audit/robots.ts
function auditRobots(body, status2) {
  const found = status2 === 200 && body !== null;
  const content = found ? body : "";
  const groups = found ? parseRobots(content) : {};
  const data = {
    found,
    status: status2,
    crawlDelay: groups["*"]?.crawlDelay ?? null,
    sitemaps: found ? extractSitemaps(content) : [],
    botsAllowed: [],
    botsBlocked: [],
    botsMissing: [],
    botsPartial: [],
    citationBotsOk: false,
    citationBotsExplicit: false,
    groups
  };
  if (found) {
    for (const bot of Object.keys(AI_BOTS)) {
      const result = classifyBot(bot, groups);
      if (result.status === "allowed") data.botsAllowed.push(bot);
      else if (result.status === "blocked") data.botsBlocked.push(bot);
      else if (result.status === "partial") {
        data.botsAllowed.push(bot);
        data.botsPartial.push(bot);
      } else data.botsMissing.push(bot);
    }
    data.citationBotsOk = CITATION_BOTS.every((bot) => data.botsAllowed.includes(bot));
    data.citationBotsExplicit = CITATION_BOTS.every((bot) => {
      const result = classifyBot(bot, groups);
      return (result.status === "allowed" || result.status === "partial") && !result.viaWildcard;
    });
  }
  const checks = [
    {
      id: "robots.found",
      category: "robots",
      label: "robots.txt is reachable",
      earned: found ? WEIGHTS.robots_found : 0,
      max: WEIGHTS.robots_found,
      status: found ? "pass" : "fail",
      evidence: found ? `HTTP 200, ${Object.keys(groups).length} user-agent group(s) parsed` : `No usable robots.txt (HTTP ${status2})`,
      fix: found ? void 0 : "Publish /robots.txt with explicit Allow rules for AI crawlers (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot)."
    }
  ];
  let citationPoints = 0;
  let citationStatus = "fail";
  let citationEvidence = "robots.txt unavailable, so AI citation bots are unverified";
  let citationFix = "Create robots.txt and explicitly allow OAI-SearchBot, Claude-SearchBot, PerplexityBot, Googlebot and Applebot.";
  if (found && data.citationBotsOk && data.citationBotsExplicit) {
    citationPoints = WEIGHTS.robots_citation_ok;
    citationStatus = "pass";
    citationEvidence = `All citation bots explicitly allowed (${CITATION_BOTS_DISPLAY})`;
    citationFix = void 0;
  } else if (found && data.citationBotsOk) {
    citationPoints = ROBOTS_PARTIAL_SCORE;
    citationStatus = "partial";
    citationEvidence = "Citation bots are allowed only through the wildcard group \u2014 an explicit rule is safer";
    citationFix = `Add explicit User-agent rules for ${CITATION_BOTS_DISPLAY} instead of relying on "*".`;
  } else if (found && data.botsAllowed.length) {
    citationPoints = ROBOTS_PARTIAL_SCORE;
    citationStatus = "partial";
    citationEvidence = `Allowed: ${data.botsAllowed.join(", ") || "none"} \xB7 blocked: ${data.botsBlocked.join(", ") || "none"} \xB7 missing: ${data.botsMissing.join(", ") || "none"}`;
    citationFix = `Allow the missing citation bots: ${CITATION_BOTS.filter(
      (bot) => !data.botsAllowed.includes(bot)
    ).join(", ")}.`;
  } else if (found) {
    citationEvidence = `No AI crawler group found. Blocked: ${data.botsBlocked.join(", ") || "none"}`;
  }
  checks.push({
    id: "robots.citation_bots",
    category: "robots",
    label: "AI citation crawlers are allowed",
    earned: citationPoints,
    max: WEIGHTS.robots_citation_ok,
    status: citationStatus,
    evidence: citationEvidence,
    fix: citationFix
  });
  if (data.crawlDelay !== null && data.crawlDelay > 10) {
    checks.push({
      id: "robots.crawl_delay",
      category: "robots",
      label: "Crawl-delay is not throttling AI crawlers",
      earned: 0,
      max: 0,
      status: "fail",
      evidence: `Crawl-delay: ${data.crawlDelay}s applies to all agents`,
      fix: "Reduce robots.txt Crawl-delay to 5s or less, or remove it \u2014 AI crawlers may skip re-indexing."
    });
  }
  return { data, checks };
}
__name(auditRobots, "auditRobots");

// src/geo/audit/schema.ts
function typesOf2(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string");
  return [];
}
__name(typesOf2, "typesOf");
function flattenJsonLd(payload, out = []) {
  if (Array.isArray(payload)) {
    for (const item of payload) flattenJsonLd(item, out);
    return out;
  }
  if (!payload || typeof payload !== "object") return out;
  const object = payload;
  if (Array.isArray(object["@graph"])) {
    for (const node of object["@graph"]) flattenJsonLd(node, out);
  } else {
    out.push(object);
  }
  return out;
}
__name(flattenJsonLd, "flattenJsonLd");
function auditSchema(doc) {
  const scripts = doc.all("script").filter((s) => (s.attrs.type || "").toLowerCase().includes("application/ld+json"));
  const objects = [];
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
  const foundTypes = [];
  const sameAsUrls = [];
  let hasWebsite = false;
  let hasOrganization = false;
  let hasFaq = false;
  let hasArticle = false;
  let hasProduct = false;
  let hasHowTo = false;
  let hasDateModified = false;
  const incompleteTypes = [];
  const missingFields = {};
  for (const object of capped) {
    const types = typesOf2(object["@type"]);
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
  const genericKeys = /* @__PURE__ */ new Set(["@context", "@type", "@id"]);
  const attrCounts = capped.map(
    (object) => Object.keys(object).filter((key) => !genericKeys.has(key)).length
  );
  const avgAttributes = attrCounts.length ? Math.round(attrCounts.reduce((a, b) => a + b, 0) / attrCounts.length * 10) / 10 : 0;
  const richnessScore = avgAttributes >= SCHEMA_RICHNESS.high ? WEIGHTS.schema_richness : avgAttributes >= SCHEMA_RICHNESS.medium ? 2 : avgAttributes >= SCHEMA_RICHNESS.low ? 1 : 0;
  const visibleText = fold(doc.bodyText());
  const visibleMatch = capped.some(
    (object) => ["name", "headline"].some((field) => {
      const value = object[field];
      return typeof value === "string" && value.trim().length >= 3 && visibleText.includes(fold(value));
    })
  );
  const data = {
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
    visibleMatch
  };
  const anyValid = data.foundTypes.length > 0;
  const check = /* @__PURE__ */ __name((id, label, earned, max, status2, evidence, fix) => ({ id, category: "schema", label, earned, max, status: status2, evidence, fix }), "check");
  const typeList = data.foundTypes.length ? data.foundTypes.join(", ") : "none";
  const checks = [
    check(
      "schema.any_valid",
      "Valid JSON-LD is present",
      anyValid ? WEIGHTS.schema_any_valid : 0,
      WEIGHTS.schema_any_valid,
      anyValid ? "pass" : "fail",
      anyValid ? `${scripts.length} script tag(s), types: ${typeList}` : `${scripts.length} script tag(s), no parseable @type found`,
      anyValid ? void 0 : "Add a JSON-LD block with WebSite and Organization (geo_generate_schema can produce it)."
    ),
    check(
      "schema.richness",
      "Schema objects are rich (\u22655 attributes)",
      richnessScore,
      WEIGHTS.schema_richness,
      richnessScore === WEIGHTS.schema_richness ? "pass" : richnessScore > 0 ? "partial" : "fail",
      `Average ${avgAttributes} non-generic attribute(s) per object`,
      richnessScore === WEIGHTS.schema_richness ? void 0 : "Enrich schema with description, logo, sameAs, contactPoint, areaServed \u2014 generic name+url markup earns little."
    ),
    check(
      "schema.website",
      "WebSite schema",
      hasWebsite ? incompleteTypes.includes("WebSite") ? 1 : WEIGHTS.schema_website : 0,
      WEIGHTS.schema_website,
      hasWebsite ? incompleteTypes.includes("WebSite") ? "partial" : "pass" : "fail",
      hasWebsite ? `WebSite${incompleteTypes.includes("WebSite") ? ` (missing ${missingFields.WebSite?.join(", ")})` : ""}` : "No WebSite schema",
      hasWebsite ? void 0 : "Add WebSite schema with name, url and a SearchAction potentialAction."
    ),
    check(
      "schema.organization",
      "Organization schema",
      hasOrganization ? incompleteTypes.includes("Organization") ? 1 : WEIGHTS.schema_organization : 0,
      WEIGHTS.schema_organization,
      hasOrganization ? incompleteTypes.includes("Organization") ? "partial" : "pass" : "fail",
      hasOrganization ? `Organization${incompleteTypes.includes("Organization") ? ` (missing ${missingFields.Organization?.join(", ")})` : ""}` : "No Organization schema",
      hasOrganization ? void 0 : "Add Organization schema with name, url, logo, sameAs and contactPoint."
    ),
    check(
      "schema.faq",
      "FAQPage schema",
      hasFaq ? incompleteTypes.includes("FAQPage") ? 1 : WEIGHTS.schema_faq : 0,
      WEIGHTS.schema_faq,
      hasFaq ? incompleteTypes.includes("FAQPage") ? "partial" : "pass" : "fail",
      hasFaq ? `FAQPage${incompleteTypes.includes("FAQPage") ? " (missing mainEntity)" : ""}` : "No FAQPage schema",
      hasFaq ? void 0 : "Mark up the site FAQ as FAQPage \u2014 question/answer pairs are the easiest content for AI engines to quote."
    ),
    check(
      "schema.article",
      "Article schema",
      hasArticle ? incompleteTypes.some((type) => ARTICLE_TYPES.includes(type)) ? 1 : WEIGHTS.schema_article : 0,
      WEIGHTS.schema_article,
      hasArticle ? incompleteTypes.some((type) => ARTICLE_TYPES.includes(type)) ? "partial" : "pass" : "fail",
      hasArticle ? `Article-type schema present${hasDateModified ? " with dateModified" : ""}` : "No Article/BlogPosting schema",
      hasArticle ? void 0 : "Add Article or BlogPosting schema (headline, author, datePublished, dateModified) to editorial pages."
    )
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
      fix: "Use the exact brand name in schema name/headline that the page displays \u2014 mismatched entities weaken trust."
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
      fix: "Validate each JSON-LD block (schema.org/validator); a single syntax error discards the whole block."
    });
  }
  return { data, checks };
}
__name(auditSchema, "auditSchema");

// src/geo/audit/signals.ts
var FUTURE_TOLERANCE_DAYS = 1;
function auditSignals(doc, schema) {
  const lang = doc.htmlLang();
  const feed = doc.all("link").find((link) => /rss|atom/i.test(link.attrs.type || ""));
  const rssUrl = feed?.attrs.href?.trim() || null;
  let freshnessDate = null;
  for (const object of schema.objects) {
    const value = object["dateModified"] ?? object["datePublished"];
    if (typeof value === "string" && value.trim()) {
      freshnessDate = value.trim();
      break;
    }
  }
  if (!freshnessDate) {
    freshnessDate = doc.metaByProperty("article:modified_time")?.attrs.content?.trim() || null;
  }
  const parsed = freshnessDate ? Date.parse(freshnessDate) : Number.NaN;
  const freshnessValid = Number.isFinite(parsed) && parsed <= Date.now() + FUTURE_TOLERANCE_DAYS * 864e5;
  const data = { lang, rssUrl, freshnessDate };
  const check = /* @__PURE__ */ __name((id, label, earned, max, status2, evidence, fix) => ({ id, category: "signals", label, earned, max, status: status2, evidence, fix }), "check");
  const checks = [
    check(
      "signals.lang",
      "<html lang> declared",
      lang ? WEIGHTS.signals_lang : 0,
      WEIGHTS.signals_lang,
      lang ? "pass" : "fail",
      lang ? `lang="${lang}"` : "No lang attribute",
      lang ? void 0 : 'Add lang to <html> (e.g. lang="en") so engines route the page to the right language.'
    ),
    check(
      "signals.rss",
      "RSS/Atom feed linked",
      rssUrl ? WEIGHTS.signals_rss : 0,
      WEIGHTS.signals_rss,
      rssUrl ? "pass" : "fail",
      rssUrl ?? "No feed link in <head>",
      rssUrl ? void 0 : 'Add <link rel="alternate" type="application/rss+xml" href="/feed.xml"> so agents can discover new pages.'
    ),
    check(
      "signals.freshness",
      "Freshness date is valid",
      freshnessValid ? WEIGHTS.signals_freshness : 0,
      WEIGHTS.signals_freshness,
      freshnessValid ? "pass" : "fail",
      freshnessDate ? `dateModified/datePublished = ${freshnessDate}${freshnessValid ? "" : " (unparseable or in the future)"}` : "No dateModified, datePublished or article:modified_time",
      freshnessValid ? void 0 : "Publish dateModified in Article/WebPage schema \u2014 AI search favors recently updated content."
    )
  ];
  return { data, checks };
}
__name(auditSignals, "auditSignals");

// src/geo/score.ts
var CRITICAL_CHECKS = /* @__PURE__ */ new Set(["meta.x_robots_noindex", "meta.noai"]);
var HIGH_CHECKS = /* @__PURE__ */ new Set([
  "robots.found",
  "robots.citation_bots",
  "llms.found",
  "meta.title"
]);
var LOW_CHECKS = /* @__PURE__ */ new Set([
  "signals.lang",
  "signals.rss",
  "signals.freshness",
  "ai_discovery.well_known",
  "ai_discovery.summary",
  "ai_discovery.faq",
  "ai_discovery.service",
  "content.numbers",
  "content.links",
  "content.image_alt"
]);
function priorityOf(check) {
  if (CRITICAL_CHECKS.has(check.id)) return "critical";
  if (HIGH_CHECKS.has(check.id)) return "high";
  if (LOW_CHECKS.has(check.id)) return "low";
  if (check.category === "content") return "medium";
  return "medium";
}
__name(priorityOf, "priorityOf");
function computeBreakdown(checks) {
  const breakdown = Object.fromEntries(
    Object.keys(CATEGORY_MAX).map((category) => [category, 0])
  );
  for (const check of checks) {
    breakdown[check.category] += check.earned;
  }
  for (const category of Object.keys(breakdown)) {
    breakdown[category] = Math.max(0, Math.min(breakdown[category], CATEGORY_MAX[category]));
  }
  return breakdown;
}
__name(computeBreakdown, "computeBreakdown");
function scoreOf(breakdown) {
  const total = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  return Math.max(0, Math.min(100, total));
}
__name(scoreOf, "scoreOf");
function bandOf(score) {
  for (const [band, [low, high]] of Object.entries(SCORE_BANDS)) {
    if (score >= low && score <= high) return band;
  }
  return "critical";
}
__name(bandOf, "bandOf");
function buildRecommendations(checks) {
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  return checks.filter((check) => check.status !== "pass" && check.status !== "info" && check.fix).map((check) => ({
    priority: priorityOf(check),
    category: check.category,
    checkId: check.id,
    points: Math.max(0, check.max - check.earned),
    action: check.fix
  })).sort((a, b) => order[a.priority] - order[b.priority] || b.points - a.points);
}
__name(buildRecommendations, "buildRecommendations");

// src/geo/audit.ts
function normalizeUrl(input) {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("url is required");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withScheme);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }
  return parsed.toString();
}
__name(normalizeUrl, "normalizeUrl");
function rootUrl(base, path) {
  return new URL(path, new URL(base).origin).toString();
}
__name(rootUrl, "rootUrl");
function emptyDetails(baseUrl) {
  const doc = HtmlDoc.parse("");
  const schema = auditSchema(doc).data;
  const meta = auditMeta(doc, {}).data;
  const content = auditContent(doc, baseUrl).data;
  const signals = auditSignals(doc, schema).data;
  const brand = auditBrand(doc, schema, meta, content).data;
  const nullResponse = { status: 0, body: null };
  return {
    robots: auditRobots(null, 0).data,
    llms: auditLlms(null, 0, null).data,
    schema,
    meta,
    content,
    signals,
    brand_entity: brand,
    ai_discovery: auditAiDiscovery({
      wellKnownAi: nullResponse,
      summary: nullResponse,
      faq: nullResponse,
      service: nullResponse
    }).data
  };
}
__name(emptyDetails, "emptyDetails");
async function runGeoAudit(options) {
  const started = Date.now();
  const fetcher = options.fetcher ?? fetchText;
  const baseUrl = normalizeUrl(options.url);
  const page = await fetchQuiet(fetcher, baseUrl, { timeoutMs: options.timeoutMs });
  if (!page) {
    return {
      url: baseUrl,
      finalUrl: baseUrl,
      httpStatus: 0,
      pageSize: 0,
      durationMs: Date.now() - started,
      score: 0,
      band: "critical",
      recoverablePoints: 0,
      projectedScore: 0,
      scoreBreakdown: Object.fromEntries(
        Object.keys(CATEGORY_MAX).map((category) => [category, 0])
      ),
      scoreMax: { ...CATEGORY_MAX },
      checks: [],
      recommendations: [
        {
          priority: "critical",
          category: "blockers",
          checkId: "audit.fetch",
          points: 0,
          action: `Unable to reach ${baseUrl}. Check the URL, DNS and any WAF that blocks non-browser user agents.`
        }
      ],
      details: emptyDetails(baseUrl),
      error: `Unable to reach ${baseUrl}`
    };
  }
  if (page.status !== 200 && page.status !== 203) {
    return {
      url: baseUrl,
      finalUrl: page.url,
      httpStatus: page.status,
      pageSize: page.body.length,
      durationMs: Date.now() - started,
      score: 0,
      band: "critical",
      recoverablePoints: 0,
      projectedScore: 0,
      scoreBreakdown: Object.fromEntries(
        Object.keys(CATEGORY_MAX).map((category) => [category, 0])
      ),
      scoreMax: { ...CATEGORY_MAX },
      checks: [],
      recommendations: [
        {
          priority: "critical",
          category: "blockers",
          checkId: "audit.http_status",
          points: 0,
          action: `The page returned HTTP ${page.status}. Fix the server response (or the WAF rule) before auditing content.`
        }
      ],
      details: emptyDetails(baseUrl),
      error: `HTTP ${page.status}`
    };
  }
  const doc = HtmlDoc.parse(page.body);
  const schemaResult = auditSchema(doc);
  const metaResult = auditMeta(doc, page.headers);
  const contentResult = auditContent(doc, page.url);
  const signalsResult = auditSignals(doc, schemaResult.data);
  const brandResult = auditBrand(doc, schemaResult.data, metaResult.data, contentResult.data);
  const includeAiDiscovery = options.includeAiDiscovery !== false;
  const [robotsRes, llmsRes, llmsFullRes, wellKnown, summary, faq, service] = await Promise.all([
    fetchQuiet(fetcher, rootUrl(baseUrl, "/robots.txt"), {
      timeoutMs: options.timeoutMs,
      accept: "text/plain,*/*"
    }),
    fetchQuiet(fetcher, rootUrl(baseUrl, "/llms.txt"), {
      timeoutMs: options.timeoutMs,
      accept: "text/plain,*/*"
    }),
    fetchQuiet(fetcher, rootUrl(baseUrl, "/llms-full.txt"), {
      timeoutMs: options.timeoutMs,
      accept: "text/plain,*/*"
    }),
    includeAiDiscovery ? fetchQuiet(fetcher, rootUrl(baseUrl, "/.well-known/ai.txt"), {
      timeoutMs: options.timeoutMs
    }) : Promise.resolve(null),
    includeAiDiscovery ? fetchQuiet(fetcher, rootUrl(baseUrl, "/ai/summary.json"), {
      timeoutMs: options.timeoutMs
    }) : Promise.resolve(null),
    includeAiDiscovery ? fetchQuiet(fetcher, rootUrl(baseUrl, "/ai/faq.json"), {
      timeoutMs: options.timeoutMs
    }) : Promise.resolve(null),
    includeAiDiscovery ? fetchQuiet(fetcher, rootUrl(baseUrl, "/ai/service.json"), {
      timeoutMs: options.timeoutMs
    }) : Promise.resolve(null)
  ]);
  const robotsResult = auditRobots(
    robotsRes?.status === 200 ? robotsRes.body : null,
    robotsRes?.status ?? 0
  );
  const llmsResult = auditLlms(
    llmsRes?.status === 200 ? llmsRes.body : null,
    llmsRes?.status ?? 0,
    llmsFullRes?.status === 200 ? llmsFullRes.body : null
  );
  const discoveryResult = auditAiDiscovery({
    wellKnownAi: toEndpoint(wellKnown),
    summary: toEndpoint(summary),
    faq: toEndpoint(faq),
    service: toEndpoint(service)
  });
  const checks = [
    ...robotsResult.checks,
    ...llmsResult.checks,
    ...schemaResult.checks,
    ...metaResult.checks,
    ...contentResult.checks,
    ...signalsResult.checks,
    ...brandResult.checks,
    ...discoveryResult.checks
  ];
  const scoreBreakdown = computeBreakdown(checks);
  const score = scoreOf(scoreBreakdown);
  const recoverablePoints = checks.filter((check) => check.max > check.earned).reduce((sum, check) => sum + (check.max - check.earned), 0);
  const projectedScore = Math.min(100, score + recoverablePoints);
  return {
    url: baseUrl,
    finalUrl: page.url,
    httpStatus: page.status,
    pageSize: page.body.length,
    durationMs: Date.now() - started,
    score,
    band: bandOf(score),
    recoverablePoints,
    projectedScore,
    scoreBreakdown,
    scoreMax: { ...CATEGORY_MAX },
    checks,
    recommendations: buildRecommendations(checks),
    details: {
      robots: robotsResult.data,
      llms: llmsResult.data,
      schema: schemaResult.data,
      meta: metaResult.data,
      content: contentResult.data,
      signals: signalsResult.data,
      brand_entity: brandResult.data,
      ai_discovery: discoveryResult.data
    }
  };
}
__name(runGeoAudit, "runGeoAudit");
function toEndpoint(result) {
  if (!result) return { status: 0, body: null };
  return { status: result.status, body: result.body };
}
__name(toEndpoint, "toEndpoint");

// src/freeread/analytics.ts
var clamp = /* @__PURE__ */ __name((text, max = 80) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}\u2026` : flat;
}, "clamp");
function findTagIds(html) {
  const unique = /* @__PURE__ */ __name((matches) => [...new Set(matches ?? [])], "unique");
  return {
    ga4: unique(html.match(/\bG-[A-Z0-9]{6,12}\b/g)),
    ua: unique(html.match(/\bUA-\d{4,10}-\d{1,4}\b/g)),
    gtm: unique(html.match(/\bGTM-[A-Z0-9]{5,9}\b/g)),
    ads: unique(html.match(/\bAW-\d{9,12}\b/g))
  };
}
__name(findTagIds, "findTagIds");
function sitemapFacts(xml) {
  if (!xml) return { urls: 0, lastmods: 0, index: false };
  const urls = (xml.match(/<url>/g) ?? []).length;
  const sitemaps = (xml.match(/<sitemap>/g) ?? []).length;
  const lastmods = (xml.match(/<lastmod>/g) ?? []).length;
  return { urls, lastmods, index: sitemaps > 0 && urls === 0 };
}
__name(sitemapFacts, "sitemapFacts");
function ga4Table(input, html) {
  const ids = findTagIds(html);
  const consentMode = /gtag\(\s*['"]consent['"]/.test(html) || /consent\s*:\s*\{/.test(html);
  const gtagLoads = (html.match(/googletagmanager\.com\/gtag\/js/g) ?? []).length;
  const gtmLoads = (html.match(/googletagmanager\.com\/gtm\.js/g) ?? []).length;
  const dataLayer = /dataLayer\s*=/.test(html);
  const serverSide = /measurementProtocol|mp\/collect|\/g\/collect/i.test(html);
  const rows = [
    {
      label: "GA4 measurement IDs",
      value: ids.ga4.length ? ids.ga4.join(", ") : "none",
      status: ids.ga4.length === 1 ? "pass" : ids.ga4.length === 0 ? "fail" : "warn",
      note: ids.ga4.length > 1 ? "More than one GA4 property on the page: sessions can be double-counted." : ""
    },
    {
      label: "Universal Analytics",
      value: ids.ua.length ? ids.ua.join(", ") : "none",
      status: ids.ua.length ? "fail" : "pass",
      note: ids.ua.length ? "UA stopped collecting in 2023 \u2014 this tag is dead weight." : ""
    },
    {
      label: "Tag Manager containers",
      value: ids.gtm.length ? ids.gtm.join(", ") : "none",
      status: ids.gtm.length === 1 ? "pass" : ids.gtm.length === 0 ? "warn" : "warn",
      note: ids.gtm.length > 1 ? "Several containers: the deployment order decides which one wins." : ""
    },
    {
      label: "Loader duplication",
      value: `gtag ${gtagLoads} \xB7 gtm ${gtmLoads}`,
      status: gtagLoads + gtmLoads <= 1 ? "pass" : "warn",
      note: gtagLoads + gtmLoads > 1 ? "Two loaders on the same page is the classic source of duplicated events." : ""
    },
    { label: "dataLayer initialised", value: dataLayer ? "yes" : "no", status: dataLayer ? "pass" : "fail" },
    {
      label: "Consent mode",
      value: consentMode ? "declared" : "not found",
      status: consentMode ? "pass" : "warn",
      note: consentMode ? "" : "No consent signal in the HTML: EEA measurement depends on it."
    },
    {
      label: "Server-side hints",
      value: serverSide ? "collect endpoint referenced" : "none",
      status: "info",
      note: serverSide ? "" : "No sGTM/MP reference in the page source \u2014 expected on static sites."
    },
    { label: "Ads conversion IDs", value: ids.ads.length ? ids.ads.join(", ") : "none", status: "info" }
  ];
  return {
    id: "ga4.readiness",
    title: "GA4 \u2014 measurement readiness",
    subtitle: "Read from the served HTML. No Google account required.",
    rows
  };
}
__name(ga4Table, "ga4Table");
function gscTable(input) {
  const verification = input.doc.metaByName("google-site-verification")?.attrs.content ?? "";
  const host = (() => {
    try {
      return new URL(input.finalUrl).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  const sitemap = sitemapFacts(input.sitemapXml);
  const robotsSitemaps = (input.robotsTxt ?? "").match(/^sitemap:\s*\S+/gim) ?? [];
  const robotsBlocksAll = /user-agent:\s*\*[\s\S]*?disallow:\s*\/\s*($|\n)/i.test(input.robotsTxt ?? "");
  const noindex = (input.headers["x-robots-tag"] ?? "").toLowerCase().includes("noindex");
  const canonical = input.doc.linkByRel("canonical")?.attrs.href ?? "";
  const rows = [
    {
      label: "Verification meta",
      value: verification ? "google-site-verification present" : "not found",
      status: verification ? "pass" : "info",
      note: verification ? "" : "A DNS or file verification may still exist \u2014 this only checks the meta tag."
    },
    {
      label: "robots.txt",
      value: input.robotsTxt ? `${input.robotsTxt.split(/\r?\n/).length} line(s)` : "missing",
      status: !input.robotsTxt ? "fail" : robotsBlocksAll ? "fail" : "pass",
      note: robotsBlocksAll ? "robots.txt blocks everything for all agents." : ""
    },
    {
      label: "Sitemap declared in robots.txt",
      value: robotsSitemaps.length ? `${robotsSitemaps.length}` : "none",
      status: robotsSitemaps.length ? "pass" : "warn",
      note: robotsSitemaps.length ? clamp(String(robotsSitemaps[0] ?? "")) : "Declare the sitemap so Search Console finds it."
    },
    {
      label: "Sitemap",
      value: input.sitemapXml ? `${sitemap.urls} URL(s)${sitemap.index ? " \xB7 index file" : ""}` : "missing",
      status: !input.sitemapXml ? "fail" : sitemap.urls > 0 ? "pass" : "warn"
    },
    {
      label: "Lastmod coverage",
      value: input.sitemapXml && sitemap.urls ? `${Math.round(sitemap.lastmods / sitemap.urls * 100)}%` : "n/a",
      status: !input.sitemapXml ? "info" : sitemap.lastmods ? "pass" : "warn",
      note: sitemap.lastmods ? "" : "No lastmod: recrawl decisions fall back to guesswork."
    },
    {
      label: "Indexability",
      value: noindex ? "noindex header" : "indexable",
      status: noindex ? "fail" : "pass"
    },
    {
      label: "Canonical host",
      value: canonical ? clamp(canonical, 50) : "missing",
      status: canonical.includes(host) ? "pass" : canonical ? "warn" : "fail",
      note: canonical && !canonical.includes(host) ? "Canonical points at another host." : ""
    }
  ];
  return {
    id: "gsc.readiness",
    title: "Search Console \u2014 indexation readiness",
    subtitle: "Read from the page, robots.txt and sitemap. No Google account required.",
    rows
  };
}
__name(gscTable, "gscTable");
var TRAFFIC_SAMPLE = {
  ga4: {
    period: "Last 28 days",
    rows: [
      { label: "Sessions", value: "18,420" },
      { label: "Engaged sessions", value: "11,905 (64.6%)" },
      { label: "Key events", value: "412" },
      { label: "Top landing page", value: "/tarifs \u2014 3,180 sessions" },
      { label: "Organic share", value: "58%" }
    ]
  },
  gsc: {
    period: "Last 28 days",
    rows: [
      { label: "Clicks", value: "2,940" },
      { label: "Impressions", value: "184,200" },
      { label: "Average CTR", value: "1.6%" },
      { label: "Average position", value: "14.2" },
      { label: "Top query", value: "dpe maison \u2014 610 clicks" }
    ]
  }
};
function trafficTable(id, data, connected) {
  const payload = data ?? TRAFFIC_SAMPLE[id];
  return {
    id: `${id}.traffic`,
    title: id === "ga4" ? "GA4 \u2014 traffic report" : "Search Console \u2014 performance report",
    subtitle: connected ? `${payload.period} \xB7 read from the connected property (read-only).` : `${payload.period} \xB7 illustrative sample, not your property.`,
    connected,
    sample: !connected,
    rows: payload.rows.map((row) => ({ label: row.label, value: row.value, status: "info" }))
  };
}
__name(trafficTable, "trafficTable");

// src/freeread/seo.ts
var clamp2 = /* @__PURE__ */ __name((text, max = 90) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}\u2026` : flat;
}, "clamp");
var status = /* @__PURE__ */ __name((ok, warn = false) => ok ? "pass" : warn ? "warn" : "fail", "status");
function lengthRow(label, value, min, max, hint) {
  const length = value.trim().length;
  if (!length) return { label, value: "missing", status: "fail", note: hint };
  const ok = length >= min && length <= max;
  return {
    label,
    value: `${length} chars`,
    status: status(ok, length > 0),
    note: ok ? clamp2(value) : `${hint} Currently: \u201C${clamp2(value, 70)}\u201D`
  };
}
__name(lengthRow, "lengthRow");
function headingOutline(doc) {
  const levels = doc.all("h2").length;
  const threes = doc.all("h3").length;
  const first = doc.first("h2");
  const sample = first ? doc.textOf(first) : "";
  return `H1 ${doc.all("h1").length} \xB7 H2 ${levels} \xB7 H3 ${threes}${sample ? ` \xB7 first H2: \u201C${clamp2(sample, 48)}\u201D` : ""}`;
}
__name(headingOutline, "headingOutline");
function schemaTypes(doc) {
  const types = /* @__PURE__ */ new Set();
  let blocks = 0;
  let errors = 0;
  for (const node of doc.all("script")) {
    if ((node.attrs.type ?? "").toLowerCase() !== "application/ld+json") continue;
    blocks += 1;
    try {
      const parsed = JSON.parse(doc.textOf(node));
      const collect = /* @__PURE__ */ __name((value) => {
        if (Array.isArray(value)) {
          value.forEach(collect);
          return;
        }
        if (value && typeof value === "object") {
          const record = value;
          const type = record["@type"];
          if (typeof type === "string") types.add(type);
          if (Array.isArray(type)) type.filter((item) => typeof item === "string").forEach((item) => types.add(item));
          if (record["@graph"]) collect(record["@graph"]);
        }
      }, "collect");
      collect(parsed);
    } catch {
      errors += 1;
    }
  }
  return { types: [...types], blocks, errors };
}
__name(schemaTypes, "schemaTypes");
function linkCounts(doc, finalUrl) {
  let host = "";
  try {
    host = new URL(finalUrl).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }
  let internal = 0;
  let external = 0;
  let empty = 0;
  for (const node of doc.all("a")) {
    const href = (node.attrs.href ?? "").trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      empty += 1;
      continue;
    }
    try {
      const resolved = new URL(href, finalUrl);
      if (resolved.hostname.replace(/^www\./, "") === host) internal += 1;
      else external += 1;
    } catch {
      empty += 1;
    }
  }
  return { internal, external, empty };
}
__name(linkCounts, "linkCounts");
function imageStats(doc) {
  const images = doc.all("img");
  return {
    total: images.length,
    missingAlt: images.filter((node) => !(node.attrs.alt ?? "").trim()).length
  };
}
__name(imageStats, "imageStats");
function seoTables(doc, finalUrl, headers) {
  const title = doc.title() ?? "";
  const description = (doc.metaByName("description")?.attrs.content ?? "").trim();
  const canonicalNode = doc.linkByRel("canonical");
  const canonical = canonicalNode?.attrs.href ?? "";
  const robotsMeta = (doc.metaByName("robots")?.attrs.content ?? "").toLowerCase();
  const lang = doc.htmlLang() ?? "";
  const bodyText = doc.bodyText();
  const words = countWords(bodyText);
  const h1s = doc.all("h1");
  const outline = headingOutline(doc);
  const schema = schemaTypes(doc);
  const links = linkCounts(doc, finalUrl);
  const images = imageStats(doc);
  const hreflang = doc.all("link").filter((node) => (node.attrs.rel ?? "").toLowerCase() === "alternate" && node.attrs.hreflang);
  const ogTitle = (doc.metaByProperty("og:title")?.attrs.content ?? "").trim();
  const ogImage = (doc.metaByProperty("og:image")?.attrs.content ?? "").trim();
  const xRobots = headers["x-robots-tag"] ?? "";
  let canonicalStatus = "fail";
  let canonicalNote = "No canonical link: the page has no declared identity.";
  if (canonical) {
    try {
      const resolved = new URL(canonical, finalUrl);
      const self = resolved.href.replace(/\/$/, "") === finalUrl.replace(/\/$/, "");
      canonicalStatus = self ? "pass" : "warn";
      canonicalNote = self ? clamp2(canonical) : `Points elsewhere: ${clamp2(canonical)}`;
    } catch {
      canonicalStatus = "fail";
      canonicalNote = "Canonical is not a valid URL.";
    }
  }
  return [
    {
      id: "seo.meta",
      title: "SEO \u2014 metadata",
      subtitle: "Measured on the HTML returned by the server.",
      rows: [
        lengthRow("Title", title, 20, 60, "Aim for 20\u201360 characters so the title survives a snippet."),
        lengthRow("Meta description", description, 70, 160, "Aim for 70\u2013160 characters: engines reuse it verbatim."),
        { label: "Canonical", value: canonical ? clamp2(canonical, 60) : "missing", status: canonicalStatus, note: canonicalNote },
        {
          label: "Robots meta",
          value: robotsMeta || "index, follow (default)",
          status: robotsMeta.includes("noindex") ? "fail" : "pass",
          note: robotsMeta.includes("noindex") ? "The page asks not to be indexed." : "Indexable."
        },
        {
          label: "X-Robots-Tag",
          value: xRobots || "none",
          status: xRobots.toLowerCase().includes("noindex") ? "fail" : "pass"
        },
        { label: "html lang", value: lang || "missing", status: lang ? "pass" : "fail", note: lang ? "" : "Declare the language: engines use it for language targeting." },
        { label: "Open Graph", value: ogTitle ? "og:title present" : "missing", status: ogTitle ? "pass" : "warn", note: ogImage ? "og:image present" : "No og:image: link previews render empty." },
        { label: "hreflang", value: `${hreflang.length} alternate(s)`, status: hreflang.length ? "pass" : "info", note: hreflang.length ? "Declared language variants." : "Single-language page." }
      ]
    },
    {
      id: "seo.content",
      title: "SEO \u2014 content structure",
      subtitle: "Word counts and headings as an engine parses them.",
      rows: [
        {
          label: "H1",
          value: h1s.length === 0 ? "missing" : `${h1s.length} \xB7 \u201C${clamp2(doc.textOf(h1s[0]), 60)}\u201D`,
          status: h1s.length === 1 ? "pass" : h1s.length === 0 ? "fail" : "warn",
          note: h1s.length > 1 ? "Several H1s: the page states more than one main topic." : ""
        },
        { label: "Outline", value: outline, status: doc.all("h2").length >= 2 ? "pass" : "warn", note: doc.all("h2").length >= 2 ? "" : "Fewer than two H2s: the structure is hard to excerpt." },
        { label: "Words", value: `${words}`, status: words >= 300 ? "pass" : words >= 120 ? "warn" : "fail", note: words >= 300 ? "" : "Thin page: little to quote." },
        { label: "Tables", value: `${doc.all("table").length}`, status: doc.all("table").length ? "pass" : "info", note: doc.all("table").length ? "" : "No table: comparisons stay unquotable." },
        { label: "Lists", value: `${doc.all("li").length} item(s)`, status: doc.all("li").length >= 3 ? "pass" : "info" },
        { label: "Blockquotes", value: `${doc.all("blockquote").length}`, status: doc.all("blockquote").length ? "pass" : "info", note: doc.all("blockquote").length ? "" : "No quotation: assistants rarely quote what is not already a quote." }
      ]
    },
    {
      id: "seo.technical",
      title: "SEO \u2014 links, media and structured data",
      rows: [
        { label: "Internal links", value: `${links.internal}`, status: links.internal >= 3 ? "pass" : "warn", note: links.internal >= 3 ? "" : "Few internal links: weak crawl paths." },
        { label: "External links", value: `${links.external}`, status: links.external >= 1 ? "pass" : "warn", note: links.external >= 1 ? "" : "No outbound citation: claims are unsourced." },
        { label: "Empty or anchor links", value: `${links.empty}`, status: links.empty > links.internal + links.external ? "warn" : "pass" },
        { label: "Images", value: `${images.total}`, status: "info" },
        {
          label: "Images without alt",
          value: `${images.missingAlt}`,
          status: images.missingAlt === 0 ? "pass" : images.missingAlt === images.total ? "fail" : "warn",
          note: images.missingAlt ? `${images.missingAlt} of ${images.total} carry no alt text.` : ""
        },
        {
          label: "JSON-LD blocks",
          value: `${schema.blocks}${schema.errors ? ` \xB7 ${schema.errors} parse error(s)` : ""}`,
          status: schema.blocks === 0 ? "fail" : schema.errors ? "warn" : "pass"
        },
        {
          label: "Schema types",
          value: schema.types.length ? schema.types.join(", ") : "none",
          status: schema.types.length ? "pass" : "fail",
          note: schema.types.includes("Article") ? "" : "No Article: editorial pages cannot carry authors or dates."
        }
      ]
    }
  ];
}
__name(seoTables, "seoTables");

// src/freeread/index.ts
var SITEMAP_CANDIDATES = ["/sitemap.xml", "/sitemap_index.xml"];
var keyOf = /* @__PURE__ */ __name((value) => {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return value;
  }
}, "keyOf");
function withSeeds(seeds, fetcher) {
  return async (url, init) => {
    const key = keyOf(url);
    const seed = seeds.get(key);
    if (seed) {
      seeds.delete(key);
      return seed;
    }
    return fetcher(url, init);
  };
}
__name(withSeeds, "withSeeds");
async function tryFetch(fetcher, url, accept, timeoutMs) {
  if (!fetcher) return null;
  try {
    const result = await fetcher(url, { accept, timeoutMs });
    return result.status >= 200 && result.status < 300 ? result : null;
  } catch {
    return null;
  }
}
__name(tryFetch, "tryFetch");
async function runFreeRead(options) {
  const fetcher = options.fetcher ?? fetchText;
  const timeoutMs = options.timeoutMs ?? 12e3;
  const started = Date.now();
  const page = await fetcher(options.url, { accept: "text/html,application/xhtml+xml", timeoutMs });
  const finalUrl = page.url || options.url;
  const origin = new URL(finalUrl).origin;
  const robots = await tryFetch(fetcher, `${origin}/robots.txt`, "text/plain", timeoutMs);
  const sitemapResults = await Promise.all(
    SITEMAP_CANDIDATES.map((path) => tryFetch(fetcher, `${origin}${path}`, "application/xml,text/xml", timeoutMs))
  );
  const sitemap = sitemapResults.find(Boolean) ?? null;
  const seeds = /* @__PURE__ */ new Map();
  seeds.set(keyOf(finalUrl), page);
  seeds.set(keyOf(options.url), page);
  if (robots) seeds.set(keyOf(robots.url || `${origin}/robots.txt`), robots);
  const audit = await runGeoAudit({
    url: options.url,
    fetcher: withSeeds(seeds, fetcher),
    timeoutMs
  });
  const doc = HtmlDoc.parse(page.body);
  const analyticsInput = {
    doc,
    finalUrl,
    robotsTxt: robots?.body ?? null,
    sitemapXml: sitemap?.body ?? null,
    headers: page.headers
  };
  const traffic = options.traffic;
  const tables = [
    ...seoTables(doc, finalUrl, page.headers),
    ga4Table(analyticsInput, page.body),
    gscTable(analyticsInput),
    trafficTable("ga4", traffic?.ga4 ?? null, Boolean(traffic?.connected && traffic?.ga4)),
    trafficTable("gsc", traffic?.gsc ?? null, Boolean(traffic?.connected && traffic?.gsc))
  ];
  const host = (() => {
    try {
      return new URL(finalUrl).hostname;
    } catch {
      return options.url;
    }
  })();
  return {
    url: options.url,
    finalUrl,
    httpStatus: page.status,
    durationMs: Date.now() - started,
    score: audit.score,
    band: audit.band,
    projectedScore: audit.projectedScore,
    recoverablePoints: audit.recoverablePoints,
    headline: [
      { label: "GEO score", value: `${audit.score}/100` },
      { label: "Projected", value: `${audit.projectedScore}/100` },
      { label: "Recoverable", value: `${audit.recoverablePoints} pts` },
      { label: "Host", value: host }
    ],
    topFixes: audit.recommendations.slice(0, 3).map((rec) => ({
      checkId: rec.checkId,
      points: rec.points,
      action: rec.action
    })),
    tables,
    limitations: [
      "The GEO score covers the audited page only, not the whole site.",
      "GA4 and Search Console traffic rows are sample data unless a property is connected.",
      "No AI engine is queried: readiness is measured, citations are not claimed."
    ]
  };
}
__name(runFreeRead, "runFreeRead");

// src/leads/validate.ts
var EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
var MAX = { name: 120, email: 200, website: 300, goal: 120, source: 60 };
var GOALS = [
  "Full GEO audit",
  "GTM / GA4 measurement",
  "llms.txt and schema implementation",
  "Competitive positioning review",
  "Not sure yet"
];
var GOALS_FR = [
  "Audit GEO complet",
  "Mesure GTM / GA4",
  "Impl\xE9mentation llms.txt et schema",
  "Analyse de positionnement concurrentiel",
  "Pas encore d\xE9cid\xE9"
];
var asText = /* @__PURE__ */ __name((value) => typeof value === "string" ? value.trim() : "", "asText");
var webcrypto = globalThis.crypto;
var uuid = /* @__PURE__ */ __name(() => typeof webcrypto?.randomUUID === "function" ? webcrypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`, "uuid");
function normalizeWebsite(value) {
  const raw = value.trim();
  if (!raw) return "";
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_|^gclid$|^fbclid$|^msclkid$/.test(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.href;
  } catch {
    return raw;
  }
}
__name(normalizeWebsite, "normalizeWebsite");
function validateLead(input, options = {}) {
  const errors = [];
  const name = asText(input.name);
  const email = asText(input.email);
  const website = normalizeWebsite(asText(input.website));
  const goal = asText(input.goal) || GOALS[0];
  const source = asText(input.source) || "landing";
  if (asText(input.company)) return { ok: false, errors: ["rejected"] };
  const minElapsed = options.minElapsedMs ?? 1200;
  const elapsed = Number(input.elapsedMs ?? minElapsed);
  if (Number.isFinite(elapsed) && elapsed < minElapsed) return { ok: false, errors: ["rejected"] };
  if (name.length < 2) errors.push("name");
  if (!EMAIL.test(email) || email.length > MAX.email) errors.push("email");
  if (!website) errors.push("website");
  if (name.length > MAX.name) errors.push("name");
  if (website.length > MAX.website) errors.push("website");
  if (goal.length > MAX.goal) errors.push("goal");
  if (source.length > MAX.source) errors.push("source");
  const known = [...GOALS, ...GOALS_FR];
  const goalValue = known.includes(goal) ? goal : "Not sure yet";
  if (errors.length) return { ok: false, errors: [...new Set(errors)] };
  return {
    ok: true,
    lead: {
      id: uuid(),
      receivedAt: (options.now ?? /* @__PURE__ */ new Date()).toISOString(),
      name,
      email,
      website,
      goal: goalValue,
      source
    }
  };
}
__name(validateLead, "validateLead");

// src/worker/index.ts
var JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
var MAX_BODY_BYTES = 8 * 1024;
var READ_TIMEOUT_MS = 12e3;
var CACHE_TTL_SECONDS = 600;
function isBlockedHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "metadata.google.internal") return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  const v6 = host.replace(/%.*$/, "");
  if (v6 === "::1" || v6 === "::") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true;
  if (/^fe80:/.test(v6)) return true;
  return false;
}
__name(isBlockedHost, "isBlockedHost");
function checkTarget(raw) {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, reason: "url is required" };
  const trimmed = raw.trim();
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return { ok: false, reason: "invalid url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "only http(s) is supported" };
  if (url.username || url.password) return { ok: false, reason: "credentials in the url are not allowed" };
  if (!url.hostname.includes(".")) return { ok: false, reason: "host must be a public domain" };
  if (isBlockedHost(url.hostname)) return { ok: false, reason: "private addresses are not allowed" };
  return { ok: true, url: url.href };
}
__name(checkTarget, "checkTarget");
function allowedOrigins(env) {
  return (env.SITE_ORIGINS ?? "").split(",").map((value) => value.trim().replace(/\/$/, "")).filter(Boolean);
}
__name(allowedOrigins, "allowedOrigins");
function corsHeaders(origin, env) {
  const allowed = allowedOrigins(env);
  const list = allowed.length ? allowed : ["*"];
  const value = origin && (list.includes("*") || list.includes(origin.replace(/\/$/, ""))) ? origin : list[0];
  return {
    "Access-Control-Allow-Origin": value,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin"
  };
}
__name(corsHeaders, "corsHeaders");
async function underLimit(env, bucket, ip, limit, now = Date.now()) {
  if (!env.RATE) return true;
  const window = Math.floor(now / 6e4);
  const key = `rl:${bucket}:${ip}:${window}`;
  const current = Number(await env.RATE.get(key) ?? "0");
  if (current >= limit) return false;
  await env.RATE.put(key, String(current + 1), { expirationTtl: 120 });
  return true;
}
__name(underLimit, "underLimit");
var json = /* @__PURE__ */ __name((body, status2, headers = {}) => new Response(JSON.stringify(body), { status: status2, headers: { ...JSON_HEADERS, ...headers } }), "json");
async function readJsonBody(request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return { ok: false, error: "payload too large" };
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { ok: false, error: "payload too large" };
  try {
    const parsed = JSON.parse(text || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, error: "invalid body" };
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, error: "invalid json" };
  }
}
__name(readJsonBody, "readJsonBody");
async function handleLead(request, env, ctx) {
  const headers = corsHeaders(request.headers.get("origin"), env);
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const limit = Number(env.RATE_LIMIT ?? 5) || 5;
  if (!await underLimit(env, "lead", ip, limit)) {
    return json({ error: "Too many requests \u2014 try again shortly." }, 429, headers);
  }
  const body = await readJsonBody(request);
  if (!body.ok || !body.value) return json({ error: body.error ?? "invalid body" }, 400, headers);
  const validation = validateLead(body.value);
  if (!validation.ok || !validation.lead) {
    if (validation.errors?.includes("rejected")) return json({ ok: true }, 202, headers);
    return json({ error: "Invalid submission", fields: validation.errors ?? [] }, 400, headers);
  }
  const lead = validation.lead;
  if (env.LEADS) {
    ctx.waitUntil(env.LEADS.put(`lead:${lead.receivedAt}:${lead.id}`, JSON.stringify(lead), { expirationTtl: 60 * 60 * 24 * 180 }));
  }
  const forward = env.LEAD_FORWARD_URL;
  if (forward) {
    const payload = { ...lead, _subject: `GEO report request \u2014 ${lead.website}` };
    ctx.waitUntil(
      fetch(forward, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload)
      }).catch(() => void 0)
    );
  }
  return json({ ok: true, id: lead.id }, 201, headers);
}
__name(handleLead, "handleLead");
async function handleFreeRead(request, env, ctx) {
  const headers = corsHeaders(request.headers.get("origin"), env);
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const limit = Number(env.RATE_LIMIT ?? 8) || 8;
  if (!await underLimit(env, "read", ip, limit)) {
    return json({ error: "Too many reads \u2014 try again in a minute." }, 429, headers);
  }
  const body = await readJsonBody(request);
  if (!body.ok || !body.value) return json({ error: body.error ?? "invalid body" }, 400, headers);
  const check = checkTarget(body.value.url);
  if (!check.ok || !check.url) return json({ error: check.reason ?? "invalid url" }, 400, headers);
  const cacheKey = new Request(`https://cache.internal/free-read?url=${encodeURIComponent(check.url.toLowerCase())}`);
  let cache;
  try {
    cache = caches?.default;
  } catch {
    cache = void 0;
  }
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const cached = await hit.json();
        return json({ ...cached, cached: true }, 200, headers);
      }
    } catch {
      cache = void 0;
    }
  }
  try {
    const result = await runFreeRead({ url: check.url, timeoutMs: READ_TIMEOUT_MS });
    if (cache) {
      ctx.waitUntil(
        cache.put(
          cacheKey,
          new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}` }
          })
        ).catch(() => void 0)
      );
    }
    return json(result, 200, headers);
  } catch (error) {
    console.error("free-read failed", error instanceof Error ? error.message : String(error));
    return json({ error: "The site could not be read. Check that it is publicly reachable." }, 502, headers);
  }
}
__name(handleFreeRead, "handleFreeRead");
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin"), env) });
    }
    if (url.pathname === "/health" && request.method === "GET") {
      return json({ status: "ok", runtime: "worker" }, 200);
    }
    if (url.pathname === "/api/lead" && request.method === "POST") return handleLead(request, env, ctx);
    if (url.pathname === "/api/free-read" && request.method === "POST") return handleFreeRead(request, env, ctx);
    return json({ error: "not found", routes: ["POST /api/lead", "POST /api/free-read", "GET /health"] }, 404);
  }
};
export {
  allowedOrigins,
  checkTarget,
  corsHeaders,
  index_default as default,
  handleFreeRead,
  handleLead,
  isBlockedHost,
  underLimit
};
//# sourceMappingURL=index.js.map
