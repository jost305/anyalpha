interface MobileBottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function MobileBottomNav({ activeTab, onTabChange }: MobileBottomNavProps) {
  const tabs = [
    { id: 'markets', label: 'Markets', icon: '📊' },
    { id: 'signals', label: 'Signals', icon: '📡' },
    { id: 'chat', label: 'Chat', icon: '🤖' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border md:hidden">
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 px-2 transition ${
              activeTab === tab.id
                ? 'text-accent'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="text-2xl">{tab.icon}</span>
            <span className="text-xs font-bold">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
