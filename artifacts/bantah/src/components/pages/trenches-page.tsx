import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Copy,
  Crown,
  Flame,
  Globe,
  RefreshCw,
  Search,
  Shield,
  SlidersHorizontal,
  Target,
  Users,
  Zap,
} from 'lucide-react';
import {
  fetchLaunchpadPulse,
  fmtAge,
  fmtCompact,
  fmtPct,
  type LaunchpadBucket,
  type LaunchpadBucketId,
  type LaunchpadMarketToken,
  type LaunchpadPulseResponse,
  type MarketToken,
} from '@/lib/market-data';
import { BundleLabel } from '@/components/markets/bundle-label';
import { cn } from '@/lib/utils';

function RobinhoodIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 115.87 149.53" className={className}>
      <path fill="currentColor" d="m.86,149.53h3.3c.6,0,1.2-.3,1.4-.8C30.46,85.33,57.56,53.93,74.56,35.13c.7-.8.4-1.4-.6-1.4h-30.4c-1.1,0-2.03.44-2.8,1.4l-21.8,27c-3.2,4-4,7.7-4,13v27.6C7.86,122.63,3.36,136.13.06,148.33c-.2.78.1,1.2.8,1.2ZM110.56,4.03c-4.7-5-25.9-5.2-35.7-1.4-2.04.79-4,2.13-4.9,2.9-9,7.7-15,13.8-20.7,19.8-.7.7-.4,1.4.6,1.4h33.7c3.1,0,4.9,1.8,4.9,4.9v38c0,1,.8,1.3,1.4.4l20.3-26.5c3.3-4.3,4.3-5.6,5.2-11.6,1.2-8.8.5-22.3-4.8-27.9Zm-43.5,100.8l13.9-22.9c.3-.6.4-1.3.4-1.8v-38.2c0-1-.7-1.4-1.4-.6-20.9,23.3-37.2,47.8-52.3,77.3-.38.74.1,1.4,1,1.1l31.2-9.6c3.52-1.08,5.5-2.5,7.2-5.3Z" />
    </svg>
  );
}

interface LaunchpadPageProps {
  onSelectToken: (token: MarketToken) => void;
}

const BUCKET_ORDER: LaunchpadBucketId[] = ['new', 'bonding', 'bonded'];
const PULSE_REQUEST_LIMIT = 18;
const CLIENT_CACHE_TTL_MS = 5_000;
const AUTO_REFRESH_MS = 5_000;
const pulseClientCache = new Map<string, { data: LaunchpadPulseResponse; updatedAt: number }>();

const CHAINS = [
  { id: 'all', label: 'All', color: '#f9953d' },
  {
    id: 'solana',
    label: 'Solana',
    color: '#9945ff',
    logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',
  },
  {
    id: 'base',
    label: 'Base',
    color: '#0052ff',
    logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png',
  },
  {
    id: 'bsc',
    label: 'BSC',
    color: '#f3ba2f',
    logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png',
  },
  {
    id: 'ton',
    label: 'TON',
    color: '#0098ea',
    logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ton/info/logo.png',
  },
  {
    id: 'monad',
    label: 'Monad',
    color: '#7e87a7',
    logo: 'https://coin-images.coingecko.com/coins/images/38927/large/monad.jpg?1719547722',
  },
  {
    id: 'ethereum',
    label: 'Ethereum',
    color: '#627eea',
    logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
  },
  {
    id: 'arbitrum',
    label: 'Arbitrum',
    color: '#12aaff',
    logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',
  },
  {
    id: 'optimism',
    label: 'Optimism',
    color: '#ff0420',
    logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png',
  },
  {
    id: 'polygon',
    label: 'Polygon',
    color: '#8247e5',
    logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png',
  },
  {
    id: 'avalanche',
    label: 'Avalanche',
    color: '#e84142',
    logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png',
  },
  {
    id: 'robinhood',
    label: 'Robinhood',
    color: '#00c805',
  },
];

const CHAIN_BY_ID = Object.fromEntries(CHAINS.map((chain) => [chain.id, chain]));

