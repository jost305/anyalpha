import type {
  MarketDetailResponse,
  MarketOhlcvCandle,
  MarketProviderSnapshot,
  MarketToken,
  MarketTokenHolderPosition,
  MarketTokenTrade,
} from "./types";
import {
  boolish,
  env,
  fetchJson,
  mergeProviderSnapshot,
  numeric,
  type MarketEnrichment,
  type ProviderBatchResult,
} from "./provider-utils";

interface MoralisPrice {
  tokenAddress?: string;
  token_address?: string;
  tokenName?: string;
  tokenSymbol?: string;
  tokenLogo?: string;
  tokenDecimals?: string;
  usdPrice?: number;
  usdPriceFormatted?: string;
  usdPrice24hrPercentChange?: number;
  "24hrPercentChange"?: string;
  pairTotalLiquidityUsd?: string;
  possibleSpam?: boolean | string;
  verifiedContract?: boolean;
  exchangeName?: string;
}

interface MoralisOhlcvResponse {
  result?: Array<Record<string, unknown>>;
}

interface MoralisSwapsResponse {
  result?: Array<Record<string, unknown>>;
  exchangeName?: string;
  pairAddress?: string;
  baseToken?: {
    address?: string;
    symbol?: string;
  };
  quoteToken?: {
    address?: string;
    symbol?: string;
  };
}

interface MoralisTokenOwner {
  owner_address?: string;
  owner_address_label?: string;
  balance?: string;
  balance_formatted?: string;
  usd_value?: string | number;
  percentage_relative_to_total_supply?: string | number;
  is_contract?: boolean;
  entity?: string;
  entity_logo?: string;
}

interface MoralisTokenOwnersResponse {
  result?: MoralisTokenOwner[];
  total_supply?: string;
}

interface MoralisWalletToken {
  token_address?: string;
  symbol?: string;
  name?: string;
  logo?: string;
  thumbnail?: string;
  decimals?: number | string;
  balance?: string;
  possible_spam?: boolean;
  verified_contract?: boolean;
  balance_formatted?: string;
  usd_price?: number;
  usd_price_24hr_percent_change?: number;
  usd_value?: number;
}

interface MoralisWalletTokensResponse {
  result?: MoralisWalletToken[];
  cursor?: string;
}

const chainMap: Record<string, string> = {
  ethereum: "eth",
  base: "base",
  arbitrum: "arbitrum",
  bsc: "bsc",
  polygon: "polygon",
  avalanche: "avalanche",
  optimism: "optimism",
};

const ohlcvCache = new Map<string, { value: MarketOhlcvCandle[]; expiresAt: number }>();
const swapsCache = new Map<string, { value: MarketTokenTrade[]; expiresAt: number }>();
const holdersCache = new Map<string, { value: MarketTokenHolderPosition[]; expiresAt: number }>();
const pendingOhlcv = new Map<string, Promise<MarketOhlcvCandle[]>>();
const pendingSwaps = new Map<string, Promise<MarketTokenTrade[]>>();
const pendingHolders = new Map<string, Promise<MarketTokenHolderPosition[]>>();
const OHLCV_CACHE_TTL_MS = 15_000;
const SWAPS_CACHE_TTL_MS = 5_000;
const HOLDERS_CACHE_TTL_MS = 30_000;
const EMPTY_CACHE_TTL_MS = 3_000;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function providerSnapshot(value: string): MarketProviderSnapshot {
  return {
    provider: "moralis",
    status: "live",
    label: "Moralis",
    detail: "Pair candles and swap transactions from Moralis pair APIs.",
    value,
    updatedAt: new Date().toISOString(),
  };
}

function toMillis(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1_000 : value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsedNumber = Number(value);
    if (Number.isFinite(parsedNumber)) return toMillis(parsedNumber);

    const parsedDate = Date.parse(value);
    if (Number.isFinite(parsedDate)) return parsedDate;
  }

  return undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function address(value: unknown): string | undefined {
  return text(value)?.toLowerCase();
}

