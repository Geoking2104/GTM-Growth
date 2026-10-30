/**
 * PageSpeed Insights API (v5) — Lighthouse lab data + optional field data.
 * Uses an optional API key from PAGESPEED_API_KEY or GOOGLE_API_KEY.
 */

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

function getApiKey(): string | undefined {
  return process.env.PAGESPEED_API_KEY || process.env.GOOGLE_API_KEY;
}

export interface RunPagespeedArgs {
  url: string;
  strategy?: "mobile" | "desktop";
  categories?: string[];
  locale?: string;
}

/** Subset of the Lighthouse/PSI response this tool reads. */
interface LighthouseCategory {
  score?: number;
}

interface LighthouseAudit {
  displayValue?: string;
}

interface PagespeedResponse {
  lighthouseResult?: {
    categories?: Record<string, LighthouseCategory>;
    audits?: Record<string, LighthouseAudit>;
  };
  loadingExperience?: unknown;
  originLoadingExperience?: unknown;
  analysisUTCTimestamp?: string;
}

export async function runPagespeed(args: RunPagespeedArgs) {
  const params = new URLSearchParams();
  params.set("url", args.url);
  if (args.strategy) params.set("strategy", args.strategy);
  if (args.locale) params.set("locale", args.locale);
  const cats = args.categories?.length
    ? args.categories
    : ["performance", "accessibility", "best-practices", "seo"];
  for (const c of cats) params.append("category", c);

  const key = getApiKey();
  if (key) params.set("key", key);

  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PageSpeed Insights error ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as PagespeedResponse;

  // Compact summary for agents
  const categories = data.lighthouseResult?.categories ?? {};
  const scores: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(categories)) {
    scores[k] = typeof v.score === "number" ? Math.round(v.score * 100) : null;
  }

  const audits = data.lighthouseResult?.audits ?? {};
  const vitals = {
    lcp: audits["largest-contentful-paint"]?.displayValue,
    inp: audits["interaction-to-next-paint"]?.displayValue,
    cls: audits["cumulative-layout-shift"]?.displayValue,
    fcp: audits["first-contentful-paint"]?.displayValue,
    tbt: audits["total-blocking-time"]?.displayValue,
  };

  return {
    url: args.url,
    strategy: args.strategy || "desktop",
    scores,
    vitals,
    loadingExperience: data.loadingExperience ?? null,
    originLoadingExperience: data.originLoadingExperience ?? null,
    analysisUTCTimestamp: data.analysisUTCTimestamp,
    // full raw available under raw if needed — omit large lighthouseResult by default
  };
}
