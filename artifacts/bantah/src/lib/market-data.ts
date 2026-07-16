export interface MarketPeriodStats {
  m5?: number;
  h1?: number;
  h6?: number;
  h24?: number;
}

export interface MarketTxnStats {
  buys: number;
  sells: number;
}

export interface MarketTokenLink {
  type?: string;
  label?: string;
  url: string;
}

export type MarketProvider = 'dexscreener' | 'mobula' | 'geckoterminal' | 'helius' | 'moralis' | 'alchemy' | 'bitquery';
export type MarketProviderStatus = 'live' | 'demo' | 'missing_key' | 'skipped' | 'error';

export interface MarketProviderSnapshot {
  provider: MarketProvider;
  status: MarketProviderStatus;
  label: string;
  detail?: string;
  value?: string;
  updatedAt?: string;
}

export interface MarketTokenSecurity {
  holderCount?: number;
  top10HolderPct?: number;
  buyTax?: string;
  sellTax?: string;
  liquidityBurnPct?: number;
  mintAuthorityDisabled?: boolean;
  freezeAuthorityDisabled?: boolean;
  renounced?: boolean;
  verifiedContract?: boolean;
  possibleSpam?: boolean;
}

export type MarketBundleLabel = 'bundled' | 'organic' | 'suspicious' | 'unknown';

export interface MarketBundleReason {
  code: string;
  label: string;
  detail?: string;
  scoreImpact?: number;
}

export interface MarketBundleHolderPnl {
  inProfitPct?: number;
  breakevenPct?: number;
  inLossPct?: number;
  bundlePnl?: number;
  retailPnl?: number;
  snapshotAt?: string;
}

export interface MarketBundleAnalysis {
  label: MarketBundleLabel;
  score: number;
  coordinatedWallets: number;
  supplySnipedPct: number;
  sniperWallets: number;
  deployerRugs: number;
  bundleWalletsPnl?: number;
  retailAvgPnl?: number;
  bundleStillHolding?: boolean;
  holderPnl?: MarketBundleHolderPnl;
  reasons: MarketBundleReason[];
  evidence: Record<string, unknown>;
  analyzedAt?: string;
  updatedAt?: string;
}

export interface MarketTokenTradePlatform {
  id?: string;
  name?: string;
  logo?: string;
}

export interface MarketTokenTrade {
  id: string;
  type: string;
  operation?: string;
  baseTokenAmount?: number;
  baseTokenAmountUsd?: number;
  quoteTokenAmount?: number;
  quoteTokenAmountUsd?: number;
  timestamp?: number;
  transactionHash?: string;
  marketAddress?: string;
  makerAddress?: string;
  senderAddress?: string;
  priceUsd?: number;
  marketCapUsd?: number;
  labels: string[];
  platform?: MarketTokenTradePlatform;
}

export interface MarketTokenHolderMetadata {
  entityName?: string;
  entityLogo?: string;
  entityType?: string;
  entityLabels: string[];
  entityTwitter?: string;
  entityWebsite?: string;
  entityTelegram?: string;
  entityGithub?: string;
  entityDiscord?: string;
}

export interface MarketTokenHolderPosition {
  walletAddress: string;
  tokenAmount?: number;
  tokenAmountUsd?: number;
  percentageOfTotalSupply?: number;
  realizedPnlUsd?: number;
  unrealizedPnlUsd?: number;
  totalPnlUsd?: number;
  buys?: number;
  sells?: number;
  avgBuyPriceUsd?: number;
  avgSellPriceUsd?: number;
  firstTradeAt?: number;
  lastTradeAt?: number;
  lastActivityAt?: number;
  labels: string[];
  walletMetadata?: MarketTokenHolderMetadata;
  platform?: MarketTokenTradePlatform;
}

export interface MarketTokenOrder {
  id: string;
  type?: string;
  status?: string;
  paymentTimestamp?: number;
  createdAt?: number;
  source: 'dexscreener';
}

