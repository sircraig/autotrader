import { tradingConfig } from '../config/trading';
import type {
  DeltaStats,
  OrderBook,
  OrderBookConditions,
  OrderBookSignalType,
  RunningTotals
} from '../models';
import { RollingAccumulator, type RollingWindowClock } from '../utils';

export interface ActiveOrderBookTrade {
  signalType: OrderBookSignalType;
  entryPrice: number;
  entryTime: number;
}

export interface ClosedOrderBookTrade extends ActiveOrderBookTrade {
  exitPrice: number;
  exitTime: number;
  durationSeconds: number;
  priceDiff: number;
}

export type OrderBookDeltaSignalEvent =
  | {
      signalType: OrderBookSignalType;
      action: 'open';
      conditions: OrderBookConditions;
      entryPrice: number;
      entryTime: number;
    }
  | {
      signalType: OrderBookSignalType;
      action: 'close';
      conditions: OrderBookConditions;
      entryPrice: number;
      entryTime: number;
      exitPrice: number;
      exitTime: number;
      durationSeconds: number;
      priceDiff: number;
      runningTotals: RunningTotals;
    };

export interface OrderBookDeltaSnapshot {
  latestOrderBook: OrderBook | null;
  lastConditions: OrderBookConditions | null;
  activeBuy: ActiveOrderBookTrade | null;
  activeSell: ActiveOrderBookTrade | null;
  recentEvents: ClosedOrderBookTrade[];
  rolling30m: RunningTotals;
  rolling1h: RunningTotals;
  rolling4h: RunningTotals;
  currentDelta: number;
  currentDeltaStats: DeltaStats;
  runningTotals: RunningTotals;
}

export interface OrderBookDeltaUpdate {
  snapshot: OrderBookDeltaSnapshot;
  signalEvents: OrderBookDeltaSignalEvent[];
}

export interface OrderBookDeltaEngineOptions {
  now?: RollingWindowClock;
  imbalanceRatio?: number;
  closeRatio?: number;
  minQuantityBtc?: number;
  recentEventLimit?: number;
}

interface RollingTotalsState {
  buy: RollingAccumulator;
  sell: RollingAccumulator;
  delta: RollingAccumulator;
  buyDuration: RollingAccumulator;
  sellDuration: RollingAccumulator;
}

function cloneOrderBook(orderBook: OrderBook): OrderBook {
  return {
    bids: orderBook.bids.map((level) => ({ ...level })),
    asks: orderBook.asks.map((level) => ({ ...level })),
    lastUpdateId: orderBook.lastUpdateId
  };
}

function cloneConditions(conditions: OrderBookConditions): OrderBookConditions {
  return { ...conditions };
}

function cloneActiveTrade(trade: ActiveOrderBookTrade): ActiveOrderBookTrade {
  return { ...trade };
}

function cloneClosedTrade(trade: ClosedOrderBookTrade): ClosedOrderBookTrade {
  return { ...trade };
}

function createRollingTotalsState(windowSeconds: number, now: RollingWindowClock): RollingTotalsState {
  return {
    buy: new RollingAccumulator(windowSeconds, now),
    sell: new RollingAccumulator(windowSeconds, now),
    delta: new RollingAccumulator(windowSeconds, now),
    buyDuration: new RollingAccumulator(windowSeconds, now),
    sellDuration: new RollingAccumulator(windowSeconds, now)
  };
}

function calculateDeltaPct(delta: number, combinedTotal: number): number {
  return combinedTotal !== 0 ? Math.trunc((Math.abs(delta) / Math.abs(combinedTotal)) * 100) : 0;
}

function calculateDurationDeltaPct(durationDelta: number, totalDuration: number): number {
  return totalDuration > 0
    ? Math.trunc((Math.abs(durationDelta) / totalDuration) * 100)
    : 0;
}

