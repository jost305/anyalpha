import { useState } from 'react';
import { Copy, Check, TrendingUp, TrendingDown, Wallet, Swords, ShieldCheck, Bell, Moon, Sun, ChevronRight, ExternalLink, Settings } from 'lucide-react';

type ProfileTab = 'portfolio' | 'activity' | 'battles' | 'settings';

interface Holding {
  emoji: string;
  name: string;
  pair: string;
  chain: string;
  chainColor: string;
  amount: string;
  value: string;
  pnl: string;
  pnlPct: number;
  allocation: number;
}

interface TxRow {
  type: 'buy' | 'sell' | 'stake' | 'unstake';
  token: string;
  amount: string;
  value: string;
  time: string;
  txHash: string;
  status: 'confirmed' | 'pending';
}

interface Battle {
  opponent: string;
  result: 'win' | 'loss' | 'draw';
  stake: string;
  pnl: string;
  time: string;
  token: string;
}

const HOLDINGS: Holding[] = [
  { emoji: '🐸', name: 'PEPEFUN',  pair: 'PEPE/SOL',   chain: 'SOL',  chainColor: '#9945FF', amount: '1,248,000', value: '$15,481', pnl: '+$4,210', pnlPct: 37.4,  allocation: 32 },
  { emoji: '⚡', name: 'BOLTAI',   pair: 'BOLTAI/SOL', chain: 'SOL',  chainColor: '#9945FF', amount: '84,200',    value: '$9,840',  pnl: '+$2,114', pnlPct: 27.4,  allocation: 20 },
  { emoji: '🎯', name: 'BANTAH',   pair: 'BANTAH/SOL', chain: 'SOL',  chainColor: '#9945FF', amount: '42,100',    value: '$7,212',  pnl: '-$841',   pnlPct: -10.4, allocation: 15 },
  { emoji: '🟣', name: 'NADS',     pair: 'NADS/MON',   chain: 'MONAD', chainColor: '#836EF9', amount: '8,400',    value: '$5,120',  pnl: '+$1,820', pnlPct: 55.1,  allocation: 11 },
  { emoji: '🐉', name: 'DRGN',     pair: 'DRGN/WETH',  chain: 'ARB',  chainColor: '#12AAFF', amount: '2,140',    value: '$4,108',  pnl: '+$342',   pnlPct: 9.1,   allocation: 8  },
  { emoji: '🤖', name: 'AIGEN',    pair: 'AIGEN/ETH',  chain: 'ETH',  chainColor: '#627EEA', amount: '1,820',    value: '$3,211',  pnl: '-$214',   pnlPct: -6.2,  allocation: 7  },
  { emoji: '🐈', name: 'PURR',     pair: 'PURR/HYPE',  chain: 'HYPE', chainColor: '#3CFFBE', amount: '940',      value: '$2,480',  pnl: '+$614',   pnlPct: 32.9,  allocation: 5  },
  { emoji: '💎', name: 'DOGS',     pair: 'DOGS/TON',   chain: 'TON',  chainColor: '#0098EA', amount: '420,000',  value: '$1,240',  pnl: '+$82',    pnlPct: 7.1,   allocation: 2  },
];

const ACTIVITY: TxRow[] = [
  { type: 'buy',     token: 'NADS',    amount: '8,400',    value: '$3,300',  time: '2h ago',   txHash: '7Kea...mp9B', status: 'confirmed' },
  { type: 'sell',    token: 'BANTAH',  amount: '12,000',   value: '$1,604',  time: '5h ago',   txHash: '2Rfa...xQ3D', status: 'confirmed' },
  { type: 'buy',     token: 'PURR',    amount: '940',      value: '$1,866',  time: '8h ago',   txHash: '9Hca...nL7G', status: 'confirmed' },
  { type: 'stake',   token: 'BXBT',    amount: '200',      value: '$200',    time: '1d ago',   txHash: '4Mda...sW2K', status: 'confirmed' },
  { type: 'buy',     token: 'BOLTAI',  amount: '84,200',   value: '$7,726',  time: '2d ago',   txHash: '3Pba...vN8F', status: 'confirmed' },
  { type: 'sell',    token: 'LUNA2',   amount: '21,400',   value: '$4,200',  time: '3d ago',   txHash: '8Qca...tR4E', status: 'confirmed' },
  { type: 'buy',     token: 'DRGN',    amount: '2,140',    value: '$3,766',  time: '4d ago',   txHash: '1Eba...wM6C', status: 'confirmed' },
  { type: 'unstake', token: 'BXBT',    amount: '100',      value: '$100',    time: '5d ago',   txHash: '6Oba...pJ5A', status: 'confirmed' },
];

