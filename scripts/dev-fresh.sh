#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.tmp/dev-fresh"
PID_DIR="$RUNTIME_DIR/pids"
LOG_DIR="$RUNTIME_DIR/logs"
ENV_FILE="$RUNTIME_DIR/runtime.env"

BACKEND_PID_FILE="$PID_DIR/backend.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
BACKEND_LOG_FILE="$LOG_DIR/backend.log"
FRONTEND_LOG_FILE="$LOG_DIR/frontend.log"

DEFAULT_API_PORT=3761
DEFAULT_WEB_PORT=5177
API_PORT="${STUDIO_API_PORT:-$DEFAULT_API_PORT}"
WEB_PORT="${STUDIO_WEB_PORT:-$DEFAULT_WEB_PORT}"
CLEAN_PORTS="${STUDIO_CLEAN_PORTS:-3760 3761 5176 5177}"

mkdir -p "$PID_DIR" "$LOG_DIR"

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

kill_pid_and_children() {
  local pid="$1"
  local signal="${2:-TERM}"
  local child

  if ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi

  if command_exists pgrep; then
    while read -r child; do
      [[ -z "$child" ]] && continue
      kill_pid_and_children "$child" "$signal"
    done < <(pgrep -P "$pid" || true)
  fi

  kill "-${signal}" "$pid" 2>/dev/null || true
}

kill_process_group() {
  local pid="$1"
  local pgid=""

  if ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi

  if command_exists ps; then
    pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d '[:space:]')"
  fi

  if [[ -n "$pgid" ]]; then
    kill -TERM "-$pgid" 2>/dev/null || true
    return 0
  fi

  kill_pid_and_children "$pid" TERM
}

force_kill_process_group() {
  local pid="$1"
  local pgid=""

  if ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi

  if command_exists ps; then
    pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d '[:space:]')"
  fi

  if [[ -n "$pgid" ]]; then
    kill -KILL "-$pgid" 2>/dev/null || true
    return 0
  fi

  kill_pid_and_children "$pid" KILL
}

stop_pid_file_process() {
  local pid_file="$1"
  local label="$2"
  local pid=""

  if [[ ! -f "$pid_file" ]]; then
    return 0
  fi

  pid="$(cat "$pid_file" 2>/dev/null || true)"
  rm -f "$pid_file"

  if [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi

  echo "Stopping previous $label process (pid=$pid)"
  kill_process_group "$pid"

  for _ in {1..20}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    sleep 0.25
  done

  echo "Force killing previous $label process (pid=$pid)"
  force_kill_process_group "$pid"
}

stop_port_processes() {
  local port="$1"
  local label="$2"
  local pids=""

  if command_exists lsof; then
    pids="$(lsof -ti "tcp:${port}" -sTCP:LISTEN 2>/dev/null || true)"
  elif command_exists fuser; then
    pids="$(fuser "${port}/tcp" 2>/dev/null || true)"
  fi

  [[ -z "$pids" ]] && return 0

  while read -r pid; do
    [[ -z "$pid" ]] && continue
    if ! kill -0 "$pid" 2>/dev/null; then
      continue
    fi
    echo "Stopping stale $label listener on port $port (pid=$pid)"
    kill_process_group "$pid"
    sleep 0.25
    if kill -0 "$pid" 2>/dev/null; then
      force_kill_process_group "$pid"
    fi
  done <<< "$pids"
}

stop_matching_processes() {
  local pattern="$1"
  local label="$2"
  local pid=""

  if ! command_exists pgrep; then
    return 0
  fi

  while read -r pid; do
    [[ -z "$pid" ]] && continue
    [[ "$pid" == "$$" ]] && continue
    if ! kill -0 "$pid" 2>/dev/null; then
      continue
    fi
    echo "Stopping previous $label process (pid=$pid)"
    kill_process_group "$pid"
    sleep 0.25
    if kill -0 "$pid" 2>/dev/null; then
      force_kill_process_group "$pid"
    fi
  done < <(pgrep -f "$pattern" || true)
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local max_attempts="${3:-120}"
  local attempt=0

  while (( attempt < max_attempts )); do
    if command_exists curl && curl --silent --show-error --fail --max-time 2 "$url" >/dev/null 2>&1; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 0.5
  done

  echo "$label did not become ready: $url" >&2
  return 1
}

start_background() {
  local command="$1"
  local log_file="$2"
  local pid_file="$3"

  : > "$log_file"

  (
    cd "$ROOT_DIR"
    exec setsid bash -lc "$command"
  ) >>"$log_file" 2>&1 &

  local pid=$!
  echo "$pid" > "$pid_file"
  echo "$pid"
}

echo "Refreshing OpenClaw Studio canonical dev runtime"
echo "Mode: frontend external-api -> standalone backend"
echo "Requested ports: web=$WEB_PORT api=$API_PORT"

stop_pid_file_process "$BACKEND_PID_FILE" "backend"
stop_pid_file_process "$FRONTEND_PID_FILE" "frontend"
stop_matching_processes "$ROOT_DIR/scripts/start-standalone-api.mjs" "backend"

for port in $CLEAN_PORTS; do
  stop_port_processes "$port" "dev runtime"
done

echo "Rebuilding backend dist and static web bundle from latest source"
(
  cd "$ROOT_DIR"
  npm run build:api
  npm run build:web
)

echo "Starting standalone backend on port $API_PORT"
backend_pid="$(start_background "STUDIO_API_PORT=$API_PORT node scripts/start-standalone-api.mjs" "$BACKEND_LOG_FILE" "$BACKEND_PID_FILE")"
wait_for_http "http://127.0.0.1:${API_PORT}/api/system/health" "Backend"
if ! kill -0 "$backend_pid" 2>/dev/null; then
  echo "Backend process exited unexpectedly. See $BACKEND_LOG_FILE" >&2
  exit 1
fi

echo "Starting frontend on port $WEB_PORT (proxying to $API_PORT)"
frontend_pid="$(start_background "STUDIO_USE_EXTERNAL_API=1 STUDIO_API_PORT=$API_PORT STUDIO_WEB_PORT=$WEB_PORT npm run dev --workspace=apps/web-vue -- --host 127.0.0.1 --port $WEB_PORT --force" "$FRONTEND_LOG_FILE" "$FRONTEND_PID_FILE")"
wait_for_http "http://127.0.0.1:${WEB_PORT}" "Frontend"
wait_for_http "http://127.0.0.1:${WEB_PORT}/api/system/health" "Frontend proxy"
if ! kill -0 "$frontend_pid" 2>/dev/null; then
  echo "Frontend process exited unexpectedly. See $FRONTEND_LOG_FILE" >&2
  exit 1
fi

cat > "$ENV_FILE" <<EOF
STUDIO_API_PORT=$API_PORT
STUDIO_WEB_PORT=$WEB_PORT
STUDIO_WEB_URL=http://127.0.0.1:$WEB_PORT
STUDIO_API_URL=http://127.0.0.1:$API_PORT
BACKEND_PID=$backend_pid
FRONTEND_PID=$frontend_pid
EOF

echo
echo "Canonical Studio dev runtime is ready"
echo "Web: http://127.0.0.1:$WEB_PORT"
echo "API: http://127.0.0.1:$API_PORT"
echo "Env: $ENV_FILE"
echo "Backend log: $BACKEND_LOG_FILE"
echo "Frontend log: $FRONTEND_LOG_FILE"
