import { expect, test } from 'bun:test';

import { tradingConfig } from '../config/trading';

import { calculateAtr, calculateSma } from './atr';
import { calculateBollingerBands } from './bollinger';
import { detectRsiDivergence, findSwingPoints } from './divergence';
import { calculateEma } from './ema';
import {
  getBandPosition,
  getEmaPosition,
  getLatestAtr,
  getLatestAtrSma,
  getPriceBandPosition,
  getRecentDivergence
} from './helpers';
import { calculateRsi } from './rsi';

function expectNullableSeriesCloseTo(
  received: Array<number | null>,
  expected: Array<number | null>,
  precision: number = 10
): void {
  expect(received).toHaveLength(expected.length);

  received.forEach((value, index) => {
    const expectedValue = expected[index] ?? null;

    if (expectedValue === null) {
      expect(value).toBeNull();
      return;
    }

    expect(value).not.toBeUndefined();
    if (value === undefined) {
      return;
    }

    expect(value).toBeCloseTo(expectedValue, precision);
  });
}

test('calculateEma matches the Python parity vector', () => {
  expect(calculateEma([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([null, null, 2, 3, 4, 5, 6]);
});

test('calculateBollingerBands matches the Python parity vector', () => {
  const bands = calculateBollingerBands([1, 2, 3, 4, 5, 6, 7], 3, 2);

  expectNullableSeriesCloseTo(bands.upper, [
    null,
    null,
    3.632993161855452,
    4.6329931618554525,
    5.6329931618554525,
    6.6329931618554525,
    7.6329931618554525
  ]);
  expectNullableSeriesCloseTo(bands.lower, [
    null,
    null,
    0.36700683814454793,
    1.367006838144548,
    2.367006838144548,
    3.367006838144548,
    4.3670068381445475
  ]);
  expectNullableSeriesCloseTo(bands.middle, [null, null, 2, 3, 4, 5, 6]);
});

test('calculateRsi matches the Python parity vector', () => {
  expectNullableSeriesCloseTo(
    calculateRsi([44, 44.15, 43.9, 44.35, 44.8, 45, 45.1, 44.9, 45.4, 45.8], 3),
    [
      null,
      null,
      null,
      70.58823529411771,
      83.60655737704913,
      87.34177215189875,
      89.18918918918922,
      62.03007518796973,
      82.27292672224645,
      89.18918918918907
    ]
  );
});

test('calculateAtr and calculateSma match the Python parity vector', () => {
  const candles = [
    { high: 10, low: 8, close: 9 },
    { high: 11, low: 9, close: 10 },
    { high: 13, low: 10, close: 12 },
    { high: 12, low: 9, close: 10 },
    { high: 14, low: 11, close: 13 },
    { high: 15, low: 12, close: 14 }
  ];

  const atrValues = calculateAtr(candles, 3);
  const atrSmaValues = calculateSma(atrValues, 2);

  expectNullableSeriesCloseTo(atrValues, [
    null,
    null,
    2.3333333333333335,
    2.555555555555556,
    3.0370370370370368,
    3.024691358024691
  ]);
  expectNullableSeriesCloseTo(atrSmaValues, [
    null,
    null,
    null,
    2.4444444444444446,
    2.7962962962962963,
    3.030864197530864
  ]);
});

test('findSwingPoints mirrors the source high/low semantics', () => {
  const swings = findSwingPoints([10, 9, 8, 9, 7, 8, 6, 7, 8, 9], 2);

  expect(swings.swingHighs).toEqual([]);
  expect(swings.swingLows).toEqual([6]);
});

test('detectRsiDivergence finds bullish and bearish setups', () => {
  const bullishRsi = calculateRsi([100, 98, 96, 97, 95, 96, 94, 95, 96, 97, 98, 99, 100], 3);
  const bearishRsi = calculateRsi([100, 102, 104, 103, 105, 104, 106, 105, 104, 103, 102, 101], 3);

  expect(
    detectRsiDivergence(
      [99, 97, 95, 96, 94, 95, 93, 94, 95, 96, 97, 98, 99],
      [101, 99, 97, 98, 96, 97, 95, 96, 97, 98, 99, 100, 101],
      bullishRsi,
      1,
      1,
      10
    )
  ).toEqual({ 6: 'bullish' });

  expect(
    detectRsiDivergence(
      [99, 101, 103, 102, 104, 103, 105, 104, 103, 102, 101, 100],
      [101, 103, 105, 104, 106, 105, 107, 106, 105, 104, 103, 102],
      bearishRsi,
      1,
      1,
      10
    )
  ).toEqual({ 6: 'bearish' });
});

test('helper functions expose chart-facing indicator status correctly', () => {
  expect(
    getEmaPosition(
      [
        { open: 1, close: 1 },
        { open: 2, close: 2 },
        { open: 3.5, close: 4 }
      ],
      3
    )
  ).toBe('above');

  expect(
    getEmaPosition(
      [
        { open: 1, close: 1 },
        { open: 2, close: 2 },
        { open: 0.5, close: 1 }
      ],
      3
    )
  ).toBe('below');

  expect(
    getEmaPosition(
      [
        { open: 1, close: 1 },
        { open: 2, close: 2 },
        { open: 1.5, close: 3 }
      ],
      3
    )
  ).toBe('touch');

  expect(getBandPosition(10, 9, 4)).toBe('above');
  expect(getBandPosition(3, 9, 4)).toBe('below');
  expect(getBandPosition(6, 9, 4)).toBeNull();

  expect(
    getPriceBandPosition([1, 2, 10], {
      upper: [null, null, 5],
      lower: [null, null, 1],
      middle: [null, null, 3]
    })
  ).toBe('above');

  expect(getRecentDivergence({ 4: 'bullish', 7: 'bearish' }, 8, 3)).toBe('bearish');

  const atrCandles = [
    { high: 10, low: 8, close: 9 },
    { high: 11, low: 9, close: 10 },
    { high: 13, low: 10, close: 12 },
    { high: 12, low: 9, close: 10 },
    { high: 14, low: 11, close: 13 },
    { high: 15, low: 12, close: 14 }
  ];

  expect(getLatestAtr(atrCandles, 3)).toBeCloseTo(3.024691358024691, 10);
  expect(getLatestAtrSma(atrCandles, 3, 2)).toBeCloseTo(3.030864197530864, 10);
});

test('default indicator periods remain aligned to the shared trading config', () => {
  expect(tradingConfig.indicators.emaPeriod).toBe(21);
  expect(tradingConfig.indicators.bollingerPeriod).toBe(20);
  expect(tradingConfig.indicators.rsiPeriod).toBe(14);
  expect(tradingConfig.indicators.atrPeriod).toBe(14);
  expect(tradingConfig.indicators.atrSmaPeriod).toBe(10);
});
