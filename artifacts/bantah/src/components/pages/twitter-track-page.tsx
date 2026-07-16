import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { LoaderCircle, RefreshCw, Trash2, Twitter, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchTwitterTrack,
  removeXAccount,
  type TwitterTrackResponse,
  type XTrackedAccountItem,
} from '@/lib/twitter-track';

const EMPTY_TWITTER_TRACK: TwitterTrackResponse = {
  source: 'twitter_track',
  accounts: [],
  posts: [],
  mentions: [],
  monitoring: {
    bearerConfigured: false,
    webhookSecretConfigured: false,
    publicWebhookBaseConfigured: false,
    cryptoFeedQuery: null,
    cryptoFeedUpdatedAt: null,
    cryptoFeedError: null,
  },
  updatedAt: new Date(0).toISOString(),
};

function formatDateTime(value: string | null): string {
  if (!value) return 'No post yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function CryptoTimelineSection({ snapshot }: { snapshot: TwitterTrackResponse }) {
  if (snapshot.posts.length === 0) return null;

  return (
    <section className="max-h-[520px] overflow-y-auto border border-border bg-card">
      <div>
        {snapshot.posts.map((post) => (
          <div key={post.id} className="border-b border-border p-3 last:border-b-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-black text-foreground">{post.authorHandle ?? 'Unknown author'}</span>
              <span>{formatDateTime(post.postedAt)}</span>
              {post.lang ? <span>{post.lang}</span> : null}
            </div>
            <p className="mt-2 text-sm leading-6 text-foreground">{post.text}</p>
            {post.mentions.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {post.mentions.map((mention, index) => (
                  <span key={`${post.id}-${index}`} className="border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-black text-primary">
                    {mention.tokenSymbol ? `$${mention.tokenSymbol}` : mention.contractAddress}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function TwitterTrackPage() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const [snapshot, setSnapshot] = useState<TwitterTrackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void Promise.resolve()
      .then(() => {
        if (!ready || !authenticated) return null;
        return getAccessToken();
      })
      .then((token) => {
        return fetchTwitterTrack(token, controller.signal);
      })
      .then((response) => setSnapshot(response))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.warn('Twitter Track API unavailable; showing empty crypto timeline.', err);
        setSnapshot(EMPTY_TWITTER_TRACK);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [authenticated, getAccessToken, ready, refreshTick]);

  async function handleRemove(account: XTrackedAccountItem) {
    setRemoving((current) => new Set(current).add(account.id));

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('No Privy access token was available for this session.');
      await removeXAccount(token, account.id);
      setSnapshot((current) => {
        if (!current) return current;
        return {
          ...current,
          accounts: current.accounts.filter((item) => item.id !== account.id),
        };
      });
      toast.success('X account removed', { description: account.handle });
    } catch (err) {
      toast.error('X Track update failed', {
        description: err instanceof Error ? err.message : 'Could not remove this X account.',
      });
    } finally {
      setRemoving((current) => {
        const next = new Set(current);
        next.delete(account.id);
        return next;
      });
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 p-3 md:p-4">
        <section className="border border-border bg-[radial-gradient(circle_at_top_left,rgba(245,46,43,0.14),transparent_30%),linear-gradient(180deg,rgba(245,46,43,0.05),transparent_70%)]">
          <div className="flex flex-col gap-4 px-4 py-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-primary">
                <Twitter size={12} />
                Twitter Track
              </div>
            </div>
            <button
              onClick={() => setRefreshTick((tick) => tick + 1)}
              className="tap-feedback inline-flex items-center justify-center gap-2 border border-border bg-background/75 px-3 py-2 text-xs font-bold text-foreground transition hover:bg-muted/40"
              type="button"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </section>

        {error ? <div className="border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-foreground">{error}</div> : null}

        {loading && !snapshot ? (
          <div className="flex items-center gap-3 border border-border bg-card px-4 py-4 text-sm text-muted-foreground">
            <LoaderCircle size={18} className="animate-spin text-primary" />
            Loading X feed...
          </div>
        ) : null}

        {snapshot ? (
          <>
            <CryptoTimelineSection snapshot={snapshot} />

            <div className="grid gap-3">
              <section className="border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">Saved X Accounts</div>
                    <div className="mt-1 text-sm text-muted-foreground">{authenticated ? 'Accounts tied to your profile.' : 'Signed-in X account list.'}</div>
                  </div>
                  <Users size={16} className="text-primary" />
                </div>
                <div className="mt-3 max-h-[380px] overflow-y-auto border border-border">
                  {snapshot.accounts.length > 0 ? (
                    snapshot.accounts.map((account) => (
                      <div key={account.id} className="flex items-start justify-between gap-3 border-b border-border p-3 last:border-b-0">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-black text-foreground">{account.handle}</span>
                            <span className="border border-border bg-background px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                              {account.alertMode.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">Last post: {formatDateTime(account.lastPostAt)}</div>
                        </div>
                        {authenticated ? (
                          <button
                            type="button"
                            onClick={() => void handleRemove(account)}
                            disabled={removing.has(account.id)}
                            className="tap-feedback border border-border bg-background/70 p-2 text-muted-foreground transition hover:text-destructive disabled:opacity-50"
                          >
                            {removing.has(account.id) ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-6 text-sm text-muted-foreground">
                      No saved X accounts yet.
                    </div>
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
