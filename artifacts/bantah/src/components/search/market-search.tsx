import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  ChevronLeft,
  Clock3,
  Flame,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { EmptySearch } from '@/components/common/empty-states';
import { Skeleton } from '@/components/ui/skeleton';
import { getDexBrand } from '@/lib/dex-branding';
import {
  fetchMarkets,
  fmtAge,
  fmtCompact,
  fmtPct,
  fmtPrice,
  marketPairLabel,
  type MarketListResponse,
  type MarketToken,
  type SortKey,
} from '@/lib/market-data';

type SearchMode = 'modal' | 'page';
type SearchShelfKey = Extract<SortKey, 'trending' | 'new' | 'gainers' | 'volume'>;

interface MarketSearchProps {
  mode: SearchMode;
  onBack?: () => void;
  onSelectToken?: (token: MarketToken) => void;
}

interface SearchShelf {
  key: SearchShelfKey;
  label: string;
  description: string;
  icon: LucideIcon;
}

const SEARCH_SHELVES: SearchShelf[] = [
  {
    key: 'trending',
    label: 'Trending',
    description: 'Highest signal score across the live market feed.',
    icon: Flame,
  },
  {
    key: 'new',
    label: 'Fresh Pairs',
    description: 'Newly created pairs that just hit the board.',
    icon: Clock3,
  },
  {
    key: 'gainers',
    label: '24h Movers',
    description: 'Strongest 24-hour momentum in the active universe.',
    icon: TrendingUp,
  },
  {
    key: 'volume',
    label: 'High Volume',
    description: 'Pairs pulling the deepest 24-hour flow right now.',
    icon: Activity,
  },
];

const CHAIN_OPTIONS = [
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
] as const;

const CHAIN_FILTER_LABELS: Record<string, string> = {
  all: 'All',
  solana: 'SOL',
  ethereum: 'ETH',
  base: 'Base',
  arbitrum: 'ARB',
  bsc: 'BSC',
  polygon: 'POL',
  optimism: 'OP',
  avalanche: 'AVAX',
  ton: 'TON',
  robinhood: 'RH',
};

const DEFAULT_DISCOVERY_LIMIT = 8;
const SEARCH_RESULT_LIMIT = 24;

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function ChainBadge({
  chainId,
  chainLabel,
  dense = false,
}: {
  chainId: string;
  chainLabel: string;
  dense?: boolean;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const config = CHAIN_OPTIONS.find((option) => option.key === chainId) ?? {
    key: chainId,
    label: chainLabel,
    logo: '',
    color: '#6b7280',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 text-muted-foreground',
        dense ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]',
      )}
    >
      {config.logo && !logoFailed ? (
        <img
          src={config.logo}
          alt=""
          onError={() => setLogoFailed(true)}
          className={cn('rounded-full object-cover', dense ? 'h-3 w-3' : 'h-3.5 w-3.5')}
        />
      ) : (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full text-[8px] font-bold text-white',
            dense ? 'h-3 w-3' : 'h-3.5 w-3.5',
          )}
          style={{ backgroundColor: config.color }}
        >
          {config.label.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'CH'}
        </span>
      )}
      <span>{config.label}</span>
    </span>
  );
}

