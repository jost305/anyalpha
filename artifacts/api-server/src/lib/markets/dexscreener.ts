import type {
  MarketDetailResponse,
  MarketListResponse,
  MarketOhlcvCandle,
  MarketSignal,
  MarketSignalsResponse,
  MarketToken,
  MarketTokenHolderPosition,
  MarketTokenLink,
  MarketTokenOrder,
  MarketTokenTrade,
  MarketTxnStats,
} from "./types";
import { enrichMarkets } from "./enrichment";
import { fillMarketDetailWithGeckoTerminal } from "./geckoterminal";
import { getMobulaGlobalAggregates } from "./mobula-global";
import {
  fetchMobulaBestOhlcv,
  fetchMobulaHolderPositions,
  fetchMobulaTokenTrades,
  getMobulaMarketDetail,
} from "./mobula";
import { fetchMoralisHolderPositions, fillMarketDetailWithMoralis } from "./moralis";
import { getLaunchpadMarketDetailFallback } from "./launchpad-pulse";
import { DEX_PROVIDER, anyAlphaTokenUrl, withDexProvider } from "./provider-utils";
import { fetchSolanaHolderPositions, fetchSolanaRecentPoolTrades, type SolanaHolderPositionsResult } from "./helius";
import { fetchAlchemyPoolTrades } from "./alchemy";
import { fetchBlockscoutHolderPositions } from "./blockscout";
import { attachBundleAnalysesToTokens } from "../bundle-detection/store";
import { scheduleBundleAnalysisForMarkets } from "../bundle-detection/live-analyzer";
import { scheduleBundleExitMonitor } from "../bundle-detection/exit-monitor";
import { snapshotHolderPnlFromDetail } from "../bundle-detection/holder-pnl";
import { cacheNumberEnv, cachedJson, writeCachedJson } from "../cache/redis-cache";

const DEXSCREENER_BASE_URL = "https://api.dexscreener.com";
const DEFAULT_LIMIT = 100;
const MAX_LIST_LIMIT = 100;
const MAX_BATCH_SIZE = 30;
const SEARCH_CONCURRENCY = 3;
const MARKET_UNIVERSE_CACHE_TTL_MS = 120_000;
const DETAIL_LAST_GOOD_TTL_MS = 120_000;

interface DexToken {
  address?: string;
  name?: string;
  symbol?: string;
}

interface DexPairStats {
  m5?: number;
  h1?: number;
  h6?: number;
  h24?: number;
}

interface DexTxnBucket {
  buys?: number;
  sells?: number;
}

interface DexOrder {
  type?: string;
  status?: string;
  paymentTimestamp?: number;
  createdAt?: number;
  date?: string;
}

interface DexPair {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: DexToken;
  quoteToken?: DexToken;
  priceNative?: string;
  priceUsd?: string;
  txns?: Record<string, DexTxnBucket>;
  volume?: DexPairStats;
  priceChange?: DexPairStats;
  liquidity?: {
    usd?: number;
  };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    openGraph?: string;
    websites?: MarketTokenLink[];
    socials?: MarketTokenLink[];
  };
}

interface DexProfile {
  url?: string;
  chainId?: string;
  tokenAddress?: string;
  icon?: string;
  header?: string;
  openGraph?: string;
  description?: string;
  links?: MarketTokenLink[];
  totalAmount?: number;
  amount?: number;
  updatedAt?: string;
}

interface DexSearchResponse {
  pairs?: DexPair[];
}

interface Candidate {
  chainId: string;
  tokenAddress: string;
  profile?: DexProfile;
  boostAmount?: number;
}

interface SearchSeed {
  term: string;
  chainId: string;
}

export interface MarketQuery {
  chain?: string;
  q?: string;
  sort?: "trending" | "new" | "gainers" | "volume" | "m5" | "h1" | "h6" | "h24";
  limit?: number;
  all?: boolean;
  enrich?: boolean;
}

const LISTING_SEARCH_SEEDS: SearchSeed[] = [
  { term: "raydium", chainId: "solana" },
  { term: "uniswap", chainId: "ethereum" },
  { term: "aerodrome", chainId: "base" },
  { term: "camelot", chainId: "arbitrum" },
  { term: "pancakeswap", chainId: "bsc" },
  { term: "polygon", chainId: "polygon" },
  { term: "optimism", chainId: "optimism" },
  { term: "trader joe", chainId: "avalanche" },
  { term: "stonfi", chainId: "ton" },
];

let cachedMarketUniverse:
  | {
      markets: MarketToken[];
      updatedAt: number;
    }
  | null = null;
let pendingMarketUniverse: Promise<MarketToken[]> | null = null;
const detailLastGoodCache = new Map<string, { detail: MarketDetailResponse; expiresAt: number }>();

function marketListCacheTtlMs(query: MarketQuery): number {
  if (query.q?.trim()) return cacheNumberEnv("MARKET_SEARCH_CACHE_TTL_MS", 15_000, 1_000, 120_000);
  if (query.enrich === false) return cacheNumberEnv("MARKET_LIST_LIGHT_CACHE_TTL_MS", 20_000, 1_000, 120_000);
  return cacheNumberEnv("MARKET_LIST_CACHE_TTL_MS", 12_000, 1_000, 120_000);
}

