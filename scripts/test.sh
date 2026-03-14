#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_E2E=false

usage() {
  cat <<'EOF'
Usage: ./scripts/test.sh [--e2e] [--all]

Runs the repo test suite.

  --e2e  Run Playwright end-to-end tests only
  --all  Run Bun tests first, then Playwright end-to-end tests
  -h, --help  Show this help text
EOF
}

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required but was not found in PATH." >&2
  exit 1
fi

RUN_BUN_TESTS=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --e2e)
      RUN_BUN_TESTS=false
      RUN_E2E=true
      shift
      ;;
    --all)
      RUN_BUN_TESTS=true
      RUN_E2E=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

cd "$ROOT_DIR"

if [[ "$RUN_BUN_TESTS" == "true" ]]; then
  echo "==> Running Bun test suite"
  bun test packages/core/src apps/server/src apps/web/src
fi

if [[ "$RUN_E2E" == "true" ]]; then
  echo "==> Running Playwright end-to-end tests"
  bunx playwright test
fi
