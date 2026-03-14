import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Candle, DeltaStats, RunningTotals } from '@btc-tui/core/models';

import { createCandleCloseLogEvent, createTradeSignalLogEvent } from '../logging/persisted-log-mappers';
import { PersistedLogWriter } from '../logging/persisted-log-writer';
import {
  listReplayLogFiles,
  persistedLogEventToReplayEvents,
  persistedLogRecordsToReplayEvents,
  readPersistedLogs
} from './log-replay';

const candle: Candle = {
  timestamp: 1_710_000_000_000,
  open: 64_000,
  high: 64_120,
  low: 63_980,
  close: 64_090,
  volume: 15,
  isClosed: true
};

const deltaStats: DeltaStats = {
  delta: 120,
  deltaPct: 50,
  durationDelta: 180,
  durationDeltaPct: 60,
  pnlTotal1h: 1_600,
  outsideBb: 'above'
};

const runningTotals: RunningTotals = {
  buyTotal: 20,
  buyCount: 2,
  buyDuration: 200,
  sellTotal: 8,
  sellCount: 1,
  sellDuration: 40,
  combinedTotal: 28,
  delta: 12,
  deltaPct: 42,
  totalDuration: 240,
  durationDelta: 160,
  durationDeltaPct: 66
};

test('replay reads known log files, sorts by timestamp, and expands candle logs into replay app events', async () => {
  const logDir = await mkdtemp(path.join(tmpdir(), 'btc-tui2-replay-'));

  try {
    const writer = new PersistedLogWriter({ logDir });

    await writer.writeMany([
      createTradeSignalLogEvent(
        {
          signalType: 'BUY',
          action: 'close',
          conditions: {
            bidQty3: 8,
            askQty3: 2,
            firstBidQty: 3,
            firstAskQty: 4,
            firstBidPrice: 64_080,
            firstAskPrice: 64_081,
            spread: 1,
            bidAskRatio: 4,
            askBidRatio: 0.25,
            buyRatioMet: false,
            buyQtyMet: true,
            buyOpenMet: false,
            buyCloseRatio: 0.5,
            buyCloseMet: true,
            sellRatioMet: false,
            sellQtyMet: true,
            sellOpenMet: false,
            sellCloseRatio: 1.5,
            sellCloseMet: false
          },
          entryPrice: 64_000,
          entryTime: 1_710_000_000_000,
          exitPrice: 64_080,
          exitTime: 1_710_000_060_000,
          durationSeconds: 60,
          priceDiff: 80,
          runningTotals
        },
        '2026-03-14T10:00:02.000Z'
      ),
      createCandleCloseLogEvent({
        timeframe: '5m',
        candle,
        deltaStats,
        runningTotals,
        indicators: {
          priceBb: 'above',
          deltaBb: 'above',
          emaPosition: 'above',
          divergence: 'bullish',
          atr: 150,
          atrSma: 120,
          atrBelowSma: false
        },
        cvdStats: {
          cvd1m: 2,
          cvd5m: 7,
          cvd1h: 15,
          buyVolume1m: 2,
          sellVolume1m: 1,
          buyVolume5m: 7,
          sellVolume5m: 3,
          buyPct5m: 70,
          side1m: 'buy',
          side5m: 'buy',
          side1h: 'buy',
          tradeCount1m: 10,
          tradeRate: 1
        },
        timestamp: '2026-03-14T10:00:01.000Z'
      })
    ]);

    expect((await listReplayLogFiles(logDir)).map((filePath) => path.basename(filePath))).toEqual([
      'candles_5m_2026-03-14.jsonl',
      'signals_2026-03-14.jsonl'
    ]);

    const records = await readPersistedLogs(logDir);
    expect(records).toHaveLength(2);
    expect(records[0]?.event.event_type).toBe('CANDLE_CLOSE_5M');
    expect(records[1]?.event.event_type).toBe('TRADE_CLOSE');

    const candleReplayEvents = persistedLogEventToReplayEvents(records[0]!.event, {
      symbol: 'BTCUSDT'
    });
    expect(candleReplayEvents.map((event) => event.type)).toEqual([
      'market.candle',
      'analytics.delta',
      'analytics.cvd',
      'analytics.indicator'
    ]);
    expect(candleReplayEvents[0]).toMatchObject({
      type: 'market.candle',
      source: 'replay',
      symbol: 'BTCUSDT',
      payload: {
        timeframe: '5m',
        candle: {
          ...candle,
          isClosed: true
        }
      }
    });

    const replayEvents = persistedLogRecordsToReplayEvents(records, {
      symbol: 'BTCUSDT'
    });
    expect(replayEvents.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(replayEvents[4]).toMatchObject({
      type: 'signal.order_book_delta',
      payload: {
        signalType: 'BUY',
        action: 'close',
        runningTotals: {
          buyTotal: 20,
          sellTotal: 8,
          delta: 12
        }
      }
    });
  } finally {
    await rm(logDir, { recursive: true, force: true });
  }
});
