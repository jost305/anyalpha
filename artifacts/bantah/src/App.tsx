import { useState, useEffect } from 'react';
import { ThemeProvider } from '@/lib/theme-provider';
import { useMobile } from '@/lib/use-mobile';
import { Toaster } from '@/components/ui/sonner';
import { NotificationStripStack } from '@/components/ui/notification-strip';
import Sidebar from '@/components/layout/sidebar';
import TopBar from '@/components/layout/topbar';
import MainContent from '@/components/layout/main-content';
import MobileBottomNav from '@/components/layout/mobile-bottom-nav';
import ChatPage from '@/components/pages/chat-page';
import AdvertisePage from '@/components/pages/advertise-page';
import TokenPage from '@/components/pages/token-page';

type Page = 'markets' | 'chat' | 'advertise' | 'token';

const INITIAL_STRIPS = [
  {
    id: 'trending',
    variant: 'info' as const,
    icon: '🔥',
    message: 'TRENDING: 1. PONKE  2. WIF  3. BOME  4. POPCAT  5. NORMIE',
    action: { label: 'View all', onClick: () => {} },
  },
  {
    id: 'network',
    variant: 'promo' as const,
    icon: '📡',
    message: 'NETWORK: Solana  •  24H VOLUME: $2.45B  •  24H TXNs: 1.87M',
  },
  {
    id: 'api',
    variant: 'success' as const,
    icon: '🚀',
    message: 'New: Track your portfolio across chains.',
    action: { label: 'Try Portfolio', onClick: () => {} },
  },
];

function Terminal() {
  const [page, setPage] = useState<Page>('markets');
  const [selectedToken, setSelectedToken] = useState('PEPEFUN');
  const [isMounted, setIsMounted] = useState(false);
  const isMobile = useMobile();

  useEffect(() => { setIsMounted(true); }, []);
  if (!isMounted) return null;

  const handleSelectToken = (name: string) => {
    setSelectedToken(name);
    setPage('token');
  };

  const handleSidebarClick = (label: string) => {
    if (label === 'Chat Agent') setPage('chat');
    if (label === 'Advertise')  setPage('advertise');
    if (label === 'Markets')    setPage('markets');
  };

  const renderPage = () => {
    switch (page) {
      case 'token':
        return <TokenPage token={selectedToken} onBack={() => setPage('markets')} />;
      case 'chat':
        return <ChatPage />;
      case 'advertise':
        return <AdvertisePage />;
      default:
        return <MainContent onSelectToken={handleSelectToken} />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <NotificationStripStack strips={INITIAL_STRIPS} />

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:flex">
          <Sidebar onMenuClick={handleSidebarClick} />
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />

          <div className="flex-1 overflow-hidden p-0.5 pb-20 md:pb-0.5">
            {renderPage()}
          </div>
        </div>
      </div>

      <MobileBottomNav
        activeTab={page === 'token' ? 'markets' : page}
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
