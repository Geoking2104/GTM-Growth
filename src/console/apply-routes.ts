/** Authenticated, tenant-scoped Apply Mode previews. No mutation route exists here. */
import { canonicalVerifiedHostname } from "../geo/rendering/verified-domain.js";
import type { Fetcher } from "../geo/http.js";
import { previewRobotsAiFix } from "../apply/preview.js";
import { normalizeHost } from "../tenants/store.js";
import { TenantAccessError } from "../tenants/context.js";
import type { ConsoleRoute } from "./util.js";

/** Dependency injection is restricted to the server/test composition root. */
export function createApplyPreviewRoutes(fetcher?: Fetcher): ConsoleRoute[] {
  return [{
    path: "/apply/preview",
    needsUrl: false,
    handler: async ({ body, user, tenancy }) => {
      const tenant = tenancy?.tenant;
      if (!tenant || tenant.status !== "active" || !user?.sub)
        throw new TenantAccessError("An active authenticated tenant is required for Apply Mode preview");
      if (body.fix !== "robots-ai")
        throw new Error("Only the robots-ai read-only preview is available");
      if (body.confirm !== undefined || body.apply !== undefined ||
          (body.mode !== undefined && body.mode !== "dry-run"))
        throw new Error("Apply writes are disabled; only dry-run previews are available");
      if (typeof body.url !== "string" || !body.url.trim() || body.url.length > 2048)
        throw new Error("A bounded HTTPS website URL is required");

      let site: URL;
      try { site = new URL(/^https?:\/\//i.test(body.url) ? body.url : `https://${body.url}`); }
      catch { throw new Error("Invalid Apply Mode site URL"); }
      if (site.protocol !== "https:" || site.port || site.username || site.password ||
          site.hash || site.search)
        throw new Error("Apply Mode preview requires a public HTTPS URL without credentials or parameters");

      const hostname = canonicalVerifiedHostname(site.hostname);
      // The tenant registry normalizes the common www alias; other subdomains
      // must be explicitly registered. A preview grants NO write privileges.
      if (!tenant.domains.includes(normalizeHost(hostname)))
        throw new TenantAccessError("Apply Mode preview target is not registered to this tenant");

      const preview = await previewRobotsAiFix({ url: site.origin, tenantId: tenant.id, fetcher });
      return {
        preview,
        actionsAvailable: ["preview"],
        writesEnabled: false,
        requiresSeparateDomainVerificationAndApproval: true,
      };
    },
  }];
}

export const applyPreviewRoutes = createApplyPreviewRoutes();
