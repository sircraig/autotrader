import { expect, test } from 'bun:test';

import { tradingConfig } from '@autotrader/core/config/trading';

import {
  BinanceIngestService,
  buildCombinedStreamUrl,
  fetchHistoricalCandles,
  normalizeAggTradeEvent,
  normalizeDepthEvent,
  normalizeHistoricalBootstrapEvent,
  normalizeKlineEvent
} from './binance';

import { MarketState } from '../state/market-state';

const nextSequence = (() => {
  let sequence = 0;
  return () => {
    sequence += 1;
    return sequence;
  };
})();

test('buildCombinedStreamUrl matches the required Binance streams', () => {
  expect(buildCombinedStreamUrl()).toBe(
    'wss://stream.binance.com:9443/stream?streams=btcusdt@kline_1m/btcusdt@kline_5m/btcusdt@depth20@100ms/btcusdt@aggTrade'
  );
});

test('normalize Binance stream payloads into shared app events', () => {
  const candleEvent = normalizeKlineEvent({
    symbol: 'BTCUSDT',
    nextSequence,
    payload: {
      e: 'kline',
      E: 1_710_000_000_000,
      s: 'BTCUSDT',
      k: {
        t: 1_710_000_000_000,
        T: 1_710_000_299_999,
        s: 'BTCUSDT',
        i: '5m',
        o: '64000.10',
        c: '64010.25',
        h: '64025.00',
        l: '63990.50',
        v: '12.75',
        x: true
      }
    }
  });

  expect(candleEvent.type).toBe('market.candle');
  expect(candleEvent.payload.timeframe).toBe('5m');
  expect(candleEvent.payload.candle.close).toBe(64010.25);
  expect(candleEvent.payload.candle.isClosed).toBe(true);

  const orderBookEvent = normalizeDepthEvent({
    symbol: 'BTCUSDT',
    nextSequence,
    payload: {
      lastUpdateId: 12,
      bids: [['64000.10', '1.25']],
      asks: [['64000.20', '0.75']]
    }
  });

  expect(orderBookEvent.type).toBe('market.order_book');
  expect(orderBookEvent.payload.orderBook.lastUpdateId).toBe(12);
  expect(orderBookEvent.payload.orderBook.bids[0]?.quantity).toBe(1.25);

  const tradeEvent = normalizeAggTradeEvent({
    symbol: 'BTCUSDT',
    nextSequence,
    payload: {
      e: 'aggTrade',
      E: 1_710_000_200_000,
      s: 'BTCUSDT',
      a: 44,
      p: '64000.20',
      q: '0.50',
      T: 1_710_000_200_100,
      m: false
    }
  });

  expect(tradeEvent.type).toBe('market.agg_trade');
  expect(tradeEvent.payload.trade.tradeId).toBe(44);
  expect(tradeEvent.payload.trade.isBuyerMaker).toBe(false);
});

test('fetchHistoricalCandles normalizes Binance REST klines', async () => {
  const calls: string[] = [];
  const candles = await fetchHistoricalCandles('1m', {
    symbol: 'BTCUSDT',
    fetchImpl: async (input) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify([
          [
            1_710_000_000_000,
            '64000.10',
            '64020.10',
            '63990.10',
            '64010.10',
            '5.50',
            1_710_000_059_999,
            '0',
            0,
            '0',
            '0',
            '0'
          ]
        ]),
        {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        }
      );
    }
  });

  expect(calls[0]).toContain('interval=1m');
  expect(calls[0]).toContain(
    `limit=${tradingConfig.market.historicalPreload.candles1m}`
  );
  expect(candles).toEqual([
    {
      timestamp: 1_710_000_000_000,
      open: 64000.1,
      high: 64020.1,
      low: 63990.1,
      close: 64010.1,
      volume: 5.5,
      isClosed: true
    }
  ]);
});

test('BinanceIngestService bootstraps history into market state in source order', async () => {
  const state = new MarketState('BTCUSDT');
  const events: string[] = [];

  const service = new BinanceIngestService({
    state,
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      const interval = url.searchParams.get('interval');
      const limit = Number(url.searchParams.get('limit'));
      const candles = Array.from({ length: limit }, (_, index) => [
        1_710_000_000_000 + index * 60_000,
        '64000',
        '64010',
        '63990',
        String(64000 + index),
        '1.0',
        1_710_000_059_999 + index * 60_000,
        '0',
        0,
        '0',
        '0',
        '0'
      ]);

      events.push(interval ?? 'missing');

      return new Response(JSON.stringify(candles), {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      });
    },
    webSocketFactory: () =>
      ({
        addEventListener() {},
        close() {},
        readyState: WebSocket.CLOSED
      }) as unknown as WebSocket
  });

  await service.bootstrapHistory();

  expect(events).toEqual(['5m', '1m']);
  const snapshot = state.getSnapshot();
  expect(snapshot.bootstrap['5m']).toHaveLength(
    tradingConfig.market.historicalPreload.candles5m
  );
  expect(snapshot.bootstrap['1m']).toHaveLength(
    tradingConfig.market.historicalPreload.candles1m
  );
});

test('MarketState accepts live events after bootstrap', () => {
  const state = new MarketState('BTCUSDT');

  state.apply(
    normalizeHistoricalBootstrapEvent({
      symbol: 'BTCUSDT',
      timeframe: '1m',
      nextSequence,
      candles: [
        {
          timestamp: 1,
          open: 1,
          high: 2,
          low: 0.5,
          close: 1.5,
          volume: 10,
          isClosed: true
        }
      ]
    })
  );

  state.apply(
    normalizeKlineEvent({
      symbol: 'BTCUSDT',
      nextSequence,
      payload: {
        e: 'kline',
        E: 2,
        s: 'BTCUSDT',
        k: {
          t: 2,
          T: 3,
          s: 'BTCUSDT',
          i: '1m',
          o: '1.5',
          c: '1.75',
          h: '2.0',
          l: '1.4',
          v: '4.2',
          x: false
        }
      }
    })
  );

  const snapshot = state.getSnapshot();
  expect(snapshot.latestCandles['1m']?.close).toBe(1.75);
  expect(snapshot.bootstrap['1m']).toHaveLength(2);
});
