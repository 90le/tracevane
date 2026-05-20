#!/bin/bash
# =============================================================================
# 全环境健康检查脚本
# 检查 Codex + CPA + Compact Proxy + cc-connect 运行状态
# =============================================================================
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok() { echo -e "  ${GREEN}✅ $1${NC}"; }
fail() { echo -e "  ${RED}❌ $1${NC}"; FAIL=1; }
warn() { echo -e "  ${YELLOW}⚠️  $1${NC}"; }
FAIL=0

echo "=== 环境健康检查 ==="
echo ""

# ── Node.js ──
echo "--- Node.js ---"
if command -v node &>/dev/null; then
  ok "Node.js $(node --version)"
else
  fail "Node.js 未安装"
fi

# ── Codex CLI ──
echo "--- Codex CLI ---"
if command -v codex &>/dev/null; then
  ok "Codex CLI $(codex --version 2>/dev/null || echo 'installed')"
else
  fail "Codex CLI 未安装"
fi

# ── oh-my-codex ──
echo "--- oh-my-codex ---"
if command -v omx &>/dev/null; then
  ok "OMX $(omx --version 2>/dev/null || echo 'installed')"
else
  warn "omx 命令未找到（OMX 可能未在 PATH 中）"
fi

# ── CPA ──
echo "--- CPA (cli-proxy-api) ---"
if [[ -x "$HOME/.local/bin/cli-proxy-api" ]] || command -v cli-proxy-api &>/dev/null; then
  ok "CPA 已安装"
  CPA_PORT=$(awk -F: '/^port:/ { gsub(/[^0-9]/, "", $2); print $2; exit }' "$HOME/.cli-proxy-api/config.yaml" 2>/dev/null)
  CPA_PORT=${CPA_PORT:-18795}
  if ss -tlnp 2>/dev/null | grep -q ":${CPA_PORT}"; then
    ok "CPA 监听在 127.0.0.1:${CPA_PORT}"
  else
    fail "CPA 未在监听 (port ${CPA_PORT}) — 启动: systemctl --user start cli-proxy-api.service"
  fi
else
  fail "CPA 未安装 — 检查 ~/.local/bin/cli-proxy-api"
fi

# ── Compact Proxy ──
echo "--- Compact Proxy v5 ---"
if [[ -f "$HOME/.local/bin/cpa-compact-proxy.mjs" ]]; then
  ok "Compact Proxy 脚本已安装"
  if ss -tlnp 2>/dev/null | grep -q ':18796'; then
    ok "Compact Proxy 监听在 127.0.0.1:18796"
  else
    fail "Compact Proxy 未在监听 — 启动: systemctl --user start cpa-compact-proxy"
  fi
else
  fail "Compact Proxy 脚本未找到 — 检查 ~/.local/bin/cpa-compact-proxy.mjs"
fi

# ── cc-connect ──
echo "--- cc-connect ---"
if [[ -x "$HOME/.local/bin/cc-connect" ]] || command -v cc-connect &>/dev/null; then
  ok "cc-connect 二进制已安装"
  if systemctl --user is-active cc-connect.service &>/dev/null; then
    ok "cc-connect 服务运行中 (systemd)"
  else
    warn "cc-connect 服务未运行 — 启动: systemctl --user start cc-connect"
  fi
else
  warn "cc-connect 未安装（可选，用于 IM 桥接）"
fi

# ── systemd services ──
echo "--- systemd user services ---"
for svc in cli-proxy-api cpa-compact-proxy cc-connect; do
  if systemctl --user is-enabled "$svc.service" &>/dev/null; then
    ok "$svc 已启用"
  else
    warn "$svc 未启用 — 启用: systemctl --user enable $svc"
  fi
done

# ── Watchdog ──
echo "--- Codex Stack Watchdog ---"
if systemctl --user list-unit-files codex-stack-watchdog.timer &>/dev/null; then
  if systemctl --user is-active codex-stack-watchdog.timer &>/dev/null; then
    ok "Watchdog 定时器运行中"
  else
    warn "Watchdog 定时器未运行 — 启动: systemctl --user start codex-stack-watchdog.timer"
  fi
  if systemctl --user is-enabled codex-stack-watchdog.timer &>/dev/null; then
    ok "Watchdog 已启用"
  else
    warn "Watchdog 未启用 — 启用: systemctl --user enable codex-stack-watchdog.timer"
  fi
