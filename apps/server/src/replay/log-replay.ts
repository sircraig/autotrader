import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import type {
  AppEvent,
  AppEventEnvelope,
  AppEventType,
  CandleCloseLogEvent,
  CandleEventPayload,
  CvdAnalyticsPayload,
  DeltaAnalyticsPayload,
  IndicatorAnalyticsPayload,
  OrderBookSignalPayload,
  PointSignalPayload,
  PersistedLogEvent
} from '@autotrader/core/models';
import { persistedLogEventSchema } from '@autotrader/core/validation/logs';

export interface ReplayLogRecord {
  filePath: string;
  lineNumber: number;
  event: PersistedLogEvent;
}

export interface ReplayEventOptions {
  symbol?: string;
  nextSequence?: () => number;
}

const LOG_FILE_PREFIXES = ['signals_', 'candles_1m_', 'candles_5m_', 'point_signals_'] as const;

function isKnownLogFilename(filename: string): boolean {
  return (
    filename.endsWith('.jsonl') &&
    LOG_FILE_PREFIXES.some((prefix) => filename.startsWith(prefix))
  );
}

function createReplayEvent<TType extends AppEventType, TPayload>(
  type: TType,
  payload: TPayload,
  symbol: string,
  emittedAt: string,
  nextSequence: () => number
): AppEventEnvelope<TType, TPayload> {
  return {
    version: 'v1',
    type,
    sequence: nextSequence(),
    emittedAt,
    source: 'replay',
    symbol,
    payload
  };
}

function createSequenceGenerator(startAt = 0): () => number {
  let sequence = startAt;

  return () => {
    sequence += 1;
    return sequence;
  };
}

function toDeltaPayload(event: Extract<PersistedLogEvent, { event_type: 'CANDLE_CLOSE_1M' | 'CANDLE_CLOSE_5M' }>): DeltaAnalyticsPayload {
  return {
    stats: {
      delta: event.delta_stats.delta,
      deltaPct: event.delta_stats.delta_pct,
      durationDelta: event.delta_stats.duration_delta,
      durationDeltaPct: event.delta_stats.duration_delta_pct,
      pnlTotal1h: event.delta_stats.pnl_total_1h,
      ...(event.delta_stats.outside_bb === undefined || event.delta_stats.outside_bb === null
        ? {}
        : { outsideBb: event.delta_stats.outside_bb })
    },
    runningTotals: {
      buyTotal: event.running_totals.buy_total,
      buyCount: event.running_totals.buy_count,
      buyDuration: event.running_totals.buy_duration,
      sellTotal: event.running_totals.sell_total,
      sellCount: event.running_totals.sell_count,
      sellDuration: event.running_totals.sell_duration,
      combinedTotal: event.running_totals.combined_total,
      delta: event.running_totals.delta,
      deltaPct: event.running_totals.delta_pct,
      totalDuration: event.running_totals.total_duration,
      durationDelta: event.running_totals.duration_delta,
      durationDeltaPct: event.running_totals.duration_delta_pct
    }
  };
}

function toCvdPayload(
  event: Extract<PersistedLogEvent, { event_type: 'CANDLE_CLOSE_1M' | 'CANDLE_CLOSE_5M' }>
): CvdAnalyticsPayload | null {
  if (!event.cvd_stats) {
    return null;
  }

  return {
    stats: {
      cvd1m: event.cvd_stats.cvd_1m,
      cvd5m: event.cvd_stats.cvd_5m,
      cvd1h: event.cvd_stats.cvd_1h,
      buyVolume1m: event.cvd_stats.buy_volume_1m,
      sellVolume1m: event.cvd_stats.sell_volume_1m,
      buyVolume5m: event.cvd_stats.buy_volume_5m,
      sellVolume5m: event.cvd_stats.sell_volume_5m,
      buyPct5m: event.cvd_stats.buy_pct_5m,
      side1m: event.cvd_stats.side_1m,
      side5m: event.cvd_stats.side_5m,
      side1h: event.cvd_stats.side_1h,
      tradeCount1m: event.cvd_stats.trade_count_1m,
      tradeRate: event.cvd_stats.trade_rate
    }
  };
}

