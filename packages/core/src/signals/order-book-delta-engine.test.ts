import { expect, test } from 'bun:test';

import type { OrderBook } from '../models';

import {
  calculateOrderBookConditions,
  OrderBookDeltaEngine
} from './order-book-delta-engine';

function createOrderBook(args: {
  bidLevels: Array<[number, number]>;
  askLevels: Array<[number, number]>;
  lastUpdateId?: number;
}): OrderBook {
  return {
    bids: args.bidLevels.map(([price, quantity]) => ({ price, quantity })),
    asks: args.askLevels.map(([price, quantity]) => ({ price, quantity })),
    lastUpdateId: args.lastUpdateId ?? 1
  };
}

const buyOpenBook = createOrderBook({
  bidLevels: [
    [100, 4],
    [99.5, 1.5],
    [99, 1]
  ],
  askLevels: [
    [101, 0.6],
    [101.5, 0.2],
    [102, 0.2]
  ]
});

const buyCloseAndSellOpenBook = createOrderBook({
  bidLevels: [
    [103, 1],
    [102.5, 0.5],
    [102, 0.5]
  ],
  askLevels: [
    [104, 5],
    [104.5, 3],
    [105, 2]
  ]
});

const buyCloseBook = createOrderBook({
  bidLevels: [
    [103, 3],
    [102.5, 2],
    [102, 1]
  ],
  askLevels: [
    [104, 12],
    [104.5, 1],
    [105, 1]
  ]
});

const sellCloseBook = createOrderBook({
  bidLevels: [
    [99, 11],
    [98.5, 0.5],
    [98, 0.5]
  ],
  askLevels: [
    [100, 2],
    [100.5, 0.5],
    [101, 0.5]
  ]
});

test('calculateOrderBookConditions matches the source ratio and close checks', () => {
  const conditions = calculateOrderBookConditions(buyOpenBook);

  expect(conditions.bidQty3).toBe(6.5);
  expect(conditions.askQty3).toBe(1);
  expect(conditions.bidAskRatio).toBe(6.5);
  expect(conditions.buyRatioMet).toBe(true);
  expect(conditions.buyQtyMet).toBe(true);
  expect(conditions.buyOpenMet).toBe(true);
  expect(conditions.sellOpenMet).toBe(false);
  expect(conditions.buyCloseMet).toBe(false);
});

test('engine opens a BUY, holds it without duplicate events, then closes it into rolling totals', () => {
  const engine = new OrderBookDeltaEngine();

  const opened = engine.updateOrderBook(buyOpenBook, 0);
  expect(opened.signalEvents).toEqual([
    {
      signalType: 'BUY',
      action: 'open',
      conditions: opened.snapshot.lastConditions!,
      entryPrice: 101,
      entryTime: 0
    }
  ]);
  expect(opened.snapshot.activeBuy).toEqual({
    signalType: 'BUY',
    entryPrice: 101,
    entryTime: 0
  });
  expect(opened.snapshot.activeSell).toBeNull();

  const held = engine.updateOrderBook(buyOpenBook, 5_000);
  expect(held.signalEvents).toEqual([]);
  expect(held.snapshot.activeBuy).toEqual({
    signalType: 'BUY',
    entryPrice: 101,
    entryTime: 0
  });

  const closed = engine.updateOrderBook(buyCloseBook, 15_000);
  const buyCloseEvent = closed.signalEvents[0];

  expect(closed.signalEvents).toHaveLength(1);
  if (!buyCloseEvent || buyCloseEvent.action !== 'close') {
    throw new Error('Expected a BUY close event');
  }
  expect(buyCloseEvent).toEqual({
    signalType: 'BUY',
    action: 'close',
    conditions: closed.snapshot.lastConditions!,
    entryPrice: 101,
    entryTime: 0,
    exitPrice: 103,
    exitTime: 15_000,
    durationSeconds: 15,
    priceDiff: 2,
    runningTotals: {
      buyTotal: 2,
      buyCount: 1,
      buyDuration: 15,
      sellTotal: 0,
      sellCount: 0,
      sellDuration: 0,
      combinedTotal: 2,
      delta: 2,
      deltaPct: 100,
      totalDuration: 15,
      durationDelta: 15,
      durationDeltaPct: 100
    }
  });
  expect(closed.snapshot.runningTotals).toEqual(buyCloseEvent.runningTotals);
  expect(closed.snapshot.currentDeltaStats).toEqual({
    delta: 2,
    deltaPct: 100,
    durationDelta: 15,
    durationDeltaPct: 100,
    pnlTotal1h: 2
  });
  expect(closed.snapshot.recentEvents).toEqual([
    {
      signalType: 'BUY',
      entryPrice: 101,
      entryTime: 0,
      exitPrice: 103,
      exitTime: 15_000,
      durationSeconds: 15,
      priceDiff: 2
    }
  ]);
});

