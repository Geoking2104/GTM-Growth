/**
 * Console routes for the pre-approved action catalog (R11): propose → approve
 * → execute, one governed ledger per operation. Members can read the catalog
 * and their tenant's operations; proposal, approval, execution and
 * reconciliation are tenant-admin acts. One-click means the console may chain
 * approve+execute in a single gesture, but each step stays journaled with its
 * own audit event and the exact-terms digest. Anything outside the catalog
 * keeps its module-level human confirmation, without exception.
 */
import type { ConsoleRoute } from "./util.js";
import { str, num } from "./util.js";
import { tenantOwnsUrl } from "../tenants/store.js";
import { TenantAccessError, type TenantContext } from "../tenants/context.js";
import { ACTION_CATALOG, ACTION_CATALOG_VERSION, CATALOG_EXCLUDED_WRITES, catalogEntry, normaliseTerms } from "../actions/catalog.js";
import { ActionLedger } from "../actions/ledger.js";
import { runCatalogAction, type ActionAdapterDeps } from "../actions/adapters.js";

export interface ActionRouteDeps {
  ledger?: ActionLedger;
  adapters?: ActionAdapterDeps;
  now?: () => number;
}

let defaultLedger: ActionLedger | null = null;
/** The server keeps one SQLite authority across processes; tests inject their own. */
const ledgerOf = (deps: ActionRouteDeps): ActionLedger => {
  if (deps.ledger) return deps.ledger;
  defaultLedger ??= new ActionLedger(process.env.ACTIONS_DB_PATH || "data/actions.sqlite3");
  return defaultLedger;
};

const tenantOf = (ctx: { tenancy?: TenantContext }) => {
  const tenant = ctx.tenancy?.tenant;
  if (!tenant || tenant.status !== "active") throw new TenantAccessError("Un tenant actif est requis pour le catalogue d'actions.");
  return tenant;
};

