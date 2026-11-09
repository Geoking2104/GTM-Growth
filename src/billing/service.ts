import { createHash } from "node:crypto";
import type { TokenClaims } from "../console/auth.js";
import type { TenantContext } from "../tenants/context.js";
import { billingCatalog, planPrice, PILOT_PLANS, type BillingConfig } from "./config.js";
import type { MollieGateway, MolliePayment } from "./mollie.js";
import { BillingConflict, BillingStore, type BillingAccount, type BillingAttempt, type BillingSubscription } from "./store.js";

export class BillingRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const secureKey = (parts: string[]) => createHash("sha256").update(parts.join(":"), "utf8").digest("hex").slice(0, 36);
const validEmail = (value: unknown): value is string => typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
const isoDate = (value: string) => value.slice(0, 10);
const centsOf = (value: string): number => {
  if (!/^\d+\.\d{2}$/.test(value)) throw new BillingConflict("Invalid Mollie amount");
  return Number(value.replace(".", ""));
};
const enabledStates = new Set(["active", "setup_pending", "past_due", "canceled"]);

export class BillingService {
  private checkoutInFlight = new Map<string, Promise<{ attemptId: string; checkoutUrl: string; reused: boolean }>>();
  constructor(readonly config: BillingConfig, readonly store: BillingStore, private mollie: MollieGateway) {}

  publicPlans() {
    return {
      mode: this.config.mode, checkoutEnabled: this.config.checkoutEnabled,
      pricesApproved: this.config.pricesApproved, termsVersion: this.config.termsVersion || null,
      plans: billingCatalog(this.config), openSourceFree: true,
    };
  }

  private tenantId(context: TenantContext): string {
    if (!context.tenant || context.tenant.status !== "active") throw new BillingRequestError(403, "Sélectionnez un espace client actif.");
    return context.tenant.id;
  }
  private admin(context: TenantContext): string {
    const id = this.tenantId(context);
    if (!context.platformAdmin && context.role !== "tenant-admin") throw new BillingRequestError(403, "Réservé à l'administrateur de l'organisation.");
    return id;
  }
  private assertMode() {
    if (this.config.mode === "disabled") throw new BillingRequestError(503, "La facturation Cloud n'est pas activée.");
  }
  private assertCheckout() {
    this.assertMode();
    if (!this.config.checkoutEnabled) throw new BillingRequestError(503, "Les nouveaux abonnements ne sont pas encore ouverts.");
  }

  /** Status never accepts a tenant ID from the request body. */
  status(context: TenantContext) {
    const tenantId = this.tenantId(context);
    const account = this.store.account(tenantId, this.config.mode);
    const sub = account && this.store.subscription(account.id);
    const attempt = account && this.store.recentAttempts(account.id)[0];
    const until = sub?.paid_until ? Date.parse(sub.paid_until) : NaN;
    const current = enabledStates.has(sub?.status ?? "") && Number.isFinite(until) && until > Date.now();
    const grace = sub?.status === "past_due" && Number.isFinite(until) &&
      until + this.config.graceDays * 86_400_000 > Date.now();
    return {
      ...this.publicPlans(), tenantId, plan: sub?.plan_key ?? null,
      status: sub?.status ?? attempt?.status ?? "free", cloudAccess: current ? "paid" : grace ? "grace" : "read_only",
      paidUntil: sub?.paid_until ?? null, nextPaymentDate: sub?.next_payment_date ?? null,
      cancelRequested: Boolean(sub?.cancel_requested), pendingPlan: sub?.pending_plan_key ?? null,
      latestAttempt: attempt ? { id: attempt.id, status: attempt.status, plan: attempt.plan_key } : null,
      usage: account ? this.store.usage(account.id) : [],
    };
  }

  async checkout(context: TenantContext, user: TokenClaims, body: Record<string, unknown>) {
    this.assertCheckout();
    const tenantId = this.admin(context);
    if (user.email_verified !== true || !validEmail(user.email) || !user.sub) throw new BillingRequestError(403, "Une identité et une adresse email vérifiées sont requises.");
    const key = body.planKey;
    if (key !== "solo" && key !== "agency") throw new BillingRequestError(400, "Formule inconnue.");
    if (body.acceptedRecurring !== true || body.termsVersion !== this.config.termsVersion) {
      throw new BillingRequestError(400, "Acceptez les conditions et le renouvellement mensuel en vigueur.");
    }
    const price = planPrice(this.config, key);
    let prepared: ReturnType<BillingStore["prepareCheckout"]>;
    try { prepared = this.store.prepareCheckout({ tenantId, mode: this.config.mode, plan: key, cents: price.cents, actor: user.sub, termsVersion: this.config.termsVersion }); }
    catch (error) { if (error instanceof BillingConflict) throw new BillingRequestError(409, error.message); throw error; }
    const { attempt } = prepared;
    if (attempt.checkout_url) return { attemptId: attempt.id, checkoutUrl: attempt.checkout_url, reused: true };
    const inFlight = this.checkoutInFlight.get(attempt.id);
    if (inFlight) return inFlight.then((value) => ({ ...value, reused: true }));
    const operation = this.startCheckoutPayment(context, user, attempt, prepared.account.id);
    this.checkoutInFlight.set(attempt.id, operation);
    try { return await operation; }
    finally { this.checkoutInFlight.delete(attempt.id); }
  }