function normalizeOhlcvRow(row: Record<string, unknown>): MarketOhlcvCandle | null {
  const t = toMillis(row.timestamp ?? row.date ?? row.time);
  const o = numeric(row.open);
  const h = numeric(row.high);
  const l = numeric(row.low);
  const c = numeric(row.close);

  if (!t || o === undefined || h === undefined || l === undefined || c === undefined) return null;

  return {
    t,
    o,
    h,
    l,
    c,
    v: numeric(row.volume),
  };
}

function normalizeOhlcv(response: MoralisOhlcvResponse): MarketOhlcvCandle[] {
  const candles = new Map<number, MarketOhlcvCandle>();

  for (const row of response.result ?? []) {
    const candle = normalizeOhlcvRow(row);
    if (candle) candles.set(candle.t, candle);
  }

  return [...candles.values()].sort((left, right) => left.t - right.t);
}

function normalizeSwap(
  row: Record<string, unknown>,
  response: MoralisSwapsResponse,
  tokenAddress: string,
  pairAddress: string,
): MarketTokenTrade | null {
  const transactionHash = text(row.transactionHash ?? row.transaction_hash);
  if (!transactionHash) return null;

  const baseAddress = address(response.baseToken?.address);
  const quoteAddress = address(response.quoteToken?.address);
  const normalizedToken = tokenAddress.toLowerCase();
  const selectedIsQuote = quoteAddress === normalizedToken && baseAddress !== normalizedToken;
  const rawType = text(row.transactionType ?? row.transaction_type)?.toLowerCase();
  const type =
    selectedIsQuote && rawType === "buy"
      ? "sell"
      : selectedIsQuote && rawType === "sell"
        ? "buy"
        : rawType === "buy" || rawType === "sell"
          ? rawType
          : "trade";
  const tokenAmount = selectedIsQuote ? numeric(row.quoteTokenAmount) : numeric(row.baseTokenAmount);
  const quoteAmount = selectedIsQuote ? numeric(row.baseTokenAmount) : numeric(row.quoteTokenAmount);
  const priceUsd = selectedIsQuote ? numeric(row.quoteTokenPriceUsd) : numeric(row.baseTokenPriceUsd);
  const totalValueUsd = numeric(row.totalValueUsd);
  const operation = text(row.subCategory ?? row.transactionType);

  return {
    id: `${transactionHash}:${text(row.transactionIndex) ?? "0"}`,
    type,
    operation,
    baseTokenAmount: tokenAmount,
    baseTokenAmountUsd: totalValueUsd,
    quoteTokenAmount: quoteAmount,
    quoteTokenAmountUsd: totalValueUsd,
    timestamp: toMillis(row.blockTimestamp ?? row.timestamp),
    transactionHash,
    marketAddress: pairAddress,
    makerAddress: text(row.walletAddress),
    senderAddress: text(row.walletAddress),
    priceUsd,
    labels: [],
    platform: {
      id: "moralis",
      name: response.exchangeName ?? "Moralis",
    },
  };
}

function normalizeTokenOwner(owner: MoralisTokenOwner): MarketTokenHolderPosition | null {
  const walletAddress = text(owner.owner_address);
  if (!walletAddress) return null;

  const labels = [
    text(owner.owner_address_label),
    owner.is_contract ? "contract" : undefined,
  ].filter((label): label is string => Boolean(label));
  const entity = text(owner.entity);

  return {
    walletAddress,
    tokenAmount: numeric(owner.balance_formatted),
    tokenAmountUsd: numeric(owner.usd_value),
    percentageOfTotalSupply: numeric(owner.percentage_relative_to_total_supply),
    labels,
    walletMetadata: entity
      ? {
          entityName: entity,
          entityLogo: text(owner.entity_logo),
          entityType: owner.is_contract ? "contract" : undefined,
          entityLabels: labels,
        }
      : undefined,
    platform: {
      id: "moralis",
      name: "Moralis",
    },
  };
}

