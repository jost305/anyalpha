import { lazy, Suspense, useEffect, useRef, useState, useTransition } from 'react';
import { PrivyProvider, usePrivy } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'framer-motion';
import Pusher from 'pusher-js';
import { toast } from 'sonner';
import { mutate } from 'swr';
import { WagmiProvider } from '@privy-io/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig, robinhoodChain, robinhoodChainTestnet } from '@/lib/wagmi';
import { ThemeProvider, useTheme } from '@/lib/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import Sidebar from '@/components/layout/sidebar';
import TopBar from '@/components/layout/topbar';
import MainContent from '@/components/layout/main-content';
import MobileBottomNav from '@/components/layout/mobile-bottom-nav';
import { useIsMobile } from '@/hooks/use-mobile';
import { type MarketToken } from '@/lib/market-data';
import { fetchUserNotifications } from '@/lib/notifications';
import { syncExistingBrowserPushSubscription } from '@/lib/push-notifications';
import { fetchRealtimeConfig, realtimeAuthEndpoint } from '@/lib/realtime';
import { applySeoMeta, pageSeo } from '@/lib/seo';
import { softHaptic } from '@/lib/mobile-feedback';

type Page =
  | 'markets'
  | 'launchpad'
  | 'watcher'
  | 'twitter-track'
  | 'verify'
  | 'search'
  | 'watchlist'
  | 'points'
  | 'leaderboard'
  | 'chat'
  | 'advertise'
  | 'docs'
  | 'token'
  | 'notifications'
  | 'profile'
  | 'launcher'
  | 'launcher-trade';
type SearchReturnPage = Exclude<Page, 'search'>;

interface RealtimeNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  readState?: 'unread' | 'read' | 'archived';
  payload?: Record<string, unknown>;
  createdAt: string;
  readAt?: string | null;
}

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID?.trim();
const REFERRAL_CODE_STORAGE_KEY = 'anyalpha.referralCode';
const REFERRAL_SOURCE_STORAGE_KEY = 'anyalpha.referralSource';

const SearchModal = lazy(() => import('@/components/modals/search-modal'));
const AdvertisePage = lazy(() => import('@/components/pages/advertise-page'));
const NotificationsPage = lazy(() => import('@/components/pages/notifications-page'));
const PointsPage = lazy(() => import('@/components/pages/points-page'));
const ProfilePage = lazy(() => import('@/components/pages/profile-page'));
const LeaderboardPage = lazy(() => import('@/components/pages/leaderboard-page'));
const LaunchpadPage = lazy(() => import('@/components/pages/launchpad-page'));
const LauncherPage = lazy(() => import('@/components/pages/launcher-page'));
const LauncherTradePage = lazy(() => import('@/components/pages/launcher-trade-page'));
const WatcherPage = lazy(() => import('@/components/pages/watcher-page'));
const TwitterTrackPage = lazy(() => import('@/components/pages/twitter-track-page'));
const SearchPage = lazy(() => import('@/components/pages/search-page'));
const TokenPage = lazy(() => import('@/components/pages/token-page'));
const WatchlistPage = lazy(() => import('@/components/pages/watchlist-page'));
const DocsPage = lazy(() => import('@/components/pages/docs-page'));
const VerifyPage = lazy(() => import('@/components/pages/verify-page'));

const CHAIN_LABELS: Record<string, string> = {
  solana: 'Solana',
  ethereum: 'Ethereum',
  base: 'Base',
  arbitrum: 'Arbitrum',
  bsc: 'BSC',
  polygon: 'Polygon',
  optimism: 'Optimism',
  avalanche: 'Avalanche',
  ton: 'TON',
  sui: 'Sui',
  aptos: 'Aptos',
  robinhood: 'Robinhood',
};

