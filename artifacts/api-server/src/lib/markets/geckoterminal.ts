import type {
  MarketDetailResponse,
  MarketOhlcvCandle,
  MarketProviderSnapshot,
  MarketToken,
  MarketTokenTrade,
} from "./types";
import { fetchJson, mergeProviderSnapshot, numeric } from "./provider-utils";

const GECKOTERMINAL_BASE_URL = "https://api.geckoterminal.com/api/v2";
const OHLCV_CACHE_TTL_MS = 15_000;
const TRADES_CACHE_TTL_MS = 5_000;
const EMPTY_CACHE_TTL_MS = 3_000;

const geckoNetworks: Record<string, string[]> = {
  ethereum: ["eth"],
  base: ["base"],
  arbitrum: ["arbitrum"],
  bsc: ["bsc"],
  polygon: ["polygon_pos", "polygon"],
  avalanche: ["avax"],
  optimism: ["optimism"],
  solana: ["solana"],
  ton: ["ton"],
};

interface GeckoOhlcvResponse {
  data?: {
    attributes?: {
      ohlcv_list?: unknown[];
    };
  };
}

interface GeckoTradeRow {
  id?: string;
  attributes?: Record<string, unknown>;
}

interface GeckoTradesResponse {
  data?: GeckoTradeRow[];
}

const ohlcvCache = new Map<string, { value: MarketOhlcvCandle[]; expiresAt: number }>();
const tradesCache = new Map<string, { value: MarketTokenTrade[]; expiresAt: number }>();
const pendingOhlcv = new Map<string, Promise<MarketOhlcvCandle[]>>();
const pendingTrades = new Map<string, Promise<MarketTokenTrade[]>>();

function providerSnapshot(status: MarketProviderSnapshot["status"], value?: string, detail?: string): MarketProviderSnapshot {
  return {
    provider: "geckoterminal",
    status,
    label: "GeckoTerminal",
    detail: detail ?? "Pool candles and recent on-chain trade prints.",
    value,
    updatedAt: new Date().toISOString(),
  };
}

function networkCandidates(chainId: string): string[] {
  return geckoNetworks[chainId.trim().toLowerCase()] ?? [];
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

function attrText(attrs: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = attrs[key];
    if (typeof value === "string" && value.trim()) return value;
  }

  return undefined;
}

function normalizeAddress(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : undefined;
}

function normalizeCandle(row: unknown): MarketOhlcvCandle | null {
  if (!Array.isArray(row)) return null;

  const [time, open, high, low, close, volume] = row;
  const t = toMillis(time);
  const o = numeric(open);
  const h = numeric(high);
  const l = numeric(low);
  const c = numeric(close);

  if (!t || o === undefined || h === undefined || l === undefined || c === undefined) return null;

  return {
    t,
    o,
    h,
    l,
    c,
    v: numeric(volume),
  };
}

function normalizeOhlcv(response: GeckoOhlcvResponse): MarketOhlcvCandle[] {
  const rows = response.data?.attributes?.ohlcv_list ?? [];
  const byTime = new Map<number, MarketOhlcvCandle>();

  for (const row of rows) {
    const candle = normalizeCandle(row);
    if (candle) byTime.set(candle.t, candle);
  }

  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

function normalizeTrade(row: GeckoTradeRow, tokenAddress: string, pairAddress: string): MarketTokenTrade | null {
  const attrs = row.attributes;
  if (!attrs) return null;

  const txHash = attrText(attrs, ["tx_hash", "transaction_hash", "transactionHash"]);
  const id = row.id ?? txHash;
  if (!id) return null;

  const normalizedToken = tokenAddress.toLowerCase();
  const fromTokenAddress = normalizeAddress(attrs.from_token_address ?? attrs.fromTokenAddress);
  const toTokenAddress = normalizeAddress(attrs.to_token_address ?? attrs.toTokenAddress);
  const rawKind = attrText(attrs, ["kind", "type", "trade_type"])?.toLowerCase();
  const tokenIsTo = toTokenAddress === normalizedToken;
  const tokenIsFrom = fromTokenAddress === normalizedToken;
  const type = rawKind?.includes("buy") ? "buy" : rawKind?.includes("sell") ? "sell" : tokenIsTo ? "buy" : tokenIsFrom ? "sell" : "trade";
  const tokenAmount = tokenIsFrom
    ? numeric(attrs.from_token_amount ?? attrs.fromTokenAmount)
    : tokenIsTo
      ? numeric(attrs.to_token_amount ?? attrs.toTokenAmount)
      : numeric(attrs.to_token_amount ?? attrs.toTokenAmount ?? attrs.from_token_amount ?? attrs.fromTokenAmount);
  const quoteAmount = tokenIsFrom
    ? numeric(attrs.to_token_amount ?? attrs.toTokenAmount)
    : tokenIsTo
      ? numeric(attrs.from_token_amount ?? attrs.fromTokenAmount)
      : undefined;
  const tokenPrice = tokenIsFrom
    ? numeric(attrs.price_from_in_usd ?? attrs.priceFromInUsd)
    : tokenIsTo
      ? numeric(attrs.price_to_in_usd ?? attrs.priceToInUsd)
      : numeric(attrs.price_to_in_usd ?? attrs.priceToInUsd ?? attrs.price_from_in_usd ?? attrs.priceFromInUsd);
  const volumeUsd = numeric(attrs.volume_in_usd ?? attrs.volumeUsd ?? attrs.volume_usd);

  return {
    id: String(id),
    type,
    operation: rawKind,
    baseTokenAmount: tokenAmount,
    baseTokenAmountUsd: volumeUsd,
    quoteTokenAmount: quoteAmount,
    quoteTokenAmountUsd: volumeUsd,
    timestamp: toMillis(attrs.block_timestamp ?? attrs.timestamp ?? attrs.time),
    transactionHash: txHash,
    marketAddress: pairAddress,
    makerAddress: attrText(attrs, ["tx_from_address", "from_address", "sender"]),
    senderAddress: attrText(attrs, ["tx_to_address", "to_address"]),
    priceUsd: tokenPrice,
    labels: [],
    platform: {
      id: "geckoterminal",
      name: "GeckoTerminal",
    },
  };
}

async function cached<T>(
  cache: Map<string, { value: T; expiresAt: number }>,
  pending: Map<string, Promise<T>>,
  key: string,
  empty: (value: T) => boolean,
  load: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const cachedValue = cache.get(key);
  if (cachedValue && cachedValue.expiresAt > now) return cachedValue.value;

  const pendingValue = pending.get(key);
  if (pendingValue) return pendingValue;

  const promise = load()
    .then((value) => {
      cache.set(key, {
        value,
        expiresAt: Date.now() + (empty(value) ? EMPTY_CACHE_TTL_MS : key.startsWith("ohlcv") ? OHLCV_CACHE_TTL_MS : TRADES_CACHE_TTL_MS),
      });
      return value;
    })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, promise);
  return promise;
}

