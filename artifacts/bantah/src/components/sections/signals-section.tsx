import { useState } from 'react';
import { toast } from 'sonner';
import { Chip } from '@/components/common/chips';
import { SignalsSkeleton } from '@/components/common/skeletons';
import { EmptySignals } from '@/components/common/empty-states';
import { NetworkError } from '@/components/common/error-states';

const MOCK_SIGNALS = [
  { id: '1', platform: 'Polymarket', icon: '🎲', description: 'Will SOL hit $200 in May?', tags: ['Momentum', 'Whale Accumulation', 'High Volume'], traders: '2.1K traders', volume: 'Vol. $1.2M', sentiment: 'Bullish' },
  { id: '2', platform: 'predict.fun', icon: '🔮', description: 'Will Trump win 2024 election?', tags: ['Political'], traders: '1.4K traders', volume: 'Vol. $860K', sentiment: null },
  { id: '3', platform: 'LIMITLESS', icon: '♾️', description: 'Will AI agents outperform BTC in 2024?', tags: ['AI', 'Tech'], traders: '987 traders', volume: 'Vol. $420K', sentiment: 'Bullish' },
  { id: '4', platform: 'Manifold', icon: '📈', description: 'Will BASE TVL surpass Arbitrum by Q3?', tags: ['Ecosystem', 'L2'], traders: '763 traders', volume: 'Vol. $310K', sentiment: 'Bullish' },
];

type StateMode = 'loaded' | 'loading' | 'empty' | 'error';

export default function SignalsSection() {
  const [stateMode, setStateMode] = useState<StateMode>('loaded');

  if (stateMode === 'loading') {
    return (
      <div className="relative h-full">
        <SignalsSkeleton />
        <button onClick={() => setStateMode('loaded')} className="absolute bottom-2 right-2 text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1">
          Load data
        </button>
      </div>
    );
  }
  if (stateMode === 'error') return <NetworkError onRetry={() => setStateMode('loaded')} />;
  if (stateMode === 'empty') return <EmptySignals />;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-border bg-background px-2 py-1.5 flex items-center justify-between shrink-0">
        <div>
          <div className="text-sm font-bold text-foreground">📡 TOP SIGNALS</div>
          <div className="text-xs text-muted-foreground">Trending platforms - Create market</div>
        </div>
        <button onClick={() => setStateMode('loading')} className="text-xs text-muted-foreground hover:text-foreground" title="Simulate loading">⟳</button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1.5">
        {MOCK_SIGNALS.map((signal) => (
          <div
            key={signal.id}
            className="bg-muted/30 border border-border/50 rounded px-2 py-1.5 hover:border-accent hover:bg-muted/50 transition cursor-pointer group"
          >
            <div className="flex items-start justify-between gap-1.5 mb-0.5">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="text-base">{signal.icon}</span>
                <div className="text-sm font-bold text-foreground">{signal.platform}</div>
                {signal.sentiment && (
                  <span className="text-xs text-secondary font-bold">▲ {signal.sentiment}</span>
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{signal.volume}</span>
            </div>
            <div className="text-sm text-foreground mb-1.5">{signal.description}</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {signal.tags.map((tag) => (
                <Chip key={tag} label={tag} />
              ))}
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{signal.traders}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toast.success('Market created', {
                      description: `"${signal.description}" added to your markets.`,
                    });
                  }}
                  className="text-xs text-accent font-bold hover:underline opacity-0 group-hover:opacity-100 transition"
                >
                  + Create
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
