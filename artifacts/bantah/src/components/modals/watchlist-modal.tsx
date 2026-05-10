import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface WatchlistModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token?: string;
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

export function WatchlistModal({ open, onOpenChange, token = 'PEPEFUN' }: WatchlistModalProps) {
  const [name, setName] = useState('My Watchlist');
  const [selectedColor, setSelectedColor] = useState(COLORS[3]);

  const handleSave = () => {
    onOpenChange(false);
    toast.success('Added to Watchlist', {
      description: `${token} / SOL has been added to your watchlist.`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Add to Watchlist</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-muted border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className="w-6 h-6 rounded-full border-2 transition"
                  style={{
                    backgroundColor: color,
                    borderColor: selectedColor === color ? 'white' : 'transparent',
                  }}
                />
              ))}
            </div>
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
            onClick={handleSave}
            className="flex-1 py-1.5 rounded bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition"
          >
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
