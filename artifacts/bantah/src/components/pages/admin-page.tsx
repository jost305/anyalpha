import { useState } from 'react';
import {
  BarChart3, Users, Star, Gift, Zap, List, Search, X,
  Pin, PinOff, Check, Ban, Send, RefreshCw, TrendingUp,
  TrendingDown, Eye, ChevronDown, ChevronUp, Activity,
  Shield, Globe, Clock, DollarSign, Flame, Bell, Copy,
} from 'lucide-react';

/* ─────────────────────────── types ─────────────────────────── */

type AdminTab = 'overview' | 'users' | 'coins' | 'rewards' | 'runners' | 'listings';

/* ─────────────────────────── mock data ─────────────────────── */

const USERS = [
  { id: 1,  emoji: '🎯', name: 'AlphaTrader',  wallet: '0xD1f4...7A3C', points: 4_820, rank: 6,  battles: 6,  status: 'active',  joined: '3mo ago',  volume: '$48.7K' },
  { id: 2,  emoji: '👑', name: 'CryptoWhale',  wallet: '0xF1a2...9B4C', points: 9_100, rank: 1,  battles: 47, status: 'active',  joined: '8mo ago',  volume: '$4.2M'  },
  { id: 3,  emoji: '🤖', name: 'BullBot v3',   wallet: '0xA9e1...3D7F', points: 7_840, rank: 2,  battles: 92, status: 'active',  joined: '5mo ago',  volume: '$2.8M'  },
  { id: 4,  emoji: '🐳', name: 'DeepDiver',    wallet: '0xC4b3...8E2A', points: 6_210, rank: 3,  battles: 31, status: 'active',  joined: '6mo ago',  volume: '$3.1M'  },
  { id: 5,  emoji: '🦈', name: 'SharkMode',    wallet: '0x7Ea9...1C5D', points: 5_540, rank: 4,  battles: 24, status: 'active',  joined: '4mo ago',  volume: '$1.9M'  },
  { id: 6,  emoji: '⚡', name: 'T6Agent Pro',  wallet: '0xB2c7...4F8E', points: 5_140, rank: 5,  battles: 68, status: 'active',  joined: '2mo ago',  volume: '$1.4M'  },
  { id: 7,  emoji: '🎲', name: 'DiceBot',      wallet: '0x9Fd3...1B7E', points: 3_210, rank: 11, battles: 44, status: 'warning', joined: '1mo ago',  volume: '$341K'  },
  { id: 8,  emoji: '🌊', name: 'WaveRider',    wallet: '0x2Ac6...8D4F', points: 2_880, rank: 10, battles: 8,  status: 'active',  joined: '2mo ago',  volume: '$418K'  },
  { id: 9,  emoji: '💀', name: '0xScammer99',  wallet: '0xDEAD...BEEF', points: 120,   rank: 98, battles: 2,  status: 'banned',  joined: '2wk ago',  volume: '$4K'    },
  { id: 10, emoji: '🔮', name: 'OracleBot',    wallet: '0x1He4...7C5A', points: 2_100, rank: 14, battles: 38, status: 'active',  joined: '3mo ago',  volume: '$174K'  },
];

