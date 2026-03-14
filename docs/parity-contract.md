# BTC-TUI Parity Contract

This document freezes the current Python application's required behavior for the Phase 1 Bun + React rewrite. It is based on the source code in `/home/craig/dev/btc-tui`, not on stale comments or aspirational docs.

## Source of Truth
- App orchestration: `btc_tui/app.py`
- Runtime constants: `btc_tui/config.py`
- Shared market models: `btc_tui/exchanges/base.py`
- Exchange bootstrap: `btc_tui/exchanges/binance.py`
- Order-book delta engine: `btc_tui/widgets/order_book_delta.py`
- Trade-flow / CVD engine: `btc_tui/widgets/trade_flow.py`
- Indicator engine: `btc_tui/widgets/plotext_chart.py`
- Point-signals engine: `btc_tui/widgets/point_signals.py`
- Logging: `btc_tui/utils/trade_logger.py`, `btc_tui/utils/point_signals_logger.py`

## Runtime Responsibilities
The source app is a single always-on process that:

1. Fetches historical Binance candles over REST.
2. Maintains four Binance WebSocket streams.
3. Updates six visible production widgets.
4. Computes indicator and signal state inside widget classes.
5. Persists JSONL logs for candle closes, order-book delta trades, and point-signal trades.

The rewrite must preserve the behavior, not the Textual rendering approach.

## Market Streams

| Concern | Binance source | Payload used by app | Notes |
| --- | --- | --- | --- |
| 1m candles | `btcusdt@kline_1m` | `Candle` | Updates the 1m candle list; close events also log delta/CVD snapshots. |
| 5m candles | `btcusdt@kline_5m` | `Candle` | Drives chart indicators, candle annotations, point signals, and 5m candle logs. |
| Order book | `btcusdt@depth20@100ms` | `OrderBook` with 20 bid/ask levels | Drives both the visual order book and the imbalance engine. |
| Aggregate trades | `btcusdt@aggTrade` | `AggTrade` | Drives CVD windows, trade counts, trade rate, and recent large trades. |

## Historical Bootstrap
- On mount, the app fetches 50 historical `5m` candles.
- Those candles are loaded into the chart widget first.
- The last 20 historical `5m` closes are also pushed into the 5m candle list.
- On mount, the app fetches 30 historical `1m` candles.
- The last 20 historical `1m` closes are pushed into the 1m candle list.
- WebSocket workers start only after both historical preload steps complete.

## Mandatory MVP Panels
- `CandlePriceWidget` for `1m` candle closes
- `CandlePriceWidget` for `5m` candle closes
- `PlotextChartWidget` equivalent with:
  - price pane
  - RSI pane
  - ATR pane
  - delta pane
- `OrderBookWidget`
- `TradeFlowWidget`
- `OrderBookDeltaWidget`
- `PointSignalsWidget`

## Optional / Post-MVP Panels
- `AsciiChartWidget`
- Standalone `DeltaChartWidget`

These exist in the Python repo but are not part of the active `BitcoinTUI.compose()` layout.

## Fixed Trading Constants

### Order-Book Delta
| Constant | Value | Source behavior |
| --- | --- | --- |
| `IMBALANCE_RATIO` | `5.0` | Open BUY if bid top-3 >= 5x ask top-3; open SELL if ask top-3 >= 5x bid top-3. |
| `CLOSE_RATIO` | `2.0` | Close BUY if first ask >= 2x bid top-3; close SELL if first bid >= 2x ask top-3. |
| `MIN_QUANTITY_BTC` | `0.5` | Entry gate on first opposing level quantity. |

### Trade Flow
| Constant | Value | Source behavior |
| --- | --- | --- |
| `LARGE_TRADE_THRESHOLD_BTC` | `0.5` | Trades at or above this size enter the recent-large-trades list. |

### Point Signals
| Constant | Value | Source behavior |
| --- | --- | --- |
| `POINT_OPEN_THRESHOLD` | `4` | Actual runtime open threshold for LONG and SHORT. |
| `POINT_CLOSE_THRESHOLD` | `2` | Actual runtime normal close threshold. |
| `MIN_PNL_TOTAL_1H` | `1200` | Mandatory gate for entries. |
| `MIN_ATR_VALUE` | `100` | Mandatory ATR floor for entries. |
| divergence persistence | `4 candles` | Bullish/bearish divergence points persist for 4 closed 5m candles. |

Important: the `PointSignalsWidget` class docstring still says open at `>=5` and close at `<=3`, but the real runtime uses `config.py` values `4` and `2`. Logs in `logs/point_signals_*.jsonl` confirm trades open at 4 points and close at 2 points.

### Indicators and Windows
| Constant | Value |
| --- | --- |
| `MAX_CANDLES` | `50` |
| `BB_PERIOD` | `20` |
| `BB_STD_MULTIPLIER` | `2.0` |
| `RSI_PERIOD` | `14` |
| `EMA_PERIOD` | `21` |
| `ATR_PERIOD` | `14` |
| `ATR_SMA_PERIOD` | `10` |
| `WINDOW_30M` | `1800 seconds` |
| `WINDOW_1H` | `3600 seconds` |
| `WINDOW_4H` | `14400 seconds` |
| `CVD_WINDOW_1M` | `60 seconds` |
| `CVD_WINDOW_5M` | `300 seconds` |
| `CVD_WINDOW_1H` | `3600 seconds` |

