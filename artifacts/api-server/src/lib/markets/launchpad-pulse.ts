import type {
  MarketDetailResponse,
  MarketProviderSnapshot,
  MarketToken,
  MarketTokenLink,
  MarketTxnStats,
} from "./types";
import { fillMarketDetailWithGeckoTerminal } from "./geckoterminal";
import { attachBundleAnalysesToTokens } from "../bundle-detection/store";
import { fetchMobulaBestOhlcv, fetchMobulaHolderPositions, fetchMobulaTokenTrades } from "./mobula";
import { anyAlphaTokenUrl, env, fetchJson, numeric, uniqueLinks } from "./provider-utils";

export type LaunchpadBucketId = "new" | "bonding" | "bonded";

export interface LaunchpadTokenMeta {
  bucket: LaunchpadBucketId;
  source?: string;
  sourceLabel?: string;
  sourceLogo?: string;
  poolAddress?: string;
  deployer?: string;
  createdAt?: string;
  bondingPercent?: number;
  bonded?: boolean;
  holdersCount?: number;
  snipersCount?: number;
  insidersCount?: number;
  bundlersCount?: number;
  proTradersCount?: number;
  smartTradersCount?: number;
  freshTradersCount?: number;
  top10Pct?: number;
  devPct?: number;
  snipersPct?: number;
  insidersPct?: number;
  bundlersPct?: number;
  txCount5m?: number;
  txCount24h?: number;
  quickBuyLabel: string;
}

export type LaunchpadMarketToken = MarketToken & {
  launchpad: LaunchpadTokenMeta;
};

export interface LaunchpadBucket {
  id: LaunchpadBucketId;
  label: string;
  subtitle: string;
  total: number;
  items: LaunchpadMarketToken[];
}

export interface LaunchpadPulseResponse {
  buckets: Record<LaunchpadBucketId, LaunchpadBucket>;
  source: "mobula";
  updatedAt: string;
  providers: MarketProviderSnapshot[];
}

interface MobulaPulseToken {
  address?: string;
  tokenAddress?: string;
  chainId?: string | number;
  symbol?: string;
  name?: string;
  logo?: string;
  image?: string;
  price?: unknown;
  priceUsd?: unknown;
  marketCap?: unknown;
  market_cap?: unknown;
  latest_market_cap?: unknown;
  marketCapDiluted?: unknown;
  fdv?: unknown;
  liquidity?: unknown;
  approximateReserveUSD?: unknown;
  poolAddress?: string;
  marketAddress?: string;
  pairAddress?: string;
  source?: string;
  sourceMetadata?: {
    name?: string;
    logo?: string;
    image?: string;
    url?: string;
  };
  exchange?: {
    name?: string;
    logo?: string;
  };
  createdAt?: string | number;
  created_at?: string | number;
  bonded_at?: string | number;
  bonded?: boolean;
  bondingPercentage?: unknown;
  deployer?: string;
  creator?: string;
  holdersCount?: unknown;
  snipersCount?: unknown;
  insidersCount?: unknown;
  bundlersCount?: unknown;
  proTradersCount?: unknown;
  smartTradersCount?: unknown;
  freshTradersCount?: unknown;
  top10Holdings?: unknown;
  devHoldings?: unknown;
  snipersHoldings?: unknown;
  insidersHoldings?: unknown;
  bundlersHoldings?: unknown;
  volume_1min?: unknown;
  volume_5min?: unknown;
  volume_1h?: unknown;
  volume_6h?: unknown;
  volume_24h?: unknown;
  buys_5min?: unknown;
  buys_1h?: unknown;
  buys_6h?: unknown;
  buys_24h?: unknown;
  sells_5min?: unknown;
  sells_1h?: unknown;
  sells_6h?: unknown;
  sells_24h?: unknown;
  trades_5min?: unknown;
  trades_1h?: unknown;
  trades_6h?: unknown;
  trades_24h?: unknown;
  price_change_1min?: unknown;
  price_change_5min?: unknown;
  price_change_1h?: unknown;
  price_change_6h?: unknown;
  price_change_24h?: unknown;
  socials?: unknown;
  website?: string;
  twitter?: string;
  telegram?: string;
  token?: {
    address?: string;
    name?: string;
    symbol?: string;
    logo?: string;
    image?: string;
  };
}

interface MobulaPulseBucket {
  data?: MobulaPulseToken[];
  total?: number;
}