function buildRunningTotals(state: RollingTotalsState, currentTime: number): RunningTotals {
  const buyTotal = state.buy.getTotal(currentTime);
  const sellTotal = state.sell.getTotal(currentTime);
  const combinedTotal = buyTotal + sellTotal;
  const delta = state.delta.getTotal(currentTime);
  const buyDuration = Math.trunc(state.buyDuration.getTotal(currentTime));
  const sellDuration = Math.trunc(state.sellDuration.getTotal(currentTime));
  const totalDuration = buyDuration + sellDuration;
  const durationDelta = buyDuration - sellDuration;

  return {
    buyTotal,
    buyCount: state.buy.count(currentTime),
    buyDuration,
    sellTotal,
    sellCount: state.sell.count(currentTime),
    sellDuration,
    combinedTotal,
    delta,
    deltaPct: calculateDeltaPct(delta, combinedTotal),
    totalDuration,
    durationDelta,
    durationDeltaPct: calculateDurationDeltaPct(durationDelta, totalDuration)
  };
}

function buildDeltaStats(runningTotals: RunningTotals): DeltaStats {
  return {
    delta: runningTotals.delta,
    deltaPct: runningTotals.deltaPct,
    durationDelta: runningTotals.durationDelta,
    durationDeltaPct: runningTotals.durationDeltaPct,
    pnlTotal1h: runningTotals.combinedTotal
  };
}

function calculatePriceDiff(
  signalType: OrderBookSignalType,
  entryPrice: number,
  exitPrice: number
): number {
  return signalType === 'BUY' ? exitPrice - entryPrice : entryPrice - exitPrice;
}

export function calculateOrderBookConditions(
  orderBook: OrderBook,
  options: Pick<OrderBookDeltaEngineOptions, 'imbalanceRatio' | 'closeRatio' | 'minQuantityBtc'> = {}
): OrderBookConditions {
  const imbalanceRatio = options.imbalanceRatio ?? tradingConfig.orderBookDelta.imbalanceRatio;
  const closeRatio = options.closeRatio ?? tradingConfig.orderBookDelta.closeRatio;
  const minQuantityBtc = options.minQuantityBtc ?? tradingConfig.orderBookDelta.minQuantityBtc;

  const bidQty3 = orderBook.bids.slice(0, 3).reduce((total, level) => total + level.quantity, 0);
  const askQty3 = orderBook.asks.slice(0, 3).reduce((total, level) => total + level.quantity, 0);
  const firstBidQty = orderBook.bids[0]?.quantity ?? 0;
  const firstAskQty = orderBook.asks[0]?.quantity ?? 0;
  const firstBidPrice = orderBook.bids[0]?.price ?? 0;
  const firstAskPrice = orderBook.asks[0]?.price ?? 0;
  const spread = firstAskPrice - firstBidPrice;
  const bidAskRatio = askQty3 > 0 ? bidQty3 / askQty3 : 0;
  const askBidRatio = bidQty3 > 0 ? askQty3 / bidQty3 : 0;
  const buyRatioMet = bidQty3 >= imbalanceRatio * askQty3;
  const buyQtyMet = firstAskQty >= minQuantityBtc;
  const buyOpenMet = buyRatioMet && buyQtyMet;
  const buyCloseRatio = bidQty3 > 0 ? firstAskQty / bidQty3 : 0;
  const buyCloseMet = firstAskQty >= closeRatio * bidQty3;
  const sellRatioMet = askQty3 >= imbalanceRatio * bidQty3;
  const sellQtyMet = firstBidQty >= minQuantityBtc;
  const sellOpenMet = sellRatioMet && sellQtyMet;
  const sellCloseRatio = askQty3 > 0 ? firstBidQty / askQty3 : 0;
  const sellCloseMet = firstBidQty >= closeRatio * askQty3;

  return {
    bidQty3,
    askQty3,
    firstBidQty,
    firstAskQty,
    firstBidPrice,
    firstAskPrice,
    spread,
    bidAskRatio,
    askBidRatio,
    buyRatioMet,
    buyQtyMet,
    buyOpenMet,
    buyCloseRatio,
    buyCloseMet,
    sellRatioMet,
    sellQtyMet,
    sellOpenMet,
    sellCloseRatio,
    sellCloseMet
  };
}

