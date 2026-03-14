import { tradingConfig } from '@btc-tui/core/config/trading';

export function App() {
  return (
    <main className="mx-auto min-h-screen w-[min(1100px,calc(100vw-32px))] px-0 py-12 md:py-16">
      <section className="mb-6">
        <p className="mb-2 text-[0.78rem] uppercase tracking-[0.22em] text-matrix-accent-strong">
          NODE STATUS // PHASE_01
        </p>
        <div className="grid gap-[18px] border border-matrix-accent-strong/80 bg-linear-to-b from-[rgba(8,24,10,0.86)] to-[rgba(2,10,4,0.96)] p-[18px] shadow-[0_0_0_1px_rgba(91,255,140,0.12)_inset,0_0_38px_rgba(52,255,113,0.12)] md:grid-cols-[minmax(0,1.6fr)_minmax(240px,0.9fr)]">
          <div>
            <h1 className="m-0 text-[clamp(2.8rem,5vw,4.6rem)] leading-[0.9] uppercase tracking-[0.08em] text-matrix-text shadow-[0_0_14px_rgba(91,255,140,0.22)]">
              BTC TUI 2
            </h1>
            <p className="mt-[14px] max-w-[40rem] text-base leading-[1.6] text-matrix-muted">
              Workspace bootstrapped for the Bun server, React dashboard, and
              shared trading core.
            </p>
          </div>

          <div className="grid content-start gap-[10px]" aria-label="system metadata">
            <div className="flex justify-between gap-4 border border-matrix-border bg-[rgba(1,10,4,0.82)] px-3 py-2.5 text-[0.82rem] uppercase">
              <span className="text-matrix-muted">SYMBOL</span>
              <strong className="font-semibold text-matrix-accent-strong">
                {tradingConfig.market.defaultSymbol}
              </strong>
            </div>
            <div className="flex justify-between gap-4 border border-matrix-border bg-[rgba(1,10,4,0.82)] px-3 py-2.5 text-[0.82rem] uppercase">
              <span className="text-matrix-muted">SERVER</span>
              <strong className="font-semibold text-matrix-accent-strong">BUN</strong>
            </div>
            <div className="flex justify-between gap-4 border border-matrix-border bg-[rgba(1,10,4,0.82)] px-3 py-2.5 text-[0.82rem] uppercase">
              <span className="text-matrix-muted">CLIENT</span>
              <strong className="font-semibold text-matrix-accent-strong">REACT</strong>
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex flex-col justify-between gap-3 border border-matrix-border/60 px-[14px] py-2.5 text-[0.8rem] uppercase tracking-[0.12em] text-matrix-muted md:flex-row">
          <span>STREAMS ONLINE</span>
          <span>ORDERBOOK + AGGTRADE + KLINES</span>
        </div>
      </section>

      <section className="grid gap-[14px] md:grid-cols-3">
        <article className="matrix-panel">
          <h2 className="matrix-panel-title">Market Feed</h2>
          <p className="matrix-panel-value">{tradingConfig.market.defaultSymbol}</p>
          <p className="matrix-panel-meta">primary routing pair</p>
        </article>

        <article className="matrix-panel">
          <h2 className="matrix-panel-title">Ingress</h2>
          <p className="matrix-panel-value">1m / 5m / depth20 / aggTrade</p>
          <p className="matrix-panel-meta">normalized event boundary pending</p>
        </article>

        <article className="matrix-panel">
          <h2 className="matrix-panel-title">Point Gates</h2>
          <p className="matrix-panel-value">
            OPEN {tradingConfig.pointSignals.openThreshold} / CLOSE{' '}
            {tradingConfig.pointSignals.closeThreshold}
          </p>
          <p className="matrix-panel-meta">runtime parity with Python config</p>
        </article>

        <article className="matrix-panel">
          <h2 className="matrix-panel-title">Indicators</h2>
          <p className="matrix-panel-value">EMA21 / BB20 / RSI14 / ATR14</p>
          <p className="matrix-panel-meta">shared core contract frozen</p>
        </article>

        <article className="matrix-panel">
          <h2 className="matrix-panel-title">Logging</h2>
          <p className="matrix-panel-value">JSONL SIGNAL + CANDLE + POINT</p>
          <p className="matrix-panel-meta">schema aligned to source app payloads</p>
        </article>

        <article className="matrix-panel">
          <h2 className="matrix-panel-title">Frontend</h2>
          <p className="matrix-panel-value">MATRIX SHELL ACTIVE</p>
          <p className="matrix-panel-meta">all-angle panels, monospace display</p>
        </article>
      </section>

      <section
        className="mt-[14px] flex flex-wrap gap-[18px] border border-matrix-border bg-[rgba(2,12,5,0.9)] px-[14px] py-3 text-[0.8rem] text-matrix-accent shadow-[0_0_24px_rgba(45,255,111,0.08)]"
        aria-label="console overview"
      >
        <span>&gt; bootstrap.contracts.loaded</span>
        <span>&gt; workspace.integrity.ok</span>
        <span>&gt; ui.theme.matrix</span>
      </section>
    </main>
  );
}
