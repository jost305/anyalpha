import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Rocket, Search, ArrowLeft, ImagePlus, Twitter, Send, Globe, ChevronDown, ChevronUp, Loader2, CheckCircle2, Wallet, ChevronLeft, ChevronRight, Feather, Filter, Star } from 'lucide-react';
import { toast } from 'sonner';
import { useWriteContract, useAccount } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { formatEther } from 'viem';
import { LaunchpadABI } from '@/lib/contracts/LaunchpadABI';
import { uploadFileToIPFS, uploadJSONToIPFS, getIPFSUrl } from '@/lib/ipfs';
import { useLaunchpadPusher } from '@/lib/useLaunchpadPusher';
import { robinhoodChainTestnet } from '@/lib/wagmi';
import { usePrivy } from '@privy-io/react-auth';

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

export default function LauncherPage({ onSelectToken }: { onSelectToken?: (id: string) => void }) {
  const { login } = usePrivy();
  const [isCreating, setIsCreating] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [filterTab, setFilterTab] = useState<'bump' | 'reply' | 'creation'>('bump');
  const [category, setCategory] = useState('last_trade');
  const [searchQuery, setSearchQuery] = useState('');
  const [watchlist, setWatchlist] = useState<string[]>([]);

  const [deployStatus, setDeployStatus] = useState<'idle' | 'uploading' | 'confirming' | 'success' | 'error'>('idle');
  const [deployTx, setDeployTx] = useState<string | null>(null);

  useLaunchpadPusher();

  useEffect(() => {
    const handleOpenCreateToken = () => setIsCreating(true);
    window.addEventListener('open-create-token', handleOpenCreateToken);

    // Auto-scroll logic for mobile banner slider
    const interval = setInterval(() => {
      if (!sliderRef.current) return;
      // only auto-scroll if it's actually scrollable (i.e. mobile)
      if (window.innerWidth >= 768) return;

      const { scrollLeft, scrollWidth, clientWidth } = sliderRef.current;
      if (scrollLeft + clientWidth >= scrollWidth - 10) {
        sliderRef.current.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        sliderRef.current.scrollBy({ left: clientWidth * 0.85, behavior: 'smooth' });
      }
    }, 3500);

    return () => {
      window.removeEventListener('open-create-token', handleOpenCreateToken);
      clearInterval(interval);
    };
  }, []);

  const { data: realTokens = [] } = useQuery({
    queryKey: ['launchpad-tokens', filterTab],
    queryFn: async () => {
      const res = await fetch(`/api/launchpad/tokens?sort=${filterTab}`);
      if (!res.ok) throw new Error('Failed to fetch tokens');
      return res.json();
    },
    refetchInterval: 60000,
  });

  const tokens = realTokens.map((t: any) => {
    // Start at $5K base market cap (virtual reserves)
    const extraEth = t.marketCapRaw ? Number(formatEther(BigInt(Math.floor(t.marketCapRaw)))) : 0;
    const totalMc = 5000 + (extraEth * 1000);

    // Generate deterministic dynamic PNL based on address hash (from -50.0% to +149.9%)
    const hashValue = parseInt(t.tokenAddress.slice(2, 10), 16) || 0;
    const pnl = parseFloat((((hashValue % 2000) / 10) - 50).toFixed(1));

    return {
      id: t.tokenAddress,
      name: t.name,
      ticker: t.symbol,
      dev: t.devAddress === '0x0000000000000000000000000000000000000000'
        ? '0x13D7...39a7'
        : t.devAddress.slice(0, 6) + '...' + t.devAddress.slice(-4),
      mc: totalMc,
      ath: totalMc,
      replies: t.replyCount,
      isPumping: false,
      pnl: pnl,
      uri: t.metadataUri,
    };
  });

  // Create form state
  const [showOptions, setShowOptions] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [ticker, setTicker] = useState('');
  const [description, setDescription] = useState('');
  const [twitterUrl, setTwitterUrl] = useState('');
  const [telegramUrl, setTelegramUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();
  const { authenticated } = usePrivy();
  const launchpadAddress = "0x8058A276228f547D8d5e6B1B6A675646d2040555"; // DEPLOYED ADDRESS

  const handleCreateCoin = async () => {
    if (!authenticated) {
      toast.error('Please connect your wallet first.');
      login();
      return;
    }
    if (!tokenName || !ticker || !selectedImage) {
      toast.error('Please fill in all required fields (name, ticker, and image)');
      return;
    }

    setDeployStatus('uploading');
    setDeployTx(null);

    try {
      // 1. Upload image to IPFS
      const imageUri = await uploadFileToIPFS(selectedImage);

      // 2. Upload metadata to IPFS
      const metadata = {
        name: tokenName,
        symbol: ticker,
        description,
        image: imageUri,
        twitter: twitterUrl,
        telegram: telegramUrl,
        website: websiteUrl
      };
      const metadataUri = await uploadJSONToIPFS(metadata);

      setDeployStatus('confirming');

      const tx = await writeContractAsync({
        address: launchpadAddress,
        abi: LaunchpadABI,
        functionName: 'createToken',
        args: [tokenName, ticker, metadataUri],
        chainId: robinhoodChainTestnet.id,
      });

      setDeployTx(tx);
      setDeployStatus('success');

      // Reset form
      setSelectedImage(null);
      setPreviewUrl(null);
      setTokenName('');
      setTicker('');
      setDescription('');
    } catch (err: any) {
      toast.error(err.shortMessage || err.message || 'Failed to create coin');
      setDeployStatus('error');
      setTimeout(() => setDeployStatus('idle'), 2000);
    }
  };

  if (isCreating) {
    return (
      <div className="h-full overflow-y-auto bg-background text-foreground relative">
        <AnimatePresence>
          {deployStatus !== 'idle' && deployStatus !== 'error' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl text-center"
              >
                {deployStatus === 'uploading' && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">Uploading Assets</h3>
                      <p className="text-sm text-muted-foreground mt-1">Pinning image and metadata to IPFS...</p>
                    </div>
                  </div>
                )}

                {deployStatus === 'confirming' && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Wallet className="h-8 w-8 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">Wallet Confirmation</h3>
                      <p className="text-sm text-muted-foreground mt-1">Please approve the transaction in your wallet.</p>
                    </div>
                  </div>
                )}

                {deployStatus === 'success' && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
                      <CheckCircle2 className="h-8 w-8" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">Launch Successful!</h3>
                      <p className="text-sm text-muted-foreground mt-1">Your meme coin is now live.</p>
                    </div>
                    <div className="w-full space-y-2 mt-2">
                      <div className="rounded-lg bg-muted/50 p-2 text-xs break-all font-mono text-muted-foreground border border-border/50">
                        Tx: {deployTx}
                      </div>
                      <button
                        onClick={() => { setDeployStatus('idle'); setIsCreating(false); }}
                        className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        View Coin Dashboard
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mx-auto max-w-xl space-y-6 px-4 pb-12 pt-6 md:py-10">
          <button
            onClick={() => setIsCreating(false)}
            className="flex items-center gap-2 text-sm font-bold text-primary transition-colors hover:text-primary/80"
          >
            <ArrowLeft className="h-4 w-4" /> [go back]
          </button>

          <div className="space-y-4">
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Rocket className="h-5 w-5" /> start a new coin
            </h1>

            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="space-y-1 flex-1">
                  <label className="text-xs font-bold text-muted-foreground uppercase">name</label>
                  <input
                    type="text"
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                    className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="space-y-1 flex-[0.5]">
                  <label className="text-xs font-bold text-muted-foreground uppercase">ticker</label>
                  <input
                    type="text"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value)}
                    className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none uppercase"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase">description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase">network</label>
                <div className="relative flex items-center">
                  <div className="absolute left-3 z-[1] box-content border border-black rounded-full h-[16px] w-[16px] overflow-hidden bg-[#ccff00] flex items-center justify-center pointer-events-none">
                    <RobinhoodIcon className="w-[10px] h-[10px] text-black" />
                  </div>
                  <select
                    defaultValue="robinhood"
                    className="w-full rounded-none border border-border bg-background pl-9 pr-8 py-2 text-sm focus:border-primary focus:outline-none appearance-none cursor-pointer relative z-0"
                  >
                    <option value="robinhood">Robinhood Chain</option>
                    <option value="base">Base</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-[1]" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase">image</label>
                <div
                  className="relative flex cursor-pointer items-center justify-center border border-dashed border-border bg-muted/20 px-6 py-4 text-center hover:border-primary/50"
                  onClick={() => document.getElementById('coin-image-upload')?.click()}
                >
                  <input
                    id="coin-image-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setSelectedImage(file);
                        setPreviewUrl(URL.createObjectURL(file));
                      }
                    }}
                  />
                  {previewUrl ? (
                    <img src={previewUrl} alt="Preview" className="h-16 w-16 object-cover border border-border" />
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <ImagePlus className="h-6 w-6 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">click to upload</span>
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => setShowOptions(!showOptions)}
                className="flex items-center gap-1 text-xs font-bold text-primary"
              >
                {showOptions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {showOptions ? 'hide more options' : 'show more options'}
              </button>

              {showOptions && (
                <div className="space-y-4 border-l-2 border-primary/20 pl-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1"><Twitter className="h-3 w-3" /> twitter link</label>
                    <input value={twitterUrl} onChange={e => setTwitterUrl(e.target.value)} type="text" className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1"><Send className="h-3 w-3" /> telegram link</label>
                    <input value={telegramUrl} onChange={e => setTelegramUrl(e.target.value)} type="text" className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1"><Globe className="h-3 w-3" /> website</label>
                    <input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} type="text" className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                </div>
              )}

              <div className="sticky bottom-4 left-0 right-0 z-10 pt-4 mt-4 bg-background/80 backdrop-blur-sm md:static md:bg-transparent md:backdrop-blur-none md:pt-0 md:mt-4">
                <button
                  onClick={handleCreateCoin}
                  className="w-full bg-[#ccff00] py-3 text-sm font-black text-black hover:bg-[#bbee00] shadow-[0_0_15px_rgba(204,255,0,0.4)]"
                >
                  create coin
                </button>
              </div>
              <div className="text-center text-xs text-muted-foreground">
                cost to deploy: ~0.0001 ETH
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Feed View (Pump.fun dense layout)
  return (
    <div className="h-full overflow-y-auto bg-background text-foreground font-mono">
      <div className="mx-auto max-w-[1200px] space-y-4 px-2 pb-12 pt-4 md:px-4 md:py-6">

        {/* Four.meme Style Banner */}
        <div className="flex flex-col md:flex-row gap-3 mb-6 w-full bg-card border border-border/50 rounded-xl p-3 shadow-sm">
          {/* Left Side: Create & Search */}
          <div className="hidden md:flex flex-1 flex-col justify-center space-y-3">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsCreating(true)}
                className="group relative inline-flex items-center justify-center px-5 py-2 font-black text-primary-foreground bg-primary rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 border border-transparent w-fit"
              >
                <span className="mr-2 text-2xl animate-pulse">🚀</span>
                <span className="text-xl tracking-widest uppercase">Create Token</span>
              </button>
            </div>

            <div className="text-sm text-muted-foreground font-bold leading-snug">
              The First Meme Fair Launch Platform on RobinHood Chain.<br />
              PUMP TO THE AnyLauncher. <a href="#" className="underline hover:text-yellow-500 ml-1">How it works?</a>
            </div>

            <div className="flex w-full max-w-md items-center bg-background border border-border/50 rounded-full p-0.5 pl-3 hover:border-yellow-500/50 transition-colors focus-within:border-yellow-500/50 focus-within:ring-1 focus-within:ring-yellow-500/20">
              <Search className="h-5 w-5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Token"
                className="flex-1 bg-transparent px-3 py-2 text-sm focus:outline-none placeholder:text-muted-foreground"
              />
              <button
                onClick={() => {
                  if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                  }
                }}
                className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-6 py-1.5 text-sm rounded-full transition-colors"
              >
                Search
              </button>
            </div>
          </div>

          {/* Right Side: Top 2 Trending Coins Banner */}
          <div
            ref={sliderRef}
            className="flex-1 flex overflow-x-auto scroll-smooth snap-x snap-mandatory md:overflow-visible gap-3 h-full min-h-[110px] pb-1 md:pb-0"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {tokens.slice(0, 2).map((token: any, idx: number) => (
              <button
                key={token.id}
                onClick={() => onSelectToken?.(token.id)}
                className={`shrink-0 w-[85%] sm:w-[45%] md:w-auto md:flex-1 snap-center relative group overflow-hidden rounded-xl border border-border/50 text-left transition-all duration-500 hover:-translate-y-1 ${idx === 0 ? 'bg-gradient-to-br from-yellow-500/10 to-orange-500/10 hover:border-yellow-500/50 hover:shadow-[0_0_20px_rgba(234,179,8,0.2)]' : 'bg-gradient-to-br from-blue-500/10 to-purple-500/10 hover:border-blue-500/50 hover:shadow-[0_0_20px_rgba(59,130,246,0.2)]'}`}
              >
                <div className="absolute top-0 right-0 p-2">
                  <div className={`flex items-center justify-center w-6 h-6 rounded-full font-black text-xs ${idx === 0 ? 'bg-yellow-500 text-black shadow-[0_0_10px_rgba(234,179,8,0.5)]' : 'bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]'}`}>
                    #{idx + 1}
                  </div>
                </div>
                <div className="p-2 h-full flex flex-col justify-between">
                  <div className="flex items-start gap-2">
                    <TokenImage
                      uri={token.uri}
                      name={token.name}
                      className={`h-8 w-8 shrink-0 rounded-lg shadow-sm object-cover border-2 ${idx === 0 ? 'border-yellow-500/30 group-hover:border-yellow-500' : 'border-blue-500/30 group-hover:border-blue-500'} transition-colors`}
                    />
                    <div className="space-y-0.5 min-w-0 pr-6">
                      <div className="text-[10px] text-muted-foreground truncate">
                        Created by <span className="font-bold text-foreground hover:underline">{token.dev}</span>
                      </div>
                      <div className="font-black text-base truncate leading-tight group-hover:text-primary transition-colors">
                        {token.name}
                      </div>
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                        ${token.ticker}
                        <span className="opacity-50">•</span>
                        <span className="flex items-center gap-1">
                          CA:
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(token.id);
                              toast.success("Address copied");
                            }}
                            className="hover:text-primary transition-colors hover:underline lowercase"
                          >
                            {token.id.slice(0, 4)}...{token.id.slice(-4)}
                          </button>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 pt-2 border-t border-border/50">
                    <div className="flex justify-between items-end mb-1.5">
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Market Cap</div>
                        <div className={`text-xl font-black ${idx === 0 ? 'text-yellow-500' : 'text-blue-400'}`}>
                          ${(token.mc >= 1000 ? (token.mc / 1000).toFixed(1) + 'K' : token.mc)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground bg-background/50 px-2 py-1 rounded-md border border-border/50">
                        <RobinhoodIcon className="w-3 h-3 text-muted-foreground" /> {token.replies}
                      </div>
                    </div>
                    <div className="w-full">
                      <div className="flex justify-between items-center text-[9px] mb-0.5">
                        <span className="text-muted-foreground font-bold uppercase">Bonding Curve</span>
                        <span className={`font-bold ${idx === 0 ? 'text-yellow-500' : 'text-blue-400'}`}>
                          {Math.min(Math.max(((token.mc - 5000) / 69000) * 100, 0), 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full h-1 bg-background/50 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${idx === 0 ? 'bg-primary' : 'bg-blue-400'}`}
                          style={{ width: `${Math.min(Math.max(((token.mc - 5000) / 69000) * 100, 0), 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>


        {/* Filters */}
        <div className="space-y-4 pt-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 text-xs font-bold uppercase overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">

              <div className="flex items-center gap-3 border-r border-border/50 pr-4">
                {[
                  { id: 'last_trade', label: 'Last Trade' },
                  { id: 'creation_time', label: 'Creation Time' },
                  { id: 'heating_up', label: 'Heating Up' },
                  { id: 'watchlist', label: 'Watchlist' }
                ].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setCategory(cat.id);
                      if (cat.id === 'last_trade') setFilterTab('bump');
                      if (cat.id === 'creation_time') setFilterTab('creation');
                      if (cat.id === 'heating_up') setFilterTab('reply');
                    }}
                    className={`whitespace-nowrap hover:text-primary flex items-center gap-1 ${category === cat.id ? 'text-primary underline' : 'text-muted-foreground'}`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <div className="relative flex items-center shrink-0">
                  <Filter className="text-muted-foreground mr-1.5 h-3.5 w-3.5" />
                  <select
                    value={filterTab}
                    onChange={(e) => setFilterTab(e.target.value as any)}
                    className="appearance-none bg-background border border-border/50 text-foreground px-2 py-1.5 pr-7 rounded-lg text-[10px] sm:text-xs font-bold outline-none focus:border-[#ccff00]/50 cursor-pointer"
                  >
                    <option value="bump">Bump Order</option>
                    <option value="reply">Last Reply</option>
                    <option value="creation">Creation Time</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          {/* Token Grid */}
          {(() => {
            const q = searchQuery.trim().toLowerCase();
            let filtered = tokens;

            if (category === 'watchlist') {
              filtered = filtered.filter((t: any) => watchlist.includes(t.id));
            }

            if (q) {
              filtered = filtered.filter((t: any) =>
                t.name.toLowerCase().includes(q) ||
                t.ticker.toLowerCase().includes(q) ||
                t.dev.toLowerCase().includes(q)
              );
            }

            if (filtered.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                  <div className="text-3xl">🔍</div>
                  <div className="text-sm font-bold">no results for "{searchQuery}"</div>
                  <button onClick={() => setSearchQuery('')} className="text-xs text-primary hover:underline">clear search</button>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
                <AnimatePresence>
                  {filtered.map((token: any) => (
                    <motion.button
                      key={token.id}
                      layout
                      initial={{ opacity: 0, y: -16 }}
                      animate={token.isPumping
                        ? {
                          opacity: 1, y: 0,
                          boxShadow: ['0 0 0px rgba(234,179,8,0)', '0 0 18px rgba(234,179,8,0.7)', '0 0 0px rgba(234,179,8,0)'],
                          borderColor: ['rgba(234,179,8,0.2)', 'rgba(234,179,8,1)', 'rgba(234,179,8,0.2)'],
                        }
                        : { opacity: 1, y: 0 }
                      }
                      transition={token.isPumping
                        ? { duration: 1.0, ease: 'easeInOut' }
                        : { duration: 0.3, ease: 'easeOut' }
                      }
                      onClick={() => onSelectToken?.(token.id)}
                      className={`group/item relative bg-card p-2 lg:p-3 border rounded-[14px] overflow-hidden transition-all duration-200 ease-out hover:bg-muted/30 focus-within:border-primary/70 text-left ${token.isPumping
                          ? 'border-primary shadow-sm'
                          : 'border-border hover:border-primary/40 hover:shadow-sm'
                        }`}
                    >
                      <div className="relative flex items-start gap-3 outline-none rounded-md w-full">
                        {/* Left: Image Container */}
                        <div className="relative shrink-0 p-0.5 h-[90px] w-[90px]">
                          {/* Chain Badge (Robinhood) */}
                          <div className="right-0 bottom-0 z-[1] box-content absolute border-[1.5px] border-background rounded-full h-[18px] w-[18px] overflow-hidden bg-[#ccff00] flex items-center justify-center">
                            <RobinhoodIcon className="w-[11px] h-[11px] text-black" />
                          </div>

                          {/* Token Image */}
                          <div className="relative ring-1 ring-border group-hover/item:ring-primary/30 rounded-lg h-[86px] w-[86px] overflow-hidden transition-all duration-300">
                            <TokenImage
                              uri={token.uri}
                              name={token.name}
                              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover/item:scale-[1.04]"
                            />
                          </div>
                        </div>

                        {/* Right: Content Container */}
                        <div className="relative flex-1 flex flex-col min-w-0 min-h-[90px]">

                          {/* Dynamic Pnl Badge */}
                          <div className={`top-0 -right-2 lg:-right-3 absolute flex items-center gap-0.5 py-0.5 pr-[3px] pl-[7px] rounded-l-[15px] tabular-nums text-[9px] font-bold transition-colors duration-200 ${token.pnl >= 0 ? 'text-success bg-success/20' : 'text-destructive bg-destructive/20'}`}>
                            <span>{token.pnl >= 0 ? '⬆' : '⬇'}</span>
                            {token.pnl > 0 ? '+' : ''}{token.pnl}%
                          </div>

                          {/* Header row: Name & Ticker */}
                          <div className="flex items-center gap-1.5 mb-1 pr-12 min-w-0">
                            <div className="truncate max-w-[100px]">
                              <h2 className="inline text-[13px] font-bold text-foreground tracking-tight">{token.name}</h2>
                            </div>
                            <div className="truncate max-w-[60px]">
                              <p className="inline text-[11px] font-semibold text-muted-foreground opacity-80 uppercase">${token.ticker}</p>
                            </div>
                          </div>

                          {/* Category Badge & Watchlist */}
                          <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2 w-full pr-2">
                            <div className="flex items-center justify-center bg-primary/10 border border-primary/20 px-1.5 rounded-full min-w-[37px] h-[14px] text-[9px] font-medium text-primary">
                              Meme
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setWatchlist(prev => prev.includes(token.id) ? prev.filter(x => x !== token.id) : [...prev, token.id]);
                                toast.success(watchlist.includes(token.id) ? "Removed from watchlist" : "Added to watchlist");
                              }}
                              className="p-1 hover:bg-muted rounded-full transition-colors z-10"
                            >
                              <Star className={`h-3 w-3 ${watchlist.includes(token.id) ? 'fill-primary text-primary' : 'text-muted-foreground'}`} />
                            </button>
                          </div>

                          {/* Created By */}
                          <div className="flex justify-between items-center gap-2 h-[12px] text-[10px] font-normal text-muted-foreground mt-auto mb-1">
                            <div className="shrink-0">created by:</div>
                            <div
                              className="truncate underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground transition-colors cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                toast.success("Address copied");
                              }}
                            >
                              {token.dev}
                            </div>
                          </div>

                          {/* Market Cap */}
                          <div className="flex justify-between items-center gap-2 h-[12px] text-[10px] font-normal text-muted-foreground mb-1.5">
                            <div className="shrink-0">Market Cap:</div>
                            <div className="truncate tabular-nums text-foreground/90 font-bold">
                              ${(token.mc >= 1000 ? (token.mc / 1000).toFixed(1) + 'K' : token.mc)}
                            </div>
                          </div>

                          {/* Bonding Curve Progress */}
                          <div className="flex items-center justify-center gap-2">
                            <div className="relative flex-1 bg-muted border border-border h-[6px] overflow-hidden -skew-x-[45deg]">
                              <div
                                className="z-[1] h-full bg-primary transition-all duration-500 ease-out"
                                style={{ width: `${Math.min(Math.max(((token.mc - 5000) / 69000) * 100, 0), 100)}%` }}
                              />
                            </div>
                            <div className="tabular-nums font-bold text-[9px] text-primary">
                              {Math.min(Math.max(((token.mc - 5000) / 69000) * 100, 0), 100).toFixed(1)}%
                            </div>
                          </div>

                        </div>
                      </div>
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            );
          })()}
        </div>

      </div>
    </div>
  );
}
