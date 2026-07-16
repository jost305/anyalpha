import { and, count, desc, eq } from "drizzle-orm";
import type {
  MarketProviderSnapshot,
  MarketToken,
  MarketTokenLink,
  MarketTokenSecurity,
  MarketTxnStats,
} from "../markets/types";

const MAX_WATCHLIST_ITEMS = 200;

export interface WatchlistItem {
  id: string;
  market: MarketToken;
  addedAt: string;
  updatedAt: string;
}

export interface WatchlistSnapshot {
  items: WatchlistItem[];
  total: number;
  updatedAt: string;
}

type DbModule = typeof import("@workspace/db");
type UserWatchlistItemRow = import("@workspace/db").UserWatchlistItemRow;

let dbModulePromise: Promise<DbModule> | null = null;

async function getDbModule(): Promise<DbModule> {
  if (dbModulePromise) return dbModulePromise;

  dbModulePromise = (async () => {
    const databaseUrl = (process.env["DATABASE_URL"] ?? "").trim();

    if (!databaseUrl) {
      throw new Error("DATABASE_URL must be configured to use Supabase watchlist storage.");
    }

    return import("@workspace/db");
  })();

  return dbModulePromise;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const normalized = normalizeString(entry);
    return normalized ? [normalized] : [];
  });
}

function normalizeLink(link: unknown): MarketTokenLink | null {
  if (!link || typeof link !== "object") return null;

  const url = normalizeString((link as { url?: unknown }).url);
  if (!url) return null;

  const type = normalizeString((link as { type?: unknown }).type);
  const label = normalizeString((link as { label?: unknown }).label);

  return {
    url,
    ...(type ? { type } : {}),
    ...(label ? { label } : {}),
  };
}

function normalizeProvider(provider: unknown): MarketProviderSnapshot | null {
  if (!provider || typeof provider !== "object") return null;

  const value = provider as Record<string, unknown>;
  const label = normalizeString(value.label);
  const snapshotProvider = normalizeString(value.provider);
  const status = normalizeString(value.status);

  if (!label || !snapshotProvider || !status) return null;

  return {
    provider: snapshotProvider as MarketProviderSnapshot["provider"],
    status: status as MarketProviderSnapshot["status"],
    label,
    ...(normalizeString(value.detail) ? { detail: normalizeString(value.detail) } : {}),
    ...(normalizeString(value.value) ? { value: normalizeString(value.value) } : {}),
    ...(normalizeString(value.updatedAt) ? { updatedAt: normalizeString(value.updatedAt) } : {}),
  };
}

function normalizeTxnBucket(value: unknown): MarketTxnStats {
  if (!value || typeof value !== "object") {
    return { buys: 0, sells: 0 };
  }

  const bucket = value as { buys?: unknown; sells?: unknown };
  return {
    buys: isFiniteNumber(bucket.buys) ? Math.max(0, Math.round(bucket.buys)) : 0,
    sells: isFiniteNumber(bucket.sells) ? Math.max(0, Math.round(bucket.sells)) : 0,
  };
}

function normalizeSecurity(value: unknown): MarketTokenSecurity | undefined {
  if (!value || typeof value !== "object") return undefined;

  const input = value as Record<string, unknown>;
  const security: MarketTokenSecurity = {};

  if (isFiniteNumber(input.holderCount)) security.holderCount = Math.round(input.holderCount);
  if (isFiniteNumber(input.top10HolderPct)) security.top10HolderPct = input.top10HolderPct;
  if (normalizeString(input.buyTax)) security.buyTax = normalizeString(input.buyTax);
  if (normalizeString(input.sellTax)) security.sellTax = normalizeString(input.sellTax);
  if (isFiniteNumber(input.liquidityBurnPct)) security.liquidityBurnPct = input.liquidityBurnPct;
  if (typeof input.mintAuthorityDisabled === "boolean") security.mintAuthorityDisabled = input.mintAuthorityDisabled;
  if (typeof input.freezeAuthorityDisabled === "boolean") security.freezeAuthorityDisabled = input.freezeAuthorityDisabled;
  if (typeof input.renounced === "boolean") security.renounced = input.renounced;
  if (typeof input.verifiedContract === "boolean") security.verifiedContract = input.verifiedContract;
  if (typeof input.possibleSpam === "boolean") security.possibleSpam = input.possibleSpam;

  return Object.keys(security).length > 0 ? security : undefined;
}

