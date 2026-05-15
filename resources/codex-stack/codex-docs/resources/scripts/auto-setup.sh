#!/usr/bin/env bash
set -euo pipefail

# Codex + CPA + Compact Proxy + cc-connect one-click installer.
# It reads the current user's ~/.openclaw/openclaw.json and writes local
# proxy/Codex/cc-connect configs for this machine. It never embeds maintainer
# credentials from the package.

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { printf '%b[setup]%b %s\n' "$GREEN" "$NC" "$*"; }
info() { printf '%b[info]%b %s\n' "$BLUE" "$NC" "$*"; }
warn() { printf '%b[warn]%b %s\n' "$YELLOW" "$NC" "$*"; }
die() { printf '%b[error]%b %s\n' "$RED" "$NC" "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
Usage: bash auto-setup.sh [options]

Options:
  --skip-npm           Do not run npm install -g updates.
  --skip-cc-connect    Do not install cc-connect package or write its skeleton config.
  --no-start           Write files only; do not start systemd user services.
  --help               Show this help.

Environment overrides:
  CPA_PORT=8317
  COMPACT_PORT=18796
  CPA_PROXY_KEY=openclaw-cpa-key
  CODEX_MODEL=glm-5.1
  OPENCLAW_UPSTREAM_BASE_URL=https://...
  OPENCLAW_UPSTREAM_API_KEY=...

The normal path needs no environment variables. The installer reads
~/.openclaw/openclaw.json and builds a fresh local stack for the current user.
USAGE
}

SKIP_NPM=false
SKIP_CC_CONNECT=false
NO_START=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-npm) SKIP_NPM=true; shift ;;
    --skip-cc-connect) SKIP_CC_CONNECT=true; shift ;;
    --no-start) NO_START=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESOURCES_DIR="$(dirname "$SCRIPT_DIR")"
OPENCLAW_JSON="${OPENCLAW_JSON:-$HOME/.openclaw/openclaw.json}"
CPA_CONFIG="${CPA_CONFIG:-$HOME/.cli-proxy-api/config.yaml}"
CODEX_CONFIG="${CODEX_CONFIG:-$HOME/.codex/config.toml}"
CC_CONFIG="${CC_CONNECT_CONFIG:-$HOME/.cc-connect/config.toml}"
CPA_PORT="${CPA_PORT:-8317}"
COMPACT_PORT="${COMPACT_PORT:-18796}"
CPA_PROXY_KEY="${CPA_PROXY_KEY:-openclaw-cpa-key}"
TS="$(date +%Y%m%d-%H%M%S)"

backup_file() {
  local path="$1"
  [[ -e "$path" ]] || return 0
  cp -a "$path" "${path}.bak.${TS}"
}

install_file() {
  local src="$1" dst="$2" mode="$3"
  [[ -f "$src" ]] || die "Missing package file: $src"
  mkdir -p "$(dirname "$dst")"
  backup_file "$dst"
  cp "$src" "$dst"
  chmod "$mode" "$dst"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required but not found"
}

require_systemd_user() {
  command -v systemctl >/dev/null 2>&1 || die "systemctl is required"
  systemctl --user status >/dev/null 2>&1 || die "systemd user manager is not available"
}

log "Codex stack installer"
require_cmd node
require_cmd npm
require_cmd curl
require_systemd_user

node -e 'const major=Number(process.versions.node.split(".")[0]); process.exit(major>=20?0:1)' \
  || die "Node.js 20+ is required; current version is $(node --version)"

[[ -f "$OPENCLAW_JSON" ]] || die "OpenClaw config not found: $OPENCLAW_JSON"

mkdir -p "$HOME/.local/bin" "$HOME/.cli-proxy-api" "$HOME/.codex" "$HOME/.cc-connect" "$HOME/.config/systemd/user"

if [[ "$SKIP_NPM" != true ]]; then
  log "Updating npm tools: @openai/codex, oh-my-codex, ws, cc-connect"
  if [[ "$SKIP_CC_CONNECT" == true ]]; then
    npm install -g @openai/codex oh-my-codex ws
  else
    npm install -g @openai/codex oh-my-codex ws cc-connect
  fi
else
  warn "Skipping npm updates because --skip-npm was provided"
fi

command -v codex >/dev/null 2>&1 || warn "codex command is not on PATH after installation"
command -v omx >/dev/null 2>&1 || warn "omx command is not on PATH after installation"
if [[ "$SKIP_CC_CONNECT" != true ]]; then
  command -v cc-connect >/dev/null 2>&1 || die "cc-connect command is not on PATH after installation"
