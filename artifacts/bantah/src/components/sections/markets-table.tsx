import { useState, useEffect, useRef, useCallback } from 'react';
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
  price: number;
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
  txn: number;
  vol: string;
  holders: string;
  netBuy: number;
}

type FlashDir = 'up' | 'down' | null;
type FlashMap = Record<string, { price?: FlashDir; m5?: FlashDir; h1?: FlashDir; h6?: FlashDir; h24?: FlashDir; netBuy?: FlashDir }>;

const BASE_MARKETS: Market[] = [
  { id: '1',  rank: 1,  emoji: '🐸', name: 'PEPEFUN', pair: 'PEPE/SOL',    chain: 'SOL',  chainColor: '#9945FF', price: 0.00001248, mcap: '$12.4M',  age: '3d',  security: 82, audited: true,  locked: 92, m5: 2.1,   h1: -4.3,  h6: 8.7,   h24: -14.5, liq: '$375K',   txn: 1552,  vol: '$986K',  holders: '2,841',   netBuy: 68 },
  { id: '2',  rank: 2,  emoji: '🤖', name: 'AIGEN',   pair: 'AIGEN/ETH',   chain: 'ETH',  chainColor: '#627EEA', price: 0.005183,  mcap: '$5.21M',  age: '1y',  security: 66, audited: false, locked: 16, m5: -0.5,  h1: 0.2,   h6: 7.7,   h24: -14.5, liq: '$375K',   txn: 1552,  vol: '$986K',  holders: '112',      netBuy: 45 },
  { id: '3',  rank: 3,  emoji: '⚡', name: 'BOLTAI',  pair: 'BOLTAI/SOL',  chain: 'SOL',  chainColor: '#9945FF', price: 0.005288,  mcap: '$532K',   age: '17h', security: 76, audited: true,  locked: 0,  m5: 0.7,   h1: -13.0, h6: 8.1,   h24: 1333.5, liq: '$73.5K', txn: 83263, vol: '$8.7M',  holders: '3,286',   netBuy: 71 },
  { id: '4',  rank: 4,  emoji: '🎭', name: 'CHAOS',   pair: 'CHAOS/WETH',  chain: 'BASE', chainColor: '#0052FF', price: 0.006912,  mcap: '$691K',   age: '26d', security: 81, audited: true,  locked: 21, m5: 0.0,   h1: -9.7,  h6: 41.7,  h24: 211.0,  liq: '$303.9K', txn: 9032,  vol: '$2.2M',  holders: '1,659',   netBuy: 38 },
  { id: '5',  rank: 5,  emoji: '🌕', name: 'LUNA2',   pair: 'LUNA2/SOL',   chain: 'SOL',  chainColor: '#9945FF', price: 0.003622,  mcap: '$3.84M',  age: '6d',  security: 85, audited: true,  locked: 11, m5: -0.3,  h1: -3.5,  h6: 15.2,  h24: -3.0,   liq: '$261.9K', txn: 24385, vol: '$3M',    holders: '18,091',  netBuy: 52 },
  { id: '6',  rank: 6,  emoji: '💧', name: 'SWEAT',   pair: 'SWEAT/USDC',  chain: 'SOL',  chainColor: '#9945FF', price: 0.002296,  mcap: '$19.62M', age: '3y',  security: 82, audited: true,  locked: 80, m5: -4.2,  h1: 4.9,   h6: 42.5,  h24: 356.3,  liq: '$555.4K', txn: 1950,  vol: '$1.8M',  holders: '5,038',   netBuy: 61 },
  { id: '7',  rank: 7,  emoji: '🦊', name: 'FOXAI',   pair: 'FOXAI/SOL',   chain: 'SOL',  chainColor: '#9945FF', price: 0.003451,  mcap: '$33.17M', age: '2y',  security: 88, audited: true,  locked: 30, m5: -0.5,  h1: -2.5,  h6: -2.7,  h24: 28.0,   liq: '$1.8M',   txn: 23153, vol: '$3.9M',  holders: '80,635',  netBuy: 44 },
  { id: '8',  rank: 8,  emoji: '🔮', name: 'ORACLE',  pair: 'ORACLE/ETH',  chain: 'ETH',  chainColor: '#627EEA', price: 0.5028,    mcap: '$5.03M',  age: '10h', security: 75, audited: false, locked: 20, m5: 4.9,   h1: -4.0,  h6: 23.0,  h24: 10.7,   liq: '$834.1K', txn: 10169, vol: '$9M',    holders: '1,848',   netBuy: 56 },
  { id: '9',  rank: 9,  emoji: '🐉', name: 'DRGN',    pair: 'DRGN/WETH',   chain: 'ARB',  chainColor: '#12AAFF', price: 0.03824,   mcap: '$2.52B',  age: '4y',  security: 91, audited: true,  locked: 29, m5: 0.3,   h1: 1.6,   h6: 1.4,   h24: 9.0,    liq: '$16.8M',  txn: 780,   vol: '$4.5M',  holders: '384,903', netBuy: 62 },
  { id: '10', rank: 10, emoji: '🎯', name: 'BANTAH',  pair: 'BANTAH/SOL',  chain: 'SOL',  chainColor: '#9945FF', price: 0.001337,  mcap: '$8.9M',   age: '5d',  security: 79, audited: true,  locked: 55, m5: 1.4,   h1: 6.2,   h6: 18.4,  h24: 47.2,   liq: '$512K',   txn: 4821,  vol: '$2.1M',  holders: '9,234',   netBuy: 74 },
  { id: '11', rank: 11, emoji: '⚽', name: 'BALL',    pair: 'BALL/SOL',    chain: 'SOL',     chainColor: '#9945FF', price: 0.000421,  mcap: '$420K',   age: '1d',  security: 61, audited: false, locked: 0,  m5: 8.2,   h1: 22.1,  h6: 67.4,  h24: 491.0,  liq: '$89K',    txn: 12400, vol: '$341K',  holders: '503',      netBuy: 88 },
  { id: '12', rank: 12, emoji: '🏦', name: 'DEFAI',   pair: 'DEFAI/BASE',  chain: 'BASE',    chainColor: '#0052FF', price: 0.00782,   mcap: '$7.1M',   age: '14d', security: 77, audited: true,  locked: 42, m5: -1.1,  h1: -0.8,  h6: 3.3,   h24: 12.1,   liq: '$298K',   txn: 6712,  vol: '$1.4M',  holders: '4,511',   netBuy: 53 },
  { id: '13', rank: 13, emoji: '🟣', name: 'NADS',    pair: 'NADS/MON',    chain: 'MONAD',   chainColor: '#836EF9', price: 0.00421,   mcap: '$2.1M',   age: '2d',  security: 74, audited: true,  locked: 31, m5: 3.2,   h1: 11.4,  h6: 28.1,  h24: 82.4,   liq: '$142K',   txn: 8241,  vol: '$892K',  holders: '1,842',   netBuy: 77 },
  { id: '14', rank: 14, emoji: '🔶', name: 'GIGA',    pair: 'GIGA/MON',    chain: 'MONAD',   chainColor: '#836EF9', price: 0.001882,  mcap: '$941K',   age: '18h', security: 68, audited: false, locked: 0,  m5: 6.8,   h1: 19.2,  h6: 44.1,  h24: 141.2,  liq: '$88K',    txn: 14821, vol: '$514K',  holders: '821',      netBuy: 82 },
  { id: '15', rank: 15, emoji: '🌀', name: 'MEGAB',   pair: 'MEGAB/ETH',   chain: 'MEGAETH', chainColor: '#FF4F00', price: 0.00312,   mcap: '$1.56M',  age: '5d',  security: 71, audited: true,  locked: 18, m5: -2.1,  h1: 5.4,   h6: 12.8,  h24: 33.7,   liq: '$112K',   txn: 5421,  vol: '$423K',  holders: '2,104',   netBuy: 61 },
  { id: '16', rank: 16, emoji: '📜', name: 'RUNE',    pair: 'RUNE/ETH',    chain: 'SCROLL',  chainColor: '#EBC28E', price: 0.00891,   mcap: '$4.46M',  age: '21d', security: 80, audited: true,  locked: 55, m5: 0.4,   h1: -1.2,  h6: 7.1,   h24: 18.9,   liq: '$224K',   txn: 3812,  vol: '$781K',  holders: '3,241',   netBuy: 58 },
  { id: '17', rank: 17, emoji: '💎', name: 'DOGS',    pair: 'DOGS/TON',    chain: 'TON',     chainColor: '#0098EA', price: 0.000082,  mcap: '$8.2M',   age: '3mo', security: 78, audited: true,  locked: 40, m5: 1.1,   h1: 3.8,   h6: 9.2,   h24: 24.1,   liq: '$521K',   txn: 22841, vol: '$2.4M',  holders: '84,521',  netBuy: 64 },
  { id: '18', rank: 18, emoji: '🐈', name: 'PURR',    pair: 'PURR/HYPE',   chain: 'HYPE',    chainColor: '#3CFFBE', price: 0.02841,   mcap: '$14.2M',  age: '8d',  security: 82, audited: true,  locked: 25, m5: -0.8,  h1: 2.1,   h6: 14.2,  h24: 41.8,   liq: '$682K',   txn: 9124,  vol: '$1.8M',  holders: '12,841',  netBuy: 68 },
  { id: '19', rank: 19, emoji: '🐕', name: 'BABYDOGE', pair: 'BABYDOGE/BNB', chain: 'BSC',   chainColor: '#F3BA2F', price: 0.0000000024, mcap: '$42.1M', age: '4y', security: 72, audited: true, locked: 60, m5: 0.2,   h1: -2.4,  h6: 5.8,   h24: 11.4,   liq: '$2.1M',   txn: 41820, vol: '$5.2M',  holders: '842,100', netBuy: 55 },
  { id: '20', rank: 20, emoji: '🦁', name: 'SAFU',    pair: 'SAFU/BNB',    chain: 'BSC',     chainColor: '#F3BA2F', price: 0.000182,  mcap: '$1.82M',  age: '11d', security: 65, audited: false, locked: 8,  m5: 4.1,   h1: 9.8,   h6: 21.4,  h24: 58.2,   liq: '$184K',   txn: 18421, vol: '$1.1M',  holders: '5,821',   netBuy: 72 },
];

