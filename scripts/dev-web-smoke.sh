#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
WEB_DIR="$ROOT_DIR/apps/web"
TRACEVANE_SMOKE_PORT="${TRACEVANE_WEB_PORT:-5176}"
VITE_CACHE_DIR="${TRACEVANE_VITE_CACHE_DIR:-$ROOT_DIR/tmp/.tracevane-vite-smoke-$TRACEVANE_SMOKE_PORT}"
export TRACEVANE_VITE_CACHE_DIR="$VITE_CACHE_DIR"
export TRACEVANE_SMOKE_DISABLE_WATCH="${TRACEVANE_SMOKE_DISABLE_WATCH:-1}"
VITE_BIN="$ROOT_DIR/node_modules/.bin/vite"

# Smoke tests need a deterministic dependency cache. A stale Vite optimized-deps
# graph can return 504 "Outdated Optimize Dep" during the first Playwright page
# load, before the Workspace tree renders. Clean temp dirs every run; by default
# rebuild the optimize cache once before starting the server.
if [ -d "$VITE_CACHE_DIR" ]; then
  find "$VITE_CACHE_DIR" -mindepth 1 -maxdepth 1 -type d -name 'deps_temp_*' -exec rm -rf {} +
fi
mkdir -p "$(dirname "$VITE_CACHE_DIR")"

# Vite can leave bundled config timestamp modules under .vite-temp. Remove
# them for smoke runs so the in-process API always reflects current TypeScript
# route registrations.
find "$WEB_DIR" -maxdepth 1 -type f -name 'vite.config.ts.timestamp-*.mjs' -delete
find "$WEB_DIR/node_modules" -path '*/.vite-temp/vite.config.ts.timestamp-*.mjs' -type f -delete 2>/dev/null || true

cd "$WEB_DIR"

if [ "${TRACEVANE_SMOKE_SKIP_OPTIMIZE:-0}" != "1" ]; then
  rm -rf "$VITE_CACHE_DIR"
  "$VITE_BIN" optimize --force || true
fi

exec "$VITE_BIN" --force
