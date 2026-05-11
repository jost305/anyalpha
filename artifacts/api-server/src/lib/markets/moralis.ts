import type { MarketToken } from "./types";
import {
  boolish,
  env,
  fetchJson,
  numeric,
  type MarketEnrichment,
  type ProviderBatchResult,
} from "./provider-utils";

interface MoralisPrice {
  tokenAddress?: string;
  token_address?: string;
  tokenName?: string;
  tokenSymbol?: string;
  tokenLogo?: string;
  tokenDecimals?: string;
  usdPrice?: number;
  usdPriceFormatted?: string;
  usdPrice24hrPercentChange?: number;
  "24hrPercentChange"?: string;
  pairTotalLiquidityUsd?: string;
  possibleSpam?: boolean | string;
  verifiedContract?: boolean;
  exchangeName?: string;
}

const chainMap: Record<string, string> = {
  ethereum: "eth",
  base: "base",
  arbitrum: "arbitrum",
  bsc: "bsc",
  polygon: "polygon",
  avalanche: "avalanche",
  optimism: "optimism",
};

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export async function fetchMoralisEnrichments(tokens: MarketToken[]): Promise<ProviderBatchResult> {
  const key = env("MORALIS_API_KEY");
  const evmTokens = tokens.filter((token) => Boolean(chainMap[token.chainId]));

  if (!evmTokens.length) {
    return {
      enrichments: [],
      snapshot: {
        provider: "moralis",
        status: "skipped",
        label: "Moralis",
        detail: "No supported EVM rows in this batch.",
      },
    };
  }

  if (!key) {
    return {
      enrichments: [],
      snapshot: {
        provider: "moralis",
        status: "missing_key",
        label: "Moralis",
        detail: "Set MORALIS_API_KEY for EVM price, liquidity, verified-contract, and spam checks.",
      },
    };
  }

  try {
    const requests: Array<Promise<MarketEnrichment[]>> = [];
    const grouped = new Map<string, MarketToken[]>();

    for (const token of evmTokens) {
      const chain = chainMap[token.chainId];
      const group = grouped.get(chain) ?? [];
      group.push(token);
      grouped.set(chain, group);
    }

    for (const [chain, group] of grouped) {
      for (const batch of chunk(group, 30)) {
        requests.push(
          fetchJson<MoralisPrice[]>(
            `https://deep-index.moralis.io/api/v2.2/erc20/prices?chain=${encodeURIComponent(chain)}`,
            {
              method: "POST",
              headers: {
                "x-api-key": key,
              },
              body: JSON.stringify({
                tokens: batch.map((token) => ({ token_address: token.tokenAddress })),
              }),
            },
            14_000,
          ).then((prices) =>
            (Array.isArray(prices) ? prices : []).map((price, index): MarketEnrichment => {
              const tokenAddress = price.tokenAddress ?? price.token_address ?? batch[index]?.tokenAddress ?? "";
              const possibleSpam = boolish(price.possibleSpam);

              return {
                provider: "moralis",
                status: "live",
                label: "Moralis",
                detail: "EVM token price, liquidity, metadata, verified-contract, and spam signals.",
                value: price.exchangeName,
                updatedAt: new Date().toISOString(),
                chainId: group[0]?.chainId ?? chain,
                tokenAddress,
                name: price.tokenName,
                symbol: price.tokenSymbol,
                imageUrl: price.tokenLogo,
                priceUsd: numeric(price.usdPrice ?? price.usdPriceFormatted),
                liquidityUsd: numeric(price.pairTotalLiquidityUsd),
                priceChange24h: numeric(price.usdPrice24hrPercentChange ?? price["24hrPercentChange"]),
                verifiedContract: price.verifiedContract,
                possibleSpam,
                riskFlags: [
                  ...(possibleSpam ? ["Moralis possible spam"] : []),
                  ...(price.verifiedContract === false ? ["Unverified contract"] : []),
                ],
              };
            }),
          ),
        );
      }
    }

    const enrichments = (await Promise.all(requests)).flat();

    return {
      enrichments,
      snapshot: {
        provider: "moralis",
        status: "live",
        label: "Moralis",
        detail: "EVM token enrichment active.",
        value: `${enrichments.length}/${evmTokens.length} enriched`,
        updatedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      enrichments: [],
      snapshot: {
        provider: "moralis",
        status: "error",
        label: "Moralis",
        detail: err instanceof Error ? err.message : "Moralis enrichment failed.",
      },
    };
  }
}