async function cached<T>(
  cache: Map<string, { value: T; expiresAt: number }>,
  pending: Map<string, Promise<T>>,
  key: string,
  empty: (value: T) => boolean,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const cachedValue = cache.get(key);
  if (cachedValue && cachedValue.expiresAt > Date.now()) return cachedValue.value;

  const pendingValue = pending.get(key);
  if (pendingValue) return pendingValue;

  const promise = load()
    .then((value) => {
      cache.set(key, {
        value,
        expiresAt: Date.now() + (empty(value) ? EMPTY_CACHE_TTL_MS : ttlMs),
      });
      return value;
    })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, promise);
  return promise;
}

export async function fetchMoralisHolderPositions(
  token: MarketToken,
  limit = 40,
): Promise<MarketTokenHolderPosition[]> {
  const key = env("MORALIS_API_KEY");
  const chain = chainMap[token.chainId.toLowerCase()];
  if (!key || !chain || !token.tokenAddress) return [];

  const boundedLimit = Math.max(1, Math.min(100, Math.round(limit)));
  const cacheKey = `moralis-holders:${chain}:${token.tokenAddress.toLowerCase()}:${boundedLimit}`;

  return cached(holdersCache, pendingHolders, cacheKey, (value) => value.length === 0, HOLDERS_CACHE_TTL_MS, async () => {
    try {
      const params = new URLSearchParams({
        chain,
        order: "DESC",
        limit: String(boundedLimit),
      });
      const response = await fetchJson<MoralisTokenOwnersResponse>(
        `https://deep-index.moralis.io/api/v2.2/erc20/${encodeURIComponent(token.tokenAddress)}/owners?${params.toString()}`,
        {
          headers: {
            "x-api-key": key,
          },
        },
        14_000,
      );

      return (response.result ?? [])
        .map(normalizeTokenOwner)
        .filter((holder): holder is MarketTokenHolderPosition => holder !== null);
    } catch {
      return [];
    }
  });
}

export async function fetchMoralisPairOhlcv(
  chainId: string,
  pairAddress: string,
  limit = 240,
): Promise<MarketOhlcvCandle[]> {
  const key = env("MORALIS_API_KEY");
  const chain = chainMap[chainId.toLowerCase()];
  if (!key || !chain || !pairAddress) return [];

  const boundedLimit = Math.max(2, Math.min(300, Math.round(limit)));
  const cacheKey = `moralis-ohlcv:${chain}:${pairAddress.toLowerCase()}:${boundedLimit}`;

  return cached(ohlcvCache, pendingOhlcv, cacheKey, (value) => value.length === 0, OHLCV_CACHE_TTL_MS, async () => {
    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - boundedLimit * 60_000);
    const variants = [
      { from: "fromDate", to: "toDate" },
      { from: "from_date", to: "to_date" },
    ];

    for (const variant of variants) {
      try {
        const params = new URLSearchParams({
          chain,
          timeframe: "1min",
          currency: "usd",
          limit: String(boundedLimit),
          [variant.from]: fromDate.toISOString(),
          [variant.to]: toDate.toISOString(),
        });
        const response = await fetchJson<MoralisOhlcvResponse>(
          `https://deep-index.moralis.io/api/v2.2/pairs/${encodeURIComponent(pairAddress)}/ohlcv?${params.toString()}`,
          {
            headers: {
              "x-api-key": key,
            },
          },
          14_000,
        );
        const candles = normalizeOhlcv(response);
        if (candles.length > 0) return candles;
      } catch {
        // Try the alternate date parameter style used across Moralis docs/examples.
      }
    }

    return [];
  });
}