function marketListStaleTtlMs(query: MarketQuery): number {
  if (query.q?.trim()) return cacheNumberEnv("MARKET_SEARCH_STALE_CACHE_TTL_MS", 120_000, 5_000, 600_000);
  if (query.enrich === false) return cacheNumberEnv("MARKET_LIST_LIGHT_STALE_CACHE_TTL_MS", 300_000, 5_000, 900_000);
  return cacheNumberEnv("MARKET_LIST_STALE_CACHE_TTL_MS", 180_000, 5_000, 900_000);
}

function marketDetailCacheTtlMs(): number {
  return cacheNumberEnv("MARKET_DETAIL_CACHE_TTL_MS", 6_000, 1_000, 60_000);
}

function marketDetailStaleTtlMs(): number {
  return cacheNumberEnv("MARKET_DETAIL_STALE_CACHE_TTL_MS", 120_000, 10_000, 600_000);
}

function detailProviderTimeoutMs(): number {
  return cacheNumberEnv("MARKET_DETAIL_PROVIDER_TIMEOUT_MS", 1_800, 750, 20_000);
}

function dexScreenerTimeoutMs(): number {
  return cacheNumberEnv("DEXSCREENER_TIMEOUT_MS", 6_000, 1_000, 20_000);
}

function stableJson(value: Record<string, unknown>): string {
  return JSON.stringify(
    Object.entries(value)
      .filter(([, item]) => item !== undefined && item !== "")
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function marketListCacheKey(query: MarketQuery): string {
  return `markets:list:${stableJson({
    all: query.all === true,
    chain: query.chain?.trim().toLowerCase() || "all",
    enrich: query.enrich !== false,
    limit: query.limit ?? DEFAULT_LIMIT,
    q: query.q?.trim().toLowerCase(),
    sort: query.sort ?? "trending",
  })}`;
}

function marketDetailCacheKey(chainId: string, tokenAddress: string): string {
  return `markets:detail:${chainId.trim().toLowerCase()}:${tokenAddress.trim().toLowerCase()}`;
}

async function withDetailBudget<T>(load: Promise<T>, fallback: T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => resolve(fallback), detailProviderTimeoutMs());
  });

  try {
    return await Promise.race([load.catch(() => fallback), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

const chainLabels: Record<string, string> = {
  solana: "Solana",
  ethereum: "Ethereum",
  base: "Base",
  arbitrum: "Arbitrum",
  bsc: "BSC",
  polygon: "Polygon",
  avalanche: "Avalanche",
  optimism: "Optimism",
  ton: "TON",
  robinhood: "Robinhood",
};

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && Array.isArray((value as { value?: unknown }).value)) {
    return (value as { value: T[] }).value;
  }
  return [];
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${DEXSCREENER_BASE_URL}${path}`, {
    headers: {
      accept: "application/json",
      "user-agent": "AnyAlphaTerminal/0.1",
    },
    signal: AbortSignal.timeout(dexScreenerTimeoutMs()),
  });

  if (!response.ok) {
    throw new Error(`DexScreener request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

function timestampMillis(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }

  if (typeof value === "string" && value.trim()) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) return timestampMillis(numericValue);
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return undefined;
}

function normalizeDexOrder(order: DexOrder, index: number): MarketTokenOrder {
  const paymentTimestamp = timestampMillis(order.paymentTimestamp);
  const createdAt = timestampMillis(order.createdAt ?? order.date);

  return {
    id: `dex-order-${order.type ?? "order"}-${order.status ?? "unknown"}-${paymentTimestamp ?? createdAt ?? index}`,
    type: order.type,
    status: order.status,
    paymentTimestamp,
    createdAt,
    source: "dexscreener",
  };
}

async function fetchDexOrders(chainId: string, tokenAddress: string): Promise<MarketTokenOrder[]> {
  return fetchJson<unknown>(`/orders/v1/${encodeURIComponent(chainId)}/${encodeURIComponent(tokenAddress)}`)
    .then((rows) => asArray<DexOrder>(rows).map(normalizeDexOrder))
    .catch(() => []);
}

function numberFromString(value?: string): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function txnsFor(pair: DexPair): MarketToken["txns"] {
  const read = (key: string): MarketTxnStats => ({
    buys: pair.txns?.[key]?.buys ?? 0,
    sells: pair.txns?.[key]?.sells ?? 0,
  });

  return {
    m5: read("m5"),
    h1: read("h1"),
    h6: read("h6"),
    h24: read("h24"),
  };
}

function ageMinutes(pairCreatedAt?: number): number | undefined {
  if (!pairCreatedAt) return undefined;
  return Math.max(0, Math.floor((Date.now() - pairCreatedAt) / 60_000));
}

function chainLabel(chainId: string): string {
  return chainLabels[chainId] ?? chainId.toUpperCase();
}

function pairToken(pair: DexPair, candidate?: Candidate): DexToken | undefined {
  const expected = candidate?.tokenAddress.toLowerCase();
  if (!expected) return pair.baseToken;

  if (pair.baseToken?.address?.toLowerCase() === expected) return pair.baseToken;
  if (pair.quoteToken?.address?.toLowerCase() === expected) return pair.quoteToken;
  return pair.baseToken;
}

function profileLinks(pair: DexPair, profile?: DexProfile): MarketTokenLink[] {
  const links = [
    ...(profile?.links ?? []),
    ...(pair.info?.websites ?? []),
    ...(pair.info?.socials ?? []),
  ].filter((link): link is MarketTokenLink => Boolean(link?.url));

  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}

