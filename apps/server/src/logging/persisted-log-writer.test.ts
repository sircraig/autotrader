import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Candle, CvdStats, DeltaStats, RunningTotals } from '@autotrader/core/models';
import { persistedLogEventSchema } from '@autotrader/core/validation/logs';

import {
  createCandleCloseLogEvent,
  createPointSignalLogEvent,
  createTradeSignalLogEvent
} from './persisted-log-mappers';
import { PersistedLogWriter } from './persisted-log-writer';

function createDeltaStats(): DeltaStats {
  return {
    delta: 100,
    deltaPct: 40,
    durationDelta: 120,
    durationDeltaPct: 60,
    pnlTotal1h: 1_234,
    outsideBb: 'above'
  };
}

function createRunningTotals(): RunningTotals {
  return {
    buyTotal: 10,
    buyCount: 2,
    buyDuration: 100,
    sellTotal: 4,
    sellCount: 1,
    sellDuration: 30,
    combinedTotal: 14,
    delta: 6,
    deltaPct: 42,
    totalDuration: 130,
    durationDelta: 70,
    durationDeltaPct: 53
  };
}

function createCvdStats(): CvdStats {
  return {
    cvd1m: 1,
    cvd5m: 5,
    cvd1h: 10,
    buyVolume1m: 1.5,
    sellVolume1m: 0.5,
    buyVolume5m: 5,
    sellVolume5m: 2,
    buyPct5m: 71,
    side1m: 'buy',
    side5m: 'buy',
    side1h: 'buy',
    tradeCount1m: 8,
    tradeRate: 0.8
  };
}

const candle: Candle = {
  timestamp: 1_710_000_000_000,
  open: 64_000,
  high: 64_100,
  low: 63_950,
  close: 64_050,
  volume: 12.5,
  isClosed: true
};

test('PersistedLogWriter routes validated events into the expected JSONL files', async () => {
  const logDir = await mkdtemp(path.join(tmpdir(), 'autotrader-logs-'));

  try {
    const writer = new PersistedLogWriter({ logDir });
    const timestamp = '2026-03-14T10:00:00.000Z';

    const filePaths = await writer.writeMany([
      createTradeSignalLogEvent(
        {
          signalType: 'BUY',
          action: 'open',
          conditions: {
            bidQty3: 10,
            askQty3: 1,
            firstBidQty: 4,
            firstAskQty: 0.6,
            firstBidPrice: 64_000,
            firstAskPrice: 64_001,
            spread: 1,
            bidAskRatio: 10,
            askBidRatio: 0.1,
            buyRatioMet: true,
            buyQtyMet: true,
            buyOpenMet: true,
            buyCloseRatio: 0.06,
            buyCloseMet: false,
            sellRatioMet: false,
            sellQtyMet: true,
            sellOpenMet: false,
            sellCloseRatio: 4,
            sellCloseMet: false
          },
          entryPrice: 64_001,
          entryTime: 1_710_000_000_000
        },
        timestamp
      ),
      createCandleCloseLogEvent({
        timeframe: '5m',
        candle,
        deltaStats: createDeltaStats(),
        runningTotals: createRunningTotals(),
        indicators: {
          priceBb: 'above',
          deltaBb: 'above',
          emaPosition: 'above',
          divergence: 'bullish',
          atr: 150,
          atrSma: 120,
          atrBelowSma: false
        },
        cvdStats: createCvdStats(),
        timestamp
      }),
      createPointSignalLogEvent(
        {
          direction: 'LONG',
          action: 'open',
          points: 6,
          breakdown: {
            ema: 1,
            priceDelta: 1,
            timeDelta: 1,
            cvd: 1,
            deltaBb: 1,
            priceBb: 1,
            divergence: 0,
            divergenceCandles: 0
          },
          indicators: {
            emaPosition: 'above',
            priceDelta: 100,
            timeDelta: 120,
            cvdBuyPct: 71,
            deltaBb: 'above',
            priceBb: 'above',
            divergence: null,
            currentPrice: 64_050,
            pnlTotal1h: 1_234,
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
            entryPrice: 64_050,
            entryTime: timestamp,
            entryPoints: 6
          }
        },
        timestamp
      )
    ]);

    expect(filePaths.map((filePath) => path.basename(filePath))).toEqual([
      'signals_2026-03-14.jsonl',
      'candles_5m_2026-03-14.jsonl',
      'point_signals_2026-03-14.jsonl'
    ]);

    const signalLines = (await readFile(path.join(logDir, 'signals_2026-03-14.jsonl'), 'utf8'))
      .trim()
      .split('\n');
    const candleLines = (await readFile(path.join(logDir, 'candles_5m_2026-03-14.jsonl'), 'utf8'))
      .trim()
      .split('\n');
    const pointLines = (
      await readFile(path.join(logDir, 'point_signals_2026-03-14.jsonl'), 'utf8')
    )
      .trim()
      .split('\n');

    expect(signalLines).toHaveLength(1);
    expect(candleLines).toHaveLength(1);
    expect(pointLines).toHaveLength(1);

    expect(persistedLogEventSchema.parse(JSON.parse(signalLines[0]!)).event_type).toBe(
      'TRADE_OPEN'
    );
    expect(persistedLogEventSchema.parse(JSON.parse(candleLines[0]!)).event_type).toBe(
      'CANDLE_CLOSE_5M'
    );
    expect(persistedLogEventSchema.parse(JSON.parse(pointLines[0]!)).event_type).toBe(
      'POINT_TRADE_OPEN'
    );
  } finally {
    await rm(logDir, { recursive: true, force: true });
  }
});
