#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web-vue"
VITE_CACHE_DIR="$ROOT_DIR/apps/web-vue/node_modules/.vite"
VITE_BIN="$ROOT_DIR/node_modules/.bin/vite"

if [ -d "$VITE_CACHE_DIR" ]; then
  find "$VITE_CACHE_DIR" -mindepth 1 -maxdepth 1 -type d -name 'deps_temp_*' -exec rm -rf {} +
fi

cd "$WEB_DIR"

if [ "${OPENCLAW_STUDIO_SMOKE_FORCE_OPTIMIZE:-0}" = "1" ]; then
  rm -rf "$VITE_CACHE_DIR"
  "$VITE_BIN" optimize --force
elif [ "${OPENCLAW_STUDIO_SMOKE_SKIP_OPTIMIZE:-0}" != "1" ]; then
  "$VITE_BIN" optimize
fi

exec "$VITE_BIN"
