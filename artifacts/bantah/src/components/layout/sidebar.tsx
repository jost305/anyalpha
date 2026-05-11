import { BarChart3, Trophy, Bell, Wallet, Settings, MessageSquare, Megaphone, ChevronLeft, ChevronRight, Shield } from 'lucide-react';
import { useState } from 'react';

const menuItems = [
  { icon: BarChart3,     label: 'Markets'      },
  { icon: Trophy,        label: 'Leaderboard'  },
  { icon: MessageSquare, label: 'Chat Agent'   },
  { icon: Bell,          label: 'Notifications'},
  { icon: Wallet,        label: 'Portfolio'    },
  { icon: Settings,      label: 'Profile'      },
  { icon: Megaphone,     label: 'Advertise'    },
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
            <div className="text-sm font-bold text-primary truncate">Terminal6</div>
            <div className="text-xs text-muted-foreground truncate">AI DEGEN</div>
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
      {!collapsed && (
        <div className="px-2 pt-2">
          <button className="w-full bg-primary text-primary-foreground text-sm py-1.5 px-2 rounded hover:opacity-80 font-bold transition flex items-center justify-center gap-1">
            + CREATE
          </button>
        </div>
      )}
      {collapsed && (
        <div className="px-1 pt-2">
          <button
            title="Create"
            className="w-full bg-primary text-primary-foreground py-1.5 rounded hover:opacity-80 font-bold transition flex items-center justify-center text-sm"
          >
            +
          </button>
        </div>
      )}

      {/* Menu items */}
      <div className="flex-1 overflow-y-auto">
        <div className="py-1">
          {!collapsed && (
            <div className="text-xs font-bold text-muted-foreground px-3 py-1 mt-1 uppercase tracking-wider">Main</div>
          )}
          {menuItems.map((item) => (
            <button
              key={item.label}
              onClick={() => onMenuClick?.(item.label)}
              title={collapsed ? item.label : undefined}
              className={`w-full text-left text-sm py-1.5 hover:bg-sidebar-accent hover:text-accent-foreground transition flex items-center gap-2 text-sidebar-foreground relative ${
                collapsed ? 'justify-center px-0' : 'px-3'
              }`}
            >
              <item.icon size={16} className="shrink-0" />
              {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
              {/* Badge */}
              {item.label === 'Notifications' && unreadCount > 0 && (
                collapsed ? (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-destructive animate-pulse" />
                ) : (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-destructive text-white animate-pulse min-w-[18px] text-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )
              )}
            </button>
          ))}
        </div>

        {/* Admin section */}
        <div className="py-1 border-t border-border">
          {!collapsed && (
            <div className="text-xs font-bold text-muted-foreground px-3 py-1 mt-1 uppercase tracking-wider">Admin</div>
          )}
          {adminItems.map((item) => (
            <button
              key={item.label}
              onClick={() => onMenuClick?.(item.label)}
              title={collapsed ? item.label : undefined}
              className={`w-full text-left text-sm py-1.5 hover:bg-sidebar-accent hover:text-accent-foreground transition flex items-center gap-2 text-primary/80 hover:text-primary relative ${
                collapsed ? 'justify-center px-0' : 'px-3'
              }`}
            >
              <item.icon size={16} className="shrink-0" />
              {!collapsed && <span className="flex-1 truncate font-semibold">{item.label}</span>}
            </button>
          ))}
        </div>

        {!collapsed && (
          <>
            <div className="py-1 border-t border-border">
              <div className="text-xs font-bold text-muted-foreground px-3 py-1 mt-1 uppercase tracking-wider">Hub</div>
              <button className="w-full text-left text-sm py-1 px-3 hover:bg-sidebar-accent hover:text-accent-foreground transition flex items-center gap-2 text-sidebar-foreground">
                📊 Markets
              </button>
              <button className="w-full text-left text-sm py-1 px-3 hover:bg-sidebar-accent hover:text-accent-foreground transition flex items-center gap-2 text-sidebar-foreground">
                📡 Signals
              </button>
            </div>

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
              <button className="w-full text-left text-sm py-1 px-3 text-primary hover:underline">
                View all
              </button>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border p-2 text-center">
        {collapsed ? (
          <span className="text-primary text-base">⚡</span>
        ) : (
          <>
            <div className="text-xs font-bold text-primary mb-0.5">SEE IT. CALL IT.</div>
            <div className="text-xs font-bold text-primary mb-1">BET IT. WIN BIG.</div>
            <div className="flex items-center justify-center gap-1 text-xs">
              <span>Terminal6</span>
              <span className="text-primary">⚡</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