function fmtPrice(p: number) {
  if (p < 0.0001) return '$' + p.toFixed(8);
  if (p < 0.01)   return '$' + p.toFixed(6);
  if (p < 1)      return '$' + p.toFixed(4);
  return '$' + p.toFixed(2);
}

function fmtTxn(n: number) {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);
}

function Pct({ v, flash }: { v: number; flash?: FlashDir }) {
  const color = v > 0 ? 'text-secondary' : v < 0 ? 'text-destructive' : 'text-muted-foreground';
  const prefix = v > 0 ? '+' : '';
  const anim = flash === 'up' ? 'flash-up-text' : flash === 'down' ? 'flash-down-text' : '';
  return (
    <span key={flash} className={`${color} font-mono tabular-nums ${anim}`}>
      {prefix}{v.toFixed(1)}%
    </span>
  );
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
  return (
    <div className="flex h-1.5 w-12 rounded-full overflow-hidden">
      <div className="bg-secondary transition-all duration-700" style={{ width: `${netBuy}%` }} />
      <div className="bg-destructive transition-all duration-700" style={{ width: `${100 - netBuy}%` }} />
    </div>
  );
}

type SortKey = 'trending' | 'new' | 'gainers' | 'volume';
type StateMode = 'loaded' | 'loading' | 'error';

