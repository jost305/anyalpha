import type { MarketToken } from "./types";
import {
  env,
  fetchJson,
  numeric,
  type MarketEnrichment,
  type ProviderBatchResult,
} from "./provider-utils";

interface HeliusAsset {
  id?: string;
  content?: {
    files?: Array<{ uri?: string; cdn_uri?: string }>;
    metadata?: {
      name?: string;
      symbol?: string;
      description?: string;
      image?: string;
      external_url?: string;
    };
  };
  authorities?: Array<{ address?: string; scopes?: string[] }>;
  token_info?: {
    supply?: number;
    decimals?: number;
    token_program?: string;
    mint_authority?: string | null;
    freeze_authority?: string | null;
    price_info?: {
      price_per_token?: number;
      currency?: string;
    };
  };
}

type HeliusRpcResponse =
  | HeliusAsset[]
  | {
      result?: HeliusAsset[];
      error?: {
        message?: string;
      };
    };

export async function fetchHeliusEnrichments(tokens: MarketToken[]): Promise<ProviderBatchResult> {
  const key = env("HELIUS_API_KEY");
  const solanaTokens = tokens.filter((token) => token.chainId === "solana");

  if (!solanaTokens.length) {
    return {
      enrichments: [],
      snapshot: {
        provider: "helius",
        status: "skipped",
        label: "Helius",
        detail: "No Solana rows in this batch.",
      },
    };
  }

  if (!key) {
    return {
      enrichments: [],
      snapshot: {
        provider: "helius",
        status: "missing_key",
        label: "Helius",
        detail: "Set HELIUS_API_KEY to enrich Solana token metadata and authority flags.",
      },
    };
  }

  try {
    const response = await fetchJson<HeliusRpcResponse>(
      `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "anyalpha-market-enrichment",
          method: "getAssetBatch",
          params: {
            ids: solanaTokens.map((token) => token.tokenAddress).slice(0, 100),
            options: {
              showFungible: true,
            },
          },
        }),
      },
      14_000,
    );

    if (!Array.isArray(response) && response.error) {
      throw new Error(response.error.message ?? "Helius RPC error");
    }

    const assets = Array.isArray(response) ? response : (response.result ?? []);
    const enrichments = assets
      .map((asset): MarketEnrichment | null => {
        if (!asset.id) return null;

        const price = numeric(asset.token_info?.price_info?.price_per_token);
        const metadata = asset.content?.metadata;
        const image = metadata?.image ?? asset.content?.files?.[0]?.cdn_uri ?? asset.content?.files?.[0]?.uri;
        const externalUrl = metadata?.external_url;

        return {
          provider: "helius",
          status: "live",
          label: "Helius",
          detail: "Solana DAS metadata, token program, cached price, and mint authority flags.",
          value: asset.token_info?.token_program,
          updatedAt: new Date().toISOString(),
          chainId: "solana",
          tokenAddress: asset.id,
          name: metadata?.name,
          symbol: metadata?.symbol,
          description: metadata?.description,
          imageUrl: image,
          links: externalUrl ? [{ type: "website", url: externalUrl }] : [],
          priceUsd: asset.token_info?.price_info?.currency === "USD" ? price : undefined,
          mintAuthorityDisabled: !asset.token_info?.mint_authority,
          freezeAuthorityDisabled: !asset.token_info?.freeze_authority,
          riskFlags: [
            ...(asset.token_info?.mint_authority ? ["Mint authority active"] : []),
            ...(asset.token_info?.freeze_authority ? ["Freeze authority active"] : []),
          ],
        };
      })
      .filter((item): item is MarketEnrichment => item !== null);

    return {
      enrichments,
      snapshot: {
        provider: "helius",
        status: "live",
        label: "Helius",
        detail: "Solana DAS enrichment active.",
        value: `${enrichments.length}/${solanaTokens.length} enriched`,
        updatedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      enrichments: [],
      snapshot: {
        provider: "helius",
        status: "error",
        label: "Helius",
        detail: err instanceof Error ? err.message : "Helius enrichment failed.",
      },
    };
  }
}
