import type { MarketToken, MarketTokenHolderPosition } from "./types";
import { fetchJson, numeric } from "./provider-utils";

interface BlockscoutAddressTag {
  name?: string;
  tagType?: string;
}

interface BlockscoutAddress {
  hash?: string;
  ens_domain_name?: string | null;
  is_contract?: boolean;
  is_verified?: boolean;
  name?: string | null;
  metadata?: {
    tags?: BlockscoutAddressTag[];
  } | null;
}

interface BlockscoutHolder {
  address?: BlockscoutAddress;
  address_hash?: BlockscoutAddress;
  value?: string;
}

interface BlockscoutHoldersResponse {
  items?: BlockscoutHolder[];
}

interface BlockscoutTokenResponse {
  decimals?: string | number;
  total_supply?: string;
}

interface BlockscoutCountersResponse {
  token_holders_count?: string;
}

interface BlockscoutHolderPositionsResult {
  holders: MarketTokenHolderPosition[];
  totalCount?: number;
}

const blockscoutBaseUrls: Record<string, string> = {
  base: "https://base.blockscout.com",
  ethereum: "https://eth.blockscout.com",
  optimism: "https://optimism.blockscout.com",
};

function rawAmount(value: string | undefined, decimals: number): number | undefined {
  if (!value) return undefined;

  try {
    const amount = Number(BigInt(value)) / 10 ** decimals;
    return Number.isFinite(amount) && amount > 0 ? amount : undefined;
  } catch {
    return numeric(value);
  }
}

function holderAddress(holder: BlockscoutHolder): BlockscoutAddress | undefined {
  return holder.address ?? holder.address_hash;
}

function holderLabels(address: BlockscoutAddress | undefined): string[] {
  const labels = new Set<string>();
  if (address?.is_contract) labels.add("contract");
  if (address?.is_verified) labels.add("verified");

  for (const tag of address?.metadata?.tags ?? []) {
    if (tag.name && tag.tagType !== "note") labels.add(tag.name);
  }

  return Array.from(labels).slice(0, 4);
}

export async function fetchBlockscoutHolderPositions(
  token: MarketToken,
  limit = 50,
): Promise<BlockscoutHolderPositionsResult> {
  const baseUrl = blockscoutBaseUrls[token.chainId.trim().toLowerCase()];
  if (!baseUrl || !token.tokenAddress) {
    return {
      holders: [],
    };
  }

  try {
    const boundedLimit = Math.max(1, Math.min(50, Math.round(limit)));
    const tokenPath = `/api/v2/tokens/${encodeURIComponent(token.tokenAddress)}`;
    const [tokenInfo, counters, holdersResponse] = await Promise.all([
      fetchJson<BlockscoutTokenResponse>(`${baseUrl}${tokenPath}`, {}, 12_000),
      fetchJson<BlockscoutCountersResponse>(`${baseUrl}${tokenPath}/counters`, {}, 12_000).catch(() => null),
      fetchJson<BlockscoutHoldersResponse>(`${baseUrl}${tokenPath}/holders`, {}, 12_000),
    ]);
    const decimals = numeric(tokenInfo.decimals) ?? 18;
    const totalSupply = rawAmount(tokenInfo.total_supply, decimals);
    const holders = (holdersResponse.items ?? [])
      .slice(0, boundedLimit)
      .map((holder): MarketTokenHolderPosition | null => {
        const address = holderAddress(holder);
        const walletAddress = address?.hash;
        if (!walletAddress) return null;

        const tokenAmount = rawAmount(holder.value, decimals);
        if (!tokenAmount) return null;

        const labels = holderLabels(address);
        const tokenAmountUsd = typeof token.priceUsd === "number" ? tokenAmount * token.priceUsd : undefined;
        const percentageOfTotalSupply = totalSupply ? (tokenAmount / totalSupply) * 100 : undefined;

        return {
          walletAddress,
          tokenAmount,
          tokenAmountUsd,
          percentageOfTotalSupply,
          labels,
          walletMetadata: {
            entityName: address.ens_domain_name ?? address.name ?? undefined,
            entityLabels: labels,
          },
          platform: {
            id: "blockscout",
            name: "Blockscout",
          },
        };
      })
      .filter((holder): holder is MarketTokenHolderPosition => holder !== null);

    return {
      holders,
      totalCount: numeric(counters?.token_holders_count),
    };
  } catch {
    return {
      holders: [],
    };
  }
}
