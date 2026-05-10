import { useState } from 'react';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { CategoryChip, TrendingBadge } from '@/components/common/chips';
import { MarketsTableSkeleton } from '@/components/common/skeletons';
import { EmptyMarkets, EmptySearch } from '@/components/common/empty-states';
import { LoadError } from '@/components/common/error-states';
import { WatchlistModal } from '@/components/modals/watchlist-modal';

const MOCK_MARKETS = [
  { id: '1', emoji: '🐸', name: 'PEPEFUN', question: 'Will $PEPEFUN 2x in 24H?', category: 'Memecoin', volume: '12,845 BXBT', endsIn: '23h 14m', yes: 62, no: 38, trending: true },
  { id: '2', emoji: '◆', name: 'ETH', question: 'Will ETH hit $5,000 in May?', category: 'Crypto', volume: '9,231 BXBT', endsIn: '2d 11h', yes: 57, no: 43, trending: false },
  { id: '3', emoji: '₿', name: 'BTC', question: 'Will BTC break ATH in 30 days?', category: 'Crypto', volume: '7,880 BXBT', endsIn: '29d 5h', yes: 68, no: 32, trending: true },
  { id: '4', emoji: 'S', name: 'TAO', question: 'Will $TAO flip $NEAR by June?', category: 'AI', volume: '4,512 BXBT', endsIn: '1mo 10d', yes: 49, no: 51, trending: false },
  { id: '5', emoji: '⚪', name: 'BASE', question: 'Will BASE ecosystem TVL hit $5B?', category: 'Ecosystem', volume: '3,129 BXBT', endsIn: '7d 3h', yes: 71, no: 29, trending: false },
  { id: '6', emoji: '🤖', name: 'TAI', question: 'Will an AI agent hit $1B market cap?', category: 'AI', volume: '2,847 BXBT', endsIn: '14d 2h', yes: 44, no: 56, trending: true },
  { id: '7', emoji: '🌕', name: 'DOGE', question: 'Will DOGE reach $1 in 2025?', category: 'Memecoin', volume: '2,100 BXBT', endsIn: '8mo', yes: 38, no: 62, trending: false },
];

type SortKey = 'hot' | 'new' | 'volume';
type StateMode = 'loaded' | 'loading' | 'empty' | 'error' | 'no-results';

export default function MarketsTable({ onSelectToken }: { onSelectToken: (token: string) => void }) {
  const [sortBy, setSortBy] = useState<SortKey>('hot');
  const [search, setSearch] = useState('');
  const [stateMode, setStateMode] = useState<StateMode>('loaded');
  const [watchlistToken, setWatchlistToken] = useState<string | null>(null);

  const filtered = MOCK_MARKETS.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.question.toLowerCase().includes(search.toLowerCase())
  );

  const handleWatchlist = (e: React.MouseEvent, token: string) => {
    e.stopPropagation();
    setWatchlistToken(token);
  };

  if (stateMode === 'loading') {
    return (
      <div className="relative h-full">
        <MarketsTableSkeleton />
        <div className="absolute bottom-2 right-2">
          <button onClick={() => setStateMode('loaded')} className="text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1">
            Load data
          </button>
        </div>
      </div>
    );
  }

  if (stateMode === 'error') {
    return (
      <LoadError onRetry={() => setStateMode('loaded')} />
    );
  }

  if (stateMode === 'empty') {
    return (
      <EmptyMarkets onExplore={() => setStateMode('loaded')} />
    );
  }

  if (search && filtered.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border bg-background">
          <input
            type="text"
            placeholder="Search markets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button onClick={() => setSearch('')} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <EmptySearch onReset={() => setSearch('')} />
        </div>
      </div>
    );
  }

  return (
    <>
      <WatchlistModal
        open={!!watchlistToken}
        onOpenChange={(o) => !o && setWatchlistToken(null)}
        token={watchlistToken || undefined}
      />
      <div className="w-full h-full flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border bg-background text-sm shrink-0">
          <input
            type="text"
            placeholder="🔍 Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
          <span className="text-muted-foreground text-xs hidden sm:block">
            {filtered.length} markets
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="bg-muted border border-border rounded px-2 py-1 text-xs text-foreground hover:bg-muted/80 cursor-pointer"
          >
            <option value="hot">🔥 Hot</option>
            <option value="new">✨ New</option>
            <option value="volume">📊 Volume</option>
          </select>
          <button onClick={() => setStateMode('loading')} className="text-xs text-muted-foreground hover:text-foreground" title="Simulate loading">⟳</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.map((market, idx) => (
            <div
              key={market.id}
              onClick={() => onSelectToken(market.name)}
              className={`flex flex-col sm:flex-row items-stretch sm:items-center px-2 py-1.5 border-b border-border hover:bg-muted/50 cursor-pointer transition text-sm group gap-1 ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}
            >
              <div className="flex-1 flex flex-col justify-center gap-0.5 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-lg">{market.emoji}</span>
                  <span className="font-bold text-foreground text-sm">{market.name}</span>
                  <CategoryChip category={market.category} />
                  {market.trending && <TrendingBadge />}
                </div>
                <div className="text-muted-foreground text-xs truncate">{market.question}</div>
              </div>

              <div className="hidden sm:flex items-center gap-2 px-2 text-xs text-muted-foreground font-mono whitespace-nowrap">
                <span>{market.volume}</span>
                <span>•</span>
                <span>{market.endsIn}</span>
              </div>

              <div className="flex items-center gap-1.5 ml-0 sm:ml-2 self-end sm:self-center">
                <button
                  onClick={(e) => handleWatchlist(e, market.name)}
                  className="opacity-0 group-hover:opacity-100 transition p-1 hover:text-yellow-400 text-muted-foreground"
                  title="Add to watchlist"
                >
                  <Star size={13} />
                </button>
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
    </>
  );
}
