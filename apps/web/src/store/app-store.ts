import { create } from 'zustand';

import { tradingConfig } from '@autotrader/core/config/trading';
import type { DeltaSeriesPoint } from '@autotrader/core';
import type {
  AggTrade,
  AppBootstrapState,
  AppClientMessage,
  AppEvent,
  AppServerMessage,
  Candle,
  CvdAnalyticsPayload,
  DeltaAnalyticsPayload,
  IndicatorAnalyticsPayload,
  OrderBook,
  OrderBookSignalPayload,
  PointSignalPayload,
  SystemStatusPayload,
} from '@autotrader/core/models';

const MAX_SIGNAL_HISTORY = 20;
const MAX_CANDLES_PER_TIMEFRAME = Math.max(
  tradingConfig.indicators.maxCandles,
  tradingConfig.market.historicalPreload.candles1m,
  tradingConfig.market.historicalPreload.candles5m
);

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error';

export interface DashboardConnectionState {
  status: ConnectionStatus;
  reconnectAttempt: number;
  lastConnectedAt: string | null;
  lastMessageAt: string | null;
  error: string | null;
}

export interface DashboardStateData extends AppBootstrapState {
  deltaAnalytics: DeltaAnalyticsPayload | null;
  deltaHistory: DeltaSeriesPoint[];
  cvdAnalytics: CvdAnalyticsPayload | null;
  indicatorAnalytics: IndicatorAnalyticsPayload | null;
  recentOrderBookSignals: OrderBookSignalPayload[];
  recentPointSignals: PointSignalPayload[];
  connection: DashboardConnectionState;
}

