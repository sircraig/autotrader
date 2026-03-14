import { useDeferredValue } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { OrderBook } from '@btc-tui/core/models';

import { useAppStore, type DashboardStoreState } from '../../store/app-store';
import { formatPrice, formatQuantity } from './format';
import { WidgetBadge, WidgetFrame } from './WidgetFrame';

function SideList(props: {
  label: string;
  levels: OrderBook['bids'] | OrderBook['asks'];
  tone: 'bid' | 'ask';
}) {
  const palette =
    props.tone === 'bid'
      ? {
          heading: 'text-matrix-accent',
          border: 'border-matrix-accent/20',
          background: 'bg-[rgba(4,18,9,0.65)]',
          price: 'text-matrix-accent-strong',
          quantity: 'text-matrix-accent'
        }
      : {
          heading: 'text-[#ffb9aa]',
          border: 'border-[#ff9d8e]/20',
          background: 'bg-[rgba(26,7,4,0.55)]',
          price: 'text-[#ffd2c8]',
          quantity: 'text-[#ffb9aa]'
        };

  return (
    <div>
      <p className={`mb-2 text-[0.72rem] uppercase tracking-[0.18em] ${palette.heading}`}>
        {props.label}
      </p>
      <div className="grid gap-2">
        {props.levels.length > 0 ? (
          props.levels.map((level, index) => (
            <div
              key={`${props.label}-${index}-${level.price}`}
              className={`grid grid-cols-[1fr_80px] gap-3 px-3 py-2 text-[0.78rem] uppercase ${palette.border} ${palette.background} border`}
            >
              <span className={palette.price}>{formatPrice(level.price)}</span>
              <span className={`text-right ${palette.quantity}`}>
                {formatQuantity(level.quantity)}
              </span>
            </div>
          ))
        ) : (
          <p className="m-0 text-[0.78rem] uppercase tracking-[0.12em] text-matrix-muted">
            no {props.label.toLowerCase()} depth
          </p>
        )}
      </div>
    </div>
  );
}

export function OrderBookWidget() {
  const { orderBook } = useAppStore(
    useShallow((state: DashboardStoreState) => ({
      orderBook: state.latestOrderBook
    }))
  );

  const deferredOrderBook = useDeferredValue(orderBook);
  const asks = deferredOrderBook?.asks.slice(0, 5) ?? [];
  const bids = deferredOrderBook?.bids.slice(0, 5) ?? [];

  return (
    <WidgetFrame
      title="Order Book Visual Analyzer"
      eyebrow="depth20 relay"
      aside={
        <WidgetBadge>
          {deferredOrderBook ? `u ${deferredOrderBook.lastUpdateId}` : 'offline'}
        </WidgetBadge>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <SideList label="ASKS" levels={asks} tone="ask" />
        <SideList label="BIDS" levels={bids} tone="bid" />
      </div>
    </WidgetFrame>
  );
}
