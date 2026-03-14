import { expect, test } from 'bun:test';

import type { AppEvent, Candle, OrderBook } from '@autotrader/core/models';

import { MarketEventCoordinator } from './market-event-coordinator';

function createSequenceGenerator(): () => number {
  let sequence = 0;

  return () => {
    sequence += 1;
    return sequence;
  };
}

function createCandle(timestamp: number, close: number, spread = 220): Candle {
  return {
    timestamp,
    open: close - 40,
    high: close + spread / 2,
    low: close - spread / 2,
    close,
    volume: 12,
    isClosed: true
  };
}

function createRawEvent<TEvent extends AppEvent>(
  nextSequence: () => number,
  event: Omit<TEvent, 'version' | 'sequence'>
): TEvent {
  return {
    ...event,
    version: 'v1',
    sequence: nextSequence()
  } as TEvent;
}

test('coordinator emits delta analytics and trade signals after order-book updates', () => {
  let now = 1_000;
  const nextSequence = createSequenceGenerator();
  const coordinator = new MarketEventCoordinator({
    nextSequence,
    now: () => now
  });

  const orderBook: OrderBook = {
    bids: [
      { price: 64_000, quantity: 15 },
      { price: 63_999, quantity: 10 },
      { price: 63_998, quantity: 10 }
    ],
    asks: [
      { price: 64_001, quantity: 1 },
      { price: 64_002, quantity: 1 },
      { price: 64_003, quantity: 1 }
    ],
    lastUpdateId: 1
  };

  const batch = coordinator.process(
    createRawEvent(nextSequence, {
      type: 'market.order_book',
      emittedAt: '2026-03-14T10:00:00.000Z',
      source: 'binance',
      symbol: 'BTCUSDT',
      payload: {
        orderBook
      }
    })
  );

  expect(batch.events.map((event) => event.type)).toEqual([
    'market.order_book',
    'analytics.delta',
    'signal.order_book_delta'
  ]);
  expect(batch.events.map((event) => event.sequence)).toEqual([1, 2, 3]);
  expect(batch.events[1]?.payload).toMatchObject({
    stats: {
      delta: expect.any(Number)
    }
  });
  expect((batch.events[1]?.payload as { timeframe?: string }).timeframe).toBeUndefined();
  expect(batch.logEvents.map((event) => event.event_type)).toEqual(['TRADE_OPEN']);
});

test('coordinator emits rolling cvd analytics after aggregate trades', () => {
  let now = 2_000;
  const nextSequence = createSequenceGenerator();
  const coordinator = new MarketEventCoordinator({
    nextSequence,
    now: () => now
  });

  const batch = coordinator.process(
    createRawEvent(nextSequence, {
      type: 'market.agg_trade',
      emittedAt: '2026-03-14T10:00:01.000Z',
      source: 'binance',
      symbol: 'BTCUSDT',
      payload: {
        trade: {
          tradeId: 44,
          price: 64_020,
          quantity: 0.6,
          timestamp: 1_710_000_001_000,
          isBuyerMaker: false
        }
      }
    })
  );

  expect(batch.events.map((event) => event.type)).toEqual([
    'market.agg_trade',
    'analytics.cvd'
  ]);
  expect(batch.events[1]?.payload).toMatchObject({
    stats: {
      cvd1m: 0.6,
      buyPct5m: 100,
      tradeCount1m: 1
    }
  });
  expect(batch.logEvents).toHaveLength(0);
});

test('coordinator emits delta and cvd snapshots for closed 1m candles and writes a candle log', () => {
  let now = 3_000;
  const nextSequence = createSequenceGenerator();
  const coordinator = new MarketEventCoordinator({
    nextSequence,
    now: () => now
  });

  const batch = coordinator.process(
    createRawEvent(nextSequence, {
      type: 'market.candle',
      emittedAt: '2026-03-14T10:01:00.000Z',
      source: 'binance',
      symbol: 'BTCUSDT',
      payload: {
        timeframe: '1m',
        candle: createCandle(1_710_000_060_000, 64_100)
      }
    })
  );

  expect(batch.events.map((event) => event.type)).toEqual([
    'market.candle',
    'analytics.delta',
    'analytics.cvd'
  ]);
  expect(batch.events[1]?.payload).toMatchObject({
    timeframe: '1m',
    candleTimestamp: 1_710_000_060_000
  });
  expect(batch.logEvents.map((event) => event.event_type)).toEqual(['CANDLE_CLOSE_1M']);
});

