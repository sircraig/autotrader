# BTC-TUI Event Sequences

This document captures the Python app's actual update ordering. The rewrite must preserve these sequencing semantics even if the implementation moves from widget methods to pure engines and a server broker.

## Startup Sequence

1. `BitcoinTUI.on_mount()` sets the title and subtitle.
2. `BinanceExchange.connect()` is called.
3. Historical `5m` candles are fetched from Binance REST with `limit=50`.
4. The chart widget receives the full 50-candle preload via `add_historical_candles()`.
5. The 5m candle list receives the last 20 historical closes via repeated `update_candle()` calls.
6. Historical `1m` candles are fetched from Binance REST with `limit=30`.
7. The 1m candle list receives the last 20 historical closes via repeated `update_candle()` calls.
8. Four threaded WebSocket workers start:
   - `kline_5m`
   - `kline_1m`
   - `depth20@100ms`
   - `aggTrade`

## 5m Candle Update Sequence
Source: `btc_tui/app.py::_update_candle_5m`

### Every 5m kline event
1. Read the 5m candle payload into a `Candle`.
2. Resolve widget dependencies:
   - 5m candle list
   - chart
   - order-book delta
   - trade flow
3. If the candle is closed, snapshot `ob_delta_widget.current_delta_stats`; otherwise use `None`.
4. Call `chart_widget.update_candle(candle)` first.

### Closed 5m candles only
5. Append the current delta value into chart delta history with `chart_widget.add_delta_point(...)`.
6. Compute `delta_stats["outside_bb"]` from `chart_widget.is_delta_outside_bands()`.
7. Compute `outside_price_bb` from `chart_widget.is_price_outside_bands()`.
8. Compute `divergence` from `chart_widget.get_recent_divergence()`.
9. Compute `ema_position` from `chart_widget.get_ema_position()`.
10. Snapshot `cvd_stats` from `trade_flow_widget.cvd_stats`.

### After indicator collection
11. Update the 5m candle list with:
   - candle
   - delta stats
   - CVD stats
   - price BB status
   - divergence
   - EMA position

### Point-signal path for closed 5m candles
12. Read `delta_bb` from `delta_stats["outside_bb"]`.
13. Read `atr` from `chart_widget.get_latest_atr()`.
14. Read `atr_sma` from `chart_widget.get_latest_atr_sma()`.
15. Call `point_signals_widget.update_indicators(...)` with:
   - current price
   - delta stats
   - CVD stats
   - EMA position
   - delta BB status
   - price BB status
   - divergence
   - ATR
   - ATR SMA

### Logging path for closed 5m candles
16. Snapshot `running_totals` from `ob_delta_widget.running_totals`.
17. Build `indicators`:
   - `price_bb`
   - `delta_bb`
   - `ema_position`
   - `bullish_divergence`
   - `bearish_divergence`
   - `atr`
   - `atr_sma`
   - `atr_below_sma`
18. Write `TradeLogger.log_candle_close(timeframe="5m", ...)`.

## 1m Candle Update Sequence
Source: `btc_tui/app.py::_update_candle_1m`

1. Read the 1m candle payload into a `Candle`.
2. Resolve widget dependencies:
   - 1m candle list
   - order-book delta
   - trade flow
3. If the candle is closed, snapshot `ob_delta_widget.current_delta_stats`; otherwise use `None`.
4. Update the 1m candle list with the candle and delta stats.
5. If the candle is closed:
   - snapshot `running_totals`
   - snapshot `trade_flow_widget.cvd_stats`
   - write `TradeLogger.log_candle_close(timeframe="1m", ...)`

Important: 1m closes do not update the chart widget or point signals.

## Order-Book Update Sequence
Source: `btc_tui/app.py::_update_orderbook`

1. Read the depth payload into an `OrderBook`.
2. Update `OrderBookWidget`.
3. Update `OrderBookDeltaWidget`.

The order matters because the visual order-book view is refreshed before the delta engine mutates its trade state.

## Aggregate Trade Update Sequence
Source: `btc_tui/app.py::_update_trade`

1. Read the agg-trade payload into an `AggTrade`.
2. Update `TradeFlowWidget`.

No other widget is updated directly from aggregate trade events.

## Order-Book Delta Engine Sequence
Source: `btc_tui/widgets/order_book_delta.py::update_orderbook`

1. Save the latest order book snapshot.
2. If fewer than 3 bid or ask levels exist, render current state and return.
3. Compute condition snapshot:
   - top-3 bid quantity
   - top-3 ask quantity
   - first bid/ask quantity
   - first bid/ask price
   - spread
   - bid/ask ratio
   - ask/bid ratio
   - BUY open and close conditions
   - SELL open and close conditions
4. Evaluate BUY path:
   - open BUY if no active BUY and BUY open conditions are met
   - close BUY if active BUY and BUY close condition is met
5. On BUY close, append realized PnL and duration into:
   - 30m buy totals
   - 1h buy totals
   - 4h buy totals
   - 30m/1h/4h delta totals using positive sign
6. Evaluate SELL path:
   - open SELL if no active SELL and SELL open conditions are met
   - close SELL if active SELL and SELL close condition is met
7. On SELL close, append realized PnL and duration into:
   - 30m sell totals
   - 1h sell totals
   - 4h sell totals
   - 30m/1h/4h delta totals using negative sign
8. Append closed events into recent history.
9. Emit trade-open/trade-close log entries when applicable.
10. Re-render widget content.

## Trade-Flow / CVD Sequence
Source: `btc_tui/widgets/trade_flow.py::update_trade`

1. Stamp the event with `datetime.now()`.
2. Add the trade into rolling CVD windows:
   - 1m
   - 5m
   - 1h
3. If `trade.quantity >= 0.5`, append it to recent large trades.
4. Update the last traded price.
5. Append the timestamp to the recent-trades deque used for rate calculation.
6. Re-render widget content.

## Point-Signals Sequence
Source: `btc_tui/widgets/point_signals.py::update_indicators`

1. Save the latest price.
2. If delta stats are present, update:
   - price delta
   - time delta
   - 1h PnL total
3. If CVD stats are present, update 5m buy percentage.
4. Save EMA, delta BB, price BB, divergence, ATR, and ATR SMA.
5. Update divergence persistence counters:
   - reset bullish counter to 4 on bullish divergence, otherwise decrement if active
   - reset bearish counter to 4 on bearish divergence, otherwise decrement if active
6. Recalculate bullish and bearish point totals.
7. Evaluate mandatory entry gates:
   - `pnl_total_1h > 1200`
   - `atr >= 100`
   - `atr > atr_sma`
8. Evaluate ATR immediate-close gate:
   - `atr < atr_sma`
9. If there is no active trade:
   - open LONG if gates pass and bullish points `>= 4`
   - else open SHORT if gates pass and bearish points `>= 4`
10. If there is an active trade:
   - close immediately on `atr < atr_sma`
   - otherwise close LONG when bullish points `<= 2`
   - otherwise close SHORT when bearish points `<= 2`
11. Re-render widget content.

## Sequencing Invariants for the Rewrite
- A closed 5m candle must observe the latest order-book delta snapshot and the latest trade-flow snapshot before point scoring happens.
- Delta Bollinger status must be derived from delta history that already contains the just-closed 5m candle's delta point.
- Logging must happen after the indicator snapshot has been finalized for that closed candle.
- Point-signal logs must reflect the exact indicator snapshot that caused the open or close.
- Reconnects must not reorder the per-event orchestration once normalized events enter the app pipeline.

