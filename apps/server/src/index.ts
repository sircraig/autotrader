import { tradingConfig } from '@btc-tui/core/config/trading';

const port = Number(Bun.env.PORT ?? 3001);

const server = Bun.serve({
  port,
  fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({
        ok: true,
        service: 'btc-tui2-server',
        symbol: tradingConfig.market.defaultSymbol,
        phase: 1
      });
    }

    return Response.json(
      {
        message: 'btc-tui2 server scaffold',
        health: '/health'
      },
      { status: 404 }
    );
  }
});

console.log(`btc-tui2 server listening on http://localhost:${server.port}`);
