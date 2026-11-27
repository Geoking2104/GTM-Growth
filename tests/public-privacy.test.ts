import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { parseHTML } from "linkedom";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("site/privacy.js", "utf8");
const current = "gtm-growth-privacy-v2";
const legacy = "gtm-growth-privacy-v1";
const day = 86400000;
const host = "https://gtm.kayroslab.com";
const google = "https://www.googletagmanager.com/gtm.js?id=GTM-MTLJ6WSM";
const clarity = "https://www.clarity.ms/tag/z8ln1th2sn";

function visit(url = host + "/", records: Record<string, unknown> = {}, referrer = "") {
  const { document } = parseHTML('<html lang="fr"><head></head><body><button class="privacy-settings">Cookies</button></body></html>');
  const location = Object.assign(new URL(url), { reload: vi.fn() });
  const listeners = new Map();
  const state = new Map(Object.entries(records).map(([k, v]) => [k, JSON.stringify(v)]));
  const localStorage = { getItem: (k: string) => state.get(k) ?? null, setItem: (k: string, v: string) => state.set(k, v), removeItem: (k: string) => state.delete(k) };
  const window = { addEventListener: (name: string, handler: unknown) => listeners.set(name, handler), dataLayer: [] as unknown[] };
  const deleted: string[] = [];
  Object.defineProperties(document, {
    cookie: { get: () => "_ga=a; _ga_75DZ33J5QP=b; _clsk=c; unrelated=d", set: (v: string) => deleted.push(v) },
    referrer: { value: referrer }
  });
  runInNewContext(source, { document, location, window, localStorage, URL, setTimeout: vi.fn(), clearTimeout: vi.fn() });
  const scripts = () => [...document.querySelectorAll("script")].map(s => s.src);
  const choose = (label: string) => [...document.querySelectorAll("button")].find(b => b.textContent === label)!.click();
  return { document, location, state, listeners, window, scripts, choose, deleted };
}

describe("public analytics consent", () => {
  it("waits for a decision and persists refusal across languages", () => {
    const page = visit();
    expect(page.scripts()).toEqual([]);
    page.choose("Refuser");
    const saved = JSON.parse(page.state.get(current)!);
    expect(saved).toMatchObject({ google: false, clarity: false });
    expect(visit(host + "/privacy.html", { [current]: saved }).document.querySelector(".privacy-banner")).toBeNull();
  });

  it("remembers a recent legacy refusal and never extends a Clarity-only grant to Google", () => {
    for (const old of ["accepted", "rejected"]) {
      const page = visit(host + "/", { [legacy]: { choice: old, at: Date.now() } });
      expect(page.scripts()).toEqual([]);
      expect(Boolean(page.document.querySelector(".privacy-banner"))).toBe(old === "accepted");
    }
  });

  it.each([[true, false], [false, true], [true, true]])("saves independent choices google=%s clarity=%s", (g, c) => {
    const page = visit();
    const [first, second] = page.document.querySelectorAll("input");
    first.checked = g; second.checked = c;
    page.choose("Enregistrer ma sélection");
    expect(page.scripts()).toEqual([...(g ? [google] : []), ...(c ? [clarity] : [])]);
    page.choose("Cookies");
    page.choose("Enregistrer ma sélection");
    expect(new Set(page.scripts()).size).toBe(page.scripts().length);
  });

  it("denies advertising and stops loaded tools on withdrawal including from another tab", () => {
    const page = visit();
    page.choose("Accepter");
    expect(Array.from(page.window.dataLayer[0] as ArrayLike<unknown>)).toEqual(["consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" }]);
    page.deleted.length = 0;
    page.state.set(current, JSON.stringify({ google: false, clarity: false, at: Date.now() }));
    page.listeners.get("storage")!({key: current});
    expect(page.window).toHaveProperty("ga-disable-G-75DZ33J5QP", true);
    expect(page.deleted.some(v => v.startsWith("_ga_75DZ33J5QP=;"))).toBe(true);
    expect(page.deleted.some(v => v.startsWith("_clsk=;"))).toBe(true);
    expect(page.deleted.some(v => v.startsWith("unrelated"))).toBe(false);
    expect(page.location.reload).toHaveBeenCalledOnce();
  });

  it.each([Date.now() - 181 * day, Date.now() + day])("rejects expired or future grants", at => {
    const page = visit(host + "/", { [current]: { google: true, clarity: true, at } });
    expect(page.scripts()).toEqual([]);
    expect(page.document.querySelector(".privacy-banner")).toBeTruthy();
  });

  it.each(["/console/", "/report/", "/reports/opendpe.html", "/?code=private", "/#private", "/api/billing", "https://tenant.gtm.kayroslab.com/"])("excludes %s even after consent", path => {
    const page = visit(new URL(path, host).href);
    page.choose("Accepter");
    expect(page.scripts()).toEqual([]);
  });

  it("protects sensitive referral URLs", () => {
    const page = visit(host + "/", {}, host + "/report/?code=private");
    page.choose("Accepter");
    expect(page.scripts()).toEqual([]);
  });
});
