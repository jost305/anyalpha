import { useState } from 'react';
import LivePrediction from '@/components/sections/live-prediction';
import AgentBattle from '@/components/sections/agent-battle';
import TopAgents from '@/components/sections/top-agents';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface RightPanelProps {
  selectedToken: string;
}

export default function RightPanel({ selectedToken }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState('battle');

  return (
    <div className="w-full lg:w-72 flex flex-col gap-0.5 overflow-hidden">
      <div className="h-64 lg:h-auto lg:flex-1 bg-card border border-border rounded overflow-hidden">
        <LivePrediction token={selectedToken} />
      </div>

      <div className="h-72 lg:h-auto lg:flex-1 bg-card border border-border rounded overflow-hidden flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1">
          <TabsList className="bg-background border-b border-border rounded-none p-0 h-auto">
            <TabsTrigger
              value="battle"
              className="text-xs sm:text-sm py-0.5 px-2 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent flex-1"
            >
              ⚔️ BATTLE
            </TabsTrigger>
            <TabsTrigger
              value="agents"
              className="text-xs sm:text-sm py-0.5 px-2 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent flex-1"
            >
              🏆 TOP
            </TabsTrigger>
          </TabsList>
          <TabsContent value="battle" className="flex-1 overflow-hidden p-0 mt-0">
            <AgentBattle />
          </TabsContent>
          <TabsContent value="agents" className="flex-1 overflow-hidden p-0 mt-0">
            <TopAgents />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
