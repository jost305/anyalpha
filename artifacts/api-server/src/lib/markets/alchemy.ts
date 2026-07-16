import type { MarketToken, MarketTokenTrade } from "./types";
import {
  env,
  fetchJson,
  infuraRpcUrl,
  numeric,
  rpcAuthHeaders,
  type MarketEnrichment,
  type ProviderBatchResult,
} from "./provider-utils";

interface AlchemyPriceResponse {
  data?: Array<{
    network?: string;
    address?: string;
    prices?: Array<{
      currency?: string;
      value?: string;
      lastUpdatedAt?: string;
    }>;
    error?: string;
  }>;
}

interface AlchemyMetadataResponse {
  result?: {
    name?: string;
    symbol?: string;
    decimals?: number;
    logo?: string;
  };
  error?: {
    message?: string;
  };
}

const networkMap: Record<string, string> = {
  ethereum: "eth-mainnet",
  base: "base-mainnet",
  arbitrum: "arb-mainnet",
  polygon: "polygon-mainnet",
  optimism: "opt-mainnet",
};

const rpcEnvMap: Record<string, string> = {
  ethereum: "ETHEREUM_RPC_URL",
  base: "BASE_RPC_URL",
  arbitrum: "ARBITRUM_RPC_URL",
  polygon: "POLYGON_RPC_URL",
  optimism: "OPTIMISM_RPC_URL",
};

const V2_SWAP_TOPIC = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657e76d38c59045e0e3371840";
const V3_SWAP_TOPIC = "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";
const TOKEN0_SELECTOR = "0x0dfe1681";
const TOKEN1_SELECTOR = "0xd21220a7";
const DECIMALS_SELECTOR = "0x313ce567";

interface EvmRpcResponse<T> {
  result?: T;
  error?: {
    message?: string;
  };
}

interface EvmLog {
  address?: string;
  blockNumber?: string;
  data?: string;
  logIndex?: string;
  topics?: string[];
  transactionHash?: string;
}

interface EvmBlock {
  timestamp?: string;
}

type EvmRpcPlatform = NonNullable<MarketTokenTrade["platform"]>;

interface EvmRpcEndpoint {
  url: string;
  platform: EvmRpcPlatform;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
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

function alchemyDisabled(): boolean {
  return env("ALCHEMY_DISABLED")?.toLowerCase() === "true";
}

function rpcPlatform(url: string): EvmRpcPlatform {
  if (/infura\.io/i.test(url)) return { id: "infura", name: "Infura RPC" };
  if (/alchemy\.com/i.test(url)) return { id: "alchemy", name: "Alchemy RPC" };
  return { id: "evm-rpc", name: "EVM RPC" };
}

function evmRpcEndpoint(chainId: string): EvmRpcEndpoint | null {
  const normalized = chainId.trim().toLowerCase();
  const explicit = env(rpcEnvMap[normalized] ?? "");
  if (explicit) return { url: explicit, platform: rpcPlatform(explicit) };

  const infura = infuraRpcUrl(normalized);
  if (infura) return { url: infura, platform: rpcPlatform(infura) };

  const network = networkMap[normalized];
  const key = env("ALCHEMY_API_KEY");
  if (!network || !key || alchemyDisabled()) return null;

  const url = `https://${network}.g.alchemy.com/v2/${encodeURIComponent(key)}`;
  return { url, platform: rpcPlatform(url) };
}

async function evmRpc<T>(url: string, method: string, params: unknown[], timeoutMs = 12_000): Promise<T | null> {
  try {
    const response = await fetchJson<EvmRpcResponse<T>>(
      url,
      {
        method: "POST",
        headers: rpcAuthHeaders(url),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `anyalpha-${method}`,
          method,
          params,
        }),
      },
      timeoutMs,
    );

    if (response.error) throw new Error(response.error.message ?? "EVM RPC error");
    return response.result ?? null;
  } catch {
    return null;
  }
}

function hexToNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  try {
    return Number(BigInt(value));
  } catch {
    return undefined;
  }
}

function normalizeHexAddress(value: string | undefined): string | undefined {
  if (!value || value === "0x") return undefined;
  const stripped = value.replace(/^0x/i, "");
  if (stripped.length < 40) return undefined;
  return `0x${stripped.slice(-40)}`.toLowerCase();
}

async function ethCall(url: string, to: string, data: string): Promise<string | null> {
  return evmRpc<string>(
    url,
    "eth_call",
    [
      {
        to,
        data,
      },
      "latest",
    ],
    10_000,
  );
}

