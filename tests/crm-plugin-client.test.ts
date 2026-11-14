import { it, expect, vi } from "vitest";
import { createCrmPlugin } from "../integrations/crm-plugin/client.mjs";
const token = "synthetic_token_for_test_only_12345678";
it("keeps plugin credentials server-side, disables redirects and preserves caller operation keys", async () => {
  const transport = vi.fn(
    async () =>
      new Response(JSON.stringify({ profileId: "contact1" }), { status: 200 }),
  );
  const client = createCrmPlugin({
    baseUrl: "https://gtm.example",
    token,
    fetch: transport,
  });
  await client.upsertContact({
    key: "stable-operation-001",
    externalId: "customer1",
    contact: { label: "Contact One" },
  });
  const [url, options] = transport.mock.calls[0] as any;
  expect(String(url)).toBe("https://gtm.example/api/integrations/crm/contacts");
  expect(options.redirect).toBe("error");
  expect(options.credentials).toBe("omit");
  expect(options.headers.Authorization).toBe("Bearer " + token);
  expect(JSON.parse(options.body).key).toBe("stable-operation-001");
  expect(() =>
    createCrmPlugin({ baseUrl: "http://gtm.example", token }),
  ).toThrow();
  expect(() =>
    createCrmPlugin({ baseUrl: "https://user:pass@gtm.example", token }),
  ).toThrow();
});
it("bounds payloads and returns a safe error code without leaking the source payload", async () => {
  const transport = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          error: "CRM_IDENTITY_CONFLICT",
          secret: "should-not-leak",
        }),
        { status: 409 },
      ),
  );
  const client = createCrmPlugin({
    baseUrl: "https://gtm.example",
    token,
    fetch: transport,
  });
  await expect(client.timeline({ externalId: "customer1" })).rejects.toThrow(
    /^CRM_IDENTITY_CONFLICT$/,
  );
  await expect(
    client.events([{ summary: "x".repeat(256001) }], "receipt"),
  ).rejects.toThrow("CRM_PAYLOAD_LIMIT");
  expect(transport).toHaveBeenCalledTimes(1);
});
it("does not claim a provider error is a successful event receipt", async () => {
  const client = createCrmPlugin({
    baseUrl: "https://gtm.example",
    token,
    fetch: async () => new Response("<html>login page</html>", { status: 200 }),
  });
  await expect(client.timeline({ externalId: "customer1" })).rejects.toThrow(
    "CRM_INVALID_RESPONSE",
  );
});
