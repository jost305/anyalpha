import type {
  MarketToken,
  MarketTokenHolderPosition,
  MarketTokenLink,
  MarketTokenTrade,
} from "./types";
import {
  env,
  fetchJson,
  numeric,
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
  priceUSD?: number;
  marketCapUSD?: number;
  marketCapDilutedUSD?: number;
  liquidityUSD?: number;
  volume24hUSD?: number;
  priceChange24hPercentage?: number;
  holdersCount?: number;
  top10HoldingsPercentage?: number;
  liquidityBurnPercentage?: number;
  socials?: {
    twitter?: string;
    website?: string;
    telegram?: string;
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
};

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
  return links;
}

function riskFlags(details: MobulaTokenDetails): string[] {
  const flags: string[] = [];
  const security = details.security;
  if (!security) return flags;

  if (security.isHoneypot) flags.push("Mobula honeypot flag");
  if (security.isBlacklisted) flags.push("Blacklist risk");
  if (security.transferPausable) flags.push("Transfers pausable");
  if (security.isMintable) flags.push("Mintable supply");
  if (security.lowLiquidity) flags.push("Mobula low liquidity");

  return flags;
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
      limit: String(Math.max(1, Math.min(40, limit))),
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
      limit: String(Math.max(1, Math.min(20, limit))),
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