type MobulaPulseApiResponse = Partial<Record<LaunchpadBucketId, MobulaPulseBucket | MobulaPulseToken[]>>;

interface PulseCache {
  response: LaunchpadPulseResponse;
  updatedAt: number;
  chain?: string;
  limit: number;
}

function envMs(key: string, fallback: number, min: number, max: number) {
  const raw = Number(env(key));
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, raw));
}

const CACHE_TTL_MS = envMs("MOBULA_PULSE_CACHE_TTL_MS", 5_000, 5_000, 45_000);
const STALE_CACHE_TTL_MS = envMs("MOBULA_PULSE_STALE_CACHE_TTL_MS", 30_000, CACHE_TTL_MS, 180_000);
const DEFAULT_LIMIT = 18;
const PULSE_CHAIN_IDS = [
  "solana:solana",
  "evm:8453",
  "evm:56",
  "ton:mainnet",
  "evm:143",
  "evm:1",
  "evm:42161",
  "evm:10",
  "evm:137",
  "evm:43114",
];
const PULSE_POOL_TYPES = ["pumpfun", "letsbonk", "moonshot-evm", "fourmeme"];

const BUCKET_META: Record<LaunchpadBucketId, { label: string; subtitle: string }> = {
  new: { label: "New Pairs", subtitle: "Fresh launchpad pairs as they appear." },
  bonding: { label: "Final Stretch", subtitle: "Pairs still moving through bonding." },
  bonded: { label: "Migrated", subtitle: "Graduated pools with market liquidity." },
};

const CHAIN_INFO: Record<string, { chainId: string; label: string; native: string }> = {
  "solana:solana": { chainId: "solana", label: "Solana", native: "SOL" },
  solana: { chainId: "solana", label: "Solana", native: "SOL" },
  "evm:1": { chainId: "ethereum", label: "Ethereum", native: "ETH" },
  "1": { chainId: "ethereum", label: "Ethereum", native: "ETH" },
  ethereum: { chainId: "ethereum", label: "Ethereum", native: "ETH" },
  "evm:8453": { chainId: "base", label: "Base", native: "ETH" },
  "8453": { chainId: "base", label: "Base", native: "ETH" },
  base: { chainId: "base", label: "Base", native: "ETH" },
  "evm:56": { chainId: "bsc", label: "BSC", native: "BNB" },
  "56": { chainId: "bsc", label: "BSC", native: "BNB" },
  bsc: { chainId: "bsc", label: "BSC", native: "BNB" },
  "evm:42161": { chainId: "arbitrum", label: "Arbitrum", native: "ETH" },
  "42161": { chainId: "arbitrum", label: "Arbitrum", native: "ETH" },
  arbitrum: { chainId: "arbitrum", label: "Arbitrum", native: "ETH" },
  "evm:10": { chainId: "optimism", label: "Optimism", native: "ETH" },
  "10": { chainId: "optimism", label: "Optimism", native: "ETH" },
  optimism: { chainId: "optimism", label: "Optimism", native: "ETH" },
  optimistic: { chainId: "optimism", label: "Optimism", native: "ETH" },
  "evm:137": { chainId: "polygon", label: "Polygon", native: "POL" },
  "137": { chainId: "polygon", label: "Polygon", native: "POL" },
  polygon: { chainId: "polygon", label: "Polygon", native: "POL" },
  "evm:43114": { chainId: "avalanche", label: "Avalanche", native: "AVAX" },
  "43114": { chainId: "avalanche", label: "Avalanche", native: "AVAX" },
  avalanche: { chainId: "avalanche", label: "Avalanche", native: "AVAX" },
  "ton:mainnet": { chainId: "ton", label: "TON", native: "TON" },
  "mainnet": { chainId: "ton", label: "TON", native: "TON" },
  ton: { chainId: "ton", label: "TON", native: "TON" },
  "evm:143": { chainId: "monad", label: "Monad", native: "MON" },
  "143": { chainId: "monad", label: "Monad", native: "MON" },
  monad: { chainId: "monad", label: "Monad", native: "MON" },
};

const APP_CHAIN_TO_PULSE: Record<string, string[]> = {
  solana: ["solana:solana"],
  base: ["evm:8453"],
  bsc: ["evm:56"],
  ton: ["ton:mainnet"],
  monad: ["evm:143"],
  ethereum: ["evm:1"],
  arbitrum: ["evm:42161"],
  optimism: ["evm:10"],
  polygon: ["evm:137"],
  avalanche: ["evm:43114"],
};

