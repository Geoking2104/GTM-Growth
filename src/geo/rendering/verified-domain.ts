/** Supplied only by the trusted domain-ownership registry, never a client request. */
export interface VerifiedDomainGrant {
  hostname: string;
  verifiedAt: string;
  expiresAt: string;
  status: "verified" | "pending" | "revoked";
}

export interface AuditTarget {
  url: string;
  hostname: string;
}

/** Canonical DNS name; an explicit subdomain requires its own grant. */
export function canonicalVerifiedHostname(value: string): string {
  let parsed: URL;
  try { parsed = new URL(`https://${value}`); }
  catch { throw new Error("Invalid domain hostname"); }
  if (value !== parsed.hostname || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value) ||
      parsed.hostname === "localhost" || parsed.hostname.endsWith(".localhost") ||
      /^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname) || parsed.hostname.startsWith("[") ||
      parsed.hostname.endsWith(".local") || parsed.hostname.endsWith(".internal")) {
    throw new Error("Invalid public domain hostname");
  }
  return parsed.hostname;
}

/** Exact-host, HTTPS-only admission. Redirects and all browser requests must be checked separately. */
export function authorizeVerifiedAuditTarget(
  input: string,
  grant: VerifiedDomainGrant,
  now: Date = new Date(),
): AuditTarget {
  if (grant.status !== "verified") throw new Error("Domain ownership not verified");
  const approvedHost = canonicalVerifiedHostname(grant.hostname);
  const verifiedAt = Date.parse(grant.verifiedAt);
  const expiresAt = Date.parse(grant.expiresAt);
  if (!Number.isFinite(verifiedAt) || !Number.isFinite(expiresAt) ||
      verifiedAt > now.getTime() || expiresAt <= now.getTime() || expiresAt <= verifiedAt) {
    throw new Error("Invalid or expired domain verification");
  }
  let target: URL;
  try {
    target = new URL(input);
  } catch { throw new Error("Invalid audit URL or verified hostname"); }
  if (target.protocol !== "https:" || target.username || target.password ||
      target.port !== "" || target.hash || !target.hostname ||
      target.hostname !== approvedHost ||
      /^\d+\.\d+\.\d+\.\d+$/.test(target.hostname) || target.hostname.startsWith("[") ||
      target.hostname === "localhost" ||
      target.hostname.endsWith(".localhost") || !target.hostname.includes(".")) {
    throw new Error("Target must be an exact verified public HTTPS hostname");
  }
  return { url: target.href, hostname: target.hostname };
}
