# CI/CD — validation and release workflows

[Documentation hub](README.md) · [Operations](technical/OPERATIONS.md) · [Release evidence](journey/CAPABILITIES.md#release-evidence)

Workflow definitions are authoritative. A passing source check does not imply
production deployment or live provider acceptance.

| Workflow | Trigger | Scope |
| --- | --- | --- |
| [CI](../.github/workflows/ci.yml) | Push / PR targeting main or master | Documentation links, typecheck, lint, Vitest, build, CLI/site smoke, production image, FR/EN browser QA, Node-RED and real ZenML smoke |
| [Data agent](../.github/workflows/data-agent.yml) | Matching Eve package/workflow paths on PR or push to main | Separate Node 26 package typecheck, tests and build |
| [OVH release](../.github/workflows/deploy-kayroslab-vps.yml) | Manual on main, `DEPLOY`, production environment | Pinned SSH host verification, source update and primary Compose deployment |
| [GitHub Pages](../.github/workflows/pages.yml) | Manual on main, `DEPLOY`, github-pages environment | Alternative static-site publication |
| [Cloudflare Worker](../.github/workflows/worker.yml) | Manual on main, owner guard, `DEPLOY`, production environment | Alternative public API; missing Cloudflare secrets skip deployment steps |
| [Validate](../.github/workflows/validate.yml) | Manual, or weekly when `ENABLE_SCHEDULED_VALIDATE=true` | Selected live Google validation steps with configured credentials |

A documentation push/PR runs validation; it does not dispatch OVH, Pages or Worker
publication. Optional source activation has its own acceptance criteria.

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