const pulseCache = new Map<string, PulseCache>();
const pendingPulses = new Map<string, Promise<LaunchpadPulseResponse>>();

function mobulaBaseUrl() {
  return env("MOBULA_API_BASE_URL") ?? (env("MOBULA_API_KEY") ? "https://api.mobula.io" : "https://demo-api.mobula.io");
}

function mobulaHeaders(): Record<string, string> {
  const key = env("MOBULA_API_KEY");
  return key ? { authorization: key } : {};
}

function mobulaProvider(status: MarketProviderSnapshot["status"], detail: string): MarketProviderSnapshot {
  return {
    provider: "mobula",
    status,
    label: "Mobula Pulse",
    detail,
    updatedAt: new Date().toISOString(),
  };
}

function emptyBuckets(): Record<LaunchpadBucketId, LaunchpadBucket> {
  return {
    new: { id: "new", ...BUCKET_META.new, total: 0, items: [] },
    bonding: { id: "bonding", ...BUCKET_META.bonding, total: 0, items: [] },
    bonded: { id: "bonded", ...BUCKET_META.bonded, total: 0, items: [] },
  };
}

function chainInfo(value?: string | number) {
  const key = String(value ?? "solana:solana").toLowerCase();
  const mapped = CHAIN_INFO[key] ?? CHAIN_INFO[key.replace("evm:", "")];
  if (mapped) return mapped;

  return {
    chainId: key.replace("evm:", ""),
    label: key.replace("evm:", "").toUpperCase(),
    native: "SOL",
  };
}

function dateMs(value?: string | number): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function ageMinutes(timestamp?: number): number | undefined {
  if (!timestamp) return undefined;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
}

function asPercent(value: unknown): number | undefined {
  const n = numeric(value);
  if (n === undefined) return undefined;
  return Math.abs(n) <= 1 ? n * 100 : n;
}

function txns(buys?: unknown, sells?: unknown, total?: unknown): MarketTxnStats {
  const buyCount = Math.max(0, Math.round(numeric(buys) ?? 0));
  const sellCount = Math.max(0, Math.round(numeric(sells) ?? 0));
  const totalCount = Math.max(0, Math.round(numeric(total) ?? 0));

  if (buyCount || sellCount || !totalCount) {
    return { buys: buyCount, sells: sellCount };
  }

  return { buys: totalCount, sells: 0 };
}

function sourceLabel(row: MobulaPulseToken): string | undefined {
  const source = row.source?.trim();
  return (
    row.sourceMetadata?.name ??
    row.exchange?.name ??
    (source ? source.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : undefined)
  );
}

function sourceLogo(row: MobulaPulseToken): string | undefined {
  return row.sourceMetadata?.logo ?? row.sourceMetadata?.image ?? row.exchange?.logo;
}

function linksFor(row: MobulaPulseToken): MarketTokenLink[] {
  const links: MarketTokenLink[] = [];

  if (row.website) links.push({ type: "website", label: "Website", url: row.website });
  if (row.twitter) links.push({ type: "twitter", label: "X", url: row.twitter });
  if (row.telegram) links.push({ type: "telegram", label: "Telegram", url: row.telegram });
  if (row.sourceMetadata?.url) links.push({ type: "launchpad", label: sourceLabel(row) ?? "Launchpad", url: row.sourceMetadata.url });

  if (Array.isArray(row.socials)) {
    row.socials.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const social = item as { type?: string; label?: string; url?: string };
      if (social.url) links.push({ type: social.type, label: social.label, url: social.url });
    });
  } else if (row.socials && typeof row.socials === "object") {
    Object.entries(row.socials as Record<string, unknown>).forEach(([key, value]) => {
      if (typeof value === "string" && value.trim()) {
        links.push({ type: key, label: key, url: value });
      }
    });
  }

  return uniqueLinks(links);
}