### RSI Divergence Detection Parameters
These are hard-coded in `btc_tui/indicators/divergence.py` and must be preserved:

| Parameter | Value |
| --- | --- |
| swing lookback | `2` |
| min swing distance | `3` |
| max swing distance | `20` |
| bullish price threshold | `price2 < price1 * 0.9999` |
| bullish RSI threshold | `rsi2 > rsi1 + 1` |
| bearish price threshold | `price2 > price1 * 1.0001` |
| bearish RSI threshold | `rsi2 < rsi1 - 1` |

## Shared Domain Models

### Market Data
- `Candle`
  - `timestamp`
  - `open`
  - `high`
  - `low`
  - `close`
  - `volume`
  - `is_closed`
- `OrderBookLevel`
  - `price`
  - `quantity`
- `OrderBook`
  - `bids`
  - `asks`
  - `last_update_id`
- `AggTrade`
  - `trade_id`
  - `price`
  - `quantity`
  - `timestamp`
  - `is_buyer_maker`
  - derived:
    - `is_buy`
    - signed `volume`

### Order-Book Delta Outputs
- `current_delta_stats`
  - `delta`
  - `delta_pct`
  - `duration_delta`
  - `duration_delta_pct`
  - `pnl_total_1h`
  - augmented on 5m close with `outside_bb`
- `running_totals`
  - `buy_total`
  - `buy_count`
  - `buy_duration`
  - `sell_total`
  - `sell_count`
  - `sell_duration`
  - `combined_total`
  - `delta`
  - `delta_pct`
  - `total_duration`
  - `duration_delta`
  - `duration_delta_pct`

### Trade-Flow Outputs
- `cvd_stats`
  - `cvd_1m`
  - `cvd_5m`
  - `cvd_1h`
  - `buy_volume_1m`
  - `sell_volume_1m`
  - `buy_volume_5m`
  - `sell_volume_5m`
  - `buy_pct_5m`
  - `side_1m`
  - `side_5m`
  - `side_1h`
  - `trade_count_1m`
  - `trade_rate`

### Indicator Outputs
- `ema_position`: `"above" | "below" | "touch" | null`
- `price_bb`: `"above" | "below" | null`
- `delta_bb`: `"above" | "below" | null`
- `divergence`: `"bullish" | "bearish" | null`
- `atr`
- `atr_sma`
- `atr_below_sma`

### Point-Signal Inputs
The point engine consumes, per 5m candle close:
- current price
- `delta_stats`
- `cvd_stats.buy_pct_5m`
- `ema_position`
- `delta_bb`
- `price_bb`
- `divergence`
- `atr`
- `atr_sma`

## Point Scoring Contract

### Bullish points
- `+1` EMA position is `above`
- `+1` price delta is positive
- `+1` time delta is positive
- `+1` 5m CVD buy percentage is `> 50`
- `+1` delta is above its Bollinger band
- `+1` price is above its Bollinger band
- `+2` bullish RSI divergence is active

### Bearish points
- `+1` EMA position is `below`
- `+1` price delta is negative
- `+1` time delta is negative
- `+1` 5m CVD buy percentage is `< 50`
- `+1` delta is below its Bollinger band
- `+1` price is below its Bollinger band
- `+2` bearish RSI divergence is active

### Entry gates
Entries are allowed only when all of these are true:
- `pnl_total_1h > 1200`
- `atr >= 100`
- `atr > atr_sma`

### Exit rules
- Priority 1: close any active point trade immediately if `atr < atr_sma`.
- Priority 2: otherwise close LONG if bullish points `<= 2`.
- Priority 3: otherwise close SHORT if bearish points `<= 2`.

## Logging Contract

### Trade logger files
- `logs/signals_YYYY-MM-DD.jsonl`
  - `TRADE_OPEN`
  - `TRADE_CLOSE`
- `logs/candles_1m_YYYY-MM-DD.jsonl`
  - `CANDLE_CLOSE_1M`
- `logs/candles_5m_YYYY-MM-DD.jsonl`
  - `CANDLE_CLOSE_5M`

### Point-signal logger files
- `logs/point_signals_YYYY-MM-DD.jsonl`
  - `POINT_TRADE_OPEN`
  - `POINT_TRADE_CLOSE`

The rewrite must preserve these event families, even if file paths or rotation are implemented differently.

## Parity-Critical Behavioral Notes
- The 5m candle path is the main orchestration path. It is the only path that updates the point-signal engine.
- `PlotextChartWidget.update_candle()` must happen before any 5m indicator snapshot is read.
- Delta Bollinger status is computed only after the latest closed 5m candle's delta point is appended.
- 1m closes do not recalculate chart indicators or point signals.
- Order-book delta state is driven off wall-clock `datetime.now()`, not exchange timestamps.
- Rolling windows prune based on current wall-clock time at read/write, not on the event timestamp supplied by Binance.

