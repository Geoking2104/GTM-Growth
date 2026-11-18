/** Authenticated, tenant-scoped Apply Mode previews. Mutation routes stay opt-in. */
import { canonicalVerifiedHostname } from "../geo/rendering/verified-domain.js";
import type { Fetcher } from "../geo/http.js";
import { previewRobotsAiFix } from "../apply/preview.js";
import { applyPrincipalFromSession } from "../apply/principal.js";
import type { ApplyRegistry } from "../apply/registry.js";
import { createPostApplyProposal, renderPost, type PostRestType } from "../apply/post-proposal.js";
import { executeApprovedProposal, rollbackProposal, type ApplyWriter } from "../apply/execution.js";
import { createWordpressRestWriter } from "../apply/writers/wordpress-rest.js";
import { wpConfigFromEnv } from "./content-ops.js";
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

/** One bounded WordPress REST resource: exactly what the writer may touch. */
export interface WordpressPostTarget {
  origin: string;
  restType: PostRestType;
  postId: number;
}

export interface ApplyMutationDeps {
  registry: ApplyRegistry | null;
  writesEnabled: boolean;
  /** Server-side writer resolution; the default reads per-tenant env credentials. */
  writerFor?: (tenantId: string, target: WordpressPostTarget, env: NodeJS.ProcessEnv) => ApplyWriter | null;
  env?: NodeJS.ProcessEnv;
}

/** Default factory: per-tenant env credentials, hostname-bound to the target. */
function envWordpressWriter(tenantId: string, target: WordpressPostTarget, env: NodeJS.ProcessEnv): ApplyWriter | null {
  const config = wpConfigFromEnv(tenantId, env);
  if (!config) return null;
  let credentials: URL;
  try { credentials = new URL(config.siteUrl); }
  catch { return null; }
  let requested: URL;
  try { requested = new URL(target.origin); }
  catch { return null; }
  if (credentials.hostname !== requested.hostname) return null;
  try { return createWordpressRestWriter({ ...config, restType: target.restType, postId: target.postId }); }
  catch { return null; }
}

