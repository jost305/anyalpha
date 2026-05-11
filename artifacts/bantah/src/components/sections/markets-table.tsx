import { useEffect, useMemo, useRef, useState } from 'react';
import { Filter, RefreshCw, Star } from 'lucide-react';
import { toast } from 'sonner';
import { WatchlistModal } from '@/components/modals/watchlist-modal';
import { MarketsTableSkeleton } from '@/components/common/skeletons';
import { EmptySearch } from '@/components/common/empty-states';
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

const CHAIN_CONFIG = [
  { key: 'all', label: 'All Chains', logo: '', color: '#6b7280' },
  { key: 'solana', label: 'Solana', logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png', color: '#9945FF' },
  { key: 'ethereum', label: 'Ethereum', logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png', color: '#627EEA' },
  { key: 'base', label: 'Base', logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png', color: '#0052FF' },
  { key: 'arbitrum', label: 'Arbitrum', logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png', color: '#12AAFF' },
  { key: 'bsc', label: 'BSC', logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png', color: '#F3BA2F' },
  { key: 'polygon', label: 'Polygon', logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png', color: '#8247E5' },
  { key: 'optimism', label: 'Optimism', logo: '', color: '#FF0420' },
  { key: 'avalanche', label: 'Avalanche', logo: '', color: '#E84142' },
  { key: 'ton', label: 'TON', logo: '', color: '#0098EA' },
];

const RETRY_DELAY_MS = 4000;
const FLASH_DURATION_MS = 950;

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
  | 'signal'
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

function formatPairCount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
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
    signal: market.signalScore,
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
    setFlash('signal', changeDirection(prevMetrics.signal, nextMetrics.signal));
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
      ? 'text-secondary'
      : value < 0
        ? 'text-destructive'
        : 'text-muted-foreground';

  return (
    <LiveValue direction={direction} className={`${color} font-mono tabular-nums`}>
      {fmtPct(value)}
    </LiveValue>
  );
}

function SignalBar({
  score,
  riskFlags,
  direction,
}: {
  score: number;
  riskFlags: string[];
  direction?: FlashDirection;
}) {
  const color = riskFlags.length > 0 ? 'bg-yellow-400' : score >= 70 ? 'bg-secondary' : score >= 45 ? 'bg-primary' : 'bg-muted-foreground';

  return (
    <div className={`flex items-center gap-1.5 rounded px-1 -mx-1 will-change-transform ${flashClass(direction)}`}>
      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-[width] duration-700 ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{score}</span>
    </div>
  );
}

interface MarketsTableProps {
  onSelectToken: (market: MarketToken) => void;
}

export default function MarketsTable({ onSelectToken }: MarketsTableProps) {
  const [markets, setMarkets] = useState<MarketToken[]>([]);
  const [flashMap, setFlashMap] = useState<MarketFlashMap>({});
  const [sortBy, setSortBy] = useState<SortKey>('trending');
  const [search, setSearch] = useState('');
  const [chain, setChain] = useState('all');
  const [totalPairs, setTotalPairs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watchlistToken, setWatchlistToken] = useState<string | null>(null);
  const [watchlisted, setWatchlisted] = useState<Set<string>>(new Set());
  const [refreshTick, setRefreshTick] = useState(0);
  const previousMarketsRef = useRef<Map<string, MarketToken>>(new Map());
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(() => {
      setLoading(true);
      setError(null);

      fetchMarkets({
        chain,
        q: search.trim() || undefined,
        sort: sortBy,
        limit: 100,
        signal: controller.signal,
      })
        .then((response) => {
          const nextFlashes = buildFlashMap(previousMarketsRef.current, response.data);
          previousMarketsRef.current = new Map(response.data.map((market) => [market.id, market]));
          setMarkets(response.data);
          setTotalPairs(response.total);
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

  const visibleChains = useMemo(() => {
    const keys = new Set(markets.map((market) => market.chainId));
    return CHAIN_CONFIG.filter((chainConfig) => chainConfig.key === 'all' || keys.has(chainConfig.key));
  }, [markets]);

  const toggleWatchlist = (e: React.MouseEvent, market: MarketToken) => {
    e.stopPropagation();
    if (watchlisted.has(market.id)) {
      setWatchlisted((s) => { const n = new Set(s); n.delete(market.id); return n; });
      toast.info('Removed from watchlist', { description: `${marketPairLabel(market)} removed.` });
    } else {
      setWatchlistToken(market.symbol);
      setWatchlisted((s) => new Set(s).add(market.id));
    }
  };

  if (markets.length === 0 && (loading || error)) return <MarketsTableSkeleton />;

  return (
    <>
      <WatchlistModal open={!!watchlistToken} onOpenChange={(o) => !o && setWatchlistToken(null)} token={watchlistToken || undefined} />

      <div className="flex flex-col h-full overflow-hidden">
        <div className="shrink-0 border-b border-border bg-background">
          <div className="flex items-center gap-1.5 px-2 py-1.5">
            {SORT_OPTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSortBy(s.key)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold border transition ${
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
              <button className="p-1 border border-border rounded hover:bg-muted text-muted-foreground hover:text-foreground transition" title="Filters">
                <Filter size={13} />
              </button>
              <button
                onClick={() => setRefreshTick((tick) => tick + 1)}
                className="p-1 border border-border rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                title="Refresh"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 px-2 pb-1.5 overflow-x-auto">
            {visibleChains.map((c) => (
              <button
                key={c.key}
                onClick={() => setChain(c.key)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs border transition shrink-0 whitespace-nowrap ${
                  chain === c.key
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                }`}
              >
                {c.logo ? (
                  <img src={c.logo} alt={c.label} className="w-3.5 h-3.5 rounded-full object-cover" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full bg-muted-foreground/30 inline-block" />
                )}
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {markets.length === 0 ? (
            <EmptySearch onReset={() => { setSearch(''); setChain('all'); }} />
          ) : (
            <table className="w-full text-xs border-collapse min-w-[900px]">
              <thead className="sticky top-0 bg-background border-b border-border z-10">
                <tr className="text-muted-foreground text-left">
                  <th className="w-7 px-2 py-1.5 font-medium">#</th>
                  <th className="px-2 py-1.5 font-medium min-w-[190px]">Pair</th>
                  <th className="px-2 py-1.5 font-medium text-right whitespace-nowrap">MCAP / Price</th>
                  <th className="px-2 py-1.5 font-medium text-right">Age</th>
                  <th className="px-2 py-1.5 font-medium whitespace-nowrap">Signal</th>
                  <th className="px-2 py-1.5 font-medium text-right">5m</th>
                  <th className="px-2 py-1.5 font-medium text-right">1h</th>
                  <th className="px-2 py-1.5 font-medium text-right">6h</th>
                  <th className="px-2 py-1.5 font-medium text-right">24h</th>
                  <th className="px-2 py-1.5 font-medium text-right">Liq</th>
                  <th className="px-2 py-1.5 font-medium text-right">TXN</th>
                  <th className="px-2 py-1.5 font-medium text-right">Vol</th>
                  <th className="px-2 py-1.5 font-medium">Tags</th>
                </tr>
              </thead>
              <tbody>
                {markets.map((market, idx) => {
                  const chainConfig = CHAIN_MAP[market.chainId];
                  const txn24 = market.txns.h24.buys + market.txns.h24.sells;
                  const marketFlashes = flashMap[market.id] ?? {};

                  return (
                    <tr
                      key={market.id}
                      onClick={() => onSelectToken(market)}
                      className="border-b border-border/50 hover:bg-muted/40 cursor-pointer group"
                    >
                      <td className="px-2 py-1.5 text-muted-foreground font-mono tabular-nums">{idx + 1}</td>

                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => toggleWatchlist(e, market)}
                            className={`transition shrink-0 ${watchlisted.has(market.id) ? 'text-yellow-400' : 'text-muted-foreground opacity-0 group-hover:opacity-100'}`}
                            title="Watchlist"
                          >
                            <Star size={11} fill={watchlisted.has(market.id) ? 'currentColor' : 'none'} />
                          </button>
                          <div className="relative shrink-0">
                            <TokenAvatar market={market} />
                            {chainConfig?.logo ? (
                              <img
                                src={chainConfig.logo}
                                alt={market.chainLabel}
                                className="absolute -bottom-0.5 -right-1 w-3.5 h-3.5 rounded-full ring-1 ring-background object-cover"
                              />
                            ) : (
                              <span
                                className="absolute -bottom-0.5 -right-1 text-[8px] font-bold px-0.5 rounded leading-tight"
                                style={{ backgroundColor: chainConfig?.color ?? '#6b7280', color: '#fff' }}
                              >
                                {market.chainId.slice(0, 3).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-foreground leading-tight">{marketPairLabel(market)}</div>
                            <div className="text-muted-foreground leading-tight truncate max-w-[150px]">
                              {market.name} · {market.dexId}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-2 py-1.5 text-right">
                        <LiveValue
                          block
                          direction={marketFlashes.mcap}
                          className="font-bold text-violet-700 dark:text-violet-300 font-mono tabular-nums"
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

                      <td className="px-2 py-1.5 text-right text-muted-foreground">
                        <LiveValue direction={marketFlashes.age} className="text-muted-foreground">
                          {fmtAge(market.ageMinutes)}
                        </LiveValue>
                      </td>
                      <td className="px-2 py-1.5">
                        <SignalBar score={market.signalScore} riskFlags={market.riskFlags} direction={marketFlashes.signal} />
                      </td>

                      <td className="px-2 py-1.5 text-right"><Pct value={market.priceChange.m5} direction={marketFlashes.m5} /></td>
                      <td className="px-2 py-1.5 text-right"><Pct value={market.priceChange.h1} direction={marketFlashes.h1} /></td>
                      <td className="px-2 py-1.5 text-right"><Pct value={market.priceChange.h6} direction={marketFlashes.h6} /></td>
                      <td className="px-2 py-1.5 text-right"><Pct value={market.priceChange.h24} direction={marketFlashes.h24} /></td>

                      <td className="px-2 py-1.5 text-right font-mono text-muted-foreground tabular-nums">
                        <LiveValue direction={marketFlashes.liq} className="font-mono text-muted-foreground tabular-nums">
                          {fmtCompact(market.liquidityUsd, { currency: true })}
                        </LiveValue>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-muted-foreground tabular-nums">
                        <LiveValue direction={marketFlashes.txn} className="font-mono text-muted-foreground tabular-nums">
                          {fmtCompact(txn24, { digits: 0 })}
                        </LiveValue>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-muted-foreground tabular-nums">
                        <LiveValue direction={marketFlashes.vol} className="font-mono text-muted-foreground tabular-nums">
                          {fmtCompact(market.volume.h24, { currency: true })}
                        </LiveValue>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex gap-1 flex-wrap max-w-[180px]">
                          {(market.narrativeTags.length > 0 ? market.narrativeTags : [market.chainLabel]).slice(0, 3).map((tag) => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/60">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="shrink-0 border-t border-border bg-background px-3 py-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing pairs {markets.length > 0 ? `1-${markets.length}` : '0-0'} of {formatPairCount(totalPairs)}
          </span>
          <span>{error ? 'Last refresh failed; showing latest loaded data' : 'Auto refreshed on filter changes'}</span>
        </div>
      </div>
    </>
  );
}
