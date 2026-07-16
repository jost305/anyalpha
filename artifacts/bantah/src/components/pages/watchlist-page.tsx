import { useEffect, useMemo, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { LoaderCircle, RefreshCw, ShieldCheck, Sparkles, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyWatchlist } from '@/components/common/empty-states';
import { fmtAge, fmtCompact, fmtPct, fmtPrice, marketPairLabel, marketTokenUrl, type MarketToken } from '@/lib/market-data';
import { fetchWatchlist, removeWatchlistItem, type WatchlistItem } from '@/lib/watchlist';
import { getDexBrand } from '@/lib/dex-branding';

const RETRY_DELAY_MS = 4000;

interface WatchlistPageProps {
  onSelectToken: (market: MarketToken) => void;
  onExploreMarkets: () => void;
}

function formatAddedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function TokenAvatar({ market }: { market: MarketToken }) {
  if (market.imageUrl) {
    return (
      <img
        src={market.imageUrl}
        alt={market.symbol}
        className="h-12 w-12 rounded-2xl border border-border bg-muted object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/15 text-sm font-black text-primary">
      {market.symbol.slice(0, 2).toUpperCase()}
    </div>
  );
}

function DexChip({ dexId }: { dexId: string }) {
  const brand = getDexBrand(dexId);

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      {brand?.logoUrl ? (
        <img
          src={brand.logoUrl}
          alt={brand.label}
          className="h-3.5 w-3.5 rounded-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : null}
      <span>{brand?.label ?? dexId}</span>
    </span>
  );
}

export default function WatchlistPage({ onSelectToken, onExploreMarkets }: WatchlistPageProps) {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [removing, setRemoving] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!ready) {
      setLoading(true);
      return;
    }

    if (!authenticated) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    setError(null);

    void getAccessToken()
      .then((token) => {
        if (!token) throw new Error('No Privy access token was available for this session.');
        return fetchWatchlist(token, controller.signal);
      })
      .then((response: { items: WatchlistItem[] }) => {
        setItems(response.items);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load your watchlist.');
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
  }, [authenticated, ready, refreshTick]);

  const aggregates = useMemo(() => {
    const totalMarketCap = items.reduce((sum, item) => sum + (item.market.marketCap ?? item.market.fdv ?? 0), 0);
    const totalVolume = items.reduce((sum, item) => sum + (item.market.volume.h24 ?? 0), 0);
    const average24h =
      items.length > 0
        ? items.reduce((sum, item) => sum + (item.market.priceChange.h24 ?? 0), 0) / items.length
        : 0;
    const liveCount = items.filter((item) => item.live !== false).length;

    return { totalMarketCap, totalVolume, average24h, liveCount };
  }, [items]);

  const handleRemove = async (item: WatchlistItem) => {
    setRemoving((current) => new Set(current).add(item.id));

    try {
      const token = await getAccessToken();

      if (!token) {
        throw new Error('No Privy access token was available for this session.');
      }

      await removeWatchlistItem(token, item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      toast.success('Removed from watchlist', {
        description: `${marketPairLabel(item.market)} was removed.`,
      });
    } catch (err) {
      toast.error('Watchlist update failed', {
        description: err instanceof Error ? err.message : 'We could not remove this pair right now.',
      });
    } finally {
      setRemoving((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  };

  if (!ready) {
    return (
      <div className="h-full bg-background px-4 pt-4 md:flex md:items-center md:justify-center md:pt-0">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
          <LoaderCircle size={18} className="animate-spin text-primary" />
          Preparing your watchlist...
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="h-full overflow-y-auto bg-background p-4">
        <div className="mx-auto flex min-h-0 max-w-4xl items-start pt-2 md:min-h-full md:items-center md:pt-0">
          <div className="w-full overflow-hidden rounded-[32px] border border-border bg-card shadow-2xl">
            <div className="bg-[radial-gradient(circle_at_top_left,rgba(249,149,61,0.16),transparent_35%),linear-gradient(135deg,rgba(249,149,61,0.08),transparent_60%)] px-6 py-8 md:px-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                <Star size={12} />
                Sign In Required
              </div>
              <h2 className="mt-4 max-w-2xl text-3xl font-black tracking-tight text-foreground">
                Your watchlist only works for authenticated users.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Sign in with Privy to save live pairs to your personal watchlist and keep the same
                tracked markets across mobile and desktop.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => void login()}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:opacity-90"
                  type="button"
                >
                  <Sparkles size={15} />
                  Sign In To Use Watchlist
                </button>
                <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-background/70 px-4 py-2.5 text-sm text-muted-foreground">
                  <ShieldCheck size={15} className="text-success" />
                  Real saved pairs, not local mock state
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-0 max-w-6xl flex-col gap-4 p-4">
        <section className="rounded-2xl border border-border/70 bg-card/70 px-3 py-3 shadow-[0_18px_45px_-34px_rgba(0,0,0,0.65)] sm:px-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="inline-flex shrink-0 items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                <Star size={12} />
                Watchlist
              </div>
              <div className="min-w-0 truncate text-sm font-semibold text-muted-foreground">Saved live pairs</div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                onClick={() => setRefreshTick((tick) => tick + 1)}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/75 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted/40"
                type="button"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
              <button
                onClick={onExploreMarkets}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition hover:opacity-90"
                type="button"
              >
                Explore Markets
              </button>
            </div>
          </div>

          <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-0.5">
            {[
              { label: 'Pairs', value: items.length.toLocaleString() },
              { label: 'MC', value: fmtCompact(aggregates.totalMarketCap, { currency: true }) },
              { label: 'Vol 24H', value: fmtCompact(aggregates.totalVolume, { currency: true }) },
              {
                label: 'Avg 24H',
                value: items.length > 0 ? fmtPct(aggregates.average24h) : 'n/a',
                tone:
                  items.length === 0
                    ? 'text-foreground'
                    : aggregates.average24h >= 0
                      ? 'text-success'
                      : 'text-destructive',
              },
            ].map((metric) => (
              <div
                key={metric.label}
                className="inline-flex min-w-max items-center gap-2 rounded-lg border border-border/70 bg-background/65 px-2.5 py-1.5"
              >
                <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {metric.label}
                </div>
                <div className={`text-xs font-black ${metric.tone ?? 'text-foreground'}`}>
                  {metric.value}
                </div>
              </div>
            ))}
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
            {error}
          </div>
        ) : null}

        {loading && items.length === 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="animate-pulse rounded-[28px] border border-border bg-card p-5">
                <div className="h-5 w-40 rounded bg-muted" />
                <div className="mt-3 h-4 w-28 rounded bg-muted" />
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="h-16 rounded-2xl bg-muted" />
                  <div className="h-16 rounded-2xl bg-muted" />
                  <div className="h-16 rounded-2xl bg-muted" />
                  <div className="h-16 rounded-2xl bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-[28px] border border-border bg-card p-4">
            <EmptyWatchlist onExplore={onExploreMarkets} />
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {items.map((item) => {
              const txn24 = item.market.txns.h24.buys + item.market.txns.h24.sells;
              const change24h = item.market.priceChange.h24 ?? 0;
              const pendingRemove = removing.has(item.id);

              return (
                <article
                  key={item.id}
                  className="surface-sheen overflow-hidden rounded-[28px] border border-border bg-card/90 shadow-[0_18px_45px_-28px_rgba(0,0,0,0.55)]"
                >
                  <div className="flex items-start justify-between gap-3 border-b border-border/70 px-5 py-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <TokenAvatar market={item.market} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => onSelectToken(item.market)}
                            className="truncate text-left text-lg font-black tracking-tight text-foreground transition hover:text-primary"
                            type="button"
                          >
                            {marketPairLabel(item.market)}
                          </button>
                          <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                            {item.market.chainLabel}
                          </span>
                          <DexChip dexId={item.market.dexId} />
                          <span
                            className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                              item.live === false
                                ? 'border-yellow-400/25 bg-yellow-400/10 text-yellow-300'
                                : 'border-success/20 bg-success/10 text-success'
                            }`}
                          >
                            {item.live === false ? 'Snapshot' : 'Live'}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-sm text-muted-foreground">{item.market.name}</div>
                        <div className="mt-2 text-[11px] text-muted-foreground">Added {formatAddedAt(item.addedAt)}</div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-lg font-black text-foreground">{fmtPrice(item.market.priceUsd)}</div>
                      <div className={`mt-1 text-sm font-semibold ${change24h >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {fmtPct(item.market.priceChange.h24)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 px-5 py-4">
                    <div className="rounded-2xl border border-border bg-background/70 p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Market Cap</div>
                      <div className="mt-1 text-sm font-bold text-sky-700 dark:text-sky-300">
                        {fmtCompact(item.market.marketCap ?? item.market.fdv, { currency: true })}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border bg-background/70 p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">24H Volume</div>
                      <div className="mt-1 text-sm font-bold text-foreground">
                        {fmtCompact(item.market.volume.h24, { currency: true })}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border bg-background/70 p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Liquidity</div>
                      <div className="mt-1 text-sm font-bold text-foreground">
                        {fmtCompact(item.market.liquidityUsd, { currency: true })}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border bg-background/70 p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Age / TXN</div>
                      <div className="mt-1 text-sm font-bold text-foreground">
                        {fmtAge(item.market.ageMinutes)} / {fmtCompact(txn24, { digits: 0 })}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-border/70 px-5 py-4">
                    <button
                      onClick={() => onSelectToken(item.market)}
                      className="tap-feedback inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:opacity-90"
                      type="button"
                    >
                      Open Token
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(marketTokenUrl(item.market));
                        toast.success('AnyAlpha token link copied');
                      }}
                      className="tap-feedback inline-flex items-center gap-2 rounded-2xl border border-border bg-background/70 px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary/30"
                    >
                      Share Link
                    </button>
                    <button
                      onClick={() => void handleRemove(item)}
                      disabled={pendingRemove}
                      className="tap-feedback inline-flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-destructive/15 disabled:cursor-wait disabled:opacity-70"
                      type="button"
                    >
                      <Trash2 size={14} className={pendingRemove ? 'animate-pulse text-destructive' : 'text-destructive'} />
                      {pendingRemove ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {items.length > 0 ? (
          <div className="text-center text-xs text-muted-foreground">
            {aggregates.liveCount.toLocaleString()} of {items.length.toLocaleString()} saved pair
            {items.length === 1 ? '' : 's'} refreshed with live market data.
          </div>
        ) : null}
      </div>
    </div>
  );
}
