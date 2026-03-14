import type { AppEvent, SystemStatusPayload } from './events';
import type { DeltaSeriesPoint } from '../indicators/chart-surface';
import type { AggTrade, Candle, OrderBook, Timeframe } from './market';

export interface AppBootstrapState {
  symbol: string;
  sequence: number;
  lastEventAt: string | null;
  bootstrap: Record<Timeframe, Candle[]>;
  deltaHistory: DeltaSeriesPoint[];
  latestCandles: Record<Timeframe, Candle | null>;
  latestOrderBook: OrderBook | null;
  latestTrade: AggTrade | null;
  systemStatus: SystemStatusPayload;
}

export interface AppBootstrapMessage {
  type: 'app.bootstrap';
  payload: AppBootstrapState;
}

export interface AppEventMessage {
  type: 'app.event';
  payload: {
    event: AppEvent;
  };
}

export interface AppPingMessage {
  type: 'app.ping';
}

export interface AppPongMessage {
  type: 'app.pong';
  payload: {
    emittedAt: string;
  };
}

export type AppServerMessage = AppBootstrapMessage | AppEventMessage | AppPongMessage;
export type AppClientMessage = AppPingMessage;