async function tokenDecimals(url: string, tokenAddress: string): Promise<number> {
  const result = await ethCall(url, tokenAddress, DECIMALS_SELECTOR);
  const decimals = hexToNumber(result ?? undefined);
  return typeof decimals === "number" && decimals >= 0 && decimals <= 36 ? decimals : 18;
}

function wordAt(data: string | undefined, index: number): string | undefined {
  const stripped = data?.replace(/^0x/i, "") ?? "";
  const word = stripped.slice(index * 64, index * 64 + 64);
  return word.length === 64 ? `0x${word}` : undefined;
}

function uintWord(data: string | undefined, index: number): bigint {
  const word = wordAt(data, index);
  return word ? BigInt(word) : 0n;
}

function intWord(data: string | undefined, index: number): bigint {
  const value = uintWord(data, index);
  const signBoundary = 1n << 255n;
  return value >= signBoundary ? value - (1n << 256n) : value;
}

function formatUnits(value: bigint, decimals: number): number {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const amount = Number(absolute) / 10 ** decimals;
  return negative ? -amount : amount;
}

function logSortValue(value: string | undefined): number {
  return hexToNumber(value) ?? 0;
}

function parseSwapLog(input: {
  log: EvmLog;
  token: MarketToken;
  tokenIndex: 0 | 1;
  tokenDecimals: number;
  quoteDecimals: number;
  timestampByBlock: Map<string, number>;
  platform: EvmRpcPlatform;
}): MarketTokenTrade | null {
  const { log, token, tokenIndex, tokenDecimals, quoteDecimals, timestampByBlock, platform } = input;
  const topic = log.topics?.[0]?.toLowerCase();
  const hash = log.transactionHash;
  if (!topic || !hash) return null;

  let type: "buy" | "sell";
  let baseTokenAmount: number;
  let quoteTokenAmount: number | undefined;
  let makerAddress = normalizeHexAddress(log.topics?.[2]) ?? normalizeHexAddress(log.topics?.[1]);

  if (topic === V2_SWAP_TOPIC) {
    const amount0In = uintWord(log.data, 0);
    const amount1In = uintWord(log.data, 1);
    const amount0Out = uintWord(log.data, 2);
    const amount1Out = uintWord(log.data, 3);
    const tokenIn = tokenIndex === 0 ? amount0In : amount1In;
    const tokenOut = tokenIndex === 0 ? amount0Out : amount1Out;
    const quoteIn = tokenIndex === 0 ? amount1In : amount0In;
    const quoteOut = tokenIndex === 0 ? amount1Out : amount0Out;

    type = tokenOut > 0n ? "buy" : "sell";
    baseTokenAmount = formatUnits(tokenOut > 0n ? tokenOut : tokenIn, tokenDecimals);
    quoteTokenAmount = formatUnits(tokenOut > 0n ? quoteIn : quoteOut, quoteDecimals);
  } else if (topic === V3_SWAP_TOPIC) {
    const amount0 = intWord(log.data, 0);
    const amount1 = intWord(log.data, 1);
    const tokenDelta = tokenIndex === 0 ? amount0 : amount1;
    const quoteDelta = tokenIndex === 0 ? amount1 : amount0;

    // V3-style pools report pool deltas: negative token delta means token left the pool.
    type = tokenDelta < 0n ? "buy" : "sell";
    baseTokenAmount = formatUnits(tokenDelta < 0n ? -tokenDelta : tokenDelta, tokenDecimals);
    quoteTokenAmount = formatUnits(quoteDelta < 0n ? -quoteDelta : quoteDelta, quoteDecimals);
  } else {
    return null;
  }

  if (!Number.isFinite(baseTokenAmount) || baseTokenAmount <= 0) return null;
  if (quoteTokenAmount !== undefined && (!Number.isFinite(quoteTokenAmount) || quoteTokenAmount <= 0)) {
    quoteTokenAmount = undefined;
  }

  const blockNumber = log.blockNumber?.toLowerCase();
  const timestamp = blockNumber ? timestampByBlock.get(blockNumber) : undefined;
  const usdValue = typeof token.priceUsd === "number" ? token.priceUsd * baseTokenAmount : undefined;

  return {
    id: `${platform.id}-log-${hash}-${log.logIndex ?? "0"}`,
    type,
    operation: "swap",
    baseTokenAmount,
    baseTokenAmountUsd: usdValue,
    quoteTokenAmount,
    quoteTokenAmountUsd: usdValue,
    timestamp,
    transactionHash: hash,
    marketAddress: token.pairAddress,
    makerAddress,
    senderAddress: normalizeHexAddress(log.topics?.[1]),
    priceUsd: token.priceUsd,
    labels: ["rpc-log"],
    platform,
  };
}

