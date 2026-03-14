import { useDeferredValue } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { BandPosition, Candle, DivergenceType, EmaPosition } from '@btc-tui/core/models';

import { useAppStore, type DashboardStoreState } from '../../store/app-store';
import { formatClock, formatPrice, formatQuantity, formatSigned, getTone } from './format';
import { WidgetBadge, WidgetFrame } from './WidgetFrame';

interface CandleAnnotation {
  delta: number | null;
  cvdBuyPct: number | null;
  emaPosition: EmaPosition | null;
  priceBb: BandPosition | null;
  deltaBb: BandPosition | null;
  divergence: DivergenceType | null;
}

function CandleAnnotations(props: { annotation: CandleAnnotation | null }) {
  if (!props.annotation) {
    return null;
  }

  const badges = [
    props.annotation.delta !== null ? (
      <WidgetBadge key="delta" tone={`${getTone(props.annotation.delta)} border-matrix-border/40`}>
        delta {formatSigned(props.annotation.delta)}
      </WidgetBadge>
    ) : null,
    props.annotation.cvdBuyPct !== null ? (
      <WidgetBadge key="cvd">
        cvd {props.annotation.cvdBuyPct}%
      </WidgetBadge>
    ) : null,
    props.annotation.emaPosition ? (
      <WidgetBadge key="ema">ema {props.annotation.emaPosition}</WidgetBadge>
    ) : null,
    props.annotation.priceBb ? (
      <WidgetBadge key="price-bb">price bb {props.annotation.priceBb}</WidgetBadge>
    ) : null,
    props.annotation.deltaBb ? (
      <WidgetBadge key="delta-bb">delta bb {props.annotation.deltaBb}</WidgetBadge>
    ) : null,
    props.annotation.divergence ? (
      <WidgetBadge key="divergence">div {props.annotation.divergence}</WidgetBadge>
    ) : null
  ].filter(Boolean);

  if (badges.length === 0) {
    return null;
  }

  return <div className="mt-2 flex flex-wrap gap-1.5">{badges}</div>;
}

function CandleRow(props: {
  candle: Candle;
  timeframe: '1m' | '5m';
  annotateLatest?: boolean;
  annotation: CandleAnnotation | null;
}) {
  return (
    <div className="border border-matrix-border/25 bg-[rgba(2,11,5,0.76)] px-3 py-2 text-[0.78rem] uppercase">
      <div className="grid grid-cols-[88px_minmax(0,1fr)_76px] gap-3">
        <span className="text-matrix-muted">
          {formatClock(new Date(props.candle.timestamp).toISOString())}
        </span>
        <span className="truncate text-matrix-text">{formatPrice(props.candle.close)}</span>
        <span className="text-right text-matrix-accent">
          {formatQuantity(props.candle.volume)}
        </span>
      </div>
      {props.timeframe === '5m' && props.annotateLatest ? (
        <CandleAnnotations annotation={props.annotation} />
      ) : null}
    </div>
  );
}

export function CandleCloseWidget(props: { timeframe: '1m' | '5m' }) {
  const {
    candles,
    latest,
    delta,
    cvdBuyPct,
    emaPosition,
    priceBb,
    deltaBb,
    divergence
  } = useAppStore(
    useShallow((state: DashboardStoreState) => ({
      candles: state.bootstrap[props.timeframe],
      latest: state.latestCandles[props.timeframe],
      delta: props.timeframe === '5m' ? state.deltaAnalytics?.stats.delta ?? null : null,
      cvdBuyPct:
        props.timeframe === '5m' ? state.cvdAnalytics?.stats.buyPct5m ?? null : null,
      emaPosition:
        props.timeframe === '5m'
          ? state.indicatorAnalytics?.snapshot.emaPosition ?? null
          : null,
      priceBb:
        props.timeframe === '5m'
          ? state.indicatorAnalytics?.snapshot.priceBb ?? null
          : null,
      deltaBb:
        props.timeframe === '5m'
          ? state.indicatorAnalytics?.snapshot.deltaBb ?? null
          : null,
      divergence:
        props.timeframe === '5m'
          ? state.indicatorAnalytics?.snapshot.divergence ?? null
          : null
    }))
  );

  const deferredCandles = useDeferredValue(candles);
  const visibleCandles = deferredCandles.slice(-8).reverse();
  const annotation =
    props.timeframe === '5m' &&
    (delta !== null ||
      cvdBuyPct !== null ||
      emaPosition !== null ||
      priceBb !== null ||
      deltaBb !== null ||
      divergence !== null)
      ? {
          delta,
          cvdBuyPct,
          emaPosition,
          priceBb,
          deltaBb,
          divergence
        }
      : null;

  return (
    <WidgetFrame
      title={`${props.timeframe.toUpperCase()} Candle Tape`}
      eyebrow={`bootstrap cache ${visibleCandles.length}`}
      aside={
        <WidgetBadge>
          latest {latest ? formatPrice(latest.close) : '—'}
        </WidgetBadge>
      }
    >
      <div className="grid gap-2">
        {visibleCandles.length > 0 ? (
          visibleCandles.map((candle, index) => (
            <CandleRow
              key={`${props.timeframe}-${candle.timestamp}`}
              candle={candle}
              timeframe={props.timeframe}
              annotateLatest={index === 0}
              annotation={annotation}
            />
          ))
        ) : (
          <p className="m-0 border border-dashed border-matrix-border/35 px-3 py-4 text-[0.78rem] uppercase tracking-[0.12em] text-matrix-muted">
            awaiting bootstrap candles
          </p>
        )}
      </div>
    </WidgetFrame>
  );
}