function TokenAvatar({ token, compact = false }: { token: MarketToken; compact?: boolean }) {
  const sizeClass = compact ? 'h-9 w-9 sm:h-10 sm:w-10' : 'h-10 w-10';

  if (token.imageUrl) {
    return <img src={token.imageUrl} alt="" className={cn(sizeClass, 'rounded-full bg-muted object-cover')} />;
  }

  return (
    <span
      className={cn(
        'flex items-center justify-center rounded-full border border-primary/30 bg-primary/15 font-black text-primary',
        sizeClass,
        compact ? 'text-[10px] sm:text-[11px]' : 'text-[11px]',
      )}
    >
      {token.symbol.slice(0, 2).toUpperCase()}
    </span>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'primary',
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tone?: 'primary' | 'info';
}) {
  const accentClasses =
    tone === 'info'
      ? {
          icon: 'bg-sky-400/12 text-sky-500 dark:text-sky-300',
          label: 'text-sky-600 dark:text-sky-300',
          value: 'text-sky-600 dark:text-sky-300',
        }
      : {
          icon: 'bg-primary/10 text-primary',
          label: '',
          value: 'text-foreground',
        };

  return (
    <div className="surface-sheen rounded-2xl border border-border bg-card/80 p-2.5 shadow-sm sm:p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-full sm:h-8 sm:w-8', accentClasses.icon)}>
          <Icon size={14} />
        </span>
        <span className={cn('text-[10px] font-semibold uppercase tracking-[0.14em] sm:text-[11px] sm:tracking-[0.18em]', accentClasses.label)}>
          {label}
        </span>
      </div>
      <div className={cn('mt-2 text-base font-black tracking-tight sm:mt-3 sm:text-lg', accentClasses.value)}>{value}</div>
      <div className="mt-1 hidden text-xs text-muted-foreground sm:block">{hint}</div>
    </div>
  );
}

function SearchMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'negative' | 'info';
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/70 px-2.5 py-2 text-left">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div
        className={cn(
          'mt-1 text-sm font-bold',
          tone === 'info' && 'text-sky-600 dark:text-sky-300',
          tone === 'positive' && 'text-success',
          tone === 'negative' && 'text-destructive',
          tone === 'default' && 'text-foreground',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function SearchMarketRow({
  token,
  onSelectToken,
}: {
  token: MarketToken;
  onSelectToken?: (token: MarketToken) => void;
}) {
  const brand = getDexBrand(token.dexId);
  const dailyChange = token.priceChange.h24;
  const leadingTags = [...token.narrativeTags, ...token.riskFlags].slice(0, 3);

  return (
    <button
      type="button"
      onClick={() => onSelectToken?.(token)}
      className="tap-feedback group w-full px-3 py-2.5 text-left transition hover:bg-muted/35 sm:px-4 sm:py-3"
    >
      <div className="sm:hidden">
        <div className="flex items-start gap-2.5">
          <TokenAvatar token={token} compact />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-black leading-5 text-foreground">{marketPairLabel(token)}</div>
                <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="truncate">{token.name}</span>
                  <ChainBadge chainId={token.chainId} chainLabel={token.chainLabel} dense />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-black leading-5 text-foreground">{fmtPrice(token.priceUsd)}</div>
                <div
                  className={cn(
                    'text-xs font-bold',
                    typeof dailyChange === 'number' && (dailyChange >= 0 ? 'text-success' : 'text-destructive'),
                  )}
                >
                  {fmtPct(dailyChange)}
                </div>
              </div>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold text-muted-foreground">
              <span>{brand?.label ?? token.dexId.toUpperCase()}</span>
              <span>Score {token.signalScore}</span>
              <span>{fmtCompact(token.liquidityUsd, { currency: true })} liq</span>
              <span>{fmtCompact(token.volume.h24, { currency: true })} vol</span>
            </div>

            {leadingTags.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {leadingTags.slice(0, 2).map((tag) => (
                  <span
                    key={`${token.id}-mobile-${tag}`}
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[9px] font-semibold',
                      token.riskFlags.includes(tag)
                        ? 'border border-destructive/20 bg-destructive/8 text-destructive'
                        : 'border border-primary/20 bg-primary/8 text-primary',
                    )}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="hidden flex-col gap-3 sm:flex xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <TokenAvatar token={token} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-black text-foreground">{marketPairLabel(token)}</span>
              <ChainBadge chainId={token.chainId} chainLabel={token.chainLabel} />
              <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
                {brand?.logoUrl ? (
                  <img src={brand.logoUrl} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />
                ) : null}
                <span>{brand?.label ?? token.dexId.toUpperCase()}</span>
              </span>
              <span className="text-xs text-muted-foreground">Age {fmtAge(token.ageMinutes)}</span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate">{token.name}</span>
              <span>Score {token.signalScore}</span>
              <span>{fmtCompact(token.liquidityUsd, { currency: true })} liq</span>
            </div>

            {leadingTags.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {leadingTags.map((tag) => (
                  <span
                    key={`${token.id}-${tag}`}
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      token.riskFlags.includes(tag)
                        ? 'border border-destructive/20 bg-destructive/8 text-destructive'
                        : 'border border-primary/20 bg-primary/8 text-primary',
                    )}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[360px]">
          <SearchMetric label="Price" value={fmtPrice(token.priceUsd)} />
          <SearchMetric
            label="24h"
            value={fmtPct(dailyChange)}
            tone={typeof dailyChange === 'number' ? (dailyChange >= 0 ? 'positive' : 'negative') : 'default'}
          />
          <SearchMetric
            label="MCap"
            value={fmtCompact(token.marketCap ?? token.fdv, { currency: true })}
            tone="info"
          />
          <SearchMetric label="Vol" value={fmtCompact(token.volume.h24, { currency: true })} />
        </div>

        <span className="hidden text-muted-foreground transition group-hover:text-primary xl:block">
          <ArrowUpRight size={16} />
        </span>
      </div>
    </button>
  );
}

function CompactMarketRow({
  token,
  onSelectToken,
}: {
  token: MarketToken;
  onSelectToken?: (token: MarketToken) => void;
}) {
  const dailyChange = token.priceChange.h24;

  return (
    <button
      type="button"
      onClick={() => onSelectToken?.(token)}
      className="tap-feedback flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left transition hover:bg-muted/35 sm:gap-3 sm:px-3 sm:py-2"
    >
      <TokenAvatar token={token} compact />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-bold text-foreground">{marketPairLabel(token)}</span>
          <ChainBadge chainId={token.chainId} chainLabel={token.chainLabel} dense />
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{fmtPrice(token.priceUsd)}</span>
          <span className={typeof dailyChange === 'number' ? (dailyChange >= 0 ? 'text-success' : 'text-destructive') : ''}>
            {fmtPct(dailyChange)}
          </span>
        </div>
      </div>
      <ArrowUpRight size={14} className="shrink-0 text-muted-foreground" />
    </button>
  );
}

function LoadingBoard() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <Skeleton className="h-9 w-9 rounded-full sm:h-10 sm:w-10" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <div className="hidden flex-1 grid-cols-2 gap-2 sm:grid sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, metricIndex) => (
                <Skeleton key={metricIndex} className="h-16 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CompactShelf({
  shelf,
  response,
  loading,
  onSelectToken,
}: {
  shelf: SearchShelf;
  response?: MarketListResponse;
  loading: boolean;
  onSelectToken?: (token: MarketToken) => void;
}) {
  const Icon = shelf.icon;

  return (
    <section className="surface-sheen overflow-hidden rounded-2xl border border-border bg-card/80 shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2.5 sm:py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary sm:h-8 sm:w-8">
              <Icon size={14} />
            </span>
            <span className="text-sm font-black tracking-tight text-foreground">{shelf.label}</span>
          </div>
          <p className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block">{shelf.description}</p>
        </div>
        <span className="rounded-full border border-border bg-background/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {(response?.data.length ?? 0).toString().padStart(2, '0')}
        </span>
      </div>

      <div className="divide-y divide-border">
        {loading
          ? Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 px-3 py-2.5">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))
          : response?.data.slice(0, 4).map((token) => (
              <CompactMarketRow key={token.id} token={token} onSelectToken={onSelectToken} />
            ))}
      </div>
    </section>
  );
}

export default function MarketSearch({ mode, onBack, onSelectToken }: MarketSearchProps) {
  const [query, setQuery] = useState('');
  const [activeChain, setActiveChain] = useState<string>('all');
  const [activeShelf, setActiveShelf] = useState<SearchShelfKey>('trending');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [discoveries, setDiscoveries] = useState<Partial<Record<SearchShelfKey, MarketListResponse>>>({});
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResponse, setSearchResponse] = useState<MarketListResponse | null>(null);

  const normalizedQuery = query.trim();
  const selectedChain = activeChain === 'all' ? undefined : activeChain;
  const activeShelfConfig = SEARCH_SHELVES.find((shelf) => shelf.key === activeShelf) ?? SEARCH_SHELVES[0];

  useEffect(() => {
    const controller = new AbortController();
    setDiscoveryLoading(true);
    setDiscoveryError(null);

    Promise.all(
      SEARCH_SHELVES.map(async (shelf) => {
        const response = await fetchMarkets({
          chain: selectedChain,
          sort: shelf.key,
          limit: DEFAULT_DISCOVERY_LIMIT,
          signal: controller.signal,
        });

        return [shelf.key, response] as const;
      }),
    )
      .then((responses) => {
        setDiscoveries(Object.fromEntries(responses));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setDiscoveries({});
        setDiscoveryError(error instanceof Error ? error.message : 'Failed to load live discovery.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setDiscoveryLoading(false);
        }
      });

    return () => controller.abort();
  }, [refreshTick, selectedChain]);

  useEffect(() => {
    if (!normalizedQuery) {
      setSearchResponse(null);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearchLoading(true);
      setSearchError(null);

      fetchMarkets({
        q: normalizedQuery,
        chain: selectedChain,
        sort: activeShelf,
        limit: SEARCH_RESULT_LIMIT,
        signal: controller.signal,
      })
        .then((response) => setSearchResponse(response))
        .catch((error) => {
          if (controller.signal.aborted) return;
          setSearchResponse(null);
          setSearchError(error instanceof Error ? error.message : 'Failed to search markets.');
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setSearchLoading(false);
          }
        });
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [activeShelf, normalizedQuery, refreshTick, selectedChain]);

  const primaryResponse = discoveries[activeShelf];
  const featuredMarkets = primaryResponse?.data ?? [];
  const resultMarkets = searchResponse?.data ?? [];
  const visibleMarkets = normalizedQuery ? resultMarkets : featuredMarkets;

  const summary = normalizedQuery ? searchResponse : primaryResponse;
  const alternateShelves = SEARCH_SHELVES.filter((shelf) => shelf.key !== activeShelf);

  const chainBreakdown = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();

    for (const token of visibleMarkets) {
      const current = counts.get(token.chainId);
      counts.set(token.chainId, {
        label: token.chainLabel,
        count: (current?.count ?? 0) + 1,
      });
    }

    return [...counts.entries()]
      .map(([chainId, value]) => ({
        chainId,
        label: value.label,
        count: value.count,
      }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 4);
  }, [visibleMarkets]);

  const quickQueries = useMemo(() => {
    const seeds = new Set<string>();

    for (const token of featuredMarkets) {
      if (token.symbol) seeds.add(token.symbol);
      for (const tag of token.narrativeTags) {
        if (tag.length <= 18) seeds.add(tag);
      }
      if (seeds.size >= 6) break;
    }

    return [...seeds].slice(0, 6);
  }, [featuredMarkets]);

  const showError = normalizedQuery ? searchError : discoveryError;
  const showLoading = normalizedQuery ? searchLoading : discoveryLoading;
  const shellWidthClass = mode === 'modal' ? 'max-w-[68rem]' : 'max-w-7xl';
  const summaryGridClass = mode === 'modal' ? 'xl:grid-cols-2' : 'xl:grid-cols-4';
  const contentGridClass =
    mode === 'modal' ? 'xl:grid-cols-[minmax(0,1.75fr)_300px]' : 'xl:grid-cols-[minmax(0,1.6fr)_340px]';

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-background', mode === 'modal' && 'rounded-[28px] bg-card')}>
      {mode === 'page' ? (
        <div className="mobile-app-bar border-b border-border bg-card/85 px-3 py-2 backdrop-blur sm:px-4 sm:py-3">
          <div className="flex items-center gap-3">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="tap-feedback inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-foreground transition hover:bg-muted sm:h-10 sm:w-10"
                aria-label="Back"
              >
                <ChevronLeft size={18} />
              </button>
            ) : null}
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary sm:text-[11px] sm:tracking-[0.2em]">Search</div>
              <h1 className="hidden truncate text-lg font-black tracking-tight text-foreground sm:block sm:text-xl">Explore live markets</h1>
            </div>
          </div>
        </div>
      ) : null}

      <div className={cn('shrink-0 border-b border-border bg-card/85 backdrop-blur', mode === 'modal' ? 'pr-12' : '')}>
        <div className="px-3 py-3 sm:px-4 sm:py-4">
          <div className="surface-sheen rounded-[20px] border border-border bg-background/90 p-2 shadow-sm sm:rounded-[24px] sm:p-3">
            <div className="flex gap-2 lg:gap-3">
              <div className="surface-sheen flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5 sm:gap-3 sm:py-3">
                <Search size={16} className="shrink-0 text-primary sm:size-[18px]" />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search token, pair, contract..."
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {normalizedQuery ? (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="tap-feedback rounded-full border border-border bg-background px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground transition hover:text-foreground"
                  >
                    Clear
                  </button>
                ) : (
                  <span className="hidden rounded-full border border-border bg-background px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:inline-flex">
                    Live
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setMobileFiltersOpen((open) => !open)}
                className={cn(
                  'tap-feedback inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-foreground transition sm:hidden',
                  mobileFiltersOpen ? 'border-primary bg-primary/12 text-primary' : 'border-border bg-card hover:bg-muted',
                )}
                aria-label="Search filters"
                aria-expanded={mobileFiltersOpen}
              >
                <SlidersHorizontal size={16} />
              </button>

              <button
                type="button"
                onClick={() => setRefreshTick((tick) => tick + 1)}
                className="tap-feedback inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-2xl border border-border bg-card text-sm font-semibold text-foreground transition hover:bg-muted sm:h-auto sm:w-auto sm:px-4 sm:py-3"
                aria-label="Refresh search results"
              >
                <RefreshCw size={16} className={showLoading ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>

            <div className="mt-2 hidden gap-1.5 overflow-x-auto pb-1 sm:mt-3 sm:flex sm:gap-2">
              {SEARCH_SHELVES.map((shelf) => {
                const Icon = shelf.icon;
                const active = activeShelf === shelf.key;

                return (
                  <button
                    key={shelf.key}
                    type="button"
                    onClick={() => setActiveShelf(shelf.key)}
                    className={cn(
                      'tap-feedback inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition sm:gap-2 sm:px-3 sm:text-xs',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon size={13} />
                    <span>{shelf.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-2 hidden gap-1.5 overflow-x-auto pb-1 sm:mt-3 sm:flex sm:gap-2">
              {CHAIN_OPTIONS.map((chain) => {
                const active = chain.key === activeChain;

                return (
                  <button
                    key={chain.key}
                    type="button"
                    onClick={() => setActiveChain(chain.key)}
                    aria-label={`Filter by ${chain.label}`}
                    className={cn(
                      'tap-feedback inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition sm:gap-2 sm:px-3 sm:text-xs',
                      active
                        ? 'border-primary bg-primary/12 text-foreground'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: chain.color }} />
                    <span>{CHAIN_FILTER_LABELS[chain.key] ?? chain.label}</span>
                  </button>
                );
              })}
            </div>

            {mobileFiltersOpen ? (
              <div className="mt-2 space-y-2 rounded-2xl border border-border bg-card/70 p-2 sm:hidden">
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {SEARCH_SHELVES.map((shelf) => {
                    const Icon = shelf.icon;
                    const active = activeShelf === shelf.key;

                    return (
                      <button
                        key={shelf.key}
                        type="button"
                        onClick={() => setActiveShelf(shelf.key)}
                        className={cn(
                          'tap-feedback inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition',
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <Icon size={13} />
                        <span>{shelf.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {CHAIN_OPTIONS.map((chain) => {
                    const active = chain.key === activeChain;

                    return (
                      <button
                        key={chain.key}
                        type="button"
                        onClick={() => setActiveChain(chain.key)}
                        aria-label={`Filter by ${chain.label}`}
                        className={cn(
                          'tap-feedback inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition',
                          active
                            ? 'border-primary bg-primary/12 text-foreground'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: chain.color }} />
                        <span>{CHAIN_FILTER_LABELS[chain.key] ?? chain.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {!normalizedQuery && quickQueries.length > 0 ? (
              <div className="mt-2 hidden items-center gap-1.5 overflow-x-auto pb-1 sm:mt-3 sm:flex sm:gap-2">
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:text-[11px] sm:tracking-[0.18em]">
                  Try
                </span>
                {quickQueries.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => setQuery(term)}
                    className="tap-feedback inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground transition hover:border-primary/40 hover:bg-primary/6 sm:px-3 sm:text-xs"
                  >
                    <Sparkles size={12} className="text-primary" />
                    {term}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(249,149,61,0.11),transparent_30%),linear-gradient(180deg,rgba(12,17,29,0.04),transparent_18%)]">
        <div className={cn('mx-auto flex flex-col gap-3 p-3 sm:gap-4 sm:p-4', shellWidthClass)}>
          <div className={cn('motion-stagger grid grid-cols-2 gap-2 sm:gap-3', summaryGridClass)}>
            <SummaryCard
              icon={Flame}
              label="Pairs"
              value={summary ? new Intl.NumberFormat('en-US').format(summary.total) : '--'}
              hint={normalizedQuery ? 'Search matches in the current filter' : 'Live indexed pairs ready to scan'}
            />
            <SummaryCard
              icon={Sparkles}
              label="Tokens"
              value={summary ? new Intl.NumberFormat('en-US').format(summary.aggregates.tokenCount) : '--'}
              hint={selectedChain ? `Coverage for ${selectedChain}` : 'Cross-chain token coverage'}
            />
            <SummaryCard
              icon={Activity}
              label="24h Volume"
              value={summary ? fmtCompact(summary.aggregates.volume24hUsd, { currency: true }) : '--'}
              hint="Flow measured across the active result set"
            />
            <SummaryCard
              icon={TrendingUp}
              label="MCap"
              value={summary ? fmtCompact(summary.aggregates.marketCapUsd, { currency: true }) : '--'}
              hint="Aggregate market cap from the selected feed"
              tone="info"
            />
          </div>

          <div className={cn('motion-stagger grid gap-3 sm:gap-4', contentGridClass)}>
            <section className="surface-sheen overflow-hidden rounded-2xl border border-border bg-card/80 shadow-sm sm:rounded-[28px]">
              <div className="border-b border-border px-3 py-3 sm:px-4 sm:py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary sm:text-[11px] sm:tracking-[0.22em]">
                      {normalizedQuery ? 'Search Results' : activeShelfConfig.label}
                    </div>
                    <h2 className="mt-0.5 truncate text-lg font-black tracking-tight text-foreground sm:mt-1 sm:text-2xl">
                      {normalizedQuery ? `Results for "${normalizedQuery}"` : 'Live market discovery'}
                    </h2>
                    <p className="mt-2 hidden max-w-2xl text-sm leading-6 text-muted-foreground sm:block">
                      {normalizedQuery
                        ? `Sorted by ${activeShelfConfig.label.toLowerCase()} and filtered to ${selectedChain ?? 'all chains'}.`
                        : activeShelfConfig.description}
                    </p>
                  </div>

                  <div className="shrink-0 rounded-2xl border border-border bg-background/80 px-2.5 py-1.5 text-right sm:px-3 sm:py-2">
                    <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:text-[10px] sm:tracking-[0.18em]">Visible</div>
                    <div className="mt-0.5 text-base font-black text-foreground sm:mt-1 sm:text-lg">
                      {visibleMarkets.length.toString().padStart(2, '0')}
                    </div>
                  </div>
                </div>
              </div>

              {showLoading ? (
                <LoadingBoard />
              ) : showError ? (
                <div className="px-4 py-10 text-center">
                  <div className="mx-auto max-w-md rounded-2xl border border-destructive/20 bg-destructive/8 p-5">
                    <div className="text-sm font-bold text-foreground">Search feed unavailable</div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{showError}</p>
                    <button
                      type="button"
                      onClick={() => setRefreshTick((tick) => tick + 1)}
                      className="tap-feedback mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:opacity-90"
                    >
                      <RefreshCw size={14} />
                      Retry search
                    </button>
                  </div>
                </div>
              ) : visibleMarkets.length === 0 ? (
                <EmptySearch onReset={() => setQuery('')} />
              ) : (
                <div className="divide-y divide-border">
                  {visibleMarkets.map((token) => (
                    <SearchMarketRow key={token.id} token={token} onSelectToken={onSelectToken} />
                  ))}
                </div>
              )}
            </section>

            <aside className="space-y-3 sm:space-y-4">
              <section className="surface-sheen rounded-2xl border border-border bg-card/80 p-3 shadow-sm sm:rounded-[28px] sm:p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary sm:text-[11px] sm:tracking-[0.22em]">Coverage</div>
                <h3 className="mt-0.5 text-base font-black tracking-tight text-foreground sm:mt-1 sm:text-lg">Search where the action is</h3>
                <p className="mt-2 hidden text-sm leading-6 text-muted-foreground sm:block">
                  Jump between chains, switch discovery modes, and select a live pair to open its full dashboard.
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:block sm:space-y-2">
                  {chainBreakdown.length > 0 ? (
                    chainBreakdown.map((chain) => (
                      <div
                        key={chain.chainId}
                        className="flex items-center justify-between rounded-2xl border border-border bg-background/80 px-2.5 py-1.5 sm:px-3 sm:py-2"
                      >
                        <ChainBadge chainId={chain.chainId} chainLabel={chain.label} dense />
                        <span className="text-xs font-bold text-foreground sm:text-sm">{chain.count}</span>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-2 rounded-2xl border border-border bg-background/80 px-3 py-3 text-sm text-muted-foreground">
                      {normalizedQuery
                        ? 'Results will show the strongest matching chains here.'
                        : 'Live chain distribution appears once discovery loads.'}
                    </div>
                  )}
                </div>

                <div className="mt-4 hidden rounded-2xl border border-border bg-background/80 p-3 sm:block">
                  <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <Search size={14} className="text-primary" />
                    Search tips
                  </div>
                  <div className="mt-2 space-y-2 text-xs leading-5 text-muted-foreground">
                    <div>Use symbols like `PEPE`, chain names like `Base`, or full contract addresses.</div>
                    <div>Switch to `Fresh Pairs` when you want newer launches instead of strongest momentum.</div>
                    <div>Use the chain chips to tighten noisy results before opening a token dashboard.</div>
                  </div>
                </div>
              </section>

              {alternateShelves.map((shelf) => (
                <CompactShelf
                  key={shelf.key}
                  shelf={shelf}
                  response={discoveries[shelf.key]}
                  loading={discoveryLoading}
                  onSelectToken={onSelectToken}
                />
              ))}
            </aside>
          </div>

          {!normalizedQuery && discoveryLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card/70 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 size={15} className="animate-spin" />
              Refreshing the live search universe
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
