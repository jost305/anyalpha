import { useEffect, useState } from 'react';
import { Bell, CheckCheck, RefreshCw, Trash2, Zap, TrendingDown, TrendingUp } from 'lucide-react';
import { NotificationsSkeleton } from '@/components/common/skeletons';
import { EmptySignals } from '@/components/common/empty-states';
import { fetchMarketSignals, fmtCompact, fmtPct, marketPairLabel, type MarketSignal } from '@/lib/market-data';

type Tab = 'All' | 'Bullish' | 'Bearish' | 'Watch';

const TABS: Tab[] = ['All', 'Bullish', 'Bearish', 'Watch'];
const RETRY_DELAY_MS = 4000;

function iconFor(signal: MarketSignal) {
  if (signal.sentiment === 'Bullish') return TrendingUp;
  if (signal.sentiment === 'Bearish') return TrendingDown;
  return Zap;
}

export default function NotificationsPage() {
  const [signals, setSignals] = useState<MarketSignal[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [read, setRead] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<Tab>('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    setError(null);

    fetchMarketSignals(30, controller.signal)
      .then((response) => setSignals(response.data))
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
  }, [refreshTick]);

  const activeSignals = signals.filter((signal) => !dismissed.has(signal.id));
  const unread = activeSignals.filter((signal) => !read.has(signal.id)).length;
  const visible = activeSignals.filter((signal) => tab === 'All' || signal.sentiment === tab);

  if (signals.length === 0 && (loading || error)) return <NotificationsSkeleton />;

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <div className="shrink-0 px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-primary" />
          <span className="font-bold text-sm">Market Alerts</span>
          {unread > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-destructive text-white animate-pulse">
              {unread} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRead(new Set(activeSignals.map((signal) => signal.id)))}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition px-2 py-1 border border-border rounded hover:bg-muted"
          >
            <CheckCheck size={11} /> Mark all read
          </button>
          <button
            onClick={() => setRefreshTick((tick) => tick + 1)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition px-2 py-1 border border-border rounded hover:bg-muted"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
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
        {!loading && visible.length === 0 ? (
          <EmptySignals />
        ) : (
          <div className="divide-y divide-border/50">
            {visible.map(signal => {
              const Icon = iconFor(signal);
              const isRead = read.has(signal.id);
              const iconColor = signal.sentiment === 'Bullish'
                ? 'text-green-400 bg-green-400/10'
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
                          href={signal.token.url}
                          target="_blank"
                          rel="noopener noreferrer"
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
