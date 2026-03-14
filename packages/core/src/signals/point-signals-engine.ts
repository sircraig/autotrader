import { tradingConfig } from '../config/trading';
import type {
  BandPosition,
  CvdStats,
  DeltaStats,
  DivergenceType,
  EmaPosition,
  PointBreakdown,
  PointSignalDirection,
  PointSignalIndicatorSnapshot,
  PointSignalSessionStats,
  PointTrade
} from '../models';
import type { RollingWindowClock } from '../utils';

interface ActivePointTradeState {
  direction: PointSignalDirection;
  entryPrice: number;
  entryTime: number;
  entryPoints: number;
}

interface ClosedPointTradeState extends ActivePointTradeState {
  exitPrice: number;
  exitTime: number;
  exitPoints: number;
  pnl: number;
}

export interface PointSignalUpdateInput {
  currentPrice: number;
  deltaStats?: DeltaStats | null;
  cvdStats?: CvdStats | null;
  emaPosition?: EmaPosition | null;
  deltaBb?: BandPosition | null;
  priceBb?: BandPosition | null;
  divergence?: DivergenceType | null;
  atr?: number | null;
  atrSma?: number | null;
}

export type PointSignalEvent =
  | {
      direction: PointSignalDirection;
      action: 'open';
      points: number;
      breakdown: PointBreakdown;
      indicators: PointSignalIndicatorSnapshot;
      trade: PointTrade;
    }
  | {
      direction: PointSignalDirection;
      action: 'close';
      points: number;
      breakdown: PointBreakdown;
      indicators: PointSignalIndicatorSnapshot;
      trade: PointTrade;
    };

export interface PointSignalsSnapshot {
  activeTrade: PointTrade | null;
  tradeHistory: PointTrade[];
  sessionStats: PointSignalSessionStats;
  indicators: PointSignalIndicatorSnapshot;
  bullishPoints: number;
  bearishPoints: number;
  bullishBreakdown: PointBreakdown;
  bearishBreakdown: PointBreakdown;
  bullishDivergenceCandlesRemaining: number;
  bearishDivergenceCandlesRemaining: number;
  openThreshold: number;
  closeThreshold: number;
}

export interface PointSignalsUpdate {
  snapshot: PointSignalsSnapshot;
  signalEvents: PointSignalEvent[];
}

export interface PointSignalsEngineOptions {
  now?: RollingWindowClock;
  openThreshold?: number;
  closeThreshold?: number;
  minPnlTotal1h?: number;
  minAtrValue?: number;
  divergencePersistenceCandles?: number;
  tradeHistoryLimit?: number;
}

function toIsoTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function clonePointBreakdown(breakdown: PointBreakdown): PointBreakdown {
  return { ...breakdown };
}

function cloneIndicators(
  indicators: PointSignalIndicatorSnapshot
): PointSignalIndicatorSnapshot {
  return { ...indicators };
}

function clonePointTrade(trade: PointTrade): PointTrade {
  return { ...trade };
}

function cloneActiveTradeState(trade: ActivePointTradeState): ActivePointTradeState {
  return { ...trade };
}

function buildSessionStats(
  totalTrades: number,
  winningTrades: number,
  totalPnl: number
): PointSignalSessionStats {
  return {
    totalTrades,
    winningTrades,
    totalPnl,
    winRate: totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0
  };
}

function toPointTrade(trade: ActivePointTradeState | ClosedPointTradeState): PointTrade {
  const pointTrade: PointTrade = {
    direction: trade.direction,
    entryPrice: trade.entryPrice,
    entryTime: toIsoTimestamp(trade.entryTime),
    entryPoints: trade.entryPoints
  };

  if ('exitPrice' in trade) {
    pointTrade.exitPrice = trade.exitPrice;
    pointTrade.exitTime = toIsoTimestamp(trade.exitTime);
    pointTrade.exitPoints = trade.exitPoints;
    pointTrade.pnl = trade.pnl;
  }

  return pointTrade;
}

function calculatePnl(direction: PointSignalDirection, entryPrice: number, exitPrice: number): number {
  return direction === 'LONG' ? exitPrice - entryPrice : entryPrice - exitPrice;
}

export class PointSignalsEngine {
  private readonly now: RollingWindowClock;
  private readonly openThreshold: number;
  private readonly closeThreshold: number;
  private readonly minPnlTotal1h: number;
  private readonly minAtrValue: number;
  private readonly divergencePersistenceCandles: number;
  private readonly tradeHistoryLimit: number;
  private emaPosition: EmaPosition | null = null;
  private priceDelta = 0;
  private timeDelta = 0;
  private cvdBuyPct = 50;
  private deltaBb: BandPosition | null = null;
  private priceBb: BandPosition | null = null;
  private divergence: DivergenceType | null = null;
  private currentPrice = 0;
  private bullishDivCandlesRemaining = 0;
  private bearishDivCandlesRemaining = 0;
  private pnlTotal1h = 0;
  private atrValue: number | null = null;
  private atrSmaValue: number | null = null;
  private currentTrade: ActivePointTradeState | null = null;
  private tradeHistory: ClosedPointTradeState[] = [];
  private totalTrades = 0;
  private winningTrades = 0;
  private totalPnl = 0;