function inferNarratives(token: DexToken | undefined, description?: string): string[] {
  const text = `${token?.name ?? ""} ${token?.symbol ?? ""} ${description ?? ""}`.toLowerCase();
  const tags = new Set<string>();

  if (/\b(ai|agent|gpt|bot|oracle|autonomous)\b/.test(text)) tags.add("AI");
  if (/\b(meme|doge|pepe|pump|cto|mascot)\b/.test(text)) tags.add("Meme");
  if (/\b(rwa|asset|commodity|treasury|bond)\b/.test(text)) tags.add("RWA");
  if (/\b(game|gaming|casino|play|leaderboard)\b/.test(text)) tags.add("Gaming");
  if (/\b(trump|maga|election|government|political)\b/.test(text)) tags.add("Political");
  if (/\b(dex|swap|liquidity|yield|defi)\b/.test(text)) tags.add("DeFi");

  return [...tags].slice(0, 4);
}

function riskFlags(pair: DexPair, links: MarketTokenLink[]): string[] {
  const flags: string[] = [];
  const liquidity = pair.liquidity?.usd ?? 0;
  const created = ageMinutes(pair.pairCreatedAt);
  const change24h = pair.priceChange?.h24;

  if (liquidity > 0 && liquidity < 25_000) flags.push("Thin liquidity");
  if (typeof created === "number" && created < 60) flags.push("New pair");
  if (typeof change24h === "number" && change24h < -35) flags.push("Sharp drawdown");
  if (links.length === 0) flags.push("No public links");

  return flags;
}

