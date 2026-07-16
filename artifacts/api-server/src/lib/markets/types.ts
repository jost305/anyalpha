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

export type MarketProvider = "dexscreener" | "mobula" | "geckoterminal" | "helius" | "moralis" | "alchemy" | "bitquery";

export type MarketProviderStatus = "live" | "demo" | "missing_key" | "skipped" | "error";

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

export type MarketBundleLabel = "bundled" | "organic" | "suspicious" | "unknown";

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
  source: "dexscreener";
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
  txns: Record<"m5" | "h1" | "h6" | "h24", MarketTxnStats>;
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
  source: "aggregated";
  updatedAt: string;
  providers: MarketProviderSnapshot[];
}

export interface MarketSignal {
  id: string;
  token: MarketToken;
  title: string;
  sentiment: "Bullish" | "Bearish" | "Watch";
  reason: string;
  tags: string[];
  score: number;
}

export interface MarketSignalsResponse {
  data: MarketSignal[];
  source: "aggregated";
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
  source: "aggregated";
  updatedAt: string;
  providers: MarketProviderSnapshot[];
}
