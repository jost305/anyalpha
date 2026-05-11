import type { MarketProvider, MarketProviderSnapshot, MarketToken, MarketTokenLink } from "./types";

export interface MarketEnrichment {
  provider: MarketProvider;
  tokenAddress: string;
  chainId: string;
  status?: MarketProviderSnapshot["status"];
  label: string;
  detail?: string;
  value?: string;
  updatedAt?: string;
  name?: string;
  symbol?: string;
  description?: string;
  imageUrl?: string;
  links?: MarketTokenLink[];
  priceUsd?: number;
  marketCap?: number;
  fdv?: number;
  liquidityUsd?: number;
  volume24h?: number;
  priceChange24h?: number;
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
  riskFlags?: string[];
}

export interface ProviderBatchResult {
  enrichments: MarketEnrichment[];
  snapshot: MarketProviderSnapshot;
}

export const DEX_PROVIDER: MarketProviderSnapshot = {
  provider: "dexscreener",
  status: "live",
  label: "DexScreener",
  detail: "Discovery, pairs, liquidity, volume, and transaction activity.",
};

export function env(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

export function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function boolish(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return undefined;
}

export function uniqueLinks(links: MarketTokenLink[]): MarketTokenLink[] {
  const seen = new Set<string>();

  return links.filter((link) => {
    if (!link.url || seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}

export function mergeProviderSnapshot(
  snapshots: MarketProviderSnapshot[],
  snapshot: MarketProviderSnapshot,
): MarketProviderSnapshot[] {
  const next = snapshots.filter((item) => item.provider !== snapshot.provider);
  next.push(snapshot);
  return next;
}

export function withDexProvider(token: MarketToken): MarketToken {
  return {
    ...token,
    providers: mergeProviderSnapshot(token.providers ?? [], DEX_PROVIDER),
  };
}

export function tokenKey(chainId: string, tokenAddress: string): string {
  return `${chainId.toLowerCase()}:${tokenAddress.toLowerCase()}`;
}

export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 12_000,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      "user-agent": "AnyAlphaTerminal/0.1",
      ...init.headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}
