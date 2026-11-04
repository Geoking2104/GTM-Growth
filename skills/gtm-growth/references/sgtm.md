# Server-side tracking playbook

Product collection path

```
Browser → GTM Web (server_container_url) → sGTM (first-party)
                                           ├─ GA4 Client / MP Client
                                           └─ GA4 Tag → GA4 property
Backend ─────────────────────────────────→ sGTM /mp/collect → GA4
```

Do not recommend sending production hits only to `www.google-analytics.com/mp/collect` when sGTM exists. Prefer first-party `https://tags.example.com/mp/collect`.

## Ordered implementation

1. Web GA4/GTM stable — `audit_ga4_setup_v2`, `validate_ecommerce_events`
2. Deploy sGTM on a first-party host (`tags.example.com`)
3. `audit_sgtm_setup` — GA4 client + GA4 tag + optional MP client
4. `verify_ga4_secrets` then `suggest_measurement_protocol_config` (`mode=both` if hybrid)
5. Optional create secret — dry-run then confirm; store secretValue offline
6. `compare_dual_tagging` — match rates, missing events, migration risks
7. `cutover_checklist` until `readyForDualTagging` / `readyForCutover`
8. Enable `server_container_url` progressively on the web container
9. Watch 48–72h with `check_sgtm_health`, `sgtm_observability_snapshot`, `analyze_ecommerce_data`
10. Turn off client-side direct GA4 hits only after parity is proven

## How to read readiness

- `readyForDualTagging` false — stay on web-only; fix audit issues first
- `readyForDualTagging` true / `readyForCutover` false — run both paths, compare events and revenue
- both true + healthy probe + no ecommerce quality blockers — plan cutover

Call out

- Missing GA4 Configuration tag or measurement id mismatch
- purchase without `value` / `currency` / `transaction_id` / `items`
- MP client present but no secret, or secret on the wrong stream
- `/healthy` failing or high latency
- events in GTM but absent in GA4 (or the reverse)

Repo depth — `docs/SERVER_SIDE_TRACKING_ARCHITECTURE.md`, `docs/MEASUREMENT_PROTOCOL.md`, `docs/GTM_INTEGRATION.md`, `docs/PHASE3_WRITE.md`.
