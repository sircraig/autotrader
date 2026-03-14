import { useDeferredValue } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { tradingConfig } from '@autotrader/core/config/trading';
import type { PointSignalPayload } from '@autotrader/core/models';

import { useAppStore, type DashboardStoreState } from '../../store/app-store';
import { formatSigned, getTone } from './format';
import { WidgetBadge, WidgetFrame, WidgetRow } from './WidgetFrame';

function PointSignalCard(props: { signal: PointSignalPayload }) {
  const tone =
    props.signal.direction === 'LONG'
      ? 'text-matrix-accent-strong border-matrix-accent/30'
      : 'text-[#ffb9aa] border-[#ff9d8e]/30';

  return (
    <div className={`border bg-[rgba(2,11,5,0.76)] px-3 py-2 text-[0.76rem] uppercase ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <span>{props.signal.direction}</span>
        <span>{props.signal.action}</span>
      </div>
      <div className="mt-2 grid gap-1 text-[0.72rem] tracking-[0.08em] text-matrix-muted">
        <span>points {props.signal.points}</span>
        <span>
          ema {props.signal.indicators.emaPosition ?? '—'} • cvd{' '}
          {props.signal.indicators.cvdBuyPct}%
        </span>
        <span>
          bb {props.signal.indicators.priceBb ?? '—'} /{' '}
          {props.signal.indicators.deltaBb ?? '—'}
        </span>
      </div>
    </div>
  );
}

export function PointSignalsWidget() {
  const { pointSignals, deltaAnalytics, cvdAnalytics, indicatorAnalytics } = useAppStore(
    useShallow((state: DashboardStoreState) => ({
      pointSignals: state.recentPointSignals,
      deltaAnalytics: state.deltaAnalytics,
      cvdAnalytics: state.cvdAnalytics,
      indicatorAnalytics: state.indicatorAnalytics
    }))
  );

  const deferredSignals = useDeferredValue(pointSignals);
  const visibleSignals = deferredSignals.slice(0, 4);
  const pnlTotal = deltaAnalytics?.stats.pnlTotal1h ?? null;
  const atr = indicatorAnalytics?.snapshot.atr ?? null;
  const atrSma = indicatorAnalytics?.snapshot.atrSma ?? null;
  const atrAboveMin = atr !== null && atr >= tradingConfig.pointSignals.minAtrValue;
  const atrAboveSma = atr !== null && atrSma !== null && atr > atrSma;

  return (
    <WidgetFrame
      title="Point Signals"
      eyebrow="multi-indicator strategy"
      aside={
        <WidgetBadge>
          open {tradingConfig.pointSignals.openThreshold} / close{' '}
          {tradingConfig.pointSignals.closeThreshold}
        </WidgetBadge>
      }
    >
      <div className="grid gap-4">
        <div>
          <WidgetRow
            label="1h pnl gate"
            value={`${formatSigned(pnlTotal)} > ${tradingConfig.pointSignals.minPnlTotal1h}`}
            tone={getTone(pnlTotal)}
          />
          <WidgetRow
            label="atr gate"
            value={atr !== null ? `${formatSigned(atr)} / min ${tradingConfig.pointSignals.minAtrValue}` : '—'}
            tone={atrAboveMin ? 'text-matrix-accent-strong' : 'text-[#ffb9aa]'}
          />
          <WidgetRow
            label="atr > sma"
            value={
              atr !== null && atrSma !== null
                ? `${formatSigned(atr)} > ${formatSigned(atrSma)}`
                : '—'
            }
            tone={atrAboveSma ? 'text-matrix-accent-strong' : 'text-[#ffe5a1]'}
          />
          <WidgetRow
            label="ema / divergence"
            value={
              indicatorAnalytics
                ? `${indicatorAnalytics.snapshot.emaPosition ?? '—'} / ${indicatorAnalytics.snapshot.divergence ?? '—'}`
                : '—'
            }
          />
          <WidgetRow
            label="cvd buy pct"
            value={cvdAnalytics ? `${cvdAnalytics.stats.buyPct5m}%` : '—'}
          />
        </div>

        <div className="grid gap-2">
          {visibleSignals.length > 0 ? (
            visibleSignals.map((signal, index) => (
              <PointSignalCard
                key={`${signal.direction}-${signal.action}-${index}`}
                signal={signal}
              />
            ))
          ) : (
            <p className="m-0 border border-dashed border-matrix-border/35 px-3 py-4 text-[0.78rem] uppercase tracking-[0.12em] text-matrix-muted">
              no point-signal events yet
            </p>
          )}
        </div>
      </div>
    </WidgetFrame>
  );
}
