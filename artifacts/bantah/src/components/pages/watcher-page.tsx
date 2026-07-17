import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import {
  Bell,
  Copy,
  Download,
  Heart,
  LoaderCircle,
  RefreshCw,
  Search,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  addTrackedWallet,
  fetchPublicWalletTracker,
  fetchWalletTracker,
  sendTrackedWalletTestAlert,
  unfollowTrackedWallet,
  type PublicWalletTrackerItem,
  type PublicWalletTrackerResponse,
  type WalletTrackerChain,
  type WalletTrackerResponse,
} from '@/lib/wallet-tracker';
import { getDicebearWalletAvatarUrl } from '@/lib/avatar';
import { shortenAddress } from '@/lib/privy-profile';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const CHAINS: Array<{ id: WalletTrackerChain; label: string }> = [
  { id: 'solana', label: 'Solana' },
  { id: 'ethereum', label: 'Ethereum' },
  { id: 'base', label: 'Base' },
  { id: 'arbitrum', label: 'Arbitrum' },
  { id: 'bsc', label: 'BSC' },
  { id: 'polygon', label: 'Polygon' },
  { id: 'optimism', label: 'Optimism' },
  { id: 'sui', label: 'Sui' },
  { id: 'aptos', label: 'Aptos' },
];
const CHAIN_SET = new Set<WalletTrackerChain>(CHAINS.map((item) => item.id));

type WatcherTab = 'all' | 'smart' | 'profit' | 'sniper' | 'following';
type ImportRow = {
  chain: WalletTrackerChain;
  address: string;
  label: string | null;
};

function formatDateTime(value: string | null): string {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatRelative(value: string | null): string {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';

  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

function formatUsdCents(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    notation: Math.abs(value) >= 1_000_000_00 ? 'compact' : 'standard',
  }).format(value / 100);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    notation: Math.abs(value) >= 10_000 ? 'compact' : 'standard',
  }).format(value);
}

function formatDuration(seconds: number | null, label: string | null): string {
  if (label) return label;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return 'n/a';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

function isSystemWalletLabel(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return false;

  return (
    normalized === 'bundle watch wallet' ||
    normalized === 'bundle sniper wallet' ||
    normalized.startsWith('bundle ')
  );
}

function displayWalletName(label: string | null | undefined, address: string): string {
  const trimmed = label?.trim();
  return trimmed && !isSystemWalletLabel(trimmed) ? trimmed : shortenAddress(address, 6, 4);
}

function walletDisplayName(wallet: PublicWalletTrackerItem): string {
  return displayWalletName(wallet.label, wallet.address);
}

function walletBalance(wallet: PublicWalletTrackerItem): string {
  return wallet.balanceLabel || formatUsdCents(wallet.balanceUsdCents);
}

function hasTag(wallet: PublicWalletTrackerItem, tags: string[]): boolean {
  const walletTags = new Set(wallet.tags.map((tag) => tag.toLowerCase()));
  return tags.some((tag) => walletTags.has(tag));
}

function isSmartWallet(wallet: PublicWalletTrackerItem): boolean {
  const tradeCount = wallet.performance.buyCount + wallet.performance.sellCount;
  return (
    (wallet.score ?? 0) >= 40 ||
    tradeCount >= 8 ||
    hasTag(wallet, ['smart money', 'high win-rate', 'high-frequency', 'active trader', 'accumulator'])
  );
}

function isProfitWallet(wallet: PublicWalletTrackerItem): boolean {
  return wallet.performance.realizedPnlUsdCents > 0 || hasTag(wallet, ['profit wallet', 'high win-rate']);
}

function isSniperWallet(wallet: PublicWalletTrackerItem): boolean {
  return hasTag(wallet, ['sniper']);
}

function visibleWalletTags(wallet: PublicWalletTrackerItem): string[] {
  const hiddenTags = new Set(['bundle-watch', 'bundle-wallet', 'bundle_wallet', 'bundle wallet']);
  return wallet.tags.filter((tag) => !hiddenTags.has(tag.trim().toLowerCase()));
}

function normalizeChain(value: unknown, fallback: WalletTrackerChain): WalletTrackerChain {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase() as WalletTrackerChain;
  return CHAIN_SET.has(normalized) ? normalized : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseImportRows(value: string, fallbackChain: WalletTrackerChain): ImportRow[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const rows: ImportRow[] = [];

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as unknown;
    const items = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.wallets)
        ? parsed.wallets
        : [parsed];

    for (const item of items) {
      if (!isRecord(item)) continue;
      const address = typeof item.address === 'string' ? item.address.trim() : typeof item.wallet === 'string' ? item.wallet.trim() : '';
      if (!address) continue;
      const label =
        typeof item.name === 'string' && item.name.trim()
          ? item.name.trim()
          : typeof item.label === 'string' && item.label.trim()
            ? item.label.trim()
            : null;
      rows.push({
        chain: normalizeChain(item.chain, fallbackChain),
        address,
        label,
      });
    }
  } else {
    const lines = trimmed
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

    for (const line of lines) {
      const [address, ...labelParts] = line.split(/\s+/);
      if (!address) continue;
      rows.push({
        chain: fallbackChain,
        address,
        label: labelParts.length > 0 ? labelParts.join(' ').slice(0, 48) : null,
      });
    }
  }

  const unique = new Map<string, ImportRow>();
  for (const row of rows) {
    unique.set(`${row.chain}:${row.address.toLowerCase()}`, row);
  }

  return Array.from(unique.values()).slice(0, 50);
}