  constructor(options: PointSignalsEngineOptions = {}) {
    this.now = options.now ?? Date.now;
    this.openThreshold = options.openThreshold ?? tradingConfig.pointSignals.openThreshold;
    this.closeThreshold = options.closeThreshold ?? tradingConfig.pointSignals.closeThreshold;
    this.minPnlTotal1h = options.minPnlTotal1h ?? tradingConfig.pointSignals.minPnlTotal1h;
    this.minAtrValue = options.minAtrValue ?? tradingConfig.pointSignals.minAtrValue;
    this.divergencePersistenceCandles =
      options.divergencePersistenceCandles ??
      tradingConfig.pointSignals.divergencePersistenceCandles;
    this.tradeHistoryLimit = options.tradeHistoryLimit ?? 20;
  }

  updateIndicators(
    input: PointSignalUpdateInput,
    timestamp: number = this.now()
  ): PointSignalsUpdate {
    this.currentPrice = input.currentPrice;

    if (input.deltaStats) {
      this.priceDelta = input.deltaStats.delta;
      this.timeDelta = input.deltaStats.durationDelta;
      this.pnlTotal1h = input.deltaStats.pnlTotal1h;
    }

    if (input.cvdStats) {
      this.cvdBuyPct = input.cvdStats.buyPct5m;
    }

    this.emaPosition = input.emaPosition ?? null;
    this.deltaBb = input.deltaBb ?? null;
    this.priceBb = input.priceBb ?? null;
    this.divergence = input.divergence ?? null;
    this.atrValue = input.atr ?? null;
    this.atrSmaValue = input.atrSma ?? null;

    this.updateDivergenceCounters(this.divergence);

    const bullishBreakdown = this.calculateBullishBreakdown();
    const bearishBreakdown = this.calculateBearishBreakdown();
    const bullishPoints = this.sumBreakdown(bullishBreakdown);
    const bearishPoints = this.sumBreakdown(bearishBreakdown);
    const baseIndicators = this.getIndicatorSnapshot();
    const signalEvents: PointSignalEvent[] = [];

    const allConditionsMet =
      baseIndicators.pnlConditionMet && baseIndicators.atrConditionMet;

    if (this.currentTrade === null) {
      if (allConditionsMet && bullishPoints >= this.openThreshold) {
        const trade = this.openTrade('LONG', this.currentPrice, timestamp, bullishPoints);
        signalEvents.push({
          direction: 'LONG',
          action: 'open',
          points: bullishPoints,
          breakdown: clonePointBreakdown(bullishBreakdown),
          indicators: cloneIndicators(baseIndicators),
          trade: clonePointTrade(toPointTrade(trade))
        });
      } else if (allConditionsMet && bearishPoints >= this.openThreshold) {
        const trade = this.openTrade('SHORT', this.currentPrice, timestamp, bearishPoints);
        signalEvents.push({
          direction: 'SHORT',
          action: 'open',
          points: bearishPoints,
          breakdown: clonePointBreakdown(bearishBreakdown),
          indicators: cloneIndicators(baseIndicators),
          trade: clonePointTrade(toPointTrade(trade))
        });
      }
    } else if (baseIndicators.atrBelowSma) {
      const event = this.closeCurrentTrade(
        this.currentTrade.direction === 'LONG' ? bullishPoints : bearishPoints,
        this.currentTrade.direction === 'LONG' ? bullishBreakdown : bearishBreakdown,
        timestamp,
        'ATR < SMA'
      );

      signalEvents.push(event);
    } else if (
      this.currentTrade.direction === 'LONG' &&
      bullishPoints <= this.closeThreshold
    ) {
      signalEvents.push(
        this.closeCurrentTrade(bullishPoints, bullishBreakdown, timestamp)
      );
    } else if (
      this.currentTrade.direction === 'SHORT' &&
      bearishPoints <= this.closeThreshold
    ) {
      signalEvents.push(
        this.closeCurrentTrade(bearishPoints, bearishBreakdown, timestamp)
      );
    }

    return {
      snapshot: this.getSnapshot(),
      signalEvents
    };
  }

  getSnapshot(): PointSignalsSnapshot {
    const bullishBreakdown = this.calculateBullishBreakdown();
    const bearishBreakdown = this.calculateBearishBreakdown();

    return {
      activeTrade: this.currentTrade ? toPointTrade(cloneActiveTradeState(this.currentTrade)) : null,
      tradeHistory: this.tradeHistory.map((trade) => clonePointTrade(toPointTrade(trade))),
      sessionStats: buildSessionStats(this.totalTrades, this.winningTrades, this.totalPnl),
      indicators: this.getIndicatorSnapshot(),
      bullishPoints: this.sumBreakdown(bullishBreakdown),
      bearishPoints: this.sumBreakdown(bearishBreakdown),
      bullishBreakdown,
      bearishBreakdown,
      bullishDivergenceCandlesRemaining: this.bullishDivCandlesRemaining,
      bearishDivergenceCandlesRemaining: this.bearishDivCandlesRemaining,
      openThreshold: this.openThreshold,
      closeThreshold: this.closeThreshold
    };
  }

