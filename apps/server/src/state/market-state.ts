import { tradingConfig } from '@btc-tui/core/config/trading';
import type {
  AggTrade,
  AppBootstrapState,
  AppEvent,
  Candle,
  OrderBook,
  SystemStatusPayload,
  Timeframe
} from '@btc-tui/core/models';

const MAX_CANDLES_PER_TIMEFRAME = Math.max(
  tradingConfig.indicators.maxCandles,
  tradingConfig.market.historicalPreload.candles1m,
  tradingConfig.market.historicalPreload.candles5m
);

export type MarketStateSnapshot = AppBootstrapState;

function cloneSystemStatus(payload: SystemStatusPayload): SystemStatusPayload {
  return {
    status: payload.status,
    ...(payload.reconnectCount === undefined ? {} : { reconnectCount: payload.reconnectCount }),
    ...(payload.staleStreams === undefined ? {} : { staleStreams: [...payload.staleStreams] })
  };
}

function cloneCandle(candle: Candle): Candle {
  return { ...candle };
}

function cloneOrderBook(orderBook: OrderBook): OrderBook {
  return {
    bids: orderBook.bids.map((level) => ({ ...level })),
    asks: orderBook.asks.map((level) => ({ ...level })),
    lastUpdateId: orderBook.lastUpdateId
  };
}

function cloneTrade(trade: AggTrade): AggTrade {
  return { ...trade };
}

function upsertCandle(candles: Candle[], nextCandle: Candle): Candle[] {
  const existingIndex = candles.findIndex((candle) => candle.timestamp === nextCandle.timestamp);

  if (existingIndex >= 0) {
    const updated = candles.slice();
    updated[existingIndex] = cloneCandle(nextCandle);
    return updated;
  }

  return [...candles, cloneCandle(nextCandle)].slice(-MAX_CANDLES_PER_TIMEFRAME);
}

export class MarketState {
  private readonly symbol: string;
  private sequence = 0;
  private lastEventAt: string | null = null;
  private bootstrap: Record<Timeframe, Candle[]> = {
    '1m': [],
    '5m': []
  };
  private latestCandles: Record<Timeframe, Candle | null> = {
    '1m': null,
    '5m': null
  };
  private latestOrderBook: OrderBook | null = null;
  private latestTrade: AggTrade | null = null;
  private systemStatus: SystemStatusPayload = {
    status: 'starting'
  };

  constructor(symbol: string) {
    this.symbol = symbol;
  }

  apply(event: AppEvent): void {
    this.sequence = event.sequence;
    this.lastEventAt = event.emittedAt;

    switch (event.type) {
      case 'bootstrap.history': {
        const candles = event.payload.candles.map(cloneCandle);
        this.bootstrap[event.payload.timeframe] = candles.slice(-MAX_CANDLES_PER_TIMEFRAME);
        this.latestCandles[event.payload.timeframe] = candles.at(-1) ?? null;
        break;
      }
      case 'market.candle': {
        const { timeframe, candle } = event.payload;
        this.bootstrap[timeframe] = upsertCandle(this.bootstrap[timeframe], candle);
        this.latestCandles[timeframe] = cloneCandle(candle);
        break;
      }
      case 'market.order_book': {
        this.latestOrderBook = cloneOrderBook(event.payload.orderBook);
        break;
      }
      case 'market.agg_trade': {
        this.latestTrade = cloneTrade(event.payload.trade);
        break;
      }
      case 'system.status': {
        this.systemStatus = cloneSystemStatus(event.payload);
        break;
      }
      default:
        break;
    }
  }

  getSnapshot(): MarketStateSnapshot {
    return {
      symbol: this.symbol,
      sequence: this.sequence,
      lastEventAt: this.lastEventAt,
      bootstrap: {
        '1m': this.bootstrap['1m'].map(cloneCandle),
        '5m': this.bootstrap['5m'].map(cloneCandle)
      },
      latestCandles: {
        '1m': this.latestCandles['1m'] ? cloneCandle(this.latestCandles['1m']) : null,
        '5m': this.latestCandles['5m'] ? cloneCandle(this.latestCandles['5m']) : null
      },
      latestOrderBook: this.latestOrderBook ? cloneOrderBook(this.latestOrderBook) : null,
      latestTrade: this.latestTrade ? cloneTrade(this.latestTrade) : null,
      systemStatus: cloneSystemStatus(this.systemStatus)
    };
  }
}