function signalScore(pair: DexPair, boostAmount?: number): number {
  const liquidity = pair.liquidity?.usd ?? 0;
  const volume = pair.volume?.h24 ?? 0;
  const change = pair.priceChange?.h24 ?? 0;
  const txns = (pair.txns?.h24?.buys ?? 0) + (pair.txns?.h24?.sells ?? 0);
  const created = ageMinutes(pair.pairCreatedAt);

  let score = 30;
  if (liquidity >= 500_000) score += 18;
  else if (liquidity >= 100_000) score += 12;
  else if (liquidity >= 25_000) score += 7;
  else if (liquidity > 0) score -= 6;

  if (volume >= 2_000_000) score += 16;
  else if (volume >= 500_000) score += 10;
  else if (volume >= 100_000) score += 5;

  if (change >= 100) score += 14;
  else if (change >= 30) score += 9;
  else if (change >= 10) score += 5;
  else if (change <= -25) score -= 8;

  if (txns >= 2_000) score += 8;
  else if (txns >= 500) score += 5;
  else if (txns >= 100) score += 2;

  if (typeof created === "number" && created < 24 * 60) score += 5;
  if (boostAmount) score += Math.min(10, Math.round(boostAmount / 100));

  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizePair(pair: DexPair, candidate?: Candidate): MarketToken | null {
  const chainId = pair.chainId;
  const token = pairToken(pair, candidate);
  const pairAddress = pair.pairAddress;

  if (!chainId || !token?.address || !token.symbol || !pairAddress) {
    return null;
  }

  const links = profileLinks(pair, candidate?.profile);
  const description = candidate?.profile?.description;
  const imageUrl = pair.info?.imageUrl ?? candidate?.profile?.icon;
  const boostAmount = candidate?.boostAmount ?? candidate?.profile?.totalAmount ?? candidate?.profile?.amount;
  const score = signalScore(pair, boostAmount);

  return {
    id: `${chainId}:${token.address}:${pairAddress}`,
    chainId,
    chainLabel: chainLabel(chainId),
    dexId: pair.dexId ?? "unknown",
    url: anyAlphaTokenUrl(chainId, token.address),
    pairAddress,
    tokenAddress: token.address,
    name: token.name ?? token.symbol,
    symbol: token.symbol,
    quoteSymbol: pair.quoteToken?.symbol ?? "",
    priceUsd: numberFromString(pair.priceUsd),
    priceNative: pair.priceNative,
    marketCap: pair.marketCap,
    fdv: pair.fdv,
    liquidityUsd: pair.liquidity?.usd,
    volume: pair.volume ?? {},
    priceChange: pair.priceChange ?? {},
    txns: txnsFor(pair),
    pairCreatedAt: pair.pairCreatedAt,
    ageMinutes: ageMinutes(pair.pairCreatedAt),
    imageUrl,
    openGraph: pair.info?.openGraph ?? candidate?.profile?.openGraph,
    description,
    links,
    boostAmount,
    profileUpdatedAt: candidate?.profile?.updatedAt,
    narrativeTags: inferNarratives(token, description),
    riskFlags: riskFlags(pair, links),
    signalScore: score,
    providers: [],
  };
}

function dedupeMarkets(markets: MarketToken[]): MarketToken[] {
  const byPair = new Map<string, MarketToken>();

  for (const market of markets) {
    const existing = byPair.get(market.id);
    if (!existing || market.signalScore > existing.signalScore) {
      byPair.set(market.id, market);
    }
  }

  return [...byPair.values()];
}

function aggregateUniverse(markets: MarketToken[]): MarketListResponse["aggregates"] {
  const uniqueTokens = new Map<string, number>();
  let volume24hUsd = 0;
  let txns24h = 0;

  for (const market of markets) {
    volume24hUsd += market.volume.h24 ?? 0;
    txns24h += (market.txns.h24.buys ?? 0) + (market.txns.h24.sells ?? 0);

    const tokenKey = `${market.chainId}:${market.tokenAddress.toLowerCase()}`;
    const marketCapUsd = market.marketCap ?? market.fdv;

    if (typeof marketCapUsd !== "number" || !Number.isFinite(marketCapUsd)) {
      continue;
    }

    const existing = uniqueTokens.get(tokenKey) ?? 0;
    if (marketCapUsd > existing) {
      uniqueTokens.set(tokenKey, marketCapUsd);
    }
  }

  return {
    marketCapUsd: [...uniqueTokens.values()].reduce((sum, value) => sum + value, 0),
    volume24hUsd,
    txns24h,
    pairCount: markets.length,
    tokenCount: uniqueTokens.size,
  };
}

function sortMarkets(markets: MarketToken[], sort: MarketQuery["sort"] = "trending"): MarketToken[] {
  return [...markets].sort((a, b) => {
    if (sort === "new") return (b.pairCreatedAt ?? 0) - (a.pairCreatedAt ?? 0);
    if (sort === "m5") return (b.priceChange.m5 ?? -Infinity) - (a.priceChange.m5 ?? -Infinity);
    if (sort === "h1") return (b.priceChange.h1 ?? -Infinity) - (a.priceChange.h1 ?? -Infinity);
    if (sort === "h6") return (b.priceChange.h6 ?? -Infinity) - (a.priceChange.h6 ?? -Infinity);
    if (sort === "h24") return (b.priceChange.h24 ?? -Infinity) - (a.priceChange.h24 ?? -Infinity);
    if (sort === "gainers") return (b.priceChange.h24 ?? -Infinity) - (a.priceChange.h24 ?? -Infinity);
    if (sort === "volume") return (b.volume.h24 ?? 0) - (a.volume.h24 ?? 0);
    return b.signalScore - a.signalScore;
  });
}

function filterChain(markets: MarketToken[], chain?: string): MarketToken[] {
  if (!chain || chain === "all") return markets;
  return markets.filter((market) => market.chainId.toLowerCase() === chain.toLowerCase());
}

function diversifyMarkets(markets: MarketToken[]): MarketToken[] {
  const grouped = new Map<string, MarketToken[]>();

  for (const market of markets) {
    const group = grouped.get(market.chainId) ?? [];
    group.push(market);
    grouped.set(market.chainId, group);
  }

  const queues = [...grouped.values()];
  const diversified: MarketToken[] = [];
  let hasItems = true;

  while (hasItems) {
    hasItems = false;

    for (const queue of queues) {
      const next = queue.shift();
      if (!next) continue;

      diversified.push(next);
      hasItems = true;
    }
  }

  return diversified;
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency = SEARCH_CONCURRENCY,
): Promise<T[]> {
  if (tasks.length === 0) return [];

  const results = new Array<T>(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= tasks.length) return;
      results[currentIndex] = await tasks[currentIndex]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

async function fetchProfiles(): Promise<DexProfile[]> {
  const [profiles, boosts] = await Promise.all([
    fetchJson<unknown>("/token-profiles/latest/v1").then(asArray<DexProfile>).catch(() => []),
    fetchJson<unknown>("/token-boosts/top/v1").then(asArray<DexProfile>).catch(() => []),
  ]);

  return [...boosts, ...profiles];
}

function candidatesFromProfiles(profiles: DexProfile[]): Candidate[] {
  const candidates = new Map<string, Candidate>();

  for (const profile of profiles) {
    if (!profile.chainId || !profile.tokenAddress) continue;
    const key = `${profile.chainId}:${profile.tokenAddress.toLowerCase()}`;
    const existing = candidates.get(key);
    const boostAmount = profile.totalAmount ?? profile.amount;

    if (!existing) {
      candidates.set(key, {
        chainId: profile.chainId,
        tokenAddress: profile.tokenAddress,
        profile,
        boostAmount,
      });
      continue;
    }

    existing.profile = {
      ...profile,
      ...existing.profile,
      description: existing.profile?.description ?? profile.description,
      links: existing.profile?.links ?? profile.links,
    };
    existing.boostAmount = Math.max(existing.boostAmount ?? 0, boostAmount ?? 0);
  }

  return [...candidates.values()];
}

async function fetchPairsForCandidates(candidates: Candidate[]): Promise<MarketToken[]> {
  const byChain = new Map<string, Candidate[]>();

  for (const candidate of candidates) {
    const group = byChain.get(candidate.chainId) ?? [];
    group.push(candidate);
    byChain.set(candidate.chainId, group);
  }

  const requests: Array<Promise<MarketToken[]>> = [];

  for (const [chainId, chainCandidates] of byChain) {
    for (let i = 0; i < chainCandidates.length; i += MAX_BATCH_SIZE) {
      const batch = chainCandidates.slice(i, i + MAX_BATCH_SIZE);
      const addresses = batch.map((candidate) => candidate.tokenAddress).join(",");
      const candidateByAddress = new Map(batch.map((candidate) => [candidate.tokenAddress.toLowerCase(), candidate]));

      requests.push(
        fetchJson<DexPair[]>(`/tokens/v1/${encodeURIComponent(chainId)}/${encodeURIComponent(addresses)}`)
          .then((pairs) =>
            asArray<DexPair>(pairs)
              .map((pair) => {
                const address =
                  pair.baseToken?.address?.toLowerCase() ?? pair.quoteToken?.address?.toLowerCase() ?? "";
                return normalizePair(pair, candidateByAddress.get(address));
              })
              .filter((market): market is MarketToken => market !== null),
          )
          .catch(() => []),
      );
    }
  }

  return (await Promise.all(requests)).flat();
}

async function searchPairs(q: string, chainId?: string): Promise<MarketToken[]> {
  const response = await fetchJson<DexSearchResponse>(`/latest/dex/search?q=${encodeURIComponent(q)}`);
  const markets = (response.pairs ?? [])
    .map((pair) => normalizePair(pair))
    .filter((market): market is MarketToken => market !== null);

  if (!chainId) return markets;
  return markets.filter((market) => market.chainId.toLowerCase() === chainId.toLowerCase());
}

async function fetchTokenPairs(chainId: string, tokenAddress: string): Promise<MarketToken[]> {
  return fetchJson<DexPair[]>(
    `/tokens/v1/${encodeURIComponent(chainId)}/${encodeURIComponent(tokenAddress)}`,
  )
    .then((rows) =>
      asArray<DexPair>(rows)
        .map((pair) =>
          normalizePair(pair, {
            chainId,
            tokenAddress,
          }),
        )
        .filter((market): market is MarketToken => market !== null),
    )
    .catch(() => []);
}

async function fetchSeededSearchMarkets(): Promise<MarketToken[]> {
  const tasks = LISTING_SEARCH_SEEDS.map((seed) => () => searchPairs(seed.term, seed.chainId).catch(() => []));
  return (await runWithConcurrency(tasks)).flat();
}

async function fetchMarketUniverse(): Promise<MarketToken[]> {
  const [profileMarkets, seededMarkets] = await Promise.all([
    fetchProfiles().then(candidatesFromProfiles).then(fetchPairsForCandidates).catch(() => []),
    fetchSeededSearchMarkets(),
  ]);

  return dedupeMarkets([...profileMarkets, ...seededMarkets]);
}

async function getCachedMarketUniverse(): Promise<MarketToken[]> {
  const now = Date.now();

  if (cachedMarketUniverse && now - cachedMarketUniverse.updatedAt < MARKET_UNIVERSE_CACHE_TTL_MS) {
    return cachedMarketUniverse.markets;
  }

  if (pendingMarketUniverse) return pendingMarketUniverse;

  pendingMarketUniverse = cachedJson({
    key: "markets:universe",
    ttlMs: cacheNumberEnv("MARKET_UNIVERSE_CACHE_TTL_MS", MARKET_UNIVERSE_CACHE_TTL_MS, 5_000, 300_000),
    staleTtlMs: cacheNumberEnv("MARKET_UNIVERSE_STALE_CACHE_TTL_MS", 180_000, 30_000, 900_000),
    load: fetchMarketUniverse,
  })
    .then((markets) => {
      if (markets.length > 0) {
        cachedMarketUniverse = {
          markets,
          updatedAt: Date.now(),
        };
      }
      return markets;
    })
    .catch((error) => {
      if (cachedMarketUniverse) return cachedMarketUniverse.markets;
      throw error;
    })
    .finally(() => {
      pendingMarketUniverse = null;
    });

  return pendingMarketUniverse;
}

async function getMarketListingsFresh(query: MarketQuery = {}): Promise<MarketListResponse> {
  const fetchAll = query.all === true;
  const limit = fetchAll ? undefined : Math.max(1, Math.min(MAX_LIST_LIMIT, query.limit ?? DEFAULT_LIMIT));
  const normalizedChain = query.chain?.trim().toLowerCase();
  const searchQuery = query.q?.trim();
  const shouldEnrich = query.enrich ?? true;
  const rawMarkets = searchQuery
    ? await searchPairs(searchQuery, normalizedChain && normalizedChain !== "all" ? normalizedChain : undefined)
    : await getCachedMarketUniverse();

  const filteredMarkets = filterChain(dedupeMarkets(rawMarkets), normalizedChain);
  const sortedMarkets = sortMarkets(filteredMarkets, query.sort);
  const rankedMarkets =
    !searchQuery && (!normalizedChain || normalizedChain === "all") && query.sort === "trending"
      ? diversifyMarkets(sortedMarkets)
      : sortedMarkets;
  const total = rankedMarkets.length;
  const localAggregates = aggregateUniverse(rankedMarkets);
  const markets = typeof limit === "number" ? rankedMarkets.slice(0, limit) : rankedMarkets;
  const [enriched, globalAggregates] = await Promise.all([
    shouldEnrich
      ? enrichMarkets(markets)
      : Promise.resolve({
          markets,
          providers: [],
        }),
    !searchQuery && (!normalizedChain || normalizedChain === "all") ? getMobulaGlobalAggregates() : Promise.resolve(null),
  ]);
  const providers = globalAggregates
    ? [
        ...enriched.providers.filter((provider) => provider.provider !== globalAggregates.providerSnapshot.provider),
        globalAggregates.providerSnapshot,
      ]
    : enriched.providers;
  const marketsWithBundles = await attachBundleAnalysesToTokens(enriched.markets);
  scheduleBundleAnalysisForMarkets(marketsWithBundles);
  scheduleBundleExitMonitor();

  return {
    data: marketsWithBundles,
    total,
    limit: typeof limit === "number" ? limit : total,
    aggregates: globalAggregates?.aggregates ?? localAggregates,
    source: "aggregated",
    updatedAt: new Date().toISOString(),
    providers,
  };
}

export async function getMarketListings(query: MarketQuery = {}): Promise<MarketListResponse> {
  return cachedJson({
    key: marketListCacheKey(query),
    ttlMs: marketListCacheTtlMs(query),
    staleTtlMs: marketListStaleTtlMs(query),
    load: () => getMarketListingsFresh(query),
  });
}

async function completeMarketDetail(detail: MarketDetailResponse, chainId: string, tokenAddress: string): Promise<MarketDetailResponse> {
  const needsHolderRows = detail.holders.length === 0;
  const needsTradeRows = detail.trades.length === 0;
  const [orders, solanaHolders, moralisHolders, blockscoutHolders, solanaTrades, alchemyTrades] = await Promise.all([
    withDetailBudget(fetchDexOrders(chainId, tokenAddress), []),
    needsHolderRows
      ? withDetailBudget(fetchSolanaHolderPositions(detail.token, 20), { holders: [] } as SolanaHolderPositionsResult)
      : Promise.resolve<SolanaHolderPositionsResult>({ holders: [] }),
    needsHolderRows ? withDetailBudget(fetchMoralisHolderPositions(detail.token, 40), []) : Promise.resolve([]),
    needsHolderRows
      ? withDetailBudget(fetchBlockscoutHolderPositions(detail.token, 50), { holders: [], totalCount: undefined as number | undefined })
      : Promise.resolve({ holders: [], totalCount: undefined as number | undefined }),
    needsTradeRows ? withDetailBudget(fetchSolanaRecentPoolTrades(detail.token, 30), []) : Promise.resolve([]),
    needsTradeRows ? withDetailBudget(fetchAlchemyPoolTrades(detail.token, 80), []) : Promise.resolve([]),
  ]);
  const holders =
    detail.holders.length > 0
      ? detail.holders
      : solanaHolders.holders.length > 0
        ? solanaHolders.holders
        : moralisHolders.length > 0
          ? moralisHolders
          : blockscoutHolders.holders;
  const trades = detail.trades.length > 0 ? detail.trades : solanaTrades.length > 0 ? solanaTrades : alchemyTrades;

  const completed: MarketDetailResponse = {
    ...detail,
    orders,
    trades,
    holders,
    holdersTotal: detail.holdersTotal ?? solanaHolders.totalCount ?? blockscoutHolders.totalCount,
  };

  await snapshotHolderPnlFromDetail(completed).catch(() => undefined);

  const tokensWithBundles = await attachBundleAnalysesToTokens([completed.token, ...completed.pairs]);
  const [tokenWithBundle, ...pairsWithBundles] = tokensWithBundles;

  return {
    ...completed,
    token: tokenWithBundle ?? completed.token,
    pairs: pairsWithBundles.length > 0 ? pairsWithBundles : completed.pairs,
  };
}

async function getDexMarketDetail(chainId: string, tokenAddress: string): Promise<MarketDetailResponse | null> {
  const pairs = await fetchTokenPairs(chainId, tokenAddress);

  let sortedPairs = sortMarkets(pairs, "trending");
  if (!sortedPairs.length) {
    return null;
  }

  const [enriched, trades, holderPositions, ohlcv] = await Promise.all([
    enrichMarkets(sortedPairs),
    withDetailBudget(fetchMobulaTokenTrades(chainId, tokenAddress), []),
    withDetailBudget(fetchMobulaHolderPositions(chainId, tokenAddress), { holders: [], totalCount: undefined }),
    withDetailBudget(fetchMobulaBestOhlcv(chainId, tokenAddress, sortedPairs[0]?.pairAddress), []),
  ]);
  const token = enriched.markets[0];

  if (!token) return null;

  const baseDetail: MarketDetailResponse = {
    token,
    pairs: enriched.markets,
    ohlcv,
    trades,
    orders: [],
    holders: holderPositions.holders,
    holdersTotal: holderPositions.totalCount,
    source: "aggregated",
    updatedAt: new Date().toISOString(),
    providers: enriched.providers,
  };
  const moralisDetail = await withDetailBudget(fillMarketDetailWithMoralis(baseDetail), baseDetail);
  const detail = await withDetailBudget(fillMarketDetailWithGeckoTerminal(moralisDetail), moralisDetail);

  return completeMarketDetail(detail, chainId, tokenAddress);
}

async function getDexMarketDetailBase(chainId: string, tokenAddress: string): Promise<MarketDetailResponse | null> {
  const pairs = sortMarkets(await fetchTokenPairs(chainId, tokenAddress), "trending").map(withDexProvider);
  const token = pairs[0];

  if (!token) return null;

  return {
    token,
    pairs,
    ohlcv: [],
    trades: [],
    orders: [],
    holders: [],
    source: "aggregated",
    updatedAt: new Date().toISOString(),
    providers: [DEX_PROVIDER],
  };
}

function marketBaseDetailFromPairs(pairs: MarketToken[]): MarketDetailResponse | null {
  const sortedPairs = sortMarkets(pairs, "trending").map(withDexProvider);
  const token = sortedPairs[0];

  if (!token) return null;

  return {
    token,
    pairs: sortedPairs,
    ohlcv: [],
    trades: [],
    orders: [],
    holders: [],
    source: "aggregated",
    updatedAt: new Date().toISOString(),
    providers: [DEX_PROVIDER],
  };
}

async function getUniverseMarketDetailBase(chainId: string, tokenAddress: string): Promise<MarketDetailResponse | null> {
  const normalizedChain = chainId.trim().toLowerCase();
  const normalizedToken = tokenAddress.trim().toLowerCase();
  const markets = await getCachedMarketUniverse().catch(() => []);
  const pairs = markets.filter(
    (market) =>
      market.chainId.toLowerCase() === normalizedChain &&
      market.tokenAddress.toLowerCase() === normalizedToken,
  );

  return marketBaseDetailFromPairs(pairs);
}

function mergeUnique<T>(left: T[], right: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const item of [...left, ...right]) {
    const id = key(item);
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(item);
  }

  return merged;
}

function mergeMarketDetails(primary: MarketDetailResponse, fallback: MarketDetailResponse): MarketDetailResponse {
  const useFallbackMarket =
    (primary.trades.length === 0 && fallback.trades.length > 0) ||
    (primary.ohlcv.length === 0 && fallback.ohlcv.length > 0);
  const providers = mergeUnique(primary.providers, fallback.providers, (provider) => provider.provider);
  const tokenProviders = mergeUnique(primary.token.providers, fallback.token.providers, (provider) => provider.provider);

  return {
    ...primary,
    token: {
      ...fallback.token,
      ...primary.token,
      pairAddress: useFallbackMarket ? fallback.token.pairAddress : primary.token.pairAddress || fallback.token.pairAddress,
      dexId: useFallbackMarket ? fallback.token.dexId : primary.token.dexId || fallback.token.dexId,
      url: primary.token.url || fallback.token.url,
      links: mergeUnique(primary.token.links, fallback.token.links, (link) => link.url),
      narrativeTags: mergeUnique(primary.token.narrativeTags, fallback.token.narrativeTags, (tag) => tag),
      riskFlags: mergeUnique(primary.token.riskFlags, fallback.token.riskFlags, (flag) => flag),
      security: {
        ...fallback.token.security,
        ...primary.token.security,
      },
      providers: tokenProviders,
    },
    pairs: fallback.pairs.length > 0 ? fallback.pairs : primary.pairs,
    ohlcv: primary.ohlcv.length > 0 ? primary.ohlcv : fallback.ohlcv,
    trades: primary.trades.length > 0 ? primary.trades : fallback.trades,
    orders: primary.orders.length > 0 ? primary.orders : fallback.orders,
    holders: primary.holders.length > 0 ? primary.holders : fallback.holders,
    holdersTotal: primary.holdersTotal ?? fallback.holdersTotal,
    providers,
    updatedAt: new Date().toISOString(),
  };
}

function detailCacheKey(chainId: string, tokenAddress: string): string {
  return `${chainId.trim().toLowerCase()}:${tokenAddress.trim().toLowerCase()}`;
}

function hasDetailRows(detail: MarketDetailResponse): boolean {
  return detail.trades.length > 0 || detail.ohlcv.length > 0 || detail.holders.length > 0 || detail.orders.length > 0;
}

function mergeTradeRows(fresh: MarketTokenTrade[], previous: MarketTokenTrade[]): MarketTokenTrade[] {
  return mergeUnique(fresh, previous, (trade) => trade.transactionHash?.toLowerCase() || trade.id.toLowerCase())
    .sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0))
    .slice(0, 300);
}

