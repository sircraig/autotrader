# BTC-TUI Bun + React Rebuild Plan

## Objective
Rebuild `/home/craig/dev/btc-tui` as a Bun- and React-based project in `/home/craig/dev/btc-tui2` while preserving the existing application's trading behavior, real-time market data flow, indicator calculations, signal generation, and logging.

This is not a line-by-line port of the Python/Textual code. It is a behavioral clone with a web-native architecture.

## Source Application Inventory
The current Python app is a live BTC market terminal with these runtime responsibilities:

- Bootstrap historical candles from Binance REST.
- Subscribe to Binance WebSocket streams for:
  - `kline_1m`
  - `kline_5m`
  - `depth20@100ms`
  - `aggTrade`
- Render six primary panels:
  - `CandlePriceWidget` for 1m closes
  - `CandlePriceWidget` for 5m closes
  - `PlotextChartWidget` with price, RSI, ATR, and delta panes
  - `OrderBookWidget`
  - `TradeFlowWidget`
  - `OrderBookDeltaWidget`
  - `PointSignalsWidget`
- Calculate indicators and derived signals:
  - EMA(21)
  - Bollinger Bands(20, 2.0)
  - RSI(14)
  - ATR(14)
  - ATR SMA(10)
  - RSI divergence
  - Order-book imbalance signals
  - Rolling CVD windows
  - Point-based trade signals
- Persist logs for:
  - order-book trades
  - 1m candle close snapshots
  - 5m candle close snapshots
  - point-signal trade events

## Recommended Target Architecture
Use a Bun workspace with three top-level parts:

- `apps/web`
  - React + TypeScript frontend
  - Browser dashboard that replaces the Textual UI
- `apps/server`
  - Bun-native ingest and WebSocket fanout service
  - Owns exchange connectivity, normalization, optional indicator precompute, and persistent logging
- `packages/core`
  - Shared types, config, rolling-window utilities, indicators, signal engines, and schema validation

This backend-first design is the right default for parity with the Python app because the original program is an always-on process with persistent logs and stable market-data ingestion. A frontend-only browser implementation can still be supported later, but it should be treated as a secondary mode, not the primary architecture.

## Recommended Modules
These are the modules I would use for the rebuild.

| Area | Module | Why it belongs in the stack |
| --- | --- | --- |
| Runtime / package manager / test runner | `bun` | Fast package installs, TypeScript execution, test runner, and a native HTTP/WebSocket server in one toolchain. |
| Frontend UI | `react`, `react-dom` | Best fit for a stateful dashboard with many independently updating panels. |
| Frontend build tooling | `vite`, `@vitejs/plugin-react-swc` | Best developer experience for a browser app; Bun works well as the package manager and script runner around it. |
| Language / type safety | `typescript`, `@types/bun` | Required for shared types and safe event contracts. |
| State management | `zustand` | Low-overhead store with selector-based subscriptions; a good fit for high-frequency stream updates. |
| Runtime validation | `zod` | Validate config, inbound WS payloads, and app-level event schema. |
| Financial charts | `lightweight-charts` | Purpose-built for market charts and supports the price-heavy UI surfaces better than general-purpose charting libraries. |
| UI utilities | `clsx` | Minimal conditional class composition without bringing in a component framework. |
| Date formatting | `date-fns` | Lightweight utilities for timestamps and session durations. |
| Unit / integration tests | `vitest` | Fast TS-friendly test runner for frontend and shared code. |
| Component tests | `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event` | Best fit for behavioral UI testing. |
| End-to-end tests | `@playwright/test` | Verify streaming dashboard behavior in a real browser. |
| Linting | `eslint`, `typescript-eslint` | Keep shared logic and event code disciplined. |
| Formatting | `prettier` | Keep multi-package formatting predictable. |

Deliberate non-choices:

- No heavy component library. The UI should preserve the intentional terminal-dashboard feel instead of becoming a generic admin panel.
- No Redux. It adds ceremony without solving a problem this app actually has.
- No `ws` server library unless Bun-native WebSockets prove insufficient. `Bun.serve()` should be the default.
- No chart wrapper library unless direct `lightweight-charts` integration becomes too costly. The direct API gives better control over high-frequency updates and pane layout.

