import { cacheNumberEnv, cachedJson } from "../cache/redis-cache";
import type { MarketEnrichment, ProviderBatchResult } from "./provider-utils";
import { env, numeric } from "./provider-utils";
import type { MarketToken } from "./types";

interface BitqueryTokenRow {
  Token?: {
    Address?: string;
    Name?: string;
    Network?: string;
    Symbol?: string;
  };
  Block?: {
    Timestamp?: string;
  };
  Volume?: {
    Usd?: number | string;
  };
  Supply?: {
    MarketCap?: number | string;
    FullyDilutedValuationUsd?: number | string;
  };
  Price?: {
    Ohlc?: {
      Close?: number | string;
    };
  };
}

interface BitqueryResponse {
  data?: {
    Trading?: {
      Tokens?: BitqueryTokenRow[];
    };
  };
  errors?: Array<{ message?: string }>;
}

const NETWORK_BY_CHAIN: Record<string, string> = {
  arbitrum: "Arbitrum",
  base: "Base",
  bsc: "BSC",
  ethereum: "Ethereum",
  optimism: "Optimism",
  polygon: "Matic",
  solana: "Solana",
};

function endpoint(): string {
  return env("BITQUERY_API_URL") ?? "https://streaming.bitquery.io/graphql";
}

function cacheTtlMs(): number {
  return cacheNumberEnv("BITQUERY_CACHE_TTL_MS", 3_000, 1_000, 60_000);
}

function staleCacheTtlMs(): number {
  return cacheNumberEnv("BITQUERY_STALE_CACHE_TTL_MS", 45_000, 5_000, 300_000);
}

function escapeGraphqlString(value: string): string {
  return JSON.stringify(value);
}

function query(network: string, address: string): string {
  return `{
    Trading {
      Tokens(
        where: {
          Token: {
            Address: { is: ${escapeGraphqlString(address)} }
            Network: { is: ${escapeGraphqlString(network)} }
          }
          Interval: { Time: { Duration: { eq: 1 } } }
          Volume: { Usd: { gt: 5 } }
        }
        limit: { count: 1 }
        orderBy: { descending: Block_Time }
      ) {
        Token {
          Address
          Name
          Network
          Symbol
        }
        Block {
          Timestamp
        }
        Volume {
          Usd
        }
        Supply {
          MarketCap
          FullyDilutedValuationUsd
        }
        Price {
          Ohlc {
            Close
          }
        }
      }
    }
  }`;
}

async function fetchToken(token: MarketToken): Promise<MarketEnrichment | null> {
  const key = env("BITQUERY_API_KEY");
  const network = NETWORK_BY_CHAIN[token.chainId.toLowerCase()];
  if (!key || !network) return null;

  const cacheKey = `bitquery:token:${network.toLowerCase()}:${token.tokenAddress.toLowerCase()}`;
  const response = await cachedJson({
    key: cacheKey,
    ttlMs: cacheTtlMs(),
    staleTtlMs: staleCacheTtlMs(),
    load: async () => {
      const raw = await fetch(endpoint(), {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
          "user-agent": "AnyAlphaTerminal/0.1",
        },
        body: JSON.stringify({ query: query(network, token.tokenAddress) }),
        signal: AbortSignal.timeout(cacheNumberEnv("BITQUERY_TIMEOUT_MS", 1_800, 750, 15_000)),
      });

      if (!raw.ok) throw new Error(`Bitquery request failed: ${raw.status} ${raw.statusText}`);

      const parsed = (await raw.json()) as BitqueryResponse;
      if (parsed.errors?.length) {
        throw new Error(parsed.errors.map((error) => error.message).filter(Boolean).join("; ") || "Bitquery GraphQL error");
      }
      return parsed;
    },
  });

  const row = response.data?.Trading?.Tokens?.[0];
  if (!row) return null;

  const priceUsd = numeric(row.Price?.Ohlc?.Close);
  const marketCap = numeric(row.Supply?.MarketCap);
  const fdv = numeric(row.Supply?.FullyDilutedValuationUsd);

  if (priceUsd === undefined && marketCap === undefined && fdv === undefined) return null;

  return {
    provider: "bitquery",
    status: "live",
    label: "Bitquery",
    detail: "Low-latency price, volume, and supply snapshots from Bitquery Trading Tokens.",
    value: row.Block?.Timestamp,
    updatedAt: row.Block?.Timestamp ?? new Date().toISOString(),
    chainId: token.chainId,
    tokenAddress: token.tokenAddress,
    name: row.Token?.Name,
    symbol: row.Token?.Symbol,
    priceUsd,
    marketCap,
    fdv,
  };
}

export async function fetchBitqueryEnrichments(tokens: MarketToken[]): Promise<ProviderBatchResult> {
  const key = env("BITQUERY_API_KEY");
  const supportedTokens = tokens.filter((token) => NETWORK_BY_CHAIN[token.chainId.toLowerCase()]);

  if (!supportedTokens.length) {
    return {
      enrichments: [],
      snapshot: {
        provider: "bitquery",
        status: "skipped",
        label: "Bitquery",
        detail: "No Bitquery-supported chains in this batch.",
      },
    };
  }

  if (!key) {
    return {
      enrichments: [],
      snapshot: {
        provider: "bitquery",
        status: "missing_key",
        label: "Bitquery",
        detail: "Set BITQUERY_API_KEY to add low-latency price and OHLC enrichment.",
      },
    };
  }

  try {
    const enrichments = (
      await Promise.all(supportedTokens.map((token) => fetchToken(token).catch(() => null)))
    ).filter((item): item is MarketEnrichment => item !== null);

    return {
      enrichments,
      snapshot: {
        provider: "bitquery",
        status: "live",
        label: "Bitquery",
        detail: "Trading Tokens enrichment active.",
        value: `${enrichments.length}/${supportedTokens.length} enriched`,
        updatedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      enrichments: [],
      snapshot: {
        provider: "bitquery",
        status: "error",
        label: "Bitquery",
        detail: err instanceof Error ? err.message : "Bitquery enrichment failed.",
      },
    };
  }
}
