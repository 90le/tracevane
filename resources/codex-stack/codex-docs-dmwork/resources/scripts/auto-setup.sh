#!/bin/bash
# =============================================================================
# Codex + CPA + Compact Proxy + cc-connect 一键安装脚本
# =============================================================================
# 前置条件：
#   1. Node.js 20+ 已安装
#   2. OpenClaw 已安装，~/.openclaw/openclaw.json 存在
#
# 用法：
#   bash auto-setup.sh                  # 自动从 openclaw.json 读取配置
#   bash auto-setup.sh --skip-cc-connect # 跳过 cc-connect 安装
#   bash auto-setup.sh --help            # 显示帮助
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[setup]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
err()  { echo -e "${RED}[error]${NC} $1"; exit 1; }
info() { echo -e "${BLUE}[info]${NC} $1"; }

# ── 参数 ──
SKIP_CC_CONNECT=false
SKIP_NPM=false
SKIP_EXISTING=false
FORCE_REINSTALL=false
SKIP_COMPONENTS=""
FORCE_COMPONENTS=""
NO_START=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESOURCES_DIR="$(dirname "$SCRIPT_DIR")"
CPA_PORT="${CPA_PORT:-18795}"
COMPACT_PORT="${COMPACT_PORT:-18796}"
CODEX_CONTEXT_MODE="${CODEX_CONTEXT_MODE:-default}"
CODEX_CONTEXT_WINDOW="${CODEX_CONTEXT_WINDOW:-1050000}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-cc-connect) SKIP_CC_CONNECT=true; shift ;;
    --skip-npm) SKIP_NPM=true; shift ;;
    --skip-existing) SKIP_EXISTING=true; shift ;;
    --force-reinstall) FORCE_REINSTALL=true; shift ;;
    --skip=*) SKIP_COMPONENTS="${1#--skip=}"; shift ;;
    --force=*) FORCE_COMPONENTS="${1#--force=}"; shift ;;
    --no-start) NO_START=true; shift ;;
    --help)
      echo "Usage: bash auto-setup.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --skip-cc-connect       跳过 cc-connect 安装"
      echo "  --skip-npm              跳过 npm 全局安装 (codex/omx/ws)"
      echo "  --skip-existing         跳过已安装的组件"
      echo "  --force-reinstall       强制重新安装所有组件"
      echo "  --no-start              只安装不启动服务"
      echo "  --skip=<comp,...>       跳过指定组件 (codex,cpa,compact-proxy,cc-connect,watchdog)"
      echo "  --force=<comp,...>      强制重装指定组件 (codex,cpa,compact-proxy,cc-connect)"
      echo ""
      echo "  自动从 ~/.openclaw/openclaw.json 读取网关配置。"
      exit 0 ;;
    *) warn "未知参数: $1"; shift ;;
  esac
done

# ── 组件过滤辅助函数 ──
should_skip() {
  # Returns 0 (true) if the component should be skipped
  local comp="$1"
  # --skip= takes priority
  if [[ -n "$SKIP_COMPONENTS" ]]; then
    local IFS=','
    for s in $SKIP_COMPONENTS; do
      [[ "$s" == "$comp" ]] && return 0
    done
  fi
  # --skip-existing: skip if already installed
  if [[ "$SKIP_EXISTING" == true ]]; then
    case "$comp" in
      codex) command -v codex &>/dev/null && return 0 ;;
      cpa) [[ -x "$HOME/.local/bin/cli-proxy-api" ]] && return 0 ;;
      compact-proxy) [[ -f "$HOME/.local/bin/cpa-compact-proxy.mjs" ]] && return 0 ;;
      cc-connect) [[ -x "$HOME/.local/bin/cc-connect" ]] && return 0 ;;
      watchdog) return 1 ;;  # watchdog is always lightweight, don't skip
    esac
  fi
  return 1
}

should_force() {
  # Returns 0 (true) if the component should be force-reinstalled
  local comp="$1"
  [[ "$FORCE_REINSTALL" == true ]] && return 0
  if [[ -n "$FORCE_COMPONENTS" ]]; then
    local IFS=','
    for f in $FORCE_COMPONENTS; do
      [[ "$f" == "$comp" ]] && return 0
    done
  fi
  return 1
}

# Derive SKIP_CC_CONNECT from --skip=cc-connect too
if echo "$SKIP_COMPONENTS" | grep -q 'cc-connect'; then
  SKIP_CC_CONNECT=true
fi

# =============================================================================
# Step 0: 检查前置条件
# =============================================================================
log "════════════════════════════════════════════════════════"
log "  Codex 全环境一键安装"
log "════════════════════════════════════════════════════════"
echo ""

# Node.js
if ! command -v node &>/dev/null; then
  err "Node.js 未安装。请先安装 Node.js 20+: https://nodejs.org/"
fi
log "Node.js $(node --version) ✓"

# npm
if ! command -v npm &>/dev/null; then
  err "npm 未安装。"
fi
log "npm $(npm --version) ✓"

# jq — optional, node fallback handles JSON parsing
if ! command -v jq &>/dev/null; then
  info "jq 未安装，使用 node 做 JSON 解析（无需 sudo）"
fi

# OpenClaw
OPENCLAW_JSON="$HOME/.openclaw/openclaw.json"
if [[ ! -f "$OPENCLAW_JSON" ]]; then
  err "OpenClaw 未安装或 $OPENCLAW_JSON 不存在。请先安装 OpenClaw。"
fi
log "openclaw.json 存在 ✓"