else
  warn "Watchdog 未安装"
fi

# ── openclaw.json ──
echo "--- OpenClaw 配置 ---"
OPENCLAW_JSON="$HOME/.openclaw/openclaw.json"
if [[ -f "$OPENCLAW_JSON" ]]; then
  ok "openclaw.json 存在"
  if command -v jq &>/dev/null; then
    GW=$(jq -r '.models.providers | to_entries[0].value.baseUrl' "$OPENCLAW_JSON" 2>/dev/null)
    if [[ -n "$GW" && "$GW" != "null" ]]; then
      ok "网关: $GW"
    else
      warn "无法提取网关地址"
    fi
  fi
else
  fail "openclaw.json 不存在 — OpenClaw 未安装？"
fi

# ── Codex config ──
echo "--- Codex 配置 ---"
CODEX_CONFIG="$HOME/.codex/config.toml"
if [[ -f "$CODEX_CONFIG" ]]; then
  ok "config.toml 存在"
  MODEL=$(grep '^model = ' "$CODEX_CONFIG" | head -1 | sed 's/model = "\(.*\)"/\1/')
  ok "默认模型: ${MODEL:-未设置}"
  
  if grep -q 'responses_websockets = true' "$CODEX_CONFIG"; then
    ok "WebSocket 已启用"
  else
    fail "WebSocket 未启用 — 必须设置 responses_websockets = true"
  fi
  
  BASE=$(grep '^openai_base_url = ' "$CODEX_CONFIG" | head -1 | sed 's/openai_base_url = "\(.*\)"/\1/')
  ok "Base URL: ${BASE:-未设置}"
  
  # 读取 CPA key
  CPA_KEY=$(grep '^experimental_bearer_token = ' "$CODEX_CONFIG" | head -1 | sed 's/experimental_bearer_token = "\(.*\)"/\1/')
  if [[ -z "$CPA_KEY" ]]; then
    CPA_KEY="studio"
  fi
  [[ -f "$HOME/.codex/auth.json" ]] && ok "auth.json 存在" || fail "auth.json 不存在"
else
  fail "config.toml 不存在"
fi

CPA_PORT=$(grep '^port:' "$HOME/.cli-proxy-api/config.yaml" 2>/dev/null | head -1 | sed 's/[^0-9]//g')
[[ -n "$CPA_PORT" ]] || CPA_PORT=18795
COMPACT_PORT=$(grep '^base_url = ' "$CODEX_CONFIG" 2>/dev/null | sed -nE 's#.*127\.0\.0\.1:([0-9]+)/.*#\1#p' | head -1)
[[ -n "$COMPACT_PORT" ]] || COMPACT_PORT=18796
if [[ -f "$HOME/.cli-proxy-api/config.yaml" ]]; then
  grep -q 'remote-management:' "$HOME/.cli-proxy-api/config.yaml" && ok "CPA remote-management 已配置" || fail "CPA remote-management 缺失"
  grep -q 'disable-control-panel: false' "$HOME/.cli-proxy-api/config.yaml" && ok "CPA 管理看板已启用" || warn "CPA 管理看板未启用"
fi

# ── 连通性测试 ──
echo "--- 连通性测试 ---"
if ss -tlnp 2>/dev/null | grep -q ":${COMPACT_PORT}"; then
  RESP=$(curl -s --max-time 5 -H "Authorization: Bearer ${CPA_KEY}" "http://127.0.0.1:${COMPACT_PORT}/v1/models" 2>/dev/null | head -c 200)
  if [[ -n "$RESP" && "$RESP" != *"error"* ]]; then
    ok "Compact Proxy → CPA → 网关 链路正常"
  else
    warn "链路返回异常: ${RESP:0:100}"
  fi
else
  warn "Compact Proxy 未运行，跳过连通性测试"
fi

echo ""
if [[ $FAIL -eq 0 ]]; then
  echo -e "${GREEN}═══ 所有检查通过 ═══${NC}"
else
  echo -e "${RED}═══ 存在问题，请根据上述提示修复 ═══${NC}"
fi

exit $FAIL
