#!/usr/bin/env bash
# GTM Growth — CI validation orchestrator
# Runs selected CLI steps and writes JSON reports under ./reports
set -euo pipefail

CLI="node dist/cli.js"
REPORT_DIR="reports"
mkdir -p "$REPORT_DIR"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
FAILED=0

run_step() {
  local name="$1"
  shift
  local outfile="$REPORT_DIR/${TS}_${name}.json"
  echo ""
  echo "════════════════════════════════════════"
  echo "▶ Step: $name"
  echo "════════════════════════════════════════"
  if "$@" >"$outfile" 2>"$REPORT_DIR/${TS}_${name}.err"; then
    echo "✓ $name OK → $outfile"
    # Print short summary if jq available
    if command -v jq >/dev/null 2>&1; then
      jq -r 'if .score then "  score=\(.score) grade=\(.grade // "?")" elif .healthy != null then "  healthy=\(.healthy)" elif .readyForCutover != null then "  readyForDual=\(.readyForDualTagging) readyForCutover=\(.readyForCutover)" elif .summary then "  summary keys ok" else "  done" end' "$outfile" 2>/dev/null || true
    fi
  else
    echo "✗ $name FAILED"
    cat "$REPORT_DIR/${TS}_${name}.err" || true
    FAILED=1
  fi
}

need_var() {
  local var="$1"
  if [ -z "${!
var:-}" ]; then
    echo "Skip: missing env $var"
    return 1
  fi
  return 0
}

echo "GTM Growth CI validate @ $TS"
echo "Flags: WEB=${RUN_WEB_AUDIT:-} SGTM=${RUN_SGTM_AUDIT:-} SECRETS=${RUN_SECRETS:-} DUAL=${RUN_DUAL:-} CUTOVER=${RUN_CUTOVER:-} HEALTH=${RUN_HEALTH:-}"

# ── Step 1: Web audit ─────────────────────────────────────────
if [ "${RUN_WEB_AUDIT:-true}" = "true" ]; then
  if need_var GTM_WEB_ACCOUNT_ID && need_var GTM_WEB_CONTAINER_ID; then
    EXTRA=()
    [ -n "${GA4_PROPERTY_ID:-}" ] && EXTRA+=(--property "$GA4_PROPERTY_ID")
    run_step audit_web $CLI audit-web \
      --account "$GTM_WEB_ACCOUNT_ID" \
      --container "$GTM_WEB_CONTAINER_ID" \
      "${EXTRA[@]+"${EXTRA[@]}"}"
  fi
fi

# ── Step 2: sGTM audit ────────────────────────────────────────
if [ "${RUN_SGTM_AUDIT:-true}" = "true" ]; then
  if need_var GTM_SERVER_ACCOUNT_ID && need_var GTM_SERVER_CONTAINER_ID; then
    run_step audit_sgtm $CLI audit-sgtm \
      --account "$GTM_SERVER_ACCOUNT_ID" \
      --container "$GTM_SERVER_CONTAINER_ID"
  fi
fi

# ── Step 3: Secrets ───────────────────────────────────────────
if [ "${RUN_SECRETS:-true}" = "true" ]; then
  if need_var GA4_PROPERTY_ID; then
    run_step verify_secrets $CLI verify-secrets --property "$GA4_PROPERTY_ID"
  fi
fi

# ── Step 4: Dual-tagging ──────────────────────────────────────
if [ "${RUN_DUAL:-true}" = "true" ]; then
  if need_var GTM_WEB_ACCOUNT_ID && need_var GTM_WEB_CONTAINER_ID \
    && need_var GTM_SERVER_ACCOUNT_ID && need_var GTM_SERVER_CONTAINER_ID \
    && need_var GA4_PROPERTY_ID; then
    run_step compare_dual $CLI compare-dual \
      --web-account "$GTM_WEB_ACCOUNT_ID" \
      --web-container "$GTM_WEB_CONTAINER_ID" \
      --server-account "$GTM_SERVER_ACCOUNT_ID" \
      --server-container "$GTM_SERVER_CONTAINER_ID" \
      --property "$GA4_PROPERTY_ID"
  fi
fi

# ── Step 5: Cutover checklist ─────────────────────────────────
if [ "${RUN_CUTOVER:-true}" = "true" ]; then
  if need_var GTM_WEB_ACCOUNT_ID && need_var GTM_WEB_CONTAINER_ID \
    && need_var GTM_SERVER_ACCOUNT_ID && need_var GTM_SERVER_CONTAINER_ID \
    && need_var GA4_PROPERTY_ID; then
    EXTRA=()
    [ -n "${SGTM_HEALTH_URL:-}" ] && EXTRA+=(--health-url "$SGTM_HEALTH_URL")
    run_step cutover_checklist $CLI cutover-checklist \
      --web-account "$GTM_WEB_ACCOUNT_ID" \
      --web-container "$GTM_WEB_CONTAINER_ID" \
      --server-account "$GTM_SERVER_ACCOUNT_ID" \
      --server-container "$GTM_SERVER_CONTAINER_ID" \
      --property "$GA4_PROPERTY_ID" \
      "${EXTRA[@]+"${EXTRA[@]}"}"
  fi
fi

# ── Step 6: Health ────────────────────────────────────────────
if [ "${RUN_HEALTH:-true}" = "true" ]; then
  if need_var SGTM_HEALTH_URL; then
    run_step health $CLI health --url "$SGTM_HEALTH_URL"
    if [ -n "${GA4_PROPERTY_ID:-}" ]; then
      run_step observability $CLI observability --url "$SGTM_HEALTH_URL" --property "$GA4_PROPERTY_ID"
    fi
  fi
fi

echo ""
if [ "$FAILED" -ne 0 ]; then
  echo "Validation finished with failures."
  exit 1
fi
echo "Validation finished successfully."
