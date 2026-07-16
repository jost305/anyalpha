import { cn } from '@/lib/utils';

interface ChipProps {
  label: string;
  color?: 'default' | 'green' | 'purple' | 'orange' | 'blue' | 'red' | 'yellow';
  icon?: string;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}

const colorStyles = {
  default: 'bg-muted border-border text-muted-foreground hover:border-foreground/30',
  green: 'bg-success/10 border-success/30 text-success hover:bg-success/20',
  purple: 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20',
  orange: 'bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/20',
  blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20',
  red: 'bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/20',
  yellow: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20',
};

export function Chip({ label, color = 'default', icon, onClick, active, className }: ChipProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold border rounded transition',
        colorStyles[color],
        active && 'ring-1 ring-current',
        !onClick && 'cursor-default',
        className
      )}
    >
      {icon && <span className="text-sm leading-none">{icon}</span>}
      {label}
    </button>
  );
}

export const CATEGORY_CHIPS: Record<string, { color: ChipProps['color']; icon: string }> = {
  Memecoin: { color: 'orange', icon: '🐸' },
  Crypto: { color: 'purple', icon: '₿' },
  AI: { color: 'blue', icon: '🤖' },
  Ecosystem: { color: 'green', icon: '🌐' },
  Political: { color: 'red', icon: '🏛️' },
  Tech: { color: 'blue', icon: '💻' },
  DeFi: { color: 'purple', icon: '🏦' },
  NFT: { color: 'yellow', icon: '🎨' },
};

export function CategoryChip({ category, onClick, active }: { category: string; onClick?: () => void; active?: boolean }) {
  const config = CATEGORY_CHIPS[category] || { color: 'default' as const, icon: '📌' };
  return <Chip label={category} color={config.color} icon={config.icon} onClick={onClick} active={active} />;
}

interface LiveBadgeProps {
  className?: string;
}

export function LiveBadge({ className }: LiveBadgeProps) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-bold text-success animate-pulse', className)}>
      <span className="w-1.5 h-1.5 rounded-full bg-success" />
      LIVE
    </span>
  );
}

export function NewBadge() {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-bold bg-primary/10 border border-primary/30 text-primary rounded">
      NEW
    </span>
  );
}

export function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded border border-success/30 bg-success/10 px-1.5 py-0.5 text-xs font-bold text-success">
      ✓ Verified
    </span>
  );
}

export function TrendingBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-bold bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded">
      🔥 Hot
    </span>
  );
}
