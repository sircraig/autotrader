import type { CvdSide } from '../models';
import type { AggTrade } from '../models';

export type RollingWindowSelector<T> = (value: T) => number;
export type RollingWindowClock = () => number;

interface RollingWindowEntry<T> {
  timestamp: number;
  value: T;
}

export interface RollingTradeData {
  volume: number;
  quantity: number;
  isBuy: boolean;
}

export class RollingWindow<T> {
  private readonly entries: RollingWindowEntry<T>[] = [];
  private readonly windowMs: number;
  private readonly now: RollingWindowClock;

  constructor(windowSeconds: number, now: RollingWindowClock = Date.now) {
    this.windowMs = windowSeconds * 1000;
    this.now = now;
  }

  add(value: T, timestamp: number = this.now()): void {
    this.entries.push({ timestamp, value });
    this.prune(timestamp);
  }

  values(currentTime: number = this.now()): T[] {
    return this.getEntries(currentTime).map((entry) => entry.value);
  }

  count(currentTime: number = this.now()): number {
    return this.getEntries(currentTime).length;
  }

  sum(
    selector?: RollingWindowSelector<T>,
    currentTime: number = this.now()
  ): number {
    return this.getEntries(currentTime).reduce((total, entry) => {
      const value = selector ? selector(entry.value) : (entry.value as number);
      return total + value;
    }, 0);
  }

  protected getEntries(currentTime: number = this.now()): readonly RollingWindowEntry<T>[] {
    this.prune(currentTime);
    return this.entries;
  }

  private prune(currentTime: number): void {
    const cutoff = currentTime - this.windowMs;
    let pruneCount = 0;

    while (pruneCount < this.entries.length && this.entries[pruneCount]!.timestamp < cutoff) {
      pruneCount += 1;
    }

    if (pruneCount > 0) {
      this.entries.splice(0, pruneCount);
    }
  }
}

export class RollingAccumulator extends RollingWindow<number> {
  addEvent(value: number, timestamp?: number): void {
    this.add(value, timestamp);
  }

  getTotal(currentTime?: number): number {
    return this.sum(undefined, currentTime);
  }

  get total(): number {
    return this.getTotal();
  }
}

export class RollingCvdWindow extends RollingWindow<RollingTradeData> {
  addTrade(trade: AggTrade, timestamp?: number): void {
    const isBuy = !trade.isBuyerMaker;
    this.add(
      {
        volume: isBuy ? trade.quantity : -trade.quantity,
        quantity: trade.quantity,
        isBuy
      },
      timestamp
    );
  }

  getCvd(currentTime?: number): number {
    return this.sum((trade) => trade.volume, currentTime);
  }

  getBuyVolume(currentTime?: number): number {
    return this.sum((trade) => (trade.isBuy ? trade.quantity : 0), currentTime);
  }

  getSellVolume(currentTime?: number): number {
    return this.sum((trade) => (trade.isBuy ? 0 : trade.quantity), currentTime);
  }

  getTradeCount(currentTime?: number): number {
    return this.count(currentTime);
  }

  getBuyCount(currentTime?: number): number {
    return this.values(currentTime).filter((trade) => trade.isBuy).length;
  }

  getSellCount(currentTime?: number): number {
    return this.values(currentTime).filter((trade) => !trade.isBuy).length;
  }

  getBuyPercentage(currentTime?: number): number {
    const buyVolume = this.getBuyVolume(currentTime);
    const sellVolume = this.getSellVolume(currentTime);
    const totalVolume = buyVolume + sellVolume;

    if (totalVolume === 0) {
      return 50;
    }

    return Math.trunc((buyVolume / totalVolume) * 100);
  }

  getDominantSide(currentTime?: number): CvdSide {
    const buyVolume = this.getBuyVolume(currentTime);
    const sellVolume = this.getSellVolume(currentTime);

    if (buyVolume > sellVolume) {
      return 'buy';
    }

    if (sellVolume > buyVolume) {
      return 'sell';
    }

    return 'neutral';
  }

  get cvd(): number {
    return this.getCvd();
  }

  get buyVolume(): number {
    return this.getBuyVolume();
  }

  get sellVolume(): number {
    return this.getSellVolume();
  }

  get tradeCount(): number {
    return this.getTradeCount();
  }

  get buyCount(): number {
    return this.getBuyCount();
  }

  get sellCount(): number {
    return this.getSellCount();
  }
}