export function actionRoutes(deps: ActionRouteDeps = {}): ConsoleRoute[] {
  const ledger = () => ledgerOf(deps);
  const now = () => (deps.now ? deps.now() : Date.now());
  const actorOf = (ctx: { user?: { sub?: string } }) => ctx.user?.sub ?? "console-utilisateur";
  return [
    { path: "/actions/catalog", needsUrl: false, handler: async () => ({
      version: ACTION_CATALOG_VERSION,
      actions: ACTION_CATALOG.map((entry) => ({ id: entry.id, version: entry.version, kind: entry.kind, title: entry.title, summary: entry.summary, proposalTtlHours: entry.proposalTtlHours, approvalTtlHours: entry.approvalTtlHours })),
      excluded: CATALOG_EXCLUDED_WRITES.map((w) => ({ id: w.id, fr: w.fr, en: w.en, module: w.module })),
      note: "Une action du catalogue est exécutable en un clic mais reste journalisée : approbation liée aux termes exacts (digest), claim atomique (aucune exécution en double), piste d'audit par exécution. Toute autre écriture externe garde sa confirmation humaine dans le module concerné.",
    }) },
    { path: "/actions/operations", needsUrl: false, handler: async (ctx) => {
      const tenant = tenantOf(ctx);
      const operations = ledger().list(tenant.id, num(ctx.body.limit, 50, 1, 100));
      return { version: ACTION_CATALOG_VERSION, operations };
    } },
    { path: "/actions/propose", needsUrl: false, adminOnly: true, handler: async (ctx) => {
      const tenant = tenantOf(ctx);
      const action = str(ctx.body.action);
      if (!action) throw new Error("Action requise.");
      const entry = catalogEntry(action); // refuses anything outside the catalog
      const terms = normaliseTerms(action, ctx.body.terms);
      if (entry.id === "indexnow.submit") {
        const host = (terms as { host: string }).host;
        if (!tenantOwnsUrl(tenant, `https://${host}`) && !tenant.domains.includes(host))
          throw new TenantAccessError("L'hôte IndexNow n'est pas un domaine enregistré de ce tenant.");
      }
      const operation = ledger().propose({ tenantId: tenant.id, action, terms, origin: "console", actor: actorOf(ctx), now: now() });
      return { operation, auditTrail: ledger().events(tenant.id, operation.id, 50) };
    } },
    { path: "/actions/approve", needsUrl: false, adminOnly: true, handler: async (ctx) => {
      const tenant = tenantOf(ctx);
      const operationId = str(ctx.body.operationId);
      if (!operationId) throw new Error("Identifiant d'opération requis.");
      const ttlHours = num(ctx.body.ttlHours, NaN, 1, 168);
      const operation = ledger().approve({ tenantId: tenant.id, operationId, actor: actorOf(ctx), now: now(), ...(Number.isFinite(ttlHours) ? { ttlHours } : {}) });
      return { operation, auditTrail: ledger().events(tenant.id, operation.id, 50) };
    } },
    /* The one-click gesture: approve the exact terms, then claim and execute.
     * Each step journals its own audit event before the adapter runs. */
    { path: "/actions/execute", needsUrl: false, adminOnly: true, handler: async (ctx) => {
      const tenant = tenantOf(ctx);
      const operationId = str(ctx.body.operationId);
      if (!operationId) throw new Error("Identifiant d'opération requis.");
      const actor = actorOf(ctx);
      const approveFirst = ctx.body.approve === true;
      if (approveFirst) ledger().approve({ tenantId: tenant.id, operationId, actor, now: now() });
      const claim = ledger().claim({ tenantId: tenant.id, operationId, actor, now: now() });
      if (claim.kind === "stale") {
        const operation = ledger().get(tenant.id, operationId);
        return { stale: true, operation, attempt: claim.attempt, auditTrail: ledger().events(tenant.id, operationId, 50), note: "Exécution interrompue détectée : l'opération passe en réconciliation jusqu'à vérification du résultat externe ; aucun nouvel essai automatique." };
      }
      if (claim.kind === "replay") {
        const operation = ledger().get(tenant.id, operationId);
        return { replay: true, operation, attempt: claim.attempt, auditTrail: ledger().events(tenant.id, operationId, 50), note: "Exécution déjà engagée pour ces termes exacts : le journal renvoie le statut existant, aucune nouvelle tentative." };
      }
      const operation = ledger().get(tenant.id, operationId);
      const run = await runCatalogAction(catalogEntry(operation.action).id, operation.terms, deps.adapters ?? {});
      const { operation: final_ , attempt } = ledger().complete({ tenantId: tenant.id, operationId, outcome: run.outcome, detail: run.detail, result: run.result, actor, now: now() });
      return {
        replay: false,
        operation: final_ ,
        attempt,
        auditTrail: ledger().events(tenant.id, operationId, 50),
        ...(final_ .state === "reconciling" ? { note: "Issue ambiguë (délai ou réseau) : l'opération reste en réconciliation jusqu'à vérification du résultat externe ; aucun nouvel essai automatique." } : {}),
      };
    } },
    { path: "/actions/cancel", needsUrl: false, adminOnly: true, handler: async (ctx) => {
      const tenant = tenantOf(ctx);
      const operationId = str(ctx.body.operationId);
      if (!operationId) throw new Error("Identifiant d'opération requis.");
      const operation = ledger().cancel({ tenantId: tenant.id, operationId, actor: actorOf(ctx), now: now() });
      return { operation, auditTrail: ledger().events(tenant.id, operation.id, 50) };
    } },
    { path: "/actions/resolve", needsUrl: false, adminOnly: true, handler: async (ctx) => {
      const tenant = tenantOf(ctx);
      const operationId = str(ctx.body.operationId);
      if (!operationId) throw new Error("Identifiant d'opération requis.");
      const outcome = ctx.body.outcome;
      if (outcome !== "succeeded" && outcome !== "failed") throw new Error("Résolution requise : succeeded ou failed, fondée sur la vérification du résultat externe.");
      const detail = str(ctx.body.detail) ?? "";
      const { operation, attempt } = ledger().resolve({ tenantId: tenant.id, operationId, outcome, detail, actor: actorOf(ctx), now: now() });
      return { operation, attempt, auditTrail: ledger().events(tenant.id, operation.id, 50) };
    } },
  ];
}
