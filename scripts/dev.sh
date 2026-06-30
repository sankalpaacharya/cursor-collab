#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
  YELLOW=$'\033[33m'; CYAN=$'\033[36m'; MAGENTA=$'\033[35m'; BLUE=$'\033[34m'; NC=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; CYAN=""; MAGENTA=""; BLUE=""; NC=""
fi
info()  { printf "%s▸%s %s\n" "$CYAN" "$NC" "$*"; }
ok()    { printf "%s✓%s %s\n" "$GREEN" "$NC" "$*"; }
warn()  { printf "%s!%s %s\n" "$YELLOW" "$NC" "$*"; }
die()   { printf "%s✗ %s%s\n" "$RED" "$*" "$NC" >&2; exit 1; }

usage() {
  cat <<'EOF'
Live Cursors — interactive setup & run.

  ./start                 Show the menu (setup / dev / docker / tests).
  ./start --dev           Setup if needed, then run backend + client.
  ./start --install       Install dependencies only.
  ./start --docker        Full topology (Redis + 2 backends + Caddy).
  ./start --test          Run the test suite.
  ./start --help

Local dev runs Redis (reusing one on :6379 or starting a container), the
backend on :3001, and the Vite client on :5173 which proxies WebSocket traffic
to the backend. Press Ctrl-C to stop.
EOF
}

banner() {
  printf "%s%s" "$BOLD" "$CYAN"
  cat <<'ART'

   ____ _   _ ____  ____   ___  ____
  / ___| | | |  _ \/ ___| / _ \|  _ \
 | |   | | | | |_) \___ \| | | | |_) |
 | |___| |_| |  _ < ___) | |_| |  _ <
  \____|\___/|_| \_\____/ \___/|_| \_\
ART
  printf "%s" "$NC"
  printf "  %sLive Cursors%s — real-time shared workspace\n\n" "$DIM" "$NC"
}

require_node() {
  command -v node >/dev/null || die "node is not installed (need >= 22, >= 23 recommended)"
  local major; major="$(node -p 'process.versions.node.split(".")[0]')"
  (( major >= 22 )) || die "node $(node -v) is too old; need >= 22"
  (( major >= 23 )) || warn "node $(node -v): TypeScript runs via type-stripping; >= 23 is smoother."
}

ensure_pnpm() {
  command -v pnpm >/dev/null && return 0
  info "pnpm not found — enabling it via corepack…"
  corepack enable pnpm >/dev/null 2>&1 || corepack enable >/dev/null 2>&1 \
    || die "could not enable pnpm; install it with: npm i -g pnpm"
  command -v pnpm >/dev/null || die "pnpm still unavailable after corepack enable"
  ok "pnpm ready ($(pnpm --version))."
}

deps_present() {
  [[ -d node_modules && -d server/node_modules && -d client/node_modules ]]
}

do_install() {
  require_node; ensure_pnpm
  info "Installing dependencies…"
  pnpm install
  ok "Dependencies installed."
}

ensure_installed() {
  require_node; ensure_pnpm
  if deps_present; then
    [[ "${SKIP_INSTALL:-false}" == "true" ]] || ok "Dependencies already installed."
    return 0
  fi
  info "Installing dependencies…"
  pnpm install
  ok "Dependencies installed."
}

do_test() {
  ensure_installed
  info "Running tests…"
  exec pnpm test
}

port_in_use() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && exec 3>&- && return 0 || return 1; }

do_docker() {
  require_node
  command -v docker >/dev/null || die "docker is not installed"
  local port="${GATEWAY_PORT:-8080}"
  if port_in_use "$port"; then
    die "Port $port is already in use. Free it, or pick another: GATEWAY_PORT=9090 ./start --docker"
  fi
  banner
  info "Starting full topology (Redis + 2 backends + Caddy gateway)…"
  info "App will be available at ${BOLD}http://localhost:${port}${NC}"
  GATEWAY_PORT="$port" exec docker compose up --build
}

REDIS_CONTAINER="cursor-redis"
STARTED_REDIS=false

redis_port_open() { (exec 3<>/dev/tcp/127.0.0.1/6379) 2>/dev/null && exec 3>&- && return 0 || return 1; }

