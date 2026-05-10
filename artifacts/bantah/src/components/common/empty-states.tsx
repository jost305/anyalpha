import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  className?: string;
  compact?: boolean;
}

export function EmptyState({ icon, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center gap-2',
        compact ? 'py-6 px-4' : 'py-10 px-6',
        className
      )}
    >
      <div className="text-4xl mb-1 opacity-40 select-none">{icon}</div>
      <div className="text-sm font-bold text-foreground">{title}</div>
      <p className="text-xs text-muted-foreground max-w-[200px] leading-relaxed">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-1 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded hover:opacity-80 transition"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export function EmptyMarkets({ onExplore }: { onExplore?: () => void }) {
  return (
    <EmptyState
      icon="📊"
      title="No markets found"
      description="Try adjusting your filters or search term."
      action={onExplore ? { label: 'Clear filters', onClick: onExplore } : undefined}
    />
  );
}

export function EmptySignals() {
  return (
    <EmptyState
      icon="📡"
      title="No signals yet"
      description="Signals will appear here once there is enough trading data."
    />
  );
}

export function EmptyAgents() {
  return (
    <EmptyState
      icon="🏆"
      title="No top traders yet"
      description="Top agents will appear here once there is enough data."
    />
  );
}

export function EmptyAlerts({ onCreate }: { onCreate?: () => void }) {
  return (
    <EmptyState
      icon="🔔"
      title="No alerts set"
      description="Create price alerts to get notified about price changes."
      action={onCreate ? { label: 'Create alert', onClick: onCreate } : undefined}
    />
  );
}

export function EmptyWatchlist({ onExplore }: { onExplore?: () => void }) {
  return (
    <EmptyState
      icon="⭐"
      title="Your watchlist is empty"
      description="Add pairs to your watchlist to keep track of them."
      action={onExplore ? { label: 'Explore pairs', onClick: onExplore } : undefined}
    />
  );
}

export function EmptyTransactions() {
  return (
    <EmptyState
      icon="📋"
      title="No transactions yet"
      description="Transactions will appear here once they happen."
    />
  );
}

export function EmptySearch({ onReset }: { onReset?: () => void }) {
  return (
    <EmptyState
      icon="🔍"
      title="No results found"
      description="We couldn't find anything matching your search."
      action={onReset ? { label: 'Try a different search', onClick: onReset } : undefined}
    />
  );
}

export function EmptyPortfolio() {
  return (
    <EmptyState
      icon="💼"
      title="No trades yet"
      description="Your trades will appear here once you start trading."
    />
  );
}
