import { useShallow } from 'zustand/react/shallow';

import { useAppStore, type DashboardStoreState } from '../../store/app-store';
import { formatPrice, formatQuantity, formatSigned, getTone } from './format';
import { WidgetBadge, WidgetFrame, WidgetRow } from './WidgetFrame';

export function TradeFlowWidget() {
  const { cvdAnalytics, latestTrade } = useAppStore(
    useShallow((state: DashboardStoreState) => ({
      cvdAnalytics: state.cvdAnalytics,
      latestTrade: state.latestTrade
    }))
  );

  const stats = cvdAnalytics?.stats ?? null;
  const lastSide = latestTrade
    ? latestTrade.isBuyerMaker
      ? 'sell aggression'
      : 'buy aggression'
    : 'awaiting aggTrade stream';

  return (
    <WidgetFrame
      title="Trade Flow"
      eyebrow="rolling cvd windows"
      aside={
        <WidgetBadge>
          {stats ? `${stats.side5m} bias` : 'pending'}
        </WidgetBadge>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-2 md:grid-cols-3">
          <div className="border border-matrix-border/25 bg-[rgba(2,11,5,0.76)] px-3 py-3">
            <p className="m-0 text-[0.72rem] uppercase tracking-[0.16em] text-matrix-muted">
              cvd 1m
            </p>
            <p className={`mt-2 text-[1.25rem] uppercase ${getTone(stats?.cvd1m)}`}>
              {formatSigned(stats?.cvd1m)}
            </p>
          </div>
          <div className="border border-matrix-border/25 bg-[rgba(2,11,5,0.76)] px-3 py-3">
            <p className="m-0 text-[0.72rem] uppercase tracking-[0.16em] text-matrix-muted">
              cvd 5m
            </p>
            <p className={`mt-2 text-[1.25rem] uppercase ${getTone(stats?.cvd5m)}`}>
              {formatSigned(stats?.cvd5m)}
            </p>
          </div>
          <div className="border border-matrix-border/25 bg-[rgba(2,11,5,0.76)] px-3 py-3">
            <p className="m-0 text-[0.72rem] uppercase tracking-[0.16em] text-matrix-muted">
              trade rate
            </p>
            <p className="mt-2 text-[1.25rem] uppercase text-matrix-accent-strong">
              {stats ? `${stats.tradeRate.toFixed(1)}/s` : '—'}
            </p>
          </div>
        </div>

        <div>
          <WidgetRow label="buy volume 1m" value={formatQuantity(stats?.buyVolume1m)} />
          <WidgetRow label="sell volume 1m" value={formatQuantity(stats?.sellVolume1m)} />
          <WidgetRow label="buy volume 5m" value={formatQuantity(stats?.buyVolume5m)} />
          <WidgetRow label="sell volume 5m" value={formatQuantity(stats?.sellVolume5m)} />
          <WidgetRow label="buy pct 5m" value={stats ? `${stats.buyPct5m}%` : '—'} />
          <WidgetRow label="trade count 1m" value={stats?.tradeCount1m ?? '—'} />
        </div>

        <div className="border border-matrix-border/25 bg-[rgba(2,11,5,0.76)] px-3 py-3 text-[0.78rem] uppercase tracking-[0.1em]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-matrix-muted">latest trade</span>
            <span className="text-matrix-accent">{lastSide}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-matrix-text">
              {latestTrade ? formatPrice(latestTrade.price) : '—'}
            </span>
            <span className="text-matrix-accent">
              {latestTrade ? `${formatQuantity(latestTrade.quantity)} BTC` : '—'}
            </span>
          </div>
        </div>
      </div>
    </WidgetFrame>
  );
}