## Proposed Repository Layout
```text
btc-tui2/
  apps/
    web/
      src/
        app/
        components/
        hooks/
        services/
        store/
        styles/
    server/
      src/
        config/
        ingest/
        logging/
        state/
        transport/
  packages/
    core/
      src/
        config/
        indicators/
        models/
        signals/
        utils/
        validation/
  docs/
    rebuild-plan.md
```

## Execution Strategy
Build the rewrite in this order:

1. Lock down behavioral parity and event contracts.
2. Build the shared calculation layer before building the UI.
3. Stand up the Bun ingest server and logging path.
4. Build the React dashboard against stable app events instead of raw exchange payloads.
5. Verify parity panel-by-panel and signal-by-signal against the Python implementation.

This ordering matters. The Python app's value is in its calculations and signal behavior, not the mechanics of Textual rendering.

## Detailed Task Plan

### Task 01 - Define the Parity Contract
- Goal: Convert the Python app into an explicit list of required behaviors so the rewrite has a fixed target.
- Work:
  - Document every stream, indicator, threshold, and panel.
  - Freeze the current trading constants from `btc_tui/config.py`.
  - Capture the source update order on 1m close, 5m close, order book update, and aggregate trade update.
  - Mark which widgets are mandatory for MVP and which are optional.
- Deliverables:
  - `docs/parity-contract.md`
  - `docs/event-sequences.md`
- Done when:
  - A new engineer can explain how a 5m candle close flows through the system without reading Python code.
  - Every threshold used in the Python app exists in the new spec.
- Notes:
  - `AsciiChartWidget` and the standalone `DeltaChartWidget` should be moved out of MVP unless the user explicitly wants them in phase one. The source planning docs already treat them as optional.

### Task 02 - Bootstrap the Bun Workspace
- Goal: Create a clean multi-package foundation that can support both frontend and backend work without later restructuring.
- Work:
  - Initialize Bun workspace metadata.
  - Create `apps/web`, `apps/server`, and `packages/core`.
  - Set up TypeScript project references or equivalent workspace-friendly TS config.
  - Add linting, formatting, and test scripts at the root.
  - Configure path aliases so both apps can import `packages/core`.
- Deliverables:
  - Root `package.json`
  - Root `tsconfig.json`
  - Shared lint/test/format scripts
- Done when:
  - `bun install`
  - `bun run lint`
  - `bun run test`
  - `bun run dev:web`
  - `bun run dev:server`
    all resolve without manual path hacks.
- Notes:
  - Use Vite for `apps/web` even though Bun can bundle frontend assets directly. Vite remains the safer choice for a React browser dashboard with ecosystem tooling, while Bun still owns the runtime and package workflow.

### Task 03 - Port Shared Domain Models and Config
- Goal: Create a single source of truth for data shape and thresholds.
- Work:
  - Define types for `Candle`, `OrderBookLevel`, `OrderBook`, `AggTrade`, delta stats, CVD stats, point-trade records, and logging payloads.
  - Move all hard-coded constants from Python into `packages/core/src/config/trading.ts`.
  - Add Zod schemas for inbound normalized events and persisted log entries.
  - Define a versioned app-level event envelope.
- Deliverables:
  - `packages/core/src/models/*`
  - `packages/core/src/config/trading.ts`
  - `packages/core/src/validation/*`
- Done when:
  - Both frontend and backend compile against the same types.
  - No exchange-facing or widget-facing code carries anonymous object shapes.
- Notes:
  - This task is foundational. If the event envelope is sloppy, every later task becomes brittle.

### Task 04 - Build the Binance Ingest and Bootstrap Layer
- Goal: Replace the Python app's exchange layer with a Bun service that owns all market-data ingestion.
- Work:
  - Implement REST bootstrap for historical candles.
  - Implement WebSocket clients for:
    - 1m kline
    - 5m kline
    - depth snapshots
    - aggregate trades
  - Normalize Binance payloads into shared app events.
  - Add reconnect logic, heartbeat handling, stale-stream detection, and backoff.
  - Cache the latest market state in memory for newly connected UI clients.
- Deliverables:
  - `apps/server/src/ingest/binance.ts`
  - `apps/server/src/state/market-state.ts`
  - normalized event fixtures for tests
- Done when:
  - The server can cold-start, fetch history, connect to all streams, and serve a stable normalized event feed without the frontend being open.
- Notes:
  - Avoid pushing raw Binance payloads into the web app. The server should be the boundary where exchange-specific message formats end.

