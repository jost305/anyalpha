import { http } from 'wagmi';
import { createConfig } from '@privy-io/wagmi';
import { defineChain } from 'viem';
import { base, baseSepolia } from 'viem/chains';

// Define Robinhood Chain
export const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.chain.robinhood.com'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' },
  },
});

export const robinhoodChainTestnet = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.chain.robinhood.com'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://explorer.testnet.chain.robinhood.com' },
  },
});

export const wagmiConfig = createConfig({
  chains: [base, baseSepolia, robinhoodChain, robinhoodChainTestnet],
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
    [robinhoodChain.id]: http(),
    [robinhoodChainTestnet.id]: http(),
  },
});
