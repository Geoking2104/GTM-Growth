/**
 * Lead persistence for the Node server.
 *
 * Validation lives in `validate.ts` (runtime-agnostic, shared with the Worker);
 * this module only adds the filesystem append and the read-back used by the CLI.
 */

import fs from "node:fs";
import path from "node:path";
import type { Lead } from "./validate.js";

export {
  LEAD_GOALS,
  normalizeWebsite,
  validateLead,
  type Lead,
  type LeadInput,
  type LeadValidation,
} from "./validate.js";

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
