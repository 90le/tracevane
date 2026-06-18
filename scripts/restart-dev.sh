#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.tmp/dev-runtime"
PID_DIR="$RUNTIME_DIR/pids"
LOG_DIR="$RUNTIME_DIR/logs"

BACKEND_PID_FILE="$PID_DIR/backend.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
PORTS_FILE="$RUNTIME_DIR/ports.env"
BACKEND_LOG_FILE="$LOG_DIR/backend.log"
FRONTEND_LOG_FILE="$LOG_DIR/frontend.log"

REQUESTED_BACKEND_PORT="${TRACEVANE_API_PORT:-3761}"
FRONTEND_PORT="${TRACEVANE_WEB_PORT:-5176}"

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

tmux_session_name_for_pid_file() {
  local pid_file="$1"
  local base

  base="$(basename "$pid_file" .pid)"
  base="${base//[^[:alnum:]_-]/-}"
  echo "tracevane-dev-${base}"
}

stop_tmux_session_for_pid_file() {
  local pid_file="$1"
  local session_name=""

  if ! command_exists tmux; then
    return 1
  fi

  session_name="$(tmux_session_name_for_pid_file "$pid_file")"
  if ! tmux has-session -t "$session_name" >/dev/null 2>&1; then
    return 1
  fi
  tmux kill-session -t "$session_name" >/dev/null 2>&1 || true
  return 0
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
  if stop_tmux_session_for_pid_file "$pid_file"; then
    if [[ -n "$pid" ]]; then
      for _ in {1..20}; do
        if ! kill -0 "$pid" 2>/dev/null; then
          return 0
        fi
        sleep 0.25
      done
      kill "$pid" 2>/dev/null || true
    fi
    return 0
  fi

  if [[ -z "$pid" ]]; then
    return 0
  fi

  if ! kill -0 "$pid" 2>/dev/null; then
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

is_port_listening() {
  local port="$1"

  if command_exists ss; then
    ss -ltn "( sport = :${port} )" 2>/dev/null | tail -n +2 | grep -q .
    return
  fi

  if command_exists lsof; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi

  return 1
}

find_free_port() {
  local start_port="$1"
  local port="$start_port"

  while is_port_listening "$port"; do
    port=$((port + 1))
  done

  echo "$port"
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local max_attempts="${3:-80}"
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
  local output_var="$4"
  local pid=""
  local session_name=""
  local root_q=""
  local log_q=""
  local pid_q=""
  local command_q=""

  : > "$log_file"
  rm -f "$pid_file"

  if command_exists tmux; then
    session_name="$(tmux_session_name_for_pid_file "$pid_file")"
    tmux kill-session -t "$session_name" >/dev/null 2>&1 || true
    printf -v root_q '%q' "$ROOT_DIR"
    printf -v log_q '%q' "$log_file"
    printf -v pid_q '%q' "$pid_file"
    printf -v command_q '%q' "$command"
    tmux new-session -d -s "$session_name" "bash -lc 'set -u
root_dir=\"\$1\"
log_file=\"\$2\"
pid_file=\"\$3\"
command=\"\$4\"
cd \"\$root_dir\"
echo \$\$ > \"\$pid_file\"
while true; do
  printf \"\\n[restart-dev] starting %s at %s\\n\" \"\$command\" \"\$(date -Is)\" >>\"\$log_file\"
  bash -lc \"\$command\" >>\"\$log_file\" 2>&1
  status=\$?
  printf \"[restart-dev] command exited with status %s at %s; restarting in 1s\\n\" \"\$status\" \"\$(date -Is)\" >>\"\$log_file\"
  sleep 1
done' _ $root_q $log_q $pid_q $command_q"
  else
    setsid bash -c '
      set -u
      root_dir="$1"
      log_file="$2"
      pid_file="$3"
      command="$4"

      cd "$root_dir"
      echo "$$" > "$pid_file"
      while true; do
        printf "\n[restart-dev] starting %s at %s\n" "$command" "$(date -Is)" >>"$log_file"
        bash -lc "$command" </dev/null >>"$log_file" 2>&1
        status=$?
        printf "[restart-dev] command exited with status %s at %s; restarting in 1s\n" "$status" "$(date -Is)" >>"$log_file"
        sleep 1
      done
    ' _ "$ROOT_DIR" "$log_file" "$pid_file" "$command" >/dev/null 2>&1 &
  fi

  for _ in {1..20}; do
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ -n "$pid" ]]; then
      break
    fi
    sleep 0.05
  done

  if [[ -z "$pid" ]]; then
    echo "Failed to start background process. See $log_file" >&2
    return 1
  fi

  printf -v "$output_var" '%s' "$pid"
}

echo "Refreshing Tracevane dev processes"

stop_pid_file_process "$BACKEND_PID_FILE" "backend"
stop_pid_file_process "$FRONTEND_PID_FILE" "frontend"
stop_matching_processes "$ROOT_DIR/scripts/start-standalone-api.mjs" "backend"
stop_port_processes "$FRONTEND_PORT" "frontend"

BACKEND_PORT="$(find_free_port "$REQUESTED_BACKEND_PORT")"
if [[ "$BACKEND_PORT" != "$REQUESTED_BACKEND_PORT" ]]; then
  echo "Backend port $REQUESTED_BACKEND_PORT is busy, using $BACKEND_PORT instead"
fi

echo "Starting backend on port $BACKEND_PORT"
backend_pid=""
start_background "env TRACEVANE_API_PORT=$BACKEND_PORT npm run dev:api" "$BACKEND_LOG_FILE" "$BACKEND_PID_FILE" backend_pid
wait_for_http "http://127.0.0.1:${BACKEND_PORT}/api/system/health" "Backend"
if ! kill -0 "$backend_pid" 2>/dev/null; then
  echo "Backend process exited unexpectedly. See $BACKEND_LOG_FILE" >&2
  exit 1
fi

echo "Starting frontend on port $FRONTEND_PORT"
frontend_pid=""
start_background "env TRACEVANE_USE_EXTERNAL_API=1 TRACEVANE_API_PORT=$BACKEND_PORT TRACEVANE_WEB_PORT=$FRONTEND_PORT npm run dev --workspace=apps/web-vue -- --host 127.0.0.1 --port $FRONTEND_PORT --force" "$FRONTEND_LOG_FILE" "$FRONTEND_PID_FILE" frontend_pid
wait_for_http "http://127.0.0.1:${FRONTEND_PORT}" "Frontend"
if ! kill -0 "$frontend_pid" 2>/dev/null; then
  echo "Frontend process exited unexpectedly. See $FRONTEND_LOG_FILE" >&2
  exit 1
fi

cat > "$PORTS_FILE" <<EOF
TRACEVANE_API_PORT=$BACKEND_PORT
TRACEVANE_WEB_PORT=$FRONTEND_PORT
EOF

echo
echo "Tracevane dev processes are ready"
echo "Frontend: http://127.0.0.1:${FRONTEND_PORT} (pid=${frontend_pid})"
echo "Backend:  http://127.0.0.1:${BACKEND_PORT} (pid=${backend_pid})"
echo "Frontend log: ${FRONTEND_LOG_FILE}"
echo "Backend log:  ${BACKEND_LOG_FILE}"
echo "Ports file:   ${PORTS_FILE}"
