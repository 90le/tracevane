#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
API_PORT="${TRACEVANE_API_PORT:-3796}"
API_PID=""

cleanup() {
  if [ -n "$API_PID" ] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

cd "$ROOT_DIR"
TRACEVANE_API_PORT="$API_PORT" node scripts/start-standalone-api.mjs &
API_PID="$!"

for _ in $(seq 1 80); do
  if curl -fsS "http://127.0.0.1:${API_PORT}/api/files/summary" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$API_PID" 2>/dev/null; then
    wait "$API_PID"
  fi
  sleep 0.25
done

if ! curl -fsS "http://127.0.0.1:${API_PORT}/api/lsp/status" >/dev/null 2>&1; then
  echo "tracevane external API did not expose /api/lsp/status on ${API_PORT}" >&2
  exit 1
fi

TRACEVANE_USE_EXTERNAL_API=1 TRACEVANE_API_PORT="$API_PORT" bash scripts/dev-web-smoke.sh
