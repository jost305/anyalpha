import { useState, useEffect } from 'react';
import { PlaceBetModal } from '@/components/modals/place-bet-modal';
import { PredictionSkeleton } from '@/components/common/skeletons';

interface PredictionProps {
  token: string;
}

export default function LivePrediction({ token }: PredictionProps) {
  const [yesPercent, setYesPercent] = useState(62);
  const [noPercent, setNoPercent] = useState(38);
  const [totalPool] = useState('12,845');
  const [userBet, setUserBet] = useState('500');
  const [selectedChoice, setSelectedChoice] = useState<'yes' | 'no' | null>(null);
  const [betModal, setBetModal] = useState<{ open: boolean; side: 'yes' | 'no'; percent: number }>({
    open: false, side: 'yes', percent: 62,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(t);
  }, [token]);

  useEffect(() => {
    const interval = setInterval(() => {
      const newYes = Math.max(30, Math.min(70, 62 + (Math.random() - 0.5) * 10));
      setYesPercent(Math.round(newYes));
      setNoPercent(Math.round(100 - newYes));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <PredictionSkeleton />;

  const poolNum = parseInt(totalPool.replace(/,/g, ''));
  const yesVol = Math.round(poolNum * (yesPercent / 100));
  const noVol = Math.round(poolNum * (noPercent / 100));
  const potentialPayout = selectedChoice === 'yes'
    ? Math.round(parseInt(userBet) * (poolNum / yesVol))
    : Math.round(parseInt(userBet) * (poolNum / noVol));

  const openBetModal = (side: 'yes' | 'no') => {
    setSelectedChoice(side);
    setBetModal({ open: true, side, percent: side === 'yes' ? yesPercent : noPercent });
  };

  return (
    <>
      <PlaceBetModal
        open={betModal.open}
        onOpenChange={(o) => setBetModal((prev) => ({ ...prev, open: o }))}
        token={token}
        side={betModal.side}
        percent={betModal.percent}
      />
      <div className="flex flex-col h-full overflow-hidden">
        <div className="border-b border-border bg-background px-2 py-2 shrink-0">
          <div className="text-xs text-muted-foreground font-mono mb-0.5">LIVE PREDICTION</div>
          <div className="text-base font-bold text-accent mb-1">Will {token} 2x in 24H?</div>
          <div className="text-xs text-muted-foreground font-mono">Ends in 23h 14m 32s</div>
        </div>

        <div className="border-b border-border bg-background px-2 py-1.5 text-sm shrink-0">
          <div className="flex justify-between gap-2">
            <div>
              <div className="text-muted-foreground text-xs">Pool</div>
              <div className="font-mono font-bold text-foreground">{totalPool} BXBT</div>
            </div>
            <div className="text-right">
              <div className="text-muted-foreground text-xs">24h Vol</div>
              <div className="font-mono font-bold text-foreground">$1.8M</div>
            </div>
          </div>
        </div>

        <div className="flex gap-1.5 bg-background border-b border-border px-2 py-1.5 shrink-0">
          <button
            onClick={() => openBetModal('yes')}
            className={`flex-1 py-2 rounded text-sm font-bold transition flex flex-col items-center gap-0.5 ${
              selectedChoice === 'yes'
                ? 'bg-secondary text-background'
                : 'bg-secondary/15 text-secondary border border-secondary/40 hover:bg-secondary/25'
            }`}
          >
            <span>YES</span>
            <span className="text-base">{yesPercent}%</span>
          </button>
          <button
            onClick={() => openBetModal('no')}
            className={`flex-1 py-2 rounded text-sm font-bold transition flex flex-col items-center gap-0.5 ${
              selectedChoice === 'no'
                ? 'bg-destructive text-background'
                : 'bg-destructive/15 text-destructive border border-destructive/40 hover:bg-destructive/25'
            }`}
          >
            <span>NO</span>
            <span className="text-base">{noPercent}%</span>
          </button>
        </div>

        <div className="bg-background border-b border-border px-2 py-1.5 shrink-0">
          <div className="text-xs text-muted-foreground mb-1">Pool Distribution</div>
          <div className="flex gap-2 mb-1">
            <div className="flex-1">
              <div className="text-secondary font-bold text-sm">{yesVol.toLocaleString()}</div>
              <div className="text-muted-foreground text-xs">YES</div>
            </div>
            <div className="flex-1 text-right">
              <div className="text-destructive font-bold text-sm">{noVol.toLocaleString()}</div>
              <div className="text-muted-foreground text-xs">NO</div>
            </div>
          </div>
          <div className="h-2 bg-muted rounded overflow-hidden flex">
            <div className="bg-secondary transition-all duration-500" style={{ width: `${yesPercent}%` }} />
            <div className="bg-destructive transition-all duration-500" style={{ width: `${noPercent}%` }} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-background px-2 py-1.5">
          {selectedChoice ? (
            <div className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground">Bet Amount (BXBT)</label>
                <input
                  type="number"
                  value={userBet}
                  onChange={(e) => setUserBet(e.target.value)}
                  className="w-full bg-muted border border-border rounded px-2 py-1 text-sm text-foreground font-mono"
                />
              </div>
              <div className="bg-muted border border-border rounded px-2 py-1.5">
                <div className="text-xs text-muted-foreground mb-0.5">Estimated Payout</div>
                <div className="text-sm font-mono font-bold text-accent">{potentialPayout} BXBT</div>
              </div>
              <button
                onClick={() => setBetModal({ open: true, side: selectedChoice, percent: selectedChoice === 'yes' ? yesPercent : noPercent })}
                className="w-full bg-accent text-background py-2 rounded font-bold text-sm hover:opacity-90 transition"
              >
                Confirm Bet
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-center">
              <div className="text-muted-foreground text-sm">Select YES or NO to place a bet</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
