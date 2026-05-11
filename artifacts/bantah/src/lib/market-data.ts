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

export type MarketProvider = 'dexscreener' | 'mobula' | 'helius' | 'moralis' | 'alchemy';
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
  trades: MarketTokenTrade[];
  holders: MarketTokenHolderPosition[];
  holdersTotal?: number;
  source: 'aggregated';
  updatedAt: string;
  providers: MarketProviderSnapshot[];
}

export type SortKey = 'trending' | 'new' | 'gainers' | 'volume' | 'm5' | 'h1' | 'h6' | 'h24';

export interface FetchMarketsOptions {
  chain?: string;
  q?: string;
  sort?: SortKey;
  limit?: number;
  signal?: AbortSignal;
}

async function apiFetch<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

function queryString(params: Record<string, string | number | undefined>): string {
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