const CHAIN_CONFIG = [
  { key: 'All Chains', label: 'All Chains', logo: '',                                                                                                          color: '#6b7280' },
  { key: 'SOL',        label: 'SOL',        logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',              color: '#9945FF' },
  { key: 'ETH',        label: 'ETH',        logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',            color: '#627EEA' },
  { key: 'BASE',       label: 'BASE',       logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png',               color: '#0052FF' },
  { key: 'ARB',        label: 'ARB',        logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',            color: '#12AAFF' },
  { key: 'MONAD',      label: 'Monad',      logo: 'https://github.com/monad-xyz.png?size=28',                                                                  color: '#836EF9' },
  { key: 'MEGAETH',    label: 'megaETH',    logo: 'https://github.com/megaeth-labs.png?size=28',                                                               color: '#FF4F00' },
  { key: 'SCROLL',     label: 'Scroll',     logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/scroll/info/logo.png',              color: '#EBC28E' },
  { key: 'TON',        label: 'TON',        logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ton/info/logo.png',                 color: '#0098EA' },
  { key: 'HYPE',       label: 'Hyperliquid',logo: 'https://github.com/hyperliquid-dex.png?size=28',                                                            color: '#3CFFBE' },
  { key: 'BSC',        label: 'BSC',        logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png',          color: '#F3BA2F' },
];
const CHAIN_MAP = Object.fromEntries(CHAIN_CONFIG.map(c => [c.key, c]));

const SORT_OPTIONS: { key: SortKey; label: string; icon: string }[] = [
  { key: 'trending', label: 'Trending', icon: '🔥' },
  { key: 'new',      label: 'New',      icon: '✨' },
  { key: 'gainers',  label: 'Top Gainers', icon: '📈' },
  { key: 'volume',   label: 'Volume',   icon: '💹' },
];

export default function MarketsTable({ onSelectToken }: { onSelectToken: (token: string) => void }) {
  const [markets, setMarkets] = useState<Market[]>(BASE_MARKETS);
  const [flashes, setFlashes] = useState<FlashMap>({});
  const prevRef = useRef<Record<string, Market>>({});

  const [sortBy, setSortBy] = useState<SortKey>('trending');
  const [search, setSearch] = useState('');
  const [chain, setChain] = useState('All Chains');
  const [stateMode, setStateMode] = useState<StateMode>('loaded');
  const [watchlistToken, setWatchlistToken] = useState<string | null>(null);
  const [watchlisted, setWatchlisted] = useState<Set<string>>(new Set());

  // Initialise prev ref
  useEffect(() => {
    BASE_MARKETS.forEach((m) => { prevRef.current[m.id] = { ...m }; });
  }, []);

  // Live tick — update 3-5 random rows every 1.2s
  useEffect(() => {
    const tick = () => {
      setMarkets((prev) => {
        const next = prev.map((m) => ({ ...m }));
        const count = 3 + Math.floor(Math.random() * 3);
        const indices = [...Array(next.length).keys()].sort(() => Math.random() - 0.5).slice(0, count);

        const newFlashes: FlashMap = {};

        indices.forEach((i) => {
          const m = next[i];
          const priceDelta = m.price * (Math.random() * 0.006 - 0.003);
          const newPrice   = Math.max(m.price * 0.5, m.price + priceDelta);
          const m5Delta    = (Math.random() - 0.48) * 0.8;
          const h1Delta    = (Math.random() - 0.5)  * 0.3;
          const h6Delta    = (Math.random() - 0.5)  * 0.2;
          const h24Delta   = (Math.random() - 0.5)  * 0.15;
          const netBuyNew  = Math.min(95, Math.max(5, m.netBuy + (Math.random() - 0.5) * 6));
          const txnDelta   = Math.floor((Math.random() - 0.3) * 12);

          const prev = prevRef.current[m.id];
          const dir  = (field: number, newVal: number): FlashDir =>
            newVal > field ? 'up' : newVal < field ? 'down' : null;

          newFlashes[m.id] = {
            price:  dir(prev.price,  newPrice),
            m5:     dir(prev.m5,     m.m5 + m5Delta),
            netBuy: dir(prev.netBuy, netBuyNew),
          };

          m.price  = newPrice;
          m.m5     = parseFloat((m.m5 + m5Delta).toFixed(2));
          m.h1     = parseFloat((m.h1 + h1Delta).toFixed(2));
          m.h6     = parseFloat((m.h6 + h6Delta).toFixed(2));
          m.h24    = parseFloat((m.h24 + h24Delta).toFixed(2));
          m.netBuy = Math.round(netBuyNew);
          m.txn    = Math.max(0, m.txn + txnDelta);

          prevRef.current[m.id] = { ...m };
        });

        setFlashes((f) => ({ ...f, ...newFlashes }));

        // Clear flashes after animation completes
        setTimeout(() => {
          setFlashes((f) => {
            const cleared = { ...f };
            indices.forEach((i) => { delete cleared[next[i].id]; });
            return cleared;
          });
        }, 750);

        return next;
      });
    };

    const id = setInterval(tick, 1200);
    return () => clearInterval(id);
  }, []);

  let rows = markets.filter((m) => {
    const matchChain  = chain === 'All Chains' || m.chain === chain;
    const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.pair.toLowerCase().includes(search.toLowerCase());
    return matchChain && matchSearch;
  });

  if (sortBy === 'gainers') rows = [...rows].sort((a, b) => b.h24 - a.h24);
  if (sortBy === 'volume')  rows = [...rows].sort((a, b) => parseFloat(b.vol.replace(/[$KMB]/g, '')) - parseFloat(a.vol.replace(/[$KMB]/g, '')));
  if (sortBy === 'new')     rows = [...rows].sort((a) => (a.age.includes('h') || a.age.includes('d') ? -1 : 1));

  if (stateMode === 'loading') return <div className="relative h-full"><MarketsTableSkeleton /><button onClick={() => setStateMode('loaded')} className="absolute bottom-3 right-3 text-xs border border-border rounded px-2 py-1 text-muted-foreground hover:text-foreground">Load data</button></div>;
  if (stateMode === 'error')   return <LoadError onRetry={() => setStateMode('loaded')} />;

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
          {/* Row 1: Sort + Search */}
          <div className="flex items-center gap-1.5 px-2 py-1.5">
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
                {s.icon} {s.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1.5">
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-muted border border-border rounded px-2 py-1 text-xs outline-none focus:border-primary w-28 placeholder:text-muted-foreground"
              />
              <button className="p-1 border border-border rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"><Filter size={13} /></button>
              <button onClick={() => setStateMode('loading')} className="p-1 border border-border rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"><RefreshCw size={13} /></button>
            </div>
          </div>
          {/* Row 2: Chain filters with logos — horizontally scrollable */}
          <div className="flex items-center gap-1 px-2 pb-1.5 overflow-x-auto">
            {CHAIN_CONFIG.map((c) => (
              <button
                key={c.key}
                onClick={() => setChain(c.key)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs border transition shrink-0 whitespace-nowrap ${
                  chain === c.key
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                }`}
              >
                {c.logo ? (
                  <img src={c.logo} alt={c.label} className="w-3.5 h-3.5 rounded-full object-cover" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full bg-muted-foreground/30 inline-block" />
                )}
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {rows.length === 0 ? (
            <EmptySearch onReset={() => setSearch('')} />
          ) : (
            <table className="w-full text-xs border-collapse min-w-[820px]">
              <thead className="sticky top-0 bg-background border-b border-border z-10">
                <tr className="text-muted-foreground text-left">
                  <th className="w-7 px-2 py-1.5 font-medium">#</th>
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
                {rows.map((m) => {
                  const f = flashes[m.id] || {};
                  const rowFlash = f.price === 'up' ? 'flash-up' : f.price === 'down' ? 'flash-down' : '';
                  return (
                    <tr
                      key={m.id}
                      onClick={() => onSelectToken(m.name)}
                      className={`border-b border-border/50 hover:bg-muted/40 cursor-pointer group ${rowFlash}`}
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
                            {CHAIN_MAP[m.chain]?.logo ? (
                              <img
                                src={CHAIN_MAP[m.chain].logo}
                                alt={m.chain}
                                className="absolute -bottom-0.5 -right-1 w-3.5 h-3.5 rounded-full ring-1 ring-background object-cover"
                              />
                            ) : (
                              <span
                                className="absolute -bottom-0.5 -right-1 text-[8px] font-bold px-0.5 rounded leading-tight"
                                style={{ backgroundColor: m.chainColor, color: '#fff' }}
                              >
                                {m.chain}
                              </span>
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-foreground leading-tight">{m.pair}</div>
                            <div className="text-muted-foreground leading-tight truncate max-w-[120px]">{m.name}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-2 py-1.5 text-right">
                        <div className={`font-bold text-foreground font-mono tabular-nums transition-colors duration-300 ${f.price === 'up' ? 'flash-up-text' : f.price === 'down' ? 'flash-down-text' : ''}`}>
                          {m.mcap}
                        </div>
                        <div className={`font-mono tabular-nums text-muted-foreground transition-colors duration-300 ${f.price === 'up' ? 'flash-up-text' : f.price === 'down' ? 'flash-down-text' : ''}`}>
                          {fmtPrice(m.price)}
                        </div>
                      </td>

                      <td className="px-2 py-1.5 text-right text-muted-foreground">{m.age}</td>
                      <td className="px-2 py-1.5"><SecurityBar score={m.security} audited={m.audited} /></td>

                      <td className="px-2 py-1.5 text-right"><Pct v={m.m5} flash={f.m5} /></td>
                      <td className="px-2 py-1.5 text-right"><Pct v={m.h1} flash={f.h1} /></td>
                      <td className="px-2 py-1.5 text-right"><Pct v={m.h6} flash={f.h6} /></td>
                      <td className="px-2 py-1.5 text-right"><Pct v={m.h24} flash={f.h24} /></td>

                      <td className="px-2 py-1.5 text-right font-mono text-muted-foreground tabular-nums">{m.liq}</td>
                      <td className={`px-2 py-1.5 text-right font-mono tabular-nums transition-colors duration-300 ${f.price === 'up' ? 'text-secondary' : f.price === 'down' ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {fmtTxn(m.txn)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-muted-foreground tabular-nums">{m.vol}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-muted-foreground tabular-nums">{m.holders}</td>

                      <td className="px-2 py-1.5">
                        <div className="flex justify-center">
                          <NetBar netBuy={m.netBuy} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border bg-background px-3 py-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{rows.length} pools · live</span>
          <div className="flex items-center gap-3">
            <span>Showing {Math.min(rows.length, 50)} of {markets.length}</span>
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
