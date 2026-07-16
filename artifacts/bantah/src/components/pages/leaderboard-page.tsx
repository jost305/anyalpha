import { useEffect, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  LoaderCircle,
  RefreshCw,
  Trophy,
  Users,
} from 'lucide-react';
import {
  fetchLeaderboard,
  type LeaderboardPeriod,
  type LeaderboardResponse,
  type PointsLeaderboardRow,
  type ReferralsLeaderboardRow,
  type TradesLeaderboardRow,
} from '@/lib/leaderboard';
import { getDicebearUserAvatarUrl } from '@/lib/avatar';

type LeaderboardTab = 'points' | 'trades' | 'referrals';

const PERIODS: Array<{ id: LeaderboardPeriod; label: string }> = [
  { id: '24h', label: '24H' },
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: 'all', label: 'All' },
];

const TABS: Array<{ id: LeaderboardTab; label: string; description: string; icon: ReactNode }> = [
  { id: 'points', label: 'Points', description: 'Alpha Points earned by real accounts.', icon: <Trophy size={13} /> },
  { id: 'trades', label: 'Trades', description: 'Tracked wallet trade events observed by Watcher.', icon: <Activity size={13} /> },
  { id: 'referrals', label: 'Referrals', description: 'Referral network growth and passive points.', icon: <Users size={13} /> },
];

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('en-US').format(value);
}

function formatUsdCents(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 'n/a';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: value >= 100_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 100_000_000 ? 2 : 0,
  }).format(value / 100);
}

function formatDateTime(value: string | null): string {
  if (!value) return 'No activity yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function rankAccent(rank: number) {
  if (rank === 1) return 'text-primary';
  if (rank === 2) return 'text-foreground';
  if (rank === 3) return 'text-orange-300';
  return 'text-muted-foreground';
}

function rankEmoji(rank: number) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

function RankCell({ rank }: { rank: number }) {
  const emoji = rankEmoji(rank);

  return (
    <span className={`inline-flex min-w-10 items-center gap-1.5 font-mono text-xs font-black ${rankAccent(rank)}`}>
      {emoji ? <span className="text-base leading-none">{emoji}</span> : <span className="text-[10px] text-muted-foreground">#</span>}
      <span>{rank}</span>
    </span>
  );
}

function AccountCell({ row }: { row: { display: string; accountKey: string; tierLabel: string; referralCode: string | null } }) {
  const avatarUrl = getDicebearUserAvatarUrl(row.accountKey || row.referralCode || row.display);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <img
        src={avatarUrl}
        alt=""
        className="h-7 w-7 shrink-0 rounded-full bg-background object-cover ring-1 ring-primary/20"
        loading="lazy"
      />
      <div className="min-w-0">
        <div className="truncate text-xs font-black text-foreground">{row.display}</div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="shrink-0 rounded-md bg-muted/45 px-1.5 py-0.5 font-bold uppercase tracking-[0.16em]">
            {row.tierLabel}
          </span>
          <span className="truncate font-mono">{row.referralCode ? `ref:${row.referralCode}` : `acct:${row.accountKey}`}</span>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="min-w-0 rounded-md bg-background/55 px-2 py-1.5">
      <div className="flex min-w-0 items-baseline gap-1.5">
        <div className="truncate text-[8px] font-black uppercase tracking-[0.08em] text-muted-foreground md:text-[9px] md:tracking-[0.14em]">{label}</div>
        <div className="shrink-0 font-mono text-sm font-black leading-none text-foreground md:text-base">{value}</div>
      </div>
      <div className="mt-0.5 truncate text-[9px] leading-tight text-muted-foreground">{sub}</div>
    </div>
  );
}

