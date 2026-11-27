/** Native AI tracker — metrics engine. Computed at read time, never stored alone.
 * consumer-ui and api-approximation series are never mixed in one average. */
import type { MentionJudgement, StoredRun, TrackedBrand } from "./types.js";

export interface Score {
  value: number | null;
  runCount: number;
  window: { from: string; to: string };
  collectionMode: string;
}

const round = (n: number) => Math.round(n * 10) / 10;

export function visibility(runs: StoredRun[], countedRunIds: Set<string>, from: string, to: string, mode: string): Score {
  return { value: runs.length ? round((100 * [...countedRunIds].length) / runs.length) : null, runCount: runs.length, window: { from, to }, collectionMode: mode };
}

export function shareOfVoice(brandId: string, mentionsByRun: Map<string, MentionJudgement[]>, from: string, to: string, mode: string): Score {
  let brand = 0, total = 0;
  for (const mentions of mentionsByRun.values()) {
    for (const mention of mentions) {
      if (mention.status !== "judged" || !mention.counted) continue;
      total += 1;
      if (mention.companyId === brandId) brand += 1;
    }
  }
  return { value: total ? round((100 * brand) / total) : null, runCount: total, window: { from, to }, collectionMode: mode };
}

const SENTIMENT_SCORES: Record<string, number> = { positive: 100, neutral: 50, mixed: 50, negative: 0 };
export function sentiment(brandId: string, mentionsByRun: Map<string, MentionJudgement[]>, from: string, to: string, mode: string): Score {
  let sum = 0, count = 0;
  for (const mentions of mentionsByRun.values()) {
    for (const mention of mentions) {
      if (mention.companyId !== brandId || !mention.counted || mention.status !== "judged" || !mention.sentiment) continue;
      sum += SENTIMENT_SCORES[mention.sentiment] ?? 50;
      count += 1;
    }
  }
  return { value: count ? round(sum / count) : null, runCount: count, window: { from, to }, collectionMode: mode };
}

export function averagePosition(brandId: string, mentionsByRun: Map<string, MentionJudgement[]>, from: string, to: string, mode: string): Score {
  let sum = 0, count = 0;
  for (const mentions of mentionsByRun.values()) {
    for (const mention of mentions) {
      if (mention.companyId !== brandId || !mention.counted || mention.status !== "judged" || mention.position == null) continue;
      sum += mention.position;
      count += 1;
    }
  }
  return { value: count ? round(sum / count) : null, runCount: count, window: { from, to }, collectionMode: mode };
}

export interface CitationAggregate { domain: string; url: string; citingRuns: number }

export function citationAggregates(runs: StoredRun[]): CitationAggregate[] {
  const byUrl = new Map<string, CitationAggregate>();
  for (const run of runs) {
    const seen = new Set<string>();
    for (const citation of run.citations) {
      let domain: string;
      try { domain = new URL(citation.url).hostname.toLowerCase(); } catch { continue; }
      const key = citation.url;
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = byUrl.get(key) ?? { domain, url: citation.url, citingRuns: 0 };
      entry.citingRuns += 1;
      byUrl.set(key, entry);
    }
  }
  return [...byUrl.values()].sort((a, b) => b.citingRuns - a.citingRuns);
}

export interface TrendPoint { runDate: string; counted: number; total: number }

export function trend(runs: StoredRun[], countedRunIds: Set<string>): TrendPoint[] {
  const byDate = new Map<string, TrendPoint>();
  for (const run of runs) {
    const point = byDate.get(run.runDate) ?? { runDate: run.runDate, counted: 0, total: 0 };
    point.total += 1;
    if (countedRunIds.has(run.runId)) point.counted += 1;
    byDate.set(run.runDate, point);
  }
  return [...byDate.values()].sort((a, b) => a.runDate.localeCompare(b.runDate));
}

export interface BrandMetrics { brandId: string; visibility: Score; shareOfVoice: Score; sentiment: Score; position: Score }

/** Group runs and mentions per mode, then compute each series separately. */
export function brandMetrics(brand: TrackedBrand, runs: StoredRun[], mentionsByRun: Map<string, MentionJudgement[]>, from: string, to: string): Record<string, BrandMetrics> {
  const modes = [...new Set(runs.map(run => run.collectionMode))];
  const result: Record<string, BrandMetrics> = {};
  for (const mode of modes) {
    const modeRuns = runs.filter(run => run.collectionMode === mode);
    const modeMentions = new Map([...mentionsByRun].filter(([runId]) => modeRuns.some(run => run.runId === runId)));
    const countedRunIds = new Set([...modeMentions].filter(([, mentions]) => mentions.some(m => m.companyId === brand.brandId && m.counted && m.status === "judged")).map(([runId]) => runId));
    result[mode] = {
      brandId: brand.brandId,
      visibility: visibility(modeRuns, countedRunIds, from, to, mode),
      shareOfVoice: shareOfVoice(brand.brandId, modeMentions, from, to, mode),
      sentiment: sentiment(brand.brandId, modeMentions, from, to, mode),
      position: averagePosition(brand.brandId, modeMentions, from, to, mode),
    };
  }
  return result;
}
