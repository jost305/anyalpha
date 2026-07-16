import { useState, useMemo } from 'react';
import { ArrowLeft, Globe, Send, Twitter } from 'lucide-react';
import { useWriteContract, useReadContract, useAccount } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { parseEther, formatEther } from 'viem';
import { toast } from 'sonner';
import { ResponsiveContainer, LineChart, Line, YAxis, Tooltip } from 'recharts';
import { LaunchpadABI } from '@/lib/contracts/LaunchpadABI';
import { useLaunchpadPusher } from '@/lib/useLaunchpadPusher';
import { usePrivy } from '@privy-io/react-auth';
import { getIPFSUrl } from '@/lib/ipfs';

function TokenImage({ uri, name, className }: { uri: string; name: string; className?: string }) {
  const { data: imageUrl } = useQuery({
    queryKey: ['token-image-v3', uri],
    queryFn: async () => {
      if (!uri) return null;
      try {
        const cleanUri = uri.replace('ipfs://', '');
        const gateways = [
          `https://ipfs.io/ipfs/${cleanUri}`,
          `https://cloudflare-ipfs.com/ipfs/${cleanUri}`,
          `https://dweb.link/ipfs/${cleanUri}`,
        ];
        
        let meta = null;
        for (const gw of gateways) {
          try {
            const res = await fetch(gw, { cache: 'force-cache' });
            if (res.ok) {
              meta = await res.json();
              break;
            }
          } catch (e) {
            continue;
          }
        }
        
        if (meta && meta.image) {
          const imgUri = meta.image.replace('ipfs://', '');
          return `https://ipfs.io/ipfs/${imgUri}`;
        }
        return null;
      } catch (err) {
        return null;
      }
    },
    retry: 2,
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  if (imageUrl) {
    return <img src={imageUrl} alt={name} className={className} />;
  }
  
  return <div className={`flex items-center justify-center bg-muted text-muted-foreground ${className}`}><span className="text-xs">{name.slice(0, 1)}</span></div>;
}

interface LauncherTradePageProps {
  tokenAddress?: string | null;
  onBack?: () => void;
}

export default function LauncherTradePage({ tokenAddress, onBack }: LauncherTradePageProps) {
  const { authenticated, login } = usePrivy();
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');
  const [feedTab, setFeedTab] = useState<'thread' | 'trades'>('thread');
  const [amount, setAmount] = useState('');

  const { writeContractAsync } = useWriteContract();
  const launchpadAddress = "0x8058A276228f547D8d5e6B1B6A675646d2040555"; // DEPLOYED ADDRESS
  const targetAddress = tokenAddress || "0x0000000000000000000000000000000000000000";

  const { data: tokenStatesData, refetch: refetchState } = useReadContract({
    address: launchpadAddress,
    abi: LaunchpadABI,
    functionName: 'tokenStates',
    args: [targetAddress],
  });

  useLaunchpadPusher();

  const { data: tokenData } = useQuery({
    queryKey: ['launchpad-token-detail', targetAddress],
    queryFn: async () => {
      const res = await fetch(`/api/launchpad/tokens?sort=bump`);
      if (!res.ok) return null;
      const allTokens = await res.json();
      return allTokens.find((t: any) => t.tokenAddress.toLowerCase() === targetAddress.toLowerCase());
    },
    refetchInterval: 60000,
  });

  const { data: realTrades = [] } = useQuery({
    queryKey: ['launchpad-trades', targetAddress],
    queryFn: async () => {
      const res = await fetch(`/api/launchpad/tokens/${targetAddress}/trades`);
      if (!res.ok) throw new Error('Failed to fetch trades');
      return res.json();
    },
    refetchInterval: 10000,
  });

  const chartData = useMemo(() => {
    let currentMC = 5000;
    const data = [{ name: 'Start', mc: currentMC }];
    
    const sortedTrades = [...realTrades].reverse();
    
    sortedTrades.forEach((trade: any, i: number) => {
      const ethAmount = Number(formatEther(BigInt(trade.ethAmountRaw)));
      const impact = ethAmount * 1000; 
      if (trade.isBuy) {
        currentMC += impact;
      } else {
        currentMC -= impact;
      }
      data.push({ name: `Tx ${i+1}`, mc: currentMC });
    });
    return data;
  }, [realTrades]);

  // Parse tokenStates struct:
  // enum State { FUNDING, GRADUATED } => uint8 0 or 1
  // mapping(address => TokenState) public tokenStates;
  let tokenStateObj = {
    state: 0,
    ethReserve: 0n,
    tokenReserve: 0n,
    creator: "0x0",
    devAllocation: 0n
  };
  if (Array.isArray(tokenStatesData) && tokenStatesData.length >= 5) {
    tokenStateObj = {
      state: tokenStatesData[0],
      ethReserve: tokenStatesData[1],
      tokenReserve: tokenStatesData[2],
      creator: tokenStatesData[3],
      devAllocation: tokenStatesData[4]
    };
  }

  const realEthReserve = tokenStateObj.ethReserve;
  const graduationThreshold = parseEther('24');
  
  // Cap at 100%
  const rawProgress = Number(realEthReserve * 100n / graduationThreshold);
  const progressPercent = Math.min(rawProgress, 100);
  
  // Actual computed MC from reserve
  const marketCapValue = 5000 + Number(realEthReserve * 1000n / 10n ** 18n);

  const handleTrade = async () => {
    if (!authenticated) {
      toast.error('Please connect your wallet first.');
      login();
      return;
    }
    if (!amount || isNaN(Number(amount))) {
      toast.error('Enter a valid amount');
      return;
    }
    
    const loadingToast = toast.loading('Waiting for wallet confirmation...');
    
    try {
      if (tradeMode === 'buy') {
        const value = parseEther(amount);
        const minTokensOut = 0n; // Set a slippage tolerance in prod
        const tx = await writeContractAsync({
          address: launchpadAddress,
          abi: LaunchpadABI,
          functionName: 'buy',
          args: [targetAddress, minTokensOut],
          value,
        });
        toast.success(`Buy successful! Tx: ${tx}`, { id: loadingToast });
      } else {
        const tokenAmount = parseEther(amount); // Assuming 18 decimals
        const minEthOut = 0n;
        const tx = await writeContractAsync({
          address: launchpadAddress,
          abi: LaunchpadABI,
          functionName: 'sell',
          args: [targetAddress, tokenAmount, minEthOut],
        });
        toast.success(`Sell successful! Tx: ${tx}`, { id: loadingToast });
      }
      refetchState();
    } catch (err: any) {
      toast.error(err.shortMessage || err.message || 'Trade failed', { id: loadingToast });
    }
  };

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
                {tokenData?.metadataUri ? (
                  <TokenImage uri={tokenData.metadataUri} name={tokenData.name} className="h-16 w-16 shrink-0 border border-border/50 object-cover" />
                ) : (
                  <div className="h-16 w-16 shrink-0 bg-muted border border-border/50"></div>
                )}
                <div className="space-y-1 min-w-0">
                  <h1 className="text-xl font-bold truncate">{tokenData?.name || 'Unknown'} ({tokenData?.symbol || '?'})</h1>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>Ticker: {tokenData?.symbol || '?'}</span>
                    <div className="flex items-center gap-2">
                      <a href="#" className="hover:text-primary"><Twitter className="h-3.5 w-3.5" /></a>
                      <a href="#" className="hover:text-primary"><Send className="h-3.5 w-3.5" /></a>
                      <a href="#" className="hover:text-primary"><Globe className="h-3.5 w-3.5" /></a>
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-green-500">Market Cap: ${marketCapValue.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Created by <span className="bg-muted/30 px-1 hover:underline">{tokenData?.devAddress === '0x0000000000000000000000000000000000000000' ? '0x13D7...39a7' : (tokenData?.devAddress ? tokenData.devAddress.slice(0, 6) + '...' + tokenData.devAddress.slice(-4) : 'Unknown')}</span></div>
              </div>
            </div>

            {/* Chart Area */}
            <div className="border border-border/50 bg-card h-[400px] flex flex-col items-center justify-center text-sm w-full relative">
              {chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <YAxis 
                      domain={['dataMin', 'dataMax']} 
                      stroke="#888888" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(value) => `$${value.toLocaleString()}`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }}
                      formatter={(value: number) => [`$${value.toLocaleString()}`, 'Market Cap']}
                    />
                    <Line type="stepAfter" dataKey="mc" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-muted-foreground flex flex-col items-center gap-2">
                  <span>No trades yet. Chart will appear here.</span>
                </div>
              )}
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
                    {realTrades.length === 0 ? (
                      <div className="text-xs text-muted-foreground py-4 text-center">No trades yet.</div>
                    ) : (
                      realTrades.map((trade: any, i: number) => {
                        const isBuy = trade.isBuy;
                        const ethAmount = Number(formatEther(BigInt(trade.ethAmountRaw))).toFixed(4);
                        return (
                          <div key={trade.id} className="flex items-center justify-between text-xs border-b border-border/30 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="bg-muted/30 px-1 truncate max-w-[80px]" title={trade.userAddress}>
                                {trade.userAddress.slice(0,6)}...
                              </span>
                              <span className={isBuy ? 'text-green-500 font-bold' : 'text-red-500 font-bold'}>
                                {isBuy ? 'buy' : 'sell'}
                              </span>
                            </div>
                            <div className="font-bold text-right">
                              {isBuy ? '+' : '-'}{ethAmount} ETH
                            </div>
                          </div>
                        );
                      })
                    )}
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
                  <button className="hover:text-foreground underline">0.00 ETH</button>
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
                    {tradeMode === 'buy' ? 'ETH' : 'KING'}
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
                
                <div className="flex items-center justify-between px-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span>admin fee</span>
                  <span>1%</span>
                </div>
              </div>

              <button
                onClick={handleTrade}
                className={`w-full py-3 text-sm font-bold uppercase transition-colors ${tradeMode === 'buy' ? 'bg-green-500 text-black hover:bg-green-400' : 'bg-red-500 text-white hover:bg-red-400'}`}
              >
                place trade
              </button>
            </div>

            {/* Bonding Curve */}
            <div className="border border-border/50 bg-card p-4 space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider">bonding curve progress: {progressPercent}%</h3>
              <div className="h-4 w-full bg-muted overflow-hidden border border-border/50">
                <div className="h-full bg-green-500" style={{ width: `${progressPercent}%` }}></div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                When the market cap reaches $69,000 all the liquidity from the bonding curve will be deposited into Uniswap V2 and burned. progression increases as the price goes up.
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