function toIndicatorPayload(event: CandleCloseLogEvent): IndicatorAnalyticsPayload | null {
  if (event.event_type !== 'CANDLE_CLOSE_5M') {
    return null;
  }

  if (!event.indicators) {
    return null;
  }

  return {
    timeframe: '5m',
    snapshot: {
      priceBb: event.indicators.price_bb,
      deltaBb: event.indicators.delta_bb,
      emaPosition: event.indicators.ema_position,
      divergence: event.indicators.bullish_divergence
        ? 'bullish'
        : event.indicators.bearish_divergence
          ? 'bearish'
          : null,
      atr: event.indicators.atr,
      atrSma: event.indicators.atr_sma,
      atrBelowSma: event.indicators.atr_below_sma
    }
  };
}

function toOrderBookSignalPayload(
  event: Extract<PersistedLogEvent, { event_type: 'TRADE_OPEN' | 'TRADE_CLOSE' }>
): OrderBookSignalPayload {
  if (event.event_type === 'TRADE_OPEN') {
    return {
      signalType: event.signal_type,
      action: 'open',
      conditions: {
        bidQty3: event.conditions.bid_qty_3,
        askQty3: event.conditions.ask_qty_3,
        firstBidQty: event.conditions.first_bid_qty,
        firstAskQty: event.conditions.first_ask_qty,
        firstBidPrice: event.conditions.first_bid_price,
        firstAskPrice: event.conditions.first_ask_price,
        spread: event.conditions.spread,
        bidAskRatio: event.conditions.bid_ask_ratio,
        askBidRatio: event.conditions.ask_bid_ratio,
        buyRatioMet: false,
        buyQtyMet: false,
        buyOpenMet: false,
        buyCloseRatio: 0,
        buyCloseMet: false,
        sellRatioMet: false,
        sellQtyMet: false,
        sellOpenMet: false,
        sellCloseRatio: 0,
        sellCloseMet: false
      }
    };
  }

  return {
    signalType: event.signal_type,
    action: 'close',
    conditions: {
      bidQty3: event.conditions.bid_qty_3,
      askQty3: event.conditions.ask_qty_3,
      firstBidQty: event.conditions.first_bid_qty,
      firstAskQty: event.conditions.first_ask_qty,
      firstBidPrice: 0,
      firstAskPrice: 0,
      spread: 0,
      bidAskRatio: 0,
      askBidRatio: 0,
      buyRatioMet: false,
      buyQtyMet: false,
      buyOpenMet: false,
      buyCloseRatio: event.conditions.buy_close_ratio,
      buyCloseMet: false,
      sellRatioMet: false,
      sellQtyMet: false,
      sellOpenMet: false,
      sellCloseRatio: event.conditions.sell_close_ratio,
      sellCloseMet: false
    },
    runningTotals: {
      buyTotal: event.running_totals.buy_total,
      buyCount: event.running_totals.buy_count,
      buyDuration: event.running_totals.buy_duration,
      sellTotal: event.running_totals.sell_total,
      sellCount: event.running_totals.sell_count,
      sellDuration: event.running_totals.sell_duration,
      combinedTotal: event.running_totals.combined_total,
      delta: event.running_totals.delta,
      deltaPct: event.running_totals.delta_pct,
      totalDuration: event.running_totals.total_duration,
      durationDelta: event.running_totals.duration_delta,
      durationDeltaPct: event.running_totals.duration_delta_pct
    }
  };
}

function toPointSignalPayload(
  event: Extract<PersistedLogEvent, { event_type: 'POINT_TRADE_OPEN' | 'POINT_TRADE_CLOSE' }>
): PointSignalPayload {
  return {
    direction: event.direction,
    action: event.event_type === 'POINT_TRADE_OPEN' ? 'open' : 'close',
    points: event.event_type === 'POINT_TRADE_OPEN' ? event.points : event.exit_points,
    breakdown: {
      ema: event.breakdown.ema,
      priceDelta: event.breakdown.price_delta,
      timeDelta: event.breakdown.time_delta,
      cvd: event.breakdown.cvd,
      deltaBb: event.breakdown.delta_bb,
      priceBb: event.breakdown.price_bb,
      divergence: event.breakdown.divergence,
      divergenceCandles: event.breakdown.divergence_candles
    },
    indicators: {
      emaPosition: event.indicators.ema_position,
      priceDelta: event.indicators.price_delta,
      timeDelta: event.indicators.time_delta,
      cvdBuyPct: event.indicators.cvd_buy_pct,
      deltaBb: event.indicators.delta_bb,
      priceBb: event.indicators.price_bb,
      divergence: event.indicators.divergence,
      currentPrice: event.indicators.current_price,
      pnlTotal1h: event.indicators.pnl_total_1h,
      pnlConditionMet: event.indicators.pnl_condition_met,
      atrValue: event.indicators.atr_value,
      atrSmaValue: event.indicators.atr_sma_value,
      atrAboveMin: event.indicators.atr_above_min,
      atrAboveSma: event.indicators.atr_above_sma,
      atrConditionMet: event.indicators.atr_condition_met,
      atrBelowSma: event.indicators.atr_below_sma,
      ...(event.event_type === 'POINT_TRADE_CLOSE' &&
      event.indicators.close_reason !== undefined
        ? { closeReason: event.indicators.close_reason }
        : {})
    }
  };
}

