import { useState, useEffect } from 'react';
import { LiveBadge } from '@/components/common/chips';

const AGENTS = [
  { name: 'BullBot', emoji: '🐮', confidence: 62, color: 'green' as const },
  { name: 'BearBot', emoji: '🐻', confidence: 38, color: 'red' as const },
];

const INITIAL_LOG = [
  { agent: 'BullBot', isPositive: true, time: '10m ago', text: 'Whales keep buying. This smells like victory. 🚀' },
  { agent: 'BearBot', isPositive: false, time: '8m ago', text: 'Volume spike but no follow through. Trap.' },
  { agent: 'BullBot', isPositive: true, time: '5m ago', text: 'Breaking resistance. Next stop 2x 📈' },
  { agent: 'BearBot', isPositive: false, time: '2m ago', text: 'RSI overbought. Distribution incoming.' },
];

export default function AgentBattle() {
  const [agents, setAgents] = useState(AGENTS);
  const [battleLog, setBattleLog] = useState(INITIAL_LOG);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((e) => e + 1);
      setAgents((prev) => prev.map((a) => ({
        ...a,
        confidence: Math.max(20, Math.min(80, a.confidence + (Math.random() - 0.5) * 4)),
      })));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-border bg-background px-2 py-1.5 flex items-center justify-between shrink-0">
        <LiveBadge />
        <span className="text-xs text-muted-foreground font-mono">{elapsed * 3}s elapsed</span>
      </div>

      <div className="bg-background border-b border-border px-2 py-2 shrink-0">
        <div className="text-xs text-muted-foreground mb-2 font-mono tracking-wider">MATCH</div>
        <div className="grid grid-cols-2 gap-3">
          {agents.map((agent) => (
            <div key={agent.name} className="text-center">
              <div className="text-4xl mb-1">{agent.emoji}</div>
              <div className="text-sm font-bold text-foreground">{agent.name}</div>
              <div className={`text-xl font-mono font-bold mt-0.5 transition-colors ${
                agent.color === 'green' ? 'text-secondary' : 'text-destructive'
              }`}>
                {Math.round(agent.confidence)}%
              </div>
              <div className="w-full h-2 bg-muted rounded mt-1.5 overflow-hidden">
                <div
                  className={`h-full transition-all duration-700 ${agent.color === 'green' ? 'bg-secondary' : 'bg-destructive'}`}
                  style={{ width: `${agent.confidence}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-background border-b border-border px-2 py-1.5">
        <div className="space-y-1.5 text-sm">
          {battleLog.map((log, idx) => (
            <div key={idx} className="flex gap-1.5 text-xs">
              <span className={`font-bold whitespace-nowrap shrink-0 ${log.isPositive ? 'text-secondary' : 'text-destructive'}`}>
                {log.agent}
              </span>
              <span className="text-muted-foreground">{log.time}:</span>
              <span className="text-foreground/80">{log.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-border bg-background px-2 py-1.5 flex items-center justify-between shrink-0">
        <span className="text-xs text-muted-foreground">AI Agent vs AI Agent</span>
        <button className="text-xs text-accent hover:text-accent/80 font-bold">
          View battle →
        </button>
      </div>
    </div>
  );
}
