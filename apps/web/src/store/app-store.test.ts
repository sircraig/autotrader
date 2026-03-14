import { expect, test } from 'bun:test';

import type { AppEvent, AppServerMessage } from '@autotrader/core/models';

import {
  applyAppEvent,
  applyServerMessage,
  createInitialDashboardState
} from './app-store';

function createEvent(
  event: Omit<AppEvent, 'version' | 'sequence' | 'emittedAt' | 'source' | 'symbol'> & {
    sequence?: number;
    emittedAt?: string;
    source?: AppEvent['source'];
    symbol?: string;
  }
): AppEvent {
  return {
    version: 'v1',
    sequence: event.sequence ?? 1,
    emittedAt: event.emittedAt ?? '2026-03-14T10:00:00.000Z',
    source: event.source ?? 'server',
    symbol: event.symbol ?? 'BTCUSDT',
    ...event
  } as AppEvent;
}

test('applyServerMessage hydrates bootstrap state and preserves transport metadata', () => {
  const nextState = applyServerMessage(createInitialDashboardState('BTCUSDT'), {
    type: 'app.bootstrap',
    payload: {
      symbol: 'BTCUSDT',
      sequence: 12,
      lastEventAt: '2026-03-14T10:00:00.000Z',
      bootstrap: {
        '1m': [
          {
            timestamp: 1,
            open: 10,
            high: 12,
            low: 9,
            close: 11,
            volume: 3,
            isClosed: true
          }
        ],
        '5m': []
      },
      deltaHistory: [
        {
          timestamp: 1_710_000_000_000,
          value: 18
        }
      ],
      latestCandles: {
        '1m': {
          timestamp: 1,
          open: 10,
          high: 12,
          low: 9,
          close: 11,
          volume: 3,
          isClosed: true
        },
        '5m': null
      },
      latestOrderBook: null,
      latestTrade: null,
      systemStatus: {
        status: 'healthy',
        reconnectCount: 1
      }
    }
  } satisfies AppServerMessage);

  expect(nextState.sequence).toBe(12);
  expect(nextState.bootstrap['1m']).toHaveLength(1);
  expect(nextState.deltaHistory).toEqual([
    {
      timestamp: 1_710_000_000_000,
      value: 18
    }
  ]);
  expect(nextState.latestCandles['1m']?.close).toBe(11);
  expect(nextState.systemStatus).toEqual({
    status: 'healthy',
    reconnectCount: 1
  });
  expect(nextState.connection.lastMessageAt).toEqual(expect.any(String));
});

test('applyServerMessage resets derived dashboard slices on bootstrap rehydration', () => {
  let state = createInitialDashboardState('BTCUSDT');

  state = applyAppEvent(
    state,
    createEvent({
      sequence: 2,
      type: 'analytics.delta',
      payload: {
        timeframe: '1m',
        candleTimestamp: Date.parse('2026-03-14T10:00:00.000Z'),
        stats: {
          delta: 25,
          deltaPct: 70,
          durationDelta: 30,
          durationDeltaPct: 55,
          pnlTotal1h: 1_500
        },
        runningTotals: {
          buyTotal: 10,
          buyCount: 1,
          buyDuration: 10,
          sellTotal: 2,
          sellCount: 1,
          sellDuration: 5,
          combinedTotal: 12,
          delta: 8,
          deltaPct: 66,
          totalDuration: 15,
          durationDelta: 5,
          durationDeltaPct: 33
        }
      }
    })
  );

  state = applyAppEvent(
    state,
    createEvent({
      sequence: 3,
      type: 'signal.point',
      payload: {
        direction: 'LONG',
        action: 'open',
        points: 5,
        breakdown: {
          ema: 1,
          priceDelta: 1,
          timeDelta: 1,
          cvd: 1,
          deltaBb: 1,
          priceBb: 0,
          divergence: 0,
          divergenceCandles: 0
        },
        indicators: {
          emaPosition: 'above',
          priceDelta: 25,
          timeDelta: 30,
          cvdBuyPct: 55,
          deltaBb: 'above',
          priceBb: null,
          divergence: null,
          currentPrice: 109,
          pnlTotal1h: 1_500,
          pnlConditionMet: true,
          atrValue: 150,
          atrSmaValue: 120,
          atrAboveMin: true,
          atrAboveSma: true,
          atrConditionMet: true,
          atrBelowSma: false
        }
      }
    })
  );

  state = {
    ...state,
    connection: {
      ...state.connection,
      status: 'reconnecting',
      reconnectAttempt: 2,
      lastConnectedAt: '2026-03-14T10:00:05.000Z',
      error: 'socket dropped'
    }
  };

  const nextState = applyServerMessage(state, {
    type: 'app.bootstrap',
    payload: {
      symbol: 'BTCUSDT',
      sequence: 12,
      lastEventAt: '2026-03-14T10:05:00.000Z',
      bootstrap: {
        '1m': [],
        '5m': []
      },
      deltaHistory: [
        {
          timestamp: 1_710_000_300_000,
          value: 24
        }
      ],
      latestCandles: {
        '1m': null,
        '5m': null
      },
      latestOrderBook: null,
      latestTrade: null,
      systemStatus: {
        status: 'healthy'
      }
    }
  } satisfies AppServerMessage);

  expect(nextState.deltaAnalytics).toBeNull();
  expect(nextState.deltaHistory).toEqual([
    {
      timestamp: 1_710_000_300_000,
      value: 24
    }
  ]);
  expect(nextState.cvdAnalytics).toBeNull();
  expect(nextState.indicatorAnalytics).toBeNull();
  expect(nextState.recentOrderBookSignals).toEqual([]);
  expect(nextState.recentPointSignals).toEqual([]);
  expect(nextState.connection).toMatchObject({
    status: 'reconnecting',
    reconnectAttempt: 2,
    lastConnectedAt: '2026-03-14T10:00:05.000Z',
    error: null
  });
  expect(nextState.connection.lastMessageAt).toEqual(expect.any(String));
});

