import { tradingConfig } from '../config/trading';
import type { DivergenceType } from '../models';

export interface SwingPoints {
  swingHighs: number[];
  swingLows: number[];
}

export function findSwingPoints(
  values: number[],
  lookback: number = tradingConfig.divergence.swingLookback
): SwingPoints {
  const swingHighs: number[] = [];
  const swingLows: number[] = [];

  for (let index = lookback; index < values.length - lookback; index += 1) {
    let isHigh = true;
    let isLow = true;

    for (let offset = 1; offset <= lookback; offset += 1) {
      if (values[index]! <= values[index - offset]! || values[index]! <= values[index + offset]!) {
        isHigh = false;
      }

      if (values[index]! >= values[index - offset]! || values[index]! >= values[index + offset]!) {
        isLow = false;
      }

      if (!isHigh && !isLow) {
        break;
      }
    }

    if (isHigh) {
      swingHighs.push(index);
    }

    if (isLow) {
      swingLows.push(index);
    }
  }

  return {
    swingHighs,
    swingLows
  };
}

export function detectRsiDivergence(
  pricesLow: number[],
  pricesHigh: number[],
  rsiValues: Array<number | null>,
  lookback: number = tradingConfig.divergence.swingLookback,
  minDistance: number = tradingConfig.divergence.minDistance,
  maxDistance: number = tradingConfig.divergence.maxDistance
): Record<number, DivergenceType> {
  const divergences: Record<number, DivergenceType> = {};
  const { swingLows } = findSwingPoints(pricesLow, lookback);
  const { swingHighs } = findSwingPoints(pricesHigh, lookback);

  const validSwingLows = swingLows.filter(
    (index) => index < rsiValues.length && rsiValues[index] !== null
  );
  const validSwingHighs = swingHighs.filter(
    (index) => index < rsiValues.length && rsiValues[index] !== null
  );

  for (let index = 1; index < validSwingLows.length; index += 1) {
    const firstIndex = validSwingLows[index - 1]!;
    const secondIndex = validSwingLows[index]!;
    const distance = secondIndex - firstIndex;

    if (distance < minDistance || distance > maxDistance) {
      continue;
    }

    const firstPrice = pricesLow[firstIndex]!;
    const secondPrice = pricesLow[secondIndex]!;
    const firstRsi = rsiValues[firstIndex] ?? null;
    const secondRsi = rsiValues[secondIndex] ?? null;

    if (firstRsi === null || secondRsi === null) {
      continue;
    }

    if (
      secondPrice < firstPrice * tradingConfig.divergence.bullishPriceFactor &&
      secondRsi > firstRsi + tradingConfig.divergence.bullishRsiDelta
    ) {
      divergences[secondIndex] = 'bullish';
    }
  }

  for (let index = 1; index < validSwingHighs.length; index += 1) {
    const firstIndex = validSwingHighs[index - 1]!;
    const secondIndex = validSwingHighs[index]!;
    const distance = secondIndex - firstIndex;

    if (distance < minDistance || distance > maxDistance) {
      continue;
    }

    const firstPrice = pricesHigh[firstIndex]!;
    const secondPrice = pricesHigh[secondIndex]!;
    const firstRsi = rsiValues[firstIndex] ?? null;
    const secondRsi = rsiValues[secondIndex] ?? null;

    if (firstRsi === null || secondRsi === null) {
      continue;
    }

    if (
      secondPrice > firstPrice * tradingConfig.divergence.bearishPriceFactor &&
      secondRsi < firstRsi - tradingConfig.divergence.bearishRsiDelta
    ) {
      divergences[secondIndex] = 'bearish';
    }
  }

  return divergences;
}
