const MOCK_MARKETS = [
  {
    id: '1',
    emoji: '🐸',
    name: 'PEPEFUN',
    question: 'Will $PEPEFUN 2x in 24H?',
    category: 'Memecoin',
    volume: '12,845 BXBT',
    endsIn: '23h 14m',
    yes: 62,
    no: 38,
  },
  {
    id: '2',
    emoji: '◆',
    name: 'ETH',
    question: 'Will ETH hit $5,000 in May?',
    category: 'Crypto',
    volume: '9,231 BXBT',
    endsIn: '2d 11h',
    yes: 57,
    no: 43,
  },
  {
    id: '3',
    emoji: '₿',
    name: 'BTC',
    question: 'Will BTC break ATH in 30 days?',
    category: 'Crypto',
    volume: '7,880 BXBT',
    endsIn: '29d 5h',
    yes: 68,
    no: 32,
  },
  {
    id: '4',
    emoji: 'S',
    name: 'TAO',
    question: 'Will $TAO flip $NEAR by June?',
    category: 'AI',
    volume: '4,512 BXBT',
    endsIn: '1mo 10d',
    yes: 49,
    no: 51,
  },
  {
    id: '5',
    emoji: '⚪',
    name: 'BASE',
    question: 'Will BASE ecosystem TVL hit $5B?',
    category: 'Ecosystem',
    volume: '3,129 BXBT',
    endsIn: '7d 3h',
    yes: 71,
    no: 29,
  },
];

export default function MarketsTable({ onSelectToken }: { onSelectToken: (token: string) => void }) {
  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border bg-background text-sm">
        <span className="text-muted-foreground">48 Active Markets</span>
        <select className="bg-muted border border-border rounded px-2 py-1 text-sm text-foreground hover:bg-muted/80 cursor-pointer">
          <option>Sort: Hot</option>
          <option>Sort: New</option>
          <option>Sort: Volume</option>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto">
        {MOCK_MARKETS.map((market, idx) => (
          <div
            key={market.id}
            onClick={() => onSelectToken(market.name)}
            className={`flex flex-col sm:flex-row items-stretch sm:items-center px-2 py-1 sm:py-1.5 border-b border-border hover:bg-muted/50 cursor-pointer transition text-sm group gap-1 ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}
          >
            <div className="flex-1 flex flex-col justify-center gap-0.5 min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-lg">{market.emoji}</span>
                <span className="font-bold text-foreground text-sm">{market.name}</span>
                <span className="text-muted-foreground text-xs sm:text-sm">{market.category}</span>
              </div>
              <div className="text-muted-foreground text-xs sm:text-sm truncate">{market.question}</div>
            </div>

            <div className="hidden sm:flex items-center gap-2 px-1 sm:px-2 text-sm text-muted-foreground font-mono whitespace-nowrap">
              <span>{market.volume}</span>
              <span className="text-muted-foreground">•</span>
              <span>{market.endsIn}</span>
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5 ml-0 sm:ml-2 self-end sm:self-center">
              <div className="bg-secondary/10 border border-secondary/30 rounded px-1.5 sm:px-2 py-0.5 sm:py-1 flex flex-col items-center">
                <span className="font-bold text-secondary text-xs sm:text-sm">{market.yes}%</span>
                <span className="text-muted-foreground text-xs hidden sm:block">YES</span>
              </div>
              <div className="bg-destructive/10 border border-destructive/30 rounded px-1.5 sm:px-2 py-0.5 sm:py-1 flex flex-col items-center">
                <span className="font-bold text-destructive text-xs sm:text-sm">{market.no}%</span>
                <span className="text-muted-foreground text-xs hidden sm:block">NO</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