function riskFlags(row: MobulaPulseToken, links: MarketTokenLink[]): string[] {
  const flags: string[] = [];
  const liquidity = numeric(row.liquidity) ?? numeric(row.approximateReserveUSD) ?? 0;
  const created = ageMinutes(dateMs(row.createdAt ?? row.created_at ?? row.bonded_at));
  const top10 = asPercent(row.top10Holdings) ?? 0;
  const dev = asPercent(row.devHoldings) ?? 0;
  const snipers = asPercent(row.snipersHoldings) ?? 0;

  if (typeof created === "number" && created < 30) flags.push("Brand new");
  if (liquidity > 0 && liquidity < 15_000) flags.push("Thin liquidity");
  if (top10 >= 40) flags.push("Top-heavy holders");
  if (dev >= 5) flags.push("Dev supply");
  if (snipers >= 10) flags.push("Sniper cluster");
  if (links.length === 0) flags.push("No socials");

  return flags.slice(0, 4);
}

function signalScore(row: MobulaPulseToken): number {
  const liquidity = numeric(row.liquidity) ?? numeric(row.approximateReserveUSD) ?? 0;
  const volume5m = numeric(row.volume_5min) ?? 0;
  const volume24h = numeric(row.volume_24h) ?? 0;
  const tx5m = numeric(row.trades_5min) ?? (numeric(row.buys_5min) ?? 0) + (numeric(row.sells_5min) ?? 0);
  const holders = numeric(row.holdersCount) ?? 0;
  const bonding = asPercent(row.bondingPercentage) ?? 0;
  const top10 = asPercent(row.top10Holdings) ?? 0;
  const dev = asPercent(row.devHoldings) ?? 0;

  let score = 28;
  if (liquidity >= 250_000) score += 18;
  else if (liquidity >= 50_000) score += 12;
  else if (liquidity >= 10_000) score += 6;

  if (volume5m >= 100_000) score += 16;
  else if (volume5m >= 25_000) score += 10;
  else if (volume24h >= 250_000) score += 7;

  if (tx5m >= 150) score += 14;
  else if (tx5m >= 40) score += 8;
  else if (tx5m >= 10) score += 4;

  if (holders >= 500) score += 10;
  else if (holders >= 100) score += 5;

  if (bonding >= 80) score += 8;
  if (top10 >= 50) score -= 10;
  if (dev >= 8) score -= 8;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function narrativeTags(row: MobulaPulseToken, chainLabel: string): string[] {
  const tags = new Set<string>();
  const text = `${row.name ?? ""} ${row.symbol ?? ""}`.toLowerCase();

  tags.add("Launchpad");
  if (row.source) tags.add(sourceLabel(row) ?? row.source);
  if (/\b(ai|agent|bot|gpt|mind|neural)\b/.test(text)) tags.add("AI");
  if (/\b(dog|cat|pepe|meme|bonk|frog|bull|pig)\b/.test(text)) tags.add("Meme");
  tags.add(chainLabel);

  return [...tags].slice(0, 4);
}

function normalizePulseToken(row: MobulaPulseToken, bucket: LaunchpadBucketId): LaunchpadMarketToken | null {
  const info = chainInfo(row.chainId);
  const tokenAddress = row.address ?? row.tokenAddress ?? row.token?.address;
  const pairAddress = row.poolAddress ?? row.marketAddress ?? row.pairAddress ?? tokenAddress;
  const symbol = row.symbol ?? row.token?.symbol;
  const name = row.name ?? row.token?.name ?? symbol;

  if (!tokenAddress || !pairAddress || !symbol || !name) return null;

  const createdAt = dateMs(row.createdAt ?? row.created_at ?? row.bonded_at);
  const marketCap = numeric(row.latest_market_cap) ?? numeric(row.marketCap) ?? numeric(row.market_cap);
  const fdv = numeric(row.marketCapDiluted) ?? numeric(row.fdv) ?? marketCap;
  const liquidityUsd = numeric(row.liquidity) ?? numeric(row.approximateReserveUSD);
  const links = linksFor(row);
  const tokenUrl = anyAlphaTokenUrl(info.chainId, tokenAddress);
  const fiveMinuteTxns = txns(row.buys_5min, row.sells_5min, row.trades_5min);
  const txCount5m = fiveMinuteTxns.buys + fiveMinuteTxns.sells;
  const h24Txns = txns(row.buys_24h, row.sells_24h, row.trades_24h);
  const txCount24h = h24Txns.buys + h24Txns.sells;
  const sourceName = sourceLabel(row);

  return {
    id: `${info.chainId}:${tokenAddress}:${pairAddress}`,
    chainId: info.chainId,
    chainLabel: info.label,
    dexId: row.source ?? sourceName ?? "launchpad",
    url: tokenUrl,
    pairAddress,
    tokenAddress,
    name,
    symbol,
    quoteSymbol: info.native,
    priceUsd: numeric(row.priceUsd) ?? numeric(row.price),
    marketCap,
    fdv,
    liquidityUsd,
    volume: {
      m5: numeric(row.volume_5min) ?? numeric(row.volume_1min),
      h1: numeric(row.volume_1h),
      h6: numeric(row.volume_6h),
      h24: numeric(row.volume_24h),
    },
    priceChange: {
      m5: numeric(row.price_change_5min) ?? numeric(row.price_change_1min),
      h1: numeric(row.price_change_1h),
      h6: numeric(row.price_change_6h),
      h24: numeric(row.price_change_24h),
    },
    txns: {
      m5: fiveMinuteTxns,
      h1: txns(row.buys_1h, row.sells_1h, row.trades_1h),
      h6: txns(row.buys_6h, row.sells_6h, row.trades_6h),
      h24: h24Txns,
    },
    pairCreatedAt: createdAt,
    ageMinutes: ageMinutes(createdAt),
    imageUrl: row.logo ?? row.image ?? row.token?.logo ?? row.token?.image,
    links,
    narrativeTags: narrativeTags(row, info.label),
    riskFlags: riskFlags(row, links),
    signalScore: signalScore(row),
    providers: [mobulaProvider(env("MOBULA_API_KEY") ? "live" : "demo", "Launchpad pulse discovery and token metadata.")],
    security: {
      holderCount: numeric(row.holdersCount),
      top10HolderPct: asPercent(row.top10Holdings),
    },
    launchpad: {
      bucket,
      source: row.source,
      sourceLabel: sourceName,
      sourceLogo: sourceLogo(row),
      poolAddress: pairAddress,
      deployer: row.deployer ?? row.creator,
      createdAt: typeof row.createdAt === "string" ? row.createdAt : undefined,
      bondingPercent: asPercent(row.bondingPercentage),
      bonded: row.bonded,
      holdersCount: numeric(row.holdersCount),
      snipersCount: numeric(row.snipersCount),
      insidersCount: numeric(row.insidersCount),
      bundlersCount: numeric(row.bundlersCount),
      proTradersCount: numeric(row.proTradersCount),
      smartTradersCount: numeric(row.smartTradersCount),
      freshTradersCount: numeric(row.freshTradersCount),
      top10Pct: asPercent(row.top10Holdings),
      devPct: asPercent(row.devHoldings),
      snipersPct: asPercent(row.snipersHoldings),
      insidersPct: asPercent(row.insidersHoldings),
      bundlersPct: asPercent(row.bundlersHoldings),
      txCount5m,
      txCount24h,
      quickBuyLabel: `2.000000000 ${info.native}`,
    },
  };
}

function rowsForBucket(value: MobulaPulseBucket | MobulaPulseToken[] | undefined): MobulaPulseToken[] {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.data) ? value.data : [];
}

