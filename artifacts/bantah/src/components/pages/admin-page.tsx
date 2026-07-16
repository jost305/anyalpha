import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Database,
  ExternalLink,
  Flame,
  Loader2,
  RefreshCw,
  Shield,
  ShieldCheck,
  TrendingUp,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import {
  fetchMarketSignals,
  fetchMarkets,
  fmtAge,
  fmtCompact,
  fmtPct,
  fmtPrice,
  marketPairLabel,
  marketTokenPath,
  type MarketProviderSnapshot,
  type MarketSignal,
  type MarketToken,
} from '@/lib/market-data';

type AdminTab = 'overview' | 'listings' | 'alerts' | 'integrations';

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
  color: string;
}

const TABS: { key: AdminTab; icon: LucideIcon; label: string }[] = [
  { key: 'overview', icon: BarChart3, label: 'Overview' },
  { key: 'listings', icon: Database, label: 'Listings' },
  { key: 'alerts', icon: Bell, label: 'Alerts' },
  { key: 'integrations', icon: ShieldCheck, label: 'Integrations' },
];

const PROVIDER_ROLES: Record<string, string> = {
  dexscreener: 'Discovery, boosted listings, pairs, liquidity, volume, and transaction activity.',
  mobula: 'Cross-chain token details, holder counts, security, liquidity, and market metadata.',
  geckoterminal: 'Pool candles and recent on-chain trade prints.',
  helius: 'Solana DAS metadata, mint/freeze authority checks, and Solana price hints.',
  moralis: 'EVM price, liquidity, verified-contract, and spam checks.',
  alchemy: 'EVM price cross-checks and token metadata.',
  bitquery: 'Low-latency price, volume, and on-chain DEX snapshots.',
};

function StatCard({ icon, label, value, sub, color }: StatCardProps) {
  return (
    <div className="border border-border rounded-lg px-4 py-3 bg-card flex items-start gap-3">
      <div className={`p-2 rounded-lg ${color} bg-current/10`}>
        <div style={{ color: 'inherit' }}>{icon}</div>
      </div>
      <div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="text-xl font-black text-foreground">{value}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
      </div>
    </div>
  );
}

function StatusPill({ status, label }: { status: string; label: string }) {
  const style =
    status === 'live'
      ? 'border-green-400/30 bg-green-400/10 text-green-400'
      : status === 'demo'
        ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-400'
        : status === 'error'
          ? 'border-red-400/30 bg-red-400/10 text-red-400'
          : status === 'missing_key'
            ? 'border-yellow-400/30 bg-yellow-400/10 text-yellow-400'
            : 'border-border bg-muted text-muted-foreground';

  return (
    <span className={`text-[10px] font-bold uppercase tracking-wide border rounded-full px-2 py-0.5 ${style}`}>
      {label}
    </span>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-dashed border-border rounded-lg p-8 text-center bg-muted/10">
      <Database size={22} className="mx-auto text-muted-foreground mb-2" />
      <div className="text-sm font-bold text-foreground">{title}</div>
      <div className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">{body}</div>
    </div>
  );
}

