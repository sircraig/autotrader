import type { OrderBookSignalType, PointSignalDirection } from './analytics';
import type { Candle, Timeframe } from './market';

export interface PersistedTradeConditionsOpen {
  bid_qty_3: number;
  ask_qty_3: number;
  bid_ask_ratio: number;
  ask_bid_ratio: number;
  first_bid_qty: number;
  first_ask_qty: number;
  first_bid_price: number;
  first_ask_price: number;
  spread: number;
}

export interface PersistedTradeConditionsClose {
  bid_qty_3: number;
  ask_qty_3: number;
  first_bid_qty: number;
  first_ask_qty: number;
  buy_close_ratio: number;
  sell_close_ratio: number;
}

export interface PersistedRunningTotals {
  buy_total: number;
  buy_count: number;
  buy_duration: number;
  sell_total: number;
  sell_count: number;
  sell_duration: number;
  combined_total: number;
  delta: number;
  delta_pct: number;
  total_duration: number;
  duration_delta: number;
  duration_delta_pct: number;
}

export interface PersistedDeltaStats {
  delta: number;
  delta_pct: number;
  duration_delta: number;
  duration_delta_pct: number;
  pnl_total_1h: number;
  outside_bb?: 'above' | 'below' | null;
}

export interface PersistedCvdStats {
  cvd_1m: number;
  cvd_5m: number;
  cvd_1h: number;
  buy_volume_1m: number;
  sell_volume_1m: number;
  buy_volume_5m: number;
  sell_volume_5m: number;
  buy_pct_5m: number;
  side_1m: 'buy' | 'sell' | 'neutral';
  side_5m: 'buy' | 'sell' | 'neutral';
  side_1h: 'buy' | 'sell' | 'neutral';
  trade_count_1m: number;
  trade_rate: number;
}

export interface PersistedCandleIndicators {
  price_bb: 'above' | 'below' | null;
  delta_bb: 'above' | 'below' | null;
  ema_position: 'above' | 'below' | 'touch' | null;
  bullish_divergence: boolean;
  bearish_divergence: boolean;
  atr: number | null;
  atr_sma: number | null;
  atr_below_sma: boolean;
}

export interface PersistedPointBreakdown {
  ema: number;
  price_delta: number;
  time_delta: number;
  cvd: number;
  delta_bb: number;
  price_bb: number;
  divergence: number;
  divergence_candles: number;
}

export interface PersistedPointIndicators {
  ema_position: 'above' | 'below' | 'touch' | null;
  price_delta: number;
  time_delta: number;
  cvd_buy_pct: number;
  delta_bb: 'above' | 'below' | null;
  price_bb: 'above' | 'below' | null;
  divergence: 'bullish' | 'bearish' | null;
  current_price: number;
  pnl_total_1h: number;
  pnl_condition_met: boolean;
  atr_value: number | null;
  atr_sma_value: number | null;
  atr_above_min: boolean;
  atr_above_sma: boolean;
  atr_condition_met: boolean;
  atr_below_sma: boolean;
  close_reason?: string;
}

export interface TradeOpenLogEvent {
  event_type: 'TRADE_OPEN';
  timestamp: string;
  signal_type: OrderBookSignalType;
  entry_price: number;
  entry_time: string;
  conditions: PersistedTradeConditionsOpen;
}

export interface TradeCloseLogEvent {
  event_type: 'TRADE_CLOSE';
  timestamp: string;
  signal_type: OrderBookSignalType;
  entry_price: number;
  entry_time: string;
  exit_price: number;
  exit_time: string;
  duration_seconds: number;
  price_diff: number;
  conditions: PersistedTradeConditionsClose;
  running_totals: PersistedRunningTotals;
}

export interface CandleCloseLogEvent {
  event_type: 'CANDLE_CLOSE_1M' | 'CANDLE_CLOSE_5M';
  timestamp: string;
  timeframe: Timeframe;
  candle: Omit<Candle, 'isClosed'>;
  delta_stats: PersistedDeltaStats;
  running_totals: PersistedRunningTotals;
  indicators?: PersistedCandleIndicators;
  cvd_stats?: PersistedCvdStats;
}

export interface PointTradeOpenLogEvent {
  event_type: 'POINT_TRADE_OPEN';
  timestamp: string;
  direction: PointSignalDirection;
  entry_price: number;
  entry_time: string;
  points: number;
  breakdown: PersistedPointBreakdown;
  indicators: PersistedPointIndicators;
}

export interface PointTradeCloseLogEvent {
  event_type: 'POINT_TRADE_CLOSE';
  timestamp: string;
  direction: PointSignalDirection;
  entry_price: number;
  entry_time: string;
  entry_points: number;
  exit_price: number;
  exit_time: string;
  exit_points: number;
  duration_seconds: number;
  pnl: number;
  breakdown: PersistedPointBreakdown;
  indicators: PersistedPointIndicators;
}

export type PersistedLogEvent =
  | TradeOpenLogEvent
  | TradeCloseLogEvent
  | CandleCloseLogEvent
  | PointTradeOpenLogEvent
  | PointTradeCloseLogEvent;
