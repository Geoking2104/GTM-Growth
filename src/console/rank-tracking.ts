/** Keyword rank tracking (T-4): scheduled Google position checks for an
 * arbitrary tenant keyword pool, with position history and movement alerts.
 * SERP data comes from an injectable supplier (BYOK serp API or a configured
 * scraper profile). AIO detection (T-3) reads the same SERP payload. */
import { randomUUID } from "node:crypto";
import { addRankKeyword as _unusedAdd, listRankKeywords, insertRankSnapshot, lastRankSnapshots, listRankSnapshots, insertAlert, type RankKeyword, type RankSnapshot } from "./ops-store.js";

export type SerpSupplier = (keyword: string, locale: string) => Promise<SerpResult>;
export interface SerpResult { positions: Array<{ position: number; url: string; title: string }>; aiOverview?: { present: boolean; citedUrls: string[] } }
export interface SerpSupplierConfig { provider: string; note: string }

void _unusedAdd;

/** Extract the tenant's organic positions from a Google SERP HTML page
 * (deterministic, best-effort: used by the scraper profile supplier). */
export function extractOrganicPositions(html: string, tenantHost: string): Array<{ position: number; url: string; title: string }> {
  const out: Array<{ position: number; url: string; title: string }> = [];
  const host = tenantHost.replace(/^www\./, "").toLowerCase();
  const linkPattern = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(html)) !== null) {
    try {
      const u = new URL(match[1]);
      const h = u.hostname.replace(/^www\./, "").toLowerCase();
      if (h === host || h.endsWith(`.${host}`)) {
        const title = match[2].replace(/<[^>]*>/g, "").trim().slice(0, 200);
        out.push({ position: out.length + 1, url: u.origin + u.pathname, title });
        if (out.length >= 10) break;
      }
    } catch { /* skip malformed */ }
  }
  return out;
}

export function noSupplierError(): string {
  return "Aucun fournisseur SERP configuré (RANK_SUPPLIER_URL + RANK_SUPPLIER_TOKEN pour un fournisseur compatible, ou RANK_SCRAPER_URL pour un profil scraper).";
}

