/**
 * Chrome UX Report (CrUX) API — real-user Core Web Vitals.
 * Uses an optional API key from CRUX_API_KEY or GOOGLE_API_KEY.
 */

const ENDPOINT = "https://chromeuxreport.googleapis.com/v1/records:queryRecord";

function getApiKey(): string | undefined {
  return process.env.CRUX_API_KEY || process.env.GOOGLE_API_KEY;
}

export interface QueryCruxArgs {
  origin?: string;
  url?: string;
  formFactor?: "PHONE" | "DESKTOP" | "TABLET" | "ALL_FORM_FACTORS";
  metrics?: string[];
}

/** Subset of the CrUX response this tool reads. */
interface CruxMetric {
  percentiles?: { p75?: number };
}

interface CruxResponse {
  record?: {
    key?: unknown;
    metrics?: Record<string, CruxMetric>;
    collectionPeriod?: unknown;
  };
  collectionPeriod?: unknown;
}

export async function queryCrux(args: QueryCruxArgs) {
  if (!args.origin && !args.url) {
    throw new Error("Provide either origin or url");
  }

  const body: any = {};
  if (args.origin) body.origin = args.origin;
  if (args.url) body.url = args.url;
  if (args.formFactor) body.formFactor = args.formFactor;
  if (args.metrics?.length) body.metrics = args.metrics;

  const key = getApiKey();
  const url = key ? `${ENDPOINT}?key=${encodeURIComponent(key)}` : ENDPOINT;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CrUX API error ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as CruxResponse;
  const record = data.record ?? {};
  const metrics = record.metrics ?? {};

  // Compact p75 summary
  const summary: Record<string, { p75?: number }> = {};
  for (const [name, metric] of Object.entries(metrics)) {
    summary[name] = {
      p75: metric.percentiles?.p75,
    };
  }

  return {
    key: record.key,
    collectionPeriod: record.collectionPeriod || data.collectionPeriod,
    metrics: summary,
    rawMetrics: metrics,
  };
}
