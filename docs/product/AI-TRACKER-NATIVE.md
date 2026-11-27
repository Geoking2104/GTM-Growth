# Tracker IA natif (module `ai-tracker`)

Mesure native de la visibilité réelle d'une marque dans les réponses des moteurs IA :
collecte, stockage, jugement local et exposition des réponses brutes. Sans scraper
tiers payant, sans juge externe payant, sans envoi de données vers un tiers.

> **Avertissement ToS.** La plupart des surfaces cibles (ChatGPT, Gemini,
> Perplexity, Bing) interdisent l'accès automatisé dans leurs conditions
> d'utilisation. Le système privilégie toujours l'API officielle quand elle
> existe. Le scraper (Playwright, désactivé par défaut) utilise uniquement les
> propres comptes du client, à cadence basse, et s'arrête proprement en cas de
> vérification ou de blocage. Aucun contournement de CAPTCHA, aucun plugin
> stealth, aucune rotation de proxy d'évasion. Chaque activation du scraper est
> une décision explicite de l'administrateur, avec les risques ToS affichés.

## Principes

1. **Preuve avant score** : un score sans réponse brute et sans passage jugé n'est pas affiché.
2. **Tendance, pas instantané** : 1 run par jour et par prompt et par moteur ; jamais de conclusion sur un seul run.
3. **Séparation stricte** : GEO readiness (déterministe) et visibilité mesurée (probabiliste) sont affichés séparément.
4. **Fail-closed** : tracker global arrêté et scrapers désactivés par tenant par défaut ; au moindre doute (tenant, quota, session, santé), on ne collecte pas.
5. **Jamais d'écrasement** : un re-jugement ajoute une ligne avec une nouvelle version de juge.
6. **Aucune donnée personnelle** dans les prompts (validation serveur : PII, secrets, injection refusés).

## Composants

| Fichier | Rôle |
| --- | --- |
| `src/ai-tracker/store.ts` | SQLite dédié : `ai_brands`, `ai_prompts`, `ai_runs`, `ai_mentions`, `ai_opportunities`, `ai_engine_state`, `ai_engine_settings` |
| `src/ai-tracker/providers.ts` | API officielles (OpenAI, Anthropic, Gemini, Mistral, Perplexity) : mode `api-approximation` |
| `src/ai-tracker/scrapers/` | Scraper Playwright natif, un fichier par moteur : mode `consumer-ui` |
| `src/ai-tracker/judge/` | Filtre déterministe + juge local Ollama (JSON strict, versionné) |
| `src/ai-tracker/metrics.ts` | Visibilité, part de voix, sentiment, position, citations, calculés à la lecture, séries par mode |
| `src/ai-tracker/opportunities.ts` | Règles lisibles ; jamais d'opportunité sur un seul run ; brouillon après validation humaine |
| `src/ai-tracker/worker.ts` | Runner idempotent (1 run/jour), pause automatique après 2 échecs consécutifs |
| `src/ai-tracker/scheduler.ts` | Process worker autonome (`pnpm ai-tracker:worker`) |
| `src/console/ai-tracker.ts` | Routes console `/api/console/ai-tracker/*` (onglet Tracking IA natif) |
| `src/tools/ai-tracker.ts` | Outils MCP `ai_tracker.*` (lecture seule par défaut) |

## Clés d'idempotence

- Prompt : `tenant_id + brand_id + prompt_hash`
- Run : `tenant_id + brand_id + prompt_id + engine + provider + run_date` (jour, horodatages précis dans des colonnes séparées)
- Mention : `run_id + company_id + judge_version`

## Sessions scraper

La session est un fichier `storageState` par tenant et moteur (`<tenant>/<moteur>.json`) dans
`AI_TRACKER_SCRAPER_SESSION_DIR` (hors repo, accès restreint au worker,
rotation manuelle). Aucun mot de passe dans le code, les journaux ou les
captures. Les anciens fichiers à la racine sont réservés au tenant explicitement identifié par `AI_TRACKER_TENANT_ID`. Les captures d'écran ne sont prises qu'en cas d'échec, rétention 48 h.

## Outils MCP

`ai_tracker.list_brands`, `ai_tracker.list_prompts`, `ai_tracker.get_visibility`,
`ai_tracker.get_citations`, `ai_tracker.get_fanout`, `ai_tracker.get_run`,
`ai_tracker.get_opportunities`, `ai_tracker.create_prompt` (écriture, exige
`AI_TRACKER_ENABLED` et `confirmed: true`).

Règles : aucun outil ne supprime de données ; aucun outil ne lance une collecte
payante sans flag explicite ; chaque appel est scopé par tenant via Keycloak et
journalisé.

## Démarrage

```bash
cd deploy/ai-tracker-native
cp .env.example .env   # renseigner AI_TRACKER_TENANT_ID
docker compose up -d
docker compose exec ollama ollama pull qwen2.5:14b
```

Volumes POC : 8 Go RAM minimum (16 Go recommandés pour Ollama + Playwright),
20 Go de disque pour 90 jours de réponses brutes.

## Activation par tenant et disclaimer GTM Growth

Les scrapers (`chatgpt`, `gemini`, `perplexity`, `bing-ai-mode`, `google-ai-mode`) sont **désactivés
par défaut** pour chaque tenant. Un administrateur du tenant peut activer un moteur
depuis la console (onglet « Moteurs ») **après avoir accepté le disclaimer GTM Growth**
(versionné, `GTM_TRACKER_DISCLAIMER_VERSION`). Le refus est fail-closed :

- le serveur refuse toute activation sans `disclaimerAccepted: true` et sans la version
  courante du disclaimer (`POST /ai-tracker/engine/activate`, admin uniquement) ;
- l'acceptation est journalisée (`accepted_by`, `disclaimer_accepted_at`, `disclaimer_version`) dans la table
  `ai_engine_settings` (par tenant et par moteur) ;
- le worker exige `AI_TRACKER_ENABLED=true` et une acceptation de la version courante pour ce tenant et ce moteur. Une nouvelle version exige un nouvel accord. Le réglage facultatif `AI_TRACKER_SCRAPER_<MOTEUR>_ENABLED=false` bloque le moteur sur ce déploiement, même après acceptation. La désactivation conserve la trace du dernier accord.

Les API officielles (mode `api-approximation`) et l'import manuel restent disponibles
sans acceptation du disclaimer : seules les surfaces scrapées en `consumer-ui` sont
concernées.

## Console front

Nouvelle section `#ai_tracker` dans la console (menu Impact > Visibilité), avec cinq
onglets : Board (visibilité, part de voix, sentiment, citations), Prompts, Runs
(avec pagination), Opportunities et Moteurs (état + activation sous disclaimer).
Module front : `site/console/ai-tracker.js` ; routes : `src/console/ai-tracker.ts`.
