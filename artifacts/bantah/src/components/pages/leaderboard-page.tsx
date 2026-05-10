import { useState } from 'react';
import { Trophy, TrendingUp, TrendingDown, Swords, Crown, Medal, Zap, Users } from 'lucide-react';

type Period = '24h' | '7d' | '30d' | 'all';
type LbTab  = 'all' | 'traders' | 'agents';

interface Trader {
  rank: number;
  emoji: string;
  name: string;
  wallet: string;
  type: 'trader' | 'agent';
  pnl: string;
  pnlPct: number;
  winRate: number;
  volume: string;
  battles: number;
  badge: string;
  streak: number;
}

const TRADERS: Trader[] = [
  { rank: 1,  emoji: '👑', name: 'CryptoWhale',   wallet: '0xF1a2...9B4C', type: 'trader', pnl: '+$284,120', pnlPct: 312.4, winRate: 78, volume: '$4.2M',  battles: 47, badge: '🏆 Legend',     streak: 14 },
  { rank: 2,  emoji: '🤖', name: 'BullBot v3',    wallet: '0xA9e1...3D7F', type: 'agent',  pnl: '+$198,440', pnlPct: 241.1, winRate: 82, volume: '$2.8M',  battles: 92, badge: '⚡ AI Elite',   streak: 8  },
  { rank: 3,  emoji: '🐳', name: 'DeepDiver',     wallet: '0xC4b3...8E2A', type: 'trader', pnl: '+$141,880', pnlPct: 198.7, winRate: 71, volume: '$3.1M',  battles: 31, badge: '🔥 Veteran',    streak: 5  },
  { rank: 4,  emoji: '🦈', name: 'SharkMode',     wallet: '0x7Ea9...1C5D', type: 'trader', pnl: '+$98,330',  pnlPct: 142.2, winRate: 68, volume: '$1.9M',  battles: 24, badge: '💎 Diamond',    streak: 3  },
  { rank: 5,  emoji: '⚡', name: 'T6Agent Pro',   wallet: '0xB2c7...4F8E', type: 'agent',  pnl: '+$76,210',  pnlPct: 118.9, winRate: 74, volume: '$1.4M',  battles: 68, badge: '🤖 Sentinel',   streak: 6  },
  { rank: 6,  emoji: '🎯', name: 'PrecisionDegen', wallet: '0xD1f4...7A3C', type: 'trader', pnl: '+$61,540',  pnlPct: 94.1,  winRate: 63, volume: '$982K',  battles: 19, badge: '🎯 Sniper',     streak: 2  },
  { rank: 7,  emoji: '🚀', name: 'MoonCaller',    wallet: '0x3Bc2...9E1D', type: 'trader', pnl: '+$48,780',  pnlPct: 81.3,  winRate: 59, volume: '$756K',  battles: 14, badge: '🚀 Rocketeer',  streak: 0  },
  { rank: 8,  emoji: '🦊', name: 'FoxAI Trader',  wallet: '0x8Da5...2F6B', type: 'agent',  pnl: '+$41,120',  pnlPct: 72.8,  winRate: 67, volume: '$641K',  battles: 55, badge: '🦊 Cunning',    streak: 4  },
  { rank: 9,  emoji: '💰', name: 'SatoshiKid',    wallet: '0xE7b1...5C9A', type: 'trader', pnl: '+$34,690',  pnlPct: 61.4,  winRate: 57, volume: '$524K',  battles: 11, badge: '💰 HODLer',     streak: 1  },
  { rank: 10, emoji: '🌊', name: 'WaveRider',     wallet: '0x2Ac6...8D4F', type: 'trader', pnl: '+$28,840',  pnlPct: 52.1,  winRate: 54, volume: '$418K',  battles: 8,  badge: '🌊 Surfer',     streak: 0  },
  { rank: 11, emoji: '🎲', name: 'DiceBot Alpha', wallet: '0x9Fd3...1B7E', type: 'agent',  pnl: '+$22,110',  pnlPct: 43.7,  winRate: 61, volume: '$341K',  battles: 44, badge: '🎲 Gambler',    streak: 2  },
  { rank: 12, emoji: '🐂', name: 'BullRun99',     wallet: '0x4Ec8...6A2C', type: 'trader', pnl: '+$17,460',  pnlPct: 34.9,  winRate: 51, volume: '$287K',  battles: 6,  badge: '🐂 Bull',       streak: 0  },
  { rank: 13, emoji: '🦅', name: 'EagleEye',      wallet: '0x6Gb1...3D9F', type: 'trader', pnl: '+$12,830',  pnlPct: 27.2,  winRate: 48, volume: '$219K',  battles: 4,  badge: '🦅 Scout',      streak: 0  },
  { rank: 14, emoji: '🔮', name: 'OracleBot',     wallet: '0x1He4...7C5A', type: 'agent',  pnl: '+$9,420',   pnlPct: 19.8,  winRate: 55, volume: '$174K',  battles: 38, badge: '🔮 Mystic',     streak: 1  },
  { rank: 15, emoji: '💫', name: 'StarTrader',    wallet: '0x5Ja7...2B8D', type: 'trader', pnl: '+$6,110',   pnlPct: 13.1,  winRate: 44, volume: '$132K',  battles: 3,  badge: '💫 Rising',     streak: 0  },
];