const BATTLES: Battle[] = [
  { opponent: 'BullBot v3',    result: 'win',  stake: '50 BXBT',  pnl: '+$48',  time: '1h ago',   token: 'PEPEFUN' },
  { opponent: 'SharkMode',     result: 'loss', stake: '30 BXBT',  pnl: '-$29',  time: '6h ago',   token: 'BANTAH'  },
  { opponent: 'T6Agent Pro',   result: 'win',  stake: '100 BXBT', pnl: '+$98',  time: '1d ago',   token: 'NADS'    },
  { opponent: 'MoonCaller',    result: 'win',  stake: '25 BXBT',  pnl: '+$24',  time: '2d ago',   token: 'BOLTAI'  },
  { opponent: 'DiceBot Alpha', result: 'draw', stake: '50 BXBT',  pnl: '$0',    time: '3d ago',   token: 'DRGN'    },
  { opponent: 'FoxAI Trader',  result: 'loss', stake: '75 BXBT',  pnl: '-$74',  time: '5d ago',   token: 'AIGEN'   },
];

const BADGES = [
  { icon: '🏆', label: 'First Win',       earned: true  },
  { icon: '🔥', label: '5-Win Streak',    earned: true  },
  { icon: '💎', label: 'Diamond Hands',   earned: true  },
  { icon: '🤖', label: 'AI Collaborator', earned: true  },
  { icon: '🌊', label: '10 Battles',      earned: true  },
  { icon: '👑', label: 'Top 10',          earned: false },
  { icon: '⚡', label: 'Speed Trader',    earned: false },
  { icon: '🦈', label: 'Megalodon',       earned: false },
];

