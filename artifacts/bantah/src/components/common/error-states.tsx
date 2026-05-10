import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  variant?: 'default' | 'network' | 'permission' | 'api' | 'load';
  className?: string;
  compact?: boolean;
}

const variantConfig = {
  default: { icon: '⚠️', iconBg: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' },
  network: { icon: '🌐', iconBg: 'bg-orange-500/10 border-orange-500/30 text-orange-400' },
  permission: { icon: '🔒', iconBg: 'bg-destructive/10 border-destructive/30 text-destructive' },
  api: { icon: 'API', iconBg: 'bg-primary/10 border-primary/30 text-primary text-xs font-bold' },
  load: { icon: '⚡', iconBg: 'bg-destructive/10 border-destructive/30 text-destructive' },
};

export function ErrorState({ title, description, action, variant = 'default', className, compact }: ErrorStateProps) {
  const config = variantConfig[variant];

  return (
    <div className={cn('flex flex-col items-center justify-center text-center gap-2', compact ? 'py-6 px-4' : 'py-10 px-6', className)}>
      <div className={cn('w-10 h-10 rounded-full border flex items-center justify-center mb-1', config.iconBg)}>
        <span className="text-lg leading-none">{config.icon}</span>
      </div>
      <div className="text-sm font-bold text-foreground">{title}</div>
      <p className="text-xs text-muted-foreground max-w-[220px] leading-relaxed">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-1 px-3 py-1.5 border border-border text-xs font-bold rounded hover:bg-muted transition"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export function NetworkError({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorState
      variant="network"
      title="Network Error"
      description="Network error. Please check your connection and try again."
      action={onRetry ? { label: 'Try again', onClick: onRetry } : undefined}
    />
  );
}

export function LoadError({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorState
      variant="load"
      title="Failed to Load"
      description="We couldn't fetch the data. Please try again later."
      action={onRetry ? { label: 'Try again', onClick: onRetry } : undefined}
    />
  );
}

export function PermissionError({ onBack }: { onBack?: () => void }) {
  return (
    <ErrorState
      variant="permission"
      title="No Permission"
      description="Access restricted. You don't have permission to view this content."
      action={onBack ? { label: 'Go back', onClick: onBack } : undefined}
    />
  );
}

export function ApiError({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorState
      variant="api"
      title="API Error"
      description="We're having trouble retrieving data. Please try again later."
      action={onRetry ? { label: 'Try again', onClick: onRetry } : undefined}
    />
  );
}

export function GeneralError({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorState
      variant="default"
      title="Something went wrong"
      description="We couldn't load this data. Please try again."
      action={onRetry ? { label: 'Try again', onClick: onRetry } : undefined}
    />
  );
}
