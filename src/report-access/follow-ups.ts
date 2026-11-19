/**
 * Scheduled J+14/J+28 white-label client follow-ups (R9, scheduled slice).
 *
 * A follow-up exists only through the agency's explicit opt-in at invitation
 * time (`followUp: "auto"`), and is only dispatched when the operator enables
 * REPORT_FOLLOW_UPS_ENABLED: the default posture stays fail-closed. The
 * recipient address is stored AES-256-GCM sealed under an HKDF-derived key
 * bound to the report-access secret: never in clear, never logged. Dispatch
 * re-measures the exact same URL with the same public method, then reuses the
 * existing A4 export pipeline (branded PDF) and the bilingual suggestion
 * text; no metric is ever summed across snapshots or clients here.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type { ReportLanguage } from "./service.js";
import type { WhiteLabelBrand } from "./brand.js";
import { brandSlug } from "./brand.js";

export type FollowUpChoice = "none" | "auto";
export const FOLLOWUP_MAX_ATTEMPTS = 3;
/** Only when the operator explicitly opts in; nothing runs via a bare R9 upgrade. */
export const followUpsEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => env.REPORT_FOLLOW_UPS_ENABLED === "true";

/** Strict accept/reject of the invitation-level opt-in (default: no scheduling). */
export function parseFollowUpChoice(value: unknown): FollowUpChoice | null {
  if (value === undefined || value === null || value === "") return "none";
  return (value === "none" || value === "auto") ? value : null;
}

/** Purpose-separated key derivation: the follow-up key never signs codes or sessions. */
const deriveSealKey = (secret: string): Buffer =>
  Buffer.from(hkdfSync("sha256", secret, Buffer.from("gtm-growth-report-followups-v1"), Buffer.from("email-encryption"), 32));

/** Authenticated encryption of one recipient address (no insecure fallback). */
export function sealAddress(secret: string, email: string): string {
  if (!secret || secret.length < 32) throw new Error("REPORT_ACCESS_SECRET must be at least 32 characters");
  if (typeof email !== "string" || !email || email.length > 254) throw new Error("Invalid follow-up address");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveSealKey(secret), nonce);
  const blob = {
    n: nonce.toString("base64"),
    c: Buffer.concat([cipher.update(Buffer.from(email, "utf8")), cipher.final()]).toString("base64"),
    t: cipher.getAuthTag().toString("base64"),
  };
  return JSON.stringify(blob);
}

/** Returns the address only when the ciphertext is authenticated; null otherwise. */
export function openAddress(secret: string, sealed: string): string | null {
  try {
    const blob = JSON.parse(sealed) as { n?: unknown; c?: unknown; t?: unknown };
    const nonce = typeof blob.n === "string" ? Buffer.from(blob.n, "base64") : null;
    const ciphertext = typeof blob.c === "string" ? Buffer.from(blob.c, "base64") : null;
    const tag = typeof blob.t === "string" ? Buffer.from(blob.t, "base64") : null;
    if (!nonce || nonce.length !== 12 || !ciphertext || !tag || tag.length !== 16 || ciphertext.length === 0 || ciphertext.length > 320) return null;
    const decipher = createDecipheriv("aes-256-gcm", deriveSealKey(secret), nonce);
    decipher.setAuthTag(tag);
    const email = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    return email.length <= 254 && email.includes("@") ? email : null;
  } catch { return null; }
}

/** Milestone as stored on the scheduled rows ("J14"/"J28"); the surfaced
 * timeline labels "J+14"/"J+28" keep their own form in the impact module. */
export type ScheduledMilestone = "J14" | "J28";

export interface DueFollowUp {
  id: string;
  email: string;
  language: ReportLanguage;
  brand: WhiteLabelBrand | null;
  url: string;
  observedAt: string;
  milestone: ScheduledMilestone;
  dueAt: string;
  attempts: number;
}

/** Structural contract the drain needs from the report-access store. */
export interface FollowUpStore {
  dueFollowUps(now: number, limit: number): DueFollowUp[];
  completeFollowUp(id: string, outcome: { status: "sent" | "failed"; error?: string; freshPayload?: string }): void;
}

export interface FollowUpMail {
  to: string;
  language: ReportLanguage;
  brand: WhiteLabelBrand | null;
  milestone: ScheduledMilestone;
  observedAt: string;
  measuredAt: string;
  url: string;
  suggestion: { fr: string; en: string };
  reportNote: { fr: string; en: string };
  pdf: Buffer;
  filename: string;
}

export type FollowUpSender = (mail: FollowUpMail) => Promise<void>;
export type FollowUpReader = (url: string) => Promise<{ observedAt: string; sourceUrl: string; blob: string }>;

/** Bilingual scope note attached to every scheduled follow-up: no score
 * totals, no cross-scope sums, in either language. */
