/**
 * Adapters for the pre-approved action catalog (R11): each one reuses an
 * existing module's own validation and execution path — nothing here invents
 * a new external effect, bills a tenant or bypasses the target module's
 * confirm rules. An ambiguous provider outcome (network, timeout) is never
 * reported as a failure: the ledger keeps the operation reconciling until the
 * external result is verified (PAP spec T22).
 */
import { submitUrls, IndexNowError } from "../indexnow/client.js";
import { generateTitles, generateMetaDescriptions, generateOutline } from "../console/generators.js";
import { dispatchOneFollowUp, FOLLOWUP_REPORT_NOTE, type DispatchOptions, type DueFollowUp } from "../report-access/follow-ups.js";
import { renderReportPdf } from "../report-access/export.js";
import { followUpSuggestionFor } from "../impact/follow-ups.js";
import type { FreeReport360 } from "../freeread/report360.js";
import { asDraftTerms, asIndexNowTerms, asReportDispatchTerms, type ActionId } from "./catalog.js";

export interface ActionRunResult {
  outcome: "succeeded" | "failed" | "ambiguous";
  detail: string;
  result?: unknown;
}

/** Injectable per-action seams: tests pass fakes, the composition root keeps
 * the real modules. Nothing is executed outside the ledger's claim. */
export interface ActionAdapterDeps {
  submitIndexNow?: (terms: { host: string; key: string; urls: string[] }) => Promise<unknown>;
  dispatchReportFollowUp?: (followUpId: string) => Promise<{ status: "sent" } | { status: "failed"; error: string; tag: string }>;
}

/** A network-ish failure means "the provider may have received and acted" —
 * ambiguous, not failed. Validation failures are definitive. */
const isAmbiguous = (error: unknown): boolean => {
  if (error instanceof IndexNowError) return error.code === "network";
  const name = (error as Error | undefined)?.name ?? "";
  return name === "AbortError" || name === "TimeoutError" || name === "AbortSignalTimeoutError";
};
const boundedDetail = (text: string): string => text.replace(/\s+/g, " ").slice(0, 300);

async function adapterOutcome(work: () => Promise<ActionRunResult>): Promise<ActionRunResult> {
  try { return await work(); }
  catch (error) {
    const message = boundedDetail((error instanceof Error ? error.message : String(error)) || "erreur inconnue");
    return { outcome: isAmbiguous(error) ? "ambiguous" : "failed", detail: message };
  }
}

/** IndexNow submission: the existing client re-validates and requires the
 * explicit confirm — a pre-approved operation still never skips the confirm. */
export const runIndexNowSubmit = (terms: unknown, submit: typeof submitUrls = submitUrls): Promise<ActionRunResult> =>
  adapterOutcome(async () => {
    const t = asIndexNowTerms(terms);
    const result = await submit({ host: t.host, key: t.key, urls: t.urls, confirm: true });
    return { outcome: "succeeded", detail: `IndexNow : soumission reçue (statut HTTP ${result.status ?? "—"} ; reçu n'est pas indexé).`, result: { status: result.status ?? null, urlCount: result.urlCount } };
  });

/** Draft generation: open-source, local, deterministic; a draft is never a
 * publication and carries its own review note. */
export function runDraftGenerate(terms: unknown): ActionRunResult {
  const t = asDraftTerms(terms);
  const i = t.input;
  const input = { keyword: i.keyword, brand: i.brand ?? undefined, topic: i.topic ?? undefined, audience: i.audience ?? undefined, benefit: i.benefit ?? undefined, existingTitle: i.existingTitle ?? undefined, existingHeadings: i.existingHeadings };
  const drafts = t.kind === "titles" ? generateTitles(input) : t.kind === "meta" ? generateMetaDescriptions(input) : generateOutline(input);
  return {
    outcome: "succeeded",
    detail: `Brouillon « ${t.kind} » généré localement (générateurs open source, aucun appel externe) : ${Array.isArray(drafts) ? drafts.length : drafts.sections.length + 1} propositions, aucune publication.`,
    result: { kind: t.kind, drafts, note: "Brouillon généré automatiquement : relisez et ajustez avant tout usage ; ce texte n'est pas publié." },
  };
}

/** Report follow-up dispatch through the existing R9 pipeline: only due
 * follow-ups already consented by their recipient are dispatchable; the
 * sealed address stays inside the store, the catalog never sees it. */
export const runReportDispatch = async (terms: unknown, deps: ActionAdapterDeps = {}): Promise<ActionRunResult> => {
  const t = asReportDispatchTerms(terms);
  const dispatch = deps.dispatchReportFollowUp ?? defaultDispatchReportFollowUp;
  return adapterOutcome(async () => {
    const result = await dispatch(t.followUpId);
    if (result.status === "sent") return { outcome: "succeeded", detail: "Suivi de rapport envoyé à son destinataire vérifié via le pipeline TLS existant (même page, même portée).", result: { followUpId: t.followUpId, status: "sent" } };
    return { outcome: "failed", detail: `Suivi non envoyé : ${boundedDetail(result.error)}.` };
  });
};

/** Default wiring mirrors the ops scheduler exactly (env-gated, fail-closed):
 * same store, same strict-TLS sender, same fresh measure, same branded PDF. */
async function defaultDispatchReportFollowUp(followUpId: string): Promise<{ status: "sent" } | { status: "failed"; error: string; tag: string }> {
  const { reportFollowUpsRuntime } = await import("../console/ops-scheduler.js");
  const runtime = reportFollowUpsRuntime();
  if (!runtime) return { status: "failed", error: "suivis de rapports non activés (REPORT_FOLLOW_UPS_ENABLED et configuration SMTP requises)", tag: "failed" };
  try {
    // Bounded scan: only follow-ups already due are eligible — a dormant plan
    // can never be pushed early through the catalog.
    const due = runtime.store.dueFollowUps(Date.now(), 20);
    const item = due.find((d) => (d as DueFollowUp).id === followUpId);
    if (!item) return { status: "failed", error: "suivi introuvable ou pas encore dû : l'envoi ne concerne que les suivis déjà dus à leur destinataire vérifié", tag: "failed" };
    const options: DispatchOptions = {
      store: runtime.store, reader: runtime.reader, send: runtime.sender,
      renderPdf: (report, language, opts) => renderReportPdf(report as FreeReport360, language, { brand: opts?.brand ?? null }),
      suggestionFor: (milestone) => followUpSuggestionFor(milestone),
      reportNote: FOLLOWUP_REPORT_NOTE,
    };
    return await dispatchOneFollowUp(options, item);
  } finally {
    if (runtime.ownsStore && "close" in runtime.store && typeof (runtime.store as { close?: () => void }).close === "function") (runtime.store as unknown as { close: () => void }).close();
  }
}

/** Route dispatcher used by the console execute handler. */
export async function runCatalogAction(action: ActionId, terms: unknown, deps: ActionAdapterDeps = {}): Promise<ActionRunResult> {
  switch (action) {
    case "indexnow.submit":
      return runIndexNowSubmit(terms, (deps.submitIndexNow as typeof submitUrls | undefined) ?? submitUrls);
    case "draft.generate":
      return runDraftGenerate(terms);
    case "report.dispatch":
      return runReportDispatch(terms, deps);
  }
}
