import { expect, test, type Page } from '@playwright/test';

import type {
  AppBootstrapMessage,
  AppEvent,
  AppEventMessage,
  AppServerMessage,
  Candle
} from '@btc-tui/core/models';

declare global {
  interface Window {
    __mockWs: {
      close: (index?: number, code?: number, reason?: string) => void;
      count: () => number;
      emit: (payload: AppServerMessage, index?: number) => void;
      latestIndex: () => number;
      readyState: (index?: number) => number | null;
    };
  }
}

function createCandles(options: {
  startTimestamp: number;
  count: number;
  intervalMs: number;
  baseClose: number;
  step: number;
  spread: number;
}): Candle[] {
  return Array.from({ length: options.count }, (_, index) => {
    const close = options.baseClose + options.step * index;

    return {
      timestamp: options.startTimestamp + options.intervalMs * index,
      open: close - 6,
      high: close + options.spread / 2,
      low: close - options.spread / 2,
      close,
      volume: 1.25 + index * 0.35,
      isClosed: true
    };
  });
}

function getLast<T>(items: T[]): T {
  const value = items.at(-1);

  if (value === undefined) {
    throw new Error('expected at least one item');
  }

  return value;
}

function createEventMessage<TEvent extends AppEvent>(event: TEvent): AppEventMessage {
  return {
    type: 'app.event',
    payload: {
      event
    }
  };
}

const bootstrap1m = createCandles({
  startTimestamp: Date.parse('2026-03-14T10:00:00.000Z'),
  count: 8,
  intervalMs: 60_000,
  baseClose: 70_100,
  step: 3,
  spread: 22
});

const bootstrap5m = createCandles({
  startTimestamp: Date.parse('2026-03-14T08:20:00.000Z'),
  count: 24,
  intervalMs: 300_000,
  baseClose: 69_880,
  step: 12,
  spread: 68
});

const bootstrapMessage: AppBootstrapMessage = {
  type: 'app.bootstrap',
  payload: {
    symbol: 'BTCUSDT',
    sequence: 40,
    lastEventAt: '2026-03-14T10:40:00.000Z',
    bootstrap: {
      '1m': bootstrap1m,
      '5m': bootstrap5m
    },
    latestCandles: {
      '1m': getLast(bootstrap1m),
      '5m': getLast(bootstrap5m)
    },
    latestOrderBook: {
      bids: [
        { price: 70_183, quantity: 4.2 },
        { price: 70_182, quantity: 3.1 }
      ],
      asks: [
        { price: 70_184, quantity: 1.8 },
        { price: 70_185, quantity: 2.6 }
      ],
      lastUpdateId: 91
    },
    latestTrade: {
      tradeId: 991,
      price: 70_225,
      quantity: 0.45,
      timestamp: Date.parse('2026-03-14T10:39:58.000Z'),
      isBuyerMaker: false
    },
    systemStatus: {
      status: 'healthy',
      reconnectCount: 0
    }
  }
};

const deltaEvent = createEventMessage({
  version: 'v1',
  type: 'analytics.delta',
  sequence: 41,
  emittedAt: '2026-03-14T10:40:00.000Z',
  source: 'server',
  symbol: 'BTCUSDT',
  payload: {
    stats: {
      delta: 480,
      deltaPct: 72,
      durationDelta: 190,
      durationDeltaPct: 61,
      pnlTotal1h: 1_860,
      outsideBb: 'above'
    },
    runningTotals: {
      buyTotal: 2_140,
      buyCount: 8,
      buyDuration: 410,
      sellTotal: 1_660,
      sellCount: 6,
      sellDuration: 220,
      combinedTotal: 3_800,
      delta: 480,
      deltaPct: 72,
      totalDuration: 630,
      durationDelta: 190,
      durationDeltaPct: 61
    }
  }
});

const cvdEvent = createEventMessage({
  version: 'v1',
  type: 'analytics.cvd',
  sequence: 42,
  emittedAt: '2026-03-14T10:40:00.000Z',
  source: 'server',
  symbol: 'BTCUSDT',
  payload: {
    stats: {
      cvd1m: 4.8,
      cvd5m: 12.4,
      cvd1h: 18.1,
      buyVolume1m: 6.8,
      sellVolume1m: 2,
      buyVolume5m: 17.2,
      sellVolume5m: 8.1,
      buyPct5m: 68,
      side1m: 'buy',
      side5m: 'buy',
      side1h: 'buy',
      tradeCount1m: 14,
      tradeRate: 1.9
    }
  }
});

