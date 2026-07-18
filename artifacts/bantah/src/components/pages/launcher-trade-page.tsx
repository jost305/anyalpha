import { useState, useMemo, useRef, useEffect } from 'react';
import { ArrowLeft, Globe, Send, Twitter, Copy, ExternalLink, TrendingUp, TrendingDown } from 'lucide-react';
import { useWriteContract, useReadContract, useAccount, useBalance, useSwitchChain } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { parseEther, formatEther, erc20Abi } from 'viem';
import { toast } from 'sonner';
import { createChart, ColorType, AreaSeries } from 'lightweight-charts';
import { LaunchpadABI } from '@/lib/contracts/LaunchpadABI';
import { useLaunchpadPusher } from '@/lib/useLaunchpadPusher';
import { robinhoodChainTestnet } from '@/lib/wagmi';
import { usePrivy } from '@privy-io/react-auth';
import { getIPFSUrl } from '@/lib/ipfs';
import { executeDopplerBuyIntent, executeDopplerSellIntent } from '@/lib/doppler';

function RobinhoodIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 115.87 149.53" className={className}>
      <path fill="currentColor" d="m.86,149.53h3.3c.6,0,1.2-.3,1.4-.8C30.46,85.33,57.56,53.93,74.56,35.13c.7-.8.4-1.4-.6-1.4h-30.4c-1.1,0-2.03.44-2.8,1.4l-21.8,27c-3.2,4-4,7.7-4,13v27.6C7.86,122.63,3.36,136.13.06,148.33c-.2.78.1,1.2.8,1.2ZM110.56,4.03c-4.7-5-25.9-5.2-35.7-1.4-2.04.79-4,2.13-4.9,2.9-9,7.7-15,13.8-20.7,19.8-.7.7-.4,1.4.6,1.4h33.7c3.1,0,4.9,1.8,4.9,4.9v38c0,1,.8,1.3,1.4.4l20.3-26.5c3.3-4.3,4.3-5.6,5.2-11.6,1.2-8.8.5-22.3-4.8-27.9Zm-43.5,100.8l13.9-22.9c.3-.6.4-1.3.4-1.8v-38.2c0-1-.7-1.4-1.4-.6-20.9,23.3-37.2,47.8-52.3,77.3-.38.74.1,1.4,1,1.1l31.2-9.6c3.52-1.08,5.5-2.5,7.2-5.3Z" />
    </svg>
  );
}

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
  const [replyText, setReplyText] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [timeframe, setTimeframe] = useState('1h');
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const { writeContractAsync } = useWriteContract();
  const { address: walletAddress, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const launchpadAddress = "0x8058A276228f547D8d5e6B1B6A675646d2040555"; // DEPLOYED ADDRESS
  const targetAddress = tokenAddress || "0x0000000000000000000000000000000000000000";

  // Real wallet balance
  const { data: walletBalance } = useBalance({
    address: walletAddress,
  });

  const { data: tokenBalanceData } = useReadContract({
    address: targetAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [walletAddress as `0x${string}`],
    query: {
      enabled: !!walletAddress && targetAddress !== "0x0000000000000000000000000000000000000000",
      refetchInterval: 3000,
    }
  });

  const { data: tokenStatesData, refetch: refetchState } = useReadContract({
    address: launchpadAddress,
    abi: LaunchpadABI,
    functionName: 'tokenStates',
    args: [targetAddress as `0x${string}`],
    query: {
      refetchInterval: 3000,
    }
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

  // Fetch token metadata for social links
  const { data: tokenMetadata } = useQuery({
    queryKey: ['token-metadata-social', tokenData?.metadataUri],
    queryFn: async () => {
      if (!tokenData?.metadataUri) return null;
      try {
        const cleanUri = tokenData.metadataUri.replace('ipfs://', '');
        const gateways = [
          `https://ipfs.io/ipfs/${cleanUri}`,
          `https://cloudflare-ipfs.com/ipfs/${cleanUri}`,
          `https://dweb.link/ipfs/${cleanUri}`,
        ];
        for (const gw of gateways) {
          try {
            const res = await fetch(gw, { cache: 'force-cache' });
            if (res.ok) return await res.json();
          } catch { continue; }
        }
        return null;
      } catch { return null; }
    },
    enabled: !!tokenData?.metadataUri,
    staleTime: 1000 * 60 * 60,
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

  const { data: realReplies = [], refetch: refetchReplies } = useQuery({
    queryKey: ['launchpad-replies', targetAddress],
    queryFn: async () => {
      const res = await fetch(`/api/launchpad/tokens/${targetAddress}/replies`);
      if (!res.ok) throw new Error('Failed to fetch replies');
      return res.json();
    },
    refetchInterval: 10000,
  });

  const { data: realHolders = [] } = useQuery({
    queryKey: ['launchpad-holders', targetAddress],
    queryFn: async () => {
      const res = await fetch(`/api/launchpad/tokens/${targetAddress}/holders`);
      if (!res.ok) throw new Error('Failed to fetch holders');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const chartData = useMemo(() => {
    let currentMC = 5000;
    const data: { time: number; value: number }[] = [];
    
    const sortedTrades = [...realTrades].reverse();
    
    // Start point
    const now = Math.floor(Date.now() / 1000);
    const baseTime = sortedTrades.length > 0 
      ? Math.floor(new Date(sortedTrades[0].createdAt || Date.now()).getTime() / 1000) - 60
      : now - 3600;
    
    data.push({ time: baseTime, value: currentMC });
    
    sortedTrades.forEach((trade: any, i: number) => {
      const ethAmount = Number(formatEther(BigInt(trade.ethAmountRaw)));
      const impact = ethAmount * 1000; 
      if (trade.isBuy) {
        currentMC += impact;
      } else {
        currentMC -= impact;
      }
      const tradeTime = trade.createdAt 
        ? Math.floor(new Date(trade.createdAt).getTime() / 1000) 
        : baseTime + (i + 1) * 60;
      data.push({ time: tradeTime, value: Math.max(currentMC, 0) });
    });
    return data;
  }, [realTrades]);

  // Mount lightweight-charts
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#888',
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(128,128,128,0.1)' },
        horzLines: { color: 'rgba(128,128,128,0.1)' },
      },
      width: container.clientWidth,
      height: container.clientHeight,
      crosshair: {
        vertLine: { color: 'rgba(204,255,0,0.3)', width: 1, style: 2, labelBackgroundColor: '#ccff00' },
        horzLine: { color: 'rgba(204,255,0,0.3)', width: 1, style: 2, labelBackgroundColor: '#ccff00' },
      },
      rightPriceScale: {
        borderColor: 'rgba(128,128,128,0.2)',
      },
      timeScale: {
        borderColor: 'rgba(128,128,128,0.2)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: '#ccff00',
      topColor: 'rgba(204,255,0,0.28)',
      bottomColor: 'rgba(204,255,0,0.02)',
      lineWidth: 2,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `$${price.toLocaleString()}`,
      },
    });

    if (chartData.length > 0) {
      areaSeries.setData(chartData as any);
      
      const now = Math.floor(Date.now() / 1000);
      let startTime = chartData[0].time;
      if (timeframe === '1m') startTime = now - 60;
      else if (timeframe === '5m') startTime = now - 5 * 60;
      else if (timeframe === '15m') startTime = now - 15 * 60;
      else if (timeframe === '1h') startTime = now - 60 * 60;
      else if (timeframe === '4h') startTime = now - 4 * 60 * 60;
      else if (timeframe === '1D') startTime = now - 24 * 60 * 60;
      
      // Ensure we don't start after the last data point
      const lastPoint = chartData[chartData.length - 1].time;
      if (startTime > lastPoint) startTime = Math.max(chartData[0].time, lastPoint - 60 * 60);

      chart.timeScale().setVisibleRange({
        from: startTime as import('lightweight-charts').Time,
        to: now as import('lightweight-charts').Time,
      });
    }

    const handleResize = () => {
      chart.applyOptions({ width: container.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [chartData, timeframe]);

  // Parse tokenStates struct
  let tokenStateObj = {
    tokenAddress: "0x0000000000000000000000000000000000000000" as `0x${string}`,
    virtualEthReserve: 0n,
    virtualTokenReserve: 0n,
    realEthReserve: 0n,
    graduated: false
  };
  if (Array.isArray(tokenStatesData) && tokenStatesData.length >= 5) {
    tokenStateObj = {
      tokenAddress: tokenStatesData[0] as `0x${string}`,
      virtualEthReserve: tokenStatesData[1] as bigint,
      virtualTokenReserve: tokenStatesData[2] as bigint,
      realEthReserve: tokenStatesData[3] as bigint,
      graduated: tokenStatesData[4] as boolean
    };
  }

  const realEthReserve = tokenStateObj.realEthReserve;
  const realEthReserveNum = Number(formatEther(realEthReserve));
  
  // Cap at 100%
  const rawProgress = (realEthReserveNum / 24) * 100;
  const progressPercent = rawProgress > 0 && rawProgress < 0.01 
    ? rawProgress.toFixed(4) 
    : Math.min(rawProgress, 100).toFixed(2);
  
  // Actual computed MC from reserve
  const marketCapValue = 5000 + realEthReserveNum * 1000;

  // Token price: MC / total supply (1B tokens)
  const totalSupply = 1_000_000_000;
  const tokenPrice = (marketCapValue / totalSupply).toFixed(8);

  // Price change: computed from trades
  const priceChange = useMemo(() => {
    if (realTrades.length === 0) return 0;
    const totalBuyEth = realTrades
      .filter((t: any) => t.isBuy)
      .reduce((sum: number, t: any) => sum + Number(formatEther(BigInt(t.ethAmountRaw))), 0);
    const totalSellEth = realTrades
      .filter((t: any) => !t.isBuy)
      .reduce((sum: number, t: any) => sum + Number(formatEther(BigInt(t.ethAmountRaw))), 0);
    const net = totalBuyEth - totalSellEth;
    if (totalBuyEth === 0 && totalSellEth === 0) return 0;
    return (net / Math.max(totalBuyEth, totalSellEth, 0.001)) * 100;
  }, [realTrades]);

  const formatUsd = (val: number) => {
    if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
    if (val > 0 && val < 1) return val.toFixed(4);
    if (val > 0 && val < 10) return val.toFixed(2);
    return val.toFixed(0);
  };

  // Liquidity: ETH reserve value * 2 (AMM convention)
  const ethReserveNum = Number(formatEther(realEthReserve));
  const liquidityUsd = ethReserveNum * 2 * 1000; // ETH ~$1000 estimate for display
  const liquidityValue = formatUsd(liquidityUsd);

  // Volume: sum of all trade ETH amounts
  const volumeUsd = useMemo(() => {
    const totalEth = realTrades.reduce((sum: number, t: any) => 
      sum + Number(formatEther(BigInt(t.ethAmountRaw))), 0);
    return totalEth * 1000; // ETH ~$1000 estimate
  }, [realTrades]);
  const volumeValue = formatUsd(volumeUsd);

  // Creation time
  const creationTime = tokenData?.createdAt 
    ? new Date(tokenData.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) 
      + ' ' + new Date(tokenData.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '—';

  const devDisplay = tokenData?.devAddress === '0x0000000000000000000000000000000000000000'
    ? '0x13D7...39a7'
    : (tokenData?.devAddress ? tokenData.devAddress.slice(0, 6) + '...' + tokenData.devAddress.slice(-4) : 'Unknown');

  const estimatedReceive = useMemo(() => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return null;
    try {
      const amountBigInt = parseEther(amount);
      const feeRate = 100n; // 1%
      const FEE_DENOMINATOR = 10000n;

      if (tradeMode === 'buy') {
        const fee = (amountBigInt * feeRate) / FEE_DENOMINATOR;
        const ethForTokens = amountBigInt - fee;
        
        const k = tokenStateObj.virtualEthReserve * tokenStateObj.virtualTokenReserve;
        const newVirtualEth = tokenStateObj.virtualEthReserve + ethForTokens;
        if (newVirtualEth === 0n) return "0";
        const newVirtualToken = k / newVirtualEth;
        const tokensOut = tokenStateObj.virtualTokenReserve - newVirtualToken;
        
        return parseFloat(formatEther(tokensOut)).toLocaleString(undefined, { maximumFractionDigits: 2 });
      } else {
        const k = tokenStateObj.virtualEthReserve * tokenStateObj.virtualTokenReserve;
        const newVirtualToken = tokenStateObj.virtualTokenReserve + amountBigInt;
        if (newVirtualToken === 0n) return "0";
        const newVirtualEth = k / newVirtualToken;
        const ethOut = tokenStateObj.virtualEthReserve - newVirtualEth;
        
        const fee = (ethOut * feeRate) / FEE_DENOMINATOR;
        const ethToUser = ethOut - fee;
        
        return parseFloat(formatEther(ethToUser)).toLocaleString(undefined, { maximumFractionDigits: 6 });
      }
    } catch {
      return null;
    }
  }, [amount, tradeMode, tokenStateObj.virtualEthReserve, tokenStateObj.virtualTokenReserve]);

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
      if (chainId !== robinhoodChainTestnet.id) {
        await switchChainAsync({ chainId: robinhoodChainTestnet.id });
      }

      if (tokenStateObj.graduated) {
        // Token has graduated; route the trade through Doppler SDK (intents)
        if (tradeMode === 'buy') {
          const valueInWei = parseEther(amount);
          const intentHash = await executeDopplerBuyIntent(targetAddress, valueInWei);
          toast.success(`Doppler Intent submitted! Hash: ${intentHash}`, { id: loadingToast });
        } else {
          const tokenAmountBigInt = parseEther(amount);
          const intentHash = await executeDopplerSellIntent(targetAddress, tokenAmountBigInt);
          toast.success(`Doppler Intent submitted! Hash: ${intentHash}`, { id: loadingToast });
        }
      } else {
        // Token is still on the bonding curve; route through Launchpad contract
        if (tradeMode === 'buy') {
          const value = parseEther(amount);
          const valueInWei = parseEther(amount);
          const tx = await writeContractAsync({
            address: launchpadAddress,
            abi: LaunchpadABI,
            functionName: 'buy',
            args: [targetAddress as `0x${string}`, 0n],
            value: valueInWei,
            chainId: robinhoodChainTestnet.id,
          });
          toast.success(`Buy successful! Tx: ${tx}`, { id: loadingToast });
        } else {
          const tokenAmountBigInt = parseEther(amount);
          const tx = await writeContractAsync({
            address: launchpadAddress,
            abi: LaunchpadABI,
            functionName: 'sell',
            args: [targetAddress as `0x${string}`, tokenAmountBigInt, 0n],
            chainId: robinhoodChainTestnet.id,
          });
          toast.success(`Sell successful! Tx: ${tx}`, { id: loadingToast });
        }
      }
      refetchState();
    } catch (err: any) {
      toast.error(err.shortMessage || err.message || 'Trade failed', { id: loadingToast });
    }
  };

  const handlePostReply = async () => {
    if (!authenticated) {
      toast.error('Please connect your wallet first.');
      login();
      return;
    }
    if (!replyText.trim()) return;

    setIsPosting(true);
    try {
      const res = await fetch(`/api/launchpad/tokens/${targetAddress}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress: walletAddress, text: replyText.trim() }),
      });
      if (!res.ok) throw new Error('Failed to post reply');
      setReplyText('');
      refetchReplies();
      toast.success('Reply posted!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to post reply');
    } finally {
      setIsPosting(false);
    }
  };

  const formattedBalance = walletBalance 
    ? parseFloat(formatEther(walletBalance.value)).toFixed(4) 
    : '0.0000';

  const formattedTokenBalance = tokenBalanceData
    ? parseFloat(formatEther(tokenBalanceData as bigint)).toLocaleString(undefined, { maximumFractionDigits: 4 })
    : '0.0000';

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground font-mono">
      <div className="mx-auto max-w-[1200px] space-y-4 px-2 pb-12 pt-4 md:px-4 md:py-6">
        
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-bold text-[#ccff00] hover:underline hover:text-[#ccff00]/80 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> [go back]
        </button>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px]">
          
          {/* LEFT COLUMN: Chart & Community */}
          <div className="space-y-4 min-w-0">
            {/* Token Header — Compact */}
            <div className="bg-card border border-border rounded-xl px-3 py-2.5 space-y-2">
              {/* Row 1: Image + Name + Price */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative shrink-0">
                    {tokenData?.metadataUri ? (
                      <TokenImage uri={tokenData.metadataUri} name={tokenData.name} className="h-9 w-9 rounded-md border border-border object-cover" />
                    ) : (
                      <div className="h-9 w-9 bg-muted rounded-md border border-border flex items-center justify-center text-sm font-bold text-muted-foreground">{(tokenData?.name || '?')[0]}</div>
                    )}
                    <div className="right-[-2px] bottom-[-2px] z-[1] box-content absolute border border-black rounded-full h-[13px] w-[13px] overflow-hidden bg-[#ccff00] flex items-center justify-center">
                      <RobinhoodIcon className="w-[8px] h-[8px] text-primary-foreground dark:text-black" />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h1 className="text-sm font-black truncate tracking-tight">{tokenData?.name || 'Unknown'}</h1>
                      <span className="text-muted-foreground font-bold text-[10px] bg-muted/50 px-1 py-px rounded border border-border">${tokenData?.symbol || '?'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                      <span className="uppercase font-bold">CA:</span>
                      <button 
                        onClick={() => { navigator.clipboard.writeText(targetAddress); toast.success('Copied'); }}
                        className="flex items-center gap-0.5 hover:text-foreground transition-colors font-mono"
                      >
                        {targetAddress.slice(0, 6)}...{targetAddress.slice(-4)}
                        <Copy className="h-2.5 w-2.5" />
                      </button>
                      {tokenMetadata?.twitter && <a href={tokenMetadata.twitter} target="_blank" rel="noopener noreferrer" className="hover:text-[#ccff00]"><Twitter className="h-3 w-3" /></a>}
                      {tokenMetadata?.telegram && <a href={tokenMetadata.telegram} target="_blank" rel="noopener noreferrer" className="hover:text-[#ccff00]"><Send className="h-3 w-3" /></a>}
                      {tokenMetadata?.website && <a href={tokenMetadata.website} target="_blank" rel="noopener noreferrer" className="hover:text-[#ccff00]"><Globe className="h-3 w-3" /></a>}
                    </div>
                  </div>
                </div>
                {/* Price + Change */}
                <div className="text-right shrink-0">
                  <div className="text-base font-black text-foreground tabular-nums">${tokenPrice}</div>
                  <div className={`flex items-center justify-end gap-0.5 text-[11px] font-bold ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    <span className="text-[10px]">{priceChange >= 0 ? '⬆' : '⬇'}</span>
                    {priceChange > 0 ? '+' : ''}{priceChange.toFixed(2)}%
                  </div>
                </div>
              </div>

              {/* Row 2: Stats Bar */}
              <div className="flex items-center gap-0 text-[10px] border-t border-border/50 pt-2 overflow-x-auto">
                <div className="flex items-center gap-1.5 pr-3 border-r border-border">
                  <span className="text-muted-foreground uppercase font-bold">Market Cap</span>
                  <span className="font-black text-foreground">${marketCapValue.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 border-r border-border">
                  <span className="text-muted-foreground uppercase font-bold">Liquidity</span>
                  <span className="font-black text-foreground">${liquidityValue}</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 border-r border-border">
                  <span className="text-muted-foreground uppercase font-bold">Volume</span>
                  <span className="font-black text-foreground">${volumeValue}</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 border-r border-border">
                  <span className="text-muted-foreground uppercase font-bold">Created</span>
                  <span className="font-bold text-foreground">{creationTime}</span>
                </div>
                <div className="flex items-center gap-1.5 pl-3">
                  <span className="text-muted-foreground uppercase font-bold">By</span>
                  <button onClick={() => { const a = tokenData?.devAddress; if (a) { navigator.clipboard.writeText(a); toast.success('Copied'); } }} className="font-mono hover:text-foreground transition-colors">{devDisplay}</button>
                </div>
              </div>
            </div>

            {/* TradingView Chart */}
            <div className="border border-border bg-card rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border/50">
                <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  <TrendingUp className="h-3.5 w-3.5 text-[#ccff00]" />
                  Price Chart
                </div>
                <div className="flex items-center gap-1">
                  {['1m', '5m', '15m', '1h', '4h', '1D'].map(tf => (
                    <button 
                      key={tf} 
                      onClick={() => setTimeframe(tf)}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${timeframe === tf ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
              <div ref={chartContainerRef} className="w-full h-[280px]" />
            </div>

            {/* Community Feed */}
            <div className="space-y-4 bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-6 border-b border-border pb-3">
                <button
                  onClick={() => setFeedTab('thread')}
                  className={`text-sm font-bold uppercase tracking-widest transition-colors ${feedTab === 'thread' ? 'text-[#ccff00]' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  thread
                </button>
                <button
                  onClick={() => setFeedTab('trades')}
                  className={`text-sm font-bold uppercase tracking-widest transition-colors ${feedTab === 'trades' ? 'text-[#ccff00]' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  trades
                </button>
              </div>

              <div className="space-y-3">
                {feedTab === 'thread' && (
                  <div className="space-y-4">
                    {/* Post form */}
                    <div className="p-3 flex gap-3 bg-muted/20 rounded-lg">
                      <div className="h-8 w-8 shrink-0 bg-[#ccff00]/10 rounded-md flex items-center justify-center">
                        <RobinhoodIcon className="w-4 h-4 text-[#ccff00]" />
                      </div>
                      <div className="space-y-2 flex-1">
                        <textarea 
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="post a reply..." 
                          className="w-full bg-muted/30 rounded-lg p-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#ccff00]/30 resize-none placeholder:text-muted-foreground" 
                          rows={2}
                        ></textarea>
                        <button 
                          onClick={handlePostReply}
                          disabled={isPosting || !replyText.trim()}
                          className="bg-[#ccff00] px-4 py-1.5 rounded-md text-xs font-black text-primary-foreground dark:text-black hover:bg-[#bbee00] transition-colors shadow-[0_0_10px_rgba(204,255,0,0.2)] disabled:opacity-50"
                        >
                          {isPosting ? 'posting...' : 'post'}
                        </button>
                      </div>
                    </div>
                    {/* Feed */}
                    {realReplies.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                          <Send className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-bold text-muted-foreground">No comments yet.</p>
                        <p className="text-xs text-muted-foreground mt-1">Be the first to start the conversation!</p>
                      </div>
                    ) : (
                      <div className="space-y-3 mt-4">
                        {realReplies.map((reply: any) => (
                          <div key={reply.id} className="flex gap-3 text-sm border-b border-border/30 pb-3">
                            <div className="h-8 w-8 shrink-0 bg-muted/50 rounded-md flex items-center justify-center">
                              <span className="text-xs font-bold text-muted-foreground">{reply.userAddress.slice(2, 4)}</span>
                            </div>
                            <div className="flex-1 space-y-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="bg-muted/50 px-1.5 py-0.5 rounded text-[10px] font-mono truncate max-w-[100px]" title={reply.userAddress}>
                                    {reply.userAddress.slice(0, 6)}...{reply.userAddress.slice(-4)}
                                  </span>
                                  {tokenData?.devAddress?.toLowerCase() === reply.userAddress.toLowerCase() && (
                                    <span className="bg-[#ccff00]/20 text-[#ccff00] px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase">dev</span>
                                  )}
                                </div>
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {new Date(reply.createdAt).toLocaleDateString()} {new Date(reply.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </span>
                              </div>
                              <p className="text-xs text-foreground/90 break-words whitespace-pre-wrap">{reply.text}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
                {feedTab === 'trades' && (
                  <div className="space-y-0">
                    {/* Table header */}
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground pb-2 border-b border-border">
                      <span className="w-24">Account</span>
                      <span className="w-12 text-center">Type</span>
                      <span className="flex-1 text-right">Amount</span>
                    </div>
                    {realTrades.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                          <TrendingUp className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-bold text-muted-foreground">No trades yet.</p>
                        <p className="text-xs text-muted-foreground mt-1">Be the first to trade this token!</p>
                      </div>
                    ) : (
                      realTrades.map((trade: any) => {
                        const isBuy = trade.isBuy;
                        const ethAmount = Number(formatEther(BigInt(trade.ethAmountRaw))).toFixed(4);
                        return (
                          <div key={trade.id} className="flex items-center justify-between text-xs py-2.5 border-b border-border/50 hover:bg-muted/20 transition-colors">
                            <div className="flex items-center gap-2 w-24">
                              <span className="bg-muted/50 px-1.5 py-0.5 rounded truncate max-w-[80px] text-[11px]" title={trade.userAddress}>
                                {trade.userAddress.slice(0,6)}...
                              </span>
                            </div>
                            <div className="w-12 text-center">
                              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${isBuy ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>
                                {isBuy ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                                {isBuy ? 'BUY' : 'SELL'}
                              </span>
                            </div>
                            <div className={`flex-1 text-right font-bold tabular-nums ${isBuy ? 'text-green-400' : 'text-red-400'}`}>
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
          <div className="space-y-4">
            
            {/* Trade Interface */}
            <div className="border border-border bg-card rounded-xl p-4 space-y-4">
              <div className="flex items-center rounded-lg bg-muted/50 p-1">
                <button
                  onClick={() => setTradeMode('buy')}
                  className={`flex-1 py-2 text-sm font-black uppercase text-center rounded-md transition-all duration-200 ${tradeMode === 'buy' ? 'bg-green-500/20 text-green-400 shadow-[0_0_10px_rgba(34,197,94,0.15)]' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  buy
                </button>
                <button
                  onClick={() => setTradeMode('sell')}
                  className={`flex-1 py-2 text-sm font-black uppercase text-center rounded-md transition-all duration-200 ${tradeMode === 'sell' ? 'bg-red-500/20 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.15)]' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  sell
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-bold uppercase">Amount</span>
                  <button 
                    onClick={() => {
                      if (tradeMode === 'buy' && walletBalance) {
                        setAmount(formatEther(walletBalance.value));
                      } else if (tradeMode === 'sell' && tokenBalanceData) {
                        setAmount(formatEther(tokenBalanceData as bigint));
                      }
                    }}
                    className="hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    <span className="text-[10px]">Balance:</span>
                    <span className="font-bold text-foreground/70">
                      {tradeMode === 'buy' ? `${formattedBalance} ETH` : `${formattedTokenBalance} ${tokenData?.symbol || 'TOKENS'}`}
                    </span>
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.0"
                    className="flex-1 bg-muted/40 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#ccff00]/30 transition-colors"
                  />
                  <div className="flex items-center bg-muted/50 px-3 rounded-lg text-sm font-bold">
                    {tradeMode === 'buy' ? 'ETH' : (tokenData?.symbol || '???')}
                  </div>
                </div>
                {tradeMode === 'buy' && (
                  <div className="flex items-center gap-1.5 pt-1">
                    {['reset', '0.1', '0.5', '1'].map(amt => (
                      <button 
                        key={amt} 
                        onClick={() => setAmount(amt === 'reset' ? '' : amt)}
                        className="flex-1 bg-muted/50 py-1.5 rounded-md text-xs font-bold hover:bg-muted transition-all"
                      >
                        {amt === 'reset' ? '✕' : `${amt} ETH`}
                      </button>
                    ))}
                  </div>
                )}
                
                {estimatedReceive && (
                  <div className="flex items-center justify-between px-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-[#ccff00]">
                    <span>you receive (est.)</span>
                    <span className="text-right">
                      {estimatedReceive} {tradeMode === 'buy' ? (tokenData?.symbol || 'TOKENS') : 'ETH'}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between px-1 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span>platform fee</span>
                  <span className="text-foreground/50">1%</span>
                </div>
              </div>

              <button
                onClick={handleTrade}
                className={`w-full py-3 rounded-lg text-sm font-black uppercase transition-all duration-200 ${
                  tradeMode === 'buy' 
                    ? 'bg-[#ccff00] text-primary-foreground dark:text-black hover:bg-[#bbee00] shadow-[0_0_15px_rgba(204,255,0,0.3)]' 
                    : 'bg-red-500 text-foreground hover:bg-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                }`}
              >
                place trade
              </button>
            </div>

            {/* Bonding Curve */}
            <div className="border border-border bg-card rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider">bonding curve progress</h3>
                <span className="text-xs font-black text-[#ccff00]">{progressPercent}%</span>
              </div>
              <div className="h-3 w-full bg-muted/50 dark:bg-black/50 overflow-hidden rounded-full">
                <div 
                  className="h-full bg-[#ccff00] transition-all duration-500 rounded-full shadow-[0_0_10px_rgba(204,255,0,0.3)]" 
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                When the market cap reaches <span className="text-foreground font-bold">$69,000</span> all the liquidity from the bonding curve will be deposited into Uniswap V2 and burned. Progression increases as the price goes up.
              </p>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1">
                <div className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
                  <span>ETH in curve:</span>
                  <span className="font-bold text-foreground/70">{Number(formatEther(realEthReserve)).toFixed(4)} ETH</span>
                </div>
                <div className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
                  <span>Goal:</span>
                  <span className="font-bold text-foreground/70">24 ETH</span>
                </div>
              </div>
            </div>

            {/* Holder Distribution */}
            <div className="border border-border bg-card rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider">holder distribution</h3>
              {realHolders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                    <RobinhoodIcon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <p className="text-xs font-bold text-muted-foreground">No holders yet.</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Be the first to buy this token!</p>
                </div>
              ) : (
                <div className="space-y-2 mt-2">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground pb-1.5 border-b border-border">
                    <span>Holder</span>
                    <span>%</span>
                  </div>
                  <div className="space-y-1.5 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
                    {realHolders.map((holder: any, idx: number) => {
                      // Total supply is 1,000,000,000 tokens
                      const balance = Number(formatEther(BigInt(Math.floor(holder.balance))));
                      const percent = ((balance / totalSupply) * 100).toFixed(2);
                      const isDev = holder.userAddress.toLowerCase() === tokenData?.devAddress?.toLowerCase();
                      
                      return (
                        <div key={holder.userAddress} className="flex items-center justify-between text-xs py-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-bold text-muted-foreground w-4">{idx + 1}.</span>
                            <span className="bg-muted/50 px-1.5 py-0.5 rounded text-[11px] font-mono truncate max-w-[100px]" title={holder.userAddress}>
                              {holder.userAddress.slice(0, 6)}...{holder.userAddress.slice(-4)}
                            </span>
                            {isDev && (
                              <span className="bg-[#ccff00]/20 text-[#ccff00] px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">dev</span>
                            )}
                          </div>
                          <div className="font-bold tabular-nums">
                            {percent}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Contract Info */}
            <div className="border border-border bg-card rounded-xl p-4 space-y-2">
              <h3 className="text-xs font-black uppercase tracking-wider">contract info</h3>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Token Address</span>
                  <button 
                    onClick={() => { navigator.clipboard.writeText(targetAddress); toast.success('Copied!'); }}
                    className="flex items-center gap-1 hover:text-[#ccff00] transition-colors font-mono"
                  >
                    {targetAddress.slice(0, 8)}...{targetAddress.slice(-6)}
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Launchpad</span>
                  <button 
                    onClick={() => { navigator.clipboard.writeText(launchpadAddress); toast.success('Copied!'); }}
                    className="flex items-center gap-1 hover:text-[#ccff00] transition-colors font-mono"
                  >
                    {launchpadAddress.slice(0, 8)}...{launchpadAddress.slice(-6)}
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Network</span>
                  <span className="flex items-center gap-1.5 font-bold">
                    <div className="h-3.5 w-3.5 rounded-full bg-[#ccff00] flex items-center justify-center">
                      <RobinhoodIcon className="w-[8px] h-[8px] text-primary-foreground dark:text-black" />
                    </div>
                    Robinhood Chain
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
