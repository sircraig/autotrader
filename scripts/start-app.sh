#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_PORT="${SERVER_PORT:-3001}"
WEB_PORT="${WEB_PORT:-3000}"
WEB_HOST="${WEB_HOST:-0.0.0.0}"
FRONTEND_DEBUG="${FRONTEND_DEBUG:-false}"
SERVER_PID=""
WEB_PID=""

supports_wait_n() {
  (( BASH_VERSINFO[0] > 4 || (BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] >= 3) ))
}

wait_for_first_exit() {
  if supports_wait_n; then
    wait -n "$SERVER_PID" "$WEB_PID"
    return $?
  fi

  while true; do
    if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
      wait "$SERVER_PID"
      return $?
    fi

    if ! kill -0 "$WEB_PID" >/dev/null 2>&1; then
      wait "$WEB_PID"
      return $?
    fi

    sleep 1
  done
}

cleanup() {
  local exit_code=$?

  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi

  if [[ -n "$WEB_PID" ]] && kill -0 "$WEB_PID" >/dev/null 2>&1; then
    kill "$WEB_PID" >/dev/null 2>&1 || true
  fi

  wait >/dev/null 2>&1 || true
  exit "$exit_code"
}

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required but was not found in PATH." >&2
  exit 1
fi

cd "$ROOT_DIR"

trap cleanup EXIT INT TERM

echo "==> Starting server on port ${SERVER_PORT}"
PORT="$SERVER_PORT" bun run --cwd apps/server dev &
SERVER_PID=$!

echo "==> Starting web app on port ${WEB_PORT}"
web_args=(--host "$WEB_HOST" --port "$WEB_PORT")

if [[ "$FRONTEND_DEBUG" == "true" ]]; then
  web_args=(--debug "${web_args[@]}")
  echo "    frontend debug: enabled"
else
  echo "    frontend debug: disabled"
fi

VITE_SERVER_PORT="$SERVER_PORT" bun run --cwd apps/web dev -- "${web_args[@]}" &
WEB_PID=$!

echo "Application started."
echo "Web:    http://localhost:${WEB_PORT} (listening on ${WEB_HOST})"
echo "Server: http://localhost:${SERVER_PORT}"

wait_for_first_exit