fi

log "Installing local CPA and Compact Proxy files"
install_file "$RESOURCES_DIR/bin/cli-proxy-api" "$HOME/.local/bin/cli-proxy-api" 0755
install_file "$RESOURCES_DIR/cpa-config-templates/compact-proxy.mjs" "$HOME/.local/bin/cpa-compact-proxy.mjs" 0755

META_FILE="$(mktemp)"
trap 'rm -f "$META_FILE"' EXIT

log "Generating CPA config from $OPENCLAW_JSON"
export OPENCLAW_JSON CPA_CONFIG CPA_PORT COMPACT_PORT CPA_PROXY_KEY META_FILE CODEX_MODEL="${CODEX_MODEL:-}"
node <<'NODE'
const fs = require("fs");
const os = require("os");

const env = process.env;
const home = os.homedir();
const openclawPath = env.OPENCLAW_JSON;
const cpaConfig = env.CPA_CONFIG;
const cpaPort = Number(env.CPA_PORT || 8317);
const compactPort = Number(env.COMPACT_PORT || 18796);
const proxyKey = env.CPA_PROXY_KEY || "openclaw-cpa-key";

function sh(k, v) {
  fs.appendFileSync(env.META_FILE, `${k}=${JSON.stringify(String(v))}\n`);
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function q(v) {
  return JSON.stringify(String(v));
}

function modelName(m) {
  if (!m) return "";
  if (typeof m === "string") return m;
  return m.id || m.name || m.model || m.value || "";
}

function providerUrl(p) {
  return p && (p.baseUrl || p.baseURL || p.base_url || p.url || "");
}

function providerKey(p) {
  return p && (p.apiKey || p.api_key || p.key || p.token || "");
}

function isLocalLoop(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^\[|\]$/g, "");
    const port = Number(u.port || (u.protocol === "https:" ? 443 : 80));
    return ["127.0.0.1", "localhost", "::1"].includes(host) && [cpaPort, compactPort].includes(port);
  } catch {
    return false;
  }
}

function pushModel(models, name, alias) {
  if (!name) return;
  const key = `${name}\n${alias || ""}`;
  if (models.some((m) => `${m.name}\n${m.alias || ""}` === key)) return;
  models.push(alias ? { name, alias } : { name });
}

function enrichModels(id, url, declared) {
  const lower = `${id} ${url}`.toLowerCase();
  const models = [];
  for (const raw of declared || []) {
    const name = modelName(raw);
    if (name) pushModel(models, name, raw.alias || "");
  }

  if (lower.includes("bigmodel") || lower.includes("zhipu") || lower.includes("glm")) {
    ["glm-5.1", "glm-5", "glm-5-turbo", "glm-5v-turbo", "glm-4.7"].forEach((m) => pushModel(models, m));
  }

  if (lower.includes("mlamp")) {
    pushModel(models, "mlamp/kimi-k2.6", "kimi-k2.6");
    pushModel(models, "mlamp/deepseek-v4-flash", "deepseek-v4-flash");
    pushModel(models, "mlamp/qwen3-8b", "qwen3-8b");
    ["gpt-5.5", "gpt-5.4", "qwen3.6-max", "qwen3.6-plus", "qwen3.6-flash", "Doubao-Seed-2.0-Code", "hunyuan-t1-latest"]
      .forEach((m) => pushModel(models, m));
  }

  if (models.length === 0) {
    ["gpt-5.5", "gpt-5.4", "glm-5.1", "glm-5", "kimi-k2.6", "deepseek-v4-flash"].forEach((m) => pushModel(models, m));
  }
  return models;
}

function chooseDefault(providers) {
  const override = env.CODEX_MODEL;
  if (override) return override;
  const all = providers.flatMap((p) => p.models.flatMap((m) => [m.alias, m.name].filter(Boolean)));
  for (const preferred of ["glm-5.1", "gpt-5.5", "gpt-5.4", "kimi-k2.6", "deepseek-v4-flash"]) {
    if (all.includes(preferred)) return preferred;
  }
  return all[0] || "glm-5.1";
}

