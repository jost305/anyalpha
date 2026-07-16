import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowLeft,
  Copy,
  ExternalLink,
  Globe,
  Link2,
  Send,
  Twitter,
} from 'lucide-react';
import { toast } from 'sonner';
import { BundleLabel } from '@/components/markets/bundle-label';
import { TradingViewTokenChart } from '@/components/markets/trading-view-token-chart';
import { useIsMobile } from '@/hooks/use-mobile';
import { getDexBrand } from '@/lib/dex-branding';
import {
  awardBundleDetailView,
  fetchMarketDetail,
  fmtAge,
  fmtCompact,
  fmtPct,
  fmtPrice,
  marketPairLabel,
  marketTokenPath,
  type MarketDetailResponse,
  type MarketToken,
  type MarketTokenHolderPosition,
  type MarketTokenLink,
  type MarketTokenOrder,
  type MarketTokenTrade,
} from '@/lib/market-data';
import { applySeoMeta, tokenSeo } from '@/lib/seo';
import { cn } from '@/lib/utils';
import SolanaSwapPanel from '@/components/trading/solana-swap-panel';
import TokenPageMobile from './token-page-mobile';

const RETRY_DELAY_MS = 4000;
const DETAIL_REFRESH_INTERVAL_MS = 5_000;
const CHART_MIN_HEIGHT = 200;
const CHART_MAX_HEIGHT = 680;
const CHART_DEFAULT_HEIGHT = 350;

type DetailTab = 'trades' | 'orders' | 'positions' | 'history' | 'holders' | 'topTraders' | 'devTokens';

interface TokenPageProps {
  token: MarketToken;
  onBack: () => void;
}

function sameDetailToken(left: MarketDetailResponse | null, right: MarketDetailResponse) {
  return (
    left?.token.chainId.toLowerCase() === right.token.chainId.toLowerCase() &&
    left.token.tokenAddress.toLowerCase() === right.token.tokenAddress.toLowerCase()
  );
}

function preserveLiveRows(previous: MarketDetailResponse | null, next: MarketDetailResponse): MarketDetailResponse {
  if (!previous) return next;
  if (!sameDetailToken(previous, next)) return next;

  return {
    ...next,
    ohlcv: mergeStableCandles(next.ohlcv, previous.ohlcv),
    trades: mergeStableTrades(next.trades, previous.trades),
    orders: mergeStableOrders(next.orders, previous.orders),
    holders: mergeStableHolders(next.holders, previous.holders),
    holdersTotal: next.holdersTotal ?? previous.holdersTotal,
  };
}

function mergeStableTrades(fresh: MarketTokenTrade[], previous: MarketTokenTrade[]): MarketTokenTrade[] {
  const seen = new Set<string>();
  const merged: MarketTokenTrade[] = [];

  for (const trade of [...fresh, ...previous]) {
    const key = trade.transactionHash?.toLowerCase() || trade.id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(trade);
  }

  return merged.sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0)).slice(0, 300);
}

function mergeStableCandles(
  fresh: MarketDetailResponse['ohlcv'],
  previous: MarketDetailResponse['ohlcv'],
): MarketDetailResponse['ohlcv'] {
  const byTime = new Map<number, MarketDetailResponse['ohlcv'][number]>();
  for (const candle of previous) byTime.set(candle.t, candle);
  for (const candle of fresh) byTime.set(candle.t, candle);
  return [...byTime.values()].sort((left, right) => left.t - right.t).slice(-1000);
}

function mergeStableOrders(fresh: MarketTokenOrder[], previous: MarketTokenOrder[]): MarketTokenOrder[] {
  const seen = new Set<string>();
  const merged: MarketTokenOrder[] = [];

  for (const order of [...fresh, ...previous]) {
    const key = order.id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(order);
  }

  return merged.slice(0, 80);
}