export async function fetchMoralisPairSwaps(
  chainId: string,
  pairAddress: string,
  tokenAddress: string,
  limit = 60,
): Promise<MarketTokenTrade[]> {
  const key = env("MORALIS_API_KEY");
  if (!key || !pairAddress || !tokenAddress) return [];

  const normalizedChainId = chainId.toLowerCase();
  const evmChain = chainMap[normalizedChainId];
  const isSolana = normalizedChainId === "solana";
  if (!evmChain && !isSolana) return [];

  const boundedLimit = Math.max(1, Math.min(100, Math.round(limit)));
  const cacheKey = `moralis-swaps:${normalizedChainId}:${pairAddress.toLowerCase()}:${tokenAddress.toLowerCase()}:${boundedLimit}`;

  return cached(swapsCache, pendingSwaps, cacheKey, (value) => value.length === 0, SWAPS_CACHE_TTL_MS, async () => {
    try {
      const params = new URLSearchParams({
        limit: String(boundedLimit),
        order: "DESC",
      });

      if (evmChain) {
        params.set("chain", evmChain);
        params.set("transactionTypes", "buy,sell");
      }

      const url = evmChain
        ? `https://deep-index.moralis.io/api/v2.2/pairs/${encodeURIComponent(pairAddress)}/swaps?${params.toString()}`
        : `https://solana-gateway.moralis.io/token/mainnet/pairs/${encodeURIComponent(pairAddress)}/swaps?${params.toString()}`;
      const response = await fetchJson<MoralisSwapsResponse>(
        url,
        {
          headers: {
            "x-api-key": key,
          },
        },
        14_000,
      );

      return (response.result ?? [])
        .map((row) => normalizeSwap(row, response, tokenAddress, pairAddress))
        .filter((trade): trade is MarketTokenTrade => trade !== null);
    } catch {
      return [];
    }
  });
}

export async function fillMarketDetailWithMoralis(detail: MarketDetailResponse): Promise<MarketDetailResponse> {
  const token = detail.token;
  const needsOhlcv = detail.ohlcv.length === 0;
  const needsTrades = detail.trades.length === 0;

  if (!token.pairAddress || (!needsOhlcv && !needsTrades)) return detail;

  const [ohlcv, trades] = await Promise.all([
    needsOhlcv ? fetchMoralisPairOhlcv(token.chainId, token.pairAddress) : Promise.resolve(detail.ohlcv),
    needsTrades ? fetchMoralisPairSwaps(token.chainId, token.pairAddress, token.tokenAddress) : Promise.resolve(detail.trades),
  ]);
  const addedOhlcv = needsOhlcv && ohlcv.length > 0;
  const addedTrades = needsTrades && trades.length > 0;

  if (!addedOhlcv && !addedTrades) return detail;

  const snapshot = providerSnapshot(
    [addedOhlcv ? `${ohlcv.length} candles` : null, addedTrades ? `${trades.length} swaps` : null]
      .filter(Boolean)
      .join(" / "),
  );
  const providers = mergeProviderSnapshot(detail.providers, snapshot);
  const tokenProviders = mergeProviderSnapshot(token.providers, snapshot);

  return {
    ...detail,
    token: {
      ...token,
      providers: tokenProviders,
    },
    pairs: detail.pairs.map((pair) =>
      pair.id === token.id
        ? {
            ...pair,
            providers: tokenProviders,
          }
        : pair,
    ),
    ohlcv: addedOhlcv ? ohlcv : detail.ohlcv,
    trades: addedTrades ? trades : detail.trades,
    providers,
  };
}

