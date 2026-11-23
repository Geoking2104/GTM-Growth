import { parseHTML } from "linkedom";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it.each(["fr", "en"])("submits the selected account and the explicitly approved estimates in %s", async (lang) => {
  const { document, window } = parseHTML("<html><body></body></html>");
  Object.defineProperty(window.HTMLSelectElement.prototype, "value", { configurable: true,
    get() { return [...this.options].find((o) => o.selected)?.value ?? this.options[0]?.value ?? ""; },
    set(value) { for (const option of this.options) option.selected = option.value === value; },
  });
  vi.stubGlobal("document", document);
  vi.stubGlobal("location", { search: `?lang=${lang}` });
  vi.stubGlobal("localStorage", { getItem: () => lang, setItem: () => {} });
  const { renderVisibilitySchedule } = await import("../site/console/visibility-schedule.js");
  const api = vi.fn(async (path: string, _payload: object) => {
    if (path === "/visibility/schedule") return { available: true, schedule: null, runs: [] };
    if (path === "/visibility/schedule/options") return {
      panels: [{ id: "panel", createdAt: "2026-11-19", brands: ["Alpha"] }],
      providers: [{ id: "openai", name: "OpenAI", accounts: [{ id: "fixture-account", label: "Saved account" }] }],
    };
    return { schedule: {} };
  });
  const root = renderVisibilitySchedule({ api, admin: true });
  document.body.append(root);
  await vi.waitFor(() => expect(root.hidden).toBe(false));
  expect(api).toHaveBeenCalledTimes(1);
  const details = root.querySelector("details")!;
  details.open = true;
  details.ontoggle!(new window.Event("toggle"));
  await vi.waitFor(() => expect(root.querySelector("form")).not.toBeNull());
  const [calls, estimate, budget] = [...root.querySelectorAll<HTMLInputElement>('input[type="number"]')].slice(1);
  calls.value = "24"; estimate.value = "0.0025"; budget.value = "0.15";
  root.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked = true;
  const form = root.querySelector("form")!;
  form.onsubmit!(new window.Event("submit", { cancelable: true }));
  await vi.waitFor(() => expect(api).toHaveBeenCalledWith("/visibility/schedule/save", {
    confirmed: true, panelId: "panel", provider: "openai", accountId: "fixture-account", intervalHours: 24,
    maxDailyCalls: 24, estimateUsdMicros: 2500, maxDailyUsdMicros: 150000,
  }));
});
