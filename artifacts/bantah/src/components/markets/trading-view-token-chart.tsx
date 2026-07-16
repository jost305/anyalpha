import { useEffect, useMemo, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  createChart,
  type CandlestickData,
  type HistogramData,
  type UTCTimestamp,
} from 'lightweight-charts';
import {
  fmtPrice,
  marketPairLabel,
  type MarketOhlcvCandle,
  type MarketToken,
  type MarketTokenTrade,
} from '@/lib/market-data';
import { cn } from '@/lib/utils';

interface TradingViewTokenChartProps {
  token: MarketToken;
  ohlcv: MarketOhlcvCandle[];
  trades: MarketTokenTrade[];
  className?: string;
  compact?: boolean;
}

interface PreparedChartData {
  candles: CandlestickData<UTCTimestamp>[];
  volume: HistogramData<UTCTimestamp>[];
  source: 'candles' | 'trades' | 'empty';
}

function toUtcSeconds(timestamp?: number): UTCTimestamp | null {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) return null;
  const seconds = timestamp > 10_000_000_000 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
  return seconds > 0 ? (seconds as UTCTimestamp) : null;
}

function isPositivePrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function precisionForPrice(value?: number) {
  if (!isPositivePrice(value)) return 8;
  const price = value;
  if (price >= 100) return 2;
  if (price >= 1) return 4;
  if (price >= 0.01) return 6;
  if (price >= 0.0001) return 8;
  return 10;
}

function candleFromOhlcv(candle: MarketOhlcvCandle): CandlestickData<UTCTimestamp> | null {
  const time = toUtcSeconds(candle.t);
  if (!time) return null;
  if (!isPositivePrice(candle.o) || !isPositivePrice(candle.h) || !isPositivePrice(candle.l) || !isPositivePrice(candle.c)) {
    return null;
  }

  return {
    time,
    open: candle.o,
    high: Math.max(candle.h, candle.o, candle.c),
    low: Math.min(candle.l, candle.o, candle.c),
    close: candle.c,
  };
}

function buildFromCandles(ohlcv: MarketOhlcvCandle[]): PreparedChartData | null {
  const candlesByTime = new Map<number, CandlestickData<UTCTimestamp>>();
  const volumeByTime = new Map<number, HistogramData<UTCTimestamp>>();

  for (const rawCandle of ohlcv) {
    const candle = candleFromOhlcv(rawCandle);
    if (!candle) continue;

    const key = Number(candle.time);
    candlesByTime.set(key, candle);
    volumeByTime.set(key, {
      time: candle.time,
      value: Math.max(0, rawCandle.v ?? 0),
      color: candle.close >= candle.open ? 'rgba(34,197,94,0.36)' : 'rgba(248,113,113,0.36)',
    });
  }

  const candles = [...candlesByTime.values()].sort((left, right) => Number(left.time) - Number(right.time)).slice(-420);
  if (candles.length < 2) return null;

  return {
    candles,
    volume: [...volumeByTime.values()].sort((left, right) => Number(left.time) - Number(right.time)).slice(-420),
    source: 'candles',
  };
}

function buildFromTrades(trades: MarketTokenTrade[]): PreparedChartData | null {
  const sortedTrades = trades
    .filter((trade) => isPositivePrice(trade.priceUsd) && toUtcSeconds(trade.timestamp))
    .sort((left, right) => (left.timestamp ?? 0) - (right.timestamp ?? 0));

  if (sortedTrades.length < 2) return null;

  const first = toUtcSeconds(sortedTrades[0]?.timestamp);
  const last = toUtcSeconds(sortedTrades[sortedTrades.length - 1]?.timestamp);
  const bucketSize = first && last && Number(last) - Number(first) < 15 * 60 ? 15 : 60;
  const buckets = new Map<number, { open: number; high: number; low: number; close: number; volume: number }>();

  for (const trade of sortedTrades) {
    const time = toUtcSeconds(trade.timestamp);
    const price = trade.priceUsd;
    if (!time || typeof price !== 'number' || !Number.isFinite(price) || price <= 0) continue;

    const bucketTime = Math.floor(Number(time) / bucketSize) * bucketSize;
    const volume = Math.max(0, trade.baseTokenAmountUsd ?? trade.quoteTokenAmountUsd ?? 0);
    const bucket = buckets.get(bucketTime);

    if (!bucket) {
      buckets.set(bucketTime, {
        open: price,
        high: price,
        low: price,
        close: price,
        volume,
      });
      continue;
    }

    bucket.high = Math.max(bucket.high, price);
    bucket.low = Math.min(bucket.low, price);
    bucket.close = price;
    bucket.volume += volume;
  }

  const candles = [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([time, bucket]) => ({
      time: time as UTCTimestamp,
      open: bucket.open,
      high: bucket.high,
      low: bucket.low,
      close: bucket.close,
    }))
    .slice(-420);

  if (candles.length < 2) return null;

  const volume = candles.map((candle) => {
    const bucket = buckets.get(Number(candle.time));
    return {
      time: candle.time,
      value: bucket?.volume ?? 0,
      color: candle.close >= candle.open ? 'rgba(34,197,94,0.36)' : 'rgba(248,113,113,0.36)',
    };
  });

  return {
    candles,
    volume,
    source: 'trades',
  };
}

