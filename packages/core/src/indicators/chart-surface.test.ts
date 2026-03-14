import { expect, test } from 'bun:test';

import type { Candle } from '../models';
import { buildChartSurfaceState } from './chart-surface';

function createCandle(timestamp: number, price: number, spread = 8): Candle {
  return {
    timestamp,
    open: price - 2,
    high: price + spread / 2,
    low: price - spread / 2,
    close: price,
    volume: 10,
    isClosed: true
  };
}

function createExplicitCandle(
  timestamp: number,
  open: number,
  high: number,
  low: number,
  close: number
): Candle {
  return {
    timestamp,
    open,
    high,
    low,
    close,
    volume: 10,
    isClosed: true
  };
}

test('buildChartSurfaceState derives multi-pane series and latest helper outputs', () => {
  const candles = Array.from({ length: 29 }, (_, index) =>
    createCandle((index + 1) * 300_000, 100 + index * 0.4)
  );
  candles.push(createCandle(30 * 300_000, 165, 20));

  const deltaPoints = Array.from({ length: 19 }, (_, index) => ({
    timestamp: (index + 11) * 300_000,
    value: 0
  }));
  deltaPoints.push({
    timestamp: 30 * 300_000,
    value: 40
  });

  const surface = buildChartSurfaceState({
    candles,
    deltaPoints
  });

  expect(surface.candles).toHaveLength(30);
  expect(surface.emaSeries).toHaveLength(30);
  expect(surface.priceBandSeries).toHaveLength(30);
  expect(surface.rsiSeries).toHaveLength(30);
  expect(surface.atrSeries).toHaveLength(30);
  expect(surface.atrSmaSeries).toHaveLength(30);
  expect(surface.deltaSeries).toHaveLength(20);
  expect(surface.deltaBandSeries).toHaveLength(20);
  expect(surface.summary.priceBb).toBe('above');
  expect(surface.summary.deltaBb).toBe('above');
  expect(surface.summary.emaPosition).toBe('above');
  expect(surface.summary.atr).not.toBeNull();
  expect(surface.summary.atrSma).not.toBeNull();
  expect(surface.latestDivergence).toBeNull();
});

test('buildChartSurfaceState prefers a provided indicator snapshot for parity-sensitive summary fields', () => {
  const candles = Array.from({ length: 25 }, (_, index) =>
    createCandle((index + 1) * 300_000, 100 + index)
  );

  const surface = buildChartSurfaceState({
    candles,
    indicatorSnapshot: {
      priceBb: 'below',
      deltaBb: 'below',
      emaPosition: 'touch',
      divergence: 'bearish',
      atr: 180,
      atrSma: 190,
      atrBelowSma: true
    }
  });

  expect(surface.summary).toEqual({
    priceBb: 'below',
    deltaBb: 'below',
    emaPosition: 'touch',
    divergence: 'bearish',
    atr: 180,
    atrSma: 190,
    atrBelowSma: true
  });
});

test('buildChartSurfaceState classifies EMA cross candles as touch', () => {
  const candles = Array.from({ length: 20 }, (_, index) =>
    createCandle((index + 1) * 300_000, 100 + index)
  );
  candles.push(
    createExplicitCandle(21 * 300_000, 109, 121, 108, 120)
  );

  const surface = buildChartSurfaceState({
    candles
  });

  expect(surface.summary.emaPosition).toBe('touch');
});

test('buildChartSurfaceState only surfaces divergence on the divergence candle', () => {
  const closes = [
    100,
    96.4578985580371,
    95.00239855439487,
    96.51993946323081,
    94.55198071774915,
    94.92475975463533,
    94.65770250051042,
    96.87942916060156,
    96.53341758221627,
    96.08974733566328,
    96.55229094970396,
    92.64525244547484,
    91.31101890396567,
    90.41945654216104,
    88.81047778676609,
    84.8889369444218,
    82.45730249511836,
    83.13027897332194,
    86.0417121265472,
    84.14142625452826,
    82.73829593691072,
    85.89751144997399,
    88.13361207144072,
    87.72926510473481,
    88.61724998942555,
    89.6194707639931,
    88.57950525441142,
    89.317306747166,
    86.07480723357253,
    87.5100571716659
  ];
  const lows = [
    97.23446255552696,
    93.78448119516348,
    92.62324021253231,
    95.09316319481715,
    93.30158635857605,
    93.43883148537844,
    93.53370104622695,
    94.51759358098597,
    95.14479826852799,
    93.20617696523865,
    95.42591419310233,
    90.89049398027063,
    88.75690870756775,
    87.60738243355067,
    86.26469706944354,
    83.48123155437032,
    80.14635144217696,
    82.04112295548788,
    84.7520413105817,
    82.04112211821871,
    79.86257451959716,
    83.97248643802995,
    86.40601627465203,
    85.6629256035722,
    87.34117443141707,
    87.4910700699024,
    86.61015919877578,
    87.49751569418844,
    84.95670052690421,
    85.27341081331873
  ];
  const highs = [
    101.258050802917,
    98.92812772932966,
    96.2255908132162,
    98.583956086845,
    95.77040744454094,
    96.67897681657004,
    96.49843947296937,
    99.27049301579726,
    97.91724368054616,
    97.47821770812503,
    99.40163832878297,
    94.77306547603264,
    93.87148860681295,
    93.31347286075764,
    91.27830888019632,
    85.89772392555236,
    84.33175632911711,
    84.6749576818191,
    87.16909249867727,
    86.03099730673034,
    84.45313381684957,
    88.45155121231822,
    90.22807569139918,
    90.13064977987482,
    90.20303523716906,
    92.03677996596375,
    90.82825192290473,
    91.33007556876777,
    88.41770361812583,
    89.11704449157345
  ];
  const candles = closes.map((close, index) =>
    createExplicitCandle(
      (index + 1) * 300_000,
      index === 0 ? close : closes[index - 1]!,
      highs[index]!,
      lows[index]!,
      close
    )
  );

  const divergenceSurface = buildChartSurfaceState({
    candles: candles.slice(0, 23)
  });
  const laterSurface = buildChartSurfaceState({
    candles
  });

  expect(divergenceSurface.summary.divergence).toBe('bullish');
  expect(divergenceSurface.latestDivergence).toBe('bullish');
  expect(laterSurface.summary.divergence).toBeNull();
  expect(laterSurface.latestDivergence).toBe('bullish');
});