function ChainLogo({
  chain,
  className = 'h-3.5 w-3.5',
}: {
  chain: (typeof CHAINS)[number];
  className?: string;
}) {
  if (!chain.logo) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-full border border-border bg-muted',
          chain.id === 'robinhood' ? 'text-[#00c805]' : 'text-muted-foreground',
          className,
        )}
        style={{ boxShadow: `inset 0 0 0 1px ${chain.color}33` }}
      >
        {chain.id === 'robinhood' ? <RobinhoodIcon className="h-2 w-2" /> : <Globe size={9} />}
      </span>
    );
  }

  return (
    <img
      src={chain.logo}
      alt={`${chain.label} logo`}
      className={cn('rounded-full object-cover ring-1 ring-border/60', className)}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}

function TokenChainBadge({ token }: { token: LaunchpadMarketToken }) {
  const chain = CHAIN_BY_ID[token.chainId.toLowerCase()];

  return (
    <span className="inline-flex min-w-0 items-center gap-1 truncate rounded-full border border-border/70 bg-background/55 px-1.5 py-0.5">
      {chain ? <ChainLogo chain={chain} className="h-3 w-3 shrink-0" /> : null}
      <span className="truncate">{token.chainLabel}</span>
    </span>
  );
}

function fmtInteger(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0';
  return Math.round(value).toLocaleString();
}

function fmtTinyPct(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a';
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function fmtQuickBuyLabel(value: string) {
  const match = value.trim().match(/^([\d,.]+)\s+(.+)$/);
  if (!match) return value;

  const amount = Number(match[1].replace(/,/g, ''));
  const asset = match[2].trim();
  if (!Number.isFinite(amount)) return value;

  const displayAmount =
    amount >= 1
      ? amount.toFixed(amount % 1 === 0 ? 0 : 3)
      : amount.toPrecision(3);

  return `${displayAmount.replace(/\.?0+$/, '')} ${asset}`;
}

function compactBucketSubtitle(bucket: LaunchpadBucket) {
  if (bucket.id === 'new') return 'Fresh pairs';
  if (bucket.id === 'bonding') return 'Bonding';
  return 'Migrated pools';
}

function shortAddress(value?: string) {
  if (!value) return 'n/a';
  if (value.length <= 10) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function pctTone(value?: number, dangerAt = 25) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'info';
  if (value <= 0) return 'muted';
  if (value >= dangerAt) return 'bad';
  if (value >= dangerAt / 2) return 'warn';
  return 'good';
}

function TokenAvatar({ token }: { token: LaunchpadMarketToken }) {
  const sourceLogo = token.launchpad.sourceLogo;

  return (
    <div className="relative h-14 w-14 shrink-0 overflow-visible rounded-xl border border-primary/35 bg-muted p-0.5 shadow-[0_0_0_1px_rgba(249,149,61,0.08)] sm:h-16 sm:w-16">
      {token.imageUrl ? (
        <img
          src={token.imageUrl}
          alt={token.symbol}
          className="h-full w-full rounded-[0.65rem] object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-[0.65rem] bg-primary/15 text-lg font-black text-primary">
          {token.symbol.slice(0, 2).toUpperCase()}
        </div>
      )}
      <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-background bg-emerald-400 text-[9px] text-background">
        {sourceLogo ? (
          <img src={sourceLogo} alt="" className="h-full w-full rounded-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <Zap size={10} fill="currentColor" />
        )}
      </span>
    </div>
  );
}

function TinyMetric({
  icon: Icon,
  value,
  tone = 'muted',
}: {
  icon: typeof Users;
  value: string;
  tone?: 'good' | 'warn' | 'bad' | 'info' | 'muted';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border border-border/65 bg-background/35 px-1 py-0.5 text-[9px] font-semibold leading-none',
        tone === 'good' && 'text-emerald-400/85',
        tone === 'warn' && 'text-yellow-300/90',
        tone === 'bad' && 'text-red-400/90',
        tone === 'info' && 'text-blue-400/85',
        tone === 'muted' && 'text-muted-foreground',
      )}
    >
      <Icon size={9} />
      <span>{value}</span>
    </span>
  );
}

