#!/bin/bash
# =============================================================================
# Codex + Studio Model Gateway + optional cc-connect bootstrap
# =============================================================================
# This installer prepares client-side config only. Studio API owns the daemon
# service template and starts the Gateway after its own smoke gates pass.
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESOURCES_DIR="$(dirname "$SCRIPT_DIR")"

SKIP_CC_CONNECT=false
SKIP_NPM=false
SKIP_EXISTING=false
FORCE_REINSTALL=false
NO_START=false
SKIP_COMPONENTS=""
FORCE_COMPONENTS=""

OPENCLAW_JSON="${OPENCLAW_JSON:-$HOME/.openclaw/openclaw.json}"
STUDIO_GATEWAY_HOST="${MODEL_GATEWAY_HOST:-127.0.0.1}"
STUDIO_GATEWAY_PORT="${MODEL_GATEWAY_PORT:-18796}"
STUDIO_GATEWAY_BASE_URL="${MODEL_GATEWAY_BASE_URL:-http://${STUDIO_GATEWAY_HOST}:${STUDIO_GATEWAY_PORT}}"
STUDIO_GATEWAY_BASE_URL="${STUDIO_GATEWAY_BASE_URL%/}"
STUDIO_GATEWAY_V1_BASE_URL="${STUDIO_GATEWAY_BASE_URL}/v1"
CODEX_CONTEXT_MODE="${CODEX_CONTEXT_MODE:-default}"
CODEX_CONTEXT_WINDOW="${CODEX_CONTEXT_WINDOW:-1050000}"

usage() {
  cat <<'USAGE'
Usage: bash auto-setup.sh [OPTIONS]

Options:
  --skip-cc-connect       Skip optional cc-connect bridge setup
  --skip-npm              Skip npm global install for codex/oh-my-codex
  --skip-existing         Skip installed codex/cc-connect binaries
  --force-reinstall       Reinstall codex/cc-connect when applicable
  --no-start              Do not start optional cc-connect service
  --skip=<comp,...>       Supported components: codex,cc-connect
  --force=<comp,...>      Supported components: codex,cc-connect

Environment:
  CODEX_MODEL             Default Codex model. Falls back to openclaw.json or gpt-5.5
  MODEL_GATEWAY_BASE_URL  Studio Gateway daemon base URL. Default: http://127.0.0.1:18796
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-cc-connect) SKIP_CC_CONNECT=true; shift ;;
    --skip-npm) SKIP_NPM=true; shift ;;
    --skip-existing) SKIP_EXISTING=true; shift ;;
    --force-reinstall) FORCE_REINSTALL=true; shift ;;
    --skip=*) SKIP_COMPONENTS="${1#--skip=}"; shift ;;
    --force=*) FORCE_COMPONENTS="${1#--force=}"; shift ;;
    --no-start) NO_START=true; shift ;;
    --help) usage; exit 0 ;;
    *) warn "未知参数: $1"; shift ;;
  esac
done

contains_component() {
  local list="$1"
  local comp="$2"
  [[ -z "$list" ]] && return 1
  local IFS=','
  for item in $list; do
    [[ "$item" == "$comp" ]] && return 0
  done
  return 1
}

should_skip() {
  local comp="$1"
  contains_component "$SKIP_COMPONENTS" "$comp" && return 0
  if [[ "$SKIP_EXISTING" == true ]]; then
    case "$comp" in
      codex) command -v codex >/dev/null 2>&1 && return 0 ;;
      cc-connect) [[ -x "$HOME/.local/bin/cc-connect" ]] && return 0 ;;
    esac
  fi
  return 1
}

should_force() {
  local comp="$1"
  [[ "$FORCE_REINSTALL" == true ]] && return 0
  contains_component "$FORCE_COMPONENTS" "$comp"
}

contains_component "$SKIP_COMPONENTS" "cc-connect" && SKIP_CC_CONNECT=true

read_openclaw_default_model() {
  [[ -f "$OPENCLAW_JSON" ]] || return 0
  OPENCLAW_JSON="$OPENCLAW_JSON" node <<'NODE' 2>/dev/null || true
const fs = require("fs");
const file = process.env.OPENCLAW_JSON;
const data = JSON.parse(fs.readFileSync(file, "utf8"));
function modelName(model) {
  if (!model) return "";
  if (typeof model === "string") return model;
  return model.id || model.name || model.model || model.value || "";
}
const providers = data.models?.providers || {};
const explicit = modelName(data.defaultModel) || modelName(data.models?.defaultModel) || modelName(data.models?.default);
if (explicit) {
  console.log(explicit);
  process.exit(0);
}
for (const provider of Object.values(providers)) {
  const models = Array.isArray(provider?.models) ? provider.models : [];
  for (const model of models) {
    const id = modelName(model);
    if (id) {
      console.log(id);
      process.exit(0);
    }
  }
}
NODE
}

