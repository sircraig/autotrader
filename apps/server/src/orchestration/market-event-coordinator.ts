import {
  buildChartSurfaceState,
  OrderBookDeltaEngine,
  PointSignalsEngine,
  TradeFlowEngine,
  type DeltaSeriesPoint,
  type OrderBookDeltaSignalEvent,
  type PointSignalEvent
} from '@btc-tui/core';
import { tradingConfig } from '@btc-tui/core/config/trading';
import type {
  AppEvent,
  AppEventEnvelope,
  AppEventType,
  Candle,
  CvdAnalyticsPayload,
  DeltaAnalyticsPayload,
  IndicatorAnalyticsPayload,
  OrderBookSignalPayload,
  PersistedLogEvent,
  PointSignalPayload,
  Timeframe
} from '@btc-tui/core/models';

import {
  createCandleCloseLogEvent,
  createPointSignalLogEvent,
  createTradeSignalLogEvent
} from '../logging/persisted-log-mappers';

type NextSequence = () => number;
type Clock = () => number;

export interface SequencedEventBatch {
  events: AppEvent[];
  logEvents: PersistedLogEvent[];
}

export interface MarketEventCoordinatorOptions {
  nextSequence: NextSequence;
  now?: Clock;
}

const MAX_CANDLES_PER_TIMEFRAME = Math.max(
  tradingConfig.indicators.maxCandles,
  tradingConfig.market.historicalPreload.candles1m,
  tradingConfig.market.historicalPreload.candles5m
);

function cloneCandle(candle: Candle): Candle {
  return { ...candle };
}

function cloneCandles(candles: Candle[]): Candle[] {
  return candles.map(cloneCandle);
}

function upsertCandle(candles: Candle[], nextCandle: Candle): Candle[] {
  const existingIndex = candles.findIndex((candle) => candle.timestamp === nextCandle.timestamp);

  if (existingIndex >= 0) {
    const updated = candles.slice();
    updated[existingIndex] = cloneCandle(nextCandle);
    return updated;
  }

  return [...candles, cloneCandle(nextCandle)].slice(-MAX_CANDLES_PER_TIMEFRAME);
}

function pushDeltaPoint(
  points: DeltaSeriesPoint[],
  nextPoint: DeltaSeriesPoint
): DeltaSeriesPoint[] {
  return [...points, nextPoint]
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-tradingConfig.indicators.maxCandles);
}

function withOutsideBb(
  payload: DeltaAnalyticsPayload,
  outsideBb: IndicatorAnalyticsPayload['snapshot']['deltaBb']
): DeltaAnalyticsPayload {
  return {
    stats: {
      ...payload.stats,
      ...(outsideBb === null ? {} : { outsideBb })
    },
    runningTotals: payload.runningTotals
  };
}

function toDeltaAnalyticsPayload(
  snapshot: ReturnType<OrderBookDeltaEngine['getSnapshot']>
): DeltaAnalyticsPayload {
  return {
    stats: snapshot.currentDeltaStats,
    runningTotals: snapshot.runningTotals
  };
}

function toCvdAnalyticsPayload(
  snapshot: ReturnType<TradeFlowEngine['getSnapshot']>
): CvdAnalyticsPayload {
  return {
    stats: snapshot.stats
  };
}

function toIndicatorAnalyticsPayload(
  snapshot: IndicatorAnalyticsPayload['snapshot']
): IndicatorAnalyticsPayload {
  return {
    timeframe: '5m',
    snapshot
  };
}

function toOrderBookSignalPayload(
  signalEvent: OrderBookDeltaSignalEvent
): OrderBookSignalPayload {
  return {
    signalType: signalEvent.signalType,
    action: signalEvent.action,
    conditions: signalEvent.conditions,
    ...(signalEvent.action === 'close'
      ? { runningTotals: signalEvent.runningTotals }
      : {})
  };
}

function toPointSignalPayload(signalEvent: PointSignalEvent): PointSignalPayload {
  return {
    direction: signalEvent.direction,
    action: signalEvent.action,
    points: signalEvent.points,
    breakdown: signalEvent.breakdown,
    indicators: signalEvent.indicators
  };
}

export class MarketEventCoordinator {
  private readonly nextSequence: NextSequence;
  private readonly now: Clock;
  private readonly orderBookDeltaEngine: OrderBookDeltaEngine;
  private readonly tradeFlowEngine: TradeFlowEngine;
  private readonly pointSignalsEngine: PointSignalsEngine;
  private candleHistory: Record<Timeframe, Candle[]> = {
    '1m': [],
    '5m': []
  };
  private deltaHistory: DeltaSeriesPoint[] = [];

  constructor(options: MarketEventCoordinatorOptions) {
    this.nextSequence = options.nextSequence;
    this.now = options.now ?? Date.now;
    this.orderBookDeltaEngine = new OrderBookDeltaEngine({
      now: this.now
    });
    this.tradeFlowEngine = new TradeFlowEngine({
      now: this.now
    });
    this.pointSignalsEngine = new PointSignalsEngine({
      now: this.now
    });
  }

  process(event: AppEvent): SequencedEventBatch {
    switch (event.type) {
      case 'bootstrap.history':
        return this.processBootstrapHistory(event);
      case 'market.order_book':
        return this.processOrderBook(event);
      case 'market.agg_trade':
        return this.processAggTrade(event);
      case 'market.candle':
        return this.processCandle(event);
      default:
        return {
          events: [event],
          logEvents: []
        };
    }
  }

