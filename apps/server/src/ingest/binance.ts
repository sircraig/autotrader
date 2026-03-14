import { tradingConfig } from '@btc-tui/core/config/trading';
import type {
  AggTrade,
  AppEvent,
  AppEventEnvelope,
  AppEventType,
  Candle,
  CandleEventPayload,
  HistoricalBootstrap,
  OrderBook,
  OrderBookEventPayload,
  AggTradeEventPayload
} from '@btc-tui/core/models';

import { MarketState } from '../state/market-state';

const DEFAULT_BINANCE_REST_BASE_URL = 'https://api.binance.com';
const DEFAULT_BINANCE_WS_BASE_URL = 'wss://stream.binance.com:9443/stream';
const DEFAULT_STALE_AFTER_MS = 15_000;
const DEFAULT_INITIAL_RECONNECT_DELAY_MS = 1_000;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 30_000;

type NextSequence = () => number;
type EventSource = AppEvent['source'];
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type BinanceKlineInterval = (typeof tradingConfig.market.streamIntervals)[number];

type BinanceRestKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string
];

interface BinanceKlineStreamPayload {
  e: 'kline';
  E: number;
  s: string;
  k: {
    t: number;
    T: number;
    s: string;
    i: BinanceKlineInterval;
    o: string;
    c: string;
    h: string;
    l: string;
    v: string;
    x: boolean;
  };
}

interface BinanceDepthStreamPayload {
  e: 'depthUpdate';
  E: number;
  s: string;
  U: number;
  u: number;
  b: [string, string][];
  a: [string, string][];
}

interface BinancePartialDepthStreamPayload {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
}

interface BinanceAggTradeStreamPayload {
  e: 'aggTrade';
  E: number;
  s: string;
  a: number;
  p: string;
  q: string;
  T: number;
  m: boolean;
}

type BinanceCombinedStreamMessage =
  | { stream: string; data: BinanceKlineStreamPayload | BinanceDepthStreamPayload | BinanceAggTradeStreamPayload }
  | BinanceKlineStreamPayload
  | BinanceDepthStreamPayload
  | BinanceAggTradeStreamPayload
  | BinancePartialDepthStreamPayload;

interface EventEnvelopeArgs<TType extends AppEventType, TPayload> {
  type: TType;
  payload: TPayload;
  symbol: string;
  source: EventSource;
  nextSequence: NextSequence;
  emittedAt?: string;
}

export interface BinanceBootstrapOptions {
  symbol?: string;
  fetchImpl?: FetchLike;
  restBaseUrl?: string;
}

export interface BinanceIngestServiceOptions extends BinanceBootstrapOptions {
  wsBaseUrl?: string;
  state?: MarketState;
  onEvent?: (event: AppEvent) => void;
  onError?: (error: unknown) => void;
  nextSequence?: NextSequence;
  webSocketFactory?: (url: string) => WebSocket;
  staleAfterMs?: number;
  initialReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
}

function createEventEnvelope<TType extends AppEventType, TPayload>({
  type,
  payload,
  symbol,
  source,
  nextSequence,
  emittedAt
}: EventEnvelopeArgs<TType, TPayload>): AppEventEnvelope<TType, TPayload> {
  return {
    version: 'v1',
    type,
    sequence: nextSequence(),
    emittedAt: emittedAt ?? new Date().toISOString(),
    source,
    symbol,
    payload
  };
}

function createSystemStatusPayload(args: {
  status: 'starting' | 'healthy' | 'degraded' | 'stopped';
  reconnectCount: number;
  staleStreams?: string[];
}) {
  return {
    status: args.status,
    reconnectCount: args.reconnectCount,
    ...(args.staleStreams === undefined ? {} : { staleStreams: args.staleStreams })
  };
}

function parseNumber(value: string): number {
  return Number.parseFloat(value);
}

function normalizeCandle(input: Pick<BinanceKlineStreamPayload['k'], 't' | 'o' | 'h' | 'l' | 'c' | 'v' | 'x'>): Candle {
  return {
    timestamp: input.t,
    open: parseNumber(input.o),
    high: parseNumber(input.h),
    low: parseNumber(input.l),
    close: parseNumber(input.c),
    volume: parseNumber(input.v),
    isClosed: input.x
  };
}

function isDiffDepthPayload(
  payload: BinanceCombinedStreamMessage
): payload is BinanceDepthStreamPayload {
  return 'e' in payload && payload.e === 'depthUpdate';
}

