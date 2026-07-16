import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { PointsTierRecord, UserPointsRow } from "@workspace/db";

export type LeaderboardPeriod = "24h" | "7d" | "30d" | "all";

export interface LeaderboardAccount {
  accountKey: string;
  display: string;
  referralCode: string | null;
  tier: PointsTierRecord;
  tierLabel: string;
}

export interface PointsLeaderboardRow extends LeaderboardAccount {
  rank: number;
  points: number;
  lifetimePoints: number;
  ledgerEntries: number | null;
}

export interface TradesLeaderboardRow extends LeaderboardAccount {
  rank: number;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  volumeUsdCents: number;
  lastActivityAt: string | null;
}

export interface ReferralsLeaderboardRow extends LeaderboardAccount {
  rank: number;
  referralCount: number;
  activeReferralCount: number;
  passivePoints: number;
  joinedAt: string | null;
}

export interface LeaderboardSnapshot {
  period: LeaderboardPeriod;
  updatedAt: string;
  points: PointsLeaderboardRow[];
  trades: TradesLeaderboardRow[];
  referrals: ReferralsLeaderboardRow[];
  summary: {
    pointAccounts: number;
    trackedTradeAccounts: number;
    referralAccounts: number;
    topPoints: number;
    trackedTradeEvents: number;
    totalReferrals: number;
  };
}

type DbModule = typeof import("@workspace/db");

const PERIOD_DAYS: Record<Exclude<LeaderboardPeriod, "all">, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
};

const TIER_LABELS: Record<PointsTierRecord, string> = {
  anon: "Starter",
  degen: "Degen",
  alpha: "Alpha",
  whale: "Whale",
  gigabrain: "Gigabrain",
};

let dbModulePromise: Promise<DbModule> | null = null;

async function getDbModule(): Promise<DbModule> {
  if (dbModulePromise) return dbModulePromise;

  dbModulePromise = (async () => {
    const databaseUrl = (process.env["DATABASE_URL"] ?? "").trim();

    if (!databaseUrl) {
      throw new Error("DATABASE_URL must be configured to use the AnyAlpha leaderboard.");
    }

    return import("@workspace/db");
  })();

  return dbModulePromise;
}

function periodStart(period: LeaderboardPeriod): Date | null {
  if (period === "all") return null;

  const start = new Date();
  start.setUTCDate(start.getUTCDate() - PERIOD_DAYS[period]);
  return start;
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function publicAccountKey(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 14);
}

function compactUserLabel(userId: string): string {
  const key = publicAccountKey(userId).toUpperCase();
  return `AA-${key.slice(0, 4)}-${key.slice(4, 8)}`;
}

function accountFromUser(userId: string, account: UserPointsRow | undefined): LeaderboardAccount {
  const tier = account?.tier ?? "anon";

  return {
    accountKey: publicAccountKey(userId),
    display: account?.referralCode ?? compactUserLabel(userId),
    referralCode: account?.referralCode ?? null,
    tier,
    tierLabel: TIER_LABELS[tier],
  };
}

async function fetchAccountsByUserId(userIds: string[]) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  const accountMap = new Map<string, UserPointsRow>();

  if (uniqueUserIds.length === 0) return accountMap;

  const { db, userPointsTable } = await getDbModule();
  const rows = await db.select().from(userPointsTable).where(inArray(userPointsTable.userId, uniqueUserIds));

  for (const row of rows) {
    accountMap.set(row.userId, row);
  }

  return accountMap;
}

async function getPointsLeaderboard(period: LeaderboardPeriod): Promise<PointsLeaderboardRow[]> {
  const { db, pointsLedgerTable, userPointsTable } = await getDbModule();
  const start = periodStart(period);

  if (!start) {
    const rows = await db.select().from(userPointsTable).orderBy(desc(userPointsTable.totalPoints)).limit(50);

    return rows.map((row, index) => ({
      rank: index + 1,
      ...accountFromUser(row.userId, row),
      points: row.totalPoints,
      lifetimePoints: row.lifetimePoints,
      ledgerEntries: null,
    }));
  }

  const pointsExpr = sql<number>`coalesce(sum(${pointsLedgerTable.points}), 0)::int`;
  const ledgerEntriesExpr = sql<number>`count(${pointsLedgerTable.id})::int`;
  const rows = await db
    .select({
      userId: pointsLedgerTable.userId,
      points: pointsExpr,
      ledgerEntries: ledgerEntriesExpr,
    })
    .from(pointsLedgerTable)
    .where(gte(pointsLedgerTable.createdAt, start))
    .groupBy(pointsLedgerTable.userId)
    .orderBy(desc(pointsExpr))
    .limit(50);

  const accounts = await fetchAccountsByUserId(rows.map((row) => row.userId));

  return rows.map((row, index) => {
    const account = accounts.get(row.userId);

    return {
      rank: index + 1,
      ...accountFromUser(row.userId, account),
      points: Number(row.points ?? 0),
      lifetimePoints: account?.lifetimePoints ?? 0,
      ledgerEntries: Number(row.ledgerEntries ?? 0),
    };
  });
}

