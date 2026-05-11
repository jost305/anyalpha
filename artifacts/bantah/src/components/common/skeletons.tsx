import { Skeleton } from '@/components/ui/skeleton';

export function ChartSkeleton() {
  return (
    <div className="flex flex-col h-full p-2 gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-14" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="flex gap-1 mt-1">
        {['1m','5m','15m','1h','4h','1D'].map(tf => (
          <Skeleton key={tf} className="h-5 w-7" />
        ))}
      </div>
      <div className="flex-1 relative overflow-hidden rounded">
        <Skeleton className="absolute inset-0" />
        <div className="absolute inset-0 flex items-end pb-4 px-2 gap-1">
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 bg-primary/5 rounded-t"
              style={{ height: `${30 + Math.sin(i * 0.5) * 20 + Math.random() * 20}%` }}
            />
          ))}
        </div>
      </div>
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

export function MarketRowSkeleton() {
  return (
    <div className="flex items-center px-2 py-2 border-b border-border gap-3">
      <Skeleton className="h-6 w-6 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="hidden sm:flex items-center gap-3">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3.5 w-14" />
      </div>
      <div className="flex gap-1.5">
        <Skeleton className="h-8 w-12 rounded" />
        <Skeleton className="h-8 w-12 rounded" />
      </div>
    </div>
  );
}

export function MarketsTableSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-7 w-24 rounded" />
      </div>
      <div className="flex-1 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <MarketRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function SignalRowSkeleton() {
  return (
    <div className="bg-muted/30 border border-border/50 rounded px-2 py-1.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded-full shrink-0" />
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3.5 w-16 ml-auto" />
      </div>
      <Skeleton className="h-3.5 w-full" />
      <div className="flex gap-1.5">
        <Skeleton className="h-5 w-20 rounded" />
        <Skeleton className="h-5 w-16 rounded" />
        <Skeleton className="h-5 w-14 rounded ml-auto" />
      </div>
    </div>
  );
}

export function SignalsSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border px-2 py-1.5 space-y-1">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3.5 w-44" />
      </div>
      <div className="flex-1 overflow-hidden px-2 py-1.5 space-y-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <SignalRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function NotificationsSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-8 w-24 rounded" />
      </div>
      <div className="border-b border-border px-4 py-2 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-16 rounded-full" />
        ))}
      </div>
      <div className="flex-1 overflow-hidden px-4 py-3 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 border-b border-border/50 pb-3">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-14" />
              </div>
              <Skeleton className="h-3.5 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-4 w-16 rounded" />
                <Skeleton className="h-4 w-20 rounded" />
                <Skeleton className="h-4 w-16 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AgentsSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border px-2 py-1.5">
        <Skeleton className="h-4 w-28" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 px-2 py-2 border-b border-border">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-7 w-7 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <div className="space-y-1 text-right">
            <Skeleton className="h-3.5 w-14 ml-auto" />
            <Skeleton className="h-3.5 w-20 ml-auto" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PredictionSkeleton() {
  return (
    <div className="flex flex-col h-full p-2 gap-2">
      <div className="space-y-1 pb-2 border-b border-border">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-3.5 w-32" />
      </div>
      <div className="flex justify-between pb-2 border-b border-border">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="flex gap-1.5">
        <Skeleton className="flex-1 h-14 rounded" />
        <Skeleton className="flex-1 h-14 rounded" />
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-3.5 w-28" />
        <div className="flex justify-between">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
        <Skeleton className="h-2 w-full rounded" />
      </div>
      <div className="mt-auto space-y-1.5">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-8 w-full rounded" />
        <Skeleton className="h-9 w-full rounded" />
      </div>
    </div>
  );
}

export function ContentSkeleton() {
  return (
    <div className="p-4 space-y-3">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
