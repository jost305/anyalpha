import { Search, Bell, Crown, Menu } from 'lucide-react';
import { useTheme } from '@/lib/theme-provider';
import { useState } from 'react';
import MobileDrawer from './mobile-drawer';

const hotMarkets = [
  { emoji: '🔥', name: 'PEPEFUN', change: '62% Yes', color: 'text-green-400' },
  { emoji: '😈', name: 'SMEW', change: '58% Yes', color: 'text-green-400' },
  { emoji: '⚔️', name: 'SWIF', change: '41% Yes', color: 'text-red-400' },
  { emoji: '🎲', name: '$AI1G2', change: '67% Yes', color: 'text-green-400' },
  { emoji: '🎺', name: '$BONK', change: '55% Yes', color: 'text-green-400' },
];

export default function TopBar() {
  const { theme, toggleTheme } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <MobileDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="border-b border-border bg-card">
        <div className="flex items-center justify-between px-2 py-1.5 gap-2">
          <button
            onClick={() => setDrawerOpen(true)}
            className="md:hidden p-1.5 hover:bg-sidebar-accent rounded transition"
          >
            <Menu size={20} />
          </button>

          <div className="flex-1 flex items-center bg-input rounded px-3 py-1.5">
            <Search size={16} className="text-muted-foreground" />
            <input
              type="text"
              placeholder="Search token, topic or market..."
              className="flex-1 bg-transparent text-sm outline-none pl-2 placeholder:text-muted-foreground"
            />
            <span className="text-sm text-muted-foreground">/</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex text-sm px-3 py-1.5 bg-input rounded items-center gap-1.5">
              <span>😊</span>
              <span>BXBT</span>
              <span className="text-primary font-bold">1,245.50</span>
            </div>
            <button className="p-1.5 hover:bg-sidebar-accent rounded transition hidden sm:flex">
              <Crown size={18} className="text-primary" />
            </button>
            <button className="p-1.5 hover:bg-sidebar-accent rounded transition relative">
              <Bell size={18} />
              <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-destructive rounded-full"></span>
            </button>
            <button
              onClick={toggleTheme}
              className="p-1.5 hover:bg-sidebar-accent rounded transition"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              <span className="text-xl">{theme === 'dark' ? '☀️' : '🌙'}</span>
            </button>
            <button className="hidden sm:block text-sm px-3 py-1.5 hover:bg-sidebar-accent rounded transition">
              <span>😊 0xBantah...Bro</span>
              <span className="ml-1">▼</span>
            </button>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-2 py-1.5 overflow-x-auto border-t border-border bg-background/50">
          {hotMarkets.map((market) => (
            <button
              key={market.name}
              className="flex items-center gap-1.5 bg-input px-3 py-1 rounded text-sm hover:bg-sidebar-accent transition whitespace-nowrap"
            >
              <span className="text-lg">{market.emoji}</span>
              <span className="font-bold">{market.name}</span>
              <span className={market.change.includes('Yes') ? 'text-green-400' : 'text-red-400'}>
                {market.change}
              </span>
            </button>
          ))}
          <button className="text-sm text-primary hover:underline px-2">View all →</button>
        </div>
      </div>
    </>
  );
}
