import { tradingConfig } from '../config/trading';

export function calculateRsi(
  closes: number[],
  period: number = tradingConfig.indicators.rsiPeriod
): Array<number | null> {
  if (closes.length < period + 1) {
    return closes.map(() => null);
  }

  const rsiValues: Array<number | null> = Array.from({ length: period }, () => null);
  const gains: number[] = [];
  const losses: number[] = [];

  for (let index = 1; index <= period; index += 1) {
    const change = closes[index]! - closes[index - 1]!;
    gains.push(Math.max(0, change));
    losses.push(Math.max(0, -change));
  }

  let averageGain = gains.reduce((total, value) => total + value, 0) / period;
  let averageLoss = losses.reduce((total, value) => total + value, 0) / period;

  if (averageLoss === 0) {
    rsiValues.push(100);
  } else {
    const relativeStrength = averageGain / averageLoss;
    rsiValues.push(100 - 100 / (1 + relativeStrength));
  }

  for (let index = period + 1; index < closes.length; index += 1) {
    const change = closes[index]! - closes[index - 1]!;
    const gain = Math.max(0, change);
    const loss = Math.max(0, -change);

    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;

    if (averageLoss === 0) {
      rsiValues.push(100);
    } else {
      const relativeStrength = averageGain / averageLoss;
      rsiValues.push(100 - 100 / (1 + relativeStrength));
    }
  }

  return rsiValues;
}