const indicatorEvent = createEventMessage({
  version: 'v1',
  type: 'analytics.indicator',
  sequence: 43,
  emittedAt: '2026-03-14T10:40:00.000Z',
  source: 'server',
  symbol: 'BTCUSDT',
  payload: {
    timeframe: '5m',
    snapshot: {
      emaPosition: 'above',
      priceBb: 'above',
      deltaBb: 'above',
      divergence: 'bullish',
      atr: 122.4,
      atrSma: 109.8,
      atrBelowSma: false
    }
  }
});

const pointOpenEvent = createEventMessage({
  version: 'v1',
  type: 'signal.point',
  sequence: 44,
  emittedAt: '2026-03-14T10:40:00.000Z',
  source: 'server',
  symbol: 'BTCUSDT',
  payload: {
    direction: 'LONG',
    action: 'open',
    points: 5,
    breakdown: {
      ema: 1,
      priceDelta: 1,
      timeDelta: 1,
      cvd: 1,
      deltaBb: 1,
      priceBb: 0,
      divergence: 0,
      divergenceCandles: 0
    },
    indicators: {
      emaPosition: 'above',
      priceDelta: 480,
      timeDelta: 190,
      cvdBuyPct: 68,
      deltaBb: 'above',
      priceBb: 'above',
      divergence: 'bullish',
      currentPrice: 70_225,
      pnlTotal1h: 1_860,
      pnlConditionMet: true,
      atrValue: 122.4,
      atrSmaValue: 109.8,
      atrAboveMin: true,
      atrAboveSma: true,
      atrConditionMet: true,
      atrBelowSma: false
    }
  }
});

const pointCloseEvent = createEventMessage({
  version: 'v1',
  type: 'signal.point',
  sequence: 45,
  emittedAt: '2026-03-14T10:45:00.000Z',
  source: 'server',
  symbol: 'BTCUSDT',
  payload: {
    direction: 'LONG',
    action: 'close',
    points: 2,
    breakdown: {
      ema: 1,
      priceDelta: 0,
      timeDelta: 0,
      cvd: 1,
      deltaBb: 0,
      priceBb: 0,
      divergence: 0,
      divergenceCandles: 0
    },
    indicators: {
      emaPosition: 'above',
      priceDelta: 120,
      timeDelta: 45,
      cvdBuyPct: 57,
      deltaBb: null,
      priceBb: null,
      divergence: null,
      currentPrice: 70_240,
      pnlTotal1h: 1_420,
      pnlConditionMet: true,
      atrValue: 108.2,
      atrSmaValue: 110.3,
      atrAboveMin: true,
      atrAboveSma: false,
      atrConditionMet: false,
      atrBelowSma: true,
      closeReason: 'points <= threshold'
    }
  }
});

const reconnectBootstrap: AppBootstrapMessage = {
  ...bootstrapMessage,
  payload: {
    ...bootstrapMessage.payload,
    sequence: 84,
    lastEventAt: '2026-03-14T10:50:00.000Z',
    latestTrade: {
      tradeId: 1_004,
      price: 71_000,
      quantity: 0.32,
      timestamp: Date.parse('2026-03-14T10:49:59.000Z'),
      isBuyerMaker: true
    },
    systemStatus: {
      status: 'healthy',
      reconnectCount: 2
    }
  }
};

