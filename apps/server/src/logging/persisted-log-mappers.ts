import type {
  Candle,
  CvdStats,
  DeltaStats,
  IndicatorSnapshot,
  OrderBookDeltaSignalEvent,
  OrderBookConditions,
  PointBreakdown,
  PointSignalEvent,
  PointSignalIndicatorSnapshot,
  RunningTotals,
  Timeframe
} from '@autotrader/core';
import type {
  CandleCloseLogEvent,
  PersistedCandleIndicators,
  PersistedCvdStats,
  PersistedDeltaStats,
  PersistedLogEvent,
  PersistedPointBreakdown,
  PersistedPointIndicators,
  PersistedRunningTotals,
  PersistedTradeConditionsClose,
  PersistedTradeConditionsOpen,
  PointTradeCloseLogEvent,
  PointTradeOpenLogEvent,
  TradeCloseLogEvent,
  TradeOpenLogEvent
} from '@autotrader/core/models';

function toIsoTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function toPersistedTradeOpenConditions(
  conditions: OrderBookConditions
): PersistedTradeConditionsOpen {
  return {
    bid_qty_3: conditions.bidQty3,
    ask_qty_3: conditions.askQty3,
    bid_ask_ratio: conditions.bidAskRatio,
    ask_bid_ratio: conditions.askBidRatio,
    first_bid_qty: conditions.firstBidQty,
    first_ask_qty: conditions.firstAskQty,
    first_bid_price: conditions.firstBidPrice,
    first_ask_price: conditions.firstAskPrice,
    spread: conditions.spread
  };
}

function toPersistedTradeCloseConditions(
  conditions: OrderBookConditions
): PersistedTradeConditionsClose {
  return {
    bid_qty_3: conditions.bidQty3,
    ask_qty_3: conditions.askQty3,
    first_bid_qty: conditions.firstBidQty,
    first_ask_qty: conditions.firstAskQty,
    buy_close_ratio: conditions.buyCloseRatio,
    sell_close_ratio: conditions.sellCloseRatio
  };
}

function toPersistedRunningTotals(runningTotals: RunningTotals): PersistedRunningTotals {
  return {
    buy_total: runningTotals.buyTotal,
    buy_count: runningTotals.buyCount,
    buy_duration: runningTotals.buyDuration,
    sell_total: runningTotals.sellTotal,
    sell_count: runningTotals.sellCount,
    sell_duration: runningTotals.sellDuration,
    combined_total: runningTotals.combinedTotal,
    delta: runningTotals.delta,
    delta_pct: runningTotals.deltaPct,
    total_duration: runningTotals.totalDuration,
    duration_delta: runningTotals.durationDelta,
    duration_delta_pct: runningTotals.durationDeltaPct
  };
}

function toPersistedDeltaStats(deltaStats: DeltaStats): PersistedDeltaStats {
  return {
    delta: deltaStats.delta,
    delta_pct: deltaStats.deltaPct,
    duration_delta: deltaStats.durationDelta,
    duration_delta_pct: deltaStats.durationDeltaPct,
    pnl_total_1h: deltaStats.pnlTotal1h,
    ...(deltaStats.outsideBb === undefined ? {} : { outside_bb: deltaStats.outsideBb })
  };
}

function toPersistedCvdStats(cvdStats: CvdStats): PersistedCvdStats {
  return {
    cvd_1m: cvdStats.cvd1m,
    cvd_5m: cvdStats.cvd5m,
    cvd_1h: cvdStats.cvd1h,
    buy_volume_1m: cvdStats.buyVolume1m,
    sell_volume_1m: cvdStats.sellVolume1m,
    buy_volume_5m: cvdStats.buyVolume5m,
    sell_volume_5m: cvdStats.sellVolume5m,
    buy_pct_5m: cvdStats.buyPct5m,
    side_1m: cvdStats.side1m,
    side_5m: cvdStats.side5m,
    side_1h: cvdStats.side1h,
    trade_count_1m: cvdStats.tradeCount1m,
    trade_rate: cvdStats.tradeRate
  };
}

function toPersistedCandleIndicators(
  indicators: IndicatorSnapshot
): PersistedCandleIndicators {
  return {
    price_bb: indicators.priceBb,
    delta_bb: indicators.deltaBb,
    ema_position: indicators.emaPosition,
    bullish_divergence: indicators.divergence === 'bullish',
    bearish_divergence: indicators.divergence === 'bearish',
    atr: indicators.atr,
    atr_sma: indicators.atrSma,
    atr_below_sma: indicators.atrBelowSma
  };
}

function toPersistedPointBreakdown(breakdown: PointBreakdown): PersistedPointBreakdown {
  return {
    ema: breakdown.ema,
    price_delta: breakdown.priceDelta,
    time_delta: breakdown.timeDelta,
    cvd: breakdown.cvd,
    delta_bb: breakdown.deltaBb,
    price_bb: breakdown.priceBb,
    divergence: breakdown.divergence,
    divergence_candles: breakdown.divergenceCandles
  };
}

