import type {
  MarketDetailResponse,
  MarketOhlcvCandle,
  MarketToken,
  MarketTokenHolderPosition,
  MarketTokenLink,
  MarketTokenTrade,
  MarketTxnStats,
} from "./types";
import {
  anyAlphaTokenUrl,
  env,
  fetchJson,
  numeric,
  uniqueLinks,
  type MarketEnrichment,
  type ProviderBatchResult,
} from "./provider-utils";

interface MobulaTokenDetails {
  address?: string;
  chainId?: string;
  blockchain?: string;
  symbol?: string;
  name?: string;
  logo?: string;
  originLogoUrl?: string;
  description?: string;
  priceTokenString?: string;
  priceToken?: number | string;
  approximateReserveUSD?: number | string;
  approximateReserveToken?: number | string;
  totalSupply?: number | string;
  circulatingSupply?: number | string;
  priceUSD?: number;
  marketCapUSD?: number;
  marketCapDilutedUSD?: number;
  liquidityUSD?: number;
  liquidityMaxUSD?: number;
  volume24hUSD?: number;
  volume5minUSD?: number;
  volume1hUSD?: number;
  volume6hUSD?: number;
  volumeBuy5minUSD?: number;
  volumeSell5minUSD?: number;
  volumeBuy24hUSD?: number;
  volumeSell24hUSD?: number;
  trades5min?: number;
  trades1h?: number;
  trades6h?: number;
  trades24h?: number;
  buys5min?: number;
  buys1h?: number;
  buys6h?: number;
  buys24h?: number;
  sells5min?: number;
  sells1h?: number;
  sells6h?: number;
  sells24h?: number;
  priceChange5minPercentage?: number;
  priceChange1hPercentage?: number;
  priceChange6hPercentage?: number;
  priceChange24hPercentage?: number;
  poolPriceChange5minPercentage?: number;
  poolPriceChange1hPercentage?: number;
  poolPriceChange6hPercentage?: number;
  poolPriceChange24hPercentage?: number;
  holdersCount?: number;
  top10HoldingsPercentage?: number;
  devHoldingsPercentage?: number;
  insidersHoldingsPercentage?: number;
  bundlersHoldingsPercentage?: number;
  snipersHoldingsPercentage?: number;
  proTradersHoldingsPercentage?: number;
  freshTradersHoldingsPercentage?: number;
  smartTradersHoldingsPercentage?: number;
  insidersCount?: number;
  bundlersCount?: number;
  snipersCount?: number;
  freshTradersCount?: number;
  proTradersCount?: number;
  smartTradersCount?: number;
  liquidityBurnPercentage?: number;
  bonded?: boolean;
  bondingPercentage?: number;
  bondingCurveAddress?: string;
  poolAddress?: string;
  source?: string;
  sourceMetadata?: {
    name?: string;
    logo?: string;
    url?: string;
  };
  exchange?: {
    name?: string;
    logo?: string;
  };
  factory?: string;
  deployer?: string;
  createdAt?: string | number;
  bondedAt?: string | number;
  latestTradeDate?: string | number;
  athUSD?: number;
  atlUSD?: number;
  socials?: {
    twitter?: string;
    website?: string;
    telegram?: string;
    others?: Record<string, string>;
    uri?: string;
  };
  security?: {
    buyTax?: string;
    sellTax?: string;
    isHoneypot?: boolean;
    isBlacklisted?: boolean;
    transferPausable?: boolean;
    renounced?: boolean;
    isMintable?: boolean;
    noMintAuthority?: boolean;
    liquidityBurnPercentage?: number;
    lowLiquidity?: string;
    top10Holders?: string;
  };
}

interface MobulaSingleResponse {
  payload?: MobulaTokenDetails;
  data?: MobulaTokenDetails | MobulaTokenDetails[];
}

interface MobulaTradePlatform {
  id?: string;
  name?: string;
  logo?: string;
}

interface MobulaTrade {
  id?: string;
  operation?: string;
  type?: string;
  baseTokenAmount?: number | string;
  baseTokenAmountUSD?: number | string;
  quoteTokenAmount?: number | string;
  quoteTokenAmountUSD?: number | string;
  date?: number | string;
  swapSenderAddress?: string;
  transactionSenderAddress?: string;
  transactionHash?: string;
  marketAddress?: string;
  baseTokenPriceUSD?: number | string;
  baseTokenMarketCapUSD?: number | string;
  labels?: string[];
  platform?: MobulaTradePlatform;
}

