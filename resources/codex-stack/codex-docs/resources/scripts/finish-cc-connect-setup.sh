#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { printf '%b[cc]%b %s\n' "$GREEN" "$NC" "$*"; }
info() { printf '%b[info]%b %s\n' "$BLUE" "$NC" "$*"; }
warn() { printf '%b[warn]%b %s\n' "$YELLOW" "$NC" "$*"; }
die() { printf '%b[error]%b %s\n' "$RED" "$NC" "$*" >&2; exit 1; }

CONFIG="${CC_CONNECT_CONFIG:-$HOME/.cc-connect/config.toml}"
PROJECT="${CC_CONNECT_PROJECT:-main}"
TS="$(date +%Y%m%d-%H%M%S)"

usage() {
  cat <<'USAGE'
Usage: bash finish-cc-connect-setup.sh [options]

Options:
  --project NAME       Project name, default: main
  --no-admin-all       Do not rewrite admin_from/allow_from to "*".
  --help              Show this help.

Before running this script, bind your accounts manually:

  cc-connect feishu setup --project main
  cc-connect weixin setup --project main

Then this script will make the project admin-ready, install/reinstall the
cc-connect daemon, enable it at boot, and start it.
USAGE
}

ADMIN_ALL=true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT="${2:-}"; [[ -n "$PROJECT" ]] || die "--project needs a value"; shift 2 ;;
    --no-admin-all) ADMIN_ALL=false; shift ;;
    --help|-h) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done

command -v cc-connect >/dev/null 2>&1 || die "cc-connect is not installed. Run auto-setup.sh first."
[[ -f "$CONFIG" ]] || die "cc-connect config not found: $CONFIG"

if ! grep -q 'projects\.platforms' "$CONFIG"; then
  cat >&2 <<EOF
No cc-connect platform binding was found in $CONFIG.

Run the binding commands first and scan the QR codes:

  cc-connect feishu setup --project $PROJECT
  cc-connect weixin setup --project $PROJECT

Then run this script again.
EOF
  exit 2
fi

cp -a "$CONFIG" "${CONFIG}.bak.${TS}"

if [[ "$ADMIN_ALL" == true ]]; then
  log "Setting project/platform permissions to admin-all for personal use"
  export CONFIG PROJECT
  node <<'NODE'
const fs = require("fs");
const path = process.env.CONFIG;
const project = process.env.PROJECT || "main";
const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
const out = [];
let inProject = false;
let projectMatched = false;
let sawProjectAdmin = false;
let pendingProjectAdmin = false;
let inPlatformOptions = false;
let sawAllowFrom = false;

function flushPendingProjectAdmin() {
  if (pendingProjectAdmin && !sawProjectAdmin) out.push('admin_from = "*"');
  pendingProjectAdmin = false;
  sawProjectAdmin = sawProjectAdmin || projectMatched;
}

function flushPlatformOptions() {
  if (inPlatformOptions && !sawAllowFrom) out.push('allow_from = "*"');
  inPlatformOptions = false;
  sawAllowFrom = false;
}

function flushProject() {
  flushPlatformOptions();
  if (inProject && projectMatched) flushPendingProjectAdmin();
  inProject = false;
  projectMatched = false;
  sawProjectAdmin = false;
  pendingProjectAdmin = false;
}

for (const line of lines) {
  const trimmed = line.trim();
  if (trimmed === "[[projects]]") {
    flushProject();
    inProject = true;
    projectMatched = false;
    sawProjectAdmin = false;
    pendingProjectAdmin = false;
    out.push(line);
    continue;
  }

  if (inProject && projectMatched && pendingProjectAdmin && trimmed.startsWith("[")) {
    flushPendingProjectAdmin();
  }

  if (trimmed.startsWith("[") && trimmed !== "[projects.platforms.options]") {
    flushPlatformOptions();
  }

  if (inProject && /^name\s*=/.test(trimmed)) {
    const name = trimmed.match(/^name\s*=\s*"([^"]+)"/)?.[1] || "";
    projectMatched = name === project;
    pendingProjectAdmin = projectMatched;
    out.push(line);
    continue;
  }

  if (inProject && projectMatched && /^admin_from\s*=/.test(trimmed)) {
    out.push('admin_from = "*"');
    sawProjectAdmin = true;
    pendingProjectAdmin = false;
    continue;
  }

  if (inProject && projectMatched && trimmed === "[projects.platforms.options]") {
    flushPlatformOptions();
    inPlatformOptions = true;
    sawAllowFrom = false;
    out.push(line);
    continue;
  }

  if (inProject && projectMatched && inPlatformOptions && /^allow_from\s*=/.test(trimmed)) {
    out.push('allow_from = "*"');
    sawAllowFrom = true;
    continue;
  }

  out.push(line);
}
flushProject();
fs.writeFileSync(path, out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/g, "") + "\n");
NODE
else
  warn "Leaving permissions unchanged because --no-admin-all was provided"
fi

log "Installing cc-connect daemon"
cc-connect daemon uninstall --config "$CONFIG" >/dev/null 2>&1 || true
cc-connect daemon install --config "$CONFIG"

if command -v loginctl >/dev/null 2>&1; then
  if ! loginctl show-user "$USER" -p Linger 2>/dev/null | grep -q '=yes'; then
    loginctl enable-linger "$USER" 2>/dev/null || warn "Could not enable linger automatically. Run: loginctl enable-linger $USER"
  fi
fi

systemctl --user daemon-reload >/dev/null 2>&1 || true
if systemctl --user list-unit-files cc-connect.service >/dev/null 2>&1; then
  mkdir -p "$HOME/.config/systemd/user/cc-connect.service.d"
  cat > "$HOME/.config/systemd/user/cc-connect.service.d/10-always-on.conf" <<UNIT
[Unit]
StartLimitIntervalSec=0

[Service]
Restart=always
RestartSec=5
UNIT
  systemctl --user daemon-reload
  systemctl --user enable cc-connect.service >/dev/null 2>&1 || true
  systemctl --user restart cc-connect.service
fi

log "cc-connect daemon is ready"
cc-connect daemon status --config "$CONFIG" || true

cat <<EOF

Next verification:

  bash ~/.openclaw/codex-docs/resources/scripts/health-check.sh

Then send a message to Feishu or Weixin. Because admin_from/allow_from are "*",
your bound account can use the configured Codex project immediately.
EOF
