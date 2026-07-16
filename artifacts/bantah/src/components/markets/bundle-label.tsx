import type { MarketBundleAnalysis, MarketBundleLabel } from '@/lib/market-data';
import { cn } from '@/lib/utils';

const BUNDLE_META: Record<
  MarketBundleLabel,
  {
    icon: string;
    label: string;
    className: string;
  }
> = {
  bundled: {
    icon: '🔴',
    label: 'Bundled',
    className: 'border-red-400/25 bg-red-400/10 text-red-300',
  },
  organic: {
    icon: '🟢',
    label: 'Organic',
    className: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  },
  suspicious: {
    icon: '🟡',
    label: 'Suspicious',
    className: 'border-yellow-400/25 bg-yellow-400/10 text-yellow-300',
  },
  unknown: {
    icon: '⚪',
    label: 'Unknown',
    className: 'border-border bg-muted/45 text-muted-foreground',
  },
};

export function BundleLabel({
  bundle,
  showScore = false,
  iconOnly = false,
  className,
}: {
  bundle?: MarketBundleAnalysis;
  showScore?: boolean;
  iconOnly?: boolean;
  className?: string;
}) {
  const label = bundle?.label ?? 'unknown';
  const meta = BUNDLE_META[label];
  const score = Number.isFinite(bundle?.score) ? bundle?.score : undefined;
  const isUnclassified = label === 'unknown';
  const title = isUnclassified
    ? 'Bundle analysis pending'
    : (bundle?.reasons?.[0]?.detail ?? `${meta.label} bundle status`);

  return (
    <span
      className={cn(
        'inline-flex max-w-full shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-black leading-none',
        meta.className,
        className,
      )}
      title={title}
      aria-label={title}
    >
      <span aria-hidden>{meta.icon}</span>
      {!iconOnly && !isUnclassified ? <span className="truncate">{meta.label}</span> : null}
      {!iconOnly && showScore && !isUnclassified && typeof score === 'number' ? <span className="font-mono">{score}/100</span> : null}
    </span>
  );
}