no_proxy_value() {
  if [[ -n "${OPENCLAW_NO_PROXY:-}" ]]; then
    printf '%s\n' "$OPENCLAW_NO_PROXY"
  elif [[ -n "${NO_PROXY:-}" ]]; then
    printf '%s\n' "$NO_PROXY"
  else
    printf '%s\n' "localhost,127.0.0.1,::1"
  fi
}

write_codex_config() {
  if should_skip "codex"; then
    log "Step 2/4: 跳过 Codex 配置（--skip=codex）"
    return 0
  fi

  log "Step 2/4: 写入 Codex Studio Gateway 配置..."
  mkdir -p "$HOME/.codex"
  local config_file="$HOME/.codex/config.toml"
  if [[ -f "$config_file" ]]; then
    cp "$config_file" "/tmp/codex-config.toml.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
    log "  已备份现有 config.toml"
  fi

  local no_proxy
  no_proxy="$(no_proxy_value)"
  local context_toml=""
  if [[ "$CODEX_CONTEXT_MODE" == "codex-1m" || "$CODEX_CONTEXT_MODE" == "custom" ]]; then
    if ! [[ "$CODEX_CONTEXT_WINDOW" =~ ^[0-9]+$ ]]; then
      CODEX_CONTEXT_WINDOW=1050000
    fi
    (( CODEX_CONTEXT_WINDOW < 1000 )) && CODEX_CONTEXT_WINDOW=1000
    (( CODEX_CONTEXT_WINDOW > 1050000 )) && CODEX_CONTEXT_WINDOW=1050000
    local auto_compact_limit=$(( CODEX_CONTEXT_WINDOW * 9 / 10 ))
    context_toml=$'model_context_window = '"${CODEX_CONTEXT_WINDOW}"$'\nmodel_auto_compact_token_limit = '"${auto_compact_limit}"$'\n'
  fi

  cat > "$config_file" << TOMLEOF
# Codex CLI config generated by Studio Gateway bootstrap.
# The Studio API starts and manages openclaw-studio-model-gateway.service.

suppress_unstable_features_warning = true
model = "${CODEX_MODEL}"
model_reasoning_effort = "medium"
responses_websockets = false
responses_websockets_v2 = false
${context_toml}
developer_instructions = "You have oh-my-codex installed. AGENTS.md is the orchestration brain and main control surface."

[model_providers.studio]
name = "OpenClaw Studio Model Gateway"
base_url = "${STUDIO_GATEWAY_V1_BASE_URL}"
wire_api = "responses"
supports_websockets = false
experimental_bearer_token = "PROXY_MANAGED"

[features]
responses_websockets = false
responses_websockets_v2 = false
enable_request_compression = false
goals = true
multi_agent_v2 = true
multi_agent = true
child_agents_md = true
plugins = true
plugin_hooks = true

[shell_environment_policy.set]
USE_OMX_EXPLORE_CMD = "1"
NO_PROXY = "${no_proxy}"
OPENCLAW_NO_PROXY = "${no_proxy}"
TOMLEOF

  chmod 600 "$config_file" 2>/dev/null || true
  log "  Codex 配置写入: $config_file"
  log "  已准备 inactive studio provider；实际接管由 Studio smoke gate 后完成"
}

install_codex_cli() {
  if [[ "$SKIP_NPM" == true ]]; then
    log "Step 1/4: 跳过 npm 安装（--skip-npm）"
    return 0
  fi

  log "Step 1/4: 检查 Codex CLI + oh-my-codex..."
  if should_skip "codex"; then
    log "  跳过 Codex CLI（已安装或 --skip=codex）"
  elif should_force "codex" || ! command -v codex >/dev/null 2>&1; then
    npm install -g @openai/codex
    log "  Codex CLI 安装完成"
  else
    log "  Codex CLI 已安装: $(codex --version 2>/dev/null || echo 'ok')"
  fi

  if should_force "codex" || ! command -v omx >/dev/null 2>&1; then
    npm install -g oh-my-codex
    log "  oh-my-codex 安装完成"
  else
    log "  oh-my-codex 已安装"
  fi
}

install_cc_connect_binary() {
  [[ "$SKIP_CC_CONNECT" == true ]] && return 0
  should_skip "cc-connect" && {
    log "Step 3/4: 跳过 cc-connect（已安装或 --skip=cc-connect）"
    return 0
  }

  log "Step 3/4: 安装可选 cc-connect bridge..."
  mkdir -p "$HOME/.local/bin"
  local cc_bin="$RESOURCES_DIR/bin/cc-connect"
  if [[ ! -f "$cc_bin" ]]; then
    warn "  cc-connect 二进制未在资源包中找到，跳过"
    return 0
  fi

  if should_force "cc-connect" && [[ -x "$HOME/.local/bin/cc-connect" ]]; then
    rm -f "$HOME/.local/bin/cc-connect"
  fi
  cp "$cc_bin" "$HOME/.local/bin/cc-connect"
  chmod +x "$HOME/.local/bin/cc-connect"
  log "  cc-connect 已安装到 $HOME/.local/bin/cc-connect"

  if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    export PATH="$HOME/.local/bin:$PATH"
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc" 2>/dev/null || true
  fi
}

