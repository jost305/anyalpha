import { Activity } from 'lucide-react';
import { getDexBrand } from '@/lib/dex-branding';
import { marketPairLabel, type MarketToken } from '@/lib/market-data';
import { cn } from '@/lib/utils';

function chartEmbedUrl(token: MarketToken) {
  const chain = token.chainId.trim().toLowerCase();
  const pair = token.pairAddress.trim();

  if (!chain || !pair) return null;

  const params = new URLSearchParams({
    embed: '1',
    theme: 'dark',
    trades: '0',
    info: '0',
  });

  return `https://dexscreener.com/${encodeURIComponent(chain)}/${encodeURIComponent(pair)}?${params.toString()}`;
}

export function LivePairChartFrame({
  token,
  className,
  compact = false,
}: {
  token: MarketToken;
  className?: string;
  compact?: boolean;
}) {
  const url = chartEmbedUrl(token);
  const dexLabel = getDexBrand(token.dexId)?.label ?? token.dexId;

  if (!url) {
    return (
      <div className={cn('flex h-full min-h-[260px] items-center justify-center bg-background px-4 text-center', className)}>
        <div>
          <Activity className="mx-auto h-5 w-5 text-muted-foreground" />
          <div className="mt-3 text-sm font-semibold text-foreground">Chart unavailable</div>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            This pair does not have enough address context to open a live chart yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('relative h-full min-h-[320px] overflow-hidden bg-background', className)}>
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/92 px-2.5 py-2 text-xs backdrop-blur">
        <div className="min-w-0">
          <div className="truncate font-black text-foreground">{marketPairLabel(token)}</div>
          <div className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Live pair chart · {dexLabel}
          </div>
        </div>
        <div className="shrink-0 rounded border border-primary/25 bg-primary/10 px-2 py-1 text-[10px] font-black text-primary">
          Live
        </div>
      </div>
      <iframe
        title={`${marketPairLabel(token)} live chart`}
        src={url}
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        className={cn('h-full w-full border-0', compact ? 'pt-11' : 'pt-12')}
      />
    </div>
  );
}
