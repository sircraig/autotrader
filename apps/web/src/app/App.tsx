import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { tradingConfig } from '@btc-tui/core/config/trading';

import { MultiPaneChartWidget } from '../components/charts';
import {
  CandleCloseWidget,
  OrderBookDeltaWidget,
  OrderBookWidget,
  PointSignalsWidget,
  TradeFlowWidget,
  WidgetBadge,
  WidgetFrame,
  WidgetRow
} from '../components/widgets';
import { formatClock, formatPrice, formatQuantity } from '../components/widgets/format';
import {
  AppWsClient,
  createServerHttpUrl,
  createServerWsUrl
} from '../services/ws-client';
import { type DashboardStoreState, useAppStore } from '../store/app-store';

let sharedWsClient: AppWsClient | null = null;
let sharedWsClientRefCount = 0;
let sharedWsClientDisposeTimer: number | null = null;

function acquireWsClient(wsUrl: string): void {
  if (sharedWsClientDisposeTimer !== null) {
    window.clearTimeout(sharedWsClientDisposeTimer);
    sharedWsClientDisposeTimer = null;
  }

  if (sharedWsClient === null) {
    sharedWsClient = new AppWsClient({
      url: wsUrl,
      onMessage(message) {
        useAppStore.getState().applyServerMessage(message);
      },
      onConnectionStateChange(update) {
        useAppStore.getState().setConnectionState(update);
      }
    });
    sharedWsClient.connect();
  }

  sharedWsClientRefCount += 1;
}

function releaseWsClient(): void {
  sharedWsClientRefCount = Math.max(0, sharedWsClientRefCount - 1);

  if (sharedWsClientRefCount > 0 || sharedWsClient === null) {
    return;
  }

  sharedWsClientDisposeTimer = window.setTimeout(() => {
    if (sharedWsClientRefCount === 0 && sharedWsClient) {
      sharedWsClient.close();
      sharedWsClient = null;
    }
    sharedWsClientDisposeTimer = null;
  }, 0);
}

function getConnectionTone(status: string): string {
  switch (status) {
    case 'open':
      return 'text-matrix-accent-strong border-matrix-accent-strong/80';
    case 'error':
      return 'text-[#ff9d8e] border-[#ff9d8e]/70';
    case 'reconnecting':
    case 'connecting':
      return 'text-[#ffe5a1] border-[#ffe5a1]/60';
    default:
      return 'text-matrix-muted border-matrix-border/50';
  }
}

