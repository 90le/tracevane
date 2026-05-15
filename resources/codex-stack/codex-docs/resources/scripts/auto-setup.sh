#!/usr/bin/env bash
set -euo pipefail

# Codex + CPA + Compact Proxy + cc-connect smart installer.
# Supports incremental installs: skips already-installed components,
# safely replaces running binaries, and detects live ports.

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log()   { printf '%b[setup]%b %s\n' "$GREEN" "$NC" "$*"; }
info()  { printf '%b[info]%b %s\n' "$BLUE" "$NC" "$*"; }
warn()  { printf '%b[warn]%b %s\n' "$YELLOW" "$NC" "$*"; }
die()   { printf '%b[error]%b %s\n' "$RED" "$NC" "$*" >&2; exit 1; }
skip()  { printf '%b[skip]%b %s\n' "$CYAN" "$NC" "$*"; }

usage() {
  cat <<'USAGE'
Usage: bash auto-setup.sh [options]

Options:
  --skip-npm           Do not run npm install -g updates.
  --skip-cc-connect    Do not install cc-connect package or write its skeleton config.
  --skip-existing      Skip components that are already installed and running.
  --force-reinstall    Force reinstall all components even if already present.
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
SKIP_EXISTING=false
FORCE_REINSTALL=false
NO_START=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-npm) SKIP_NPM=true; shift ;;
    --skip-cc-connect) SKIP_CC_CONNECT=true; shift ;;
    --skip-existing) SKIP_EXISTING=true; shift ;;
    --force-reinstall) FORCE_REINSTALL=true; shift ;;
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

# ── Dynamic port detection ────────────────────────────────────────
detect_cpa_port() {
  local port=""
  # 1. Try config file
  if [[ -f "$CPA_CONFIG" ]]; then
    port="$(awk -F: '/^port:/ { gsub(/[^0-9]/, "", $2); print $2; exit }' "$CPA_CONFIG" 2>/dev/null)"
  fi
  # 2. Try running process
  if [[ -z "$port" ]] && command -v ss >/dev/null 2>&1; then
    port="$(ss -tlnp 2>/dev/null | grep 'cli-proxy-api' | head -1 | grep -oP ':\K\d+' || true)"
  fi
  # 3. Try systemd show
  if [[ -z "$port" ]] && systemctl --user show cli-proxy-api.service 2>/dev/null | grep -q 'ActiveState=active'; then
    port="$(systemctl --user show cli-proxy-api.service -p ExecStart 2>/dev/null | grep -oP '\d+' | tail -1 || true)"
  fi
  echo "${port:-$CPA_PORT}"
}

detect_compact_port() {
  local port=""
  # 1. Try codex config base_url
  if [[ -f "$CODEX_CONFIG" ]]; then
    port="$(awk -F '"' '/base_url/ { match($0, /127\.0\.0\.1:([0-9]+)/, a); if (a[1]) print a[1]; exit }' "$CODEX_CONFIG" 2>/dev/null)"
  fi
  # 2. Try running process
  if [[ -z "$port" ]] && command -v ss >/dev/null 2>&1; then
    port="$(ss -tlnp 2>/dev/null | grep 'compact-proxy\|cpa-compact' | head -1 | grep -oP ':\K\d+' || true)"
  fi
  # 3. Try env file in systemd unit
  if [[ -z "$port" ]] && [[ -f "$HOME/.config/systemd/user/cpa-compact-proxy.service" ]]; then
    port="$(grep '^LISTEN_PORT=' "$HOME/.config/systemd/user/cpa-compact-proxy.service" 2>/dev/null | head -1 | grep -oP '\d+' || true)"
  fi
  echo "${port:-$COMPACT_PORT}"
}

# Detect live ports and use them as defaults
DETECTED_CPA_PORT="$(detect_cpa_port)"
DETECTED_COMPACT_PORT="$(detect_compact_port)"

# Environment overrides still take precedence over detected ports
CPA_PORT="${CPA_PORT:-$DETECTED_CPA_PORT}"
COMPACT_PORT="${COMPACT_PORT:-$DETECTED_COMPACT_PORT}"