interface MobulaTradesResponse {
  data?: MobulaTrade[];
}

interface MobulaWalletMetadata {
  entityName?: string;
  entityLogo?: string;
  entityType?: string;
  entityLabels?: string[];
  entityTwitter?: string;
  entityWebsite?: string;
  entityTelegram?: string;
  entityGithub?: string;
  entityDiscord?: string;
}

interface MobulaHolderPosition {
  walletAddress?: string;
  tokenAmount?: number | string;
  tokenAmountUSD?: number | string;
  percentageOfTotalSupply?: number | string;
  realizedPnlUSD?: number | string;
  unrealizedPnlUSD?: number | string;
  totalPnlUSD?: number | string;
  buys?: number;
  sells?: number;
  avgBuyPriceUSD?: number | string;
  avgSellPriceUSD?: number | string;
  firstTradeAt?: number | string;
  lastTradeAt?: number | string;
  lastActivityAt?: number | string;
  labels?: string[];
  walletMetadata?: MobulaWalletMetadata;
  platform?: MobulaTradePlatform;
}

interface MobulaHolderPositionsResponse {
  data?: MobulaHolderPosition[];
  totalCount?: number;
}

interface MobulaOhlcvResponse {
  data?: unknown;
}

export interface MobulaHolderPositionsResult {
  holders: MarketTokenHolderPosition[];
  totalCount?: number;
}

const mobulaChain: Record<string, string> = {
  solana: "solana",
  ethereum: "ethereum",
  base: "base",
  arbitrum: "arbitrum",
  bsc: "bnb",
  polygon: "polygon",
  avalanche: "avalanche",
  optimism: "optimism",
  ton: "ton",
  monad: "monad",
  "evm:1": "ethereum",
  "evm:10": "optimism",
  "evm:56": "bnb",
  "evm:137": "polygon",
  "evm:143": "monad",
  "evm:8453": "base",
  "evm:42161": "arbitrum",
  "evm:43114": "avalanche",
  "solana:solana": "solana",
  "ton:mainnet": "ton",
};

const appChainToMobulaChainId: Record<string, string> = {
  solana: "solana:solana",
  ethereum: "evm:1",
  base: "evm:8453",
  arbitrum: "evm:42161",
  bsc: "evm:56",
  polygon: "evm:137",
  avalanche: "evm:43114",
  optimism: "evm:10",
  ton: "ton:mainnet",
  monad: "evm:143",
};

const appChainLabels: Record<string, string> = {
  solana: "Solana",
  ethereum: "Ethereum",
  base: "Base",
  arbitrum: "Arbitrum",
  bsc: "BSC",
  polygon: "Polygon",
  avalanche: "Avalanche",
  optimism: "Optimism",
  ton: "TON",
  monad: "Monad",
};

const appChainNativeSymbols: Record<string, string> = {
  solana: "SOL",
  ethereum: "ETH",
  base: "ETH",
  arbitrum: "ETH",
  bsc: "BNB",
  polygon: "POL",
  avalanche: "AVAX",
  optimism: "ETH",
  ton: "TON",
  monad: "MON",
};

const OHLCV_CACHE_TTL_MS = 15_000;
const EMPTY_OHLCV_CACHE_TTL_MS = 3_000;
const ohlcvCache = new Map<string, { candles: MarketOhlcvCandle[]; expiresAt: number }>();
const pendingOhlcv = new Map<string, Promise<MarketOhlcvCandle[]>>();

function toMillis(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1_000 : value;
  }

  if (typeof value === "string" && value.trim()) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) return toMillis(numericValue);

    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

export function mobulaBlockchainForChainId(chainId: string): string | null {
  return mobulaChain[chainId.toLowerCase()] ?? null;
}

function baseUrl(): string {
  return env("MOBULA_API_BASE_URL") ?? (env("MOBULA_API_KEY") ? "https://api.mobula.io" : "https://demo-api.mobula.io");
}

