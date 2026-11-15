# AI visibility provider setup

Claude, Mistral and Grok are available alongside OpenAI and the existing disabled
Gemini connector in **AI visibility**. These are explicitly requested API
observations, not measurements of consumer Claude, Le Chat, Grok or ChatGPT
sessions. Adding a connector does not configure a client key or run a paid query.

| Provider | Official API | Default model | Tenant key variable, example |
|---|---|---|---|
| Claude | Messages with `web_search_20250305`, at most three searches per prompt | `claude-sonnet-4-6` | `AI_VISIBILITY_CLAUDE_KEY_ACME` |
| Mistral | Conversations with `web_search`; `store: false` | `mistral-medium-latest` | `AI_VISIBILITY_MISTRAL_KEY_ACME` |
| Grok | xAI Responses with `web_search`; `store: false` | `grok-4.7` | `AI_VISIBILITY_GROK_KEY_ACME` |

## Connect and choose an API account

All five provider panels now use the same account connection flow. A missing key
never leaves an apparently active collection button doing nothing.

1. Click **Connect an account**. GTM Growth opens the provider's official portal
   in a new tab and displays the setup form. A visible link works if the popup is
   blocked. Sign in with the account you want and choose its project/workspace.
2. Create an API key there, return to GTM Growth, name the connection, and enter
   the key in the password field. OpenAI supports optional organization/project
   IDs; Claude supports an optional workspace ID. These IDs route API requests;
   account names are user-supplied labels, not verified provider identity.
3. Confirm storage and use by this workspace's administrators, then **Verify and
   save account**. A fixed, read-only models endpoint checks the credential. No
   generation runs. The field is cleared, the key is encrypted on the server,
   and the newly saved connection becomes selected without restarting the app.
4. Choose one of the saved accounts explicitly before collection (up to 20
   accounts per workspace). Enter the brand and 1–5 questions in normal fields;
   JSON remains available for advanced brand panels. Confirm possible charges.
   Changing accounts clears this confirmation. A successful models check does
   not establish credits, access to every model, or web-search permission.
5. **Test selected account** checks access without generation. **Disconnect**
   requires a second click and removes the credential from this workspace,
   preserving collected answers. It does not revoke the key at the provider;
   use that provider's portal to revoke it.

Opening a provider portal does not authorize GTM Growth or enumerate its signed-in
accounts. This release connects API keys, not browser sessions. It neither asks
for provider passwords nor imports ChatGPT conversations. OpenAI's current
[Sign in with ChatGPT documentation](https://developers.openai.com/siwc/quickstart)
distinguishes identity scopes from eligible Responses API scopes. The hosted
integration needs a registered/approved client; no such client configuration is
present in GTM Growth. OAuth is therefore explicitly shown as unavailable rather
than simulated with a consumer-login link. Registration is described in
[Request a client ID](https://developers.openai.com/siwc/request-client-id).

Gemini account setup and access checks are available; Google Search collection
still fails closed pending safe Search Suggestions display. The panel explains
this and opens the existing JSON import as recovery.

If API access is unavailable, **Import saved answers** opens the reviewed JSON
import. Set `source` to the true origin, supply an ISO observation date, the exact
prompt, answer and source URLs. Manual labels are declarations, not verified
provider provenance.

## Server-managed accounts and encrypted storage

Existing tenant-specific environment keys remain available as a clearly labelled
**Server-configured account**. Replace `ACME` with the tenant ID in uppercase,
replacing hyphens by underscores. There is no global key fallback; a supplied
unknown, deleted or foreign account ID fails without falling back to another key.
Optional `AI_VISIBILITY_<PROVIDER>_MODEL_<TENANT>` overrides still apply.
On OVH, Compose supplies `deploy/kayroslab-vps/.env.local`; changing those legacy
environment values requires recreating the application container.

Saved credentials use AES-256-GCM with a random nonce and authenticated tenant,
provider and account ID. Only metadata and a SHA-256 fingerprint are returned.
Account endpoints require a tenant administrator and return `Cache-Control:
no-store`. No API key goes into localStorage, URLs, response bodies or logs.
New accounts must pass the read-only check before being stored.

Operators can supply `AI_CONNECTIONS_MASTER_KEY` as exactly 64 hexadecimal
characters through secrets management. Without it, the server atomically creates
`accounts.key` (32 random bytes, mode 0600) in the existing AI visibility directory.
On OVH this is in the persistent `/data/ai-visibility` volume. Back up the key
securely alongside the encrypted database, with restricted access; a database-only
backup cannot decrypt accounts, while an attacker with both files can. Losing or
changing the key makes saved accounts unreadable. Do not replace it during ordinary
deployments. Rotation needs an explicit migration or reconnecting all accounts.

Official authentication references:

- [OpenAI API authentication](https://developers.openai.com/api/reference/overview)
- [Claude authentication](https://platform.claude.com/docs/en/manage-claude/authentication)
- [Mistral API keys](https://docs.mistral.ai/admin/identity-access/api-keys)
- [xAI API authentication](https://docs.x.ai/developers/rest-api-reference/inference)
- [Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key)

## Limits and errors

Each run makes at most five sequential provider HTTP requests, with 25 seconds
per request and 1,500 output tokens. There are no automatic retries or continuation
calls. Search subcalls can add charges; the request count is not a monetary cap.
Provider retention policies still apply; `store: false` is not a general promise
of zero retention. No live provider call is made while opening navigation or
checking configuration.

Successful answers are retained when another prompt fails. HTTP 401/403, 429 and
400/404 produce key/access, quota and model setup guidance respectively. Transport
exceptions and provider response bodies are not exposed. Incomplete Claude turns,
reported search failures, malformed citations and empty answers are excluded.
Claude block citations and Mistral reference chunks become clickable inline
markers; Grok Unicode citation offsets are converted to browser string offsets.
Only explicit search execution is labelled `+ web search`; enabling a tool alone
does not prove it ran. Uncited sources encountered during Grok search are not
presented as citations in the answer.

All status and run routes require tenant-administrator access and a selected
workspace. Keys are never returned. Storage uses the existing tenant-isolated
SQLite datasets. A per-process lock prevents concurrent Claude/Mistral/Grok runs for the same
workspace/provider; it is not a distributed spending control. Gemini remains
blocked pending safe Google Search Suggestions display.

## Validation and API references

Contract fixtures cover provider payloads, partial failures, inline citations,
invalid responses, no calls before consent, tenant separation and role checks.
FR/EN UI tests cover the five provider panels, account selection, encryption/isolation, missing-key guidance, manual import,
explicit collection, error recovery and newly saved dataset selection. Fixture
tests do not certify a real client's API credentials or provider billing access.

Official references consulted 13 November 2026:

- [Claude web search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool)
- [Mistral Conversations](https://docs.mistral.ai/api/endpoint/beta/conversations)
- [Mistral web search](https://docs.mistral.ai/studio/agents/agent-tools/websearch)
- [Grok web search](https://docs.x.ai/developers/tools/web-search)
- [Grok citations](https://docs.x.ai/developers/tools/citations)

## Résumé français

Claude, Mistral et Grok disposent chacun d'un panneau de collecte, d'un état de
configuration et d'une procédure d'activation. Plusieurs comptes API peuvent être ajoutés et choisis depuis la console ;
les clés sont chiffrées côté serveur. Sans clé, l'import JSON de réponses sauvegardées reste
disponible. Chaque lancement demande un accord explicite et accepte au plus cinq
questions ; les réponses valides alimentent les graphiques et la concurrence.