const COINS = [
  { id: 1,  emoji: '🐸', name: 'PEPEFUN',  pair: 'PEPE/SOL',   chain: 'SOL',   mcap: '$12.4M', change: -14.5, pinned: true,  hot: true,  vol: '$986K' },
  { id: 2,  emoji: '⚡', name: 'BOLTAI',   pair: 'BOLT/SOL',   chain: 'SOL',   mcap: '$532K',  change: -13.0, pinned: true,  hot: false, vol: '$8.7M' },
  { id: 3,  emoji: '🎯', name: 'BANTAH',   pair: 'BAN/SOL',    chain: 'SOL',   mcap: '$8.9M',  change: +2.1,  pinned: false, hot: true,  vol: '$1.2M' },
  { id: 4,  emoji: '🟣', name: 'NADS',     pair: 'NADS/MON',   chain: 'MONAD', mcap: '$4.1M',  change: +8.4,  pinned: false, hot: true,  vol: '$640K' },
  { id: 5,  emoji: '🐉', name: 'DRGN',     pair: 'DRGN/WETH',  chain: 'ARB',   mcap: '$2.5B',  change: +0.3,  pinned: false, hot: false, vol: '$4.5M' },
  { id: 6,  emoji: '🤖', name: 'AIGEN',    pair: 'AIGEN/ETH',  chain: 'ETH',   mcap: '$5.2M',  change: -14.5, pinned: true,  hot: false, vol: '$986K' },
  { id: 7,  emoji: '🌙', name: 'LUNA2',    pair: 'LUNA2/SOL',  chain: 'SOL',   mcap: '$3.8M',  change: -3.5,  pinned: false, hot: false, vol: '$3M'   },
  { id: 8,  emoji: '💎', name: 'DOGS',     pair: 'DOGS/TON',   chain: 'TON',   mcap: '$1.1B',  change: +1.2,  pinned: false, hot: true,  vol: '$12M'  },
];

const LISTINGS = [
  { id: 1,  emoji: '🦄', name: 'UNICORN',  pair: 'UNI/SOL',  chain: 'SOL',   submittedBy: 'CryptoWhale',  time: '12m ago',  status: 'pending',  source: 'user',   mcap: '$240K',  desc: 'New Solana meme with unicorn theme'     },
  { id: 2,  emoji: '🐙', name: 'OKTO',     pair: 'OKTO/ETH', chain: 'ETH',   submittedBy: 'API Fetch',    time: '34m ago',  status: 'pending',  source: 'api',    mcap: '$1.2M',  desc: 'Trending on Uniswap, 3x vol spike'      },
  { id: 3,  emoji: '🌵', name: 'CACTUS',   pair: 'CACT/SOL', chain: 'SOL',   submittedBy: 'DeepDiver',   time: '1h ago',   status: 'approved', source: 'user',   mcap: '$89K',   desc: 'Community meme token, 2k holders'       },
  { id: 4,  emoji: '🔥', name: 'INFERNO',  pair: 'INF/BASE', chain: 'BASE',  submittedBy: 'API Fetch',    time: '2h ago',   status: 'pending',  source: 'api',    mcap: '$540K',  desc: 'Base chain newcomer, hot on Dexscreener' },
  { id: 5,  emoji: '🧊', name: 'ICELORD',  pair: 'ICE/ARB',  chain: 'ARB',   submittedBy: 'SharkMode',   time: '3h ago',   status: 'rejected', source: 'user',   mcap: '$12K',   desc: 'Low liquidity, potential rug flag'      },
  { id: 6,  emoji: '🦋', name: 'BUTRFLY',  pair: 'BTF/SOL',  chain: 'SOL',   submittedBy: 'API Fetch',    time: '4h ago',   status: 'pending',  source: 'api',    mcap: '$310K',  desc: 'Volume up 400% last 2h'                },
  { id: 7,  emoji: '🧬', name: 'GENEX',    pair: 'GNX/ETH',  chain: 'ETH',   submittedBy: 'WaveRider',   time: '5h ago',   status: 'pending',  source: 'user',   mcap: '$75K',   desc: 'AI-generated art NFT meme crossover'   },
];

const RUNNERS = [
  { emoji: '🟣', name: 'NADS',    chain: 'MONAD', gain: '+412%', vol: '$2.1M', age: '4h',  holders: 3_241, txns: 18_400 },
  { emoji: '🔥', name: 'INFERNO', chain: 'BASE',  gain: '+284%', vol: '$940K', age: '2h',  holders: 1_820, txns: 9_200  },
  { emoji: '🦋', name: 'BUTRFLY', chain: 'SOL',   gain: '+198%', vol: '$640K', age: '6h',  holders: 2_100, txns: 12_100 },
  { emoji: '🐙', name: 'OKTO',    chain: 'ETH',   gain: '+144%', vol: '$1.4M', age: '1h',  holders: 880,   txns: 4_400  },
  { emoji: '🧬', name: 'GENEX',   chain: 'ETH',   gain: '+91%',  vol: '$310K', age: '8h',  holders: 540,   txns: 2_800  },
  { emoji: '🌵', name: 'CACTUS',  chain: 'SOL',   gain: '+74%',  vol: '$210K', age: '12h', holders: 2_010, txns: 8_900  },
];