function mergeCandleRows(fresh: MarketOhlcvCandle[], previous: MarketOhlcvCandle[]): MarketOhlcvCandle[] {
  const byTime = new Map<number, MarketOhlcvCandle>();
  for (const candle of previous) byTime.set(candle.t, candle);
  for (const candle of fresh) byTime.set(candle.t, candle);
  return [...byTime.values()].sort((left, right) => left.t - right.t).slice(-1000);
}

function mergeHolderRows(fresh: MarketTokenHolderPosition[], previous: MarketTokenHolderPosition[]): MarketTokenHolderPosition[] {
  return mergeUnique(fresh, previous, (holder) => holder.walletAddress.toLowerCase()).slice(0, 80);
}

function mergeOrderRows(fresh: MarketTokenOrder[], previous: MarketTokenOrder[]): MarketTokenOrder[] {
  return mergeUnique(fresh, previous, (order) => order.id.toLowerCase()).slice(0, 80);
}

function stabilizeMarketDetail(detail: MarketDetailResponse, chainId: string, tokenAddress: string): MarketDetailResponse {
  const now = Date.now();
  const cached = detailLastGoodCache.get(detailCacheKey(chainId, tokenAddress));
  const previous = cached && cached.expiresAt > now ? cached.detail : null;

  const stable: MarketDetailResponse = previous
    ? {
        ...detail,
        ohlcv: mergeCandleRows(detail.ohlcv, previous.ohlcv),
        trades: mergeTradeRows(detail.trades, previous.trades),
        orders: mergeOrderRows(detail.orders, previous.orders),
        holders: mergeHolderRows(detail.holders, previous.holders),
        holdersTotal: detail.holdersTotal ?? previous.holdersTotal,
        providers: mergeUnique(detail.providers, previous.providers, (provider) => provider.provider),
      }
    : detail;

  if (hasDetailRows(stable)) {
    detailLastGoodCache.set(detailCacheKey(chainId, tokenAddress), {
      detail: stable,
      expiresAt: now + DETAIL_LAST_GOOD_TTL_MS,
    });
  }

  return stable;
}