function expectRestTarget(input: Record<string, unknown>): (WordpressPostTarget & { hostname: string }) | null {
  if (typeof input.url !== "string" || !input.url.trim() || input.url.length > 2048)
    return null;
  let site: URL;
  try { site = new URL(/^https?:\/\//i.test(input.url) ? input.url : `https://${input.url}`); }
  catch { return null; }
  if (site.protocol !== "https:" || site.port || site.username || site.password || site.search || site.hash)
    return null;
  if (input.restType !== "posts" && input.restType !== "pages") return null;
  if (!Number.isInteger(input.postId) || (input.postId as number) < 1 || (input.postId as number) > 10_000_000)
    return null;
  return { origin: site.origin, restType: input.restType, postId: input.postId as number,
    hostname: canonicalVerifiedHostname(site.hostname) };
}

/**
 * Opt-in Apply Mode mutations. `writesEnabled: false` (the default export) is
 * fail-closed: every mutating route refuses before touching the registry.
 */
export function createApplyMutationRoutes(deps: ApplyMutationDeps): ConsoleRoute[] {
  const writerFor = deps.writerFor ?? envWordpressWriter;
  const env = deps.env ?? process.env;
  return [{
    path: "/apply/wordpress-post",
    needsUrl: false,
    handler: async ({ body, user, tenancy }) => {
      const tenant = tenancy?.tenant;
      if (!tenant || tenant.status !== "active" || !user?.sub)
        throw new TenantAccessError("An active authenticated tenant is required for Apply Mode");
      if (!deps.registry) throw new Error("Apply Mode registry is unavailable on this server");
      const target = expectRestTarget(body);
      if (!target) throw new Error("A public HTTPS site and a bounded posts|pages REST id are required");
      if (!tenant.domains.includes(normalizeHost(target.hostname)))
        throw new TenantAccessError("Apply Mode target is not registered to this tenant");
      if (typeof body.title !== "string" || !body.title.trim() || body.title.length > 300 ||
          typeof body.content !== "string" || body.content.length > 60_000)
        throw new Error("A bounded title and content are required");

      const writer = writerFor(tenant.id, target, env);
      if (!writer)
        throw new Error("No scoped WordPress writer configured for this tenant and this exact domain");
      const observed = await writer.inspect();
      const proposal = createPostApplyProposal({
        tenantId: tenant.id, siteUrl: target.origin, restType: target.restType, postId: target.postId,
        observed: { text: observed.content, status: observed.status }, proposed: { text: renderPost(body.title, body.content) },
      });
      // Any authenticated tenant member may record a preview; privileges are
      // only required later, at approve/execute time.
      deps.registry.recordPreview(applyPrincipalFromSession(user, tenancy), proposal);
      return {
        proposal: {
          proposalId: proposal.proposalId, version: proposal.version, fixId: proposal.fixId,
          target: proposal.target, changed: proposal.changed, diff: proposal.diff,
          createdAt: proposal.createdAt, expiresAt: proposal.expiresAt, manualReview: proposal.manualReview,
          observedSha256: proposal.observed.sha256, proposedSha256: proposal.proposedSha256, diffSha256: proposal.diffSha256,
        },
        writesEnabled: deps.writesEnabled,
        actionsAvailable: deps.writesEnabled ? ["approve", "execute", "rollback"] : [],
      };
    },
  }, {
    path: "/apply/approve",
    needsUrl: false,
    handler: async ({ body, user, tenancy }) => {
      if (!deps.registry) throw new Error("Apply Mode registry is unavailable on this server");
      if (typeof body.proposalId !== "string" || typeof body.diffSha256 !== "string" || body.confirm !== true)
        throw new Error("An explicit confirmed approval with the reviewed diff digest is required");
      const principal = applyPrincipalFromSession(user, tenancy);
      const approval = deps.registry.approve(principal, body.proposalId, body.diffSha256, true);
      return { approved: true, proposalId: approval.proposalId, expiresAt: approval.expiresAt,
        singleUse: true, writesEnabled: deps.writesEnabled };
    },
  }, {
    path: "/apply/execute",
    needsUrl: false,
    handler: async ({ body, user, tenancy }) => {
      if (!deps.writesEnabled)
        throw new Error("Apply writes are disabled on this server");
      if (!deps.registry) throw new Error("Apply Mode registry is unavailable on this server");
      if (typeof body.proposalId !== "string")
        throw new Error("A proposal id is required");
      const tenant = tenancy?.tenant;
      const principal = applyPrincipalFromSession(user, tenancy);
      const preview = deps.registry.readPreview(principal, body.proposalId);
      if (!preview) throw new Error("Unknown Apply Mode proposal in this tenant");
      if (preview.version !== "apply-post-v1")
        throw new Error("Only WordPress REST post proposals are executable in this milestone");
      if (tenant && !tenant.domains.includes(normalizeHost(new URL(preview.target.url).hostname)))
        throw new TenantAccessError("Apply Mode target is not registered to this tenant");
      const site = new URL(preview.target.url);
      const match = /^\/wp-json\/wp\/v2\/(posts|pages)\/([1-9][0-9]{0,9})$/.exec(site.pathname);
      if (!match) throw new Error("The proposal target is not a bounded WordPress REST resource");
      const writer = writerFor(principal.tenantId,
        { origin: site.origin, restType: match[1] as PostRestType, postId: Number(match[2]) }, env);
      if (!writer)
        throw new Error("No scoped WordPress writer configured for this tenant and this exact domain");
      const receipt = await executeApprovedProposal({
        registry: deps.registry, principal, proposalId: body.proposalId, writer,
      });
      return { ...receipt, writesEnabled: true };
    },
  }, {
    path: "/apply/rollback",
    needsUrl: false,
    handler: async ({ body, user, tenancy }) => {
      if (!deps.writesEnabled)
        throw new Error("Apply writes are disabled on this server");
      if (!deps.registry) throw new Error("Apply Mode registry is unavailable on this server");
      if (typeof body.proposalId !== "string" || body.confirm !== true)
        throw new Error("An explicit confirmed rollback request is required");
      const tenant = tenancy?.tenant;
      const principal = applyPrincipalFromSession(user, tenancy);
      const preview = deps.registry.readPreview(principal, body.proposalId);
      if (!preview) throw new Error("Unknown Apply Mode proposal in this tenant");
      if (tenant && !tenant.domains.includes(normalizeHost(new URL(preview.target.url).hostname)))
        throw new TenantAccessError("Apply Mode target is not registered to this tenant");
      const site = new URL(preview.target.url);
      const match = /^\/wp-json\/wp\/v2\/(posts|pages)\/([1-9][0-9]{0,9})$/.exec(site.pathname);
      if (!match) throw new Error("The proposal target is not a bounded WordPress REST resource");
      const writer = writerFor(principal.tenantId,
        { origin: site.origin, restType: match[1] as PostRestType, postId: Number(match[2]) }, env);
      if (!writer)
        throw new Error("No scoped WordPress writer configured for this tenant and this exact domain");
      // Second, explicit approval is consumed by the rollback itself.
      deps.registry.approveRollback(principal, body.proposalId, true);
      const receipt = await rollbackProposal({
        registry: deps.registry, principal, proposalId: body.proposalId, writer,
      });
      return { ...receipt, writesEnabled: true };
    },
  }, {
    path: "/apply/attempt",
    needsUrl: false,
    handler: async ({ body, user, tenancy }) => {
      if (!deps.registry) throw new Error("Apply Mode registry is unavailable on this server");
      if (typeof body.proposalId !== "string") throw new Error("A proposal id is required");
      const principal = applyPrincipalFromSession(user, tenancy);
      return {
        state: deps.registry.state(principal, body.proposalId),
        attempt: deps.registry.attempt(principal, body.proposalId),
        writesEnabled: deps.writesEnabled,
      };
    },
  }];
}

/** Fail-closed default: every mutating route refuses without server-side opt-in. */
export const applyWriteRoutes = createApplyMutationRoutes({ registry: null, writesEnabled: false });