export interface MarketOhlcvCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export interface MarketToken {
  id: string;
  chainId: string;
  chainLabel: string;
  dexId: string;
  url: string;
  pairAddress: string;
  tokenAddress: string;
  name: string;
  symbol: string;
  quoteSymbol: string;
  priceUsd?: number;
  priceNative?: string;
  marketCap?: number;
  fdv?: number;
  liquidityUsd?: number;
  volume: MarketPeriodStats;
  priceChange: MarketPeriodStats;
  txns: Record<'m5' | 'h1' | 'h6' | 'h24', MarketTxnStats>;
  pairCreatedAt?: number;
  ageMinutes?: number;
  imageUrl?: string;
  openGraph?: string;
  description?: string;
  links: MarketTokenLink[];
  boostAmount?: number;
  profileUpdatedAt?: string;
  narrativeTags: string[];
  riskFlags: string[];
  signalScore: number;
  providers: MarketProviderSnapshot[];
  security?: MarketTokenSecurity;
  bundle?: MarketBundleAnalysis;
}

export interface MarketListResponse {
  data: MarketToken[];
  total: number;
  limit: number;
  aggregates: {
    marketCapUsd: number;
    volume24hUsd: number;
    txns24h: number;
    pairCount: number;
    tokenCount: number;
  };
  source: 'aggregated';
  updatedAt: string;
  providers: MarketProviderSnapshot[];
}

export interface MarketSignal {
  id: string;
  token: MarketToken;
  title: string;
  sentiment: 'Bullish' | 'Bearish' | 'Watch';
  reason: string;
  tags: string[];
  score: number;
}

export interface MarketSignalsResponse {
  data: MarketSignal[];
  source: 'aggregated';
  updatedAt: string;
  providers: MarketProviderSnapshot[];
}

export interface MarketDetailResponse {
  token: MarketToken;
  pairs: MarketToken[];
  ohlcv: MarketOhlcvCandle[];
  trades: MarketTokenTrade[];
  orders: MarketTokenOrder[];
  holders: MarketTokenHolderPosition[];
  holdersTotal?: number;
  source: 'aggregated';
  updatedAt: string;
  providers: MarketProviderSnapshot[];
}

export function marketTokenPath(token: Pick<MarketToken, 'chainId' | 'tokenAddress'>): string {
  const params = new URLSearchParams({
    chain: token.chainId,
    token: token.tokenAddress,
  });

  return `/?${params.toString()}`;
}

export function marketTokenUrl(
  token: Pick<MarketToken, 'chainId' | 'tokenAddress'>,
  origin = typeof window !== 'undefined' ? window.location.origin : '',
): string {
  const path = marketTokenPath(token);
  return origin ? `${origin.replace(/\/+$/, '')}${path}` : path;
}

export type LaunchpadBucketId = 'new' | 'bonding' | 'bonded';

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
  source: 'mobula';
  updatedAt: string;
  providers: MarketProviderSnapshot[];
}

export type SortKey = 'trending' | 'new' | 'gainers' | 'volume' | 'm5' | 'h1' | 'h6' | 'h24';

export interface FetchMarketsOptions {
  chain?: string;
  q?: string;
  sort?: SortKey;
  limit?: number;
  enrich?: boolean;
  all?: boolean;
  signal?: AbortSignal;
}

export interface FetchLaunchpadPulseOptions {
  chain?: string;
  limit?: number;
  signal?: AbortSignal;
}

export interface BundleViewPointsResponse {
  source: 'bundle_detection';
  awarded: boolean;
  points: number;
  basePoints?: number;
  action?: string;
  reason?: string;
  updatedAt: string;
}

function apiUrl(path: string): string {
  const rawBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  const baseUrl = rawBaseUrl ? rawBaseUrl.replace(/\/+$/, '') : '';
  return baseUrl ? `${baseUrl}/api${path}` : `/api${path}`;
}

interface ClientCacheEntry<T> {
  data: T;
  freshUntil: number;
  staleUntil: number;
}

const apiResponseCache = new Map<string, ClientCacheEntry<unknown>>();
const pendingApiRequests = new Map<string, Promise<unknown>>();

function cacheWindowForPath(path: string): { ttlMs: number; staleMs: number } | null {
  if (path.startsWith('/markets/token/')) return { ttlMs: 2_500, staleMs: 45_000 };
  if (path.startsWith('/markets/signals')) return { ttlMs: 10_000, staleMs: 90_000 };
  if (path.startsWith('/markets')) return { ttlMs: 5_000, staleMs: 60_000 };
  return null;
}

