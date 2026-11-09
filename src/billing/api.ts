import { timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import express from "express";
import { requireOidc, oidcConfigFromEnv, type JwksLoader, type OidcConfig, type TokenClaims } from "../console/auth.js";
import { tenancyMiddleware, withTrust } from "../console/api.js";
import { TenantStore } from "../tenants/store.js";
import type { TenantContext } from "../tenants/context.js";
import { billingCatalog, billingConfigFromEnv, type BillingConfig } from "./config.js";
import { MollieHttpGateway, type MollieGateway } from "./mollie.js";
import { BillingConflict, BillingStore } from "./store.js";
import { BillingRequestError, BillingService } from "./service.js";

interface BillingOptions {
  config?: BillingConfig;
  store?: BillingStore;
  gateway?: MollieGateway;
  tenantStore?: TenantStore;
  oidc?: OidcConfig | null;
  jwksLoader?: JwksLoader;
  /** Inject false in unit tests; the production timer never creates payments. */
  scheduler?: boolean;
}

type Locals = { user?: TokenClaims; tenancy?: TenantContext };
const errorStatus = (error: unknown) => error instanceof BillingRequestError ? error.status : error instanceof BillingConflict ? 409 : 502;
const errorMessage = (error: unknown) => error instanceof BillingRequestError || error instanceof BillingConflict
  ? error.message : "Le service de paiement est momentanément indisponible.";

const sameOrigin = (req: Request, origin: string): boolean => {
  if (!req.headers.origin) return true; // Non-browser API clients still need an OIDC bearer token.
  try { return new URL(req.headers.origin).origin === origin; } catch { return false; }
};

/** Public webhook is deliberately mounted BEFORE the protected tenant router. */
export function mountBillingApi(app: Express, options: BillingOptions = {}) {
  const config = options.config ?? billingConfigFromEnv();
  app.get("/api/billing/plans", (_req, res) => res.json({
    mode: config.mode, checkoutEnabled: config.checkoutEnabled, pricesApproved: config.pricesApproved,
    termsVersion: config.termsVersion || null, plans: billingCatalog(config), openSourceFree: true,
  }));
  if (config.mode === "disabled") {
    app.use("/api/billing", (_req, res) => res.status(503).json({ error: "La facturation Cloud n'est pas activée." }));
    return null;
  }
  const store = options.store ?? new BillingStore(config.dataPath);
  const mollie = options.gateway ?? new MollieHttpGateway(config.apiKey);
  const service = new BillingService(config, store, mollie);

  const webhookRate = new Map<string, { count: number; from: number }>();
  app.post("/api/billing/mollie/webhook", express.urlencoded({ extended: false, limit: "4kb", parameterLimit: 4 }), async (req, res) => {
    // Mollie classic webhooks are URL-encoded id=tr_...; do not trust status data.
    const ip = req.ip ?? "?"; const time = Date.now();
    const rate = webhookRate.get(ip);
    const state = !rate || time - rate.from > 60_000 ? { count: 1, from: time } : { ...rate, count: rate.count + 1 };
    webhookRate.set(ip, state);
    if (state.count > 180) return res.status(429).send("Rate limit");
    if (typeof req.body?.id !== "string" || Object.keys(req.body).length !== 1) return res.status(400).send("Invalid webhook");
    try { await service.processPayment(req.body.id); return res.status(200).send("OK"); }
    catch (error) {
      // Fail/retry without logging API keys, customer metadata or card details.
      if (error instanceof BillingRequestError && error.status === 400) return res.status(400).send("Invalid payment ID");
      return res.status(503).send("Retry later");
    }
  });

  let reconciling = false;
  const runReconciliation = async () => {
    if (reconciling) return { accounts: 0, payments: 0, errors: 0, alreadyRunning: true };
    reconciling = true;
    try { return await service.reconcile(); } finally { reconciling = false; }
  };
  app.post("/api/billing/reconcile", async (req, res) => {
    const header = req.headers.authorization ?? "";
    const incoming = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!config.reconcileToken) return res.status(503).json({ error: "Réconciliation manuelle non configurée." });
    const a = Buffer.from(incoming); const b = Buffer.from(config.reconcileToken);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return res.status(403).json({ error: "Interdit." });
    try { return res.json(await runReconciliation()); }
    catch { return res.status(503).json({ error: "Réconciliation indisponible." }); }
  });

  const tenants = options.tenantStore ?? new TenantStore();
  const oidc = withTrust(options.oidc === undefined ? oidcConfigFromEnv() : options.oidc, tenants);
  const router = express.Router();
  router.use(requireOidc(oidc, options.jwksLoader));
  router.use(tenancyMiddleware(oidc, tenants));
  router.get("/status", (_req, res) => {
    try { return res.set("Cache-Control", "no-store").json(service.status((res.locals as Locals).tenancy!)); }
    catch (error) { return res.status(errorStatus(error)).json({ error: errorMessage(error) }); }
  });
  const mutation = (handler: (req: Request, tenancy: TenantContext, user: TokenClaims) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      if (!sameOrigin(req, config.publicOrigin)) return res.status(403).json({ error: "Origine non autorisée." });
      const { tenancy, user } = res.locals as Locals;
      if (!tenancy || !user) return res.status(401).json({ error: "Authentification requise." });
      try { return res.set("Cache-Control", "no-store").json(await handler(req, tenancy, user)); }
      catch (error) { return res.status(errorStatus(error)).json({ error: errorMessage(error) }); }
    };
  router.post("/checkout", mutation((req, tenancy, user) => service.checkout(tenancy, user, req.body ?? {})));
  router.post("/cancel", mutation((req, tenancy, user) => service.cancel(tenancy, user, req.body ?? {})));
  router.post("/change-plan", mutation((req, tenancy, user) => service.changePlan(tenancy, user, req.body ?? {})));
  app.use("/api/billing", router);

  if (options.scheduler !== false && config.reconcileEnabled) {
    // Re-check statuses and missing subscription webhooks daily. Does not start
    // new first charges and never retries a dubious checkout past Mollie's 1h window.
    const timer = setInterval(() => { void runReconciliation().catch(() => {}); }, 24 * 60 * 60_000);
    timer.unref();
  }
  return service;
}
