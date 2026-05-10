import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface PriceAlertModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token?: string;
  currentPrice?: string;
}

export function PriceAlertModal({ open, onOpenChange, token = 'PEPEFUN', currentPrice = '$0.00001248' }: PriceAlertModalProps) {
  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [price, setPrice] = useState('0.00002000');
  const [expiry, setExpiry] = useState('24 Hours');

  const handleCreate = () => {
    onOpenChange(false);
    toast.success('Price Alert Created', {
      description: `You'll be notified when ${token} is ${condition} $${price}.`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Set Price Alert</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2 p-2 bg-muted/30 border border-border rounded">
            <span className="text-base">🐸</span>
            <div>
              <div className="text-sm font-bold">{token} / SOL</div>
              <div className="text-xs text-muted-foreground">{currentPrice} · -14.35%</div>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Alert me when price is</label>
            <div className="flex gap-1.5">
              {(['above', 'below'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCondition(c)}
                  className={`flex-1 py-1.5 rounded text-xs font-bold border transition capitalize ${
                    condition === c
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted border-border hover:bg-muted/80'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Target Price (USD)</label>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="flex-1 bg-muted border border-border rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-primary"
              />
              <span className="text-xs text-muted-foreground">1/SD</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Expires</label>
            <select
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="w-full bg-muted border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
            >
              <option>1 Hour</option>
              <option>6 Hours</option>
              <option>24 Hours</option>
              <option>7 Days</option>
              <option>30 Days</option>
              <option>Never</option>
            </select>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="flex-1 py-1.5 rounded border border-border text-sm font-bold hover:bg-muted transition"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="flex-1 py-1.5 rounded bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition"
          >
            Create Alert
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
