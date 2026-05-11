import { useEffect, useState } from 'react';
import MarketsTable from '@/components/sections/markets-table';
import SignalsSection from '@/components/sections/signals-section';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchMarkets, fmtCompact, type MarketToken } from '@/lib/market-data';

interface MainContentProps {
  onSelectToken: (token: MarketToken) => void;
}

export default function MainContent({ onSelectToken }: MainContentProps) {
  const [activeTab, setActiveTab] = useState('markets');
  const [marketCapTotal, setMarketCapTotal] = useState<number | null>(null);
  const [volume24h, setVolume24h] = useState<number | null>(null);
  const [txns24h, setTxns24h] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadStats = () => {
      fetchMarkets({ sort: 'trending', limit: 1, signal: controller.signal })
        .then((response) => {
          setMarketCapTotal(response.aggregates.marketCapUsd);
          setVolume24h(response.aggregates.volume24hUsd);
          setTxns24h(response.aggregates.txns24h);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setMarketCapTotal(null);
            setVolume24h(null);
            setTxns24h(null);
          }
        });
    };

    loadStats();
    const intervalId = setInterval(loadStats, 30000);

    return () => {
      clearInterval(intervalId);
      controller.abort();
    };
  }, []);

  return (
    <div className="h-full flex flex-col gap-0.5 overflow-hidden">
      <div className="flex-1 bg-card border border-border rounded overflow-hidden flex flex-col min-h-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
          <TabsList className="bg-background border-b border-border rounded-none p-0 h-auto shrink-0 flex items-center justify-between gap-2">
            <div className="flex items-center">
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
            </div>

            <div className="hidden lg:flex items-center gap-4 px-3 text-[11px] text-muted-foreground whitespace-nowrap">
              <span>
                Total MC:{' '}
                <span className="font-mono font-bold text-[#c7b8ff]">
                  {marketCapTotal !== null ? fmtCompact(marketCapTotal, { currency: true }) : '...'}
                </span>
              </span>
              <span>
                24H Volume:{' '}
                <span className="font-mono font-bold text-foreground">
                  {volume24h !== null ? fmtCompact(volume24h, { currency: true }) : '...'}
                </span>
              </span>
              <span>
                24H Txns:{' '}
                <span className="font-mono font-bold text-foreground">
                  {txns24h !== null ? fmtCompact(txns24h, { digits: 0 }) : '...'}
                </span>
              </span>
            </div>
          </TabsList>
          <TabsContent value="markets" className="flex-1 overflow-hidden p-0 mt-0 min-h-0">
            <MarketsTable onSelectToken={onSelectToken} />
          </TabsContent>
          <TabsContent value="signals" className="flex-1 overflow-hidden p-0 mt-0 min-h-0">
            <SignalsSection />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