### Task 05 - Implement Rolling Window Utilities
- Goal: Recreate the time-windowed accumulation behavior that several Python widgets depend on.
- Work:
  - Port generic rolling windows.
  - Port rolling accumulators for price diff totals and duration totals.
  - Port rolling CVD windows for 1m, 5m, and 1h trade flow.
  - Write deterministic tests with synthetic timestamps.
- Deliverables:
  - `packages/core/src/utils/rolling-window.ts`
  - accumulator and CVD helpers
- Done when:
  - The new utilities reproduce Python-style pruning and totals across boundary conditions.
- Notes:
  - This is one of the highest-leverage tasks because `OrderBookDeltaWidget`, `TradeFlowWidget`, and parts of `PointSignalsWidget` all depend on it.

### Task 06 - Port the Indicator Library
- Goal: Rebuild the numerical analysis layer outside the UI so it can be tested independently.
- Work:
  - Port EMA.
  - Port Bollinger Bands.
  - Port RSI with Wilder smoothing.
  - Port ATR with Wilder smoothing.
  - Port ATR SMA over ATR outputs.
  - Port swing-point detection and RSI divergence logic.
  - Add parity tests using known candle sequences.
- Deliverables:
  - `packages/core/src/indicators/*`
  - `packages/core/src/indicators/__tests__/*`
- Done when:
  - The TS outputs match the Python outputs for the same test vectors within an agreed tolerance.
- Notes:
  - Do not bury these calculations inside React hooks. They belong in pure functions and engine classes.

### Task 07 - Port the Order Book Delta Engine
- Goal: Preserve the existing imbalance-based trade open/close logic and rolling PnL math.
- Work:
  - Port the BUY and SELL open conditions based on top-3 depth imbalance.
  - Port the BUY and SELL close conditions based on first-level reversal.
  - Port rolling totals across 30m, 1h, and 4h windows.
  - Preserve the current `delta`, `delta_pct`, `duration_delta`, `duration_delta_pct`, and `pnl_total_1h` outputs.
  - Produce a UI-ready state snapshot plus log-ready event payloads.
- Deliverables:
  - `packages/core/src/signals/order-book-delta-engine.ts`
  - exhaustive engine tests covering open, hold, close, and stale-state transitions
- Done when:
  - The engine can be fed a stream of order-book snapshots and produces the same open/close behavior as the Python widget.
- Notes:
  - Keep this task completely UI-agnostic. It is a market engine, not a component concern.

### Task 08 - Port the Trade Flow / CVD Engine
- Goal: Recreate the aggressive-trade analytics used by both the trade-flow panel and the point-signal panel.
- Work:
  - Port signed-volume classification using `isBuyerMaker`.
  - Maintain rolling 1m, 5m, and 1h windows.
  - Expose buy volume, sell volume, CVD totals, buy percentage, dominant side, trade counts, and trade rate.
  - Track recent large trades using the configured BTC threshold.
- Deliverables:
  - `packages/core/src/signals/trade-flow-engine.ts`
  - engine tests with buy/sell mixes and time-window pruning
- Done when:
  - CVD, buy percentages, and trade-rate outputs stay stable under synthetic replay and match the Python logic.
- Notes:
  - This engine should own the large-trade list so the UI remains mostly presentational.

### Task 09 - Port the Point Signals Engine
- Goal: Preserve the multi-indicator point-scoring strategy and its trade lifecycle exactly.
- Work:
  - Port bullish and bearish scoring.
  - Port divergence persistence across four candles.
  - Port mandatory gates:
    - 1h PnL threshold
    - ATR minimum
    - ATR above ATR SMA for entry
  - Port close behavior:
    - immediate close on ATR below ATR SMA
    - normal close on points falling to threshold
  - Maintain active trade, history, session stats, win rate, and PnL totals.
- Deliverables:
  - `packages/core/src/signals/point-signals-engine.ts`
  - trade lifecycle tests for long and short paths
- Done when:
  - The engine opens and closes trades at the same times as the Python logic for the same input sequence.
- Notes:
  - This is the most behavior-sensitive task in the whole rewrite. Do not start UI implementation until this engine is stable.