  private processBootstrapHistory(
    event: Extract<AppEvent, { type: 'bootstrap.history' }>
  ): SequencedEventBatch {
    this.candleHistory[event.payload.timeframe] = cloneCandles(event.payload.candles).slice(
      -MAX_CANDLES_PER_TIMEFRAME
    );

    return {
      events: [event],
      logEvents: []
    };
  }

  private processOrderBook(
    event: Extract<AppEvent, { type: 'market.order_book' }>
  ): SequencedEventBatch {
    const timestamp = this.now();
    const update = this.orderBookDeltaEngine.updateOrderBook(event.payload.orderBook, timestamp);
    const events: AppEvent[] = [
      event,
      this.createDerivedEvent('analytics.delta', toDeltaAnalyticsPayload(update.snapshot), event)
    ];
    const logEvents = update.signalEvents.map((signalEvent) =>
      createTradeSignalLogEvent(signalEvent, event.emittedAt)
    );

    for (const signalEvent of update.signalEvents) {
      events.push(
        this.createDerivedEvent(
          'signal.order_book_delta',
          toOrderBookSignalPayload(signalEvent),
          event
        )
      );
    }

    return {
      events,
      logEvents
    };
  }

  private processAggTrade(
    event: Extract<AppEvent, { type: 'market.agg_trade' }>
  ): SequencedEventBatch {
    const timestamp = this.now();
    const update = this.tradeFlowEngine.updateTrade(event.payload.trade, timestamp);

    return {
      events: [
        event,
        this.createDerivedEvent('analytics.cvd', toCvdAnalyticsPayload(update.snapshot), event)
      ],
      logEvents: []
    };
  }

  private processCandle(
    event: Extract<AppEvent, { type: 'market.candle' }>
  ): SequencedEventBatch {
    this.candleHistory[event.payload.timeframe] = upsertCandle(
      this.candleHistory[event.payload.timeframe],
      event.payload.candle
    );

    if (!event.payload.candle.isClosed) {
      return {
        events: [event],
        logEvents: []
      };
    }

    const orderBookSnapshot = this.orderBookDeltaEngine.getSnapshot(this.now());
    const tradeFlowSnapshot = this.tradeFlowEngine.getSnapshot(this.now());
    const baseDeltaPayload = toDeltaAnalyticsPayload(orderBookSnapshot);
    const cvdPayload = toCvdAnalyticsPayload(tradeFlowSnapshot);

    if (event.payload.timeframe === '1m') {
      return {
        events: [
          event,
          this.createDerivedEvent('analytics.delta', baseDeltaPayload, event),
          this.createDerivedEvent('analytics.cvd', cvdPayload, event)
        ],
        logEvents: [
          createCandleCloseLogEvent({
            timeframe: '1m',
            candle: event.payload.candle,
            deltaStats: baseDeltaPayload.stats,
            runningTotals: baseDeltaPayload.runningTotals,
            cvdStats: cvdPayload.stats,
            timestamp: event.emittedAt
          })
        ]
      };
    }

    this.deltaHistory = pushDeltaPoint(this.deltaHistory, {
      timestamp: event.payload.candle.timestamp,
      value: baseDeltaPayload.stats.delta
    });

    const chartSurface = buildChartSurfaceState({
      candles: this.candleHistory['5m'],
      deltaPoints: this.deltaHistory
    });
    const deltaPayload = withOutsideBb(baseDeltaPayload, chartSurface.summary.deltaBb);
    const indicatorPayload = toIndicatorAnalyticsPayload(chartSurface.summary);
    const pointUpdate = this.pointSignalsEngine.updateIndicators(
      {
        currentPrice: event.payload.candle.close,
        deltaStats: deltaPayload.stats,
        cvdStats: cvdPayload.stats,
        emaPosition: indicatorPayload.snapshot.emaPosition,
        deltaBb: indicatorPayload.snapshot.deltaBb,
        priceBb: indicatorPayload.snapshot.priceBb,
        divergence: indicatorPayload.snapshot.divergence,
        atr: indicatorPayload.snapshot.atr,
        atrSma: indicatorPayload.snapshot.atrSma
      },
      event.payload.candle.timestamp
    );

    const events: AppEvent[] = [
      event,
      this.createDerivedEvent('analytics.delta', deltaPayload, event),
      this.createDerivedEvent('analytics.cvd', cvdPayload, event),
      this.createDerivedEvent('analytics.indicator', indicatorPayload, event)
    ];
    const logEvents: PersistedLogEvent[] = [
      createCandleCloseLogEvent({
        timeframe: '5m',
        candle: event.payload.candle,
        deltaStats: deltaPayload.stats,
        runningTotals: deltaPayload.runningTotals,
        indicators: indicatorPayload.snapshot,
        cvdStats: cvdPayload.stats,
        timestamp: event.emittedAt
      })
    ];

    for (const signalEvent of pointUpdate.signalEvents) {
      events.push(
        this.createDerivedEvent('signal.point', toPointSignalPayload(signalEvent), event)
      );
      logEvents.push(createPointSignalLogEvent(signalEvent, event.emittedAt));
    }

    return {
      events,
      logEvents
    };
  }

  private createDerivedEvent<TType extends AppEventType, TPayload>(
    type: TType,
    payload: TPayload,
    sourceEvent: AppEvent
  ): AppEventEnvelope<TType, TPayload> {
    return {
      version: 'v1',
      type,
      sequence: this.nextSequence(),
      emittedAt: sourceEvent.emittedAt,
      source: sourceEvent.source,
      symbol: sourceEvent.symbol,
      payload
    };
  }
}
