import type { MarketToken } from "./types";
import {
  env,
  fetchJson,
  numeric,
  type MarketEnrichment,
  type ProviderBatchResult,
} from "./provider-utils";

interface AlchemyPriceResponse {
  data?: Array<{
    network?: string;
    address?: string;
    prices?: Array<{
      currency?: string;
      value?: string;
      lastUpdatedAt?: string;
    }>;
    error?: string;
  }>;
}

interface AlchemyMetadataResponse {
  result?: {
    name?: string;
    symbol?: string;
    decimals?: number;
    logo?: string;
  };
  error?: {
    message?: string;
  };
}

const networkMap: Record<string, string> = {
  ethereum: "eth-mainnet",
  base: "base-mainnet",
  arbitrum: "arb-mainnet",
  polygon: "polygon-mainnet",
  optimism: "opt-mainnet",
};

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function fetchMetadata(key: string, token: MarketToken): Promise<MarketEnrichment | null> {
  const network = networkMap[token.chainId];
  if (!network) return null;

  const response = await fetchJson<AlchemyMetadataResponse>(
    `https://${network}.g.alchemy.com/v2/${encodeURIComponent(key)}`,
    {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `anyalpha-${token.tokenAddress}`,
        method: "alchemy_getTokenMetadata",
        params: [token.tokenAddress],
      }),
    },
    10_000,
  );

  if (response.error) throw new Error(response.error.message ?? "Alchemy metadata RPC error");
  if (!response.result) return null;

  return {
    provider: "alchemy",
    status: "live",
    label: "Alchemy",
    detail: "EVM token metadata from Token API.",
    value: response.result.decimals !== undefined ? `${response.result.decimals} decimals` : undefined,
    updatedAt: new Date().toISOString(),
    chainId: token.chainId,
    tokenAddress: token.tokenAddress,
    name: response.result.name,
    symbol: response.result.symbol,
    imageUrl: response.result.logo,
  };
}

export async function fetchAlchemyEnrichments(tokens: MarketToken[]): Promise<ProviderBatchResult> {
  const key = env("ALCHEMY_API_KEY");
  const evmTokens = tokens.filter((token) => Boolean(networkMap[token.chainId]));

  if (!evmTokens.length) {
    return {
      enrichments: [],
      snapshot: {
        provider: "alchemy",
        status: "skipped",
        label: "Alchemy",
        detail: "No supported Alchemy EVM network rows in this batch.",
      },
    };
  }

  if (!key) {
    return {
      enrichments: [],
      snapshot: {
        provider: "alchemy",
        status: "missing_key",
        label: "Alchemy",
        detail: "Set ALCHEMY_API_KEY for EVM price cross-checks and metadata.",
      },
    };
  }

  try {
    const priceRequests = chunk(evmTokens, 25).map((batch) =>
      fetchJson<AlchemyPriceResponse>(
        `https://api.g.alchemy.com/prices/v1/${encodeURIComponent(key)}/tokens/by-address`,
        {
          method: "POST",
          body: JSON.stringify({
            addresses: batch.map((token) => ({
              network: networkMap[token.chainId],
              address: token.tokenAddress,
            })),
          }),
        },
        12_000,
      ),
    );

    const priceResponses = await Promise.all(priceRequests);
    const priceEnrichments = priceResponses.flatMap((response) =>
      (response.data ?? [])
        .filter((row) => row.address && !row.error)
        .map((row): MarketEnrichment => {
          const usd = row.prices?.find((price) => price.currency === "usd" || price.currency === "USD");
          const token = evmTokens.find(
            (candidate) =>
              candidate.tokenAddress.toLowerCase() === row.address?.toLowerCase() &&
              networkMap[candidate.chainId] === row.network,
          );

          return {
            provider: "alchemy",
            status: "live",
            label: "Alchemy",
            detail: "EVM price cross-check from Prices API.",
            value: usd?.lastUpdatedAt ? `price ${new Date(usd.lastUpdatedAt).toLocaleTimeString("en-US")}` : undefined,
            updatedAt: usd?.lastUpdatedAt ?? new Date().toISOString(),
            chainId: token?.chainId ?? row.network ?? "",
            tokenAddress: row.address ?? "",
            priceUsd: numeric(usd?.value),
          };
        }),
    );

    const metadataLimit = Math.max(0, Math.min(20, Number(env("ALCHEMY_METADATA_LIMIT") ?? "8")));
    const metadata = await Promise.all(
      evmTokens.slice(0, metadataLimit).map((token) => fetchMetadata(key, token).catch(() => null)),
    );
    const enrichments = [...priceEnrichments, ...metadata.filter((item): item is MarketEnrichment => item !== null)];

    return {
      enrichments,
      snapshot: {
        provider: "alchemy",
        status: "live",
        label: "Alchemy",
        detail: "EVM price and metadata enrichment active.",
        value: `${priceEnrichments.length}/${evmTokens.length} price checks`,
        updatedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      enrichments: [],
      snapshot: {
        provider: "alchemy",
        status: "error",
        label: "Alchemy",
        detail: err instanceof Error ? err.message : "Alchemy enrichment failed.",
      },
    };
  }
}