test('applyAppEvent updates candles, analytics, and signal history slices', () => {
  let state = createInitialDashboardState('BTCUSDT');

  state = applyAppEvent(
    state,
    createEvent({
      sequence: 2,
      type: 'market.candle',
      payload: {
        timeframe: '5m',
        candle: {
          timestamp: 5,
          open: 100,
          high: 110,
          low: 99,
          close: 109,
          volume: 8,
          isClosed: true
        }
      }
    })
  );

  state = applyAppEvent(
    state,
    createEvent({
      sequence: 3,
      type: 'analytics.delta',
      payload: {
        timeframe: '5m',
        candleTimestamp: 5,
        stats: {
          delta: 25,
          deltaPct: 70,
          durationDelta: 30,
          durationDeltaPct: 55,
          pnlTotal1h: 1_500
        },
        runningTotals: {
          buyTotal: 10,
          buyCount: 1,
          buyDuration: 10,
          sellTotal: 2,
          sellCount: 1,
          sellDuration: 5,
          combinedTotal: 12,
          delta: 8,
          deltaPct: 66,
          totalDuration: 15,
          durationDelta: 5,
          durationDeltaPct: 33
        }
      }
    })
  );

  state = applyAppEvent(
    state,
    createEvent({
      sequence: 4,
      type: 'signal.point',
      payload: {
        direction: 'LONG',
        action: 'open',
        points: 5,
        breakdown: {
          ema: 1,
          priceDelta: 1,
          timeDelta: 1,
          cvd: 1,
          deltaBb: 1,
          priceBb: 0,
          divergence: 0,
          divergenceCandles: 0
        },
        indicators: {
          emaPosition: 'above',
          priceDelta: 25,
          timeDelta: 30,
          cvdBuyPct: 55,
          deltaBb: 'above',
          priceBb: null,
          divergence: null,
          currentPrice: 109,
          pnlTotal1h: 1_500,
          pnlConditionMet: true,
          atrValue: 150,
          atrSmaValue: 120,
          atrAboveMin: true,
          atrAboveSma: true,
          atrConditionMet: true,
          atrBelowSma: false
        }
      }
    })
  );

  expect(state.latestCandles['5m']?.close).toBe(109);
  expect(state.deltaAnalytics?.stats.delta).toBe(25);
  expect(state.deltaHistory).toEqual([
    {
      timestamp: 5,
      value: 25
    }
  ]);
  expect(state.recentPointSignals).toHaveLength(1);
  expect(state.recentPointSignals[0]).toMatchObject({
    direction: 'LONG',
    action: 'open',
    points: 5
  });
});

test('applyAppEvent does not append delta chart history for non-5m delta analytics', () => {
  const state = applyAppEvent(
    createInitialDashboardState('BTCUSDT'),
    createEvent({
      sequence: 2,
      type: 'analytics.delta',
      payload: {
        stats: {
          delta: 12,
          deltaPct: 55,
          durationDelta: 8,
          durationDeltaPct: 51,
          pnlTotal1h: 900
        },
        runningTotals: {
          buyTotal: 10,
          buyCount: 1,
          buyDuration: 10,
          sellTotal: 2,
          sellCount: 1,
          sellDuration: 5,
          combinedTotal: 12,
          delta: 8,
          deltaPct: 66,
          totalDuration: 15,
          durationDelta: 5,
          durationDeltaPct: 33
        }
      }
    })
  );

  expect(state.deltaAnalytics?.stats.delta).toBe(12);
  expect(state.deltaHistory).toEqual([]);
});