# =============================================================================
# Step 1: 提取网关配置
# =============================================================================
log "Step 1/8: 从 openclaw.json 提取网关配置..."

# 提取第一个 provider 的 baseUrl 和 apiKey
# Use node for JSON parsing (always available, no jq/sudo needed)
eval "$(node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('$OPENCLAW_JSON', 'utf8'));
const providers = data.models?.providers || {};
const entries = Object.entries(providers);
const first = entries[0]?.[1] || {};
console.log('GATEWAY_URL=' + JSON.stringify(first.baseUrl || ''));
console.log('API_KEY=' + JSON.stringify(first.apiKey || ''));
const mlamp = providers['custom-llm-gateway-mlamp-cn'] || {};
console.log('MLAMP_URL=' + JSON.stringify(mlamp.baseUrl || ''));
console.log('MLAMP_KEY=' + JSON.stringify(mlamp.apiKey || ''));
const bigmodel = providers['bigmodel'] || {};
console.log('BIGMODEL_URL=' + JSON.stringify(bigmodel.baseUrl || ''));
console.log('BIGMODEL_KEY=' + JSON.stringify(bigmodel.apiKey || ''));
const dm = data.defaultModel;
console.log('OPENCLAW_DEFAULT_MODEL=' + JSON.stringify(typeof dm === 'string' ? dm : (dm?.id || dm?.name || dm?.model || '')));
console.log('HTTP_PROXY_VAL=' + JSON.stringify(data.env?.http_proxy || ''));
console.log('NO_PROXY_VAL=' + JSON.stringify(data.env?.no_proxy || ''));
")"

if [[ -z "$GATEWAY_URL" || "$GATEWAY_URL" == "null" ]]; then
  err "无法从 openclaw.json 提取网关地址 (baseUrl)"
fi
if [[ -z "$API_KEY" || "$API_KEY" == "null" ]]; then
  err "无法从 openclaw.json 提取 API Key"
fi

# CPA 代理认证 key（本地使用）
# 这是访问本地 cpa 代理的认证密钥，与访问外部大模型的 key 无关
# 默认使用固定值，可通过环境变量 CPA_PROXY_KEY 覆盖
if [[ -n "${CPA_PROXY_KEY:-}" && "${CPA_PROXY_KEY:-}" != "null" ]]; then
  : # 使用环境变量 CPA_PROXY_KEY
else
  CPA_PROXY_KEY="studio"
fi

if [[ -n "${CODEX_MODEL:-}" && "${CODEX_MODEL:-}" != "null" ]]; then
  : # 使用环境变量 CODEX_MODEL
elif [[ -n "$MLAMP_URL" && "$MLAMP_URL" != "null" ]]; then
  CODEX_MODEL="kimi-k2.6"
elif [[ -n "$BIGMODEL_URL" && "$BIGMODEL_URL" != "null" ]]; then
  CODEX_MODEL="glm-5.1"
else
  CODEX_MODEL="${OPENCLAW_DEFAULT_MODEL:-kimi-k2.6}"
fi

log "  主网关: $GATEWAY_URL"
[[ -n "$MLAMP_URL" ]] && log "  mlamp 网关: $MLAMP_URL"
[[ -n "$BIGMODEL_URL" ]] && log "  bigmodel 网关: $BIGMODEL_URL"
[[ -n "$HTTP_PROXY_VAL" ]] && log "  系统代理: $HTTP_PROXY_VAL"

# =============================================================================
# Step 2: 安装 Codex CLI + oh-my-codex
# =============================================================================
if [[ "$SKIP_NPM" == true ]]; then
  log "Step 2/8: 跳过 npm 安装（--skip-npm）"
else
  log "Step 2/8: 安装 Codex CLI + oh-my-codex..."

  if should_skip "codex"; then
    log "  跳过 Codex CLI（已安装或 --skip=codex）"
  elif should_force "codex" || ! command -v codex &>/dev/null; then
    npm install -g @openai/codex
    log "  Codex CLI 安装完成"
  else
    log "  Codex CLI 已安装: $(codex --version 2>/dev/null || echo 'ok')"
  fi

  if should_force "codex" || ! command -v omx &>/dev/null; then
    npm install -g oh-my-codex
    log "  oh-my-codex 安装完成"
  else
    log "  oh-my-codex 已安装"
  fi

  # ws 模块（Compact Proxy 依赖）
  if ! node -e "require('ws')" &>/dev/null 2>&1; then
    log "  安装 ws 模块..."
    npm install -g ws 2>/dev/null || true
    if [[ -d "$HOME/.openclaw/node_modules" ]]; then
      cd "$HOME/.openclaw" && npm install ws 2>/dev/null || true
      cd - > /dev/null
    fi
  fi
fi

