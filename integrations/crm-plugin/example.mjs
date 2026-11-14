import { createCrmPlugin } from "./client.mjs";
/** Call from an authorised server workflow after checking the CRM association.
 * These values are synthetic. No API call runs merely by importing this module.
 * Keep one stable operation key per logical change when retrying a request.
 */
export async function sendSyntheticExample({ baseUrl, token }) {
  const crm = createCrmPlugin({ baseUrl, token });
  await crm.upsertContact({
    key: "demo-contact-v1",
    externalId: "crm-demo-001",
    contact: { label: "Demo contact 001" },
  });
  await crm.identify({
    key: "demo-identity-v1",
    externalId: "crm-demo-001",
    identity: {
      kind: "web_user",
      scope: "example.com",
      value: "account-demo-001",
    },
    proof: {
      reference: "Synthetic account-to-CRM association for integration testing",
    },
  });
  await crm.events(
    [
      {
        eventId: "demo-pageview-001",
        channel: "web",
        type: "page_view",
        occurredAt: "2026-11-01T10:00:00Z",
        summary: "Synthetic product page visit",
        identity: {
          kind: "web_user",
          scope: "example.com",
          value: "account-demo-001",
        },
        proof: { reference: "Synthetic server event" },
        details: { pageUrl: "https://example.com/products/demo" },
      },
    ],
    "Synthetic integration test authorisation",
  );
  return crm.timeline({ externalId: "crm-demo-001" });
}
