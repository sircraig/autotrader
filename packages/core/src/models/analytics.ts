export type BandPosition = 'above' | 'below';
export type EmaPosition = BandPosition | 'touch';
export type DivergenceType = 'bullish' | 'bearish';
export type OrderBookSignalType = 'BUY' | 'SELL';
export type PointSignalDirection = 'LONG' | 'SHORT';
export type CvdSide = 'buy' | 'sell' | 'neutral';

export interface OrderBookConditions {
  bidQty3: number;
  askQty3: number;
  firstBidQty: number;
  firstAskQty: number;
  firstBidPrice: number;
  firstAskPrice: number;
  spread: number;
  bidAskRatio: number;
  askBidRatio: number;
  buyRatioMet: boolean;
  buyQtyMet: boolean;
  buyOpenMet: boolean;
  buyCloseRatio: number;
  buyCloseMet: boolean;
  sellRatioMet: boolean;
  sellQtyMet: boolean;
  sellOpenMet: boolean;
  sellCloseRatio: number;
  sellCloseMet: boolean;
}

export interface DeltaStats {
  delta: number;
  deltaPct: number;
  durationDelta: number;
  durationDeltaPct: number;
  pnlTotal1h: number;
  outsideBb?: BandPosition;
}

export interface RunningTotals {
  buyTotal: number;
  buyCount: number;
  buyDuration: number;
  sellTotal: number;
  sellCount: number;
  sellDuration: number;
  combinedTotal: number;
  delta: number;
  deltaPct: number;
  totalDuration: number;
  durationDelta: number;
  durationDeltaPct: number;
}

export interface CvdStats {
  cvd1m: number;
  cvd5m: number;
  cvd1h: number;
  buyVolume1m: number;
  sellVolume1m: number;
  buyVolume5m: number;
  sellVolume5m: number;
  buyPct5m: number;
  side1m: CvdSide;
  side5m: CvdSide;
  side1h: CvdSide;
  tradeCount1m: number;
  tradeRate: number;
}

export interface IndicatorSnapshot {
  priceBb: BandPosition | null;
  deltaBb: BandPosition | null;
  emaPosition: EmaPosition | null;
  divergence: DivergenceType | null;
  atr: number | null;
  atrSma: number | null;
  atrBelowSma: boolean;
}

export interface PointBreakdown {
  ema: number;
  priceDelta: number;
  timeDelta: number;
  cvd: number;
  deltaBb: number;
  priceBb: number;
  divergence: number;
  divergenceCandles: number;
}

export interface PointSignalIndicatorSnapshot {
  emaPosition: EmaPosition | null;
  priceDelta: number;
  timeDelta: number;
  cvdBuyPct: number;
  deltaBb: BandPosition | null;
  priceBb: BandPosition | null;
  divergence: DivergenceType | null;
  currentPrice: number;
  pnlTotal1h: number;
  pnlConditionMet: boolean;
  atrValue: number | null;
  atrSmaValue: number | null;
  atrAboveMin: boolean;
  atrAboveSma: boolean;
  atrConditionMet: boolean;
  atrBelowSma: boolean;
  closeReason?: string;
}

export interface PointTrade {
  direction: PointSignalDirection;
  entryPrice: number;
  entryTime: string;
  entryPoints: number;
  exitPrice?: number;
  exitTime?: string;
  exitPoints?: number;
  pnl?: number;
}

export interface PointSignalSessionStats {
  totalTrades: number;
  winningTrades: number;
  totalPnl: number;
  winRate: number;
}

