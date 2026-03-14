import type {
  CvdStats,
  DeltaStats,
  IndicatorSnapshot,
  OrderBookConditions,
  PointBreakdown,
  PointSignalDirection,
  PointSignalIndicatorSnapshot,
  RunningTotals
} from './analytics';
import type { AggTrade, Candle, HistoricalBootstrap, OrderBook, Timeframe } from './market';

export type AppEventType =
  | 'bootstrap.history'
  | 'market.candle'
  | 'market.order_book'
  | 'market.agg_trade'
  | 'analytics.delta'
  | 'analytics.cvd'
  | 'analytics.indicator'
  | 'signal.order_book_delta'
  | 'signal.point'
  | 'system.status';

export interface AppEventEnvelope<TType extends AppEventType, TPayload> {
  version: 'v1';
  type: TType;
  sequence: number;
  emittedAt: string;
  source: 'binance' | 'server' | 'replay';
  symbol: string;
  payload: TPayload;
}

export interface CandleEventPayload {
  timeframe: Timeframe;
  candle: Candle;
}

export interface OrderBookEventPayload {
  orderBook: OrderBook;
}

export interface AggTradeEventPayload {
  trade: AggTrade;
}

export interface DeltaAnalyticsPayload {
  stats: DeltaStats;
  runningTotals: RunningTotals;
}

export interface CvdAnalyticsPayload {
  stats: CvdStats;
}

export interface IndicatorAnalyticsPayload {
  timeframe: '5m';
  snapshot: IndicatorSnapshot;
}

export interface OrderBookSignalPayload {
  signalType: 'BUY' | 'SELL';
  action: 'open' | 'close';
  conditions: OrderBookConditions;
  runningTotals?: RunningTotals;
}

export interface PointSignalPayload {
  direction: PointSignalDirection;
  action: 'open' | 'close';
  points: number;
  breakdown: PointBreakdown;
  indicators: PointSignalIndicatorSnapshot;
}

export interface SystemStatusPayload {
  status: 'starting' | 'healthy' | 'degraded' | 'stopped';
  reconnectCount?: number;
  staleStreams?: string[];
}

export type AppEvent =
  | AppEventEnvelope<'bootstrap.history', HistoricalBootstrap>
  | AppEventEnvelope<'market.candle', CandleEventPayload>
  | AppEventEnvelope<'market.order_book', OrderBookEventPayload>
  | AppEventEnvelope<'market.agg_trade', AggTradeEventPayload>
  | AppEventEnvelope<'analytics.delta', DeltaAnalyticsPayload>
  | AppEventEnvelope<'analytics.cvd', CvdAnalyticsPayload>
  | AppEventEnvelope<'analytics.indicator', IndicatorAnalyticsPayload>
  | AppEventEnvelope<'signal.order_book_delta', OrderBookSignalPayload>
  | AppEventEnvelope<'signal.point', PointSignalPayload>
  | AppEventEnvelope<'system.status', SystemStatusPayload>;

