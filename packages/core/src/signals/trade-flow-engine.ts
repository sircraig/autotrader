import { tradingConfig } from '../config/trading';
import type { CvdStats, AggTrade } from '../models';
import { RollingCvdWindow, type RollingWindowClock } from '../utils';

const TRADE_RATE_WINDOW_SECONDS = 10;
const TRADE_RATE_WINDOW_MS = TRADE_RATE_WINDOW_SECONDS * 1000;
const RECENT_TRADE_RATE_LIMIT = 1000;

export type LargeTradeSide = 'buy' | 'sell';

export interface RecentLargeTrade {
  observedAt: number;
  side: LargeTradeSide;
  signedQuantity: number;
  trade: AggTrade;
}

export interface TradeFlowSnapshot {
  lastTrade: AggTrade | null;
  lastPrice: number;
  stats: CvdStats;
  recentLargeTrades: RecentLargeTrade[];
}

export interface TradeFlowUpdate {
  snapshot: TradeFlowSnapshot;
  recordedLargeTrade: RecentLargeTrade | null;
}

export interface TradeFlowEngineOptions {
  now?: RollingWindowClock;
  largeTradeThresholdBtc?: number;
  recentLargeTradeLimit?: number;
}

function cloneTrade(trade: AggTrade): AggTrade {
  return { ...trade };
}

function getTradeSide(trade: AggTrade): LargeTradeSide {
  return trade.isBuyerMaker ? 'sell' : 'buy';
}

function getSignedQuantity(trade: AggTrade): number {
  return getTradeSide(trade) === 'buy' ? trade.quantity : -trade.quantity;
}

function cloneRecentLargeTrade(largeTrade: RecentLargeTrade): RecentLargeTrade {
  return {
    observedAt: largeTrade.observedAt,
    side: largeTrade.side,
    signedQuantity: largeTrade.signedQuantity,
    trade: cloneTrade(largeTrade.trade)
  };
}

export class TradeFlowEngine {
  private readonly now: RollingWindowClock;
  private readonly largeTradeThresholdBtc: number;
  private readonly recentLargeTradeLimit: number;
  private readonly cvd1m: RollingCvdWindow;
  private readonly cvd5m: RollingCvdWindow;
  private readonly cvd1h: RollingCvdWindow;
  private recentLargeTrades: RecentLargeTrade[] = [];
  private recentTradeTimestamps: number[] = [];
  private lastTrade: AggTrade | null = null;
  private lastPrice = 0;

  constructor(options: TradeFlowEngineOptions = {}) {
    this.now = options.now ?? Date.now;
    this.largeTradeThresholdBtc =
      options.largeTradeThresholdBtc ?? tradingConfig.tradeFlow.largeTradeThresholdBtc;
    this.recentLargeTradeLimit = options.recentLargeTradeLimit ?? 10;
    this.cvd1m = new RollingCvdWindow(tradingConfig.windows.cvd1mSeconds, this.now);
    this.cvd5m = new RollingCvdWindow(tradingConfig.windows.cvd5mSeconds, this.now);
    this.cvd1h = new RollingCvdWindow(tradingConfig.windows.cvd1hSeconds, this.now);
  }

  updateTrade(trade: AggTrade, timestamp: number = this.now()): TradeFlowUpdate {
    const nextTrade = cloneTrade(trade);

    this.cvd1m.addTrade(nextTrade, timestamp);
    this.cvd5m.addTrade(nextTrade, timestamp);
    this.cvd1h.addTrade(nextTrade, timestamp);

    let recordedLargeTrade: RecentLargeTrade | null = null;

    if (nextTrade.quantity >= this.largeTradeThresholdBtc) {
      recordedLargeTrade = {
        observedAt: timestamp,
        side: getTradeSide(nextTrade),
        signedQuantity: getSignedQuantity(nextTrade),
        trade: cloneTrade(nextTrade)
      };
      this.pushRecentLargeTrade(recordedLargeTrade);
    }

    this.lastTrade = nextTrade;
    this.lastPrice = nextTrade.price;
    this.pushRecentTradeTimestamp(timestamp);

    return {
      snapshot: this.getSnapshot(timestamp),
      recordedLargeTrade: recordedLargeTrade
        ? cloneRecentLargeTrade(recordedLargeTrade)
        : null
    };
  }

  getSnapshot(currentTime: number = this.now()): TradeFlowSnapshot {
    return {
      lastTrade: this.lastTrade ? cloneTrade(this.lastTrade) : null,
      lastPrice: this.lastPrice,
      stats: this.buildStats(currentTime),
      recentLargeTrades: this.recentLargeTrades.map(cloneRecentLargeTrade)
    };
  }

  private buildStats(currentTime: number): CvdStats {
    const buyVolume1m = this.cvd1m.getBuyVolume(currentTime);
    const sellVolume1m = this.cvd1m.getSellVolume(currentTime);
    const buyVolume5m = this.cvd5m.getBuyVolume(currentTime);
    const sellVolume5m = this.cvd5m.getSellVolume(currentTime);

    return {
      cvd1m: this.cvd1m.getCvd(currentTime),
      cvd5m: this.cvd5m.getCvd(currentTime),
      cvd1h: this.cvd1h.getCvd(currentTime),
      buyVolume1m,
      sellVolume1m,
      buyVolume5m,
      sellVolume5m,
      buyPct5m: this.cvd5m.getBuyPercentage(currentTime),
      side1m: this.cvd1m.getDominantSide(currentTime),
      side5m: this.cvd5m.getDominantSide(currentTime),
      side1h: this.cvd1h.getDominantSide(currentTime),
      tradeCount1m: this.cvd1m.getTradeCount(currentTime),
      tradeRate: this.getTradeRate(currentTime)
    };
  }

  private getTradeRate(currentTime: number): number {
    this.pruneTradeRateTimestamps(currentTime);
    return this.recentTradeTimestamps.length / TRADE_RATE_WINDOW_SECONDS;
  }

  private pushRecentTradeTimestamp(timestamp: number): void {
    this.recentTradeTimestamps.push(timestamp);

    if (this.recentTradeTimestamps.length > RECENT_TRADE_RATE_LIMIT) {
      this.recentTradeTimestamps.splice(
        0,
        this.recentTradeTimestamps.length - RECENT_TRADE_RATE_LIMIT
      );
    }
  }

  private pruneTradeRateTimestamps(currentTime: number): void {
    const cutoff = currentTime - TRADE_RATE_WINDOW_MS;
    let pruneCount = 0;

    while (
      pruneCount < this.recentTradeTimestamps.length &&
      this.recentTradeTimestamps[pruneCount]! < cutoff
    ) {
      pruneCount += 1;
    }

    if (pruneCount > 0) {
      this.recentTradeTimestamps.splice(0, pruneCount);
    }
  }

  private pushRecentLargeTrade(largeTrade: RecentLargeTrade): void {
    this.recentLargeTrades = [...this.recentLargeTrades, cloneRecentLargeTrade(largeTrade)].slice(
      -this.recentLargeTradeLimit
    );
  }
}
