import { useEffect, useState, type ReactNode } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import {
  Check,
  Copy,
  Flame,
  Link2,
  LoaderCircle,
  RefreshCw,
  Share2,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import {
  fetchPointsDashboard,
  type PointsDashboard,
} from '@/lib/points';
import { getDicebearUserAvatarUrl } from '@/lib/avatar';
import { shortenAddress } from '@/lib/privy-profile';

function formatPoints(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('en-US').format(value);
}

function formatBps(value: number): string {
  if (value === 10_000) return '1x';
  return `${(value / 10_000).toFixed(value % 10_000 === 0 ? 0 : 2)}x`;
}

function formatBonus(value: number): string {
  if (value <= 0) return 'Base';
  return `+${Math.round(value / 100)}%`;
}

function formatAction(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <button
      onClick={copy}
      className="tap-feedback inline-flex items-center gap-1.5 rounded-md bg-background/70 px-2.5 py-1.5 text-[11px] font-bold text-foreground transition hover:bg-muted/40"
      type="button"
    >
      {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
      {copied ? 'Copied' : label}
    </button>
  );
}

function Metric({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: ReactNode;
}) {
  return (
    <div className="min-w-[12rem] snap-start rounded-md bg-card/75 px-3 py-2.5 sm:min-w-0">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
        <div className="text-primary">{icon}</div>
      </div>
      <div className="mt-2 text-xl font-black tracking-tight text-foreground">{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

export default function PointsPage() {
  const { ready, authenticated, login, getAccessToken, user } = usePrivy();
  const [dashboard, setDashboard] = useState<PointsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!ready) {
      setLoading(true);
      return;
    }

    if (!authenticated) {
      setDashboard(null);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void getAccessToken()
      .then((token) => {
        if (!token) throw new Error('No Privy access token was available for this session.');
        return fetchPointsDashboard(token, controller.signal);
      })
      .then((pointsResponse) => {
        setDashboard(pointsResponse.dashboard);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load AnyAlpha Rewards.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [authenticated, getAccessToken, ready, refreshTick]);

  if (!ready) {
    return (
      <div className="h-full bg-background px-4 pt-4 md:flex md:items-center md:justify-center md:pt-0">
        <div className="flex items-center gap-3 rounded-md bg-card px-5 py-4 text-sm text-muted-foreground">
          <LoaderCircle size={18} className="animate-spin text-primary" />
          Preparing AnyAlpha Rewards...
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="h-full overflow-y-auto bg-background px-3 py-4 md:px-4">
        <div className="mx-auto flex min-h-full max-w-3xl items-center">
          <div className="w-full rounded-md bg-card/70 px-4 py-6">
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">AnyAlpha Rewards</div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-foreground">Earn from terminal activity and referrals.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Sign in to generate your referral links, track your ledger, and keep your rank tied to your verified profile.
            </p>
            <button
              onClick={() => void login()}
              className="tap-feedback mt-4 inline-flex w-full items-center justify-center gap-2 bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground transition hover:opacity-90 sm:w-auto"
              type="button"
            >
              <Sparkles size={15} />
              Sign In To Start Earning
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 p-2 md:p-3">
        <div className="flex justify-end">
          <button
            onClick={() => setRefreshTick((tick) => tick + 1)}
            className="tap-feedback inline-flex items-center justify-center gap-1.5 rounded-md bg-card/75 px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
            type="button"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin text-primary' : ''} />
            Refresh
          </button>
        </div>

        {error ? (
          <div className="border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-foreground">{error}</div>
        ) : null}

        {loading && !dashboard ? (
          <div className="flex items-center gap-3 rounded-md bg-card px-4 py-4 text-sm text-muted-foreground">
            <LoaderCircle size={18} className="animate-spin text-primary" />
            Loading your live rewards ledger...
          </div>
        ) : null}

        {dashboard ? (
          <>
            <div className="-mx-2 flex snap-x gap-2 overflow-x-auto px-2 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-4">
              <Metric
                label="Balance"
                value={formatPoints(dashboard.account.balance)}
                sub={`${dashboard.account.tierEmoji} ${dashboard.account.tierLabel} tier`}
                icon={<Sparkles size={14} />}
              />
              <Metric
                label="Streak"
                value={`${dashboard.account.streakDays}d`}
                sub={`Current multiplier ${formatBps(dashboard.account.multiplierBps)}`}
                icon={<Flame size={14} />}
              />
              <Metric
                label="Referrals"
                value={formatPoints(dashboard.referralStats.totalReferrals)}
                sub={`${dashboard.referralStats.referralTierLabel} tier · ${formatBonus(dashboard.referralStats.referralBonusBps)}`}
                icon={<Users size={14} />}
              />
              <Metric
                label="Rank"
                value={dashboard.referralStats.rank ? `#${dashboard.referralStats.rank}` : 'n/a'}
                sub={dashboard.account.nextTier ? `${formatPoints(dashboard.account.nextTier.pointsRemaining)} pts to ${dashboard.account.nextTier.label}` : 'Top tier reached'}
                icon={<Trophy size={14} />}
              />
            </div>

            <div className="grid gap-3 xl:grid-cols-[0.9fr,1.1fr]">
              <section className="rounded-md bg-card/75 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">Your Links</div>
                    <div className="mt-1 text-sm text-muted-foreground">Both links credit your public AnyAlpha username.</div>
                  </div>
                  <div className="flex items-center gap-2 rounded-md bg-background/70 px-2 py-1">
                    <img
                      src={getDicebearUserAvatarUrl(user?.id ?? dashboard.account.username)}
                      alt=""
                      className="h-6 w-6 rounded-full bg-card object-cover ring-1 ring-primary/20"
                      loading="lazy"
                    />
                    <span className="font-mono text-xs font-bold text-foreground">{dashboard.account.username}</span>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="rounded-md bg-background/55 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                          <Link2 size={12} />
                          Terminal
                        </div>
                        <div className="mt-2 break-all font-mono text-xs text-foreground">{dashboard.referralLinks.terminal}</div>
                      </div>
                      <CopyButton value={dashboard.referralLinks.terminal} />
                    </div>
                  </div>

                  <div className="rounded-md bg-background/55 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                          <Share2 size={12} />
                          Telegram
                        </div>
                        <div className="mt-2 break-all font-mono text-xs text-foreground">
                          {dashboard.referralLinks.telegram ?? 'Telegram bot link is not configured yet.'}
                        </div>
                      </div>
                      {dashboard.referralLinks.telegram ? <CopyButton value={dashboard.referralLinks.telegram} /> : null}
                    </div>
                  </div>

                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <div className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2.5 py-1.5 text-[11px] font-bold text-success">
                    <ShieldCheck size={12} />
                    Ledger-backed
                  </div>
                </div>
              </section>

              <section className="rounded-md bg-card/75 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">Referral Stats</div>
                    <div className="mt-1 text-sm text-muted-foreground">Live totals from your referral records.</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-foreground">{formatPoints(dashboard.referralStats.referralPoints)}</div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Referral rewards</div>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-md bg-background/55 p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Active</div>
                    <div className="mt-1 text-lg font-black text-foreground">{formatPoints(dashboard.referralStats.activeReferrals)}</div>
                  </div>
                  <div className="rounded-md bg-background/55 p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Passive</div>
                    <div className="mt-1 text-lg font-black text-foreground">{formatPoints(dashboard.referralStats.passivePoints)}</div>
                  </div>
                  <div className="rounded-md bg-background/55 p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Today</div>
                    <div className="mt-1 text-lg font-black text-success">+{formatPoints(dashboard.referralStats.passivePointsToday)}</div>
                  </div>
                </div>

                <div className="mt-4 max-h-[220px] overflow-y-auto rounded-md bg-background/35">
                  {dashboard.referrals.length > 0 ? (
                    dashboard.referrals.map((referral) => (
                      <div key={referral.id} className="flex items-center justify-between gap-3 px-3 py-2 shadow-[inset_0_-1px_0_rgba(148,163,184,0.12)] last:shadow-none">
                        <div className="flex min-w-0 items-center gap-2">
                          <img
                            src={getDicebearUserAvatarUrl(referral.refereeId)}
                            alt=""
                            className="h-7 w-7 shrink-0 rounded-full bg-background object-cover ring-1 ring-primary/20"
                            loading="lazy"
                          />
                          <div className="min-w-0">
                            <div className="truncate font-mono text-xs font-bold text-foreground">{referral.refereeDisplay}</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {referral.source} · {formatDateTime(referral.joinedAt)}
                          </div>
                        </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-black text-foreground">{formatPoints(referral.refereePoints)} pts</div>
                          <div className="text-[10px] text-success">+{formatPoints(referral.totalPassivePoints)} passive</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-5 text-sm text-muted-foreground">No referred users yet. Share your terminal or Telegram link to start building this list.</div>
                  )}
                </div>
              </section>
            </div>

            <div className="grid gap-3 xl:grid-cols-2">
              <section className="rounded-md bg-card/75 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">Recent Ledger</div>
                <div className="mt-3 max-h-[280px] overflow-y-auto rounded-md bg-background/35">
                  {dashboard.recentLedger.length > 0 ? (
                    dashboard.recentLedger.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2 shadow-[inset_0_-1px_0_rgba(148,163,184,0.12)] last:shadow-none">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-foreground">{formatAction(entry.action)}</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">{entry.source} · {formatDateTime(entry.createdAt)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-black text-success">+{formatPoints(entry.points)}</div>
                          <div className="text-[10px] text-muted-foreground">{formatBps(entry.multiplierBps)}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-5 text-sm text-muted-foreground">No ledger entries yet. Your first daily terminal visit will appear here.</div>
                  )}
                </div>
              </section>

              <section className="rounded-md bg-card/75 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">Leaderboard</div>
                <div className="mt-3 max-h-[280px] overflow-y-auto rounded-md bg-background/35">
                  {dashboard.leaderboard.length > 0 ? (
                    dashboard.leaderboard.map((row) => (
                      <div key={row.userId} className="flex items-center justify-between gap-3 px-3 py-2 shadow-[inset_0_-1px_0_rgba(148,163,184,0.12)] last:shadow-none">
                        <div className="flex min-w-0 items-center gap-2">
                          <img
                            src={getDicebearUserAvatarUrl(row.userId)}
                            alt=""
                            className="h-7 w-7 shrink-0 rounded-full bg-background object-cover ring-1 ring-primary/20"
                            loading="lazy"
                          />
                          <div className="min-w-0">
                            <div className="truncate text-xs font-black text-foreground">#{row.rank} {row.display}</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {row.tierLabel} · {shortenAddress(row.userId, 8, 5)}
                          </div>
                        </div>
                        </div>
                        <div className="text-sm font-black text-foreground">{formatPoints(row.totalPoints)}</div>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-5 text-sm text-muted-foreground">No ranked users are available yet.</div>
                  )}
                </div>
              </section>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
