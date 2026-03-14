import { expect, test } from 'bun:test';

import type { CvdStats, DeltaStats } from '../models';

import { PointSignalsEngine } from './point-signals-engine';

function createClock(startAt: number = 0) {
  let currentTime = startAt;

  return {
    now: () => currentTime,
    set: (value: number) => {
      currentTime = value;
    }
  };
}

function createDeltaStats(overrides: Partial<DeltaStats> = {}): DeltaStats {
  return {
    delta: 150,
    deltaPct: 60,
    durationDelta: 300,
    durationDeltaPct: 55,
    pnlTotal1h: 1_500,
    ...overrides
  };
}

function createCvdStats(overrides: Partial<CvdStats> = {}): CvdStats {
  return {
    cvd1m: 2,
    cvd5m: 8,
    cvd1h: 15,
    buyVolume1m: 2,
    sellVolume1m: 1,
    buyVolume5m: 8,
    sellVolume5m: 2,
    buyPct5m: 80,
    side1m: 'buy',
    side5m: 'buy',
    side1h: 'buy',
    tradeCount1m: 12,
    tradeRate: 1.2,
    ...overrides
  };
}

test('engine starts with no active trade and neutral scores', () => {
  const clock = createClock();
  const engine = new PointSignalsEngine({ now: clock.now });

  expect(engine.getSnapshot()).toEqual({
    activeTrade: null,
    tradeHistory: [],
    sessionStats: {
      totalTrades: 0,
      winningTrades: 0,
      totalPnl: 0,
      winRate: 0
    },
    indicators: {
      emaPosition: null,
      priceDelta: 0,
      timeDelta: 0,
      cvdBuyPct: 50,
      deltaBb: null,
      priceBb: null,
      divergence: null,
      currentPrice: 0,
      pnlTotal1h: 0,
      pnlConditionMet: false,
      atrValue: null,
      atrSmaValue: null,
      atrAboveMin: false,
      atrAboveSma: false,
      atrConditionMet: false,
      atrBelowSma: false
    },
    bullishPoints: 0,
    bearishPoints: 0,
    bullishBreakdown: {
      ema: 0,
      priceDelta: 0,
      timeDelta: 0,
      cvd: 0,
      deltaBb: 0,
      priceBb: 0,
      divergence: 0,
      divergenceCandles: 0
    },
    bearishBreakdown: {
      ema: 0,
      priceDelta: 0,
      timeDelta: 0,
      cvd: 0,
      deltaBb: 0,
      priceBb: 0,
      divergence: 0,
      divergenceCandles: 0
    },
    bullishDivergenceCandlesRemaining: 0,
    bearishDivergenceCandlesRemaining: 0,
    openThreshold: 4,
    closeThreshold: 2
  });
});

test('engine opens a LONG when bullish score and mandatory gates are met', () => {
  const clock = createClock();
  const engine = new PointSignalsEngine({ now: clock.now });

  const update = engine.updateIndicators(
    {
      currentPrice: 64_000,
      deltaStats: createDeltaStats(),
      cvdStats: createCvdStats(),
      emaPosition: 'above',
      deltaBb: 'above',
      priceBb: 'above',
      divergence: 'bullish',
      atr: 150,
      atrSma: 120
    },
    0
  );

  expect(update.signalEvents).toEqual([
    {
      direction: 'LONG',
      action: 'open',
      points: 8,
      breakdown: {
        ema: 1,
        priceDelta: 1,
        timeDelta: 1,
        cvd: 1,
        deltaBb: 1,
        priceBb: 1,
        divergence: 2,
        divergenceCandles: 4
      },
      indicators: {
        emaPosition: 'above',
        priceDelta: 150,
        timeDelta: 300,
        cvdBuyPct: 80,
        deltaBb: 'above',
        priceBb: 'above',
        divergence: 'bullish',
        currentPrice: 64_000,
        pnlTotal1h: 1_500,
        pnlConditionMet: true,
        atrValue: 150,
        atrSmaValue: 120,
        atrAboveMin: true,
        atrAboveSma: true,
        atrConditionMet: true,
        atrBelowSma: false
      },
      trade: {
        direction: 'LONG',
        entryPrice: 64_000,
        entryTime: '1970-01-01T00:00:00.000Z',
        entryPoints: 8
      }
    }
  ]);
  expect(update.snapshot.activeTrade).toEqual({
    direction: 'LONG',
    entryPrice: 64_000,
    entryTime: '1970-01-01T00:00:00.000Z',
    entryPoints: 8
  });
  expect(update.snapshot.bullishPoints).toBe(8);
  expect(update.snapshot.sessionStats.totalTrades).toBe(0);
});

