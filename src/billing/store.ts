import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { BillingMode, PlanKey } from "./config.js";
import { BILLING_MIGRATIONS } from "./migrations.js";

export interface BillingAccount {
  id: string; tenant_id: string; mode: BillingMode; mollie_customer_id: string | null;
  customer_key: string; created_at: string; updated_at: string;
}
export interface BillingAttempt {
  id: string; account_id: string; tenant_id: string; mode: BillingMode; plan_key: PlanKey;
  amount_cents: number; currency: string; actor_sub: string; terms_version: string;
  accepted_at: string; status: string; mollie_payment_id: string | null;
  checkout_url: string | null; created_at: string; updated_at: string;
}
export interface BillingSubscription {
  account_id: string; tenant_id: string; mode: BillingMode; plan_key: PlanKey;
  amount_cents: number; currency: string; mollie_subscription_id: string | null;
  create_key: string; status: string; paid_until: string | null;
  next_payment_date: string | null; pending_plan_key: PlanKey | null;
  pending_amount_cents: number | null; cancel_requested: number;
  last_error: string | null; created_at: string; updated_at: string;
}
export interface BillingPayment {
  mollie_payment_id: string; account_id: string; attempt_id: string | null;
  mollie_subscription_id: string | null; kind: "first" | "renewal";
  amount_cents: number; currency: string; status: string;
  paid_at: string | null; applied_at: string | null; updated_at: string;
}

export class BillingConflict extends Error {
  constructor(message: string) { super(message); }
}

const now = () => new Date().toISOString();

/** Monthly periods start at the paid date; clamp short months, never add 30 days. */
export function plusCalendarMonth(value: string): string {
  const start = new Date(value);
  if (!Number.isFinite(start.getTime())) throw new Error("Invalid paid timestamp");
  const first = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1,
    start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), start.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  return first.toISOString();
}

