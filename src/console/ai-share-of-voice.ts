/** Share-of-voice view over one stored AI-visibility panel (benchmark R1).
 * Every figure is a proportion of what this panel actually stored: mentions
 * counted at most once per response and per brand, divided within one engine
 * by that engine's own mention total. No engine market share, no consumer
 * sessions, no invented denominator: an engine without mentions reports
 * `null`, never a silent zero. */
import type { Dataset, Sentiment } from "./ai-visibility.js";

export const SHARE_OF_VOICE_NOTE = "Shares are proportions of this stored panel only: mentions per engine divided by that engine's mention total. This is not engine market share and not consumer sessions.";

interface BrandShare { brand: string; mentions: number; shareOfVoice: number | null; visibility: number | null; sentiment: Record<Sentiment, number> }
interface EngineRow { engine: string; responses: number; mentions: number; brands: BrandShare[] }
export interface ShareOfVoice {
  panel: string; createdAt: string; brand: string; source: string | null;
  totalResponses: number; totalMentions: number;
  engines: EngineRow[];
  overall: { responses: number; mentions: number; brands: BrandShare[] };
  note: string;
}

const zeroSentiment = (): Record<Sentiment, number> => ({ positive: 0, neutral: 0, negative: 0, mixed: 0, unknown: 0 });

function brandShares(dataset: Dataset, responses: Dataset["observations"]): BrandShare[] {
  const totalMentions = dataset.brands.reduce((n, b) => n + responses.filter((r) => r.mentions.some((m) => m.brand === b.name && m.status !== "rejected")).length, 0);
  return dataset.brands.map((b) => {
    const sentiment = zeroSentiment();
    for (const r of responses) {
      const mention = r.mentions.find((m) => m.brand === b.name && m.status !== "rejected");
      if (mention) sentiment[mention.sentiment]++;
    }
    const mentions = sentiment.positive + sentiment.neutral + sentiment.negative + sentiment.mixed + sentiment.unknown;
    return { brand: b.name, mentions, shareOfVoice: totalMentions ? mentions / totalMentions * 100 : null,
      visibility: responses.length ? mentions / responses.length * 100 : null, sentiment };
  });
}

/** Per-engine and overall share of voice, competitor counts included without
 * summation: one scope (this panel), proportions only. */
export function shareOfVoiceView(dataset: Dataset, source = "", brand = ""): ShareOfVoice {
  const activeName = dataset.brands.some((b) => b.name === brand) ? brand : dataset.brands[0].name;
  const responses = dataset.observations.filter((r) => !source || r.source === source);
  const engineNames = [...new Set(responses.map((r) => r.source))].sort();
  const engines: EngineRow[] = engineNames.map((engine) => {
    const rows = responses.filter((r) => r.source === engine);
    const shares = brandShares(dataset, rows);
    return { engine, responses: rows.length, mentions: shares.reduce((n, s) => n + s.mentions, 0), brands: shares };
  });
  const overallShares = brandShares(dataset, responses);
  return {
    panel: dataset.id, createdAt: dataset.createdAt, brand: activeName,
    source: source || null,
    totalResponses: responses.length, totalMentions: overallShares.reduce((n, s) => n + s.mentions, 0),
    engines, overall: { responses: responses.length, mentions: overallShares.reduce((n, s) => n + s.mentions, 0), brands: overallShares },
    note: SHARE_OF_VOICE_NOTE,
  };
}