export function App() {
  const wsUrl = createServerWsUrl();
  const httpUrl = createServerHttpUrl();
  const {
    symbol,
    sequence,
    lastEventAt,
    latestTrade,
    connection,
    systemStatus,
    bootstrap1m,
    bootstrap5m
  } = useAppStore(
    useShallow((state: DashboardStoreState) => ({
      symbol: state.symbol,
      sequence: state.sequence,
      lastEventAt: state.lastEventAt,
      latestTrade: state.latestTrade,
      connection: state.connection,
      systemStatus: state.systemStatus,
      bootstrap1m: state.bootstrap['1m'],
      bootstrap5m: state.bootstrap['5m']
    }))
  );

  useEffect(() => {
    acquireWsClient(wsUrl);

    return () => {
      releaseWsClient();
    };
  }, [wsUrl]);

  return (
    <main className="mx-auto min-h-screen w-[min(1500px,calc(100vw-24px))] px-0 py-6 md:w-[min(1600px,calc(100vw-40px))] md:py-8">
      <section className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,0.95fr)]">
        <div className="matrix-panel overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-matrix-accent/50 to-transparent" />
          <p className="mb-3 text-[0.74rem] uppercase tracking-[0.26em] text-matrix-accent-strong">
            phase_13 // core widgets online
          </p>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
            <div>
              <h1 className="m-0 text-[clamp(2.4rem,4vw,4.7rem)] leading-[0.88] uppercase tracking-[0.08em] text-matrix-text shadow-[0_0_16px_rgba(91,255,140,0.18)]">
                Live Operator Desk
              </h1>
              <p className="mt-3 max-w-[44rem] text-[0.97rem] leading-[1.7] text-matrix-muted">
                The dashboard is now split into dedicated market widgets instead of a
                placeholder shell. Candle tapes, order book, trade flow, delta, and
                point-signal surfaces all subscribe to the shared store directly.
              </p>
            </div>

            <div className="grid gap-2.5">
              <div className="flex items-center justify-between gap-4 border border-matrix-border/50 bg-[rgba(2,11,5,0.84)] px-3 py-2.5 text-[0.8rem] uppercase tracking-[0.12em]">
                <span className="text-matrix-muted">symbol</span>
                <span className="text-matrix-accent-strong">{symbol}</span>
              </div>
              <div className="flex items-center justify-between gap-4 border border-matrix-border/50 bg-[rgba(2,11,5,0.84)] px-3 py-2.5 text-[0.8rem] uppercase tracking-[0.12em]">
                <span className="text-matrix-muted">transport</span>
                <span
                  className={`rounded-full border px-2 py-1 text-[0.72rem] tracking-[0.18em] ${getConnectionTone(connection.status)}`}
                >
                  {connection.status}
                </span>
              </div>
              <div className="border border-matrix-border/50 bg-[rgba(2,11,5,0.84)] px-3 py-2.5 text-[0.78rem] uppercase tracking-[0.09em] text-matrix-muted">
                <div className="flex justify-between gap-3">
                  <span>ws</span>
                  <span className="truncate text-right text-matrix-accent">{wsUrl}</span>
                </div>
                <div className="mt-2 flex justify-between gap-3">
                  <span>http</span>
                  <span className="truncate text-right text-matrix-accent">{httpUrl}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <WidgetFrame title="Transport State" eyebrow="reconnect discipline">
          <WidgetRow label="server status" value={systemStatus.status} />
          <WidgetRow
            label="reconnects"
            value={systemStatus.reconnectCount ?? connection.reconnectAttempt}
          />
          <WidgetRow
            label="client open"
            value={formatClock(connection.lastConnectedAt)}
          />
          <WidgetRow
            label="last message"
            value={formatClock(connection.lastMessageAt ?? lastEventAt)}
          />
          <WidgetRow
            label="stale streams"
            value={systemStatus.staleStreams?.join(', ') ?? 'none'}
            tone={systemStatus.staleStreams?.length ? 'text-[#ffe5a1]' : 'text-matrix-text'}
          />
          <WidgetRow
            label="transport error"
            value={connection.error ?? 'none'}
            tone={connection.error ? 'text-[#ffb9aa]' : 'text-matrix-text'}
          />
        </WidgetFrame>
      </section>

      <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="matrix-panel min-h-[unset]">
          <p className="matrix-panel-title">Bootstrap Cache</p>
          <p className="matrix-panel-value text-[1.8rem]">
            {bootstrap1m.length + bootstrap5m.length}
          </p>
          <p className="matrix-panel-meta">1m + 5m candles retained for paint</p>
        </div>
        <div className="matrix-panel min-h-[unset]">
          <p className="matrix-panel-title">Sequence</p>
          <p className="matrix-panel-value text-[1.8rem]">{sequence}</p>
          <p className="matrix-panel-meta">latest normalized event applied</p>
        </div>
        <div className="matrix-panel min-h-[unset]">
          <p className="matrix-panel-title">Latest Trade</p>
          <p className="matrix-panel-value text-[1.3rem]">
            {latestTrade ? formatPrice(latestTrade.price) : '—'}
          </p>
          <p className="matrix-panel-meta">
            {latestTrade
              ? `${latestTrade.isBuyerMaker ? 'sell' : 'buy'} aggression • ${formatQuantity(latestTrade.quantity)} BTC`
              : 'awaiting aggTrade stream'}
          </p>
        </div>
        <div className="matrix-panel min-h-[unset]">
          <p className="matrix-panel-title">Point Gates</p>
          <p className="matrix-panel-value text-[1.3rem]">
            {tradingConfig.pointSignals.openThreshold} /{' '}
            {tradingConfig.pointSignals.closeThreshold}
          </p>
          <p className="matrix-panel-meta">
            pnl &gt; {tradingConfig.pointSignals.minPnlTotal1h} • atr ≥{' '}
            {tradingConfig.pointSignals.minAtrValue}
          </p>
        </div>
      </section>

      <section className="mb-4">
        <MultiPaneChartWidget />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.98fr)_minmax(0,0.94fr)]">
        <div className="grid gap-4">
          <CandleCloseWidget timeframe="1m" />
          <CandleCloseWidget timeframe="5m" />
        </div>

        <div className="grid gap-4">
          <OrderBookWidget />
          <TradeFlowWidget />
        </div>

        <div className="grid gap-4">
          <OrderBookDeltaWidget />
          <PointSignalsWidget />
          <WidgetFrame title="Console Strip" eyebrow="operator cues">
            <div className="flex flex-wrap gap-2 text-[0.74rem] uppercase tracking-[0.12em]">
              <WidgetBadge>ws.{connection.status}</WidgetBadge>
              <WidgetBadge>ingest.{systemStatus.status}</WidgetBadge>
              <WidgetBadge>seq.{sequence}</WidgetBadge>
              <WidgetBadge>{latestTrade ? 'trade.live' : 'trade.waiting'}</WidgetBadge>
              <WidgetBadge>widgets.dense</WidgetBadge>
            </div>
          </WidgetFrame>
        </div>
      </section>
    </main>
  );
}
