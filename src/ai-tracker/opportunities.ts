/** Native AI tracker — opportunity rules. Readable rules, proof attached, never from a single run.
 * An opportunity only becomes a GEO action draft after human validation. */
import { brandMetrics, trend, visibility } from "./metrics.js";
import { latestMentions, listOpportunities, listPrompts, runsForWindow, insertOpportunity, setOpportunityStatus } from "./store.js";
import type { Opportunity, TrackedBrand } from "./types.js";
import { stableId, today } from "./worker.js";

const MIN_RUNS = 2; // never an opportunity from a single run
const DROP_THRESHOLD = 20; // percentage points of visibility drop

export function windowSince(days: number): { from: string; to: string } {
  const to = today();
  const from = new Date(Date.now() - days * 86400 * 1000).toISOString().slice(0, 10);
  return { from, to };
}

export function generateOpportunities(tenantId: string, brand: TrackedBrand, days = 14): Opportunity[] {
  const { from, to } = windowSince(days);
  const prompts = listPrompts(tenantId, brand.brandId).filter(p => p.active);
  const created: Opportunity[] = [];
  const now = new Date().toISOString();
  for (const prompt of prompts) {
    for (const engine of prompt.engines) {
      const runs = runsForWindow(tenantId, brand.brandId, prompt.promptId, engine, from, to);
      if (runs.length < MIN_RUNS) continue;
      const mentionsByRun = latestMentions(tenantId, runs.map(r => r.runId));
      const countedRunIds = new Set(runs.filter(run => (mentionsByRun.get(run.runId) ?? []).some(m => m.companyId === brand.brandId && m.counted && m.status === "judged")).map(run => run.runId));
      const vis = visibility(runs, countedRunIds, from, to, runs[0].collectionMode);
      const points = trend(runs, countedRunIds);
      const firstHalf = points.slice(0, Math.floor(points.length / 2));
      const secondHalf = points.slice(Math.floor(points.length / 2));
      const avg = (part: typeof points) => part.length ? part.reduce((s, p) => s + (p.total ? p.counted / p.total : 0), 0) / part.length : 0;
      const drop = (avg(firstHalf) - avg(secondHalf)) * 100;

      const base = { tenantId, brandId: brand.brandId, promptId: prompt.promptId, engine, createdAt: now };
      if (drop >= DROP_THRESHOLD && countedRunIds.size > 0) {
        created.push({ ...base, opportunityId: stableId(tenantId, brand.brandId, prompt.promptId, engine, "visibility-drop", to), type: "visibility-drop",
          title: `Baisse de visibilité sur ${engine} pour « ${prompt.promptText.slice(0, 60)} »`, evidence: { drop: Math.round(drop), points, runs: runs.map(r => r.runId) }, status: "open" });
      }
      if (countedRunIds.size === 0) {
        created.push({ ...base, opportunityId: stableId(tenantId, brand.brandId, prompt.promptId, engine, "no-mention", to), type: "no-mention",
          title: `Aucune mention sur ${engine} pour « ${prompt.promptText.slice(0, 60)} »`, evidence: { runCount: runs.length, runs: runs.map(r => r.runId) }, status: "open" });
      }
      // Competitor ahead: competitor counted in a run where the brand is not first.
      const competitorAhead = runs.some(run => {
        const mentions = mentionsByRun.get(run.runId) ?? [];
        const brandMention = mentions.find(m => m.companyId === brand.brandId && m.counted && m.status === "judged");
        return brandMention?.position != null && brandMention.position > 1 && mentions.some(m => m.counted && m.status === "judged" && m.position === 1 && m.companyId !== brand.brandId);
      });
      if (competitorAhead) {
        created.push({ ...base, opportunityId: stableId(tenantId, brand.brandId, prompt.promptId, engine, "competitor-ahead", to), type: "competitor-ahead",
          title: `Concurrent en tête sur ${engine} pour « ${prompt.promptText.slice(0, 60)} »`, evidence: { runs: runs.map(r => r.runId) }, status: "open" });
      }
      // Citation missing: brand cited in no run while visible.
      if (countedRunIds.size > 0) {
        const brandDomains = new Set(brand.domains);
        const citedRuns = runs.filter(run => run.citations.some(c => { try { return brandDomains.has(new URL(c.url).hostname.toLowerCase().replace(/^www\./, "")); } catch { return false; } }));
        if (citedRuns.length / runs.length < 0.25) {
          created.push({ ...base, opportunityId: stableId(tenantId, brand.brandId, prompt.promptId, engine, "citation-missing", to), type: "citation-missing",
            title: `Citations manquantes sur ${engine} pour « ${prompt.promptText.slice(0, 60)} »`, evidence: { citedRuns: citedRuns.length, runCount: runs.length }, status: "open" });
        }
      }
    }
  }
  for (const opportunity of created) insertOpportunity(tenantId, opportunity);
  return created;
}

export function opportunitiesFor(tenantId: string, status?: string) { return listOpportunities(tenantId, status); }
export function resolveOpportunity(tenantId: string, opportunityId: string, status: string) { setOpportunityStatus(tenantId, opportunityId, status); }

/** Brand-level metrics for the console view (both modes, never merged). */
export function consoleBrandMetrics(tenantId: string, brand: TrackedBrand, days = 90) {
  const { from, to } = windowSince(days);
  const runs = runsForWindow(tenantId, brand.brandId, undefined, undefined, from, to);
  const mentionsByRun = latestMentions(tenantId, runs.map(r => r.runId));
  return { byMode: brandMetrics(brand, runs, mentionsByRun, from, to), runCount: runs.length, window: { from, to } };
}