function headers(): Record<string, string> {
  const key = env("MOBULA_API_KEY");
  return key ? { authorization: key } : {};
}

function providerSnapshot(value?: string): MarketToken["providers"][number] {
  return {
    provider: "mobula",
    status: env("MOBULA_API_KEY") ? "live" : "demo",
    label: "Mobula",
    detail: "Token details, bonding stats, candles, trades, holder positions, and security.",
    value,
    updatedAt: new Date().toISOString(),
  };
}

function appChainFromMobula(value: string | undefined, fallback: string): string {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback.toLowerCase();

  if (normalized === "bnb" || normalized === "bsc" || normalized.includes("binance")) return "bsc";
  if (normalized === "mainnet" || normalized === "ton:mainnet") return "ton";
  if (normalized === "solana" || normalized === "solana:solana") return "solana";
  if (normalized === "optimistic") return "optimism";
  if (normalized.startsWith("evm:")) {
    const byId = Object.entries(appChainToMobulaChainId).find(([, id]) => id === normalized);
    if (byId) return byId[0];
  }

  return appChainLabels[normalized] ? normalized : fallback.toLowerCase();
}

function mobulaChainIdForOhlcv(chainId: string): string {
  const normalized = chainId.toLowerCase();
  return appChainToMobulaChainId[normalized] ?? chainId;
}

function sourceName(details: MobulaTokenDetails): string {
  return details.sourceMetadata?.name ?? details.exchange?.name ?? details.source ?? "Mobula";
}

function sourceSlug(details: MobulaTokenDetails): string {
  return sourceName(details)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "mobula";
}

function marketTokenUrl(_details: MobulaTokenDetails, chainId: string, tokenAddress: string): string {
  return anyAlphaTokenUrl(chainId, tokenAddress);
}

function asDetail(response: MobulaSingleResponse): MobulaTokenDetails | null {
  if (response.data && !Array.isArray(response.data)) return response.data;
  if (response.payload) return response.payload;
  return null;
}

function socialLinks(details: MobulaTokenDetails): MarketTokenLink[] {
  const links: MarketTokenLink[] = [];
  if (details.socials?.website) links.push({ type: "website", url: details.socials.website });
  if (details.socials?.twitter) links.push({ type: "twitter", url: details.socials.twitter });
  if (details.socials?.telegram) links.push({ type: "telegram", url: details.socials.telegram });
  if (details.socials?.uri) links.push({ label: "metadata", url: details.socials.uri });
  Object.entries(details.socials?.others ?? {}).forEach(([label, url]) => {
    if (typeof url === "string" && url.trim()) links.push({ label, url });
  });
  if (details.sourceMetadata?.url) links.push({ type: "launchpad", label: sourceName(details), url: details.sourceMetadata.url });
  return uniqueLinks(links);
}

function riskFlags(details: MobulaTokenDetails): string[] {
  const flags: string[] = [];
  const security = details.security;

  if (security?.isHoneypot) flags.push("Mobula honeypot flag");
  if (security?.isBlacklisted) flags.push("Blacklist risk");
  if (security?.transferPausable) flags.push("Transfers pausable");
  if (security?.isMintable) flags.push("Mintable supply");
  if (security?.lowLiquidity) flags.push("Mobula low liquidity");

  const liquidity = numeric(details.liquidityUSD);
  if (liquidity !== undefined && liquidity < 10_000) flags.push("Thin liquidity");
  if (details.bonded === false) flags.push("Bonding curve");

  return flags;
}

function inferNarratives(details: MobulaTokenDetails): string[] {
  const text = `${details.name ?? ""} ${details.symbol ?? ""} ${details.description ?? ""}`.toLowerCase();
  const tags = new Set<string>();

  if (/\b(ai|agent|gpt|bot|oracle|autonomous)\b/.test(text)) tags.add("AI");
  if (/\b(meme|doge|pepe|pump|bonk|cto|mascot)\b/.test(text)) tags.add("Meme");
  if (/\b(game|gaming|casino|play|quest)\b/.test(text)) tags.add("Gaming");
  if (/\b(rwa|asset|treasury|bond)\b/.test(text)) tags.add("RWA");
  if (details.bonded === false || details.bondingPercentage !== undefined) tags.add("Launchpad");

  return [...tags].slice(0, 4);
}

