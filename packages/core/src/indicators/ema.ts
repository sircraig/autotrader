import { tradingConfig } from '../config/trading';

export function calculateEma(
  values: number[],
  period: number = tradingConfig.indicators.emaPeriod
): Array<number | null> {
  if (values.length < period) {
    return values.map(() => null);
  }

  const emaValues: Array<number | null> = Array.from({ length: period - 1 }, () => null);
  const sma = values.slice(0, period).reduce((total, value) => total + value, 0) / period;
  emaValues.push(sma);

  const multiplier = 2 / (period + 1);

  for (let index = period; index < values.length; index += 1) {
    const previousEma = emaValues[emaValues.length - 1] ?? null;

    if (previousEma === null) {
      throw new Error('EMA series produced an unexpected null value');
    }

    const ema = (values[index]! - previousEma) * multiplier + previousEma;
    emaValues.push(ema);
  }

  return emaValues;
}