test('engine closes a LONG when bullish points fall to the configured close threshold', () => {
  const clock = createClock();
  const engine = new PointSignalsEngine({ now: clock.now });

  engine.updateIndicators(
    {
      currentPrice: 64_000,
      deltaStats: createDeltaStats(),
      cvdStats: createCvdStats(),
      emaPosition: 'above',
      deltaBb: 'above',
      priceBb: 'above',
      divergence: 'bullish',
      atr: 150,
      atrSma: 120
    },
    0
  );

  const update = engine.updateIndicators(
    {
      currentPrice: 64_090,
      deltaStats: createDeltaStats({
        delta: -10,
        durationDelta: -5,
        pnlTotal1h: 1_500
      }),
      cvdStats: createCvdStats({
        buyPct5m: 50,
        side1m: 'neutral',
        side5m: 'neutral',
        side1h: 'neutral'
      }),
      emaPosition: 'touch',
      deltaBb: null,
      priceBb: null,
      divergence: null,
      atr: 150,
      atrSma: 120
    },
    300_000
  );

  expect(update.signalEvents).toEqual([
    {
      direction: 'LONG',
      action: 'close',
      points: 2,
      breakdown: {
        ema: 0,
        priceDelta: 0,
        timeDelta: 0,
        cvd: 0,
        deltaBb: 0,
        priceBb: 0,
        divergence: 2,
        divergenceCandles: 3
      },
      indicators: {
        emaPosition: 'touch',
        priceDelta: -10,
        timeDelta: -5,
        cvdBuyPct: 50,
        deltaBb: null,
        priceBb: null,
        divergence: null,
        currentPrice: 64_090,
        pnlTotal1h: 1_500,
        pnlConditionMet: true,
        atrValue: 150,
        atrSmaValue: 120,
        atrAboveMin: true,
        atrAboveSma: true,
        atrConditionMet: true,
        atrBelowSma: false
      },
      trade: {
        direction: 'LONG',
        entryPrice: 64_000,
        entryTime: '1970-01-01T00:00:00.000Z',
        entryPoints: 8,
        exitPrice: 64_090,
        exitTime: '1970-01-01T00:05:00.000Z',
        exitPoints: 2,
        pnl: 90
      }
    }
  ]);
  expect(update.snapshot.activeTrade).toBeNull();
  expect(update.snapshot.tradeHistory).toEqual([
    {
      direction: 'LONG',
      entryPrice: 64_000,
      entryTime: '1970-01-01T00:00:00.000Z',
      entryPoints: 8,
      exitPrice: 64_090,
      exitTime: '1970-01-01T00:05:00.000Z',
      exitPoints: 2,
      pnl: 90
    }
  ]);
  expect(update.snapshot.sessionStats).toEqual({
    totalTrades: 1,
    winningTrades: 1,
    totalPnl: 90,
    winRate: 100
  });
});