function OverviewTab({
  tokens,
  signals,
  providers,
  updatedAt,
}: {
  tokens: MarketToken[];
  signals: MarketSignal[];
  providers: MarketProviderSnapshot[];
  updatedAt: string | null;
}) {
  const totalVolume = tokens.reduce((sum, token) => sum + (token.volume.h24 ?? 0), 0);
  const chains = new Set(tokens.map((token) => token.chainLabel)).size;
  const highRisk = tokens.filter((token) => token.riskFlags.length > 0).length;
  const topSignal = Math.max(0, ...tokens.map((token) => token.signalScore));
  const newest = tokens
    .filter((token) => typeof token.ageMinutes === 'number')
    .sort((a, b) => (a.ageMinutes ?? Infinity) - (b.ageMinutes ?? Infinity))[0];

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Database size={16} />}
          label="Live Listings"
          value={String(tokens.length)}
          sub="from provider ingestion"
          color="text-blue-400"
        />
        <StatCard
          icon={<Activity size={16} />}
          label="24h Volume"
          value={fmtCompact(totalVolume, { currency: true })}
          sub="across loaded pairs"
          color="text-green-400"
        />
        <StatCard
          icon={<TrendingUp size={16} />}
          label="Top Score"
          value={String(topSignal)}
          sub={`${signals.length} alert candidates`}
          color="text-yellow-400"
        />
        <StatCard
          icon={<Shield size={16} />}
          label="Risk Flags"
          value={String(highRisk)}
          sub={`${chains || 0} chains visible`}
          color="text-red-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 border border-border rounded-lg overflow-hidden bg-card">
          <div className="px-4 py-2 bg-muted/30 border-b border-border text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Zap size={11} /> Live Ingestion
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {providers.map((provider) => (
              <div key={provider.provider} className="border border-border rounded-lg p-3 bg-background/50">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-black text-sm">{provider.label}</div>
                  <StatusPill status={provider.status} label={provider.status.replace('_', ' ')} />
                </div>
                <div className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  {provider.detail ?? PROVIDER_ROLES[provider.provider]}
                </div>
                {provider.value && <div className="text-[10px] text-primary mt-2 font-mono">{provider.value}</div>}
              </div>
            ))}
          </div>
        </div>

        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <div className="px-4 py-2 bg-muted/30 border-b border-border text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Flame size={11} /> Ops Pulse
          </div>
          <div className="p-4 space-y-3 text-xs">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Source</span>
              <span className="font-mono text-green-400">aggregated</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Newest pair</span>
              <span className="font-mono">{newest ? fmtAge(newest.ageMinutes) : 'n/a'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Refresh</span>
              <span className="font-mono">{updatedAt ? new Date(updatedAt).toLocaleTimeString() : 'waiting'}</span>
            </div>
            <div className="pt-3 border-t border-border text-muted-foreground leading-relaxed">
              This screen only shows connected data. Missing keys are explicit so we do not pretend an enrichment source is live.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ListingsTab({ tokens }: { tokens: MarketToken[] }) {
  if (!tokens.length) {
    return <div className="p-4"><EmptyState title="No listings loaded" body="The live market API did not return rows for this refresh." /></div>;
  }

  return (
    <div className="p-4 space-y-3">
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <div className="grid grid-cols-[1.6fr_0.8fr_0.8fr_0.8fr_0.7fr_0.6fr] gap-3 px-4 py-2 bg-muted/30 border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          <span>Pair</span>
          <span>Price</span>
          <span>24h</span>
          <span>Liquidity</span>
          <span>Score</span>
          <span>Age</span>
        </div>
        <div className="divide-y divide-border/40">
          {tokens.map((token) => (
            <div
              key={token.id}
              className="grid grid-cols-[1.6fr_0.8fr_0.8fr_0.8fr_0.7fr_0.6fr] gap-3 px-4 py-3 text-xs items-center hover:bg-muted/20 transition"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-black text-foreground truncate">{marketPairLabel(token)}</span>
                  <a href={marketTokenPath(token)} className="text-muted-foreground hover:text-primary">
                    <ExternalLink size={12} />
                  </a>
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {token.chainLabel} / {token.dexId}
                </div>
              </div>
              <span className="font-mono">{fmtPrice(token.priceUsd)}</span>
              <span className={`font-mono ${(token.priceChange.h24 ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {fmtPct(token.priceChange.h24)}
              </span>
              <span className="font-mono">{fmtCompact(token.liquidityUsd, { currency: true })}</span>
              <span className="font-mono text-primary">{token.signalScore}</span>
              <span className="font-mono text-muted-foreground">{fmtAge(token.ageMinutes)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AlertsTab({ signals }: { signals: MarketSignal[] }) {
  if (!signals.length) {
    return <div className="p-4"><EmptyState title="No alert candidates" body="Signals will appear here when live market scoring finds candidates." /></div>;
  }

  return (
    <div className="p-4 space-y-3">
      {signals.map((signal) => (
        <div key={signal.id} className="border border-border rounded-lg p-4 bg-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm">{signal.title}</span>
                <StatusPill status={signal.sentiment === 'Bullish' ? 'live' : 'ready'} label={signal.sentiment} />
              </div>
              <div className="text-xs text-muted-foreground mt-1">{signal.reason}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Score</div>
              <div className="text-xl font-black text-primary">{signal.score}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {signal.tags.map((tag) => (
              <span key={tag} className="text-[10px] border border-border rounded-full px-2 py-0.5 text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function IntegrationsTab({ providers }: { providers: MarketProviderSnapshot[] }) {
  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
      {providers.map((provider) => (
        <div key={provider.provider} className="border border-border rounded-lg p-4 bg-card">
          <div className="flex items-center justify-between gap-3">
            <div className="font-black text-sm">{provider.label}</div>
            <StatusPill status={provider.status} label={provider.status.replace('_', ' ')} />
          </div>
          <div className="text-xs text-muted-foreground mt-2 leading-relaxed">
            {provider.detail ?? PROVIDER_ROLES[provider.provider]}
          </div>
          {provider.value && <div className="text-[10px] text-primary mt-2 font-mono">{provider.value}</div>}
        </div>
      ))}
      <div className="md:col-span-2 border border-cyan-400/20 rounded-lg p-4 bg-cyan-400/5 text-xs text-cyan-100/90 leading-relaxed">
        Provider adapters now sit behind one market contract. Add free-tier keys in `.env` and the terminal will enrich the same rows without page-specific rewrites.
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [tokens, setTokens] = useState<MarketToken[]>([]);
  const [signals, setSignals] = useState<MarketSignal[]>([]);
  const [providers, setProviders] = useState<MarketProviderSnapshot[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(signal?: AbortSignal) {
    setIsLoading(true);
    setError(null);

    try {
      const [marketsResponse, signalsResponse] = await Promise.all([
        fetchMarkets({ sort: 'trending', limit: 30, signal }),
        fetchMarketSignals(12, signal),
      ]);

      if (signal?.aborted) return;
      setTokens(marketsResponse.data);
      setSignals(signalsResponse.data);
      setProviders(marketsResponse.providers);
      setUpdatedAt(marketsResponse.updatedAt);
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : 'Failed to load admin data');
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  const selectedView = useMemo(() => {
    if (tab === 'overview') return <OverviewTab tokens={tokens} signals={signals} providers={providers} updatedAt={updatedAt} />;
    if (tab === 'listings') return <ListingsTab tokens={tokens} />;
    if (tab === 'alerts') return <AlertsTab signals={signals} />;
    return <IntegrationsTab providers={providers} />;
  }, [providers, signals, tab, tokens, updatedAt]);

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <div className="shrink-0 px-4 py-2.5 border-b border-border flex items-center gap-3 bg-card">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-primary" />
          <span className="font-black text-sm">Ops Console</span>
          <span className="text-[10px] px-2 py-0.5 border border-border rounded text-muted-foreground font-mono">
            LIVE DATA
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {error && (
            <span className="hidden sm:flex items-center gap-1 text-red-400">
              <AlertTriangle size={12} /> {error}
            </span>
          )}
          <button
            onClick={() => void load()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded hover:bg-muted/40 transition text-foreground"
          >
            {isLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Refresh
          </button>
        </div>
      </div>

      <div className="shrink-0 flex items-center border-b border-border overflow-x-auto bg-muted/10">
        {TABS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 text-xs px-4 py-2.5 border-b-2 transition whitespace-nowrap shrink-0 ${
              tab === key
                ? 'border-primary text-foreground font-bold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && !tokens.length ? (
          <div className="h-full grid place-items-center text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Loading live ops data...
            </div>
          </div>
        ) : (
          selectedView
        )}
      </div>
    </div>
  );
}
