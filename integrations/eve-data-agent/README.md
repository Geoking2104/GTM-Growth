# GTM Growth · Eve Slack data agent

An optional, standalone Eve service answers natural-language questions in Slack
using the same read-only metric service as the GTM console. It does not replace
the OVH app or require moving GTM data to a new warehouse. The console's guided
assistant works independently, without a model credential.

The core console assistant and bridge code were deployed to OVH in
[run #44](https://github.com/Geoking2104/GTM-Growth/actions/runs/43462628681)
on 13 November 2026. The bridge remains unconfigured (503); this optional Eve
service has not been installed or accepted against a real Slack workspace. Live Slack
acceptance needs an authorized workspace, app, allowed conversations/users and a
model credential. No messages are sent by build/tests. See
[product architecture and value plan](../../docs/product/DATA-AGENT-JOURNEY.md).

## Operator setup

1. Keep the existing GTM service on its current runtime. Run this directory
   separately with **Node 26** and `npm ci`. Versions are pinned by package-lock.
   Run `npm run typecheck`, `npm test`, and `npm run build`.
2. On the GTM server, copy `bindings.example.json` into the existing read-only
   secrets mount, e.g. `/opt/gtm-growth/.secrets/data-agent-bindings.json` on OVH.
   Replace every placeholder with verified exact IDs. The example deliberately
   fails validation. One binding can have several channels, but each
   `(teamId, channelId)` may belong to only one tenant, with a distinct secret
   per binding. A channel grants access to the bound workspace's aggregate data.
3. Generate a random secret (at least 32 characters), e.g. `openssl rand -hex 32`,
   and transfer it using your secret manager. Never commit it or post it in Slack.
   In the GTM server's existing `.env.local`, set:

   ```dotenv
   GTM_DATA_AGENT_BINDINGS_FILE=/secrets/data-agent-bindings.json
   GTM_AGENT_SECRET_CUSTOMER=<generated-secret>
   ```

   Keep the mounted file readable by container UID 1001 and not world-readable.
   Restart the GTM service through the normal approved deployment procedure.
   Bindings and tenant suspension are checked on every read; environment secret
   rotation requires restart. Removing the file environment variable disables
   bridge reads. The profile/replay database lives beside `TENANTS_PATH`, or at
   `DATA_AGENT_STORE_PATH`; include it in the existing data-volume backups.
4. Copy `.env.example` to `.env.local` in this separate service. Set
   `GTM_AGENT_BRIDGE_SECRET` to the same secret, and select a model and credential
   you are authorized to use. The model's context capacity must be at least
   32,000 tokens. The explicit context budget avoids Gateway metadata fetching
   during compilation. It is not a claim about the selected model's maximum.
5. Provision the Slack connector with `npx eve add channel/slack` using the
   operator's authorized Vercel/Slack accounts. Preserve the admission handlers
   in `agent/channels/slack.ts`. Set the returned `SLACK_CONNECTOR`, workspace
   ID, channel IDs and user IDs in the service environment; mirror those IDs in
   the GTM binding. Names/wildcards are not supported. Use internal channels
   whose **entire membership** is permitted to see these aggregates; allowed
   askers are not the only people who can read replies. Shared-channel membership
   is not automatically checked. DMs need their conversation IDs explicitly listed.
6. Deploy this service on Eve's supported hosting using `npx eve deploy`, or run
   its built Node server behind HTTPS with durable Eve workflow storage configured.
   The latter is an operator deployment, not a new service wired into the OVH
   Compose file by this PR. Configure Slack's Eve webhook at `/eve/v1/slack`.
   GTM's separate signed endpoint is `/api/internal/data-agent/read`.
   The existing GTM `/api/` proxy must forward it unchanged.

Deploy one isolated Eve service/configuration per GTM binding. Never expose the
legacy `/mcp` with a shared token to this agent. Eve verifies Slack events;
admission runs on mentions, allowed DMs and interactive continuations, again on
every tool, and independently at GTM's bridge. HTTP session authentication always
denies access. The model has only `get_context`, `list_models`, `get_model` and
`query_metric`; default tools and root-agent dispatch are disabled. The framework
uses an explicit in-memory JustBash workspace with automatic package installation
off, and no model-visible filesystem/shell tools.

## What users can ask

- “What data is configured for this workspace?”
- “How many organic clicks did we get over the last 28 days?”
- “How many sessions and key events were recorded?”
- “Which AI mentions are confirmed, and what period does the sample cover?”
- “What should I do next to improve lead generation?”
- « Où en sont mes collectes et les alertes ? »

The bot reads definitions before measurements, replies in the originating thread,
and links to the authorized console workspace. Search/GA4 offer 7/28/90-day
windows, with source selection when several properties exist. AI visibility is
the latest imported dataset, with actual observation dates and reviewed vs
unreviewed mentions; no raw answer text is sent to the model. Operations expose
counts and the latest run, not alert content or drafts. Unsupported periods and
metrics must be clarified, not silently substituted. No raw SQL, arbitrary MCP
dispatch, data mutations, automatic reports, collection, publishing or billing.

## Costs, retention and boundaries

The GTM metric API and guided console add no paid dependency. Eve's model calls,
hosting and any selected managed services can incur costs; set provider budgets
before enabling real users. Session usage checks use total input/output usage
(100,000 / 8,000 tokens), not a currency cap; they run between calls and may
overshoot by one call. Sessions expire after one idle day. Configure Eve's
workflow/trace retention separately: expiry does not itself delete stored traces.
Authorized Slack questions and returned aggregate data are sent to the chosen
model provider. Do not enable a channel whose data may not be shared there.

GTM accepts 16 KiB signed bridge requests, rejects timestamps more than five
minutes away, and persists replay nonces for ten minutes across processes.
The adapter follows no redirects, bounds responses to 64 KiB and times out at
20 seconds. The GTM service admits at most two simultaneous Google reads per
tenant; adapter cancellation does not guarantee cancellation of upstream reads.
Google helpers can use the existing report cache; read time is not source freshness.
There is no automatic multi-tenant aggregation or identity mapping between Slack
and Keycloak: Slack delegation is an explicit operator-approved, revocable binding.
Personal console preferences are private to issuer + user + tenant; Slack uses
the separate approved profile in its binding, never a guessed user match.

## Live acceptance (requires installation)

1. In an allowed internal channel, an allowed user mentions the bot. Verify a
   threaded answer, source, period and the correct tenant's console link.
2. Repeat from a denied user and channel: no answer or data. Tampered/expired
   signed bridge requests and replayed nonces must fail.
3. Confirm source selection for multiple Google properties, empty observations,
   provider errors and old samples; confirm no fabricated zero or recent period.
4. Suspend the tenant or revoke the user/channel binding; subsequent tools must
   stop reading, including within an existing thread.
5. Ask for another customer, a publication, a collection or raw SQL. Verify that
   it is unavailable and that no external write is made.

Local tests use synthetic fixtures and a fake transport; they are not live Slack
or paid-model tests. [NOTICE](NOTICE.md) records the exact upstream revision.