export async function listReplayLogFiles(logDir: string): Promise<string[]> {
  const entries = await readdir(logDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && isKnownLogFilename(entry.name))
    .map((entry) => path.join(logDir, entry.name))
    .sort();
}

export async function readPersistedLogFile(filePath: string): Promise<ReplayLogRecord[]> {
  const contents = await readFile(filePath, 'utf8');
  const records: ReplayLogRecord[] = [];

  for (const [index, line] of contents.split('\n').entries()) {
    if (line.trim().length === 0) {
      continue;
    }

    records.push({
      filePath,
      lineNumber: index + 1,
      event: persistedLogEventSchema.parse(JSON.parse(line)) as PersistedLogEvent
    });
  }

  return records;
}

export async function readPersistedLogs(logDir: string): Promise<ReplayLogRecord[]> {
  const filePaths = await listReplayLogFiles(logDir);
  const fileRecords = await Promise.all(filePaths.map((filePath) => readPersistedLogFile(filePath)));

  return fileRecords
    .flat()
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      const timeDiff =
        new Date(left.record.event.timestamp).getTime() -
        new Date(right.record.event.timestamp).getTime();

      if (timeDiff !== 0) {
        return timeDiff;
      }

      return left.index - right.index;
    })
    .map(({ record }) => record);
}

export function persistedLogEventToReplayEvents(
  event: PersistedLogEvent,
  options: ReplayEventOptions = {}
): AppEvent[] {
  const symbol = options.symbol ?? 'BTCUSDT';
  const nextSequence = options.nextSequence ?? createSequenceGenerator();

  switch (event.event_type) {
    case 'TRADE_OPEN':
    case 'TRADE_CLOSE':
      return [
        createReplayEvent(
          'signal.order_book_delta',
          toOrderBookSignalPayload(event),
          symbol,
          event.timestamp,
          nextSequence
        )
      ];
    case 'POINT_TRADE_OPEN':
    case 'POINT_TRADE_CLOSE':
      return [
        createReplayEvent(
          'signal.point',
          toPointSignalPayload(event),
          symbol,
          event.timestamp,
          nextSequence
        )
      ];
    case 'CANDLE_CLOSE_1M':
    case 'CANDLE_CLOSE_5M': {
      const replayEvents: AppEvent[] = [];
      const candlePayload: CandleEventPayload = {
        timeframe: event.timeframe,
        candle: {
          ...event.candle,
          isClosed: true
        }
      };

      replayEvents.push(
        createReplayEvent('market.candle', candlePayload, symbol, event.timestamp, nextSequence)
      );
      replayEvents.push(
        createReplayEvent(
          'analytics.delta',
          toDeltaPayload(event),
          symbol,
          event.timestamp,
          nextSequence
        )
      );

      const cvdPayload = toCvdPayload(event);
      if (cvdPayload) {
        replayEvents.push(
          createReplayEvent(
            'analytics.cvd',
            cvdPayload,
            symbol,
            event.timestamp,
            nextSequence
          )
        );
      }

      if (event.event_type === 'CANDLE_CLOSE_5M') {
        const indicatorPayload = toIndicatorPayload(event);
        if (indicatorPayload) {
          replayEvents.push(
            createReplayEvent(
              'analytics.indicator',
              indicatorPayload,
              symbol,
              event.timestamp,
              nextSequence
            )
          );
        }
      }

      return replayEvents;
    }
  }
}

export function persistedLogRecordsToReplayEvents(
  records: ReplayLogRecord[],
  options: ReplayEventOptions = {}
): AppEvent[] {
  const nextSequence = options.nextSequence ?? createSequenceGenerator();

  return records.flatMap((record) =>
    persistedLogEventToReplayEvents(record.event, {
      ...options,
      nextSequence
    })
  );
}
