import { useEffect, useMemo, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowLeft,
  ArrowRightLeft,
  Copy,
  ExternalLink,
  Globe,
  Info,
  Layers3,
  MoreHorizontal,
  Send,
  Shield,
  Share2,
  Twitter,
  Users,
} from 'lucide-react';
import { getDexBrand } from '@/lib/dex-branding';
import {
  fmtAge,
  fmtCompact,
  fmtPct,
  fmtPrice,
  marketPairLabel,
  marketTokenPath,
  marketTokenUrl,
  type MarketOhlcvCandle,
  type MarketToken,
  type MarketTokenHolderPosition,
  type MarketTokenLink,
  type MarketTokenTrade,
} from '@/lib/market-data';
import { BundleLabel } from '@/components/markets/bundle-label';
import { TradingViewTokenChart } from '@/components/markets/trading-view-token-chart';
import { cn } from '@/lib/utils';
import SolanaSwapPanel from '@/components/trading/solana-swap-panel';

type MobileTokenSection = 'info' | 'chartTxns' | 'chart' | 'trades';

interface MobileChartPoint {
  label: string;
  price: number;
  volume: number;
  direction: 'buy' | 'sell' | 'mark';
}

interface TokenPageMobileProps {
  info: MarketToken;
  pairs: MarketToken[];
  ohlcv: MarketOhlcvCandle[];
  trades: MarketTokenTrade[];
  holders: MarketTokenHolderPosition[];
  holdersTotal?: number;
  txns24h: number;
  buyPressure: number;
  quoteSymbol: string;
  primaryLinks: MarketTokenLink[];
  updatedAgo: string;
  liveProviderCount: number;
  headlineTags: string[];
  onBack: () => void;
  onCopy: (value: string, label: string) => void;
}