# =============================================================================
# Step 3: 安装 cc-connect（dmwork 增强版二进制）
# =============================================================================
if [[ "$SKIP_CC_CONNECT" != true ]] && ! should_skip "cc-connect"; then
  log "Step 3/8: 安装 cc-connect (dmwork 增强版)..."
  mkdir -p "$HOME/.local/bin"

  # Remove non-dmwork cc-connect binaries (official npm version does not support dmwork)
  log "  清理旧版 cc-connect..."
  npm uninstall -g cc-connect >/dev/null 2>&1 || true
  rm -f "$HOME/.npm-global/bin/cc-connect" 2>/dev/null || true
  rm -rf "$HOME/.npm-global/lib/node_modules/cc-connect" 2>/dev/null || true
  rm -f "$HOME/.local/lib/node_modules/cc-connect" 2>/dev/null || true
  # Stop any running cc-connect before replacing binary
  pkill -f 'cc-connect' 2>/dev/null || true
  sleep 1
  rm -f "$HOME/.cc-connect/.config.toml.lock" 2>/dev/null || true
  log "  清理完成"

  CC_BIN="$RESOURCES_DIR/bin/cc-connect"
  # Force reinstall: remove old binary first
  if should_force "cc-connect" && [[ -x "$HOME/.local/bin/cc-connect" ]]; then
    rm -f "$HOME/.local/bin/cc-connect"
    log "  已移除旧版 cc-connect（强制重装）"
  fi

  # 确保 dmwork 版本二进制存在
  if [[ ! -f "$CC_BIN" ]]; then
    warn "  ⚠️ dmwork 版本 cc-connect 二进制未找到！"
  else
    log "  dmwork 版本二进制存在: $(du -h "$CC_BIN" | cut -f1)"
    
    # 尝试复制到 ~/.local/bin/（可能受路径限制）
    if cp "$CC_BIN" "$HOME/.local/bin/cc-connect" 2>/dev/null; then
      chmod +x "$HOME/.local/bin/cc-connect"
      log "  ✅ cc-connect dmwork 版本已安装到: $HOME/.local/bin/cc-connect"
    else
      warn "  ⚠️ 无法复制到 $HOME/.local/bin/（路径权限限制）"
      warn "  ✅ 将直接使用 dmwork 目录下的二进制: $CC_BIN"
    fi
    
    # 验证 dmwork 标识
    if strings "$CC_BIN" 2>/dev/null | grep -q -E "dmwork|cc-connect-dmwork"; then
      log "  ✅ 已确认 dmwork 增强版"
    else
      warn "  ⚠️ dmwork 二进制文件标识检查失败，但可能是正常的"
    fi
  fi
  # Ensure PATH includes ~/.local/bin with PRIORITY over npm-global
  if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    export PATH="$HOME/.local/bin:$PATH"
    # Prepend to bashrc so it takes priority
    sed -i '\|^export PATH=|d' "$HOME/.bashrc" 2>/dev/null || true
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
    log "  已添加 ~/.local/bin 到 PATH（优先级最高）"
  else
    # Already in PATH but check if it's before npm-global
    export PATH="$HOME/.local/bin:$PATH"
  fi
  # Verify the correct binary is found
  CC_FOUND="$(command -v cc-connect 2>/dev/null || true)"
  if [[ -n "$CC_FOUND" ]]; then
    log "  cc-connect 路径: $CC_FOUND"
    # Check if it's our dmwork version
    if "$CC_FOUND" --version 2>&1 | grep -q 'dev'; then
      log "  ✅ dmwork 增强版已就位"
    else
      warn "  当前 cc-connect 不是 dmwork 版本，可能有 PATH 冲突"
      warn "  路径: $CC_FOUND"
    fi
  fi
else
  log "Step 3/8: 跳过 cc-connect（--skip-cc-connect）"
fi

# =============================================================================
# Step 4: 部署 CPA 二进制 + Compact Proxy
# =============================================================================
if should_skip "cpa" && should_skip "compact-proxy"; then
  log "Step 4/8: 跳过 CPA + Compact Proxy（--skip 或已安装）"
else
  log "Step 4/8: 部署 CPA + Compact Proxy..."
fi

mkdir -p "$HOME/.local/bin"

# 部署 CPA 二进制
if should_skip "cpa"; then
  log "  跳过 CPA（--skip=cpa 或已安装）"
elif should_force "cpa" && [[ -x "$HOME/.local/bin/cli-proxy-api" ]]; then
  # Stop CPA service first to avoid "Text file busy"
  systemctl --user stop cli-proxy-api.service 2>/dev/null || true
  sleep 1
  rm -f "$HOME/.local/bin/cli-proxy-api"
  log "  已移除旧版 CPA（强制重装）"
fi
if ! should_skip "cpa" && [[ -x "$HOME/.local/bin/cli-proxy-api" ]]; then
  log "  CPA 已存在于 ~/.local/bin/cli-proxy-api"
else
  # Stop CPA before copy to avoid "Text file busy"
  if [[ -x "$HOME/.local/bin/cli-proxy-api" ]]; then
    systemctl --user stop cli-proxy-api.service 2>/dev/null || true
    pkill -f 'cli-proxy-api' 2>/dev/null || true
    sleep 1
  fi
  # 尝试从资源目录复制
  if [[ -f "$RESOURCES_DIR/bin/cli-proxy-api" ]]; then
    cp -f "$RESOURCES_DIR/bin/cli-proxy-api" "$HOME/.local/bin/cli-proxy-api" 2>/dev/null || {
      # If still busy, force kill and retry
      pkill -9 -f 'cli-proxy-api' 2>/dev/null || true
      sleep 2
      cp "$RESOURCES_DIR/bin/cli-proxy-api" "$HOME/.local/bin/cli-proxy-api"
    }
    chmod +x "$HOME/.local/bin/cli-proxy-api"
    log "  CPA 从资源目录复制完成"
  elif [[ -f "$RESOURCES_DIR/cpa-config-templates/cli-proxy-api" ]]; then
    cp -f "$RESOURCES_DIR/cpa-config-templates/cli-proxy-api" "$HOME/.local/bin/cli-proxy-api"
    chmod +x "$HOME/.local/bin/cli-proxy-api"
    log "  CPA 从模板目录复制完成"
  else
    warn "  CPA 二进制未在资源包中找到"
    warn "  请手动将 cli-proxy-api 放到 ~/.local/bin/"
    warn "  获取方式：从组织内部源下载或通过管理员获取"
  fi