function mergeStableHolders(
  fresh: MarketTokenHolderPosition[],
  previous: MarketTokenHolderPosition[],
): MarketTokenHolderPosition[] {
  const seen = new Set<string>();
  const merged: MarketTokenHolderPosition[] = [];

  for (const holder of [...fresh, ...previous]) {
    const key = holder.walletAddress.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(holder);
  }

  return merged.slice(0, 80);
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

function SmallPill({ label, tone = 'muted' }: { label: string; tone?: 'good' | 'warn' | 'bad' | 'muted' }) {
  const style =
    tone === 'good'
      ? 'border-green-400/20 bg-green-400/10 text-green-400'
      : tone === 'warn'
        ? 'border-yellow-400/20 bg-yellow-400/10 text-yellow-300'
        : tone === 'bad'
          ? 'border-red-400/20 bg-red-400/10 text-red-400'
          : 'border-border bg-muted/60 text-muted-foreground';

  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-4 tracking-[0.08em] ${style}`}>
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

function BundleMicroSummary({ bundle }: { bundle?: MarketToken['bundle'] }) {
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
  const metrics = [
    ['Score', analysis.label === 'unknown' ? 'Pending' : `${analysis.score}/100`],
    ['Wallets', analysis.label === 'unknown' ? 'n/a' : fmtInteger(analysis.coordinatedWallets)],
    ['Sniped', analysis.label === 'unknown' ? 'n/a' : fmtBundlePct(analysis.supplySnipedPct)],
    ['Snipers', analysis.label === 'unknown' ? 'n/a' : fmtInteger(analysis.sniperWallets)],
  ];
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
    <div className="mt-2 border-t border-border/70 pt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Bundle</span>
        <BundleLabel bundle={bundle} showScore />
      </div>
      <div className="mt-1 grid grid-cols-4 gap-1 text-[10px]">
        {metrics.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <div className="text-muted-foreground">{label}</div>
            <div className="truncate font-mono font-bold text-foreground">{value}</div>
          </div>
        ))}
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

function DexLogoBadge({
  dexId,
  size = 'sm',
}: {
  dexId: string;
  size?: 'xs' | 'sm' | 'md';
}) {
  const brand = getDexBrand(dexId);
  const shell = size === 'xs' ? 'h-5 w-5' : size === 'md' ? 'h-8 w-8' : 'h-6 w-6';
  const sizing = size === 'xs' ? 'h-4 w-4' : size === 'md' ? 'h-6 w-6' : 'h-5 w-5';

  if (!brand) {
    return (
      <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {dexId}
      </span>
    );
  }

  return (
    <span
      className={cn('inline-flex items-center justify-center rounded-full border border-border bg-muted/70', shell)}
      title={brand.label}
      aria-label={brand.label}
    >
      <img
        src={brand.logoUrl}
        alt={brand.label}
        className={cn('rounded-full object-contain', sizing)}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    </span>
  );
}

function DexBrandChip({ dexId }: { dexId: string }) {
  const brand = getDexBrand(dexId);

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/70 px-2 py-0.5 text-[10px] font-semibold leading-4 tracking-[0.08em] text-foreground">
      <DexLogoBadge dexId={dexId} size="xs" />
      <span>{brand?.label ?? dexId}</span>
    </span>
  );
}

function LinkButton({ link }: { link: MarketTokenLink }) {
  const Icon = linkIcon(link);
  const label = link.label ?? link.type ?? 'Website';

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
    >
      <Icon size={13} />
      <span>{label}</span>
    </a>
  );
}

function Panel({
  icon: Icon,
  title,
  subtitle,
  actions,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('overflow-hidden rounded border border-border bg-card/80', className)}>
      <div className="flex items-start justify-between gap-3 border-b border-border/80 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Icon size={15} className="text-primary" />
            <span>{title}</span>
          </div>
          {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function MetricTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'up' | 'down' | 'accent' | 'info';
}) {
  return (
    <div
      className={cn(
        'rounded border border-border bg-background/70 px-3 py-2',
        tone === 'accent' && 'border-primary/25 bg-primary/10',
        tone === 'info' && 'border-sky-400/25 bg-sky-400/10',
      )}
    >
      <div
        className={cn(
          'text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground',
          tone === 'accent' && 'text-primary/85 dark:text-primary/80',
          tone === 'info' && 'text-sky-700 dark:text-sky-300',
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-sm font-bold text-foreground',
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

function AddressButton({
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
      onClick={() => onCopy(value, label)}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-background/70 px-3 py-3 text-left transition hover:border-primary/35 hover:bg-muted/30"
    >
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
        <div className="mt-1 truncate font-mono text-xs text-foreground">{value}</div>
      </div>
      <Copy size={14} className="shrink-0 text-muted-foreground" />
    </button>
  );
}

function DenseMetric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'up' | 'down' | 'good' | 'warn';
}) {
  return (
    <div className="min-w-[86px] border-l border-border/70 px-3 first:border-l-0">
      <div className="text-[10px] font-medium text-muted-foreground">{label}</div>
      <div
        className={cn(
          'mt-0.5 truncate font-mono text-xs font-black tabular-nums text-foreground',
          tone === 'up' && 'text-green-400',
          tone === 'down' && 'text-red-400',
          tone === 'good' && 'text-green-400',
          tone === 'warn' && 'text-yellow-300',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function TradeTape({
  trades,
  symbol,
  quoteSymbol,
}: {
  trades: MarketTokenTrade[];
  symbol: string;
  quoteSymbol: string;
}) {
  if (trades.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-xs">
        <thead className="border-b border-border/80 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-semibold">Time</th>
            <th className="px-3 py-2 font-semibold">Type</th>
            <th className="px-3 py-2 font-semibold">USD</th>
            <th className="px-3 py-2 font-semibold">{symbol}</th>
            <th className="px-3 py-2 font-semibold">{quoteSymbol}</th>
            <th className="px-3 py-2 font-semibold">Price</th>
            <th className="px-3 py-2 font-semibold">Maker</th>
            <th className="px-3 py-2 font-semibold">Source</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => {
            const isBuy = trade.type.toLowerCase() === 'buy';

            return (
              <tr key={trade.id} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2 text-muted-foreground">{timeAgo(trade.timestamp)}</td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      'inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]',
                      isBuy ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400',
                    )}
                  >
                    {trade.type}
                  </span>
                </td>
                <td className="px-3 py-2 font-semibold text-foreground">
                  {fmtCompact(trade.baseTokenAmountUsd ?? trade.quoteTokenAmountUsd, { currency: true })}
                </td>
                <td className="px-3 py-2 text-foreground">{fmtCompact(trade.baseTokenAmount)}</td>
                <td className="px-3 py-2 text-muted-foreground">{fmtCompact(trade.quoteTokenAmount)}</td>
                <td className="px-3 py-2 font-mono text-foreground">{fmtPrice(trade.priceUsd)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-muted-foreground">{truncateMiddle(trade.makerAddress ?? trade.senderAddress ?? 'n/a')}</span>
                    {trade.labels[0] ? <SmallPill label={trade.labels[0]} tone="muted" /> : null}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {trade.platform?.name ? (
                    <div className="flex items-center gap-2">
                      {trade.platform.logo ? (
                        <img
                          src={trade.platform.logo}
                          alt={trade.platform.name}
                          className="h-4 w-4 rounded-full object-cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : null}
                      <span className="text-muted-foreground">{trade.platform.name}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">{trade.operation ?? 'regular'}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OrdersTable({ orders }: { orders: MarketTokenOrder[] }) {
  if (orders.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-xs">
        <thead className="border-b border-border/80 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-semibold">Type</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Paid</th>
            <th className="px-3 py-2 font-semibold">Source</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2 font-semibold text-foreground">{order.type ?? 'order'}</td>
              <td className="px-3 py-2">
                <span className="inline-flex rounded-md border border-border bg-background px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {order.status ?? 'unknown'}
                </span>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{timeAgo(order.paymentTimestamp ?? order.createdAt)}</td>
              <td className="px-3 py-2 text-muted-foreground">DexScreener</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HoldersTable({ holders }: { holders: MarketTokenHolderPosition[] }) {
  if (holders.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-xs">
        <thead className="border-b border-border/80 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-semibold">Wallet</th>
            <th className="px-3 py-2 font-semibold">Balance</th>
            <th className="px-3 py-2 font-semibold">Value</th>
            <th className="px-3 py-2 font-semibold">% Supply</th>
            <th className="px-3 py-2 font-semibold">PnL</th>
            <th className="px-3 py-2 font-semibold">Buys / Sells</th>
            <th className="px-3 py-2 font-semibold">Tags</th>
          </tr>
        </thead>
        <tbody>
          {holders.map((holder) => {
            const pnlTone =
              typeof holder.totalPnlUsd === 'number' ? (holder.totalPnlUsd >= 0 ? 'text-green-400' : 'text-red-400') : 'text-foreground';

            return (
              <tr key={holder.walletAddress} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    {holder.walletMetadata?.entityLogo ? (
                      <img
                        src={holder.walletMetadata.entityLogo}
                        alt={holder.walletMetadata.entityName ?? holder.walletAddress}
                        className="h-6 w-6 rounded-full border border-border object-cover"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : null}
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">
                        {holder.walletMetadata?.entityName ?? truncateMiddle(holder.walletAddress)}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{truncateMiddle(holder.walletAddress, 8, 5)}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-foreground">{fmtCompact(holder.tokenAmount)}</td>
                <td className="px-3 py-2 text-foreground">{fmtCompact(holder.tokenAmountUsd, { currency: true })}</td>
                <td className="px-3 py-2 text-foreground">{fmtSupplyPct(holder.percentageOfTotalSupply)}</td>
                <td className={cn('px-3 py-2 font-semibold', pnlTone)}>{fmtSignedCurrency(holder.totalPnlUsd)}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {(holder.buys ?? 0).toLocaleString()} / {(holder.sells ?? 0).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {(holder.labels.length > 0 ? holder.labels : holder.walletMetadata?.entityLabels ?? []).slice(0, 3).map((label) => (
                      <SmallPill key={`${holder.walletAddress}-${label}`} label={label} tone="muted" />
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function buildTopTraderRows(holders: MarketTokenHolderPosition[], trades: MarketTokenTrade[]): MarketTokenHolderPosition[] {
  const holderTraders = holders
    .filter((holder) => (holder.buys ?? 0) + (holder.sells ?? 0) > 0 || typeof holder.totalPnlUsd === 'number')
    .sort((a, b) => {
      const pnlDelta = (b.totalPnlUsd ?? Number.NEGATIVE_INFINITY) - (a.totalPnlUsd ?? Number.NEGATIVE_INFINITY);
      if (Number.isFinite(pnlDelta) && pnlDelta !== 0) return pnlDelta;
      return (b.tokenAmountUsd ?? 0) - (a.tokenAmountUsd ?? 0);
    })
    .slice(0, 25);

  if (holderTraders.length > 0) return holderTraders;

  const grouped = new Map<string, MarketTokenHolderPosition>();

  for (const trade of trades) {
    const walletAddress = trade.makerAddress ?? trade.senderAddress;
    if (!walletAddress) continue;

    const existing =
      grouped.get(walletAddress) ??
      ({
        walletAddress,
        tokenAmount: 0,
        tokenAmountUsd: 0,
        buys: 0,
        sells: 0,
        lastActivityAt: 0,
        labels: [],
        platform: trade.platform,
      } satisfies MarketTokenHolderPosition);
    const type = trade.type.toLowerCase();
    const amountUsd = trade.baseTokenAmountUsd ?? trade.quoteTokenAmountUsd ?? 0;

    grouped.set(walletAddress, {
      ...existing,
      tokenAmount: (existing.tokenAmount ?? 0) + (trade.baseTokenAmount ?? 0),
      tokenAmountUsd: (existing.tokenAmountUsd ?? 0) + amountUsd,
      buys: (existing.buys ?? 0) + (type === 'buy' ? 1 : 0),
      sells: (existing.sells ?? 0) + (type === 'sell' ? 1 : 0),
      lastActivityAt: Math.max(existing.lastActivityAt ?? 0, trade.timestamp ?? 0),
      platform: existing.platform ?? trade.platform,
    });
  }

  return [...grouped.values()]
    .filter((row) => (row.buys ?? 0) + (row.sells ?? 0) > 0)
    .sort((a, b) => (b.tokenAmountUsd ?? 0) - (a.tokenAmountUsd ?? 0))
    .slice(0, 25);
}

function TopTradersTable({ traders }: { traders: MarketTokenHolderPosition[] }) {
  if (traders.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-xs">
        <thead className="border-b border-border/80 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-semibold">Trader</th>
            <th className="px-3 py-2 font-semibold">PnL</th>
            <th className="px-3 py-2 font-semibold">Value</th>
            <th className="px-3 py-2 font-semibold">Balance</th>
            <th className="px-3 py-2 font-semibold">Buys / Sells</th>
            <th className="px-3 py-2 font-semibold">Last Active</th>
            <th className="px-3 py-2 font-semibold">Tags</th>
          </tr>
        </thead>
        <tbody>
          {traders.map((holder) => {
            const pnlTone =
              typeof holder.totalPnlUsd === 'number' ? (holder.totalPnlUsd >= 0 ? 'text-green-400' : 'text-red-400') : 'text-foreground';

            return (
              <tr key={`top-${holder.walletAddress}`} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2">
                  <div className="truncate font-medium text-foreground">
                    {holder.walletMetadata?.entityName ?? truncateMiddle(holder.walletAddress)}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{truncateMiddle(holder.walletAddress, 8, 5)}</div>
                </td>
                <td className={cn('px-3 py-2 font-semibold', pnlTone)}>{fmtSignedCurrency(holder.totalPnlUsd)}</td>
                <td className="px-3 py-2 text-foreground">{fmtCompact(holder.tokenAmountUsd, { currency: true })}</td>
                <td className="px-3 py-2 text-foreground">{fmtCompact(holder.tokenAmount)}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {(holder.buys ?? 0).toLocaleString()} / {(holder.sells ?? 0).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{timeAgo(holder.lastActivityAt ?? holder.lastTradeAt)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {(holder.labels.length > 0 ? holder.labels : holder.walletMetadata?.entityLabels ?? []).slice(0, 3).map((label) => (
                      <SmallPill key={`top-${holder.walletAddress}-${label}`} label={label} tone="muted" />
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PoolsPanel({ pairs }: { pairs: MarketToken[] }) {
  return (
    <div className="grid gap-2 p-2 md:grid-cols-2">
      {pairs.map((pair) => (
        <a
          key={pair.id}
          href={marketTokenPath(pair)}
          className="rounded border border-border bg-background/70 p-3 transition hover:border-primary/35 hover:bg-muted/30"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{marketPairLabel(pair)}</div>
              <div className="mt-1 flex flex-wrap gap-2">
                <SmallPill label={pair.chainLabel} tone="muted" />
                <DexBrandChip dexId={pair.dexId} />
              </div>
            </div>
            <ExternalLink size={14} className="shrink-0 text-muted-foreground" />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <MetricTile label="Liquidity" value={fmtCompact(pair.liquidityUsd, { currency: true })} />
            <MetricTile label="24H Vol" value={fmtCompact(pair.volume.h24, { currency: true })} />
            <MetricTile
              label="24H"
              value={fmtPct(pair.priceChange.h24)}
              tone={(pair.priceChange.h24 ?? 0) >= 0 ? 'up' : 'down'}
            />
            <MetricTile label="Age" value={fmtAge(pair.ageMinutes)} />
          </div>
        </a>
      ))}
    </div>
  );
}

function DesktopChartTerminal({
  info,
  ohlcv,
  trades,
  buyPressure,
  updatedAgo,
  chartHeight,
  onResizeStart,
  onResizeReset,
}: {
  info: MarketToken;
  ohlcv: MarketDetailResponse['ohlcv'];
  trades: MarketTokenTrade[];
  buyPressure: number;
  updatedAgo: string;
  chartHeight: number;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onResizeReset: () => void;
}) {
  const supply = info.fdv && info.priceUsd ? info.fdv / info.priceUsd : undefined;
  const auditSafe = info.riskFlags.length === 0;

  return (
    <section className="shrink-0 overflow-hidden rounded-t border border-b-0 border-border bg-card/80">
      <div className="flex min-h-[54px] items-center gap-2 overflow-x-auto border-b border-border bg-background/90 px-2 py-1.5">
        <TokenAvatar token={info} className="h-9 w-9 shrink-0 rounded" />
        <div className="min-w-[180px] max-w-[240px]">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-black text-foreground">{marketPairLabel(info)}</span>
            <span className="h-2 w-2 shrink-0 rounded-full bg-green-400" />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-mono text-green-400">{updatedAgo}</span>
            <span className="opacity-40">•</span>
            <span className="truncate">{getDexBrand(info.dexId)?.label ?? info.dexId}</span>
          </div>
        </div>

        <div className="ml-auto flex min-w-max items-center">
          <DenseMetric label="Price" value={fmtPrice(info.priceUsd)} />
          <DenseMetric label="Mkt Cap" value={fmtCompact(info.marketCap ?? info.fdv, { currency: true })} />
          <DenseMetric label="Liquidity" value={fmtCompact(info.liquidityUsd, { currency: true })} tone={info.liquidityUsd && info.liquidityUsd > 25000 ? 'good' : 'warn'} />
          <DenseMetric label="Supply" value={fmtCompact(supply)} />
          <DenseMetric label="24H" value={fmtPct(info.priceChange.h24)} tone={(info.priceChange.h24 ?? 0) >= 0 ? 'up' : 'down'} />
          <DenseMetric label="Audit" value={auditSafe ? 'Safe' : `${info.riskFlags.length} flags`} tone={auditSafe ? 'good' : 'warn'} />
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto border-b border-border bg-card/80 px-2 py-1.5 text-xs text-muted-foreground">
        {['5s', '10s', '1m', '5m', '15m', '1h', '4h'].map((label) => (
          <button
            key={label}
            type="button"
            className={cn(
              'shrink-0 border-r border-border/70 px-2 py-1 font-medium transition last:border-r-0',
              label === '1m' ? 'text-primary' : 'hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
        <span className="h-5 w-px shrink-0 bg-border" />
        <span className="shrink-0 font-semibold text-muted-foreground">Price</span>
        <span className="shrink-0 font-semibold text-primary">/ MCap</span>
        <span className="h-5 w-px shrink-0 bg-border" />
        <span className="shrink-0">Buy pressure</span>
        <span className={cn('shrink-0 font-mono font-black', buyPressure >= 50 ? 'text-green-400' : 'text-red-400')}>{buyPressure}%</span>
      </div>

      <div className="bg-background" style={{ height: chartHeight }}>
        <TradingViewTokenChart token={info} ohlcv={ohlcv} trades={trades} />
      </div>

      <button
        type="button"
        onPointerDown={onResizeStart}
        onDoubleClick={onResizeReset}
        className="group relative z-20 flex h-4 w-full cursor-row-resize touch-none select-none items-center justify-center border-y border-border bg-muted/30 transition hover:border-primary/45 hover:bg-primary/10"
        aria-label="Resize chart"
        title="Pull up or down to resize chart. Double click to reset."
      >
        <div className="flex gap-1">
          <span className="h-1 w-8 rounded-full bg-muted-foreground/40 transition group-hover:bg-primary/80" />
          <span className="h-1 w-8 rounded-full bg-muted-foreground/40 transition group-hover:bg-primary/80" />
        </div>
      </button>
    </section>
  );
}

function CompactStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'up' | 'down' | 'accent';
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium text-muted-foreground">{label}</div>
      <div
        className={cn(
          'mt-0.5 truncate text-sm font-bold tabular-nums text-foreground',
          tone === 'up' && 'text-green-400',
          tone === 'down' && 'text-red-400',
          tone === 'accent' && 'text-primary',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function TokenSidebarSummary({
  info,
  headlineTags,
  holdersTotal,
  quoteSymbol,
  txns24h,
  updatedAgo,
}: {
  info: MarketToken;
  headlineTags: string[];
  holdersTotal?: number;
  quoteSymbol: string;
  txns24h: number;
  updatedAgo: string;
}) {
  const stats = [
    ['MC', fmtCompact(info.marketCap ?? info.fdv, { currency: true })],
    ['Vol', fmtCompact(info.volume.h24, { currency: true })],
    ['Liq', fmtCompact(info.liquidityUsd, { currency: true })],
    ['Holders', fmtInteger(holdersTotal)],
  ];
  const tags = [
    ...headlineTags,
    ...(info.links.length === 0 ? ['No public links'] : []),
  ].filter((tag, index, list) => list.indexOf(tag) === index);

  return (
    <section className="border border-border bg-card/80 p-2.5">
      <div className="flex items-start gap-2.5">
        <TokenAvatar token={info} className="h-9 w-9 shrink-0 rounded" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-black tracking-tight text-foreground">{marketPairLabel(info)}</div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{info.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <SmallPill label={info.chainLabel} tone="muted" />
            <DexBrandChip dexId={info.dexId} />
            <BundleLabel bundle={info.bundle} showScore />
          </div>
        </div>
      </div>

      {info.description ? (
        <p className="mt-2 text-xs leading-snug text-muted-foreground">{info.description}</p>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-1">
        <span
          className={cn(
            'rounded border px-1.5 py-0.5 text-[9px] font-black leading-3',
            info.signalScore >= 80
              ? 'border-green-400/20 bg-green-400/10 text-green-400'
              : info.signalScore >= 60
                ? 'border-yellow-400/20 bg-yellow-400/10 text-yellow-300'
                : 'border-border bg-muted/50 text-muted-foreground',
          )}
        >
          Signal {info.signalScore}/100
        </span>
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded border border-border bg-muted/45 px-1.5 py-0.5 text-[9px] font-semibold leading-3 text-muted-foreground"
          >
            {tag}
          </span>
        ))}
      </div>

      <BundleMicroSummary bundle={info.bundle} />

      <div className="mt-2 border-t border-border/70 pt-2">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Price</div>
            <div className="mt-0.5 truncate text-xl font-black tracking-tight text-foreground">{fmtPrice(info.priceUsd)}</div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              {info.priceNative ?? 'n/a'} {quoteSymbol}
            </div>
          </div>
          <div className={cn('shrink-0 text-right text-base font-black', (info.priceChange.h24 ?? 0) >= 0 ? 'text-green-400' : 'text-red-400')}>
            {fmtPct(info.priceChange.h24)}
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">24H</div>
          </div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border/70 pt-2">
        {stats.map(([label, value]) => (
          <div key={label} className="flex min-w-0 items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">{label}</span>
            <span className="truncate font-mono font-bold text-foreground">{value}</span>
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border/70 pt-2 text-[11px] text-muted-foreground">
        <span className="rounded-md border border-border bg-background/70 px-1.5 py-0.5">TX {fmtInteger(txns24h)}</span>
        <span className="rounded-md border border-border bg-background/70 px-1.5 py-0.5">Age {fmtAge(info.ageMinutes)}</span>
        <span className="rounded-md border border-border bg-background/70 px-1.5 py-0.5">Updated {updatedAgo}</span>
      </div>

      <a
        href={marketTokenPath(info)}
        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1.5 text-xs font-semibold text-foreground transition hover:bg-primary/15"
      >
        Open AnyAlpha Link
        <ExternalLink size={13} />
      </a>
    </section>
  );
}

function TradingPanel({
  info,
  buyPressure,
  holdersTotal,
}: {
  info: MarketToken;
  buyPressure: number;
  holdersTotal?: number;
}) {
  return (
    <aside className="flex min-h-0 flex-col border-l border-border bg-card">
      <div className="grid grid-cols-2 border-b border-border text-sm font-bold">
        <button type="button" disabled className="bg-green-400/10 px-3 py-2 text-green-400/70">Buy locked</button>
        <button type="button" disabled className="px-3 py-2 text-muted-foreground">Sell locked</button>
      </div>

      <div className="grid gap-2 border-b border-border p-2">
        <div className="grid grid-cols-2 gap-2">
          <CompactStat label="5m Vol" value={fmtCompact(info.volume.m5, { currency: true })} />
          <CompactStat label="Buy Pressure" value={`${buyPressure}%`} tone={buyPressure >= 50 ? 'up' : 'down'} />
          <CompactStat label="Liquidity" value={fmtCompact(info.liquidityUsd, { currency: true })} />
          <CompactStat label="Holders" value={fmtInteger(holdersTotal)} />
        </div>
        <div className="h-1.5 overflow-hidden rounded-sm bg-muted">
          <div
            className="h-full bg-gradient-to-r from-green-400 to-primary"
            style={{ width: `${Math.max(0, Math.min(100, buyPressure))}%` }}
          />
        </div>
      </div>

      <div className="grid gap-2 p-2">
        <SolanaSwapPanel token={info} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border p-2">
        <div className="mb-2 text-xs font-bold text-foreground">Token Info</div>
        <div className="grid gap-1.5 text-xs">
          <div className="flex items-center justify-between gap-3 border-b border-border/70 py-1.5">
            <span className="text-muted-foreground">MC</span>
            <span className="font-mono font-bold text-foreground">{fmtCompact(info.marketCap ?? info.fdv, { currency: true })}</span>
          </div>
          <div className="flex items-center justify-between gap-3 border-b border-border/70 py-1.5">
            <span className="text-muted-foreground">Price</span>
            <span className="font-mono font-bold text-foreground">{fmtPrice(info.priceUsd)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 border-b border-border/70 py-1.5">
            <span className="text-muted-foreground">Age</span>
            <span className="font-mono font-bold text-foreground">{fmtAge(info.ageMinutes)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 py-1.5">
            <span className="text-muted-foreground">Signal</span>
            <span className="font-mono font-bold text-primary">{info.signalScore}/100</span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {(info.riskFlags.length > 0 ? info.riskFlags : ['No major flags']).slice(0, 6).map((flag) => (
            <span key={flag} className="rounded-md border border-border bg-background px-2 py-1 text-[10px] font-semibold text-muted-foreground">
              {flag}
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}

export default function TokenPage({ token, onBack }: TokenPageProps) {
  const isMobile = useIsMobile();
  const { authenticated, getAccessToken } = usePrivy();
  const [detail, setDetail] = useState<MarketDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [activeTab, setActiveTab] = useState<DetailTab>('trades');
  const [chartHeight, setChartHeight] = useState(CHART_DEFAULT_HEIGHT);

  useEffect(() => {
    const controller = new AbortController();
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;
    let refreshTimeout: ReturnType<typeof setTimeout> | undefined;
    let failed = false;
    const isInitialLoad =
      !detail ||
      detail.token.chainId !== token.chainId ||
      detail.token.tokenAddress !== token.tokenAddress;

    if (isInitialLoad) {
      setDetail(null);
      setLoading(true);
    }
    setError(null);

    fetchMarketDetail(token.chainId, token.tokenAddress, controller.signal)
      .then((nextDetail) => {
        setDetail((previousDetail) => preserveLiveRows(previousDetail, nextDetail));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        failed = true;
        setError(err instanceof Error ? err.message : 'Failed to load token details.');
        retryTimeout = setTimeout(() => {
          setRefreshTick((tick) => tick + 1);
        }, RETRY_DELAY_MS);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
        if (!failed) {
          refreshTimeout = setTimeout(() => {
            setRefreshTick((tick) => tick + 1);
          }, DETAIL_REFRESH_INTERVAL_MS);
        }
      });

    return () => {
      if (retryTimeout) clearTimeout(retryTimeout);
      if (refreshTimeout) clearTimeout(refreshTimeout);
      controller.abort();
    };
  }, [refreshTick, token.chainId, token.tokenAddress]);

  const info = detail?.token ?? token;
  const pairs = detail?.pairs ?? [token];
  const ohlcv = detail?.ohlcv ?? [];
  const trades = detail?.trades ?? [];
  const orders = detail?.orders ?? [];
  const holders = detail?.holders ?? [];
  const topTraderRows = useMemo(() => buildTopTraderRows(holders, trades), [holders, trades]);
  const txns24h = info.txns.h24.buys + info.txns.h24.sells;
  const buyPressure = txns24h > 0 ? Math.round((info.txns.h24.buys / txns24h) * 100) : 0;
  const holdersTotal = detail?.holdersTotal ?? info.security?.holderCount;
  const quoteSymbol = info.quoteSymbol || info.chainLabel;
  const primaryLinks = useMemo(() => info.links.slice(0, 4), [info.links]);
  const updatedAgo = detail ? timeAgo(Date.parse(detail.updatedAt)) : 'n/a';
  const headlineTags = (info.narrativeTags.length > 0 ? info.narrativeTags : info.riskFlags).slice(0, 4);

  useEffect(() => {
    applySeoMeta(tokenSeo(info));
  }, [info]);

  useEffect(() => {
    if (!authenticated || !info.bundle || info.bundle.label === 'unknown') return;

    const controller = new AbortController();
    void getAccessToken()
      .then((accessToken) => {
        if (!accessToken) return null;
        return awardBundleDetailView(accessToken, info.chainId, info.tokenAddress, controller.signal);
      })
      .catch(() => null);

    return () => controller.abort();
  }, [authenticated, getAccessToken, info.bundle?.label, info.chainId, info.tokenAddress]);

  const copyValue = (value: string, label: string) => {
    void navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  const startChartResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const startY = event.clientY;
    const startHeight = chartHeight;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setChartHeight(clamp(startHeight + moveEvent.clientY - startY, CHART_MIN_HEIGHT, CHART_MAX_HEIGHT));
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
    setChartHeight(CHART_DEFAULT_HEIGHT);
  };

  if (!detail && error) {
    return (
      <div className="h-full overflow-auto bg-background p-4">
        <div className="mx-auto max-w-3xl rounded-[28px] border border-border bg-card p-6">
          <div className="text-sm font-semibold text-foreground">Token details are unavailable right now.</div>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <button
            onClick={() => setRefreshTick((tick) => tick + 1)}
            className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            type="button"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (isMobile) {
    return (
      <TokenPageMobile
        info={info}
        pairs={pairs}
        ohlcv={ohlcv}
        trades={trades}
        holders={holders}
        holdersTotal={holdersTotal}
        txns24h={txns24h}
        buyPressure={buyPressure}
        quoteSymbol={quoteSymbol}
        primaryLinks={primaryLinks}
        updatedAgo={updatedAgo}
        liveProviderCount={info.providers.filter((provider) => provider.status === 'live').length}
        headlineTags={headlineTags}
        onBack={onBack}
        onCopy={copyValue}
      />
    );
  }

  return (
    <div className="h-full overflow-auto bg-background xl:overflow-hidden">
      <div className="mx-auto flex min-h-full max-w-[1500px] flex-col gap-1.5 px-2 py-2 text-foreground xl:h-full">
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border/70 px-1 pb-1 text-[11px] text-muted-foreground">
          <button onClick={onBack} className="flex items-center gap-1.5 transition hover:text-foreground">
            <ArrowLeft size={13} />
            <span>Back</span>
          </button>
          <span className="opacity-40">/</span>
          <span>Markets</span>
          <span className="opacity-40">/</span>
          <span>{info.chainLabel}</span>
          <span className="opacity-40">/</span>
          <DexBrandChip dexId={info.dexId} />
          <span className="opacity-40">/</span>
          <span className="font-semibold text-foreground">{info.symbol}</span>
        </div>

        <div className="grid h-full grid-cols-1 gap-2 xl:grid-cols-[1fr_320px]">
          <div className="flex min-w-0 flex-col xl:h-full xl:min-h-0">
            <DesktopChartTerminal
              info={info}
              ohlcv={ohlcv}
              trades={trades}
              buyPressure={buyPressure}
              updatedAgo={updatedAgo}
              chartHeight={chartHeight}
              onResizeStart={startChartResize}
              onResizeReset={resetChartHeight}
            />

            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b border border-border bg-card/80">
              <div className="flex items-center gap-2 overflow-x-auto border-b border-border bg-background/90 px-2 py-1.5">
                <div className="flex min-w-max items-center gap-1">
                  {([
                    ['trades', 'Trades'],
                    ['orders', orders.length > 0 ? `Orders(${orders.length})` : 'Orders'],
                    ['positions', 'Positions'],
                    ['history', 'History'],
                    ['holders', holders.length > 0 ? `Holders(${holders.length})` : 'Holders'],
                    ['topTraders', topTraderRows.length > 0 ? `Top Traders(${topTraderRows.length})` : 'Top Traders'],
                    ['devTokens', 'Dev Tokens'],
                  ] as const).map(([tab, label]) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        'rounded-md px-2.5 py-1.5 text-xs font-semibold transition',
                        activeTab === tab
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                  {trades.length > 0 ? <span>{trades.length} trades</span> : null}
                  {trades.length > 0 && holders.length > 0 ? <span className="hidden sm:inline">/</span> : null}
                  {holders.length > 0 ? <span className="hidden sm:inline">{holders.length} holder rows</span> : null}
                  <span className="hidden md:inline">Updated {updatedAgo}</span>
                  <button
                    type="button"
                    onClick={() => setRefreshTick((tick) => tick + 1)}
                    className="rounded-md border border-border bg-card px-2 py-1 font-semibold text-foreground transition hover:border-primary/35"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto">
                {activeTab === 'trades' ? (
                  <TradeTape trades={trades} symbol={info.symbol} quoteSymbol={quoteSymbol} />
                ) : activeTab === 'orders' ? (
                  <OrdersTable orders={orders} />
                ) : activeTab === 'positions' ? (
                  null
                ) : activeTab === 'history' ? (
                  null
                ) : activeTab === 'holders' ? (
                  <HoldersTable holders={holders} />
                ) : activeTab === 'topTraders' ? (
                  <TopTradersTable traders={topTraderRows} />
                ) : (
                  null
                )}
              </div>
            </section>
          </div>

          <div className="grid content-start gap-2 self-start xl:h-full xl:min-h-0 xl:overflow-y-auto xl:pr-1">
            <TokenSidebarSummary
              info={info}
              headlineTags={headlineTags}
              holdersTotal={holdersTotal}
              quoteSymbol={quoteSymbol}
              txns24h={txns24h}
              updatedAgo={updatedAgo}
            />

            <TradingPanel
              info={info}
              buyPressure={buyPressure}
              holdersTotal={holdersTotal}
            />

            <Panel
              icon={Link2}
              title="Links & Access"
              subtitle="Trade, public links, and contract ids."
            >
              <div className="grid gap-3 p-4">
                <a
                  href={marketTokenPath(info)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/35 bg-primary/10 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-primary/15"
                >
                  Open AnyAlpha
                  <ExternalLink size={14} />
                </a>

                {primaryLinks.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {primaryLinks.map((link) => (
                      <LinkButton key={link.url} link={link} />
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    No public links returned by the current providers.
                  </div>
                )}

                <div className="grid gap-2">
                  <AddressButton label="Token address" value={info.tokenAddress} onCopy={copyValue} />
                  <AddressButton label="Pair address" value={info.pairAddress} onCopy={copyValue} />
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
