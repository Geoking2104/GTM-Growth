# Social Toolkit operations (OVH / optional ZenML worker)

This adds an optional worker to the existing GTM Growth deployment. The main Node image serves the Social console/API without this worker; external publication, discovery and refresh intents stay queued until a scoped worker is configured. Installing source does not connect a social account or publish a post.

Read the [reviewed specification](../../docs/product/SOCIAL-TOOLKIT-SPEC-REVIEW.md) before enabling a platform. Node-RED/GBP is unchanged. No Kubernetes, cloud ZenML account, paid LLM, Mautic, Twenty or BI service is required by this implementation.

## 1. Client-specific provider configuration

Deploy and secure your own licensed Postiz service separately, or use an already authorised instance. Connect each social account in Postiz using that platform's required app permissions. Test the required media/provider settings against that instance's API. The current GTM adapter does not provision Postiz, upload media or run account OAuth.

Inside the existing host-only secret directory, create `social-connections/<tenant-id>.json` (directory 0700, file 0600):

```json
{
  "postiz": {
    "baseUrl": "https://postiz.example.com/api/public/v1",
    "apiKey": "REPLACE_WITH_SERVER_ONLY_POSTIZ_API_KEY",
    "writeEnabled": false,
    "accounts": [
      { "id": "EXACT_POSTIZ_INTEGRATION_ID", "platform": "linkedin", "settings": {} }
    ]
  },
  "autoRefresh": false,
  "requestsPerHour": 60
}
```

Optional `youtubeKey` is a server-only official YouTube API key. It is not needed for manual sourced creator profiles. The account allowlist is mandatory: accounts returned by Postiz but absent from this list are not exposed or usable. Use a distinct Postiz organisation/API credential per client where possible. Never configure an account for two clients without an explicit, reviewed ownership decision.

`settings` contains reviewed provider-specific defaults (e.g. YouTube title/category or TikTok posting/privacy settings); `__type` is set from the exact allowlisted platform. Instagram, TikTok, YouTube and Pinterest require media in the draft policy. Media references require an existing Postiz asset ID, an HTTPS path on an authorised client/CDN domain, alt text, declared rights and proof. Configure CDN domains in the client's existing domain scope. Platform-specific API/app reviews and content requirements still apply; this is not a claim that every platform has passed a live pilot.

Add to `deploy/kayroslab-vps/.env.local` on the server:

```dotenv
SOCIAL_CONNECTIONS_DIR=/secrets/social-connections
SOCIAL_WORKERS_FILE=/secrets/social-workers.json
SOCIAL_WORKER_TOKEN_PATH=/opt/gtm-growth/.secrets/social-worker-acme.token
```

The existing production Compose mounts `/opt/gtm-growth/.secrets` read-only at `/secrets`; no public secret endpoint is added. The backend already persists state in `/data`; `SOCIAL_PATH` defaults beside the tenant registry. A dedicated path can be configured before first use.

## 2. Scoped worker credential

Generate a random token locally on the server with a secure random generator (at least 32 URL-safe characters), store it in the file referenced by `SOCIAL_WORKER_TOKEN_PATH`, then compute its SHA-256 hash. Do not print the token in workflow logs, commit it or put it in a command argument. Make the Docker secret readable by worker UID 10001 while keeping host access restricted (e.g. root:10001, mode 0440).

`social-workers.json` maps token hashes to exactly one existing active tenant and permitted pipelines:

```json
{
  "REPLACE_WITH_64_CHARACTER_LOWERCASE_SHA256": {
    "tenant": "acme",
    "pipelines": [
      "social_content_intake", "social_publish_prepare", "social_publish_execute",
      "social_analytics_daily", "influencer_discovery", "influencer_scoring_vetting",
      "influencer_outreach", "social_account_sync"
    ]
  }
}
```

Use separate workers, credentials and runtime volumes for separate clients. The supplied Compose overlay represents **one** client worker. To add another, give it a distinct service name, secret and volume on the existing private network; never reuse the artifact/configuration volume across clients. Token rotation is performed by replacing the hash mapping and mounted token, then restarting that worker. Removing the mapping revokes future worker requests. Tenant suspension blocks claims and executions.

## 3. Start the optional runtime

From the existing production checkout's `deploy/kayroslab-vps` directory, after the normal approved core deployment:

```bash
docker compose --env-file .env.local -f docker-compose.prod.yml -f ../social/compose.yaml --profile social up -d --build social-zenml
```

Recreate the `gtm-growth` service through the normal release process if its environment variables were changed. The overlay does not replace the base file, rename existing services or publish a new port. Its build path is resolved relative to the first Compose file. Keep using the same Compose project as the existing deployment.

The worker uses Python 3.11 with `zenml[local]==0.96.2`, one intent at a time, a persistent local runtime and a CPU/memory/PID limit. There is no public ZenML dashboard. Do not expose its local database/artifact store. The worker polls every 15 seconds; publication is best-effort at or after the approved timestamp, not a precise delivery SLA.

