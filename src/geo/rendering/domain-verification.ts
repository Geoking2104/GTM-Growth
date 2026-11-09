import { canonicalVerifiedHostname } from "./verified-domain.js";
import type { VerifiedDomainGrant } from "./verified-domain.js";

export type VerificationMethod = "dns-txt" | "https-file";

export interface DomainChallenge {
  hostname: string;
  method: VerificationMethod;
  token: string;
  issuedAt: string;
  expiresAt: string;
  consumedAt?: string;
}

/** Must be implemented by a trusted egress-constrained resolver/client, not a raw fetch. */
export interface VerificationTransport {
  resolveTxt(hostname: string): Promise<readonly string[]>;
  readHttpsFile(url: string): Promise<{
    status: number;
    finalUrl: string;
    body: string;
    contentType: string;
  }>;
}

export const DNS_PREFIX = "_gtm-growth-verify.";
export const HTTPS_PATH = "/.well-known/gtm-growth-verification.txt";
const CHALLENGE_TTL_MS = 30 * 60 * 1000;
const GRANT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function verificationValue(challenge: DomainChallenge): string {
  return `gtm-growth-verification=${challenge.token}`;
}

/** Call server-side only; persist challenge atomically in an owner-bound registry. */
export function issueDomainChallenge(hostname: string, method: VerificationMethod, now = new Date()): DomainChallenge {
  canonicalVerifiedHostname(hostname);
  if (method !== "dns-txt" && method !== "https-file") throw new Error("Invalid verification method");
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid issuance time");
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const token = Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return {
    hostname, method, token,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString(),
  };
}

/** Pure evaluation apart from injected transport; success must be committed once by the registry. */
export async function evaluateDomainChallenge(
  challenge: DomainChallenge,
  transport: VerificationTransport,
  now = new Date(),
): Promise<VerifiedDomainGrant> {
  canonicalVerifiedHostname(challenge.hostname);
  const start = Date.parse(challenge.issuedAt);
  const end = Date.parse(challenge.expiresAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(now.getTime()) ||
      start > now.getTime() || end <= now.getTime() || end - start > CHALLENGE_TTL_MS ||
      challenge.consumedAt !== undefined || !/^[a-f0-9]{64}$/.test(challenge.token)) {
    throw new Error("Expired or invalid verification challenge");
  }
  const expected = verificationValue(challenge);
  if (challenge.method === "dns-txt") {
    const records = await transport.resolveTxt(`${DNS_PREFIX}${challenge.hostname}`);
    if (records.length !== 1 || records[0] !== expected) throw new Error("DNS TXT ownership proof mismatch");
  } else if (challenge.method === "https-file") {
    const url = `https://${challenge.hostname}${HTTPS_PATH}`;
    const response = await transport.readHttpsFile(url);
    if (response.status !== 200 || response.finalUrl !== url ||
        !/^text\/plain(?:\s*;|\s*$)/i.test(response.contentType) ||
        response.body.length > 128 || response.body.replace(/\r?\n$/, "") !== expected) {
      throw new Error("HTTPS file ownership proof mismatch");
    }
  } else {
    throw new Error("Invalid verification method");
  }
  return {
    hostname: challenge.hostname,
    status: "verified",
    verifiedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + GRANT_TTL_MS).toISOString(),
  };
}
