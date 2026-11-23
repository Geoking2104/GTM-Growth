/**
 * Console routes for AI-crawler analytics (R6): tenant-supplied log analysis
 * and Apply-Mode dry-run drafts of the AI-bot robots policy plus an llms.txt
 * skeleton. The log analysis is free (no partner call, nothing stored) and both
 * policy routes emit text drafts only: no writer, no execution path. Every
 * answer keeps its provenance: tenant-supplied logs or operator-edited text,
 * never invented data.
 */
import { fetchPublicPage } from "../http/public-fetch.js";
import type { Fetcher } from "../geo/http.js";
import { canonicalVerifiedHostname } from "../geo/rendering/verified-domain.js";
import { normalizeHost } from "../tenants/store.js";
import { TenantAccessError, type TenantContext } from "../tenants/context.js";
import { analyzeAiCrawlerLogs, AI_CRAWLER_LOGS_MAX_BYTES, AI_CRAWLER_LOGS_MAX_LINES } from "../ai-crawlers/logs.js";
import { buildAiCrawlerPolicyDraft, parseCrawlerChoices } from "../ai-crawlers/policy.js";
import type { ConsoleRoute } from "./util.js";

/** Dependency injection stays in the server/test composition root. */
export function aiCrawlerRoutes(fetcher?: Fetcher): ConsoleRoute[] {
  const requireActiveTenant = (tenancy: TenantContext | undefined, userSub?: string) => {
    const tenant = tenancy?.tenant;
    if (!tenant || tenant.status !== "active" || !userSub)
      throw new TenantAccessError("Un tenant actif authentifié est requis pour l'analytique des crawlers IA");
    return tenant as { id: string; domains: string[] };
  };
  const publicFetch = fetcher ?? fetchPublicPage;
  const readRemoteFile = async (origin: string, pathname: string): Promise<{ status: number; body: string }> => {
    const response = await publicFetch(new URL(pathname, origin).href, { accept: "text/plain", timeoutMs: 12_000 });
    if (response.status !== 200 && response.status !== 404)
      throw new Error(`Lecture de ${pathname} impossible sans ambiguïté (HTTP ${response.status} ou redirection)`);
    return { status: response.status, body: response.status === 200 ? response.body : "" };
  };
  return [
    {
      path: "/apply/ai-crawlers/policy",
      needsUrl: false,
      adminOnly: true,
      handler: async ({ body, user, tenancy }) => {
        const tenant = requireActiveTenant(tenancy, user?.sub);
        if (body.confirm !== undefined || body.apply !== undefined || (body.mode !== undefined && body.mode !== "dry-run"))
          throw new Error("Les écritures Apply sont désactivées ; seul le dry-run est disponible.");
        const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
        if (!rawUrl || rawUrl.length > 2048) throw new Error("Une URL HTTPS bornée est requise.");
        let site: URL;
        try { site = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`); }
        catch { throw new Error("URL du site invalide."); }
        if (site.protocol !== "https:" || site.port || site.username || site.password || site.search || site.hash)
          throw new Error("Le projet exige une URL HTTPS publique, sans identifiant ni paramètre.");
        const hostname = canonicalVerifiedHostname(site.hostname);
        if (!tenant.domains.includes(normalizeHost(hostname)))
          throw new TenantAccessError("La cible n'est pas un domaine enregistré de ce tenant.");
        const choices = parseCrawlerChoices(body.choices);
        const robots = typeof body.robots === "string" && body.robots.length
          ? body.robots
          : (await readRemoteFile(site.origin, "/robots.txt")).body;
        const llmsSupplied = typeof body.llms === "string" ? (body.llms.length ? body.llms : null) : null;
        const currentLlms = typeof body.llms === "string"
          ? llmsSupplied
          : body.fetchLlms
            ? ((await readRemoteFile(site.origin, "/llms.txt")).body || null)
            : null;
        const policy = buildAiCrawlerPolicyDraft({ baseUrl: site.origin, currentRobots: robots, currentLlms, choices });
        return {
          policy,
          actionsAvailable: ["draft"],
          writesEnabled: false,
          requiresSeparateDomainVerificationAndApproval: true,
        };
      },
    },
    {
      path: "/ai-crawlers/analyze",
      needsUrl: false,
      adminOnly: true,
      handler: async ({ body, user, tenancy }) => {
        requireActiveTenant(tenancy, user?.sub);
        const logs = typeof body.logs === "string" ? body.logs : "";
        if (Buffer.byteLength(logs, "utf8") > AI_CRAWLER_LOGS_MAX_BYTES || logs.split("\n").length > AI_CRAWLER_LOGS_MAX_LINES)
          throw new Error(`Journaux trop volumineux (limite ${AI_CRAWLER_LOGS_MAX_LINES} lignes ou ${AI_CRAWLER_LOGS_MAX_BYTES} octets) ; fournissez un extrait plus court.`);
        return analyzeAiCrawlerLogs({ logs });
      },
    },
  ];
}