const TYPE_STYLE = {
  buy:     { label: 'BUY',     color: 'text-green-400',  bg: 'bg-green-400/10'  },
  sell:    { label: 'SELL',    color: 'text-red-400',    bg: 'bg-red-400/10'    },
  stake:   { label: 'STAKE',   color: 'text-blue-400',   bg: 'bg-blue-400/10'   },
  unstake: { label: 'UNSTAKE', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
};

const RESULT_STYLE = {
  win:  { label: 'WIN',  color: 'text-green-400',  bg: 'bg-green-400/10'  },
  loss: { label: 'LOSS', color: 'text-red-400',    bg: 'bg-red-400/10'    },
  draw: { label: 'DRAW', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} className="p-0.5 text-muted-foreground hover:text-foreground transition">
      {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
    </button>
  );
}

export default function ProfilePage() {
  const [tab, setTab]                       = useState<ProfileTab>('portfolio');
  const [notifPrice, setNotifPrice]         = useState(true);
  const [notifBattle, setNotifBattle]       = useState(true);
  const [notifTx, setNotifTx]               = useState(false);
  const [darkMode]                           = useState(true);
  const [showUsd, setShowUsd]               = useState(true);

  const totalValue  = '$48,692';
  const totalPnl    = '+$8,137';
  const totalPnlPct = '+20.1%';
  const wins        = 4;
  const losses      = 2;
  const totalBtls   = 6;
  const winRate     = Math.round((wins / totalBtls) * 100);

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">

      {/* Hero */}
      <div className="shrink-0 border-b border-border bg-gradient-to-b from-primary/5 to-background px-4 py-4">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center text-3xl">
              🎯
            </div>
            <span className="absolute -bottom-1 -right-1 text-base">⚡</span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-black text-lg text-foreground">BantahBro</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-bold border border-primary/30">
                🔥 Veteran
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-semibold">
                Rank #6
              </span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-xs font-mono text-muted-foreground">0xD1f4...7A3C</span>
              <CopyButton text="0xD1f4BCA9217A3C" />
              <button className="p-0.5 text-muted-foreground hover:text-foreground transition">
                <ExternalLink size={11} />
              </button>
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
              <span>Joined <span className="text-foreground font-semibold">Feb 2025</span></span>
              <span>·</span>
              <span><span className="text-foreground font-semibold">84</span> followers</span>
              <span>·</span>
              <span><span className="text-foreground font-semibold">19</span> following</span>
            </div>
          </div>

          {/* Quick stats */}
          <div className="hidden sm:grid grid-cols-4 gap-2 shrink-0">
            {[
              { label: 'Portfolio',  value: totalValue, sub: totalPnlPct, color: 'text-green-400', icon: <Wallet size={12} /> },
              { label: 'Total P&L',  value: totalPnl,   sub: 'all time',  color: 'text-green-400', icon: <TrendingUp size={12} /> },
              { label: 'Win Rate',   value: `${winRate}%`, sub: `${wins}W / ${losses}L`, color: winRate >= 60 ? 'text-green-400' : 'text-yellow-400', icon: <ShieldCheck size={12} /> },
              { label: 'Battles',   value: totalBtls,  sub: `${wins} wins`,  color: 'text-primary', icon: <Swords size={12} /> },
            ].map(s => (
              <div key={s.label} className="text-center border border-border rounded px-3 py-2 bg-card min-w-[80px]">
                <div className={`flex items-center justify-center gap-0.5 mb-0.5 ${s.color}`}>{s.icon}</div>
                <div className={`text-sm font-black ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-muted-foreground">{s.sub}</div>
                <div className="text-[9px] text-muted-foreground mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Badges row */}
        <div className="flex items-center gap-1.5 mt-3 flex-wrap">
          {BADGES.map(b => (
            <span
              key={b.label}
              title={b.label}
              className={`text-xs px-2 py-0.5 rounded border transition ${
                b.earned
                  ? 'border-primary/30 bg-primary/10 text-foreground'
                  : 'border-border bg-muted/30 text-muted-foreground opacity-40'
              }`}
            >
              {b.icon} {b.label}
            </span>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex items-center border-b border-border overflow-x-auto">
        {([
          { key: 'portfolio', label: '💼 Portfolio'   },
          { key: 'activity',  label: '📋 Activity'    },
          { key: 'battles',   label: '⚔️ Battles'    },
          { key: 'settings',  label: '⚙️ Settings'   },
        ] as { key: ProfileTab; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-xs px-4 py-2.5 border-b-2 transition whitespace-nowrap shrink-0 ${
              tab === t.key
                ? 'border-primary text-foreground font-bold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">

        {/* Portfolio */}
        {tab === 'portfolio' && (
          <div>
            {/* Summary bar */}
            <div className="px-4 py-2 border-b border-border flex items-center justify-between bg-muted/20 text-xs">
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">Total Value</span>
                <span className="font-black text-foreground text-sm">{totalValue}</span>
                <span className="text-green-400 font-bold">{totalPnl} ({totalPnlPct})</span>
              </div>
              <button
                onClick={() => setShowUsd(s => !s)}
                className="text-muted-foreground hover:text-foreground border border-border px-2 py-0.5 rounded transition"
              >
                {showUsd ? 'USD' : 'SOL'}
              </button>
            </div>

            {/* Allocation bar */}
            <div className="px-4 py-2 border-b border-border">
              <div className="flex h-2 rounded-full overflow-hidden gap-px">
                {HOLDINGS.map((h, i) => (
                  <div
                    key={h.name}
                    className="h-full transition-all"
                    style={{
                      width: `${h.allocation}%`,
                      backgroundColor: h.chainColor,
                      opacity: 0.7 + i * 0.03,
                    }}
                    title={`${h.name} ${h.allocation}%`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                {HOLDINGS.slice(0, 5).map(h => (
                  <div key={h.name} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: h.chainColor }} />
                    {h.name} {h.allocation}%
                  </div>
                ))}
              </div>
            </div>

            {/* Holdings table */}
            <table className="w-full text-xs border-collapse min-w-[600px]">
              <thead className="sticky top-0 bg-background border-b border-border z-10">
                <tr className="text-muted-foreground text-left">
                  <th className="px-4 py-2 font-medium">Token</th>
                  <th className="px-3 py-2 font-medium text-right">Amount</th>
                  <th className="px-3 py-2 font-medium text-right">Value</th>
                  <th className="px-3 py-2 font-medium text-right">P&amp;L</th>
                  <th className="px-3 py-2 font-medium text-right">Alloc</th>
                </tr>
              </thead>
              <tbody>
                {HOLDINGS.map(h => (
                  <tr key={h.name} className="border-b border-border/40 hover:bg-muted/30 transition cursor-pointer">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-lg leading-none">{h.emoji}</span>
                        <div>
                          <div className="font-bold text-foreground flex items-center gap-1">
                            {h.pair}
                            <span className="text-[8px] px-1 py-0.5 rounded font-semibold text-white" style={{ backgroundColor: h.chainColor }}>
                              {h.chain}
                            </span>
                          </div>
                          <div className="text-[10px] text-muted-foreground">{h.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{h.amount}</td>
                    <td className="px-3 py-2.5 text-right font-bold font-mono text-foreground">{h.value}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className={`font-bold font-mono ${h.pnlPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {h.pnl}
                      </div>
                      <div className={`text-[10px] ${h.pnlPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {h.pnlPct >= 0 ? '+' : ''}{h.pnlPct}%
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-primary/60" style={{ width: `${h.allocation * 3}%` }} />
                        </div>
                        <span className="text-muted-foreground font-mono">{h.allocation}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Activity */}
        {tab === 'activity' && (
          <div>
            <div className="px-4 py-2 border-b border-border bg-muted/20 text-xs flex items-center justify-between">
              <span className="text-muted-foreground">{ACTIVITY.length} transactions</span>
              <button className="text-primary hover:underline flex items-center gap-1">View on-chain <ExternalLink size={10} /></button>
            </div>
            <div className="divide-y divide-border/40">
              {ACTIVITY.map((tx, i) => {
                const st = TYPE_STYLE[tx.type];
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-black ${st.bg} ${st.color}`}>
                      {st.label[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${st.bg} ${st.color}`}>{st.label}</span>
                        <span className="text-xs font-bold text-foreground">{tx.token}</span>
                        <span className="text-[10px] text-muted-foreground">{tx.amount}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                        <span className="font-mono">{tx.txHash}</span>
                        <span className={tx.status === 'confirmed' ? 'text-green-400' : 'text-yellow-400'}>
                          {tx.status === 'confirmed' ? '✓ confirmed' : '⏳ pending'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold text-foreground">{tx.value}</div>
                      <div className="text-[10px] text-muted-foreground">{tx.time}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Battles */}
        {tab === 'battles' && (
          <div>
            <div className="px-4 py-2 border-b border-border bg-muted/20 flex items-center gap-4 text-xs">
              <span className="text-muted-foreground">{totalBtls} battles</span>
              <span className="text-green-400 font-bold">{wins}W</span>
              <span className="text-red-400 font-bold">{losses}L</span>
              <span className="text-yellow-400 font-bold">1D</span>
              <span className="ml-auto text-muted-foreground">Win rate: <span className="text-foreground font-bold">{winRate}%</span></span>
            </div>
            <div className="divide-y divide-border/40">
              {BATTLES.map((b, i) => {
                const rs = RESULT_STYLE[b.result];
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition">
                    <Swords size={16} className={rs.color} />
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${rs.bg} ${rs.color}`}>{rs.label}</span>
                        <span className="font-bold text-foreground">vs {b.opponent}</span>
                        <span className="text-muted-foreground">on {b.token}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Stake: {b.stake} · {b.time}</div>
                    </div>
                    <div className={`text-right text-sm font-black font-mono ${b.result === 'win' ? 'text-green-400' : b.result === 'loss' ? 'text-red-400' : 'text-yellow-400'}`}>
                      {b.pnl}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Settings */}
        {tab === 'settings' && (
          <div className="max-w-lg px-4 py-4 space-y-4">

            {/* Account */}
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-muted/30 text-xs font-bold text-muted-foreground uppercase tracking-wider border-b border-border flex items-center gap-1.5">
                <Wallet size={11} /> Account
              </div>
              <div className="divide-y divide-border/40">
                {[
                  { label: 'Display Name', value: 'BantahBro' },
                  { label: 'Connected Wallet', value: '0xD1f4...7A3C' },
                  { label: 'Network', value: 'Solana Mainnet' },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 cursor-pointer">
                    <span className="text-xs text-muted-foreground">{row.label}</span>
                    <div className="flex items-center gap-1 text-xs text-foreground font-medium">
                      {row.value}
                      <ChevronRight size={11} className="text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Notifications */}
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-muted/30 text-xs font-bold text-muted-foreground uppercase tracking-wider border-b border-border flex items-center gap-1.5">
                <Bell size={11} /> Notifications
              </div>
              <div className="divide-y divide-border/40">
                {[
                  { label: 'Price Alerts',      sub: 'Notify me when prices cross my targets', val: notifPrice,  set: setNotifPrice  },
                  { label: 'Battle Updates',    sub: 'Battle start, result, and stake events',  val: notifBattle, set: setNotifBattle },
                  { label: 'Transactions',      sub: 'Confirm swaps, stakes, and transfers',    val: notifTx,     set: setNotifTx     },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <div className="text-xs font-medium text-foreground">{row.label}</div>
                      <div className="text-[10px] text-muted-foreground">{row.sub}</div>
                    </div>
                    <button
                      onClick={() => row.set(v => !v)}
                      className={`w-9 h-5 rounded-full transition-colors relative ${row.val ? 'bg-primary' : 'bg-muted'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${row.val ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Display */}
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-muted/30 text-xs font-bold text-muted-foreground uppercase tracking-wider border-b border-border flex items-center gap-1.5">
                <Settings size={11} /> Display
              </div>
              <div className="divide-y divide-border/40">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <div className="text-xs font-medium text-foreground">Theme</div>
                    <div className="text-[10px] text-muted-foreground">Dark / Light mode</div>
                  </div>
                  <div className="flex items-center gap-1 border border-border rounded px-2 py-1 text-xs text-muted-foreground">
                    {darkMode ? <Moon size={11} /> : <Sun size={11} />}
                    {darkMode ? 'Dark' : 'Light'}
                  </div>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <div className="text-xs font-medium text-foreground">Currency Display</div>
                    <div className="text-[10px] text-muted-foreground">Show values in USD or native token</div>
                  </div>
                  <button
                    onClick={() => setShowUsd(s => !s)}
                    className={`w-9 h-5 rounded-full transition-colors relative ${showUsd ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${showUsd ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Danger zone */}
            <div className="border border-destructive/30 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-destructive/5 text-xs font-bold text-destructive uppercase tracking-wider border-b border-destructive/20">
                Danger Zone
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-foreground">Disconnect Wallet</div>
                  <div className="text-[10px] text-muted-foreground">Remove wallet connection from Terminal6</div>
                </div>
                <button className="text-xs px-3 py-1.5 border border-destructive/50 text-destructive rounded hover:bg-destructive/10 transition">
                  Disconnect
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
