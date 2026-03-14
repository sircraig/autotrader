import { expect, test } from 'bun:test';

import type { AggTrade } from '../models';

import { TradeFlowEngine } from './trade-flow-engine';

function createClock(startAt: number = 0) {
  let currentTime = startAt;

  return {
    now: () => currentTime,
    set: (value: number) => {
      currentTime = value;
    }
  };
}

function createTrade(overrides: Partial<AggTrade> = {}): AggTrade {
  return {
    tradeId: 1,
    price: 64_000,
    quantity: 0.25,
    timestamp: 0,
    isBuyerMaker: false,
    ...overrides
  };
}

test('engine starts with neutral empty stats', () => {
  const clock = createClock();
  const engine = new TradeFlowEngine({ now: clock.now });

  expect(engine.getSnapshot()).toEqual({
    lastTrade: null,
    lastPrice: 0,
    stats: {
      cvd1m: 0,
      cvd5m: 0,
      cvd1h: 0,
      buyVolume1m: 0,
      sellVolume1m: 0,
      buyVolume5m: 0,
      sellVolume5m: 0,
      buyPct5m: 50,
      side1m: 'neutral',
      side5m: 'neutral',
      side1h: 'neutral',
      tradeCount1m: 0,
      tradeRate: 0
    },
    recentLargeTrades: []
  });
});

test('engine classifies buy and sell trades into rolling CVD stats and large-trade history', () => {
  const clock = createClock();
  const engine = new TradeFlowEngine({ now: clock.now });

  const firstUpdate = engine.updateTrade(
    createTrade({
      tradeId: 10,
      price: 64_100,
      quantity: 1.2,
      isBuyerMaker: false
    }),
    0
  );

  expect(firstUpdate.recordedLargeTrade).toEqual({
    observedAt: 0,
    side: 'buy',
    signedQuantity: 1.2,
    trade: {
      tradeId: 10,
      price: 64_100,
      quantity: 1.2,
      timestamp: 0,
      isBuyerMaker: false
    }
  });

  const secondUpdate = engine.updateTrade(
    createTrade({
      tradeId: 11,
      price: 64_050,
      quantity: 0.4,
      isBuyerMaker: true
    }),
    5_000
  );

  expect(secondUpdate.recordedLargeTrade).toBeNull();
  expect(secondUpdate.snapshot.lastTrade).toEqual({
    tradeId: 11,
    price: 64_050,
    quantity: 0.4,
    timestamp: 0,
    isBuyerMaker: true
  });
  expect(secondUpdate.snapshot.lastPrice).toBe(64_050);
  expect(secondUpdate.snapshot.stats.cvd1m).toBeCloseTo(0.8);
  expect(secondUpdate.snapshot.stats.cvd5m).toBeCloseTo(0.8);
  expect(secondUpdate.snapshot.stats.cvd1h).toBeCloseTo(0.8);
  expect(secondUpdate.snapshot.stats).toMatchObject({
    buyVolume1m: 1.2,
    sellVolume1m: 0.4,
    buyVolume5m: 1.2,
    sellVolume5m: 0.4,
    buyPct5m: 74,
    side1m: 'buy',
    side5m: 'buy',
    side1h: 'buy',
    tradeCount1m: 2,
    tradeRate: 0.2
  });
  expect(secondUpdate.snapshot.recentLargeTrades).toEqual([
    {
      observedAt: 0,
      side: 'buy',
      signedQuantity: 1.2,
      trade: {
        tradeId: 10,
        price: 64_100,
        quantity: 1.2,
        timestamp: 0,
        isBuyerMaker: false
      }
    }
  ]);
});

test('engine prunes trade-rate and 1m CVD windows while keeping 5m and 1h totals intact', () => {
  const clock = createClock();
  const engine = new TradeFlowEngine({ now: clock.now });

  engine.updateTrade(
    createTrade({
      tradeId: 20,
      price: 64_000,
      quantity: 1,
      isBuyerMaker: false
    }),
    0
  );

  engine.updateTrade(
    createTrade({
      tradeId: 21,
      price: 63_990,
      quantity: 0.5,
      isBuyerMaker: true
    }),
    61_000
  );

  const snapshot = engine.getSnapshot(61_000);

  expect(snapshot.stats).toEqual({
    cvd1m: -0.5,
    cvd5m: 0.5,
    cvd1h: 0.5,
    buyVolume1m: 0,
    sellVolume1m: 0.5,
    buyVolume5m: 1,
    sellVolume5m: 0.5,
    buyPct5m: 66,
    side1m: 'sell',
    side5m: 'buy',
    side1h: 'buy',
    tradeCount1m: 1,
    tradeRate: 0.1
  });
});

test('engine keeps only the most recent large trades and returns cloned snapshot data', () => {
  const clock = createClock();
  const engine = new TradeFlowEngine({
    now: clock.now,
    recentLargeTradeLimit: 2
  });

  engine.updateTrade(
    createTrade({
      tradeId: 30,
      price: 64_000,
      quantity: 0.5,
      isBuyerMaker: false
    }),
    0
  );

  engine.updateTrade(
    createTrade({
      tradeId: 31,
      price: 63_995,
      quantity: 0.75,
      isBuyerMaker: true
    }),
    1_000
  );

  engine.updateTrade(
    createTrade({
      tradeId: 32,
      price: 64_010,
      quantity: 1,
      isBuyerMaker: false
    }),
    2_000
  );

  const snapshot = engine.getSnapshot(2_000);

  expect(snapshot.recentLargeTrades).toEqual([
    {
      observedAt: 1_000,
      side: 'sell',
      signedQuantity: -0.75,
      trade: {
        tradeId: 31,
        price: 63_995,
        quantity: 0.75,
        timestamp: 0,
        isBuyerMaker: true
      }
    },
    {
      observedAt: 2_000,
      side: 'buy',
      signedQuantity: 1,
      trade: {
        tradeId: 32,
        price: 64_010,
        quantity: 1,
        timestamp: 0,
        isBuyerMaker: false
      }
    }
  ]);

  snapshot.recentLargeTrades[0]!.trade.price = 1;

  expect(engine.getSnapshot(2_000).recentLargeTrades[0]!.trade.price).toBe(63_995);
});
