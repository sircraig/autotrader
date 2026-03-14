import { tradingConfig } from '../config/trading';

export interface OhlcValue {
  high: number;
  low: number;
  close: number;
}

export function calculateAtr(
  candles: OhlcValue[],
  period: number = tradingConfig.indicators.atrPeriod
): Array<number | null> {
  if (candles.length < 2) {
    return candles.map(() => null);
  }

  const trueRanges = [candles[0]!.high - candles[0]!.low];

  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index]!;
    const previousClose = candles[index - 1]!.close;
    const trueRange = Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );

    trueRanges.push(trueRange);
  }

  if (trueRanges.length < period) {
    return candles.map(() => null);
  }

  const atrValues: Array<number | null> = Array.from({ length: period - 1 }, () => null);
  const firstAtr = trueRanges.slice(0, period).reduce((total, value) => total + value, 0) / period;
  atrValues.push(firstAtr);

  for (let index = period; index < trueRanges.length; index += 1) {
    const previousAtr = atrValues[atrValues.length - 1] ?? null;

    if (previousAtr === null) {
      throw new Error('ATR series produced an unexpected null value');
    }

    const atr = (previousAtr * (period - 1) + trueRanges[index]!) / period;
    atrValues.push(atr);
  }

  return atrValues;
}

export function calculateSma(
  values: Array<number | null>,
  period: number
): Array<number | null> {
  const smaValues: Array<number | null> = [];

  for (let index = 0; index < values.length; index += 1) {
    if (index < period - 1 || values[index] === null) {
      smaValues.push(null);
      continue;
    }

    const window = values
      .slice(index - period + 1, index + 1)
      .filter((value): value is number => value !== null);

    if (window.length === period) {
      smaValues.push(window.reduce((total, value) => total + value, 0) / period);
    } else {
      smaValues.push(null);
    }
  }

  return smaValues;
}