function getCachedStableMarketDetail(chainId: string, tokenAddress: string): MarketDetailResponse | null {
  const cached = detailLastGoodCache.get(detailCacheKey(chainId, tokenAddress));
  if (!cached || cached.expiresAt <= Date.now()) return null;
  return cached.detail;
}

async function getMarketDetailFull(chainId: string, tokenAddress: string): Promise<MarketDetailResponse | null> {
  const mobulaDetail = await withDetailBudget(getMobulaMarketDetail(chainId, tokenAddress), null);
  const launchpadDetail = mobulaDetail
    ? null
    : await withDetailBudget(getLaunchpadMarketDetailFallback(chainId, tokenAddress), null);
  const providerDetail = mobulaDetail ?? launchpadDetail;

  if (providerDetail) {
    const moralisDetail = await withDetailBudget(fillMarketDetailWithMoralis(providerDetail), providerDetail);
    const geckoDetail = await withDetailBudget(fillMarketDetailWithGeckoTerminal(moralisDetail), moralisDetail);
    const detail = await completeMarketDetail(geckoDetail, chainId, tokenAddress);

    if (detail.trades.length > 0 && detail.ohlcv.length > 0) return stabilizeMarketDetail(detail, chainId, tokenAddress);

    const dexDetail = await getDexMarketDetail(chainId, tokenAddress).catch(() => null);
    return stabilizeMarketDetail(dexDetail ? mergeMarketDetails(detail, dexDetail) : detail, chainId, tokenAddress);
  }

  const dexDetail = await getDexMarketDetail(chainId, tokenAddress).catch(() => null);
  return dexDetail ? stabilizeMarketDetail(dexDetail, chainId, tokenAddress) : getCachedStableMarketDetail(chainId, tokenAddress);
}

