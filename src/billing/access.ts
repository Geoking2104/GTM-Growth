import type { BillingConfig } from "./config.js";
import { BillingStore, type BillingSubscription } from "./store.js";

export class CloudAccessError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
/** Billing-ledger metric that accumulates the partner-reported cost of market-data
 * calls in integer micro-USD per UTC month (R10): 0.012 USD rounds to 12000. */
export const PARTNER_COST_METRIC = "partner-data-usd-micros";
export function subscriptionAccess(sub: BillingSubscription | undefined, graceDays: number, time = Date.now()) {
  const until = Date.parse(sub?.paid_until ?? "");
  if (["active", "setup_pending", "past_due", "canceled"].includes(sub?.status ?? "") && until > time) return "paid";
  if (sub?.status === "past_due" && until + graceDays * 86_400_000 > time) return "grace";
  return "read_only";
}
/** Explicit, cached-data or protective actions. New routes require a subscription by default. */
const retainedRoutes = new Set([
  "/scenarios/list", "/scenarios/get", "/scenarios/history", "/scenarios/revision", "/scenarios/comments", "/scenarios/evidence", "/scenarios/capabilities", "/scenarios/export", "/scenarios/validate",
  "/decision/inbox", "/decision/intent", "/decision/measurement/latest", "/decision/portfolio/card",
  "/decision/editorial/brief", "/decision/editorial/follow-ups", "/decision/editorial/revoke-evidence",
  "/ai-visibility/datasets", "/ai-visibility/report", "/ai-visibility/citation-gaps", "/ai-visibility/accounts", "/ai-visibility/accounts/disconnect",
  "/ai-visibility/openai-status", "/ai-visibility/gemini-status", "/visibility/prompts", "/visibility/runs",
  "/visibility/schedule", "/visibility/schedule/options", "/visibility/schedule/pause", "/visibility/schedule/billed",
  "/rank/keywords", "/ops/alerts", "/ops/alerts/ack", "/ops/automation", "/data-agent/context", "/market/status",
  "/social/state", "/social/analytics", "/social/export", "/local-seo/state", "/local-seo/export",
  "/local-seo/evidence/read", "/local-seo/gbp/unbind", "/local-seo/publication/cancel",
  "/commerce/stores", "/commerce/disconnect", "/commerce/dashboard", "/commerce/orders", "/commerce/products", "/commerce/feed/readiness",
  "/competition/state", "/competition/report", "/competition/comparison", "/crm/overview", "/crm/contact/detail", "/crm/timeline", "/crm/export",
]);
export class CloudAccess {
  constructor(readonly config: BillingConfig, readonly store: BillingStore) {}
  enrolled(tenantId: string) { return this.config.cloudTenants.includes(tenantId); }  /** Reserve before dispatch. An accepted operation counts even if its provider fails; no monetary overage. */
  authorize(tenantId: string, route: string, options: { consume?: boolean; domainCount?: number } = {}) {
    if (!this.enrolled(tenantId) || retainedRoutes.has(route)) return;
    this.store.db.transaction(() => {
      const account = this.store.account(tenantId, this.config.mode);
      const sub = account && this.store.subscription(account.id);
      if (!account || !sub || subscriptionAccess(sub, this.config.graceDays) === "read_only") throw new CloudAccessError(402, "cloud_subscription_required");
      const limits = this.config.limits?.[sub.plan_key];
      if (!limits) throw new CloudAccessError(503, "cloud_limits_unavailable");
      if (options.domainCount !== undefined && options.domainCount > limits.maxDomains) throw new CloudAccessError(409, "cloud_domain_limit");
      if (options.consume === false) return;
      const period = new Date().toISOString().slice(0, 7); // UTC calendar month, explicitly disclosed in the console.
      const used = this.store.db.prepare("SELECT quantity FROM billing_usage WHERE account_id=? AND period=? AND metric='operations'").get(account.id, period) as { quantity: number } | undefined;
      if ((used?.quantity ?? 0) >= limits.monthlyOperations) throw new CloudAccessError(429, "cloud_operation_limit");
      this.store.db.prepare(`INSERT INTO billing_usage (account_id,period,metric,quantity) VALUES (?,?,'operations',1)
        ON CONFLICT(account_id,period,metric) DO UPDATE SET quantity=quantity+1`).run(account.id, period);
    }).immediate();
  }

  /** R10 partner-cost metering — measurement, never invoicing. Partner calls
   * (R4/R5 market data) report their partner-reported cost in USD; this
   * records it into the billing usage ledger as integer micro-USD per UTC
   * month for cloud-enrolled tenants with a billing account. A self-hosted
   * operator pays its own partner costs and is never metered here; tenants
   * are never billed for partner data (open question 3 stays open: the
   * ledger is the evidence base, the pricing decision stays human). */
  meterPartnerCost(tenantId: string, costUsd: number) {
    if (!this.enrolled(tenantId)) return;
    if (typeof costUsd !== "number" || !Number.isFinite(costUsd) || costUsd <= 0) return;
    const account = this.store.account(tenantId, this.config.mode);
    if (!account) return;
    const period = new Date().toISOString().slice(0, 7); // UTC calendar month, same period as the operations quota
    const micros = Math.round(costUsd * 1_000_000);
    this.store.db.prepare(`INSERT INTO billing_usage (account_id,period,metric,quantity) VALUES (?,?,?,?)
      ON CONFLICT(account_id,period,metric) DO UPDATE SET quantity=quantity+?`).run(account.id, period, PARTNER_COST_METRIC, micros, micros);
  }
}
