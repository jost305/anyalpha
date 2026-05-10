import { useState } from 'react';
import MarketsTable from '@/components/sections/markets-table';
import SignalsSection from '@/components/sections/signals-section';
import TradingChart from '@/components/sections/trading-chart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PriceAlertModal } from '@/components/modals/price-alert-modal';
import { WatchlistModal } from '@/components/modals/watchlist-modal';

interface MainContentProps {
  selectedToken: string;
  setSelectedToken: (token: string) => void;
}

export default function MainContent({ selectedToken, setSelectedToken }: MainContentProps) {
  const [activeTab, setActiveTab] = useState('markets');
  const [priceAlertOpen, setPriceAlertOpen] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [chartVisible, setChartVisible] = useState(false);

  return (
    <>
      <PriceAlertModal open={priceAlertOpen} onOpenChange={setPriceAlertOpen} token={selectedToken} />
      <WatchlistModal open={watchlistOpen} onOpenChange={setWatchlistOpen} token={selectedToken} />

      <div className="h-full flex flex-col gap-0.5 overflow-hidden">
        {chartVisible && (
          <div className="h-56 shrink-0 bg-card border border-border rounded overflow-hidden">
            <TradingChart
              token={selectedToken}
              onOpenPriceAlert={() => setPriceAlertOpen(true)}
              onOpenWatchlist={() => setWatchlistOpen(true)}
            />
          </div>
        )}

        <div className="flex-1 bg-card border border-border rounded overflow-hidden flex flex-col min-h-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
            <TabsList className="bg-background border-b border-border rounded-none p-0 h-auto shrink-0 flex items-center">
              <TabsTrigger
                value="markets"
                className="text-xs sm:text-sm py-1.5 px-3 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
              >
                📊 MARKETS
              </TabsTrigger>
              <TabsTrigger
                value="signals"
                className="text-xs sm:text-sm py-1.5 px-3 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
              >
                📡 SIGNALS
              </TabsTrigger>
              <div className="ml-auto pr-2">
                <button
                  onClick={() => setChartVisible((v) => !v)}
                  className={`text-xs px-2 py-1 rounded border transition font-mono ${chartVisible ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:border-foreground/30'}`}
                >
                  {chartVisible ? '▾ Chart' : '▸ Chart'}
                </button>
              </div>
            </TabsList>
            <TabsContent value="markets" className="flex-1 overflow-hidden p-0 mt-0 min-h-0">
              <MarketsTable onSelectToken={(token) => { setSelectedToken(token); setChartVisible(true); }} />
            </TabsContent>
            <TabsContent value="signals" className="flex-1 overflow-hidden p-0 mt-0 min-h-0">
              <SignalsSection />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}