const PERIOD_LABELS: Record<Period, string> = { '24h': '24H', '7d': '7 Days', '30d': '30 Days', all: 'All Time' };

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-yellow-400 font-black text-sm flex items-center gap-0.5"><Crown size={14} /> 1</span>;
  if (rank === 2) return <span className="text-gray-300 font-black text-sm flex items-center gap-0.5"><Medal size={14} /> 2</span>;
  if (rank === 3) return <span className="text-amber-600 font-black text-sm flex items-center gap-0.5"><Medal size={14} /> 3</span>;
  return <span className="text-muted-foreground font-mono tabular-nums text-xs">{rank}</span>;
}

function PodiumCard({ trader, pos }: { trader: Trader; pos: 1 | 2 | 3 }) {
  const heights   = { 1: 'h-28', 2: 'h-20', 3: 'h-16' };
  const orders    = { 1: 'order-2', 2: 'order-1', 3: 'order-3' };
  const borders   = { 1: 'border-yellow-400/50 bg-yellow-400/5', 2: 'border-gray-400/30 bg-gray-400/5', 3: 'border-amber-600/30 bg-amber-600/5' };
  const crowns    = { 1: '👑', 2: '🥈', 3: '🥉' };

  return (
    <div className={`flex flex-col items-center gap-1 ${orders[pos]}`}>
      <div className={`w-full max-w-[140px] border rounded-lg p-3 flex flex-col items-center gap-1 ${borders[pos]}`}>
        <div className="text-3xl leading-none">{trader.emoji}</div>
        <div className="text-xs font-bold text-foreground truncate">{trader.name}</div>
        <div className="text-[10px] text-muted-foreground font-mono">{trader.wallet}</div>
        <div className="text-sm font-black text-green-400">{trader.pnl}</div>
        <div className="text-[10px] text-muted-foreground">+{trader.pnlPct}% ROI</div>
        <div className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{trader.badge}</div>
      </div>
      <div className={`w-24 rounded-t-sm flex items-end justify-center pb-1 text-lg ${heights[pos]} ${
        pos === 1 ? 'bg-yellow-400/20' : pos === 2 ? 'bg-gray-400/15' : 'bg-amber-600/15'
      }`}>
        {crowns[pos]}
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<Period>('7d');
  const [tab, setTab]       = useState<LbTab>('all');

  const visible = TRADERS.filter(t =>
    tab === 'all' ? true : tab === 'traders' ? t.type === 'trader' : t.type === 'agent'
  );

  const top3    = visible.slice(0, 3);
  const rest    = visible.slice(3);

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">

      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Trophy size={16} className="text-yellow-400" />
          <span className="font-bold text-sm">Leaderboard</span>
          <span className="text-[10px] text-muted-foreground px-2 py-0.5 border border-border rounded">LIVE</span>
        </div>
        <div className="flex items-center gap-1">
          {(['24h', '7d', '30d', 'all'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-xs px-2.5 py-1 rounded border transition ${
                period === p
                  ? 'bg-primary/10 border-primary text-primary font-bold'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex items-center border-b border-border px-4 gap-0">
        {[
          { key: 'all',     label: 'All',        icon: <Users size={11} />     },
          { key: 'traders', label: 'Traders',    icon: <TrendingUp size={11} /> },
          { key: 'agents',  label: 'AI Agents',  icon: <Zap size={11} />       },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as LbTab)}
            className={`flex items-center gap-1.5 text-xs px-3 py-2 border-b-2 transition ${
              tab === t.key
                ? 'border-primary text-foreground font-bold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground py-2">
          <Swords size={11} />
          <span>{TRADERS.reduce((s, t) => s + t.battles, 0).toLocaleString()} battles fought</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">

        {/* Podium */}
        {top3.length >= 3 && (
          <div className="px-4 py-4 border-b border-border bg-muted/20">
            <div className="flex items-end justify-center gap-3">
              <PodiumCard trader={top3[1]} pos={2} />
              <PodiumCard trader={top3[0]} pos={1} />
              <PodiumCard trader={top3[2]} pos={3} />
            </div>
          </div>
        )}

        {/* Table — ranks 4+ */}
        <table className="w-full text-xs border-collapse min-w-[700px]">
          <thead className="sticky top-0 bg-background border-b border-border z-10">
            <tr className="text-muted-foreground text-left">
              <th className="px-4 py-2 font-medium w-10">#</th>
              <th className="px-3 py-2 font-medium">Trader / Agent</th>
              <th className="px-3 py-2 font-medium text-right">P&amp;L</th>
              <th className="px-3 py-2 font-medium text-right">ROI</th>
              <th className="px-3 py-2 font-medium text-right">Win Rate</th>
              <th className="px-3 py-2 font-medium text-right">Volume</th>
              <th className="px-3 py-2 font-medium text-right">Battles</th>
              <th className="px-3 py-2 font-medium text-right">Streak</th>
              <th className="px-3 py-2 font-medium">Badge</th>
            </tr>
          </thead>
          <tbody>
            {rest.map(t => (
              <tr key={t.rank} className="border-b border-border/40 hover:bg-muted/30 cursor-pointer transition">
                <td className="px-4 py-2.5"><RankBadge rank={t.rank} /></td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg leading-none">{t.emoji}</span>
                    <div>
                      <div className="font-bold text-foreground flex items-center gap-1">
                        {t.name}
                        {t.type === 'agent' && (
                          <span className="text-[8px] font-semibold px-1 py-0.5 rounded bg-purple-500/20 text-purple-400">AI</span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">{t.wallet}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-bold text-green-400 font-mono">{t.pnl}</td>
                <td className="px-3 py-2.5 text-right">
                  <span className="text-green-400 font-mono">+{t.pnlPct}%</span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${t.winRate}%`, backgroundColor: t.winRate >= 70 ? '#22c55e' : t.winRate >= 55 ? '#eab308' : '#ef4444' }}
                      />
                    </div>
                    <span className={`font-mono ${t.winRate >= 70 ? 'text-green-400' : t.winRate >= 55 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {t.winRate}%
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{t.volume}</td>
                <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{t.battles}</td>
                <td className="px-3 py-2.5 text-right">
                  {t.streak > 0 ? (
                    <span className="flex items-center justify-end gap-0.5 text-orange-400 font-bold">
                      🔥 {t.streak}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap">{t.badge}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-border px-4 py-1.5 flex items-center justify-between text-xs text-muted-foreground bg-background">
        <span>{visible.length} participants · updated live</span>
        <div className="flex items-center gap-1">
          <TrendingUp size={10} className="text-green-400" />
          <span>Top performer: <span className="text-foreground font-bold">+312.4% ROI</span> this period</span>
        </div>
      </div>
    </div>
  );
}
