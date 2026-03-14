import { tradingConfig } from '../config/trading';
import type { BandPosition, Candle, DivergenceType, EmaPosition } from '../models';

import { calculateAtr, calculateSma, type OhlcValue } from './atr';
import { calculateBollingerBands, type BollingerBands } from './bollinger';
import { detectRsiDivergence } from './divergence';
import { calculateEma } from './ema';
import { calculateRsi } from './rsi';

export function getLatestDefinedValue(values: Array<number | null>): number | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index] ?? null;
    if (value !== null) {
      return value;
    }
  }

  return null;
}

export function getBandPosition(
  value: number,
  upper: number | null | undefined,
  lower: number | null | undefined
): BandPosition | null {
  if (upper === null || upper === undefined || lower === null || lower === undefined) {
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

export function getPriceBandPosition(
  values: number[],
  bands?: BollingerBands
): BandPosition | null {
  if (values.length === 0) {
    return null;
  }

  const resolvedBands = bands ?? calculateBollingerBands(values);
  const latestIndex = values.length - 1;

  return getBandPosition(
    values[latestIndex]!,
    resolvedBands.upper[latestIndex],
    resolvedBands.lower[latestIndex]
  );
}

export function getEmaPosition(
  candles: Array<Pick<Candle, 'open' | 'close'>>,
  period: number = tradingConfig.indicators.emaPeriod
): EmaPosition | null {
  if (candles.length < period) {
    return null;
  }

  const emaValues = calculateEma(
    candles.map((candle) => candle.close),
    period
  );
  const latestEma = emaValues[emaValues.length - 1] ?? null;

  if (latestEma === null) {
    return null;
  }

  const latestCandle = candles[candles.length - 1]!;

  if (latestCandle.open > latestEma && latestCandle.close > latestEma) {
    return 'above';
  }

  if (latestCandle.open < latestEma && latestCandle.close < latestEma) {
    return 'below';
  }

  return 'touch';
}

export function getRecentDivergence(
  divergences: Record<number, DivergenceType>,
  totalCandles: number,
  recentCandles: number = 3
): DivergenceType | null {
  for (
    let index = totalCandles - 1;
    index >= Math.max(totalCandles - recentCandles, 0);
    index -= 1
  ) {
    const divergence = divergences[index];
    if (divergence) {
      return divergence;
    }
  }

  return null;
}

export function getRecentRsiDivergence(
  candles: Array<Pick<Candle, 'low' | 'high' | 'close'>>,
  rsiPeriod: number = tradingConfig.indicators.rsiPeriod,
  recentCandles: number = 3
): DivergenceType | null {
  if (candles.length < rsiPeriod + 10) {
    return null;
  }

  const divergences = detectRsiDivergence(
    candles.map((candle) => candle.low),
    candles.map((candle) => candle.high),
    calculateRsi(
      candles.map((candle) => candle.close),
      rsiPeriod
    )
  );

  return getRecentDivergence(divergences, candles.length, recentCandles);
}

export function getLatestAtr(
  candles: OhlcValue[],
  period: number = tradingConfig.indicators.atrPeriod
): number | null {
  if (candles.length < period) {
    return null;
  }

  return getLatestDefinedValue(calculateAtr(candles, period));
}

export function getLatestAtrSma(
  candles: OhlcValue[],
  atrPeriod: number = tradingConfig.indicators.atrPeriod,
  atrSmaPeriod: number = tradingConfig.indicators.atrSmaPeriod
): number | null {
  if (candles.length < atrPeriod) {
    return null;
  }

  const atrValues = calculateAtr(candles, atrPeriod);
  return getLatestDefinedValue(calculateSma(atrValues, atrSmaPeriod));
}
