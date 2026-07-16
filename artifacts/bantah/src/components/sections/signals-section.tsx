import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Chip } from '@/components/common/chips';
import { SignalsSkeleton } from '@/components/common/skeletons';
import { EmptySignals } from '@/components/common/empty-states';
import { fetchMarketSignals, fmtCompact, fmtPct, marketPairLabel, marketTokenPath, type MarketSignal } from '@/lib/market-data';

const RETRY_DELAY_MS = 4000;

export default function SignalsSection() {
  const [signals, setSignals] = useState<MarketSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    setError(null);

    fetchMarketSignals(16, controller.signal)
      .then((response) => setSignals(response.data))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load signals.');
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

  if (signals.length === 0 && (loading || error)) return <SignalsSkeleton />;
  if (!loading && signals.length === 0) return <EmptySignals />;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-border bg-background px-2 py-1.5 flex items-center justify-between shrink-0">
        <div>
          <div className="text-sm font-bold text-foreground">TOP SIGNALS</div>
          <div className="text-xs text-muted-foreground">Ranked from live AnyAlpha market data</div>
        </div>
        <button
          onClick={() => setRefreshTick((tick) => tick + 1)}
          className="text-xs text-muted-foreground hover:text-foreground"
          title="Refresh signals"
        >
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1.5">
        {signals.map((signal) => (
          <a
            key={signal.id}
            href={marketTokenPath(signal.token)}
            className="block bg-muted/30 border border-border/50 rounded px-2 py-1.5 hover:border-accent hover:bg-muted/50 transition group"
          >
            <div className="flex items-start justify-between gap-1.5 mb-0.5">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                {signal.token.imageUrl ? (
                  <img src={signal.token.imageUrl} alt={signal.token.symbol} className="w-5 h-5 rounded-full object-cover bg-muted" />
                ) : (
                  <span className="w-5 h-5 rounded-full bg-primary/15 border border-primary/30 text-primary text-[9px] font-black flex items-center justify-center">
                    {signal.token.symbol.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="text-sm font-bold text-foreground truncate">{marketPairLabel(signal.token)}</div>
                <span className={`text-xs font-bold ${
                  signal.sentiment === 'Bullish' ? 'text-success' : signal.sentiment === 'Bearish' ? 'text-destructive' : 'text-muted-foreground'
                }`}>
                  {signal.sentiment}
                </span>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">Score {signal.score}</span>
            </div>
            <div className="text-sm text-foreground mb-1.5">{signal.reason}</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {signal.tags.map((tag) => (
                <Chip key={tag} label={tag} />
              ))}
              <span className="text-xs text-muted-foreground">24h {fmtPct(signal.token.priceChange.h24)}</span>
              <span className="text-xs text-muted-foreground">Vol {fmtCompact(signal.token.volume.h24, { currency: true })}</span>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toast.success('Signal queued for alert review', {
                      description: `${marketPairLabel(signal.token)} can be pushed through the Telegram alert engine.`,
                    });
                  }}
                  className="text-xs text-accent font-bold hover:underline opacity-0 group-hover:opacity-100 transition"
                >
                  Review alert
                </button>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
