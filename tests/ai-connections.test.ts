import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectAIAccount, listAIAccounts, resolveAIAccount, verifyAIAccount, accountHeaders, CONNECTION_PROVIDERS } from "../src/console/ai-connections.js";
import { closeVisibilityStores, readAIConnections, writeAIConnection, removeAIConnection } from "../src/console/ai-visibility-store.js";
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ai-accounts-")); vi.stubEnv("AI_VISIBILITY_PATH", dir); vi.stubEnv("AI_CONNECTIONS_MASTER_KEY", ""); });
afterEach(() => { closeVisibilityStores(); vi.unstubAllEnvs(); });
const input = { provider: "openai", label: "Client project", key: "sk-fixture-key-not-a-real-credential", confirmed: true, project: "proj_client", organization: "org_client" };
const ok = () => new Response('{"data":[]}', { status: 200 });
it("encrypts persistent credentials, lists only metadata, and isolates account IDs by tenant/provider", async () => {
  const fetcher = vi.fn(async () => ok()); const saved = await connectAIAccount("acme", input, fetcher);
  expect(saved.generationTested).toBe(false);
  expect(fetcher.mock.calls).toHaveLength(1);
  expect(listAIAccounts("acme", "openai")).toEqual([expect.objectContaining({ id: saved.id, label: "Client project", kind: "saved" })]);
  expect(JSON.stringify(listAIAccounts("acme", "openai"))).not.toContain(input.key);
  expect(readFileSync(join(dir, "datasets.sqlite3")).includes(Buffer.from(input.key))).toBe(false);
  expect(statSync(join(dir, "accounts.key")).mode & 0o777).toBe(0o600);
  closeVisibilityStores(); expect(resolveAIAccount("acme", "openai", saved.id)).toEqual({ key: input.key, project: "proj_client", organization: "org_client" });
  expect(() => resolveAIAccount("globex", "openai", saved.id)).toThrow("not found");
  expect(() => resolveAIAccount("acme", "grok", saved.id)).toThrow("not found");
  expect(listAIAccounts("globex", "openai")).toEqual([]);
  const record = readAIConnections<any>("acme")[0]; writeAIConnection("globex", record.id, record);
  expect(() => resolveAIAccount("globex", "openai", saved.id)).toThrow("decrypted");
});
it("validates consent, labels, scopes and key before any provider call", async () => {
  const fetcher = vi.fn();
  for (const override of [{ confirmed: false }, { provider: "unknown" }, { label: "" }, { key: "short" }, { key: "key\ninjected" }, { project: "proj\r\nheader" }, { provider: "grok", project: "proj_client" }]) await expect(connectAIAccount("acme", { ...input, ...override }, fetcher)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it.each(CONNECTION_PROVIDERS)("verifies %s via fixed read-only model-list requests without leaking error bodies", async p => {
  const fetcher = vi.fn(async () => new Response("secret upstream details", { status: 401 }));
  await expect(verifyAIAccount(p, { key: input.key }, fetcher)).rejects.toThrow("HTTP 401");
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]; expect(url).toMatch(/^https:\/\/(api.openai.com|generativelanguage.googleapis.com|api.anthropic.com|api.mistral.ai|api.x.ai)\//);
  expect(init.method).toBeUndefined(); expect(init.body).toBeUndefined(); expect(init.redirect).toBe("error");
  expect(init.signal).toBeInstanceOf(AbortSignal);
});
it("does not save rejected credentials or expose thrown secrets", async () => {
  await expect(connectAIAccount("acme", input, vi.fn(async () => { throw new Error(input.key); }))).rejects.toThrow("Account check unavailable");
  expect(listAIAccounts("acme", "openai")).toEqual([]);
});
it("never falls back from an invalid selected ID and removes access without deleting observations", async () => {
  vi.stubEnv("AI_VISIBILITY_OPENAI_KEY_ACME", "server-key");
  expect(resolveAIAccount("acme", "openai").key).toBe("server-key");
  expect(() => resolveAIAccount("acme", "openai", "missing-id")).toThrow("not found");
  const saved = await connectAIAccount("acme", input, vi.fn(async () => ok())); removeAIConnection("acme", saved.id);
  expect(() => resolveAIAccount("acme", "openai", saved.id)).toThrow("not found");
  expect(listAIAccounts("acme", "openai").map(a => a.id)).toEqual(["server"]);
});
it("authenticates scoped OpenAI and Claude accounts with allowlisted headers", () => {
  expect(accountHeaders("openai", { key: "key", project: "proj_x", organization: "org_x" })).toEqual({ Authorization: "Bearer key", "OpenAI-Project": "proj_x", "OpenAI-Organization": "org_x" });
  expect(accountHeaders("claude", { key: "key", workspace: "wrkspc_x" })).toMatchObject({ "x-api-key": "key", "anthropic-workspace-id": "wrkspc_x" });
});

it.each(["openai", "claude", "mistral", "grok"] as const)("uses the selected saved %s key during the real collection handler", async p => {
  const saved = await connectAIAccount("acme", { provider: p, key: "fixture-selected-account-key", label: "Chosen", confirmed: true }, async () => ok());
  const { aiVisibilityRoutes } = await import("../src/console/ai-visibility.js"); const { aiProviderRoutes } = await import("../src/console/ai-visibility-providers.js");
  const route = [...aiVisibilityRoutes, ...aiProviderRoutes].find(r => r.path === `/ai-visibility/${p}-run`)!;
  const reply = p === "claude" ? { stop_reason: "end_turn", content: [{ type: "text", text: "Alpha is useful." }] } : p === "mistral" ? { outputs: [{ type: "message.output", role: "assistant", content: "Alpha is useful." }] } : { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "Alpha is useful.", annotations: [] }] }] };
  const fetcher = vi.fn(async () => new Response(JSON.stringify(reply)));
  vi.stubGlobal("fetch", fetcher);
  try {
    const result = await route.handler({ body: { accountId: saved.id, confirmed: true, brands: [{ name: "Alpha" }], prompts: ["Which brand?"] }, tenancy: { tenant: { id: "acme" } }, url: "" } as any);
    expect(result).toMatchObject({ succeeded: 1 }); const [, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(options.headers).toMatchObject(p === "claude" ? { "x-api-key": "fixture-selected-account-key" } : { Authorization: "Bearer fixture-selected-account-key" });
  } finally { vi.unstubAllGlobals(); }
});