test('coordinator sequences 5m candle analytics before point-signal events and logs both outputs', () => {
  let now = 1_000;
  const nextSequence = createSequenceGenerator();
  const coordinator = new MarketEventCoordinator({
    nextSequence,
    now: () => now
  });

  const historicalCandles = Array.from({ length: 25 }, (_, index) =>
    createCandle(
      1_710_000_000_000 + index * 300_000,
      62_000 + index * 10,
      20 + Math.max(0, index - 10) * 20
    )
  );

  coordinator.process(
    createRawEvent(nextSequence, {
      type: 'bootstrap.history',
      emittedAt: '2026-03-14T09:55:00.000Z',
      source: 'binance',
      symbol: 'BTCUSDT',
      payload: {
        timeframe: '5m',
        candles: historicalCandles
      }
    })
  );

  coordinator.process(
    createRawEvent(nextSequence, {
      type: 'market.order_book',
      emittedAt: '2026-03-14T10:00:00.000Z',
      source: 'binance',
      symbol: 'BTCUSDT',
      payload: {
        orderBook: {
          bids: [
            { price: 64_000, quantity: 15 },
            { price: 63_999, quantity: 10 },
            { price: 63_998, quantity: 10 }
          ],
          asks: [
            { price: 64_001, quantity: 1 },
            { price: 64_002, quantity: 1 },
            { price: 64_003, quantity: 1 }
          ],
          lastUpdateId: 10
        }
      }
    })
  );

  now = 6_000;
  coordinator.process(
    createRawEvent(nextSequence, {
      type: 'market.order_book',
      emittedAt: '2026-03-14T10:00:05.000Z',
      source: 'binance',
      symbol: 'BTCUSDT',
      payload: {
        orderBook: {
          bids: [
            { price: 65_350, quantity: 20 },
            { price: 65_349, quantity: 1 },
            { price: 65_348, quantity: 1 }
          ],
          asks: [
            { price: 65_351, quantity: 80 },
            { price: 65_352, quantity: 1 },
            { price: 65_353, quantity: 1 }
          ],
          lastUpdateId: 11
        }
      }
    })
  );

  now = 7_000;
  coordinator.process(
    createRawEvent(nextSequence, {
      type: 'market.agg_trade',
      emittedAt: '2026-03-14T10:00:06.000Z',
      source: 'binance',
      symbol: 'BTCUSDT',
      payload: {
        trade: {
          tradeId: 45,
          price: 65_360,
          quantity: 0.6,
          timestamp: 1_710_000_006_000,
          isBuyerMaker: false
        }
      }
    })
  );

  const batch = coordinator.process(
    createRawEvent(nextSequence, {
      type: 'market.candle',
      emittedAt: '2026-03-14T10:05:00.000Z',
      source: 'binance',
      symbol: 'BTCUSDT',
      payload: {
        timeframe: '5m',
        candle: createCandle(1_710_000_300_000, 62_450, 340)
      }
    })
  );

  expect(batch.events.map((event) => event.type)).toEqual([
    'market.candle',
    'analytics.delta',
    'analytics.cvd',
    'analytics.indicator',
    'signal.point'
  ]);
  expect(batch.events[1]?.payload).toMatchObject({
    timeframe: '5m',
    candleTimestamp: 1_710_000_300_000
  });
  expect(batch.logEvents.map((event) => event.event_type)).toEqual([
    'CANDLE_CLOSE_5M',
    'POINT_TRADE_OPEN'
  ]);

  const indicatorEvent = batch.events[3];
  const pointEvent = batch.events[4];

  if (indicatorEvent?.type !== 'analytics.indicator' || pointEvent?.type !== 'signal.point') {
    throw new Error('unexpected 5m sequencing result');
  }

  expect(pointEvent.payload.action).toBe('open');
  expect(pointEvent.payload.direction).toBe('LONG');
  expect(pointEvent.payload.points).toBeGreaterThanOrEqual(4);
  expect(pointEvent.payload.indicators.emaPosition).toBe(indicatorEvent.payload.snapshot.emaPosition);
  expect(pointEvent.payload.indicators.priceBb).toBe(indicatorEvent.payload.snapshot.priceBb);
  expect(pointEvent.payload.indicators.deltaBb).toBe(indicatorEvent.payload.snapshot.deltaBb);
  expect(pointEvent.payload.indicators.pnlTotal1h).toBeGreaterThan(1_200);
});