async function installMockWebSocket(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class MockWebSocket extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;

      readonly url: string;
      readyState = MockWebSocket.CONNECTING;
      private readonly sent: string[] = [];

      constructor(url: string | URL) {
        super();
        this.url = String(url);
        const browserWindow = window as Window &
          typeof globalThis & {
            __mockWsState: {
              instances: MockWebSocket[];
              autoOpen: boolean;
              openDelayMs: number;
            };
          };

        browserWindow.__mockWsState.instances.push(this);

        if (browserWindow.__mockWsState.autoOpen) {
          window.setTimeout(() => {
            this.open();
          }, browserWindow.__mockWsState.openDelayMs);
        }
      }

      send(data: string): void {
        this.sent.push(data);
      }

      close(code = 1000, reason = 'mock close'): void {
        if (this.readyState === MockWebSocket.CLOSED) {
          return;
        }

        this.readyState = MockWebSocket.CLOSED;
        this.dispatchEvent(
          new CloseEvent('close', {
            code,
            reason,
            wasClean: code === 1000
          })
        );
      }

      open(): void {
        if (this.readyState !== MockWebSocket.CONNECTING) {
          return;
        }

        this.readyState = MockWebSocket.OPEN;
        this.dispatchEvent(new Event('open'));
      }

      emit(payload: unknown): void {
        this.dispatchEvent(
          new MessageEvent('message', {
            data: JSON.stringify(payload)
          })
        );
      }
    }

    const browserWindow = window as Window &
      typeof globalThis & {
        __mockWs: Window['__mockWs'];
        __mockWsState: {
          instances: MockWebSocket[];
          autoOpen: boolean;
          openDelayMs: number;
        };
      };

    Object.defineProperty(window, '__mockWsState', {
      configurable: true,
      value: {
        instances: [] as MockWebSocket[],
        autoOpen: true,
        openDelayMs: 0
      }
    });

    browserWindow.__mockWs = {
      close(index = 0, code = 1006, reason = 'mock disconnect') {
        browserWindow.__mockWsState.instances[index]?.close(code, reason);
      },
      count() {
        return browserWindow.__mockWsState.instances.length;
      },
      emit(payload, index = 0) {
        browserWindow.__mockWsState.instances[index]?.emit(payload);
      },
      latestIndex() {
        return browserWindow.__mockWsState.instances.length - 1;
      },
      readyState(index) {
        const resolvedIndex =
          index === undefined
            ? browserWindow.__mockWsState.instances.length - 1
            : index;

        return browserWindow.__mockWsState.instances[resolvedIndex]?.readyState ?? null;
      }
    };

    Object.defineProperty(window, 'WebSocket', {
      configurable: true,
      writable: true,
      value: MockWebSocket
    });
  });
}

async function waitForActiveSocket(page: Page, minimumCount = 1): Promise<number> {
  await expect
    .poll(async () =>
      page.evaluate((nextMinimumCount) => {
        const count = window.__mockWs.count();
        const latestIndex = window.__mockWs.latestIndex();
        const readyState = window.__mockWs.readyState();

        return count >= nextMinimumCount && latestIndex >= 0 && readyState === 1;
      }, minimumCount)
    )
    .toBe(true);

  return page.evaluate(() => window.__mockWs.latestIndex());
}

async function emitServerMessage(
  page: Page,
  message: AppServerMessage,
  socketIndex?: number
): Promise<void> {
  await page.evaluate(
    ({ nextMessage, nextSocketIndex }) => {
      const resolvedSocketIndex =
        nextSocketIndex === undefined ? window.__mockWs.latestIndex() : nextSocketIndex;

      window.__mockWs.emit(nextMessage, resolvedSocketIndex);
    },
    {
      nextMessage: message,
      nextSocketIndex: socketIndex
    }
  );
}

async function closeSocket(page: Page, socketIndex?: number): Promise<void> {
  await page.evaluate((nextSocketIndex) => {
    const resolvedSocketIndex =
      nextSocketIndex === undefined ? window.__mockWs.latestIndex() : nextSocketIndex;

    window.__mockWs.close(resolvedSocketIndex);
  }, socketIndex);
}

async function seedDashboard(page: Page, options?: { includePointSignals?: boolean }): Promise<void> {
  await emitServerMessage(page, bootstrapMessage);
  await emitServerMessage(page, deltaEvent);
  await emitServerMessage(page, cvdEvent);
  await emitServerMessage(page, indicatorEvent);

  if (options?.includePointSignals) {
    await emitServerMessage(page, pointOpenEvent);
    await emitServerMessage(page, pointCloseEvent);
  }
}

test.beforeEach(async ({ page }) => {
  await installMockWebSocket(page);
});

