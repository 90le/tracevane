#!/usr/bin/env bash
set -u

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

FAIL=0
WARN=0

ok() { printf '  %bOK%b %s\n' "$GREEN" "$NC" "$*"; }
warn() { printf '  %bWARN%b %s\n' "$YELLOW" "$NC" "$*"; WARN=1; }
fail() { printf '  %bFAIL%b %s\n' "$RED" "$NC" "$*"; FAIL=1; }

codex_value() {
  awk -F '"' -v key="$1" '/^[[:space:]]*\[/{ exit } $0 ~ key"[[:space:]]*=" { print $2; exit }' "$HOME/.codex/config.toml" 2>/dev/null
}

codex_cpa_provider_value() {
  awk -F '"' -v key="$1" '
    /^[[:space:]]*\[model_providers\.cpa\][[:space:]]*$/ { inside=1; next }
    /^[[:space:]]*\[/ { inside=0 }
    inside && $0 ~ key"[[:space:]]*=" { print $2; exit }
  ' "$HOME/.codex/config.toml" 2>/dev/null
}

codex_cpa_base_url() {
  local value
  value="$(codex_cpa_provider_value base_url)"
  if [[ -n "$value" ]]; then
    printf '%s\n' "$value"
    return 0
  fi
  value="$(codex_value base_url)"
  if [[ -n "$value" ]]; then
    printf '%s\n' "$value"
    return 0
  fi
  codex_value openai_base_url
}

service_state() {
  local unit="$1"
  if systemctl --user list-unit-files "$unit" >/dev/null 2>&1; then
    if systemctl --user is-enabled --quiet "$unit" 2>/dev/null; then
      if systemctl --user is-active --quiet "$unit" 2>/dev/null; then
        ok "$unit enabled and active"
      else
        fail "$unit is enabled but not active"
      fi
    else
      fail "$unit exists but is not enabled"
    fi
  else
    fail "$unit is not installed"
  fi
}

http_ok() {
  local name="$1" url="$2" auth="${3:-}"
  if [[ -n "$auth" ]]; then
    curl -fsS --max-time 8 "$url" -H "Authorization: Bearer $auth" >/dev/null 2>&1
  else
    curl -fsS --max-time 8 "$url" >/dev/null 2>&1
  fi
  if [[ $? -eq 0 ]]; then
    ok "$name responds: $url"
  else
    fail "$name does not respond: $url"
  fi
}

echo "=== Codex stack health check ==="
echo

echo "--- Prerequisites ---"
command -v node >/dev/null 2>&1 && ok "node $(node --version)" || fail "node not found"
if command -v node >/dev/null 2>&1; then
  node -e 'process.exit(Number(process.versions.node.split(".")[0])>=20?0:1)' \
    && ok "Node.js major version is >= 20" \
    || fail "Node.js must be 20+"
fi
command -v npm >/dev/null 2>&1 && ok "npm $(npm --version)" || fail "npm not found"
command -v codex >/dev/null 2>&1 && ok "codex $(codex --version 2>/dev/null || echo installed)" || fail "codex not found"
command -v omx >/dev/null 2>&1 && ok "omx $(omx --version 2>/dev/null || echo installed)" || warn "omx not found"
command -v cli-proxy-api >/dev/null 2>&1 || [[ -x "$HOME/.local/bin/cli-proxy-api" ]] \
  && ok "cli-proxy-api installed" \
  || fail "cli-proxy-api not found"
command -v cc-connect >/dev/null 2>&1 && ok "cc-connect $(cc-connect --version 2>/dev/null || echo installed)" || warn "cc-connect not found; skip this if you intentionally installed Codex/CPA/Compact only"

echo
echo "--- Config files ---"
[[ -f "$HOME/.openclaw/openclaw.json" ]] && ok "~/.openclaw/openclaw.json exists" || fail "~/.openclaw/openclaw.json missing"
[[ -f "$HOME/.cli-proxy-api/config.yaml" ]] && ok "~/.cli-proxy-api/config.yaml exists" || fail "~/.cli-proxy-api/config.yaml missing"
[[ -f "$HOME/.codex/config.toml" ]] && ok "~/.codex/config.toml exists" || fail "~/.codex/config.toml missing"
[[ -f "$HOME/.local/bin/cpa-compact-proxy.mjs" ]] && ok "Compact Proxy script exists" || fail "Compact Proxy script missing"

if [[ -f "$HOME/.codex/config.toml" ]]; then
  BASE_URL="$(codex_cpa_base_url)"
  MODEL_PROVIDER="$(codex_value model_provider)"
  if [[ "$MODEL_PROVIDER" == "cpa" ]]; then
    [[ "$BASE_URL" == http://127.0.0.1:*/v1 ]] && ok "Codex active provider points to local Compact Proxy" || fail "Codex model_provider=cpa but base_url is not local Compact Proxy"
  else
    warn "Codex active provider is not CPA; this is expected until the CPA smoke gate passes"
  fi
  grep -Eq 'responses_websockets[[:space:]]*=[[:space:]]*false' "$HOME/.codex/config.toml" && ok "Codex Responses WebSocket disabled for CPA/SSE stability" || warn "responses_websockets is not disabled; Codex may reconnect before falling back to HTTPS/SSE"
  grep -Eq 'responses_websockets_v2[[:space:]]*=[[:space:]]*false' "$HOME/.codex/config.toml" && ok "Codex Responses WebSocket v2 disabled for CPA/SSE stability" || warn "responses_websockets_v2 is not disabled; Codex may reconnect before falling back to HTTPS/SSE"
fi
[[ -f "$HOME/.codex/auth.json" ]] && ok "~/.codex/auth.json exists" || fail "~/.codex/auth.json missing"
if [[ -f "$HOME/.cli-proxy-api/config.yaml" ]]; then
  grep -q 'remote-management:' "$HOME/.cli-proxy-api/config.yaml" && ok "CPA remote-management configured" || fail "CPA remote-management missing"
  grep -q 'disable-control-panel: false' "$HOME/.cli-proxy-api/config.yaml" && ok "CPA management panel enabled" || warn "CPA management panel disabled"
fi

CPA_PORT="$(awk -F: '/^port:/ { gsub(/[^0-9]/, "", $2); print $2; exit }' "$HOME/.cli-proxy-api/config.yaml" 2>/dev/null)"
[[ -n "$CPA_PORT" ]] || CPA_PORT=8317
COMPACT_PORT="$(codex_cpa_base_url | sed -nE 's#.*127\.0\.0\.1:([0-9]+)/.*#\1#p' | head -1)"
[[ -n "$COMPACT_PORT" ]] || COMPACT_PORT=18796
CPA_KEY="$(codex_value experimental_bearer_token)"
[[ -n "$CPA_KEY" ]] || CPA_KEY="studio"

echo
echo "--- Services ---"
service_state cli-proxy-api.service
service_state cpa-compact-proxy.service
service_state codex-stack-watchdog.timer

if command -v loginctl >/dev/null 2>&1; then
  loginctl show-user "$USER" -p Linger 2>/dev/null | grep -q '=yes' \
    && ok "systemd linger enabled for $USER" \
    || warn "systemd linger is not enabled. Run: loginctl enable-linger $USER"
fi

echo
echo "--- Local APIs ---"
http_ok "CPA health" "http://127.0.0.1:${CPA_PORT}/healthz"
http_ok "CPA models" "http://127.0.0.1:${CPA_PORT}/v1/models" "$CPA_KEY"
http_ok "Compact Proxy health" "http://127.0.0.1:${COMPACT_PORT}/healthz"

echo
echo "--- cc-connect ---"
if [[ -f "$HOME/.cc-connect/config.toml" ]]; then
  ok "~/.cc-connect/config.toml exists"
  if grep -q 'projects\.platforms' "$HOME/.cc-connect/config.toml"; then
    ok "cc-connect has at least one platform binding"
    if systemctl --user list-unit-files cc-connect.service >/dev/null 2>&1; then
      service_state cc-connect.service
      [[ -S "$HOME/.cc-connect/run/api.sock" ]] && ok "cc-connect API socket exists" || fail "cc-connect API socket missing"
    else
      fail "cc-connect.service is not installed. Run finish-cc-connect-setup.sh after binding."
    fi
  else
    warn "cc-connect has no platform binding yet. Run Feishu/Weixin setup, then finish-cc-connect-setup.sh."
  fi
else
  warn "~/.cc-connect/config.toml missing"
fi

echo
if [[ $FAIL -eq 0 ]]; then
  if [[ $WARN -eq 0 ]]; then
    printf '%bAll required checks passed.%b\n' "$GREEN" "$NC"
  else
    printf '%bRequired checks passed with warnings.%b\n' "$YELLOW" "$NC"
  fi
else
  printf '%bHealth check failed. See FAIL lines above.%b\n' "$RED" "$NC"
fi

exit "$FAIL"