backup_file() {
  local path="$1"
  [[ -e "$path" ]] || return 0
  cp -a "$path" "${path}.bak.${TS}"
}

# Safely replace a binary: stop the service first if running
install_binary() {
  local src="$1" dst="$2" mode="$3" service_name="${4:-}"
  [[ -f "$src" ]] || die "Missing package file: $src"
  mkdir -p "$(dirname "$dst")"

  local needs_stop=false
  if [[ -x "$dst" ]] && [[ -n "$service_name" ]]; then
    if systemctl --user is-active --quiet "$service_name" 2>/dev/null; then
      needs_stop=true
    fi
  fi

  if $needs_stop; then
    log "Stopping $service_name to safely replace binary"
    systemctl --user stop "$service_name" 2>/dev/null || true
    sleep 1
  fi

  backup_file "$dst"
  cp "$src" "$dst"
  chmod "$mode" "$dst"

  if $needs_stop; then
    log "Restarting $service_name after binary update"
    systemctl --user start "$service_name" 2>/dev/null || true
  fi
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

# ── Component status checks ───────────────────────────────────────
component_installed() {
  local name="$1"
  case "$name" in
    codex)
      command -v codex >/dev/null 2>&1
      ;;
    cpa)
      [[ -x "$HOME/.local/bin/cli-proxy-api" ]] && [[ -f "$CPA_CONFIG" ]]
      ;;
    compact-proxy)
      [[ -x "$HOME/.local/bin/cpa-compact-proxy.mjs" ]]
      ;;
    cc-connect)
      command -v cc-connect >/dev/null 2>&1 && [[ -f "$CC_CONFIG" ]]
      ;;
    watchdog)
      [[ -x "$HOME/.local/bin/codex-stack-watchdog.sh" ]] && \
        systemctl --user list-unit-files codex-stack-watchdog.timer >/dev/null 2>&1
      ;;
  esac
}

component_running() {
  local service="$1"
  systemctl --user is-active --quiet "$service" 2>/dev/null
}

# ── Pre-flight ────────────────────────────────────────────────────
log "Codex stack installer"
require_cmd node
require_cmd npm
require_cmd curl
require_systemd_user

node -e 'const major=Number(process.versions.node.split(".")[0]); process.exit(major>=20?0:1)' \
  || die "Node.js 20+ is required; current version is $(node --version)"

[[ -f "$OPENCLAW_JSON" ]] || die "OpenClaw config not found: $OPENCLAW_JSON"

mkdir -p "$HOME/.local/bin" "$HOME/.cli-proxy-api" "$HOME/.codex" "$HOME/.cc-connect" "$HOME/.config/systemd/user"

# ── Report current state ──────────────────────────────────────────
info "Detected CPA port: $CPA_PORT"
info "Detected Compact port: $COMPACT_PORT"
info "Skip existing: $SKIP_EXISTING | Force reinstall: $FORCE_REINSTALL"

for comp in codex cpa compact-proxy cc-connect watchdog; do
  if component_installed "$comp"; then
    info "Already installed: $comp"
  else
    info "Not installed: $comp"
  fi
done

# ── NPM packages ──────────────────────────────────────────────────
if [[ "$SKIP_NPM" != true ]]; then
  # Check if npm packages need updating
  NPM_NEEDS_UPDATE=false
  if ! command -v codex >/dev/null 2>&1; then
    NPM_NEEDS_UPDATE=true
  fi
  if ! command -v omx >/dev/null 2>&1; then
    NPM_NEEDS_UPDATE=true
  fi
  if [[ "$SKIP_CC_CONNECT" != true ]] && ! command -v cc-connect >/dev/null 2>&1; then
    NPM_NEEDS_UPDATE=true
  fi

  if $FORCE_REINSTALL || $NPM_NEEDS_UPDATE; then
    log "Updating npm tools: @openai/codex, oh-my-codex, ws, cc-connect"
    if [[ "$SKIP_CC_CONNECT" == true ]]; then
      npm install -g @openai/codex oh-my-codex ws
    else
      npm install -g @openai/codex oh-my-codex ws cc-connect
    fi
  else
    skip "npm tools already up to date (use --force-reinstall to force)"
  fi
