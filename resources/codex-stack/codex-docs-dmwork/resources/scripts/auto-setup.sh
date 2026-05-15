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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESOURCES_DIR="$(dirname "$SCRIPT_DIR")"

while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-cc-connect) SKIP_CC_CONNECT=true; shift ;;
    --help)
      echo "Usage: bash auto-setup.sh [OPTIONS]"
      echo ""
      echo "  --skip-cc-connect   跳过 cc-connect 安装"
      echo ""
      echo "  自动从 ~/.openclaw/openclaw.json 读取网关配置。"
      echo "  无需手动提供 API Key 或网关地址。"
      exit 0 ;;
    *) warn "未知参数: $1"; shift ;;
  esac
done

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
CPA_PROXY_KEY="mlamp-proxy-key"

log "  主网关: $GATEWAY_URL"
[[ -n "$MLAMP_URL" ]] && log "  mlamp 网关: $MLAMP_URL"
[[ -n "$BIGMODEL_URL" ]] && log "  bigmodel 网关: $BIGMODEL_URL"
[[ -n "$HTTP_PROXY_VAL" ]] && log "  系统代理: $HTTP_PROXY_VAL"

# =============================================================================
# Step 2: 安装 Codex CLI + oh-my-codex
# =============================================================================
log "Step 2/8: 安装 Codex CLI + oh-my-codex..."

if ! command -v codex &>/dev/null; then
  npm install -g @openai/codex
  log "  Codex CLI 安装完成"
else
  log "  Codex CLI 已安装: $(codex --version 2>/dev/null || echo 'ok')"
fi

if ! command -v omx &>/dev/null; then
  npm install -g oh-my-codex
  log "  oh-my-codex 安装完成"
else
  log "  oh-my-codex 已安装"
fi

# ws 模块（Compact Proxy 依赖）
if ! node -e "require('ws')" &>/dev/null 2>&1; then
  log "  安装 ws 模块..."
  npm install -g ws 2>/dev/null || true
  # 如果全局安装失败，确保 openclaw 的 node_modules 有 ws
  if [[ -d "$HOME/.openclaw/node_modules" ]]; then
    cd "$HOME/.openclaw" && npm install ws 2>/dev/null || true
    cd - > /dev/null
  fi
fi

# =============================================================================
# Step 3: 安装 cc-connect（dmwork 增强版二进制）
# =============================================================================
if [[ "$SKIP_CC_CONNECT" != true ]]; then
  log "Step 3/8: 安装 cc-connect (dmwork 增强版)..."
  mkdir -p "$HOME/.local/bin"
  CC_BIN="$RESOURCES_DIR/bin/cc-connect"
  if [[ -f "$CC_BIN" ]]; then
    cp "$CC_BIN" "$HOME/.local/bin/cc-connect"
    chmod +x "$HOME/.local/bin/cc-connect"
    log "  cc-connect 二进制已安装: $(du -h "$HOME/.local/bin/cc-connect" | cut -f1)"
  else
    # Fallback: 从 tar.gz 提取
    CC_TGZ="$RESOURCES_DIR/../cc-connect-dmwork-linux-x86_64.tar.gz"
    if [[ -f "$CC_TGZ" ]]; then
      tar xzf "$CC_TGZ" -C "$HOME/.local/bin/" 2>/dev/null
      chmod +x "$HOME/.local/bin/cc-connect" 2>/dev/null
      log "  cc-connect 从 tar.gz 安装"
    else
      warn "  cc-connect 二进制未找到，跳过。可手动安装到 ~/.local/bin/cc-connect"
    fi
  fi
  # Ensure PATH includes ~/.local/bin
  if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
    export PATH="$HOME/.local/bin:$PATH"
    log "  已添加 ~/.local/bin 到 PATH"
  fi
else
  log "Step 3/8: 跳过 cc-connect（--skip-cc-connect）"
fi

# =============================================================================
# Step 4: 部署 CPA 二进制 + Compact Proxy
# =============================================================================
log "Step 4/8: 部署 CPA + Compact Proxy..."

