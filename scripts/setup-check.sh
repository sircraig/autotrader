#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required but was not found in PATH." >&2
  exit 1
fi

cd "$ROOT_DIR"

echo "==> Installing dependencies"
bun install

echo "==> Running typecheck"
bun run typecheck

echo "==> Running lint"
bun run lint

echo "==> Running tests"
bun run test

echo "==> Building server"
bun run build:server

echo "==> Building web"
bun run build:web

echo "Setup and verification completed."