function OperationButton({
  active,
  children,
  disabled,
  label,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`tap-feedback inline-flex h-8 w-8 items-center justify-center border transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'border-primary/45 bg-primary/10 text-primary shadow-[0_0_18px_hsl(var(--primary)/0.18)] hover:border-primary/70 hover:bg-primary/15 hover:text-primary'
          : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function ImportWalletDialog({
  authenticated,
  getAccessToken,
  login,
  onImported,
  onOpenChange,
  open,
}: {
  authenticated: boolean;
  getAccessToken: () => Promise<string | null>;
  login: () => void;
  onImported: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [chain, setChain] = useState<WalletTrackerChain>('solana');
  const [wallets, setWallets] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!authenticated) {
      login();
      return;
    }

    let rows: ImportRow[];
    try {
      rows = parseImportRows(wallets, chain);
    } catch {
      toast.error('Import format is invalid', {
        description: 'Paste one wallet per line or a JSON array with address, chain, and name fields.',
      });
      return;
    }

    if (rows.length === 0) {
      toast.error('No wallet addresses found');
      return;
    }

    setSaving(true);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('No Privy access token was available for this session.');

      let saved = 0;
      for (const row of rows) {
        await addTrackedWallet(token, {
          chain: row.chain,
          address: row.address,
          label: row.label,
          alertMode: 'alerts_only',
          telegramEnabled: true,
          browserEnabled: true,
          alertTypes: [],
        });
        saved += 1;
      }

      toast.success('Wallet import complete', {
        description: `${saved} public wallet${saved === 1 ? '' : 's'} added to your Watcher.`,
      });
      setWallets('');
      onOpenChange(false);
      onImported();
    } catch (err) {
      toast.error('Wallet import failed', {
        description: err instanceof Error ? err.message : 'Could not import these wallets right now.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-border bg-card p-0">
        <DialogHeader className="border-b border-border px-4 py-4">
          <DialogTitle className="text-base font-black">Import Public Wallet</DialogTitle>
          <DialogDescription className="text-xs leading-5 text-muted-foreground">
            Paste public wallet addresses to follow. JSON wallet lists are supported; no private keys are used.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-3 p-4">
          {!authenticated ? (
            <div className="border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-foreground">
              The public table is open to everyone. Sign in only when you want to save imported wallets to your account.
            </div>
          ) : null}

          <label className="grid gap-1">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Default chain</span>
            <select
              value={chain}
              onChange={(event) => setChain(event.target.value as WalletTrackerChain)}
              className="border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            >
              {CHAINS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Wallets</span>
            <textarea
              value={wallets}
              onChange={(event) => setWallets(event.target.value)}
              placeholder={'One address per line, or JSON like [{"address":"...","chain":"solana","name":"Wallet label"}]'}
              className="min-h-36 resize-none border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </label>

          <DialogFooter className="gap-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="tap-feedback border border-border px-3 py-2 text-xs font-bold text-muted-foreground transition hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="tap-feedback inline-flex items-center justify-center gap-2 bg-primary px-3 py-2 text-xs font-black text-primary-foreground disabled:opacity-60"
            >
              {saving ? <LoaderCircle size={13} className="animate-spin" /> : <Upload size={13} />}
              {authenticated ? 'Import' : 'Sign In'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function WatcherPage() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const [publicSnapshot, setPublicSnapshot] = useState<PublicWalletTrackerResponse | null>(null);
  const [privateSnapshot, setPrivateSnapshot] = useState<WalletTrackerResponse | null>(null);
  const [loadingPublic, setLoadingPublic] = useState(true);
  const [loadingPrivate, setLoadingPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<WatcherTab>('all');
  const [importOpen, setImportOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [busyWalletId, setBusyWalletId] = useState<string | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  useEffect(() => {
    const ack = localStorage.getItem('watcherDisclaimerAck');
    if (!ack) {
      setShowDisclaimer(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingPublic(true);
    setError(null);

    const tokenPromise = ready && authenticated ? getAccessToken().catch(() => null) : Promise.resolve(null);

    void tokenPromise
      .then((token) => fetchPublicWalletTracker(token, controller.signal))
      .then((response) => setPublicSnapshot(response))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load public wallets.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingPublic(false);
      });

    return () => controller.abort();
  }, [authenticated, getAccessToken, ready, refreshTick]);

  useEffect(() => {
    if (!ready || !authenticated) {
      setPrivateSnapshot(null);
      setLoadingPrivate(false);
      return;
    }

    const controller = new AbortController();
    setLoadingPrivate(true);

    void getAccessToken()
      .then((token) => {
        if (!token) throw new Error('No Privy access token was available for this session.');
        return fetchWalletTracker(token, controller.signal);
      })
      .then((response) => setPrivateSnapshot(response))
      .catch(() => {
        if (!controller.signal.aborted) setPrivateSnapshot(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingPrivate(false);
      });

    return () => controller.abort();
  }, [authenticated, getAccessToken, ready, refreshTick]);

  const visibleWallets = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return (publicSnapshot?.wallets ?? []).filter((wallet) => {
      const matchesQuery =
        !needle ||
        wallet.address.toLowerCase().includes(needle) ||
        wallet.chain.toLowerCase().includes(needle) ||
        (wallet.label ?? '').toLowerCase().includes(needle) ||
        wallet.tags.some((tag) => tag.toLowerCase().includes(needle));
      const matchesTab =
        tab === 'all' ||
        (tab === 'following' && wallet.followed) ||
        (tab === 'smart' && isSmartWallet(wallet)) ||
        (tab === 'profit' && isProfitWallet(wallet)) ||
        (tab === 'sniper' && isSniperWallet(wallet));

      return matchesQuery && matchesTab;
    });
  }, [publicSnapshot?.wallets, query, tab]);

  const counts = useMemo(() => {
    const wallets = publicSnapshot?.wallets ?? [];
    return {
      all: wallets.length,
      smart: wallets.filter(isSmartWallet).length,
      profit: wallets.filter(isProfitWallet).length,
      sniper: wallets.filter(isSniperWallet).length,
      following: wallets.filter((wallet) => wallet.followed).length,
    };
  }, [publicSnapshot?.wallets]);

  async function refresh() {
    setRefreshTick((tick) => tick + 1);
  }

  function setWalletFollowState(walletId: string, followed: boolean, subscriptionId: string | null = null) {
    setPublicSnapshot((snapshot) => {
      if (!snapshot) return snapshot;

      return {
        ...snapshot,
        wallets: snapshot.wallets.map((item) => {
          if (item.id !== walletId) return item;

          const followerDelta = followed && !item.followed ? 1 : !followed && item.followed ? -1 : 0;

          return {
            ...item,
            followed,
            subscriptionId: followed ? subscriptionId ?? item.subscriptionId : null,
            followerCount: Math.max(0, item.followerCount + followerDelta),
          };
        }),
      };
    });
  }

  function showCopyTradeComingSoon(wallet: PublicWalletTrackerItem) {
    toast.info('Copy Trade Coming soon', {
      description: `${walletDisplayName(wallet)} can be followed now. Copy trading stays locked until trading safety is ready.`,
    });
  }

  async function toggleFollow(wallet: PublicWalletTrackerItem) {
    if (!authenticated) {
      login();
      return;
    }

    setBusyWalletId(wallet.id);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('No Privy access token was available for this session.');

      if (wallet.followed) {
        const subscriptionId =
          wallet.subscriptionId ?? privateSnapshot?.wallets.find((item) => item.walletId === wallet.id)?.id ?? null;
        if (!subscriptionId) throw new Error('Tracked wallet subscription was not found.');
        await unfollowTrackedWallet(token, subscriptionId);
        setWalletFollowState(wallet.id, false);
        toast.success('Wallet unfollowed', {
          description: walletDisplayName(wallet),
        });
      } else {
        const response = await addTrackedWallet(token, {
          chain: wallet.chain,
          address: wallet.address,
          label: walletDisplayName(wallet),
          alertMode: 'alerts_only',
          telegramEnabled: true,
          browserEnabled: true,
          alertTypes: [],
        });
        setWalletFollowState(wallet.id, true, response.wallet?.id ?? null);
        toast.success('Wallet followed', {
          description: walletDisplayName(wallet),
        });
      }

      await refresh();
    } catch (err) {
      toast.error('Watcher update failed', {
        description: err instanceof Error ? err.message : 'Could not update this wallet right now.',
      });
    } finally {
      setBusyWalletId(null);
    }
  }

  async function testAlert(wallet: PublicWalletTrackerItem) {
    if (!authenticated) {
      login();
      return;
    }

    const subscriptionId =
      wallet.subscriptionId ?? privateSnapshot?.wallets.find((item) => item.walletId === wallet.id)?.id ?? null;

    if (!subscriptionId) {
      toast.info('Follow this wallet first', {
        description: 'Alerts are tied to saved wallets in your AnyAlpha account.',
      });
      return;
    }

    setBusyWalletId(wallet.id);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('No Privy access token was available for this session.');
      const response = await sendTrackedWalletTestAlert(token, subscriptionId);
      toast.success('Test alert sent', {
        description: `${response.notificationCreated ? 'Browser' : 'No browser'} / ${response.telegramMessagesSent} Telegram`,
      });
    } catch (err) {
      toast.error('Test alert failed', {
        description: err instanceof Error ? err.message : 'Could not send a test alert right now.',
      });
    } finally {
      setBusyWalletId(null);
    }
  }

  async function exportWallets() {
    if (!authenticated) {
      login();
      return;
    }

    const wallets = privateSnapshot?.wallets ?? [];
    if (wallets.length === 0) {
      toast.info('No followed wallets to export');
      return;
    }

    const payload = wallets.map((wallet) => ({
      address: wallet.address,
      chain: wallet.chain,
      name: displayWalletName(wallet.label, wallet.address),
      tags: wallet.tags,
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `anyalpha-watcher-wallets-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const tabs: Array<{ id: WatcherTab; label: string; count: number }> = [
    { id: 'all', label: 'All Wallets', count: counts.all },
    { id: 'smart', label: 'Smart Money', count: counts.smart },
    { id: 'profit', label: 'Profit', count: counts.profit },
    { id: 'sniper', label: 'Snipers', count: counts.sniper },
    { id: 'following', label: 'Following', count: counts.following },
  ];

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 p-2.5 md:p-4">
        <section className="border-b border-border pb-2">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <label className="flex h-9 w-full min-w-0 items-center gap-2 border border-border bg-card px-2.5 sm:w-[22rem] lg:w-[25rem]">
                <Search size={14} className="shrink-0 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search wallets"
                  className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </label>

              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="tap-feedback inline-flex h-9 items-center justify-center gap-1.5 border border-border bg-card px-2.5 text-xs font-black text-foreground transition hover:border-primary/50"
              >
                <Upload size={13} />
                Import
              </button>
              <button
                type="button"
                onClick={() => void exportWallets()}
                disabled={loadingPrivate}
                className="tap-feedback inline-flex h-9 items-center justify-center gap-1.5 border border-border bg-card px-2.5 text-xs font-black text-foreground transition hover:border-primary/50 disabled:opacity-50"
              >
                <Download size={13} />
                Export
              </button>
              <button
                type="button"
                onClick={() => void refresh()}
                className="tap-feedback inline-flex h-9 items-center justify-center gap-1.5 border border-border bg-card px-2.5 text-xs font-black text-foreground transition hover:border-primary/50"
              >
                <RefreshCw size={13} className={loadingPublic ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            <div className="shrink-0 text-[11px] text-muted-foreground md:text-right">
              {publicSnapshot ? `${formatNumber(visibleWallets.length)} shown / ${formatNumber(publicSnapshot.total)} indexed` : 'Loading index'}
            </div>
          </div>
        </section>

        <div className="flex gap-1 overflow-x-auto border-b border-border pb-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`tap-feedback shrink-0 border px-2.5 py-1.5 text-[11px] font-black transition ${
                tab === item.id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.label} <span className="ml-1 text-[10px] opacity-70">{item.count}</span>
            </button>
          ))}
        </div>

        {error ? (
          <div className="border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-foreground">{error}</div>
        ) : null}

        <section className="overflow-hidden border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left">
              <thead className="bg-muted/20 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                <tr>
                  <th className="border-b border-border px-3 py-2 font-black">Tracked</th>
                  <th className="border-b border-border px-3 py-2 font-black">Wallet</th>
                  <th className="border-b border-border px-3 py-2 font-black">Balance</th>
                  <th className="border-b border-border px-3 py-2 font-black">Win Rate</th>
                  <th className="border-b border-border px-3 py-2 font-black">Avg Duration</th>
                  <th className="border-b border-border px-3 py-2 font-black">Last Active</th>
                  <th className="border-b border-border px-3 py-2 text-right font-black">Operate</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {loadingPublic && !publicSnapshot ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <tr key={index} className="border-b border-border/70">
                      {Array.from({ length: 7 }).map((__, cell) => (
                        <td key={cell} className="px-3 py-3">
                          <div className="h-4 w-full max-w-32 animate-pulse bg-muted/40" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : visibleWallets.length > 0 ? (
                  visibleWallets.map((wallet) => (
                    <tr key={wallet.id} className="border-b border-border/70 transition hover:bg-muted/20">
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-bold text-success">
                        {formatRelative(wallet.firstSeenAt)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="relative h-7 w-7 shrink-0">
                            <img
                              src={getDicebearWalletAvatarUrl(wallet.chain, wallet.address)}
                              alt=""
                              className="h-7 w-7 rounded-md border border-border bg-background object-cover"
                              loading="lazy"
                            />
                            <span className="absolute -bottom-1 -right-1 rounded border border-border bg-card px-0.5 font-mono text-[7px] font-black text-primary">
                              {wallet.chain.slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-black text-foreground">{walletDisplayName(wallet)}</span>
                              {wallet.score !== null ? (
                                <span className="border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-black text-primary">
                                  {wallet.score}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                              <span className="font-mono">{shortenAddress(wallet.address, 6, 4)}</span>
                              <span>{CHAINS.find((item) => item.id === wallet.chain)?.label ?? wallet.chain}</span>
                              {visibleWalletTags(wallet).slice(0, 3).map((tag) => (
                                <span key={tag} className="rounded-[5px] border border-border/50 bg-background/40 px-1 py-0 text-[8px] leading-3 text-muted-foreground/80">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-bold text-foreground">{walletBalance(wallet)}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <div className="font-bold text-foreground">
                          {wallet.performance.winRate === null ? 'n/a' : `${wallet.performance.winRate}%`}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {wallet.performance.buyCount} buys / {wallet.performance.sellCount} sells
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {formatDuration(wallet.avgDurationSeconds, wallet.avgDurationLabel)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <div className="font-bold text-foreground">{formatRelative(wallet.lastActiveAt)}</div>
                        <div className="text-[11px] text-muted-foreground">{formatDateTime(wallet.lastActiveAt)}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-0.5">
                          <OperationButton
                            active={wallet.followed}
                            label={wallet.followed ? 'Unfollow wallet' : 'Follow wallet'}
                            disabled={busyWalletId === wallet.id}
                            onClick={() => void toggleFollow(wallet)}
                          >
                            {busyWalletId === wallet.id ? (
                              <LoaderCircle size={15} className="animate-spin" />
                            ) : (
                              <Heart
                                size={15}
                                className={
                                  wallet.followed
                                    ? 'fill-primary text-primary drop-shadow-[0_0_7px_hsl(var(--primary)/0.45)]'
                                    : ''
                                }
                              />
                            )}
                          </OperationButton>
                          <OperationButton
                            label="Send test alert"
                            disabled={busyWalletId === wallet.id}
                            onClick={() => void testAlert(wallet)}
                          >
                            <Bell size={15} />
                          </OperationButton>
                          <OperationButton label="Copy wallet" onClick={() => showCopyTradeComingSoon(wallet)}>
                            <Copy size={15} />
                          </OperationButton>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No public wallets match this view yet. Import a public wallet to start tracking real indexed activity.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid gap-2 text-[11px] text-muted-foreground md:grid-cols-3">
          <div className="border border-border bg-card px-3 py-2">
            Public table: {formatNumber(publicSnapshot?.total ?? 0)} indexed wallets.
          </div>
          <div className="border border-border bg-card px-3 py-2">
            Following: {authenticated ? formatNumber(privateSnapshot?.total ?? counts.following) : 'sign in to save wallets'}.
          </div>
          <div className="border border-border bg-card px-3 py-2">
            Monitoring: {publicSnapshot?.monitoring.publicWebhookBaseConfigured ? 'webhook endpoint ready' : 'provider sync pending'}.
          </div>
        </div>
      </div>

      <ImportWalletDialog
        authenticated={authenticated}
        getAccessToken={getAccessToken}
        login={login}
        onImported={() => void refresh()}
        onOpenChange={setImportOpen}
        open={importOpen}
      />

      <Dialog open={showDisclaimer} onOpenChange={setShowDisclaimer}>
        <DialogContent className="max-w-md bg-background border-border">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-primary">Beta Feature Warning</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-4 pt-2">
            <p>
              The Watcher feature is currently in <strong className="text-foreground">Beta</strong>. Data is experimental and heavily delayed.
            </p>
            <p>
              Wallet tracking depends on third-party indexed snapshots and heuristic aggregation. Do not use this information for trading or financial decisions.
            </p>
            <p>
              By proceeding, you understand and accept these risks. Please thread with care!
            </p>
          </div>
          <DialogFooter className="mt-4 sm:justify-start">
            <button
              onClick={() => {
                localStorage.setItem('watcherDisclaimerAck', 'true');
                setShowDisclaimer(false);
              }}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-black text-black hover:bg-primary/90 focus:outline-none"
            >
              I Understand & Accept
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
