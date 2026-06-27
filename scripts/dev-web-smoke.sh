#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
WEB_DIR="$ROOT_DIR/apps/web"
VITE_CACHE_DIR="$ROOT_DIR/apps/web/node_modules/.vite"
VITE_BIN="$ROOT_DIR/node_modules/.bin/vite"

# Smoke tests need a deterministic dependency cache. A stale Vite optimized-deps
# graph can return 504 "Outdated Optimize Dep" during the first Playwright page
# load, before the Workspace tree renders. Clean temp dirs every run; by default
# rebuild the optimize cache once before starting the server.
if [ -d "$VITE_CACHE_DIR" ]; then
  find "$VITE_CACHE_DIR" -mindepth 1 -maxdepth 1 -type d -name 'deps_temp_*' -exec rm -rf {} +
fi

cd "$WEB_DIR"

if [ "${TRACEVANE_SMOKE_SKIP_OPTIMIZE:-0}" != "1" ]; then
  rm -rf "$VITE_CACHE_DIR"
  "$VITE_BIN" optimize --force || true
fi

exec "$VITE_BIN"
