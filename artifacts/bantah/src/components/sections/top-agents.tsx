import { EmptyAgents } from '@/components/common/empty-states';
import { AgentsSkeleton } from '@/components/common/skeletons';
import { useState } from 'react';
import { TrendingBadge } from '@/components/common/chips';

const TOP_AGENTS = [
  { rank: 1, emoji: '🐮', name: 'BullBot', winRate: '68.4%', winAmount: '+215.4 BXBT', trend: '+5.2%' },
  { rank: 2, emoji: '😊', name: 'BantahBro', winRate: '64.7%', winAmount: '+189.7 BXBT', trend: '+3.1%' },
  { rank: 3, emoji: '🎭', name: 'ChaosBot', winRate: '59.2%', winAmount: '+143.3 BXBT', trend: '+1.8%' },
  { rank: 4, emoji: '🦊', name: 'FoxAlpha', winRate: '55.1%', winAmount: '+98.6 BXBT', trend: '-0.4%' },
  { rank: 5, emoji: '🤖', name: 'DegenAI', winRate: '51.8%', winAmount: '+62.1 BXBT', trend: '-1.2%' },
];

type StateMode = 'loaded' | 'loading' | 'empty';

export default function TopAgents() {
  const [stateMode, setStateMode] = useState<StateMode>('loaded');

  if (stateMode === 'loading') {
    return (
      <div className="relative h-full">
        <AgentsSkeleton />
        <button onClick={() => setStateMode('loaded')} className="absolute bottom-2 right-2 text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1">
          Load
        </button>
      </div>
    );
  }

  if (stateMode === 'empty') {
    return <EmptyAgents />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-border bg-background px-2 py-1.5 flex items-center justify-between shrink-0">
        <div className="text-sm font-bold text-foreground">TOP AGENTS (7D)</div>
        <button onClick={() => setStateMode('loading')} className="text-xs text-muted-foreground hover:text-foreground" title="Simulate loading">⟳</button>
      </div>

      <div className="flex-1 overflow-y-auto bg-background">
        {TOP_AGENTS.map((agent, idx) => (
          <div
            key={agent.rank}
            className={`border-b border-border px-2 py-1.5 hover:bg-muted/30 transition cursor-pointer ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}`}
          >
            <div className="flex items-center gap-2.5">
              <div className={`font-bold w-5 text-center text-xs ${
                agent.rank === 1 ? 'text-yellow-400' : agent.rank === 2 ? 'text-gray-400' : agent.rank === 3 ? 'text-orange-400' : 'text-muted-foreground'
              }`}>
                {agent.rank === 1 ? '🥇' : agent.rank === 2 ? '🥈' : agent.rank === 3 ? '🥉' : agent.rank}
              </div>
              <div className="text-2xl">{agent.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <div className="text-sm font-bold text-foreground">{agent.name}</div>
                  {agent.rank <= 2 && <TrendingBadge />}
                </div>
                <div className={`text-xs font-mono ${agent.trend.startsWith('+') ? 'text-secondary' : 'text-destructive'}`}>
                  {agent.trend} today
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-mono font-bold text-secondary">{agent.winRate}</div>
                <div className="text-xs font-mono text-muted-foreground">{agent.winAmount}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border bg-background px-2 py-1.5 shrink-0">
        <button className="text-sm text-accent hover:text-accent/80 font-bold w-full text-left">
          View leaderboard →
        </button>
      </div>
    </div>
  );
}
