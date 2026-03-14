import { expect, test } from 'bun:test';

import type { AppEvent } from '@autotrader/core/models';

import { MarketState } from '../state/market-state';
import { AppWsBroker, type AppWebSocketData } from './ws-broker';

function createEvent(event: Omit<AppEvent, 'version' | 'sequence' | 'emittedAt' | 'source' | 'symbol'> & { sequence?: number; emittedAt?: string; source?: AppEvent['source']; symbol?: string }): AppEvent {
  return {
    version: 'v1',
    sequence: event.sequence ?? 1,
    emittedAt: event.emittedAt ?? '2026-03-14T10:00:00.000Z',
    source: event.source ?? 'server',
    symbol: event.symbol ?? 'BTCUSDT',
    ...event
  } as AppEvent;
}

interface MockSocket {
  readonly data: AppWebSocketData;
  bufferedAmount: number;
  sendStatus: number;
  sent: string[];
  closed: { code: number | undefined; reason: string | undefined } | null;
  sendText(data: string): number;
  getBufferedAmount(): number;
  close(code?: number, reason?: string): void;
}

function createMockSocket(overrides: Partial<Pick<MockSocket, 'bufferedAmount' | 'sendStatus'>> = {}): MockSocket {
  return {
    data: {
      clientId: 'client-1',
      connectedAt: '2026-03-14T10:00:00.000Z'
    },
    bufferedAmount: overrides.bufferedAmount ?? 0,
    sendStatus: overrides.sendStatus ?? 1,
    sent: [],
    closed: null,
    sendText(data: string) {
      this.sent.push(data);
      return this.sendStatus;
    },
    getBufferedAmount() {
      return this.bufferedAmount;
    },
    close(code?: number, reason?: string) {
      this.closed = { code, reason };
    }
  };
}

test('broker sends bootstrap state immediately on open', () => {
  const state = new MarketState('BTCUSDT');
  state.apply(
    createEvent({
      type: 'bootstrap.history',
      payload: {
        timeframe: '5m',
        candles: [
          {
            timestamp: 1_710_000_000_000,
            open: 64_000,
            high: 64_100,
            low: 63_950,
            close: 64_050,
            volume: 10,
            isClosed: true
          }
        ]
      }
    })
  );

  const broker = new AppWsBroker(state);
  const socket = createMockSocket();

  broker.openConnection(socket);

  expect(broker.getClientCount()).toBe(1);
  expect(socket.sent).toHaveLength(1);
  expect(JSON.parse(socket.sent[0]!)).toMatchObject({
    type: 'app.bootstrap',
    payload: {
      symbol: 'BTCUSDT',
      bootstrap: {
        '5m': [
          {
            close: 64_050
          }
        ]
      }
    }
  });
});

test('broker broadcasts normalized app events to connected clients', () => {
  const state = new MarketState('BTCUSDT');
  const broker = new AppWsBroker(state);
  const fastSocket = createMockSocket();

  broker.openConnection(fastSocket);
  fastSocket.sent.length = 0;

  broker.broadcastEvent(
    createEvent({
      sequence: 9,
      type: 'market.agg_trade',
      payload: {
        trade: {
          tradeId: 42,
          price: 64_123,
          quantity: 0.5,
          timestamp: 1_710_000_060_000,
          isBuyerMaker: false
        }
      }
    })
  );

  expect(fastSocket.sent).toHaveLength(1);
  expect(JSON.parse(fastSocket.sent[0]!)).toEqual({
    type: 'app.event',
    payload: {
      event: createEvent({
        sequence: 9,
        type: 'market.agg_trade',
        payload: {
          trade: {
            tradeId: 42,
            price: 64_123,
            quantity: 0.5,
            timestamp: 1_710_000_060_000,
            isBuyerMaker: false
          }
        }
      })
    }
  });
});

test('broker answers ping messages and disconnects slow clients under backpressure', () => {
  const state = new MarketState('BTCUSDT');
  const broker = new AppWsBroker(state, {
    maxBufferedAmountBytes: 16
  });
  const pingSocket = createMockSocket();
  const slowSocket = createMockSocket({
    bufferedAmount: 32
  });

  broker.openConnection(pingSocket);
  broker.openConnection(slowSocket);

  expect(slowSocket.closed).toEqual({
    code: 1013,
    reason: 'client backpressure'
  });
  expect(broker.getClientCount()).toBe(1);

  pingSocket.sent.length = 0;
  broker.handleMessage(pingSocket, JSON.stringify({ type: 'app.ping' }));

  expect(pingSocket.sent).toHaveLength(1);
  expect(JSON.parse(pingSocket.sent[0]!)).toMatchObject({
    type: 'app.pong',
    payload: {
      emittedAt: expect.any(String)
    }
  });
});