function prepareChartData(ohlcv: MarketOhlcvCandle[], trades: MarketTokenTrade[]): PreparedChartData {
  return buildFromCandles(ohlcv) ?? buildFromTrades(trades) ?? { candles: [], volume: [], source: 'empty' };
}

function dexscreenerChartUrl(token: MarketToken): string | null {
  const chainId = token.chainId?.trim().toLowerCase();
  const pairAddress = token.pairAddress?.trim();
  if (!chainId || !pairAddress) return null;

  const params = new URLSearchParams({
    embed: '1',
    theme: 'dark',
    trades: '0',
    info: '0',
  });

  return `https://dexscreener.com/${encodeURIComponent(chainId)}/${encodeURIComponent(pairAddress)}?${params.toString()}`;
}

function DexScreenerChartFallback({
  token,
  className,
  compact,
}: {
  token: MarketToken;
  className?: string;
  compact: boolean;
}) {
  const chartUrl = dexscreenerChartUrl(token);

  if (!chartUrl) {
    return (
      <div className={cn('flex h-full min-h-[320px] items-center justify-center bg-background px-4 text-center', className)}>
        <div>
          <div className="text-sm font-black text-foreground">Live chart unavailable</div>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            This pair is missing a chartable pool address.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('relative h-full min-h-[320px] overflow-hidden bg-[#050506]', className)}>
      <iframe
        title={`${marketPairLabel(token)} live DEX chart`}
        src={chartUrl}
        className="absolute inset-0 h-full w-full border-0"
        loading="lazy"
        allow="clipboard-write; fullscreen"
      />
      <div className="pointer-events-none absolute left-2 top-2 z-10 max-w-[70%] rounded-md border border-border/70 bg-background/70 px-2 py-1 backdrop-blur">
        <div className="truncate text-xs font-black text-foreground">{marketPairLabel(token)}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
          <span>DEX live chart</span>
          <span className="text-primary">{fmtPrice(token.priceUsd)}</span>
        </div>
      </div>
      {!compact ? (
        <div className="pointer-events-none absolute right-2 top-2 z-10 rounded-md border border-border/70 bg-background/70 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary backdrop-blur">
          TradingView
        </div>
      ) : null}
    </div>
  );
}

export function TradingViewTokenChart({ token, ohlcv, trades, className, compact = false }: TradingViewTokenChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartData = useMemo(() => prepareChartData(ohlcv, trades), [ohlcv, trades]);
  const lastPrice = chartData.candles.at(-1)?.close ?? token.priceUsd;
  const precision = precisionForPrice(lastPrice);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || chartData.candles.length < 2) return;

    const chart = createChart(container, {
      autoSize: true,
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#050506' },
        textColor: '#94a3b8',
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: 'rgba(148,163,184,0.08)' },
        horzLines: { color: 'rgba(148,163,184,0.08)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(148,163,184,0.16)',
        scaleMargins: { top: 0.08, bottom: 0.24 },
      },
      timeScale: {
        borderColor: 'rgba(148,163,184,0.16)',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: 'rgba(245,46,43,0.46)', labelBackgroundColor: '#f52e2b' },
        horzLine: { color: 'rgba(245,46,43,0.46)', labelBackgroundColor: '#f52e2b' },
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        horzTouchDrag: true,
        mouseWheel: true,
        pressedMouseMove: true,
        vertTouchDrag: false,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#2dd4bf',
      wickDownColor: '#fb7185',
      priceFormat: {
        type: 'price',
        precision,
        minMove: Number((1 / 10 ** precision).toFixed(precision)),
      },
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      lastValueVisible: false,
      priceLineVisible: false,
    });

    candleSeries.setData(chartData.candles);
    volumeSeries.setData(chartData.volume);
    chart.priceScale('').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    chart.timeScale().fitContent();

    return () => {
      chart.remove();
    };
  }, [chartData.candles, chartData.volume, precision]);

  if (chartData.candles.length < 2) {
    return <DexScreenerChartFallback token={token} className={className} compact={compact} />;
  }

  return (
    <div className={cn('relative h-full min-h-[320px] overflow-hidden bg-[#050506]', className)}>
      <div
        ref={containerRef}
        className="absolute inset-0"
        aria-label={`${marketPairLabel(token)} TradingView live chart`}
      />
      <div className="pointer-events-none absolute left-2 top-2 z-10 max-w-[70%] rounded-md border border-border/70 bg-background/70 px-2 py-1 backdrop-blur">
        <div className="truncate text-xs font-black text-foreground">{marketPairLabel(token)}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
          <span>{chartData.source === 'candles' ? 'Live candles' : 'Trade-built candles'}</span>
          <span className="text-primary">{fmtPrice(lastPrice)}</span>
        </div>
      </div>
      {!compact ? (
        <div className="pointer-events-none absolute right-2 top-2 z-10 rounded-md border border-border/70 bg-background/70 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary backdrop-blur">
          TradingView
        </div>
      ) : null}
    </div>
  );
}
