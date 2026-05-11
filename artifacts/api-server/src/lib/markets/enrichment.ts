import { fetchAlchemyEnrichments } from "./alchemy";
import { fetchHeliusEnrichments } from "./helius";
import { fetchMobulaEnrichments } from "./mobula";
import { fetchMoralisEnrichments } from "./moralis";
import type { MarketProviderSnapshot, MarketToken, MarketTokenLink, MarketTokenSecurity } from "./types";
import {
  DEX_PROVIDER,
  mergeProviderSnapshot,
  tokenKey,
  uniqueLinks,
  withDexProvider,
  type MarketEnrichment,
  type ProviderBatchResult,
} from "./provider-utils";

export interface EnrichedMarkets {
  markets: MarketToken[];
  providers: MarketProviderSnapshot[];
}

function enrichmentLimit(): number {
  const raw = Number(process.env.MARKET_ENRICHMENT_LIMIT ?? "12");
  if (!Number.isFinite(raw)) return 12;
  return Math.max(0, Math.min(50, Math.floor(raw)));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function chainAliases(chainId: string): string[] {
  const lower = chainId.toLowerCase();
  const aliases: Record<string, string[]> = {
    bnb: ["bsc", "bnb", "evm:56"],
    bsc: ["bsc", "bnb", "evm:56"],
    ethereum: ["ethereum", "evm:1"],
    "evm:1": ["ethereum", "evm:1"],
    base: ["base", "evm:8453"],
    "evm:8453": ["base", "evm:8453"],
    arbitrum: ["arbitrum", "evm:42161"],
    "evm:42161": ["arbitrum", "evm:42161"],
    polygon: ["polygon", "evm:137"],
    "evm:137": ["polygon", "evm:137"],
    avalanche: ["avalanche", "evm:43114"],
    "evm:43114": ["avalanche", "evm:43114"],
    optimism: ["optimism", "evm:10"],
    "evm:10": ["optimism", "evm:10"],
    solana: ["solana", "solana:solana"],
    "solana:solana": ["solana", "solana:solana"],
    ton: ["ton", "ton:mainnet"],
    "ton:mainnet": ["ton", "ton:mainnet"],
  };

  if (aliases[lower]) return aliases[lower];
  return [lower];
}

function scoreAfterEnrichment(token: MarketToken): number {
  let score = token.signalScore;
  const security = token.security;

  if (security?.holderCount && security.holderCount >= 1_000) score += 3;
  if (security?.holderCount && security.holderCount >= 10_000) score += 3;
  if (security?.verifiedContract) score += 4;
  if (security?.renounced) score += 2;
  if (security?.mintAuthorityDisabled) score += 2;
  if (security?.freezeAuthorityDisabled) score += 2;
  if (security?.possibleSpam) score -= 15;
  if (security?.top10HolderPct && security.top10HolderPct > 50) score -= 8;
  if (token.riskFlags.length >= 3) score -= 6;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function mergeSecurity(
  current: MarketTokenSecurity | undefined,
  enrichment: MarketEnrichment,
): MarketTokenSecurity | undefined {
  const next: MarketTokenSecurity = {
    ...(current ?? {}),
  };

  if (enrichment.holderCount !== undefined) next.holderCount = enrichment.holderCount;
  if (enrichment.top10HolderPct !== undefined) next.top10HolderPct = enrichment.top10HolderPct;
  if (enrichment.buyTax !== undefined) next.buyTax = enrichment.buyTax;
  if (enrichment.sellTax !== undefined) next.sellTax = enrichment.sellTax;
  if (enrichment.liquidityBurnPct !== undefined) next.liquidityBurnPct = enrichment.liquidityBurnPct;
  if (enrichment.mintAuthorityDisabled !== undefined) next.mintAuthorityDisabled = enrichment.mintAuthorityDisabled;
  if (enrichment.freezeAuthorityDisabled !== undefined) next.freezeAuthorityDisabled = enrichment.freezeAuthorityDisabled;
  if (enrichment.renounced !== undefined) next.renounced = enrichment.renounced;
  if (enrichment.verifiedContract !== undefined) next.verifiedContract = enrichment.verifiedContract;
  if (enrichment.possibleSpam !== undefined) next.possibleSpam = enrichment.possibleSpam;

  return Object.keys(next).length ? next : undefined;
}

function mergeToken(token: MarketToken, enrichment: MarketEnrichment): MarketToken {
  const providerSnapshot: MarketProviderSnapshot = {
    provider: enrichment.provider,
    status: enrichment.status ?? "live",
    label: enrichment.label,
    detail: enrichment.detail,
    value: enrichment.value,
    updatedAt: enrichment.updatedAt,
  };

  const next: MarketToken = {
    ...token,
    name: token.name || enrichment.name || token.symbol,
    symbol: token.symbol || enrichment.symbol || token.symbol,
    description: token.description ?? enrichment.description,
    imageUrl: token.imageUrl ?? enrichment.imageUrl,
    priceUsd: token.priceUsd ?? enrichment.priceUsd,
    marketCap: token.marketCap ?? enrichment.marketCap,
    fdv: token.fdv ?? enrichment.fdv,
    liquidityUsd: token.liquidityUsd ?? enrichment.liquidityUsd,
    volume: {
      ...token.volume,
      h24: token.volume.h24 ?? enrichment.volume24h,
    },
    priceChange: {
      ...token.priceChange,
      h24: token.priceChange.h24 ?? enrichment.priceChange24h,
    },
    links: uniqueLinks([...token.links, ...(enrichment.links ?? [])] as MarketTokenLink[]),
    riskFlags: uniqueStrings([...token.riskFlags, ...(enrichment.riskFlags ?? [])]),
    providers: mergeProviderSnapshot(token.providers ?? [], providerSnapshot),
    security: mergeSecurity(token.security, enrichment),
  };

  return {
    ...next,
    signalScore: scoreAfterEnrichment(next),
  };
}

function applyEnrichments(markets: MarketToken[], enrichments: MarketEnrichment[]): MarketToken[] {
  const byExactKey = new Map(markets.map((market) => [tokenKey(market.chainId, market.tokenAddress), market.id]));
  const byAddress = new Map<string, string[]>();

  for (const market of markets) {
    const key = market.tokenAddress.toLowerCase();
    const ids = byAddress.get(key) ?? [];
    ids.push(market.id);
    byAddress.set(key, ids);
  }

  const byId = new Map(markets.map((market) => [market.id, withDexProvider(market)]));

  for (const enrichment of enrichments) {
    const exactId = chainAliases(enrichment.chainId)
      .map((chainId) => byExactKey.get(tokenKey(chainId, enrichment.tokenAddress)))
      .find((id): id is string => Boolean(id));
    const addressMatches = byAddress.get(enrichment.tokenAddress.toLowerCase()) ?? [];
    const id = exactId ?? (addressMatches.length === 1 ? addressMatches[0] : undefined);

    if (!id) continue;

    const current = byId.get(id);
    if (!current) continue;
    byId.set(id, mergeToken(current, enrichment));
  }

  return markets.map((market) => byId.get(market.id) ?? withDexProvider(market));
}

export async function enrichMarkets(markets: MarketToken[]): Promise<EnrichedMarkets> {
  const limit = enrichmentLimit();
  const target = limit > 0 ? markets.slice(0, limit) : [];

  if (!target.length) {
    return {
      markets: markets.map(withDexProvider),
      providers: [DEX_PROVIDER],
    };
  }

  const results: ProviderBatchResult[] = await Promise.all([
    fetchMobulaEnrichments(target),
    fetchHeliusEnrichments(target),
    fetchMoralisEnrichments(target),
    fetchAlchemyEnrichments(target),
  ]);

  const enrichments = results.flatMap((result) => result.enrichments);
  const providerSnapshots = results.map((result) => result.snapshot);

  return {
    markets: applyEnrichments(markets, enrichments),
    providers: [DEX_PROVIDER, ...providerSnapshots],
  };
}