function createTokenPlaceholder(chainId: string, tokenAddress: string): MarketToken {
  return {
    id: `${chainId}:${tokenAddress}`,
    chainId,
    chainLabel: CHAIN_LABELS[chainId] ?? chainId.toUpperCase(),
    dexId: 'unknown',
    url: '',
    pairAddress: tokenAddress,
    tokenAddress,
    name: tokenAddress.slice(0, 6).toUpperCase(),
    symbol: 'TOKEN',
    quoteSymbol: '',
    volume: {},
    priceChange: {},
    txns: {
      m5: { buys: 0, sells: 0 },
      h1: { buys: 0, sells: 0 },
      h6: { buys: 0, sells: 0 },
      h24: { buys: 0, sells: 0 },
    },
    links: [],
    narrativeTags: [],
    riskFlags: [],
    signalScore: 0,
    providers: [],
  };
}

function tokenFromLocation(): MarketToken | null {
  const params = new URLSearchParams(window.location.search);
  const chainId = params.get('chain')?.trim().toLowerCase();
  const tokenAddress = params.get('token')?.trim();

  if (!chainId || !tokenAddress) return null;
  return createTokenPlaceholder(chainId, tokenAddress);
}

function pageFromLocation(): Exclude<Page, 'token'> | null {
  const pathname = window.location.pathname.replace(/\/+$/, '').toLowerCase();
  if (pathname === '' || pathname === '/') return 'markets';
  if (pathname === '/markets') return 'markets';
  if (pathname === '/trenches' || pathname === '/launchpad') return 'launchpad';
  if (pathname === '/launcher' || pathname === '/launch') return 'launcher';
  if (pathname === '/watcher' || pathname === '/wallet-tracker') return 'watcher';
  if (pathname === '/verify') return 'verify';
  if (pathname === '/search') return 'search';
  if (pathname === '/watchlist') return 'watchlist';
  if (pathname === '/rewards' || pathname === '/points' || pathname === '/referrals') return 'points';
  if (pathname === '/leaderboard' || pathname === '/leadeboard') return 'leaderboard';
  if (pathname === '/twitter-track' || pathname === '/x-track') return 'twitter-track';
  if (pathname === '/chat' || pathname === '/agent') return 'chat';
  if (pathname === '/advertise' || pathname === '/ads') return 'advertise';
  if (pathname === '/docs') return 'docs';
  if (pathname === '/notifications') return 'notifications';
  if (pathname === '/profile' || pathname === '/portfolio') return 'profile';
  return null;
}

function writeTokenLocation(token: MarketToken | null) {
  const url = new URL(window.location.href);

  if (!token) {
    url.searchParams.delete('chain');
    url.searchParams.delete('token');
  } else {
    url.searchParams.set('chain', token.chainId);
    url.searchParams.set('token', token.tokenAddress);
  }

  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, '', next);
}

function writePageLocation(page: Exclude<Page, 'token'>) {
  const url = new URL(window.location.href);

  url.searchParams.delete('chain');
  url.searchParams.delete('token');

  const paths: Record<Exclude<Page, 'token'>, string> = {
    markets: '/',
    launchpad: '/trenches',
    launcher: '/launcher',
    'launcher-trade': '/launcher-trade',
    watcher: '/watcher',
    'twitter-track': '/twitter-track',
    verify: '/verify',
    search: '/search',
    watchlist: '/watchlist',
    points: '/rewards',
    leaderboard: '/leaderboard',
    chat: '/chat',
    advertise: '/advertise',
    docs: '/docs',
    notifications: '/notifications',
    profile: '/profile',
  };

  url.pathname = paths[page] ?? '/';

  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, '', next);
}

function apiUrl(path: string) {
  const rawBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  const baseUrl = rawBaseUrl ? rawBaseUrl.replace(/\/+$/, '') : '';
  return baseUrl ? `${baseUrl}${path}` : path;
}

function captureReferralParams() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref')?.trim();
  const refSource = params.get('refSource') === 'telegram' ? 'telegram' : 'terminal';
  const normalizedRef = ref?.replace(/^ref_/i, '');

  if (!normalizedRef || !/^[a-zA-Z0-9_-]{3,32}$/.test(normalizedRef)) return;

  window.localStorage.setItem(REFERRAL_CODE_STORAGE_KEY, normalizedRef);
  window.localStorage.setItem(REFERRAL_SOURCE_STORAGE_KEY, refSource);
}