function EmptyState({ tab }: { tab: LeaderboardTab }) {
  const copy = {
    points: 'No Alpha Points have been ranked for this period yet.',
    trades: 'No tracked wallet trade events are available for this period yet.',
    referrals: 'No referral activity has been ranked for this period yet.',
  } satisfies Record<LeaderboardTab, string>;

  return (
    <div className="bg-card/50 px-4 py-8 text-center">
      <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-md bg-background text-primary">
        <Trophy size={16} />
      </div>
      <div className="mt-3 text-sm font-black text-foreground">Real data only</div>
      <div className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{copy[tab]}</div>
    </div>
  );
}

function PointsTable({ rows }: { rows: PointsLeaderboardRow[] }) {
  if (rows.length === 0) return <EmptyState tab="points" />;

  return (
    <div className="overflow-x-auto bg-card/70">
      <table className="w-full min-w-[720px] text-xs">
        <thead className="bg-background/75 text-left text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <tr>
            <th className="w-16 px-3 py-2 font-black">Rank</th>
            <th className="px-3 py-2 font-black">Account</th>
            <th className="px-3 py-2 text-right font-black">Period Points</th>
            <th className="px-3 py-2 text-right font-black">Lifetime</th>
            <th className="px-3 py-2 text-right font-black">Entries</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.accountKey} className="shadow-[inset_0_-1px_0_rgba(148,163,184,0.12)] transition last:shadow-none hover:bg-muted/25">
              <td className="px-3 py-2.5"><RankCell rank={row.rank} /></td>
              <td className="px-3 py-2.5"><AccountCell row={row} /></td>
              <td className="px-3 py-2.5 text-right font-mono text-sm font-black text-primary">{formatNumber(row.points)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{formatNumber(row.lifetimePoints)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{row.ledgerEntries === null ? 'All' : formatNumber(row.ledgerEntries)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TradesTable({ rows }: { rows: TradesLeaderboardRow[] }) {
  if (rows.length === 0) return <EmptyState tab="trades" />;

  return (
    <div className="overflow-x-auto bg-card/70">
      <table className="w-full min-w-[760px] text-xs">
        <thead className="bg-background/75 text-left text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <tr>
            <th className="w-16 px-3 py-2 font-black">Rank</th>
            <th className="px-3 py-2 font-black">Account</th>
            <th className="px-3 py-2 text-right font-black">Trades</th>
            <th className="px-3 py-2 text-right font-black">Buy / Sell</th>
            <th className="px-3 py-2 text-right font-black">Volume</th>
            <th className="px-3 py-2 text-right font-black">Last Seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.accountKey} className="shadow-[inset_0_-1px_0_rgba(148,163,184,0.12)] transition last:shadow-none hover:bg-muted/25">
              <td className="px-3 py-2.5"><RankCell rank={row.rank} /></td>
              <td className="px-3 py-2.5"><AccountCell row={row} /></td>
              <td className="px-3 py-2.5 text-right font-mono text-sm font-black text-primary">{formatNumber(row.tradeCount)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                <span className="text-success">{formatNumber(row.buyCount)}</span>
                <span className="px-1 text-muted-foreground">/</span>
                <span className="text-red-400">{formatNumber(row.sellCount)}</span>
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{formatUsdCents(row.volumeUsdCents)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{formatDateTime(row.lastActivityAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReferralsTable({ rows }: { rows: ReferralsLeaderboardRow[] }) {
  if (rows.length === 0) return <EmptyState tab="referrals" />;

  return (
    <div className="overflow-x-auto bg-card/70">
      <table className="w-full min-w-[720px] text-xs">
        <thead className="bg-background/75 text-left text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <tr>
            <th className="w-16 px-3 py-2 font-black">Rank</th>
            <th className="px-3 py-2 font-black">Account</th>
            <th className="px-3 py-2 text-right font-black">Referrals</th>
            <th className="px-3 py-2 text-right font-black">Active</th>
            <th className="px-3 py-2 text-right font-black">Passive Points</th>
            <th className="px-3 py-2 text-right font-black">Latest</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.accountKey} className="shadow-[inset_0_-1px_0_rgba(148,163,184,0.12)] transition last:shadow-none hover:bg-muted/25">
              <td className="px-3 py-2.5"><RankCell rank={row.rank} /></td>
              <td className="px-3 py-2.5"><AccountCell row={row} /></td>
              <td className="px-3 py-2.5 text-right font-mono text-sm font-black text-primary">{formatNumber(row.referralCount)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-success">{formatNumber(row.activeReferralCount)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{formatNumber(row.passivePoints)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{formatDateTime(row.joinedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<LeaderboardPeriod>('7d');
  const [tab, setTab] = useState<LeaderboardTab>('points');
  const [snapshot, setSnapshot] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchLeaderboard(period, controller.signal)
      .then((response) => setSnapshot(response))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load leaderboard.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [period, refreshTick]);

  const body = () => {
    if (loading && !snapshot) {
      return (
        <div className="flex min-h-[260px] items-center justify-center bg-card/60 text-sm text-muted-foreground">
          <LoaderCircle className="mr-2 animate-spin text-primary" size={16} />
          Loading live rankings...
        </div>
      );
    }

    if (error) {
      return (
        <div className="border border-destructive/40 bg-destructive/10 px-4 py-4 text-sm text-destructive">
          <div className="flex items-center gap-2 font-black">
            <AlertTriangle size={15} />
            Leaderboard unavailable
          </div>
          <div className="mt-1 text-xs text-destructive/85">{error}</div>
        </div>
      );
    }

    if (!snapshot) return <EmptyState tab={tab} />;

    if (tab === 'trades') return <TradesTable rows={snapshot.trades} />;
    if (tab === 'referrals') return <ReferralsTable rows={snapshot.referrals} />;
    return <PointsTable rows={snapshot.points} />;
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 p-2 md:p-3">
        <section className="rounded-md bg-card/75 px-2 py-2">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="grid grid-cols-3 gap-1.5 xl:min-w-[520px] xl:max-w-[620px] xl:flex-1">
              <Metric
                label="Point Accounts"
                value={formatNumber(snapshot?.summary.pointAccounts ?? 0)}
                sub={`${formatNumber(snapshot?.summary.topPoints ?? 0)} top score`}
              />
              <Metric
                label="Trade Events"
                value={formatNumber(snapshot?.summary.trackedTradeEvents ?? 0)}
                sub={`${formatNumber(snapshot?.summary.trackedTradeAccounts ?? 0)} ranked accounts`}
              />
              <Metric
                label="Referrals"
                value={formatNumber(snapshot?.summary.totalReferrals ?? 0)}
                sub={`${formatNumber(snapshot?.summary.referralAccounts ?? 0)} builders ranked`}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-1.5 xl:justify-end">
              <div className="flex flex-wrap items-center gap-1.5">
                {TABS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`tap-feedback inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-black transition ${
                      tab === item.id
                        ? 'bg-primary/10 text-primary'
                        : 'bg-background/70 text-muted-foreground hover:bg-muted/35 hover:text-foreground'
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1">
              {PERIODS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPeriod(item.id)}
                  className={`tap-feedback rounded-md px-2.5 py-1.5 text-xs font-black transition ${
                    period === item.id
                      ? 'bg-primary/10 text-primary'
                      : 'bg-background/70 text-muted-foreground hover:bg-muted/35 hover:text-foreground'
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setRefreshTick((tick) => tick + 1)}
                disabled={loading}
                className="tap-feedback inline-flex items-center gap-1.5 rounded-md bg-background/70 px-2.5 py-1.5 text-xs font-black text-muted-foreground transition hover:bg-muted/35 hover:text-foreground disabled:opacity-60"
              >
                <RefreshCw size={12} className={loading ? 'animate-spin text-primary' : ''} />
                Refresh
              </button>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-md bg-card/75">
          <div className="p-2 md:p-3">{body()}</div>
        </section>
      </div>
    </div>
  );
}
