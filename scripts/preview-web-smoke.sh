#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
WEB_DIR="$ROOT_DIR/apps/web"
VITE_BIN="$ROOT_DIR/node_modules/.bin/vite"

cd "$WEB_DIR"
exec "$VITE_BIN" preview --host 127.0.0.1 --port 5176 --strictPort
