export const alertSources = [
  "manual",
  "helius",
  "moralis",
  "alchemy",
  "dexscreener",
  "mobula",
] as const;

export type AlertSource = (typeof alertSources)[number];

export const alertChains = [
  "solana",
  "base",
  "ethereum",
  "arbitrum",
  "bsc",
  "ton",
  "monad",
  "other",
] as const;

export type AlertChain = (typeof alertChains)[number];

export const triggerKinds = [
  "new_pair",
  "large_buy",
  "volume_spike",
  "holder_growth",
  "price_breakout",
  "manual",
] as const;

export type TriggerKind = (typeof triggerKinds)[number];

export type RiskLevel = "low" | "medium" | "high";

export interface AlertToken {
  chain: AlertChain;
  symbol: string;
  address?: string;
  name?: string;
  pairAddress?: string;
  pairUrl?: string;
  dex?: string;
}

export interface AlertMarket {
  priceUsd?: number;
  liquidityUsd?: number;
  marketCapUsd?: number;
  volume24hUsd?: number;
  priceChange24hPct?: number;
  holderCount?: number;
  ageMinutes?: number;
  txns24h?: number;
  buys24h?: number;
  sells24h?: number;
  buyPressurePct?: number;
}

export interface AlertTrigger {
  kind: TriggerKind;
  amountUsd?: number;
  tokenAmount?: number;
  quoteAmount?: number;
  quoteSymbol?: string;
  txHash?: string;
  walletAddress?: string;
  description?: string;
}

export interface AlertSignal {
  source: AlertSource;
  token: AlertToken;
  market?: AlertMarket;
  trigger: AlertTrigger;
  narrativeTags?: string[];
  riskFlags?: string[];
  observedAt?: string;
}

export interface ScoredAlert {
  id: string;
  signal: AlertSignal;
  score: number;
  grade: "A" | "B" | "C" | "D";
  riskLevel: RiskLevel;
  reasons: string[];
  riskFlags: string[];
  createdAt: string;
}

export interface TelegramPublishResult {
  published: boolean;
  dryRun: boolean;
  chatId?: string;
  messageId?: number;
  reason?: string;
}
