import { z } from 'zod';

import {
  aggTradeSchema,
  candleSchema,
  cvdStatsSchema,
  deltaStatsSchema,
  indicatorSnapshotSchema,
  isoTimestampSchema,
  orderBookConditionsSchema,
  orderBookSchema,
  pointBreakdownSchema,
  pointSignalDirectionSchema,
  pointSignalIndicatorSnapshotSchema,
  runningTotalsSchema,
  timeframeSchema
} from './common';

const eventEnvelopeBaseSchema = z.object({
  version: z.literal('v1'),
  sequence: z.number().int().nonnegative(),
  emittedAt: isoTimestampSchema,
  source: z.enum(['binance', 'server', 'replay']),
  symbol: z.string().min(1)
});

export const historicalBootstrapSchema = z.object({
  timeframe: timeframeSchema,
  candles: z.array(candleSchema)
});

export const appEventSchema = z.discriminatedUnion('type', [
  eventEnvelopeBaseSchema.extend({
    type: z.literal('bootstrap.history'),
    payload: historicalBootstrapSchema
  }),
  eventEnvelopeBaseSchema.extend({
    type: z.literal('market.candle'),
    payload: z.object({
      timeframe: timeframeSchema,
      candle: candleSchema
    })
  }),
  eventEnvelopeBaseSchema.extend({
    type: z.literal('market.order_book'),
    payload: z.object({
      orderBook: orderBookSchema
    })
  }),
  eventEnvelopeBaseSchema.extend({
    type: z.literal('market.agg_trade'),
    payload: z.object({
      trade: aggTradeSchema
    })
  }),
  eventEnvelopeBaseSchema.extend({
    type: z.literal('analytics.delta'),
    payload: z.object({
      stats: deltaStatsSchema,
      runningTotals: runningTotalsSchema
    })
  }),
  eventEnvelopeBaseSchema.extend({
    type: z.literal('analytics.cvd'),
    payload: z.object({
      stats: cvdStatsSchema
    })
  }),
  eventEnvelopeBaseSchema.extend({
    type: z.literal('analytics.indicator'),
    payload: z.object({
      timeframe: z.literal('5m'),
      snapshot: indicatorSnapshotSchema
    })
  }),
  eventEnvelopeBaseSchema.extend({
    type: z.literal('signal.order_book_delta'),
    payload: z.object({
      signalType: z.enum(['BUY', 'SELL']),
      action: z.enum(['open', 'close']),
      conditions: orderBookConditionsSchema,
      runningTotals: runningTotalsSchema.optional()
    })
  }),
  eventEnvelopeBaseSchema.extend({
    type: z.literal('signal.point'),
    payload: z.object({
      direction: pointSignalDirectionSchema,
      action: z.enum(['open', 'close']),
      points: z.number().int().nonnegative(),
      breakdown: pointBreakdownSchema,
      indicators: pointSignalIndicatorSnapshotSchema
    })
  }),
  eventEnvelopeBaseSchema.extend({
    type: z.literal('system.status'),
    payload: z.object({
      status: z.enum(['starting', 'healthy', 'degraded', 'stopped']),
      reconnectCount: z.number().int().nonnegative().optional(),
      staleStreams: z.array(z.string()).optional()
    })
  })
]);

export type AppEventSchema = z.infer<typeof appEventSchema>;