export function normalizeWatchlistMarket(value: unknown): MarketToken | null {
  if (!value || typeof value !== "object") return null;

  const input = value as Record<string, unknown>;
  const id = normalizeString(input.id);
  const chainId = normalizeString(input.chainId);
  const chainLabel = normalizeString(input.chainLabel);
  const dexId = normalizeString(input.dexId);
  const url = normalizeString(input.url);
  const pairAddress = normalizeString(input.pairAddress);
  const tokenAddress = normalizeString(input.tokenAddress);
  const name = normalizeString(input.name);
  const symbol = normalizeString(input.symbol);
  const quoteSymbol = normalizeString(input.quoteSymbol) ?? "";

  if (!id || !chainId || !chainLabel || !dexId || !url || !pairAddress || !tokenAddress || !name || !symbol) {
    return null;
  }

  const volumeInput = input.volume as Record<string, unknown> | undefined;
  const priceChangeInput = input.priceChange as Record<string, unknown> | undefined;
  const txnsInput = input.txns as Record<string, unknown> | undefined;

  return {
    id,
    chainId,
    chainLabel,
    dexId,
    url,
    pairAddress,
    tokenAddress,
    name,
    symbol,
    quoteSymbol,
    ...(isFiniteNumber(input.priceUsd) ? { priceUsd: input.priceUsd } : {}),
    ...(normalizeString(input.priceNative) ? { priceNative: normalizeString(input.priceNative) } : {}),
    ...(isFiniteNumber(input.marketCap) ? { marketCap: input.marketCap } : {}),
    ...(isFiniteNumber(input.fdv) ? { fdv: input.fdv } : {}),
    ...(isFiniteNumber(input.liquidityUsd) ? { liquidityUsd: input.liquidityUsd } : {}),
    volume: {
      ...(isFiniteNumber(volumeInput?.m5) ? { m5: volumeInput?.m5 } : {}),
      ...(isFiniteNumber(volumeInput?.h1) ? { h1: volumeInput?.h1 } : {}),
      ...(isFiniteNumber(volumeInput?.h6) ? { h6: volumeInput?.h6 } : {}),
      ...(isFiniteNumber(volumeInput?.h24) ? { h24: volumeInput?.h24 } : {}),
    },
    priceChange: {
      ...(isFiniteNumber(priceChangeInput?.m5) ? { m5: priceChangeInput?.m5 } : {}),
      ...(isFiniteNumber(priceChangeInput?.h1) ? { h1: priceChangeInput?.h1 } : {}),
      ...(isFiniteNumber(priceChangeInput?.h6) ? { h6: priceChangeInput?.h6 } : {}),
      ...(isFiniteNumber(priceChangeInput?.h24) ? { h24: priceChangeInput?.h24 } : {}),
    },
    txns: {
      m5: normalizeTxnBucket(txnsInput?.m5),
      h1: normalizeTxnBucket(txnsInput?.h1),
      h6: normalizeTxnBucket(txnsInput?.h6),
      h24: normalizeTxnBucket(txnsInput?.h24),
    },
    ...(isFiniteNumber(input.pairCreatedAt) ? { pairCreatedAt: input.pairCreatedAt } : {}),
    ...(isFiniteNumber(input.ageMinutes) ? { ageMinutes: input.ageMinutes } : {}),
    ...(normalizeString(input.imageUrl) ? { imageUrl: normalizeString(input.imageUrl) } : {}),
    ...(normalizeString(input.openGraph) ? { openGraph: normalizeString(input.openGraph) } : {}),
    ...(normalizeString(input.description) ? { description: normalizeString(input.description) } : {}),
    links: Array.isArray(input.links)
      ? input.links.flatMap((link) => {
          const normalizedLink = normalizeLink(link);
          return normalizedLink ? [normalizedLink] : [];
        })
      : [],
    ...(isFiniteNumber(input.boostAmount) ? { boostAmount: input.boostAmount } : {}),
    ...(normalizeString(input.profileUpdatedAt) ? { profileUpdatedAt: normalizeString(input.profileUpdatedAt) } : {}),
    narrativeTags: normalizeStringArray(input.narrativeTags),
    riskFlags: normalizeStringArray(input.riskFlags),
    signalScore: isFiniteNumber(input.signalScore) ? Math.round(input.signalScore) : 0,
    providers: Array.isArray(input.providers)
      ? input.providers.flatMap((provider) => {
          const normalizedProvider = normalizeProvider(provider);
          return normalizedProvider ? [normalizedProvider] : [];
        })
      : [],
    ...(normalizeSecurity(input.security) ? { security: normalizeSecurity(input.security) } : {}),
  };
}

