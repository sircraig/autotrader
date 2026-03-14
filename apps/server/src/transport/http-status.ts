import type { MarketStateSnapshot } from '../state/market-state';

export interface HealthStatusBody {
  ok: boolean;
  service: string;
  symbol: string;
  phase: number;
  status: MarketStateSnapshot['systemStatus'];
  bootstrap: {
    candles1m: number;
    candles5m: number;
  };
  sequence: number;
  lastEventAt: string | null;
}

export interface ServerStatusBody {
  service: string;
  symbol: string;
  market: MarketStateSnapshot;
}

export function buildHealthStatusBody(
  snapshot: MarketStateSnapshot,
  symbol: string
): HealthStatusBody {
  return {
    ok: snapshot.systemStatus.status !== 'stopped',
    service: 'autotrader-server',
    symbol,
    phase: 4,
    status: snapshot.systemStatus,
    bootstrap: {
      candles1m: snapshot.bootstrap['1m'].length,
      candles5m: snapshot.bootstrap['5m'].length
    },
    sequence: snapshot.sequence,
    lastEventAt: snapshot.lastEventAt
  };
}

export function buildServerStatusBody(
  snapshot: MarketStateSnapshot,
  symbol: string
): ServerStatusBody {
  return {
    service: 'autotrader-server',
    symbol,
    market: snapshot
  };
}