function isPartialDepthPayload(
  payload: BinanceCombinedStreamMessage
): payload is BinancePartialDepthStreamPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'lastUpdateId' in payload &&
    'bids' in payload &&
    'asks' in payload
  );
}

function normalizeOrderBook(
  payload: BinanceDepthStreamPayload | BinancePartialDepthStreamPayload
): OrderBook {
  if (isDiffDepthPayload(payload)) {
    return {
      bids: payload.b.map(([price, quantity]) => ({
        price: parseNumber(price),
        quantity: parseNumber(quantity)
      })),
      asks: payload.a.map(([price, quantity]) => ({
        price: parseNumber(price),
        quantity: parseNumber(quantity)
      })),
      lastUpdateId: payload.u
    };
  }

  return {
    bids: payload.bids.map(([price, quantity]) => ({
      price: parseNumber(price),
      quantity: parseNumber(quantity)
    })),
    asks: payload.asks.map(([price, quantity]) => ({
      price: parseNumber(price),
      quantity: parseNumber(quantity)
    })),
    lastUpdateId: payload.lastUpdateId
  };
}

function normalizeAggTrade(payload: BinanceAggTradeStreamPayload): AggTrade {
  return {
    tradeId: payload.a,
    price: parseNumber(payload.p),
    quantity: parseNumber(payload.q),
    timestamp: payload.T,
    isBuyerMaker: payload.m
  };
}

function isCombinedStreamMessage(
  payload: BinanceCombinedStreamMessage
): payload is Extract<BinanceCombinedStreamMessage, { stream: string }> {
  return 'stream' in payload;
}

function isKlinePayload(
  payload: BinanceCombinedStreamMessage
): payload is BinanceKlineStreamPayload {
  return 'e' in payload && payload.e === 'kline';
}

function isAggTradePayload(
  payload: BinanceCombinedStreamMessage
): payload is BinanceAggTradeStreamPayload {
  return 'e' in payload && payload.e === 'aggTrade';
}

function decodeMessageData(data: string | ArrayBuffer | Blob): string {
  if (typeof data === 'string') {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }

  throw new TypeError('Unsupported WebSocket payload type received from Binance');
}

export function buildCombinedStreamUrl(
  symbol: string = tradingConfig.market.defaultSymbol,
  wsBaseUrl = DEFAULT_BINANCE_WS_BASE_URL
): string {
  const normalizedSymbol = symbol.toLowerCase();
  const streams = [
    `${normalizedSymbol}@kline_1m`,
    `${normalizedSymbol}@kline_5m`,
    `${normalizedSymbol}@depth20@100ms`,
    `${normalizedSymbol}@aggTrade`
  ];

  return `${wsBaseUrl}?streams=${streams.join('/')}`;
}

export function normalizeHistoricalBootstrapEvent(args: {
  symbol: string;
  timeframe: BinanceKlineInterval;
  candles: Candle[];
  nextSequence: NextSequence;
  emittedAt?: string;
}): AppEventEnvelope<'bootstrap.history', HistoricalBootstrap> {
  return createEventEnvelope({
    type: 'bootstrap.history',
    payload: {
      timeframe: args.timeframe,
      candles: args.candles.map((candle) => ({ ...candle }))
    },
    symbol: args.symbol,
    source: 'binance',
    nextSequence: args.nextSequence,
    ...(args.emittedAt === undefined ? {} : { emittedAt: args.emittedAt })
  });
}

export function normalizeKlineEvent(args: {
  symbol: string;
  payload: BinanceKlineStreamPayload;
  nextSequence: NextSequence;
  emittedAt?: string;
}): AppEventEnvelope<'market.candle', CandleEventPayload> {
  return createEventEnvelope({
    type: 'market.candle',
    payload: {
      timeframe: args.payload.k.i,
      candle: normalizeCandle(args.payload.k)
    },
    symbol: args.symbol,
    source: 'binance',
    nextSequence: args.nextSequence,
    emittedAt: args.emittedAt ?? new Date(args.payload.E).toISOString()
  });
}

export function normalizeDepthEvent(args: {
  symbol: string;
  payload: BinanceDepthStreamPayload | BinancePartialDepthStreamPayload;
  nextSequence: NextSequence;
  emittedAt?: string;
}): AppEventEnvelope<'market.order_book', OrderBookEventPayload> {
  return createEventEnvelope({
    type: 'market.order_book',
    payload: {
      orderBook: normalizeOrderBook(args.payload)
    },
    symbol: args.symbol,
    source: 'binance',
    nextSequence: args.nextSequence,
    ...(args.emittedAt !== undefined
      ? { emittedAt: args.emittedAt }
      : isDiffDepthPayload(args.payload)
        ? { emittedAt: new Date(args.payload.E).toISOString() }
        : {})
  });
}