function SearchWarmup() {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-3 pt-[12vh] backdrop-blur-sm">
      <div className="w-full max-w-2xl border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 animate-ping rounded-full bg-primary" />
          <div className="text-xs font-black uppercase tracking-[0.18em] text-primary">Opening search</div>
        </div>
        <div className="mt-2 h-9 border border-border bg-input" />
      </div>
    </div>
  );
}

function PageWarmup() {
  return (
    <div className="h-full min-h-0 p-2">
      <div className="surface-sheen h-full rounded border border-border bg-card p-3">
        <div className="app-loading-line" />
      </div>
    </div>
  );
}

function Terminal() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const isMobile = useIsMobile();
  const reduceMotion = useReducedMotion();
  const [, startRoutingTransition] = useTransition();
  const [page, setPage] = useState<Page>('markets');
  const [selectedToken, setSelectedToken] = useState<MarketToken | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [desktopSearchOpen, setDesktopSearchOpen] = useState(false);
  const [mobileSearchReturnPage, setMobileSearchReturnPage] = useState<SearchReturnPage>('markets');
  const [selectedLauncherToken, setSelectedLauncherToken] = useState<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
    const token = tokenFromLocation();
    if (token) {
      setSelectedToken(token);
      setPage('token');
      return;
    }

    const locationPage = pageFromLocation();
    if (locationPage) {
      if (locationPage === 'chat') {
        setPage('markets');
        return;
      }

      setPage(locationPage);
    }
  }, []);

  useEffect(() => {
    if (!ready || !authenticated) {
      setUnreadCount(0);
      return;
    }

    const controller = new AbortController();

    void getAccessToken()
      .then((token) => {
        if (!token) return null;
        return fetchUserNotifications(token, 100, controller.signal);
      })
      .then((response) => {
        if (!response || controller.signal.aborted) return;
        setUnreadCount(response.unreadCount);
      })
      .catch(() => {
        if (!controller.signal.aborted) setUnreadCount(0);
      });

    return () => controller.abort();
  }, [authenticated, getAccessToken, ready]);

  const setNonTokenPage = (nextPage: Exclude<Page, 'token'>) => {
    writePageLocation(nextPage);
    startRoutingTransition(() => {
      setPage(nextPage);
    });
  };

  const handleSelectToken = (market: MarketToken) => {
    writeTokenLocation(market);
    startRoutingTransition(() => {
      setSelectedToken(market);
      setPage('token');
      setDesktopSearchOpen(false);
    });
  };

  const handleBackToMarkets = () => {
    writePageLocation('markets');
    startRoutingTransition(() => {
      setSelectedToken(null);
      setPage('markets');
    });
  };

  const openSearch = () => {
    if (!isMobile) {
      setDesktopSearchOpen(true);
      return;
    }

    if (page === 'search') return;

    const returnPage: SearchReturnPage = page;
    setMobileSearchReturnPage(returnPage);
    setNonTokenPage('search');
  };

  const closeMobileSearch = () => {
    if (mobileSearchReturnPage === 'token') {
      if (selectedToken) {
        writeTokenLocation(selectedToken);
        startRoutingTransition(() => {
          setPage('token');
        });
        return;
      }

      setNonTokenPage('markets');
      return;
    }

    setNonTokenPage(mobileSearchReturnPage);
  };

  const handleSidebarClick = (label: string) => {
    switch (label) {
      case 'Markets':
        setNonTokenPage('markets');
        break;
      case 'LaunchPad':
      case 'Trenches':
        setNonTokenPage('launchpad');
        break;
      case 'Launcher':
        setNonTokenPage('launcher');
        break;
      case 'Watcher':
      case 'PumpWatch':
        setNonTokenPage('watcher');
        break;
      case 'Twitter Track':
        setNonTokenPage('twitter-track');
        break;
      case 'Verify':
        setNonTokenPage('verify');
        break;
      case 'Chat Agent':
        break;
      case 'Watchlist':
        setNonTokenPage('watchlist');
        break;
      case 'Rewards':
      case 'Points':
      case 'Referrals':
        setNonTokenPage('points');
        break;
      case 'Leaderboard':
        setNonTokenPage('leaderboard');
        break;
      case 'Portfolio':
      case 'Profile':
        setNonTokenPage('profile');
        break;
      case 'Advertise':
        setNonTokenPage('advertise');
        break;
      case 'Docs':
        setNonTokenPage('docs');
        break;
      case 'Notifications':
        if (!ready || !authenticated) return;
        setUnreadCount(0);
        writePageLocation('notifications');
        startRoutingTransition(() => {
          setPage('notifications');
        });
        break;
      default:
        break;
    }
  };

  const handleBellClick = () => {
    if (!ready || !authenticated) return;
    setUnreadCount(0);
    writePageLocation('notifications');
    startRoutingTransition(() => {
      setPage('notifications');
    });
  };

  useEffect(() => {
    if (isMobile && desktopSearchOpen) {
      setDesktopSearchOpen(false);
    }
  }, [desktopSearchOpen, isMobile]);

  useEffect(() => {
    if (page === 'token') return;
    applySeoMeta(pageSeo(page));
  }, [page]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        target?.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';

      if (isEditable) return;

      const slashShortcut = event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey;
      const paletteShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';

      if (!slashShortcut && !paletteShortcut) return;

      event.preventDefault();
      openSearch();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobile, page]);

  if (!isMounted) return null;

  const mobileTokenShellActive = isMobile && page === 'token' && !!selectedToken;
  const routeKey = `${page}-${selectedToken?.id ?? 'root'}`;
  const routeInitial = reduceMotion
    ? false
    : isMobile
      ? { opacity: 0, y: 18, scale: 0.985 }
      : { opacity: 0, y: 8, scale: 0.996 };
  const routeAnimate = { opacity: 1, y: 0, scale: 1 };
  const routeExit = reduceMotion
    ? undefined
    : isMobile
      ? { opacity: 0, y: -10, scale: 0.995 }
      : { opacity: 0, y: -4, scale: 0.998 };
  const routeTransition = reduceMotion
    ? { duration: 0 }
    : isMobile
      ? { type: 'spring', stiffness: 430, damping: 38, mass: 0.78 } as const
      : { duration: 0.22, ease: [0.22, 1, 0.36, 1] } as const;

  const renderPage = () => {
    switch (page) {
      case 'token':
        return selectedToken ? (
          <TokenPage token={selectedToken} onBack={handleBackToMarkets} />
        ) : (
          <MainContent onSelectToken={handleSelectToken} />
        );
      case 'chat':
        return <MainContent onSelectToken={handleSelectToken} />;
      case 'advertise':
        return <AdvertisePage />;
      case 'docs':
        return <DocsPage />;
      case 'launchpad':
        return <LaunchpadPage onSelectToken={handleSelectToken} />;
      case 'launcher':
        return <LauncherPage onSelectToken={(id) => { setSelectedLauncherToken(id); setNonTokenPage('launcher-trade'); }} />;
      case 'launcher-trade':
        return <LauncherTradePage tokenAddress={selectedLauncherToken} onBack={() => setNonTokenPage('launcher')} />;
      case 'watcher':
        return <WatcherPage />;
      case 'twitter-track':
        return <TwitterTrackPage />;
      case 'verify':
        return <VerifyPage />;
      case 'notifications':
        return <NotificationsPage />;
      case 'profile':
        return <ProfilePage />;
      case 'watchlist':
        return (
          <WatchlistPage
            onSelectToken={handleSelectToken}
            onExploreMarkets={() => setNonTokenPage('markets')}
          />
        );
      case 'points':
        return <PointsPage />;
      case 'leaderboard':
        return <LeaderboardPage />;
      case 'search':
        return isMobile ? (
          <SearchPage onBack={closeMobileSearch} onSelectToken={handleSelectToken} />
        ) : (
          <MainContent onSelectToken={handleSelectToken} />
        );
      default:
        return <MainContent onSelectToken={handleSelectToken} />;
    }
  };

  return (
    <MotionConfig reducedMotion="user">
    <div className={`flex min-h-screen flex-col overflow-hidden bg-background text-foreground md:h-screen ${isMobile ? 'app-mobile-shell' : ''}`} style={{ minHeight: '100svh' }}>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="hidden md:flex">
          <Sidebar onMenuClick={handleSidebarClick} unreadCount={unreadCount} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {!mobileTokenShellActive ? (
          <TopBar
            onBellClick={handleBellClick}
            onMenuClick={handleSidebarClick}
            onOpenSearch={openSearch}
            onSelectToken={handleSelectToken}
            searchActive={desktopSearchOpen || (isMobile && page === 'search')}
            showTicker={page !== 'launchpad' && page !== 'docs' && page !== 'verify' && page !== 'points' && page !== 'leaderboard' && page !== 'twitter-track' && page !== 'launcher' && page !== 'launcher-trade' && page !== 'token'}
            unreadCount={unreadCount}
          />
          ) : null}

          <div
            className={`flex-1 min-h-0 overflow-hidden ${
              mobileTokenShellActive ? '' : 'p-0.5 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0.5'
            }`}
          >
            <div className="relative h-full min-h-0 overflow-hidden">
              <AnimatePresence initial={false}>
                <motion.div
                  key={routeKey}
                  className="mobile-route-layer absolute inset-0 min-h-0"
                  initial={routeInitial}
                  animate={routeAnimate}
                  exit={routeExit}
                  transition={routeTransition}
                >
                  <Suspense fallback={<PageWarmup />}>
                    {renderPage()}
                  </Suspense>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {!mobileTokenShellActive ? (
        <MobileBottomNav
          activeTab={page === 'token' || page === 'notifications' || page === 'chat' ? 'markets' : page}
          onTabChange={(tab) => {
            softHaptic(6);
            if (tab === 'search') {
              openSearch();
              return;
            }

            if (
              tab === 'markets' ||
              tab === 'launchpad' ||
              tab === 'launcher' ||
              tab === 'watcher' ||
              tab === 'twitter-track' ||
              tab === 'watchlist' ||
              tab === 'points' ||
              tab === 'leaderboard' ||
              tab === 'chat' ||
              tab === 'advertise' ||
              tab === 'docs' ||
              tab === 'profile'
            ) {
              setNonTokenPage(tab as Exclude<Page, 'token'>);
            }
          }}
        />
      ) : null}
      <RealtimeBridge
        onNotification={(notification) => {
          window.dispatchEvent(
            new CustomEvent('anyalpha:notification-created', {
              detail: {
                readState: 'unread',
                payload: {},
                readAt: null,
                ...notification,
              },
            }),
          );

          if (page !== 'notifications') {
            setUnreadCount((count) => count + 1);
          }

          toast(notification.title, {
            description: notification.body,
            action: {
              label: 'Open',
              onClick: handleBellClick,
            },
          });
        }}
      />
      <BrowserPushBridge />
      {!isMobile && desktopSearchOpen ? (
        <Suspense fallback={<SearchWarmup />}>
          <SearchModal open onOpenChange={setDesktopSearchOpen} onSelectToken={handleSelectToken} />
        </Suspense>
      ) : null}
      <Toaster />
    </div>
    </MotionConfig>
  );
}

