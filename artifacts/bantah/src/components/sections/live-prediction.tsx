import { useState, useEffect } from 'react';

interface PredictionProps {
  token: string;
}

export default function LivePrediction({ token }: PredictionProps) {
  const [yesPercent, setYesPercent] = useState(62);
  const [noPercent, setNoPercent] = useState(38);
  const [totalPool] = useState('12,845');
  const [userBet, setUserBet] = useState('500');
  const [selectedChoice, setSelectedChoice] = useState<'yes' | 'no' | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const newYes = Math.max(30, Math.min(70, 62 + (Math.random() - 0.5) * 10));
      setYesPercent(Math.round(newYes));
      setNoPercent(Math.round(100 - newYes));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const poolNum = parseInt(totalPool.replace(/,/g, ''));
  const yesVol = Math.round(poolNum * (yesPercent / 100));
  const noVol = Math.round(poolNum * (noPercent / 100));
  const potentialPayout = selectedChoice === 'yes'
    ? Math.round(parseInt(userBet) * (poolNum / yesVol))
    : Math.round(parseInt(userBet) * (poolNum / noVol));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-border bg-background px-2 py-2">
        <div className="text-sm text-muted-foreground font-mono mb-0.5">LIVE PREDICTION</div>
        <div className="text-base font-bold text-accent mb-1.5">
          Will {token} 2x in 24H?
        </div>
        <div className="text-sm text-muted-foreground font-mono">
          Ends in 23h 14m 32s
        </div>
      </div>

      <div className="border-b border-border bg-background px-2 py-1.5 text-sm">
        <div className="flex justify-between gap-2 mb-1">
          <div>
            <div className="text-muted-foreground text-sm">Pool</div>
            <div className="font-mono font-bold text-foreground text-base">{totalPool} BXBT</div>
          </div>
          <div className="text-right">
            <div className="text-muted-foreground text-sm">24h Vol</div>
            <div className="font-mono font-bold text-foreground text-base">$1.8M</div>
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 bg-background border-b border-border px-2 py-1.5">
        <button
          onClick={() => setSelectedChoice('yes')}
          className={`flex-1 py-2 rounded text-sm font-bold transition flex flex-col items-center justify-center gap-0.5 ${
            selectedChoice === 'yes'
              ? 'bg-secondary text-background'
              : 'bg-secondary/15 text-secondary border border-secondary/40 hover:bg-secondary/25'
          }`}
        >
          <span>YES</span>
          <span className="text-base">{yesPercent}%</span>
        </button>
        <button
          onClick={() => setSelectedChoice('no')}
          className={`flex-1 py-2 rounded text-sm font-bold transition flex flex-col items-center justify-center gap-0.5 ${
            selectedChoice === 'no'
              ? 'bg-destructive text-background'
              : 'bg-destructive/15 text-destructive border border-destructive/40 hover:bg-destructive/25'
          }`}
        >
          <span>NO</span>
          <span className="text-base">{noPercent}%</span>
        </button>
      </div>

      <div className="bg-background border-b border-border px-2 py-1.5">
        <div className="text-sm text-muted-foreground mb-1">Pool Distribution</div>
        <div className="flex gap-2 mb-1">
          <div className="text-sm flex-1">
            <div className="text-secondary font-bold text-base">{yesVol.toLocaleString()}</div>
            <div className="text-muted-foreground text-sm">YES</div>
          </div>
          <div className="text-sm flex-1 text-right">
            <div className="text-destructive font-bold text-base">{noVol.toLocaleString()}</div>
            <div className="text-muted-foreground text-sm">NO</div>
          </div>
        </div>
        <div className="h-2 bg-muted rounded overflow-hidden flex">
          <div className="bg-secondary" style={{ width: `${yesPercent}%` }} />
          <div className="bg-destructive" style={{ width: `${noPercent}%` }} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-background px-2 py-1.5">
        {selectedChoice ? (
          <div className="space-y-2">
            <div>
              <label className="text-sm text-muted-foreground">Bet Amount</label>
              <input
                type="number"
                value={userBet}
                onChange={(e) => setUserBet(e.target.value)}
                className="w-full bg-muted border border-border rounded px-2 py-1 text-sm text-foreground font-mono"
              />
            </div>
            <div className="bg-muted border border-border rounded px-2 py-1.5">
              <div className="text-sm text-muted-foreground mb-0.5">Payout</div>
              <div className="text-base font-mono font-bold text-accent">{potentialPayout} BXBT</div>
            </div>
            <button className="w-full bg-accent text-background py-2 rounded font-bold text-sm hover:opacity-90 transition">
              Place Bet
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-center">
            <div className="text-muted-foreground text-sm">Select YES or NO to place a bet</div>
          </div>
        )}
      </div>
    </div>
  );
}
