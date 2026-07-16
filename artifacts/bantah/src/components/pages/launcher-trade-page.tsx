import { useState } from 'react';
import { ArrowLeft, Globe, Send, Twitter } from 'lucide-react';

interface LauncherTradePageProps {
  onBack?: () => void;
}

export default function LauncherTradePage({ onBack }: LauncherTradePageProps) {
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');
  const [feedTab, setFeedTab] = useState<'thread' | 'trades'>('thread');
  const [amount, setAmount] = useState('');

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground font-mono">
      <div className="mx-auto max-w-[1200px] space-y-6 px-2 pb-12 pt-4 md:px-4 md:py-6">
        
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-bold text-primary hover:underline hover:text-primary/80"
        >
          <ArrowLeft className="h-4 w-4" /> [go back]
        </button>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_350px] xl:grid-cols-[1fr_400px]">
          
          {/* LEFT COLUMN: Chart & Community */}
          <div className="space-y-6 min-w-0">
            {/* Header info */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="h-16 w-16 shrink-0 bg-muted border border-border/50"></div>
                <div className="space-y-1 min-w-0">
                  <h1 className="text-xl font-bold truncate">KingToken (KING)</h1>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>Ticker: KING</span>
                    <div className="flex items-center gap-2">
                      <a href="#" className="hover:text-primary"><Twitter className="h-3.5 w-3.5" /></a>
                      <a href="#" className="hover:text-primary"><Send className="h-3.5 w-3.5" /></a>
                      <a href="#" className="hover:text-primary"><Globe className="h-3.5 w-3.5" /></a>
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-green-500">Market Cap: $1,245,000</div>
                <div className="text-xs text-muted-foreground">Created by <span className="bg-muted/30 px-1 hover:underline">2abc...1xyz</span></div>
              </div>
            </div>

            {/* Chart Area */}
            <div className="border border-border/50 bg-card h-[400px] flex items-center justify-center text-muted-foreground text-sm">
              [ TradingView Chart Placeholder ]
            </div>

            {/* Community Feed */}
            <div className="space-y-4 pt-4">
              <div className="flex items-center gap-6 border-b border-border pb-2">
                <button
                  onClick={() => setFeedTab('thread')}
                  className={`text-sm font-bold uppercase tracking-widest ${feedTab === 'thread' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  thread
                </button>
                <button
                  onClick={() => setFeedTab('trades')}
                  className={`text-sm font-bold uppercase tracking-widest ${feedTab === 'trades' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  trades
                </button>
              </div>

              <div className="space-y-3">
                {feedTab === 'thread' && (
                  <div className="space-y-4">
                    <div className="border border-border/50 p-3 flex gap-3 bg-muted/10">
                      <div className="h-8 w-8 shrink-0 bg-muted"></div>
                      <div className="space-y-1 flex-1">
                        <textarea placeholder="post a reply" className="w-full bg-background border border-border p-2 text-xs focus:outline-none focus:border-primary resize-none" rows={2}></textarea>
                        <button className="bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:bg-primary/90">post</button>
                      </div>
                    </div>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex gap-3 text-sm">
                        <div className="h-6 w-6 shrink-0 bg-muted"></div>
                        <div className="flex-1 space-y-1 border-b border-border/30 pb-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold bg-muted/30 px-1 text-xs">User_{i}x...</span>
                            <span className="text-[10px] text-muted-foreground">{i + 1}m ago</span>
                          </div>
                          <p className="text-xs">This is looking bullish! Next stop raydium.</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {feedTab === 'trades' && (
                  <div className="space-y-2">
                    {Array.from({ length: 10 }).map((_, i) => {
                      const isBuy = Math.random() > 0.5;
                      return (
                        <div key={i} className="flex items-center justify-between text-xs border-b border-border/30 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="bg-muted/30 px-1">{Math.floor(Math.random()*60)}s ago</span>
                            <span className={isBuy ? 'text-green-500 font-bold' : 'text-red-500 font-bold'}>
                              {isBuy ? 'buy' : 'sell'}
                            </span>
                          </div>
                          <div className="font-bold text-right">
                            {isBuy ? '+' : '-'}{(Math.random() * 5).toFixed(2)} SOL
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Trading & Curve */}
          <div className="space-y-6">
            
            {/* Trade Interface */}
            <div className="border border-border bg-card p-4 space-y-4">
              <div className="flex items-center rounded bg-muted/20 p-1">
                <button
                  onClick={() => setTradeMode('buy')}
                  className={`flex-1 py-1.5 text-sm font-bold uppercase text-center rounded-sm transition-colors ${tradeMode === 'buy' ? 'bg-green-500/20 text-green-500' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  buy
                </button>
                <button
                  onClick={() => setTradeMode('sell')}
                  className={`flex-1 py-1.5 text-sm font-bold uppercase text-center rounded-sm transition-colors ${tradeMode === 'sell' ? 'bg-red-500/20 text-red-500' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  sell
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Amount</span>
                  <button className="hover:text-foreground underline">0.00 SOL</button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.0"
                    className="flex-1 border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                  <div className="flex items-center border border-border bg-muted/20 px-3 text-sm font-bold">
                    {tradeMode === 'buy' ? 'SOL' : 'KING'}
                  </div>
                </div>
                {tradeMode === 'buy' && (
                  <div className="flex items-center gap-1 pt-1">
                    {['reset', '0.1', '0.5', '1'].map(amt => (
                      <button 
                        key={amt} 
                        onClick={() => setAmount(amt === 'reset' ? '' : amt)}
                        className="flex-1 bg-muted/30 py-1 text-xs hover:bg-muted/50 transition-colors"
                      >
                        {amt}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                className={`w-full py-3 text-sm font-bold uppercase transition-colors ${tradeMode === 'buy' ? 'bg-green-500 text-black hover:bg-green-400' : 'bg-red-500 text-white hover:bg-red-400'}`}
              >
                place trade
              </button>
            </div>

            {/* Bonding Curve */}
            <div className="border border-border/50 bg-card p-4 space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider">bonding curve progress: 75%</h3>
              <div className="h-4 w-full bg-muted overflow-hidden border border-border/50">
                <div className="h-full bg-green-500" style={{ width: '75%' }}></div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                When the market cap reaches $69,000 all the liquidity from the bonding curve will be deposited into Raydium and burned. progression increases as the price goes up.
              </p>
            </div>

            {/* Holders */}
            <div className="border border-border/50 bg-card p-4 space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider">holder distribution</h3>
              <div className="space-y-1">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between text-xs border-b border-border/20 py-1.5">
                    <span className="font-bold bg-muted/30 px-1">{i + 1}. User_{i}x...</span>
                    <span>{(Math.random() * 5 + 1).toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
