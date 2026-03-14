import type { ReactNode } from 'react';

import {
  buildChartSurfaceState,
  type ChartBandPoint,
  type ChartSeriesPoint
} from '@autotrader/core';
import { useShallow } from 'zustand/react/shallow';

import { WidgetBadge, WidgetFrame } from '../widgets';
import { formatSigned } from '../widgets/format';
import { type DashboardStoreState, useAppStore } from '../../store/app-store';

const CHART_WIDTH = 960;
const PANE_HEIGHT = 144;

interface ValueRange {
  min: number;
  max: number;
}

function isNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function createRange(values: Array<number | null>, minimumPadding = 1): ValueRange {
  const numericValues = values.filter(isNumber);

  if (numericValues.length === 0) {
    return {
      min: 0,
      max: 1
    };
  }

  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const span = max - min;
  const padding = span === 0 ? minimumPadding : Math.max(span * 0.12, minimumPadding);

  return {
    min: min - padding,
    max: max + padding
  };
}

function xForIndex(index: number, count: number, width: number): number {
  if (count <= 1) {
    return width / 2;
  }

  return (index / (count - 1)) * width;
}

function yForValue(value: number, range: ValueRange, height: number): number {
  const span = range.max - range.min || 1;
  const offset = (value - range.min) / span;
  return height - offset * height;
}

function buildPolyline(
  series: ChartSeriesPoint[],
  range: ValueRange,
  width: number,
  height: number
): string {
  return series
    .map((point, index) => {
      if (!isNumber(point.value)) {
        return null;
      }

      return `${xForIndex(index, series.length, width)},${yForValue(point.value, range, height)}`;
    })
    .filter((point): point is string => point !== null)
    .join(' ');
}

function buildBandPolyline(
  series: ChartBandPoint[],
  key: 'upper' | 'middle' | 'lower',
  range: ValueRange,
  width: number,
  height: number
): string {
  return series
    .map((point, index) => {
      const value = point[key];

      if (!isNumber(value)) {
        return null;
      }

      return `${xForIndex(index, series.length, width)},${yForValue(value, range, height)}`;
    })
    .filter((point): point is string => point !== null)
    .join(' ');
}

function renderGrid(height: number) {
  return [0.2, 0.4, 0.6, 0.8].map((ratio) => (
    <line
      key={ratio}
      x1="0"
      x2={CHART_WIDTH}
      y1={height * ratio}
      y2={height * ratio}
      stroke="rgba(91,255,140,0.08)"
      strokeDasharray="5 9"
      strokeWidth="1"
    />
  ));
}

function formatMetric(
  value: number | null | undefined,
  digits = 2
): string {
  if (!isNumber(value)) {
    return '—';
  }

  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function getSummaryTone(value: string | null | boolean): string {
  if (value === null) {
    return 'border-matrix-border/50 text-matrix-muted';
  }

  if (value === true || value === 'above' || value === 'bullish') {
    return 'border-matrix-accent-strong/60 text-matrix-accent-strong';
  }

  if (value === false) {
    return 'border-matrix-border/50 text-matrix-text';
  }

  if (value === 'below' || value === 'bearish') {
    return 'border-[#ffb9aa]/60 text-[#ffb9aa]';
  }

  if (value === 'touch') {
    return 'border-[#ffe5a1]/60 text-[#ffe5a1]';
  }

  return 'border-matrix-border/50 text-matrix-text';
}

function SummaryCell(props: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="border border-matrix-border/25 bg-[rgba(2,10,5,0.86)] px-3 py-2.5">
      <p className="mb-1 text-[0.66rem] uppercase tracking-[0.18em] text-matrix-muted">
        {props.label}
      </p>
      <p className={`m-0 text-[0.92rem] uppercase tracking-[0.08em] ${props.tone ?? 'text-matrix-text'}`}>
        {props.value}
      </p>
    </div>
  );
}

function PaneShell(props: {
  title: string;
  meta: string;
  children: ReactNode;
}) {
  return (
    <div className="border border-matrix-border/25 bg-[rgba(3,12,6,0.74)] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="m-0 text-[0.72rem] uppercase tracking-[0.18em] text-matrix-accent-strong">
          {props.title}
        </p>
        <p className="m-0 text-[0.68rem] uppercase tracking-[0.14em] text-matrix-muted">
          {props.meta}
        </p>
      </div>
      {props.children}
    </div>
  );
}