function RightRail({ token }: { token: LaunchpadMarketToken }) {
  const txCount = token.launchpad.txCount5m ?? token.launchpad.txCount24h ?? token.txns.h24.buys + token.txns.h24.sells;
  const buys = token.txns.m5.buys || token.txns.h24.buys;
  const sells = token.txns.m5.sells || token.txns.h24.sells;
  const total = buys + sells;
  const buyWidth = total ? Math.max(10, Math.round((buys / total) * 100)) : 50;
  const bonding = token.launchpad.bondingPercent;

  return (
    <div className="ml-auto flex w-[5rem] shrink-0 flex-col items-end gap-1 text-right sm:w-[5.6rem]">
      <div className="space-y-0.5 text-[10px] leading-none text-muted-foreground">
        <div>
          MC: <span className="font-mono font-black text-primary">{fmtCompact(token.marketCap, { currency: true, digits: 0 })}</span>
        </div>
        <div>
          V: <span className="font-mono font-black text-foreground">{fmtCompact(token.volume.h24 ?? token.volume.m5, { currency: true, digits: 0 })}</span>
        </div>
      </div>

      <div className="w-full">
        <div className="mb-0.5 flex justify-between text-[9px] leading-none text-muted-foreground">
          <span>TX {fmtInteger(txCount)}</span>
          {typeof bonding === 'number' ? <span>{fmtTinyPct(bonding)}</span> : null}
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-primary to-red-400"
            style={{ width: `${buyWidth}%` }}
          />
        </div>
      </div>

      <span className="inline-flex max-w-full items-center gap-0.5 rounded-full bg-[#4967ff] px-1.5 py-1 text-[9px] font-black leading-none text-white shadow-[0_8px_18px_-12px_rgba(73,103,255,0.95)]">
        <Zap size={10} fill="currentColor" />
        <span className="truncate">{fmtQuickBuyLabel(token.launchpad.quickBuyLabel)}</span>
      </span>
    </div>
  );
}

function PulseRow({ token, onSelectToken }: { token: LaunchpadMarketToken; onSelectToken: (token: MarketToken) => void }) {
  const source = token.launchpad.sourceLabel ?? token.dexId;
  const holderCount = token.launchpad.holdersCount ?? token.security?.holderCount;
  const socialCount = token.links.length;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelectToken(token)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelectToken(token);
      }}
      className="group w-full cursor-pointer border-b border-border/55 bg-card/35 px-2 py-2 text-left transition hover:bg-muted/35"
    >
      <div className="flex min-w-0 gap-2">
        <TokenAvatar token={token} />

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-black leading-tight text-foreground">{token.symbol}</span>
            <span className="min-w-0 truncate text-sm font-semibold leading-tight text-muted-foreground">{token.name}</span>
            <Copy size={11} className="shrink-0 text-muted-foreground/75" />
          </div>

          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] leading-none text-muted-foreground">
            <span className="font-mono font-bold text-accent">{fmtAge(token.ageMinutes)}</span>
            <BundleLabel bundle={token.bundle} iconOnly className="h-4 w-4 justify-center rounded-full px-0 py-0 text-[8px]" />
            <span className="truncate">{shortAddress(token.tokenAddress)}</span>
            <Search size={12} />
            <Globe size={12} className={socialCount ? 'text-foreground' : ''} />
            <Users size={12} />
            <span>{fmtInteger(holderCount)}</span>
            <Shield size={12} />
            <span>{fmtInteger(token.launchpad.proTradersCount)}</span>
            <Crown size={12} />
            <span>{fmtInteger(token.signalScore)}</span>
          </div>

          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] leading-none text-muted-foreground">
            <span className="truncate rounded-full border border-border/70 bg-background/55 px-1.5 py-0.5">{source}</span>
            <TokenChainBadge token={token} />
            <span
              className={cn(
                'font-mono font-bold',
                (token.priceChange.m5 ?? token.priceChange.h24 ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400',
              )}
            >
              {fmtPct(token.priceChange.m5 ?? token.priceChange.h24)}
            </span>
          </div>

          <div className="mt-1.5 flex flex-wrap gap-0.5">
            <TinyMetric icon={Users} value={fmtTinyPct(token.launchpad.top10Pct)} tone={pctTone(token.launchpad.top10Pct, 35)} />
            <TinyMetric icon={Shield} value={fmtTinyPct(token.launchpad.devPct)} tone={pctTone(token.launchpad.devPct, 8)} />
            <TinyMetric icon={Target} value={fmtTinyPct(token.launchpad.snipersPct)} tone={pctTone(token.launchpad.snipersPct, 12)} />
            <TinyMetric icon={Flame} value={fmtTinyPct(token.launchpad.insidersPct)} tone={pctTone(token.launchpad.insidersPct, 10)} />
            <TinyMetric icon={Activity} value={fmtTinyPct(token.launchpad.bundlersPct)} tone={pctTone(token.launchpad.bundlersPct, 10)} />
          </div>
        </div>

        <RightRail token={token} />
      </div>
    </div>
  );
}

