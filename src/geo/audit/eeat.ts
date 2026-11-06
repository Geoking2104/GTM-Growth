import { HtmlDoc } from "../html.js";
import { fetchQuiet, fetchText, type Fetcher } from "../http.js";

export interface EeatSignal { id: string; points: number; max: number; evidence: string; }
export interface EeatDimension { score: number; max: 25; signals: EeatSignal[]; }
export interface EeatReport { url: string; score: number; experience: EeatDimension; expertise: EeatDimension; authoritativeness: EeatDimension; trustworthiness: EeatDimension; flags: string[]; }

/** Page heuristics, not a judgment of the author or content's truth. */
export function evaluateEeat(doc: HtmlDoc, url: string): EeatReport {
  const text = doc.bodyText().replace(/\s+/g, " ").trim();
  const links = doc.all("a").map(n => ({ href: n.attrs.href ?? "", text: doc.textOf(n) }));
  const schema = doc.all("script").filter(n => (n.attrs.type ?? "").toLowerCase().split(";")[0].trim() === "application/ld+json").map(n => doc.textOf(n)).join(" ");
  const signal = (id: string, max: number, match: string | undefined): EeatSignal => ({ id, max, points: match ? max : 0, evidence: match ? match.slice(0, 200) : "No matching evidence found on this page" });
  const find = (re: RegExp) => text.match(re)?.[0];
  const linkEvidence = (re: RegExp) => { const found = links.find(l => re.test(l.href + " " + l.text)); return found ? found.text + " (" + found.href + ")" : undefined; };
  const dimension = (signals: EeatSignal[]): EeatDimension => ({ score: signals.reduce((n, s) => n + s.points, 0), max: 25, signals });
  const experience = dimension([
    signal("original_research", 7, find(/\b(?:our (?:study|research|analysis)|we (?:tested|measured|surveyed)|notre (?:étude|recherche)|nous avons (?:testé|mesuré))\b/i)),
    signal("case_study", 6, find(/\b(?:case study|étude de cas)\b/i)),
    signal("specific_outcomes", 6, find(/\b\d+(?:[.,]\d+)?\s*(?:%|percent|pour cent)/i)),
    signal("methodology", 6, find(/\b(?:methodology|methods|méthodologie|méthode)\b/i)),
  ]);
  const expertise = dimension([
    signal("byline", 7, doc.metaByName("author")?.attrs.content || find(/\b(?:written by|author|écrit par|auteur)\s*[:：]?\s+[\p{L}][\p{L}'’-]+(?:\s+[\p{L}][\p{L}'’-]+)+/iu)),
    signal("author_link", 6, linkEvidence(/\/(?:author|authors|auteur|team)\//i)),
    signal("credentials", 6, find(/\b(?:phd|doctorate|certified|certifié|professor|professeur)\b/i)),
    signal("person_schema", 6, /"@type"\s*:\s*"Person"/i.test(schema) && /"(?:jobTitle|knowsAbout)"\s*:/i.test(schema) ? "Person JSON-LD includes jobTitle or knowsAbout" : undefined),
  ]);
  const authoritativeness = dimension([
    signal("about", 7, linkEvidence(/\/(?:about|company|a-propos|qui-sommes-nous)(?:[/?#]|$)/i)),
    signal("external_citation", 6, links.find(l => { try { const u = new URL(l.href, url); return /^https?:$/.test(u.protocol) && u.hostname !== new URL(url).hostname; } catch { return false; } })?.href),
    signal("same_as", 6, /"sameAs"\s*:/i.test(schema) ? "JSON-LD contains sameAs" : undefined),
    signal("press", 6, find(/\b(?:press coverage|featured in|as seen in|dans la presse)\b/i)),
  ]);
  const trustworthiness = dimension([
    signal("https", 5, new URL(url).protocol === "https:" ? "Page uses HTTPS" : undefined),
    signal("contact", 5, linkEvidence(/(?:\/contact|mailto:|tel:)/i)),
    signal("privacy", 5, linkEvidence(/(?:privacy|confidentialit[ée]|\/terms|conditions-g[ée]n[ée]rales)/i)),
    signal("editorial", 5, linkEvidence(/(?:editorial|[ée]ditorial|ethics|[ée]thique)/i)),
    signal("date", 5, doc.metaByProperty("article:published_time")?.attrs.content || doc.metaByName("date")?.attrs.content || doc.all("time").find(n => n.attrs.datetime)?.attrs.datetime || (/"date(?:Published|Modified)"\s*:/i.test(schema) ? "Publication or modification date in JSON-LD" : undefined)),
  ]);
  const generic = find(/\b(?:in today’s fast-paced world|in today's fast-paced world|dans le monde d'aujourd'hui)\b/i);
  const flags = generic ? ["Generic phrase: " + generic] : [];
  return { url, score: experience.score + expertise.score + authoritativeness.score + trustworthiness.score, experience, expertise, authoritativeness, trustworthiness, flags };
}

export async function runEeatAudit(options: { url: string; fetcher?: Fetcher }): Promise<EeatReport> {
  const url = /^https?:\/\//i.test(options.url) ? options.url : "https://" + options.url;
  const page = await fetchQuiet(options.fetcher ?? fetchText, url);
  if (!page || !page.ok) throw new Error("Unable to fetch " + url + " for E-E-A-T evaluation");
  return evaluateEeat(HtmlDoc.parse(page.body), page.url);
}
