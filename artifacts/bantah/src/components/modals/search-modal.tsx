import MarketSearch from '@/components/search/market-search';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { type MarketToken } from '@/lib/market-data';

interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectToken?: (token: MarketToken) => void;
}

export default function SearchModal({ open, onOpenChange, onSelectToken }: SearchModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[78vh] w-[min(92vw,70rem)] max-w-[70rem] flex-col overflow-hidden border-border bg-card p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Search live markets</DialogTitle>
          <DialogDescription>
            Browse and search live markets, pairs, and chains, then open a token dashboard.
          </DialogDescription>
        </DialogHeader>

        <MarketSearch
          mode="modal"
          onSelectToken={(token) => {
            onSelectToken?.(token);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
