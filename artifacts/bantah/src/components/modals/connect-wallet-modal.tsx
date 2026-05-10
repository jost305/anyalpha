import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const WALLETS = [
  { name: 'WalletConnect', icon: '🔗', desc: 'QR Code' },
  { name: 'MetaMask', icon: '🦊', desc: 'Browser extension' },
  { name: 'Coinbase Wallet', icon: '🔵', desc: 'Browser extension' },
  { name: 'Phantom', icon: '👻', desc: 'Browser extension' },
  { name: 'OKX Wallet', icon: '⭕', desc: 'Browser extension' },
];

interface ConnectWalletModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectWalletModal({ open, onOpenChange }: ConnectWalletModalProps) {
  const handleConnect = (wallet: string) => {
    onOpenChange(false);
    toast.success('Wallet connected', {
      description: `${wallet} connected successfully.`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Connect Wallet</DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5">
          {WALLETS.map((wallet) => (
            <button
              key={wallet.name}
              onClick={() => handleConnect(wallet.name)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded border border-border hover:bg-muted/50 hover:border-primary/40 transition text-left group"
            >
              <span className="text-2xl">{wallet.icon}</span>
              <div className="flex-1">
                <div className="text-sm font-bold text-foreground">{wallet.name}</div>
                <div className="text-xs text-muted-foreground">{wallet.desc}</div>
              </div>
              <span className="text-muted-foreground text-xs group-hover:text-primary transition">→</span>
            </button>
          ))}
        </div>

        <div className="text-center pt-1">
          <p className="text-xs text-muted-foreground">
            New to Web3?{' '}
            <button className="text-primary hover:underline">Learn more about wallets</button>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