export async function fetchMoralisEnrichments(tokens: MarketToken[]): Promise<ProviderBatchResult> {
  const key = env("MORALIS_API_KEY");
  const evmTokens = tokens.filter((token) => Boolean(chainMap[token.chainId]));

  if (!evmTokens.length) {
    return {
      enrichments: [],
      snapshot: {
        provider: "moralis",
        status: "skipped",
        label: "Moralis",
        detail: "No supported EVM rows in this batch.",
      },
    };
  }

  if (!key) {
    return {
      enrichments: [],
      snapshot: {
        provider: "moralis",
        status: "missing_key",
        label: "Moralis",
        detail: "Set MORALIS_API_KEY for EVM price, liquidity, verified-contract, and spam checks.",
      },
    };
  }

  try {
    const requests: Array<Promise<MarketEnrichment[]>> = [];
    const grouped = new Map<string, MarketToken[]>();

    for (const token of evmTokens) {
      const chain = chainMap[token.chainId];
      const group = grouped.get(chain) ?? [];
      group.push(token);
      grouped.set(chain, group);
    }

    for (const [chain, group] of grouped) {
      for (const batch of chunk(group, 30)) {
        requests.push(
          fetchJson<MoralisPrice[]>(
            `https://deep-index.moralis.io/api/v2.2/erc20/prices?chain=${encodeURIComponent(chain)}`,
            {
              method: "POST",
              headers: {
                "x-api-key": key,
              },
              body: JSON.stringify({
                tokens: batch.map((token) => ({ token_address: token.tokenAddress })),
              }),
            },
            14_000,
          ).then((prices) =>
            (Array.isArray(prices) ? prices : []).map((price, index): MarketEnrichment => {
              const tokenAddress = price.tokenAddress ?? price.token_address ?? batch[index]?.tokenAddress ?? "";
              const possibleSpam = boolish(price.possibleSpam);

              return {
                provider: "moralis",
                status: "live",
                label: "Moralis",
                detail: "EVM token price, liquidity, metadata, verified-contract, and spam signals.",
                value: price.exchangeName,
                updatedAt: new Date().toISOString(),
                chainId: group[0]?.chainId ?? chain,
                tokenAddress,
                name: price.tokenName,
                symbol: price.tokenSymbol,
                imageUrl: price.tokenLogo,
                priceUsd: numeric(price.usdPrice ?? price.usdPriceFormatted),
                liquidityUsd: numeric(price.pairTotalLiquidityUsd),
                priceChange24h: numeric(price.usdPrice24hrPercentChange ?? price["24hrPercentChange"]),
                verifiedContract: price.verifiedContract,
                possibleSpam,
                riskFlags: [
                  ...(possibleSpam ? ["Moralis possible spam"] : []),
                  ...(price.verifiedContract === false ? ["Unverified contract"] : []),
                ],
              };
            }),
          ),
        );
      }
    }

    const enrichments = (await Promise.all(requests)).flat();

    return {
      enrichments,
      snapshot: {
        provider: "moralis",
        status: "live",
        label: "Moralis",
        detail: "EVM token enrichment active.",
        value: `${enrichments.length}/${evmTokens.length} enriched`,
        updatedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      enrichments: [],
      snapshot: {
        provider: "moralis",
        status: "error",
        label: "Moralis",
        detail: err instanceof Error ? err.message : "Moralis enrichment failed.",
      },
    };
  }
}

export async function fetchMoralisWalletTokens(chainId: string, walletAddress: string) {
  const apiKey = env("MORALIS_API_KEY");
  if (!apiKey) throw new Error("Moralis API key is not configured.");

  const moralisChain = chainMap[chainId];
  if (!moralisChain) throw new Error(`Unsupported Moralis chain: ${chainId}`);

  const response = await fetchJson<MoralisWalletTokensResponse>(
    `https://deep-index.moralis.io/api/v2.2/wallets/${walletAddress}/tokens?chain=${moralisChain}&exclude_spam=true&exclude_unverified_contracts=true`,
    {
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
      },
    },
  );

  if (!response?.result) return [];

  return response.result
    .map((item) => {
      const addressString = item.token_address?.toLowerCase();
      if (!addressString) return null;

      const balanceNum = numeric(item.balance_formatted) ?? 0;
      if (balanceNum <= 0) return null;

      return {
        chainId,
        tokenAddress: addressString,
        symbol: item.symbol ?? "Unknown",
        name: item.name ?? "Unknown Token",
        decimals: Number(item.decimals ?? 18),
        balance: balanceNum,
        logoUrl: item.logo ?? item.thumbnail,
        priceUsd: item.usd_price,
        valueUsd: item.usd_value,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}
