import type {
  AppBootstrapMessage,
  AppClientMessage,
  AppEvent,
  AppEventMessage,
  AppPongMessage,
  AppServerMessage
} from '@btc-tui/core/models';

import type { MarketState } from '../state/market-state';

const DEFAULT_MAX_BUFFERED_AMOUNT_BYTES = 256 * 1024;

export interface AppWebSocketData {
  clientId: string;
  connectedAt: string;
}

type BrokerSocket = Pick<
  Bun.ServerWebSocket<AppWebSocketData>,
  'close' | 'data' | 'getBufferedAmount' | 'sendText'
>;

export interface AppWsBrokerOptions {
  maxBufferedAmountBytes?: number;
}

function createClientId(): string {
  return crypto.randomUUID();
}

function isAppPingMessage(message: unknown): message is AppClientMessage {
  return typeof message === 'object' && message !== null && 'type' in message && message.type === 'app.ping';
}

export class AppWsBroker {
  private readonly state: MarketState;
  private readonly maxBufferedAmountBytes: number;
  private readonly clients = new Set<BrokerSocket>();

  constructor(state: MarketState, options: AppWsBrokerOptions = {}) {
    this.state = state;
    this.maxBufferedAmountBytes =
      options.maxBufferedAmountBytes ?? DEFAULT_MAX_BUFFERED_AMOUNT_BYTES;
  }

  createClientData(): AppWebSocketData {
    return {
      clientId: createClientId(),
      connectedAt: new Date().toISOString()
    };
  }

  getClientCount(): number {
    return this.clients.size;
  }

  createBootstrapMessage(): AppBootstrapMessage {
    return {
      type: 'app.bootstrap',
      payload: this.state.getSnapshot()
    };
  }

  createEventMessage(event: AppEvent): AppEventMessage {
    return {
      type: 'app.event',
      payload: {
        event
      }
    };
  }

  createPongMessage(): AppPongMessage {
    return {
      type: 'app.pong',
      payload: {
        emittedAt: new Date().toISOString()
      }
    };
  }

  openConnection(ws: BrokerSocket): void {
    this.clients.add(ws);

    if (!this.sendMessage(ws, this.createBootstrapMessage())) {
      this.clients.delete(ws);
    }
  }

  closeConnection(ws: BrokerSocket): void {
    this.clients.delete(ws);
  }

  handleMessage(ws: BrokerSocket, message: string | Buffer<ArrayBuffer>): void {
    if (typeof message !== 'string') {
      ws.close(1003, 'text messages only');
      return;
    }

    if (message === 'ping') {
      this.sendMessage(ws, this.createPongMessage());
      return;
    }

    try {
      const parsed = JSON.parse(message) as unknown;

      if (isAppPingMessage(parsed)) {
        this.sendMessage(ws, this.createPongMessage());
        return;
      }
    } catch {
      // Fall through to protocol close for unexpected text payloads.
    }

    ws.close(1008, 'unsupported client message');
  }

  handleDrain(ws: BrokerSocket): void {
    if (ws.getBufferedAmount() > this.maxBufferedAmountBytes) {
      this.closeSlowClient(ws);
    }
  }

  broadcastEvent(event: AppEvent): void {
    const message = this.createEventMessage(event);

    for (const client of this.clients) {
      if (!this.sendMessage(client, message)) {
        this.clients.delete(client);
      }
    }
  }

  getWebSocketHandler(): Bun.WebSocketHandler<AppWebSocketData> {
    return {
      data: {} as AppWebSocketData,
      message: (ws, message) => {
        this.handleMessage(ws, message);
      },
      open: (ws) => {
        this.openConnection(ws);
      },
      drain: (ws) => {
        this.handleDrain(ws);
      },
      close: (ws) => {
        this.closeConnection(ws);
      }
    };
  }

  private sendMessage(ws: BrokerSocket, message: AppServerMessage): boolean {
    const encoded = JSON.stringify(message);
    const status = ws.sendText(encoded);

    if (status <= 0 || ws.getBufferedAmount() > this.maxBufferedAmountBytes) {
      this.closeSlowClient(ws);
      return false;
    }

    return true;
  }

  private closeSlowClient(ws: BrokerSocket): void {
    ws.close(1013, 'client backpressure');
  }
}
