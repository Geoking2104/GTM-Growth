# CI/CD — Validation Google Growth

## Workflows GitHub Actions

| Workflow | Fichier | Déclencheur | Rôle |
|----------|---------|-------------|------|
| **CI** | `.github/workflows/ci.yml` | push / PR | `npm ci` · typecheck · lint · test · build · smoke CLI (dont GEO) |
| **Validate** | `.github/workflows/validate.yml` | manual + schedule optionnel | Pipeline live audit → cutover → health |

## CI (toujours on)

Aucune credential Google requise. Vérifie que le projet compile, que lint et tests passent, et que les générateurs GEO répondent hors ligne (`scripts/smoke-geo.mjs`).

## Validate (live)

### Secrets & variables à configurer

**Secret repository**

| Name | Description |
|------|-------------|
| `GOOGLE_CREDENTIALS_JSON` | JSON complet du Service Account |

**Variables repository** (Settings → Variables)

| Name | Exemple |
|------|---------|
| `GA4_PROPERTY_ID` | `123456789` |
| `GTM_WEB_ACCOUNT_ID` | `111` |
| `GTM_WEB_CONTAINER_ID` | `222` |
| `GTM_SERVER_ACCOUNT_ID` | `111` |
| `GTM_SERVER_CONTAINER_ID` | `999` |
| `SGTM_HEALTH_URL` | `https://tags.example.com/healthy` |
| `ENABLE_SCHEDULED_VALIDATE` | `true` pour activer le cron hebdo |

### Lancer manuellement

GitHub → **Actions** → **Validate (GA4 / GTM / sGTM)** → **Run workflow**

Toggles : web audit, sGTM, secrets, dual-tagging, cutover, health.

### Écritures désactivées

```text
GA4_WRITE_ENABLED=false
GTM_WRITE_ENABLED=false
```

Aucune création de secret/tag en CI.

### Artifacts

Les JSON de chaque étape sont uploadés dans `validation-reports` (14 jours).

## Orchestrateur local

```bash
export GOOGLE_CREDENTIALS_JSON="$(cat service-account.json)"
export GA4_PROPERTY_ID=123456789
export GTM_WEB_ACCOUNT_ID=111
export GTM_WEB_CONTAINER_ID=222
export GTM_SERVER_ACCOUNT_ID=111
export GTM_SERVER_CONTAINER_ID=999
export SGTM_HEALTH_URL=https://tags.example.com/healthy

npm run build
bash scripts/ci-validate.sh
```

## Critères d’échec CI Validate

Le job échoue si **une étape sélectionnée** retourne un exit code ≠ 0 (erreur API, credentials, etc.).

Les scores bas (audit 40/100) **ne font pas échouer** le script par défaut — ils sont dans les reports JSON pour revue. Pour un gate strict cutover, parser `readyForCutover` dans une étape suivante.

### Gate strict optionnel (exemple)

```bash
jq -e '.readyForCutover == true' reports/*_cutover_checklist.json
```