function EmptyState(props: {
  message: string;
  height: number;
}) {
  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${props.height}`}
      className="block h-auto w-full"
      role="img"
      aria-label={props.message}
    >
      <rect width={CHART_WIDTH} height={props.height} fill="rgba(0,0,0,0.12)" />
      {renderGrid(props.height)}
      <text
        x={CHART_WIDTH / 2}
        y={props.height / 2}
        fill="rgba(127,176,141,0.92)"
        fontSize="24"
        letterSpacing="4"
        textAnchor="middle"
      >
        {props.message}
      </text>
    </svg>
  );
}

function LinePane(props: {
  title: string;
  meta: string;
  series: ChartSeriesPoint[];
  secondarySeries?: ChartSeriesPoint[];
  bands?: ChartBandPoint[];
  height: number;
  range?: ValueRange;
  lineColor: string;
  secondaryLineColor?: string;
  referenceLines?: number[];
  baseline?: number;
  emptyMessage: string;
}) {
  const values = [
    ...props.series.map((point) => point.value),
    ...(props.secondarySeries?.map((point) => point.value) ?? []),
    ...(props.bands?.flatMap((point) => [point.upper, point.middle, point.lower]) ?? [])
  ];
  const range = props.range ?? createRange(values, props.baseline === 0 ? 2 : 1);
  const linePolyline = buildPolyline(props.series, range, CHART_WIDTH, props.height);
  const secondaryPolyline = props.secondarySeries
    ? buildPolyline(props.secondarySeries, range, CHART_WIDTH, props.height)
    : '';
  const upperBand = props.bands
    ? buildBandPolyline(props.bands, 'upper', range, CHART_WIDTH, props.height)
    : '';
  const middleBand = props.bands
    ? buildBandPolyline(props.bands, 'middle', range, CHART_WIDTH, props.height)
    : '';
  const lowerBand = props.bands
    ? buildBandPolyline(props.bands, 'lower', range, CHART_WIDTH, props.height)
    : '';
  const hasData = linePolyline.length > 0;

  return (
    <PaneShell title={props.title} meta={props.meta}>
      {!hasData ? (
        <EmptyState height={props.height} message={props.emptyMessage} />
      ) : (
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${props.height}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`${props.title} pane`}
        >
          <rect width={CHART_WIDTH} height={props.height} fill="rgba(0,0,0,0.12)" />
          {renderGrid(props.height)}
          {props.referenceLines?.map((referenceLine) => (
            <line
              key={referenceLine}
              x1="0"
              x2={CHART_WIDTH}
              y1={yForValue(referenceLine, range, props.height)}
              y2={yForValue(referenceLine, range, props.height)}
              stroke="rgba(255,229,161,0.34)"
              strokeDasharray="5 7"
              strokeWidth="1"
            />
          ))}
          {props.baseline === undefined ? null : (
            <line
              x1="0"
              x2={CHART_WIDTH}
              y1={yForValue(props.baseline, range, props.height)}
              y2={yForValue(props.baseline, range, props.height)}
              stroke="rgba(127,176,141,0.34)"
              strokeDasharray="4 8"
              strokeWidth="1"
            />
          )}
          {upperBand ? (
            <polyline
              fill="none"
              points={upperBand}
              stroke="rgba(255,229,161,0.68)"
              strokeDasharray="5 6"
              strokeWidth="1.6"
            />
          ) : null}
          {middleBand ? (
            <polyline
              fill="none"
              points={middleBand}
              stroke="rgba(127,176,141,0.52)"
              strokeDasharray="4 7"
              strokeWidth="1.2"
            />
          ) : null}
          {lowerBand ? (
            <polyline
              fill="none"
              points={lowerBand}
              stroke="rgba(255,229,161,0.68)"
              strokeDasharray="5 6"
              strokeWidth="1.6"
            />
          ) : null}
          {secondaryPolyline ? (
            <polyline
              fill="none"
              points={secondaryPolyline}
              stroke={props.secondaryLineColor ?? 'rgba(255,185,170,0.88)'}
              strokeWidth="2"
            />
          ) : null}
          <polyline
            fill="none"
            points={linePolyline}
            stroke={props.lineColor}
            strokeWidth="2.3"
          />
        </svg>
      )}
    </PaneShell>
  );
}

export function MultiPaneChartWidget() {
  const { candles5m, deltaHistory, indicatorSnapshot } = useAppStore(
    useShallow((state: DashboardStoreState) => ({
      candles5m: state.bootstrap['5m'],
      deltaHistory: state.deltaHistory,
      indicatorSnapshot: state.indicatorAnalytics?.snapshot ?? null
    }))
  );

  const surface = buildChartSurfaceState({
    candles: candles5m,
    deltaPoints: deltaHistory,
    indicatorSnapshot
  });
  const latestRsi = surface.rsiSeries.at(-1)?.value ?? null;
  const latestDelta = surface.deltaSeries.at(-1)?.value ?? null;

  return (
    <WidgetFrame
      title="Chart Surface"
      eyebrow="task_14 // rsi, atr, delta"
      aside={
        <div className="flex flex-wrap justify-end gap-2 text-[0.68rem] uppercase tracking-[0.16em]">
          <WidgetBadge tone={getSummaryTone(surface.summary.emaPosition)}>
            ema.{surface.summary.emaPosition ?? 'na'}
          </WidgetBadge>
          <WidgetBadge tone={getSummaryTone(surface.summary.priceBb)}>
            price_bb.{surface.summary.priceBb ?? 'inside'}
          </WidgetBadge>
          <WidgetBadge tone={getSummaryTone(surface.summary.deltaBb)}>
            delta_bb.{surface.summary.deltaBb ?? 'inside'}
          </WidgetBadge>
          <WidgetBadge tone={getSummaryTone(surface.summary.divergence)}>
            div.{surface.summary.divergence ?? 'none'}
          </WidgetBadge>
        </div>
      }
    >
      <div className="grid gap-3">
        <div className="grid gap-3 xl:grid-cols-3">
          <LinePane
            title="RSI"
            meta={formatMetric(latestRsi)}
            series={surface.rsiSeries}
            height={PANE_HEIGHT}
            range={{ min: 0, max: 100 }}
            lineColor="rgba(91,255,140,0.9)"
            referenceLines={[30, 70]}
            emptyMessage="RSI PENDING"
          />
          <LinePane
            title="ATR / ATR SMA"
            meta={`${formatMetric(surface.summary.atr)} / ${formatMetric(surface.summary.atrSma)}`}
            series={surface.atrSeries}
            secondarySeries={surface.atrSmaSeries}
            height={PANE_HEIGHT}
            lineColor="rgba(91,255,140,0.9)"
            secondaryLineColor="rgba(255,185,170,0.88)"
            emptyMessage="ATR PENDING"
          />
          <LinePane
            title="Delta"
            meta={formatSigned(latestDelta)}
            series={surface.deltaSeries}
            bands={surface.deltaBandSeries}
            height={PANE_HEIGHT}
            lineColor="rgba(255,229,161,0.92)"
            baseline={0}
            emptyMessage="DELTA FEED WAITING"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <SummaryCell
            label="ema position"
            value={surface.summary.emaPosition ?? '—'}
            tone={getSummaryTone(surface.summary.emaPosition)}
          />
          <SummaryCell
            label="price outside bb"
            value={surface.summary.priceBb ?? 'inside'}
            tone={getSummaryTone(surface.summary.priceBb)}
          />
          <SummaryCell
            label="delta outside bb"
            value={surface.summary.deltaBb ?? 'inside'}
            tone={getSummaryTone(surface.summary.deltaBb)}
          />
          <SummaryCell
            label="recent divergence"
            value={surface.summary.divergence ?? 'none'}
            tone={getSummaryTone(surface.summary.divergence)}
          />
          <SummaryCell
            label="latest atr"
            value={formatMetric(surface.summary.atr)}
          />
          <SummaryCell
            label="latest atr sma"
            value={formatMetric(surface.summary.atrSma)}
            tone={surface.summary.atrBelowSma ? 'text-[#ffb9aa]' : 'text-matrix-text'}
          />
        </div>
      </div>
    </WidgetFrame>
  );
}
