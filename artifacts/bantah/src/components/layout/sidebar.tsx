import { BarChart3, Trophy, Bell, Wallet, Settings, MessageSquare } from 'lucide-react';

const menuItems = [
  { icon: BarChart3, label: 'Markets', section: 'MAIN' },
  { icon: Trophy, label: 'Leaderboard', section: 'MAIN' },
  { icon: MessageSquare, label: 'Chat Agent', section: 'MAIN' },
  { icon: Bell, label: 'Alerts', section: 'MAIN' },
  { icon: Wallet, label: 'Portfolio', section: 'MAIN' },
  { icon: Settings, label: 'Profile', section: 'MAIN' },
];

const trendingTopics = [
  { icon: '🤖', label: 'AI Agents', count: '2.4K' },
  { icon: '🎨', label: 'Memecoins', count: '1.9K' },
  { icon: '📊', label: 'Base Ecosystem', count: '1.6K' },
  { icon: '◎', label: 'Solana', count: '1.2K' },
  { icon: '🔥', label: 'RWA', count: '945' },
];

interface SidebarProps {
  onMenuClick?: (label: string) => void;
}

export default function Sidebar({ onMenuClick }: SidebarProps) {
  const handleMenuClick = (label: string) => {
    if (label === 'Chat Agent') {
      onMenuClick?.('chat');
    }
    onMenuClick?.(label);
  };

  return (
    <div className="w-52 bg-sidebar border-r border-border flex flex-col overflow-y-auto">
      <div className="p-2 border-b border-border">
        <div className="text-sm font-bold text-primary mb-0.5">BANTAH</div>
        <div className="text-sm text-muted-foreground">AI DEGEN</div>
        <button className="w-full mt-2 bg-primary text-primary-foreground text-sm py-1.5 px-2 rounded hover:opacity-80 font-bold transition flex items-center justify-center gap-1">
          + CREATE
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="py-1 px-0">
          <div className="text-sm font-bold text-muted-foreground px-3 py-1 mt-1">MAIN</div>
          {menuItems.map((item) => (
            <button
              key={item.label}
              onClick={() => handleMenuClick(item.label)}
              className="w-full text-left text-sm py-1.5 px-3 hover:bg-sidebar-accent hover:text-accent-foreground transition flex items-center gap-2 text-sidebar-foreground"
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="py-1 px-0 border-t border-border">
          <div className="text-sm font-bold text-muted-foreground px-3 py-1 mt-1">HUB</div>
          <button className="w-full text-left text-sm py-1 px-3 hover:bg-sidebar-accent hover:text-accent-foreground transition flex items-center gap-2 text-sidebar-foreground">
            📊 Markets
          </button>
          <button className="w-full text-left text-sm py-1 px-3 hover:bg-sidebar-accent hover:text-accent-foreground transition flex items-center gap-2 text-sidebar-foreground">
            📡 Signals
          </button>
        </div>

        <div className="py-1 px-0 border-t border-border">
          <div className="text-sm font-bold text-muted-foreground px-3 py-1 mt-1">TRENDING</div>
          {trendingTopics.map((topic) => (
            <button
              key={topic.label}
              className="w-full text-left text-sm py-1 px-3 hover:bg-sidebar-accent hover:text-accent-foreground transition flex items-center justify-between text-sidebar-foreground"
            >
              <span className="flex items-center gap-1.5">
                <span className="text-base">{topic.icon}</span>
                <span>{topic.label}</span>
              </span>
              <span className="text-muted-foreground text-sm">{topic.count}</span>
            </button>
          ))}
          <button className="w-full text-left text-sm py-1 px-3 text-primary hover:underline">
            View all
          </button>
        </div>
      </div>

      <div className="border-t border-border p-2 text-center">
        <div className="text-xs font-bold text-primary mb-1">SEE IT.</div>
        <div className="text-xs font-bold text-primary mb-1">CALL IT.</div>
        <div className="text-xs font-bold text-primary mb-2">BET IT.</div>
        <div className="text-xs text-muted-foreground mb-2">WIN BIG.</div>
        <div className="flex items-center justify-center gap-1">
          <span>BANTAH</span>
          <span className="text-primary">⚡</span>
        </div>
      </div>
    </div>
  );
}
