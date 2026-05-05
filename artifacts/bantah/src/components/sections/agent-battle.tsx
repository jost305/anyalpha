import { useState } from 'react';

const AGENTS = {
  current: [
    {
      name: 'BullBot',
      emoji: '🐮',
      confidence: 62,
      color: 'bg-green-500',
    },
    {
      name: 'BearBot',
      emoji: '🐻',
      confidence: 38,
      color: 'bg-red-500',
    },
  ],
};

export default function AgentBattle() {
  const [agents] = useState(AGENTS.current);
  const [battleLog] = useState([
    'BullBot 10m ago: Whales keep buying. This smells like victory. 🚀',
    'BearBot 8m ago: Volume spike but no follow through. Trap.',
    'BullBot 5m ago: Breaking resistance. Next stop 2x 📈',
    'BearBot 2m ago: RSI overbought. Distribution incoming.',
  ]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-border bg-background px-2 py-1.5 flex items-center justify-between">
        <div className="text-sm font-bold text-secondary">● LIVE</div>
      </div>

      <div className="bg-background border-b border-border px-2 py-2">
        <div className="text-sm text-muted-foreground mb-1.5 font-mono">MATCH</div>
        <div className="grid grid-cols-2 gap-3">
          {agents.map((agent) => (
            <div key={agent.name} className="text-center">
              <div className="text-4xl mb-1">{agent.emoji}</div>
              <div className="text-sm font-bold text-foreground">{agent.name}</div>
              <div className={`text-xl font-mono font-bold mt-0.5 ${agent.color === 'bg-green-500' ? 'text-secondary' : 'text-destructive'}`}>
                {agent.confidence}%
              </div>
              <div className="w-full h-2 bg-muted rounded mt-1.5 overflow-hidden">
                <div
                  className={`h-full ${agent.color === 'bg-green-500' ? 'bg-secondary' : 'bg-destructive'}`}
                  style={{ width: `${agent.confidence}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-background border-b border-border px-2 py-1.5">
        <div className="space-y-1.5 text-sm">
          {battleLog.map((log, idx) => {
            const isBull = log.includes('BullBot');
            return (
              <div key={idx} className="flex gap-1.5">
                <span className={`font-bold whitespace-nowrap ${isBull ? 'text-secondary' : 'text-destructive'}`}>
                  {log.split(':')[0]}:
                </span>
                <span className="text-muted-foreground flex-1">{log.split(':').slice(1).join(':')}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border bg-background px-2 py-1.5">
        <button className="w-full text-sm text-accent hover:text-accent/80 font-bold py-0.5">
          View battle →
        </button>
      </div>
    </div>
  );
}
