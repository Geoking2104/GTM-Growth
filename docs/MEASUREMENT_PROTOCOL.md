# Measurement Protocol — Configuration GA4

## Tools GTM Growth

| Tool | Type | Description |
|------|------|-------------|
| `verify_ga4_secrets` | Read | Audit des secrets MP par stream |
| `list_data_streams` | Read | Streams + Measurement IDs |
| `list_measurement_protocol_secrets` | Read | Secrets (masqués par défaut) |
| `suggest_measurement_protocol_config` | Read | Config complète + exemples |
| `create_measurement_protocol_secret` | **Write** | Création de secret |
| `configure_measurement_protocol` | Hybrid | Verify + suggest + create optionnel |

## Scopes

- Lecture : `analytics.readonly`
- Création de secrets : `analytics.edit`

Désactiver les écritures : `GA4_WRITE_ENABLED=false`

## Modes d'envoi

### 1. Direct (Google)

```
POST https://www.google-analytics.com/mp/collect
  ?measurement_id=G-XXXX
  &api_secret=SECRET
```

Debug :

```
POST https://www.google-analytics.com/debug/mp/collect?...
```

### 2. Via sGTM (recommandé first-party)

```
POST https://tags.example.com/mp/collect
```

Prérequis sGTM :
- Client Measurement Protocol (activation path `/mp/collect`)
- Tag GA4 serveur déclenché

## Garde-fous écriture

1. `dryRun=true` — prévisualiser
2. `confirm=true` — exécuter
3. `secretValue` renvoyé à la création → stocker immédiatement (Secret Manager)

## Workflow recommandé

```text
1. verify_ga4_secrets
2. suggest_measurement_protocol_config
3. create_measurement_protocol_secret (dryRun puis confirm)
4. Test /debug/mp/collect
5. DebugView GA4
6. Brancher backend prod
```