export class OrderBookDeltaEngine {
  private readonly now: RollingWindowClock;
  private readonly imbalanceRatio: number;
  private readonly closeRatio: number;
  private readonly minQuantityBtc: number;
  private readonly recentEventLimit: number;
  private latestOrderBook: OrderBook | null = null;
  private lastConditions: OrderBookConditions | null = null;
  private currentBuy: ActiveOrderBookTrade | null = null;
  private currentSell: ActiveOrderBookTrade | null = null;
  private readonly rolling30m: RollingTotalsState;
  private readonly rolling1h: RollingTotalsState;
  private readonly rolling4h: RollingTotalsState;
  private recentEvents: ClosedOrderBookTrade[] = [];

  constructor(options: OrderBookDeltaEngineOptions = {}) {
    this.now = options.now ?? Date.now;
    this.imbalanceRatio =
      options.imbalanceRatio ?? tradingConfig.orderBookDelta.imbalanceRatio;
    this.closeRatio = options.closeRatio ?? tradingConfig.orderBookDelta.closeRatio;
    this.minQuantityBtc =
      options.minQuantityBtc ?? tradingConfig.orderBookDelta.minQuantityBtc;
    this.recentEventLimit = options.recentEventLimit ?? 10;
    this.rolling30m = createRollingTotalsState(tradingConfig.windows.rolling30mSeconds, this.now);
    this.rolling1h = createRollingTotalsState(tradingConfig.windows.rolling1hSeconds, this.now);
    this.rolling4h = createRollingTotalsState(tradingConfig.windows.rolling4hSeconds, this.now);
  }

  updateOrderBook(orderBook: OrderBook, timestamp: number = this.now()): OrderBookDeltaUpdate {
    this.latestOrderBook = cloneOrderBook(orderBook);
    const signalEvents: OrderBookDeltaSignalEvent[] = [];

    if (orderBook.bids.length < 3 || orderBook.asks.length < 3) {
      return {
        snapshot: this.getSnapshot(timestamp),
        signalEvents
      };
    }

    const conditions = calculateOrderBookConditions(orderBook, {
      imbalanceRatio: this.imbalanceRatio,
      closeRatio: this.closeRatio,
      minQuantityBtc: this.minQuantityBtc
    });

    this.lastConditions = cloneConditions(conditions);

    if (this.currentBuy === null) {
      if (conditions.buyOpenMet) {
        this.currentBuy = {
          signalType: 'BUY',
          entryPrice: conditions.firstAskPrice,
          entryTime: timestamp
        };

        signalEvents.push({
          signalType: 'BUY',
          action: 'open',
          conditions: cloneConditions(conditions),
          entryPrice: conditions.firstAskPrice,
          entryTime: timestamp
        });
      }
    } else if (conditions.buyCloseMet) {
      const closedTrade = this.closeTrade(this.currentBuy, conditions.firstBidPrice, timestamp);
      this.recordClosedTrade(this.rolling30m, closedTrade, timestamp, 1);
      this.recordClosedTrade(this.rolling1h, closedTrade, timestamp, 1);
      this.recordClosedTrade(this.rolling4h, closedTrade, timestamp, 1);
      this.pushRecentEvent(closedTrade);

      signalEvents.push({
        signalType: 'BUY',
        action: 'close',
        conditions: cloneConditions(conditions),
        entryPrice: closedTrade.entryPrice,
        entryTime: closedTrade.entryTime,
        exitPrice: closedTrade.exitPrice,
        exitTime: closedTrade.exitTime,
        durationSeconds: closedTrade.durationSeconds,
        priceDiff: closedTrade.priceDiff,
        runningTotals: buildRunningTotals(this.rolling1h, timestamp)
      });

      this.currentBuy = null;
    }

    if (this.currentSell === null) {
      if (conditions.sellOpenMet) {
        this.currentSell = {
          signalType: 'SELL',
          entryPrice: conditions.firstBidPrice,
          entryTime: timestamp
        };

        signalEvents.push({
          signalType: 'SELL',
          action: 'open',
          conditions: cloneConditions(conditions),
          entryPrice: conditions.firstBidPrice,
          entryTime: timestamp
        });
      }
    } else if (conditions.sellCloseMet) {
      const closedTrade = this.closeTrade(this.currentSell, conditions.firstAskPrice, timestamp);
      this.recordClosedTrade(this.rolling30m, closedTrade, timestamp, -1);
      this.recordClosedTrade(this.rolling1h, closedTrade, timestamp, -1);
      this.recordClosedTrade(this.rolling4h, closedTrade, timestamp, -1);
      this.pushRecentEvent(closedTrade);

      signalEvents.push({
        signalType: 'SELL',
        action: 'close',
        conditions: cloneConditions(conditions),
        entryPrice: closedTrade.entryPrice,
        entryTime: closedTrade.entryTime,
        exitPrice: closedTrade.exitPrice,
        exitTime: closedTrade.exitTime,
        durationSeconds: closedTrade.durationSeconds,
        priceDiff: closedTrade.priceDiff,
        runningTotals: buildRunningTotals(this.rolling1h, timestamp)
      });

      this.currentSell = null;
    }

    return {
      snapshot: this.getSnapshot(timestamp),
      signalEvents
    };
  }