With `autoRefresh: true`, polling also enqueues hourly account sync and daily analytics for active campaigns. With it off, console refresh buttons enqueue those jobs. One publication's approval expiry is independent of ZenML execution state; no long-running `wait()` process is used.

## 4. Qualify and enable a client

1. In **Social → Accounts**, request an account check and verify the exact integration names/IDs and actual active status.
2. Create a campaign for an authorised product URL. Select the intended authorised GA4 property when the client has several. Activate the campaign.
3. Prepare a draft with a permitted account, reviewed media and a time in the coming seven days. Check product context and UTM policy. Saving generates account-specific `utm_content`.
4. A different tenant administrator reviews exact text, account, time and media, then approves with a comment. The author cannot approve their own request.
5. Only after a test-account pilot is ready, set that client's `postiz.writeEnabled` to true. If destination/accounts/settings changed, save a revised draft and obtain a fresh approval. API-key rotation alone does not invalidate content approval.
6. The reviewer explicitly confirms the approved schedule in Content. The worker dispatches only when due, and only after current scope, campaign, provider and approval checks.
7. `ACCEPTED` means Postiz accepted a job. `PUBLISHED` requires exact account/post readback and a public HTTPS URL. Inspect the network itself during the pilot; API readback is not proof of audience delivery.
8. Check a real attributed visit and GA4 key event separately. Provider data and GA4 may be delayed or unavailable. Imports remain labelled declared.

## Recovery and limits

- Never delete a dispatch marker or replay a POST after an `UNCERTAIN` result. Use the readback button where an external ID was received; otherwise investigate the provider dashboard and retain the uncertain state until the outcome is established. Automated forced reconciliation and retry of an unknown receipt are deliberately absent.
- Pausing a campaign invalidates pending/approved publication/outreach reviews and revokes queued publication work. It cannot recall an already-dispatched external post. Check the provider for in-flight work.
- An expired worker lease on a publication is terminal/uncertain. A read-only interrupted lease can be requeued up to three attempts. Repeated provider failure is visible in Runs; queue another safe refresh after fixing configuration. There is no automatic external publication retry.
- API response sizes and per-client hourly request limits are bounded; a quota failure must not produce fake zeroes. Provider analytics reads cover up to five least-recently-read targets per run, over 30 days, with unsupported metrics retained as unavailable. GA4 reads 90 days/up to 10,000 rows.
- SQLite guards tenant mutations with immediate transactions. Current per-client limits include 10,000 posts, 10,000 creators, 100,000 daily observations, 50,000 jobs/receipts and 100,000 audit events. Monitor database growth and export/archive under an operator retention process before reaching limits. No production retention purge is enabled automatically.
- Back up the Social database using SQLite's backup facility or a coordinated snapshot, plus the separate per-client ZenML volume. Encrypt and restrict backups. Business content and public creator profiles remain client data even though provider tokens are excluded.
- Turning `writeEnabled` off blocks future dispatches. Stop only the `social-zenml` service to stop processing; this does not stop the existing console, SEO or GBP services.

## API, MCP and CLI

Console routes use the existing OIDC bearer token and `X-Tenant`, under `/api/console/social/`. Mutation bodies are `{ "key": "unique-idempotency-key", "input": ... }`. Reusing a key with a different operation/input is rejected. The route list and schemas are in `src/console/social.ts` and `src/social/model.ts`.

`POST /api/mcp/social` is a separate tenant-aware MCP endpoint. It requires explicit `X-Tenant`; it exposes only read/draft tools. A dedicated AI identity defaults to viewer; a human administrator may explicitly grant it the narrower Social contributor/strategist role in the selected client. It cannot approve or execute through MCP. Do not use the legacy shared MCP for tenant Social data.

For a human CLI session, supply the same OIDC token in `GTM_OIDC_TOKEN`, the exact tenant in `GTM_TENANT` and the HTTPS console API base in `GTM_CONSOLE_URL`. Then use `integrations/social-zenml/cli.py state` or a supported command plus JSON request file. The helper does not log in, persist a token or weaken server authorisation. Keep any exported client data in an appropriately protected location.

## Verification

```bash
pnpm run typecheck
pnpm test
pnpm run build
pnpm run site:check
python -m venv /tmp/gtm-social-qa
/tmp/gtm-social-qa/bin/pip install -r integrations/social-zenml/requirements.txt
/tmp/gtm-social-qa/bin/python integrations/social-zenml/smoke.py
node scripts/qa-social.mjs
```

The browser command needs the pinned Playwright Chromium runtime. CI installs it, exercises EN/FR at desktop/mobile widths and retains labelled fixture screenshots. The ZenML smoke uses a local fixture server, makes no social publication and verifies that worker tokens/leases are absent from persisted runtime files. The production website must still be checked after the approved OVH release.