### Task 10 - Build Logging, Replay, and Observability
- Goal: Replace the Python JSONL loggers and create tooling that makes parity testing practical.
- Work:
  - Implement JSONL log writers in the Bun server.
  - Create separate log files for:
    - signal events
    - 1m candle closes
    - 5m candle closes
    - point-signal trades
  - Add a replay utility that can read log files and feed the frontend or engines with deterministic events.
  - Add a lightweight health/status endpoint for stream state and reconnect counts.
- Deliverables:
  - `apps/server/src/logging/*`
  - `apps/server/src/replay/*`
  - `apps/server/src/transport/http-status.ts`
- Done when:
  - A recorded session can be replayed locally to reproduce UI state and signal outcomes.
- Notes:
  - Replay is not optional if you want safe iteration on trading logic.

### Task 11 - Build the Server Transport Layer
- Goal: Expose a stable app-facing interface to the React client.
- Work:
  - Implement Bun HTTP server startup and lifecycle handling.
  - Implement a single app WebSocket endpoint for browser clients.
  - Broadcast normalized events and optionally periodic indicator snapshots.
  - Send bootstrap state on client connect so the dashboard paints immediately.
  - Handle backpressure and slow-client behavior cleanly.
- Deliverables:
  - `apps/server/src/index.ts`
  - `apps/server/src/transport/ws-broker.ts`
- Done when:
  - Multiple browser clients can connect simultaneously without each opening their own Binance connections.
- Notes:
  - Use Bun-native WebSocket support first. Only add another server library if a concrete gap appears.

### Task 12 - Build the React App Shell and Streaming Store
- Goal: Create the browser application skeleton that will host the dashboard.
- Work:
  - Scaffold the React app with Vite and TypeScript.
  - Implement global layout, theme variables, responsive grid, and typography.
  - Build the WebSocket client and reconnect logic.
  - Create a Zustand store with slices for candles, order book, trades, indicators, delta state, point trades, and app status.
  - Add selectors tuned for high-frequency updates to avoid unnecessary rerenders.
- Deliverables:
  - `apps/web/src/app/*`
  - `apps/web/src/store/*`
  - `apps/web/src/services/ws-client.ts`
  - `apps/web/src/styles/*`
- Done when:
  - The browser connects to the Bun server, hydrates initial state, and updates live without frame-killing rerenders.
- Notes:
  - Keep derived trading logic in `packages/core` and use the store mainly for state assembly and delivery to components.

### Task 13 - Rebuild the Core Dashboard Widgets
- Goal: Recreate the source app's information surfaces in a web-native UI.
- Work:
  - Rebuild the 1m candle close list.
  - Rebuild the 5m candle close list with annotations.
  - Rebuild the order book visual analyzer.
  - Rebuild the trade-flow panel.
  - Rebuild the order-book-delta panel.
  - Rebuild the point-signals panel.
  - Keep the TUI spirit:
    - dense information
    - explicit state color coding
    - minimal decorative chrome
    - scan-friendly layout
- Deliverables:
  - `apps/web/src/components/widgets/*`
- Done when:
  - A user can visually inspect the browser dashboard and find the same classes of information they rely on in the Textual UI.
- Notes:
  - These components should remain mostly presentational and subscribe to selectors, not raw transport events.

### Task 14 - Rebuild the Multi-Pane Chart Surface
- Goal: Replace `PlotextChartWidget` with a proper browser chart stack while preserving the same analytic outputs.
- Work:
  - Create a price pane with candles, EMA, and Bollinger Bands.
  - Create an RSI pane.
  - Create an ATR pane with ATR SMA.
  - Create a delta pane with Bollinger Bands over delta history.
  - Expose helper outputs for:
    - EMA position
    - price outside bands
    - delta outside bands
    - recent RSI divergence
    - latest ATR
    - latest ATR SMA
- Deliverables:
  - `apps/web/src/components/charts/*`
  - chart integration hooks and selectors
- Done when:
  - The chart surface renders cleanly and the downstream signal engines receive the same helper values they used to get from the Python chart widget.
- Notes:
  - Treat chart rendering and indicator calculation as separate concerns even when they share data.

### Task 15 - Integrate End-to-End Update Sequencing
- Goal: Ensure the web system preserves the source app's event ordering semantics.
- Work:
  - Recreate the 5m close sequence:
    - chart update
    - delta snapshot
    - delta BB status
    - price BB status
    - divergence
    - EMA position
    - CVD snapshot
    - candle annotation update
    - point-signal update
    - log write
  - Recreate the 1m close sequence.
  - Recreate the order-book update sequence.
  - Recreate the agg-trade update sequence.
  - Add sequencing tests around event processing.