async function getMarketDetailFast(chainId: string, tokenAddress: string): Promise<MarketDetailResponse | null> {
  const cachedStable = getCachedStableMarketDetail(chainId, tokenAddress);
  if (cachedStable) return cachedStable;

  const universeBaseDetail = await getUniverseMarketDetailBase(chainId, tokenAddress);
  const baseDetail = universeBaseDetail ?? (await withDetailBudget(getDexMarketDetailBase(chainId, tokenAddress), null));
  if (!baseDetail) return getMarketDetailFull(chainId, tokenAddress);

  const stableBase = stabilizeMarketDetail(baseDetail, chainId, tokenAddress);

  void getMarketDetailFull(chainId, tokenAddress)
    .then(async (detail) => {
      if (!detail) return;
      await writeCachedJson(
        marketDetailCacheKey(chainId, tokenAddress),
        detail,
        marketDetailCacheTtlMs(),
        marketDetailStaleTtlMs(),
      );
    })
    .catch(() => undefined);

  return stableBase;
}

export async function getMarketDetail(chainId: string, tokenAddress: string): Promise<MarketDetailResponse | null> {
  return cachedJson({
    key: marketDetailCacheKey(chainId, tokenAddress),
    ttlMs: marketDetailCacheTtlMs(),
    staleTtlMs: marketDetailStaleTtlMs(),
    load: () => getMarketDetailFast(chainId, tokenAddress),
  });
}