const REWARD_HISTORY = [
  { user: 'CryptoWhale', emoji: '👑', points: 500,  reason: 'Top trader bonus',    time: '1h ago'  },
  { user: 'AlphaTrader', emoji: '🎯', points: 200,  reason: 'Beta feedback',       time: '3h ago'  },
  { user: 'BullBot v3',  emoji: '🤖', points: 1000, reason: 'AI battle milestone', time: '1d ago'  },
  { user: 'DeepDiver',   emoji: '🐳', points: 350,  reason: 'Referral bonus',      time: '2d ago'  },
  { user: 'SharkMode',   emoji: '🦈', points: 250,  reason: 'Community event',     time: '3d ago'  },
];

const ACTIVITY_FEED = [
  { icon: '👤', msg: 'New user registered: WaveRider',                      time: '2m ago',  color: 'text-blue-400'   },
  { icon: '🏆', msg: 'Battle completed: AlphaTrader vs SharkMode',          time: '4m ago',  color: 'text-yellow-400' },
  { icon: '📋', msg: 'New listing submitted: UNICORN (user)',                time: '12m ago', color: 'text-purple-400' },
  { icon: '📡', msg: 'API fetch: OKTO trending on Uniswap',                 time: '34m ago', color: 'text-cyan-400'   },
  { icon: '⚠️', msg: 'DiceBot flagged for suspicious volume pattern',       time: '45m ago', color: 'text-orange-400' },
  { icon: '🎁', msg: 'Reward sent: BullBot v3 received 1,000 pts',          time: '1h ago',  color: 'text-green-400'  },
  { icon: '📌', msg: 'Coin pinned: PEPEFUN by admin',                       time: '2h ago',  color: 'text-primary'    },
  { icon: '🚫', msg: 'User banned: 0xScammer99 (rug attempt)',               time: '3h ago',  color: 'text-red-400'    },
];

/* ─────────────────────────── helpers ───────────────────────── */

const STATUS_STYLE = {
  active:  { dot: 'bg-green-400',  text: 'text-green-400',  label: 'Active'  },
  warning: { dot: 'bg-yellow-400', text: 'text-yellow-400', label: 'Warning' },
  banned:  { dot: 'bg-red-400',    text: 'text-red-400',    label: 'Banned'  },
};

const LISTING_STATUS = {
  pending:  { bg: 'bg-yellow-400/10', text: 'text-yellow-400', label: 'Pending'  },
  approved: { bg: 'bg-green-400/10',  text: 'text-green-400',  label: 'Approved' },
  rejected: { bg: 'bg-red-400/10',    text: 'text-red-400',    label: 'Rejected' },
};

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="border border-border rounded-lg px-4 py-3 bg-card flex items-start gap-3">
      <div className={`p-2 rounded-lg ${color} bg-current/10`}>
        <div className="opacity-100" style={{ color: 'inherit' }}>{icon}</div>
      </div>
      <div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="text-xl font-black text-foreground">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

/* ─────────────────────────── tabs ──────────────────────────── */