  private async startCheckoutPayment(context: TenantContext, user: TokenClaims, attempt: BillingAttempt, accountId: string) {
    // Mollie's idempotency cache is only one hour. Beyond it, require reconciliation
    // rather than risk creating an extra customer/payment after an unknown timeout.
    if (Date.now() - Date.parse(attempt.created_at) > 50 * 60_000) throw new BillingRequestError(409, "Checkout à rapprocher avant une nouvelle tentative. Contactez le support.");
    let account = this.store.accountById(accountId)!;
    if (!account.mollie_customer_id) {
      const customer = await this.mollie.createCustomer({ name: context.tenant!.name, email: user.email! }, account.customer_key);
      if (!/^cst_[A-Za-z0-9]+$/.test(customer.id)) throw new BillingConflict("Invalid Mollie customer");
      this.store.setCustomer(account.id, customer.id);
      account = this.store.accountById(account.id)!;
    }
    const redirectUrl = new URL(this.config.returnUrl);
    redirectUrl.searchParams.set("billingAttempt", attempt.id);
    const remote = await this.mollie.createPayment({
      amount: { currency: "EUR", value: (attempt.amount_cents / 100).toFixed(2) }, description: `${PILOT_PLANS[attempt.plan_key].name} — premier mois`,
      customerId: account.mollie_customer_id, sequenceType: "first",
      redirectUrl: redirectUrl.toString(), webhookUrl: this.config.webhookUrl,
      metadata: { application: "gtm-growth", accountId: account.id, tenantId: attempt.tenant_id, attemptId: attempt.id, planKey: attempt.plan_key },
    }, attempt.id);
    this.assertRemote(remote, account, attempt.amount_cents);
    const checkoutUrl = remote._links?.checkout?.href;
    if (!checkoutUrl || !this.safeMollieUrl(checkoutUrl)) throw new BillingConflict("Invalid Mollie checkout URL");
    this.store.setCheckoutPayment(attempt.id, remote.id, checkoutUrl);
    return { attemptId: attempt.id, checkoutUrl, reused: false };
  }

  private safeMollieUrl(raw: string) {
    try { const u = new URL(raw); return u.protocol === "https:" && (u.hostname === "mollie.com" || u.hostname.endsWith(".mollie.com")); }
    catch { return false; }
  }
  private assertRemote(payment: MolliePayment, account: BillingAccount, cents: number) {
    if (payment.profileId !== this.config.profileId || payment.mode !== this.config.mode || payment.customerId !== account.mollie_customer_id ||
        payment.amount?.currency !== "EUR" || centsOf(payment.amount.value) !== cents) throw new BillingConflict("Mollie payment/profile mismatch");
  }