configure_cc_connect() {
  if [[ "$SKIP_CC_CONNECT" == true ]]; then
    log "Step 3/4: 跳过 cc-connect（--skip-cc-connect）"
    return 0
  fi
  [[ -x "$HOME/.local/bin/cc-connect" ]] || return 0

  log "Step 4/4: 配置可选 cc-connect bridge..."
  mkdir -p "$HOME/.cc-connect" "$HOME/.config/systemd/user"
  local cc_config="$HOME/.cc-connect/config.toml"
  if [[ ! -f "$cc_config" ]]; then
    cat > "$cc_config" << CCEOF
language = "zh"

[display]
thinking_messages = true
tool_messages = true

[log]
level = "info"

[[providers]]
name = "studio"
api_key = "PROXY_MANAGED"
openai_base_url = "${STUDIO_GATEWAY_V1_BASE_URL}"
base_url = "${STUDIO_GATEWAY_V1_BASE_URL}"
codex.env_key = "OPENAI_API_KEY"

[[projects]]
name = "main"

[projects.agent]
type = "codex"

[projects.agent.options]
work_dir = "$HOME/.openclaw"
mode = "suggest"
model = "${CODEX_MODEL}"

[stream_preview]
enabled = true
interval_ms = 1500
CCEOF
    log "  cc-connect 配置已写入: $cc_config"
    warn "  cc-connect 需要配置平台后再启动"
  else
    log "  保留现有 cc-connect 配置"
  fi

  local no_proxy
  no_proxy="$(no_proxy_value)"
  cat > "$HOME/.config/systemd/user/cc-connect.service" << SVCEOF
[Unit]
Description=cc-connect - AI Agent Chat Bridge
After=network-online.target openclaw-studio-model-gateway.service
Wants=openclaw-studio-model-gateway.service

[Service]
Type=simple
ExecStart=%h/.local/bin/cc-connect --force --config %h/.cc-connect/config.toml
WorkingDirectory=%h/.cc-connect
Restart=always
RestartSec=5
StandardOutput=append:/tmp/cc-connect.log
StandardError=append:/tmp/cc-connect.log
Environment=PATH=%h/.npm-global/bin:%h/.local/bin:/usr/local/bin:/usr/bin:/bin
Environment=OPENAI_API_KEY=PROXY_MANAGED
Environment=OPENCLAW_STUDIO_GATEWAY_BASE_URL=${STUDIO_GATEWAY_BASE_URL}
Environment=NO_PROXY=${no_proxy}
Environment=OPENCLAW_NO_PROXY=${no_proxy}

[Install]
WantedBy=default.target
SVCEOF

  systemctl --user daemon-reload >/dev/null 2>&1 || true
  systemctl --user enable cc-connect.service >/dev/null 2>&1 || true

  local has_platform=false
  grep -Eq '^\[\[projects\.platforms\]\]' "$cc_config" 2>/dev/null && has_platform=true
  if [[ "$NO_START" != true && "$has_platform" == true ]]; then
    systemctl --user restart cc-connect.service >/dev/null 2>&1 || warn "  cc-connect 启动失败，请检查平台配置"
  else
    log "  cc-connect 未启动；配置平台后运行: systemctl --user restart cc-connect.service"
  fi
}

log "════════════════════════════════════════════════════════"
log "  Codex Studio Gateway bootstrap"
log "════════════════════════════════════════════════════════"

command -v node >/dev/null 2>&1 || err "Node.js 未安装。请先安装 Node.js 20+。"
command -v npm >/dev/null 2>&1 || err "npm 未安装。"
log "Node.js $(node --version)"
log "npm $(npm --version)"

OPENCLAW_DEFAULT_MODEL="$(read_openclaw_default_model)"
CODEX_MODEL="${CODEX_MODEL:-${OPENCLAW_DEFAULT_MODEL:-gpt-5.5}}"
log "Codex 默认模型: ${CODEX_MODEL}"
log "Studio Gateway: ${STUDIO_GATEWAY_BASE_URL}"

install_codex_cli
write_codex_config
install_cc_connect_binary
configure_cc_connect

echo ""
log "安装准备完成。下一步由 Studio API 写入并启动 openclaw-studio-model-gateway.service。"
log "健康检查: bash ~/.openclaw/codex-docs/resources/scripts/health-check.sh"
log "Codex 在 smoke gate 通过前不会被强制切到 studio provider。"
