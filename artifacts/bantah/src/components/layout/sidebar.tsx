import { BarChart3, Trophy, Wallet, Settings, MessageSquare, Megaphone, ChevronLeft, ChevronRight, Shield, Flame, Star, TrendingUp, BarChart2, Radio } from 'lucide-react';
import { useState } from 'react';

const menuItems = [
  { icon: BarChart3,     label: 'Markets'     },
  { icon: Trophy,        label: 'Leaderboard' },
  { icon: MessageSquare, label: 'Chat Agent'  },
  { icon: Wallet,        label: 'Portfolio'   },
  { icon: Settings,      label: 'Profile'     },
  { icon: Megaphone,     label: 'Advertise'   },
];

const toolItems = [
  { icon: Flame,      label: 'PumpWatch',     emoji: '🔥' },
  { icon: Star,       label: 'Rug Scorer',    emoji: '🛡️' },
  { icon: TrendingUp, label: 'Prediction Hub',emoji: '🎯' },
  { icon: BarChart2,  label: 'Markets',       emoji: '📊' },
  { icon: Radio,      label: 'Signals',       emoji: '📡' },
];

const adminItems = [
  { icon: Shield, label: 'Admin' },
];

const trendingTopics = [
  { icon: '🤖', label: 'AI Agents',      count: '2.4K' },
  { icon: '🎨', label: 'Memecoins',      count: '1.9K' },
  { icon: '📊', label: 'Base Ecosystem', count: '1.6K' },
  { icon: '◎',  label: 'Solana',         count: '1.2K' },
  { icon: '🔥', label: 'RWA',            count: '945'  },
];

interface SidebarProps {
  onMenuClick?: (label: string) => void;
  unreadCount?: number;
}

export default function Sidebar({ onMenuClick, unreadCount = 0 }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const MenuItem = ({ icon: Icon, label, extra }: { icon: React.ElementType; label: string; extra?: React.ReactNode }) => (
    <button
      onClick={() => onMenuClick?.(label)}
      title={collapsed ? label : undefined}
      className={`w-full text-left text-sm py-1.5 hover:bg-sidebar-accent hover:text-accent-foreground transition flex items-center gap-2 text-sidebar-foreground relative ${
        collapsed ? 'justify-center px-0' : 'px-3'
      }`}
    >
      <Icon size={16} className="shrink-0" />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {!collapsed && extra}
    </button>
  );

  return (
    <div
      className={`relative bg-sidebar border-r border-border flex flex-col overflow-y-auto transition-all duration-200 ease-in-out shrink-0 ${
        collapsed ? 'w-12' : 'w-52'
      }`}
    >
      {/* Header */}
      <div className="p-2 border-b border-border flex items-center justify-between gap-1 min-h-[72px]">
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className="text-sm font-black text-primary truncate tracking-tight">anyAlpha</div>
            <div className="text-xs text-muted-foreground truncate">AI TRADING TERMINAL</div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="shrink-0 p-1 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-foreground transition"
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>

      {/* + CREATE button */}
      {!collapsed ? (
        <div className="px-2 pt-2">
          <button className="w-full bg-primary text-primary-foreground text-sm py-1.5 px-2 rounded hover:opacity-80 font-bold transition flex items-center justify-center gap-1">
            + CREATE
          </button>
        </div>
      ) : (
        <div className="px-1 pt-2">
          <button title="Create" className="w-full bg-primary text-primary-foreground py-1.5 rounded hover:opacity-80 font-bold transition flex items-center justify-center text-sm">
            +
          </button>
        </div>
      )}

      {/* Scrollable menu */}
      <div className="flex-1 overflow-y-auto">

        {/* MAIN */}
        <div className="py-1">
          {!collapsed && (
            <div className="text-xs font-bold text-muted-foreground px-3 py-1 mt-1 uppercase tracking-wider">Main</div>
          )}
          {menuItems.map((item) => (
            <MenuItem key={item.label} icon={item.icon} label={item.label} />
          ))}
        </div>

        {/* TOOLS */}
        <div className="py-1 border-t border-border">
          {!collapsed && (
            <div className="text-xs font-bold text-muted-foreground px-3 py-1 mt-1 uppercase tracking-wider">Tools</div>
          )}
          {toolItems.map((item) => (
            <button
              key={item.label}
              onClick={() => onMenuClick?.(item.label)}
              title={collapsed ? item.label : undefined}
              className={`w-full text-left text-sm py-1.5 hover:bg-sidebar-accent hover:text-accent-foreground transition flex items-center gap-2 text-sidebar-foreground ${
                collapsed ? 'justify-center px-0' : 'px-3'
              }`}
            >
              {collapsed ? (
                <span className="text-base leading-none">{item.emoji}</span>
              ) : (
                <>
                  <span className="text-sm leading-none">{item.emoji}</span>
                  <span className="flex-1 truncate">{item.label}</span>
                </>
              )}
            </button>
          ))}
        </div>

        {/* ADMIN */}
        <div className="py-1 border-t border-border">
          {!collapsed && (
            <div className="text-xs font-bold text-muted-foreground px-3 py-1 mt-1 uppercase tracking-wider">Admin</div>
          )}
          {adminItems.map((item) => (
            <button
              key={item.label}
              onClick={() => onMenuClick?.(item.label)}
              title={collapsed ? item.label : undefined}
              className={`w-full text-left text-sm py-1.5 hover:bg-sidebar-accent hover:text-accent-foreground transition flex items-center gap-2 text-primary/80 hover:text-primary ${
                collapsed ? 'justify-center px-0' : 'px-3'
              }`}
            >
              <item.icon size={16} className="shrink-0" />
              {!collapsed && <span className="flex-1 truncate font-semibold">{item.label}</span>}
            </button>
          ))}
        </div>

        {/* TRENDING — expanded only */}
        {!collapsed && (
          <div className="py-1 border-t border-border">
            <div className="text-xs font-bold text-muted-foreground px-3 py-1 mt-1 uppercase tracking-wider">Trending</div>
            {trendingTopics.map((topic) => (
              <button
                key={topic.label}
                className="w-full text-left text-sm py-1 px-3 hover:bg-sidebar-accent hover:text-accent-foreground transition flex items-center justify-between text-sidebar-foreground"
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-base">{topic.icon}</span>
                  <span>{topic.label}</span>
                </span>
                <span className="text-muted-foreground text-xs">{topic.count}</span>
              </button>
            ))}
            <button className="w-full text-left text-sm py-1 px-3 text-primary hover:underline">View all</button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border p-2 text-center">
        {collapsed ? (
          <span className="text-primary text-base font-black">α</span>
        ) : (
          <>
            <div className="text-xs font-bold text-primary mb-0.5">SEE IT. CALL IT.</div>
            <div className="text-xs font-bold text-primary mb-1">BET IT. WIN BIG.</div>
            <div className="flex items-center justify-center gap-1 text-xs">
              <span className="font-black text-primary">anyAlpha</span>
              <span className="text-primary">⚡</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