function signalReason(token: MarketToken): string {
  const change = token.priceChange.h24 ?? 0;
  const volume = token.volume.h24 ?? 0;
  const liquidity = token.liquidityUsd ?? 0;

  if (change >= 30 && volume >= 100_000) return "Momentum and volume are rising together.";
  if (token.boostAmount) return "Token is actively boosted while market data is moving.";
  if (liquidity >= 500_000) return "Liquidity is deep enough for active monitoring.";
  if (token.ageMinutes !== undefined && token.ageMinutes < 24 * 60) return "Fresh listing with early market activity.";
  return "Passed the current AnyAlpha market filters.";
}

async function getMarketSignalsFresh(limit = 12): Promise<MarketSignalsResponse> {
  const markets = await getMarketListings({ sort: "trending", limit: Math.max(10, limit * 2) });
  const signals: MarketSignal[] = markets.data
    .filter((token) => token.signalScore >= 45)
    .slice(0, limit)
    .map((token) => {
      const change = token.priceChange.h24 ?? 0;
      const sentiment = change >= 10 ? "Bullish" : change <= -10 ? "Bearish" : "Watch";

      return {
        id: token.id,
        token,
        title: `${token.symbol}/${token.quoteSymbol || token.chainLabel}`,
        sentiment,
        reason: signalReason(token),
        tags: token.narrativeTags.length > 0 ? token.narrativeTags : [token.chainLabel],
        score: token.signalScore,
      };
    });

  return {
    data: signals,
    source: "aggregated",
    updatedAt: new Date().toISOString(),
    providers: markets.providers,
  };
}

export async function getMarketSignals(limit = 12): Promise<MarketSignalsResponse> {
  const boundedLimit = Math.max(1, Math.min(50, Math.round(limit)));

  return cachedJson({
    key: `markets:signals:${boundedLimit}`,
    ttlMs: cacheNumberEnv("MARKET_SIGNALS_CACHE_TTL_MS", 15_000, 1_000, 120_000),
    staleTtlMs: cacheNumberEnv("MARKET_SIGNALS_STALE_CACHE_TTL_MS", 120_000, 5_000, 600_000),
    load: () => getMarketSignalsFresh(boundedLimit),
  });
}
