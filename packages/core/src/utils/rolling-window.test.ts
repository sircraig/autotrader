import { expect, test } from 'bun:test';

import type { AggTrade } from '../models';

import { RollingAccumulator, RollingCvdWindow, RollingWindow } from './rolling-window';

function createClock(startAt: number = 0) {
  let currentTime = startAt;

  return {
    now: () => currentTime,
    set: (value: number) => {
      currentTime = value;
    }
  };
}

function createTrade(overrides: Partial<AggTrade> = {}): AggTrade {
  return {
    tradeId: 1,
    price: 64000,
    quantity: 0.25,
    timestamp: 0,
    isBuyerMaker: false,
    ...overrides
  };
}

test('RollingWindow prunes only entries strictly older than the cutoff', () => {
  const clock = createClock();
  const window = new RollingWindow<number>(10, clock.now);

  window.add(1, 0);
  window.add(2, 5_000);
  window.add(3, 10_000);

  expect(window.values(10_000)).toEqual([1, 2, 3]);
  expect(window.count(10_000)).toBe(3);

  expect(window.values(10_001)).toEqual([2, 3]);
  expect(window.count(10_001)).toBe(2);
});

test('RollingWindow sums numeric values and selector-derived totals deterministically', () => {
  const clock = createClock();
  const numericWindow = new RollingWindow<number>(5, clock.now);

  numericWindow.add(2, 0);
  numericWindow.add(3, 2_000);
  numericWindow.add(5, 4_000);

  expect(numericWindow.sum(undefined, 4_000)).toBe(10);
  expect(numericWindow.sum(undefined, 5_001)).toBe(8);

  const objectWindow = new RollingWindow<{ value: number }>(5, clock.now);
  objectWindow.add({ value: 1.5 }, 0);
  objectWindow.add({ value: 2.5 }, 2_000);

  expect(objectWindow.sum((entry) => entry.value, 2_000)).toBe(4);
});

test('RollingAccumulator tracks totals across window boundaries', () => {
  const clock = createClock();
  const accumulator = new RollingAccumulator(60, clock.now);

  accumulator.addEvent(100, 0);
  accumulator.addEvent(-40, 30_000);
  accumulator.addEvent(25, 60_000);

  expect(accumulator.getTotal(60_000)).toBe(85);
  expect(accumulator.count(60_000)).toBe(3);

  expect(accumulator.getTotal(60_001)).toBe(-15);
  expect(accumulator.count(60_001)).toBe(2);
});

test('RollingCvdWindow derives signed volume, counts, and dominant side from agg trades', () => {
  const clock = createClock();
  const cvdWindow = new RollingCvdWindow(60, clock.now);

  cvdWindow.addTrade(createTrade({ tradeId: 1, quantity: 0.75, isBuyerMaker: false }), 0);
  cvdWindow.addTrade(createTrade({ tradeId: 2, quantity: 0.25, isBuyerMaker: true }), 10_000);
  cvdWindow.addTrade(createTrade({ tradeId: 3, quantity: 0.5, isBuyerMaker: false }), 20_000);

  expect(cvdWindow.getCvd(20_000)).toBe(1);
  expect(cvdWindow.getBuyVolume(20_000)).toBe(1.25);
  expect(cvdWindow.getSellVolume(20_000)).toBe(0.25);
  expect(cvdWindow.getTradeCount(20_000)).toBe(3);
  expect(cvdWindow.getBuyCount(20_000)).toBe(2);
  expect(cvdWindow.getSellCount(20_000)).toBe(1);
  expect(cvdWindow.getBuyPercentage(20_000)).toBe(83);
  expect(cvdWindow.getDominantSide(20_000)).toBe('buy');
});

test('RollingCvdWindow falls back to neutral side and 50 percent when the window is empty', () => {
  const clock = createClock(70_001);
  const cvdWindow = new RollingCvdWindow(60, clock.now);

  cvdWindow.addTrade(createTrade({ quantity: 1, isBuyerMaker: false }), 0);

  expect(cvdWindow.getTradeCount()).toBe(0);
  expect(cvdWindow.getCvd()).toBe(0);
  expect(cvdWindow.getBuyPercentage()).toBe(50);
  expect(cvdWindow.getDominantSide()).toBe('neutral');
});