function detailSignalScore(details: MobulaTokenDetails): number {
  const liquidity = numeric(details.liquidityUSD) ?? 0;
  const volume = numeric(details.volume24hUSD) ?? 0;
  const holders = numeric(details.holdersCount) ?? 0;
  const change = numeric(details.priceChange24hPercentage ?? details.poolPriceChange24hPercentage) ?? 0;
  const bonding = numeric(details.bondingPercentage) ?? 0;

  let score = 28;
  if (liquidity >= 500_000) score += 16;
  else if (liquidity >= 100_000) score += 11;
  else if (liquidity >= 10_000) score += 6;
  else if (liquidity > 0) score -= 6;
  if (volume >= 1_000_000) score += 14;
  else if (volume >= 100_000) score += 8;
  else if (volume >= 10_000) score += 4;
  if (holders >= 1_000) score += 12;
  else if (holders >= 100) score += 7;
  else if (holders >= 10) score += 3;
  if (change >= 50) score += 10;
  else if (change >= 10) score += 5;
  else if (change < -25) score -= 7;
  if (bonding >= 60 && bonding < 100) score += 6;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function asPercent(value: unknown): number | undefined {
  const n = numeric(value);
  if (n === undefined) return undefined;
  return Math.abs(n) <= 1 ? n * 100 : n;
}

function periodTxns(buys?: unknown, sells?: unknown, total?: unknown): MarketTxnStats {
  const buyCount = Math.max(0, Math.round(numeric(buys) ?? 0));
  const sellCount = Math.max(0, Math.round(numeric(sells) ?? 0));
  const totalCount = Math.max(0, Math.round(numeric(total) ?? 0));

  if (buyCount || sellCount || !totalCount) {
    return {
      buys: buyCount,
      sells: sellCount,
    };
  }

  return {
    buys: totalCount,
    sells: 0,
  };
}

function ageMinutesFrom(timestamp?: number): number | undefined {
  if (!timestamp) return undefined;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
}

function normalizeMobulaTokenDetail(
  details: MobulaTokenDetails,
  requestedChainId: string,
  requestedTokenAddress: string,
): MarketToken | null {
  const tokenAddress = details.address ?? requestedTokenAddress;
  const chainId = appChainFromMobula(details.blockchain ?? details.chainId, requestedChainId);
  const pairAddress = details.poolAddress ?? details.bondingCurveAddress ?? tokenAddress;
  const symbol = details.symbol;
  const name = details.name ?? symbol;

  if (!tokenAddress || !symbol || !name) return null;

  const holderCount = numeric(details.holdersCount);
  const top10HolderPct = asPercent(details.top10HoldingsPercentage ?? details.security?.top10Holders);
  const liquidityBurnPct = asPercent(details.liquidityBurnPercentage ?? details.security?.liquidityBurnPercentage);
  const pairCreatedAt = toMillis(details.createdAt ?? details.bondedAt);
  const links = socialLinks(details);
  const providers = [providerSnapshot(holderCount ? `${holderCount.toLocaleString()} holders` : undefined)];

  return {
    id: `${chainId}:${tokenAddress}:${pairAddress}`,
    chainId,
    chainLabel: appChainLabels[chainId] ?? chainId.toUpperCase(),
    dexId: sourceSlug(details),
    url: marketTokenUrl(details, chainId, tokenAddress),
    pairAddress,
    tokenAddress,
    name,
    symbol,
    quoteSymbol: appChainNativeSymbols[chainId] ?? appChainLabels[chainId] ?? "",
    priceUsd: numeric(details.priceUSD),
    priceNative:
      typeof details.priceTokenString === "string"
        ? details.priceTokenString
        : numeric(details.priceToken)?.toString(),
    marketCap: numeric(details.marketCapUSD),
    fdv: numeric(details.marketCapDilutedUSD),
    liquidityUsd: numeric(details.liquidityUSD ?? details.approximateReserveUSD ?? details.liquidityMaxUSD),
    volume: {
      m5: numeric(details.volume5minUSD),
      h1: numeric(details.volume1hUSD),
      h6: numeric(details.volume6hUSD),
      h24: numeric(details.volume24hUSD),
    },
    priceChange: {
      m5: numeric(details.poolPriceChange5minPercentage ?? details.priceChange5minPercentage),
      h1: numeric(details.poolPriceChange1hPercentage ?? details.priceChange1hPercentage),
      h6: numeric(details.poolPriceChange6hPercentage ?? details.priceChange6hPercentage),
      h24: numeric(details.poolPriceChange24hPercentage ?? details.priceChange24hPercentage),
    },
    txns: {
      m5: periodTxns(details.buys5min, details.sells5min, details.trades5min),
      h1: periodTxns(details.buys1h, details.sells1h, details.trades1h),
      h6: periodTxns(details.buys6h, details.sells6h, details.trades6h),
      h24: periodTxns(details.buys24h, details.sells24h, details.trades24h),
    },
    pairCreatedAt,
    ageMinutes: ageMinutesFrom(pairCreatedAt),
    imageUrl: details.logo ?? details.originLogoUrl ?? details.sourceMetadata?.logo ?? details.exchange?.logo,
    description: details.description,
    links,
    narrativeTags: inferNarratives(details),
    riskFlags: riskFlags(details),
    signalScore: detailSignalScore(details),
    providers,
    security: {
      holderCount,
      top10HolderPct,
      buyTax: details.security?.buyTax,
      sellTax: details.security?.sellTax,
      liquidityBurnPct,
      mintAuthorityDisabled: details.security?.noMintAuthority,
      renounced: details.security?.renounced,
    },
    profileUpdatedAt:
      typeof details.latestTradeDate === "string" ? details.latestTradeDate : undefined,
    openGraph: details.sourceMetadata?.logo ?? details.logo ?? details.originLogoUrl,
  };
}

function normalize(details: MobulaTokenDetails): MarketEnrichment | null {
  const tokenAddress = details.address;
  const chainId = details.blockchain ?? details.chainId;

  if (!tokenAddress || !chainId) return null;

  const holderCount = numeric(details.holdersCount);
  const top10HolderPct = numeric(details.top10HoldingsPercentage ?? details.security?.top10Holders);
  const liquidityBurnPct = numeric(details.liquidityBurnPercentage ?? details.security?.liquidityBurnPercentage);

  return {
    provider: "mobula",
    status: env("MOBULA_API_KEY") ? "live" : "demo",
    label: "Mobula",
    detail: "Token details, holders, security, and market metadata.",
    value: holderCount ? `${holderCount.toLocaleString()} holders` : undefined,
    updatedAt: new Date().toISOString(),
    chainId,
    tokenAddress,
    name: details.name,
    symbol: details.symbol,
    description: details.description,
    imageUrl: details.logo ?? details.originLogoUrl,
    links: socialLinks(details),
    priceUsd: numeric(details.priceUSD),
    marketCap: numeric(details.marketCapUSD),
    fdv: numeric(details.marketCapDilutedUSD),
    liquidityUsd: numeric(details.liquidityUSD),
    volume24h: numeric(details.volume24hUSD),
    priceChange24h: numeric(details.priceChange24hPercentage),
    holderCount,
    top10HolderPct,
    buyTax: details.security?.buyTax,
    sellTax: details.security?.sellTax,
    liquidityBurnPct,
    mintAuthorityDisabled: details.security?.noMintAuthority,
    renounced: details.security?.renounced,
    riskFlags: riskFlags(details),
  };
}

function normalizeTrade(trade: MobulaTrade): MarketTokenTrade | null {
  if (!trade.id) return null;

  return {
    id: trade.id,
    type: trade.type ?? "trade",
    operation: trade.operation,
    baseTokenAmount: numeric(trade.baseTokenAmount),
    baseTokenAmountUsd: numeric(trade.baseTokenAmountUSD),
    quoteTokenAmount: numeric(trade.quoteTokenAmount),
    quoteTokenAmountUsd: numeric(trade.quoteTokenAmountUSD),
    timestamp: toMillis(trade.date),
    transactionHash: trade.transactionHash,
    marketAddress: trade.marketAddress,
    makerAddress: trade.swapSenderAddress,
    senderAddress: trade.transactionSenderAddress,
    priceUsd: numeric(trade.baseTokenPriceUSD),
    marketCapUsd: numeric(trade.baseTokenMarketCapUSD),
    labels: stringArray(trade.labels),
    platform: trade.platform,
  };
}

function normalizeHolderPosition(position: MobulaHolderPosition): MarketTokenHolderPosition | null {
  if (!position.walletAddress) return null;

  return {
    walletAddress: position.walletAddress,
    tokenAmount: numeric(position.tokenAmount),
    tokenAmountUsd: numeric(position.tokenAmountUSD),
    percentageOfTotalSupply: numeric(position.percentageOfTotalSupply),
    realizedPnlUsd: numeric(position.realizedPnlUSD),
    unrealizedPnlUsd: numeric(position.unrealizedPnlUSD),
    totalPnlUsd: numeric(position.totalPnlUSD),
    buys: position.buys,
    sells: position.sells,
    avgBuyPriceUsd: numeric(position.avgBuyPriceUSD),
    avgSellPriceUsd: numeric(position.avgSellPriceUSD),
    firstTradeAt: toMillis(position.firstTradeAt),
    lastTradeAt: toMillis(position.lastTradeAt),
    lastActivityAt: toMillis(position.lastActivityAt),
    labels: stringArray(position.labels),
    walletMetadata: position.walletMetadata
      ? {
          entityName: position.walletMetadata.entityName,
          entityLogo: position.walletMetadata.entityLogo,
          entityType: position.walletMetadata.entityType,
          entityLabels: stringArray(position.walletMetadata.entityLabels),
          entityTwitter: position.walletMetadata.entityTwitter,
          entityWebsite: position.walletMetadata.entityWebsite,
          entityTelegram: position.walletMetadata.entityTelegram,
          entityGithub: position.walletMetadata.entityGithub,
          entityDiscord: position.walletMetadata.entityDiscord,
        }
      : undefined,
    platform: position.platform,
  };
}

function readObjectNumber(row: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = numeric(row[key]);
    if (value !== undefined) return value;
  }

  return undefined;
}

