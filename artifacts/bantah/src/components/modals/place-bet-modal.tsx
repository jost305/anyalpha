import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface PlaceBetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token?: string;
  side?: 'yes' | 'no';
  percent?: number;
}

export function PlaceBetModal({ open, onOpenChange, token = 'PEPEFUN', side = 'yes', percent = 62 }: PlaceBetModalProps) {
  const [amount, setAmount] = useState('500');
  const [slippage, setSlippage] = useState('1%');
  const quickAmounts = ['100', '250', '500', '1000'];

  const payout = Math.round(parseInt(amount || '0') * (100 / percent));

  const handleBet = () => {
    onOpenChange(false);
    toast.loading('Transaction Pending', {
      description: 'Your transaction is pending confirmation...',
      duration: 2000,
    });
    setTimeout(() => {
      toast.success('Transaction Confirmed', {
        description: `Swap successful! Bet placed on ${side.toUpperCase()} for ${amount} BXBT.`,
      });
    }, 2000);
  };

  const isYes = side === 'yes';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">
            Place Bet — <span className={isYes ? 'text-secondary' : 'text-destructive'}>{side.toUpperCase()}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="p-2 bg-muted/30 border border-border rounded text-sm">
            <div className="font-bold mb-0.5">Will {token} 2x in 24H?</div>
            <div className="text-muted-foreground text-xs">Ends in 23h 14m 32s · Pool: 12,845 BXBT</div>
          </div>

          <div className={`flex items-center justify-between p-2 rounded border ${
            isYes ? 'bg-success/10 border-success/30' : 'bg-destructive/10 border-destructive/30'
          }`}>
            <span className="text-sm font-bold">{side.toUpperCase()}</span>
            <span className={`text-lg font-mono font-bold ${isYes ? 'text-success' : 'text-destructive'}`}>
              {percent}%
            </span>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Bet Amount (BXBT)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-muted border border-border rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-primary"
            />
            <div className="flex gap-1.5 mt-1.5">
              {quickAmounts.map((q) => (
                <button
                  key={q}
                  onClick={() => setAmount(q)}
                  className="flex-1 py-1 rounded text-xs font-bold border border-border hover:bg-muted/80 transition"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground mb-1">Slippage Tolerance</div>
            <div className="flex gap-1.5">
              {['0.1%', '0.5%', '1%'].map((s) => (
                <button
                  key={s}
                  onClick={() => setSlippage(s)}
                  className={`flex-1 py-1 rounded text-xs font-bold border transition ${
                    slippage === s
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted border-border hover:bg-muted/80'
                  }`}
                >
                  {s}
                </button>
              ))}
              <button className="flex-1 py-1 rounded text-xs font-bold border border-border bg-muted hover:bg-muted/80">
                Custom
              </button>
            </div>
            {slippage === '1%' && (
              <p className="text-xs text-yellow-400 flex items-center gap-1">
                ⚠️ Your transaction may be frontrun if slippage is too high.
              </p>
            )}
          </div>

          <div className="bg-muted/30 border border-border rounded px-3 py-2 flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Estimated Payout</span>
            <span className="text-sm font-mono font-bold text-accent">{payout.toLocaleString()} BXBT</span>
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
            onClick={handleBet}
            className={`flex-1 py-1.5 rounded text-sm font-bold hover:opacity-90 transition ${
              isYes
                ? 'bg-success text-success-foreground'
                : 'bg-destructive text-destructive-foreground'
            }`}
          >
            Confirm Bet
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