test('engine closes BUY before opening SELL on the same update', () => {
  const engine = new OrderBookDeltaEngine();

  engine.updateOrderBook(buyOpenBook, 0);
  const update = engine.updateOrderBook(buyCloseAndSellOpenBook, 15_000);

  expect(update.signalEvents).toHaveLength(2);
  expect(update.signalEvents[0]?.signalType).toBe('BUY');
  expect(update.signalEvents[0]?.action).toBe('close');
  expect(update.signalEvents[1]).toEqual({
    signalType: 'SELL',
    action: 'open',
    conditions: update.snapshot.lastConditions!,
    entryPrice: 103,
    entryTime: 15_000
  });
  expect(update.snapshot.activeBuy).toBeNull();
  expect(update.snapshot.activeSell).toEqual({
    signalType: 'SELL',
    entryPrice: 103,
    entryTime: 15_000
  });
});

test('engine closes a SELL with negative delta contribution and positive sell pnl', () => {
  const engine = new OrderBookDeltaEngine();

  engine.updateOrderBook(buyOpenBook, 0);
  engine.updateOrderBook(buyCloseAndSellOpenBook, 15_000);
  const update = engine.updateOrderBook(sellCloseBook, 30_000);
  const sellCloseEvent = update.signalEvents[0];

  if (!sellCloseEvent || sellCloseEvent.action !== 'close') {
    throw new Error('Expected a SELL close event');
  }
  expect(sellCloseEvent).toEqual({
    signalType: 'SELL',
    action: 'close',
    conditions: update.snapshot.lastConditions!,
    entryPrice: 103,
    entryTime: 15_000,
    exitPrice: 100,
    exitTime: 30_000,
    durationSeconds: 15,
    priceDiff: 3,
    runningTotals: {
      buyTotal: 2,
      buyCount: 1,
      buyDuration: 15,
      sellTotal: 3,
      sellCount: 1,
      sellDuration: 15,
      combinedTotal: 5,
      delta: -1,
      deltaPct: 20,
      totalDuration: 30,
      durationDelta: 0,
      durationDeltaPct: 0
    }
  });
  expect(update.snapshot.activeSell).toBeNull();
  expect(update.snapshot.currentDelta).toBe(-1);
  expect(update.snapshot.recentEvents).toHaveLength(2);
});

test('engine prunes rolling windows by close timestamp while keeping longer windows intact', () => {
  const engine = new OrderBookDeltaEngine();

  engine.updateOrderBook(buyOpenBook, 0);
  engine.updateOrderBook(buyCloseAndSellOpenBook, 10_000);
  engine.updateOrderBook(sellCloseBook, 3_600_000);

  const lateBuyOpen = createOrderBook({
    bidLevels: [
      [120, 5],
      [119.5, 1.5],
      [119, 1]
    ],
    askLevels: [
      [121, 0.7],
      [121.5, 0.2],
      [122, 0.2]
    ]
  });
  const lateBuyCloseAndSellOpen = createOrderBook({
    bidLevels: [
      [123, 1],
      [122.5, 0.5],
      [122, 0.5]
    ],
    askLevels: [
      [124, 5],
      [124.5, 3],
      [125, 2]
    ]
  });

  engine.updateOrderBook(lateBuyOpen, 3_690_000);
  const update = engine.updateOrderBook(lateBuyCloseAndSellOpen, 3_700_000);

  expect(update.snapshot.rolling30m).toEqual({
    buyTotal: 2,
    buyCount: 1,
    buyDuration: 10,
    sellTotal: 3,
    sellCount: 1,
    sellDuration: 3590,
    combinedTotal: 5,
    delta: -1,
    deltaPct: 20,
    totalDuration: 3600,
    durationDelta: -3580,
    durationDeltaPct: 99
  });
  expect(update.snapshot.rolling1h).toEqual(update.snapshot.rolling30m);
  expect(update.snapshot.rolling4h).toEqual({
    buyTotal: 4,
    buyCount: 2,
    buyDuration: 20,
    sellTotal: 3,
    sellCount: 1,
    sellDuration: 3590,
    combinedTotal: 7,
    delta: 1,
    deltaPct: 14,
    totalDuration: 3610,
    durationDelta: -3570,
    durationDeltaPct: 98
  });
});

test('engine ignores shallow books for signal evaluation', () => {
  const engine = new OrderBookDeltaEngine();

  const update = engine.updateOrderBook(
    createOrderBook({
      bidLevels: [[100, 1]],
      askLevels: [[101, 1]]
    }),
    0
  );

  expect(update.signalEvents).toEqual([]);
  expect(update.snapshot.lastConditions).toBeNull();
  expect(update.snapshot.activeBuy).toBeNull();
  expect(update.snapshot.activeSell).toBeNull();
});
