import { tradingConfig } from '../config/trading';
import type { BandPosition, Candle, DivergenceType, EmaPosition, IndicatorSnapshot } from '../models';
import { calculateAtr, calculateSma } from './atr';
import { calculateBollingerBands } from './bollinger';
import { detectRsiDivergence } from './divergence';
import { calculateEma } from './ema';
import { calculateRsi } from './rsi';

export interface ChartSeriesPoint {
  timestamp: number;
  value: number | null;
}

export interface ChartBandPoint extends ChartSeriesPoint {
  upper: number | null;
  middle: number | null;
  lower: number | null;
}

export interface DeltaSeriesPoint {
  timestamp: number;
  value: number;
}

export interface ChartSurfaceState {
  candles: Candle[];
  emaSeries: ChartSeriesPoint[];
  priceBandSeries: ChartBandPoint[];
  rsiSeries: ChartSeriesPoint[];
  atrSeries: ChartSeriesPoint[];
  atrSmaSeries: ChartSeriesPoint[];
  deltaSeries: ChartSeriesPoint[];
  deltaBandSeries: ChartBandPoint[];
  summary: IndicatorSnapshot;
  latestDivergence: DivergenceType | null;
}

export interface BuildChartSurfaceStateOptions {
  candles: Candle[];
  deltaPoints?: DeltaSeriesPoint[];
  indicatorSnapshot?: IndicatorSnapshot | null;
  maxCandles?: number;
}

function sortCandles(candles: Candle[], maxCandles: number): Candle[] {
  return [...candles]
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-maxCandles);
}

function sortDeltaPoints(points: DeltaSeriesPoint[], maxPoints: number): DeltaSeriesPoint[] {
  return [...points]
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-maxPoints);
}

function toSeries(
  timestamps: number[],
  values: Array<number | null>
): ChartSeriesPoint[] {
  return timestamps.map((timestamp, index) => ({
    timestamp,
    value: values[index] ?? null
  }));
}

function toBandSeries(
  timestamps: number[],
  values: number[],
  upper: Array<number | null>,
  middle: Array<number | null>,
  lower: Array<number | null>
): ChartBandPoint[] {
  return timestamps.map((timestamp, index) => ({
    timestamp,
    value: values[index] ?? null,
    upper: upper[index] ?? null,
    middle: middle[index] ?? null,
    lower: lower[index] ?? null
  }));
}

function resolveBandPosition(
  value: number | null,
  upper: number | null,
  lower: number | null
): BandPosition | null {
  if (value === null || upper === null || lower === null) {
    return null;
  }

  if (value > upper) {
    return 'above';
  }

  if (value < lower) {
    return 'below';
  }

  return null;
}

function resolveEmaPosition(
  open: number | null,
  close: number | null,
  ema: number | null
): EmaPosition | null {
  if (open === null || close === null || ema === null) {
    return null;
  }

  if (open > ema && close > ema) {
    return 'above';
  }

  if (open < ema && close < ema) {
    return 'below';
  }

  return 'touch';
}

function getMostRecentDivergence(
  divergences: Record<number, DivergenceType>
): DivergenceType | null {
  const indices = Object.keys(divergences)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (indices.length === 0) {
    return null;
  }

  return divergences[indices.at(-1)!] ?? null;
}

function getNewlyDetectedDivergence(
  divergences: Record<number, DivergenceType>,
  candleCount: number,
  swingLookback: number = tradingConfig.divergence.swingLookback
): DivergenceType | null {
  const latestDetectableIndex = candleCount - swingLookback - 1;

  if (latestDetectableIndex < 0) {
    return null;
  }

  return divergences[latestDetectableIndex] ?? null;
}

function buildComputedSummary(args: {
  candles: Candle[];
  closes: number[];
  emaValues: Array<number | null>;
  priceBands: ReturnType<typeof calculateBollingerBands>;
  atrValues: Array<number | null>;
  atrSmaValues: Array<number | null>;
  divergences: Record<number, DivergenceType>;
  deltaSeries: DeltaSeriesPoint[];
  deltaBands: ReturnType<typeof calculateBollingerBands> | null;
}): IndicatorSnapshot {
  const latestClose = args.closes.at(-1) ?? null;
  const latestEma = args.emaValues.at(-1) ?? null;
  const latestAtr = args.atrValues.at(-1) ?? null;
  const latestAtrSma = args.atrSmaValues.at(-1) ?? null;
  const latestPriceUpper = args.priceBands.upper.at(-1) ?? null;
  const latestPriceLower = args.priceBands.lower.at(-1) ?? null;
  const latestCandle = args.candles.at(-1) ?? null;
  const latestDelta = args.deltaSeries.at(-1)?.value ?? null;
  const latestDeltaUpper = args.deltaBands?.upper.at(-1) ?? null;
  const latestDeltaLower = args.deltaBands?.lower.at(-1) ?? null;

  return {
    priceBb: resolveBandPosition(latestClose, latestPriceUpper, latestPriceLower),
    deltaBb: resolveBandPosition(latestDelta, latestDeltaUpper, latestDeltaLower),
    emaPosition: resolveEmaPosition(latestCandle?.open ?? null, latestClose, latestEma),
    divergence: getNewlyDetectedDivergence(args.divergences, args.candles.length),
    atr: latestAtr,
    atrSma: latestAtrSma,
    atrBelowSma:
      latestAtr !== null && latestAtrSma !== null ? latestAtr < latestAtrSma : false
  };
}

export function buildChartSurfaceState(
  options: BuildChartSurfaceStateOptions
): ChartSurfaceState {
  const maxCandles = options.maxCandles ?? tradingConfig.indicators.maxCandles;
  const candles = sortCandles(options.candles, maxCandles);
  const closes = candles.map((candle) => candle.close);
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  const timestamps = candles.map((candle) => candle.timestamp);

  const emaValues = calculateEma(closes);
  const priceBands = calculateBollingerBands(closes);
  const rsiValues = calculateRsi(closes);
  const atrValues = calculateAtr(candles);
  const atrSmaValues = calculateSma(atrValues, tradingConfig.indicators.atrSmaPeriod);
  const divergences = detectRsiDivergence(lows, highs, rsiValues);

  const deltaSeries = sortDeltaPoints(options.deltaPoints ?? [], maxCandles);
  const deltaValues = deltaSeries.map((point) => point.value);
  const deltaBands =
    deltaSeries.length > 0 ? calculateBollingerBands(deltaValues) : null;
  const computedSummary = buildComputedSummary({
    candles,
    closes,
    emaValues,
    priceBands,
    atrValues,
    atrSmaValues,
    divergences,
    deltaSeries,
    deltaBands
  });

  return {
    candles,
    emaSeries: toSeries(timestamps, emaValues),
    priceBandSeries: toBandSeries(
      timestamps,
      closes,
      priceBands.upper,
      priceBands.middle,
      priceBands.lower
    ),
    rsiSeries: toSeries(timestamps, rsiValues),
    atrSeries: toSeries(timestamps, atrValues),
    atrSmaSeries: toSeries(timestamps, atrSmaValues),
    deltaSeries: deltaSeries.map((point) => ({
      timestamp: point.timestamp,
      value: point.value
    })),
    deltaBandSeries:
      deltaBands === null
        ? []
        : toBandSeries(
            deltaSeries.map((point) => point.timestamp),
            deltaValues,
            deltaBands.upper,
            deltaBands.middle,
            deltaBands.lower
          ),
    summary: options.indicatorSnapshot ?? computedSummary,
    latestDivergence: getMostRecentDivergence(divergences)
  };
}