/** Isolated operational ledger: never use Keycloak's own PostgreSQL schema. */
export class BillingStore {
  readonly db: Database.Database;
  constructor(file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    try { const fd = fs.openSync(file, "wx", 0o600); fs.closeSync(fd); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    this.db = new Database(file, { timeout: 10_000 });
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 10000");
    this.db.pragma("journal_mode = DELETE");
    this.db.pragma("synchronous = FULL");
    this.db.exec("CREATE TABLE IF NOT EXISTS billing_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of BILLING_MIGRATIONS) {
      this.db.transaction(() => {
        const existing = this.db.prepare("SELECT 1 FROM billing_migrations WHERE version=?").get(migration.version);
        if (existing) return;
        this.db.exec(migration.sql);
        this.db.prepare("INSERT INTO billing_migrations VALUES (?,?)").run(migration.version, now());
      }).immediate();
    }
  }
  close() { this.db.close(); }

  account(tenantId: string, mode: BillingMode): BillingAccount | undefined {
    return this.db.prepare("SELECT * FROM billing_accounts WHERE tenant_id=? AND mode=?").get(tenantId, mode) as BillingAccount | undefined;
  }
  accountById(id: string): BillingAccount | undefined {
    return this.db.prepare("SELECT * FROM billing_accounts WHERE id=?").get(id) as BillingAccount | undefined;
  }
  subscription(accountId: string): BillingSubscription | undefined {
    return this.db.prepare("SELECT * FROM billing_subscriptions WHERE account_id=?").get(accountId) as BillingSubscription | undefined;
  }
  subscriptionByRemote(id: string): BillingSubscription | undefined {
    return this.db.prepare("SELECT * FROM billing_subscriptions WHERE mollie_subscription_id=?").get(id) as BillingSubscription | undefined;
  }
  attempt(id: string): BillingAttempt | undefined {
    return this.db.prepare("SELECT * FROM billing_attempts WHERE id=?").get(id) as BillingAttempt | undefined;
  }
  attemptByPayment(id: string): BillingAttempt | undefined {
    return this.db.prepare("SELECT * FROM billing_attempts WHERE mollie_payment_id=?").get(id) as BillingAttempt | undefined;
  }
  payment(id: string): BillingPayment | undefined {
    return this.db.prepare("SELECT * FROM billing_payments WHERE mollie_payment_id=?").get(id) as BillingPayment | undefined;
  }
  activeAttempt(accountId: string): BillingAttempt | undefined {
    return this.db.prepare("SELECT * FROM billing_attempts WHERE account_id=? AND status IN ('initializing','open','pending','authorized') ORDER BY created_at DESC LIMIT 1").get(accountId) as BillingAttempt | undefined;
  }
  event(accountId: string | null, kind: string, reference: string | null, actor: string | null = null, detail: string | null = null) {
    this.db.prepare("INSERT INTO billing_events (account_id,kind,reference,actor_sub,detail,created_at) VALUES (?,?,?,?,?,?)")
      .run(accountId, kind, reference, actor, detail?.slice(0, 250) ?? null, now());
  }

  /** BEGIN IMMEDIATE serialises concurrent checkouts on the same shared VPS. */
  prepareCheckout(input: { tenantId: string; mode: BillingMode; plan: PlanKey; cents: number; actor: string; termsVersion: string }):
    { account: BillingAccount; attempt: BillingAttempt; reused: boolean } {
    return this.db.transaction(() => {
      const stamp = now();
      let account = this.account(input.tenantId, input.mode);
      if (!account) {
        const id = randomUUID();
        this.db.prepare("INSERT INTO billing_accounts (id,tenant_id,mode,mollie_customer_id,customer_key,created_at,updated_at) VALUES (?,?,?,NULL,?,?,?)")
          .run(id, input.tenantId, input.mode, randomUUID(), stamp, stamp);
        account = this.account(input.tenantId, input.mode)!;
      }
      const sub = this.subscription(account.id);
      if (sub && (sub.mollie_subscription_id || sub.paid_until || sub.status === "review_required")) {
        throw new BillingConflict("Un abonnement ou un paiement initial existe déjà pour ce client. Consultez son statut.");
      }
      const pending = this.activeAttempt(account.id);
      if (pending) {
        if (pending.plan_key !== input.plan) throw new BillingConflict("Un autre checkout est en cours. Terminez-le avant de changer de formule.");
        return { account, attempt: pending, reused: true };
      }
      const id = randomUUID();
      this.db.prepare(`INSERT INTO billing_attempts
        (id,account_id,tenant_id,mode,plan_key,amount_cents,currency,actor_sub,terms_version,accepted_at,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,'EUR',?,?,?,'initializing',?,?)`)
        .run(id, account.id, input.tenantId, input.mode, input.plan, input.cents, input.actor, input.termsVersion, stamp, stamp, stamp);
      this.event(account.id, "checkout_started", id, input.actor, input.plan);
      return { account, attempt: this.attempt(id)!, reused: false };
    }).immediate();
  }

  setCustomer(accountId: string, customerId: string) {
    this.db.transaction(() => {
      const account = this.accountById(accountId);
      if (!account || (account.mollie_customer_id && account.mollie_customer_id !== customerId)) throw new BillingConflict("Customer mismatch");
      this.db.prepare("UPDATE billing_accounts SET mollie_customer_id=?, updated_at=? WHERE id=?").run(customerId, now(), accountId);
    }).immediate();
  }
  setCheckoutPayment(attemptId: string, paymentId: string, url: string) {
    this.db.transaction(() => {
      const attempt = this.attempt(attemptId);
      if (!attempt || (attempt.mollie_payment_id && attempt.mollie_payment_id !== paymentId)) throw new BillingConflict("Checkout mismatch");
      this.db.prepare("UPDATE billing_attempts SET mollie_payment_id=?, checkout_url=?, status=CASE WHEN status='initializing' THEN 'open' ELSE status END,updated_at=? WHERE id=?")
        .run(paymentId, url, now(), attemptId);
      this.event(attempt.account_id, "checkout_created", paymentId);
    }).immediate();
  }

  /** Call only after comparing the remote payment to local customer, amount, profile and plan. */
  recordVerifiedPayment(input: {
    accountId: string; attemptId?: string; paymentId: string; subscriptionId?: string;
    status: string; cents: number; currency: string; paidAt?: string;
    kind: "first" | "renewal";
  }): { applied: boolean; setupPending: boolean } {
    return this.db.transaction(() => {
      const account = this.accountById(input.accountId);
      if (!account) throw new BillingConflict("Unknown billing account");
      const attempt = input.attemptId ? this.attempt(input.attemptId) : undefined;
      if (input.attemptId && (!attempt || attempt.account_id !== account.id || (attempt.mollie_payment_id && attempt.mollie_payment_id !== input.paymentId))) throw new BillingConflict("Attempt mismatch");
      if (attempt) {
        this.db.prepare("UPDATE billing_attempts SET mollie_payment_id=COALESCE(mollie_payment_id,?),status=?,updated_at=? WHERE id=?")
          .run(input.paymentId, input.status, now(), attempt.id);
      }
      const existing = this.payment(input.paymentId);
      if (existing && (existing.account_id !== account.id || existing.kind !== input.kind || existing.amount_cents !== input.cents)) throw new BillingConflict("Recorded payment mismatch");
      this.db.prepare(`INSERT INTO billing_payments
        (mollie_payment_id,account_id,attempt_id,mollie_subscription_id,kind,amount_cents,currency,status,paid_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(mollie_payment_id) DO UPDATE SET status=excluded.status,
          paid_at=COALESCE(excluded.paid_at,billing_payments.paid_at),updated_at=excluded.updated_at`)
        .run(input.paymentId, account.id, input.attemptId ?? null, input.subscriptionId ?? null,
          input.kind, input.cents, input.currency, input.status, input.paidAt ?? null, now());
      let sub = this.subscription(account.id);
      let applied = false;
      if (input.status === "paid" && !existing?.applied_at) {
        if (!input.paidAt) throw new BillingConflict("Missing paidAt from Mollie");
        const anchor = sub?.paid_until && sub.paid_until > input.paidAt ? sub.paid_until : input.paidAt;
        const end = plusCalendarMonth(anchor);
        if (!sub) {
          if (!attempt) throw new BillingConflict("First payment without matching checkout");
          this.db.prepare(`INSERT INTO billing_subscriptions
            (account_id,tenant_id,mode,plan_key,amount_cents,currency,mollie_subscription_id,create_key,status,paid_until,created_at,updated_at)
            VALUES (?,?,?,?,?,'EUR',NULL,?,'setup_pending',?,?,?)`)
            .run(account.id, account.tenant_id, account.mode, attempt.plan_key, attempt.amount_cents, randomUUID(), end, now(), now());
        } else {
          if (sub.status === "review_required" || (sub.cancel_requested && input.kind === "renewal")) {
            // Paid funds still need reconciliation, but cannot silently grant rights.
            this.event(account.id, "paid_requires_review", input.paymentId);
          } else {
            const changing = sub.pending_plan_key && input.cents === sub.pending_amount_cents;
            this.db.prepare(`UPDATE billing_subscriptions SET paid_until=?,status=CASE WHEN cancel_requested=1 THEN 'canceled' ELSE 'active' END,
              plan_key=?,amount_cents=?,pending_plan_key=CASE WHEN ? THEN NULL ELSE pending_plan_key END,
              pending_amount_cents=CASE WHEN ? THEN NULL ELSE pending_amount_cents END,updated_at=? WHERE account_id=?`)
              .run(end, changing ? sub.pending_plan_key : sub.plan_key, changing ? input.cents : sub.amount_cents,
                changing ? 1 : 0, changing ? 1 : 0, now(), account.id);
          }
        }
        this.db.prepare("UPDATE billing_payments SET applied_at=? WHERE mollie_payment_id=?").run(now(), input.paymentId);
        this.event(account.id, "payment_paid", input.paymentId, null, input.kind);
        applied = true;
      } else if (["refunded", "charged_back"].includes(input.status) && existing?.applied_at && sub) {
        // A manual review is needed to re-evaluate the already-granted period.
        this.db.prepare("UPDATE billing_subscriptions SET status='review_required',last_error='Refund/chargeback needs reconciliation',updated_at=? WHERE account_id=?")
          .run(now(), account.id);
        this.event(account.id, "payment_reversed", input.paymentId);
      } else if (["failed", "canceled", "expired"].includes(input.status) && input.kind === "renewal" && sub && sub.status === "active") {
        this.db.prepare("UPDATE billing_subscriptions SET status='past_due',updated_at=? WHERE account_id=?").run(now(), account.id);
        this.event(account.id, "renewal_failed", input.paymentId, null, input.status);
      }
      sub = this.subscription(account.id);
      return { applied, setupPending: Boolean(sub && sub.status === "setup_pending" && !sub.cancel_requested) };
    }).immediate();
  }

  setRemoteSubscription(accountId: string, subscriptionId: string, nextPaymentDate: string | null) {
    this.db.transaction(() => {
      const sub = this.subscription(accountId);
      if (!sub || (sub.mollie_subscription_id && sub.mollie_subscription_id !== subscriptionId)) throw new BillingConflict("Subscription mismatch");
      this.db.prepare("UPDATE billing_subscriptions SET mollie_subscription_id=?,next_payment_date=?,status=CASE WHEN cancel_requested=1 THEN status ELSE 'active' END,last_error=NULL,updated_at=? WHERE account_id=?")
        .run(subscriptionId, nextPaymentDate, now(), accountId);
      this.event(accountId, "subscription_created", subscriptionId);
    }).immediate();
  }
  subscriptionError(accountId: string, message: string) {
    this.db.prepare("UPDATE billing_subscriptions SET last_error=?,updated_at=? WHERE account_id=?").run(message.slice(0, 160), now(), accountId);
    this.event(accountId, "subscription_setup_failed", null, null, message);
  }
  requestCancel(accountId: string, actor: string) {
    this.db.transaction(() => {
      this.db.prepare("UPDATE billing_subscriptions SET cancel_requested=1,updated_at=? WHERE account_id=?").run(now(), accountId);
      this.event(accountId, "cancel_requested", null, actor);
    }).immediate();
  }
  setCanceled(accountId: string, actor: string | null = null) {
    this.db.transaction(() => {
      this.db.prepare("UPDATE billing_subscriptions SET status='canceled',cancel_requested=1,next_payment_date=NULL,updated_at=? WHERE account_id=?")
        .run(now(), accountId);
      this.event(accountId, "subscription_canceled", null, actor);
    }).immediate();
  }
  schedulePlan(accountId: string, plan: PlanKey, cents: number, actor: string) {
    this.db.transaction(() => {
      this.db.prepare("UPDATE billing_subscriptions SET pending_plan_key=?,pending_amount_cents=?,updated_at=? WHERE account_id=?")
        .run(plan, cents, now(), accountId);
      this.event(accountId, "plan_change_requested", plan, actor);
    }).immediate();
  }
  allAccounts(mode: BillingMode): BillingAccount[] {
    return this.db.prepare("SELECT * FROM billing_accounts WHERE mode=?").all(mode) as BillingAccount[];
  }
  recentAttempts(accountId: string): BillingAttempt[] {
    return this.db.prepare("SELECT * FROM billing_attempts WHERE account_id=? ORDER BY created_at DESC LIMIT 30").all(accountId) as BillingAttempt[];
  }
  usage(accountId: string): { metric: string; quantity: number; period: string }[] {
    return this.db.prepare("SELECT period,metric,quantity FROM billing_usage WHERE account_id=? ORDER BY period DESC LIMIT 100").all(accountId) as { metric: string; quantity: number; period: string }[];
  }
}