else
  warn "Skipping npm updates because --skip-npm was provided"
fi

command -v codex >/dev/null 2>&1 || warn "codex command is not on PATH after installation"
command -v omx >/dev/null 2>&1 || warn "omx command is not on PATH after installation"
if [[ "$SKIP_CC_CONNECT" != true ]]; then
  command -v cc-connect >/dev/null 2>&1 || die "cc-connect command is not on PATH after installation"
fi

# ── CPA binary ────────────────────────────────────────────────────
if $SKIP_EXISTING && component_installed cpa && component_running cli-proxy-api.service && ! $FORCE_REINSTALL; then
  skip "CPA binary already installed and running"
else
  log "Installing local CPA binary"
  install_binary "$RESOURCES_DIR/bin/cli-proxy-api" "$HOME/.local/bin/cli-proxy-api" 0755 "cli-proxy-api.service"
fi

# ── Compact Proxy script ──────────────────────────────────────────
if $SKIP_EXISTING && component_installed compact-proxy && ! $FORCE_REINSTALL; then
  skip "Compact Proxy script already installed"
else
  log "Installing Compact Proxy script"
  install_file "$RESOURCES_DIR/cpa-config-templates/compact-proxy.mjs" "$HOME/.local/bin/cpa-compact-proxy.mjs" 0755
fi

# ── Config generation ─────────────────────────────────────────────
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

let openclaw;
try {
  openclaw = readJson(openclawPath);
} catch (e) {
  process.stderr.write(`Cannot read ${openclawPath}: ${e.message}\n`);
  process.exit(1);
}

const upstreamBase = env.OPENCLAW_UPSTREAM_BASE_URL || (openclaw.upstream && openclaw.upstream.baseUrl) || "";
const upstreamKey  = env.OPENCLAW_UPSTREAM_API_KEY  || (openclaw.upstream && openclaw.upstream.apiKey)  || "";
const model = env.CODEX_MODEL || modelName(openclaw.defaultModel) || "glm-5.1";

sh("OPENCLAW_UPSTREAM_BASE_URL", upstreamBase);
sh("OPENCLAW_UPSTREAM_API_KEY", upstreamKey);
sh("CODEX_MODEL", model);
sh("CPA_PORT", cpaPort);
sh("COMPACT_PORT", compactPort);

if (!upstreamBase || !upstreamKey) {
  process.stderr.write(
    `Warning: upstream base URL or API key is empty. CPA will use environment defaults.\n`
  );
}

// ── CPA config.yaml ────────────────────────────────────────────────
const cpaYaml = [
  `port: ${cpaPort}`,
  `upstream_base_url: ${q(upstreamBase)}`,
  `upstream_api_key: ${q(upstreamKey)}`,
  `experimental_bearer_token: ${q(proxyKey)}`,
  `allowed_models:`,
  `  - "*"`,
].join("\n") + "\n";

const cpaDir = env.CPA_CONFIG ? require("path").dirname(env.CPA_CONFIG) : `${home}/.cli-proxy-api`;
fs.mkdirSync(cpaDir, { recursive: true });
fs.writeFileSync(env.CPA_CONFIG || `${home}/.cli-proxy-api/config.yaml`, cpaYaml);

// ── Codex config.toml ──────────────────────────────────────────────
const codexPath = env.CODEX_CONFIG || `${home}/.codex/config.toml`;
const codexDir = require("path").dirname(codexPath);
fs.mkdirSync(codexDir, { recursive: true });

let codexToml = "";
try { codexToml = fs.readFileSync(codexPath, "utf8"); } catch {}
const codexLines = [];
const seenKeys = new Set();

function setKey(lines, key, value, existing) {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const re = new RegExp(`^(\\s*${key}\\s*=\\s*)"[^"]*"(\\s*)$`, "m");
  if (re.test(existing)) {
    return existing.replace(re, `$1"${escaped}"$2`);
  }
  return existing + `${key} = "${escaped}"\n`;
}

