export const tradingConfig = {
  market: {
    defaultSymbol: 'BTCUSDT',
    streamIntervals: ['1m', '5m'] as const,
    historicalPreload: {
      candles1m: 30,
      candles5m: 50,
      candlePanelHistory: 20
    }
  },
  orderBookDelta: {
    imbalanceRatio: 5.0,
    closeRatio: 2.0,
    minQuantityBtc: 0.5,
    openPersistenceUpdates: 2,
    cooldownMs: 5_000
  },
  tradeFlow: {
    largeTradeThresholdBtc: 0.5
  },
  pointSignals: {
    // These values are the real runtime thresholds from btc_tui/config.py.
    openThreshold: 4,
    closeThreshold: 2,
    minPnlTotal1h: 1200,
    minAtrValue: 100,
    divergencePersistenceCandles: 4
  },
  indicators: {
    maxCandles: 50,
    bollingerPeriod: 20,
    bollingerStdMultiplier: 2.0,
    rsiPeriod: 14,
    emaPeriod: 21,
    atrPeriod: 14,
    atrSmaPeriod: 10
  },
  windows: {
    rolling30mSeconds: 1800,
    rolling1hSeconds: 3600,
    rolling4hSeconds: 14400,
    cvd1mSeconds: 60,
    cvd5mSeconds: 300,
    cvd1hSeconds: 3600
  },
  divergence: {
    swingLookback: 2,
    minDistance: 3,
    maxDistance: 20,
    bullishPriceFactor: 0.9999,
    bullishRsiDelta: 1,
    bearishPriceFactor: 1.0001,
    bearishRsiDelta: 1
  }
} as const;

export type TradingConfig = typeof tradingConfig;
