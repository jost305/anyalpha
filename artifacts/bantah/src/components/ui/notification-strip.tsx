import { useState } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotificationStripProps {
  variant?: 'info' | 'warning' | 'success' | 'promo';
  icon?: string;
  message: string;
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
  className?: string;
}

const variantStyles = {
  info: 'bg-primary/10 border-primary/20 text-foreground',
  warning: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-200',
  success: 'bg-secondary/10 border-secondary/20 text-secondary',
  promo: 'bg-accent/10 border-accent/20 text-foreground',
};

export function NotificationStrip({
  variant = 'info',
  icon,
  message,
  action,
  onDismiss,
  className,
}: NotificationStripProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 border-b text-xs font-mono',
        variantStyles[variant],
        className
      )}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="flex-1 truncate">{message}</span>
      {action && (
        <button
          onClick={action.onClick}
          className="shrink-0 flex items-center gap-0.5 font-bold text-accent hover:underline"
        >
          {action.label}
          <ChevronRight size={12} />
        </button>
      )}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 hover:text-foreground text-muted-foreground transition-colors"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

interface StripItem {
  id: string;
  variant?: 'info' | 'warning' | 'success' | 'promo';
  icon?: string;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface NotificationStripStackProps {
  strips: StripItem[];
}

export function NotificationStripStack({ strips: initialStrips }: NotificationStripStackProps) {
  const [strips, setStrips] = useState(initialStrips);

  const dismiss = (id: string) => {
    setStrips((prev) => prev.filter((s) => s.id !== id));
  };

  if (strips.length === 0) return null;

  return (
    <div>
      {strips.map((strip) => (
        <NotificationStrip
          key={strip.id}
          variant={strip.variant}
          icon={strip.icon}
          message={strip.message}
          action={strip.action}
          onDismiss={() => dismiss(strip.id)}
        />
      ))}
    </div>
  );
}