async function getTradesLeaderboard(period: LeaderboardPeriod): Promise<TradesLeaderboardRow[]> {
  const { db, userTrackedWalletsTable, walletTransactionsTable } = await getDbModule();
  const start = periodStart(period);
  const tradeCountExpr = sql<number>`count(${walletTransactionsTable.id})::int`;
  const volumeExpr = sql<number>`coalesce(sum(${walletTransactionsTable.amountUsdCents}), 0)::int`;
  const buyCountExpr = sql<number>`coalesce(sum(case when ${walletTransactionsTable.type} = 'buy' then 1 else 0 end), 0)::int`;
  const sellCountExpr = sql<number>`coalesce(sum(case when ${walletTransactionsTable.type} = 'sell' then 1 else 0 end), 0)::int`;
  const lastActivityExpr = sql<Date | null>`max(${walletTransactionsTable.occurredAt})`;
  const whereClause = start
    ? and(eq(userTrackedWalletsTable.isActive, true), gte(walletTransactionsTable.occurredAt, start))
    : eq(userTrackedWalletsTable.isActive, true);

  const rows = await db
    .select({
      userId: userTrackedWalletsTable.userId,
      tradeCount: tradeCountExpr,
      buyCount: buyCountExpr,
      sellCount: sellCountExpr,
      volumeUsdCents: volumeExpr,
      lastActivityAt: lastActivityExpr,
    })
    .from(userTrackedWalletsTable)
    .innerJoin(walletTransactionsTable, eq(userTrackedWalletsTable.walletId, walletTransactionsTable.walletId))
    .where(whereClause)
    .groupBy(userTrackedWalletsTable.userId)
    .orderBy(desc(tradeCountExpr), desc(volumeExpr))
    .limit(50);

  const accounts = await fetchAccountsByUserId(rows.map((row) => row.userId));

  return rows.map((row, index) => ({
    rank: index + 1,
    ...accountFromUser(row.userId, accounts.get(row.userId)),
    tradeCount: Number(row.tradeCount ?? 0),
    buyCount: Number(row.buyCount ?? 0),
    sellCount: Number(row.sellCount ?? 0),
    volumeUsdCents: Number(row.volumeUsdCents ?? 0),
    lastActivityAt: toIsoString(row.lastActivityAt),
  }));
}

async function getReferralsLeaderboard(period: LeaderboardPeriod): Promise<ReferralsLeaderboardRow[]> {
  const { db, referralsTable } = await getDbModule();
  const start = periodStart(period);
  const referralCountExpr = sql<number>`count(${referralsTable.id})::int`;
  const activeReferralCountExpr = sql<number>`coalesce(sum(case when ${referralsTable.isActive} then 1 else 0 end), 0)::int`;
  const passivePointsExpr = sql<number>`coalesce(sum(${referralsTable.totalPassivePoints}), 0)::int`;
  const joinedAtExpr = sql<Date | null>`max(${referralsTable.joinedAt})`;
  const baseSelect = {
    userId: referralsTable.referrerId,
    referralCount: referralCountExpr,
    activeReferralCount: activeReferralCountExpr,
    passivePoints: passivePointsExpr,
    joinedAt: joinedAtExpr,
  };

  const rows = start
    ? await db
        .select(baseSelect)
        .from(referralsTable)
        .where(gte(referralsTable.joinedAt, start))
        .groupBy(referralsTable.referrerId)
        .orderBy(desc(referralCountExpr), desc(passivePointsExpr))
        .limit(50)
    : await db
        .select(baseSelect)
        .from(referralsTable)
        .groupBy(referralsTable.referrerId)
        .orderBy(desc(referralCountExpr), desc(passivePointsExpr))
        .limit(50);

  const accounts = await fetchAccountsByUserId(rows.map((row) => row.userId));

  return rows.map((row, index) => ({
    rank: index + 1,
    ...accountFromUser(row.userId, accounts.get(row.userId)),
    referralCount: Number(row.referralCount ?? 0),
    activeReferralCount: Number(row.activeReferralCount ?? 0),
    passivePoints: Number(row.passivePoints ?? 0),
    joinedAt: toIsoString(row.joinedAt),
  }));
}

export async function getLeaderboardSnapshot(period: LeaderboardPeriod): Promise<LeaderboardSnapshot> {
  const [points, trades, referrals] = await Promise.all([
    getPointsLeaderboard(period),
    getTradesLeaderboard(period),
    getReferralsLeaderboard(period),
  ]);

  return {
    period,
    updatedAt: new Date().toISOString(),
    points,
    trades,
    referrals,
    summary: {
      pointAccounts: points.length,
      trackedTradeAccounts: trades.length,
      referralAccounts: referrals.length,
      topPoints: points[0]?.points ?? 0,
      trackedTradeEvents: trades.reduce((sum, row) => sum + row.tradeCount, 0),
      totalReferrals: referrals.reduce((sum, row) => sum + row.referralCount, 0),
    },
  };
}