export async function fetchAlchemyPoolTrades(token: MarketToken, limit = 80): Promise<MarketTokenTrade[]> {
  if (!token.pairAddress || !token.tokenAddress) return [];

  const endpoint = evmRpcEndpoint(token.chainId);
  if (!endpoint) return [];
  const { url, platform } = endpoint;

  const [token0Raw, token1Raw] = await Promise.all([
    ethCall(url, token.pairAddress, TOKEN0_SELECTOR),
    ethCall(url, token.pairAddress, TOKEN1_SELECTOR),
  ]);
  const token0 = normalizeHexAddress(token0Raw ?? undefined);
  const token1 = normalizeHexAddress(token1Raw ?? undefined);
  const trackedToken = token.tokenAddress.toLowerCase();
  const tokenIndex = trackedToken === token0 ? 0 : trackedToken === token1 ? 1 : null;
  if (tokenIndex === null || !token0 || !token1) return [];

  const quoteToken = tokenIndex === 0 ? token1 : token0;
  const [trackedDecimals, quoteDecimals, latestBlockHex] = await Promise.all([
    tokenDecimals(url, token.tokenAddress),
    tokenDecimals(url, quoteToken),
    evmRpc<string>(url, "eth_blockNumber", [], 10_000),
  ]);
  const latestBlock = hexToNumber(latestBlockHex ?? undefined);
  if (typeof latestBlock !== "number") return [];

  const blockWindow = Math.max(10, Math.min(5_000, Number(env("EVM_SWAP_LOG_BLOCK_LOOKBACK") ?? "2000")));
  const chunkSize = Math.max(1, Math.min(10, Number(env("EVM_SWAP_LOG_BLOCK_CHUNK_SIZE") ?? "10")));
  const ranges: Array<{ fromBlock: number; toBlock: number }> = [];
  const earliest = Math.max(0, latestBlock - blockWindow);

  for (let toBlock = latestBlock; toBlock >= earliest; toBlock -= chunkSize) {
    ranges.push({
      fromBlock: Math.max(earliest, toBlock - chunkSize + 1),
      toBlock,
    });
  }

  const rawLogs: EvmLog[] = [];
  for (const rangeBatch of chunk(ranges, 20)) {
    const logGroups = await mapWithConcurrency(rangeBatch, 6, async (range) => {
      const [v2Logs, v3Logs] = await Promise.all(
        [V2_SWAP_TOPIC, V3_SWAP_TOPIC].map((topic) =>
          evmRpc<EvmLog[]>(
            url,
            "eth_getLogs",
            [
              {
                address: token.pairAddress,
                fromBlock: `0x${range.fromBlock.toString(16)}`,
                toBlock: `0x${range.toBlock.toString(16)}`,
                topics: [topic],
              },
            ],
            12_000,
          ),
        ),
      );
      return [...(v2Logs ?? []), ...(v3Logs ?? [])];
    });

    rawLogs.push(...logGroups.flat());
    if (rawLogs.length >= limit) break;
  }

  const logs = rawLogs
    .flat()
    .sort((a, b) => logSortValue(b.blockNumber) - logSortValue(a.blockNumber) || logSortValue(b.logIndex) - logSortValue(a.logIndex))
    .slice(0, Math.max(1, Math.min(200, Math.round(limit))));
  if (!logs.length) return [];

  const blockNumbers = Array.from(new Set(logs.map((log) => log.blockNumber?.toLowerCase()).filter((item): item is string => Boolean(item))));
  const blocks = await mapWithConcurrency(blockNumbers, 4, async (blockNumber) => ({
    blockNumber,
    block: await evmRpc<EvmBlock>(url, "eth_getBlockByNumber", [blockNumber, false], 10_000),
  }));
  const timestampByBlock = new Map<string, number>();
  for (const row of blocks) {
    const timestamp = hexToNumber(row.block?.timestamp);
    if (typeof timestamp === "number") timestampByBlock.set(row.blockNumber, timestamp * 1_000);
  }

  return logs
    .map((log) =>
      parseSwapLog({
        log,
        token,
        tokenIndex,
        tokenDecimals: trackedDecimals,
        quoteDecimals,
        timestampByBlock,
        platform,
      }),
    )
    .filter((trade): trade is MarketTokenTrade => trade !== null);
}