export interface DashboardStoreState extends DashboardStateData {
  applyServerMessage: (message: AppServerMessage) => void;
  applyEvent: (event: AppEvent) => void;
  setConnectionState: (update: Partial<DashboardConnectionState> & Pick<DashboardConnectionState, 'status'>) => void;
  reset: () => void;
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

function cloneSystemStatus(status: SystemStatusPayload): SystemStatusPayload {
  return {
    status: status.status,
    ...(status.reconnectCount === undefined ? {} : { reconnectCount: status.reconnectCount }),
    ...(status.staleStreams === undefined ? {} : { staleStreams: [...status.staleStreams] })
  };
}

function cloneBootstrapState(state: AppBootstrapState): AppBootstrapState {
  return {
    symbol: state.symbol,
    sequence: state.sequence,
    lastEventAt: state.lastEventAt,
    bootstrap: {
      '1m': state.bootstrap['1m'].map(cloneCandle),
      '5m': state.bootstrap['5m'].map(cloneCandle)
    },
    latestCandles: {
      '1m': state.latestCandles['1m'] ? cloneCandle(state.latestCandles['1m']) : null,
      '5m': state.latestCandles['5m'] ? cloneCandle(state.latestCandles['5m']) : null
    },
    latestOrderBook: state.latestOrderBook ? cloneOrderBook(state.latestOrderBook) : null,
    latestTrade: state.latestTrade ? cloneTrade(state.latestTrade) : null,
    systemStatus: cloneSystemStatus(state.systemStatus)
  };
}

function pushLimited<T>(items: T[], nextItem: T, limit: number): T[] {
  return [nextItem, ...items].slice(0, limit);
}

function pushSeriesPoint<T>(items: T[], nextItem: T, limit: number): T[] {
  return [...items, nextItem].slice(-limit);
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

function resolveSeriesTimestamp(
  emittedAt: string,
  previousTimestamp: number | null
): number {
  const parsed = Date.parse(emittedAt);

  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return previousTimestamp === null ? 0 : previousTimestamp + 1;
}

export function createInitialDashboardState(
  symbol: string = tradingConfig.market.defaultSymbol
): DashboardStateData {
  return {
    symbol,
    sequence: 0,
    lastEventAt: null,
    bootstrap: {
      '1m': [],
      '5m': []
    },
    latestCandles: {
      '1m': null,
      '5m': null
    },
    latestOrderBook: null,
    latestTrade: null,
    systemStatus: {
      status: 'starting'
    },
    deltaAnalytics: null,
    deltaHistory: [],
    cvdAnalytics: null,
    indicatorAnalytics: null,
    recentOrderBookSignals: [],
    recentPointSignals: [],
    connection: {
      status: 'idle',
      reconnectAttempt: 0,
      lastConnectedAt: null,
      lastMessageAt: null,
      error: null
    }
  };
}

export function applyAppEvent(state: DashboardStateData, event: AppEvent): DashboardStateData {
  const nextState: DashboardStateData = {
    ...state,
    sequence: event.sequence,
    lastEventAt: event.emittedAt
  };

  switch (event.type) {
    case 'bootstrap.history': {
      const candles = event.payload.candles.map(cloneCandle);
      nextState.bootstrap = {
        ...state.bootstrap,
        [event.payload.timeframe]: candles.slice(-MAX_CANDLES_PER_TIMEFRAME)
      };
      nextState.latestCandles = {
        ...state.latestCandles,
        [event.payload.timeframe]: candles.at(-1) ?? null
      };
      return nextState;
    }
    case 'market.candle': {
      const { timeframe, candle } = event.payload;
      nextState.bootstrap = {
        ...state.bootstrap,
        [timeframe]: upsertCandle(state.bootstrap[timeframe], candle)
      };
      nextState.latestCandles = {
        ...state.latestCandles,
        [timeframe]: cloneCandle(candle)
      };
      return nextState;
    }
    case 'market.order_book':
      nextState.latestOrderBook = cloneOrderBook(event.payload.orderBook);
      return nextState;
    case 'market.agg_trade':
      nextState.latestTrade = cloneTrade(event.payload.trade);
      return nextState;
    case 'analytics.delta':
      nextState.deltaAnalytics = event.payload;
      nextState.deltaHistory = pushSeriesPoint(
        state.deltaHistory,
        {
          timestamp: resolveSeriesTimestamp(
            event.emittedAt,
            state.deltaHistory.at(-1)?.timestamp ?? null
          ),
          value: event.payload.stats.delta
        },
        tradingConfig.indicators.maxCandles
      );
      return nextState;
    case 'analytics.cvd':
      nextState.cvdAnalytics = event.payload;
      return nextState;
    case 'analytics.indicator':
      nextState.indicatorAnalytics = event.payload;
      return nextState;
    case 'signal.order_book_delta':
      nextState.recentOrderBookSignals = pushLimited(
        state.recentOrderBookSignals,
        event.payload,
        MAX_SIGNAL_HISTORY
      );
      return nextState;
    case 'signal.point':
      nextState.recentPointSignals = pushLimited(
        state.recentPointSignals,
        event.payload,
        MAX_SIGNAL_HISTORY
      );
      return nextState;
    case 'system.status':
      nextState.systemStatus = cloneSystemStatus(event.payload);
      return nextState;
  }
}

export function applyServerMessage(
  state: DashboardStateData,
  message: AppServerMessage
): DashboardStateData {
  const receivedAt = new Date().toISOString();

  switch (message.type) {
    case 'app.bootstrap':
      return {
        ...createInitialDashboardState(message.payload.symbol),
        ...cloneBootstrapState(message.payload),
        connection: {
          ...state.connection,
          lastMessageAt: receivedAt,
          error: null
        }
      };
    case 'app.event':
      return {
        ...applyAppEvent(state, message.payload.event),
        connection: {
          ...state.connection,
          lastMessageAt: receivedAt,
          error: null
        }
      };
    case 'app.pong':
      return {
        ...state,
        connection: {
          ...state.connection,
          lastMessageAt: receivedAt,
          error: null
        }
      };
  }
}

export function createPingMessage(): AppClientMessage {
  return {
    type: 'app.ping'
  };
}

export const useAppStore = create<DashboardStoreState>((set) => ({
  ...createInitialDashboardState(),
  applyServerMessage: (message) => {
    set((state) => applyServerMessage(state, message));
  },
  applyEvent: (event) => {
    set((state) => applyAppEvent(state, event));
  },
  setConnectionState: (update) => {
    set((state) => ({
      connection: {
        ...state.connection,
        ...update
      }
    }));
  },
  reset: () => {
    set(createInitialDashboardState());
  }
}));