test('engine opens a SHORT and prioritizes ATR below SMA for immediate close', () => {
  const clock = createClock();
  const engine = new PointSignalsEngine({ now: clock.now });

  const opened = engine.updateIndicators(
    {
      currentPrice: 63_900,
      deltaStats: createDeltaStats({
        delta: -180,
        durationDelta: -240,
        pnlTotal1h: 2_000
      }),
      cvdStats: createCvdStats({
        cvd1m: -3,
        cvd5m: -10,
        cvd1h: -25,
        buyVolume1m: 1,
        sellVolume1m: 4,
        buyVolume5m: 2,
        sellVolume5m: 8,
        buyPct5m: 20,
        side1m: 'sell',
        side5m: 'sell',
        side1h: 'sell'
      }),
      emaPosition: 'below',
      deltaBb: 'below',
      priceBb: 'below',
      divergence: 'bearish',
      atr: 160,
      atrSma: 120
    },
    0
  );

  expect(opened.signalEvents[0]?.direction).toBe('SHORT');
  expect(opened.snapshot.activeTrade?.entryPoints).toBe(8);

  const closed = engine.updateIndicators(
    {
      currentPrice: 63_850,
      deltaStats: createDeltaStats({
        delta: -120,
        durationDelta: -120,
        pnlTotal1h: 2_000
      }),
      cvdStats: createCvdStats({
        buyPct5m: 20,
        side1m: 'sell',
        side5m: 'sell',
        side1h: 'sell'
      }),
      emaPosition: 'below',
      deltaBb: 'below',
      priceBb: 'below',
      divergence: null,
      atr: 100,
      atrSma: 120
    },
    300_000
  );

  expect(closed.signalEvents).toEqual([
    {
      direction: 'SHORT',
      action: 'close',
      points: 8,
      breakdown: {
        ema: 1,
        priceDelta: 1,
        timeDelta: 1,
        cvd: 1,
        deltaBb: 1,
        priceBb: 1,
        divergence: 2,
        divergenceCandles: 3
      },
      indicators: {
        emaPosition: 'below',
        priceDelta: -120,
        timeDelta: -120,
        cvdBuyPct: 20,
        deltaBb: 'below',
        priceBb: 'below',
        divergence: null,
        currentPrice: 63_850,
        pnlTotal1h: 2_000,
        pnlConditionMet: true,
        atrValue: 100,
        atrSmaValue: 120,
        atrAboveMin: true,
        atrAboveSma: false,
        atrConditionMet: false,
        atrBelowSma: true,
        closeReason: 'ATR < SMA'
      },
      trade: {
        direction: 'SHORT',
        entryPrice: 63_900,
        entryTime: '1970-01-01T00:00:00.000Z',
        entryPoints: 8,
        exitPrice: 63_850,
        exitTime: '1970-01-01T00:05:00.000Z',
        exitPoints: 8,
        pnl: 50
      }
    }
  ]);
  expect(closed.snapshot.sessionStats).toEqual({
    totalTrades: 1,
    winningTrades: 1,
    totalPnl: 50,
    winRate: 100
  });
});

test('bullish divergence persists for four closed candles, then expires', () => {
  const clock = createClock();
  const engine = new PointSignalsEngine({
    now: clock.now,
    minPnlTotal1h: 99_999
  });

  const first = engine.updateIndicators(
    {
      currentPrice: 64_000,
      divergence: 'bullish'
    },
    0
  );
  expect(first.snapshot.bullishDivergenceCandlesRemaining).toBe(4);
  expect(first.snapshot.bullishBreakdown.divergence).toBe(2);

  const second = engine.updateIndicators(
    {
      currentPrice: 64_010,
      divergence: null
    },
    300_000
  );
  expect(second.snapshot.bullishDivergenceCandlesRemaining).toBe(3);
  expect(second.snapshot.bullishBreakdown.divergence).toBe(2);

  const third = engine.updateIndicators(
    {
      currentPrice: 64_020,
      divergence: null
    },
    600_000
  );
  expect(third.snapshot.bullishDivergenceCandlesRemaining).toBe(2);

  const fourth = engine.updateIndicators(
    {
      currentPrice: 64_030,
      divergence: null
    },
    900_000
  );
  expect(fourth.snapshot.bullishDivergenceCandlesRemaining).toBe(1);
  expect(fourth.snapshot.bullishBreakdown.divergence).toBe(2);

  const fifth = engine.updateIndicators(
    {
      currentPrice: 64_040,
      divergence: null
    },
    1_200_000
  );
  expect(fifth.snapshot.bullishDivergenceCandlesRemaining).toBe(0);
  expect(fifth.snapshot.bullishBreakdown.divergence).toBe(0);
});
