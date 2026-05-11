import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowLeft,
  Bell,
  Clock3,
  Copy,
  Database,
  ExternalLink,
  Globe,
  Layers3,
  Link2,
  Send,
  Shield,
  Sparkles,
  Star,
  Twitter,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { ContentSkeleton } from '@/components/common/skeletons';
import { getDexBrand } from '@/lib/dex-branding';
import {
  fetchMarketDetail,
  fmtAge,
  fmtCompact,
  fmtPct,
  fmtPrice,
  marketPairLabel,
  type MarketDetailResponse,
  type MarketToken,
  type MarketTokenHolderPosition,
  type MarketTokenLink,
  type MarketTokenTrade,
} from '@/lib/market-data';
import { cn } from '@/lib/utils';

const RETRY_DELAY_MS = 4000;

type DetailTab = 'trades' | 'holders' | 'pools';

interface TokenPageProps {
  token: MarketToken;
  onBack: () => void;
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

  return <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${style}`}>{label}</span>;
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
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground">
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
    <section className={cn('overflow-hidden rounded-2xl border border-border bg-card/80', className)}>
      <div className="flex items-start justify-between gap-3 border-b border-border/80 px-4 py-3">
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
  tone?: 'neutral' | 'up' | 'down' | 'accent';
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-background/70 p-3',
        tone === 'accent' && 'border-violet-500/25 bg-violet-500/10',
      )}
    >
      <div
        className={cn(
          'text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground',
          tone === 'accent' && 'text-violet-700/85 dark:text-violet-200/75',
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-sm font-bold text-foreground',
          tone === 'up' && 'text-green-400',
          tone === 'down' && 'text-red-400',
          tone === 'accent' && 'text-violet-700 dark:text-violet-300',
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
    return <div className="px-4 py-8 text-sm text-muted-foreground">No recent Mobula trade tape came back for this token yet.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-xs">
        <thead className="border-b border-border/80 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-semibold">Time</th>
            <th className="px-4 py-3 font-semibold">Type</th>
            <th className="px-4 py-3 font-semibold">USD</th>
            <th className="px-4 py-3 font-semibold">{symbol}</th>
            <th className="px-4 py-3 font-semibold">{quoteSymbol}</th>
            <th className="px-4 py-3 font-semibold">Price</th>
            <th className="px-4 py-3 font-semibold">Maker</th>
            <th className="px-4 py-3 font-semibold">Source</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => {
            const isBuy = trade.type.toLowerCase() === 'buy';

            return (
              <tr key={trade.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3 text-muted-foreground">{timeAgo(trade.timestamp)}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]',
                      isBuy ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400',
                    )}
                  >
                    {trade.type}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold text-foreground">
                  {fmtCompact(trade.baseTokenAmountUsd ?? trade.quoteTokenAmountUsd, { currency: true })}
                </td>
                <td className="px-4 py-3 text-foreground">{fmtCompact(trade.baseTokenAmount)}</td>
                <td className="px-4 py-3 text-muted-foreground">{fmtCompact(trade.quoteTokenAmount)}</td>
                <td className="px-4 py-3 font-mono text-foreground">{fmtPrice(trade.priceUsd)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-muted-foreground">{truncateMiddle(trade.makerAddress ?? trade.senderAddress ?? 'n/a')}</span>
                    {trade.labels[0] ? <SmallPill label={trade.labels[0]} tone="muted" /> : null}
                  </div>
                </td>
                <td className="px-4 py-3">
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

function HoldersTable({ holders }: { holders: MarketTokenHolderPosition[] }) {
  if (holders.length === 0) {
    return <div className="px-4 py-8 text-sm text-muted-foreground">No holder position data came back yet for this token.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-xs">
        <thead className="border-b border-border/80 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-semibold">Wallet</th>
            <th className="px-4 py-3 font-semibold">Balance</th>
            <th className="px-4 py-3 font-semibold">Value</th>
            <th className="px-4 py-3 font-semibold">% Supply</th>
            <th className="px-4 py-3 font-semibold">PnL</th>
            <th className="px-4 py-3 font-semibold">Buys / Sells</th>
            <th className="px-4 py-3 font-semibold">Tags</th>
          </tr>
        </thead>
        <tbody>
          {holders.map((holder) => {
            const pnlTone =
              typeof holder.totalPnlUsd === 'number' ? (holder.totalPnlUsd >= 0 ? 'text-green-400' : 'text-red-400') : 'text-foreground';

            return (
              <tr key={holder.walletAddress} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3">
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
                <td className="px-4 py-3 text-foreground">{fmtCompact(holder.tokenAmount)}</td>
                <td className="px-4 py-3 text-foreground">{fmtCompact(holder.tokenAmountUsd, { currency: true })}</td>
                <td className="px-4 py-3 text-foreground">{fmtSupplyPct(holder.percentageOfTotalSupply)}</td>
                <td className={cn('px-4 py-3 font-semibold', pnlTone)}>{fmtSignedCurrency(holder.totalPnlUsd)}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {(holder.buys ?? 0).toLocaleString()} / {(holder.sells ?? 0).toLocaleString()}
                </td>
                <td className="px-4 py-3">
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

function PoolsPanel({ pairs }: { pairs: MarketToken[] }) {
  return (
    <div className="grid gap-3 p-4 md:grid-cols-2">
      {pairs.map((pair) => (
        <a
          key={pair.id}
          href={pair.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-2xl border border-border bg-background/70 p-4 transition hover:border-primary/35 hover:bg-muted/30"
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

          <div className="mt-4 grid grid-cols-2 gap-2">
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

export default function TokenPage({ token, onBack }: TokenPageProps) {
  const [detail, setDetail] = useState<MarketDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [watchlisted, setWatchlisted] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('trades');

  useEffect(() => {
    const controller = new AbortController();
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;
    setDetail(null);
    setLoading(true);
    setError(null);

    fetchMarketDetail(token.chainId, token.tokenAddress, controller.signal)
      .then(setDetail)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load token details.');
        retryTimeout = setTimeout(() => {
          setRefreshTick((tick) => tick + 1);
        }, RETRY_DELAY_MS);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      if (retryTimeout) clearTimeout(retryTimeout);
      controller.abort();
    };
  }, [refreshTick, token.chainId, token.tokenAddress]);

  const info = detail?.token ?? token;
  const pairs = detail?.pairs ?? [token];
  const trades = detail?.trades ?? [];
  const holders = detail?.holders ?? [];
  const txns24h = info.txns.h24.buys + info.txns.h24.sells;
  const buyPressure = txns24h > 0 ? Math.round((info.txns.h24.buys / txns24h) * 100) : 0;
  const sellPressure = txns24h > 0 ? 100 - buyPressure : 0;
  const holdersTotal = detail?.holdersTotal ?? info.security?.holderCount;
  const quoteSymbol = info.quoteSymbol || info.chainLabel;
  const primaryLinks = useMemo(() => info.links.slice(0, 6), [info.links]);
  const updatedAgo = detail ? timeAgo(Date.parse(detail.updatedAt)) : 'n/a';
  const previewImage = info.openGraph ?? info.imageUrl;

  const recentTradeSummary = useMemo(() => {
    return trades.reduce(
      (summary, trade) => {
        const usd = trade.baseTokenAmountUsd ?? trade.quoteTokenAmountUsd ?? 0;
        const isBuy = trade.type.toLowerCase() === 'buy';
        summary.volumeUsd += usd;
        if (isBuy) {
          summary.buyVolumeUsd += usd;
          summary.buyCount += 1;
        } else {
          summary.sellVolumeUsd += usd;
          summary.sellCount += 1;
        }
        return summary;
      },
      {
        volumeUsd: 0,
        buyVolumeUsd: 0,
        sellVolumeUsd: 0,
        buyCount: 0,
        sellCount: 0,
      },
    );
  }, [trades]);

  const copyValue = (value: string, label: string) => {
    void navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  if (!detail && (loading || error)) {
    return (
      <div className="h-full bg-background">
        <ContentSkeleton />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto flex min-h-full max-w-[1700px] flex-col gap-3 px-3 py-3 text-foreground">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/80 px-3 py-2 text-xs text-muted-foreground">
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

        <section className="overflow-hidden rounded-[1.4rem] border border-border bg-gradient-to-br from-primary/15 via-background to-background">
          <div className="grid gap-6 px-4 py-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,420px)]">
            <div className="min-w-0">
              <div className="flex items-start gap-4">
                <TokenAvatar token={info} className="h-16 w-16 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-2xl font-black tracking-tight text-foreground">{marketPairLabel(info)}</h1>
                    <button
                      className={cn(
                        'rounded-full border border-border p-2 transition',
                        watchlisted ? 'text-yellow-400' : 'text-muted-foreground hover:text-yellow-400',
                      )}
                      onClick={() => setWatchlisted((value) => !value)}
                      title="Watchlist"
                    >
                      <Star size={14} fill={watchlisted ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      className="rounded-full border border-border p-2 text-muted-foreground transition hover:text-foreground"
                      title="Set alert"
                    >
                      <Bell size={14} />
                    </button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <SmallPill label={info.name} tone="muted" />
                    <SmallPill label={info.chainLabel} tone="muted" />
                    <DexBrandChip dexId={info.dexId} />
                    <SmallPill label={`Signal ${info.signalScore}/100`} tone={info.signalScore >= 80 ? 'good' : info.signalScore >= 60 ? 'warn' : 'muted'} />
                  </div>

                  {info.description ? (
                    <p className="mt-3 max-w-4xl text-sm leading-relaxed text-muted-foreground">{info.description}</p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {(info.narrativeTags.length > 0 ? info.narrativeTags : [info.chainLabel]).slice(0, 6).map((tag) => (
                      <SmallPill key={tag} label={tag} tone="muted" />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="rounded-2xl border border-border bg-card/70 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Price Now</div>
                <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-3xl font-black tracking-tight text-foreground">{fmtPrice(info.priceUsd)}</div>
                    <div className="mt-1 font-mono text-sm text-muted-foreground">{info.priceNative ?? 'n/a'} {quoteSymbol}</div>
                  </div>
                  <div className={cn('text-right text-lg font-black', (info.priceChange.h24 ?? 0) >= 0 ? 'text-green-400' : 'text-red-400')}>
                    {fmtPct(info.priceChange.h24)}
                    <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">24H Change</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <MetricTile label="24H Volume" value={fmtCompact(info.volume.h24, { currency: true })} />
                <MetricTile label="24H Txns" value={fmtInteger(txns24h)} />
                <MetricTile label="Liquidity" value={fmtCompact(info.liquidityUsd, { currency: true })} />
                <MetricTile label="Holders" value={fmtInteger(holdersTotal)} />
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
          <MetricTile label="Market Cap" value={fmtCompact(info.marketCap ?? info.fdv, { currency: true })} tone="accent" />
          <MetricTile label="FDV" value={fmtCompact(info.fdv, { currency: true })} />
          <MetricTile label="Pair Age" value={fmtAge(info.ageMinutes)} />
          <MetricTile label="Updated" value={updatedAgo} />
          <MetricTile label="5M" value={fmtPct(info.priceChange.m5)} tone={(info.priceChange.m5 ?? 0) >= 0 ? 'up' : 'down'} />
          <MetricTile label="1H" value={fmtPct(info.priceChange.h1)} tone={(info.priceChange.h1 ?? 0) >= 0 ? 'up' : 'down'} />
          <MetricTile label="6H" value={fmtPct(info.priceChange.h6)} tone={(info.priceChange.h6 ?? 0) >= 0 ? 'up' : 'down'} />
          <MetricTile label="24H" value={fmtPct(info.priceChange.h24)} tone={(info.priceChange.h24 ?? 0) >= 0 ? 'up' : 'down'} />
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.8fr)_380px]">
          <div className="grid gap-3">
            <Panel
              icon={Activity}
              title="Live Pair View"
              subtitle={`Streaming pair context from DexScreener with ${pairs.length} tracked pool${pairs.length === 1 ? '' : 's'}.`}
              actions={
                <a
                  href={info.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-background/70 px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary/35"
                >
                  Open DexScreener
                  <ExternalLink size={13} />
                </a>
              }
            >
              <div className="border-b border-border/60 px-4 py-3">
                <div className="grid gap-3 md:grid-cols-4">
                  <MetricTile label="Buys" value={fmtInteger(info.txns.h24.buys)} tone="up" />
                  <MetricTile label="Sells" value={fmtInteger(info.txns.h24.sells)} tone="down" />
                  <MetricTile label="Recent Buy Vol" value={fmtCompact(recentTradeSummary.buyVolumeUsd, { currency: true })} tone="up" />
                  <MetricTile label="Recent Sell Vol" value={fmtCompact(recentTradeSummary.sellVolumeUsd, { currency: true })} tone="down" />
                </div>

                <div className="mt-3 rounded-full border border-border bg-background/60 p-1">
                  <div className="flex h-2 overflow-hidden rounded-full">
                    <div className="bg-green-500 transition-all" style={{ width: `${buyPressure}%` }} />
                    <div className="bg-red-500 transition-all" style={{ width: `${sellPressure}%` }} />
                  </div>
                </div>
              </div>

              <iframe
                title={`${info.symbol} DexScreener chart`}
                src={`${info.url}?embed=1&theme=dark`}
                className="h-[560px] w-full border-0 bg-background"
              />
            </Panel>

            <Panel
              icon={Layers3}
              title="Token Flow"
              subtitle="Live detail sections powered by the aggregated market detail feed."
              actions={
                <div className="flex items-center gap-2 rounded-xl border border-border bg-background/70 p-1">
                  {([
                    ['trades', 'Transactions'],
                    ['holders', 'Holders'],
                    ['pools', 'Pools'],
                  ] as const).map(([tab, label]) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                        activeTab === tab
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              }
            >
              {activeTab === 'trades' ? (
                <TradeTape trades={trades} symbol={info.symbol} quoteSymbol={quoteSymbol} />
              ) : activeTab === 'holders' ? (
                <HoldersTable holders={holders} />
              ) : (
                <PoolsPanel pairs={pairs} />
              )}
            </Panel>
          </div>

          <div className="grid gap-3">
            <section className="overflow-hidden rounded-2xl border border-border bg-card/80">
              <div className="relative aspect-[16/10] overflow-hidden border-b border-border bg-muted">
                {previewImage ? (
                  <img
                    src={previewImage}
                    alt={info.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/20 to-background">
                    <TokenAvatar token={info} className="h-20 w-20 text-xl" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/25 to-transparent" />
                <div className="absolute left-4 right-4 top-4 flex items-center justify-between gap-3">
                  <SmallPill label={info.chainLabel} tone="muted" />
                  <DexBrandChip dexId={info.dexId} />
                </div>
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="text-xl font-black tracking-tight text-white">{marketPairLabel(info)}</div>
                  <div className="mt-1 text-sm text-white/70">{info.name}</div>
                </div>
              </div>

              <div className="grid gap-3 p-4">
                <a
                  href={info.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/35 bg-primary/10 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-primary/15"
                >
                  Trade on DexScreener
                  <ExternalLink size={14} />
                </a>
                <div className="grid grid-cols-2 gap-3">
                  <MetricTile label="Price" value={fmtPrice(info.priceUsd)} />
                  <MetricTile label="Signal" value={`${info.signalScore}/100`} tone={info.signalScore >= 80 ? 'up' : 'neutral'} />
                  <MetricTile label="Recent Tape" value={fmtCompact(recentTradeSummary.volumeUsd, { currency: true })} />
                  <MetricTile label="Tracked Pools" value={fmtInteger(pairs.length)} />
                </div>
              </div>
            </section>

            <Panel icon={Shield} title="Risk & Security" subtitle="Narratives, risk flags, holder concentration, and contract context.">
              <div className="grid gap-4 p-4">
                <div>
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Risk Flags</div>
                  <div className="flex flex-wrap gap-2">
                    {info.riskFlags.length > 0 ? (
                      info.riskFlags.map((flag) => <SmallPill key={flag} label={flag} tone="warn" />)
                    ) : (
                      <SmallPill label="No major flags from current filters" tone="good" />
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Security Enrichment</div>
                  <div className="flex flex-wrap gap-2">
                    {holdersTotal ? <SmallPill label={`${holdersTotal.toLocaleString()} holders`} tone="muted" /> : null}
                    {info.security?.top10HolderPct !== undefined ? (
                      <SmallPill
                        label={`Top 10 ${info.security.top10HolderPct.toFixed(1)}%`}
                        tone={info.security.top10HolderPct > 50 ? 'warn' : 'muted'}
                      />
                    ) : null}
                    {info.security?.verifiedContract !== undefined ? (
                      <SmallPill
                        label={info.security.verifiedContract ? 'Verified contract' : 'Unverified contract'}
                        tone={info.security.verifiedContract ? 'good' : 'warn'}
                      />
                    ) : null}
                    {info.security?.mintAuthorityDisabled !== undefined ? (
                      <SmallPill
                        label={info.security.mintAuthorityDisabled ? 'Mint locked' : 'Mint active'}
                        tone={info.security.mintAuthorityDisabled ? 'good' : 'warn'}
                      />
                    ) : null}
                    {info.security?.freezeAuthorityDisabled !== undefined ? (
                      <SmallPill
                        label={info.security.freezeAuthorityDisabled ? 'Freeze locked' : 'Freeze active'}
                        tone={info.security.freezeAuthorityDisabled ? 'good' : 'warn'}
                      />
                    ) : null}
                    {info.security?.possibleSpam !== undefined ? (
                      <SmallPill
                        label={info.security.possibleSpam ? 'Possible spam' : 'Spam clear'}
                        tone={info.security.possibleSpam ? 'bad' : 'good'}
                      />
                    ) : null}
                    {info.security?.buyTax ? <SmallPill label={`Buy tax ${info.security.buyTax}`} tone="muted" /> : null}
                    {info.security?.sellTax ? <SmallPill label={`Sell tax ${info.security.sellTax}`} tone="muted" /> : null}
                  </div>
                </div>
              </div>
            </Panel>

            <Panel icon={Database} title="Data Providers" subtitle="Live provider coverage for this token page.">
              <div className="grid gap-2 p-4">
                {info.providers.map((provider) => (
                  <div key={provider.provider} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/70 px-3 py-3">
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
                ))}
              </div>
            </Panel>

            <Panel icon={Wallet} title="Addresses" subtitle="Copy contract and pair identifiers straight from the detail page.">
              <div className="grid gap-2 p-4">
                <AddressButton label="Token address" value={info.tokenAddress} onCopy={copyValue} />
                <AddressButton label="Pair address" value={info.pairAddress} onCopy={copyValue} />
              </div>
            </Panel>

            <Panel
              icon={Link2}
              title="Links & Context"
              subtitle="Project links, chain narratives, and live metadata touchpoints."
            >
              <div className="grid gap-4 p-4">
                <div>
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Public Links</div>
                  {primaryLinks.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {primaryLinks.map((link) => (
                        <LinkButton key={link.url} link={link} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No public links returned by the current providers.</div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <MetricTile label="Recent Buys" value={fmtInteger(recentTradeSummary.buyCount)} tone="up" />
                  <MetricTile label="Recent Sells" value={fmtInteger(recentTradeSummary.sellCount)} tone="down" />
                  <MetricTile label="Recent Buy Vol" value={fmtCompact(recentTradeSummary.buyVolumeUsd, { currency: true })} tone="up" />
                  <MetricTile label="Recent Sell Vol" value={fmtCompact(recentTradeSummary.sellVolumeUsd, { currency: true })} tone="down" />
                </div>

                <div className="flex items-center gap-2 rounded-2xl border border-border bg-background/70 px-3 py-3 text-xs text-muted-foreground">
                  <Clock3 size={14} className="text-primary" />
                  <span>Pair age {fmtAge(info.ageMinutes)}</span>
                  <span className="opacity-30">•</span>
                  <Sparkles size={14} className="text-primary" />
                  <span>Updated {updatedAgo} ago</span>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
