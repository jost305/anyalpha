import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Bell, BellOff, BellRing, CheckCheck, Loader2, RefreshCw, Send, Trash2, Zap, TrendingDown, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { NotificationsSkeleton } from '@/components/common/skeletons';
import { EmptySignals } from '@/components/common/empty-states';
import { fetchMarketSignals, fmtCompact, fmtPct, marketPairLabel, marketTokenPath, type MarketSignal } from '@/lib/market-data';
import {
  fetchUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type UserNotification,
} from '@/lib/notifications';
import {
  getBrowserPushState,
  isBrowserPushSupported,
  sendTestNotification,
  subscribeBrowserPush,
  unsubscribeBrowserPush,
  type BrowserPushState,
} from '@/lib/push-notifications';

type Tab = 'All' | 'Bullish' | 'Bearish' | 'Watch';

const TABS: Tab[] = ['All', 'Bullish', 'Bearish', 'Watch'];
const RETRY_DELAY_MS = 4000;

function initialPushState(): BrowserPushState {
  const supported = isBrowserPushSupported();

  return {
    supported,
    permission: supported ? Notification.permission : 'unsupported',
    configured: false,
    subscribed: false,
  };
}

function iconFor(signal: MarketSignal) {
  if (signal.sentiment === 'Bullish') return TrendingUp;
  if (signal.sentiment === 'Bearish') return TrendingDown;
  return Zap;
}