export function normalizeAggTradeEvent(args: {
  symbol: string;
  payload: BinanceAggTradeStreamPayload;
  nextSequence: NextSequence;
  emittedAt?: string;
}): AppEventEnvelope<'market.agg_trade', AggTradeEventPayload> {
  return createEventEnvelope({
    type: 'market.agg_trade',
    payload: {
      trade: normalizeAggTrade(args.payload)
    },
    symbol: args.symbol,
    source: 'binance',
    nextSequence: args.nextSequence,
    emittedAt: args.emittedAt ?? new Date(args.payload.E).toISOString()
  });
}

export async function fetchHistoricalCandles(
  timeframe: BinanceKlineInterval,
  options: BinanceBootstrapOptions = {}
): Promise<Candle[]> {
  const symbol = options.symbol ?? tradingConfig.market.defaultSymbol;
  const fetchImpl = options.fetchImpl ?? fetch;
  const restBaseUrl = options.restBaseUrl ?? DEFAULT_BINANCE_REST_BASE_URL;
  const limit =
    timeframe === '1m'
      ? tradingConfig.market.historicalPreload.candles1m
      : tradingConfig.market.historicalPreload.candles5m;

  const url = new URL('/api/v3/klines', restBaseUrl);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', timeframe);
  url.searchParams.set('limit', String(limit));

  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Binance ${timeframe} history: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as BinanceRestKline[];

  return payload.map((entry) =>
    normalizeCandle({
      t: entry[0],
      o: entry[1],
      h: entry[2],
      l: entry[3],
      c: entry[4],
      v: entry[5],
      x: true
    })
  );
}

export class BinanceIngestService {
  private readonly symbol: string;
  private readonly state: MarketState;
  private readonly onEvent: ((event: AppEvent) => void) | undefined;
  private readonly onError: ((error: unknown) => void) | undefined;
  private readonly fetchImpl: FetchLike;
  private readonly webSocketFactory: (url: string) => WebSocket;
  private readonly restBaseUrl: string;
  private readonly wsBaseUrl: string;
  private readonly nextSequence: NextSequence;
  private readonly staleAfterMs: number;
  private readonly initialReconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;
  private reconnectCount = 0;
  private lastMessageAt = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private staleInterval: ReturnType<typeof setInterval> | null = null;
  private socket: WebSocket | null = null;
  private stopped = false;

  constructor(options: BinanceIngestServiceOptions = {}) {
    this.symbol = options.symbol ?? tradingConfig.market.defaultSymbol;
    this.state = options.state ?? new MarketState(this.symbol);
    this.onEvent = options.onEvent;
    this.onError = options.onError;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.webSocketFactory = options.webSocketFactory ?? ((url) => new WebSocket(url));
    this.restBaseUrl = options.restBaseUrl ?? DEFAULT_BINANCE_REST_BASE_URL;
    this.wsBaseUrl = options.wsBaseUrl ?? DEFAULT_BINANCE_WS_BASE_URL;
    this.nextSequence = options.nextSequence ?? this.createSequenceGenerator();
    this.staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
    this.initialReconnectDelayMs =
      options.initialReconnectDelayMs ?? DEFAULT_INITIAL_RECONNECT_DELAY_MS;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS;
  }

  getMarketState(): MarketState {
    return this.state;
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.emitSystemStatus('starting');
    await this.bootstrapHistory();
    this.connect();
    this.startStaleWatcher();
  }