function normalizeOhlcvCandle(row: unknown): MarketOhlcvCandle | null {
  if (Array.isArray(row)) {
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

  if (!row || typeof row !== "object") return null;

  const item = row as Record<string, unknown>;
  const t = toMillis(item.t ?? item.time ?? item.timestamp ?? item.date);
  const o = readObjectNumber(item, ["o", "open"]);
  const h = readObjectNumber(item, ["h", "high"]);
  const l = readObjectNumber(item, ["l", "low"]);
  const c = readObjectNumber(item, ["c", "close", "price"]);

  if (!t || o === undefined || h === undefined || l === undefined || c === undefined) return null;

  return {
    t,
    o,
    h,
    l,
    c,
    v: readObjectNumber(item, ["v", "volume", "volumeUsd", "volumeUSD"]),
  };
}

function ohlcvRows(response: MobulaOhlcvResponse): unknown[] {
  const data = response.data;
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];

  const item = data as Record<string, unknown>;
  if (Array.isArray(item.candles)) return item.candles;
  if (Array.isArray(item.ohlcv)) return item.ohlcv;
  if (Array.isArray(item.history)) return item.history;
  if (Array.isArray(item.items)) return item.items;

  return [];
}

function normalizeOhlcvResponse(response: MobulaOhlcvResponse): MarketOhlcvCandle[] {
  const byTime = new Map<number, MarketOhlcvCandle>();

  for (const row of ohlcvRows(response)) {
    const candle = normalizeOhlcvCandle(row);
    if (candle) byTime.set(candle.t, candle);
  }

  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

async function cachedOhlcv(key: string, load: () => Promise<MarketOhlcvCandle[]>): Promise<MarketOhlcvCandle[]> {
  const now = Date.now();
  const cached = ohlcvCache.get(key);
  if (cached && cached.expiresAt > now) return cached.candles;

  const pending = pendingOhlcv.get(key);
  if (pending) return pending;

  const promise = load()
    .then((candles) => {
      ohlcvCache.set(key, {
        candles,
        expiresAt: Date.now() + (candles.length > 0 ? OHLCV_CACHE_TTL_MS : EMPTY_OHLCV_CACHE_TTL_MS),
      });
      return candles;
    })
    .finally(() => {
      pendingOhlcv.delete(key);
    });

  pendingOhlcv.set(key, promise);
  return promise;
}

async function fetchOhlcvEndpoint(
  endpoint: "token" | "market",
  chainId: string,
  address: string,
  period: string,
  amount: number,
): Promise<MarketOhlcvCandle[]> {
  const normalizedAmount = Math.max(2, Math.min(500, Math.round(amount)));
  const chainIds = [...new Set([mobulaChainIdForOhlcv(chainId), mobulaBlockchainForChainId(chainId)].filter(Boolean))] as string[];

  for (const chain of chainIds) {
    try {
      const params = new URLSearchParams({
        chainId: chain,
        address,
        period,
        amount: String(normalizedAmount),
      });
      const response = await fetchJson<MobulaOhlcvResponse>(
        `${baseUrl()}/api/2/${endpoint}/ohlcv-history?${params.toString()}`,
        {
          headers: headers(),
        },
        14_000,
      );
      const candles = normalizeOhlcvResponse(response);
      if (candles.length > 0) return candles;
    } catch {
      // Try the next accepted Mobula chain-id shape before giving up.
    }
  }

  return [];
}

export async function fetchMobulaTokenDetail(
  chainId: string,
  tokenAddress: string,
): Promise<MarketToken | null> {
  const blockchain = mobulaBlockchainForChainId(chainId);
  if (!blockchain) return null;

  try {
    const params = new URLSearchParams({
      blockchain,
      address: tokenAddress,
    });
    const response = await fetchJson<MobulaSingleResponse>(
      `${baseUrl()}/api/2/token/details?${params.toString()}`,
      {
        headers: headers(),
      },
      14_000,
    );

    return normalizeMobulaTokenDetail(asDetail(response) ?? {}, chainId, tokenAddress);
  } catch {
    return null;
  }
}

export async function fetchMobulaTokenOhlcv(
  chainId: string,
  tokenAddress: string,
  period = "1m",
  amount = 240,
): Promise<MarketOhlcvCandle[]> {
  const blockchain = mobulaBlockchainForChainId(chainId);
  if (!blockchain) return [];

  const key = `token:${chainId.toLowerCase()}:${tokenAddress.toLowerCase()}:${period}:${amount}`;
  return cachedOhlcv(key, () => fetchOhlcvEndpoint("token", chainId, tokenAddress, period, amount));
}

export async function fetchMobulaMarketOhlcv(
  chainId: string,
  marketAddress: string,
  period = "1m",
  amount = 240,
): Promise<MarketOhlcvCandle[]> {
  const blockchain = mobulaBlockchainForChainId(chainId);
  if (!blockchain) return [];

  const key = `market:${chainId.toLowerCase()}:${marketAddress.toLowerCase()}:${period}:${amount}`;
  return cachedOhlcv(key, () => fetchOhlcvEndpoint("market", chainId, marketAddress, period, amount));
}

export async function fetchMobulaBestOhlcv(
  chainId: string,
  tokenAddress: string,
  marketAddress?: string,
  period = "1m",
  amount = 240,
): Promise<MarketOhlcvCandle[]> {
  if (marketAddress) {
    const marketCandles = await fetchMobulaMarketOhlcv(chainId, marketAddress, period, amount);
    if (marketCandles.length > 0) return marketCandles;
  }

  return fetchMobulaTokenOhlcv(chainId, tokenAddress, period, amount);
}

export async function getMobulaMarketDetail(
  chainId: string,
  tokenAddress: string,
): Promise<MarketDetailResponse | null> {
  const token = await fetchMobulaTokenDetail(chainId, tokenAddress);
  if (!token) return null;

  const [ohlcv, trades, holderPositions] = await Promise.all([
    fetchMobulaBestOhlcv(token.chainId, token.tokenAddress, token.pairAddress),
    fetchMobulaTokenTrades(token.chainId, token.tokenAddress, 48),
    fetchMobulaHolderPositions(token.chainId, token.tokenAddress, 40),
  ]);

  return {
    token,
    pairs: [token],
    ohlcv,
    trades,
    orders: [],
    holders: holderPositions.holders,
    holdersTotal: holderPositions.totalCount ?? token.security?.holderCount,
    source: "aggregated",
    updatedAt: new Date().toISOString(),
    providers: token.providers,
  };
}

export async function fetchMobulaTokenTrades(
  chainId: string,
  tokenAddress: string,
  limit = 18,
): Promise<MarketTokenTrade[]> {
  const blockchain = mobulaBlockchainForChainId(chainId);
  if (!blockchain) return [];

  try {
    const params = new URLSearchParams({
      blockchain,
      address: tokenAddress,
      mode: "asset",
      limit: String(Math.max(1, Math.min(80, limit))),
    });
    const response = await fetchJson<MobulaTradesResponse>(
      `${baseUrl()}/api/2/token/trades?${params.toString()}`,
      {
        headers: headers(),
      },
      14_000,
    );

    return (response.data ?? [])
      .map(normalizeTrade)
      .filter((trade): trade is MarketTokenTrade => trade !== null);
  } catch {
    return [];
  }
}

export async function fetchMobulaHolderPositions(
  chainId: string,
  tokenAddress: string,
  limit = 12,
): Promise<MobulaHolderPositionsResult> {
  const blockchain = mobulaBlockchainForChainId(chainId);
  if (!blockchain) {
    return {
      holders: [],
    };
  }

  try {
    const params = new URLSearchParams({
      blockchain,
      address: tokenAddress,
      limit: String(Math.max(1, Math.min(60, limit))),
      offset: "0",
    });
    const response = await fetchJson<MobulaHolderPositionsResponse>(
      `${baseUrl()}/api/2/token/holder-positions?${params.toString()}`,
      {
        headers: headers(),
      },
      14_000,
    );

    return {
      holders: (response.data ?? [])
        .map(normalizeHolderPosition)
        .filter((holder): holder is MarketTokenHolderPosition => holder !== null),
      totalCount: response.totalCount,
    };
  } catch {
    return {
      holders: [],
    };
  }
}

export async function fetchMobulaEnrichments(tokens: MarketToken[]): Promise<ProviderBatchResult> {
  const candidates = tokens
    .map((token) => ({
      blockchain: mobulaBlockchainForChainId(token.chainId) ?? undefined,
      address: token.tokenAddress,
    }))
    .filter((item): item is { blockchain: string; address: string } => Boolean(item.blockchain && item.address));

  if (!candidates.length) {
    return {
      enrichments: [],
      snapshot: {
        provider: "mobula",
        status: "skipped",
        label: "Mobula",
        detail: "No compatible chain rows in this batch.",
      },
    };
  }

  try {
    const targetCandidates = candidates.slice(0, 30);
    const results = await Promise.allSettled(
      targetCandidates.map(async (candidate) => {
        const params = new URLSearchParams({
          blockchain: candidate.blockchain,
          address: candidate.address,
        });
        const response = await fetchJson<MobulaSingleResponse>(
          `${baseUrl()}/api/2/token/details?${params.toString()}`,
          {
            headers: headers(),
          },
          14_000,
        );

        return normalize(asDetail(response) ?? {});
      }),
    );

    const enrichments = results
      .flatMap((result) => (result.status === "fulfilled" && result.value ? [result.value] : []))
      .filter((item): item is MarketEnrichment => item !== null);
    const firstError = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    const status = enrichments.length > 0 ? (env("MOBULA_API_KEY") ? "live" : "demo") : "error";

    return {
      enrichments,
      snapshot: {
        provider: "mobula",
        status,
        label: "Mobula",
        detail:
          status === "error"
            ? firstError?.reason instanceof Error
              ? firstError.reason.message
              : "Mobula token details enrichment failed."
            : env("MOBULA_API_KEY")
              ? "Production API key active for token detail enrichment."
              : "Using demo API until MOBULA_API_KEY is set.",
        value: `${enrichments.length}/${targetCandidates.length} enriched`,
        updatedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      enrichments: [],
      snapshot: {
        provider: "mobula",
        status: "error",
        label: "Mobula",
        detail: err instanceof Error ? err.message : "Mobula enrichment failed.",
      },
    };
  }
}