function truncateMiddle(value: string, start = 6, end = 4) {
  if (!value) return 'n/a';
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function fmtInteger(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a';
  return Math.round(value).toLocaleString();
}

function fmtSignedCurrency(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a';
  return `${value > 0 ? '+' : ''}${fmtCompact(value, { currency: true })}`;
}

function fmtSupplyPct(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a';
  return `${value.toFixed(value >= 1 ? 1 : 2)}%`;
}

const RETRY_DELAY_MS = 4000;
const DETAIL_REFRESH_INTERVAL_MS = 5_000;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function timeAgo(timestamp?: number) {
  if (!timestamp) return 'n/a';

  const delta = Math.max(0, Date.now() - timestamp);
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return `${Math.max(1, seconds)}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function linkIcon(link: MarketTokenLink) {
  const kind = (link.type ?? link.label ?? '').toLowerCase();
  if (kind.includes('twitter') || kind === 'x') return Twitter;
  if (kind.includes('telegram')) return Send;
  return Globe;
}

function toneForValue(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'muted';
  return value >= 0 ? 'up' : 'down';
}

function safePositive(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function formatChartTime(timestamp?: number) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function buildOhlcvChartData(ohlcv: MarketOhlcvCandle[]): MobileChartPoint[] {
  return ohlcv
    .filter((candle) => safePositive(candle.c) && candle.t)
    .sort((a, b) => a.t - b.t)
    .slice(-160)
    .map((candle) => ({
      label: formatChartTime(candle.t),
      price: candle.c,
      volume: candle.v ?? 0,
      direction: candle.c >= candle.o ? 'buy' : 'sell',
    }));
}

function buildMobileChartData(info: MarketToken, trades: MarketTokenTrade[], ohlcv: MarketOhlcvCandle[]) {
  const candlePoints = buildOhlcvChartData(ohlcv);
  if (candlePoints.length >= 2) {
    return {
      data: candlePoints,
      source: 'Live candles',
    };
  }

  const tradePoints = trades
    .filter((trade) => safePositive(trade.priceUsd) && trade.timestamp)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    .slice(-32)
    .map((trade): MobileChartPoint => {
      const isBuy = trade.type.toLowerCase() === 'buy';

      return {
        label: formatChartTime(trade.timestamp),
        price: trade.priceUsd ?? 0,
        volume: trade.baseTokenAmountUsd ?? trade.quoteTokenAmountUsd ?? 0,
        direction: isBuy ? 'buy' : 'sell',
      };
    });

  if (tradePoints.length >= 5) {
    return {
      data: tradePoints,
      source: 'Recent trade prints',
    };
  }

  return {
    data: [],
    source: 'Opening live chart',
  };
}

function chartDomain(data: MobileChartPoint[]): [number | 'auto', number | 'auto'] {
  const prices = data.map((point) => point.price).filter((price) => Number.isFinite(price));
  if (prices.length === 0) return ['auto', 'auto'];

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) {
    const pad = Math.max(min * 0.02, 0.00000001);
    return [Math.max(0, min - pad), max + pad];
  }

  const pad = (max - min) * 0.12;
  return [Math.max(0, min - pad), max + pad];
}

function TokenAvatar({ token, className }: { token: MarketToken; className?: string }) {
  if (token.imageUrl) {
    return (
      <img
        src={token.imageUrl}
        alt={token.symbol}
        className={cn('rounded-2xl border border-border bg-muted object-cover', className)}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-2xl border border-primary/30 bg-primary/15 font-black text-primary',
        className,
      )}
    >
      {token.symbol.slice(0, 2).toUpperCase()}
    </div>
  );
}

function Pill({
  label,
  tone = 'muted',
  className,
}: {
  label: string;
  tone?: 'muted' | 'accent' | 'good' | 'warn' | 'bad';
  className?: string;
}) {
  const style =
    tone === 'accent'
      ? 'border-primary/30 bg-primary/12 text-primary'
      : tone === 'good'
        ? 'border-green-400/25 bg-green-400/10 text-green-400'
        : tone === 'warn'
          ? 'border-yellow-400/25 bg-yellow-400/10 text-yellow-300'
          : tone === 'bad'
            ? 'border-red-400/25 bg-red-400/10 text-red-400'
            : 'border-border bg-background/70 text-muted-foreground';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
        style,
        className,
      )}
    >
      {label}
    </span>
  );
}

function fmtBundlePct(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}

function fmtSignedPctCompact(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return `${value > 0 ? '+' : ''}${value.toFixed(Math.abs(value) >= 10 ? 1 : 2)}%`;
}

function MobileBundleSummary({ bundle }: { bundle?: MarketToken['bundle'] }) {
  const analysis = bundle ?? {
    label: 'unknown' as const,
    score: 0,
    coordinatedWallets: 0,
    supplySnipedPct: 0,
    sniperWallets: 0,
    deployerRugs: 0,
    reasons: [],
    evidence: {},
  };
  const topReason = analysis.reasons?.[0];
  const holderPnl = analysis.holderPnl;
  const pnlMetrics = holderPnl
    ? [
        ['Profit', fmtBundlePct(holderPnl.inProfitPct)],
        ['Loss', fmtBundlePct(holderPnl.inLossPct)],
        ['Bundle PnL', fmtSignedPctCompact(holderPnl.bundlePnl)],
        ['Retail PnL', fmtSignedPctCompact(holderPnl.retailPnl)],
      ]
    : [];

  return (
    <div className="border-y border-border/70 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Bundle</span>
        <BundleLabel bundle={bundle} showScore />
      </div>
      <div className="mt-1 grid grid-cols-3 gap-2 text-[10px]">
        <div>
          <div className="text-muted-foreground">Wallets</div>
          <div className="font-mono font-bold text-foreground">{analysis.label === 'unknown' ? 'n/a' : fmtInteger(analysis.coordinatedWallets)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Sniped</div>
          <div className="font-mono font-bold text-foreground">{analysis.label === 'unknown' ? 'n/a' : fmtBundlePct(analysis.supplySnipedPct)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Snipers</div>
          <div className="font-mono font-bold text-foreground">{analysis.label === 'unknown' ? 'n/a' : fmtInteger(analysis.sniperWallets)}</div>
        </div>
      </div>
      <div className="mt-1 truncate text-[11px] text-muted-foreground">
        {topReason?.label ?? 'Waiting for verified first-buy evidence'}
      </div>
      {pnlMetrics.length > 0 ? (
        <div className="mt-1 grid grid-cols-4 gap-1 border-t border-border/50 pt-1 text-[10px]">
          {pnlMetrics.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <div className="truncate text-muted-foreground">{label}</div>
              <div
                className={cn(
                  'truncate font-mono font-bold text-foreground',
                  String(value).startsWith('+') && 'text-green-400',
                  String(value).startsWith('-') && 'text-red-400',
                )}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MobileCard({
  title,
  subtitle: _subtitle,
  icon: Icon,
  aside,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('overflow-hidden border-y border-border/80 bg-card/80', className)}>
      <div className="flex items-start justify-between gap-2 border-b border-border/70 px-2.5 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px] font-black text-foreground">
            {Icon ? <Icon size={15} className="text-primary" /> : null}
            <span>{title}</span>
          </div>
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

function MetricTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'accent' | 'info' | 'up' | 'down';
}) {
  return (
    <div
      className={cn(
        'px-1 py-1.5',
        tone === 'accent' && 'text-primary',
        tone === 'info' && 'text-sky-700 dark:text-sky-300',
      )}
    >
      <div
        className={cn(
          'text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground',
          tone === 'accent' && 'text-primary/90',
          tone === 'info' && 'text-sky-700 dark:text-sky-300',
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          'mt-0.5 text-[13px] font-black text-foreground',
          tone === 'up' && 'text-green-400',
          tone === 'down' && 'text-red-400',
          tone === 'accent' && 'text-primary',
          tone === 'info' && 'text-sky-700 dark:text-sky-300',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function InlineStat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'accent' | 'up' | 'down';
}) {
  return (
    <div className="min-w-0 py-1">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div
        className={cn(
          'mt-0.5 truncate text-[13px] font-black tabular-nums text-foreground',
          tone === 'accent' && 'text-primary',
          tone === 'up' && 'text-green-400',
          tone === 'down' && 'text-red-400',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ActionLink({
  href,
  label,
  icon: Icon,
  tone = 'default',
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  tone?: 'default' | 'accent';
}) {
  const isInternal = href.startsWith('/');

  return (
    <a
      href={href}
      target={isInternal ? undefined : '_blank'}
      rel={isInternal ? undefined : 'noopener noreferrer'}
      className={cn(
        'tap-feedback inline-flex items-center justify-center gap-1.5 border-b px-1.5 py-1.5 text-[11px] font-semibold transition',
        tone === 'accent'
          ? 'border-primary/45 text-primary hover:text-primary/80'
          : 'border-border/70 text-foreground hover:border-primary/40 hover:text-primary',
      )}
    >
      <Icon size={15} />
      <span>{label}</span>
    </a>
  );
}

function CopyButton({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: (value: string, label: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onCopy(value, label)}
      className="tap-feedback inline-flex items-center justify-center gap-1.5 border-b border-border/70 px-1.5 py-1.5 text-[11px] font-semibold text-foreground transition hover:border-primary/40 hover:text-primary"
    >
      <Copy size={15} />
      <span>{label}</span>
    </button>
  );
}

function MobilePoolTape({ pairs }: { pairs: MarketToken[] }) {
  if (pairs.length === 0) {
    return <div className="px-4 py-8 text-sm text-muted-foreground">No tracked pools are available yet.</div>;
  }

  return (
    <div className="grid gap-1.5 p-2.5">
      {pairs.slice(0, 4).map((pair) => (
        <a
          key={pair.id}
          href={marketTokenPath(pair)}
          className="tap-feedback border-b border-border/70 p-2.5 transition last:border-b-0 hover:text-primary"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{marketPairLabel(pair)}</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Pill label={pair.chainLabel} tone="muted" />
                <Pill label={getDexBrand(pair.dexId)?.label ?? pair.dexId} tone="accent" />
              </div>
            </div>
            <ExternalLink size={14} className="shrink-0 text-muted-foreground" />
          </div>

          <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>Liq <b className="text-foreground">{fmtCompact(pair.liquidityUsd, { currency: true })}</b></span>
            <span>Vol <b className="text-foreground">{fmtCompact(pair.volume.h24, { currency: true })}</b></span>
            <span>
              24H{' '}
              <b className={cn((pair.priceChange.h24 ?? 0) >= 0 ? 'text-green-400' : 'text-red-400')}>
                {fmtPct(pair.priceChange.h24)}
              </b>
            </span>
          </div>
        </a>
      ))}
    </div>
  );
}

function NativeMobileChart({
  info,
  trades,
  ohlcv,
  pairs,
  buyPressure,
  quoteSymbol,
}: {
  info: MarketToken;
  trades: MarketTokenTrade[];
  ohlcv: MarketOhlcvCandle[];
  pairs: MarketToken[];
  buyPressure: number;
  quoteSymbol: string;
}) {
  const chart = useMemo(() => buildMobileChartData(info, trades, ohlcv), [info, ohlcv, trades]);
  const chartChange = info.priceChange.h24;
  const [chartHeight, setChartHeight] = useState(390);

  const startChartResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const startY = event.clientY;
    const startHeight = chartHeight;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setChartHeight(clamp(startHeight + moveEvent.clientY - startY, 200, 680));
    };

    const stopResize = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
    };

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
  };

  const resetChartHeight = () => {
    setChartHeight(390);
  };

  return (
    <section className="overflow-hidden border border-border bg-card">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-background px-2 py-1.5 text-xs">
        {['5s', '10s', '1m', '5m', '15m', '1h', '4h'].map((label) => (
          <button
            key={label}
            type="button"
            className={cn(
              'shrink-0 border border-transparent px-2 py-1 font-black transition',
              label === '1m' ? 'border-primary/35 bg-primary/12 text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px shrink-0 bg-border" />
        <span className="shrink-0 px-1 font-black text-primary">Price</span>
        <span className="shrink-0 text-muted-foreground">/ MCAP</span>
        <span className="ml-auto shrink-0 border border-border bg-card px-2 py-1 text-[10px] font-bold text-muted-foreground">
          {chart.source === 'Opening live chart' ? 'TradingView' : chart.source}
        </span>
      </div>

      <div className="flex items-start justify-between gap-2 border-b border-border/70 px-2.5 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-black text-foreground">
            {marketPairLabel(info)} · {pairs[0] ? getDexBrand(pairs[0].dexId)?.label ?? pairs[0].dexId : info.dexId}
          </div>
          <div className={cn('mt-1 font-mono text-sm font-bold', (chartChange ?? 0) >= 0 ? 'text-green-400' : 'text-red-400')}>
            {fmtPrice(info.priceUsd)} {fmtPct(chartChange)}
          </div>
        </div>
        <div className="shrink-0 text-right text-[11px] text-muted-foreground">
          <div>{fmtCompact(info.volume.h24, { currency: true })}</div>
          <div>{quoteSymbol}</div>
        </div>
      </div>

      <div className="border-y border-border bg-background" style={{ height: chartHeight }}>
        <TradingViewTokenChart token={info} ohlcv={ohlcv} trades={trades} compact className="min-h-0" />
      </div>

      <button
        type="button"
        onPointerDown={startChartResize}
        onDoubleClick={resetChartHeight}
        className="group relative z-20 flex h-3 w-full cursor-row-resize touch-none select-none items-center justify-center border-b border-border bg-[#0b0d12] shadow-[0_1px_0_rgba(0,0,0,0.8)] transition hover:border-primary/45 hover:bg-primary/10"
        aria-label="Resize chart"
        title="Pull up or down to resize chart. Double click to reset."
      >
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/80" />
        <span className="relative flex h-3 min-w-16 items-center justify-center rounded-full border border-border bg-background px-3 text-[9px] leading-none text-muted-foreground shadow-sm transition group-hover:border-primary/60 group-hover:text-primary">
          <span className="tracking-[0.28em]">...</span>
        </span>
      </button>

      <div className="grid grid-cols-4 border-b border-border bg-card text-center text-[11px]">
        <div className="border-r border-border px-2 py-2">
          <div className="text-muted-foreground">5M</div>
          <div className={cn('font-black', (info.priceChange.m5 ?? 0) >= 0 ? 'text-green-400' : 'text-red-400')}>{fmtPct(info.priceChange.m5)}</div>
        </div>
        <div className="border-r border-border px-2 py-2">
          <div className="text-muted-foreground">1H</div>
          <div className={cn('font-black', (info.priceChange.h1 ?? 0) >= 0 ? 'text-green-400' : 'text-red-400')}>{fmtPct(info.priceChange.h1)}</div>
        </div>
        <div className="border-r border-border px-2 py-2">
          <div className="text-muted-foreground">24H</div>
          <div className={cn('font-black', (info.priceChange.h24 ?? 0) >= 0 ? 'text-green-400' : 'text-red-400')}>{fmtPct(info.priceChange.h24)}</div>
        </div>
        <div className="px-2 py-2">
          <div className="text-muted-foreground">Buy</div>
          <div className={cn('font-black', buyPressure >= 50 ? 'text-green-400' : 'text-red-400')}>{buyPressure}%</div>
        </div>
      </div>
    </section>
  );
}

function MobileTradeList({
  trades,
  quoteSymbol,
}: {
  trades: MarketTokenTrade[];
  quoteSymbol: string;
}) {
  if (trades.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-1.5 p-2.5">
      {trades.map((trade) => {
        const isBuy = trade.type.toLowerCase() === 'buy';
        const source = trade.platform?.name ?? trade.operation ?? 'market';

        return (
          <div key={trade.id} className="border border-border bg-background/65 p-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Pill label={trade.type} tone={isBuy ? 'good' : 'bad'} />
                <span className="text-xs text-muted-foreground">{timeAgo(trade.timestamp)}</span>
              </div>
              <div className="text-right">
                <div className={cn('text-sm font-bold', isBuy ? 'text-green-400' : 'text-red-400')}>
                  {fmtPrice(trade.priceUsd)}
                </div>
                <div className="text-[11px] text-muted-foreground">{source}</div>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Value</div>
                <div className="mt-1 font-semibold text-foreground">
                  {fmtCompact(trade.baseTokenAmountUsd ?? trade.quoteTokenAmountUsd, { currency: true })}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Size</div>
                <div className="mt-1 font-semibold text-foreground">
                  {fmtCompact(trade.baseTokenAmount)} {quoteSymbol}
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Maker</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="font-mono text-foreground">{truncateMiddle(trade.makerAddress ?? trade.senderAddress ?? 'n/a', 8, 5)}</span>
                  {trade.labels[0] ? <Pill label={trade.labels[0]} tone="muted" /> : null}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MobileTxnTable({
  trades,
  quoteSymbol,
  txns,
}: {
  trades: MarketTokenTrade[];
  quoteSymbol: string;
  txns: MarketToken['txns'];
}) {
  if (trades.length === 0) {
    return null;
  }

  return (
    <div className="overflow-hidden border border-border bg-card">
      <div className="grid grid-cols-[0.72fr_1fr_0.9fr_0.9fr_0.9fr] border-b border-border bg-background text-[11px] text-muted-foreground">
        <div className="border-r border-border px-2 py-2">Type</div>
        <div className="border-r border-border px-2 py-2">Price</div>
        <div className="border-r border-border px-2 py-2 text-right">Size</div>
        <div className="border-r border-border px-2 py-2 text-right">Value</div>
        <div className="px-2 py-2 text-right">From</div>
      </div>
      {trades.map((trade) => {
        const isBuy = trade.type.toLowerCase() === 'buy';
        const amountUsd = trade.baseTokenAmountUsd ?? trade.quoteTokenAmountUsd;
        const maker = trade.makerAddress ?? trade.senderAddress ?? '';

        return (
          <div
            key={trade.id}
            className={cn(
              'grid grid-cols-[0.72fr_1fr_0.9fr_0.9fr_0.9fr] border-b border-border/80 text-[12px] last:border-0',
              isBuy ? 'bg-green-400/5' : 'bg-red-400/5',
            )}
          >
            <div className="px-2 py-2 text-muted-foreground">{timeAgo(trade.timestamp)}</div>
            <div className={cn('px-2 py-2 font-mono font-black', isBuy ? 'text-green-400' : 'text-red-400')}>
              {fmtPrice(trade.priceUsd)}
            </div>
            <div className="px-2 py-2 text-right font-mono text-foreground">{fmtCompact(trade.baseTokenAmount)}</div>
            <div className={cn('px-2 py-2 text-right font-mono font-bold', isBuy ? 'text-green-400' : 'text-red-400')}>
              {fmtCompact(amountUsd, { currency: true })}
            </div>
            <div className="px-2 py-2 text-right font-mono text-muted-foreground">{truncateMiddle(maker, 4, 4)}</div>
          </div>
        );
      })}
    </div>
  );
}

function MobileHolderList({
  holders,
  symbol,
}: {
  holders: MarketTokenHolderPosition[];
  symbol: string;
}) {
  if (holders.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-1.5 p-2.5">
      {holders.map((holder, index) => {
        const share = Math.max(0, Math.min(holder.percentageOfTotalSupply ?? 0, 100));
        const labelSet = holder.labels.length > 0 ? holder.labels : holder.walletMetadata?.entityLabels ?? [];
        const displayName = holder.walletMetadata?.entityName ?? truncateMiddle(holder.walletAddress, 8, 5);
        const pnlTone =
          typeof holder.totalPnlUsd === 'number' ? (holder.totalPnlUsd >= 0 ? 'text-green-400' : 'text-red-400') : 'text-foreground';

        return (
          <div key={holder.walletAddress} className="border border-border bg-background/65 p-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">#{index + 1}</span>
                  <div className="truncate text-sm font-semibold text-foreground">{displayName}</div>
                </div>
                <div className="mt-1 font-mono text-[11px] text-muted-foreground">{truncateMiddle(holder.walletAddress, 8, 5)}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-foreground">{fmtSupplyPct(holder.percentageOfTotalSupply)}</div>
                <div className="text-[11px] text-muted-foreground">{fmtCompact(holder.tokenAmountUsd, { currency: true })}</div>
              </div>
            </div>

            <div className="mt-2 h-1.5 overflow-hidden bg-muted">
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-orange-300" style={{ width: `${share}%` }} />
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Balance</div>
                <div className="mt-1 font-semibold text-foreground">
                  {fmtCompact(holder.tokenAmount)} {symbol}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">PnL</div>
                <div className={cn('mt-1 font-semibold', pnlTone)}>{fmtSignedCurrency(holder.totalPnlUsd)}</div>
              </div>
            </div>

            {labelSet.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {labelSet.slice(0, 3).map((label) => (
                  <Pill key={`${holder.walletAddress}-${label}`} label={label} tone="muted" />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function TokenPageMobile({
  info,
  pairs,
  ohlcv,
  trades,
  holders,
  holdersTotal,
  txns24h,
  buyPressure,
  quoteSymbol,
  primaryLinks,
  updatedAgo,
  liveProviderCount,
  headlineTags,
  onBack,
  onCopy,
}: TokenPageMobileProps) {
  const [activeSection, setActiveSection] = useState<MobileTokenSection>('info');

  useEffect(() => {
    setActiveSection('info');
  }, [info.tokenAddress]);

  const heroImage = info.openGraph || info.imageUrl;
  const visibleLinks = primaryLinks.length > 0 ? primaryLinks : info.links.slice(0, 6);
  const recentTrades = trades.slice(0, 18);
  const topHolders = holders.slice(0, 18);

  const top10Share = useMemo(
    () =>
      holders
        .slice(0, 10)
        .reduce((sum, holder) => sum + (typeof holder.percentageOfTotalSupply === 'number' ? holder.percentageOfTotalSupply : 0), 0),
    [holders],
  );

  const holderSegments = useMemo(() => {
    const top1 = holders[0]?.percentageOfTotalSupply ?? 0;
    const top5 = holders.slice(1, 5).reduce((sum, holder) => sum + (holder.percentageOfTotalSupply ?? 0), 0);
    const top10 = holders.slice(5, 10).reduce((sum, holder) => sum + (holder.percentageOfTotalSupply ?? 0), 0);
    const rest = Math.max(0, 100 - (top1 + top5 + top10));

    return [
      { label: 'Top 1', value: top1, color: 'bg-primary' },
      { label: 'Top 5', value: top5, color: 'bg-orange-300' },
      { label: 'Top 10', value: top10, color: 'bg-sky-400' },
      { label: 'Rest', value: rest, color: 'bg-muted-foreground/40' },
    ];
  }, [holders]);

  const safetyChecks = [
    {
      label: 'Verified Contract',
      value:
        info.security?.verifiedContract === undefined ? 'Not provided' : info.security.verifiedContract ? 'Verified' : 'Unverified',
      tone: info.security?.verifiedContract === undefined ? 'muted' : info.security.verifiedContract ? 'good' : 'warn',
    },
    {
      label: 'Mint Authority',
      value:
        info.security?.mintAuthorityDisabled === undefined ? 'Not provided' : info.security.mintAuthorityDisabled ? 'Locked' : 'Active',
      tone: info.security?.mintAuthorityDisabled === undefined ? 'muted' : info.security.mintAuthorityDisabled ? 'good' : 'warn',
    },
    {
      label: 'Freeze Authority',
      value:
        info.security?.freezeAuthorityDisabled === undefined ? 'Not provided' : info.security.freezeAuthorityDisabled ? 'Locked' : 'Active',
      tone: info.security?.freezeAuthorityDisabled === undefined ? 'muted' : info.security.freezeAuthorityDisabled ? 'good' : 'warn',
    },
    {
      label: 'Spam Filter',
      value:
        info.security?.possibleSpam === undefined ? 'Not provided' : info.security.possibleSpam ? 'Flagged' : 'Clear',
      tone: info.security?.possibleSpam === undefined ? 'muted' : info.security.possibleSpam ? 'bad' : 'good',
    },
    {
      label: 'Buy Tax',
      value: info.security?.buyTax ?? 'Not provided',
      tone: 'muted',
    },
    {
      label: 'Sell Tax',
      value: info.security?.sellTax ?? 'Not provided',
      tone: 'muted',
    },
    {
      label: 'Liquidity Burn',
      value:
        typeof info.security?.liquidityBurnPct === 'number'
          ? `${info.security.liquidityBurnPct.toFixed(1)}%`
          : 'Not provided',
      tone: 'muted',
    },
  ] as const;

  const sectionTabs: Array<{ id: MobileTokenSection; label: string; icon: LucideIcon }> = [
    { id: 'info', label: 'Info', icon: Info },
    { id: 'chartTxns', label: 'Chart+Txns', icon: Activity },
    { id: 'chart', label: 'Chart', icon: Activity },
    { id: 'trades', label: 'Trades', icon: ArrowRightLeft },
  ];

  const shareToken = () => {
    const shareUrl = marketTokenUrl(info);
    const title = `${marketPairLabel(info)} on AnyAlpha`;

    if (navigator.share) {
      void navigator.share({ title, text: `${info.name} live token view`, url: shareUrl }).catch(() => undefined);
      return;
    }

    onCopy(shareUrl, 'Token link');
  };

  const renderInfo = () => (
    <div className="motion-stagger space-y-2">
      <section className="overflow-hidden border-y border-border bg-card/85">
        <div className="relative h-24 overflow-hidden border-b border-border/70">
          {heroImage ? (
            <img
              src={heroImage}
              alt={info.name}
              className="h-full w-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(circle_at_top_left,rgba(255,173,102,0.35),transparent_45%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_35%),linear-gradient(135deg,rgba(255,142,43,0.18),rgba(10,14,24,0))]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/35 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex items-end gap-2 px-2.5 pb-2.5">
            <TokenAvatar token={info} className="h-12 w-12 shrink-0 rounded-md shadow-lg" />
            <div className="min-w-0">
              <div className="truncate text-base font-black tracking-tight text-white dark:text-foreground">{marketPairLabel(info)}</div>
              <div className="mt-0.5 truncate text-xs text-white/80 dark:text-muted-foreground">{info.name}</div>
            </div>
          </div>
        </div>

          <div className="space-y-2 px-2.5 py-2.5">
            <div className="flex flex-wrap gap-1.5">
              <Pill label={info.chainLabel} tone="muted" />
              <Pill label={getDexBrand(info.dexId)?.label ?? info.dexId} tone="accent" />
              <BundleLabel bundle={info.bundle} showScore />
              <Pill label={`Signal ${info.signalScore}/100`} tone={info.signalScore >= 80 ? 'good' : info.signalScore >= 60 ? 'warn' : 'muted'} />
              <Pill label={`Updated ${updatedAgo}`} tone="muted" />
            </div>

          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Spot Price</div>
              <div className="mt-0.5 text-[1.55rem] font-black leading-none tracking-tight text-foreground">{fmtPrice(info.priceUsd)}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {info.priceNative ?? 'n/a'} {quoteSymbol}
              </div>
            </div>
            <div className="border-l border-border/70 pl-2.5 text-right">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">MCap</div>
              <div className="mt-0.5 text-base font-black text-sky-700 dark:text-sky-300">
                {fmtCompact(info.marketCap ?? info.fdv, { currency: true })}
              </div>
              <div className={cn('mt-0.5 text-xs font-black', (info.priceChange.h24 ?? 0) >= 0 ? 'text-green-400' : 'text-red-400')}>
                {fmtPct(info.priceChange.h24)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-x-2 gap-y-0 border-y border-border/70 py-1">
            <InlineStat label="24H Vol" value={fmtCompact(info.volume.h24, { currency: true })} />
            <InlineStat label="Liquidity" value={fmtCompact(info.liquidityUsd, { currency: true })} />
            <InlineStat label="Txns" value={fmtInteger(txns24h)} tone="accent" />
            <InlineStat label="Holders" value={fmtInteger(holdersTotal)} />
            <InlineStat label="Age" value={fmtAge(info.ageMinutes)} />
            <InlineStat label="FDV" value={fmtCompact(info.fdv, { currency: true })} />
          </div>

          <div className="grid grid-cols-4 border-b border-border/70 pb-1 text-center">
            <InlineStat label="5M" value={fmtPct(info.priceChange.m5)} tone={toneForValue(info.priceChange.m5) as 'default' | 'up' | 'down'} />
            <InlineStat label="1H" value={fmtPct(info.priceChange.h1)} tone={toneForValue(info.priceChange.h1) as 'default' | 'up' | 'down'} />
            <InlineStat label="6H" value={fmtPct(info.priceChange.h6)} tone={toneForValue(info.priceChange.h6) as 'default' | 'up' | 'down'} />
            <InlineStat label="24H" value={fmtPct(info.priceChange.h24)} tone={toneForValue(info.priceChange.h24) as 'default' | 'up' | 'down'} />
          </div>

          <div className="grid grid-cols-4 gap-2">
            <ActionLink href={marketTokenPath(info)} label="AnyAlpha" icon={ExternalLink} tone="accent" />
            <CopyButton label="Token" value={info.tokenAddress} onCopy={onCopy} />
            <CopyButton label="Pair" value={info.pairAddress} onCopy={onCopy} />
            {visibleLinks[0] ? <ActionLink href={visibleLinks[0].url} label={visibleLinks[0].label ?? 'Open Link'} icon={linkIcon(visibleLinks[0])} /> : null}
          </div>

          <SolanaSwapPanel token={info} compact />
        </div>
      </section>

      <MobileCard
        title="Flow"
        icon={Activity}
        aside={<Pill label={`${buyPressure}% buy`} tone={buyPressure >= 50 ? 'good' : 'bad'} />}
      >
        <div className="px-2.5 py-2">
          <div>
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <span>24H Flow</span>
              <span>{fmtInteger(info.txns.h24.buys)} buys / {fmtInteger(info.txns.h24.sells)} sells</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden bg-muted">
              <div
                className="h-full bg-gradient-to-r from-green-400 via-primary to-red-400"
                style={{ width: `${Math.max(0, Math.min(buyPressure, 100))}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="text-green-400">{buyPressure}% buyers</span>
              <span className="text-red-400">{100 - buyPressure}% sellers</span>
            </div>
          </div>
        </div>
      </MobileCard>

      <MobileCard
        title="Markets & Links"
        icon={Layers3}
      >
        <div className="grid gap-1 px-2.5 py-2">
          {pairs.slice(0, 3).map((pair) => (
            <a
              key={pair.id}
              href={marketTokenPath(pair)}
              className="tap-feedback border-b border-border/70 pb-2 transition last:border-b-0 hover:text-primary"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{marketPairLabel(pair)}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Pill label={pair.chainLabel} tone="muted" />
                    <Pill label={getDexBrand(pair.dexId)?.label ?? pair.dexId} tone="accent" />
                  </div>
                </div>
                <ExternalLink size={14} className="shrink-0 text-muted-foreground" />
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>Liq <b className="text-foreground">{fmtCompact(pair.liquidityUsd, { currency: true })}</b></span>
                <span>Vol <b className="text-foreground">{fmtCompact(pair.volume.h24, { currency: true })}</b></span>
              </div>
            </a>
          ))}

          {visibleLinks.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 border-t border-border/70 pt-1.5">
              {visibleLinks.slice(0, 6).map((link) => {
                const Icon = linkIcon(link);
                return <ActionLink key={link.url} href={link.url} label={link.label ?? link.type ?? 'Open'} icon={Icon} />;
              })}
            </div>
          ) : (
            <div className="border border-dashed border-border bg-background/55 px-3 py-4 text-sm text-muted-foreground">
              No public links were returned by the current providers for this token.
            </div>
          )}
        </div>
      </MobileCard>

      {renderHolders()}
      {renderSafety()}
    </div>
  );

  const renderChartTxns = () => (
    <div className="motion-stagger space-y-2">
      <NativeMobileChart
        info={info}
        trades={recentTrades}
        ohlcv={ohlcv}
        pairs={pairs}
        buyPressure={buyPressure}
        quoteSymbol={quoteSymbol}
      />
      <MobileTxnTable trades={recentTrades.slice(0, 12)} quoteSymbol={quoteSymbol} txns={info.txns} />
    </div>
  );

  const renderChart = () => (
    <div className="motion-stagger space-y-2">
      <NativeMobileChart
        info={info}
        trades={recentTrades}
        ohlcv={ohlcv}
        pairs={pairs}
        buyPressure={buyPressure}
        quoteSymbol={quoteSymbol}
      />
      <MobileCard title="Active Pools" subtitle="Primary liquidity venues from the live market response." icon={Layers3}>
        <MobilePoolTape pairs={pairs} />
      </MobileCard>
    </div>
  );

  const renderHolders = () => (
    <div className="motion-stagger space-y-2">
      <MobileCard
        title="Distribution"
        subtitle="Top wallet concentration using the live holder breakdown returned by the API."
        icon={Users}
        aside={holdersTotal ? <Pill label={`${holdersTotal.toLocaleString()} holders`} tone="accent" /> : null}
      >
        <div className="space-y-2 p-2.5">
          <div className="grid grid-cols-3 gap-1.5">
            <MetricTile label="Top 10" value={fmtSupplyPct(top10Share)} tone="accent" />
            <MetricTile label="Largest" value={fmtSupplyPct(holders[0]?.percentageOfTotalSupply)} />
            <MetricTile label="Tracked" value={fmtInteger(topHolders.length)} />
          </div>

          <div className="overflow-hidden border border-border bg-background/60 p-2.5">
            <div className="flex h-3 overflow-hidden bg-muted">
              {holderSegments.map((segment) => (
                <div
                  key={segment.label}
                  className={segment.color}
                  style={{ width: `${Math.max(0, Math.min(segment.value, 100))}%` }}
                  title={`${segment.label}: ${segment.value.toFixed(1)}%`}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {holderSegments.map((segment) => (
                <span key={segment.label} className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={cn('h-2.5 w-2.5 rounded-full', segment.color)} />
                  <span>{segment.label}</span>
                  <span className="font-semibold text-foreground">{segment.value.toFixed(1)}%</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </MobileCard>

      <MobileCard title="Top Holders" subtitle="Largest wallets ranked by current supply share." icon={Layers3}>
        <MobileHolderList holders={topHolders} symbol={info.symbol} />
      </MobileCard>
    </div>
  );

  const renderTrades = () => (
    <div className="motion-stagger space-y-2">
      <MobileCard
        title="Transactions"
        subtitle="Latest on-chain flow returned for this market."
        icon={ArrowRightLeft}
        aside={txns24h ? <Pill label={`${txns24h.toLocaleString()} 24H`} tone="muted" /> : null}
      >
        <MobileTxnTable trades={recentTrades} quoteSymbol={quoteSymbol} txns={info.txns} />
      </MobileCard>
    </div>
  );

  const renderSafety = () => (
    <div className="motion-stagger space-y-2">
      <MobileCard
        title="AnyAlpha Score"
        subtitle="Signal score, activity balance, and immediate security context."
        icon={Shield}
        aside={<Pill label={`${info.signalScore}/100`} tone={info.signalScore >= 80 ? 'good' : info.signalScore >= 60 ? 'warn' : 'muted'} />}
      >
        <div className="space-y-2 p-2.5">
          <div className="grid grid-cols-2 gap-1.5">
            <MetricTile label="Pool" value={fmtCompact(info.liquidityUsd, { currency: true })} />
            <MetricTile label="Holders" value={fmtInteger(holdersTotal)} />
            <MetricTile label="Txns" value={fmtInteger(txns24h)} tone="accent" />
            <MetricTile label="Top 10" value={fmtSupplyPct(info.security?.top10HolderPct ?? top10Share)} />
          </div>
          <MobileBundleSummary bundle={info.bundle} />
          <div className="border border-border bg-background/60 p-2.5">
            <div className="flex items-center justify-between text-xs font-black">
              <span className="text-green-400">{buyPressure}%</span>
              <span className="text-red-400">{100 - buyPressure}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden bg-muted">
              <div className="h-full bg-green-400" style={{ width: `${Math.max(0, Math.min(buyPressure, 100))}%` }} />
            </div>
          </div>
        </div>
      </MobileCard>

      <MobileCard
        title="Risk Flags"
        subtitle="Current token warnings and headline context."
        icon={Shield}
        aside={info.riskFlags.length > 0 ? <Pill label={`${info.riskFlags.length} flag${info.riskFlags.length === 1 ? '' : 's'}`} tone="warn" /> : <Pill label="No major flags" tone="good" />}
      >
        <div className="flex flex-wrap gap-1.5 p-2.5">
          {info.riskFlags.length > 0
            ? info.riskFlags.map((flag) => <Pill key={flag} label={flag} tone="warn" />)
            : <Pill label="No major flags from current filters" tone="good" />}
          {headlineTags.map((tag) => (
            <Pill key={tag} label={tag} tone="muted" />
          ))}
        </div>
      </MobileCard>

      <MobileCard title="Contract State" subtitle="Verified metadata and enforcement checks returned by providers." icon={Shield}>
        <div className="grid gap-1.5 p-2.5">
          {safetyChecks.map((check) => (
            <div key={check.label} className="flex items-center justify-between gap-3 border border-border bg-background/65 px-2.5 py-2">
              <div className="text-sm font-medium text-foreground">{check.label}</div>
              <Pill
                label={check.value}
                tone={check.tone === 'good' || check.tone === 'warn' || check.tone === 'bad' ? check.tone : 'muted'}
              />
            </div>
          ))}
          {typeof info.security?.top10HolderPct === 'number' ? (
            <div className="flex items-center justify-between gap-3 border border-border bg-background/65 px-2.5 py-2">
              <div className="text-sm font-medium text-foreground">Top 10 Concentration</div>
              <Pill label={`${info.security.top10HolderPct.toFixed(1)}%`} tone={info.security.top10HolderPct > 50 ? 'warn' : 'muted'} />
            </div>
          ) : null}
        </div>
      </MobileCard>

      <MobileCard
        title="Providers"
        subtitle={`${liveProviderCount} live source${liveProviderCount === 1 ? '' : 's'} feeding this mobile view.`}
        icon={Layers3}
      >
        <div className="grid gap-1.5 p-2.5">
          {info.providers.length > 0 ? (
            info.providers.map((provider) => (
              <div key={provider.provider} className="flex items-center justify-between gap-3 border border-border bg-background/65 px-2.5 py-2">
                <div className="min-w-0">
                  <div className="font-semibold text-foreground">{provider.label}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{provider.detail ?? 'No provider detail'}</div>
                </div>
                <div className="text-right">
                  <div
                    className={cn(
                      'text-xs font-semibold uppercase tracking-[0.16em]',
                      provider.status === 'live' || provider.status === 'demo' ? 'text-green-400' : 'text-muted-foreground',
                    )}
                  >
                    {provider.status.replace('_', ' ')}
                  </div>
                  {provider.value ? <div className="mt-1 text-[11px] text-muted-foreground">{provider.value}</div> : null}
                </div>
              </div>
            ))
          ) : (
            <div className="border border-dashed border-border bg-background/55 px-3 py-4 text-sm text-muted-foreground">
              Provider metadata is not available for this token yet.
            </div>
          )}
        </div>
      </MobileCard>
    </div>
  );

  const content =
    activeSection === 'info'
      ? renderInfo()
      : activeSection === 'chartTxns'
        ? renderChartTxns()
      : activeSection === 'chart'
        ? renderChart()
        : renderTrades();

  return (
    <div className="flex h-[100svh] max-h-[100svh] min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[560px] flex-1 flex-col">
        <div className="mobile-app-bar sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur">
          <div className="space-y-1.5 px-2 py-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onBack}
                className="tap-feedback inline-flex h-8 w-8 shrink-0 items-center justify-center text-foreground transition hover:text-primary"
                aria-label="Back to markets"
              >
                <ArrowLeft size={17} />
              </button>

              <TokenAvatar token={info} className="h-9 w-9 shrink-0 rounded-md border-0 bg-transparent" />

              <button
                type="button"
                onClick={() => onCopy(info.tokenAddress, 'Token address')}
                className="tap-feedback min-w-0 flex-1 px-1 py-0.5 text-left"
              >
                <div className="truncate text-sm font-black tracking-tight text-foreground">
                  {info.symbol}
                  <span className="text-primary"> / </span>
                  <span className="text-muted-foreground">{quoteSymbol}</span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">Tap to copy token address</div>
              </button>

              <button
                type="button"
                onClick={() => setActiveSection('info')}
                className="tap-feedback inline-flex h-8 w-8 shrink-0 items-center justify-center text-foreground transition hover:text-primary"
                aria-label="Open token info"
              >
                <MoreHorizontal size={17} />
              </button>

              <button
                type="button"
                onClick={shareToken}
                className="tap-feedback inline-flex h-8 w-8 shrink-0 items-center justify-center text-foreground transition hover:text-primary"
                aria-label="Share token"
              >
                <Share2 size={17} />
              </button>
            </div>

            <div className="flex items-center gap-0 overflow-x-auto border-t border-border/55 pt-1 text-[11px]">
              <span className="shrink-0 border-r border-border/60 pr-2 font-mono text-muted-foreground">#{info.signalScore}</span>
              <span className="shrink-0 border-r border-border/60 px-2 font-black text-foreground">{info.symbol}</span>
              <span className="shrink-0 border-r border-border/60 px-2">
                <BundleLabel bundle={info.bundle} />
              </span>
              <span className={cn('shrink-0 border-r border-border/60 px-2 font-black', (info.priceChange.h24 ?? 0) >= 0 ? 'text-green-400' : 'text-red-400')}>
                {fmtPct(info.priceChange.h24)}
              </span>
              <span className="shrink-0 border-r border-border/60 px-2 text-muted-foreground">{fmtAge(info.ageMinutes)}</span>
              <span className="shrink-0 border-r border-border/60 px-2 text-muted-foreground">{getDexBrand(info.dexId)?.label ?? info.dexId}</span>
              <span className="shrink-0 pl-2 text-muted-foreground">Updated {updatedAgo}</span>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-2">
          {content}
        </div>

        <nav className="mobile-nav-shell sticky bottom-0 z-40 shrink-0 border-t border-border/90 bg-background/96 pb-[env(safe-area-inset-bottom)] md:hidden">
          <div className="flex gap-1 overflow-x-auto px-1.5 py-1.5">
            {sectionTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSection(tab.id)}
                className={cn(
                  'tap-feedback flex min-w-[72px] flex-1 flex-col items-center gap-0.5 border border-transparent px-1.5 py-1.5 text-[9px] font-black uppercase tracking-[0.08em] transition',
                  activeSection === tab.id
                    ? 'border-primary/30 bg-primary/12 text-primary'
                    : 'text-muted-foreground hover:border-border hover:bg-card hover:text-foreground',
                )}
              >
                <tab.icon size={17} className={activeSection === tab.id ? 'mobile-nav-icon-pop' : ''} />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