test('hydrates the dashboard from bootstrap and analytics events', async ({ page }) => {
  await page.goto('/');
  await waitForActiveSocket(page);
  await seedDashboard(page);

  const chartWidget = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Chart Surface' })
  });
  const transportWidget = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Transport State' })
  });

  await expect(page.getByRole('heading', { name: 'Live Operator Desk' })).toBeVisible();
  await expect(transportWidget.getByText(/^open$/)).toBeVisible();
  await expect(transportWidget.getByText(/^healthy$/)).toBeVisible();
  await expect(page.getByText('$70,225.00', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/^32$/)).toBeVisible();
  await expect(page.getByText(/^43$/)).toBeVisible();
  await expect(chartWidget.getByText('ema.above')).toBeVisible();
  await expect(chartWidget.getByText('price_bb.above')).toBeVisible();
  await expect(chartWidget.getByText('div.bullish')).toBeVisible();
  await expect(page.getByText('awaiting bootstrap candles')).toHaveCount(0);
  await expect(page.getByText('AWAITING 5M CANDLES')).toHaveCount(0);
});

test('renders historical preload in both candle tapes and the chart surface', async ({ page }) => {
  await page.goto('/');
  await waitForActiveSocket(page);
  await seedDashboard(page);

  const tape1m = page.locator('section').filter({
    has: page.getByRole('heading', { name: '1M Candle Tape' })
  });
  const tape5m = page.locator('section').filter({
    has: page.getByRole('heading', { name: '5M Candle Tape' })
  });

  await expect(tape1m.getByText('latest $70,121.00')).toBeVisible();
  await expect(tape5m.getByText('latest $70,156.00')).toBeVisible();
  await expect(tape1m.getByText('$70,121.00', { exact: true })).toBeVisible();
  await expect(tape5m.getByText('$70,156.00', { exact: true })).toBeVisible();
  await expect(tape5m.getByText('delta +480').first()).toBeVisible();
  await expect(tape5m.getByText('cvd 68%').first()).toBeVisible();
  await expect(tape5m.getByText('ema above').first()).toBeVisible();
  await expect(page.getByRole('img', { name: '5 minute price pane' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'RSI pane' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'ATR / ATR SMA pane' })).toBeVisible();
});

test('renders recent point-signal open and close events with gate context', async ({ page }) => {
  await page.goto('/');
  await waitForActiveSocket(page);
  await seedDashboard(page, {
    includePointSignals: true
  });

  const pointSignalsWidget = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Point Signals' })
  });

  await expect(pointSignalsWidget.getByText('no point-signal events yet')).toHaveCount(0);
  await expect(pointSignalsWidget.getByText(/^LONG$/)).toHaveCount(2);
  await expect(pointSignalsWidget.getByText(/^open$/)).toBeVisible();
  await expect(pointSignalsWidget.getByText(/^close$/)).toBeVisible();
  await expect(pointSignalsWidget.getByText('points 5')).toBeVisible();
  await expect(pointSignalsWidget.getByText('points 2')).toBeVisible();
  await expect(pointSignalsWidget.getByText('ema above • cvd 68%')).toBeVisible();
  await expect(pointSignalsWidget.getByText('bb above / above')).toBeVisible();
  await expect(pointSignalsWidget.getByText('+1,860 > 1200')).toBeVisible();
  await expect(pointSignalsWidget.getByText('+122.4 / min 100')).toBeVisible();
});

test('reconnects the client and accepts a fresh bootstrap after socket loss', async ({ page }) => {
  await page.goto('/');
  const initialSocketIndex = await waitForActiveSocket(page);
  const initialSocketCount = await page.evaluate(() => window.__mockWs.count());
  await seedDashboard(page);

  const transportWidget = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Transport State' })
  });

  await closeSocket(page, initialSocketIndex);
  await expect(transportWidget.getByText(/^reconnecting$/)).toBeVisible();
  const nextSocketIndex = await waitForActiveSocket(page, initialSocketCount + 1);

  await emitServerMessage(page, reconnectBootstrap, nextSocketIndex);

  await expect(transportWidget.getByText(/^open$/)).toBeVisible();
  await expect(page.getByText('$71,000.00', { exact: true }).first()).toBeVisible();
  await expect(transportWidget.getByText(/^2$/)).toBeVisible();
  await expect(page.getByText(/^84$/)).toBeVisible();
});