export default function NotificationsPage() {
  const { ready, authenticated, getAccessToken, login } = usePrivy();
  const [signals, setSignals] = useState<MarketSignal[]>([]);
  const [accountNotifications, setAccountNotifications] = useState<UserNotification[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [read, setRead] = useState<Set<string>>(new Set());
  const [accountRead, setAccountRead] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<Tab>('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [pushState, setPushState] = useState<BrowserPushState>(() => initialPushState());
  const [pushBusy, setPushBusy] = useState<'enable' | 'disable' | 'test' | null>(null);

  useEffect(() => {
    const handleRealtimeNotification = (event: Event) => {
      const notification = (event as CustomEvent<UserNotification>).detail;

      if (!notification?.id) return;

      setAccountNotifications((prev) => [
        notification,
        ...prev.filter((current) => current.id !== notification.id),
      ].slice(0, 50));
      setAccountRead((prev) => {
        const next = new Set(prev);

        if (notification.readState === 'unread') {
          next.delete(notification.id);
        } else {
          next.add(notification.id);
        }

        return next;
      });
    };

    window.addEventListener('anyalpha:notification-created', handleRealtimeNotification as EventListener);
    return () => window.removeEventListener('anyalpha:notification-created', handleRealtimeNotification as EventListener);
  }, []);

  useEffect(() => {
    if (!ready) {
      setLoading(true);
      return;
    }

    if (!authenticated) {
      setSignals([]);
      setAccountNotifications([]);
      setDismissed(new Set());
      setRead(new Set());
      setAccountRead(new Set());
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchMarketSignals(30, controller.signal),
      getAccessToken().then((token) => {
        if (!token) throw new Error('No Privy access token was available for this session.');
        return fetchUserNotifications(token, 50, controller.signal);
      }),
    ])
      .then(([signalsResponse, notificationsResponse]) => {
        setSignals(signalsResponse.data);
        setAccountNotifications(notificationsResponse.notifications);
        setAccountRead(
          new Set(
            notificationsResponse.notifications
              .filter((notification) => notification.readState !== 'unread')
              .map((notification) => notification.id),
          ),
        );
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load notifications.');
        retryTimeout = setTimeout(() => {
          setRefreshTick((tick) => tick + 1);
        }, RETRY_DELAY_MS);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      if (retryTimeout) clearTimeout(retryTimeout);
      controller.abort();
    };
  }, [authenticated, getAccessToken, ready, refreshTick]);

  useEffect(() => {
    if (!ready || !authenticated) {
      setPushState(initialPushState());
      return;
    }

    const controller = new AbortController();

    void getAccessToken()
      .then((token) => {
        if (!token) return null;
        return getBrowserPushState(token, controller.signal);
      })
      .then((state) => {
        if (!state || controller.signal.aborted) return;
        setPushState(state);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPushState((state) => ({ ...state, configured: false }));
      });

    return () => controller.abort();
  }, [authenticated, getAccessToken, ready, refreshTick]);

  const activeSignals = signals.filter((signal) => !dismissed.has(signal.id));
  const unreadSignals = activeSignals.filter((signal) => !read.has(signal.id)).length;
  const unreadAccountNotifications = accountNotifications.filter((notification) => !accountRead.has(notification.id)).length;
  const unread = unreadSignals + unreadAccountNotifications;
  const visible = activeSignals.filter((signal) => tab === 'All' || signal.sentiment === tab);
  const visibleAccountNotifications = tab === 'All' ? accountNotifications : [];

  async function markAllRead() {
    setRead(new Set(activeSignals.map((signal) => signal.id)));
    setAccountRead(new Set(accountNotifications.map((notification) => notification.id)));

    const token = await getAccessToken().catch(() => null);
    if (token) {
      void markAllNotificationsRead(token).catch(() => {});
    }
  }

  async function markAccountNotificationRead(id: string) {
    setAccountRead((prev) => new Set(prev).add(id));

    const token = await getAccessToken().catch(() => null);
    if (token) {
      void markNotificationRead(token, id).catch(() => {});
    }
  }

  async function refreshPushState() {
    const token = await getAccessToken();
    if (!token) throw new Error('No Privy access token was available for this session.');

    const state = await getBrowserPushState(token);
    setPushState(state);
    return token;
  }

  async function enablePush() {
    setPushBusy('enable');

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('No Privy access token was available for this session.');

      await subscribeBrowserPush(token);
      await refreshPushState();
      toast.success('Push notifications enabled');
    } catch (err) {
      toast.error('Push setup failed', {
        description: err instanceof Error ? err.message : 'Unable to enable browser push.',
      });
    } finally {
      setPushBusy(null);
    }
  }

  async function disablePush() {
    setPushBusy('disable');

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('No Privy access token was available for this session.');

      await unsubscribeBrowserPush(token);
      await refreshPushState();
      toast.success('Push notifications disabled');
    } catch (err) {
      toast.error('Push update failed', {
        description: err instanceof Error ? err.message : 'Unable to disable browser push.',
      });
    } finally {
      setPushBusy(null);
    }
  }

  async function sendPushTest() {
    setPushBusy('test');

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('No Privy access token was available for this session.');

      await sendTestNotification(token);
      toast.success('Test notification sent');
    } catch (err) {
      toast.error('Test notification failed', {
        description: err instanceof Error ? err.message : 'Unable to send a test notification.',
      });
    } finally {
      setPushBusy(null);
    }
  }

  const pushLabel = !pushState.supported
    ? 'Push unavailable'
    : !pushState.configured
      ? 'Push setup needed'
      : pushState.subscribed
        ? 'Push on'
        : pushState.permission === 'denied'
          ? 'Push blocked'
          : 'Push off';
  const PushStatusIcon = pushState.subscribed ? BellRing : pushState.permission === 'denied' ? BellOff : Bell;

  if (!ready) return <NotificationsSkeleton />;

  if (!authenticated) {
    return (
      <div className="h-full overflow-y-auto bg-background p-4">
        <div className="mx-auto flex min-h-0 max-w-3xl items-start pt-2 md:min-h-full md:items-center md:pt-0">
          <div className="w-full overflow-hidden rounded-[32px] border border-border bg-card shadow-2xl">
            <div className="bg-[radial-gradient(circle_at_top_left,rgba(249,149,61,0.16),transparent_35%),linear-gradient(135deg,rgba(249,149,61,0.08),transparent_60%)] px-6 py-8 md:px-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                <Bell size={12} />
                Sign In Required
              </div>
              <h2 className="mt-4 max-w-2xl text-3xl font-black tracking-tight text-foreground">
                Notifications only unlock for logged-in users.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Sign in with Privy to view live market alerts, keep unread counts in sync, and
                avoid exposing the notification feed to logged-out visitors.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => void login()}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:opacity-90"
                  type="button"
                >
                  <Bell size={15} />
                  Sign In To View Notifications
                </button>
                <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-background/70 px-4 py-2.5 text-sm text-muted-foreground">
                  Logged-out sessions do not load alerts or unread counts
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (signals.length === 0 && (loading || error)) return <NotificationsSkeleton />;

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-primary" />
          <span className="font-bold text-sm">Market Alerts</span>
          {unread > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-destructive text-white animate-pulse">
              {unread} new
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
              pushState.subscribed
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-border bg-input text-muted-foreground'
            }`}
          >
            <PushStatusIcon size={11} />
            {pushLabel}
          </span>
          {pushState.supported && pushState.configured && pushState.permission !== 'denied' ? (
            <button
              onClick={() => void (pushState.subscribed ? disablePush() : enablePush())}
              disabled={pushBusy === 'enable' || pushBusy === 'disable'}
              className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-wait disabled:opacity-60"
              type="button"
            >
              {pushBusy === 'enable' || pushBusy === 'disable' ? (
                <Loader2 size={11} className="animate-spin" />
              ) : pushState.subscribed ? (
                <BellOff size={11} />
              ) : (
                <BellRing size={11} />
              )}
              {pushState.subscribed ? 'Disable push' : 'Enable push'}
            </button>
          ) : null}
          {pushState.subscribed ? (
            <button
              onClick={() => void sendPushTest()}
              disabled={pushBusy === 'test'}
              className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-wait disabled:opacity-60"
              type="button"
            >
              {pushBusy === 'test' ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
              Test
            </button>
          ) : null}
          <button
            onClick={() => void markAllRead()}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition px-2 py-1 border border-border rounded hover:bg-muted"
            type="button"
          >
            <CheckCheck size={11} /> Mark all read
          </button>
          <button
            onClick={() => setRefreshTick((tick) => tick + 1)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition px-2 py-1 border border-border rounded hover:bg-muted"
            type="button"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-0 border-b border-border overflow-x-auto">
        {TABS.map(t => {
          const count = t === 'All'
            ? activeSignals.filter(signal => !read.has(signal.id)).length
            : activeSignals.filter(signal => signal.sentiment === t && !read.has(signal.id)).length;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 text-xs px-3 py-2 border-b-2 transition whitespace-nowrap shrink-0 ${
                tab === t
                  ? 'border-primary text-foreground font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t}
              {count > 0 && (
                <span className="text-[9px] font-bold px-1 py-0.5 rounded-full bg-destructive/80 text-white min-w-[14px] text-center">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto">
        {!loading && visible.length === 0 && visibleAccountNotifications.length === 0 ? (
          <EmptySignals />
        ) : (
          <div className="divide-y divide-border/50">
            {visibleAccountNotifications.map((notification) => {
              const isRead = accountRead.has(notification.id);

              return (
                <div
                  key={notification.id}
                  onClick={() => void markAccountNotificationRead(notification.id)}
                  className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition hover:bg-muted/40 ${!isRead ? 'bg-primary/3' : ''}`}
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Bell size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {!isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                      <span className="text-xs font-bold text-foreground">{notification.title}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {notification.kind.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{notification.body}</p>
                    <div className="mt-1 text-[10px] font-mono text-muted-foreground">
                      {new Date(notification.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              );
            })}
            {visible.map(signal => {
              const Icon = iconFor(signal);
              const isRead = read.has(signal.id);
              const iconColor = signal.sentiment === 'Bullish'
                ? 'text-success bg-success/10'
                : signal.sentiment === 'Bearish'
                  ? 'text-red-400 bg-red-400/10'
                  : 'text-yellow-400 bg-yellow-400/10';

              return (
                <div
                  key={signal.id}
                  onClick={() => setRead((prev) => new Set(prev).add(signal.id))}
                  className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition hover:bg-muted/40 ${!isRead ? 'bg-primary/3' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${iconColor}`}>
                    <Icon size={14} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          {!isRead && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                          <span className="text-xs font-bold text-foreground">{marketPairLabel(signal.token)}</span>
                          <span className="text-[10px] text-muted-foreground">Score {signal.score}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{signal.reason}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {signal.sentiment}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">24h {fmtPct(signal.token.priceChange.h24)}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">Vol {fmtCompact(signal.token.volume.h24, { currency: true })}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          href={marketTokenPath(signal.token)}
                          className="text-[10px] text-primary hover:underline whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Open
                        </a>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDismissed((prev) => new Set(prev).add(signal.id));
                          }}
                          className="text-muted-foreground hover:text-destructive transition p-0.5 rounded hover:bg-muted"
                          title="Dismiss"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
