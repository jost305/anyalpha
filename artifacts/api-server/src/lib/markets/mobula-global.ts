import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../logger";
import { env, fetchJson, numeric } from "./provider-utils";
import type { MarketListResponse, MarketProviderSnapshot } from "./types";

interface MobulaAllAsset {
  id?: number | string;
  market_cap?: number | string;
  blockchains?: string[];
}

interface MobulaAllResponse {
  data?: MobulaAllAsset[];
}

interface MobulaPairToken {
  address?: string;
  chainId?: string;
  marketCap?: number | string;
  marketCapDiluted?: number | string;
}

interface MobulaPairRecord {
  volume_24h?: number | string;
  trades_24h?: number | string;
  pair?: {
    address?: string;
    blockchain?: string;
    token0?: MobulaPairToken;
    token1?: MobulaPairToken;
  };
}

interface MobulaBlockchainPairsResponse {
  data?: MobulaPairRecord[] | null;
}

interface StoredMobulaGlobalSnapshot {
  version: 1;
  updatedAt: string;
  aggregates: MarketListResponse["aggregates"];
  assetCount: number;
  chainCount: number;
  coveredChains: number;
  pageCount: number;
}

export interface MobulaGlobalAggregatesSnapshot {
  updatedAt: string;
  aggregates: MarketListResponse["aggregates"];
  providerSnapshot: MarketProviderSnapshot;
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = findWorkspaceRoot();
const cacheFilePath = path.join(workspaceRoot, ".local", "mobula-global-aggregates.json");
const PAGE_LIMIT = 100;
const REQUEST_CONCURRENCY = clampInt(Number(env("MOBULA_GLOBAL_AGGREGATES_CONCURRENCY") ?? 3), 1, 8);
const PAGE_BATCH_SIZE = clampInt(Number(env("MOBULA_GLOBAL_AGGREGATES_PAGE_BATCH_SIZE") ?? 4), 1, 10);
const STALE_AFTER_MS = clampInt(Number(env("MOBULA_GLOBAL_AGGREGATES_TTL_MS") ?? 21_600_000), 300_000, 86_400_000);
const CHECK_INTERVAL_MS = clampInt(
  Number(env("MOBULA_GLOBAL_AGGREGATES_CHECK_INTERVAL_MS") ?? 900_000),
  60_000,
  86_400_000,
);
const ENABLED = env("MOBULA_GLOBAL_AGGREGATES_ENABLED") !== "false";

let cachedSnapshot = readSnapshotFromDisk();
let pendingRefresh: Promise<MobulaGlobalAggregatesSnapshot | null> | null = null;
let refreshTimer: NodeJS.Timeout | null = null;

function findWorkspaceRoot(): string {
  const candidates = [process.cwd(), moduleDir];

  for (const start of candidates) {
    let current = path.resolve(start);

    for (let depth = 0; depth <= 8; depth += 1) {
      if (existsSync(path.join(current, "pnpm-workspace.yaml"))) {
        return current;
      }

      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  return process.cwd();
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function baseUrl(): string {
  return env("MOBULA_API_BASE_URL") ?? (env("MOBULA_API_KEY") ? "https://api.mobula.io" : "https://demo-api.mobula.io");
}

function headers(): Record<string, string> {
  const key = env("MOBULA_API_KEY");
  return key ? { authorization: key } : {};
}

function isMainnetChain(name: string): boolean {
  const lower = name.toLowerCase();
  return !(
    lower.includes("testnet") ||
    lower.includes("devnet") ||
    lower.includes("sepolia") ||
    lower.includes("alfajores") ||
    lower.includes("bartio")
  );
}

function readSnapshotFromDisk(): MobulaGlobalAggregatesSnapshot | null {
  try {
    if (!existsSync(cacheFilePath)) return null;

    const raw = JSON.parse(readFileSync(cacheFilePath, "utf8")) as Partial<StoredMobulaGlobalSnapshot>;
    if (
      raw.version !== 1 ||
      !raw.updatedAt ||
      !raw.aggregates ||
      typeof raw.assetCount !== "number" ||
      typeof raw.chainCount !== "number" ||
      typeof raw.coveredChains !== "number" ||
      typeof raw.pageCount !== "number"
    ) {
      return null;
    }

    const storedSnapshot: StoredMobulaGlobalSnapshot = {
      version: 1,
      updatedAt: raw.updatedAt,
      aggregates: raw.aggregates,
      assetCount: raw.assetCount,
      chainCount: raw.chainCount,
      coveredChains: raw.coveredChains,
      pageCount: raw.pageCount,
    };

    return {
      updatedAt: storedSnapshot.updatedAt,
      aggregates: storedSnapshot.aggregates,
      providerSnapshot: providerSnapshot(storedSnapshot),
    };
  } catch {
    return null;
  }
}

function writeSnapshotToDisk(snapshot: StoredMobulaGlobalSnapshot): void {
  try {
    mkdirSync(path.dirname(cacheFilePath), { recursive: true });
    writeFileSync(cacheFilePath, JSON.stringify(snapshot, null, 2), "utf8");
  } catch (err) {
    logger.warn(
      { err, cacheFilePath },
      "Failed to persist Mobula global aggregate cache.",
    );
  }
}

function providerSnapshot(snapshot: Pick<StoredMobulaGlobalSnapshot, "updatedAt" | "aggregates" | "assetCount" | "chainCount" | "coveredChains" | "pageCount">): MarketProviderSnapshot {
  return {
    provider: "mobula",
    status: env("MOBULA_API_KEY") ? "live" : "demo",
    label: "Mobula",
    detail: `Global pair aggregate cache over ${snapshot.aggregates.pairCount.toLocaleString()} pairs and ${snapshot.aggregates.tokenCount.toLocaleString()} unique paired tokens across ${snapshot.coveredChains}/${snapshot.chainCount} active chains (${snapshot.pageCount.toLocaleString()} pages; ${snapshot.assetCount.toLocaleString()} assets used for chain discovery).`,
    value: `${snapshot.aggregates.pairCount.toLocaleString()} pairs`,
    updatedAt: snapshot.updatedAt,
  };
}

function snapshotAgeMs(snapshot: MobulaGlobalAggregatesSnapshot | null): number {
  if (!snapshot) return Number.POSITIVE_INFINITY;
  const updatedAtMs = Date.parse(snapshot.updatedAt);
  if (!Number.isFinite(updatedAtMs)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Date.now() - updatedAtMs);
}

async function fetchWithRetry<T>(url: string, timeoutMs: number): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetchJson<T>(
        url,
        {
          headers: headers(),
        },
        timeoutMs,
      );
    } catch (err) {
      lastError = err;
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Mobula request failed.");
}

async function fetchAllAssets(): Promise<{
  assetCount: number;
  chains: string[];
}> {
  const response = await fetchWithRetry<MobulaAllResponse>(
    `${baseUrl()}/api/1/all?fields=blockchains`,
    60_000,
  );
  const assets = Array.isArray(response.data) ? response.data : [];
  const chains = new Map<string, number>();

  for (const asset of assets) {
    for (const blockchain of asset.blockchains ?? []) {
      if (!blockchain || !isMainnetChain(blockchain)) continue;
      chains.set(blockchain, (chains.get(blockchain) ?? 0) + 1);
    }
  }

  return {
    assetCount: assets.length,
    chains: [...chains.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name),
  };
}

async function crawlChainPairs(chain: string): Promise<{
  chain: string;
  pairCount: number;
  volume24hUsd: number;
  txns24h: number;
  pages: number;
  tokenCaps: Map<string, number>;
}> {
  let offset = 0;
  let pairCount = 0;
  let volume24hUsd = 0;
  let txns24h = 0;
  let pages = 0;
  const tokenCaps = new Map<string, number>();

  while (true) {
    const offsets = Array.from({ length: PAGE_BATCH_SIZE }, (_, index) => offset + index * PAGE_LIMIT);
    const responses = await Promise.all(
      offsets.map(async (pageOffset) => {
        const params = new URLSearchParams({
          blockchain: chain,
          sortBy: "created_at",
          sortOrder: "asc",
          limit: String(PAGE_LIMIT),
          offset: String(pageOffset),
        });

        const response = await fetchWithRetry<MobulaBlockchainPairsResponse>(
          `${baseUrl()}/api/1/market/blockchain/pairs?${params.toString()}`,
          25_000,
        );

        return Array.isArray(response.data) ? response.data : [];
      }),
    );

    let reachedEnd = false;

    for (const rows of responses) {
      if (!rows.length) {
        reachedEnd = true;
        continue;
      }

      for (const row of rows) {
        pairCount += 1;
        volume24hUsd += numeric(row.volume_24h) ?? 0;
        txns24h += Math.round(numeric(row.trades_24h) ?? 0);

        const pair = row.pair;
        for (const token of [pair?.token0, pair?.token1]) {
          if (!token) continue;

          const address = token.address?.toLowerCase();
          const chainId = token.chainId?.toLowerCase();
          if (!address || !chainId) continue;

          const marketCap = numeric(token.marketCap) ?? numeric(token.marketCapDiluted);
          if (!marketCap) continue;

          const key = `${chainId}:${address}`;
          const existing = tokenCaps.get(key) ?? 0;
          if (marketCap > existing) {
            tokenCaps.set(key, marketCap);
          }
        }
      }

      pages += 1;
      if (rows.length < PAGE_LIMIT) {
        reachedEnd = true;
      }
    }

    if (reachedEnd) break;
    offset += PAGE_LIMIT * PAGE_BATCH_SIZE;
  }

  return {
    chain,
    pairCount,
    volume24hUsd,
    txns24h,
    pages,
    tokenCaps,
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!values.length) return [];

  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= values.length) return;
      results[index] = await worker(values[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => runWorker()),
  );

  return results;
}

async function buildSnapshot(): Promise<MobulaGlobalAggregatesSnapshot | null> {
  const startedAt = Date.now();
  const assets = await fetchAllAssets();

  if (!assets.chains.length) {
    return null;
  }

  let completed = 0;
  const chainResults = await mapWithConcurrency(assets.chains, REQUEST_CONCURRENCY, async (chain) => {
    const result = await crawlChainPairs(chain);
    completed += 1;

    if (completed === 1 || completed % 10 === 0 || completed === assets.chains.length) {
      logger.info(
        { completed, totalChains: assets.chains.length, chain, pairCount: result.pairCount, pages: result.pages },
        "Mobula global aggregate refresh progress.",
      );
    }

    return result;
  });
  const tokenCaps = new Map<string, number>();

  const aggregates = chainResults.reduce(
    (total, result) => {
      total.volume24hUsd += result.volume24hUsd;
      total.txns24h += result.txns24h;
      total.pairCount += result.pairCount;

      for (const [tokenKey, marketCap] of result.tokenCaps) {
        const existing = tokenCaps.get(tokenKey) ?? 0;
        if (marketCap > existing) {
          tokenCaps.set(tokenKey, marketCap);
        }
      }

      return total;
    },
    {
      marketCapUsd: 0,
      volume24hUsd: 0,
      txns24h: 0,
      pairCount: 0,
      tokenCount: 0,
    } satisfies MarketListResponse["aggregates"],
  );
  aggregates.marketCapUsd = [...tokenCaps.values()].reduce((sum, value) => sum + value, 0);
  aggregates.tokenCount = tokenCaps.size;

  const coveredChains = chainResults.filter((result) => result.pairCount > 0).length;
  const pageCount = chainResults.reduce((sum, result) => sum + result.pages, 0);
  const storedSnapshot: StoredMobulaGlobalSnapshot = {
    version: 1,
    updatedAt: new Date().toISOString(),
    aggregates,
    assetCount: assets.assetCount,
    chainCount: assets.chains.length,
    coveredChains,
    pageCount,
  };
  const durationMs = Date.now() - startedAt;

  logger.info(
    {
      durationMs,
      assetCount: assets.assetCount,
      chainCount: assets.chains.length,
      coveredChains,
      pairCount: aggregates.pairCount,
      tokenCount: aggregates.tokenCount,
      pageCount,
    },
    "Mobula global aggregate refresh completed.",
  );

  writeSnapshotToDisk(storedSnapshot);

  return {
    updatedAt: storedSnapshot.updatedAt,
    aggregates: storedSnapshot.aggregates,
    providerSnapshot: providerSnapshot(storedSnapshot),
  };
}

export async function refreshMobulaGlobalAggregates(
  options: { force?: boolean } = {},
): Promise<MobulaGlobalAggregatesSnapshot | null> {
  if (!ENABLED) {
    return cachedSnapshot;
  }

  if (!options.force && cachedSnapshot && snapshotAgeMs(cachedSnapshot) < STALE_AFTER_MS) {
    return cachedSnapshot;
  }

  if (pendingRefresh) return pendingRefresh;

  pendingRefresh = buildSnapshot()
    .then((snapshot) => {
      if (snapshot) {
        cachedSnapshot = snapshot;
      }
      return snapshot;
    })
    .catch((err) => {
      logger.warn({ err }, "Mobula global aggregate refresh failed.");
      return cachedSnapshot;
    })
    .finally(() => {
      pendingRefresh = null;
    });

  return pendingRefresh;
}

export async function getMobulaGlobalAggregates(): Promise<MobulaGlobalAggregatesSnapshot | null> {
  if (!ENABLED) {
    return cachedSnapshot;
  }

  if (cachedSnapshot && snapshotAgeMs(cachedSnapshot) < STALE_AFTER_MS) {
    return cachedSnapshot;
  }

  if (!pendingRefresh) {
    void refreshMobulaGlobalAggregates();
  }

  return cachedSnapshot;
}

export function startMobulaGlobalAggregateWorker(): void {
  if (refreshTimer) return;

  if (!ENABLED) {
    logger.info("Mobula global aggregate worker is disabled");
    return;
  }

  void refreshMobulaGlobalAggregates();
  refreshTimer = setInterval(() => {
    if (pendingRefresh) return;
    if (cachedSnapshot && snapshotAgeMs(cachedSnapshot) < STALE_AFTER_MS) return;
    void refreshMobulaGlobalAggregates();
  }, CHECK_INTERVAL_MS);

  if (typeof refreshTimer.unref === "function") {
    refreshTimer.unref();
  }
}
