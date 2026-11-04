/**
 * Console « GTM » : lecture et écriture Google Tag Manager (API Tag Manager v2, gratuite)
 * via le compte de service. Conteneurs web ET serveur (sGTM : clients en plus).
 * Écritures réservées aux administrateurs du tenant ; la publication exige de retaper
 * l'identifiant public du conteneur (GTM-XXXX) en confirmation.
 */
import { google } from "googleapis";
import { getAuthClient } from "../auth/service-account.js";
import type { Tenant } from "../tenants/store.js";
import { accessProblem } from "./analytics.js";
import { str, type Body, type ConsoleRoute } from "./util.js";

const CONTAINER_RE = /^accounts\/\d+\/containers\/\d+$/;
const WS_RE = /^accounts\/\d+\/containers\/\d+\/workspaces\/\d+$/;
const KINDS = ["tags", "triggers", "variables"] as const;
type Kind = (typeof KINDS)[number];

async function tm() { return google.tagmanager({ version: "v2", auth: (await getAuthClient()) as any }); }

export function containerOf(body: Body, tenant?: Tenant): string | undefined {
  const c = str(body.container) ?? tenant?.gtmContainers?.[0];
  return c && CONTAINER_RE.test(c) ? c : undefined;
}
const notConfigured = { problem: { state: "not-configured", message: "Aucun conteneur GTM configuré pour ce client (accounts/<id>/containers/<id>)." } };

/** Conteneurs visibles par le compte de service (tous comptes). */
export async function gtmContainers(tenant?: Tenant, platformAdmin = false) {
  try {
    const api = await tm();
    const accounts = (await api.accounts.list({})).data.account ?? [];
    const all = (await Promise.all(accounts.map(async (a) => ((await api.accounts.containers.list({ parent: a.path! })).data.container ?? []).map((c) => ({ account: a.name, path: c.path, publicId: c.publicId, name: c.name, usageContext: c.usageContext, domains: c.domainName ?? [] }))))).flat();
    const allowed = platformAdmin || !tenant ? all : all.filter((c) => tenant.gtmContainers?.includes(String(c.path)));
    return { containers: allowed, configured: tenant?.gtmContainers ?? [] };
  } catch (error) { return { problem: gtmProblem(error) }; }
}

function gtmProblem(error: unknown) {
  const msg = (error as Error).message ?? String(error);
  if (/has not been used|is disabled/i.test(msg)) return { state: "error" as const, message: "L'API Tag Manager n'est pas activée dans le projet Google Cloud du compte de service.", steps: ["Google Cloud → API et services → Bibliothèque → « Tag Manager API » → Activer."] };
  const p = accessProblem(error, "ga4", "ce conteneur");
  if (p.state === "no-access") p.steps = ["Tag Manager → Admin → Gestion des utilisateurs (compte ou conteneur) → +", `E-mail : ${p.grantEmail} — « Lecture » pour consulter, « Publication » pour écrire et publier.`];
  return p;
}

/** Inventaire d'un espace de travail : balises, déclencheurs, variables (+ clients en sGTM) et versions. */
export async function gtmInventory(body: Body, tenant?: Tenant) {
  const container = containerOf(body, tenant);
  if (!container) return notConfigured;
  try {
    const api = await tm(); const c = api.accounts.containers;
    const info = (await c.get({ path: container })).data;
    const workspaces = (await c.workspaces.list({ parent: container })).data.workspace ?? [];
    const ws = str(body.workspace) && WS_RE.test(String(body.workspace)) ? String(body.workspace) : workspaces[0]?.path;
    const [tags, triggers, variables, versions, live, clients, status] = await Promise.all([
      c.workspaces.tags.list({ parent: ws! }).then((r) => r.data.tag ?? []),
      c.workspaces.triggers.list({ parent: ws! }).then((r) => r.data.trigger ?? []),
      c.workspaces.variables.list({ parent: ws! }).then((r) => r.data.variable ?? []),
      c.version_headers.list({ parent: container }).then((r) => r.data.containerVersionHeader ?? []).catch(() => []),
      c.versions.live({ parent: container }).then((r) => ({ id: r.data.containerVersionId, name: r.data.name })).catch(() => null),
      (info.usageContext ?? []).includes("server") ? c.workspaces.clients.list({ parent: ws! }).then((r) => r.data.client ?? []).catch(() => []) : Promise.resolve([]),
      c.workspaces.getStatus({ path: ws! }).then((r) => r.data.workspaceChange ?? []).catch(() => []),
    ]);
    return {
      container: { path: container, publicId: info.publicId, name: info.name, usageContext: info.usageContext },
      workspace: ws, workspaces: workspaces.map((w) => ({ path: w.path, name: w.name, description: w.description })),
      tags: tags.map((t) => ({ path: t.path, tagId: t.tagId, name: t.name, type: t.type, firing: t.firingTriggerId ?? [], paused: Boolean(t.paused), parameter: t.parameter ?? [] })),
      triggers: triggers.map((t) => ({ path: t.path, triggerId: t.triggerId, name: t.name, type: t.type })),
      variables: variables.map((v) => ({ path: v.path, variableId: v.variableId, name: v.name, type: v.type })),
      clients: (clients as any[]).map((x) => ({ path: x.path, name: x.name, type: x.type, priority: x.priority })),
      versions: (versions as any[]).map((v) => ({ id: v.containerVersionId, name: v.name, deleted: Boolean(v.deleted), tags: v.numTags, triggers: v.numTriggers, variables: v.numVariables })).reverse(),
      live, pendingChanges: (status as any[]).length,
    };
  } catch (error) { return { problem: gtmProblem(error) }; }
}

