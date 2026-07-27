#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT/docker-compose.dev.yml"
ENV_EXAMPLE="$ROOT/.env.dev.example"

failures=0

fail() {
  printf '[fail] %s\n' "$1" >&2
  failures=$((failures + 1))
}

ok() {
  printf '[ok] %s\n' "$1"
}

warn() {
  printf '[warn] %s\n' "$1"
}

load_dev_env() {
  local env_file="$ROOT/.env.dev"
  if [ ! -f "$env_file" ]; then
    env_file="$ENV_EXAMPLE"
  fi

  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
}

check_env_templates() {
  local templates=(
    "$ROOT/.env.dev.example"
    "$ROOT/apps/server/.env.dev.example"
    "$ROOT/apps/ai/.env.dev.example"
    "$ROOT/apps/console/.env.dev.example"
    "$ROOT/apps/web/.env.dev.example"
  )

  for template in "${templates[@]}"; do
    if [ -s "$template" ]; then
      ok "env template exists: ${template#$ROOT/}"
    else
      fail "env template is missing or empty: ${template#$ROOT/}"
    fi
  done
}

check_port() {
  local port="$1"
  local label="$2"

  if python3 - "$port" <<'PY'
import socket
import sys

port = int(sys.argv[1])
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    sock.settimeout(0.2)
    sys.exit(0 if sock.connect_ex(("127.0.0.1", port)) == 0 else 1)
PY
  then
    warn "$label port $port is already accepting connections on localhost"
  else
    ok "$label port $port is available on localhost"
  fi
}

check_redis() {
  local url="${REDIS_URL:-redis://localhost:6379}"
  local port
  port="$(python3 - "$url" <<'PY'
from urllib.parse import urlparse
import sys

parsed = urlparse(sys.argv[1])
print(parsed.port or 6379)
PY
)"

  if python3 - "$port" <<'PY'
import socket
import sys

port = int(sys.argv[1])
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    sock.settimeout(0.3)
    sys.exit(0 if sock.connect_ex(("127.0.0.1", port)) == 0 else 1)
PY
  then
    ok "Redis is reachable at $url"
  else
    warn "Redis is not reachable at $url yet; run task docker:up to start it"
  fi
}

check_compose_health() {
  local service="$1"
  local container
  container="$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_EXAMPLE" ps -q "$service" 2>/dev/null || true)"

  if [ -z "$container" ]; then
    warn "Docker Compose service is not running: $service"
    return
  fi

  local health
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)"
  case "$health" in
    healthy|running)
      ok "Docker Compose service $service is $health"
      ;;
    starting)
      warn "Docker Compose service $service is starting"
      ;;
    *)
      fail "Docker Compose service $service is unhealthy: ${health:-unknown}"
      ;;
  esac
}

check_env_templates

if [ "${BASH_VERSINFO[0]}" -ge 4 ]; then
  ok "Bash is installed: ${BASH_VERSION}"
else
  fail "Bash >= 4 is required by the development scripts. Found: ${BASH_VERSION}"
fi

if command -v task >/dev/null 2>&1; then
  ok "go-task is installed: $(task --version | head -n 1)"
else
  fail "go-task is not installed. Install it with: go install github.com/go-task/task/v3/cmd/task@latest"
fi

if command -v go >/dev/null 2>&1; then
  ok "Go is installed: $(go version)"
else
  warn "Go is not installed. It is only needed if you install go-task via go install."
fi

if command -v node >/dev/null 2>&1; then
  if node -e 'const [major, minor] = process.versions.node.split(".").map(Number); const supported = (major === 20 && minor >= 19) || (major === 22 && minor >= 13) || major >= 24; process.exit(supported ? 0 : 1)' >/dev/null 2>&1; then
    ok "Node.js is installed: $(node -v)"
  else
    fail "Node.js ^20.19, ^22.13, or >=24 is required. Found: $(node -v)"
  fi
else
  fail "Node.js ^20.19, ^22.13, or >=24 is required."
fi

if command -v corepack >/dev/null 2>&1; then
  ok "corepack is installed"
else
  fail "corepack is required to activate pnpm@9.0.0."
fi

if command -v python3 >/dev/null 2>&1; then
  ok "Python is installed: $(python3 --version)"
  load_dev_env
  check_port "${SERVER_PORT:-5000}" "server"
  check_port "${CONSOLE_PORT:-3000}" "console"
  check_port "${WEB_PORT:-3001}" "web"
  check_port "${POSTGRES_PORT:-5432}" "Postgres"
  check_port "${REDIS_PORT:-6379}" "Redis"
  check_port "${AI_API_PORT:-5555}" "AI API"
  check_redis
else
  fail "python3 is required for apps/ai."
fi

if command -v docker >/dev/null 2>&1; then
  ok "Docker CLI is installed"
  if docker compose version >/dev/null 2>&1; then
    ok "Docker Compose v2 is installed: $(docker compose version --short)"
    if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_EXAMPLE" config >/dev/null; then
      ok "Docker Compose dev file is valid"
    else
      fail "Docker Compose dev file is invalid"
    fi
  else
    fail "Docker Compose v2 plugin is required."
  fi

  if docker info >/dev/null 2>&1; then
    ok "Docker daemon is reachable"
    check_compose_health postgres
    check_compose_health redis
  else
    fail "Docker daemon is not reachable. Start Docker or add your user to the docker group."
  fi
else
  fail "Docker is required for local Postgres and Redis."
fi

if [ "$failures" -gt 0 ]; then
  cat >&2 <<'EOF'

Install hints for Ubuntu or WSL2:
  sudo apt-get update
  sudo apt-get install -y docker.io docker-compose-v2 golang-go python3 python3-venv
  sudo usermod -aG docker "$USER"
  go install github.com/go-task/task/v3/cmd/task@latest
  export PATH="$PATH:$HOME/go/bin"

Install Node.js ^20.19, ^22.13, or >=24 with a Node version manager or the official Node.js
packages; the Node.js version in a distribution repository may be too old.
After changing docker group membership, reconnect your SSH session.
EOF
  exit 1
fi
