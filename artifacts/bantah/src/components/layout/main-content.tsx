import { useState } from 'react';
import MarketsTable from '@/components/sections/markets-table';
import SignalsSection from '@/components/sections/signals-section';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface MainContentProps {
  onSelectToken: (token: string) => void;
}

export default function MainContent({ onSelectToken }: MainContentProps) {
  const [activeTab, setActiveTab] = useState('markets');

  return (
    <div className="h-full flex flex-col gap-0.5 overflow-hidden">
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
