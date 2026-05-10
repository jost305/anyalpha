import { Search, Bell, Crown, Menu, Wallet } from 'lucide-react';
import { useTheme } from '@/lib/theme-provider';
import { useState } from 'react';
import { toast } from 'sonner';
import MobileDrawer from './mobile-drawer';
import { ConnectWalletModal } from '@/components/modals/connect-wallet-modal';

const hotMarkets = [
  { emoji: '🔥', name: 'PEPEFUN', change: '62% Yes', positive: true },
  { emoji: '😈', name: 'SMEW', change: '58% Yes', positive: true },
  { emoji: '⚔️', name: 'SWIF', change: '41% Yes', positive: false },
  { emoji: '🎲', name: '$AI1G2', change: '67% Yes', positive: true },
  { emoji: '🎺', name: '$BONK', change: '55% Yes', positive: true },
];

interface TopBarProps {
  onConnectWallet?: () => void;
}

export default function TopBar({ onConnectWallet }: TopBarProps) {
  const { theme, toggleTheme } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState(3);

  const handleBellClick = () => {
    if (notifications > 0) {
      toast.info(`${notifications} new notifications`, {
        description: 'Price alert triggered · Transaction confirmed · Agent battle started',
      });
      setNotifications(0);
    }
  };

  return (
    <>
      <ConnectWalletModal
        open={walletModalOpen}
        onOpenChange={(o) => {
          setWalletModalOpen(o);
          if (!o && !connected) setConnected(true);
        }}
      />
      <MobileDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between px-2 py-1.5 gap-2">
          <button onClick={() => setDrawerOpen(true)} className="md:hidden p-1.5 hover:bg-sidebar-accent rounded transition">
            <Menu size={20} />
          </button>

          <div className="flex-1 flex items-center bg-input rounded px-3 py-1.5">
            <Search size={16} className="text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Search token, topic or market..."
              className="flex-1 bg-transparent text-sm outline-none pl-2 placeholder:text-muted-foreground"
            />
            <span className="text-sm text-muted-foreground">/</span>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="hidden sm:flex text-sm px-2 py-1.5 bg-input rounded items-center gap-1.5">
              <span>😊</span>
              <span className="text-xs">BXBT</span>
              <span className="text-primary font-bold text-xs">1,245.50</span>
            </div>
            <button className="p-1.5 hover:bg-sidebar-accent rounded transition hidden sm:flex">
              <Crown size={18} className="text-primary" />
            </button>
            <button onClick={handleBellClick} className="p-1.5 hover:bg-sidebar-accent rounded transition relative">
              <Bell size={18} />
              {notifications > 0 && (
                <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-destructive rounded-full flex items-center justify-center text-[8px] text-white font-bold">
                  {notifications}
                </span>
              )}
            </button>
            <button onClick={toggleTheme} className="p-1.5 hover:bg-sidebar-accent rounded transition">
              <span className="text-xl">{theme === 'dark' ? '☀️' : '🌙'}</span>
            </button>
            {connected ? (
              <button className="hidden sm:flex text-xs px-2 py-1.5 hover:bg-sidebar-accent rounded transition items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-secondary" />
                <span>0xBan...Bro</span>
                <span>▼</span>
              </button>
            ) : (
              <button
                onClick={() => setWalletModalOpen(true)}
                className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded font-bold hover:opacity-90 transition"
              >
                <Wallet size={13} />
                Connect
              </button>
            )}
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-2 py-1 overflow-x-auto border-t border-border bg-background/50 shrink-0">
          {hotMarkets.map((market) => (
            <button
              key={market.name}
              className="flex items-center gap-1.5 bg-input px-2 py-1 rounded text-xs hover:bg-sidebar-accent transition whitespace-nowrap"
            >
              <span>{market.emoji}</span>
              <span className="font-bold">{market.name}</span>
              <span className={market.positive ? 'text-green-400' : 'text-red-400'}>{market.change}</span>
            </button>
          ))}
          <button className="text-xs text-primary hover:underline px-2 whitespace-nowrap">View all →</button>
        </div>
      </div>
    </>
  );
}