  /** The classic webhook only supplies a payment ID. Always GET the full payment. */
  async processPayment(paymentId: string): Promise<{ applied: boolean; kind: string }> {
    this.assertMode();
    if (!/^[A-Za-z0-9_-]{4,100}$/.test(paymentId)) throw new BillingRequestError(400, "Identifiant de paiement invalide.");
    const payment = await this.mollie.getPayment(paymentId);
    if (payment.id !== paymentId || payment.mode !== this.config.mode || payment.profileId !== this.config.profileId || payment.amount?.currency !== "EUR") {
      throw new BillingConflict("Foreign Mollie payment");
    }
    let account: BillingAccount | undefined;
    let attempt: BillingAttempt | undefined;
    let sub: BillingSubscription | undefined;
    let kind: "first" | "renewal";
    if (payment.subscriptionId) {
      kind = "renewal";
      sub = this.store.subscriptionByRemote(payment.subscriptionId);
      account = sub && this.store.accountById(sub.account_id);
      if (!sub || !account || sub.mode !== this.config.mode || sub.mollie_subscription_id !== payment.subscriptionId) throw new BillingConflict("Unknown GTM subscription");
      const cents = centsOf(payment.amount.value);
      if (cents !== sub.amount_cents && cents !== sub.pending_amount_cents) throw new BillingConflict("Renewal amount mismatch");
      const meta = payment.metadata ?? {};
      if (meta.application && (meta.application !== "gtm-growth" || meta.accountId !== account.id)) throw new BillingConflict("Renewal metadata mismatch");
    } else {
      kind = "first";
      const meta = payment.metadata ?? {};
      if (meta.application !== "gtm-growth" || typeof meta.attemptId !== "string" || typeof meta.accountId !== "string") throw new BillingConflict("Unrecognized first payment");
      attempt = this.store.attempt(meta.attemptId);
      account = attempt && this.store.accountById(attempt.account_id);
      if (!attempt || !account || account.id !== meta.accountId || meta.tenantId !== account.tenant_id ||
          meta.planKey !== attempt.plan_key || attempt.mode !== this.config.mode) throw new BillingConflict("First payment correlation mismatch");
      if (centsOf(payment.amount.value) !== attempt.amount_cents) throw new BillingConflict("First payment amount mismatch");
    }
    if (!account || !payment.customerId || account.mollie_customer_id !== payment.customerId) throw new BillingConflict("Customer mismatch");
    const result = this.store.recordVerifiedPayment({ accountId: account.id, attemptId: attempt?.id,
      paymentId: payment.id, subscriptionId: payment.subscriptionId, status: payment.status,
      cents: centsOf(payment.amount.value), currency: "EUR", paidAt: payment.paidAt, kind });
    if (result.setupPending) {
      try { await this.ensureSubscription(account.id); }
      catch (error) { this.store.subscriptionError(account.id, `Setup pending: ${(error as Error).name}`); }
    }
    return { applied: result.applied, kind };
  }

  /** First month was charged already. Recurring debits start at the next due date. */
  async ensureSubscription(accountId: string): Promise<void> {
    const sub = this.store.subscription(accountId);
    const account = this.store.accountById(accountId);
    if (!sub || !account || !account.mollie_customer_id || !sub.paid_until || sub.mollie_subscription_id) return;
    if (sub.cancel_requested) { this.store.setCanceled(accountId); return; }
    const prior = await this.mollie.listSubscriptions(account.mollie_customer_id);
    const matched = prior.filter((s) => s.metadata?.application === "gtm-growth" && s.metadata?.accountId === accountId &&
      s.metadata?.createKey === sub.create_key);
    if (matched.length > 1) throw new BillingConflict("Duplicate remote subscriptions; manual intervention required");
    let remote = matched[0];
    if (!remote) {
      if (Date.now() - Date.parse(sub.created_at) > 50 * 60_000) {
        throw new BillingConflict("Unknown setup older than Mollie idempotency window; manual review required");
      }
      const mandates = await this.mollie.listMandates(account.mollie_customer_id);
      if (!mandates.some((m) => m.status === "valid" || m.status === "pending")) throw new BillingConflict("Recurring mandate unavailable");
      remote = await this.mollie.createSubscription(account.mollie_customer_id, {
        amount: { currency: "EUR", value: (sub.amount_cents / 100).toFixed(2) },
        interval: "1 month", startDate: isoDate(sub.paid_until),
        description: `${PILOT_PLANS[sub.plan_key].name} — abonnement mensuel`,
        webhookUrl: this.config.webhookUrl,
        metadata: { application: "gtm-growth", accountId, tenantId: sub.tenant_id, planKey: sub.plan_key, createKey: sub.create_key },
      }, sub.create_key);
    }
    if (remote.customerId !== account.mollie_customer_id || remote.mode !== this.config.mode ||
      remote.amount.currency !== "EUR" || centsOf(remote.amount.value) !== sub.amount_cents) throw new BillingConflict("Remote subscription mismatch");
    this.store.setRemoteSubscription(accountId, remote.id, remote.nextPaymentDate ?? null);
  }

  async cancel(context: TenantContext, user: TokenClaims, body: Record<string, unknown>) {
    this.assertMode();
    const account = this.store.account(this.admin(context), this.config.mode);
    const sub = account && this.store.subscription(account.id);
    if (!account || !sub) throw new BillingRequestError(404, "Aucun abonnement à résilier.");
    if (body.confirm !== "CANCEL_SUBSCRIPTION") throw new BillingRequestError(400, "Confirmation de résiliation requise.");
    if (!sub.cancel_requested) this.store.requestCancel(account.id, user.sub ?? "unknown");
    if (sub.mollie_subscription_id && account.mollie_customer_id) {
      const remote = await this.mollie.cancelSubscription(account.mollie_customer_id, sub.mollie_subscription_id);
      if (remote.status !== "canceled") throw new BillingConflict("Cancellation not confirmed by Mollie");
    }
    this.store.setCanceled(account.id, user.sub);
    return this.status(context);
  }

