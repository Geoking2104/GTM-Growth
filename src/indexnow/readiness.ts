/**
 * IndexNow readiness — a 100-point check that sits *outside* the GEO rubric.
 *
 * The GEO rubric scores how citable a page is. This scores whether a change can
 * reach Bing and its IndexNow partners at all: key published, key file served
 * correctly, verification in place, sitemap declared, Bingbot allowed.
 *
 * Keeping it separate matters: a site can be fully citable (GEO 90) and still
 * take days to be re-crawled because no key file exists.
 */

import { keyMaterial, verifyKeyFile, type VerifyResult } from "./client.js";
import type { GeoAuditResult } from "../geo/types.js";

export type ReadinessStatus = "pass" | "warn" | "fail" | "info";

export interface ReadinessCheck {
  id: string;
  label: string;
  points: number;
  max: number;
  status: ReadinessStatus;
  evidence: string;
  fix?: string;
}

export interface IndexNowReadiness {
  host: string;
  score: number;
  band: "ready" | "partial" | "missing";
  checks: ReadinessCheck[];
  keyFileUrl: string | null;
  /** Points still on the table. */
  recoverable: number;
}

/** Weights sum to 100. Every point is attributable to one check. */
export const INDEXNOW_WEIGHTS = {
  keyFormat: 10,
  keyFile: 35,
  keyFileMatches: 10,
  bingVerification: 10,
  bingbotAllowed: 15,
  sitemap: 10,
  https: 10,
} as const;

export interface ReadinessInput {
  host: string;
  https: boolean;
  audit?: Pick<GeoAuditResult, "details"> | null;
  key?: string | null;
  keyVerification?: VerifyResult | null;
  /** `msvalidate.01` meta content, when the page was parsed. */
  bingVerification?: string | null;
}

export function scoreIndexNowReadiness(input: ReadinessInput): IndexNowReadiness {
  const checks: ReadinessCheck[] = [];
  const host = input.host.replace(/^https?:\/\//i, "").replace(/\/$/, "").toLowerCase();

  const key = input.key?.trim() || null;
  const keyOk = Boolean(key && /^[A-Za-z0-9-]{8,128}$/.test(key));
  checks.push({
    id: "indexnow.key",
    label: "Key generated in the protocol grammar",
    points: keyOk ? INDEXNOW_WEIGHTS.keyFormat : 0,
    max: INDEXNOW_WEIGHTS.keyFormat,
    status: keyOk ? "pass" : key ? "fail" : "warn",
    evidence: key ? `${key.length} characters` : "no key provided",
    fix: keyOk ? undefined : "Generate one: 8–128 characters of a–z, A–Z, 0–9 or dash.",
  });

  const verification = input.keyVerification ?? null;
  const keyFileOk = Boolean(verification?.ok);
  checks.push({
    id: "indexnow.keyfile",
    label: "Key file published at the host",
    points: keyFileOk ? INDEXNOW_WEIGHTS.keyFile : 0,
    max: INDEXNOW_WEIGHTS.keyFile,
    status: keyFileOk ? "pass" : verification ? "fail" : "warn",
    evidence: verification
      ? `${verification.keyFileUrl} → ${verification.status ?? "no response"}${verification.found ? `, “${verification.found.slice(0, 40)}”` : ""}`
      : "not checked",
    fix: keyFileOk ? undefined : "Publish <key>.txt at the site root, served as text/plain, UTF-8.",
  });

  const matchesOk = Boolean(verification?.ok && verification.found === key);
  checks.push({
    id: "indexnow.keyfile-matches",
    label: "Key file contains exactly the key",
    points: matchesOk ? INDEXNOW_WEIGHTS.keyFileMatches : 0,
    max: INDEXNOW_WEIGHTS.keyFileMatches,
    status: matchesOk ? "pass" : verification?.ok === false ? "fail" : "warn",
    evidence: verification?.found ? `found “${verification.found.slice(0, 48)}”` : "not checked",
    fix: matchesOk ? undefined : "The file must contain the key alone — no HTML, no JSON wrapper.",
  });

  const bingMeta = input.bingVerification?.trim() || "";
  checks.push({
    id: "indexnow.bing-verification",
    label: "Bing Webmaster Tools verification",
    points: bingMeta ? INDEXNOW_WEIGHTS.bingVerification : 0,
    max: INDEXNOW_WEIGHTS.bingVerification,
    status: bingMeta ? "pass" : "warn",
    evidence: bingMeta ? `msvalidate.01 present` : "no msvalidate.01 meta tag",
    fix: bingMeta
      ? undefined
      : "Add the verification meta tag from Bing Webmaster Tools — IndexNow works without it, but quota and reporting do not.",
  });

  const robots = input.audit?.details.robots;
  const bingbotBlocked = Boolean(robots?.botsBlocked?.includes("Bingbot"));
  const bingbotAllowed = bingbotBlocked ? false : true;
  checks.push({
    id: "indexnow.bingbot",
    label: "Bingbot allowed by robots.txt",
    points: bingbotAllowed ? INDEXNOW_WEIGHTS.bingbotAllowed : 0,
    max: INDEXNOW_WEIGHTS.bingbotAllowed,
    status: robots ? (bingbotAllowed ? "pass" : "fail") : "warn",
    evidence: robots ? (bingbotBlocked ? "Bingbot blocked" : "Bingbot not blocked") : "robots.txt not audited",
    fix: bingbotAllowed ? undefined : "Allow Bingbot: IndexNow announces URLs, the crawler still fetches them.",
  });

  const sitemaps = robots?.sitemaps ?? [];
  checks.push({
    id: "indexnow.sitemap",
    label: "Sitemap declared in robots.txt",
    points: sitemaps.length ? INDEXNOW_WEIGHTS.sitemap : 0,
    max: INDEXNOW_WEIGHTS.sitemap,
    status: sitemaps.length ? "pass" : "warn",
    evidence: sitemaps.length ? sitemaps[0].slice(0, 60) : "no Sitemap line",
    fix: sitemaps.length ? undefined : "Add `Sitemap: https://<host>/sitemap.xml` — IndexNow is for changes, the sitemap is for discovery.",
  });

  checks.push({
    id: "indexnow.https",
    label: "Site served over HTTPS",
    points: input.https ? INDEXNOW_WEIGHTS.https : 0,
    max: INDEXNOW_WEIGHTS.https,
    status: input.https ? "pass" : "fail",
    evidence: input.https ? "https" : "http",
    fix: input.https ? undefined : "HTTPS is required before search engines will trust the key file origin.",
  });

  const earned = checks.reduce((sum, check) => sum + check.points, 0);
  const max = checks.reduce((sum, check) => sum + check.max, 0);
  const score = Math.round((earned / max) * 100);

  return {
    host,
    score,
    band: score >= 80 ? "ready" : score >= 50 ? "partial" : "missing",
    checks,
    keyFileUrl: key ? keyMaterial(key, host).fileUrl : null,
    recoverable: max - earned,
  };
}

/** Convenience: verify the key file, then score, in one call. */
export async function auditIndexNow(input: {
  host: string;
  https: boolean;
  audit?: Pick<GeoAuditResult, "details"> | null;
  key?: string | null;
  bingVerification?: string | null;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}): Promise<IndexNowReadiness> {
  let verification: VerifyResult | null = null;
  if (input.key) {
    verification = await verifyKeyFile(input.key, input.host, {
      fetcher: input.fetcher,
      timeoutMs: input.timeoutMs,
    });
  }
  return scoreIndexNowReadiness({ ...input, keyVerification: verification });
}
