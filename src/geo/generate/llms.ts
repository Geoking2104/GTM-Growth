import type { SitemapEntry } from "../sitemap.js";

export interface LlmsTxtOptions {
  baseUrl: string;
  entries: SitemapEntry[];
  siteName?: string;
  description?: string;
  maxLinksPerSection?: number;
}

interface Section {
  title: string;
  /** Path segments that map to this section. */
  segments: string[];
}

const SECTIONS: Section[] = [
  {
    title: "Product",
    segments: [
      "product",
      "products",
      "pricing",
      "features",
      "solutions",
      "use-cases",
      "integrations",
      "platform",
      "industries",
    ],
  },
  {
    title: "Documentation",
    segments: [
      "docs",
      "doc",
      "documentation",
      "api",
      "reference",
      "guides",
      "guide",
      "help",
      "developers",
      "developer",
    ],
  },
  {
    title: "Blog",
    segments: [
      "blog",
      "news",
      "newsroom",
      "articles",
      "article",
      "resources",
      "insights",
      "posts",
      "post",
      "learn",
      "stories",
    ],
  },
  {
    title: "Company",
    segments: [
      "about",
      "company",
      "team",
      "careers",
      "jobs",
      "contact",
      "customers",
      "partners",
      "press",
    ],
  },
  {
    title: "Legal",
    segments: ["privacy", "terms", "legal", "cookies", "security", "dpa", "gdpr", "trust"],
  },
];

/** Locale prefixes that should not decide the section (e.g. /en/pricing). */
const LOCALE_SEGMENTS = new Set(["en", "fr", "de", "es", "it", "nl", "pt", "ja", "zh", "ko"]);

const SKIP_RE =
  /(\/wp-(admin|json|content)\/|\/cdn-cgi\/|\/search\b|[?&](s|q|page)=\/|\/(tag|author|category)\/|\/page\/\d+|\/feed\/?$)/i;
const ASSET_RE = /\.(jpe?g|png|gif|svg|webp|avif|ico|css|js|mjs|json|xml|zip|gz|mp4|mp3|woff2?|ttf)$/i;

/** Turn a URL path into a readable link label ("/docs/get-started" → "Get Started"). */
export function urlToLabel(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    if (!path) return "Homepage";
    const last = path.split("/").filter(Boolean).pop() ?? "";
    const label = last.replace(/[-_]/g, " ").replace(/\.[a-z0-9]+$/i, "").trim();
    if (!label) return "Homepage";
    const titled = label.replace(/\b\w/g, (c) => c.toUpperCase());
    return titled.length > 80 ? `${titled.slice(0, 77)}...` : titled;
  } catch {
    return url;
  }
}

function sectionFor(url: string): string {
  const segments = new URL(url).pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
  const relevant = segments.filter((segment) => !LOCALE_SEGMENTS.has(segment));
  for (const segment of relevant) {
    const section = SECTIONS.find((candidate) => candidate.segments.includes(segment));
    if (section) return section.title;
  }
  return "Other";
}

/**
 * Generate an llms.txt from sitemap entries, following the published shape:
 * H1, blockquote summary, then H2 sections of markdown links. Entries are
 * filtered to the site's own host and ordered by sitemap priority.
 */
export function generateLlmsTxt(options: LlmsTxtOptions): string {
  const parsed = new URL(options.baseUrl);
  const domain = parsed.hostname.replace(/^www\./, "");
  const siteName =
    options.siteName ?? domain.split(".")[0].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const description =
    options.description ??
    `${siteName} — official site, documentation and product information for AI assistants and answer engines.`;
  const maxLinks = options.maxLinksPerSection ?? 20;

  const grouped = new Map<string, string[]>();
  const seen = new Set<string>();

  for (const entry of [...options.entries].sort((a, b) => b.priority - a.priority)) {
    let url: string;
    try {
      url = new URL(entry.url, options.baseUrl).toString();
    } catch {
      continue;
    }
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host !== domain && !host.endsWith(`.${domain}`)) continue;
    if (SKIP_RE.test(url) || ASSET_RE.test(new URL(url).pathname)) continue;
    if (seen.has(url)) continue;
    seen.add(url);

    const section = sectionFor(url);
    const links = grouped.get(section) ?? [];
    if (links.length >= maxLinks) continue;
    links.push(`- [${urlToLabel(url)}](${url})`);
    grouped.set(section, links);
  }

  const order = [...SECTIONS.map((section) => section.title), "Other"];
  const blocks: string[] = [`# ${siteName}`, "", `> ${description}`, ""];

  for (const title of order) {
    const links = grouped.get(title);
    if (!links?.length) continue;
    blocks.push(`## ${title}`, "", ...links, "");
  }

  if (blocks.length === 4) {
    blocks.push(
      "## Pages",
      "",
      `- [Homepage](${parsed.origin})`,
      "",
      "_Add links to the pages AI engines should cite._",
      ""
    );
  }

  blocks.push(
    "## Optional",
    "",
    "- [llms-full.txt](/llms-full.txt): expanded corpus for retrieval",
    ""
  );

  return `${blocks.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}