fi

# 部署 Compact Proxy v5 (Node.js)
if should_skip "compact-proxy"; then
  log "  跳过 Compact Proxy（--skip=compact-proxy 或已安装）"
elif should_force "compact-proxy" && [[ -f "$HOME/.local/bin/cpa-compact-proxy.mjs" ]]; then
  rm -f "$HOME/.local/bin/cpa-compact-proxy.mjs"
  log "  已移除旧版 Compact Proxy（强制重装）"
fi
if ! should_skip "compact-proxy" && [[ -f "$HOME/.local/bin/cpa-compact-proxy.mjs" ]]; then
  log "  Compact Proxy v5 已存在"
else
  # 尝试从资源目录复制
  if [[ -f "$RESOURCES_DIR/cpa-config-templates/compact-proxy.mjs" ]]; then
    cp "$RESOURCES_DIR/cpa-config-templates/compact-proxy.mjs" "$HOME/.local/bin/cpa-compact-proxy.mjs"
    chmod +x "$HOME/.local/bin/cpa-compact-proxy.mjs"
    log "  Compact Proxy v5 从资源目录复制完成"
  elif [[ -f "$RESOURCES_DIR/scripts/compact-proxy.mjs" ]]; then
    cp "$RESOURCES_DIR/scripts/compact-proxy.mjs" "$HOME/.local/bin/cpa-compact-proxy.mjs"
    chmod +x "$HOME/.local/bin/cpa-compact-proxy.mjs"
    log "  Compact Proxy v5 从脚本目录复制完成"
  else
    warn "  Compact Proxy v5 脚本未在资源包中找到"
    warn "  请手动将 cpa-compact-proxy.mjs 放到 ~/.local/bin/"
  fi
fi

# =============================================================================
# Step 5: 生成 CPA 配置
# =============================================================================
if should_skip "cpa" && should_skip "compact-proxy"; then
  log "Step 5/8: 跳过 CPA 配置生成（CPA 和 Compact Proxy 均跳过）"
else
  log "Step 5/8: 生成 CPA 配置..."
fi

mkdir -p "$HOME/.cli-proxy-api"

# 构建 openai-compatibility providers
CPA_CONFIG="$HOME/.cli-proxy-api/config.yaml"

# 开始写入配置
# 构建 api-keys 列表（包含本地代理key和所有上游provider的key）
API_KEYS_LIST="- ${CPA_PROXY_KEY}"
[[ -n "$MLAMP_KEY" && "$MLAMP_KEY" != "null" ]] && API_KEYS_LIST="$API_KEYS_LIST"$'\n'"- ${MLAMP_KEY}"
[[ -n "$BIGMODEL_KEY" && "$BIGMODEL_KEY" != "null" ]] && API_KEYS_LIST="$API_KEYS_LIST"$'\n'"- ${BIGMODEL_KEY}"

cat > "$CPA_CONFIG" << YAMLEOF
host: 127.0.0.1
port: ${CPA_PORT}
auth-dir: ~/.cli-proxy-api
api-keys:
${API_KEYS_LIST}
debug: false
proxy-url: direct
disable-cooling: true
max-retry-credentials: 0

remote-management:
  allow-remote: false
  secret-key: "studio"
  disable-control-panel: false
  panel-github-repository: "https://github.com/router-for-me/Cli-Proxy-API-Management-Center"
YAMLEOF

# 添加 openai-compatibility provider (mlamp gateway)
if [[ -n "$MLAMP_URL" && -n "$MLAMP_KEY" ]]; then
  cat >> "$CPA_CONFIG" << YAMLEOF

openai-compatibility:
- name: mlamp
  base-url: ${MLAMP_URL}
  api-key-entries:
  - api-key: ${MLAMP_KEY}
    proxy-url: direct
  models:
  - name: mlamp/kimi-k2.6
    alias: kimi-k2.6
  - name: mlamp/deepseek-v4-flash
    alias: deepseek-v4-flash
  - name: mlamp/qwen3-8b
    alias: qwen3-8b
  - name: gpt-5.4
    alias: gpt-5.4
  - name: gpt-5.5
    alias: gpt-5.5
  - name: qwen3.6-max
    alias: qwen3.6-max
  - name: qwen3.6-plus
    alias: qwen3.6-plus
  - name: qwen3.6-flash
    alias: qwen3.6-flash
  - name: Doubao-Seed-2.0-Code
    alias: Doubao-Seed-2.0-Code
  - name: hunyuan-t1-latest
    alias: hunyuan-t1-latest
YAMLEOF
else
  # Fallback: 使用主 gateway
  cat >> "$CPA_CONFIG" << YAMLEOF

openai-compatibility:
- name: gateway
  base-url: ${GATEWAY_URL}
  api-key-entries:
  - api-key: ${API_KEY}
    proxy-url: direct
  models:
  - name: kimi-k2.6
YAMLEOF
fi

# 添加 bigmodel provider（如果有）
if [[ -n "$BIGMODEL_URL" && -n "$BIGMODEL_KEY" ]]; then
  cat >> "$CPA_CONFIG" << YAMLEOF
- name: bigmodel
  base-url: ${BIGMODEL_URL}
  api-key-entries:
  - api-key: ${BIGMODEL_KEY}
    proxy-url: direct
  models:
  - name: glm-5.1
  - name: glm-5
  - name: glm-5-turbo
