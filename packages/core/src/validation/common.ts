import { z } from 'zod';

export const isoTimestampSchema = z.string().datetime();
export const timeframeSchema = z.enum(['1m', '5m']);
export const bandPositionSchema = z.enum(['above', 'below']);
export const emaPositionSchema = z.enum(['above', 'below', 'touch']);
export const divergenceTypeSchema = z.enum(['bullish', 'bearish']);
export const orderBookSignalTypeSchema = z.enum(['BUY', 'SELL']);
export const pointSignalDirectionSchema = z.enum(['LONG', 'SHORT']);
export const cvdSideSchema = z.enum(['buy', 'sell', 'neutral']);

export const candleSchema = z.object({
  timestamp: z.number().int().nonnegative(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  isClosed: z.boolean()
});

export const orderBookLevelSchema = z.object({
  price: z.number(),
  quantity: z.number()
});

export const orderBookSchema = z.object({
  bids: z.array(orderBookLevelSchema),
  asks: z.array(orderBookLevelSchema),
  lastUpdateId: z.number().int().nonnegative()
});

export const aggTradeSchema = z.object({
  tradeId: z.number().int().nonnegative(),
  price: z.number(),
  quantity: z.number().nonnegative(),
  timestamp: z.number().int().nonnegative(),
  isBuyerMaker: z.boolean()
});

export const orderBookConditionsSchema = z.object({
  bidQty3: z.number(),
  askQty3: z.number(),
  firstBidQty: z.number(),
  firstAskQty: z.number(),
  firstBidPrice: z.number(),
  firstAskPrice: z.number(),
  spread: z.number(),
  bidAskRatio: z.number(),
  askBidRatio: z.number(),
  buyRatioMet: z.boolean(),
  buyQtyMet: z.boolean(),
  buyOpenMet: z.boolean(),
  buyCloseRatio: z.number(),
  buyCloseMet: z.boolean(),
  sellRatioMet: z.boolean(),
  sellQtyMet: z.boolean(),
  sellOpenMet: z.boolean(),
  sellCloseRatio: z.number(),
  sellCloseMet: z.boolean()
});

export const deltaStatsSchema = z.object({
  delta: z.number(),
  deltaPct: z.number().int(),
  durationDelta: z.number().int(),
  durationDeltaPct: z.number().int(),
  pnlTotal1h: z.number(),
  outsideBb: bandPositionSchema.optional()
});

export const runningTotalsSchema = z.object({
  buyTotal: z.number(),
  buyCount: z.number().int().nonnegative(),
  buyDuration: z.number().int().nonnegative(),
  sellTotal: z.number(),
  sellCount: z.number().int().nonnegative(),
  sellDuration: z.number().int().nonnegative(),
  combinedTotal: z.number(),
  delta: z.number(),
  deltaPct: z.number().int().nonnegative(),
  totalDuration: z.number().int().nonnegative(),
  durationDelta: z.number().int(),
  durationDeltaPct: z.number().int().nonnegative()
});

export const cvdStatsSchema = z.object({
  cvd1m: z.number(),
  cvd5m: z.number(),
  cvd1h: z.number(),
  buyVolume1m: z.number(),
  sellVolume1m: z.number(),
  buyVolume5m: z.number(),
  sellVolume5m: z.number(),
  buyPct5m: z.number().int().min(0).max(100),
  side1m: cvdSideSchema,
  side5m: cvdSideSchema,
  side1h: cvdSideSchema,
  tradeCount1m: z.number().int().nonnegative(),
  tradeRate: z.number().nonnegative()
});

export const indicatorSnapshotSchema = z.object({
  priceBb: bandPositionSchema.nullable(),
  deltaBb: bandPositionSchema.nullable(),
  emaPosition: emaPositionSchema.nullable(),
  divergence: divergenceTypeSchema.nullable(),
  atr: z.number().nullable(),
  atrSma: z.number().nullable(),
  atrBelowSma: z.boolean()
});

export const pointBreakdownSchema = z.object({
  ema: z.number().int().nonnegative(),
  priceDelta: z.number().int().nonnegative(),
  timeDelta: z.number().int().nonnegative(),
  cvd: z.number().int().nonnegative(),
  deltaBb: z.number().int().nonnegative(),
  priceBb: z.number().int().nonnegative(),
  divergence: z.number().int().nonnegative(),
  divergenceCandles: z.number().int().nonnegative()
});

export const pointSignalIndicatorSnapshotSchema = z.object({
  emaPosition: emaPositionSchema.nullable(),
  priceDelta: z.number(),
  timeDelta: z.number().int(),
  cvdBuyPct: z.number().min(0).max(100),
  deltaBb: bandPositionSchema.nullable(),
  priceBb: bandPositionSchema.nullable(),
  divergence: divergenceTypeSchema.nullable(),
  currentPrice: z.number(),
  pnlTotal1h: z.number(),
  pnlConditionMet: z.boolean(),
  atrValue: z.number().nullable(),
  atrSmaValue: z.number().nullable(),
  atrAboveMin: z.boolean(),
  atrAboveSma: z.boolean(),
  atrConditionMet: z.boolean(),
  atrBelowSma: z.boolean(),
  closeReason: z.string().optional()
});