function toIsoString(value: string | Date | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function toPublicItem(row: UserWatchlistItemRow): WatchlistItem | null {
  const market = normalizeWatchlistMarket(row.market);
  if (!market) return null;

  return {
    id: row.marketId,
    market,
    addedAt: toIsoString(row.addedAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

export async function listWatchlistItems(userId: string): Promise<WatchlistSnapshot> {
  const trimmedUserId = userId.trim();
  const { db, userWatchlistItemsTable } = await getDbModule();
  const rows = await db
    .select()
    .from(userWatchlistItemsTable)
    .where(eq(userWatchlistItemsTable.userId, trimmedUserId))
    .orderBy(desc(userWatchlistItemsTable.addedAt));

  const items = rows.flatMap((row) => {
    const item = toPublicItem(row);
    return item ? [item] : [];
  });

  return {
    items,
    total: items.length,
    updatedAt: rows[0] ? toIsoString(rows[0].updatedAt) : new Date().toISOString(),
  };
}

export async function listWatchlistIds(userId: string): Promise<string[]> {
  const trimmedUserId = userId.trim();
  const { db, userWatchlistItemsTable } = await getDbModule();
  const rows = await db
    .select({ marketId: userWatchlistItemsTable.marketId })
    .from(userWatchlistItemsTable)
    .where(eq(userWatchlistItemsTable.userId, trimmedUserId))
    .orderBy(desc(userWatchlistItemsTable.addedAt));

  return rows.map((row) => row.marketId);
}

export async function upsertWatchlistItem(userId: string, market: MarketToken): Promise<WatchlistItem> {
  const trimmedUserId = userId.trim();
  const { db, userWatchlistItemsTable } = await getDbModule();

  const existingRows = await db
    .select({ marketId: userWatchlistItemsTable.marketId })
    .from(userWatchlistItemsTable)
    .where(and(eq(userWatchlistItemsTable.userId, trimmedUserId), eq(userWatchlistItemsTable.marketId, market.id)))
    .limit(1);

  const countRows = await db
    .select({ total: count() })
    .from(userWatchlistItemsTable)
    .where(eq(userWatchlistItemsTable.userId, trimmedUserId));

  if (!existingRows.some((row) => row.marketId === market.id) && (countRows[0]?.total ?? 0) >= MAX_WATCHLIST_ITEMS) {
    throw new Error(`Watchlist limit reached (${MAX_WATCHLIST_ITEMS} items).`);
  }

  const now = new Date();
  const rows = await db
    .insert(userWatchlistItemsTable)
    .values({
      userId: trimmedUserId,
      marketId: market.id,
      market: market as unknown as Record<string, unknown>,
      addedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userWatchlistItemsTable.userId, userWatchlistItemsTable.marketId],
      set: {
        market: market as unknown as Record<string, unknown>,
        updatedAt: now,
      },
    })
    .returning();

  const item = rows[0] ? toPublicItem(rows[0]) : null;

  if (!item) {
    throw new Error("Watchlist item could not be stored.");
  }

  return item;
}

export async function removeWatchlistItem(userId: string, marketId: string): Promise<boolean> {
  const trimmedUserId = userId.trim();
  const { db, userWatchlistItemsTable } = await getDbModule();
  const rows = await db
    .delete(userWatchlistItemsTable)
    .where(and(eq(userWatchlistItemsTable.userId, trimmedUserId), eq(userWatchlistItemsTable.marketId, marketId)))
    .returning({ marketId: userWatchlistItemsTable.marketId });

  return rows.some((row) => row.marketId === marketId);
}
