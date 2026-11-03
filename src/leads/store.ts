/**
 * Lead capture without a mail client.
 *
 * A submission is validated, normalised, appended to a JSONL file and — when
 * `LEAD_WEBHOOK_URL` is set — forwarded to the owner's endpoint (Slack, a CRM,
 * their own worker). The HTTP response is the source of truth: the browser only
 * shows "sent" when the record was actually written.
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface LeadInput {
  name?: unknown;
  email?: unknown;
  website?: unknown;
  goal?: unknown;
  source?: unknown;
  /** Honeypot: a human never fills it. */
  company?: unknown;
  /** Milliseconds the visitor spent on the form. */
  elapsedMs?: unknown;
}

export interface Lead {
  id: string;
  receivedAt: string;
  name: string;
  email: string;
  website: string;
  goal: string;
  source: string;
}

export interface LeadValidation {
  ok: boolean;
  lead?: Lead;
  errors?: string[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const MAX = { name: 120, email: 200, website: 300, goal: 120, source: 60 };
const GOALS = [
  "Full GEO audit",
  "GTM / GA4 measurement",
  "llms.txt and schema implementation",
  "Competitive positioning review",
  "Not sure yet",
];
const GOALS_FR = [
  "Audit GEO complet",
  "Mesure GTM / GA4",
  "Implémentation llms.txt et schema",
  "Analyse de positionnement concurrentiel",
  "Pas encore décidé",
];

const asText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Normalise a website field: bare domains get https, tracking params are dropped. */
export function normalizeWebsite(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_|^gclid$|^fbclid$|^msclkid$/.test(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.href;
  } catch {
    return raw;
  }
}

/**
 * Validate one submission. `minElapsedMs` rejects instant posts (bots), and a
 * filled honeypot rejects the request without telling the sender why.
 */
export function validateLead(input: LeadInput, options: { minElapsedMs?: number; now?: Date } = {}): LeadValidation {
  const errors: string[] = [];
  const name = asText(input.name);
  const email = asText(input.email);
  const website = normalizeWebsite(asText(input.website));
  const goal = asText(input.goal) || GOALS[0];
  const source = asText(input.source) || "landing";

  if (asText(input.company)) return { ok: false, errors: ["rejected"] };
  const minElapsed = options.minElapsedMs ?? 1200;
  const elapsed = Number(input.elapsedMs ?? minElapsed);
  if (Number.isFinite(elapsed) && elapsed < minElapsed) return { ok: false, errors: ["rejected"] };

  if (name.length < 2) errors.push("name");
  if (!EMAIL.test(email) || email.length > MAX.email) errors.push("email");
  if (!website) errors.push("website");
  if (name.length > MAX.name) errors.push("name");
  if (website.length > MAX.website) errors.push("website");
  if (goal.length > MAX.goal) errors.push("goal");
  if (source.length > MAX.source) errors.push("source");

  const known = [...GOALS, ...GOALS_FR];
  const goalValue = known.includes(goal) ? goal : "Not sure yet";

  if (errors.length) return { ok: false, errors: [...new Set(errors)] };

  return {
    ok: true,
    lead: {
      id: randomUUID(),
      receivedAt: (options.now ?? new Date()).toISOString(),
      name,
      email,
      website,
      goal: goalValue,
      source,
    },
  };
}

/** Append one lead as a JSON line; creates the directory on first write. */
export function appendLead(lead: Lead, file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(lead)}\n`, "utf8");
}

/** Read leads back (used by the CLI and the tests). */
export function readLeads(file: string, limit = 100): Lead[] {
  if (!fs.existsSync(file)) return [];
  const lines = fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean);
  return lines
    .slice(-limit)
    .map((line) => {
      try {
        return JSON.parse(line) as Lead;
      } catch {
        return null;
      }
    })
    .filter((lead): lead is Lead => lead !== null);
}

export const LEAD_GOALS = GOALS;
