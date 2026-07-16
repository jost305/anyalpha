import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Rocket, Search, ArrowLeft, ImagePlus, Twitter, Send, Globe, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

export default function LauncherPage({ onSelectToken }: { onSelectToken?: (id: string) => void }) {
  const [isCreating, setIsCreating] = useState(false);
  const [filterTab, setFilterTab] = useState<'bump' | 'reply' | 'creation'>('bump');
  const [category, setCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [tokens, setTokens] = useState(() => Array.from({ length: 12 }).map((_, i) => {
    const mc = Math.floor(Math.random() * 90 + 10);
    return {
      id: `token-${i}`,
      name: `TokenName_${i}`,
      ticker: 'TKN',
      dev: `Dev_${i}x...`,
      mc,
      ath: mc,
      replies: Math.floor(Math.random() * 50),
      isPumping: false
    };
  }));

  // Interval 1: add new coin every 6s
  useEffect(() => {
    const interval = setInterval(() => {
      setTokens(prev => {
        const mc = Math.floor(Math.random() * 20 + 5);
        const newToken = {
          id: `token-new-${Date.now()}`,
          name: `NewCoin_${Math.floor(Math.random() * 1000)}`,
          ticker: 'NEW',
          dev: `Dev_${Math.floor(Math.random() * 1000)}...`,
          mc,
          ath: mc,
          replies: 0,
          isPumping: false
        };
        return [newToken, ...prev.slice(0, 11)];
      });
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  // Interval 2: randomly bump MC on existing tokens every 2.5s
  useEffect(() => {
    const interval = setInterval(() => {
      setTokens(prev => {
        const idx = Math.floor(Math.random() * prev.length);
        return prev.map((token, i) => {
          if (i !== idx) return token;
          const bump = Math.random() < 0.65; // 65% chance of increase
          if (!bump) return token;
          const newMc = Math.round(token.mc * (1 + Math.random() * 0.18 + 0.02));
          const isNewAth = newMc > token.ath;
          return { ...token, mc: newMc, ath: isNewAth ? newMc : token.ath, isPumping: isNewAth };
        });
      });
      // Clear the pulse flag after the animation plays
      setTimeout(() => {
        setTokens(prev => prev.map(t => t.isPumping ? { ...t, isPumping: false } : t));
      }, 1200);
    }, 2500);
    return () => clearInterval(interval);
  }, []);
  
  // Create form state
  const [showOptions, setShowOptions] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [ticker, setTicker] = useState('');
  const [description, setDescription] = useState('');
  
  if (isCreating) {
    return (
      <div className="h-full overflow-y-auto bg-background text-foreground">
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
            
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase">name</label>
                <input
                  type="text"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase">ticker</label>
                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase">description</label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase">image</label>
                <div className="flex cursor-pointer items-center justify-center border border-dashed border-border bg-muted/20 px-6 py-8 text-center hover:border-primary/50">
                  <div className="flex flex-col items-center gap-2">
                    <ImagePlus className="h-6 w-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">click to upload</span>
                  </div>
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
                    <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1"><Twitter className="h-3 w-3"/> twitter link</label>
                    <input type="text" className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1"><Send className="h-3 w-3"/> telegram link</label>
                    <input type="text" className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1"><Globe className="h-3 w-3"/> website</label>
                    <input type="text" className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  toast.success('Coin created successfully! (Frontend Only)');
                  setIsCreating(false);
                }}
                className="w-full bg-primary py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 mt-4"
              >
                create coin
              </button>
              <div className="text-center text-xs text-muted-foreground">
                cost to deploy: ~0.02 SOL
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
        
        {/* Minimal Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between border-b border-border/50 pb-3 gap-3">
          <div className="flex items-center gap-4 text-sm font-bold">
            <span className="text-primary tracking-widest text-lg">anyAlpha</span>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="text-sm font-bold text-primary hover:underline hover:text-primary/80"
          >
            [start a new coin]
          </button>
        </div>

        {/* Trending Now */}
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-2 text-lg font-black text-yellow-500 uppercase tracking-widest text-center">
            <Crown className="h-6 w-6" /> Trending now
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <button 
                key={i}
                onClick={() => onSelectToken?.(`koth-${i}`)}
                className="flex items-center text-left gap-4 border-2 border-yellow-500/30 bg-yellow-500/5 p-3 hover:border-yellow-500/60 transition-colors"
              >
                <img 
                  src={`https://picsum.photos/seed/koth-${i}/100/100`} 
                  className="h-16 w-16 shrink-0 bg-muted border border-border/50 shadow-sm object-cover" 
                  alt="Trending Token" 
                />
                <div className="space-y-0.5">
                  <div className="text-[11px]">
                    <span className="text-muted-foreground">Created by </span>
                    <span className="font-bold hover:underline bg-muted/30 px-1 rounded">2abc...1xyz</span>
                  </div>
                  <div className="font-bold text-sm">
                    KingToken (KING)
                  </div>
                  <div className="text-xs text-green-500 font-bold">
                    market cap: $1,245,000
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Search & Filters */}
        <div className="space-y-4 pt-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="search for token"
                className="w-full rounded-none border border-border bg-background pl-9 pr-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 text-xs font-bold uppercase overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
              
              <div className="flex items-center gap-3 border-r border-border/50 pr-4">
                {[
                  { id: 'all', label: 'all', emoji: '\uD83C\uDF10' },
                  { id: 'animations', label: 'animations', emoji: '\uD83C\uDFAC' },
                  { id: 'art', label: 'art', emoji: '\uD83C\uDFA8' },
                  { id: 'gaming', label: 'gaming', emoji: '\uD83C\uDFAE' },
                  { id: 'memes', label: 'memes', emoji: '\uD83E\uDD21' }
                ].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setCategory(cat.id)}
                    className={`whitespace-nowrap hover:text-primary flex items-center gap-1 ${category === cat.id ? 'text-primary underline' : 'text-muted-foreground'}`}
                  >
                    <span>{cat.emoji}</span> {cat.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <button
                onClick={() => setFilterTab('bump')}
                className={`whitespace-nowrap hover:text-primary ${filterTab === 'bump' ? 'text-primary underline' : 'text-muted-foreground'}`}
              >
                bump order
              </button>
              <button
                onClick={() => setFilterTab('reply')}
                className={`whitespace-nowrap hover:text-primary ${filterTab === 'reply' ? 'text-primary underline' : 'text-muted-foreground'}`}
              >
                last reply
              </button>
              <button
                onClick={() => setFilterTab('creation')}
                className={`whitespace-nowrap hover:text-primary ${filterTab === 'creation' ? 'text-primary underline' : 'text-muted-foreground'}`}
              >
                creation time
              </button>
              </div>
            </div>
          </div>

          {/* Token Grid */}
          {(() => {
            const q = searchQuery.trim().toLowerCase();
            const filtered = q
              ? tokens.filter(t =>
                  t.name.toLowerCase().includes(q) ||
                  t.ticker.toLowerCase().includes(q) ||
                  t.dev.toLowerCase().includes(q)
                )
              : tokens;

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
                  {filtered.map((token) => (
                <motion.button
                  key={token.id}
                  layout
                  initial={{ opacity: 0, y: -16 }}
                  animate={token.isPumping
                    ? {
                        opacity: 1, y: 0,
                        boxShadow: ['0 0 0px rgba(34,197,94,0)', '0 0 18px rgba(34,197,94,0.7)', '0 0 0px rgba(34,197,94,0)'],
                        borderColor: ['rgba(34,197,94,0.2)', 'rgba(34,197,94,1)', 'rgba(34,197,94,0.2)'],
                      }
                    : { opacity: 1, y: 0 }
                  }
                  transition={token.isPumping
                    ? { duration: 1.0, ease: 'easeInOut' }
                    : { duration: 0.3, ease: 'easeOut' }
                  }
                  onClick={() => onSelectToken?.(token.id)}
                  className={`flex items-start gap-3 border p-3 text-left transition-colors relative overflow-hidden ${
                    token.isPumping ? 'border-green-500' : 'border-border bg-card hover:border-primary/50'
                  }`}
                >
                  <img 
                    src={`https://picsum.photos/seed/${token.id}/100/100`} 
                    className="h-[90px] w-[90px] shrink-0 bg-muted border border-border/50 object-cover" 
                    alt={token.name} 
                  />
                  <div className="flex-1 space-y-1 min-w-0 relative z-10">
                    <div className="text-[11px] truncate">
                      <span className="text-muted-foreground">Created by </span>
                      <span className="font-bold hover:underline bg-muted/30 px-1 rounded">{token.dev}</span>
                    </div>
                    <div className="text-sm font-bold text-green-500 truncate">
                      market cap: ${token.mc}K
                    </div>
                    <div className="text-[12px] text-muted-foreground mt-1">
                      <span className="text-foreground font-bold">REPLY: {token.replies}</span>
                    </div>
                    <div className="text-[12px] font-bold truncate mt-1">
                      {token.name} ({token.ticker})
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
