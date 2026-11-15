import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
const fixture = { mode: "test", enrolled: true, checkoutEnabled: true, termsVersion: "v1", limitsVersion: "q1", termsUrls: { en: "https://gtm.example/terms", fr: "https://gtm.example/fr/terms" }, plans: [{ key: "solo", name: "Cloud Solo", testChargeCents: 3900, chargeCents: null, pilotPriceCents: 3900, limits: { monthlyOperations: 10, maxDomains: 1 } }] };
afterEach(() => vi.unstubAllGlobals());
function dom() {
  const { document, window } = parseHTML('<html><body></body></html>');
  vi.resetModules(); vi.stubGlobal("localStorage", { getItem: () => "en", setItem() {} });
  vi.stubGlobal("document", document); vi.stubGlobal("window", window);
  Object.defineProperty(window, "location", { configurable: true, value: { assign: vi.fn() } });
  return document;
}
it.each([false, true])("shows explicit test mode and unchecked price/terms/quota consent (fr=%s)", async fr => {
  const document = dom(); const { renderBilling } = await import("../site/console/billing.js");
  const request = vi.fn(async path => path === "/checkout" ? { checkoutUrl: "https://www.mollie.com/checkout/test" } : fixture);
  document.body.append(await renderBilling({ me: { role: "tenant-admin" }, request, fr }));
  const form = document.querySelector("form")!, checkbox = document.querySelector("input")!;
  expect(Boolean(checkbox.checked)).toBe(false);
  expect(document.body.textContent).toContain(fr ? "MODE TEST" : "TEST MODE");
  await form.onsubmit({ preventDefault() {} }); expect(request).toHaveBeenCalledTimes(1);
  checkbox.checked = true;
  await form.onsubmit({ preventDefault() {} });
  expect(request).toHaveBeenLastCalledWith("/checkout", { planKey: "solo", amountCents: 3900, termsVersion: "v1", limitsVersion: "q1", acceptedRecurring: true });
  expect(document.querySelector("a")!.href).toBe(fixture.termsUrls[fr ? "fr" : "en"]);
});
it("does not offer checkout when status fails or the workspace is not enrolled", async () => {
  const document = dom(); const { renderBilling } = await import("../site/console/billing.js");
  const request = vi.fn(async () => { throw Object.assign(new Error("Unauthorized"), { status: 401 }); });
  const failed = await renderBilling({ me: { role: "tenant-admin" }, request, fr: false });
  expect(failed.querySelector("form")).toBeNull(); expect(request).toHaveBeenCalledTimes(1);
  document.body.append(await renderBilling({ me: { role: "tenant-admin" }, request: async () => ({ ...fixture, enrolled: false }), fr: false }));
  expect(document.querySelector("form")).toBeNull();
});
