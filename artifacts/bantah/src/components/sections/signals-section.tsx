const MOCK_SIGNALS = [
  {
    id: '1',
    platform: 'Polymarket',
    icon: '🎲',
    description: 'Will SOL hit $200 in May?',
    tags: ['Momentum', 'Whale Accumulation', 'High Volume'],
    traders: '2.1K traders',
    volume: 'Vol. $1.2M',
    sentiment: 'Bullish',
  },
  {
    id: '2',
    platform: 'predict.fun',
    icon: '🔮',
    description: 'Will Trump win 2024 election?',
    tags: ['Political'],
    traders: '1.4K traders',
    volume: 'Vol. $860K',
    sentiment: null,
  },
  {
    id: '3',
    platform: 'LIMITLESS',
    icon: '♾️',
    description: 'Will AI agents outperform BTC in 2024?',
    tags: ['AI', 'Tech'],
    traders: '987 traders',
    volume: 'Vol. $420K',
    sentiment: 'Bullish',
  },
  {
    id: '4',
    platform: 'Manifold',
    icon: '📈',
    description: 'Will BASE TVL surpass Arbitrum by Q3?',
    tags: ['Ecosystem', 'L2'],
    traders: '763 traders',
    volume: 'Vol. $310K',
    sentiment: 'Bullish',
  },
];

export default function SignalsSection() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-border bg-background px-2 py-1.5">
        <div className="text-sm font-bold text-foreground mb-0.5">📡 TOP SIGNALS</div>
        <div className="text-sm text-muted-foreground">Trending platforms - Create market</div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1.5">
        <div className="space-y-1.5">
          {MOCK_SIGNALS.map((signal) => (
            <div key={signal.id} className="bg-muted/30 border border-border/50 rounded px-2 py-1.5 hover:border-accent hover:bg-muted/50 transition cursor-pointer group">
              <div className="flex items-start justify-between gap-1.5 mb-0.5">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="text-base">{signal.icon}</span>
                  <div className="text-sm font-bold text-foreground">{signal.platform}</div>
                  {signal.sentiment && (
                    <span className="text-sm text-secondary font-bold">▲ {signal.sentiment}</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{signal.volume}</span>
              </div>
              <div className="text-sm text-foreground mb-1">{signal.description}</div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {signal.tags.map((tag) => (
                  <span key={tag} className="text-xs bg-muted border border-border rounded px-1.5 py-0.5 text-muted-foreground">
                    {tag}
                  </span>
                ))}
                <span className="text-xs text-muted-foreground ml-auto">{signal.traders}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