async function fetchJsonFromApi<T>(path: string, signal?: AbortSignal, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');

  const response = await fetch(apiUrl(path), {
    ...init,
    headers,
    signal,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

async function apiFetch<T>(path: string, signal?: AbortSignal, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const cacheWindow = method === 'GET' ? cacheWindowForPath(path) : null;
  const now = Date.now();

  if (!cacheWindow) return fetchJsonFromApi<T>(path, signal, init);

  const cached = apiResponseCache.get(path) as ClientCacheEntry<T> | undefined;
  if (cached && cached.freshUntil > now) return cached.data;

  const pending = pendingApiRequests.get(path) as Promise<T> | undefined;
  if (pending) {
    if (cached && cached.staleUntil > now) return cached.data;
    return pending;
  }

  const request = fetchJsonFromApi<T>(path, signal, init)
    .then((data) => {
      const savedAt = Date.now();
      apiResponseCache.set(path, {
        data,
        freshUntil: savedAt + cacheWindow.ttlMs,
        staleUntil: savedAt + cacheWindow.staleMs,
      });
      return data;
    })
    .finally(() => {
      pendingApiRequests.delete(path);
    });

  pendingApiRequests.set(path, request as Promise<unknown>);

  if (cached && cached.staleUntil > now) {
    void request.catch(() => undefined);
    return cached.data;
  }

  return request;
}

function queryString(params: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });

  const text = query.toString();
  return text ? `?${text}` : '';
}

export function fetchMarkets(options: FetchMarketsOptions = {}): Promise<MarketListResponse> {
  const { signal, ...params } = options;
  return apiFetch<MarketListResponse>(`/markets${queryString(params)}`, signal);
}

export function searchMarketTokens(query: string, signal?: AbortSignal): Promise<MarketToken[]> {
  if (!query.trim()) return Promise.resolve([]);
  return fetchMarkets({ q: query.trim(), limit: 12, signal }).then((response) => response.data);
}

export function fetchMarketSignals(limit = 12, signal?: AbortSignal): Promise<MarketSignalsResponse> {
  return apiFetch<MarketSignalsResponse>(`/markets/signals${queryString({ limit })}`, signal);
}

export function fetchLaunchpadPulse(options: FetchLaunchpadPulseOptions = {}): Promise<LaunchpadPulseResponse> {
  const { signal, ...params } = options;
  return apiFetch<LaunchpadPulseResponse>(`/launchpad/pulse${queryString(params)}`, signal);
}

export function fetchMarketDetail(
  chainId: string,
  tokenAddress: string,
  signal?: AbortSignal,
): Promise<MarketDetailResponse> {
  return apiFetch<MarketDetailResponse>(
    `/markets/token/${encodeURIComponent(chainId)}/${encodeURIComponent(tokenAddress)}`,
    signal,
  );
}

export function awardBundleDetailView(
  accessToken: string,
  chainId: string,
  tokenAddress: string,
  signal?: AbortSignal,
): Promise<BundleViewPointsResponse> {
  return apiFetch<BundleViewPointsResponse>(
    `/bundle-detection/${encodeURIComponent(chainId)}/${encodeURIComponent(tokenAddress)}/view`,
    signal,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );
}

export function fmtCompact(value?: number, options: { currency?: boolean; digits?: number } = {}) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a';
  const prefix = options.currency ? '$' : '';
  const digits = options.digits ?? 2;

  if (Math.abs(value) >= 1_000_000_000) return `${prefix}${(value / 1_000_000_000).toFixed(digits)}B`;
  if (Math.abs(value) >= 1_000_000) return `${prefix}${(value / 1_000_000).toFixed(digits)}M`;
  if (Math.abs(value) >= 1_000) return `${prefix}${(value / 1_000).toFixed(1)}K`;
  if (options.currency && Math.abs(value) < 0.01) return `${prefix}${value.toFixed(8)}`;
  if (options.currency) return `${prefix}${value.toFixed(value >= 1 ? 2 : 6)}`;
  return value.toFixed(digits);
}

export function fmtPrice(value?: number) {
  return fmtCompact(value, { currency: true });
}

export function fmtPct(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export function fmtAge(minutes?: number) {
  if (typeof minutes !== 'number') return 'n/a';
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)}h`;
  if (minutes < 30 * 24 * 60) return `${Math.round(minutes / (24 * 60))}d`;
  return `${Math.round(minutes / (30 * 24 * 60))}mo`;
}

export function marketPairLabel(token: MarketToken) {
  return `${token.symbol}/${token.quoteSymbol || token.chainLabel}`;
}
