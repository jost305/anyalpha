import { useState } from 'react';
import { Star, Filter, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { WatchlistModal } from '@/components/modals/watchlist-modal';
import { MarketsTableSkeleton } from '@/components/common/skeletons';
import { EmptySearch } from '@/components/common/empty-states';
import { LoadError } from '@/components/common/error-states';

interface Market {
  id: string;
  rank: number;
  emoji: string;
  name: string;
  pair: string;
  chain: string;
  chainColor: string;
  price: string;
  mcap: string;
  age: string;
  security: number;
  audited: boolean;
  locked: number;
  m5: number;
  h1: number;
  h6: number;
  h24: number;
  liq: string;
  txn: string;
  vol: string;
  holders: string;
  netBuy: number;
  watchlisted?: boolean;
}

const MOCK_MARKETS: Market[] = [
  { id: '1', rank: 1, emoji: '🐸', name: 'PEPEFUN', pair: 'PEPE/SOL', chain: 'SOL', chainColor: '#9945FF', price: '$0.00001248', mcap: '$12.4M', age: '3d', security: 82, audited: true, locked: 92, m5: 2.1, h1: -4.3, h6: 8.7, h24: -14.5, liq: '$375K', txn: '1,552', vol: '$986K', holders: '2,841', netBuy: 68 },
  { id: '2', rank: 2, emoji: '🤖', name: 'AIGEN', pair: 'AIGEN/ETH', chain: 'ETH', chainColor: '#627EEA', price: '$0.005183', mcap: '$5.21M', age: '1y', security: 66, audited: false, locked: 16, m5: -0.5, h1: 0.2, h6: 7.7, h24: -14.5, liq: '$375K', txn: '1,552', vol: '$986K', holders: '112', netBuy: 45 },
  { id: '3', rank: 3, emoji: '⚡', name: 'BOLTAI', pair: 'BOLTAI/SOL', chain: 'SOL', chainColor: '#9945FF', price: '$0.005288', mcap: '$532K', age: '17h', security: 76, audited: true, locked: 0, m5: 0.7, h1: -13.0, h6: 8.1, h24: 1333.5, liq: '$73.5K', txn: '83,263', vol: '$8.7M', holders: '3,286', netBuy: 71 },
  { id: '4', rank: 4, emoji: '🎭', name: 'CHAOS', pair: 'CHAOS/WETH', chain: 'BASE', chainColor: '#0052FF', price: '$0.006912', mcap: '$691K', age: '26d', security: 81, audited: true, locked: 21, m5: 0.0, h1: -9.7, h6: 41.7, h24: 211.0, liq: '$303.9K', txn: '9,032', vol: '$2.2M', holders: '1,659', netBuy: 38 },
  { id: '5', rank: 5, emoji: '🌕', name: 'LUNA2', pair: 'LUNA2/SOL', chain: 'SOL', chainColor: '#9945FF', price: '$0.003622', mcap: '$3.84M', age: '6d', security: 85, audited: true, locked: 11, m5: -0.3, h1: -3.5, h6: 15.2, h24: -3.0, liq: '$261.9K', txn: '24,385', vol: '$3M', holders: '18,091', netBuy: 52 },
  { id: '6', rank: 6, emoji: '💧', name: 'SWEAT', pair: 'SWEAT/USDC', chain: 'SOL', chainColor: '#9945FF', price: '$0.002296', mcap: '$19.62M', age: '3y', security: 82, audited: true, locked: 80, m5: -4.2, h1: 4.9, h6: 42.5, h24: 356.3, liq: '$555.4K', txn: '1,950', vol: '$1.8M', holders: '5,038', netBuy: 61 },
  { id: '7', rank: 7, emoji: '🦊', name: 'FOXAI', pair: 'FOXAI/SOL', chain: 'SOL', chainColor: '#9945FF', price: '$0.003451', mcap: '$33.17M', age: '2y', security: 88, audited: true, locked: 30, m5: -0.5, h1: -2.5, h6: -2.7, h24: 28.0, liq: '$1.8M', txn: '23,153', vol: '$3.9M', holders: '80,635', netBuy: 44 },
  { id: '8', rank: 8, emoji: '🔮', name: 'ORACLE', pair: 'ORACLE/ETH', chain: 'ETH', chainColor: '#627EEA', price: '$0.5028', mcap: '$5.03M', age: '10h', security: 75, audited: false, locked: 20, m5: 4.9, h1: -4.0, h6: 23.0, h24: 10.7, liq: '$834.1K', txn: '10,169', vol: '$9M', holders: '1,848', netBuy: 56 },
  { id: '9', rank: 9, emoji: '🐉', name: 'DRGN', pair: 'DRGN/WETH', chain: 'ARB', chainColor: '#12AAFF', price: '$0.03824', mcap: '$2.52B', age: '4y', security: 91, audited: true, locked: 29, m5: 0.3, h1: 1.6, h6: 1.4, h24: 9.0, liq: '$16.8M', txn: '780', vol: '$4.5M', holders: '384,903', netBuy: 62 },
  { id: '10', rank: 10, emoji: '🎯', name: 'BANTAH', pair: 'BANTAH/SOL', chain: 'SOL', chainColor: '#9945FF', price: '$0.001337', mcap: '$8.9M', age: '5d', security: 79, audited: true, locked: 55, m5: 1.4, h1: 6.2, h6: 18.4, h24: 47.2, liq: '$512K', txn: '4,821', vol: '$2.1M', holders: '9,234', netBuy: 74 },
  { id: '11', rank: 11, emoji: '⚽', name: 'BALL', pair: 'BALL/SOL', chain: 'SOL', chainColor: '#9945FF', price: '$0.000421', mcap: '$420K', age: '1d', security: 61, audited: false, locked: 0, m5: 8.2, h1: 22.1, h6: 67.4, h24: 491.0, liq: '$89K', txn: '12,400', vol: '$341K', holders: '503', netBuy: 88 },
  { id: '12', rank: 12, emoji: '🏦', name: 'DEFAI', pair: 'DEFAI/BASE', chain: 'BASE', chainColor: '#0052FF', price: '$0.00782', mcap: '$7.1M', age: '14d', security: 77, audited: true, locked: 42, m5: -1.1, h1: -0.8, h6: 3.3, h24: 12.1, liq: '$298K', txn: '6,712', vol: '$1.4M', holders: '4,511', netBuy: 53 },
];

function pct(v: number) {
  const color = v > 0 ? 'text-secondary' : v < 0 ? 'text-destructive' : 'text-muted-foreground';
  const prefix = v > 0 ? '+' : '';
  return <span className={`${color} font-mono tabular-nums`}>{prefix}{v.toFixed(1)}%</span>;
}

function SecurityBar({ score, audited }: { score: number; audited: boolean }) {
  const color = score >= 80 ? 'bg-secondary' : score >= 60 ? 'bg-yellow-400' : 'bg-destructive';
  return (
    <div className="flex items-center gap-1">
      <div className="w-10 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{score}</span>
      {audited && <span className="text-secondary text-xs">✓</span>}
    </div>
  );
}

function NetBar({ netBuy }: { netBuy: number }) {
  const buy = netBuy;
  const sell = 100 - netBuy;
  return (
    <div className="flex h-1.5 w-12 rounded-full overflow-hidden">
      <div className="bg-secondary" style={{ width: `${buy}%` }} />
      <div className="bg-destructive" style={{ width: `${sell}%` }} />
    </div>
  );
}

type SortKey = 'trending' | 'new' | 'gainers' | 'volume';
type StateMode = 'loaded' | 'loading' | 'error';

const CHAIN_FILTERS = ['All Chains', 'SOL', 'ETH', 'BASE', 'ARB'];
const SORT_OPTIONS: { key: SortKey; label: string; icon: string }[] = [
  { key: 'trending', label: 'Trending', icon: '🔥' },
  { key: 'new', label: 'New', icon: '✨' },
  { key: 'gainers', label: 'Top Gainers', icon: '📈' },
  { key: 'volume', label: 'Volume', icon: '💹' },
];

export default function MarketsTable({ onSelectToken }: { onSelectToken: (token: string) => void }) {
  const [sortBy, setSortBy] = useState<SortKey>('trending');
  const [search, setSearch] = useState('');
  const [chain, setChain] = useState('All Chains');
  const [stateMode, setStateMode] = useState<StateMode>('loaded');
  const [watchlistToken, setWatchlistToken] = useState<string | null>(null);
  const [watchlisted, setWatchlisted] = useState<Set<string>>(new Set());

  let rows = MOCK_MARKETS.filter((m) => {
    const matchChain = chain === 'All Chains' || m.chain === chain;
    const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.pair.toLowerCase().includes(search.toLowerCase());
    return matchChain && matchSearch;
  });

  if (sortBy === 'gainers') rows = [...rows].sort((a, b) => b.h24 - a.h24);
  if (sortBy === 'volume') rows = [...rows].sort((a, b) => parseFloat(b.vol.replace(/[$KMB]/g, '')) - parseFloat(a.vol.replace(/[$KMB]/g, '')));
  if (sortBy === 'new') rows = [...rows].sort((a) => a.age.includes('h') || a.age.includes('d') ? -1 : 1);

  if (stateMode === 'loading') return <div className="relative h-full"><MarketsTableSkeleton /><button onClick={() => setStateMode('loaded')} className="absolute bottom-3 right-3 text-xs border border-border rounded px-2 py-1 text-muted-foreground hover:text-foreground">Load data</button></div>;
  if (stateMode === 'error') return <LoadError onRetry={() => setStateMode('loaded')} />;

  const toggleWatchlist = (e: React.MouseEvent, market: Market) => {
    e.stopPropagation();
    if (watchlisted.has(market.id)) {
      setWatchlisted((s) => { const n = new Set(s); n.delete(market.id); return n; });
      toast.info('Removed from watchlist', { description: `${market.pair} removed.` });
    } else {
      setWatchlistToken(market.name);
      setWatchlisted((s) => new Set(s).add(market.id));
    }
  };

  return (
    <>
      <WatchlistModal open={!!watchlistToken} onOpenChange={(o) => !o && setWatchlistToken(null)} token={watchlistToken || undefined} />

      <div className="flex flex-col h-full overflow-hidden">
        {/* Toolbar */}
        <div className="shrink-0 border-b border-border bg-background">
          <div className="flex items-center gap-1.5 px-2 py-1.5 flex-wrap">
            {SORT_OPTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSortBy(s.key)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold border transition ${
                  sortBy === s.key
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                }`}
              >
                <span>{s.icon}</span> {s.label}
              </button>
            ))}
            <div className="h-4 w-px bg-border mx-0.5" />
            {CHAIN_FILTERS.map((c) => (
              <button
                key={c}
                onClick={() => setChain(c)}
                className={`px-2 py-1 rounded text-xs border transition ${
                  chain === c
                    ? 'bg-accent/10 border-accent text-accent'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                }`}
              >
                {c}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1.5">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-muted border border-border rounded px-2 py-1 text-xs outline-none focus:border-primary w-28 placeholder:text-muted-foreground"
                />
              </div>
              <button className="p-1 border border-border rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"><Filter size={13} /></button>
              <button onClick={() => setStateMode('loading')} className="p-1 border border-border rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"><RefreshCw size={13} /></button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {rows.length === 0 ? (
            <EmptySearch onReset={() => setSearch('')} />
          ) : (
            <table className="w-full text-xs border-collapse min-w-[800px]">
              <thead className="sticky top-0 bg-background border-b border-border z-10">
                <tr className="text-muted-foreground text-left">
                  <th className="w-8 px-2 py-1.5 font-medium">#</th>
                  <th className="px-2 py-1.5 font-medium min-w-[160px]">Pool</th>
                  <th className="px-2 py-1.5 font-medium text-right whitespace-nowrap">MCAP / Price</th>
                  <th className="px-2 py-1.5 font-medium text-right">Age</th>
                  <th className="px-2 py-1.5 font-medium whitespace-nowrap">Security</th>
                  <th className="px-2 py-1.5 font-medium text-right">5m</th>
                  <th className="px-2 py-1.5 font-medium text-right">1h</th>
                  <th className="px-2 py-1.5 font-medium text-right">6h</th>
                  <th className="px-2 py-1.5 font-medium text-right">24h</th>
                  <th className="px-2 py-1.5 font-medium text-right">Liq</th>
                  <th className="px-2 py-1.5 font-medium text-right">TXN</th>
                  <th className="px-2 py-1.5 font-medium text-right">Vol</th>
                  <th className="px-2 py-1.5 font-medium text-right">Holders</th>
                  <th className="px-2 py-1.5 font-medium text-center">Net</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => onSelectToken(m.name)}
                    className="border-b border-border/50 hover:bg-muted/40 cursor-pointer transition group"
                  >
                    <td className="px-2 py-1.5 text-muted-foreground font-mono tabular-nums">{m.rank}</td>

                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => toggleWatchlist(e, m)}
                          className={`transition shrink-0 ${watchlisted.has(m.id) ? 'text-yellow-400' : 'text-muted-foreground opacity-0 group-hover:opacity-100'}`}
                        >
                          <Star size={11} fill={watchlisted.has(m.id) ? 'currentColor' : 'none'} />
                        </button>
                        <div className="relative shrink-0">
                          <span className="text-xl leading-none">{m.emoji}</span>
                          <span
                            className="absolute -bottom-0.5 -right-1 text-[8px] font-bold px-0.5 rounded leading-tight"
                            style={{ backgroundColor: m.chainColor, color: '#fff' }}
                          >
                            {m.chain}
                          </span>
                        </div>
                        <div>
                          <div className="font-bold text-foreground leading-tight">{m.pair}</div>
                          <div className="text-muted-foreground leading-tight truncate max-w-[120px]">{m.name}</div>
                        </div>
                      </div>
                    </td>

                    <td className="px-2 py-1.5 text-right">
                      <div className="font-bold text-foreground font-mono tabular-nums">{m.mcap}</div>
                      <div className="text-muted-foreground font-mono tabular-nums">{m.price}</div>
                    </td>

                    <td className="px-2 py-1.5 text-right text-muted-foreground">{m.age}</td>

                    <td className="px-2 py-1.5">
                      <SecurityBar score={m.security} audited={m.audited} />
                    </td>

                    <td className="px-2 py-1.5 text-right">{pct(m.m5)}</td>
                    <td className="px-2 py-1.5 text-right">{pct(m.h1)}</td>
                    <td className="px-2 py-1.5 text-right">{pct(m.h6)}</td>
                    <td className="px-2 py-1.5 text-right">{pct(m.h24)}</td>

                    <td className="px-2 py-1.5 text-right font-mono text-muted-foreground tabular-nums">{m.liq}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-muted-foreground tabular-nums">{m.txn}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-muted-foreground tabular-nums">{m.vol}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-muted-foreground tabular-nums">{m.holders}</td>

                    <td className="px-2 py-1.5">
                      <div className="flex justify-center">
                        <NetBar netBuy={m.netBuy} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border bg-background px-3 py-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{rows.length} pools</span>
          <div className="flex items-center gap-3">
            <span>Showing {Math.min(rows.length, 50)} of {MOCK_MARKETS.length}</span>
            <div className="flex items-center gap-1">
              <button className="px-1.5 py-0.5 border border-border rounded hover:bg-muted transition">‹</button>
              <span className="px-1.5 py-0.5 bg-primary/10 border border-primary rounded text-primary font-bold">1</span>
              <button className="px-1.5 py-0.5 border border-border rounded hover:bg-muted transition">›</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
