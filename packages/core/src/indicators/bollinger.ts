import { tradingConfig } from '../config/trading';

export interface BollingerBands {
  upper: Array<number | null>;
  lower: Array<number | null>;
  middle: Array<number | null>;
}

export function calculateBollingerBands(
  values: number[],
  period: number = tradingConfig.indicators.bollingerPeriod,
  stdMultiplier: number = tradingConfig.indicators.bollingerStdMultiplier
): BollingerBands {
  const upper: Array<number | null> = [];
  const lower: Array<number | null> = [];
  const middle: Array<number | null> = [];

  for (let index = 0; index < values.length; index += 1) {
    if (index < period - 1) {
      upper.push(null);
      lower.push(null);
      middle.push(null);
      continue;
    }

    const window = values.slice(index - period + 1, index + 1);
    const sma = window.reduce((total, value) => total + value, 0) / window.length;
    const variance =
      window.reduce((total, value) => total + (value - sma) ** 2, 0) / window.length;
    const stdDev = Math.sqrt(variance);

    middle.push(sma);
    upper.push(sma + stdMultiplier * stdDev);
    lower.push(sma - stdMultiplier * stdDev);
  }

  return {
    upper,
    lower,
    middle
  };
}
