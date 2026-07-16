import { createPublicClient, http, defineChain, type Address } from 'viem';
import { LaunchpadABI } from './LaunchpadABI';
import { insertLaunchpadToken, insertLaunchpadTrade } from './indexer-store';
import { logger } from '../logger';

export const robinhoodChainTestnet = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.chain.robinhood.com/rpc'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://explorer.testnet.chain.robinhood.com' },
  },
});

const LAUNCHPAD_ADDRESS = (process.env.LAUNCHPAD_ADDRESS || '0x0000000000000000000000000000000000000000') as Address;

let unwatchTokenCreated: (() => void) | null = null;
let unwatchTrade: (() => void) | null = null;

export function startLaunchpadIndexer() {
  if (!LAUNCHPAD_ADDRESS || LAUNCHPAD_ADDRESS === '0x0000000000000000000000000000000000000000') {
    logger.warn("LAUNCHPAD_ADDRESS not configured, skipping indexer worker.");
    return;
  }

  const publicClient = createPublicClient({
    chain: robinhoodChainTestnet,
    transport: http(),
  });

  unwatchTokenCreated = publicClient.watchContractEvent({
    address: LAUNCHPAD_ADDRESS,
    abi: LaunchpadABI,
    eventName: 'TokenCreated',
    onLogs: async (logs) => {
      for (const log of logs) {
        const { tokenAddress, name, symbol, uri } = log.args as any;
        
        let creatorAddress = "0x0000000000000000000000000000000000000000";
        try {
          if (log.transactionHash) {
            const tx = await publicClient.getTransaction({ hash: log.transactionHash });
            creatorAddress = tx.from;
          }
        } catch(e) {
          logger.warn({ error: String(e) }, "Failed to fetch tx to get creator address");
        }

        void insertLaunchpadToken(
          robinhoodChainTestnet.id,
          tokenAddress,
          name,
          symbol,
          uri,
          creatorAddress
        );
      }
    },
    onError: (error) => {
      logger.error({ error }, "Error watching TokenCreated event");
    }
  });

  unwatchTrade = publicClient.watchContractEvent({
    address: LAUNCHPAD_ADDRESS,
    abi: LaunchpadABI,
    eventName: 'Trade',
    onLogs: (logs) => {
      for (const log of logs) {
        const { token, user, ethAmount, tokenAmount, isBuy } = log.args as any;
        void insertLaunchpadTrade(
          token,
          user,
          isBuy,
          ethAmount.toString(),
          tokenAmount.toString(),
          log.transactionHash!
        );
      }
    },
    onError: (error) => {
      logger.error({ error }, "Error watching Trade event");
    }
  });

  logger.info({ address: LAUNCHPAD_ADDRESS }, "Started Launchpad Indexer on Robinhood Chain");
}

export function stopLaunchpadIndexer() {
  if (unwatchTokenCreated) unwatchTokenCreated();
  if (unwatchTrade) unwatchTrade();
}
