import { useState } from 'react';
import TradingChart from '@/components/sections/trading-chart';
import MarketsTable from '@/components/sections/markets-table';
import SignalsSection from '@/components/sections/signals-section';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface MainContentProps {
  selectedToken: string;
  setSelectedToken: (token: string) => void;
}

export default function MainContent({ selectedToken, setSelectedToken }: MainContentProps) {
  const [activeTab, setActiveTab] = useState('markets');

  return (
    <div className="flex-1 flex flex-col gap-0.5 min-w-0 overflow-hidden md:w-auto">
      <div className="h-60 md:h-auto md:flex-1 bg-card border border-border rounded overflow-hidden flex flex-col">
        <TradingChart token={selectedToken} />
      </div>

      <div className="h-80 md:h-auto md:flex-1 bg-card border border-border rounded overflow-hidden flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1">
          <TabsList className="bg-background border-b border-border rounded-none p-0 h-auto">
            <TabsTrigger
              value="markets"
              className="text-xs sm:text-sm py-0.5 px-2 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent flex-1 md:flex-none"
            >
              📊 MARKETS
            </TabsTrigger>
            <TabsTrigger
              value="signals"
              className="text-xs sm:text-sm py-0.5 px-2 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent flex-1 md:flex-none"
            >
              📡 SIGNALS
            </TabsTrigger>
          </TabsList>
          <TabsContent value="markets" className="flex-1 overflow-hidden p-0 mt-0">
            <MarketsTable onSelectToken={setSelectedToken} />
          </TabsContent>
          <TabsContent value="signals" className="flex-1 overflow-hidden p-0 mt-0">
            <SignalsSection />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