  stop(): void {
    this.stopped = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.staleInterval) {
      clearInterval(this.staleInterval);
      this.staleInterval = null;
    }

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close(1000, 'service stopped');
    }

    this.socket = null;
    this.emitSystemStatus('stopped');
  }

  async bootstrapHistory(): Promise<void> {
    const candles5m = await fetchHistoricalCandles('5m', {
      symbol: this.symbol,
      fetchImpl: this.fetchImpl,
      restBaseUrl: this.restBaseUrl
    });

    this.emit(
      normalizeHistoricalBootstrapEvent({
        symbol: this.symbol,
        timeframe: '5m',
        candles: candles5m,
        nextSequence: this.nextSequence
      })
    );

    const candles1m = await fetchHistoricalCandles('1m', {
      symbol: this.symbol,
      fetchImpl: this.fetchImpl,
      restBaseUrl: this.restBaseUrl
    });

    this.emit(
      normalizeHistoricalBootstrapEvent({
        symbol: this.symbol,
        timeframe: '1m',
        candles: candles1m,
        nextSequence: this.nextSequence
      })
    );
  }

  connect(): void {
    if (this.stopped) {
      return;
    }

    const url = buildCombinedStreamUrl(this.symbol, this.wsBaseUrl);
    this.socket = this.webSocketFactory(url);

    this.socket.addEventListener('open', () => {
      this.lastMessageAt = Date.now();
      this.emitSystemStatus('healthy');
    });

    this.socket.addEventListener('message', (event) => {
      this.lastMessageAt = Date.now();

      try {
        const maybeEvent = this.normalizeStreamMessage(decodeMessageData(event.data));
        if (maybeEvent) {
          this.emit(maybeEvent);
        }
      } catch (error) {
        this.handleError(error);
      }
    });

    this.socket.addEventListener('close', () => {
      this.socket = null;

      if (!this.stopped) {
        this.scheduleReconnect('combined-stream');
      }
    });

    this.socket.addEventListener('error', () => {
      this.emitSystemStatus('degraded', ['combined-stream']);
    });
  }

  private normalizeStreamMessage(rawMessage: string): AppEvent | null {
    const parsed = JSON.parse(rawMessage) as BinanceCombinedStreamMessage;
    const payload = isCombinedStreamMessage(parsed) ? parsed.data : parsed;
    const stream = isCombinedStreamMessage(parsed) ? parsed.stream : null;

    if ('s' in payload && payload.s !== this.symbol) {
      return null;
    }

    if (isKlinePayload(payload)) {
      return normalizeKlineEvent({
        symbol: this.symbol,
        payload,
        nextSequence: this.nextSequence
      });
    }

    if (isDiffDepthPayload(payload)) {
      return normalizeDepthEvent({
        symbol: this.symbol,
        payload,
        nextSequence: this.nextSequence
      });
    }

    if (isPartialDepthPayload(payload)) {
      return normalizeDepthEvent({
        symbol: this.symbol,
        payload,
        nextSequence: this.nextSequence
      });
    }

    if (stream?.endsWith('@depth20@100ms')) {
      this.handleError(new Error('Received malformed partial depth payload from Binance'));
      return null;
    }

    if (isAggTradePayload(payload)) {
      return normalizeAggTradeEvent({
        symbol: this.symbol,
        payload,
        nextSequence: this.nextSequence
      });
    }

    return null;
  }

  private startStaleWatcher(): void {
    if (this.staleInterval) {
      clearInterval(this.staleInterval);
    }

    this.staleInterval = setInterval(() => {
      if (this.stopped || this.lastMessageAt === 0) {
        return;
      }

      if (Date.now() - this.lastMessageAt <= this.staleAfterMs) {
        return;
      }

      this.emitSystemStatus('degraded', ['combined-stream']);

      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.close(4000, 'stale stream');
      }
    }, Math.max(1_000, Math.floor(this.staleAfterMs / 2)));
  }

  private scheduleReconnect(staleStream: string): void {
    this.reconnectCount += 1;
    this.emitSystemStatus('degraded', [staleStream]);

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    const delay = Math.min(
      this.initialReconnectDelayMs * 2 ** Math.max(0, this.reconnectCount - 1),
      this.maxReconnectDelayMs
    );

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private emitSystemStatus(
    status: 'starting' | 'healthy' | 'degraded' | 'stopped',
    staleStreams?: string[]
  ): void {
    const event = createEventEnvelope({
      type: 'system.status',
      payload: createSystemStatusPayload({
        status,
        reconnectCount: this.reconnectCount,
        ...(staleStreams === undefined ? {} : { staleStreams })
      }),
      symbol: this.symbol,
      source: 'server',
      nextSequence: this.nextSequence
    });

    this.emit(event);
  }

  private emit(event: AppEvent): void {
    this.state.apply(event);
    this.onEvent?.(event);
  }

  private handleError(error: unknown): void {
    this.onError?.(error);
  }

  private createSequenceGenerator(): NextSequence {
    let sequence = 0;

    return () => {
      sequence += 1;
      return sequence;
    };
  }
}
