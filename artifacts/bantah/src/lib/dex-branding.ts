interface DexBrand {
  label: string;
  logoUrl: string;
}

const DEX_BRANDS: Record<string, DexBrand> = {
  pumpswap: {
    label: 'PumpSwap',
    logoUrl: 'https://pump.fun/pump-logomark.svg',
  },
  pumpfun: {
    label: 'pump.fun',
    logoUrl: 'https://pump.fun/pump-logomark.svg',
  },
  uniswap: {
    label: 'Uniswap',
    logoUrl: 'https://app.uniswap.org/favicon.png',
  },
  pancakeswap: {
    label: 'PancakeSwap',
    logoUrl: 'https://pancakeswap.finance/logo.png',
  },
  stonfi: {
    label: 'STON.fi',
    logoUrl: 'https://app.ston.fi/favicon.ico',
  },
  camelot: {
    label: 'Camelot',
    logoUrl: 'https://app.camelot.exchange/favicon.ico',
  },
  traderjoe: {
    label: 'Trader Joe',
    logoUrl: 'https://traderjoexyz.com/favicon.ico',
  },
  raydium: {
    label: 'Raydium',
    logoUrl: 'https://raydium.io/favicon.ico',
  },
  quickswap: {
    label: 'QuickSwap',
    logoUrl: 'https://quickswap.exchange/favicon.ico',
  },
  sushiswap: {
    label: 'Sushi',
    logoUrl: 'https://www.sushi.com/favicon.ico',
  },
  meteora: {
    label: 'Meteora',
    logoUrl: 'https://www.meteora.ag/icons/v2.svg',
  },
  meteoradbc: {
    label: 'Meteora DBC',
    logoUrl: 'https://www.meteora.ag/icons/v2.svg',
  },
  dedust: {
    label: 'DeDust',
    logoUrl: 'https://dedust.io/favicon-32x32.png',
  },
  pulsex: {
    label: 'PulseX',
    logoUrl: 'https://app.pulsex.com/logo.svg',
  },
};

export function getDexBrand(dexId?: string): DexBrand | null {
  if (!dexId) return null;
  return DEX_BRANDS[dexId.toLowerCase()] ?? null;
}
