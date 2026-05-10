import { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowLeft, Star, Bell, Globe, Twitter, Send, Copy, ExternalLink, TrendingUp, ExternalLinkIcon } from 'lucide-react';
import { BarChart, Bar, ResponsiveContainer, Tooltip as ReTooltip } from 'recharts';

// ── Types ──────────────────────────────────────────────────────────────────────
interface OHLC {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TxRow {
  id: string;
  age: string;
  type: 'Buy' | 'Sell';
  usd: number;
  token: number;
  quote: number;
  price: number;
  maker: string;
}

interface TokenInfo {
  name: string;
  symbol: string;
  pair: string;
  quoteSymbol: string;
  chain: string;
  chainColor: string;
  dex: string;
  emoji: string;
  bannerColor: string;
  price: number;
  priceSOL: string;
  change24h: number;
  high24h: number;
  low24h: number;
  liquidity: string;
  fdv: string;
  marketCap: string;
  m5: number;
  h1: number;
  h6: number;
  h24: number;
  txns: number;
  buys: number;
  sells: number;
  volume: string;
  buyVol: string;
  sellVol: string;
  makers: number;
  buyers: number;
  sellers: number;
  holders: number;
  liquidityProviders: number;
  pooledToken: string;
  pooledQuote: string;
  pairCreated: string;
  pairAddr: string;
  tokenAddr: string;
  quoteAddr: string;
}

// ── Token data ──────────────────────────────────────────────────────────────────
const TOKEN_DATA: Record<string, TokenInfo> = {
  PEPEFUN: {
    name: 'PEPE', symbol: 'PEPE', pair: 'PEPE / SOL', quoteSymbol: 'SOL',
    chain: 'Solana', chainColor: '#9945FF', dex: 'Raydium', emoji: '🐸',
    bannerColor: '#16a34a',
    price: 0.00001248, priceSOL: '0.0₅ 6432 SOL', change24h: 14.35,
    high24h: 0.00001258, low24h: 0.00000872,
    liquidity: '$2.34M', fdv: '$429.6M', marketCap: '$429.6M',
    m5: 1.21, h1: 6.38, h6: 9.72, h24: 14.35,
    txns: 85123, buys: 44973, sells: 40150,
    volume: '$42.6M', buyVol: '$21.3M', sellVol: '$21.3M',
    makers: 21567, buyers: 13125, sellers: 12987,
    holders: 120813, liquidityProviders: 12341,
    pooledToken: '114.5B', pooledQuote: '73.45 SOL',
    pairCreated: '8mo 12d ago',
    pairAddr: '7gfc...mp9B', tokenAddr: '7KEA...pump', quoteAddr: 'So11...1112',
  },
  AIGEN: {
    name: 'AIGEN', symbol: 'AIGEN', pair: 'AIGEN / ETH', quoteSymbol: 'ETH',
    chain: 'Ethereum', chainColor: '#627EEA', dex: 'Uniswap', emoji: '🤖',
    bannerColor: '#2563eb',
    price: 0.005183, priceSOL: '0.0026 ETH', change24h: -14.5,
    high24h: 0.00621, low24h: 0.00481,
    liquidity: '$375K', fdv: '$5.21M', marketCap: '$5.21M',
    m5: -0.5, h1: 0.2, h6: 7.7, h24: -14.5,
    txns: 1552, buys: 831, sells: 721,
    volume: '$986K', buyVol: '$512K', sellVol: '$474K',
    makers: 443, buyers: 228, sellers: 215,
    holders: 112, liquidityProviders: 34,
    pooledToken: '1.2M', pooledQuote: '2.6 ETH',
    pairCreated: '1yr 2d ago',
    pairAddr: '0x3f2a...b8c1', tokenAddr: '0xA41b...9EF3', quoteAddr: '0xC02a...6Cc2',
  },
  BOLTAI: {
    name: 'BOLTAI', symbol: 'BOLTAI', pair: 'BOLTAI / SOL', quoteSymbol: 'SOL',
    chain: 'Solana', chainColor: '#9945FF', dex: 'Raydium', emoji: '⚡',
    bannerColor: '#ca8a04',
    price: 0.005288, priceSOL: '0.0₂ 2644 SOL', change24h: 1333.5,
    high24h: 0.00681, low24h: 0.00039,
    liquidity: '$73.5K', fdv: '$532K', marketCap: '$532K',
    m5: 0.7, h1: -13.0, h6: 8.1, h24: 1333.5,
    txns: 83263, buys: 44821, sells: 38442,
    volume: '$8.7M', buyVol: '$4.8M', sellVol: '$3.9M',
    makers: 12411, buyers: 6832, sellers: 5579,
    holders: 3286, liquidityProviders: 412,
    pooledToken: '45.2M', pooledQuote: '183.2 SOL',
    pairCreated: '17hrs ago',
    pairAddr: 'BLT7...Xp2f', tokenAddr: 'BLTK...ai9z', quoteAddr: 'So11...1112',
  },
  CHAOS: {
    name: 'CHAOS', symbol: 'CHAOS', pair: 'CHAOS / WETH', quoteSymbol: 'WETH',
    chain: 'Base', chainColor: '#0052FF', dex: 'Uniswap', emoji: '🎭',
    bannerColor: '#7c3aed',
    price: 0.006912, priceSOL: '0.00346 WETH', change24h: 211.0,
    high24h: 0.00812, low24h: 0.00213,
    liquidity: '$303.9K', fdv: '$691K', marketCap: '$691K',
    m5: 0.0, h1: -9.7, h6: 41.7, h24: 211.0,
    txns: 9032, buys: 5142, sells: 3890,
    volume: '$2.2M', buyVol: '$1.3M', sellVol: '$0.9M',
    makers: 2341, buyers: 1382, sellers: 959,
    holders: 1659, liquidityProviders: 231,
    pooledToken: '18.7M', pooledQuote: '89.4 WETH',
    pairCreated: '26d ago',
    pairAddr: '0xCH4o...s12F', tokenAddr: '0xCHAO...S99z', quoteAddr: '0xC02a...6Cc2',
  },
  LUNA2: {
    name: 'LUNA2', symbol: 'LUNA2', pair: 'LUNA2 / SOL', quoteSymbol: 'SOL',
    chain: 'Solana', chainColor: '#9945FF', dex: 'Raydium', emoji: '🌕',
    bannerColor: '#b45309',
    price: 0.003622, priceSOL: '0.0₂ 1811 SOL', change24h: -3.0,
    high24h: 0.00392, low24h: 0.00348,
    liquidity: '$261.9K', fdv: '$3.84M', marketCap: '$3.84M',
    m5: -0.3, h1: -3.5, h6: 15.2, h24: -3.0,
    txns: 24385, buys: 12841, sells: 11544,
    volume: '$3M', buyVol: '$1.6M', sellVol: '$1.4M',
    makers: 7823, buyers: 4102, sellers: 3721,
    holders: 18091, liquidityProviders: 2341,
    pooledToken: '284.1M', pooledQuote: '951.4 SOL',
    pairCreated: '6d ago',
    pairAddr: 'LN2p...m81X', tokenAddr: 'LNA2...k99z', quoteAddr: 'So11...1112',
  },
  SWEAT: {
    name: 'SWEAT', symbol: 'SWEAT', pair: 'SWEAT / USDC', quoteSymbol: 'USDC',
    chain: 'Solana', chainColor: '#9945FF', dex: 'Raydium', emoji: '💧',
    bannerColor: '#0369a1',
    price: 0.002296, priceSOL: '0.0₃ 1148 SOL', change24h: 356.3,
    high24h: 0.00284, low24h: 0.00049,
    liquidity: '$555.4K', fdv: '$19.62M', marketCap: '$19.62M',
    m5: -4.2, h1: 4.9, h6: 42.5, h24: 356.3,
    txns: 1950, buys: 1082, sells: 868,
    volume: '$1.8M', buyVol: '$0.98M', sellVol: '$0.82M',
    makers: 621, buyers: 341, sellers: 280,
    holders: 5038, liquidityProviders: 891,
    pooledToken: '124.8B', pooledQuote: '281.2K USDC',
    pairCreated: '3yr 1mo ago',
    pairAddr: 'SWT3...u2Lx', tokenAddr: 'SWAT...k18z', quoteAddr: 'EPjF...tEEm',
  },
  FOXAI: {
    name: 'FOXAI', symbol: 'FOXAI', pair: 'FOXAI / SOL', quoteSymbol: 'SOL',
    chain: 'Solana', chainColor: '#9945FF', dex: 'Raydium', emoji: '🦊',
    bannerColor: '#c2410c',
    price: 0.003451, priceSOL: '0.0₂ 1726 SOL', change24h: 28.0,
    high24h: 0.00381, low24h: 0.00268,
    liquidity: '$1.8M', fdv: '$33.17M', marketCap: '$33.17M',
    m5: -0.5, h1: -2.5, h6: -2.7, h24: 28.0,
    txns: 23153, buys: 11821, sells: 11332,
    volume: '$3.9M', buyVol: '$2.1M', sellVol: '$1.8M',
    makers: 8421, buyers: 4312, sellers: 4109,
    holders: 80635, liquidityProviders: 6721,
    pooledToken: '2.4B', pooledQuote: '4281.3 SOL',
    pairCreated: '2yr 3mo ago',
    pairAddr: 'FOX7...p93X', tokenAddr: 'FOXA...I11z', quoteAddr: 'So11...1112',
  },
  ORACLE: {
    name: 'ORACLE', symbol: 'ORACLE', pair: 'ORACLE / ETH', quoteSymbol: 'ETH',
    chain: 'Ethereum', chainColor: '#627EEA', dex: 'Uniswap', emoji: '🔮',
    bannerColor: '#6d28d9',
    price: 0.5028, priceSOL: '0.2514 ETH', change24h: 10.7,
    high24h: 0.5641, low24h: 0.4521,
    liquidity: '$834.1K', fdv: '$5.03M', marketCap: '$5.03M',
    m5: 4.9, h1: -4.0, h6: 23.0, h24: 10.7,
    txns: 10169, buys: 5481, sells: 4688,
    volume: '$9M', buyVol: '$4.8M', sellVol: '$4.2M',
    makers: 3241, buyers: 1742, sellers: 1499,
    holders: 1848, liquidityProviders: 312,
    pooledToken: '4.82M', pooledQuote: '2124.1 ETH',
    pairCreated: '10hrs ago',
    pairAddr: '0xOR4c...L892', tokenAddr: '0xORA1...E55z', quoteAddr: '0xC02a...6Cc2',
  },
  DRGN: {
    name: 'DRGN', symbol: 'DRGN', pair: 'DRGN / WETH', quoteSymbol: 'WETH',
    chain: 'Arbitrum', chainColor: '#12AAFF', dex: 'Camelot', emoji: '🐉',
    bannerColor: '#b91c1c',
    price: 0.03824, priceSOL: '0.01912 WETH', change24h: 9.0,
    high24h: 0.04212, low24h: 0.03481,
    liquidity: '$16.8M', fdv: '$2.52B', marketCap: '$2.52B',
    m5: 0.3, h1: 1.6, h6: 1.4, h24: 9.0,
    txns: 780, buys: 421, sells: 359,
    volume: '$4.5M', buyVol: '$2.3M', sellVol: '$2.2M',
    makers: 284, buyers: 152, sellers: 132,
    holders: 384903, liquidityProviders: 18421,
    pooledToken: '284.2M', pooledQuote: '42810.2 WETH',
    pairCreated: '4yr 2mo ago',
    pairAddr: '0xDR7g...n18X', tokenAddr: '0xDRGN...T99z', quoteAddr: '0x82aF...8Bb2',
  },
  BANTAH: {
    name: 'BANTAH', symbol: 'BANTAH', pair: 'BANTAH / SOL', quoteSymbol: 'SOL',
    chain: 'Solana', chainColor: '#9945FF', dex: 'Raydium', emoji: '🎯',
    bannerColor: '#7c3aed',
    price: 0.001337, priceSOL: '0.0₃ 6685 SOL', change24h: 47.2,
    high24h: 0.001481, low24h: 0.000891,
    liquidity: '$512K', fdv: '$8.9M', marketCap: '$8.9M',
    m5: 1.4, h1: 6.2, h6: 18.4, h24: 47.2,
    txns: 4821, buys: 2841, sells: 1980,
    volume: '$2.1M', buyVol: '$1.2M', sellVol: '$0.9M',
    makers: 1821, buyers: 1021, sellers: 800,
    holders: 9234, liquidityProviders: 1241,
    pooledToken: '2.8B', pooledQuote: '1841.2 SOL',
    pairCreated: '5d ago',
    pairAddr: 'BNT7...h99X', tokenAddr: 'BNTA...H11z', quoteAddr: 'So11...1112',
  },
  BALL: {
    name: 'BALL', symbol: 'BALL', pair: 'BALL / SOL', quoteSymbol: 'SOL',
    chain: 'Solana', chainColor: '#9945FF', dex: 'Raydium', emoji: '⚽',
    bannerColor: '#166534',
    price: 0.000421, priceSOL: '0.0₄ 2105 SOL', change24h: 491.0,
    high24h: 0.000541, low24h: 0.000071,
    liquidity: '$89K', fdv: '$420K', marketCap: '$420K',
    m5: 8.2, h1: 22.1, h6: 67.4, h24: 491.0,
    txns: 12400, buys: 8241, sells: 4159,
    volume: '$341K', buyVol: '$228K', sellVol: '$113K',
    makers: 3241, buyers: 2181, sellers: 1060,
    holders: 503, liquidityProviders: 121,
    pooledToken: '841.2M', pooledQuote: '211.4 SOL',
    pairCreated: '1d ago',
    pairAddr: 'BLL7...x12X', tokenAddr: 'BALL...S99z', quoteAddr: 'So11...1112',
  },
  DEFAI: {
    name: 'DEFAI', symbol: 'DEFAI', pair: 'DEFAI / BASE', quoteSymbol: 'ETH',
    chain: 'Base', chainColor: '#0052FF', dex: 'Aerodrome', emoji: '🏦',
    bannerColor: '#1d4ed8',
    price: 0.00782, priceSOL: '0.00391 ETH', change24h: 12.1,
    high24h: 0.00841, low24h: 0.00691,
    liquidity: '$298K', fdv: '$7.1M', marketCap: '$7.1M',
    m5: -1.1, h1: -0.8, h6: 3.3, h24: 12.1,
    txns: 6712, buys: 3541, sells: 3171,
    volume: '$1.4M', buyVol: '$0.74M', sellVol: '$0.66M',
    makers: 2141, buyers: 1121, sellers: 1020,
    holders: 4511, liquidityProviders: 841,
    pooledToken: '18.4M', pooledQuote: '74.2 ETH',
    pairCreated: '14d ago',
    pairAddr: '0xDF7a...i18X', tokenAddr: '0xDEFA...I55z', quoteAddr: '0x4200...0006',
  },
};

// ── Data generators ─────────────────────────────────────────────────────────────
function generateCandles(basePrice: number, count = 80): OHLC[] {
  const candles: OHLC[] = [];
  let price = basePrice * 0.85;
  const now = Date.now();
  for (let i = count; i >= 0; i--) {
    const t = new Date(now - i * 15 * 60 * 1000);
    const vol = price * 0.012;
    const open = price;
    const close = open + (Math.random() - 0.46) * vol;
    const high = Math.max(open, close) + Math.random() * vol * 0.4;
    const low  = Math.min(open, close) - Math.random() * vol * 0.4;
    const volume = Math.floor(Math.random() * 800000 + 100000);
    candles.push({
      time: `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`,
      open, close,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      volume,
    });
    price = close;
  }
  return candles;
}

let txCounter = 0;
function makeTx(info: TokenInfo): TxRow {
  const isBuy = Math.random() > 0.43;
  const usd = Math.random() * 12000 + 80;
  const token = usd / info.price;
  const quote = usd / 200;
  const secs = Math.floor(Math.random() * 120) + 1;
  const age = secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m`;
  const rand4 = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return {
    id: String(++txCounter),
    age,
    type: isBuy ? 'Buy' : 'Sell',
    usd,
    token,
    quote,
    price: info.price * (1 + (Math.random() - 0.5) * 0.002),
    maker: `${rand4()}...${rand4()}`,
  };
}

// ── SVG Candlestick Chart ────────────────────────────────────────────────────────
function CandleChart({ candles }: { candles: OHLC[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [h, setH] = useState(220);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0) setW(width);
      if (height > 0) setH(height);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const ml = 4, mr = 64, mt = 8, mb = 20;
  const cw = w - ml - mr;
  const ch = h - mt - mb;

  const minP = Math.min(...candles.map(d => d.low))  * 0.9995;
  const maxP = Math.max(...candles.map(d => d.high)) * 1.0005;

  const xOf = (i: number) => ml + (i + 0.5) * (cw / candles.length);
  const yOf = (p: number) => mt + ch - ((p - minP) / (maxP - minP)) * ch;
  const bw  = Math.max(1.5, (cw / candles.length) * 0.55);

  const priceLabels = [0, 0.25, 0.5, 0.75, 1].map(t => minP + (maxP - minP) * t);

  function fmtLabel(p: number) {
    if (p >= 1)     return '$' + p.toFixed(2);
    if (p >= 0.01)  return '$' + p.toFixed(4);
    if (p >= 0.0001) return '$' + p.toFixed(6);
    return '$' + p.toFixed(8);
  }

  const xLabels = candles.filter((_, i) => i % Math.floor(candles.length / 6) === 0);

  return (
    <div ref={wrapRef} className="w-full h-full">
      <svg width={w} height={h} className="overflow-visible">
        {/* Grid */}
        {priceLabels.map((p, i) => {
          const y = yOf(p);
          return (
            <g key={i}>
              <line x1={ml} y1={y} x2={w - mr} y2={y} stroke="#1f2937" strokeWidth={0.5} strokeDasharray="3,3" />
              <text x={w - mr + 4} y={y + 3} fill="#6b7280" fontSize={9} textAnchor="start">
                {fmtLabel(p)}
              </text>
            </g>
          );
        })}

        {/* Candles */}
        {candles.map((d, i) => {
          const x  = xOf(i);
          const isGreen = d.close >= d.open;
          const color = isGreen ? '#22c55e' : '#ef4444';
          const bodyY = yOf(Math.max(d.open, d.close));
          const bodyH = Math.max(1, Math.abs(yOf(d.open) - yOf(d.close)));
          return (
            <g key={i}>
              <line x1={x} y1={yOf(d.high)} x2={x} y2={yOf(d.low)} stroke={color} strokeWidth={1} />
              <rect x={x - bw / 2} y={bodyY} width={bw} height={bodyH} fill={color} />
            </g>
          );
        })}

        {/* X-axis labels */}
        {xLabels.map((d, i) => {
          const idx = candles.indexOf(d);
          return (
            <text key={i} x={xOf(idx)} y={h - 4} fill="#6b7280" fontSize={9} textAnchor="middle">
              {d.time}
            </text>
          );
        })}

        {/* Current price line */}
        {(() => {
          const last = candles[candles.length - 1];
          if (!last) return null;
          const y = yOf(last.close);
          return (
            <g>
              <line x1={ml} y1={y} x2={w - mr} y2={y} stroke="#a855f7" strokeWidth={0.8} strokeDasharray="4,2" />
              <rect x={w - mr} y={y - 8} width={mr - 2} height={16} fill="#a855f7" rx={2} />
              <text x={w - mr + 2} y={y + 4} fill="#fff" fontSize={9}>
                {fmtLabel(last.close)}
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

// ── Stat cell ───────────────────────────────────────────────────────────────────
function Stat({ label, value, valueClass = '' }: { label: string; value: string | number; valueClass?: string }) {
  return (
    <div className="flex flex-col gap-0.5 p-2 border-b border-r border-border last:border-r-0">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={`text-xs font-bold font-mono ${valueClass}`}>{value}</span>
    </div>
  );
}

function Pct({ v }: { v: number }) {
  const color = v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-muted-foreground';
  return (
    <span className={`text-xs font-mono font-bold ${color}`}>
      {v > 0 ? '+' : ''}{v.toFixed(2)}%
    </span>
  );
}

function fmtNum(n: number) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toFixed(2);
}

function fmtUSD(n: number) {
  return '$' + fmtNum(n);
}

function fmtPrice(p: number) {
  if (p >= 1)      return '$' + p.toFixed(2);
  if (p >= 0.01)   return '$' + p.toFixed(4);
  if (p >= 0.0001) return '$' + p.toFixed(6);
  return '$' + p.toFixed(8);
}

// ── Transactions tab ─────────────────────────────────────────────────────────────
function TransactionsTab({ info }: { info: TokenInfo }) {
  const [rows, setRows] = useState<TxRow[]>(() => Array.from({ length: 20 }, () => makeTx(info)));

  useEffect(() => {
    const id = setInterval(() => {
      setRows(prev => [makeTx(info), ...prev.slice(0, 29)]);
    }, 2200);
    return () => clearInterval(id);
  }, [info]);

  return (
    <div className="flex-1 overflow-auto min-h-0">
      <table className="w-full text-xs border-collapse min-w-[540px]">
        <thead className="sticky top-0 bg-background border-b border-border z-10">
          <tr className="text-muted-foreground text-left">
            <th className="px-2 py-1.5 font-medium">TIME</th>
            <th className="px-2 py-1.5 font-medium">TYPE</th>
            <th className="px-2 py-1.5 font-medium text-right">USD</th>
            <th className="px-2 py-1.5 font-medium text-right">{info.symbol}</th>
            <th className="px-2 py-1.5 font-medium text-right">{info.quoteSymbol}</th>
            <th className="px-2 py-1.5 font-medium text-right">PRICE</th>
            <th className="px-2 py-1.5 font-medium text-right">MAKER</th>
            <th className="px-2 py-1.5 font-medium text-center">TXN</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30">
              <td className="px-2 py-1.5 text-muted-foreground">{r.age}</td>
              <td className={`px-2 py-1.5 font-bold ${r.type === 'Buy' ? 'text-green-400' : 'text-red-400'}`}>{r.type}</td>
              <td className="px-2 py-1.5 text-right font-mono">{fmtUSD(r.usd)}</td>
              <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">{fmtNum(r.token)}</td>
              <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">{r.quote.toFixed(2)}</td>
              <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">{fmtPrice(r.price)}</td>
              <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">{r.maker}</td>
              <td className="px-2 py-1.5 text-center">
                <button className="text-muted-foreground hover:text-foreground transition">
                  <ExternalLinkIcon size={11} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────────
interface TokenPageProps {
  token: string;
  onBack: () => void;
}

const TIMEFRAMES = ['1s', '1m', '5m', '15m', '1h', '4h', 'D'];
const BOTTOM_TABS = ['Transactions', 'Top Traders', 'Holders', 'Liquidity Providers'];

export default function TokenPage({ token, onBack }: TokenPageProps) {
  const info = TOKEN_DATA[token] ?? TOKEN_DATA['PEPEFUN'];
  const [tf, setTf] = useState('15m');
  const [bottomTab, setBottomTab] = useState('Transactions');
  const [watchlisted, setWatchlisted] = useState(false);
  const [currentPrice, setCurrentPrice] = useState(info.price);

  const candles = useMemo(() => generateCandles(info.price), [info.price]);

  const volData = useMemo(() =>
    candles.map(c => ({
      time: c.time,
      volume: c.volume,
      green: c.close >= c.open,
    })), [candles]);

  // Live price tick
  useEffect(() => {
    const id = setInterval(() => {
      setCurrentPrice(p => Math.max(p * 0.9, p + p * (Math.random() - 0.49) * 0.002));
    }, 1500);
    return () => clearInterval(id);
  }, [info]);

  const priceChange = ((currentPrice - info.price) / info.price) * 100;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background text-foreground">

      {/* ── Breadcrumb bar ── */}
      <div className="shrink-0 flex items-center gap-1 px-2 py-1 border-b border-border text-xs text-muted-foreground bg-background">
        <button onClick={onBack} className="flex items-center gap-1 hover:text-foreground transition">
          <ArrowLeft size={12} /> Back
        </button>
        <span className="mx-1 opacity-40">/</span>
        <span>Markets</span>
        <span className="mx-1 opacity-40">/</span>
        <span style={{ color: info.chainColor }}>{info.chain}</span>
        <span className="mx-1 opacity-40">/</span>
        <span>{info.dex}</span>
        <span className="mx-1 opacity-40">/</span>
        <span className="text-foreground font-bold">{info.symbol}</span>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left panel ──────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Token header */}
          <div className="shrink-0 px-2 py-2 border-b border-border flex items-start justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-xl shrink-0"
                style={{ background: info.bannerColor + '33', border: `1px solid ${info.bannerColor}55` }}
              >
                {info.emoji}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-base text-foreground">{info.pair}</span>
                  <button className={`transition ${watchlisted ? 'text-yellow-400' : 'text-muted-foreground hover:text-yellow-400'}`}
                    onClick={() => setWatchlisted(v => !v)}>
                    <Star size={13} fill={watchlisted ? 'currentColor' : 'none'} />
                  </button>
                  <button className="text-muted-foreground hover:text-primary transition"><Bell size={13} /></button>
                </div>
                <div className="flex gap-1.5 mt-0.5">
                  <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{info.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: info.chainColor + '22', color: info.chainColor }}>{info.dex}</span>
                  <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">CLMM</span>
                </div>
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold font-mono">{fmtPrice(currentPrice)}</span>
                <span className={`text-sm font-bold font-mono ${priceChange + info.change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {(priceChange + info.change24h) >= 0 ? '+' : ''}{(priceChange + info.change24h).toFixed(2)}%
                </span>
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                <span>24H HIGH <span className="text-foreground font-mono">{fmtPrice(info.high24h)}</span></span>
                <span>24H LOW <span className="text-foreground font-mono">{fmtPrice(info.low24h)}</span></span>
              </div>
            </div>
          </div>

          {/* Chart timeframe controls */}
          <div className="shrink-0 flex items-center gap-0.5 px-2 py-1 border-b border-border bg-background text-xs flex-wrap">
            {TIMEFRAMES.map(t => (
              <button key={t} onClick={() => setTf(t)}
                className={`px-2 py-0.5 rounded font-mono transition ${tf === t ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                {t}
              </button>
            ))}
            <div className="w-px h-3 bg-border mx-1" />
            <button className="px-1.5 py-0.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition">Indicators</button>
            <button className="px-1.5 py-0.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition">Outliers</button>
            <div className="ml-auto flex items-center gap-1 text-muted-foreground">
              <button className="hover:text-foreground px-1 hover:bg-muted rounded transition">%</button>
              <button className="hover:text-foreground px-1 hover:bg-muted rounded transition">log</button>
              <button className="hover:text-foreground px-1 hover:bg-muted rounded transition">auto</button>
            </div>
          </div>

          {/* Candlestick chart */}
          <div className="shrink-0 h-52 bg-background border-b border-border">
            <CandleChart candles={candles} />
          </div>

          {/* Volume chart */}
          <div className="shrink-0 h-14 border-b border-border bg-background">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volData} margin={{ top: 2, right: 64, left: 4, bottom: 2 }}>
                <Bar dataKey="volume"
                  shape={(props: any) => {
                    const { x, y, width, height, payload } = props;
                    return <rect x={x} y={y} width={width} height={height}
                      fill={payload.green ? '#22c55e' : '#ef4444'} opacity={0.5} />;
                  }}
                />
                <ReTooltip
                  contentStyle={{ background: '#0a0e1a', border: '1px solid #1f2937', fontSize: 10, padding: 4 }}
                  formatter={(v: number) => [fmtNum(v), 'Vol']}
                  labelStyle={{ color: '#6b7280', fontSize: 9 }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Time range strip */}
          <div className="shrink-0 flex items-center gap-1 px-2 py-0.5 border-b border-border text-xs text-muted-foreground font-mono bg-background">
            {['5y','1y','6m','3m','1m','5d','1d'].map(r => (
              <button key={r} className="px-1.5 py-0.5 hover:text-foreground hover:bg-muted rounded transition">{r}</button>
            ))}
            <span className="ml-auto">{new Date().toLocaleTimeString('en-US', { hour12: false })} (UTC)</span>
          </div>

          {/* Bottom tabs */}
          <div className="shrink-0 flex items-center border-b border-border bg-background">
            {BOTTOM_TABS.map(tab => (
              <button key={tab} onClick={() => setBottomTab(tab)}
                className={`text-xs px-3 py-2 border-b-2 transition whitespace-nowrap ${
                  bottomTab === tab
                    ? 'border-primary text-foreground font-bold'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}>
                {tab === 'Holders' ? `Holders (${info.holders.toLocaleString()})` :
                 tab === 'Liquidity Providers' ? `Liquidity Providers (${info.liquidityProviders.toLocaleString()})` :
                 tab}
              </button>
            ))}
          </div>

          {/* Transactions table */}
          {bottomTab === 'Transactions' ? (
            <TransactionsTab info={info} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
              {bottomTab} data coming soon
            </div>
          )}
        </div>

        {/* ── Right panel ──────────────────────────────────────────── */}
        <div className="w-64 shrink-0 border-l border-border flex flex-col overflow-y-auto bg-background hidden lg:flex">

          {/* Token banner */}
          <div className="relative shrink-0 h-20 flex items-end"
            style={{ background: `linear-gradient(135deg, ${info.bannerColor}cc, ${info.bannerColor}44)` }}>
            <div className="absolute inset-0 flex items-center justify-center text-5xl opacity-30">{info.emoji}</div>
            <div className="relative z-10 px-3 pb-2">
              <div className="text-sm font-bold text-white drop-shadow">{info.pair}</div>
              <div className="flex gap-1.5 mt-0.5">
                <span className="text-[10px] bg-black/30 text-white px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: info.chainColor }} />
                  {info.chain}
                </span>
                <span className="text-[10px] bg-black/30 text-white px-1.5 py-0.5 rounded">@ {info.dex}</span>
              </div>
            </div>
          </div>

          {/* Social links */}
          <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border">
            {[
              { icon: Globe, label: 'Website' },
              { icon: Twitter, label: 'Twitter' },
              { icon: Send, label: 'Telegram' },
            ].map(({ icon: Icon, label }) => (
              <button key={label}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground border border-border rounded px-1.5 py-0.5 hover:bg-muted transition">
                <Icon size={10} /> {label}
              </button>
            ))}
          </div>

          {/* Price row */}
          <div className="shrink-0 grid grid-cols-2 border-b border-border">
            <div className="p-2 border-r border-border">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">Price USD</div>
              <div className="text-xs font-bold font-mono mt-0.5">{fmtPrice(currentPrice)}</div>
            </div>
            <div className="p-2">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">Price</div>
              <div className="text-xs font-bold font-mono mt-0.5">{info.priceSOL}</div>
            </div>
          </div>

          {/* Liquidity / FDV / Market Cap */}
          <div className="shrink-0 grid grid-cols-3 border-b border-border">
            <Stat label="Liquidity" value={info.liquidity} />
            <Stat label="FDV" value={info.fdv} />
            <Stat label="Market Cap" value={info.marketCap} />
          </div>

          {/* Price changes */}
          <div className="shrink-0 grid grid-cols-4 border-b border-border">
            {[['5M', info.m5], ['1H', info.h1], ['6H', info.h6], ['24H', info.h24]].map(([label, v]) => (
              <div key={label as string} className="flex flex-col gap-0.5 p-2 border-r border-border last:border-r-0">
                <span className="text-[10px] font-semibold text-muted-foreground">{label}</span>
                <Pct v={v as number} />
              </div>
            ))}
          </div>

          {/* TXNs / Buys / Sells */}
          <div className="shrink-0 grid grid-cols-3 border-b border-border">
            <Stat label="TXNs" value={info.txns.toLocaleString()} />
            <Stat label="Buys" value={info.buys.toLocaleString()} valueClass="text-green-400" />
            <Stat label="Sells" value={info.sells.toLocaleString()} valueClass="text-red-400" />
          </div>

          {/* Buy/sell bar */}
          <div className="shrink-0 px-2 py-1 border-b border-border">
            <div className="flex h-1.5 rounded-full overflow-hidden">
              <div className="bg-green-500 transition-all" style={{ width: `${(info.buys / info.txns) * 100}%` }} />
              <div className="bg-red-500 transition-all" style={{ width: `${(info.sells / info.txns) * 100}%` }} />
            </div>
          </div>

          {/* Volume */}
          <div className="shrink-0 grid grid-cols-3 border-b border-border">
            <Stat label="Volume" value={info.volume} />
            <Stat label="Buy Vol" value={info.buyVol} valueClass="text-green-400" />
            <Stat label="Sell Vol" value={info.sellVol} valueClass="text-red-400" />
          </div>

          {/* Makers / Buyers / Sellers */}
          <div className="shrink-0 grid grid-cols-3 border-b border-border">
            <Stat label="Makers" value={info.makers.toLocaleString()} />
            <Stat label="Buyers" value={info.buyers.toLocaleString()} valueClass="text-green-400" />
            <Stat label="Sellers" value={info.sellers.toLocaleString()} valueClass="text-red-400" />
          </div>

          {/* Action buttons */}
          <div className="shrink-0 flex gap-1.5 px-2 py-2 border-b border-border">
            <button
              onClick={() => setWatchlisted(v => !v)}
              className={`flex-1 flex items-center justify-center gap-1 text-[10px] font-bold py-1.5 rounded border transition ${
                watchlisted ? 'border-yellow-500 text-yellow-400 bg-yellow-500/10' : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
              }`}>
              <Star size={10} fill={watchlisted ? 'currentColor' : 'none'} /> Add to watchlist
            </button>
            <button className="flex-1 flex items-center justify-center gap-1 text-[10px] font-bold py-1.5 rounded border border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground transition">
              <Bell size={10} /> Set alert
            </button>
          </div>

          {/* Pair info */}
          <div className="shrink-0 px-2 py-2 space-y-1.5 border-b border-border text-[10px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pair created</span>
              <span className="font-mono">{info.pairCreated}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pooled {info.symbol}</span>
              <span className="font-mono">{info.pooledToken}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pooled {info.quoteSymbol}</span>
              <span className="font-mono">{info.pooledQuote}</span>
            </div>
            {[
              { label: 'Pair', addr: info.pairAddr },
              { label: info.symbol, addr: info.tokenAddr },
              { label: info.quoteSymbol, addr: info.quoteAddr },
            ].map(({ label, addr }) => (
              <div key={label} className="flex justify-between items-center">
                <span className="text-muted-foreground">{label}</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-foreground">{addr}</span>
                  <button className="text-muted-foreground hover:text-foreground transition"><Copy size={9} /></button>
                </div>
              </div>
            ))}
          </div>

          {/* Trade button */}
          <div className="shrink-0 p-2">
            <button className="w-full flex items-center justify-center gap-1.5 bg-primary/10 border border-primary/40 text-primary text-xs font-bold py-2 rounded hover:bg-primary/20 transition">
              <TrendingUp size={12} /> Trade on {info.dex}
              <ExternalLink size={10} />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
