import { env, fetchJson } from "../markets/provider-utils";
import type { BundleLaunchTransactionInput } from "./store";

interface SolanaRpcResponse<T> {
  result?: T;
  error?: {
    message?: string;
  };
}

interface SolanaSignatureInfo {
  signature?: string;
  blockTime?: number;
}

interface SolanaParsedInstruction {
  program?: string;
  parsed?: {
    type?: string;
    info?: {
      source?: string;
      destination?: string;
      lamports?: number;
    };
  };
}

interface SolanaParsedTransaction {
  blockTime?: number;
  meta?: {
    preBalances?: number[];
    postBalances?: number[];
    innerInstructions?: Array<{
      instructions?: SolanaParsedInstruction[];
    }>;
  };
  transaction?: {
    message?: {
      accountKeys?: Array<string | { pubkey?: string; signer?: boolean }>;
      instructions?: SolanaParsedInstruction[];
    };
  };
}

interface EvmRpcResponse<T> {
  result?: T;
  error?: {
    message?: string;
  };
}

interface AlchemyTransfer {
  from?: string;
  to?: string;
  blockNum?: string;
  hash?: string;
  asset?: string;
  value?: number;
}

interface AlchemyTransfersResult {
  transfers?: AlchemyTransfer[];
}

const SOLANA_TRACE_LIMIT = 50;
const SOLANA_SIGNATURE_LIMIT = 30;
const SOLANA_TRANSFER_LOOKBACK_DAYS = 14;
const EVM_TRACE_LIMIT = 30;
const LAMPORT_MIN_INCOMING = 1_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const evmRpcEnvMap: Record<string, string> = {
  ethereum: "ETHEREUM_RPC_URL",
  base: "BASE_RPC_URL",
  arbitrum: "ARBITRUM_RPC_URL",
  polygon: "POLYGON_RPC_URL",
  optimism: "OPTIMISM_RPC_URL",
};

const evmAlchemyNetworkMap: Record<string, string> = {
  ethereum: "eth-mainnet",
  base: "base-mainnet",
  arbitrum: "arb-mainnet",
  polygon: "polygon-mainnet",
  optimism: "opt-mainnet",
};

function configuredSolanaRpcUrl(): string | null {
  const configured = env("SOLANA_RPC_URL");
  if (configured) return configured;

  const heliusKey = env("HELIUS_API_KEY");
  if (!heliusKey) return null;

  return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(heliusKey)}`;
}

function configuredEvmRpcUrl(chain: string): string | null {
  const normalized = chain.trim().toLowerCase();
  if (env("ALCHEMY_DISABLED")?.toLowerCase() === "true") return null;

  const explicit = env(evmRpcEnvMap[normalized] ?? "");
  if (explicit) return explicit;

  const network = evmAlchemyNetworkMap[normalized];
  const alchemyKey = env("ALCHEMY_API_KEY");
  if (!network || !alchemyKey) return null;

  return `https://${network}.g.alchemy.com/v2/${encodeURIComponent(alchemyKey)}`;
}

async function rpc<T>(url: string, method: string, params: unknown[], timeoutMs = 12_000): Promise<T | null> {
  try {
    const response = await fetchJson<SolanaRpcResponse<T> | EvmRpcResponse<T>>(
      url,
      {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `anyalpha-${method}`,
          method,
          params,
        }),
      },
      timeoutMs,
    );

    if (response.error) throw new Error(response.error.message ?? `${method} failed`);
    return response.result ?? null;
  } catch {
    return null;
  }
}

