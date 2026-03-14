import { z } from 'zod';

import {
  isoTimestampSchema,
  orderBookSignalTypeSchema,
  pointSignalDirectionSchema,
} from './common';

const candleSnapshotSchema = z.object({
  timestamp: z.number().int().nonnegative(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number()
});

export const persistedLogEventSchema = z.discriminatedUnion('event_type', [
  z.object({
    event_type: z.literal('TRADE_OPEN'),
    timestamp: isoTimestampSchema,
    signal_type: orderBookSignalTypeSchema,
    entry_price: z.number(),
    entry_time: isoTimestampSchema,
    conditions: z.object({
      bid_qty_3: z.number(),
      ask_qty_3: z.number(),
      bid_ask_ratio: z.number(),
      ask_bid_ratio: z.number(),
      first_bid_qty: z.number(),
      first_ask_qty: z.number(),
      first_bid_price: z.number(),
      first_ask_price: z.number(),
      spread: z.number()
    })
  }),
  z.object({
    event_type: z.literal('TRADE_CLOSE'),
    timestamp: isoTimestampSchema,
    signal_type: orderBookSignalTypeSchema,
    entry_price: z.number(),
    entry_time: isoTimestampSchema,
    exit_price: z.number(),
    exit_time: isoTimestampSchema,
    duration_seconds: z.number().nonnegative(),
    price_diff: z.number(),
    conditions: z.object({
      bid_qty_3: z.number(),
      ask_qty_3: z.number(),
      first_bid_qty: z.number(),
      first_ask_qty: z.number(),
      buy_close_ratio: z.number(),
      sell_close_ratio: z.number()
    }),
    running_totals: z.object({
      buy_total: z.number(),
      buy_count: z.number().int().nonnegative(),
      buy_duration: z.number().int().nonnegative(),
      sell_total: z.number(),
      sell_count: z.number().int().nonnegative(),
      sell_duration: z.number().int().nonnegative(),
      combined_total: z.number(),
      delta: z.number(),
      delta_pct: z.number().int().nonnegative(),
      total_duration: z.number().int().nonnegative(),
      duration_delta: z.number().int(),
      duration_delta_pct: z.number().int().nonnegative()
    })
  }),
  z.object({
    event_type: z.enum(['CANDLE_CLOSE_1M', 'CANDLE_CLOSE_5M']),
    timestamp: isoTimestampSchema,
    timeframe: z.enum(['1m', '5m']),
    candle: candleSnapshotSchema,
    delta_stats: z.object({
      delta: z.number(),
      delta_pct: z.number().int(),
      duration_delta: z.number().int(),
      duration_delta_pct: z.number().int(),
      pnl_total_1h: z.number(),
      outside_bb: z.enum(['above', 'below']).nullable().optional()
    }),
    running_totals: z.object({
      buy_total: z.number(),
      buy_count: z.number().int().nonnegative(),
      buy_duration: z.number().int().nonnegative(),
      sell_total: z.number(),
      sell_count: z.number().int().nonnegative(),
      sell_duration: z.number().int().nonnegative(),
      combined_total: z.number(),
      delta: z.number(),
      delta_pct: z.number().int().nonnegative(),
      total_duration: z.number().int().nonnegative(),
      duration_delta: z.number().int(),
      duration_delta_pct: z.number().int().nonnegative()
    }),
    indicators: z
      .object({
        price_bb: z.enum(['above', 'below']).nullable(),
        delta_bb: z.enum(['above', 'below']).nullable(),
        ema_position: z.enum(['above', 'below', 'touch']).nullable(),
        bullish_divergence: z.boolean(),
        bearish_divergence: z.boolean(),
        atr: z.number().nullable(),
        atr_sma: z.number().nullable(),
        atr_below_sma: z.boolean()
      })
      .optional(),
    cvd_stats: z
      .object({
        cvd_1m: z.number(),
        cvd_5m: z.number(),
        cvd_1h: z.number(),
        buy_volume_1m: z.number(),
        sell_volume_1m: z.number(),
        buy_volume_5m: z.number(),
        sell_volume_5m: z.number(),
        buy_pct_5m: z.number().int().min(0).max(100),
        side_1m: z.enum(['buy', 'sell', 'neutral']),
        side_5m: z.enum(['buy', 'sell', 'neutral']),
        side_1h: z.enum(['buy', 'sell', 'neutral']),
        trade_count_1m: z.number().int().nonnegative(),
        trade_rate: z.number().nonnegative()
      })
      .optional()
  }),
  z.object({
    event_type: z.literal('POINT_TRADE_OPEN'),
    timestamp: isoTimestampSchema,
    direction: pointSignalDirectionSchema,
    entry_price: z.number(),
    entry_time: isoTimestampSchema,
    points: z.number().int().nonnegative(),
    breakdown: z.object({
      ema: z.number().int().nonnegative(),
      price_delta: z.number().int().nonnegative(),
      time_delta: z.number().int().nonnegative(),
      cvd: z.number().int().nonnegative(),
      delta_bb: z.number().int().nonnegative(),
      price_bb: z.number().int().nonnegative(),
      divergence: z.number().int().nonnegative(),
      divergence_candles: z.number().int().nonnegative()
    }),
    indicators: z.object({
      ema_position: z.enum(['above', 'below', 'touch']).nullable(),
      price_delta: z.number(),
      time_delta: z.number().int(),
      cvd_buy_pct: z.number().min(0).max(100),
      delta_bb: z.enum(['above', 'below']).nullable(),
      price_bb: z.enum(['above', 'below']).nullable(),
      divergence: z.enum(['bullish', 'bearish']).nullable(),
      current_price: z.number(),
      pnl_total_1h: z.number(),
      pnl_condition_met: z.boolean(),
      atr_value: z.number().nullable(),
      atr_sma_value: z.number().nullable(),
      atr_above_min: z.boolean(),
      atr_above_sma: z.boolean(),
      atr_condition_met: z.boolean(),
      atr_below_sma: z.boolean()
    })
  }),
  z.object({
    event_type: z.literal('POINT_TRADE_CLOSE'),
    timestamp: isoTimestampSchema,
    direction: pointSignalDirectionSchema,
    entry_price: z.number(),
    entry_time: isoTimestampSchema,
    entry_points: z.number().int().nonnegative(),
    exit_price: z.number(),
    exit_time: isoTimestampSchema,
    exit_points: z.number().int().nonnegative(),
    duration_seconds: z.number().nonnegative(),
    pnl: z.number(),
    breakdown: z.object({
      ema: z.number().int().nonnegative(),
      price_delta: z.number().int().nonnegative(),
      time_delta: z.number().int().nonnegative(),
      cvd: z.number().int().nonnegative(),
      delta_bb: z.number().int().nonnegative(),
      price_bb: z.number().int().nonnegative(),
      divergence: z.number().int().nonnegative(),
      divergence_candles: z.number().int().nonnegative()
    }),
    indicators: z.object({
      ema_position: z.enum(['above', 'below', 'touch']).nullable(),
      price_delta: z.number(),
      time_delta: z.number().int(),
      cvd_buy_pct: z.number().min(0).max(100),
      delta_bb: z.enum(['above', 'below']).nullable(),
      price_bb: z.enum(['above', 'below']).nullable(),
      divergence: z.enum(['bullish', 'bearish']).nullable(),
      current_price: z.number(),
      pnl_total_1h: z.number(),
      pnl_condition_met: z.boolean(),
      atr_value: z.number().nullable(),
      atr_sma_value: z.number().nullable(),
      atr_above_min: z.boolean(),
      atr_above_sma: z.boolean(),
      atr_condition_met: z.boolean(),
      atr_below_sma: z.boolean(),
      close_reason: z.string().optional()
    })
  })
]);

export type PersistedLogEventSchema = z.infer<typeof persistedLogEventSchema>;
