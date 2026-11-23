import { afterEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { billingConfigFromEnv, type BillingConfig } from "../src/billing/config.js";
import { CloudAccess } from "../src/billing/access.js";
import { mountConsoleApi } from "../src/console/api.js";
import { mountBillingApi } from "../src/billing/api.js";
import { MollieHttpGateway, type MollieGateway, type MolliePayment, type MollieSubscription, type MollieMandate } from "../src/billing/mollie.js";
import { BillingService } from "../src/billing/service.js";
import { BillingStore, plusCalendarMonth } from "../src/billing/store.js";
import type { TenantContext } from "../src/tenants/context.js";
import { TenantStore } from "../src/tenants/store.js";

const dirs: string[] = [];
const stores: BillingStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const directory = () => { const dir = mkdtempSync(join(tmpdir(), "gtm-billing-")); dirs.push(dir); return dir; };
const conf = (extra: Partial<BillingConfig> = {}): BillingConfig => ({
  cloudTenants: ["acme", "globex"], limits: { version: "test-v1", solo: { monthlyOperations: 10, maxDomains: 1 }, agency: { monthlyOperations: 100, maxDomains: 5 } }, termsUrls: { en: "", fr: "" },
  mode: "test", checkoutEnabled: true, apiKey: "test_distinct_gtm_key", profileId: "pfl_gtm123",
  publicOrigin: "https://gtm.kayroslab.com", webhookUrl: "https://gtm.kayroslab.com/api/billing/mollie/webhook",
  returnUrl: "https://gtm.kayroslab.com/console/?checkout=return", termsVersion: "pilot-v1",
  amounts: { solo: 3900, agency: 14900 }, priceIncludesTax: null, pricesApproved: false,
  graceDays: 7, dataPath: join(directory(), "billing.sqlite3"), reconcileToken: "secret", reconcileEnabled: false,
  ...extra,
});
const ctx = (id = "acme", role: "tenant-user" | "tenant-admin" = "tenant-admin"): TenantContext => ({
  tenant: { id, name: id, mode: "organization", issuer: "https://auth.test/realms/gtm", domains: [], emailDomains: [],
    gscProperties: [], branding: {}, identityProviders: [], status: "active", createdAt: "" },
  role, platformAdmin: false, memberships: [{ id, role }],
});
const user = { sub: "u1", email: "owner@acme.fr", email_verified: true };
const consent = (planKey: "solo" | "agency" = "solo") => ({ planKey, termsVersion: "pilot-v1", acceptedRecurring: true, amountCents: planKey === "solo" ? 3900 : 14900, limitsVersion: "test-v1" });

/** Fully in-memory Mollie test double. Never makes an external request or charges a card. */
class FakeMollie implements MollieGateway {
  private next = 0;
  customers = new Map<string, string>();
  payments = new Map<string, MolliePayment>();
  subscriptions = new Map<string, MollieSubscription>();
  createPaymentCalls = 0;
  createSubscriptionCalls = 0;
  cancelCalls = 0;
  mandates: MollieMandate[] = [{ id: "mdt_1", status: "valid" }];
  rejectSubscription = false;
  private id(prefix: string) { return `${prefix}_${++this.next}`; }

  async getProfile() { return { id: "pfl_gtm123", status: "verified" }; }
  async listMethods() { return [{ id: "creditcard" }]; }
  async createCustomer(body: { name: string; email: string }, key: string) {
    let id = this.customers.get(key);
    if (!id) { id = this.id("cst"); this.customers.set(key, id); }
    return { id };
  }
  async createPayment(body: Record<string, unknown>, key: string) {
    this.createPaymentCalls++;
    const existing = [...this.payments.values()].find((p) => p.metadata?.attemptId === key);
    if (existing) return existing;
    const id = this.id("tr");
    const payment: MolliePayment = { id, status: "open", mode: "test", profileId: "pfl_gtm123",
      customerId: body.customerId as string, amount: body.amount as MolliePayment["amount"],
      metadata: body.metadata as Record<string, unknown>, _links: { checkout: { href: `https://www.mollie.com/checkout/${id}` } } };
    this.payments.set(id, payment);
    return payment;
  }
  async getPayment(id: string) { const payment = this.payments.get(id); if (!payment) throw new Error("not found"); return payment; }
  async listMandates() { return this.mandates; }
  async createSubscription(customerId: string, body: Record<string, unknown>, key: string) {
    this.createSubscriptionCalls++;
    if (this.rejectSubscription) throw new Error("transient timeout");
    const prior = [...this.subscriptions.values()].find((s) => s.metadata?.createKey === key);
    if (prior) return prior;
    const sub: MollieSubscription = { id: this.id("sub"), mode: "test", status: "active", customerId,
      amount: body.amount as MollieSubscription["amount"], startDate: body.startDate as string,
      nextPaymentDate: body.startDate as string, metadata: body.metadata as Record<string, unknown> };
    this.subscriptions.set(sub.id, sub);
    return sub;
  }
  async listSubscriptions(customerId: string) { return [...this.subscriptions.values()].filter((s) => s.customerId === customerId); }
  async getSubscription(customerId: string, id: string) {
    const sub = this.subscriptions.get(id);
    if (!sub || sub.customerId !== customerId) throw new Error("not found");
    return sub;
  }
  async updateSubscription(customerId: string, id: string, body: Record<string, unknown>) {
    const sub = await this.getSubscription(customerId, id);
    Object.assign(sub, { amount: body.amount, metadata: body.metadata });
    return sub;
  }
  async cancelSubscription(customerId: string, id: string) {
    this.cancelCalls++;
    const sub = await this.getSubscription(customerId, id); sub.status = "canceled"; return sub;
  }
  async listSubscriptionPayments(customerId: string, id: string) {
    await this.getSubscription(customerId, id);
    return [...this.payments.values()].filter((p) => p.subscriptionId === id);
  }
  pay(id: string, status = "paid", paidAt = new Date().toISOString()) {
    const payment = this.payments.get(id)!; payment.status = status;
    if (status === "paid") payment.paidAt = paidAt;
    return payment;
  }
  renewal(subscription: MollieSubscription, amount = subscription.amount) {
    const id = this.id("tr");
    const payment: MolliePayment = { id, status: "open", profileId: "pfl_gtm123", mode: "test",
      createdAt: new Date().toISOString(), customerId: subscription.customerId, subscriptionId: subscription.id, amount };
    this.payments.set(id, payment);
    return payment;
  }
}

function harness(extra: Partial<BillingConfig> = {}) {
  const config = conf(extra), store = new BillingStore(config.dataPath), mollie = new FakeMollie();
  stores.push(store);
  return { config, store, mollie, service: new BillingService(config, store, mollie) };
}
async function initial(service: BillingService, mollie: FakeMollie, plan: "solo" | "agency" = "solo") {
  const result = await service.checkout(ctx(), user, consent(plan));
  const remote = [...mollie.payments.values()][0];
  mollie.pay(remote.id);
  await service.processPayment(remote.id);
  return { result, remote };
}

describe("Cloud subscriptions / Mollie (no live charges)", () => {
  it("stores 39 € Solo and 149 € Agence as pilot prices; self-hosted stays free", () => {
    const { service } = harness();
    expect(service.publicPlans()).toMatchObject({ mode: "test", openSourceFree: true, pricesApproved: false });
    expect(service.publicPlans().plans.map((p) => [p.key, p.pilotPriceCents, p.chargeCents]))
      .toEqual([["solo", 3900, null], ["agency", 14900, null]]);
  });
  it.each(["solo", "agency"] as const)("charges one initial test payment and schedules one %s subscription for next month", async (plan) => {
    const { service, store, mollie } = harness();
    const result = await service.checkout(ctx(), user, consent(plan));
    expect(result.checkoutUrl).toMatch(/^https:\/\/www\.mollie\.com\/checkout\//);
    expect(mollie.createPaymentCalls).toBe(1);
    expect(mollie.payments.values().next().value?.amount.value).toBe(plan === "solo" ? "39.00" : "149.00");
    expect(service.status(ctx()).cloudAccess).toBe("read_only");
    const remote = [...mollie.payments.values()][0];
    mollie.pay(remote.id);
    const handled = await service.processPayment(remote.id);
    expect(handled).toEqual({ applied: true, kind: "first" });
    expect(service.status(ctx())).toMatchObject({ plan, status: "active", cloudAccess: "paid" });
    expect(mollie.createSubscriptionCalls).toBe(1);
    expect([...mollie.subscriptions.values()][0].startDate).toBe(service.status(ctx()).paidUntil?.slice(0, 10));
    expect(store.db.prepare("SELECT count(*) AS n FROM billing_payments").get()).toEqual({ n: 1 });
  });
  it("never grants access for failed/canceled/expired initial payments", async () => {
    for (const status of ["failed", "canceled", "expired"]) {
      const { service, mollie } = harness();
      const checkout = await service.checkout(ctx(), user, consent());
      expect(checkout).toBeTruthy();
      mollie.pay([...mollie.payments.keys()][0], status);
      await service.processPayment([...mollie.payments.keys()][0]);
      expect(service.status(ctx()).cloudAccess).toBe("read_only");
      expect(mollie.createSubscriptionCalls).toBe(0);
    }
  });
  it("replays a webhook 100 times without granting another period or subscription", async () => {
    const { service, store, mollie } = harness();
    const { remote } = await initial(service, mollie);
    const first = service.status(ctx()).paidUntil;
    for (let i = 0; i < 100; i++) expect((await service.processPayment(remote.id)).applied).toBe(false);
    expect(service.status(ctx()).paidUntil).toBe(first);
    expect(mollie.createSubscriptionCalls).toBe(1);
    expect(store.db.prepare("SELECT count(*) AS n FROM billing_payments").get()).toEqual({ n: 1 });
  });
  it("serializes duplicate checkout calls and rejects changing plan during checkout", async () => {
    const { service, mollie } = harness();
    const [a, b] = await Promise.all([service.checkout(ctx(), user, consent()), service.checkout(ctx(), user, consent())]);
    expect(a.attemptId).toBe(b.attemptId);
    expect(a.checkoutUrl).toBe(b.checkoutUrl);
    expect(mollie.createPaymentCalls).toBe(1);
    expect(mollie.customers.size).toBe(1);
    await expect(service.checkout(ctx(), user, consent("agency"))).rejects.toMatchObject({ status: 409 });
  });
  it("keeps the paid first period if recurring setup fails and resumes once without a second payment", async () => {
    const { service, mollie } = harness(); mollie.rejectSubscription = true;
    await initial(service, mollie);
    expect(service.status(ctx())).toMatchObject({ status: "setup_pending", cloudAccess: "paid" });
    expect(mollie.createPaymentCalls).toBe(1);
    mollie.rejectSubscription = false;
    expect((await service.reconcile()).errors).toBe(0);
    expect(service.status(ctx()).status).toBe("active");
    expect(mollie.createPaymentCalls).toBe(1);
  });
  it("keeps pending setup without a valid mandate", async () => {
    const { service, mollie } = harness(); mollie.mandates = [];
    await initial(service, mollie);
    expect(service.status(ctx()).status).toBe("setup_pending");
    expect(mollie.subscriptions.size).toBe(0);
  });
  it("correlates previously unseen renewal payments by remote subscription and extends once", async () => {
    const { service, store, mollie } = harness(); await initial(service, mollie);
    const firstUntil = service.status(ctx()).paidUntil!;
    const recurring = mollie.renewal([...mollie.subscriptions.values()][0]);
    mollie.pay(recurring.id);
    expect((await service.processPayment(recurring.id)).kind).toBe("renewal");
    expect(service.status(ctx()).paidUntil).toBe(plusCalendarMonth(firstUntil));
    expect((await service.processPayment(recurring.id)).applied).toBe(false);
    expect(store.payment(recurring.id)?.kind).toBe("renewal");
    expect(service.status(ctx()).paidUntil).toBe(plusCalendarMonth(firstUntil));
  });
  it("clears stale due dates on renewal and refreshes them from Mollie reconciliation", async () => {
    const { service, mollie } = harness(); await initial(service, mollie);
    const sub = [...mollie.subscriptions.values()][0];
    const renewal = mollie.renewal(sub); mollie.pay(renewal.id); await service.processPayment(renewal.id);
    expect(service.status(ctx()).nextPaymentDate).toBeNull();
    sub.nextPaymentDate = "2027-03-15";
    expect((await service.reconcile()).errors).toBe(0);
    expect(service.status(ctx()).nextPaymentDate).toBe("2027-03-15");
  });
  it("reopens the operational ledger after a restart without reapplying a paid webhook", async () => {
    const { config, service, store, mollie } = harness();
    const { remote } = await initial(service, mollie);
    const firstUntil = service.status(ctx()).paidUntil;
    store.close(); stores.splice(stores.indexOf(store), 1);
    const restarted = new BillingStore(config.dataPath); stores.push(restarted);
    const newService = new BillingService(config, restarted, mollie);
    expect((await newService.processPayment(remote.id)).applied).toBe(false);
    expect(newService.status(ctx())).toMatchObject({ status: "active", cloudAccess: "paid", paidUntil: firstUntil });
  });
  it("rejects payments with forged tenant, profile, customer or amount", async () => {
    for (const field of ["tenant", "profile", "customer", "amount"] as const) {
      const { service, mollie } = harness(); await service.checkout(ctx(), user, consent());
      const payment = [...mollie.payments.values()][0]; mollie.pay(payment.id);
      if (field === "tenant") payment.metadata = { ...payment.metadata, tenantId: "globex" };
      if (field === "profile") payment.profileId = "pfl_opendpe";
      if (field === "customer") payment.customerId = "cst_foreign";
      if (field === "amount") payment.amount = { currency: "EUR", value: "1.00" };
      await expect(service.processPayment(payment.id)).rejects.toThrow();
      expect(service.status(ctx()).cloudAccess).toBe("read_only");
    }
  });
  it("allows tenant-user to view only their tenant, while writes require tenant-admin", async () => {
    const { service, mollie } = harness(); await initial(service, mollie);
    expect(service.status(ctx("acme", "tenant-user")).plan).toBe("solo");
    expect(service.status(ctx("globex", "tenant-user")).plan).toBeNull();
    await expect(service.checkout(ctx("globex", "tenant-user"), user, consent())).rejects.toMatchObject({ status: 403 });
    await expect(service.cancel(ctx("acme", "tenant-user"), user, { confirm: "CANCEL_SUBSCRIPTION" })).rejects.toMatchObject({ status: 403 });
  });
  it("cancels recurring collection but preserves paid access until expiry", async () => {
    const { service, mollie } = harness(); await initial(service, mollie);
    const paidUntil = service.status(ctx()).paidUntil;
    await service.changePlan(ctx(), user, consent("agency"));
    await service.cancel(ctx(), user, { confirm: "CANCEL_SUBSCRIPTION" });
    expect(service.status(ctx())).toMatchObject({ status: "canceled", cloudAccess: "paid", cancelRequested: true, pendingPlan: null, nextPaymentDate: null, paidUntil });
    expect(mollie.cancelCalls).toBe(1);
  });
  it("schedules plan change for next renewal, never reprices the already paid period", async () => {
    const { service, mollie } = harness(); await initial(service, mollie);
    const firstUntil = service.status(ctx()).paidUntil;
    await service.changePlan(ctx(), user, consent("agency"));
    expect(service.status(ctx())).toMatchObject({ plan: "solo", pendingPlan: "agency", paidUntil: firstUntil });
    const recurring = mollie.renewal([...mollie.subscriptions.values()][0]); mollie.pay(recurring.id);
    await service.processPayment(recurring.id);
    expect(service.status(ctx())).toMatchObject({ plan: "agency", pendingPlan: null });
  });
  it("marks chargeback/refund for manual review rather than silently retaining active access", async () => {
    const { service, mollie } = harness(); const { remote } = await initial(service, mollie);
    remote.status = "charged_back";
    await service.processPayment(remote.id);
    expect(service.status(ctx())).toMatchObject({ status: "review_required", cloudAccess: "read_only" });
  });
  it("rejects invalid consent, unverified email and arbitrary price parameters", async () => {
    const { service, mollie } = harness();
    await expect(service.checkout(ctx(), { ...user, email_verified: false }, consent())).rejects.toMatchObject({ status: 403 });
    await expect(service.checkout(ctx(), user, { ...consent(), termsVersion: "other" })).rejects.toMatchObject({ status: 400 });
    await expect(service.checkout(ctx(), user, { ...consent(), amount: 1 })).resolves.toHaveProperty("checkoutUrl");
    expect([...mollie.payments.values()][0].amount.value).toBe("39.00");
  });
  it("refuses live configuration without explicit legal, tax, price and owner go-live approvals", () => {
    expect(() => billingConfigFromEnv({ BILLING_MODE: "live", MOLLIE_GTM_API_KEY: "live_abc", MOLLIE_GTM_PROFILE_ID: "pfl_gtm123" })).toThrow(/Live billing blocked/);
    expect(() => billingConfigFromEnv({ BILLING_MODE: "disabled", BILLING_CHECKOUT_ENABLED: "true" })).toThrow();
    expect(billingConfigFromEnv({}).mode).toBe("disabled");
  });
  it("verifies provider connectivity without creating financial objects", async () => {
    const { service, mollie } = harness();
    expect(await service.connection()).toMatchObject({ mode: "test", profileMatches: true, providerReady: true });
    expect(mollie.customers.size + mollie.payments.size + mollie.subscriptions.size).toBe(0);
    mollie.getProfile = async () => ({ id: "pfl_foreign", status: "verified" });
    await expect(service.checkout(ctx(), user, consent())).rejects.toMatchObject({ status: 503 });
    expect(mollie.customers.size).toBe(0);
  });
  it("requires enrollment and consent to current price and quota version", async () => {
    const { service } = harness();
    await expect(service.checkout(ctx("selfhost"), user, consent())).rejects.toMatchObject({ status: 403 });
    await expect(service.checkout(ctx(), user, { ...consent(), amountCents: 1 })).rejects.toMatchObject({ status: 400 });
    await expect(service.checkout(ctx(), user, { ...consent(), limitsVersion: "old" })).rejects.toMatchObject({ status: 400 });
  });
  it("recognizes Mollie refunds while payment status stays paid and keeps review sticky", async () => {
    const { service, mollie, store } = harness(); const { remote } = await initial(service, mollie);
    remote.amountRefunded = { currency: "EUR", value: "1.00" };
    await service.processPayment(remote.id);
    expect(service.status(ctx()).cloudAccess).toBe("read_only");
    await service.cancel(ctx(), user, { confirm: "CANCEL_SUBSCRIPTION" });
    const sub = store.subscription(store.account("acme", "test")!.id)!;
    store.setRemoteSubscription(sub.account_id, sub.mollie_subscription_id!, null);
    expect(service.status(ctx())).toMatchObject({ status: "review_required", cloudAccess: "read_only" });
  });
  it("cancels a subscription created while cancellation was in flight", async () => {
    const { service, mollie } = harness();
    const original = mollie.createSubscription.bind(mollie);
    mollie.createSubscription = async (...args) => {
      const sub = await original(...args);
      await service.cancel(ctx(), user, { confirm: "CANCEL_SUBSCRIPTION" });
      return sub;
    };
    await initial(service, mollie);
    expect([...mollie.subscriptions.values()][0].status).toBe("canceled");
    expect(service.status(ctx()).cancelRequested).toBe(true);
  });
  it("ignores an old failed renewal after a newer successful payment", async () => {
    const { service, mollie } = harness(); await initial(service, mollie);
    const old = mollie.renewal([...mollie.subscriptions.values()][0]); old.createdAt = "2020-01-01T00:00:00.000Z"; old.status = "failed";
    await service.processPayment(old.id);
    expect(service.status(ctx()).status).toBe("active");
  });
  it("requires review for an unseen older paid renewal rather than overextending access", async () => {
    const { service, mollie } = harness(); await initial(service, mollie);
    const paidUntil = service.status(ctx()).paidUntil;
    const old = mollie.renewal([...mollie.subscriptions.values()][0]); mollie.pay(old.id, "paid", "2020-01-01T00:00:00.000Z");
    await service.processPayment(old.id);
    expect(service.status(ctx())).toMatchObject({ status: "review_required", paidUntil, cloudAccess: "read_only" });
  });
  it("enforces persisted quotas, expiration, grace and retained reads without gating self-hosting", async () => {
    const { service, mollie, store, config } = harness();
    expect(() => service.access.authorize("acme", "/overview")).toThrow("cloud_subscription_required");
    expect(() => service.access.authorize("acme", "/local-seo/export")).not.toThrow();
    for (const route of ["/scenarios/list", "/scenarios/get", "/scenarios/history", "/scenarios/export"]) expect(() => service.access.authorize("acme", route)).not.toThrow();
    expect(() => service.access.authorize("acme", "/scenarios/update-draft", { consume: false })).toThrow("cloud_subscription_required");
    expect(() => service.access.authorize("selfhost", "/overview")).not.toThrow();
    await initial(service, mollie);
    expect(() => service.access.authorize("acme", "/overview", { domainCount: 2 })).toThrow("cloud_domain_limit");
    const second = new BillingStore(config.dataPath); stores.push(second);
    const otherProcess = new CloudAccess(config, second);
    for (let i=0; i<10; i++) (i%2 ? otherProcess : service.access).authorize("acme", "/overview");
    expect(() => otherProcess.authorize("acme", "/overview")).toThrow("cloud_operation_limit");
    expect(store.usage(store.account("acme", "test")!.id)[0].quantity).toBe(10);
    expect(() => service.access.authorize("acme", "/local-seo/export")).not.toThrow();
    const accountId = store.account("acme", "test")!.id;
    store.db.prepare("UPDATE billing_subscriptions SET status='past_due',paid_until=? WHERE account_id=?").run(new Date(Date.now()-86400000).toISOString(), accountId);
    expect(service.status(ctx()).cloudAccess).toBe("grace");
    store.db.prepare("UPDATE billing_subscriptions SET paid_until=? WHERE account_id=?").run(new Date(Date.now()-8*86400000).toISOString(), accountId);
    expect(() => service.access.authorize("acme", "/agent/query")).toThrow("cloud_subscription_required");
    const live = new CloudAccess({ ...config, mode: "live" }, store);
    expect(() => live.authorize("acme", "/overview")).toThrow("cloud_subscription_required");
  });
  it("rejects enrolled cloud workspaces without configured limits", () => {
    expect(() => billingConfigFromEnv({ BILLING_CLOUD_TENANTS: "acme" })).toThrow(/enrollment/);
  });
  it("computes monthly periods correctly for short months and leap years", () => {
    expect(plusCalendarMonth("2024-01-31T12:00:00.000Z")).toBe("2024-02-29T12:00:00.000Z");
    expect(plusCalendarMonth("2025-01-31T12:00:00.000Z")).toBe("2025-02-28T12:00:00.000Z");
  });
  it("meters partner-reported costs into the billing usage ledger without invoicing anything (R10)", () => {
    const store = new BillingStore(join(directory(), "meter.sqlite3")); stores.push(store);
    const access = new CloudAccess(conf(), store);
    const { account } = store.prepareCheckout({ tenantId: "acme", mode: "test", plan: "solo", cents: 3900, actor: "u1", termsVersion: "pilot-v1" });
    access.meterPartnerCost("acme", 0.012);
    access.meterPartnerCost("acme", 0.003);
    access.meterPartnerCost("acme", 0.0035);
    /* No metered row for an invalid cost, a non-enrolled tenant, or an enrolled tenant without a billing account. */
    access.meterPartnerCost("acme", -5);
    access.meterPartnerCost("acme", Number.NaN);
    access.meterPartnerCost("selfhost", 0.05);
    access.meterPartnerCost("globex", 0.05);
    const meterRow = store.usage(account.id).find((u) => u.metric === "partner-data-usd-micros");
    expect(meterRow?.quantity).toBe(12000 + 3000 + 3500);
    expect(meterRow?.period).toBe(new Date().toISOString().slice(0, 7));
  });
});

describe("billing HTTP boundary", () => {
  it("paginates Mollie reconciliation data and rejects cross-origin page URLs", async () => {
    const visited: string[] = [];
    const gateway = new MollieHttpGateway("test_dummy", (async (url: string | URL) => {
      visited.push(String(url));
      const page = visited.length;
      return new Response(JSON.stringify({ _embedded: { payments: [{ id: `tr_${page}` }] },
        _links: page === 1 ? { next: { href: "https://api.mollie.com/v2/customers/cst_one/subscriptions/sub_one/payments?from=tr_2&limit=250" } } : {} }), { status: 200 });
    }) as typeof fetch);
    expect((await gateway.listSubscriptionPayments("cst_one", "sub_one")).map((p) => p.id)).toEqual(["tr_1", "tr_2"]);
    expect(visited).toHaveLength(2);
    const malicious = new MollieHttpGateway("test_dummy", (async () =>
      new Response(JSON.stringify({ _embedded: { payments: [] }, _links: { next: { href: "https://evil.invalid/steal" } } }), { status: 200 })) as typeof fetch);
    await expect(malicious.listSubscriptionPayments("cst_one", "sub_one")).rejects.toThrow(/Unsafe Mollie pagination/);
  });
  it("offers read-only plans when disabled and never mounts any payment handler", async () => {
    const app = express(); app.use(express.json());
    mountBillingApi(app, { config: conf({ mode: "disabled", checkoutEnabled: false }) });
    const server = app.listen(0);
    try {
      const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      expect((await (await fetch(`${root}/api/billing/plans`)).json()).checkoutEnabled).toBe(false);
      expect((await fetch(`${root}/api/billing/checkout`, { method: "POST" })).status).toBe(503);
      expect((await fetch(`${root}/api/billing/mollie/webhook`, { method: "POST" })).status).toBe(503);
    } finally { server.close(); }
  });

  it("authenticates tenant-owned routes but permits verified URL-encoded Mollie webhooks", async () => {
    const { config, store, mollie } = harness();
    const dir = directory(), tenants = new TenantStore(join(dir, "tenants.json"));
    tenants.upsert(ctx().tenant!);
    tenants.upsert(ctx("globex").tenant!);
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
    const oidc = { issuer: "https://auth.test/realms/gtm", clientId: "gtm-console", jwksUrl: "https://auth.test/certs" };
    const token = (tenant: string, role: string) => {
      const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
      const header = encode({ alg: "RS256", kid: "k1" });
      const payload = encode({ iss: oidc.issuer, aud: oidc.clientId, sub: "u1", email: user.email,
        email_verified: true, exp: Math.floor(Date.now() / 1000) + 300,
        organization: [tenant], groups: [`/tenants/${tenant}/${role}`] });
      return `${header}.${payload}.${sign("sha256", Buffer.from(`${header}.${payload}`), privateKey).toString("base64url")}`;
    };
    const app = express(); app.use(express.json());
    mountBillingApi(app, { config, store, gateway: mollie, tenantStore: tenants, oidc, jwksLoader: async () => ({ keys: [jwk] }), scheduler: false });
    let dispatched = 0;
    mountConsoleApi(app, { config: oidc, store: tenants, jwksLoader: async () => ({ keys: [jwk] }), cloud: new CloudAccess(config, store), routes: [{ path: "/billing-probe", needsUrl: false, handler: async () => ({ dispatched: ++dispatched }) }] });
    const server = app.listen(0);
    try {
      const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const protectedCall = () => fetch(`${root}/api/console/billing-probe`, { method: "POST", headers: { Authorization: `Bearer ${token("acme", "tenant-admin")}`, "X-Tenant": "acme", "Content-Type": "application/json" }, body: "{}" });
      expect((await protectedCall()).status).toBe(402); expect(dispatched).toBe(0);
      const call = (route: string, tenant: string, role = "tenant-admin", body?: object, origin = config.publicOrigin) =>
        fetch(`${root}/api/billing${route}`, { method: body ? "POST" : "GET",
          headers: { Authorization: `Bearer ${token(tenant, role)}`, "X-Tenant": tenant,
            "Content-Type": "application/json", Origin: origin },
          body: body ? JSON.stringify(body) : undefined });
      expect((await fetch(`${root}/api/billing/status`)).status).toBe(401);
      expect((await call("/checkout", "acme", "tenant-user", consent())).status).toBe(403);
      expect((await call("/checkout", "acme", "tenant-admin", consent(), "https://evil.invalid")).status).toBe(403);
      expect((await call("/checkout", "acme", "tenant-admin", consent())).status).toBe(200);
      expect((await call("/status", "globex")).status).toBe(200);
      expect((await (await call("/status", "globex")).json()).plan).toBeNull();
      const payment = [...mollie.payments.values()][0]; mollie.pay(payment.id);
      const webhook = await fetch(`${root}/api/billing/mollie/webhook`, { method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `id=${payment.id}` });
      expect(webhook.status).toBe(200);
      expect((await protectedCall()).status).toBe(200); expect(dispatched).toBe(1);
      expect((await call("/connection", "acme")).status).toBe(403);
      expect((await (await call("/status", "acme")).json()).plan).toBe("solo");
      expect((await (await call("/status", "globex")).json()).plan).toBeNull();
      expect((await fetch(`${root}/api/billing/mollie/webhook`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "id=tr_wrong&status=paid" })).status).toBe(400);
    } finally { server.close(); }
  });
});