YAMLEOF

  # Claude API 兼容层
  cat >> "$CPA_CONFIG" << YAMLEOF

claude-api-key:
- name: zhipu-anthropic
  api-key: ${BIGMODEL_KEY}
  base-url: https://open.bigmodel.cn/api/anthropic
  proxy-url: direct
  models:
  - name: glm-5.1
  - name: kimi-k2.6
YAMLEOF
fi

log "  CPA 配置写入: $CPA_CONFIG"

# =============================================================================
# Step 6: 生成 Codex 配置
# =============================================================================
if should_skip "codex"; then
  log "Step 6/8: 跳过 Codex 配置生成（--skip=codex）"
else
  log "Step 6/8: 生成 Codex 配置..."

mkdir -p "$HOME/.codex"

CODEX_CONFIG="$HOME/.codex/config.toml"

# 备份现有配置（备份到 /tmp 目录以避免路径权限限制）
if [[ -f "$CODEX_CONFIG" ]]; then
  cp "$CODEX_CONFIG" "/tmp/codex-config.toml.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
  log "  已备份现有 config.toml"
fi

# 解析 no_proxy 用于 shell_environment_policy
if [[ -n "$NO_PROXY_VAL" ]]; then
  NO_PROXY_TOML="NO_PROXY = \"${NO_PROXY_VAL}\""
else
  NO_PROXY_TOML="NO_PROXY = \"localhost,127.0.0.1,::1\""
fi

cat > "$CODEX_CONFIG" << TOMLEOF
# Codex CLI 配置 — 由 auto-setup.sh 自动生成
# 默认模型: ${CODEX_MODEL}

suppress_unstable_features_warning = true

# OMX 通知
notify = ["node", "$HOME/.npm-global/lib/node_modules/oh-my-codex/dist/scripts/notify-hook.js"]

model_reasoning_effort = "medium"

developer_instructions = "You have oh-my-codex installed. AGENTS.md is the orchestration brain and main control surface."

# ── 模型配置 ──
model = "${CODEX_MODEL}"
openai_base_url = "http://127.0.0.1:${COMPACT_PORT}/v1"
base_url = "http://127.0.0.1:${COMPACT_PORT}/v1"
experimental_bearer_token = "${CPA_PROXY_KEY}"
responses_websockets = true
responses_websockets_v2 = true

TOMLEOF

if [[ "$CODEX_CONTEXT_MODE" == "codex-1m" || "$CODEX_CONTEXT_MODE" == "custom" ]]; then
  if ! [[ "$CODEX_CONTEXT_WINDOW" =~ ^[0-9]+$ ]]; then
    CODEX_CONTEXT_WINDOW=1050000
  fi
  (( CODEX_CONTEXT_WINDOW < 1000 )) && CODEX_CONTEXT_WINDOW=1000
  (( CODEX_CONTEXT_WINDOW > 1050000 )) && CODEX_CONTEXT_WINDOW=1050000
  AUTO_COMPACT_LIMIT=$(( CODEX_CONTEXT_WINDOW * 9 / 10 ))
  cat >> "$CODEX_CONFIG" << TOMLEOF
model_context_window = ${CODEX_CONTEXT_WINDOW}
model_auto_compact_token_limit = ${AUTO_COMPACT_LIMIT}

TOMLEOF
fi

cat >> "$CODEX_CONFIG" << TOMLEOF

# ── 功能开关 ──
[features]
responses_websockets   = true
responses_websockets_v2 = true
goals = true
multi_agent_v2 = true
multi_agent = true
child_agents_md = true
generate_memories = true
use_memories = true
collaboration_modes = true
guardian_approval = true
builtin_mcp = true
apply_patch_freeform = true
apply_patch_streaming_events = true
js_repl = true
enable_request_compression = true
enable_fanout = true
plugins = true
plugin_hooks = true
tool_suggest = true
steer = true
personality = true
hooks = true

# ── Agent 团队 ──
[agents]
max_depth = 3
job_max_runtime_seconds = 604800

# ── TUI ──
[tui]
theme = "dark"
status_line = ["model-with-reasoning", "git-branch", "context-remaining", "total-input-tokens", "total-output-tokens", "five-hour-limit", "weekly-limit"]

# ── 信任目录 ──
[projects."/home/$USER/.openclaw"]
trust_level = "trusted"

[projects."/home/$USER/.openclaw/workspace"]
trust_level = "trusted"

[projects."/home/$USER"]
trust_level = "trusted"

# ── Shell 环境 ──
[shell_environment_policy.set]
USE_OMX_EXPLORE_CMD = "1"
${NO_PROXY_TOML}
TOMLEOF

log "  Codex 配置写入: $CODEX_CONFIG"
cat > "$HOME/.codex/auth.json" << JSONEOF
{
  "auth_mode": "apikey",
  "OPENAI_API_KEY": "${CPA_PROXY_KEY}"
}
JSONEOF
chmod 600 "$HOME/.codex/auth.json" 2>/dev/null || true
log "  Codex auth.json 写入: $HOME/.codex/auth.json"

fi  # end should_skip "codex"

# =============================================================================
# Step 7: 创建 systemd 进程守护
# =============================================================================
if [[ "$NO_START" == true ]]; then
  log "Step 7/8: 跳过 systemd 服务启动（--no-start）"
  log "  稍后可手动启动: systemctl --user start cli-proxy-api.service cpa-compact-proxy.service"
else
  log "Step 7/8: 创建 systemd 进程守护..."