async function fetchMetadata(key: string, token: MarketToken): Promise<MarketEnrichment | null> {
  const network = networkMap[token.chainId];
  if (!network) return null;

  const response = await fetchJson<AlchemyMetadataResponse>(
    `https://${network}.g.alchemy.com/v2/${encodeURIComponent(key)}`,
    {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `anyalpha-${token.tokenAddress}`,
        method: "alchemy_getTokenMetadata",
        params: [token.tokenAddress],
      }),
    },
    10_000,
  );

  if (response.error) throw new Error(response.error.message ?? "Alchemy metadata RPC error");
  if (!response.result) return null;

  return {
    provider: "alchemy",
    status: "live",
    label: "Alchemy",
    detail: "EVM token metadata from Token API.",
    value: response.result.decimals !== undefined ? `${response.result.decimals} decimals` : undefined,
    updatedAt: new Date().toISOString(),
    chainId: token.chainId,
    tokenAddress: token.tokenAddress,
    name: response.result.name,
    symbol: response.result.symbol,
    imageUrl: response.result.logo,
  };
}

export async function fetchAlchemyEnrichments(tokens: MarketToken[]): Promise<ProviderBatchResult> {
  const key = env("ALCHEMY_API_KEY");
  const evmTokens = tokens.filter((token) => Boolean(networkMap[token.chainId]));

  if (!evmTokens.length) {
    return {
      enrichments: [],
      snapshot: {
        provider: "alchemy",
        status: "skipped",
        label: "Alchemy",
        detail: "No supported Alchemy EVM network rows in this batch.",
      },
    };
  }

  if (alchemyDisabled()) {
    return {
      enrichments: [],
      snapshot: {
        provider: "alchemy",
        status: "skipped",
        label: "Alchemy",
        detail: "Alchemy enrichment disabled. Infura RPC is used for EVM block and log calls where supported.",
      },
    };
  }

  if (!key) {
    return {
      enrichments: [],
      snapshot: {
        provider: "alchemy",
        status: "missing_key",
        label: "Alchemy",
        detail: "Set ALCHEMY_API_KEY for EVM price cross-checks and metadata.",
      },
    };
  }

  try {
    const priceRequests = chunk(evmTokens, 25).map((batch) =>
      fetchJson<AlchemyPriceResponse>(
        `https://api.g.alchemy.com/prices/v1/${encodeURIComponent(key)}/tokens/by-address`,
        {
          method: "POST",
          body: JSON.stringify({
            addresses: batch.map((token) => ({
              network: networkMap[token.chainId],
              address: token.tokenAddress,
            })),
          }),
        },
        12_000,
      ),
    );

    const priceResponses = await Promise.all(priceRequests);
    const priceEnrichments = priceResponses.flatMap((response) =>
      (response.data ?? [])
        .filter((row) => row.address && !row.error)
        .map((row): MarketEnrichment => {
          const usd = row.prices?.find((price) => price.currency === "usd" || price.currency === "USD");
          const token = evmTokens.find(
            (candidate) =>
              candidate.tokenAddress.toLowerCase() === row.address?.toLowerCase() &&
              networkMap[candidate.chainId] === row.network,
          );

          return {
            provider: "alchemy",
            status: "live",
            label: "Alchemy",
            detail: "EVM price cross-check from Prices API.",
            value: usd?.lastUpdatedAt ? `price ${new Date(usd.lastUpdatedAt).toLocaleTimeString("en-US")}` : undefined,
            updatedAt: usd?.lastUpdatedAt ?? new Date().toISOString(),
            chainId: token?.chainId ?? row.network ?? "",
            tokenAddress: row.address ?? "",
            priceUsd: numeric(usd?.value),
          };
        }),
    );

    const metadataLimit = Math.max(0, Math.min(20, Number(env("ALCHEMY_METADATA_LIMIT") ?? "8")));
    const metadata = await Promise.all(
      evmTokens.slice(0, metadataLimit).map((token) => fetchMetadata(key, token).catch(() => null)),
    );
    const enrichments = [...priceEnrichments, ...metadata.filter((item): item is MarketEnrichment => item !== null)];

    return {
      enrichments,
      snapshot: {
        provider: "alchemy",
        status: "live",
        label: "Alchemy",
        detail: "EVM price and metadata enrichment active.",
        value: `${priceEnrichments.length}/${evmTokens.length} price checks`,
        updatedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      enrichments: [],
      snapshot: {
        provider: "alchemy",
        status: "error",
        label: "Alchemy",
        detail: err instanceof Error ? err.message : "Alchemy enrichment failed.",
      },
    };
  }
}
