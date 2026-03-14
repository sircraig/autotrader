import type { AppServerMessage } from '@btc-tui/core/models';

import {
  createPingMessage,
  type ConnectionStatus,
  type DashboardConnectionState
} from '../store/app-store';

const DEFAULT_PING_INTERVAL_MS = 15_000;
const DEFAULT_INITIAL_RECONNECT_DELAY_MS = 1_000;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 15_000;
const DEFAULT_SERVER_PORT = '3001';

interface ServerLocationLike {
  protocol: string;
  hostname: string;
}

interface AppEnvLike {
  VITE_SERVER_HTTP_URL?: string;
  VITE_SERVER_WS_URL?: string;
  VITE_SERVER_PORT?: string;
}

type ConnectionUpdate = Partial<DashboardConnectionState> & Pick<DashboardConnectionState, 'status'>;

export interface AppWsClientOptions {
  url: string;
  onMessage: (message: AppServerMessage) => void;
  onConnectionStateChange?: (update: ConnectionUpdate) => void;
  pingIntervalMs?: number;
  initialReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
}

function isAppServerMessage(payload: unknown): payload is AppServerMessage {
  return typeof payload === 'object' && payload !== null && 'type' in payload;
}

function resolveServerPort(env: AppEnvLike): string {
  return env.VITE_SERVER_PORT?.trim() || DEFAULT_SERVER_PORT;
}

export function createServerHttpUrl(
  location: ServerLocationLike = window.location,
  env: AppEnvLike = import.meta.env as AppEnvLike
): string {
  if (env.VITE_SERVER_HTTP_URL) {
    return env.VITE_SERVER_HTTP_URL;
  }

  return `${location.protocol}//${location.hostname}:${resolveServerPort(env)}`;
}

export function createServerWsUrl(
  location: ServerLocationLike = window.location,
  env: AppEnvLike = import.meta.env as AppEnvLike
): string {
  if (env.VITE_SERVER_WS_URL) {
    return env.VITE_SERVER_WS_URL;
  }

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.hostname}:${resolveServerPort(env)}/ws`;
}

export class AppWsClient {
  private readonly url: string;
  private readonly onMessage: (message: AppServerMessage) => void;
  private readonly onConnectionStateChange: ((update: ConnectionUpdate) => void) | undefined;
  private readonly pingIntervalMs: number;
  private readonly initialReconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private reconnectAttempt = 0;
  private closedManually = false;

  constructor(options: AppWsClientOptions) {
    this.url = options.url;
    this.onMessage = options.onMessage;
    this.onConnectionStateChange = options.onConnectionStateChange;
    this.pingIntervalMs = options.pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS;
    this.initialReconnectDelayMs =
      options.initialReconnectDelayMs ?? DEFAULT_INITIAL_RECONNECT_DELAY_MS;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS;
  }

  connect(): void {
    this.closedManually = false;
    this.clearReconnectTimer();

    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const nextStatus: ConnectionStatus = this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting';
    this.emitConnectionState({
      status: nextStatus,
      reconnectAttempt: this.reconnectAttempt,
      error: null
    });

    this.socket = new WebSocket(this.url);

    this.socket.addEventListener('open', () => {
      this.reconnectAttempt = 0;
      this.emitConnectionState({
        status: 'open',
        reconnectAttempt: 0,
        lastConnectedAt: new Date().toISOString(),
        error: null
      });
      this.startPingLoop();
    });

    this.socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') {
        return;
      }

      try {
        const parsed = JSON.parse(event.data) as unknown;

        if (isAppServerMessage(parsed)) {
          this.onMessage(parsed);
        }
      } catch (error) {
        this.emitConnectionState({
          status: 'error',
          reconnectAttempt: this.reconnectAttempt,
          error: error instanceof Error ? error.message : 'Invalid server payload'
        });
      }
    });

    this.socket.addEventListener('error', () => {
      this.emitConnectionState({
        status: 'error',
        reconnectAttempt: this.reconnectAttempt,
        error: 'WebSocket transport error'
      });
    });

    this.socket.addEventListener('close', () => {
      this.socket = null;
      this.stopPingLoop();

      if (this.closedManually) {
        this.emitConnectionState({
          status: 'closed',
          reconnectAttempt: this.reconnectAttempt
        });
        return;
      }

      this.scheduleReconnect();
    });
  }

  close(): void {
    this.closedManually = true;
    this.clearReconnectTimer();
    this.stopPingLoop();

    if (this.socket) {
      this.socket.close(1000, 'client closed');
      this.socket = null;
    }

    this.emitConnectionState({
      status: 'closed',
      reconnectAttempt: this.reconnectAttempt
    });
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectAttempt += 1;
    const delay = Math.min(
      this.initialReconnectDelayMs * 2 ** Math.max(0, this.reconnectAttempt - 1),
      this.maxReconnectDelayMs
    );

    this.emitConnectionState({
      status: 'reconnecting',
      reconnectAttempt: this.reconnectAttempt,
      error: null
    });

    this.reconnectTimer = window.setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    this.pingTimer = window.setInterval(() => {
      if (this.socket?.readyState !== WebSocket.OPEN) {
        return;
      }

      this.socket.send(JSON.stringify(createPingMessage()));
    }, this.pingIntervalMs);
  }

  private stopPingLoop(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private emitConnectionState(update: ConnectionUpdate): void {
    this.onConnectionStateChange?.(update);
  }
}