function normalizeAddress(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function accountKeyString(key: string | { pubkey?: string } | undefined): string | undefined {
  return typeof key === "string" ? key : key?.pubkey;
}

function allSolanaInstructions(tx: SolanaParsedTransaction): SolanaParsedInstruction[] {
  return [
    ...(tx.transaction?.message?.instructions ?? []),
    ...(tx.meta?.innerInstructions ?? []).flatMap((row) => row.instructions ?? []),
  ];
}

function systemTransferSource(tx: SolanaParsedTransaction, wallet: string): string | undefined {
  const normalizedWallet = normalizeAddress(wallet);

  for (const instruction of allSolanaInstructions(tx)) {
    if (instruction.program !== "system") continue;
    const parsed = instruction.parsed;
    if (parsed?.type !== "transfer") continue;
    const destination = parsed.info?.destination;
    const source = parsed.info?.source;
    const lamports = parsed.info?.lamports ?? 0;

    if (
      normalizeAddress(destination) === normalizedWallet &&
      normalizeAddress(source) !== normalizedWallet &&
      lamports >= LAMPORT_MIN_INCOMING
    ) {
      return source;
    }
  }

  return undefined;
}

function balanceDeltaSource(tx: SolanaParsedTransaction, wallet: string): string | undefined {
  const keys = tx.transaction?.message?.accountKeys ?? [];
  const pre = tx.meta?.preBalances ?? [];
  const post = tx.meta?.postBalances ?? [];
  const normalizedWallet = normalizeAddress(wallet);
  const targetIndex = keys.findIndex((key) => normalizeAddress(accountKeyString(key)) === normalizedWallet);

  if (targetIndex < 0) return undefined;
  const targetDelta = (post[targetIndex] ?? 0) - (pre[targetIndex] ?? 0);
  if (targetDelta < LAMPORT_MIN_INCOMING) return undefined;

  let source: string | undefined;
  let largestNegativeDelta = 0;

  keys.forEach((key, index) => {
    const address = accountKeyString(key);
    if (!address || normalizeAddress(address) === normalizedWallet) return;
    const delta = (post[index] ?? 0) - (pre[index] ?? 0);
    if (delta < largestNegativeDelta) {
      largestNegativeDelta = delta;
      source = address;
    }
  });

  return source;
}

async function traceSolanaWallet(url: string, wallet: string, launchTimeMs: number): Promise<Partial<BundleLaunchTransactionInput>> {
  const signatures = await rpc<SolanaSignatureInfo[]>(url, "getSignaturesForAddress", [
    wallet,
    {
      limit: SOLANA_SIGNATURE_LIMIT,
    },
  ]);

  if (!signatures?.length) return {};

  const oldestSeen = signatures
    .map((row) => row.blockTime)
    .filter((blockTime): blockTime is number => typeof blockTime === "number")
    .sort((left, right) => left - right)[0];
  const walletAgeDays = oldestSeen ? Math.max(0, Math.floor((launchTimeMs - oldestSeen * 1000) / DAY_MS)) : undefined;
  const earliestAllowed = launchTimeMs - SOLANA_TRANSFER_LOOKBACK_DAYS * DAY_MS;
  const candidateSignatures = signatures
    .filter((row) => row.signature && row.blockTime && row.blockTime * 1000 < launchTimeMs && row.blockTime * 1000 >= earliestAllowed)
    .slice(0, 8);

  for (const row of candidateSignatures) {
    const tx = await rpc<SolanaParsedTransaction>(url, "getTransaction", [
      row.signature,
      {
        encoding: "jsonParsed",
        maxSupportedTransactionVersion: 0,
      },
    ]);
    if (!tx) continue;

    const fundingSource = systemTransferSource(tx, wallet) ?? balanceDeltaSource(tx, wallet);
    if (fundingSource) {
      return {
        fundingSource,
        walletAgeDays,
      };
    }
  }

  return {
    walletAgeDays,
  };
}

async function traceEvmWallet(url: string, wallet: string): Promise<Partial<BundleLaunchTransactionInput>> {
  const result = await rpc<AlchemyTransfersResult>(
    url,
    "alchemy_getAssetTransfers",
    [
      {
        fromBlock: "0x0",
        toBlock: "latest",
        toAddress: wallet,
        category: ["external", "erc20"],
        maxCount: "0xa",
        order: "desc",
        excludeZeroValue: true,
      },
    ],
    12_000,
  );
  const fundingSource = result?.transfers?.find((transfer) => {
    const from = normalizeAddress(transfer.from);
    return from && from !== normalizeAddress(wallet);
  })?.from;

  return fundingSource ? { fundingSource } : {};
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;

  async function runWorker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, () => runWorker()));
  return results;
}

export async function enrichLaunchTransactionsWithFundingTrace(input: {
  chain: string;
  launchTimeMs: number;
  transactions: BundleLaunchTransactionInput[];
}): Promise<{ transactions: BundleLaunchTransactionInput[]; tracedWallets: number; fundedWallets: number; provider?: string }> {
  const chain = input.chain.trim().toLowerCase();
  const traceLimit = Math.max(1, Math.min(80, Number(env("ANYALPHA_BUNDLE_FUNDING_TRACE_LIMIT") ?? SOLANA_TRACE_LIMIT)));
  const targetTransactions = input.transactions.slice(0, traceLimit);
  const remainingTransactions = input.transactions.slice(traceLimit);
  const uniqueWallets = new Set<string>();

  const traceTargets = targetTransactions.filter((tx) => {
    const normalized = normalizeAddress(tx.walletAddress);
    if (!normalized || uniqueWallets.has(normalized)) return false;
    uniqueWallets.add(normalized);
    return true;
  });

  if (traceTargets.length === 0) {
    return {
      transactions: input.transactions,
      tracedWallets: 0,
      fundedWallets: 0,
    };
  }

  const solanaUrl = chain === "solana" ? configuredSolanaRpcUrl() : null;
  const evmUrl = chain !== "solana" ? configuredEvmRpcUrl(chain) : null;
  const url = solanaUrl ?? evmUrl;
  if (!url) {
    return {
      transactions: input.transactions,
      tracedWallets: 0,
      fundedWallets: 0,
    };
  }

  const traces = await mapWithConcurrency(traceTargets, 4, async (tx) => ({
    walletAddress: tx.walletAddress,
    trace: chain === "solana"
      ? await traceSolanaWallet(url, tx.walletAddress, input.launchTimeMs)
      : await traceEvmWallet(url, tx.walletAddress),
  }));
  const traceByWallet = new Map(traces.map((row) => [normalizeAddress(row.walletAddress), row.trace]));
  const enrichedTargets = targetTransactions.map((tx) => ({
    ...tx,
    ...(traceByWallet.get(normalizeAddress(tx.walletAddress)) ?? {}),
  }));
  const fundedWallets = enrichedTargets.filter((tx) => tx.fundingSource).length;

  return {
    transactions: [...enrichedTargets, ...remainingTransactions],
    tracedWallets: traces.length,
    fundedWallets,
    provider: chain === "solana" ? "solana-rpc" : "alchemy-asset-transfers",
  };
}
