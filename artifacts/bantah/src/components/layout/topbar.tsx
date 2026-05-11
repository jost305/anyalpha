import { Search, Bell, Crown, Menu, Moon, Sun, Wallet, X } from 'lucide-react';
import { useTheme } from '@/lib/theme-provider';
import { useEffect, useRef, useState } from 'react';
import MobileDrawer from './mobile-drawer';
import SignInModal from '@/components/modals/signin-modal';
import {
  fetchMarkets,
  fmtPct,
  fmtPrice,
  marketPairLabel,
  searchMarketTokens,
  type MarketToken,
} from '@/lib/market-data';

interface TopBarProps {
  onConnectWallet?: () => void;
  onBellClick?: () => void;
  onSelectToken?: (market: MarketToken) => void;
  unreadCount?: number;
}

export default function TopBar({ onBellClick, onSelectToken, unreadCount = 0 }: TopBarProps) {
  const { theme, toggleTheme } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MarketToken[]>([]);
  const [hotMarkets, setHotMarkets] = useState<MarketToken[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchMarkets({ sort: 'trending', limit: 8, signal: controller.signal })
      .then((response) => setHotMarkets(response.data))
      .catch(() => {
        if (!controller.signal.aborted) setHotMarkets([]);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchMarketTokens(query, controller.signal)
        .then((hits) => {
          setResults(hits);
          setSearchOpen(hits.length > 0 && focused);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setResults([]);
            setSearchOpen(false);
          }
        });
    }, query.trim() ? 250 : 0);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [focused, query]);

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

  const handleSelectResult = (token: MarketToken) => {
    onSelectToken?.(token);
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
      <SignInModal
        open={walletModalOpen}
        onOpenChange={setWalletModalOpen}
        onSuccess={() => setConnected(true)}
      />
      <MobileDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div className="border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between px-2 py-1.5 gap-2">
          <button onClick={() => setDrawerOpen(true)} className="md:hidden p-1.5 hover:bg-sidebar-accent rounded transition">
            <Menu size={20} />
          </button>

          <div ref={searchRef} className="flex-1 relative">
            <div className={`flex items-center bg-input rounded px-3 py-1.5 transition ${focused ? 'ring-1 ring-primary/50' : ''}`}>
              <Search size={16} className="text-muted-foreground shrink-0" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onKeyDown={e => { if (e.key === 'Escape') { clearSearch(); (e.target as HTMLInputElement).blur(); } }}
                placeholder="Search live token, pair, or chain..."
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

            {searchOpen && results.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded shadow-xl z-50 overflow-hidden">
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground border-b border-border uppercase tracking-wider">
                  Live pairs - {results.length} result{results.length !== 1 ? 's' : ''}
                </div>
                {results.map(t => (
                  <button
                    key={t.id}
                    onMouseDown={() => handleSelectResult(t)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/50 transition text-left"
                  >
                    {t.imageUrl ? (
                      <img src={t.imageUrl} alt={t.symbol} className="w-6 h-6 rounded-full object-cover bg-muted" />
                    ) : (
                      <span className="w-6 h-6 rounded-full bg-primary/15 border border-primary/30 text-primary text-[9px] font-black flex items-center justify-center">
                        {t.symbol.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-foreground">{marketPairLabel(t)}</span>
                        <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                          {t.chainLabel}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">{t.name}</div>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground shrink-0">{fmtPrice(t.priceUsd)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <div className="hidden sm:flex text-sm px-2 py-1.5 bg-input rounded items-center gap-1.5">
              <span className="text-xs">BXBT</span>
              <span className="text-primary font-bold text-xs">1,245.50</span>
            </div>
            <button className="p-1.5 hover:bg-sidebar-accent rounded transition hidden sm:flex">
              <Crown size={18} className="text-primary" />
            </button>

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

            <button onClick={toggleTheme} className="p-1.5 hover:bg-sidebar-accent rounded transition" title="Toggle theme">
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {connected ? (
              <button className="hidden sm:flex text-xs px-2 py-1.5 hover:bg-sidebar-accent rounded transition items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-secondary" />
                <span>0xBan...Bro</span>
                <span>v</span>
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

        {hotMarkets.length > 0 && (
          <div className="hidden sm:flex items-center border-t border-border bg-background/50 shrink-0 overflow-hidden relative">
            <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 z-10 bg-gradient-to-r from-background/80 to-transparent" />
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-16 z-10 bg-gradient-to-l from-background/80 to-transparent" />

            <div className="ticker-track py-1 gap-2">
              {[...hotMarkets, ...hotMarkets].map((market, i) => (
                <button
                  key={`${market.id}-${i}`}
                  onClick={() => onSelectToken?.(market)}
                  className="ticker-pill flex items-center gap-1.5 bg-input px-2 py-1 rounded text-xs hover:bg-sidebar-accent transition whitespace-nowrap mx-1"
                  style={{ animationDelay: `${(i % hotMarkets.length) * 0.6}s` }}
                >
                  {market.imageUrl ? (
                    <img src={market.imageUrl} alt={market.symbol} className="w-4 h-4 rounded-full object-cover" />
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-muted-foreground/20 text-[8px] flex items-center justify-center">
                      {market.symbol.slice(0, 1)}
                    </span>
                  )}
                  <span className="font-bold">{market.symbol}</span>
                  <span className={(market.priceChange.h24 ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {fmtPct(market.priceChange.h24)}
                  </span>
                </button>
              ))}
            </div>

            <button className="absolute right-2 z-20 text-xs text-primary hover:underline whitespace-nowrap font-semibold bg-background/80 pl-1">
              Live feed
            </button>
          </div>
        )}
      </div>
    </>
  );
}
