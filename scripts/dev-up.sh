#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

free_port() {
  local port="$1"
  local pids=""

  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -ti "tcp:${port}" 2>/dev/null || true)"
  elif command -v fuser >/dev/null 2>&1; then
    pids="$(fuser "${port}/tcp" 2>/dev/null || true)"
  fi

  if [ -n "$pids" ]; then
    for pid in $pids; do
      kill "$pid" >/dev/null 2>&1 || true
    done
  fi
}

if [ -f "$ROOT/.env.dev" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env.dev"
  set +a
fi

SERVER_PORT="${SERVER_PORT:-5000}"
CONSOLE_PORT="${CONSOLE_PORT:-3000}"
WEB_PORT="${WEB_PORT:-3001}"
AI_API_ENABLED="${AI_API_ENABLED:-true}"
AI_API_PORT="${AI_API_PORT:-5555}"
AI_WORKER_ENABLED="${AI_WORKER_ENABLED:-false}"

pids=()
readiness_pids=()
declare -A pid_names=()

cleanup() {
  if [ "${#readiness_pids[@]}" -gt 0 ]; then
    kill "${readiness_pids[@]}" >/dev/null 2>&1 || true
    wait "${readiness_pids[@]}" >/dev/null 2>&1 || true
  fi

  if [ "${#pids[@]}" -gt 0 ]; then
    printf '\nStopping QuickVoice dev processes...\n'
    kill "${pids[@]}" >/dev/null 2>&1 || true
    wait "${pids[@]}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

prefix_log() {
  local name="$1"
  sed -u "s/^/[$name] /"
}

run_in_dir() {
  local dir="$1"
  shift

  cd "$ROOT/$dir"
  exec "$@"
}

run_ai_api() {
  cd "$ROOT/apps/ai"
  set -a
  # shellcheck disable=SC1091
  . .env.dev
  set +a
  export AI_API_PORT="$AI_API_PORT"
  exec .venv/bin/python main.py api
}

run_ai_worker() {
  cd "$ROOT/apps/ai"
  set -a
  # shellcheck disable=SC1091
  . .env.dev
  set +a
  exec .venv/bin/python main.py dev
}

start_background() {
  local name="$1"
  local display="$2"
  shift 2

  printf '[ok] starting %-12s %s\n' "$name" "$display"
  "$@" > >(prefix_log "$name") 2> >(prefix_log "$name" >&2) &
  local pid="$!"
  pids+=("$pid")
  pid_names["$pid"]="$name"
}

start_service() {
  local name="$1"
  local dir="$2"
  shift 2

  start_background "$name" "$*" run_in_dir "$dir" "$@"
}

ensure_ports_free() {
  free_port "$SERVER_PORT"
  free_port "$CONSOLE_PORT"
  free_port "$WEB_PORT"
  free_port "$AI_API_PORT"
}

print_service_summary() {
  printf '\nQuickVoice dev is starting:\n\n'
  printf 'Enabled services:\n'
  printf '  %-10s %s\n' "console" "http://localhost:${CONSOLE_PORT}"
  printf '  %-10s %s\n' "web" "http://localhost:${WEB_PORT}"
  printf '  %-10s %s\n' "api" "http://localhost:${SERVER_PORT}/api/v1/health"
  printf '  %-10s %s\n' "docs" "http://localhost:${SERVER_PORT}/api/v1/docs"

  if [ "$AI_API_ENABLED" = "true" ]; then
    printf '  %-10s %s\n' "ai-api" "http://localhost:${AI_API_PORT}/health"
  fi

  if [ "$AI_API_ENABLED" != "true" ] || [ "$AI_WORKER_ENABLED" != "true" ]; then
    printf '\nOptional services disabled:\n'
    if [ "$AI_API_ENABLED" != "true" ]; then
      printf '  %-10s %s\n' "ai-api" "set AI_API_ENABLED=true to start it"
    fi
    if [ "$AI_WORKER_ENABLED" != "true" ]; then
      printf '  %-10s %s\n' "ai-worker" "set AI_WORKER_ENABLED=true to start it"
    fi
  fi

  cat <<'EOF'

Readiness checks will report as services become reachable.
Press Ctrl-C to stop all processes.
EOF
}

wait_for_http() {
  local name="$1"
  local url="$2"
  local timeout="${3:-60}"

  (
    local deadline=$((SECONDS + timeout))
    while [ "$SECONDS" -lt "$deadline" ]; do
      if python3 - "$url" >/dev/null 2>&1 <<'PY'
from urllib.request import Request, urlopen
import sys

request = Request(sys.argv[1], headers={"User-Agent": "quickvoice-dev-up"})
try:
    with urlopen(request, timeout=1) as response:
        sys.exit(0 if 200 <= response.status < 500 else 1)
except Exception:
    sys.exit(1)
PY
      then
        printf '[ok] %s is reachable: %s\n' "$name" "$url"
        return
      fi
      sleep 2
    done

    printf '[warn] %s was not reachable after %ss: %s\n' "$name" "$timeout" "$url"
  ) &
  readiness_pids+=("$!")
}

start_readiness_checks() {
  wait_for_http "console" "http://localhost:${CONSOLE_PORT}" 90
  wait_for_http "web" "http://localhost:${WEB_PORT}" 90
  wait_for_http "api" "http://localhost:${SERVER_PORT}/api/v1/health" 90

  if [ "$AI_API_ENABLED" = "true" ]; then
    wait_for_http "ai-api" "http://localhost:${AI_API_PORT}/health" 90
  fi
}

wait_for_service_exit() {
  local status
  local exited_pid=""
  local failed_name="a dev service"

  set +e
  if help wait 2>/dev/null | grep -q -- "-p"; then
    wait -n -p exited_pid "${pids[@]}"
    status="$?"
  else
    wait -n "${pids[@]}"
    status="$?"
  fi
  set -e

  if [ -n "${exited_pid:-}" ]; then
    failed_name="${pid_names[$exited_pid]:-$failed_name}"
  fi

  printf '[fail] %s exited with status %s; stopping QuickVoice dev.\n' "$failed_name" "$status" >&2
  return "$status"
}

ensure_ports_free
start_service "server" "apps/server" env DOTENV_CONFIG_PATH=.env.dev PORT="$SERVER_PORT" pnpm dev
start_service "console" "apps/console" pnpm dev --port "$CONSOLE_PORT"
start_service "web" "apps/web" pnpm dev --port "$WEB_PORT"

if [ "$AI_API_ENABLED" = "true" ]; then
  start_background "ai-api" "python main.py api" run_ai_api
fi

if [ "$AI_WORKER_ENABLED" = "true" ]; then
  start_background "ai-worker" "python main.py dev" run_ai_worker
fi

print_service_summary
start_readiness_checks
wait_for_service_exit
