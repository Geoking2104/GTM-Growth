import { HtmlDoc } from "./html.js";
import { auditSchema } from "./audit/schema.js";

const PLATFORM_DOMAINS = {
  instagram: ["instagram.com"],
  x_twitter: ["x.com", "twitter.com"],
  reddit: ["reddit.com"],
  discord: ["discord.gg", "discord.com"],
  tiktok: ["tiktok.com"],
  linkedin: ["linkedin.com"],
  facebook: ["facebook.com", "fb.com"],
  youtube: ["youtube.com", "youtu.be"],
  threads: ["threads.net"],
  pinterest: ["pinterest.com"],
  mastodon: ["mastodon.social"],
  bluesky: ["bsky.app"],
} as const;

export type SocialPlatform = keyof typeof PLATFORM_DOMAINS;

export interface SocialEvidence {
  profileUrl: string;
  /** HTML copied/exported by the account owner. Never fetched automatically. */
  html: string;
}

export interface SocialLink {
  platform: SocialPlatform;
  url: string;
  sources: Array<"anchor" | "schema_sameAs">;
  inbound: "observed_in_supplied_html" | "not_observed" | "not_checked";
}

function safeWebUrl(value: string, base?: string): URL | null {
  try {
    const parsed = new URL(value, base);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed;
  } catch { return null; }
}

function canonicalProfile(url: URL): string {
  return url.origin.toLowerCase() + url.pathname.replace(/\/+$/, "").toLowerCase();
}

function platformFor(url: URL): SocialPlatform | null {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  for (const [platform, domains] of Object.entries(PLATFORM_DOMAINS)) {
    if (domains.some(domain => hostname === domain || hostname.endsWith("." + domain))) {
      return platform as SocialPlatform;
    }
  }
  return null;
}

function referencesSite(html: string, site: URL): boolean {
  const doc = HtmlDoc.parse(html);
  const links = [
    ...doc.all("a").map(node => node.attrs.href || ""),
    ...auditSchema(doc).data.sameAsUrls,
  ];
  return links.some(link => {
    const url = safeWebUrl(link);
    return url?.hostname.toLowerCase() === site.hostname.toLowerCase();
  });
}

/** Site → social references are observed; social → site requires supplied proof. */
export function analyzeSocialLinks(siteUrl: string, html: string, evidence: readonly SocialEvidence[] = []) {
  const site = safeWebUrl(siteUrl);
  if (!site) throw new Error("An HTTP(S) site URL is required");
  const doc = HtmlDoc.parse(html);
  const sources: Array<{ url: string; source: "anchor" | "schema_sameAs" }> = [
    ...doc.all("a").map(node => ({ url: node.attrs.href || "", source: "anchor" as const })),
    ...auditSchema(doc).data.sameAsUrls.map(url => ({ url, source: "schema_sameAs" as const })),
  ];
  const found = new Map<string, SocialLink>();
  for (const item of sources) {
    const parsed = safeWebUrl(item.url, site.href);
    if (!parsed) continue;
    const platform = platformFor(parsed);
    if (!platform) continue;
    const key = canonicalProfile(parsed);
    const existing = found.get(key);
    if (existing) {
      if (!existing.sources.includes(item.source)) existing.sources.push(item.source);
    } else {
      found.set(key, { platform, url: parsed.href, sources: [item.source], inbound: "not_checked" });
    }
  }
  for (const link of found.values()) {
    const proof = evidence.find(item => {
      const parsed = safeWebUrl(item.profileUrl);
      return parsed && canonicalProfile(parsed) === canonicalProfile(new URL(link.url));
    });
    if (proof) link.inbound = referencesSite(proof.html, site) ? "observed_in_supplied_html" : "not_observed";
  }
  const links = [...found.values()].sort((a, b) => a.platform.localeCompare(b.platform) || a.url.localeCompare(b.url));
  return {
    siteUrl: site.href,
    outboundProfiles: links,
    inboundVerifiedCount: 0,
    inboundObservationCount: links.filter(link => link.inbound === "observed_in_supplied_html").length,
    notice: "Social profile backlinks are never assumed. Supplied HTML observations are not platform-API verification.",
    actions: [
      ...(links.length ? [] : ["Add official social profile links to the website and Organization sameAs schema."]),
      ...links.filter(link => link.inbound === "not_checked").map(link => `Check the ${link.platform} profile bio for a backlink to ${site.hostname}.`),
    ].slice(0, 5),
  };
}
