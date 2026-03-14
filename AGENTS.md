# Repository Guidelines

## Project Structure & Module Organization
This repository is a Bun workspace. Use `apps/web` for the Vite + React client, `apps/server` for the Bun ingest service, and `packages/core` for shared types, config, and validation. Shared Tailwind styles live in `packages/ui`. Scripts are in `scripts/`, and design notes are in `docs/`.

Key paths: `apps/web/src/app/App.tsx`, `apps/web/src/main.tsx`, `apps/server/src/ingest/binance.ts`, and `packages/core/src/config/trading.ts`.

## Build, Test, and Development Commands
- `bun run setup`: installs dependencies, typechecks, lints, tests, and builds both apps.
- `bun run start:app`: starts the server and web app together.
- `bun run dev:web`: runs the Vite frontend only.
- `bun run dev:server`: runs the Bun server in watch mode.
- `bun run typecheck`: checks all workspace TypeScript projects.
- `bun run lint`: runs ESLint across the repo.
- `bun run format`: formats the repo with Prettier.
- `bun run test`: runs the Bun test suite across `packages/core`, `apps/server`, and `apps/web`.

## Coding Style & Naming Conventions
TypeScript is strict; keep code aligned with `packages/core`. Prettier enforces `singleQuote: true`, semicolons, and no trailing commas. Follow the existing 2-space indentation. Use `PascalCase` for React components, `camelCase` for functions and variables, and kebab-case for scripts. Tailwind CSS 4 is part of the frontend stack; prefer utility classes and shared tokens in `packages/ui/src/styles.css`. ESLint requires `import type` for type-only imports.

## Testing Guidelines
Tests use `bun:test` and live beside source files as `*.test.ts`. Prefer small, deterministic tests around normalization, state transitions, and config contracts. Run `bun run test` before opening a PR. Add tests for new branch-heavy logic or exchange payload handling.

For browser validation, use MCP Playwright against the running app. Assume the user starts it. In this environment, do not default to `localhost`; use `http://192.168.20.20:3000` for the frontend and `http://192.168.20.20:3001/health` for the backend health check. If the frontend or server is unreachable, do not try to start it; report that testing failed because the server could not be accessed.

## Commit & Pull Request Guidelines
History is minimal, but the existing commit style is short, imperative, and phase-oriented (`Initial phase one scaffold`). Keep subjects concise and action-based, ideally under 72 characters. PRs should include a summary, affected workspace paths, test results, and screenshots for UI changes. Link any relevant issue or `docs/` note.

## Configuration & Runtime Notes
Use Bun `1.3.8` as declared in the root `package.json`. `scripts/start-app.sh` honors `SERVER_PORT`, `WEB_PORT`, `WEB_HOST`, and `FRONTEND_DEBUG`. The server also reads `SYMBOL` and `INGEST_ENABLED`. Document non-default values in your PR when they matter for review.
