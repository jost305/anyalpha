import { and, eq } from "drizzle-orm";
import type { MarketBundleHolderPnl, MarketDetailResponse, MarketTokenHolderPosition } from "../markets/types";

type DbModule = typeof import("@workspace/db");

interface HolderPnlInput {
  chain: string;
  tokenAddress: string;
  currentPriceUsd?: number;
  holders: MarketTokenHolderPosition[];
}

interface HolderPnlPoint {
  walletAddress: string;
  pnlPct?: number;
  pnlUsd?: number;
  valueUsd?: number;
}

export interface HolderPnlSnapshotResult {
  snapshot?: MarketBundleHolderPnl;
  sampleSize: number;
  skippedRows: number;
  bundleWalletMatches: number;
}

let dbModulePromise: Promise<DbModule> | null = null;

async function getDbModule(): Promise<DbModule> {
  if (dbModulePromise) return dbModulePromise;

  dbModulePromise = (async () => {
    const databaseUrl = (process.env["DATABASE_URL"] ?? "").trim();
    if (!databaseUrl) {
      throw new Error("DATABASE_URL must be configured to save holder PnL snapshots.");
    }

    return import("@workspace/db");
  })();

  return dbModulePromise;
}

function normalizeChain(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function toDbDecimal(value: number | undefined): string | undefined {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}

function average(values: number[]): number | undefined {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length === 0) return undefined;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function holderPnlPoint(holder: MarketTokenHolderPosition, currentPriceUsd: number | undefined): HolderPnlPoint | null {
  const walletAddress = holder.walletAddress?.trim();
  if (!walletAddress) return null;

  const avgBuyPriceUsd = finiteNumber(holder.avgBuyPriceUsd);
  const totalPnlUsd = finiteNumber(holder.totalPnlUsd);
  const tokenValueUsd = finiteNumber(holder.tokenAmountUsd);
  const tokenAmount = finiteNumber(holder.tokenAmount);
  const priceUsd = finiteNumber(currentPriceUsd);
  let pnlPct: number | undefined;
  let pnlUsd: number | undefined = totalPnlUsd;

  if (avgBuyPriceUsd !== undefined && avgBuyPriceUsd > 0 && priceUsd !== undefined && priceUsd > 0) {
    pnlPct = ((priceUsd - avgBuyPriceUsd) / avgBuyPriceUsd) * 100;
    if (pnlUsd === undefined && tokenAmount !== undefined) {
      pnlUsd = (priceUsd - avgBuyPriceUsd) * tokenAmount;
    }
  }

  if (pnlPct === undefined && pnlUsd === undefined) return null;

  return {
    walletAddress,
    pnlPct,
    pnlUsd,
    valueUsd: tokenValueUsd,
  };
}

function classifyPoint(point: HolderPnlPoint): "profit" | "breakeven" | "loss" {
  if (point.pnlPct !== undefined) {
    if (point.pnlPct > 5) return "profit";
    if (point.pnlPct < -5) return "loss";
    return "breakeven";
  }

  const pnlUsd = point.pnlUsd ?? 0;
  const threshold = Math.max(1, Math.abs(point.valueUsd ?? 0) * 0.005);
  if (pnlUsd > threshold) return "profit";
  if (pnlUsd < -threshold) return "loss";
  return "breakeven";
}

async function bundleWalletSet(chain: string, tokenAddress: string): Promise<Set<string>> {
  const { db, bundleWalletsTable } = await getDbModule();
  const rows = await db
    .select({
      walletAddressNormalized: bundleWalletsTable.walletAddressNormalized,
    })
    .from(bundleWalletsTable)
    .where(
      and(
        eq(bundleWalletsTable.chain, normalizeChain(chain)),
        eq(bundleWalletsTable.tokenAddressNormalized, normalizeAddress(tokenAddress)),
      ),
    );

  return new Set(rows.map((row) => row.walletAddressNormalized));
}

export async function calculateAndStoreHolderPnlSnapshot(input: HolderPnlInput): Promise<HolderPnlSnapshotResult> {
  const points = input.holders
    .map((holder) => holderPnlPoint(holder, input.currentPriceUsd))
    .filter((point): point is HolderPnlPoint => point !== null);

  if (points.length === 0) {
    return {
      sampleSize: 0,
      skippedRows: input.holders.length,
      bundleWalletMatches: 0,
    };
  }

  const bundleWallets = await bundleWalletSet(input.chain, input.tokenAddress);
  const counts = {
    profit: 0,
    breakeven: 0,
    loss: 0,
  };
  const bundlePnlPct: number[] = [];
  const retailPnlPct: number[] = [];

  for (const point of points) {
    counts[classifyPoint(point)] += 1;
    if (point.pnlPct === undefined) continue;

    if (bundleWallets.has(normalizeAddress(point.walletAddress))) {
      bundlePnlPct.push(point.pnlPct);
    } else {
      retailPnlPct.push(point.pnlPct);
    }
  }

  const sampleSize = points.length;
  const snapshotAt = new Date();
  const snapshot: MarketBundleHolderPnl = {
    inProfitPct: (counts.profit / sampleSize) * 100,
    breakevenPct: (counts.breakeven / sampleSize) * 100,
    inLossPct: (counts.loss / sampleSize) * 100,
    bundlePnl: average(bundlePnlPct),
    retailPnl: average(retailPnlPct),
    snapshotAt: snapshotAt.toISOString(),
  };

  const { db, bundleAnalysisTable, holderPnlSnapshotsTable } = await getDbModule();
  await db.insert(holderPnlSnapshotsTable).values({
    chain: normalizeChain(input.chain),
    tokenAddress: input.tokenAddress,
    tokenAddressNormalized: normalizeAddress(input.tokenAddress),
    inProfitPct: toDbDecimal(snapshot.inProfitPct),
    breakevenPct: toDbDecimal(snapshot.breakevenPct),
    inLossPct: toDbDecimal(snapshot.inLossPct),
    bundlePnl: toDbDecimal(snapshot.bundlePnl),
    retailPnl: toDbDecimal(snapshot.retailPnl),
    snapshotAt,
  });

  await db
    .update(bundleAnalysisTable)
    .set({
      bundleWalletsPnl: toDbDecimal(snapshot.bundlePnl),
      retailAvgPnl: toDbDecimal(snapshot.retailPnl),
      updatedAt: snapshotAt,
    })
    .where(
      and(
        eq(bundleAnalysisTable.chain, normalizeChain(input.chain)),
        eq(bundleAnalysisTable.tokenAddressNormalized, normalizeAddress(input.tokenAddress)),
      ),
    );

  return {
    snapshot,
    sampleSize,
    skippedRows: input.holders.length - sampleSize,
    bundleWalletMatches: bundlePnlPct.length,
  };
}

export async function snapshotHolderPnlFromDetail(detail: MarketDetailResponse): Promise<HolderPnlSnapshotResult> {
  return calculateAndStoreHolderPnlSnapshot({
    chain: detail.token.chainId,
    tokenAddress: detail.token.tokenAddress,
    currentPriceUsd: detail.token.priceUsd,
    holders: detail.holders,
  });
}