export const FOLLOWUP_REPORT_NOTE: { fr: string; en: string } = {
  fr: "Chaque contrôle reste scope par scope : aucune somme de notes ni score global n'est publié sans couverture complète et accord du propriétaire.",
  en: "Every control stays scope by scope: no grade summing and no overall score is published without complete coverage and the owner's consent.",
};

/** Bilingual, brand-aware subject and body. No totals are ever included: the
 * text mentions single-scope dates and actions only. */
export function followUpMailText(language: ReportLanguage, brand: WhiteLabelBrand | null, milestone: ScheduledMilestone, observedAt: string, measuredAt: string, url: string, suggestion: string, reportNote: { fr: string; en: string }): { subject: string; text: string } {
  const name = brand?.name ?? "GTM Growth";
  const label = `J+${milestone === "J14" ? 14 : 28}`;
  const note = language === "fr" ? reportNote.fr : reportNote.en;
  if (language === "fr") {
    return {
      subject: `${name} - suivi ${label} de votre rapport 360°`,
      text: `Votre relevé de suivi ${label} est prêt. Page mesurée : ${url}\nPremier relevé : ${observedAt}\nNouveau relevé : ${measuredAt}\n\n${suggestion}\n\nComme le premier rapport, ce suivi porte sur cette page uniquement.\n${note}\n\nPour relancer le diagnostic gratuit sur la même page, rechargez-la et redemandez votre rapport.\nSi vous ne souhaitez plus recevoir ces suivis, ignorez cet e-mail et demandez à votre agence de les interrompre.`,
    };
  }
  return {
    subject: `${name} - ${label} follow-up on your 360° report`,
    text: `Your ${label} check-in is ready. Measured page: ${url}\nFirst observation: ${observedAt}\nNew observation: ${measuredAt}\n\n${suggestion}\n\nLike the first report, this follow-up covers this page only.\n${note}\n\nTo run the free diagnostic again on the same page, reload it and request your report again.\nIf you no longer want these follow-ups, ignore this email and ask your agency to stop them.`,
  };
}

export interface DispatchOptions {
  store: FollowUpStore;
  reader: FollowUpReader;
  send: FollowUpSender;
  renderPdf: (report: unknown, language: ReportLanguage, options: { brand?: WhiteLabelBrand | null }) => Promise<Buffer>;
  suggestionFor: (milestone: ScheduledMilestone) => { fr: string; en: string };
  reportNote: { fr: string; en: string };
  limit?: number;
  now?: () => Date;
}

const MAX_FRESH_BYTES = 500_000;

/** One bounded pass over due follow-ups: re-measure the exact same URL, then
 * reuse the A4 branded pipeline for the dispatch. Failures retry up to
 * FOLLOWUP_MAX_ATTEMPTS; permanent failures keep their evidence row. */
export async function dispatchDueFollowUps(options: DispatchOptions): Promise<{ sent: number; failed: number; details: Array<{ milestone: string; status: string }> }> {
  const limit = Math.max(1, Math.min(options.limit ?? 5, 20));
  const now = options.now ?? (() => new Date());
  const due = options.store.dueFollowUps(now().getTime(), limit);
  const details: Array<{ milestone: string; status: string }> = [];
  let sent = 0, failed = 0;
  for (const item of due) {
    try {
      const fresh = await options.reader(item.url);
      if (fresh.sourceUrl !== item.url) {
        options.store.completeFollowUp(item.id, { status: "failed", error: "scope_mismatch" });
        failed++; details.push({ milestone: item.milestone, status: "failed:scope_mismatch" });
        continue;
      }
      if (!fresh.observedAt || !Number.isFinite(Date.parse(fresh.observedAt)) || !fresh.blob || Buffer.byteLength(fresh.blob, "utf8") > MAX_FRESH_BYTES) {
        options.store.completeFollowUp(item.id, { status: "failed", error: "unreadable_snapshot" });
        failed++; details.push({ milestone: item.milestone, status: "failed:unreadable_snapshot" });
        continue;
      }
      const report = JSON.parse(fresh.blob);
      const pdf = await options.renderPdf(report, item.language, { brand: item.brand });
      const suggestions = options.suggestionFor(item.milestone);
      const brandName = item.brand?.name ?? "gtm-growth";
      const filename = `${brandSlug(brandName)}-rapport-360-suivi-${item.milestone.toLowerCase()}-${item.language}.pdf`;
      await options.send({ to: item.email, language: item.language, brand: item.brand, milestone: item.milestone, observedAt: item.observedAt, measuredAt: fresh.observedAt, url: item.url, suggestion: suggestions, reportNote: options.reportNote, pdf, filename });
      options.store.completeFollowUp(item.id, { status: "sent", freshPayload: fresh.blob });
      sent++; details.push({ milestone: item.milestone, status: "sent" });
    } catch (error) {
      options.store.completeFollowUp(item.id, { status: "failed", error: (error instanceof Error ? error.message : String(error)).slice(0, 120) });
      failed++; details.push({ milestone: item.milestone, status: "failed" });
    }
  }
  return { sent, failed, details };
}
