import { dirname, join, resolve } from "node:path";

/** Cloud billing is separate from the Apache-2.0 self-hosted product. */
export type BillingMode = "disabled" | "test" | "live";
export type PlanKey = "solo" | "agency";

export const PILOT_PLANS = {
  solo: { key: "solo", name: "Cloud Solo", pilotCents: 3900, interval: "1 month" },
  agency: { key: "agency", name: "Cloud Agence", pilotCents: 14900, interval: "1 month" },
} as const;

export interface BillingConfig {
  mode: BillingMode;
  checkoutEnabled: boolean;
  apiKey: string;
  profileId: string;
  webhookUrl: string;
  returnUrl: string;
  publicOrigin: string;
  termsVersion: string;
  amounts: Record<PlanKey, number>;
  priceIncludesTax: boolean | null;
  pricesApproved: boolean;
  graceDays: number;
  dataPath: string;
  reconcileToken: string;
  reconcileEnabled: boolean;
}

const integer = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value)) throw new Error("Invalid billing integer configuration");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("Invalid billing integer configuration");
  return parsed;
};

/** Fail closed: live requires an explicitly approved fiscal price and legal terms. */
export function billingConfigFromEnv(env: NodeJS.ProcessEnv = process.env): BillingConfig {
  const mode = env.BILLING_MODE ?? "disabled";
  if (!["disabled", "test", "live"].includes(mode)) throw new Error("Invalid BILLING_MODE");
  const selectedMode = mode as BillingMode;
  const publicOrigin = env.BILLING_PUBLIC_ORIGIN ?? "https://gtm.kayroslab.com";
  const webhookUrl = env.MOLLIE_GTM_WEBHOOK_URL ?? `${publicOrigin}/api/billing/mollie/webhook`;
  const returnUrl = env.MOLLIE_GTM_RETURN_URL ?? `${publicOrigin}/console/?checkout=return`;
  const urls = [publicOrigin, webhookUrl, returnUrl].map((raw) => new URL(raw));
  if (urls.some((u) => u.protocol !== "https:" || u.username || u.password || u.origin !== urls[0].origin)) {
    throw new Error("Billing URLs must use HTTPS and the configured GTM origin");
  }
  if (urls[1].pathname !== "/api/billing/mollie/webhook" || !urls[2].pathname.startsWith("/console/")) {
    throw new Error("Invalid billing webhook/return path");
  }
  const priceIncludesTax = env.BILLING_PRICE_INCLUDES_TAX === "true" ? true : env.BILLING_PRICE_INCLUDES_TAX === "false" ? false : null;
  const amounts = {
    solo: integer(env.BILLING_SOLO_AMOUNT_CENTS, PILOT_PLANS.solo.pilotCents),
    agency: integer(env.BILLING_AGENCY_AMOUNT_CENTS, PILOT_PLANS.agency.pilotCents),
  };
  const checkoutEnabled = env.BILLING_CHECKOUT_ENABLED === "true";
  const config: BillingConfig = {
    mode: selectedMode, checkoutEnabled,
    apiKey: env.MOLLIE_GTM_API_KEY ?? "", profileId: env.MOLLIE_GTM_PROFILE_ID ?? "",
    webhookUrl, returnUrl, publicOrigin: urls[0].origin,
    termsVersion: env.BILLING_TERMS_VERSION ?? "", amounts, priceIncludesTax,
    pricesApproved: env.BILLING_PRICES_APPROVED === "true",
    graceDays: integer(env.BILLING_GRACE_DAYS, 7),
    dataPath: resolve(env.BILLING_DATA_PATH ?? join(dirname(env.TENANTS_PATH ?? "data/tenants.json"), "billing.sqlite3")),
    reconcileToken: env.BILLING_RECONCILE_TOKEN ?? "",
    reconcileEnabled: env.BILLING_RECONCILE_ENABLED === "true",
  };
  if (config.graceDays > 30 || Object.values(amounts).some((value) => value < 50 || value > 10_000_000)) throw new Error("Invalid billing amounts/grace period");
  if (selectedMode !== "disabled") {
    if (!config.apiKey.startsWith(`${selectedMode}_`) || !/^pfl_[A-Za-z0-9]+$/.test(config.profileId)) {
      throw new Error("GTM Mollie API key/profile missing or inconsistent with BILLING_MODE");
    }
    if (!config.termsVersion && checkoutEnabled) throw new Error("BILLING_TERMS_VERSION required to enable checkout");
  }
  if (selectedMode === "live") {
    if (env.BILLING_LIVE_APPROVED !== "true" || !config.pricesApproved || priceIncludesTax === null ||
        !env.BILLING_SOLO_AMOUNT_CENTS || !env.BILLING_AGENCY_AMOUNT_CENTS || !config.termsVersion) {
      throw new Error("Live billing blocked: legal, tax, price or owner approval missing");
    }
  }
  if (selectedMode === "disabled" && checkoutEnabled) throw new Error("Cannot enable checkout when billing is disabled");
  return config;
}

export function planPrice(config: BillingConfig, key: PlanKey): { value: string; cents: number; currency: "EUR" } {
  const cents = config.amounts[key];
  return { cents, value: (cents / 100).toFixed(2), currency: "EUR" };
}

export function billingCatalog(config: BillingConfig) {
  return Object.values(PILOT_PLANS).map((plan) => ({
    key: plan.key, name: plan.name, interval: plan.interval,
    pilotPriceCents: plan.pilotCents, chargeCents: config.pricesApproved ? config.amounts[plan.key] : null,
    priceIncludesTax: config.priceIncludesTax,
  }));
}