export function supplierFromEnv(env: NodeJS.ProcessEnv = process.env, transport: typeof fetch = fetch): { supplier: SerpSupplier; config: SerpSupplierConfig } | null {
  const apiUrl = env.RANK_SUPPLIER_URL, token = env.RANK_SUPPLIER_TOKEN;
  if (apiUrl && token) {
    const supplier: SerpSupplier = async (keyword, locale) => {
      const url = new URL(apiUrl);
      url.searchParams.set("q", keyword);
      url.searchParams.set("location", locale);
      const res = await transport(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`SERP supplier HTTP ${res.status}`);
      const data = await res.json() as { organic_results?: Array<{ position: number; link: string; title?: string }>; ai_overview?: { present: boolean; cited_urls?: string[] } };
      return {
        positions: (data.organic_results ?? []).slice(0, 10).map((r) => ({ position: Number(r.position) || 99, url: r.link, title: r.title ?? "" })),
        aiOverview: data.ai_overview ? { present: Boolean(data.ai_overview.present), citedUrls: data.ai_overview.cited_urls ?? [] } : undefined,
      };
    };
    return { supplier, config: { provider: "api", note: "Fournisseur SERP compatible (organic_results + ai_overview)" } };
  }
  const scraperUrl = env.RANK_SCRAPER_URL;
  if (scraperUrl) {
    const supplier: SerpSupplier = async (keyword, locale) => {
      const url = new URL(scraperUrl);
      url.searchParams.set("q", keyword);
      url.searchParams.set("hl", locale);
      const res = await transport(url, { headers: { Accept: "text/html" }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`Scraper HTTP ${res.status}`);
      return { positions: [], aiOverview: undefined, html: await res.text() } as SerpResult & { html: string };
    };
    return { supplier, config: { provider: "scraper", note: "Profil scraper SERP (HTML à filtrer par domaine du tenant)" } };
  }
  return null;
}

export interface RankCheckOutcome { keyword: string; snapshot: RankSnapshot | null; error: string | null; changed: boolean; previousPosition: number | null }

/** Alert when a keyword drops by `threshold` positions or more. */
export function alertForRankDrop(tenantId: string, keyword: string, from: number, to: number, threshold = 3): void {
  if (to - from < threshold) return;
  void insertAlert(tenantId, { kind: "rank-drop", severity: to - from >= 10 ? "critical" : "warn", title: `« ${keyword} » passe de la position ${from} à ${to}`, detail: `Baisse de ${to - from} positions sur la recherche Google suivie.`, payload: { keyword, from, to } });
}

export async function checkKeywordRank(
  tenantId: string,
  entry: RankKeyword,
  tenantHost: string,
  supplier: SerpSupplier,
  deps: { previous?: RankSnapshot; now?: () => string; alertThreshold?: number } = {},
): Promise<RankCheckOutcome> {
  const previous = deps.previous ?? lastRankSnapshots(tenantId).get(entry.id);
  let snapshot: RankSnapshot | null = null;
  try {
    const serp = await supplier(entry.keyword, entry.locale);
    const host = tenantHost.replace(/^www\./, "").toLowerCase();
    const mine = serp.positions.filter((p) => {
      try { const h = new URL(p.url).hostname.replace(/^www\./, "").toLowerCase(); return h === host || h.endsWith(`.${host}`); } catch { return false; }
    });
    const top = mine[0] ?? null;
    const cited = serp.aiOverview ? serp.aiOverview.citedUrls.some((u) => { try { const h = new URL(u).hostname.replace(/^www\./, "").toLowerCase(); return h === host || h.endsWith(`.${host}`); } catch { return false; } }) : false;
    snapshot = { id: randomUUID(), keywordId: entry.id, checkedAt: deps.now?.() ?? new Date().toISOString(), position: top ? top.position : null, url: top ? top.url : null, aiOverview: Boolean(serp.aiOverview?.present), citedInAiOverview: cited };
    insertRankSnapshot(tenantId, snapshot);
  } catch (error) {
    return { keyword: entry.keyword, snapshot: null, error: (error as Error).message, changed: false, previousPosition: previous?.position ?? null };
  }
  const changed = previous?.position !== snapshot.position;
  if (changed && previous?.position != null && snapshot.position != null) alertForRankDrop(tenantId, entry.keyword, previous.position, snapshot.position, deps.alertThreshold ?? 3);
  return { keyword: entry.keyword, snapshot, error: null, changed, previousPosition: previous?.position ?? null };
}

export async function runRankCheck(tenantId: string, tenantHost: string, supplier: SerpSupplier, limit = 25): Promise<{ checked: number; outcomes: RankCheckOutcome[] }> {
  const keywords = listRankKeywords(tenantId).slice(0, limit);
  const previous = lastRankSnapshots(tenantId);
  const outcomes: RankCheckOutcome[] = [];
  for (const entry of keywords) {
    outcomes.push(await checkKeywordRank(tenantId, entry, tenantHost, supplier, { previous: previous.get(entry.id) }));
  }
  return { checked: keywords.length, outcomes };
}

/** Latest snapshot per keyword joined with keyword rows, for the console view. */
export function rankBoard(tenantId: string): Array<{ keyword: string; locale: string; position: number | null; url: string | null; aiOverview: boolean; citedInAiOverview: boolean; checkedAt: string | null; history: Array<number | null> }> {
  const keywords = listRankKeywords(tenantId);
  const latest = lastRankSnapshots(tenantId);
  return keywords.map((k) => {
    const snap = latest.get(k.id);
    const history = listRankSnapshots(tenantId, k.id).map((s) => s.position);
    return { keyword: k.keyword, locale: k.locale, position: snap?.position ?? null, url: snap?.url ?? null, aiOverview: snap?.aiOverview ?? false, citedInAiOverview: snap?.citedInAiOverview ?? false, checkedAt: snap?.checkedAt ?? null, history };
  });
}