  async changePlan(context: TenantContext, user: TokenClaims, body: Record<string, unknown>) {
    this.assertMode();
    const account = this.store.account(this.admin(context), this.config.mode);
    const sub = account && this.store.subscription(account.id);
    if (!account || !sub || !sub.mollie_subscription_id || !account.mollie_customer_id || sub.cancel_requested || sub.status !== "active") {
      throw new BillingRequestError(409, "Aucun abonnement actif modifiable.");
    }
    const plan = body.planKey;
    if (plan !== "solo" && plan !== "agency") throw new BillingRequestError(400, "Formule inconnue.");
    if (plan === sub.plan_key && !sub.pending_plan_key) return this.status(context);
    if (sub.pending_plan_key && sub.pending_plan_key !== plan) throw new BillingRequestError(409, "Un changement de formule est déjà planifié.");
    const cents = planPrice(this.config, plan).cents;
    this.store.schedulePlan(account.id, plan, cents, user.sub ?? "unknown");
    await this.updatePendingPlan(account.id);
    return this.status(context);
  }

  private async updatePendingPlan(accountId: string) {
    const sub = this.store.subscription(accountId);
    const account = this.store.accountById(accountId);
    if (!sub?.pending_plan_key || !sub.mollie_subscription_id || !account?.mollie_customer_id) return;
    const remote = await this.mollie.updateSubscription(account.mollie_customer_id, sub.mollie_subscription_id, {
      amount: { currency: "EUR", value: (sub.pending_amount_cents! / 100).toFixed(2) },
      description: `${PILOT_PLANS[sub.pending_plan_key].name} — abonnement mensuel`,
      metadata: { application: "gtm-growth", accountId, tenantId: sub.tenant_id, planKey: sub.pending_plan_key, createKey: sub.create_key },
    }, secureKey([sub.create_key, sub.pending_plan_key, String(sub.pending_amount_cents)]));
    if (centsOf(remote.amount.value) !== sub.pending_amount_cents || remote.customerId !== account.mollie_customer_id) {
      throw new BillingConflict("Plan update not confirmed by Mollie");
    }
    this.store.event(accountId, "plan_change_scheduled", sub.pending_plan_key);
  }

  /** Safe to call repeatedly; unknown renewal IDs are found via subscriptionId. */
  async reconcile(): Promise<{ accounts: number; payments: number; errors: number }> {
    this.assertMode();
    const accounts = this.store.allAccounts(this.config.mode);
    const result = { accounts: 0, payments: 0, errors: 0 };
    for (const account of accounts) {
      result.accounts++;
      try {
        for (const attempt of this.store.recentAttempts(account.id)) {
          if (attempt.mollie_payment_id && ["open", "pending", "authorized", "initializing"].includes(attempt.status)) {
            await this.processPayment(attempt.mollie_payment_id); result.payments++;
          }
        }
        let sub = this.store.subscription(account.id);
        if (sub && !sub.mollie_subscription_id && sub.status === "setup_pending") await this.ensureSubscription(account.id);
        sub = this.store.subscription(account.id);
        if (sub?.mollie_subscription_id && account.mollie_customer_id) {
          const remote = await this.mollie.getSubscription(account.mollie_customer_id, sub.mollie_subscription_id);
          if (remote.customerId !== account.mollie_customer_id || remote.mode !== this.config.mode) throw new BillingConflict("Remote subscription mismatch");
          if (sub.cancel_requested && remote.status !== "canceled") {
            await this.mollie.cancelSubscription(account.mollie_customer_id, sub.mollie_subscription_id);
            this.store.setCanceled(account.id);
          } else if (remote.status === "canceled" && sub.status !== "canceled") this.store.setCanceled(account.id);
          if (!sub.cancel_requested && sub.pending_plan_key && remote.status !== "canceled") await this.updatePendingPlan(account.id);
          for (const payment of await this.mollie.listSubscriptionPayments(account.mollie_customer_id, sub.mollie_subscription_id)) {
            await this.processPayment(payment.id); result.payments++;
          }
        }
      } catch (error) {
        result.errors++;
        this.store.event(account.id, "reconcile_failed", null, null, (error as Error).name);
      }
    }
    return result;
  }
}