  private updateDivergenceCounters(divergence: DivergenceType | null): void {
    if (divergence === 'bullish') {
      this.bullishDivCandlesRemaining = this.divergencePersistenceCandles;
    } else if (this.bullishDivCandlesRemaining > 0) {
      this.bullishDivCandlesRemaining -= 1;
    }

    if (divergence === 'bearish') {
      this.bearishDivCandlesRemaining = this.divergencePersistenceCandles;
    } else if (this.bearishDivCandlesRemaining > 0) {
      this.bearishDivCandlesRemaining -= 1;
    }
  }

  private calculateBullishBreakdown(): PointBreakdown {
    return {
      ema: this.emaPosition === 'above' ? 1 : 0,
      priceDelta: this.priceDelta > 0 ? 1 : 0,
      timeDelta: this.timeDelta > 0 ? 1 : 0,
      cvd: this.cvdBuyPct > 50 ? 1 : 0,
      deltaBb: this.deltaBb === 'above' ? 1 : 0,
      priceBb: this.priceBb === 'above' ? 1 : 0,
      divergence: this.bullishDivCandlesRemaining > 0 ? 2 : 0,
      divergenceCandles: this.bullishDivCandlesRemaining
    };
  }

  private calculateBearishBreakdown(): PointBreakdown {
    return {
      ema: this.emaPosition === 'below' ? 1 : 0,
      priceDelta: this.priceDelta < 0 ? 1 : 0,
      timeDelta: this.timeDelta < 0 ? 1 : 0,
      cvd: this.cvdBuyPct < 50 ? 1 : 0,
      deltaBb: this.deltaBb === 'below' ? 1 : 0,
      priceBb: this.priceBb === 'below' ? 1 : 0,
      divergence: this.bearishDivCandlesRemaining > 0 ? 2 : 0,
      divergenceCandles: this.bearishDivCandlesRemaining
    };
  }

  private sumBreakdown(breakdown: PointBreakdown): number {
    return (
      breakdown.ema +
      breakdown.priceDelta +
      breakdown.timeDelta +
      breakdown.cvd +
      breakdown.deltaBb +
      breakdown.priceBb +
      breakdown.divergence
    );
  }

  private getIndicatorSnapshot(
    closeReason?: string
  ): PointSignalIndicatorSnapshot {
    const pnlConditionMet = this.pnlTotal1h > this.minPnlTotal1h;
    const atrAboveMin = this.atrValue !== null && this.atrValue >= this.minAtrValue;
    const atrAboveSma =
      this.atrValue !== null &&
      this.atrSmaValue !== null &&
      this.atrValue > this.atrSmaValue;
    const atrBelowSma =
      this.atrValue !== null &&
      this.atrSmaValue !== null &&
      this.atrValue < this.atrSmaValue;

    return {
      emaPosition: this.emaPosition,
      priceDelta: this.priceDelta,
      timeDelta: this.timeDelta,
      cvdBuyPct: this.cvdBuyPct,
      deltaBb: this.deltaBb,
      priceBb: this.priceBb,
      divergence: this.divergence,
      currentPrice: this.currentPrice,
      pnlTotal1h: this.pnlTotal1h,
      pnlConditionMet,
      atrValue: this.atrValue,
      atrSmaValue: this.atrSmaValue,
      atrAboveMin,
      atrAboveSma,
      atrConditionMet: atrAboveMin && atrAboveSma,
      atrBelowSma,
      ...(closeReason ? { closeReason } : {})
    };
  }

  private openTrade(
    direction: PointSignalDirection,
    price: number,
    timestamp: number,
    points: number
  ): ActivePointTradeState {
    this.currentTrade = {
      direction,
      entryPrice: price,
      entryTime: timestamp,
      entryPoints: points
    };

    return cloneActiveTradeState(this.currentTrade);
  }

  private closeCurrentTrade(
    points: number,
    breakdown: PointBreakdown,
    timestamp: number,
    reason?: string
  ): PointSignalEvent {
    if (this.currentTrade === null) {
      throw new Error('Cannot close point trade when no trade is active');
    }

    const closedTrade: ClosedPointTradeState = {
      ...this.currentTrade,
      exitPrice: this.currentPrice,
      exitTime: timestamp,
      exitPoints: points,
      pnl: calculatePnl(this.currentTrade.direction, this.currentTrade.entryPrice, this.currentPrice)
    };

    this.totalTrades += 1;
    if (closedTrade.pnl > 0) {
      this.winningTrades += 1;
    }
    this.totalPnl += closedTrade.pnl;
    this.tradeHistory = [...this.tradeHistory, closedTrade].slice(-this.tradeHistoryLimit);
    this.currentTrade = null;

    return {
      direction: closedTrade.direction,
      action: 'close',
      points,
      breakdown: clonePointBreakdown(breakdown),
      indicators: cloneIndicators(this.getIndicatorSnapshot(reason)),
      trade: clonePointTrade(toPointTrade(closedTrade))
    };
  }
}
