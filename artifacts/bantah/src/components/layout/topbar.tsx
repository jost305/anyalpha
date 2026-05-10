import { Search, Bell, Crown, Menu, Wallet, X } from 'lucide-react';
import { useTheme } from '@/lib/theme-provider';
import { useState, useRef, useEffect } from 'react';
import MobileDrawer from './mobile-drawer';
import { ConnectWalletModal } from '@/components/modals/connect-wallet-modal';
import { searchTokens, fmtSearchPrice, type SearchToken } from '@/lib/market-data';

const hotMarkets = [
  { emoji: '🔥', name: 'PEPEFUN', change: '62% Yes', positive: true },
  { emoji: '😈', name: 'SMEW',    change: '58% Yes', positive: true },
  { emoji: '⚔️', name: 'SWIF',   change: '41% Yes', positive: false },
  { emoji: '🎲', name: '$AI1G2',  change: '67% Yes', positive: true },
  { emoji: '🎺', name: '$BONK',   change: '55% Yes', positive: true },
];

interface TopBarProps {
  onConnectWallet?: () => void;
  onBellClick?: () => void;
  onSelectToken?: (name: string) => void;
  unreadCount?: number;
}

export default function TopBar({ onBellClick, onSelectToken, unreadCount = 0 }: TopBarProps) {
  const { theme, toggleTheme } = useTheme();
  const [drawerOpen, setDrawerOpen]       = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [connected, setConnected]         = useState(false);
  const [query, setQuery]                 = useState('');
  const [results, setResults]             = useState<SearchToken[]>([]);
  const [searchOpen, setSearchOpen]       = useState(false);
  const [focused, setFocused]             = useState(false);
  const searchRef                         = useRef<HTMLDivElement>(null);

  // Update results whenever query changes
  useEffect(() => {
    const hits = searchTokens(query);
    setResults(hits);
    setSearchOpen(hits.length > 0 && focused);
  }, [query, focused]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelectResult = (token: SearchToken) => {
    onSelectToken?.(token.name);
    setQuery('');
    setSearchOpen(false);
    setFocused(false);
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setSearchOpen(false);
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

          {/* Search bar */}
          <div ref={searchRef} className="flex-1 relative">
            <div className={`flex items-center bg-input rounded px-3 py-1.5 transition ${focused ? 'ring-1 ring-primary/50' : ''}`}>
              <Search size={16} className="text-muted-foreground shrink-0" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onKeyDown={e => { if (e.key === 'Escape') { clearSearch(); (e.target as HTMLInputElement).blur(); } }}
                placeholder="Search token, topic or market..."
                className="flex-1 bg-transparent text-sm outline-none pl-2 placeholder:text-muted-foreground"
              />
              {query ? (
                <button onClick={clearSearch} className="text-muted-foreground hover:text-foreground transition">
                  <X size={13} />
                </button>
              ) : (
                <span className="text-sm text-muted-foreground">/</span>
              )}
            </div>

            {/* Search dropdown */}
            {searchOpen && results.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded shadow-xl z-50 overflow-hidden">
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground border-b border-border uppercase tracking-wider">
                  Tokens — {results.length} result{results.length !== 1 ? 's' : ''}
                </div>
                {results.map(t => (
                  <button
                    key={t.name}
                    onMouseDown={() => handleSelectResult(t)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/50 transition text-left"
                  >
                    <span className="text-lg leading-none">{t.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-foreground">{t.pair}</span>
                        <span
                          className="text-[9px] font-semibold px-1 py-0.5 rounded text-white"
                          style={{ backgroundColor: t.chainColor }}
                        >
                          {t.chain}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">{t.name}</div>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground shrink-0">{fmtSearchPrice(t.price)}</span>
                  </button>
                ))}
              </div>
            )}
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

            {/* Bell — navigates to notifications page */}
            <button
              onClick={onBellClick}
              className="p-1.5 hover:bg-sidebar-accent rounded transition relative"
            >
              <Bell
                size={18}
                className={unreadCount > 0 ? 'text-foreground' : 'text-muted-foreground'}
              />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 flex">
                  <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-destructive opacity-60" />
                  <span className="relative inline-flex items-center justify-center w-2.5 h-2.5 bg-destructive rounded-full text-[7px] text-white font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
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
              onClick={() => onSelectToken?.(market.name)}
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
