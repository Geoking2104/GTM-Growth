import { WEIGHTS } from "../config.js";
import type { HtmlDoc } from "../html.js";
import type { CategoryResult, GeoCheck, SchemaAudit, SignalsAudit } from "../types.js";

const FUTURE_TOLERANCE_DAYS = 1;

/**
 * Audit technical discovery signals: page language, a feed, and a believable
 * freshness date. Cheap to fix, and they tell an engine what this page is and
 * whether it is current.
 */
export function auditSignals(
  doc: HtmlDoc,
  schema: SchemaAudit
): CategoryResult<SignalsAudit> {
  const lang = doc.htmlLang();

  const feed = doc
    .all("link")
    .find((link) => /rss|atom/i.test(link.attrs.type || ""));
  const rssUrl = feed?.attrs.href?.trim() || null;

  let freshnessDate: string | null = null;
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
  const freshnessValid =
    Number.isFinite(parsed) &&
    parsed <= Date.now() + FUTURE_TOLERANCE_DAYS * 86_400_000;

  const data: SignalsAudit = { lang, rssUrl, freshnessDate };

  const check = (
    id: string,
    label: string,
    earned: number,
    max: number,
    status: GeoCheck["status"],
    evidence: string,
    fix?: string
  ): GeoCheck => ({ id, category: "signals", label, earned, max, status, evidence, fix });

  const checks: GeoCheck[] = [
    check(
      "signals.lang",
      "<html lang> declared",
      lang ? WEIGHTS.signals_lang : 0,
      WEIGHTS.signals_lang,
      lang ? "pass" : "fail",
      lang ? `lang="${lang}"` : "No lang attribute",
      lang ? undefined : 'Add lang to <html> (e.g. lang="en") so engines route the page to the right language.'
    ),
    check(
      "signals.rss",
      "RSS/Atom feed linked",
      rssUrl ? WEIGHTS.signals_rss : 0,
      WEIGHTS.signals_rss,
      rssUrl ? "pass" : "fail",
      rssUrl ?? "No feed link in <head>",
      rssUrl
        ? undefined
        : 'Add <link rel="alternate" type="application/rss+xml" href="/feed.xml"> so agents can discover new pages.'
    ),
    check(
      "signals.freshness",
      "Freshness date is valid",
      freshnessValid ? WEIGHTS.signals_freshness : 0,
      WEIGHTS.signals_freshness,
      freshnessValid ? "pass" : "fail",
      freshnessDate
        ? `dateModified/datePublished = ${freshnessDate}${freshnessValid ? "" : " (unparseable or in the future)"}`
        : "No dateModified, datePublished or article:modified_time",
      freshnessValid
        ? undefined
        : "Publish dateModified in Article/WebPage schema — AI search favors recently updated content."
    ),
  ];

  return { data, checks };
}