export async function fetchGeckoTerminalPoolOhlcv(
  chainId: string,
  pairAddress: string,
  limit = 240,
): Promise<MarketOhlcvCandle[]> {
  const networks = networkCandidates(chainId);
  if (!networks.length || !pairAddress) return [];

  const key = `ohlcv:${chainId.toLowerCase()}:${pairAddress.toLowerCase()}:${limit}`;
  return cached(ohlcvCache, pendingOhlcv, key, (value) => value.length === 0, async () => {
    for (const network of networks) {
      try {
        const params = new URLSearchParams({
          aggregate: "1",
          limit: String(Math.max(2, Math.min(1000, Math.round(limit)))),
          currency: "usd",
        });
        const response = await fetchJson<GeckoOhlcvResponse>(
          `${GECKOTERMINAL_BASE_URL}/networks/${encodeURIComponent(network)}/pools/${encodeURIComponent(pairAddress)}/ohlcv/minute?${params.toString()}`,
          {},
          12_000,
        );
        const candles = normalizeOhlcv(response);
        if (candles.length > 0) return candles;
      } catch {
        // Try the next GeckoTerminal network alias.
      }
    }

    return [];
  });
}

export async function fetchGeckoTerminalPoolTrades(
  chainId: string,
  pairAddress: string,
  tokenAddress: string,
  limit = 60,
): Promise<MarketTokenTrade[]> {
  const networks = networkCandidates(chainId);
  if (!networks.length || !pairAddress || !tokenAddress) return [];

  const key = `trades:${chainId.toLowerCase()}:${pairAddress.toLowerCase()}:${tokenAddress.toLowerCase()}:${limit}`;
  return cached(tradesCache, pendingTrades, key, (value) => value.length === 0, async () => {
    for (const network of networks) {
      try {
        const params = new URLSearchParams({
          limit: String(Math.max(1, Math.min(300, Math.round(limit)))),
        });
        const response = await fetchJson<GeckoTradesResponse>(
          `${GECKOTERMINAL_BASE_URL}/networks/${encodeURIComponent(network)}/pools/${encodeURIComponent(pairAddress)}/trades?${params.toString()}`,
          {},
          12_000,
        );
        const trades = (response.data ?? [])
          .map((row) => normalizeTrade(row, tokenAddress, pairAddress))
          .filter((trade): trade is MarketTokenTrade => trade !== null);
        if (trades.length > 0) return trades;
      } catch {
        // Try the next GeckoTerminal network alias.
      }
    }

    return [];
  });
}

export async function fillMarketDetailWithGeckoTerminal(detail: MarketDetailResponse): Promise<MarketDetailResponse> {
  const token = detail.token;
  const pairAddress = token.pairAddress;
  const needsOhlcv = detail.ohlcv.length === 0;
  const needsTrades = detail.trades.length === 0;

  if (!pairAddress || (!needsOhlcv && !needsTrades)) return detail;

  const [ohlcv, trades] = await Promise.all([
    needsOhlcv ? fetchGeckoTerminalPoolOhlcv(token.chainId, pairAddress) : Promise.resolve(detail.ohlcv),
    needsTrades ? fetchGeckoTerminalPoolTrades(token.chainId, pairAddress, token.tokenAddress) : Promise.resolve(detail.trades),
  ]);
  const addedOhlcv = needsOhlcv && ohlcv.length > 0;
  const addedTrades = needsTrades && trades.length > 0;

  if (!addedOhlcv && !addedTrades) return detail;

  const provider = providerSnapshot(
    "live",
    [addedOhlcv ? `${ohlcv.length} candles` : null, addedTrades ? `${trades.length} trades` : null]
      .filter(Boolean)
      .join(" / "),
  );
  const providers = mergeProviderSnapshot(detail.providers, provider);
  const tokenProviders = mergeProviderSnapshot(token.providers, provider);
  const pairs = detail.pairs.map((pair) =>
    pair.id === token.id
      ? {
          ...pair,
          providers: tokenProviders,
        }
      : pair,
  );

  return {
    ...detail,
    token: {
      ...token,
      providers: tokenProviders,
    },
    pairs,
    ohlcv: addedOhlcv ? ohlcv : detail.ohlcv,
    trades: addedTrades ? trades : detail.trades,
    providers,
  };
}
