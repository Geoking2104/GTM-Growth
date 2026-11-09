/** One-shot offline-to-public rendering job. Not an API route or a queue consumer. */
import fs from "node:fs";
import Database from "better-sqlite3";
import { chromium } from "playwright-core";
import { authorizeVerifiedAuditTarget } from "./verified-domain.js";
import type { VerifiedDomainGrant } from "./verified-domain.js";

export interface RenderEvidence {
  format: "geo-v2-render-v1";
  url: string;
  finalUrl: string | null;
  status: "complete" | "render_incomplete";
  title: string | null;
  bodyTextLength: number;
  blockedRequests: number;
  error?: string;
}

function activeGrantReadOnly(file: string, tenantId: string, hostname: string): VerifiedDomainGrant {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare(`SELECT hostname, status, verified_at, expires_at FROM domain_grants
      WHERE hostname = ? AND tenant_id = ?`).get(hostname, tenantId) as {
        hostname: string; status: "verified" | "revoked"; verified_at: string; expires_at: string;
      } | undefined;
    if (!row) throw new Error("Verified tenant-domain grant not found");
    return { hostname: row.hostname, status: row.status, verifiedAt: row.verified_at, expiresAt: row.expires_at };
  } finally { db.close(); }
}

/** A caller must impose container-level memory/CPU/time/PID/egress limits. */
export async function renderVerifiedDomain(
  url: string,
  grant: VerifiedDomainGrant,
  proxy: string,
): Promise<RenderEvidence> {
  const target = authorizeVerifiedAuditTarget(url, grant);
  const proxyUrl = new URL(proxy);
  if (proxyUrl.protocol !== "http:" || proxyUrl.hostname !== "egress" || proxyUrl.port !== "3128" ||
      proxyUrl.username || proxyUrl.password) throw new Error("Dedicated egress proxy required");
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    proxy: { server: proxy },
    args: ["--disable-background-networking", "--disable-extensions", "--no-first-run", "--disable-sync"],
  });
  let blockedRequests = 0;
  let finalUrl: string | null = null;
  let title: string | null = null;
  let bodyTextLength = 0;
  let error: string | undefined;
  try {
    const context = await browser.newContext({
      serviceWorkers: "block", acceptDownloads: false, ignoreHTTPSErrors: false,
      javaScriptEnabled: true,
    });
    const page = await context.newPage();
    await page.route("**/*", async (route) => {
      try {
        const request = route.request();
        const requested = new URL(request.url());
        if (requested.protocol !== "https:" || requested.hostname !== target.hostname ||
            requested.port || requested.username || requested.password) throw new Error("Off-host request");
        await route.continue();
      } catch { blockedRequests++; await route.abort("blockedbyclient"); }
    });
    try {
      await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      finalUrl = page.url();
      authorizeVerifiedAuditTarget(finalUrl, grant);
      title = (await page.title()).slice(0, 512);
      bodyTextLength = Math.min((await page.locator("body").innerText({ timeout: 5000 })).length, 5_000_000);
    } catch (cause) { error = cause instanceof Error ? cause.message.slice(0, 300) : "render_failed"; }
    await context.close();
  } finally { await browser.close(); }
  return {
    format: "geo-v2-render-v1", url: target.url, finalUrl,
    status: error || blockedRequests ? "render_incomplete" : "complete",
    title, bodyTextLength, blockedRequests,
    ...(error ? { error } : {}),
  };
}

if (process.argv[1]?.endsWith("geo-renderer.js")) {
  const [tenantId, url] = process.argv.slice(2);
  const databasePath = process.env.GEO_DOMAIN_REGISTRY_PATH ?? "/registry/domain-verifications.sqlite3";
  if (!tenantId || !/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/.test(tenantId) || !url ||
      !process.env.GEO_TARGET_HOSTNAME || !fs.existsSync(databasePath)) {
    throw new Error("Tenant, target URL, verified hostname and read-only registry are required");
  }
  const hostname = new URL(url).hostname;
  if (hostname !== process.env.GEO_TARGET_HOSTNAME) throw new Error("Target/proxy hostname mismatch");
  const grant = activeGrantReadOnly(databasePath, tenantId, hostname);
  renderVerifiedDomain(url, grant, "http://egress:3128")
    .then((result) => { process.stdout.write(`${JSON.stringify(result)}\n`); if (result.status !== "complete") process.exitCode = 2; })
    .catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "render_failed"}\n`); process.exitCode = 1; });
}
