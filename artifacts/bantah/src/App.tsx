import { useEffect, useState } from 'react';
import { ThemeProvider } from '@/lib/theme-provider';
import { useMobile } from '@/lib/use-mobile';
import { Toaster } from '@/components/ui/sonner';
import Sidebar from '@/components/layout/sidebar';
import TopBar from '@/components/layout/topbar';
import MainContent from '@/components/layout/main-content';
import MobileBottomNav from '@/components/layout/mobile-bottom-nav';
import ChatPage from '@/components/pages/chat-page';
import AdvertisePage from '@/components/pages/advertise-page';
import TokenPage from '@/components/pages/token-page';
import NotificationsPage from '@/components/pages/notifications-page';
import LeaderboardPage from '@/components/pages/leaderboard-page';
import ProfilePage from '@/components/pages/profile-page';
import AdminPage from '@/components/pages/admin-page';
import { type MarketToken } from '@/lib/market-data';

type Page = 'markets' | 'chat' | 'advertise' | 'token' | 'notifications' | 'leaderboard' | 'profile' | 'admin';

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

function Terminal() {
  const [page, setPage] = useState<Page>('markets');
  const [selectedToken, setSelectedToken] = useState<MarketToken | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [unreadCount, setUnreadCount] = useState(3);
  const isMobile = useMobile();

  useEffect(() => {
    setIsMounted(true);
    const token = tokenFromLocation();
    if (token) {
      setSelectedToken(token);
      setPage('token');
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (page !== 'notifications') {
        setUnreadCount(c => c + 1);
      }
    }, 12000);
    return () => clearInterval(id);
  }, [page]);

  if (!isMounted) return null;

  const handleSelectToken = (market: MarketToken) => {
    setSelectedToken(market);
    setPage('token');
    writeTokenLocation(market);
  };

  const handleBackToMarkets = () => {
    setSelectedToken(null);
    setPage('markets');
    writeTokenLocation(null);
  };

  const handleSidebarClick = (label: string) => {
    if (label === 'Chat Agent') { setPage('chat'); writeTokenLocation(null); }
    if (label === 'Advertise') { setPage('advertise'); writeTokenLocation(null); }
    if (label === 'Markets') { setPage('markets'); writeTokenLocation(null); }
    if (label === 'Notifications') { setPage('notifications'); setUnreadCount(0); writeTokenLocation(null); }
    if (label === 'Leaderboard') { setPage('leaderboard'); writeTokenLocation(null); }
    if (label === 'Profile') { setPage('profile'); writeTokenLocation(null); }
    if (label === 'Admin') { setPage('admin'); writeTokenLocation(null); }
  };

  const handleBellClick = () => {
    setPage('notifications');
    setUnreadCount(0);
    writeTokenLocation(null);
  };

  const renderPage = () => {
    switch (page) {
      case 'token':
        return selectedToken
          ? <TokenPage token={selectedToken} onBack={handleBackToMarkets} />
          : <MainContent onSelectToken={handleSelectToken} />;
      case 'chat':
        return <ChatPage />;
      case 'advertise':
        return <AdvertisePage />;
      case 'notifications':
        return <NotificationsPage />;
      case 'leaderboard':
        return <LeaderboardPage />;
      case 'profile':
        return <ProfilePage />;
      case 'admin':
        return <AdminPage />;
      default:
        return <MainContent onSelectToken={handleSelectToken} />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:flex">
          <Sidebar onMenuClick={handleSidebarClick} unreadCount={unreadCount} />
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar
            onBellClick={handleBellClick}
            onSelectToken={handleSelectToken}
            unreadCount={unreadCount}
          />

          <div className="flex-1 overflow-hidden p-0.5 pb-20 md:pb-0.5">
            {renderPage()}
          </div>
        </div>
      </div>

      <MobileBottomNav
        activeTab={page === 'token' || page === 'notifications' ? 'markets' : page}
        onTabChange={(tab) => {
          if (tab === 'markets' || tab === 'chat' || tab === 'advertise') setPage(tab as Page);
        }}
      />
      <Toaster />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <Terminal />
    </ThemeProvider>
  );
}