mkdir -p "$HOME/.local/bin"

# 部署 CPA 二进制
if [[ -x "$HOME/.local/bin/cli-proxy-api" ]]; then
  log "  CPA 已存在于 ~/.local/bin/cli-proxy-api"
else
  # 尝试从资源目录复制
  if [[ -f "$RESOURCES_DIR/bin/cli-proxy-api" ]]; then
    cp "$RESOURCES_DIR/bin/cli-proxy-api" "$HOME/.local/bin/cli-proxy-api"
    chmod +x "$HOME/.local/bin/cli-proxy-api"
    log "  CPA 从资源目录复制完成"
  elif [[ -f "$RESOURCES_DIR/cpa-config-templates/cli-proxy-api" ]]; then
    cp "$RESOURCES_DIR/cpa-config-templates/cli-proxy-api" "$HOME/.local/bin/cli-proxy-api"
    chmod +x "$HOME/.local/bin/cli-proxy-api"
    log "  CPA 从模板目录复制完成"
  else
    warn "  CPA 二进制未在资源包中找到"
    warn "  请手动将 cli-proxy-api 放到 ~/.local/bin/"
    warn "  获取方式：从组织内部源下载或通过管理员获取"
  fi
fi

# 部署 Compact Proxy v5 (Node.js)
if [[ -f "$HOME/.local/bin/cpa-compact-proxy.mjs" ]]; then
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
log "Step 5/8: 生成 CPA 配置..."


mkdir -p "$HOME/.cli-proxy-api"

# 构建 openai-compatibility providers
CPA_CONFIG="$HOME/.cli-proxy-api/config.yaml"

# 开始写入配置
cat > "$CPA_CONFIG" << YAMLEOF
host: 127.0.0.1
port: 18795
auth-dir: ~/.cli-proxy-api
api-keys:
- ${CPA_PROXY_KEY}
debug: false
proxy-url: direct
disable-cooling: true
max-retry-credentials: 0
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
log "Step 6/8: 生成 Codex 配置..."

mkdir -p "$HOME/.codex"

CODEX_CONFIG="$HOME/.codex/config.toml"

# 备份现有配置
if [[ -f "$CODEX_CONFIG" ]]; then
  cp "$CODEX_CONFIG" "$CODEX_CONFIG.bak.$(date +%Y%m%d%H%M%S)"
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
# 默认模型: kimi-k2.6

suppress_unstable_features_warning = true

# OMX 通知
notify = ["node", "$HOME/.npm-global/lib/node_modules/oh-my-codex/dist/scripts/notify-hook.js"]

model_reasoning_effort = "medium"

developer_instructions = "You have oh-my-codex installed. AGENTS.md is the orchestration brain and main control surface."

# ── 模型配置 ──
model = "kimi-k2.6"
openai_base_url = "http://127.0.0.1:18796/v1"

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

# =============================================================================
# Step 7: 创建 systemd 进程守护
# =============================================================================
log "Step 7/8: 创建 systemd 进程守护..."

mkdir -p "$HOME/.config/systemd/user"

# CPA service
cat > "$HOME/.config/systemd/user/cli-proxy-api.service" << 'SVCEOF'
[Unit]
Description=CPA cli-proxy-api - Responses API Proxy
After=network.target

[Service]
Type=simple
ExecStart=%h/.local/bin/cli-proxy-api\nWorkingDirectory=%h/.cli-proxy-api --config %h/.config/cli-proxy-api/config.yaml
Restart=always
RestartSec=5
StandardOutput=append:/tmp/cpa.log
StandardError=append:/tmp/cpa.log

# 确保不走系统代理访问本地
Environment=HTTP_PROXY=
Environment=HTTPS_PROXY=
Environment=NO_PROXY=localhost,127.0.0.1,::1

[Install]
WantedBy=default.target
SVCEOF

# Compact Proxy service
cat > "$HOME/.config/systemd/user/cpa-compact-proxy.service" << 'SVCEOF'
[Unit]
Description=CPA Compact Proxy v5 (Node.js)
After=network.target cpa.service
Wants=cpa.service