function OverviewTab() {
  return (
    <div className="p-4 space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Users size={16} />}      label="Total Users"     value="1,284"   sub="+14 today"         color="text-blue-400"   />
        <StatCard icon={<Eye size={16} />}         label="24h Visitors"   value="8,941"   sub="+22% vs yesterday" color="text-purple-400" />
        <StatCard icon={<Activity size={16} />}    label="Active Sessions" value="342"    sub="right now"         color="text-green-400"  />
        <StatCard icon={<DollarSign size={16} />}  label="24h Volume"     value="$2.45B"  sub="across all chains" color="text-yellow-400" />
        <StatCard icon={<Flame size={16} />}       label="Battles Today"  value="284"     sub="68% decided"       color="text-orange-400" />
        <StatCard icon={<Bell size={16} />}        label="Alerts Sent"    value="1,840"   sub="last 24h"          color="text-cyan-400"   />
        <StatCard icon={<List size={16} />}        label="New Listings"   value="7"       sub="5 pending review"  color="text-pink-400"   />
        <StatCard icon={<Gift size={16} />}        label="Rewards Sent"   value="6,200"   sub="pts this week"     color="text-emerald-400"/>
      </div>

      {/* Activity feed + quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Activity feed */}
        <div className="md:col-span-2 border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-muted/30 border-b border-border text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Activity size={11} /> Live Activity
          </div>
          <div className="divide-y divide-border/40">
            {ACTIVITY_FEED.map((a, i) => (
              <div key={i} className="flex items-start gap-2 px-4 py-2 text-xs">
                <span className="text-base leading-none mt-0.5">{a.icon}</span>
                <span className={`flex-1 ${a.color}`}>{a.msg}</span>
                <span className="text-muted-foreground whitespace-nowrap shrink-0">{a.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-muted/30 border-b border-border text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Zap size={11} /> Quick Actions
          </div>
          <div className="p-3 space-y-2">
            {[
              { icon: <RefreshCw size={13} />,  label: 'Refresh API Listings',    color: 'text-blue-400'   },
              { icon: <Bell size={13} />,        label: 'Broadcast Announcement',  color: 'text-yellow-400' },
              { icon: <Pin size={13} />,         label: 'Manage Pinned Coins',     color: 'text-purple-400' },
              { icon: <Gift size={13} />,        label: 'Send Bulk Rewards',       color: 'text-green-400'  },
              { icon: <Ban size={13} />,         label: 'Review Flagged Accounts', color: 'text-red-400'    },
              { icon: <BarChart3 size={13} />,   label: 'Export Analytics CSV',    color: 'text-cyan-400'   },
            ].map(a => (
              <button key={a.label} className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded border border-border hover:bg-muted/40 transition text-left">
                <span className={a.color}>{a.icon}</span>
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Traffic sparkline (simulated bars) */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-muted/30 border-b border-border text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Globe size={11} /> Visitor Traffic — Last 24 Hours
        </div>
        <div className="px-4 py-3 flex items-end gap-1 h-20">
          {[28,34,40,30,22,18,14,20,38,55,70,82,90,88,75,68,80,92,100,96,84,72,60,48].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t transition"
              style={{
                height: `${h}%`,
                backgroundColor: h > 80 ? 'oklch(0.7 0.2 140)' : h > 50 ? 'oklch(0.6 0.15 240)' : 'oklch(0.5 0.05 240)',
                opacity: 0.7,
              }}
              title={`${h * 90} visitors`}
            />
          ))}
        </div>
        <div className="px-4 pb-2 flex justify-between text-[10px] text-muted-foreground">
          <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>now</span>
        </div>
      </div>
    </div>
  );
}

function UsersTab() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all'|'active'|'warning'|'banned'>('all');
  const [sortKey, setSortKey] = useState<'points'|'rank'|'battles'>('points');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');
  const [rewardUser, setRewardUser] = useState<number|null>(null);
  const [rewardAmt, setRewardAmt] = useState('');

  const filtered = USERS
    .filter(u => statusFilter === 'all' || u.status === statusFilter)
    .filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.wallet.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const v = sortDir === 'desc' ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey];
      return v;
    });

  const toggle = (k: typeof sortKey) => {
    if (sortKey === k) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  const SortIcon = ({ k }: { k: typeof sortKey }) =>
    sortKey === k ? (sortDir === 'desc' ? <ChevronDown size={10} /> : <ChevronUp size={10} />) : null;

  return (
    <div className="p-4 space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 bg-input rounded px-2 py-1.5 flex-1 min-w-[160px]">
          <Search size={13} className="text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users..." className="bg-transparent text-xs outline-none flex-1 placeholder:text-muted-foreground" />
          {search && <button onClick={() => setSearch('')}><X size={11} className="text-muted-foreground" /></button>}
        </div>
        {(['all','active','warning','banned'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`text-xs px-2.5 py-1.5 rounded border transition capitalize ${statusFilter === s ? 'bg-primary/10 border-primary text-primary font-bold' : 'border-border text-muted-foreground hover:text-foreground'}`}>
            {s}
          </button>
        ))}
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} users</span>
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-xs border-collapse min-w-[700px]">
          <thead className="bg-muted/30 border-b border-border">
            <tr className="text-muted-foreground text-left">
              <th className="px-4 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium text-right cursor-pointer hover:text-foreground" onClick={() => toggle('points')}>
                <span className="flex items-center justify-end gap-0.5">Points <SortIcon k="points" /></span>
              </th>
              <th className="px-3 py-2 font-medium text-right cursor-pointer hover:text-foreground" onClick={() => toggle('rank')}>
                <span className="flex items-center justify-end gap-0.5">Rank <SortIcon k="rank" /></span>
              </th>
              <th className="px-3 py-2 font-medium text-right cursor-pointer hover:text-foreground" onClick={() => toggle('battles')}>
                <span className="flex items-center justify-end gap-0.5">Battles <SortIcon k="battles" /></span>
              </th>
              <th className="px-3 py-2 font-medium text-right">Volume</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Joined</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => {
              const st = STATUS_STYLE[u.status as keyof typeof STATUS_STYLE];
              return (
                <tr key={u.id} className="border-b border-border/40 hover:bg-muted/20 transition">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-lg leading-none">{u.emoji}</span>
                      <div>
                        <div className="font-bold text-foreground">{u.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-0.5">
                          {u.wallet}
                          <button className="opacity-50 hover:opacity-100"><Copy size={9} /></button>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold font-mono text-primary">{u.points.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">#{u.rank}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{u.battles}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{u.volume}</td>
                  <td className="px-3 py-2.5">
                    <span className={`flex items-center gap-1 text-[10px] font-semibold ${st.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{u.joined}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button title="Send reward" onClick={() => setRewardUser(rewardUser === u.id ? null : u.id)} className="p-1 rounded hover:bg-green-400/10 text-green-400 transition"><Gift size={12} /></button>
                      <button title={u.status === 'banned' ? 'Unban' : 'Ban'} className={`p-1 rounded transition ${u.status === 'banned' ? 'hover:bg-green-400/10 text-green-400' : 'hover:bg-red-400/10 text-red-400'}`}>
                        {u.status === 'banned' ? <Check size={12} /> : <Ban size={12} />}
                      </button>
                    </div>
                    {/* Inline reward form */}
                    {rewardUser === u.id && (
                      <div className="mt-1 flex items-center gap-1">
                        <input value={rewardAmt} onChange={e => setRewardAmt(e.target.value)} placeholder="pts" className="w-16 bg-input rounded px-1.5 py-0.5 text-[10px] outline-none border border-border" />
                        <button onClick={() => { setRewardUser(null); setRewardAmt(''); }} className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition">
                          Send
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CoinsTab() {
  const [coins, setCoins] = useState(COINS);
  const [search, setSearch] = useState('');

  const togglePin = (id: number) => setCoins(cs => cs.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c));

  const visible = coins.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-input rounded px-2 py-1.5 flex-1 max-w-xs">
          <Search size={13} className="text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search coins..." className="bg-transparent text-xs outline-none flex-1 placeholder:text-muted-foreground" />
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          <span className="text-primary font-bold">{coins.filter(c => c.pinned).length}</span> pinned · {coins.length} total
        </div>
      </div>

      {/* Pinned section */}
      {coins.some(c => c.pinned) && (
        <div className="border border-primary/20 rounded-lg overflow-hidden bg-primary/5">
          <div className="px-4 py-2 border-b border-primary/20 text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
            <Pin size={11} /> Pinned Coins
          </div>
          <div className="divide-y divide-border/30">
            {coins.filter(c => c.pinned).map(c => (
              <CoinRow key={c.id} coin={c} onTogglePin={() => togglePin(c.id)} />
            ))}
          </div>
        </div>
      )}

      {/* All coins */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-muted/30 border-b border-border text-xs font-bold text-muted-foreground uppercase tracking-wider">
          All Tracked Coins
        </div>
        <div className="divide-y divide-border/40">
          {visible.map(c => (
            <CoinRow key={c.id} coin={c} onTogglePin={() => togglePin(c.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CoinRow({ coin, onTogglePin }: { coin: typeof COINS[0]; onTogglePin: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition text-xs">
      <span className="text-xl leading-none">{coin.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-foreground">{coin.pair}</span>
          <span className="text-[9px] px-1 py-0.5 rounded font-semibold text-white bg-muted-foreground/40">{coin.chain}</span>
          {coin.hot && <span className="text-[9px] px-1 py-0.5 rounded bg-orange-400/20 text-orange-400 font-semibold">🔥 HOT</span>}
          {coin.pinned && <span className="text-[9px] px-1 py-0.5 rounded bg-primary/20 text-primary font-semibold">📌 PINNED</span>}
        </div>
        <div className="text-muted-foreground">{coin.name} · {coin.mcap} mcap · {coin.vol} vol</div>
      </div>
      <span className={`font-mono font-bold w-16 text-right ${coin.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {coin.change >= 0 ? '+' : ''}{coin.change}%
      </span>
      <button onClick={onTogglePin} title={coin.pinned ? 'Unpin' : 'Pin'} className={`p-1.5 rounded transition ${coin.pinned ? 'text-primary hover:bg-primary/10' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'}`}>
        {coin.pinned ? <PinOff size={14} /> : <Pin size={14} />}
      </button>
    </div>
  );
}

function RewardsTab() {
  const [toUser, setToUser]     = useState('');
  const [points, setPoints]     = useState('');
  const [reason, setReason]     = useState('');
  const [sent, setSent]         = useState(false);
  const [history, setHistory]   = useState(REWARD_HISTORY);

  const handleSend = () => {
    if (!toUser || !points) return;
    setHistory(h => [{ user: toUser, emoji: '🎁', points: parseInt(points) || 0, reason: reason || 'Admin reward', time: 'just now' }, ...h]);
    setToUser(''); setPoints(''); setReason('');
    setSent(true);
    setTimeout(() => setSent(false), 2000);
  };

  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Send reward form */}
      <div className="space-y-3">
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-muted/30 border-b border-border text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Send size={11} /> Send Reward
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">To User / Wallet</label>
              <input value={toUser} onChange={e => setToUser(e.target.value)} placeholder="Username or 0x address..." className="w-full bg-input rounded px-3 py-2 text-xs outline-none border border-border focus:border-primary/50 transition" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Points Amount</label>
              <input value={points} onChange={e => setPoints(e.target.value)} type="number" placeholder="e.g. 500" className="w-full bg-input rounded px-3 py-2 text-xs outline-none border border-border focus:border-primary/50 transition" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Reason (optional)</label>
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Top trader bonus" className="w-full bg-input rounded px-3 py-2 text-xs outline-none border border-border focus:border-primary/50 transition" />
            </div>
            <button onClick={handleSend} className={`w-full py-2 rounded text-xs font-bold transition flex items-center justify-center gap-1.5 ${sent ? 'bg-green-500/20 text-green-400' : 'bg-primary text-primary-foreground hover:opacity-90'}`}>
              {sent ? <><Check size={13} /> Sent!</> : <><Send size={13} /> Send Reward</>}
            </button>
          </div>
        </div>

        {/* Points leaderboard */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-muted/30 border-b border-border text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Star size={11} /> Points Leaderboard
          </div>
          <div className="divide-y divide-border/40">
            {USERS.slice().sort((a, b) => b.points - a.points).map((u, i) => (
              <div key={u.id} className="flex items-center gap-2 px-4 py-2 text-xs hover:bg-muted/20 transition">
                <span className="text-muted-foreground font-mono w-4 text-right">{i + 1}</span>
                <span className="text-base leading-none">{u.emoji}</span>
                <span className="flex-1 font-medium text-foreground">{u.name}</span>
                <span className="font-black text-primary font-mono">{u.points.toLocaleString()} pts</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reward history */}
      <div className="border border-border rounded-lg overflow-hidden h-fit">
        <div className="px-4 py-2 bg-muted/30 border-b border-border text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Clock size={11} /> Reward History
        </div>
        <div className="divide-y divide-border/40">
          {history.map((r, i) => (
            <div key={i} className="flex items-center gap-2 px-4 py-2.5 text-xs hover:bg-muted/20 transition">
              <span className="text-base leading-none">{r.emoji}</span>
              <div className="flex-1">
                <div className="font-bold text-foreground">{r.user}</div>
                <div className="text-muted-foreground">{r.reason}</div>
              </div>
              <div className="text-right">
                <div className="font-black text-green-400 font-mono">+{r.points.toLocaleString()} pts</div>
                <div className="text-[10px] text-muted-foreground">{r.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RunnersTab() {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Flame size={13} className="text-orange-400" />
        <span>Tokens with highest % gain in the last 24h — updated every 60s</span>
        <button className="ml-auto flex items-center gap-1 border border-border px-2 py-1 rounded hover:bg-muted/40 transition">
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-xs border-collapse min-w-[600px]">
          <thead className="bg-muted/30 border-b border-border">
            <tr className="text-muted-foreground text-left">
              <th className="px-4 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Token</th>
              <th className="px-3 py-2 font-medium text-right">Gain</th>
              <th className="px-3 py-2 font-medium text-right">Volume</th>
              <th className="px-3 py-2 font-medium text-right">Age</th>
              <th className="px-3 py-2 font-medium text-right">Holders</th>
              <th className="px-3 py-2 font-medium text-right">TXNs</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {RUNNERS.map((r, i) => (
              <tr key={r.name} className="border-b border-border/40 hover:bg-muted/20 transition">
                <td className="px-4 py-3 text-muted-foreground font-mono">{i + 1}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl leading-none">{r.emoji}</span>
                    <div>
                      <div className="font-bold text-foreground flex items-center gap-1">
                        {r.name}
                        <span className="text-[8px] px-1 py-0.5 rounded text-white bg-muted-foreground/50">{r.chain}</span>
                      </div>
                      <div className="text-[10px] text-orange-400 flex items-center gap-0.5"><Flame size={9} /> Runner</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-right">
                  <span className="font-black text-green-400 font-mono">{r.gain}</span>
                </td>
                <td className="px-3 py-3 text-right font-mono text-muted-foreground">{r.vol}</td>
                <td className="px-3 py-3 text-right font-mono text-muted-foreground">{r.age}</td>
                <td className="px-3 py-3 text-right font-mono text-muted-foreground">{r.holders.toLocaleString()}</td>
                <td className="px-3 py-3 text-right font-mono text-muted-foreground">{r.txns.toLocaleString()}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button title="Pin to top" className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition"><Pin size={13} /></button>
                    <button title="Feature" className="p-1.5 rounded hover:bg-yellow-400/10 text-muted-foreground hover:text-yellow-400 transition"><Star size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ListingsTab() {
  const [listings, setListings] = useState(LISTINGS);
  const [filter, setFilter]     = useState<'all'|'pending'|'approved'|'rejected'>('all');

  const updateStatus = (id: number, status: 'approved'|'rejected') => {
    setListings(ls => ls.map(l => l.id === id ? { ...l, status } : l));
  };

  const visible = listings.filter(l => filter === 'all' || l.status === filter);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <RefreshCw size={11} /> Last API fetch: <span className="text-foreground">2 min ago</span>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          {(['all','pending','approved','rejected'] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)} className={`text-xs px-2.5 py-1.5 rounded border capitalize transition ${filter === s ? 'bg-primary/10 border-primary text-primary font-bold' : 'border-border text-muted-foreground hover:text-foreground'}`}>
              {s} {s !== 'all' && <span className="ml-0.5 opacity-60">({listings.filter(l => l.status === s).length})</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {visible.map(l => {
          const st = LISTING_STATUS[l.status as keyof typeof LISTING_STATUS];
          return (
            <div key={l.id} className="border border-border rounded-lg p-3 hover:bg-muted/10 transition">
              <div className="flex items-start gap-3">
                <span className="text-2xl leading-none mt-0.5">{l.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-foreground">{l.pair}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded text-white bg-muted-foreground/40">{l.chain}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${st.bg} ${st.text}`}>{st.label}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${l.source === 'api' ? 'bg-blue-400/10 text-blue-400' : 'bg-purple-400/10 text-purple-400'}`}>
                      {l.source === 'api' ? '📡 API' : '👤 User'}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{l.desc}</div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                    <span>MCap: <span className="text-foreground">{l.mcap}</span></span>
                    <span>By: <span className="text-foreground">{l.submittedBy}</span></span>
                    <span>{l.time}</span>
                  </div>
                </div>
                {l.status === 'pending' && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => updateStatus(l.id, 'approved')} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded bg-green-400/10 text-green-400 hover:bg-green-400/20 border border-green-400/20 transition font-semibold">
                      <Check size={11} /> Approve
                    </button>
                    <button onClick={() => updateStatus(l.id, 'rejected')} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded bg-red-400/10 text-red-400 hover:bg-red-400/20 border border-red-400/20 transition font-semibold">
                      <X size={11} /> Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────── main ──────────────────────────── */

const TABS: { key: AdminTab; icon: React.ReactNode; label: string; badge?: number }[] = [
  { key: 'overview',  icon: <BarChart3 size={13} />, label: 'Overview'                           },
  { key: 'users',     icon: <Users size={13} />,     label: 'Users',    badge: USERS.length       },
  { key: 'coins',     icon: <Star size={13} />,      label: 'Coins'                              },
  { key: 'rewards',   icon: <Gift size={13} />,      label: 'Rewards'                            },
  { key: 'runners',   icon: <Flame size={13} />,     label: 'Runners',  badge: RUNNERS.length     },
  { key: 'listings',  icon: <List size={13} />,      label: 'Listings', badge: LISTINGS.filter(l => l.status === 'pending').length },
];

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('overview');

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-4 py-2.5 border-b border-border flex items-center gap-3 bg-card">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-primary" />
          <span className="font-black text-sm">Admin Panel</span>
          <span className="text-[10px] px-2 py-0.5 border border-border rounded text-muted-foreground font-mono">INTERNAL</span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block animate-pulse" /> Live</span>
          <span>anyAlpha v0.9.0</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex items-center border-b border-border overflow-x-auto bg-muted/10">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 text-xs px-4 py-2.5 border-b-2 transition whitespace-nowrap shrink-0 ${
              tab === t.key
                ? 'border-primary text-foreground font-bold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.icon}
            {t.label}
            {t.badge != null && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${tab === t.key ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'overview'  && <OverviewTab />}
        {tab === 'users'     && <UsersTab />}
        {tab === 'coins'     && <CoinsTab />}
        {tab === 'rewards'   && <RewardsTab />}
        {tab === 'runners'   && <RunnersTab />}
        {tab === 'listings'  && <ListingsTab />}
      </div>
    </div>
  );
}