mkdir -p "$HOME/.config/systemd/user"

# CPA service
cat > "$HOME/.config/systemd/user/cli-proxy-api.service" << 'SVCEOF'
[Unit]
Description=CPA cli-proxy-api - Responses API Proxy
After=network.target

[Service]
Type=simple
ExecStart=%h/.local/bin/cli-proxy-api --config %h/.cli-proxy-api/config.yaml
WorkingDirectory=%h/.cli-proxy-api
Restart=always
RestartSec=5
StandardOutput=append:/tmp/cpa.log
StandardError=append:/tmp/cpa.log

# 确保不走系统代理访问本地
Environment=HTTP_PROXY=
Environment=HTTPS_PROXY=
Environment=CPA_PORT=${CPA_PORT}
Environment=CPA_BASE_URL=http://127.0.0.1:${CPA_PORT}
Environment=LISTEN_PORT=${COMPACT_PORT}
Environment=CPA_KEY=${CPA_PROXY_KEY}
Environment=COMPACT_DEFAULT_MODEL=${CODEX_MODEL}
Environment=NO_PROXY=localhost,127.0.0.1,::1
Environment=CPA_BASE_URL=http://127.0.0.1:${CPA_PORT}
Environment=LISTEN_PORT=${COMPACT_PORT}
Environment=COMPACT_DEFAULT_MODEL=${CODEX_MODEL}

[Install]
WantedBy=default.target
SVCEOF

# Compact Proxy service — resolve node path at install time
NODE_BIN="$(command -v node || echo /usr/bin/node)"
cat > "$HOME/.config/systemd/user/cpa-compact-proxy.service" << SVCEOF
[Unit]
Description=CPA Compact Proxy v5 (Node.js)
After=network.target cli-proxy-api.service
Wants=cli-proxy-api.service

[Service]
Type=simple
ExecStart=${NODE_BIN} %h/.local/bin/cpa-compact-proxy.mjs
Restart=always
RestartSec=3
StandardOutput=append:/tmp/cpa-compact-proxy.log
StandardError=append:/tmp/cpa-compact-proxy.log

Environment=HTTP_PROXY=
Environment=HTTPS_PROXY=
Environment=NO_PROXY=localhost,127.0.0.1,::1
Environment=CPA_BASE_URL=http://127.0.0.1:${CPA_PORT}
Environment=LISTEN_PORT=${COMPACT_PORT}
Environment=COMPACT_DEFAULT_MODEL=${CODEX_MODEL}

[Install]
WantedBy=default.target
SVCEOF

# Reload + enable + start
systemctl --user daemon-reload

# CPA
systemctl --user enable cli-proxy-api.service 2>/dev/null || true
systemctl --user restart cli-proxy-api.service 2>/dev/null || {
  warn "CPA 启动失败，可能需要先 kill 旧进程"
  pkill -f 'cli-proxy-api' 2>/dev/null || true
  sleep 2
  systemctl --user start cli-proxy-api.service 2>/dev/null || warn "CPA 仍未启动，请检查: journalctl --user -u cli-proxy-api.service"
}

sleep 2

# Compact Proxy
systemctl --user enable cpa-compact-proxy.service 2>/dev/null || true
systemctl --user restart cpa-compact-proxy.service 2>/dev/null || {
  warn "Compact Proxy 启动失败"
  sleep 2
  systemctl --user start cpa-compact-proxy.service 2>/dev/null || warn "请检查: journalctl --user -u cli-proxy-api.service-compact-proxy"
}

sleep 2

# 验证
if ss -tlnp 2>/dev/null | grep -q ":${CPA_PORT}"; then
  log "  ✅ CPA 运行在 127.0.0.1:${CPA_PORT}"
else
  warn "  CPA 端口 ${CPA_PORT} 未监听"
fi

if ss -tlnp 2>/dev/null | grep -q ":${COMPACT_PORT}"; then
  log "  ✅ Compact Proxy 运行在 127.0.0.1:${COMPACT_PORT}"
else
  warn "  Compact Proxy 端口 ${COMPACT_PORT} 未监听"
fi

fi  # end NO_START guard

# =============================================================================
# Step 7.5: 创建 Watchdog 定时器
# =============================================================================
if should_skip "watchdog"; then
  log "Step 7.5: 跳过 Watchdog（--skip=watchdog）"
else
  log "创建 Watchdog 定时器..."

  cat > "$HOME/.local/bin/codex-stack-watchdog.sh" << 'WATCHDOG'
#!/usr/bin/env bash
set -u