function parseResource(raw: unknown): Record<string, unknown> {
  const v = typeof raw === "string" ? JSON.parse(raw || "{}") : raw ?? {};
  if (typeof v !== "object" || Array.isArray(v)) throw new Error("Ressource JSON invalide.");
  return v as Record<string, unknown>;
}
const inContainer = (path: string, container: string) => path === container || path.startsWith(`${container}/`);

/**
 * Écriture : op = create-workspace | delete-workspace | create | update | delete | create-version.
 * Toujours limitée au conteneur du tenant. `dryRun: true` valide sans appeler Google.
 */
export async function gtmWrite(body: Body, tenant?: Tenant, api?: Awaited<ReturnType<typeof tm>>) {
  const container = containerOf(body, tenant);
  if (!container) return notConfigured;
  const op = str(body.op); const kind = str(body.kind) as Kind | undefined; const target = str(body.path) ?? str(body.workspace);
  if (target && !inContainer(target, container)) return { problem: { state: "error", message: "Chemin hors du conteneur du client." } };
  if (["create", "update", "delete"].includes(op ?? "") && !KINDS.includes(kind as Kind)) return { problem: { state: "error", message: "kind doit être tags, triggers ou variables." } };
  let resource: Record<string, unknown> = {};
  try { resource = parseResource(body.resource); } catch (e) { return { problem: { state: "error", message: (e as Error).message } }; }
  const plan = { op, kind, container, target, resource };
  if (body.dryRun === true || body.dryRun === "true") return { dryRun: true, plan };
  try {
    const c = (api ?? (await tm())).accounts.containers;
    const ws = c.workspaces as any;
    switch (op) {
      case "create-workspace": return { done: (await c.workspaces.create({ parent: container, requestBody: { name: str(body.name) ?? "GTM Growth", description: str(body.description) ?? "Créé depuis la console GTM Growth" } })).data };
      case "delete-workspace": if (!target || !WS_RE.test(target)) throw new Error("workspace requis"); await c.workspaces.delete({ path: target }); return { done: { deleted: target } };
      case "create": if (!target || !WS_RE.test(target)) throw new Error("workspace requis"); return { done: (await ws[kind!].create({ parent: target, requestBody: resource })).data };
      case "update": if (!target || WS_RE.test(target)) throw new Error("chemin de la ressource requis"); return { done: (await ws[kind!].update({ path: target, requestBody: resource })).data };
      case "delete": if (!target || WS_RE.test(target)) throw new Error("chemin de la ressource requis"); await ws[kind!].delete({ path: target }); return { done: { deleted: target } };
      case "create-version": if (!target || !WS_RE.test(target)) throw new Error("workspace requis"); { const r = (await c.workspaces.create_version({ path: target, requestBody: { name: str(body.name), notes: str(body.notes) } })).data; return { done: { version: r.containerVersion?.containerVersionId, path: r.containerVersion?.path, compilerError: r.compilerError ?? false, syncStatus: r.syncStatus } }; }
      default: return { problem: { state: "error", message: `Opération inconnue : ${op}` } };
    }
  } catch (error) { return { problem: gtmProblem(error) }; }
}

/** Publication d'une version : exige confirm === publicId du conteneur (GTM-XXXX). */
export async function gtmPublish(body: Body, tenant?: Tenant, api?: Awaited<ReturnType<typeof tm>>) {
  const container = containerOf(body, tenant);
  if (!container) return notConfigured;
  const version = str(body.version);
  if (!version || !/^\d+$/.test(version)) return { problem: { state: "error", message: "Numéro de version requis." } };
  try {
    const c = (api ?? (await tm())).accounts.containers;
    const info = (await c.get({ path: container })).data;
    if (str(body.confirm) !== info.publicId) return { needsConfirmation: true, publicId: info.publicId, message: `Pour publier, retapez l'identifiant du conteneur : ${info.publicId}` };
    const r = (await c.versions.publish({ path: `${container}/versions/${version}` })).data;
    return { published: true, version: r.containerVersion?.containerVersionId, compilerError: r.compilerError ?? false };
  } catch (error) { return { problem: gtmProblem(error) }; }
}

export const gtmRoutes: ConsoleRoute[] = [
  { path: "/gtm/containers", needsUrl: false, handler: async ({ tenancy }) => gtmContainers(tenancy?.tenant ?? undefined, tenancy?.platformAdmin ?? false) },
  { path: "/gtm/inventory", needsUrl: false, handler: async ({ body, tenancy }) => gtmInventory(body, tenancy?.tenant ?? undefined) },
  { path: "/gtm/write", needsUrl: false, adminOnly: true, handler: async ({ body, tenancy }) => gtmWrite(body, tenancy?.tenant ?? undefined) },
  { path: "/gtm/publish", needsUrl: false, adminOnly: true, handler: async ({ body, tenancy }) => gtmPublish(body, tenancy?.tenant ?? undefined) },
];