function toPersistedPointIndicators(
  indicators: PointSignalIndicatorSnapshot
): PersistedPointIndicators {
  return {
    ema_position: indicators.emaPosition,
    price_delta: indicators.priceDelta,
    time_delta: indicators.timeDelta,
    cvd_buy_pct: indicators.cvdBuyPct,
    delta_bb: indicators.deltaBb,
    price_bb: indicators.priceBb,
    divergence: indicators.divergence,
    current_price: indicators.currentPrice,
    pnl_total_1h: indicators.pnlTotal1h,
    pnl_condition_met: indicators.pnlConditionMet,
    atr_value: indicators.atrValue,
    atr_sma_value: indicators.atrSmaValue,
    atr_above_min: indicators.atrAboveMin,
    atr_above_sma: indicators.atrAboveSma,
    atr_condition_met: indicators.atrConditionMet,
    atr_below_sma: indicators.atrBelowSma,
    ...(indicators.closeReason === undefined ? {} : { close_reason: indicators.closeReason })
  };
}

export function createTradeSignalLogEvent(
  signalEvent: OrderBookDeltaSignalEvent,
  timestamp: string = new Date().toISOString()
): TradeOpenLogEvent | TradeCloseLogEvent {
  if (signalEvent.action === 'open') {
    return {
      event_type: 'TRADE_OPEN',
      timestamp,
      signal_type: signalEvent.signalType,
      entry_price: signalEvent.entryPrice,
      entry_time: toIsoTimestamp(signalEvent.entryTime),
      conditions: toPersistedTradeOpenConditions(signalEvent.conditions)
    };
  }

  return {
    event_type: 'TRADE_CLOSE',
    timestamp,
    signal_type: signalEvent.signalType,
    entry_price: signalEvent.entryPrice,
    entry_time: toIsoTimestamp(signalEvent.entryTime),
    exit_price: signalEvent.exitPrice,
    exit_time: toIsoTimestamp(signalEvent.exitTime),
    duration_seconds: signalEvent.durationSeconds,
    price_diff: signalEvent.priceDiff,
    conditions: toPersistedTradeCloseConditions(signalEvent.conditions),
    running_totals: toPersistedRunningTotals(signalEvent.runningTotals)
  };
}

export function createCandleCloseLogEvent(args: {
  timeframe: Timeframe;
  candle: Candle;
  deltaStats: DeltaStats;
  runningTotals: RunningTotals;
  indicators?: IndicatorSnapshot | null;
  cvdStats?: CvdStats | null;
  timestamp?: string;
}): CandleCloseLogEvent {
  const { timeframe, candle, deltaStats, runningTotals, indicators, cvdStats } = args;

  return {
    event_type: timeframe === '1m' ? 'CANDLE_CLOSE_1M' : 'CANDLE_CLOSE_5M',
    timestamp: args.timestamp ?? new Date().toISOString(),
    timeframe,
    candle: {
      timestamp: candle.timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume
    },
    delta_stats: toPersistedDeltaStats(deltaStats),
    running_totals: toPersistedRunningTotals(runningTotals),
    ...(indicators ? { indicators: toPersistedCandleIndicators(indicators) } : {}),
    ...(cvdStats ? { cvd_stats: toPersistedCvdStats(cvdStats) } : {})
  };
}

export function createPointSignalLogEvent(
  signalEvent: PointSignalEvent,
  timestamp: string = new Date().toISOString()
): PointTradeOpenLogEvent | PointTradeCloseLogEvent {
  if (signalEvent.action === 'open') {
    return {
      event_type: 'POINT_TRADE_OPEN',
      timestamp,
      direction: signalEvent.direction,
      entry_price: signalEvent.trade.entryPrice,
      entry_time: signalEvent.trade.entryTime,
      points: signalEvent.points,
      breakdown: toPersistedPointBreakdown(signalEvent.breakdown),
      indicators: toPersistedPointIndicators(signalEvent.indicators)
    };
  }

  return {
    event_type: 'POINT_TRADE_CLOSE',
    timestamp,
    direction: signalEvent.direction,
    entry_price: signalEvent.trade.entryPrice,
    entry_time: signalEvent.trade.entryTime,
    entry_points: signalEvent.trade.entryPoints,
    exit_price: signalEvent.trade.exitPrice ?? signalEvent.trade.entryPrice,
    exit_time: signalEvent.trade.exitTime ?? signalEvent.trade.entryTime,
    exit_points: signalEvent.trade.exitPoints ?? signalEvent.points,
    duration_seconds:
      (new Date(signalEvent.trade.exitTime ?? signalEvent.trade.entryTime).getTime() -
        new Date(signalEvent.trade.entryTime).getTime()) /
      1000,
    pnl: signalEvent.trade.pnl ?? 0,
    breakdown: toPersistedPointBreakdown(signalEvent.breakdown),
    indicators: toPersistedPointIndicators(signalEvent.indicators)
  };
}

export function createPersistedLogEvents(args: {
  tradeSignalEvent?: OrderBookDeltaSignalEvent | null;
  pointSignalEvent?: PointSignalEvent | null;
  candleClose?: {
    timeframe: Timeframe;
    candle: Candle;
    deltaStats: DeltaStats;
    runningTotals: RunningTotals;
    indicators?: IndicatorSnapshot | null;
    cvdStats?: CvdStats | null;
  } | null;
  timestamp?: string;
}): PersistedLogEvent[] {
  const events: PersistedLogEvent[] = [];

  if (args.tradeSignalEvent) {
    events.push(createTradeSignalLogEvent(args.tradeSignalEvent, args.timestamp));
  }

  if (args.candleClose) {
    events.push(
      createCandleCloseLogEvent({
        ...args.candleClose,
        ...(args.timestamp === undefined ? {} : { timestamp: args.timestamp })
      })
    );
  }

  if (args.pointSignalEvent) {
    events.push(createPointSignalLogEvent(args.pointSignalEvent, args.timestamp));
  }

  return events;
}
