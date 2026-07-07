#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
API_PORT="${TRACEVANE_API_PORT:-3796}"
API_PID=""
WEB_PID=""
API_LOG_FILE="${TRACEVANE_EXTERNAL_API_LOG_FILE:-$ROOT_DIR/tmp/tracevane-external-api-${API_PORT}.log}"
WEB_LOG_FILE="${TRACEVANE_EXTERNAL_WEB_LOG_FILE:-$ROOT_DIR/tmp/tracevane-external-web-${TRACEVANE_WEB_PORT:-5176}.log}"

cleanup() {
  if [ -n "$WEB_PID" ]; then
    kill -- -"$WEB_PID" 2>/dev/null || kill "$WEB_PID" 2>/dev/null || true
    wait "$WEB_PID" 2>/dev/null || true
  fi
  if [ -n "$API_PID" ]; then
    kill -- -"$API_PID" 2>/dev/null || kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

cd "$ROOT_DIR"
mkdir -p "$(dirname "$API_LOG_FILE")" "$(dirname "$WEB_LOG_FILE")"
: > "$API_LOG_FILE"
: > "$WEB_LOG_FILE"
TRACEVANE_API_PORT="$API_PORT" setsid node scripts/start-standalone-api.mjs >>"$API_LOG_FILE" 2>&1 &
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
  echo "tracevane external API did not expose /api/lsp/status on ${API_PORT}; log: $API_LOG_FILE" >&2
  tail -80 "$API_LOG_FILE" >&2 || true
  exit 1
fi

TRACEVANE_USE_EXTERNAL_API=1 TRACEVANE_API_PORT="$API_PORT" setsid bash scripts/dev-web-smoke.sh >>"$WEB_LOG_FILE" 2>&1 &
WEB_PID="$!"
wait "$WEB_PID"