function bucketTotal(value: MobulaPulseBucket | MobulaPulseToken[] | undefined, fallback: number): number {
  if (Array.isArray(value)) return value.length;
  return Math.max(fallback, Math.round(numeric(value?.total) ?? fallback));
}

function hasPulseItems(response: LaunchpadPulseResponse): boolean {
  return (Object.values(response.buckets) as LaunchpadBucket[]).some((bucket) => bucket.items.length > 0);
}

function isProviderError(response: LaunchpadPulseResponse): boolean {
  return response.providers.some((provider) => provider.status === "error");
}

function requestedChainIds(chain?: string): string[] {
  if (!chain || chain === "all") return PULSE_CHAIN_IDS;
  return APP_CHAIN_TO_PULSE[chain.toLowerCase()] ?? PULSE_CHAIN_IDS;
}

function requestedPoolTypes(chain?: string): string[] | undefined {
  const normalized = chain?.toLowerCase();
  if (normalized === "solana" || normalized === "base" || normalized === "bsc") return PULSE_POOL_TYPES;
  return undefined;
}

async function fetchPulse(chain: string | undefined, limit: number): Promise<LaunchpadPulseResponse> {
  const poolTypes = requestedPoolTypes(chain);
  const body = {
    model: "default",
    assetMode: true,
    compressed: false,
    chainId: requestedChainIds(chain),
    ...(poolTypes ? { poolTypes } : {}),
  };

  try {
    const raw = await fetchJson<MobulaPulseApiResponse>(
      `${mobulaBaseUrl()}/api/2/pulse`,
      {
        method: "POST",
        headers: mobulaHeaders(),
        body: JSON.stringify(body),
      },
      18_000,
    );

    const buckets = emptyBuckets();

    await Promise.all(
      (Object.keys(BUCKET_META) as LaunchpadBucketId[]).map(async (bucketId) => {
        const rawBucket = raw[bucketId];
        const items = rowsForBucket(rawBucket)
          .map((row) => normalizePulseToken(row, bucketId))
          .filter((item): item is LaunchpadMarketToken => item !== null)
          .slice(0, limit);
        const itemsWithBundles = await attachBundleAnalysesToTokens(items);

        buckets[bucketId] = {
          id: bucketId,
          ...BUCKET_META[bucketId],
          total: bucketTotal(rawBucket, itemsWithBundles.length),
          items: itemsWithBundles,
        };
      }),
    );

    return {
      buckets,
      source: "mobula",
      updatedAt: new Date().toISOString(),
      providers: [mobulaProvider(env("MOBULA_API_KEY") ? "live" : "demo", "Launchpad pulse data from Mobula.")],
    };
  } catch (error) {
    return {
      buckets: emptyBuckets(),
      source: "mobula",
      updatedAt: new Date().toISOString(),
      providers: [
        mobulaProvider(
          "error",
          error instanceof Error ? `Mobula Pulse unavailable: ${error.message}` : "Mobula Pulse unavailable.",
        ),
      ],
    };
  }
}