function ColumnSkeleton() {
  return (
    <div className="space-y-0">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="flex gap-2 border-b border-border/50 p-2">
          <div className="h-14 w-14 shrink-0 animate-pulse rounded-xl bg-muted sm:h-16 sm:w-16" />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-2 w-4/5 animate-pulse rounded bg-muted/80" />
            <div className="flex gap-1">
              <div className="h-4 w-12 animate-pulse rounded-full bg-muted/70" />
              <div className="h-4 w-12 animate-pulse rounded-full bg-muted/70" />
              <div className="h-4 w-12 animate-pulse rounded-full bg-muted/70" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LaunchpadColumn({
  bucket,
  loading,
  onSelectToken,
}: {
  bucket: LaunchpadBucket;
  loading: boolean;
  onSelectToken: (token: MarketToken) => void;
}) {
  return (
    <section className="surface-sheen flex min-h-0 flex-col overflow-hidden rounded border border-border bg-card">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-background/80 px-2.5 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-black text-foreground">{bucket.label}</h2>
            <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
              {bucket.total}
            </span>
          </div>
          <p className="truncate text-[10px] text-muted-foreground">{compactBucketSubtitle(bucket)}</p>
        </div>
        <SlidersHorizontal size={15} className="shrink-0 text-muted-foreground" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto [-webkit-overflow-scrolling:touch]">
        {loading && bucket.items.length === 0 ? (
          <ColumnSkeleton />
        ) : bucket.items.length ? (
          bucket.items.map((token) => <PulseRow key={token.id} token={token} onSelectToken={onSelectToken} />)
        ) : (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            No live {bucket.label.toLowerCase()} returned for this chain yet.
          </div>
        )}
      </div>
    </section>
  );
}

function emptyPulse(): LaunchpadPulseResponse {
  return {
    buckets: {
      new: { id: 'new', label: 'New Pairs', subtitle: 'Fresh launchpad pairs as they appear.', total: 0, items: [] },
      bonding: { id: 'bonding', label: 'Final Stretch', subtitle: 'Pairs still moving through bonding.', total: 0, items: [] },
      bonded: { id: 'bonded', label: 'Migrated', subtitle: 'Graduated pools with market liquidity.', total: 0, items: [] },
    },
    source: 'mobula',
    updatedAt: new Date().toISOString(),
    providers: [],
  };
}

function pulseCacheKey(chain: string) {
  return `${chain}:${PULSE_REQUEST_LIMIT}`;
}

function isPulseResponse(value: unknown): value is LaunchpadPulseResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LaunchpadPulseResponse>;
  return Boolean(candidate.buckets?.new && candidate.buckets?.bonding && candidate.buckets?.bonded);
}

function readCachedPulse(key: string): LaunchpadPulseResponse | null {
  const memory = pulseClientCache.get(key);
  if (memory && Date.now() - memory.updatedAt < CLIENT_CACHE_TTL_MS) return memory.data;

  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(`anyalpha:trenches:${key}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { updatedAt?: number; data?: unknown };
    if (typeof parsed.updatedAt !== 'number' || Date.now() - parsed.updatedAt >= CLIENT_CACHE_TTL_MS) return null;
    if (!isPulseResponse(parsed.data)) return null;

    pulseClientCache.set(key, { data: parsed.data, updatedAt: parsed.updatedAt });
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCachedPulse(key: string, data: LaunchpadPulseResponse) {
  const updatedAt = Date.now();
  pulseClientCache.set(key, { data, updatedAt });

  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(`anyalpha:trenches:${key}`, JSON.stringify({ updatedAt, data }));
  } catch {
    // Storage can be unavailable in private contexts; memory cache still helps within this tab.
  }
}

export default function TrenchesPage({ onSelectToken }: LaunchpadPageProps) {
  const [chain, setChain] = useState('all');
  const [activeBucket, setActiveBucket] = useState<LaunchpadBucketId>('new');
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<LaunchpadPulseResponse>(() => emptyPulse());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const key = pulseCacheKey(chain);
    const cachedPulse = readCachedPulse(key);

    if (cachedPulse) {
      setData(cachedPulse);
      setLoading(false);
    } else {
      setData(emptyPulse());
      setLoading(true);
    }

    async function load(silent = false) {
      if (!silent) setLoading(!cachedPulse);
      if (silent) setRefreshing(true);
      setError(null);

      try {
        const response = await fetchLaunchpadPulse({ chain, limit: PULSE_REQUEST_LIMIT });
        if (cancelled) return;
        writeCachedPulse(key, response);
        setData(response);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Trenches feed failed to load.');
      } finally {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      }
    }

    void load(Boolean(cachedPulse));
    const interval = window.setInterval(() => {
      void load(true);
    }, AUTO_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [chain, refreshKey]);

  const buckets = useMemo(() => BUCKET_ORDER.map((id) => data.buckets[id]), [data.buckets]);
  const activeColumn = data.buckets[activeBucket];

  return (
    <div className="motion-stagger flex h-full min-h-0 flex-col gap-0.5 overflow-hidden">
      <div className="surface-sheen flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-border bg-card">
        <div className="shrink-0 border-b border-border bg-background px-2 py-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [-webkit-overflow-scrolling:touch]">
              {CHAINS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setChain(item.id)}
                  className={cn(
                    'tap-feedback inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-black transition',
                    chain === item.id
                      ? 'border-primary/45 bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground',
                  )}
                >
                  <ChainLogo chain={item} />
                  {item.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setRefreshKey((key) => key + 1)}
              className="tap-feedback inline-flex shrink-0 items-center gap-1 rounded-xl border border-border bg-card px-2 py-1.5 text-xs font-bold text-muted-foreground transition hover:text-foreground"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin text-primary' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {error ? (
          <div className="shrink-0 border-b border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        ) : null}

        <div className="hidden min-h-0 flex-1 grid-cols-3 gap-0.5 overflow-hidden p-0.5 xl:grid">
          {buckets.map((bucket) => (
            <LaunchpadColumn key={bucket.id} bucket={bucket} loading={loading} onSelectToken={onSelectToken} />
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-0.5 xl:hidden">
          <div className="mb-0.5 flex shrink-0 gap-1 overflow-x-auto [-webkit-overflow-scrolling:touch]">
            {buckets.map((bucket) => (
              <button
                key={bucket.id}
                type="button"
                onClick={() => setActiveBucket(bucket.id)}
                className={cn(
                  'tap-feedback flex min-w-[8.5rem] flex-1 items-center justify-between rounded border px-2 py-1.5 text-xs font-black transition',
                  activeBucket === bucket.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground',
                )}
              >
                <span>{bucket.label}</span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{bucket.total}</span>
              </button>
            ))}
          </div>
          <LaunchpadColumn bucket={activeColumn} loading={loading} onSelectToken={onSelectToken} />
        </div>
      </div>
    </div>
  );
}
