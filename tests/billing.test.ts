import { afterEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { billingConfigFromEnv, type BillingConfig } from "../src/billing/config.js";
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
const consent = (planKey: "solo" | "agency" = "solo") => ({ planKey, termsVersion: "pilot-v1", acceptedRecurring: true });

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
      customerId: subscription.customerId, subscriptionId: subscription.id, amount };
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
    await service.cancel(ctx(), user, { confirm: "CANCEL_SUBSCRIPTION" });
    expect(service.status(ctx())).toMatchObject({ status: "canceled", cloudAccess: "paid", cancelRequested: true, paidUntil });
    expect(mollie.cancelCalls).toBe(1);
  });
  it("schedules plan change for next renewal, never reprices the already paid period", async () => {
    const { service, mollie } = harness(); await initial(service, mollie);
    const firstUntil = service.status(ctx()).paidUntil;
    await service.changePlan(ctx(), user, { planKey: "agency" });
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
  it("computes monthly periods correctly for short months and leap years", () => {
    expect(plusCalendarMonth("2024-01-31T12:00:00.000Z")).toBe("2024-02-29T12:00:00.000Z");
    expect(plusCalendarMonth("2025-01-31T12:00:00.000Z")).toBe("2025-02-28T12:00:00.000Z");
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
    const server = app.listen(0);
    try {
      const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
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
      expect((await (await call("/status", "acme")).json()).plan).toBe("solo");
      expect((await (await call("/status", "globex")).json()).plan).toBeNull();
      expect((await fetch(`${root}/api/billing/mollie/webhook`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "id=tr_wrong&status=paid" })).status).toBe(400);
    } finally { server.close(); }
  });
});