  getSnapshot(currentTime: number = this.now()): OrderBookDeltaSnapshot {
    const rolling30m = buildRunningTotals(this.rolling30m, currentTime);
    const rolling1h = buildRunningTotals(this.rolling1h, currentTime);
    const rolling4h = buildRunningTotals(this.rolling4h, currentTime);

    return {
      latestOrderBook: this.latestOrderBook ? cloneOrderBook(this.latestOrderBook) : null,
      lastConditions: this.lastConditions ? cloneConditions(this.lastConditions) : null,
      activeBuy: this.currentBuy ? cloneActiveTrade(this.currentBuy) : null,
      activeSell: this.currentSell ? cloneActiveTrade(this.currentSell) : null,
      recentEvents: this.recentEvents.map(cloneClosedTrade),
      rolling30m,
      rolling1h,
      rolling4h,
      currentDelta: rolling1h.delta,
      currentDeltaStats: buildDeltaStats(rolling1h),
      runningTotals: rolling1h
    };
  }

  private closeTrade(
    trade: ActiveOrderBookTrade,
    exitPrice: number,
    exitTime: number
  ): ClosedOrderBookTrade {
    const durationSeconds = (exitTime - trade.entryTime) / 1000;

    return {
      ...trade,
      exitPrice,
      exitTime,
      durationSeconds,
      priceDiff: calculatePriceDiff(trade.signalType, trade.entryPrice, exitPrice)
    };
  }

  private recordClosedTrade(
    totals: RollingTotalsState,
    trade: ClosedOrderBookTrade,
    timestamp: number,
    deltaMultiplier: 1 | -1
  ): void {
    if (trade.signalType === 'BUY') {
      totals.buy.addEvent(trade.priceDiff, timestamp);
      totals.buyDuration.addEvent(trade.durationSeconds, timestamp);
    } else {
      totals.sell.addEvent(trade.priceDiff, timestamp);
      totals.sellDuration.addEvent(trade.durationSeconds, timestamp);
    }

    totals.delta.addEvent(deltaMultiplier * trade.priceDiff, timestamp);
  }

  private pushRecentEvent(trade: ClosedOrderBookTrade): void {
    this.recentEvents = [...this.recentEvents, cloneClosedTrade(trade)].slice(
      -this.recentEventLimit
    );
  }
}