codexToml = setKey(codexToml, "model_provider", "cpa", codexToml);
codexToml = setKey(codexToml, "model", model, codexToml);
codexToml = setKey(codexToml, "base_url", `http://127.0.0.1:${compactPort}/v1`, codexToml);
codexToml = setKey(codexToml, "experimental_bearer_token", proxyKey, codexToml);

if (!/responses_websockets\s*=/.test(codexToml)) codexToml += "responses_websockets = true\n";
if (!/responses_websockets_v2\s*=/.test(codexToml)) codexToml += "responses_websockets_v2 = true\n";

fs.writeFileSync(codexPath, codexToml);

// ── cc-connect config.toml (skeleton) ──────────────────────────────
if (env.SKIP_CC_CONNECT !== "true") {
  const ccPath = env.CC_CONNECT_CONFIG || `${home}/.cc-connect/config.toml`;
  const ccDir = require("path").dirname(ccPath);
  fs.mkdirSync(ccDir, { recursive: true });
  const ccProject = env.CC_CONNECT_PROJECT || "main";
  if (!fs.existsSync(ccPath)) {
    const ccToml = [
      `# cc-connect configuration`,
      `[[projects]]`,
      `name = ${q(ccProject)}`,
      `default = true`,
      `[[projects.platforms]]`,
      `type = "feishu"`,
      `[[projects.platforms]]`,
      `type = "weixin"`,
    ].join("\n") + "\n";
    fs.writeFileSync(ccPath, ccToml);
  }
}

sh("DONE", "yes");
NODE

if [[ "$(grep -c '^DONE=' "$META_FILE" 2>/dev/null)" -eq 0 ]]; then
  die "Config generation failed"
fi

# ── Source metadata from node script ──────────────────────────────
source "$META_FILE"
DEFAULT_MODEL="${CODEX_MODEL:-glm-5.1}"
info "Model: $DEFAULT_MODEL"
info "Upstream base URL: ${OPENCLAW_UPSTREAM_BASE_URL:-(none)}"
info "CPA port: $CPA_PORT"
info "Compact port: $COMPACT_PORT"

# ── systemd units ─────────────────────────────────────────────────
log "Writing systemd user units"

cat > "$HOME/.config/systemd/user/cli-proxy-api.service" <<UNIT
[Unit]
Description=CPA (cli-proxy-api) for Codex
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$HOME/.local/bin/cli-proxy-api
Environment=NO_PROXY=localhost,127.0.0.1,::1
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
UNIT

COMPACT_ESC="$(echo "$HOME" | sed 's/\//\\\\/g')"
cat > "$HOME/.config/systemd/user/cpa-compact-proxy.service" <<UNIT
[Unit]
Description=Compact Proxy for CPA
After=network-online.target cli-proxy-api.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=$(which node 2>/dev/null || echo /usr/bin/node) $HOME/.local/bin/cpa-compact-proxy.mjs
Environment=CPA_PORT=$CPA_PORT
Environment=LISTEN_PORT=$COMPACT_PORT
Environment=CPA_KEY=$CPA_PROXY_KEY
Environment=COMPACT_DEFAULT_MODEL=$DEFAULT_MODEL
Environment=NO_PROXY=localhost,127.0.0.1,::1
Restart=on-failure
RestartSec=5

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

# ── Watchdog ──────────────────────────────────────────────────────
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

# ── Service management ───────────────────────────────────────────
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
  # Start CPA first, wait for health, then compact proxy
  systemctl --user restart cli-proxy-api.service
  sleep 2
  # Verify CPA is healthy before starting compact proxy
  if curl -fsS --max-time 5 "http://127.0.0.1:${CPA_PORT}/healthz" >/dev/null 2>&1; then
    info "CPA health check passed on port $CPA_PORT"
  else
    warn "CPA health check failed on port $CPA_PORT, starting compact proxy anyway"
  fi
  systemctl --user restart cpa-compact-proxy.service
  sleep 2
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
