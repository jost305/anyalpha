export interface SearchToken {
  name: string;
  pair: string;
  chain: string;
  emoji: string;
  price: number;
  chainColor: string;
}

export const SEARCH_TOKENS: SearchToken[] = [
  { name: 'PEPEFUN',  pair: 'PEPE/SOL',      chain: 'SOL',     emoji: '🐸', price: 0.00001248, chainColor: '#9945FF' },
  { name: 'AIGEN',    pair: 'AIGEN/ETH',     chain: 'ETH',     emoji: '🤖', price: 0.005183,   chainColor: '#627EEA' },
  { name: 'BOLTAI',   pair: 'BOLTAI/SOL',    chain: 'SOL',     emoji: '⚡', price: 0.005288,   chainColor: '#9945FF' },
  { name: 'CHAOS',    pair: 'CHAOS/WETH',    chain: 'BASE',    emoji: '🎭', price: 0.006912,   chainColor: '#0052FF' },
  { name: 'LUNA2',    pair: 'LUNA2/SOL',     chain: 'SOL',     emoji: '🌕', price: 0.003622,   chainColor: '#9945FF' },
  { name: 'SWEAT',    pair: 'SWEAT/USDC',    chain: 'SOL',     emoji: '💧', price: 0.002296,   chainColor: '#9945FF' },
  { name: 'FOXAI',    pair: 'FOXAI/SOL',     chain: 'SOL',     emoji: '🦊', price: 0.003451,   chainColor: '#9945FF' },
  { name: 'ORACLE',   pair: 'ORACLE/ETH',    chain: 'ETH',     emoji: '🔮', price: 0.5028,     chainColor: '#627EEA' },
  { name: 'DRGN',     pair: 'DRGN/WETH',     chain: 'ARB',     emoji: '🐉', price: 0.03824,    chainColor: '#12AAFF' },
  { name: 'BANTAH',   pair: 'BANTAH/SOL',    chain: 'SOL',     emoji: '🎯', price: 0.001337,   chainColor: '#9945FF' },
  { name: 'BALL',     pair: 'BALL/SOL',      chain: 'SOL',     emoji: '⚽', price: 0.000421,   chainColor: '#9945FF' },
  { name: 'DEFAI',    pair: 'DEFAI/BASE',    chain: 'BASE',    emoji: '🏦', price: 0.00782,    chainColor: '#0052FF' },
  { name: 'NADS',     pair: 'NADS/MON',      chain: 'MONAD',   emoji: '🟣', price: 0.00421,    chainColor: '#836EF9' },
  { name: 'GIGA',     pair: 'GIGA/MON',      chain: 'MONAD',   emoji: '🔶', price: 0.001882,   chainColor: '#836EF9' },
  { name: 'MEGAB',    pair: 'MEGAB/ETH',     chain: 'MEGAETH', emoji: '🌀', price: 0.00312,    chainColor: '#FF4F00' },
  { name: 'RUNE',     pair: 'RUNE/ETH',      chain: 'SCROLL',  emoji: '📜', price: 0.00891,    chainColor: '#EBC28E' },
  { name: 'DOGS',     pair: 'DOGS/TON',      chain: 'TON',     emoji: '💎', price: 0.000082,   chainColor: '#0098EA' },
  { name: 'PURR',     pair: 'PURR/HYPE',     chain: 'HYPE',    emoji: '🐈', price: 0.02841,    chainColor: '#3CFFBE' },
  { name: 'BABYDOGE', pair: 'BABYDOGE/BNB',  chain: 'BSC',     emoji: '🐕', price: 0.0000000024, chainColor: '#F3BA2F' },
  { name: 'SAFU',     pair: 'SAFU/BNB',      chain: 'BSC',     emoji: '🦁', price: 0.000182,   chainColor: '#F3BA2F' },
];

export function searchTokens(query: string): SearchToken[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  return SEARCH_TOKENS.filter(
    t => t.name.toLowerCase().includes(q) || t.pair.toLowerCase().includes(q) || t.chain.toLowerCase().includes(q)
  ).slice(0, 8);
}

export function fmtSearchPrice(p: number) {
  if (p >= 1)      return '$' + p.toFixed(2);
  if (p >= 0.01)   return '$' + p.toFixed(4);
  if (p >= 0.0001) return '$' + p.toFixed(6);
  return '$' + p.toFixed(8);
}
