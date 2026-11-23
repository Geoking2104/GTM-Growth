/**
 * Pre-approved action catalog (R11): a versioned, spec-level list of actions
 * eligible for one-click governed execution. Every entry carries its terms
 * contract and its entry/exit rules; the ledger (see ledger.ts) journals one
 * approval bound to the exact terms digest, one atomic execution claim and a
 * full audit trail per execution. Everything else — robots/meta writes,
 * WordPress publication, GBP, CRM, social — stays OUT of the catalog and keeps
 * its module-specific human confirmation; this file never invents an eligible
 * action, and nothing here bills tenants or calls a paid API.
 */
import { createHash } from "node:crypto";
import { KEY_PATTERN } from "../indexnow/client.js";

export const ACTION_CATALOG_VERSION = "preapproved-actions-v1";

export type ActionId = "indexnow.submit" | "draft.generate" | "report.dispatch";

export interface ActionCatalogEntry {
  id: ActionId;
  /** Terms/governance contract version for this entry. */
  version: string;
  kind: "submit" | "generate" | "dispatch";
  title: { fr: string; en: string };
  summary: { fr: string; en: string };
  /** Entry rule: a proposal older than this many hours cannot be approved. */
  proposalTtlHours: number;
  /** Exit rule: an approval expires after this many hours and must be renewed. */
  approvalTtlHours: number;
}

/** Bounded bounds are part of the entry rules, checked in normaliseTerms. */
export const INDEXNOW_MAX_URLS_PER_ACTION = 100;
export const DRAFT_INPUT_LIMITS = {
  keyword: 200, brand: 100, topic: 200, audience: 100, benefit: 200,
  existingTitle: 300, headings: 12, heading: 200,
} as const;

export const ACTION_CATALOG: ActionCatalogEntry[] = [
  {
    id: "indexnow.submit", version: "indexnow-submit-v1", kind: "submit",
    title: { fr: "Soumission IndexNow", en: "IndexNow submission" },
    summary: {
      fr: "Soumet jusqu'à 100 URLs du domaine du client au protocole IndexNow (confirme explicite incluse, client existant, aucune donnée inventée).",
      en: "Submits up to 100 URLs of the tenant's domain to the IndexNow protocol (explicit confirm included, existing client, no invented data).",
    },
    proposalTtlHours: 72, approvalTtlHours: 24,
  },
  {
    id: "draft.generate", version: "draft-generate-v1", kind: "generate",
    title: { fr: "Génération de brouillon", en: "Draft generation" },
    summary: {
      fr: "Génère un brouillon local (titres, métadonnées ou plan) via les générateurs open source : aucun appel externe, aucune publication, brouillon à relire par un humain.",
      en: "Generates a local draft (titles, metadata or outline) through the open-source generators: no external call, no publication, the draft is for human review.",
    },
    proposalTtlHours: 72, approvalTtlHours: 24,
  },
  {
    id: "report.dispatch", version: "report-dispatch-v1", kind: "dispatch",
    title: { fr: "Envoi d'un suivi de rapport dû", en: "Dispatch of a due report follow-up" },
    summary: {
      fr: "Envoie un suivi de rapport 360° déjà dû (J+14/J+28) à son destinataire vérifié via le pipeline TLS existant : même page, même portée, aucun score global, adresse jamais manipulée en clair par le catalogue.",
      en: "Dispatches an already due 360° report follow-up (J+14/J+28) to its verified recipient through the existing strict-TLS pipeline: same page, same scope, no score summing, the address is never handled in clear by the catalog.",
    },
    proposalTtlHours: 72, approvalTtlHours: 24,
  },
];

/** Writes that are explicitly NOT pre-approved: each keeps its own
 * module-level human confirmation and can never enter this catalog. */
export const CATALOG_EXCLUDED_WRITES: { id: string; fr: string; en: string; module: string }[] = [
  { id: "apply.robots-meta", fr: "Écritures robots.txt / meta (Apply Mode)", en: "robots.txt / meta writes (Apply Mode)", module: "src/apply" },
  { id: "wordpress.publish", fr: "Publications WordPress", en: "WordPress publications", module: "src/console/content-ops.ts" },
  { id: "gbp.write", fr: "Écritures Google Business Profile", en: "Google Business Profile writes", module: "src/local-seo" },
  { id: "crm.write", fr: "Écritures CRM", en: "CRM writes", module: "src/crm" },
  { id: "social.publish", fr: "Publications sociales", en: "Social publications", module: "src/console/social.ts" },
];

export const catalogEntry = (id: string): ActionCatalogEntry => {
  const entry = ACTION_CATALOG.find((entry) => entry.id === id);
  if (!entry) throw new Error("Action hors catalogue : seule une action du catalogue pré-approuvé peut être proposée (les autres écritures gardent leur confirmation humaine dans le module concerné).");
  return entry;
};

export const isCatalogAction = (id: string): id is ActionId => ACTION_CATALOG.some((entry) => entry.id === id);

export interface IndexNowSubmitTerms {
  host: string;
  key: string;
  urls: string[];
}
export type DraftKind = "titles" | "meta" | "outline";
export interface DraftGenerateTerms {
  kind: DraftKind;
  input: { keyword: string; brand: string | null; topic: string | null; audience: string | null; benefit: string | null; existingTitle: string | null; existingHeadings: string[] };
}
export interface ReportDispatchTerms {
  followUpId: string;
}
export type ActionTerms = IndexNowSubmitTerms | DraftGenerateTerms | ReportDispatchTerms;

const boundedString = (value: unknown, label: string, max: number, required: boolean): string | null => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    if (required) throw new Error(`${label} requis.`);
    return null;
  }
  if (text.length > max) throw new Error(`${label} trop long (${max} caractères maximum).`);
  return text;
};

