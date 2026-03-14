import { useDeferredValue } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { OrderBookSignalPayload } from '@btc-tui/core/models';

import { useAppStore, type DashboardStoreState } from '../../store/app-store';
import { formatSigned, getTone } from './format';
import { WidgetBadge, WidgetFrame, WidgetRow } from './WidgetFrame';

function SignalCard(props: { signal: OrderBookSignalPayload }) {
  const tone =
    props.signal.action === 'open'
      ? 'text-matrix-accent-strong border-matrix-accent/30'
      : 'text-[#ffe5a1] border-[#ffe5a1]/30';

  return (
    <div className={`border bg-[rgba(2,11,5,0.76)] px-3 py-2 text-[0.76rem] uppercase ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <span>{props.signal.signalType}</span>
        <span>{props.signal.action}</span>
      </div>
      <div className="mt-2 text-matrix-muted">
        {props.signal.runningTotals
          ? `delta ${formatSigned(props.signal.runningTotals.delta)}`
          : 'entry conditions met'}
      </div>
    </div>
  );
}

export function OrderBookDeltaWidget() {
  const { deltaAnalytics, recentSignals } = useAppStore(
    useShallow((state: DashboardStoreState) => ({
      deltaAnalytics: state.deltaAnalytics,
      recentSignals: state.recentOrderBookSignals
    }))
  );

  const deferredSignals = useDeferredValue(recentSignals);
  const visibleSignals = deferredSignals.slice(0, 4);
  const stats = deltaAnalytics?.stats ?? null;
  const runningTotals = deltaAnalytics?.runningTotals ?? null;

  return (
    <WidgetFrame
      title="Order Book Delta"
      eyebrow="imbalance engine"
      aside={
        <WidgetBadge tone={`${getTone(stats?.delta)} border-matrix-border/40`}>
          {stats ? `delta ${formatSigned(stats.delta)}` : 'pending'}
        </WidgetBadge>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-2 md:grid-cols-2">
          <div className="border border-matrix-border/25 bg-[rgba(2,11,5,0.76)] px-3 py-3">
            <p className="m-0 text-[0.72rem] uppercase tracking-[0.16em] text-matrix-muted">
              price delta
            </p>
            <p className={`mt-2 text-[1.25rem] uppercase ${getTone(stats?.delta)}`}>
              {formatSigned(stats?.delta)}
            </p>
          </div>
          <div className="border border-matrix-border/25 bg-[rgba(2,11,5,0.76)] px-3 py-3">
            <p className="m-0 text-[0.72rem] uppercase tracking-[0.16em] text-matrix-muted">
              time delta
            </p>
            <p className={`mt-2 text-[1.25rem] uppercase ${getTone(stats?.durationDelta)}`}>
              {formatSigned(stats?.durationDelta, 's')}
            </p>
          </div>
        </div>

        <div>
          <WidgetRow label="delta pct" value={stats ? `${stats.deltaPct}%` : '—'} />
          <WidgetRow
            label="duration delta pct"
            value={stats ? `${stats.durationDeltaPct}%` : '—'}
          />
          <WidgetRow
            label="1h pnl total"
            value={formatSigned(stats?.pnlTotal1h)}
            tone={getTone(stats?.pnlTotal1h)}
          />
          <WidgetRow label="buy total" value={formatSigned(runningTotals?.buyTotal)} />
          <WidgetRow label="sell total" value={formatSigned(runningTotals?.sellTotal)} />
          <WidgetRow label="combined total" value={formatSigned(runningTotals?.combinedTotal)} />
        </div>

        <div className="grid gap-2">
          {visibleSignals.length > 0 ? (
            visibleSignals.map((signal, index) => (
              <SignalCard key={`${signal.signalType}-${signal.action}-${index}`} signal={signal} />
            ))
          ) : (
            <p className="m-0 border border-dashed border-matrix-border/35 px-3 py-4 text-[0.78rem] uppercase tracking-[0.12em] text-matrix-muted">
              no order-book signal events yet
            </p>
          )}
        </div>
      </div>
    </WidgetFrame>
  );
}