- Deliverables:
  - app orchestration layer in server or shared engine coordinator
  - sequencing tests
- Done when:
  - The same market event stream produces the same final state regardless of UI refresh cadence.
- Notes:
  - This task is where most hidden parity bugs show up.

### Task 16 - Build the Verification Matrix
- Goal: Make correctness measurable instead of subjective.
- Work:
  - Write unit tests for indicators and rolling windows.
  - Write engine tests for delta logic, CVD logic, and point-signal logic.
  - Write component tests for critical panels.
  - Write Playwright tests for:
    - cold startup
    - live reconnect
    - historical preload
    - point trade open/close rendering
  - Create fixture-based parity tests comparing TS outputs to saved Python outputs.
- Deliverables:
  - test suites in all packages
  - a `docs/test-matrix.md`
- Done when:
  - The project can prove behavioral parity for the important logic without manual chart inspection.
- Notes:
  - The most important tests are not snapshot tests. They are sequence-driven behavioral tests.

### Task 17 - Performance, Hardening, and Failure Handling
- Goal: Make the browser dashboard and Bun service robust under real stream conditions.
- Work:
  - Profile rerender frequency in React.
  - Cap retained histories where appropriate.
  - Batch updates when event bursts arrive.
  - Harden reconnect behavior for Binance disconnects and client reconnects.
  - Test stale order-book or trade-flow scenarios.
  - Add safe handling for malformed or partial events.
- Deliverables:
  - performance checklist
  - resilience tests
  - instrumentation hooks
- Done when:
  - The dashboard remains responsive during sustained high-frequency updates.
- Notes:
  - This should happen after correctness is in place, not before.

### Task 18 - Packaging, Runbooks, and Deployment
- Goal: Make the rebuild usable as an actual application rather than just a dev project.
- Work:
  - Add `.env.example`.
  - Add production build scripts for web and server.
  - Add run commands for local development and production mode.
  - Write operator docs for:
    - local startup
    - replay mode
    - log locations
    - failure recovery
  - Optionally containerize once the runtime shape is stable.
- Deliverables:
  - `README.md`
  - deployment scripts
  - environment docs
- Done when:
  - Another machine can start the full system from scratch without reverse-engineering the repo.
- Notes:
  - Do not containerize too early. Lock the runtime workflow first.

## MVP Scope
These items should be in the first release:

- Bun server ingesting Binance data
- React dashboard
- Shared indicator and signal engines
- Historical preload
- 1m and 5m candle panels
- order book panel
- trade flow panel
- order-book delta panel
- point-signals panel
- multi-pane price/indicator chart
- JSONL logging
- replay tooling
- automated tests for indicator and signal parity

## Post-MVP Scope
These items can wait until the parity build is stable:

- frontend-only direct-to-Binance mode
- optional ASCII-style widgets
- multi-symbol support
- historical session viewer
- mobile-optimized layout beyond basic responsiveness
- strategy configuration UI

## Key Risks
- The biggest technical risk is not the UI. It is hidden sequencing differences between the Python app and the TS rewrite.
- The next biggest risk is allowing indicator logic to leak into React components, which makes parity and testing much harder.
- A browser-only architecture would weaken parity because logging, continuous ingest, and reconnect behavior become tied to whether a page is open.
- High-frequency order-book updates can create avoidable rerenders unless the store and selector strategy is disciplined from day one.

## Recommended Delivery Order
If one engineer is driving the rewrite, I would execute the work in six implementation waves:

1. Tasks 01-03
2. Tasks 04-06
3. Tasks 07-10
4. Tasks 11-12
5. Tasks 13-15
6. Tasks 16-18

## Exit Criteria
The Python version can be considered successfully cloned when all of the following are true:

- The Bun server can run continuously and maintain Binance connectivity.
- The React dashboard exposes the same operational panels the current TUI depends on.
- Indicator outputs match the Python implementation within defined tolerances.
- Order-book-delta and point-signal trade behavior match the Python implementation on replayed fixtures.
- Candle-close and signal logs are persisted in structured JSONL form.
- The app is testable, repeatable, and operable without manual intervention.