function writeCpaConfig(providers) {
  const lines = [
    "# Generated by codex-docs/resources/scripts/auto-setup.sh",
    `host: ${q("127.0.0.1")}`,
    `port: ${cpaPort}`,
    `auth-dir: ${q("~/.cli-proxy-api")}`,
    "api-keys:",
    `- ${q(proxyKey)}`,
    "debug: false",
    `proxy-url: ${q("direct")}`,
    "disable-cooling: true",
    "max-retry-credentials: 0",
    "request-retry: 3",
    "openai-compatibility:",
  ];

  for (const p of providers) {
    lines.push(`- name: ${q(p.name)}`);
    lines.push(`  base-url: ${q(p.baseUrl)}`);
    lines.push("  api-key-entries:");
    lines.push(`  - api-key: ${q(p.apiKey)}`);
    lines.push(`    proxy-url: ${q("direct")}`);
    lines.push("  models:");
    for (const m of p.models) {
      lines.push(`  - name: ${q(m.name)}`);
      if (m.alias) lines.push(`    alias: ${q(m.alias)}`);
    }
  }

  fs.mkdirSync(require("path").dirname(cpaConfig), { recursive: true });
  if (fs.existsSync(cpaConfig)) {
    fs.copyFileSync(cpaConfig, `${cpaConfig}.bak.${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}`);
  }
  fs.writeFileSync(cpaConfig, `${lines.join("\n")}\n`);
}

const openclaw = readJson(openclawPath);
const providers = [];

if (env.OPENCLAW_UPSTREAM_BASE_URL && env.OPENCLAW_UPSTREAM_API_KEY) {
  providers.push({
    name: "manual",
    baseUrl: env.OPENCLAW_UPSTREAM_BASE_URL,
    apiKey: env.OPENCLAW_UPSTREAM_API_KEY,
    models: enrichModels("manual", env.OPENCLAW_UPSTREAM_BASE_URL, []),
  });
}

const entries = Object.entries(openclaw.models?.providers || {});
for (const [id, p] of entries) {
  const baseUrl = providerUrl(p);
  const apiKey = providerKey(p);
  if (!baseUrl || !apiKey || isLocalLoop(baseUrl)) continue;
  const name = String(p.name || id).replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "openclaw";
  providers.push({
    name,
    baseUrl,
    apiKey,
    models: enrichModels(id, baseUrl, p.models || []),
  });
}

let preserved = false;
let effectiveCpaPort = cpaPort;
let defaultModel = chooseDefault(providers);