/** Strict hostname (no scheme, no path), like normaliseMarketDomain's rules. */
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const normaliseHostTerm = (value: unknown): string => {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) throw new Error("Nom d'hôte requis.");
  let host = raw;
  if (/^https?:\/\//i.test(raw)) {
    try { host = new URL(raw).hostname.toLowerCase(); } catch { throw new Error("Nom d'hôte invalide."); }
  } else host = host.replace(/\/.*$/, "").toLowerCase();
  if (!host.includes(".") || host.split(".").some((label) => !HOST_LABEL.test(label))) throw new Error("Nom d'hôte invalide.");
  return host;
};

const normaliseIndexNow = (raw: Record<string, unknown>): IndexNowSubmitTerms => {
  const host = normaliseHostTerm(raw.host);
  const key = typeof raw.key === "string" ? raw.key.trim() : "";
  if (!KEY_PATTERN.test(key)) throw new Error("Clé IndexNow invalide (8 à 128 caractères A-Z a-z 0-9 -).");
  const urls = (Array.isArray(raw.urls) ? raw.urls : []).filter((u): u is string => typeof u === "string" && u.trim().length > 0).map((u) => u.trim());
  if (!urls.length) throw new Error("Au moins une URL est requise.");
  if (urls.length > INDEXNOW_MAX_URLS_PER_ACTION) throw new Error(`${INDEXNOW_MAX_URLS_PER_ACTION} URLs maximum par opération.`);
  for (const url of urls) {
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new Error("URL invalide dans la liste IndexNow."); }
    if (parsed.protocol !== "https:") throw new Error("Les URLs IndexNow doivent être en HTTPS.");
    if (parsed.hostname.toLowerCase() !== host) throw new Error("Chaque URL doit appartenir à l'hôte déclaré de l'opération.");
  }
  return { host, key, urls: [...new Set(urls)] };
};

const normaliseDraft = (raw: Record<string, unknown>): DraftGenerateTerms => {
  const kind = raw.kind;
  if (kind !== "titles" && kind !== "meta" && kind !== "outline") throw new Error("Type de brouillon invalide (titles, meta ou outline).");
  const input = (raw.input && typeof raw.input === "object" ? raw.input : {}) as Record<string, unknown>;
  const keyword = boundedString(input.keyword, "Mot-clé", DRAFT_INPUT_LIMITS.keyword, true)!;
  const brand = boundedString(input.brand, "Marque", DRAFT_INPUT_LIMITS.brand, false);
  const topic = boundedString(input.topic, "Sujet", DRAFT_INPUT_LIMITS.topic, false);
  const audience = boundedString(input.audience, "Audience", DRAFT_INPUT_LIMITS.audience, false);
  const benefit = boundedString(input.benefit, "Bénéfice", DRAFT_INPUT_LIMITS.benefit, false);
  const existingTitle = boundedString(input.existingTitle, "Titre existant", DRAFT_INPUT_LIMITS.existingTitle, false);
  const headingsRaw = Array.isArray(input.existingHeadings) ? input.existingHeadings : [];
  const existingHeadings = headingsRaw
    .filter((h): h is string => typeof h === "string" && h.trim().length > 0)
    .map((h) => h.trim().slice(0, DRAFT_INPUT_LIMITS.heading));
  if (existingHeadings.length > DRAFT_INPUT_LIMITS.headings) throw new Error(`${DRAFT_INPUT_LIMITS.headings} titres de sections maximum.`);
  return { kind, input: { keyword, brand, topic, audience, benefit, existingTitle, existingHeadings } };
};

const normaliseReportDispatch = (raw: Record<string, unknown>): ReportDispatchTerms => {
  const followUpId = boundedString(raw.followUpId, "Identifiant de suivi", 128, true)!;
  if (!/^[A-Za-z0-9-]+$/.test(followUpId)) throw new Error("Identifiant de suivi invalide.");
  return { followUpId };
};

/** Entry rules: strict normalisation and validation of the exact terms. */
export function normaliseTerms(id: string, raw: unknown): ActionTerms {
  const entry = catalogEntry(id);
  const body = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  switch (entry.id) {
    case "indexnow.submit": return normaliseIndexNow(body);
    case "draft.generate": return normaliseDraft(body);
    case "report.dispatch": return normaliseReportDispatch(body);
  }
}

/** Canonical digest of the exact terms: an approval only ever covers this. */
export function termsDigest(terms: ActionTerms): string {
  if ("host" in terms) {
    const t = terms as IndexNowSubmitTerms;
    return createHash("sha256").update(`indexnow-submit-v1:${t.host}:${t.key}:${t.urls.join("\n")}`).digest("hex");
  }
  if ("kind" in terms) {
    const t = terms as DraftGenerateTerms;
    const i = t.input;
    return createHash("sha256").update(`draft-generate-v1:${t.kind}:${i.keyword}|${i.brand ?? ""}|${i.topic ?? ""}|${i.audience ?? ""}|${i.benefit ?? ""}|${i.existingTitle ?? ""}|${i.existingHeadings.join("|")}`).digest("hex");
  }
  const t = terms as ReportDispatchTerms;
  return createHash("sha256").update(`report-dispatch-v1:${t.followUpId}`).digest("hex");
}

/** Type guard helpers reused by the adapters: the terms were normalised at
 * proposal time, the cast never invents a field. */
export const asIndexNowTerms = (terms: unknown): IndexNowSubmitTerms => terms as IndexNowSubmitTerms;
export const asDraftTerms = (terms: unknown): DraftGenerateTerms => terms as DraftGenerateTerms;
export const asReportDispatchTerms = (terms: unknown): ReportDispatchTerms => terms as ReportDispatchTerms;
