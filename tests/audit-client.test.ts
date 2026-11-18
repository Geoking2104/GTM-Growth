import { it, expect, vi, afterEach } from "vitest";
import { requestPublicRead, auditStatusText } from "../site/audit-client.js";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("coalesces duplicate clicks, resumes with the same capability and handles the legacy JSON response", async () => {
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", { getItem: (k: string) => values.get(k), setItem: (k: string, v: string) => values.set(k, v) });
  let resolve: (value: unknown) => void = () => {};
  const fetcher = vi.fn(() => new Promise(done => { resolve = done; })); vi.stubGlobal("fetch", fetcher);
  const first = requestPublicRead("https://example.com/Case"), second = requestPublicRead("https://example.com/Case");
  expect(first).toBe(second); expect(fetcher).toHaveBeenCalledTimes(1);
  resolve({ ok: true, json: async () => ({ httpStatus: 200 }) });
  expect(await first).toEqual({ httpStatus: 200 });
  const headers = fetcher.mock.calls[0][1].headers;
  fetcher.mockImplementation(async () => ({ ok: true, json: async () => ({ httpStatus: 200 }) }));
  await requestPublicRead("https://example.com/Case");
  expect(fetcher.mock.calls[1][1].headers["Idempotency-Key"]).toBe(headers["Idempotency-Key"]);
  expect(headers["Idempotency-Key"]).toMatch(/^[A-Za-z0-9_-]{43}$/);
});
it("shows translated queue states, polls using a header and attaches the server snapshot reference", async () => {
  vi.useFakeTimers(); vi.stubGlobal("location", { href: "https://gtm.kayroslab.com/console/" });
  vi.stubGlobal("sessionStorage", { getItem: () => null, setItem() {} });
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ auditJob: { id: "job-one", status: "queued" } }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "job-one", status: "completed", result: { report360: { observedAt: "original-time" } } }) });
  vi.stubGlobal("fetch", fetcher); const onStatus = vi.fn();
  const work = requestPublicRead("https://example.com/resume", { onStatus });
  await vi.advanceTimersByTimeAsync(2100);
  const result = await work;
  expect(onStatus).toHaveBeenCalledWith("queued");
  expect(auditStatusText("queued", "fr")).toContain("attente"); expect(auditStatusText("queued", "en")).toContain("queued");
  expect(String(fetcher.mock.calls[1][0])).toBe("https://gtm.kayroslab.com/api/audits/job-one");
  expect(fetcher.mock.calls[1][1].headers.Authorization).toMatch(/^Bearer /);
  expect(result.report360.observedAt).toBe("original-time"); expect(result.auditJob.id).toBe("job-one");
});
it("retrieves a saved snapshot directly after reload without revalidating or submitting the site URL", async () => {
  vi.stubGlobal("location", { href: "https://gtm.kayroslab.com/console/" });
  vi.stubGlobal("sessionStorage", { getItem: () => JSON.stringify({ id: "saved-id", token: "D".repeat(43), expiresAt: Date.now() + 60000 }), setItem() {} });
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "saved-id", status: "completed", result: { report360: { observedAt: "saved-observation" } } }) });
  vi.stubGlobal("fetch", fetcher);
  const result = await requestPublicRead("https://example.com/old-snapshot");
  expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher.mock.calls[0][1].method).toBeUndefined();
  expect(result.report360.observedAt).toBe("saved-observation");
});