[Service]
Type=simple
ExecStart=$(which node || echo /usr/bin/node) %h/.local/bin/cpa-compact-proxy.mjs
Restart=always
RestartSec=3
StandardOutput=append:/tmp/cpa-compact-proxy.log
StandardError=append:/tmp/cpa-compact-proxy.log

Environment=HTTP_PROXY=
Environment=HTTPS_PROXY=
Environment=NO_PROXY=localhost,127.0.0.1,::1

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
if ss -tlnp 2>/dev/null | grep -q ':18795'; then
  log "  ✅ CPA 运行在 127.0.0.1:18795"
else
  warn "  CPA 端口 18795 未监听"
fi

if ss -tlnp 2>/dev/null | grep -q ':18796'; then
  log "  ✅ Compact Proxy 运行在 127.0.0.1:18796"
else
  warn "  Compact Proxy 端口 18796 未监听"
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
      cp "$CC_CONFIG" "$CC_CONFIG.bak.$(date +%Y%m%d%H%M%S)"
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
base_url = "http://127.0.0.1:18796/v1"
codex.env_key = "OPENAI_API_KEY"

# ── 项目配置 ──
[[projects]]
name = "main"

# 管理员用户（可执行特权命令）
# 获取方式: journalctl --user -u cc-connect --since "5 min ago" | grep "user="
# admin_from = "YOUR_USER_IDS"

[projects.agent]
type = "codex"

[projects.agent.options]
work_dir = "$HOME/.openclaw"
mode = "suggest"
model = "kimi-k2.6"

[stream_preview]
enabled = true
interval_ms = 1500

reset_on_idle_mins = 30
CCEOF
      log "  cc-connect 配置已写入: $CC_CONFIG"
    else
      log "  保留现有 cc-connect 配置"
    fi

    # ── systemd 守护进程 ──
    mkdir -p "$HOME/.config/systemd/user"
    cat > "$HOME/.config/systemd/user/cc-connect.service" << 'SVCEOF'
[Unit]
Description=cc-connect - AI Agent Chat Bridge
After=network-online.target cpa.service cpa-compact-proxy.service
Wants=cpa.service

[Service]
Type=simple
ExecStart=%h/.local/bin/cc-connect -config %h/.cc-connect/config.toml
WorkingDirectory=%h/.cc-connect
Restart=always
RestartSec=5
StartLimitIntervalSec=60
StartLimitBurst=5

StandardOutput=append:/tmp/cc-connect.log
StandardError=append:/tmp/cc-connect.log

Environment=OPENAI_API_KEY=mlamp-proxy-key

# 不走系统代理访问本地
Environment=HTTP_PROXY=
Environment=HTTPS_PROXY=
Environment=NO_PROXY=localhost,127.0.0.1,::1

[Install]
WantedBy=default.target
SVCEOF

    systemctl --user daemon-reload
    systemctl --user enable cc-connect.service 2>/dev/null || true
    systemctl --user restart cc-connect.service.service 2>/dev/null || {
      warn "  cc-connect 首次启动，可能需要配置平台后再启动"
    }
    sleep 2

    if systemctl --user is-active cc-connect &>/dev/null; then
      log "  ✅ cc-connect 运行中 (systemd, 开机自启)"
    else
      log "  ⚠️  cc-connect 未运行 — 需要配置平台后启动"
      log "      编辑 $CC_CONFIG 添加平台配置后运行:"
      log "      systemctl --user restart cc-connect.service"
    fi

    log ""
    log "  📌 平台配置提示："
    log "    飞书: 在 config.toml 中添加 [[projects.platforms]] type="feishu""
    log "    DMWork: 在 config.toml 中添加 [[projects.platforms]] type="dmwork""
    log "    配置后运行: systemctl --user restart cc-connect.service"
    log "    获取管理员 ID: journalctl --user -u cc-connect --since '5 min ago' | grep user="
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
log "  bash ~/.openclaw/codex-docs/resources/scripts/health-check.sh"
echo ""
log "启动 Codex："
log "  codex                    # 默认模型 kimi-k2.6"
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
