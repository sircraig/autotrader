import { tradingConfig } from '@autotrader/core/config/trading';

import { BinanceIngestService } from './ingest/binance';
import { PersistedLogWriter } from './logging/persisted-log-writer';
import { MarketEventCoordinator } from './orchestration/market-event-coordinator';
import { MarketState } from './state/market-state';
import { buildHealthStatusBody, buildServerStatusBody } from './transport/http-status';
import {
  buildCorsHeaders,
  createAllowedOrigins,
  isAllowedOrigin
} from './transport/origin-policy';
import { AppWsBroker } from './transport/ws-broker';

const port = Number(Bun.env.PORT ?? 3001);
const symbol = Bun.env.SYMBOL ?? tradingConfig.market.defaultSymbol;
const ingestEnabled = Bun.env.INGEST_ENABLED !== '0';
const allowedOrigins = createAllowedOrigins(Bun.env.WEB_ORIGIN);
let sequence = 0;
const nextSequence = () => {
  sequence += 1;
  return sequence;
};
const marketState = new MarketState(symbol);
const wsBroker = new AppWsBroker(marketState);
const logWriter = new PersistedLogWriter();
const eventCoordinator = new MarketEventCoordinator({
  nextSequence
});

const ingestService = new BinanceIngestService({
  symbol,
  nextSequence,
  onEvent(event) {
    const batch = eventCoordinator.process(event);

    for (const nextEvent of batch.events) {
      marketState.apply(nextEvent);
      wsBroker.broadcastEvent(nextEvent);
    }

    if (batch.logEvents.length > 0) {
      void logWriter.writeMany(batch.logEvents).catch((error) => {
        console.error('failed to persist log events', error);
      });
    }
  },
  onError(error) {
    console.error('binance ingest error', error);
  }
});

if (ingestEnabled) {
  ingestService.start().catch((error) => {
    console.error('failed to start ingest service', error);
  });
} else {
  console.warn('autotrader ingest disabled via INGEST_ENABLED=0');
}

function jsonResponse(request: Request, body: unknown, init: ResponseInit = {}): Response {
  const headers = buildCorsHeaders(request, allowedOrigins);
  const responseHeaders = new Headers(init.headers);

  responseHeaders.forEach((value, key) => {
    headers.set(key, value);
  });

  return Response.json(body, {
    ...init,
    headers
  });
}

const server = Bun.serve({
  port,
  websocket: wsBroker.getWebSocketHandler(),
  fetch(request, server) {
    const url = new URL(request.url);
    const snapshot = marketState.getSnapshot();

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(request, allowedOrigins)
      });
    }

    if (url.pathname === '/ws') {
      if (!isAllowedOrigin(request, allowedOrigins)) {
        return new Response('Forbidden', { status: 403 });
      }

      if (request.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405 });
      }

      const upgraded = server.upgrade(request, {
        data: wsBroker.createClientData()
      });

      if (!upgraded) {
        return new Response('WebSocket upgrade failed', { status: 400 });
      }

      return;
    }

    if (url.pathname === '/health') {
      return jsonResponse(request, buildHealthStatusBody(snapshot, symbol));
    }

    if (url.pathname === '/status') {
      return jsonResponse(request, buildServerStatusBody(snapshot, symbol));
    }

    if (url.pathname === '/bootstrap') {
      return jsonResponse(request, {
        symbol,
        bootstrap: snapshot.bootstrap,
        deltaHistory: snapshot.deltaHistory,
        latestCandles: snapshot.latestCandles
      });
    }

    if (url.pathname === '/state') {
      return jsonResponse(request, snapshot);
    }

    return jsonResponse(
      request,
      {
        message: 'autotrader server',
        health: '/health',
        status: '/status',
        bootstrap: '/bootstrap',
        state: '/state',
        ws: '/ws'
      },
      { status: 404 }
    );
  }
});

console.log(`autotrader server listening on http://localhost:${server.port}`);
