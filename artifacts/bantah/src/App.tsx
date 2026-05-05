import { useState, useEffect } from 'react';
import { ThemeProvider } from '@/lib/theme-provider';
import { useMobile } from '@/lib/use-mobile';
import Sidebar from '@/components/layout/sidebar';
import TopBar from '@/components/layout/topbar';
import MainContent from '@/components/layout/main-content';
import RightPanel from '@/components/layout/right-panel';
import MobileBottomNav from '@/components/layout/mobile-bottom-nav';
import ChatPage from '@/components/pages/chat-page';

function Terminal() {
  const [selectedToken, setSelectedToken] = useState('PEPEFUN');
  const [isMounted, setIsMounted] = useState(false);
  const [mobileTab, setMobileTab] = useState('markets');
  const isMobile = useMobile();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  const handleSidebarClick = (label: string) => {
    if (label === 'chat') {
      setMobileTab('chat');
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <div className="hidden md:flex">
        <Sidebar onMenuClick={handleSidebarClick} />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />

        <div className="flex-1 flex gap-0.5 overflow-hidden p-0.5 pb-20 md:pb-0.5 flex-col md:flex-row">
          {!(isMobile && mobileTab === 'chat') && (
            <>
              <MainContent selectedToken={selectedToken} setSelectedToken={setSelectedToken} />

              {mobileTab === 'chat' && !isMobile ? (
                <div className="hidden lg:flex">
                  <ChatPage />
                </div>
              ) : (mobileTab === 'prediction' || mobileTab === 'battle') && isMobile ? (
                <div className="w-full">
                  <RightPanel selectedToken={selectedToken} />
                </div>
              ) : (
                <div className="hidden lg:flex">
                  <RightPanel selectedToken={selectedToken} />
                </div>
              )}
            </>
          )}

          {isMobile && mobileTab === 'chat' && (
            <ChatPage />
          )}
        </div>
      </div>

      <MobileBottomNav activeTab={mobileTab} onTabChange={setMobileTab} />
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
