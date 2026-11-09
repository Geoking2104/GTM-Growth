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

/** Exact-host, HTTPS-only admission. Redirects and all browser requests must be checked separately. */
export function authorizeVerifiedAuditTarget(
  input: string,
  grant: VerifiedDomainGrant,
  now: Date = new Date(),
): AuditTarget {
  if (grant.status !== "verified") throw new Error("Domain ownership not verified");
  const verifiedAt = Date.parse(grant.verifiedAt);
  const expiresAt = Date.parse(grant.expiresAt);
  if (!Number.isFinite(verifiedAt) || !Number.isFinite(expiresAt) ||
      verifiedAt > now.getTime() || expiresAt <= now.getTime() || expiresAt <= verifiedAt) {
    throw new Error("Invalid or expired domain verification");
  }
  let target: URL;
  let granted: URL;
  try {
    target = new URL(input);
    granted = new URL(`https://${grant.hostname}`);
  } catch { throw new Error("Invalid audit URL or verified hostname"); }
  if (target.protocol !== "https:" || target.username || target.password ||
      target.port !== "" || target.hash || !target.hostname ||
      target.hostname !== granted.hostname || grant.hostname !== granted.hostname ||
      granted.host !== granted.hostname ||
      grant.hostname.includes("/") || grant.hostname.includes("@") ||
      /^\d+\.\d+\.\d+\.\d+$/.test(target.hostname) || target.hostname.startsWith("[") ||
      target.hostname === "localhost" ||
      target.hostname.endsWith(".localhost") || !target.hostname.includes(".")) {
    throw new Error("Target must be an exact verified public HTTPS hostname");
  }
  return { url: target.href, hostname: target.hostname };
}
