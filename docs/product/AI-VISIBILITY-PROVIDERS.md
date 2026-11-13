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

## Activate a workspace

1. Obtain a provider API key for the client's account, model permissions, web
   search access and sufficient credits. A consumer chat subscription is not a
   configured API key in GTM Growth.
2. The server operator supplies the tenant-specific variable through deployment
   secrets. Replace `ACME` with the tenant ID in uppercase, replacing hyphens by
   underscores. No global key fallback is used. On OVH the existing
   `deploy/kayroslab-vps/.env.local` is passed to the application by Compose;
   keep values out of Git, browser forms, logs and tickets. Recreate the
   application container after changing its environment.
3. Optionally set `AI_VISIBILITY_<PROVIDER>_MODEL_<TENANT>` to a model accessible
   to that account which supports the same API and search tool. The UI reports
   the selected model. Do not configure a custom endpoint.
4. Open AI visibility as a workspace administrator. Connection status loads
   automatically. **Configured** means a key exists, not that a paid call has
   been tested. Use **Check connection** after operator configuration.
5. Enter the brand panel and one to five unique questions as JSON, acknowledge
   sending questions and possible charges, then explicitly run collection.
   Saved results become the selected dataset immediately and invalidate the
   overview/competition read cache. Review provisional mentions before use.

If a key is unavailable, **Import saved answers** opens the existing reviewed
JSON import. Set `source` to the true origin (for example `Claude manual import`)
and supply an ISO observation date, exact prompt, answer and any source URLs.
Manual source labels remain declarations, not verified provider provenance.

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
SQLite datasets. A per-process lock prevents concurrent runs for the same
workspace/provider; it is not a distributed spending control. Gemini remains
blocked pending safe Google Search Suggestions display.

## Validation and API references

Contract fixtures cover provider payloads, partial failures, inline citations,
invalid responses, no calls before consent, tenant separation and role checks.
FR/EN UI tests cover the five provider panels, missing-key guidance, manual import,
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
configuration et d'une procédure d'activation. Une clé API par client doit être
configurée côté serveur. Sans clé, l'import JSON de réponses sauvegardées reste
disponible. Chaque lancement demande un accord explicite et accepte au plus cinq
questions ; les réponses valides alimentent les graphiques et la concurrence.