function BrowserPushBridge() {
  const { ready, authenticated, getAccessToken } = usePrivy();

  useEffect(() => {
    if (!ready || !authenticated) return;

    let cancelled = false;

    void getAccessToken()
      .then((token) => {
        if (!token || cancelled) return false;
        return syncExistingBrowserPushSubscription(token);
      })
      .catch(() => false);

    return () => {
      cancelled = true;
    };
  }, [authenticated, getAccessToken, ready]);

  return null;
}

function RealtimeBridge({ onNotification }: { onNotification: (notification: RealtimeNotification) => void }) {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const onNotificationRef = useRef(onNotification);

  useEffect(() => {
    onNotificationRef.current = onNotification;
  }, [onNotification]);

  useEffect(() => {
    if (!ready || !authenticated) return;

    const controller = new AbortController();
    let pusher: Pusher | null = null;
    let channelName: string | null = null;
    let cancelled = false;

    void getAccessToken()
      .then(async (token) => {
        if (!token || cancelled) return;

        const config = await fetchRealtimeConfig(token, controller.signal);
        if (cancelled || !config.configured || !config.key || !config.cluster) return;

        pusher = new Pusher(config.key, {
          cluster: config.cluster,
          forceTLS: true,
          authEndpoint: realtimeAuthEndpoint(),
          auth: {
            headers: {
              authorization: `Bearer ${token}`,
            },
          },
        });
        channelName = config.channel;

        const channel = pusher.subscribe(config.channel);
        channel.bind('notification.created', (notification: RealtimeNotification) => {
          onNotificationRef.current(notification);
        });
        channel.bind('PointsAwarded', (data: { points: number, action: string }) => {
          toast.success(`You earned ${data.points} Alpha Points! 🪙`, {
            description: `Action: ${data.action.replace(/_/g, ' ')}`,
          });
          mutate('/api/alpha-points/dashboard');
        });
        channel.bind('notifications.read', () => {});
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      controller.abort();

      if (pusher && channelName) {
        pusher.unsubscribe(channelName);
      }

      pusher?.disconnect();
    };
  }, [authenticated, getAccessToken, ready]);

  return null;
}

function PrivyTokenBridge() {
  const { ready, authenticated, getAccessToken } = usePrivy();

  useEffect(() => {
    captureReferralParams();
  }, []);

  useEffect(() => {
    if (!ready) {
      setAuthTokenGetter(null);
      return;
    }

    setAuthTokenGetter(() => getAccessToken());
    return () => setAuthTokenGetter(null);
  }, [getAccessToken, ready]);

  useEffect(() => {
    if (!ready || !authenticated) return;

    let cancelled = false;

    void getAccessToken()
      .then((token) => {
        if (!token || cancelled) return null;

        const ref = window.localStorage.getItem(REFERRAL_CODE_STORAGE_KEY);
        const refSource = window.localStorage.getItem(REFERRAL_SOURCE_STORAGE_KEY) === 'telegram' ? 'telegram' : 'terminal';
        const params = new URLSearchParams();

        if (ref) {
          params.set('ref', ref);
          params.set('refSource', refSource);
        }

        const query = params.toString();

        return fetch(apiUrl(`/api/auth/me${query ? `?${query}` : ''}`), {
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${token}`,
          },
        }).then((response) => {
          if (response.ok && ref) {
            window.localStorage.removeItem(REFERRAL_CODE_STORAGE_KEY);
            window.localStorage.removeItem(REFERRAL_SOURCE_STORAGE_KEY);
          }

          return response;
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [authenticated, getAccessToken, ready]);

  return null;
}

function AuthConfiguredApp() {
  const { theme } = useTheme();

  if (!privyAppId) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-3xl border border-border bg-card p-6 shadow-2xl">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Privy Required</div>
          <h1 className="mt-3 text-2xl font-black tracking-tight">Authentication is not configured yet.</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Add <code>VITE_PRIVY_APP_ID</code> to the workspace <code>.env.local</code> file, then
            restart the Vite app.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        defaultChain: robinhoodChainTestnet,
        supportedChains: [robinhoodChainTestnet, robinhoodChain],
        appearance: {
          theme: theme === 'dark' ? 'dark' : 'light',
          accentColor: '#f52e2b',
          logo: '/anyalpha-logo.png?v=20260523',
          landingHeader: 'Sign in to anyAlpha',
          loginMessage: 'Use Privy to unlock your live profile, linked accounts, and connected wallets.',
          showWalletLoginFirst: true,
          walletChainType: 'ethereum-and-solana',
          walletList: [
            'detected_solana_wallets',
            'phantom',
            'backpack',
            'solflare',
            'detected_ethereum_wallets',
            'metamask',
            'coinbase_wallet',
            'rainbow',
            'wallet_connect',
          ],
        },
        loginMethods: ['wallet', 'email', 'google', 'twitter'],
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
          solana: {
            createOnLogin: 'users-without-wallets',
          },
        },
        externalWallets: {
          solana: {
            connectors: toSolanaWalletConnectors(),
          },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <PrivyTokenBridge />
          <Terminal />
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}

const queryClient = new QueryClient();

export default function App() {
  return (
    <ThemeProvider>
      <AuthConfiguredApp />
    </ThemeProvider>
  );
}