log() { printf '[%s] %s
' "$(date -Is)" "$*"; }

unit_exists() {
  systemctl --user list-unit-files "$1" >/dev/null 2>&1
}

restart_unit() {
  local unit="$1" reason="$2"
  log "restart ${unit}: ${reason}"
  systemctl --user restart "$unit" >/dev/null 2>&1 || true
}

ensure_active() {
  local unit="$1"
  unit_exists "$unit" || return 0
  if ! systemctl --user is-active --quiet "$unit"; then
    restart_unit "$unit" "unit is not active"
    sleep 2
  fi
}

CPA_PORT="$(awk -F: '/^port:/ { gsub(/[^0-9]/, "", $2); print $2; exit }' "$HOME/.cli-proxy-api/config.yaml" 2>/dev/null)"
[[ -n "$CPA_PORT" ]] || CPA_PORT=18795
COMPACT_PORT="$(grep '^base_url = ' "$HOME/.codex/config.toml" 2>/dev/null | sed -nE 's#.*127\.0\.0\.1:([0-9]+)/.*#\1#p' | head -1)"
[[ -n "$COMPACT_PORT" ]] || COMPACT_PORT=18796

ensure_active cli-proxy-api.service
if ! curl -fsS --max-time 5 "http://127.0.0.1:${CPA_PORT}/healthz" >/dev/null 2>&1; then
  sleep 5
  curl -fsS --max-time 5 "http://127.0.0.1:${CPA_PORT}/healthz" >/dev/null 2>&1 || restart_unit cli-proxy-api.service "CPA healthz failed"
fi

ensure_active cpa-compact-proxy.service
if ! curl -fsS --max-time 8 "http://127.0.0.1:${COMPACT_PORT}/healthz" >/dev/null 2>&1; then
  sleep 5
  curl -fsS --max-time 8 "http://127.0.0.1:${COMPACT_PORT}/healthz" >/dev/null 2>&1 || restart_unit cpa-compact-proxy.service "Compact Proxy healthz failed"
fi

if unit_exists cc-connect.service; then
  ensure_active cc-connect.service
fi
WATCHDOG
  chmod +x "$HOME/.local/bin/codex-stack-watchdog.sh"

  cat > "$HOME/.config/systemd/user/codex-stack-watchdog.service" << 'SVCEOF'
[Unit]
Description=Watchdog for Codex CPA stack
After=network-online.target cli-proxy-api.service cpa-compact-proxy.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=%h/.local/bin/codex-stack-watchdog.sh
StandardOutput=journal
StandardError=journal
SVCEOF

  cat > "$HOME/.config/systemd/user/codex-stack-watchdog.timer" << 'SVCEOF'
[Unit]
Description=Run Codex stack watchdog every minute

[Timer]
OnBootSec=1min
OnUnitActiveSec=1min
AccuracySec=15s
Persistent=true
Unit=codex-stack-watchdog.service

[Install]
WantedBy=timers.target
SVCEOF

  systemctl --user daemon-reload
  systemctl --user enable codex-stack-watchdog.timer 2>/dev/null || true

  if [[ "$NO_START" != true ]]; then
    systemctl --user restart codex-stack-watchdog.timer 2>/dev/null || warn "  Watchdog 启动失败"
    log "  ✅ Watchdog 定时器已启用"
  fi
fi

# =============================================================================
# Step 8: 配置 cc-connect + systemd 守护进程
# =============================================================================
if [[ "$SKIP_CC_CONNECT" != true ]]; then
  log "Step 8/8: 配置 cc-connect + systemd..."

  if [[ ! -x "$HOME/.local/bin/cc-connect" ]]; then
    warn "  cc-connect 二进制不存在，跳过配置"
  else
    mkdir -p "$HOME/.cc-connect"

    CC_CONFIG="$HOME/.cc-connect/config.toml"
    
    if [[ -f "$CC_CONFIG" ]]; then
      cp "$CC_CONFIG" "/tmp/cc-connect-config.toml.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
      log "  已备份现有 cc-connect 配置"
    fi

    # Only write config if it doesn't exist (preserve user customizations)
    if [[ ! -f "$CC_CONFIG" ]]; then
      cat > "$CC_CONFIG" << CCEOF
language = "zh"

[display]
thinking_messages = true
tool_messages = true

[log]
level = "info"

# ── 全局 Provider ──
[[providers]]
name = "cpa"
api_key = "$CPA_PROXY_KEY"
# ── 模型配置 ──
model = "${CODEX_MODEL}"
openai_base_url = "http://127.0.0.1:${COMPACT_PORT}/v1"
base_url = "http://127.0.0.1:${COMPACT_PORT}/v1"
codex.env_key = "OPENAI_API_KEY"

# ── 项目配置 ──
[[projects]]
name = "main"

# ── 平台配置（至少需要一个，cc-connect 才能启动）──
# 方式 1: 飞书 — 运行 cc-connect feishu setup 自动配置
# [[projects.platforms]]
# type = "feishu"
# [projects.platforms.options]
# app_id = "YOUR_FEISHU_APP_ID"
# app_secret = "YOUR_FEISHU_APP_SECRET"

# 方式 2: DMWork — 需要提供 bot_token
# [[projects.platforms]]
# type = "dmwork"
# [projects.platforms.options]
# bot_token = "YOUR_DMWORK_BOT_TOKEN"
# api_url = "https://your-dmwork-instance.com"

# 方式 3: 微信 — 运行 cc-connect weixin setup 扫码绑定
# [[projects.platforms]]
# type = "weixin"
# [projects.platforms.options]
# token = "YOUR_ILINK_TOKEN"

# 管理员用户（可执行特权命令）
# 获取方式: journalctl --user -u cc-connect --since "5 min ago" | grep "user="
# admin_from = "YOUR_USER_IDS"

[projects.agent]
type = "codex"

[projects.agent.options]
work_dir = "$HOME/.openclaw"
mode = "suggest"
model = "${CODEX_MODEL}"

[stream_preview]
enabled = true
interval_ms = 1500

reset_on_idle_mins = 30
CCEOF
      log "  cc-connect 配置已写入: $CC_CONFIG"
      warn "  cc-connect 需要至少配置一个平台才能启动"
      warn "  运行以下命令之一完成平台配置："
      warn "    cc-connect feishu setup   # 飞书（推荐）"
      warn "    cc-connect weixin setup   # 微信"
      warn "  或手动编辑 $CC_CONFIG 添加 [[projects.platforms]]"
    else
      log "  保留现有 cc-connect 配置"
    fi

    # ── systemd 守护进程 ──
    mkdir -p "$HOME/.config/systemd/user"
    # 确定要使用的 cc-connect 路径：优先检查 ~/.local/bin/ 是否为 dmwork 版本，否则直接使用 dmwork 目录下的
    CC_EXEC_PATH="$HOME/.local/bin/cc-connect"
    if [[ -f "$CC_BIN" ]]; then
      if [[ ! -f "$CC_EXEC_PATH" ]] || ! strings "$CC_EXEC_PATH" 2>/dev/null | grep -q dmwork; then
        CC_EXEC_PATH="$CC_BIN"
        log "  systemd 将直接使用 dmwork 目录下的二进制: $CC_EXEC_PATH"
      fi
    fi

    # 替换路径中的 $HOME 为 %h
    CC_EXEC_PATH_ESCAPED=$(echo "$CC_EXEC_PATH" | sed "s|$HOME|%h|g")
    
    cat > "$HOME/.config/systemd/user/cc-connect.service" << SVCEOF
[Unit]
Description=cc-connect - AI Agent Chat Bridge (dmwork)
After=network-online.target cli-proxy-api.service cpa-compact-proxy.service
Wants=cli-proxy-api.service

[Service]
Type=simple
ExecStart=$CC_EXEC_PATH_ESCAPED --force --config %h/.cc-connect/config.toml
WorkingDirectory=%h/.cc-connect
Restart=always
RestartSec=5
StartLimitIntervalSec=60
StartLimitBurst=5

StandardOutput=append:/tmp/cc-connect.log
StandardError=append:/tmp/cc-connect.log

# Include all possible binary paths so cc-connect can find codex CLI
Environment=PATH=%h/.npm-global/bin:%h/.local/bin:/usr/local/bin:/usr/bin:/bin
Environment=OPENAI_API_KEY=${CPA_PROXY_KEY}

# 不走系统代理访问本地
Environment=HTTP_PROXY=
Environment=HTTPS_PROXY=
Environment=NO_PROXY=localhost,127.0.0.1,::1
Environment=CPA_BASE_URL=http://127.0.0.1:${CPA_PORT}
Environment=LISTEN_PORT=${COMPACT_PORT}
Environment=COMPACT_DEFAULT_MODEL=${CODEX_MODEL}

[Install]
WantedBy=default.target
SVCEOF

    # Kill any existing cc-connect processes from previous installations
    systemctl --user stop cc-connect.service 2>/dev/null || true
    pkill -f 'cc-connect' 2>/dev/null || true
    sleep 1
    # Clean stale instance lock
    rm -f "$HOME/.cc-connect/.config.toml.lock" 2>/dev/null || true

    systemctl --user daemon-reload
    systemctl --user enable cc-connect.service 2>/dev/null || true

    # Check if config has at least one platform configured
    HAS_PLATFORM=false
    if grep -q '\[\[projects\.platforms\]\]' "$CC_CONFIG" 2>/dev/null; then
      # Check that the platforms section is not all commented out
      if grep -E '^\[\[projects\.platforms\]\]' "$CC_CONFIG" >/dev/null 2>&1; then
        HAS_PLATFORM=true
      fi
    fi

    if [[ "$NO_START" != true && "$HAS_PLATFORM" == true ]]; then
      systemctl --user restart cc-connect.service 2>/dev/null || {
        warn "  cc-connect 启动失败 — 请检查配置"
      }
      sleep 3

      if systemctl --user is-active cc-connect &>/dev/null; then
        log "  ✅ cc-connect 运行中 (systemd, 开机自启)"
      else
        warn "  cc-connect 启动后退出 — 请检查日志: journalctl --user -u cc-connect"
      fi
    else
      if [[ "$HAS_PLATFORM" != true ]]; then
        log "  cc-connect 未启动 — 需要先配置平台"
        log "  快速配置："
        log "    cc-connect --config $CC_CONFIG feishu setup"
        log "    cc-connect --config $CC_CONFIG weixin setup"
        log "  配置后启动: systemctl --user restart cc-connect.service"
      fi
    fi

    log ""
    log "  📌 cc-connect 平台配置（可选，至少配一个才能启动）:"
    log "    飞书: cc-connect --config $CC_CONFIG feishu setup"
    log "    微信: cc-connect --config $CC_CONFIG weixin setup"
    log "    DMWork: 编辑 $CC_CONFIG 添加 bot_token"
    log "    配置后运行: systemctl --user restart cc-connect.service"
  fi
else
  log "Step 8/8: 跳过 cc-connect 配置"
fi

# =============================================================================
# 完成
# =============================================================================
echo ""
log "════════════════════════════════════════════════════════"
log "  ✅ 安装完成！"
log "════════════════════════════════════════════════════════"
echo ""
log "运行健康检查："
log "  bash ~/.openclaw/codex-docs-dmwork/resources/scripts/health-check.sh"
echo ""
log "启动 Codex："
log "  codex                    # 默认模型 ${CODEX_MODEL}"
log "  codex --model glm-5.1   # 切换模型"
echo ""
log "管理服务："
log "  systemctl --user status cli-proxy-api.service"
log "  systemctl --user status cli-proxy-api.service-compact-proxy"
log "  systemctl --user restart cli-proxy-api.service cpa-compact-proxy"
echo ""
log "查看日志："
log "  tail -f /tmp/cpa.log"
log "  tail -f /tmp/cpa-compact-proxy.log"
log "  journalctl --user -u cli-proxy-api.service -f"
