/**
 * Post-audit follow-up plan surfaced to the requestor. Reminders are dates
 * only: this module never sends email and never schedules an autonomous
 * action (W5 rule). The agency decides what to do on each date.
 */

export interface ClientFollowUp {
  label: "J+14" | "J+28";
  daysAfter: number;
  dueAt: string;
  status: "upcoming" | "due";
  suggestion: { fr: string; en: string };
}

export const FOLLOW_UP_NOTE = "Reminders are surfaced to the requestor only; nothing is sent or scheduled automatically.";

const SUGGESTIONS: Record<number, { fr: string; en: string }> = {
  14: {
    fr: "Relancez la même URL avec la même méthode, comparez avec le relevé précédent, puis envoyez le rapport client en marque blanche dans la langue du client (fr ou en).",
    en: "Re-run the same URL with the same method, compare with the previous observation, then send the white-label client report in the client's language (fr or en).",
  },
  28: {
    fr: "Relancez la même URL avec la même méthode, comparez la trajectoire depuis le premier relevé, puis envoyez le rapport client en marque blanche dans la langue du client (fr ou en).",
    en: "Re-run the same URL with the same method, compare the trajectory since the first observation, then send the white-label client report in the client's language (fr or en).",
  },
};

const dayStart = (value: number): number => {
  const d = new Date(value);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/**
 * J+14 and J+28 reminders after one observation. `dueAt` is the UTC date N
 * days after the observed date (calendar days, wall-clock independent).
 * Returns null when the observed date cannot be parsed.
 */
export function planFollowUps(observedAt: string | null | undefined, now: Date = new Date()): ClientFollowUp[] | null {
  if (typeof observedAt !== "string" || !Number.isFinite(Date.parse(observedAt))) return null;
  const base = dayStart(Date.parse(observedAt));
  const today = dayStart(now.getTime());
  return [14, 28].map(daysAfter => {
    const dueAt = base + daysAfter * 86_400_000;
    return {
      label: `J+${daysAfter}` as ClientFollowUp["label"],
      daysAfter,
      dueAt: new Date(dueAt).toISOString(),
      status: today >= dueAt ? "due" : "upcoming",
      suggestion: SUGGESTIONS[daysAfter],
    };
  });
}