ensure_redis() {
  export REDIS_ENABLED="true"
  export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"

  if redis_port_open; then
    ok "Redis already running on :6379 — using it."
    return
  fi
  command -v docker >/dev/null \
    || die "Redis isn't running on :6379 and docker isn't available. Start Redis, then re-run."

  info "Starting Redis (docker container '$REDIS_CONTAINER')…"
  if docker ps -a --format '{{.Names}}' | grep -qx "$REDIS_CONTAINER"; then
    docker start "$REDIS_CONTAINER" >/dev/null
  else
    docker run -d --name "$REDIS_CONTAINER" -p 6379:6379 redis:7-alpine >/dev/null
  fi
  STARTED_REDIS=true
  for _ in $(seq 1 20); do redis_port_open && break; sleep 0.3; done
  redis_port_open || die "Redis failed to start on :6379"
  ok "Redis ready."
}

DEV_CLEANED=0

do_dev() {
  ensure_installed
  ensure_redis

  printf "%s%sStarting…%s\n" "$BOLD" "$GREEN" "$NC"
  printf "  backend  %shttp://localhost:3001%s  (store: redis)\n" "$DIM" "$NC"
  printf "  client   %shttp://localhost:5173%s  %s← open this, in two windows%s\n" \
    "$DIM" "$NC" "$BOLD" "$NC"
  printf "  %sTUI: ↑/↓ pick a process · enter focus · r restart · x stop · q quit%s\n\n" "$DIM" "$NC"

  # mprocs is an interactive TUI, so it runs in the FOREGROUND and owns the
  # terminal. It supervises the server/client panes (see mprocs.yaml) and tears
  # them down on quit; the trap then stops Redis if we started it.
  trap dev_cleanup INT TERM EXIT
  node_modules/.bin/mprocs
  dev_cleanup
}

dev_cleanup() {
  [[ "$DEV_CLEANED" == "1" ]] && return
  DEV_CLEANED=1
  trap - INT TERM EXIT

  if [[ "$STARTED_REDIS" == "true" ]]; then
    printf "\n"; info "Stopping Redis…"
    docker stop "$REDIS_CONTAINER" >/dev/null 2>&1 || true
  fi
}

menu() {
  banner
  printf "  What would you like to do?\n\n"
  printf "    %s1%s  Setup + start dev   %s(install if needed, run backend + client)%s\n" "$GREEN" "$NC" "$DIM" "$NC"
  printf "    %s2%s  Setup only          %s(install dependencies)%s\n" "$GREEN" "$NC" "$DIM" "$NC"
  printf "    %s3%s  Start dev           %s(skip install, just run)%s\n" "$GREEN" "$NC" "$DIM" "$NC"
  printf "    %s4%s  Docker (full)       %s(Redis + 2 backends + Caddy → :8080)%s\n" "$GREEN" "$NC" "$DIM" "$NC"
  printf "    %s5%s  Run tests\n" "$GREEN" "$NC"
  printf "    %sq%s  Quit\n\n" "$GREEN" "$NC"

  if [[ ! -t 0 ]]; then
    info "Non-interactive shell — defaulting to: Setup + start dev"
    do_dev; return
  fi

  local choice
  read -rp "  Choice [1]: " choice
  choice="${choice:-1}"
  printf "\n"
  case "$choice" in
    1) do_dev ;;
    2) do_install ;;
    3) SKIP_INSTALL=true; do_dev ;;
    4) do_docker ;;
    5) do_test ;;
    q|Q) info "Bye."; exit 0 ;;
    *) die "invalid choice: $choice" ;;
  esac
}

ACTION=""
for arg in "$@"; do
  case "$arg" in
    --dev)      ACTION="dev" ;;
    --install|--setup) ACTION="install" ;;
    --docker)   ACTION="docker" ;;
    --test)     ACTION="test" ;;
    -h|--help)  usage; exit 0 ;;
    *) die "unknown option: $arg (try --help)" ;;
  esac
done

case "$ACTION" in
  dev)     banner; do_dev ;;
  install) do_install ;;
  docker)  do_docker ;;
  test)    do_test ;;
  "")      menu ;;
esac