export async function getLaunchpadPulse(options: { chain?: string; limit?: number } = {}): Promise<LaunchpadPulseResponse> {
  const chain = options.chain?.trim().toLowerCase() || "all";
  const limit = Math.max(1, Math.min(30, Math.round(options.limit ?? DEFAULT_LIMIT)));
  const key = `${chain}:${limit}`;
  const now = Date.now();
  const cached = pulseCache.get(key);

  if (cached && now - cached.updatedAt < CACHE_TTL_MS) {
    return cached.response;
  }

  const pending = pendingPulses.get(key);
  if (pending) {
    return cached ? cached.response : pending;
  }

  const promise = fetchPulse(chain, limit)
    .then((response) => {
      const hasCachedData = Boolean(cached && hasPulseItems(cached.response));
      const shouldKeepExistingCache = isProviderError(response) && hasCachedData;

      if (!shouldKeepExistingCache) {
        pulseCache.set(key, {
          response,
          updatedAt: Date.now(),
          chain,
          limit,
        });
      }

      return shouldKeepExistingCache ? cached!.response : response;
    })
    .finally(() => {
      pendingPulses.delete(key);
    });

  pendingPulses.set(key, promise);

  if (cached && now - cached.updatedAt < STALE_CACHE_TTL_MS) {
    void promise.catch(() => undefined);
    return cached.response;
  }

  return promise;
}

export async function getLaunchpadTokenSnapshot(
  chainId: string,
  tokenAddress: string,
): Promise<LaunchpadMarketToken | null> {
  const normalizedChain = chainId.trim().toLowerCase();
  const normalizedAddress = tokenAddress.trim().toLowerCase();
  const pulse = await getLaunchpadPulse({ chain: normalizedChain, limit: 30 });

  return (
    (Object.values(pulse.buckets) as LaunchpadBucket[])
      .flatMap((bucket) => bucket.items)
      .find(
        (token) =>
          token.chainId.toLowerCase() === normalizedChain &&
          token.tokenAddress.toLowerCase() === normalizedAddress,
      ) ?? null
  );
}

export async function getLaunchpadMarketDetailFallback(
  chainId: string,
  tokenAddress: string,
): Promise<MarketDetailResponse | null> {
  const token = await getLaunchpadTokenSnapshot(chainId, tokenAddress);
  if (!token) return null;

  const [ohlcv, trades, holderPositions] = await Promise.all([
    fetchMobulaBestOhlcv(chainId, tokenAddress, token.pairAddress),
    fetchMobulaTokenTrades(chainId, tokenAddress),
    fetchMobulaHolderPositions(chainId, tokenAddress),
  ]);

  return fillMarketDetailWithGeckoTerminal({
    token,
    pairs: [token],
    ohlcv,
    trades,
    orders: [],
    holders: holderPositions.holders,
    holdersTotal: holderPositions.totalCount,
    source: "aggregated",
    updatedAt: new Date().toISOString(),
    providers: token.providers,
  });
}
