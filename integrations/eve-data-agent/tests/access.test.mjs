import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { slackIdentity } from "../agent/lib/access.ts";
import { readGtm } from "../agent/lib/bridge.ts";
const env = { SLACK_TEAM_ID: "T123", SLACK_ALLOWED_CHANNEL_IDS: "C123", SLACK_ALLOWED_USER_IDS: "U123" };
const auth = { authenticator: "slack-webhook", principalId: "slack:T123:U123", attributes: { channel_id: "C123" } };
test("only an authenticated, allowed Slack team/user/channel can invoke tools", () => {
  assert.equal(slackIdentity(null, env), null); assert.equal(slackIdentity(auth, {}), null);
  for (const change of [{ authenticator: "http-basic" }, { principalId: "slack:T999:U123" }, { principalId: "slack:T123:U999" }, { attributes: { channel_id: "C999" } }]) assert.equal(slackIdentity({ ...auth, ...change }, env), null);
  assert.deepEqual(slackIdentity(auth, env), { teamId: "T123", userId: "U123", channelId: "C123" });
});
test("bridge calls sign the exact principal and body, disable redirects and sanitize failures", async () => {
  const original = globalThis.fetch; const oldEnv = { ...process.env }; Object.assign(process.env, env, { GTM_AGENT_BRIDGE_URL: "https://example.test/api/internal/data-agent/read", GTM_AGENT_BRIDGE_SECRET: "test-only-".repeat(4) });
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(String(url), process.env.GTM_AGENT_BRIDGE_URL); assert.equal(options.redirect, "error");
      const h = options.headers; const signature = createHmac("sha256", process.env.GTM_AGENT_BRIDGE_SECRET).update(`v1:${h["X-GTM-Timestamp"]}:${h["X-GTM-Nonce"]}:`).update(options.body).digest("hex");
      assert.equal(h["X-GTM-Signature"], signature); assert.equal(JSON.parse(options.body).userId, "U123");
      return new Response(JSON.stringify({ state: "ready" }));
    };
    assert.deepEqual(await readGtm(auth, { operation: "query", model: "workspace" }), { state: "ready" });
    await assert.rejects(readGtm({ ...auth, principalId: "slack:T123:U999" }, { operation: "catalog" }), /Access denied/);
    globalThis.fetch = async () => new Response("private backend detail", { status: 503 });
    await assert.rejects(readGtm(auth, { operation: "catalog" }), error => !error.message.includes("private") && error.message.includes("unavailable"));
    globalThis.fetch = async () => new Response("x".repeat(65537));
    await assert.rejects(readGtm(auth, { operation: "catalog" }), /unavailable/);
  } finally { globalThis.fetch = original; for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key]; Object.assign(process.env, oldEnv); }
});
