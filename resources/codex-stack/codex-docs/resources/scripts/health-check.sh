#!/bin/bash
# =============================================================================
# Codex Studio Gateway health check
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok() { echo -e "  ${GREEN}OK${NC} $1"; }
fail() { echo -e "  ${RED}FAIL${NC} $1"; FAIL=1; }
warn() { echo -e "  ${YELLOW}WARN${NC} $1"; WARN=1; }
FAIL=0
WARN=0

CODEX_CONFIG="$HOME/.codex/config.toml"
GATEWAY_SERVICE="openclaw-studio-model-gateway.service"

codex_top_value() {
  awk -F '"' -v key="$1" '/^[[:space:]]*\[/{ exit } $0 ~ "^[[:space:]]*" key "[[:space:]]*=" { print $2; exit }' "$CODEX_CONFIG" 2>/dev/null
}

codex_provider_value() {
  local provider="$1"
  local key="$2"
  awk -F '"' -v section="model_providers\\.${provider}" -v key="$key" '
    $0 ~ "^[[:space:]]*\\[" section "\\][[:space:]]*$" { inside=1; next }
    /^[[:space:]]*\[/ { inside=0 }
    inside && $0 ~ "^[[:space:]]*" key "[[:space:]]*=" { print $2; exit }
  ' "$CODEX_CONFIG" 2>/dev/null
}

strip_v1_suffix() {
  local value="${1%/}"
  printf '%s\n' "${value%/v1}"
}

is_service_active() {
  systemctl --user is-active --quiet "$1" >/dev/null 2>&1
}

echo "=== Studio Gateway health check ==="
echo ""

echo "--- Runtime prerequisites ---"
if command -v node >/dev/null 2>&1; then
  ok "Node.js $(node --version)"
else
  fail "Node.js 未安装"
fi

if command -v codex >/dev/null 2>&1; then
  ok "Codex CLI $(codex --version 2>/dev/null || echo installed)"
else
  warn "Codex CLI 未安装"
fi

if command -v omx >/dev/null 2>&1; then
  ok "oh-my-codex $(omx --version 2>/dev/null || echo installed)"
else
  warn "omx 命令未找到"
fi

echo "--- Codex config ---"
if [[ -f "$CODEX_CONFIG" ]]; then
  ok "config.toml 存在"
  MODEL="$(codex_top_value model)"
  PROVIDER="$(codex_top_value model_provider)"
  STUDIO_BASE="$(codex_provider_value studio base_url)"
  [[ -n "$MODEL" ]] && ok "默认模型: $MODEL" || warn "默认模型未设置"
  if [[ -n "$STUDIO_BASE" ]]; then
    ok "studio provider: $STUDIO_BASE"
  else
    fail "缺少 [model_providers.studio]"
  fi
  if grep -Eq 'responses_websockets[[:space:]]*=[[:space:]]*false' "$CODEX_CONFIG"; then
    ok "Responses WebSocket 已关闭"
  else
    warn "responses_websockets 未关闭，Codex 可能先尝试 WebSocket"
  fi
  if [[ "$PROVIDER" == "studio" ]]; then
    ok "Codex 当前已接管到 studio provider"
  else
    warn "Codex 当前 provider: ${PROVIDER:-official/default}；smoke gate 通过前保持未接管是预期状态"
  fi
else
  fail "config.toml 不存在"
  STUDIO_BASE=""
fi

GATEWAY_BASE="${MODEL_GATEWAY_BASE_URL:-}"
if [[ -z "$GATEWAY_BASE" && -n "${STUDIO_BASE:-}" ]]; then
  GATEWAY_BASE="$(strip_v1_suffix "$STUDIO_BASE")"
fi
GATEWAY_BASE="${GATEWAY_BASE:-http://127.0.0.1:18796}"
GATEWAY_BASE="${GATEWAY_BASE%/}"

echo "--- Studio Gateway daemon ---"
if is_service_active "$GATEWAY_SERVICE"; then
  ok "$GATEWAY_SERVICE 运行中"
else
  warn "$GATEWAY_SERVICE 未运行；Studio API 应负责启动/恢复"
fi

if command -v curl >/dev/null 2>&1; then
  STATUS_BODY="$(curl -fsS --max-time 5 "${GATEWAY_BASE}/gateway/status" 2>/dev/null || true)"
  if [[ -n "$STATUS_BODY" ]]; then
    ok "gateway status: ${GATEWAY_BASE}/gateway/status"
  else
    fail "无法访问 ${GATEWAY_BASE}/gateway/status"
  fi
  MODELS_BODY="$(curl -fsS --max-time 8 "${GATEWAY_BASE}/v1/models" 2>/dev/null | head -c 200 || true)"
  if [[ -n "$MODELS_BODY" ]]; then
    ok "OpenAI-compatible /v1/models 可访问"
  else
    warn "/v1/models 暂不可访问；请检查 active provider 和 secret"
  fi
else
  warn "curl 未安装，跳过 HTTP 连通性"
fi

echo "--- Optional cc-connect ---"
if [[ -x "$HOME/.local/bin/cc-connect" ]] || command -v cc-connect >/dev/null 2>&1; then
  ok "cc-connect 二进制已安装"
  if is_service_active "cc-connect.service"; then
    ok "cc-connect.service 运行中"
  else
    warn "cc-connect.service 未运行；它只是可选 IM bridge"
  fi
else
  warn "cc-connect 未安装（可选 IM bridge）"
fi

echo "--- Legacy relay conflicts ---"
legacy_active=false
for unit in cli-proxy-api.service cpa-compact-proxy.service; do
  if is_service_active "$unit"; then
    warn "检测到旧 relay unit 正在运行: $unit，可能占用 Studio Gateway 端口"
    legacy_active=true
  fi
done
if [[ "$legacy_active" == false ]]; then
  ok "未检测到旧 relay unit 运行"
fi

echo ""
if [[ $FAIL -eq 0 ]]; then
  if [[ $WARN -eq 0 ]]; then
    echo -e "${GREEN}=== All checks passed ===${NC}"
  else
    echo -e "${YELLOW}=== Critical checks passed with warnings ===${NC}"
  fi
else
  echo -e "${RED}=== Problems found ===${NC}"
fi

exit "$FAIL"
