import { useEffect, useState, useMemo } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { LoaderCircle, RefreshCw, Wallet, TrendingUp, TrendingDown, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { getLinkedWalletAccounts } from '@/lib/privy-profile';
import { fetchPortfolio, type PortfolioToken } from '@/lib/portfolio';
import { fmtCompact, fmtPct, fmtPrice } from '@/lib/market-data';

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

function PnlBadge({ change }: { change: number | null | undefined }) {
  if (typeof change !== 'number' || !Number.isFinite(change)) return null;

  const isPositive = change >= 0;
  const Icon = isPositive ? TrendingUp : TrendingDown;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded bg-background/50 px-1.5 py-0.5 text-xs font-semibold backdrop-blur ${
        isPositive ? 'text-success' : 'text-destructive'
      }`}
    >
      <Icon size={12} strokeWidth={3} />
      {fmtPct(Math.abs(change))}
    </span>
  );
}

export default function PortfolioPage() {
  const { ready, authenticated, user, getAccessToken, login } = usePrivy();
  const [tokens, setTokens] = useState<PortfolioToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [activeWallet, setActiveWallet] = useState<string | null>(null);

  const linkedWallets = useMemo(() => {
    return user ? getLinkedWalletAccounts(user) : [];
  }, [user]);

  useEffect(() => {
    if (linkedWallets.length > 0 && !activeWallet) {
      setActiveWallet(linkedWallets[0]?.address ?? null);
    }
  }, [linkedWallets, activeWallet]);

  useEffect(() => {
    if (!ready) {
      setLoading(true);
      return;
    }

    if (!authenticated || !user) {
      setTokens([]);
      setError(null);
      setLoading(false);
      return;
    }

    if (!activeWallet) {
      setTokens([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const activeAccount = linkedWallets.find((w) => w.address === activeWallet);
    if (!activeAccount) {
      setLoading(false);
      return;
    }

    // Determine chain based on wallet type. Privy uses 'solana_wallet' or 'wallet' (EVM)
    let chain = 'base';
    if (activeAccount.walletClientType === 'phantom' || activeAccount.connectorType === 'solana_wallet' || activeAccount.walletClientType === 'solflare') {
      chain = 'solana';
    } else if (activeAccount.walletClientType === 'privy' && activeAccount.chainType === 'solana') {
      chain = 'solana';
    }

    void getAccessToken()
      .then((token) => {
        if (!token) throw new Error('No Privy access token was available for this session.');
        return fetchPortfolio(token, chain, activeWallet, controller.signal);
      })
      .then((response) => {
        if (controller.signal.aborted) return;
        setTokens(response.tokens);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setTokens([]);
        setError(err instanceof Error ? err.message : 'Unable to load portfolio items.');
        setLoading(false);
        toast.error('Failed to load portfolio', {
          description: err instanceof Error ? err.message : 'An unexpected error occurred.',
        });
      });

    return () => {
      controller.abort();
    };
  }, [ready, authenticated, user, getAccessToken, refreshTick, activeWallet, linkedWallets]);

  const totalValueUsd = tokens.reduce((sum, token) => sum + (token.valueUsd ?? 0), 0);

  if (!ready || (authenticated && loading && tokens.length === 0)) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <LoaderCircle className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center text-center">
        <Wallet className="mb-4 h-16 w-16 text-muted-foreground/30" strokeWidth={1} />
        <h2 className="mb-2 text-2xl font-bold text-foreground">Connect Wallet</h2>
        <p className="mb-6 max-w-sm text-muted-foreground">
          Sign in to view your real-time portfolio, track your tokens, and see your net worth across chains.
        </p>
        <button
          onClick={login}
          className="rounded-full bg-primary px-6 py-2.5 font-bold text-primary-foreground transition hover:brightness-110"
        >
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 pb-16">
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
            <Sparkles size={14} className="text-primary" />
            Live Portfolio
          </div>
          <h1 className="text-4xl font-black tracking-tight text-foreground sm:text-5xl">
            {fmtPrice(totalValueUsd)}
          </h1>
          <p className="mt-2 font-medium text-muted-foreground">Total Portfolio Value</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setRefreshTick((t) => t + 1)}
            disabled={loading}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
            title="Refresh Portfolio"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {linkedWallets.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {linkedWallets.map((wallet) => (
            <button
              key={wallet.address}
              onClick={() => setActiveWallet(wallet.address)}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                activeWallet === wallet.address
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground'
              }`}
            >
              {wallet.walletClientType === 'privy' ? 'Smart Wallet' : wallet.connectorType || 'External Wallet'}{' '}
              <span className="opacity-50">({wallet.address.slice(0, 4)}...{wallet.address.slice(-4)})</span>
            </button>
          ))}
        </div>
      )}

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center text-destructive">
          <p className="font-semibold">Unable to load portfolio</p>
          <p className="mt-1 text-sm opacity-80">{error}</p>
          <button
            onClick={() => setRefreshTick((t) => t + 1)}
            className="mt-4 rounded-lg bg-destructive/20 px-4 py-2 text-sm font-semibold transition hover:bg-destructive/30"
          >
            Try Again
          </button>
        </div>
      ) : tokens.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card/50 px-6 py-16 text-center">
          <Wallet className="mx-auto mb-4 h-16 w-16 text-muted-foreground/30" strokeWidth={1} />
          <h3 className="mb-2 text-xl font-bold text-foreground">No Tokens Found</h3>
          <p className="mx-auto max-w-sm text-muted-foreground">
            We couldn't find any tokens in this wallet. Try connecting a different wallet or purchasing some tokens.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-6 py-4 font-semibold text-muted-foreground">Asset</th>
                  <th className="px-6 py-4 text-right font-semibold text-muted-foreground">Price</th>
                  <th className="px-6 py-4 text-right font-semibold text-muted-foreground">Balance</th>
                  <th className="px-6 py-4 text-right font-semibold text-muted-foreground">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {tokens.map((token) => (
                  <tr key={token.tokenAddress} className="transition hover:bg-muted/20">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {token.logoUrl ? (
                          <img
                            src={token.logoUrl}
                            alt={token.symbol}
                            className="h-10 w-10 rounded-full border border-border bg-muted object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/30 bg-primary/15 text-xs font-black text-primary">
                            {token.symbol?.slice(0, 2).toUpperCase() ?? '?'}
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-foreground">{token.symbol ?? 'Unknown'}</div>
                          <div className="text-xs text-muted-foreground max-w-[120px] truncate">
                            {token.name ?? 'Unknown Token'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="font-medium text-foreground">
                        {token.priceUsd ? fmtPrice(token.priceUsd) : '—'}
                      </div>
                      <div className="mt-1 flex justify-end">
                        <PnlBadge change={token.priceChange24h} />
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="font-medium text-foreground">
                        {fmtCompact(token.balance)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {token.symbol}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-foreground">
                      {token.valueUsd ? fmtPrice(token.valueUsd) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
