import type { BillingConfig } from "./config.js";
import { BillingStore, type BillingSubscription } from "./store.js";

export class CloudAccessError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
export function subscriptionAccess(sub: BillingSubscription | undefined, graceDays: number, time = Date.now()) {
  const until = Date.parse(sub?.paid_until ?? "");
  if (["active", "setup_pending", "past_due", "canceled"].includes(sub?.status ?? "") && until > time) return "paid";
  if (sub?.status === "past_due" && until + graceDays * 86_400_000 > time) return "grace";
  return "read_only";
}
/** Explicit, cached-data or protective actions. New routes require a subscription by default. */
const retainedRoutes = new Set([
  "/ai-visibility/datasets", "/ai-visibility/report", "/ai-visibility/accounts", "/ai-visibility/accounts/disconnect",
  "/ai-visibility/openai-status", "/ai-visibility/gemini-status", "/visibility/prompts", "/visibility/runs",
  "/rank/keywords", "/ops/alerts", "/ops/alerts/ack", "/ops/automation", "/data-agent/context",
  "/social/state", "/social/analytics", "/social/export", "/local-seo/state", "/local-seo/export",
  "/local-seo/evidence/read", "/local-seo/gbp/unbind", "/local-seo/publication/cancel",
  "/commerce/stores", "/commerce/disconnect", "/commerce/dashboard", "/commerce/orders", "/commerce/products", "/commerce/feed/readiness",
  "/competition/state", "/competition/report", "/crm/overview", "/crm/contact/detail", "/crm/timeline", "/crm/export",
]);
export class CloudAccess {
  constructor(readonly config: BillingConfig, readonly store: BillingStore) {}
  enrolled(tenantId: string) { return this.config.cloudTenants.includes(tenantId); }
  /** Reserve before dispatch. An accepted operation counts even if its provider fails; no monetary overage. */
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
}