if (providers.length > 0) {
  writeCpaConfig(providers);
} else if (fs.existsSync(cpaConfig) && fs.readFileSync(cpaConfig, "utf8").includes("openai-compatibility:")) {
  preserved = true;
  const existing = fs.readFileSync(cpaConfig, "utf8");
  const portMatch = existing.match(/^port:\s*["']?(\d+)/m);
  if (portMatch) effectiveCpaPort = Number(portMatch[1]);
  for (const preferred of ["glm-5.1", "gpt-5.5", "gpt-5.4", "kimi-k2.6"]) {
    if (existing.includes(preferred)) {
      defaultModel = env.CODEX_MODEL || preferred;
      break;
    }
  }
} else {
  console.error("No upstream provider was found in openclaw.json.");
  console.error("If openclaw.json already points to a local CPA/Compact Proxy, set OPENCLAW_UPSTREAM_BASE_URL and OPENCLAW_UPSTREAM_API_KEY once.");
  process.exit(2);
}

sh("DEFAULT_MODEL", defaultModel);
sh("PROVIDER_COUNT", providers.length);
sh("PRESERVED_CPA_CONFIG", preserved ? "1" : "0");
sh("CPA_PORT_EFFECTIVE", effectiveCpaPort);
NODE

# shellcheck disable=SC1090
source "$META_FILE"
CPA_PORT="$CPA_PORT_EFFECTIVE"

if [[ "$PRESERVED_CPA_CONFIG" == "1" ]]; then
  warn "openclaw.json points to local proxy only; preserved existing upstream CPA config at $CPA_CONFIG"
else
  log "Wrote CPA config with $PROVIDER_COUNT upstream provider(s): $CPA_CONFIG"
fi
log "Default Codex model: $DEFAULT_MODEL"

log "Writing Codex config"
backup_file "$CODEX_CONFIG"
cat > "$CODEX_CONFIG" <<TOML
# Generated by codex-docs/resources/scripts/auto-setup.sh
suppress_unstable_features_warning = true
model_reasoning_effort = "medium"
developer_instructions = "You have oh-my-codex installed."

model = "$DEFAULT_MODEL"
model_provider = "cpa"
model_context_window = 1000000
model_auto_compact_token_limit = 900000
base_url = "http://127.0.0.1:$COMPACT_PORT/v1"

[model_providers.cpa]
name = "cpa"
base_url = "http://127.0.0.1:$COMPACT_PORT/v1"
wire_api = "responses"
experimental_bearer_token = "$CPA_PROXY_KEY"

[features]
responses_websockets = true
responses_websockets_v2 = true
multi_agent = true
child_agents_md = true
hooks = true
enable_request_compression = true

[agents]
max_threads = 6
max_depth = 2

[env]
USE_OMX_EXPLORE_CMD = "1"
NO_PROXY = "localhost,127.0.0.1,::1"
TOML

if [[ "$SKIP_CC_CONNECT" != true ]]; then
  log "Writing cc-connect skeleton config"
  backup_file "$CC_CONFIG"
  cat > "$CC_CONFIG" <<TOML
# Generated by codex-docs/resources/scripts/auto-setup.sh
language = "zh"

[display]
thinking_messages = true
tool_messages = true

[log]
level = "info"

[[projects]]
name = "main"
admin_from = "*"

[projects.agent]
type = "codex"

[projects.agent.options]
work_dir = "$HOME/.openclaw"
mode = "suggest"
model = "$DEFAULT_MODEL"

[stream_preview]
enabled = true
interval_ms = 1500

reset_on_idle_mins = 30
TOML
fi

log "Writing systemd user services"
backup_file "$HOME/.config/systemd/user/cli-proxy-api.service"
cat > "$HOME/.config/systemd/user/cli-proxy-api.service" <<UNIT
[Unit]
Description=CLI Proxy API for Codex/OpenClaw
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
ExecStart=%h/.local/bin/cli-proxy-api -config %h/.cli-proxy-api/config.yaml
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment=HTTP_PROXY=
Environment=HTTPS_PROXY=
Environment=NO_PROXY=localhost,127.0.0.1,::1

[Install]
WantedBy=default.target
UNIT

mkdir -p "$HOME/.config/systemd/user/cli-proxy-api.service.d"
cat > "$HOME/.config/systemd/user/cli-proxy-api.service.d/10-always-on.conf" <<UNIT
[Unit]
StartLimitIntervalSec=0

[Service]
Restart=always
RestartSec=5
UNIT

backup_file "$HOME/.config/systemd/user/cpa-compact-proxy.service"
cat > "$HOME/.config/systemd/user/cpa-compact-proxy.service" <<UNIT
[Unit]
Description=Compact Proxy for Codex Responses API
After=network-online.target cli-proxy-api.service
Wants=network-online.target cli-proxy-api.service
StartLimitIntervalSec=0

[Service]
Type=simple
ExecStart=/usr/bin/env node %h/.local/bin/cpa-compact-proxy.mjs
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
Environment=CPA_HOST=127.0.0.1
Environment=CPA_PORT=$CPA_PORT
Environment=LISTEN_HOST=127.0.0.1
Environment=LISTEN_PORT=$COMPACT_PORT
Environment=COMPACT_DEFAULT_MODEL=$DEFAULT_MODEL
Environment=HTTP_PROXY=
Environment=HTTPS_PROXY=
Environment=NO_PROXY=localhost,127.0.0.1,::1

[Install]
WantedBy=default.target
UNIT

mkdir -p "$HOME/.config/systemd/user/cpa-compact-proxy.service.d"
cat > "$HOME/.config/systemd/user/cpa-compact-proxy.service.d/10-always-on.conf" <<UNIT
[Unit]
StartLimitIntervalSec=0

[Service]
Restart=always
RestartSec=3
UNIT

log "Writing watchdog"
cat > "$HOME/.local/bin/codex-stack-watchdog.sh" <<'WATCHDOG'
#!/usr/bin/env bash
set -u

log() { printf '[%s] %s\n' "$(date -Is)" "$*"; }

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

codex_value() {
  awk -F '"' -v key="$1" '$0 ~ key"[[:space:]]*=" { print $2; exit }' "$HOME/.codex/config.toml" 2>/dev/null
}

CPA_KEY="$(codex_value experimental_bearer_token)"
[[ -n "$CPA_KEY" ]] || CPA_KEY="openclaw-cpa-key"
CPA_PORT="$(awk -F: '/^port:/ { gsub(/[^0-9]/, "", $2); print $2; exit }' "$HOME/.cli-proxy-api/config.yaml" 2>/dev/null)"
[[ -n "$CPA_PORT" ]] || CPA_PORT=8317
COMPACT_PORT="$(codex_value base_url | sed -nE 's#.*127\.0\.0\.1:([0-9]+)/.*#\1#p' | head -1)"
[[ -n "$COMPACT_PORT" ]] || COMPACT_PORT=18796

ensure_active cli-proxy-api.service
if ! curl -fsS --max-time 5 "http://127.0.0.1:${CPA_PORT}/healthz" >/dev/null 2>&1; then
  sleep 5
  curl -fsS --max-time 5 "http://127.0.0.1:${CPA_PORT}/healthz" >/dev/null 2>&1 || restart_unit cli-proxy-api.service "CPA healthz failed"
fi

ensure_active cpa-compact-proxy.service
if ! curl -fsS --max-time 8 "http://127.0.0.1:${COMPACT_PORT}/v1/models" \
  -H "Authorization: Bearer ${CPA_KEY}" >/dev/null 2>&1; then
  sleep 5
  curl -fsS --max-time 8 "http://127.0.0.1:${COMPACT_PORT}/v1/models" \
    -H "Authorization: Bearer ${CPA_KEY}" >/dev/null 2>&1 || restart_unit cpa-compact-proxy.service "Compact Proxy /v1/models failed"
fi

if systemctl --user list-unit-files cc-connect.service >/dev/null 2>&1; then
  ensure_active cc-connect.service
  if [[ ! -S "$HOME/.cc-connect/run/api.sock" ]]; then
    sleep 10
    [[ -S "$HOME/.cc-connect/run/api.sock" ]] || restart_unit cc-connect.service "cc-connect API socket missing"
  fi
fi
WATCHDOG
chmod +x "$HOME/.local/bin/codex-stack-watchdog.sh"

cat > "$HOME/.config/systemd/user/codex-stack-watchdog.service" <<UNIT
[Unit]
Description=Watchdog for Codex CPA stack
After=network-online.target cli-proxy-api.service cpa-compact-proxy.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=%h/.local/bin/codex-stack-watchdog.sh
StandardOutput=journal
StandardError=journal
UNIT

cat > "$HOME/.config/systemd/user/codex-stack-watchdog.timer" <<UNIT
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
UNIT

log "Enabling user service persistence"
if command -v loginctl >/dev/null 2>&1; then
  if ! loginctl show-user "$USER" -p Linger 2>/dev/null | grep -q '=yes'; then
    loginctl enable-linger "$USER" 2>/dev/null || warn "Could not enable linger automatically. Run: loginctl enable-linger $USER"
  fi
fi

systemctl --user daemon-reload

for old_unit in cpa.service cliproxyapi.service; do
  if systemctl --user list-unit-files "$old_unit" >/dev/null 2>&1; then
    warn "Disabling old conflicting unit: $old_unit"
    systemctl --user disable --now "$old_unit" >/dev/null 2>&1 || true
  fi
done

systemctl --user enable cli-proxy-api.service cpa-compact-proxy.service codex-stack-watchdog.timer

if [[ "$NO_START" != true ]]; then
  log "Starting services"
  systemctl --user restart cli-proxy-api.service
  sleep 2
  systemctl --user restart cpa-compact-proxy.service
  systemctl --user restart codex-stack-watchdog.timer
else
  warn "Skipping service start because --no-start was provided"
fi

log "Base stack installed"
info "CPA:            http://127.0.0.1:$CPA_PORT"
info "Compact Proxy:  http://127.0.0.1:$COMPACT_PORT/v1"
info "Codex model:    $DEFAULT_MODEL"
info "Codex config:   $CODEX_CONFIG"
info "CPA config:     $CPA_CONFIG"

if [[ "$SKIP_CC_CONNECT" != true ]]; then
  cat <<'NEXT'

cc-connect installation is complete:
  - npm package is installed and available on PATH.
  - ~/.cc-connect/config.toml has been generated for project "main".
  - The daemon will be installed after platform binding is present.

Next step: bind Feishu/Weixin accounts by scanning the QR codes:

  cc-connect feishu setup --project main
  cc-connect weixin setup --project main

After binding finishes, run the one-command cc-connect service finalizer:

  bash ~/.openclaw/codex-docs/resources/scripts/finish-cc-connect-setup.sh
  bash ~/.openclaw/codex-docs/resources/scripts/health-check.sh
NEXT
else
  info "cc-connect skipped"
fi
