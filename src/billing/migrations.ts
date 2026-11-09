/** Numbered migrations are run only against the dedicated GTM billing SQLite DB. */
export const BILLING_MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE billing_accounts (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, mode TEXT NOT NULL,
        mollie_customer_id TEXT, customer_key TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE (tenant_id, mode), UNIQUE (mollie_customer_id)
      );
      CREATE TABLE billing_attempts (
        id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES billing_accounts(id),
        tenant_id TEXT NOT NULL, mode TEXT NOT NULL, plan_key TEXT NOT NULL,
        amount_cents INTEGER NOT NULL, currency TEXT NOT NULL,
        actor_sub TEXT NOT NULL, terms_version TEXT NOT NULL, accepted_at TEXT NOT NULL,
        status TEXT NOT NULL, mollie_payment_id TEXT UNIQUE, checkout_url TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX one_pending_checkout ON billing_attempts(account_id)
        WHERE status IN ('initializing', 'open', 'pending', 'authorized');
      CREATE TABLE billing_subscriptions (
        account_id TEXT PRIMARY KEY REFERENCES billing_accounts(id),
        tenant_id TEXT NOT NULL, mode TEXT NOT NULL, plan_key TEXT NOT NULL,
        amount_cents INTEGER NOT NULL, currency TEXT NOT NULL,
        mollie_subscription_id TEXT UNIQUE, create_key TEXT NOT NULL,
        status TEXT NOT NULL, paid_until TEXT, next_payment_date TEXT,
        pending_plan_key TEXT, pending_amount_cents INTEGER,
        cancel_requested INTEGER NOT NULL DEFAULT 0,
        last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE billing_payments (
        mollie_payment_id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES billing_accounts(id),
        attempt_id TEXT REFERENCES billing_attempts(id),
        mollie_subscription_id TEXT, kind TEXT NOT NULL,
        amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL,
        paid_at TEXT, applied_at TEXT, updated_at TEXT NOT NULL
      );
      CREATE TABLE billing_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT,
        kind TEXT NOT NULL, reference TEXT, actor_sub TEXT,
        detail TEXT, created_at TEXT NOT NULL
      );
      CREATE INDEX billing_events_account ON billing_events(account_id, created_at);
      CREATE TABLE billing_usage (
        account_id TEXT NOT NULL REFERENCES billing_accounts(id),
        period TEXT NOT NULL, metric TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (account_id, period, metric)
      );
    `,
  },
] as const;
