import { useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Filter, RefreshCw, Star } from 'lucide-react';
import { toast } from 'sonner';
import { MarketsTableSkeleton } from '@/components/common/skeletons';
import { EmptySearch } from '@/components/common/empty-states';
import { BundleLabel } from '@/components/markets/bundle-label';
import {
  addWatchlistItem,
  fetchWatchlistIds,
  removeWatchlistItem,
} from '@/lib/watchlist';
import {
  fetchMarkets,
  fmtAge,
  fmtCompact,
  fmtPct,
  fmtPrice,
  marketPairLabel,
  type MarketToken,
  type SortKey,
} from '@/lib/market-data';
import { getDexBrand } from '@/lib/dex-branding';

const CHAIN_CONFIG = [
  { key: 'all', label: 'All Chains', logo: '', color: '#6b7280' },
  { key: 'solana', label: 'Solana', logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png', color: '#9945FF' },
  { key: 'ethereum', label: 'Ethereum', logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png', color: '#627EEA' },
  { key: 'base', label: 'Base', logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png', color: '#0052FF' },
  { key: 'arbitrum', label: 'Arbitrum', logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png', color: '#12AAFF' },
  { key: 'bsc', label: 'BSC', logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png', color: '#F3BA2F' },
  { key: 'polygon', label: 'Polygon', logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png', color: '#8247E5' },
  { key: 'optimism', label: 'Optimism', logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png', color: '#FF0420' },
  { key: 'avalanche', label: 'Avalanche', logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png', color: '#E84142' },
  { key: 'ton', label: 'TON', logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ton/info/logo.png', color: '#0098EA' },
  { key: 'robinhood', label: 'Robinhood', logo: 'https://dd.dexscreener.com/ds-data/chains/robinhood.png', color: '#00C805' },
];

const RETRY_DELAY_MS = 4000;
const FLASH_DURATION_MS = 1650;
const AUTO_REFRESH_MS = 5000;

const CHAIN_MAP = Object.fromEntries(CHAIN_CONFIG.map(c => [c.key, c]));

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'trending', label: 'Trending' },
  { key: 'new', label: 'New' },
  { key: 'm5', label: '5m' },
  { key: 'h1', label: '1h' },
  { key: 'h6', label: '6h' },
  { key: 'h24', label: '24h' },
  { key: 'volume', label: 'Volume' },
];

type FlashField =
  | 'mcap'
  | 'price'
  | 'age'
  | 'm5'
  | 'h1'
  | 'h6'
  | 'h24'
  | 'liq'
  | 'txn'
  | 'vol';

type FlashDirection = 'up' | 'down' | 'pulse';
type MarketFlashMap = Record<string, Partial<Record<FlashField, FlashDirection>>>;

function flashClass(direction?: FlashDirection) {
  if (direction === 'up') return 'market-update-up';
  if (direction === 'down') return 'market-update-down';
  if (direction === 'pulse') return 'market-update-pulse';
  return '';
}

function ChainBadgeIcon({
  chainConfig,
  fallbackLabel,
  className = '',
}: {
  chainConfig?: (typeof CHAIN_CONFIG)[number];
  fallbackLabel?: string;
  className?: string;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const label = fallbackLabel ?? chainConfig?.label ?? 'Chain';

  if (chainConfig?.logo && !logoFailed) {
    return (
      <img
        src={chainConfig.logo}
        alt=""
        aria-hidden="true"
        onError={() => setLogoFailed(true)}
        className={`rounded-full object-cover ${className}`}
      />
    );
  }

  if (chainConfig?.key === 'all') {
    return (
      <span className={`inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground ${className}`}>
        <Filter size={9} />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full text-[8px] font-bold text-white ${className}`}
      style={{ backgroundColor: chainConfig?.color ?? '#6b7280' }}
    >
      {label.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'CH'}
    </span>
  );
}

function LiveValue({
  children,
  className = '',
  direction,
  block = false,
}: {
  children: React.ReactNode;
  className?: string;
  direction?: FlashDirection;
  block?: boolean;
}) {
  const classes = [
    block ? 'block' : 'inline-block',
    'rounded px-1 -mx-1 will-change-transform',
    flashClass(direction),
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (block) {
    return <div className={classes}>{children}</div>;
  }

  return <span className={classes}>{children}</span>;
}

function metricSnapshot(market: MarketToken) {
  return {
    mcap: market.marketCap ?? market.fdv,
    price: market.priceUsd,
    age: market.ageMinutes,
    m5: market.priceChange.m5,
    h1: market.priceChange.h1,
    h6: market.priceChange.h6,
    h24: market.priceChange.h24,
    liq: market.liquidityUsd,
    txn: market.txns.h24.buys + market.txns.h24.sells,
    vol: market.volume.h24,
  };
}

function changeDirection(
  previous: number | undefined,
  next: number | undefined,
  mode: 'directional' | 'pulse' = 'directional',
): FlashDirection | undefined {
  if (typeof previous !== 'number' || typeof next !== 'number' || Object.is(previous, next)) {
    return undefined;
  }

  if (mode === 'pulse') return 'pulse';
  return next > previous ? 'up' : 'down';
}

function buildFlashMap(previousMarkets: Map<string, MarketToken>, nextMarkets: MarketToken[]): MarketFlashMap {
  const flashes: MarketFlashMap = {};

  for (const market of nextMarkets) {
    const previous = previousMarkets.get(market.id);
    if (!previous) continue;

    const prevMetrics = metricSnapshot(previous);
    const nextMetrics = metricSnapshot(market);
    const nextFields: Partial<Record<FlashField, FlashDirection>> = {};

    const setFlash = (field: FlashField, direction?: FlashDirection) => {
      if (direction) nextFields[field] = direction;
    };

    setFlash('mcap', changeDirection(prevMetrics.mcap, nextMetrics.mcap));
    setFlash('price', changeDirection(prevMetrics.price, nextMetrics.price));
    setFlash('age', changeDirection(prevMetrics.age, nextMetrics.age, 'pulse'));
    setFlash('m5', changeDirection(prevMetrics.m5, nextMetrics.m5));
    setFlash('h1', changeDirection(prevMetrics.h1, nextMetrics.h1));
    setFlash('h6', changeDirection(prevMetrics.h6, nextMetrics.h6));
    setFlash('h24', changeDirection(prevMetrics.h24, nextMetrics.h24));
    setFlash('liq', changeDirection(prevMetrics.liq, nextMetrics.liq));
    setFlash('txn', changeDirection(prevMetrics.txn, nextMetrics.txn));
    setFlash('vol', changeDirection(prevMetrics.vol, nextMetrics.vol));

    if (Object.keys(nextFields).length > 0) {
      flashes[market.id] = nextFields;
    }
  }

  return flashes;
}

function TokenAvatar({ market }: { market: MarketToken }) {
  if (market.imageUrl) {
    return <img src={market.imageUrl} alt={market.symbol} className="w-7 h-7 rounded-full object-cover bg-muted" />;
  }

  return (
    <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-[10px] font-black text-primary">
      {market.symbol.slice(0, 2).toUpperCase()}
    </div>
  );
}

function Pct({ value, direction }: { value?: number; direction?: FlashDirection }) {
  const color = typeof value !== 'number'
    ? 'text-muted-foreground'
    : value > 0
      ? 'text-success'
      : value < 0
        ? 'text-destructive'
        : 'text-muted-foreground';

  return (
    <LiveValue direction={direction} className={`${color} font-mono tabular-nums`}>
      {fmtPct(value)}
    </LiveValue>
  );
}

function formatDexLabel(dexId?: string) {
  if (!dexId) return 'Unknown';
  return dexId
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function DexBadge({ dexId }: { dexId?: string }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const brand = getDexBrand(dexId);
  const label = brand?.label ?? formatDexLabel(dexId);
  const fallbackLabel = label.slice(0, 2).toUpperCase();

  return (
    <div
      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/70 bg-muted/35"
      title={label}
      aria-label={label}
    >
      {brand?.logoUrl && !logoFailed ? (
        <img
          src={brand.logoUrl}
          alt={label}
          className="h-4 w-4 shrink-0 rounded-full object-cover"
          loading="lazy"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">
          {fallbackLabel}
        </span>
      )}
    </div>
  );
}

interface MarketsTableProps {
  onSelectToken: (market: MarketToken) => void;
}

export default function MarketsTable({ onSelectToken }: MarketsTableProps) {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const [markets, setMarkets] = useState<MarketToken[]>([]);
  const [flashMap, setFlashMap] = useState<MarketFlashMap>({});
  const [sortBy, setSortBy] = useState<SortKey>('m5');
  const [search, setSearch] = useState('');
  const [chain, setChain] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watchlisted, setWatchlisted] = useState<Set<string>>(new Set());
  const [pendingWatchlist, setPendingWatchlist] = useState<Set<string>>(new Set());
  const [refreshTick, setRefreshTick] = useState(0);
  const previousMarketsRef = useRef<Map<string, MarketToken>>(new Map());
  const hasLoadedRef = useRef(false);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setRefreshTick((tick) => tick + 1);
    }, AUTO_REFRESH_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(() => {
      setLoading(!hasLoadedRef.current);
      setError(null);

      const trimmedSearch = search.trim();
      fetchMarkets({
        chain,
        q: trimmedSearch || undefined,
        sort: sortBy,
        limit: 100,
        enrich: !trimmedSearch,
        signal: controller.signal,
      })
        .then((response) => {
          hasLoadedRef.current = true;
          const nextFlashes = buildFlashMap(previousMarketsRef.current, response.data);
          previousMarketsRef.current = new Map(response.data.map((market) => [market.id, market]));
          setMarkets(response.data);
          setFlashMap(nextFlashes);

          if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
          if (Object.keys(nextFlashes).length > 0) {
            flashTimeoutRef.current = setTimeout(() => {
              setFlashMap({});
            }, FLASH_DURATION_MS);
          }
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          setError(err instanceof Error ? err.message : 'Failed to load markets.');
          retryTimeout = setTimeout(() => {
            setRefreshTick((tick) => tick + 1);
          }, RETRY_DELAY_MS);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, search ? 300 : 0);

    return () => {
      clearTimeout(timeout);
      if (retryTimeout) clearTimeout(retryTimeout);
      controller.abort();
    };
  }, [chain, refreshTick, search, sortBy]);

  useEffect(() => {
    if (!ready) return;

    if (!authenticated) {
      setWatchlisted(new Set());
      return;
    }

    const controller = new AbortController();

    void getAccessToken()
      .then((token) => {
        if (!token) throw new Error('No Privy access token was available for this session.');
        return fetchWatchlistIds(token, controller.signal);
      })
      .then((response: { itemIds: string[] }) => {
        setWatchlisted(new Set(response.itemIds));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setWatchlisted(new Set());
        }
      });

    return () => {
      controller.abort();
    };
  }, [authenticated, ready]);

  const visibleChains = CHAIN_CONFIG;

  const toggleWatchlist = async (e: React.MouseEvent, market: MarketToken) => {
    e.stopPropagation();

    if (!ready) return;

    if (!authenticated) {
      toast.info('Sign in to use your watchlist', {
        description: 'Watchlist is saved to your real Privy account, so we need you signed in first.',
      });
      void login();
      return;
    }

    if (pendingWatchlist.has(market.id)) return;

    setPendingWatchlist((current) => new Set(current).add(market.id));

    try {
      const token = await getAccessToken();

      if (!token) {
        throw new Error('No Privy access token was available for this session.');
      }

      if (watchlisted.has(market.id)) {
        await removeWatchlistItem(token, market.id);
        setWatchlisted((current) => {
          const next = new Set(current);
          next.delete(market.id);
          return next;
        });
        toast.success('Removed from watchlist', {
          description: `${marketPairLabel(market)} removed.`,
        });
      } else {
        await addWatchlistItem(token, market);
        setWatchlisted((current) => new Set(current).add(market.id));
        toast.success('Added to watchlist', {
          description: `${marketPairLabel(market)} is now tracked in your account.`,
        });
      }
    } catch (err) {
      toast.error('Watchlist update failed', {
        description: err instanceof Error ? err.message : 'We could not update this pair right now.',
      });
    } finally {
      setPendingWatchlist((current) => {
        const next = new Set(current);
        next.delete(market.id);
        return next;
      });
    }
  };

  if (markets.length === 0 && (loading || error)) return <MarketsTableSkeleton />;

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="shrink-0 border-b border-border bg-background">
          <div className="flex items-center gap-1.5 px-2 py-1.5">
            {SORT_OPTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSortBy(s.key)}
                className={`tap-feedback flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold border transition ${
                  sortBy === s.key
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                }`}
              >
                {s.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1.5">
              <input
                type="text"
                placeholder="Search live pairs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-muted border border-border rounded px-2 py-1 text-xs outline-none focus:border-primary w-36 placeholder:text-muted-foreground"
              />
              <button className="tap-feedback p-1 border border-border rounded hover:bg-muted text-muted-foreground hover:text-foreground transition" title="Filters">
                <Filter size={13} />
              </button>
              <button
                onClick={() => setRefreshTick((tick) => tick + 1)}
                className="tap-feedback p-1 border border-border rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                title="Refresh"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 px-2 pb-1.5 overflow-x-auto [-webkit-overflow-scrolling:touch]">
            {visibleChains.map((c) => (
              <button
                key={c.key}
                onClick={() => setChain(c.key)}
                className={`tap-feedback flex items-center gap-1 px-2 py-0.5 rounded text-xs border transition shrink-0 whitespace-nowrap ${
                  chain === c.key
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                }`}
              >
                <ChainBadgeIcon chainConfig={c} className="h-3.5 w-3.5" />
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {markets.length === 0 ? (
            <EmptySearch onReset={() => { setSearch(''); setChain('all'); }} />
          ) : (
            <div className="h-full overflow-x-auto overflow-y-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable_both-edges]">
              <table className="w-full min-w-[820px] border-collapse text-[11px] sm:min-w-[880px] sm:text-xs">
                <thead className="sticky top-0 z-10 border-b border-border bg-background">
                  <tr className="text-left text-muted-foreground">
                    <th className="sticky left-0 z-20 min-w-[176px] bg-background px-2 py-1.5 pr-1 font-medium">Pair</th>
                    <th className="px-1.5 py-1.5 pl-1 font-medium text-right whitespace-nowrap">MC / Price</th>
                    <th className="px-1.5 py-1.5 font-medium text-right">Age</th>
                    <th className="px-1.5 py-1.5 font-medium whitespace-nowrap">DEX</th>
                    <th className="px-1.5 py-1.5 font-medium">Bundle</th>
                    <th className="px-1.5 py-1.5 font-medium text-right">5m</th>
                    <th className="px-1.5 py-1.5 font-medium text-right">1h</th>
                    <th className="px-1.5 py-1.5 font-medium text-right">6h</th>
                    <th className="px-1.5 py-1.5 font-medium text-right">24h</th>
                    <th className="px-1.5 py-1.5 font-medium text-right">Liq</th>
                    <th className="px-1.5 py-1.5 font-medium text-right">TXN</th>
                    <th className="px-1.5 py-1.5 font-medium text-right">Vol</th>
                  </tr>
                </thead>
                <tbody>
                  {markets.map((market) => {
                    const chainConfig = CHAIN_MAP[market.chainId];
                    const txn24 = market.txns.h24.buys + market.txns.h24.sells;
                    const marketFlashes = flashMap[market.id] ?? {};
                    const pending = pendingWatchlist.has(market.id);

                    return (
                      <tr
                        key={market.id}
                        onClick={() => onSelectToken(market)}
                        className="interactive-row group cursor-pointer border-b border-border/50 hover:bg-muted/40"
                      >
                        <td className="sticky left-0 z-10 bg-background/95 py-1.5 pl-2 pr-1 align-middle backdrop-blur-sm group-hover:bg-muted/40">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <div className="relative shrink-0">
                              <button
                                onClick={(e) => void toggleWatchlist(e, market)}
                                disabled={pending}
                                className={`absolute -left-1 -top-1 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-border/70 bg-background/95 transition ${
                                  watchlisted.has(market.id)
                                    ? 'text-yellow-400'
                                    : 'text-muted-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
                                } ${pending ? 'cursor-wait opacity-100' : ''}`}
                                title={watchlisted.has(market.id) ? 'Remove from watchlist' : 'Add to watchlist'}
                              >
                                <Star
                                  size={10}
                                  className={pending ? 'animate-pulse' : ''}
                                  fill={watchlisted.has(market.id) ? 'currentColor' : 'none'}
                                />
                              </button>
                              <TokenAvatar market={market} />
                              <ChainBadgeIcon
                                chainConfig={chainConfig}
                                fallbackLabel={market.chainLabel || market.chainId}
                                className="absolute -bottom-0.5 -right-1 h-3.5 w-3.5 ring-1 ring-background"
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-1">
                                <div className="truncate font-bold leading-tight text-foreground">{marketPairLabel(market)}</div>
                              </div>
                              <div className="max-w-[120px] truncate leading-tight text-muted-foreground sm:max-w-[150px]">
                                {market.name}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-1.5 py-1.5 pl-1 text-right whitespace-nowrap">
                          <LiveValue
                            block
                            direction={marketFlashes.mcap}
                            className="font-mono font-bold tabular-nums text-primary"
                          >
                            {fmtCompact(market.marketCap ?? market.fdv, { currency: true })}
                          </LiveValue>
                          <LiveValue
                            block
                            direction={marketFlashes.price}
                            className="font-mono tabular-nums text-muted-foreground"
                          >
                            {fmtPrice(market.priceUsd)}
                          </LiveValue>
                        </td>

                        <td className="px-1.5 py-1.5 text-right text-muted-foreground">
                          <LiveValue direction={marketFlashes.age} className="text-muted-foreground">
                            {fmtAge(market.ageMinutes)}
                          </LiveValue>
                        </td>
                        <td className="px-1.5 py-1.5">
                          <DexBadge dexId={market.dexId} />
                        </td>
                        <td className="px-1.5 py-1.5">
                          <div className="flex max-w-[104px]">
                            <BundleLabel bundle={market.bundle} showScore className="max-w-[104px]" />
                          </div>
                        </td>

                        <td className="px-1.5 py-1.5 text-right"><Pct value={market.priceChange.m5} direction={marketFlashes.m5} /></td>
                        <td className="px-1.5 py-1.5 text-right"><Pct value={market.priceChange.h1} direction={marketFlashes.h1} /></td>
                        <td className="px-1.5 py-1.5 text-right"><Pct value={market.priceChange.h6} direction={marketFlashes.h6} /></td>
                        <td className="px-1.5 py-1.5 text-right"><Pct value={market.priceChange.h24} direction={marketFlashes.h24} /></td>

                        <td className="px-1.5 py-1.5 text-right font-mono text-muted-foreground tabular-nums">
                          <LiveValue direction={marketFlashes.liq} className="font-mono text-muted-foreground tabular-nums">
                            {fmtCompact(market.liquidityUsd, { currency: true })}
                          </LiveValue>
                        </td>
                        <td className="px-1.5 py-1.5 text-right font-mono text-muted-foreground tabular-nums">
                          <LiveValue direction={marketFlashes.txn} className="font-mono text-muted-foreground tabular-nums">
                            {fmtCompact(txn24, { digits: 0 })}
                          </LiveValue>
                        </td>
                        <td className="px-1.5 py-1.5 text-right font-mono text-muted-foreground tabular-nums">
                          <LiveValue direction={marketFlashes.vol} className="font-mono text-muted-foreground tabular-nums">
                            {fmtCompact(market.volume.h24, { currency: true })}
                          </LiveValue>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </>
  );
}
