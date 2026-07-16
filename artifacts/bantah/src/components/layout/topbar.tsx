import { useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Bell, Menu, Moon, Search, Sun, UserRound, Wallet } from 'lucide-react';
import { useTheme } from '@/lib/theme-provider';
import MobileDrawer from './mobile-drawer';
import { fetchMarkets, fmtPct, type MarketToken } from '@/lib/market-data';
import { softHaptic } from '@/lib/mobile-feedback';
import { fetchRewardsStats } from '@/lib/points';
import { getPrimaryContact, getPrimaryWalletAddress, getUserAvatarUrl, getUserDisplayName, shortenAddress } from '@/lib/privy-profile';

interface TopBarProps {
  onConnectWallet?: () => void;
  onBellClick?: () => void;
  onMenuClick?: (label: string) => void;
  onOpenSearch?: () => void;
  onSelectToken?: (market: MarketToken) => void;
  searchActive?: boolean;
  showTicker?: boolean;
  unreadCount?: number;
}

function formatCompactPoints(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: value >= 10_000 ? 1 : 0,
  }).format(value);
}

export default function TopBar({
  onBellClick,
  onMenuClick,
  onOpenSearch,
  onSelectToken,
  searchActive = false,
  showTicker = true,
  unreadCount = 0,
}: TopBarProps) {
  const { theme, toggleTheme } = useTheme();
  const { ready, authenticated, user, login } = usePrivy();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hotMarkets, setHotMarkets] = useState<MarketToken[]>([]);
  const [platformRewards, setPlatformRewards] = useState<number | null>(null);
  const [rewardsPulse, setRewardsPulse] = useState(false);
  const rewardsValueRef = useRef<number | null>(null);
  const rewardsPulseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!showTicker) {
      setHotMarkets([]);
      return;
    }

    const controller = new AbortController();

    fetchMarkets({ sort: 'trending', limit: 8, enrich: false, signal: controller.signal })
      .then((response) => setHotMarkets(response.data))
      .catch(() => {
        if (!controller.signal.aborted) setHotMarkets([]);
      });

    return () => controller.abort();
  }, [showTicker]);

  useEffect(() => {
    let cancelled = false;

    const triggerPulse = () => {
      setRewardsPulse(true);
      if (rewardsPulseTimerRef.current) {
        window.clearTimeout(rewardsPulseTimerRef.current);
      }
      rewardsPulseTimerRef.current = window.setTimeout(() => setRewardsPulse(false), 1500);
    };

    const loadRewards = (signal?: AbortSignal) => {
      fetchRewardsStats(signal)
        .then((response) => {
          if (cancelled) return;

          const nextTotal = response.stats.totalPointsAwarded;
          const previousTotal = rewardsValueRef.current;

          if (previousTotal !== null && nextTotal !== previousTotal) {
            triggerPulse();
          }

          rewardsValueRef.current = nextTotal;
          setPlatformRewards(nextTotal);
        })
        .catch(() => {
          if (!cancelled && rewardsValueRef.current === null) setPlatformRewards(null);
        });
    };

    const controller = new AbortController();
    loadRewards(controller.signal);
    const interval = window.setInterval(() => loadRewards(), 15_000);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
      if (rewardsPulseTimerRef.current) window.clearTimeout(rewardsPulseTimerRef.current);
    };
  }, []);

  const displayName = authenticated ? getUserDisplayName(user) : null;
  const contact = authenticated ? getPrimaryContact(user) : null;
  const primaryWallet = authenticated ? getPrimaryWalletAddress(user) : null;
  const avatarUrl = authenticated ? getUserAvatarUrl(user) : null;
  const identitySubtitle = authenticated
    ? contact ?? (primaryWallet ? shortenAddress(primaryWallet, 8, 4) : user ? shortenAddress(user.id, 10, 8) : 'Privy user')
    : null;
  const handleProfileClick = () => {
    if (!authenticated) {
      if (ready) void login();
      return;
    }

    onMenuClick?.('Profile');
  };

  return (
    <>
      <MobileDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onMenuClick={onMenuClick}
        unreadCount={unreadCount}
      />

      <div className="mobile-app-bar shrink-0 border-b border-border bg-card">
        <div className="flex min-w-0 items-center justify-between gap-1.5 px-2 py-1.5 sm:gap-2 md:pl-7">
          <button
            onPointerDown={() => softHaptic(5)}
            onClick={() => setDrawerOpen(true)}
            className="tap-feedback shrink-0 rounded-xl p-1.5 transition hover:bg-sidebar-accent md:hidden"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>

          <div className="hidden min-w-0 flex-1 md:block md:max-w-[22rem] lg:max-w-[26rem] xl:max-w-[28rem]">
            <button
              type="button"
              onPointerDown={() => softHaptic(5)}
              onClick={onOpenSearch}
              title="Open search"
              className={`tap-feedback surface-sheen flex min-w-0 w-full items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition sm:gap-3 sm:px-3 sm:py-2 ${
                searchActive
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-input text-muted-foreground hover:border-primary/35 hover:text-foreground'
              }`}
            >
              <Search size={16} className={`shrink-0 ${searchActive ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className="min-w-0 flex-1 truncate text-xs sm:text-sm">
                <span className="sm:hidden">Search tokens...</span>
                <span className="hidden sm:inline">Search live token, pair, contract, or chain...</span>
              </span>
              <span className="hidden rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:inline-flex">
                /
              </span>
            </button>
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-1 md:hidden">
            <div
              className={`alpha-points-badge flex h-8 min-w-0 flex-[1.15] items-center justify-center gap-1 rounded-xl bg-primary/10 px-1.5 text-[10px] text-foreground ${
                rewardsPulse ? 'is-changing' : ''
              }`}
              title="Live total AlphaPoints earned across the platform"
              aria-live="polite"
              aria-busy={platformRewards === null}
            >
              <span className="alpha-points-emoji shrink-0" aria-hidden="true">
                🏆
              </span>
              <span key={platformRewards ?? 'loading'} className="alpha-points-value shrink-0 font-bold text-primary">
                {platformRewards !== null ? formatCompactPoints(platformRewards) : '...'}
              </span>
              <span className="min-w-0 truncate text-[8px] font-black uppercase tracking-[0.08em] text-muted-foreground">
                ALPHAPOINTS
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {platformRewards !== null ? (
              <div
                className={`alpha-points-badge hidden items-center gap-1.5 bg-primary/10 px-2 py-1.5 text-xs text-foreground md:flex ${
                  rewardsPulse ? 'is-changing' : ''
                }`}
                title="Live total AlphaPoints earned across the platform"
                aria-live="polite"
              >
                <span className="alpha-points-emoji" aria-hidden="true">
                  🏆
                </span>
                <span key={platformRewards} className="alpha-points-value font-bold text-primary">
                  {formatCompactPoints(platformRewards)}
                </span>
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">ALPHAPOINTS</span>
              </div>
            ) : null}

            <button
              onPointerDown={() => softHaptic(5)}
              onClick={() => {
                if (!authenticated) {
                  if (ready) void login();
                  return;
                }

                onBellClick?.();
              }}
              className="tap-feedback relative rounded-xl p-1.5 transition hover:bg-sidebar-accent"
              title={authenticated ? 'Notifications' : 'Sign in to view notifications'}
            >
              <Bell size={18} className={unreadCount > 0 ? 'text-foreground' : 'text-muted-foreground'} />
              {authenticated && unreadCount > 0 ? (
                <span className="absolute right-0.5 top-0.5 flex">
                  <span className="absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-destructive opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 items-center justify-center rounded-full bg-destructive text-[7px] font-bold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                </span>
              ) : null}
            </button>

            <button
              onPointerDown={() => softHaptic(4)}
              onClick={toggleTheme}
              className="tap-feedback rounded-xl p-1.5 transition hover:bg-sidebar-accent"
              title="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <button
              onPointerDown={() => softHaptic(5)}
              onClick={handleProfileClick}
              disabled={!ready}
              className="tap-feedback flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-input text-muted-foreground transition hover:border-primary/35 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 md:hidden"
              title={authenticated ? 'Profile' : 'Sign in'}
              aria-label={authenticated ? 'Open profile' : 'Sign in'}
            >
              {authenticated && avatarUrl ? (
                <img src={avatarUrl} alt={displayName ?? 'AnyAlpha user'} className="h-6 w-6 rounded-lg object-cover" />
              ) : (
                <UserRound size={17} />
              )}
            </button>

            {ready && authenticated ? (
              <div className="surface-sheen hidden items-center gap-2 rounded-xl border border-success/20 bg-success/10 px-2.5 py-1.5 md:flex">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={displayName ?? 'AnyAlpha user'} className="h-6 w-6 rounded-lg border border-success/25 object-cover" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-success" />
                )}
                <div className="leading-tight">
                  <div className="max-w-[140px] truncate text-[11px] font-bold text-foreground">{displayName}</div>
                  <div className="max-w-[160px] truncate text-[10px] text-muted-foreground">
                    {identitySubtitle}
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => void login()}
                disabled={!ready}
                className="tap-feedback soft-glow hidden items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 md:flex"
              >
                <Wallet size={13} />
                {ready ? 'Sign In' : 'Loading'}
              </button>
            )}
          </div>
        </div>

        {showTicker && hotMarkets.length > 0 ? (
          <div className="relative hidden shrink-0 items-center overflow-hidden border-t border-border bg-background/50 sm:flex">
            <div className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-r from-background/80 to-transparent" />
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-16 bg-gradient-to-l from-background/80 to-transparent" />

            <div className="ticker-track gap-2 py-1">
              {[...hotMarkets, ...hotMarkets].map((market, index) => (
                <button
                  key={`${market.id}-${index}`}
                  onClick={() => onSelectToken?.(market)}
                  className="ticker-pill tap-feedback mx-1 flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-input px-2 py-1 text-xs transition hover:bg-sidebar-accent"
                  style={{ animationDelay: `${(index % hotMarkets.length) * 0.6}s` }}
                >
                  {market.imageUrl ? (
                    <img src={market.imageUrl} alt={market.symbol} className="h-4 w-4 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted-foreground/20 text-[8px]">
                      {market.symbol.slice(0, 1)}
                    </span>
                  )}
                  <span className="font-bold">{market.symbol}</span>
                  <span className={(market.priceChange.h24 ?? 0) >= 0 ? 'text-success' : 'text-red-400'}>
                    {fmtPct(market.priceChange.h24)}
                  </span>
                </button>
              ))}
            </div>

            <button className="absolute right-2 z-20 bg-background/80 pl-1 text-xs font-semibold whitespace-nowrap text-primary hover:underline">
              Live feed
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
