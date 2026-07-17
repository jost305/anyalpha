import { createHash } from "node:crypto";
import { and, count, desc, eq, gt, gte, inArray, sql } from "drizzle-orm";

const DAILY_LOGIN_POINTS = 50;
const REFEREE_TERMINAL_JOIN_POINTS = 300;
const REFEREE_TELEGRAM_JOIN_POINTS = 200;
const REFERRER_TERMINAL_JOIN_POINTS = 750;
const REFERRER_TELEGRAM_JOIN_POINTS = 500;
const FIRST_REFERRAL_POINTS = 1000;
const CONNECT_WALLET_POINTS = 300;
const REFERRER_CONNECT_WALLET_POINTS = 250;
const FIRST_WALLET_TRACKED_POINTS = 500;
const REFERRER_FIRST_WALLET_TRACKED_POINTS = 250;
const ACTIVE_7D_POINTS = 500;
const ACTIVE_30D_POINTS = 1000;
const PASSIVE_REFERRAL_BPS = 1000;

const POINT_TIERS = [
  { tier: "gigabrain", min: 500_000, multiplierBps: 20_000, label: "Gigabrain", emoji: "\u{1F534}" },
  { tier: "whale", min: 100_000, multiplierBps: 15_000, label: "Whale", emoji: "\u{1F7E0}" },
  { tier: "alpha", min: 25_000, multiplierBps: 12_500, label: "Alpha", emoji: "\u{1F7E3}" },
  { tier: "degen", min: 5_000, multiplierBps: 11_000, label: "Degen", emoji: "\u{1F535}" },
  { tier: "anon", min: 0, multiplierBps: 10_000, label: "Starter", emoji: "\u{2728}" },
] as const;

const USERNAME_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const REFERRAL_TIERS = [
  { tier: "network", min: 100, bonusBps: 10_000, label: "Network" },
  { tier: "amplifier", min: 50, bonusBps: 5_000, label: "Amplifier" },
  { tier: "connector", min: 15, bonusBps: 2_500, label: "Connector" },
  { tier: "builder", min: 5, bonusBps: 1_000, label: "Builder" },
  { tier: "starter", min: 0, bonusBps: 0, label: "Starter" },
] as const;

const REFERRAL_ACTIONS = new Set([
  "referral_made",
  "first_referral",
  "referee_connect_wallet",
  "referee_first_wallet_tracked",
  "referee_active_7d",
  "referee_active_30d",
  "passive_referral",
]);

export type PointsTier = (typeof POINT_TIERS)[number]["tier"];
export type ReferralSource = "terminal" | "telegram";
export type ReferralTier = (typeof REFERRAL_TIERS)[number]["tier"];

export interface AlphaPointsAccount {
  label: "Alpha Points";
  balance: number;
  welcomeGrant: number;
  awardedAt: string;
  updatedAt: string;
  username: string;
  referralCode: string;
  tier: PointsTier;
  tierLabel: string;
  tierEmoji: string;
  lifetimePoints: number;
  streakDays: number;
  multiplierBps: number;
  nextTier: {
    tier: PointsTier;
    label: string;
    minPoints: number;
    pointsRemaining: number;
  } | null;
}

export interface AwardPointsOptions {
  action: string;
  basePoints: number;
  source?: string;
  relatedUserId?: string | null;
  relatedEntityId?: string | null;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  dailyLimit?: number;
  skipPassive?: boolean;
  applyMultiplier?: boolean;
}

export interface AwardPointsResult {
  awarded: boolean;
  action: string;
  points: number;
  basePoints: number;
  idempotencyKey: string;
}

export interface PointsDashboard {
  account: AlphaPointsAccount;
  referralLinks: {
    terminal: string;
    telegram: string | null;
  };
  referralStats: {
    totalReferrals: number;
    activeReferrals: number;
    referralTier: ReferralTier;
    referralTierLabel: string;
    referralBonusBps: number;
    referralPoints: number;
    passivePoints: number;
    passivePointsToday: number;
    rank: number | null;
  };
  referrals: Array<{
    id: string;
    refereeId: string;
    refereeDisplay: string;
    refereeReferralCode: string | null;
    refereePoints: number;
    source: ReferralSource;
    isActive: boolean;
    totalPassivePoints: number;
    joinedAt: string;
  }>;
  recentLedger: Array<{
    id: string;
    action: string;
    source: string;
    points: number;
    basePoints: number;
    multiplierBps: number;
    relatedUserId: string | null;
    relatedEntityId: string | null;
    createdAt: string;
  }>;
  leaderboard: Array<{
    rank: number;
    userId: string;
    display: string;
    referralCode: string;
    totalPoints: number;
    tier: PointsTier;
    tierLabel: string;
  }>;
}

export interface PlatformRewardsStats {
  totalPointsAwarded: number;
  totalRewardAccounts: number;
  ledgerEntries: number;
  updatedAt: string;
}

type DbModule = typeof import("@workspace/db");
type UserPointsRow = import("@workspace/db").UserPointsRow;
type ReferralTierRow = import("@workspace/db").ReferralTierRow;

let dbModulePromise: Promise<DbModule> | null = null;

async function getDbModule(): Promise<DbModule> {
  if (dbModulePromise) return dbModulePromise;

  dbModulePromise = (async () => {
    const databaseUrl = (process.env["DATABASE_URL"] ?? "").trim();

    if (!databaseUrl) {
      throw new Error("DATABASE_URL must be configured to use Supabase Alpha Points storage.");
    }

    return import("@workspace/db");
  })();

  return dbModulePromise;
}

function toIsoString(value: string | Date | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function yesterdayKey(date = new Date()): string {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() - 1);
  return todayKey(copy);
}

function startOfUtcDay(date = new Date()): Date {
  return new Date(`${todayKey(date)}T00:00:00.000Z`);
}

function cleanReferralCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/^ref_/i, "");
  if (!normalized || !/^[a-zA-Z0-9_-]{3,32}$/.test(normalized)) return null;
  return normalized;
}

function usernameCandidateForUser(userId: string, salt: number, length = 4): string {
  const digest = createHash("sha256").update(`${userId}:${salt}`).digest();
  let suffix = "";

  for (let index = 0; index < length; index += 1) {
    suffix += USERNAME_ALPHABET[digest[index] % USERNAME_ALPHABET.length];
  }

  return `alpha_${suffix}`;
}

function isAlphaUsername(value: string): boolean {
  return /^alpha_[1-9A-HJ-NP-Za-km-z]{4,8}$/.test(value);
}

async function publicUsernameForUser(userId: string): Promise<string> {
  const { db, userPointsTable } = await getDbModule();

  for (let salt = 0; salt < 24; salt += 1) {
    const candidate = usernameCandidateForUser(userId, salt);
    const rows = await db.select().from(userPointsTable).where(eq(userPointsTable.referralCode, candidate)).limit(1);
    const owner = rows[0];

    if (!owner || owner.userId === userId) return candidate;
  }

  return usernameCandidateForUser(userId, 0, 6);
}

function tierForPoints(totalPoints: number) {
  return POINT_TIERS.find((tier) => totalPoints >= tier.min) ?? POINT_TIERS[POINT_TIERS.length - 1];
}

function nextTierForPoints(totalPoints: number) {
  const ascending = [...POINT_TIERS].reverse();
  return ascending.find((tier) => tier.min > totalPoints) ?? null;
}

function referralTierForCount(totalReferrals: number) {
  return REFERRAL_TIERS.find((tier) => totalReferrals >= tier.min) ?? REFERRAL_TIERS[REFERRAL_TIERS.length - 1];
}

function accountFromRow(row: UserPointsRow): AlphaPointsAccount {
  const tier = tierForPoints(row.totalPoints);
  const nextTier = nextTierForPoints(row.totalPoints);

  return {
    label: "Alpha Points",
    balance: row.totalPoints,
    welcomeGrant: 0,
    awardedAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
    username: row.referralCode,
    referralCode: row.referralCode,
    tier: tier.tier,
    tierLabel: tier.label,
    tierEmoji: tier.emoji,
    lifetimePoints: row.lifetimePoints,
    streakDays: row.streakDays,
    multiplierBps: row.multiplierBps,
    nextTier: nextTier
      ? {
          tier: nextTier.tier,
          label: nextTier.label,
          minPoints: nextTier.min,
          pointsRemaining: Math.max(nextTier.min - row.totalPoints, 0),
        }
      : null,
  };
}

function applyBps(value: number, bps: number): number {
  return Math.round((value * bps) / 10_000);
}

function publicBaseUrl(): string {
  const configured =
    process.env["ANYALPHA_PUBLIC_URL"]?.trim() ??
    process.env["PUBLIC_APP_URL"]?.trim() ??
    process.env["RAILWAY_PUBLIC_DOMAIN"]?.trim();

  if (!configured) return "https://anyalpha.xyz";
  if (/^https?:\/\//i.test(configured)) return configured.replace(/\/+$/, "");
  return `https://${configured.replace(/\/+$/, "")}`;
}

function telegramBotUsername(): string | null {
  const raw = process.env["TELEGRAM_BOT_USERNAME"]?.trim() ?? "anyalphaterminalbot";
  const normalized = raw.replace(/^@/, "").trim();
  return normalized || null;
}

function referralLinks(referralCode: string) {
  const terminal = `${publicBaseUrl()}?ref=${encodeURIComponent(referralCode)}`;
  const bot = telegramBotUsername();

  return {
    terminal,
    telegram: bot ? `https://t.me/${bot}?start=ref_${encodeURIComponent(referralCode)}` : null,
  };
}

async function getUserPointsRow(userId: string): Promise<UserPointsRow | null> {
  const { db, userPointsTable } = await getDbModule();
  const rows = await db.select().from(userPointsTable).where(eq(userPointsTable.userId, userId)).limit(1);
  return rows[0] ?? null;
}

async function ensureUserPointsRow(userId: string): Promise<UserPointsRow> {
  const trimmedUserId = userId.trim();

  if (!trimmedUserId) {
    throw new Error("User id is required for Alpha Points.");
  }

  const { db, userPointsTable } = await getDbModule();
  const existing = await getUserPointsRow(trimmedUserId);
  if (existing) {
    if (isAlphaUsername(existing.referralCode)) return existing;

    const username = await publicUsernameForUser(trimmedUserId);
    const rows = await db
      .update(userPointsTable)
      .set({
        referralCode: username,
        updatedAt: new Date(),
      })
      .where(eq(userPointsTable.userId, trimmedUserId))
      .returning();

    return rows[0] ?? existing;
  }

  const now = new Date();
  const username = await publicUsernameForUser(trimmedUserId);
  const rows = await db
    .insert(userPointsTable)
    .values({
      userId: trimmedUserId,
      referralCode: username,
      totalPoints: 0,
      lifetimePoints: 0,
      tier: "anon",
      multiplierBps: 10_000,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userPointsTable.userId,
      set: { updatedAt: now },
    })
    .returning();

  const account = rows[0] ?? (await getUserPointsRow(trimmedUserId));

  if (!account) {
    throw new Error("Alpha Points account could not be loaded.");
  }

  return account;
}

async function updatePointTier(userId: string, totalPoints: number): Promise<UserPointsRow> {
  const { db, userPointsTable } = await getDbModule();
  const tier = tierForPoints(totalPoints);
  const now = new Date();
  const rows = await db
    .update(userPointsTable)
    .set({
      tier: tier.tier,
      multiplierBps: tier.multiplierBps,
      updatedAt: now,
    })
    .where(eq(userPointsTable.userId, userId))
    .returning();

  return rows[0] ?? (await ensureUserPointsRow(userId));
}

async function updateReferralTier(userId: string): Promise<ReferralTierRow> {
  const { db, referralTiersTable, referralsTable } = await getDbModule();
  const totalRows = await db
    .select({ total: count() })
    .from(referralsTable)
    .where(eq(referralsTable.referrerId, userId));
  const activeRows = await db
    .select({ total: count() })
    .from(referralsTable)
    .where(and(eq(referralsTable.referrerId, userId), eq(referralsTable.isActive, true)));
  const totalReferrals = totalRows[0]?.total ?? 0;
  const activeReferrals = activeRows[0]?.total ?? 0;
  const tier = referralTierForCount(totalReferrals);
  const now = new Date();

  const rows = await db
    .insert(referralTiersTable)
    .values({
      userId,
      tier: tier.tier,
      totalReferrals,
      activeReferrals,
      bonusBps: tier.bonusBps,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: referralTiersTable.userId,
      set: {
        tier: tier.tier,
        totalReferrals,
        activeReferrals,
        bonusBps: tier.bonusBps,
        updatedAt: now,
      },
    })
    .returning();

  const row = rows[0];
  if (!row) throw new Error("Referral tier could not be loaded.");
  return row;
}

async function countAwardsToday(userId: string, action: string): Promise<number> {
  const { db, pointsLedgerTable } = await getDbModule();
  const rows = await db
    .select({ total: count() })
    .from(pointsLedgerTable)
    .where(and(eq(pointsLedgerTable.userId, userId), eq(pointsLedgerTable.action, action), gte(pointsLedgerTable.createdAt, startOfUtcDay())));

  return rows[0]?.total ?? 0;
}

export async function awardPoints(userId: string, options: AwardPointsOptions): Promise<AwardPointsResult> {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) throw new Error("User id is required to award Alpha Points.");
  if (!Number.isFinite(options.basePoints) || options.basePoints <= 0) {
    throw new Error("Points award must be a positive number.");
  }

  const { db, pointsLedgerTable, referralsTable, userPointsTable } = await getDbModule();
  const account = await ensureUserPointsRow(trimmedUserId);
  const idempotencyKey =
    options.idempotencyKey ??
    `${options.action}:${options.relatedUserId ?? ""}:${options.relatedEntityId ?? ""}:${todayKey()}`;

  if (options.dailyLimit && (await countAwardsToday(trimmedUserId, options.action)) >= options.dailyLimit) {
    return {
      awarded: false,
      action: options.action,
      points: 0,
      basePoints: options.basePoints,
      idempotencyKey,
    };
  }

  const multiplierBps = options.applyMultiplier === false ? 10_000 : account.multiplierBps;
  const finalPoints = applyBps(options.basePoints, multiplierBps);
  const now = new Date();

  const insertedRows = await db
    .insert(pointsLedgerTable)
    .values({
      userId: trimmedUserId,
      action: options.action,
      source: options.source ?? "system",
      basePoints: options.basePoints,
      multiplierBps,
      points: finalPoints,
      relatedUserId: options.relatedUserId ?? null,
      relatedEntityId: options.relatedEntityId ?? null,
      idempotencyKey,
      metadata: options.metadata ?? {},
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning();

  const ledgerRow = insertedRows[0];
  if (!ledgerRow) {
    return {
      awarded: false,
      action: options.action,
      points: 0,
      basePoints: options.basePoints,
      idempotencyKey,
    };
  }

  const updatedRows = await db
    .update(userPointsTable)
    .set({
      totalPoints: sql`${userPointsTable.totalPoints} + ${finalPoints}`,
      lifetimePoints: sql`${userPointsTable.lifetimePoints} + ${finalPoints}`,
      updatedAt: now,
    })
    .where(eq(userPointsTable.userId, trimmedUserId))
    .returning();
  const updatedAccount = updatedRows[0] ?? (await ensureUserPointsRow(trimmedUserId));
  await updatePointTier(trimmedUserId, updatedAccount.totalPoints);

  if (!options.skipPassive && finalPoints > 0) {
    const referralRows = await db
      .select()
      .from(referralsTable)
      .where(eq(referralsTable.refereeId, trimmedUserId))
      .limit(1);
    const referral = referralRows[0];

    if (referral) {
      const passivePoints = applyBps(finalPoints, PASSIVE_REFERRAL_BPS);

      if (passivePoints > 0) {
        const passiveAward = await awardPoints(referral.referrerId, {
          action: "passive_referral",
          basePoints: passivePoints,
          source: "referral",
          relatedUserId: trimmedUserId,
          idempotencyKey: `passive:${ledgerRow.id}`,
          metadata: {
            refereeId: trimmedUserId,
            refereeAction: options.action,
          },
          skipPassive: true,
        });

        if (passiveAward.awarded) {
          await db
            .update(referralsTable)
            .set({
              totalPassivePoints: sql`${referralsTable.totalPassivePoints} + ${passiveAward.points}`,
              updatedAt: new Date(),
            })
            .where(eq(referralsTable.id, referral.id));
        }
      }
    }
  }

  if (finalPoints > 0) {
    import("../realtime/pusher").then(({ publishRealtimeEvent, userRealtimeChannel }) => {
      publishRealtimeEvent(userRealtimeChannel(trimmedUserId), "PointsAwarded", {
        action: options.action,
        points: finalPoints,
        basePoints: options.basePoints,
        multiplierBps,
        relatedEntityId: options.relatedEntityId,
        source: options.source ?? "system",
      }).catch((err) => {
        // Log silently
      });
    }).catch(() => {});
  }

  return {
    awarded: true,
    action: options.action,
    points: finalPoints,
    basePoints: options.basePoints,
    idempotencyKey,
  };
}

async function processReferral(refereeId: string, rawReferralCode: string | null | undefined, source: ReferralSource) {
  const referralCode = cleanReferralCode(rawReferralCode);
  if (!referralCode) return;

  const { db, referralsTable, userPointsTable } = await getDbModule();
  await ensureUserPointsRow(refereeId);
  const referrerRows = await db
    .select()
    .from(userPointsTable)
    .where(eq(userPointsTable.referralCode, referralCode))
    .limit(1);
  const referrer = referrerRows[0];

  if (!referrer || referrer.userId === refereeId) return;

  const existingRows = await db.select().from(referralsTable).where(eq(referralsTable.refereeId, refereeId)).limit(1);
  if (existingRows[0]) return;

  const now = new Date();
  const insertedRows = await db
    .insert(referralsTable)
    .values({
      referrerId: referrer.userId,
      refereeId,
      source,
      isActive: true,
      joinedAt: now,
      activatedAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (!insertedRows[0]) return;

  const tier = await updateReferralTier(referrer.userId);
  const referrerBase = source === "terminal" ? REFERRER_TERMINAL_JOIN_POINTS : REFERRER_TELEGRAM_JOIN_POINTS;
  const referrerTotal = referrerBase + applyBps(referrerBase, tier.bonusBps);
  const refereeBase = source === "terminal" ? REFEREE_TERMINAL_JOIN_POINTS : REFEREE_TELEGRAM_JOIN_POINTS;

  await awardPoints(refereeId, {
    action: "referral_join_bonus",
    basePoints: refereeBase,
    source: "referral",
    relatedUserId: referrer.userId,
    idempotencyKey: `referral-join:${referrer.userId}:${refereeId}:${source}`,
    metadata: { source, referralCode },
    skipPassive: true,
  });

  await awardPoints(referrer.userId, {
    action: "referral_made",
    basePoints: referrerTotal,
    source: "referral",
    relatedUserId: refereeId,
    idempotencyKey: `referral-made:${referrer.userId}:${refereeId}:${source}`,
    metadata: {
      source,
      referralCode,
      basePoints: referrerBase,
      referralTier: tier.tier,
      referralBonusBps: tier.bonusBps,
    },
    skipPassive: true,
  });

  if (!referrer.firstReferralAt) {
    await awardPoints(referrer.userId, {
      action: "first_referral",
      basePoints: FIRST_REFERRAL_POINTS,
      source: "referral",
      relatedUserId: refereeId,
      idempotencyKey: `first-referral:${referrer.userId}`,
      skipPassive: true,
    });

    await db
      .update(userPointsTable)
      .set({ firstReferralAt: now, updatedAt: now })
      .where(eq(userPointsTable.userId, referrer.userId));
  }
}

async function handleConnectedWallet(userId: string, hasConnectedWallet: boolean) {
  if (!hasConnectedWallet) return;

  const { db, referralsTable, userPointsTable } = await getDbModule();
  const account = await ensureUserPointsRow(userId);
  if (account.firstWalletConnectedAt) return;

  const now = new Date();
  await awardPoints(userId, {
    action: "connect_wallet",
    basePoints: CONNECT_WALLET_POINTS,
    source: "terminal",
    idempotencyKey: `connect-wallet:${userId}`,
  });
  await db
    .update(userPointsTable)
    .set({ firstWalletConnectedAt: now, updatedAt: now })
    .where(eq(userPointsTable.userId, userId));

  const referralRows = await db.select().from(referralsTable).where(eq(referralsTable.refereeId, userId)).limit(1);
  const referral = referralRows[0];
  if (!referral) return;

  await awardPoints(referral.referrerId, {
    action: "referee_connect_wallet",
    basePoints: REFERRER_CONNECT_WALLET_POINTS,
    source: "referral",
    relatedUserId: userId,
    idempotencyKey: `referee-connect-wallet:${referral.referrerId}:${userId}`,
    skipPassive: true,
  });
}

async function handleDailyLogin(userId: string) {
  const { db, referralsTable, userPointsTable } = await getDbModule();
  const account = await ensureUserPointsRow(userId);
  const today = todayKey();

  if (account.lastLoginDate === today) return;

  const streakDays = account.lastLoginDate === yesterdayKey() ? account.streakDays + 1 : 1;
  const now = new Date();

  await awardPoints(userId, {
    action: "daily_login",
    basePoints: DAILY_LOGIN_POINTS,
    source: "terminal",
    idempotencyKey: `daily-login:${userId}:${today}`,
    dailyLimit: 1,
  });

  await db
    .update(userPointsTable)
    .set({
      streakDays,
      lastLoginDate: today,
      updatedAt: now,
    })
    .where(eq(userPointsTable.userId, userId));

  const referralRows = await db.select().from(referralsTable).where(eq(referralsTable.refereeId, userId)).limit(1);
  const referral = referralRows[0];
  if (!referral) return;

  if (streakDays >= 7 && !referral.active7dAwardedAt) {
    await awardPoints(userId, {
      action: "active_7d",
      basePoints: ACTIVE_7D_POINTS,
      source: "referral",
      relatedUserId: referral.referrerId,
      idempotencyKey: `active-7d-referee:${userId}`,
      skipPassive: true,
    });
    await awardPoints(referral.referrerId, {
      action: "referee_active_7d",
      basePoints: ACTIVE_7D_POINTS,
      source: "referral",
      relatedUserId: userId,
      idempotencyKey: `active-7d-referrer:${referral.referrerId}:${userId}`,
      skipPassive: true,
    });
    await db
      .update(referralsTable)
      .set({ active7dAwardedAt: new Date(), updatedAt: new Date() })
      .where(eq(referralsTable.id, referral.id));
  }

  if (streakDays >= 30 && !referral.active30dAwardedAt) {
    await awardPoints(userId, {
      action: "active_30d",
      basePoints: ACTIVE_30D_POINTS,
      source: "referral",
      relatedUserId: referral.referrerId,
      idempotencyKey: `active-30d-referee:${userId}`,
      skipPassive: true,
    });
    await awardPoints(referral.referrerId, {
      action: "referee_active_30d",
      basePoints: ACTIVE_30D_POINTS,
      source: "referral",
      relatedUserId: userId,
      idempotencyKey: `active-30d-referrer:${referral.referrerId}:${userId}`,
      skipPassive: true,
    });
    await db
      .update(referralsTable)
      .set({ active30dAwardedAt: new Date(), updatedAt: new Date() })
      .where(eq(referralsTable.id, referral.id));
  }
}

export async function awardFirstWalletTracked(userId: string, walletId: string) {
  const { db, referralsTable, userPointsTable } = await getDbModule();
  const account = await ensureUserPointsRow(userId);
  const now = new Date();

  await awardPoints(userId, {
    action: "add_wallet_tracker",
    basePoints: 100,
    source: "wallet_tracker",
    relatedEntityId: walletId,
    idempotencyKey: `add-wallet-tracker:${userId}:${walletId}`,
    dailyLimit: 10,
  });

  if (!account.firstWalletTrackedAt) {
    await awardPoints(userId, {
      action: "first_wallet_tracked",
      basePoints: FIRST_WALLET_TRACKED_POINTS,
      source: "wallet_tracker",
      relatedEntityId: walletId,
      idempotencyKey: `first-wallet-tracked:${userId}`,
    });
    await db
      .update(userPointsTable)
      .set({ firstWalletTrackedAt: now, updatedAt: now })
      .where(eq(userPointsTable.userId, userId));

    const referralRows = await db.select().from(referralsTable).where(eq(referralsTable.refereeId, userId)).limit(1);
    const referral = referralRows[0];

    if (referral) {
      await awardPoints(referral.referrerId, {
        action: "referee_first_wallet_tracked",
        basePoints: REFERRER_FIRST_WALLET_TRACKED_POINTS,
        source: "referral",
        relatedUserId: userId,
        relatedEntityId: walletId,
        idempotencyKey: `referee-first-wallet-tracked:${referral.referrerId}:${userId}`,
        skipPassive: true,
      });
    }
  }
}

export async function getOrCreateAlphaPointsAccount(
  userId: string,
  options: {
    referralCode?: string | null;
    referralSource?: ReferralSource;
    hasConnectedWallet?: boolean;
  } = {},
): Promise<AlphaPointsAccount> {
  const account = await ensureUserPointsRow(userId);

  await processReferral(userId, options.referralCode, options.referralSource ?? "terminal");
  await handleConnectedWallet(userId, Boolean(options.hasConnectedWallet));
  await handleDailyLogin(userId);

  const freshAccount = await getUserPointsRow(userId);
  return accountFromRow(freshAccount ?? account);
}

export async function getPointsDashboard(userId: string): Promise<PointsDashboard> {
  const { db, pointsLedgerTable, referralTiersTable, referralsTable, userPointsTable } = await getDbModule();
  const accountRow = await ensureUserPointsRow(userId);
  const account = accountFromRow(accountRow);
  const referralTier = await updateReferralTier(userId);
  const referralTierMeta = referralTierForCount(referralTier.totalReferrals);
  const referralRows = await db
    .select()
    .from(referralsTable)
    .where(eq(referralsTable.referrerId, userId))
    .orderBy(desc(referralsTable.joinedAt))
    .limit(50);
  const refereeIds = referralRows.map((row) => row.refereeId);
  const refereePointsRows =
    refereeIds.length > 0
      ? await db.select().from(userPointsTable).where(inArray(userPointsTable.userId, refereeIds))
      : [];
  const refereePoints = new Map(refereePointsRows.map((row) => [row.userId, row]));
  const referralPointStatsRows = await db
    .select({ total: sql<number>`coalesce(sum(${pointsLedgerTable.points}), 0)::int` })
    .from(pointsLedgerTable)
    .where(and(eq(pointsLedgerTable.userId, userId), inArray(pointsLedgerTable.action, Array.from(REFERRAL_ACTIONS))));
  const passiveStatsRows = await db
    .select({ total: sql<number>`coalesce(sum(${pointsLedgerTable.points}), 0)::int` })
    .from(pointsLedgerTable)
    .where(and(eq(pointsLedgerTable.userId, userId), eq(pointsLedgerTable.action, "passive_referral")));
  const passiveTodayRows = await db
    .select({ total: sql<number>`coalesce(sum(${pointsLedgerTable.points}), 0)::int` })
    .from(pointsLedgerTable)
    .where(
      and(
        eq(pointsLedgerTable.userId, userId),
        eq(pointsLedgerTable.action, "passive_referral"),
        gte(pointsLedgerTable.createdAt, startOfUtcDay()),
      ),
    );
  const rankRows = await db
    .select({ total: count() })
    .from(userPointsTable)
    .where(gt(userPointsTable.totalPoints, account.balance));
  const recentRows = await db
    .select()
    .from(pointsLedgerTable)
    .where(eq(pointsLedgerTable.userId, userId))
    .orderBy(desc(pointsLedgerTable.createdAt))
    .limit(30);
  const leaderboardRows = await db
    .select()
    .from(userPointsTable)
    .orderBy(desc(userPointsTable.totalPoints))
    .limit(10);

  return {
    account,
    referralLinks: referralLinks(account.referralCode),
    referralStats: {
      totalReferrals: referralTier.totalReferrals,
      activeReferrals: referralTier.activeReferrals,
      referralTier: referralTier.tier,
      referralTierLabel: referralTierMeta.label,
      referralBonusBps: referralTier.bonusBps,
      referralPoints: Number(referralPointStatsRows[0]?.total ?? 0),
      passivePoints: Number(passiveStatsRows[0]?.total ?? 0),
      passivePointsToday: Number(passiveTodayRows[0]?.total ?? 0),
      rank: leaderboardRows.length > 0 ? Number(rankRows[0]?.total ?? 0) + 1 : null,
    },
    referrals: referralRows.map((row) => {
      const referee = refereePoints.get(row.refereeId);

      return {
        id: row.id,
        refereeId: row.refereeId,
        refereeDisplay: referee?.referralCode ?? `${row.refereeId.slice(0, 10)}...`,
        refereeReferralCode: referee?.referralCode ?? null,
        refereePoints: referee?.totalPoints ?? 0,
        source: row.source,
        isActive: row.isActive,
        totalPassivePoints: row.totalPassivePoints,
        joinedAt: toIsoString(row.joinedAt),
      };
    }),
    recentLedger: recentRows.map((row) => ({
      id: row.id,
      action: row.action,
      source: row.source,
      points: row.points,
      basePoints: row.basePoints,
      multiplierBps: row.multiplierBps,
      relatedUserId: row.relatedUserId,
      relatedEntityId: row.relatedEntityId,
      createdAt: toIsoString(row.createdAt),
    })),
    leaderboard: leaderboardRows.map((row, index) => {
      const tier = tierForPoints(row.totalPoints);

      return {
        rank: index + 1,
        userId: row.userId,
        display: row.referralCode,
        referralCode: row.referralCode,
        totalPoints: row.totalPoints,
        tier: tier.tier,
        tierLabel: tier.label,
      };
    }),
  };
}

export async function getPlatformRewardsStats(): Promise<PlatformRewardsStats> {
  const { db, pointsLedgerTable, userPointsTable } = await getDbModule();
  const [ledgerStats] = await db
    .select({
      totalPointsAwarded: sql<number>`coalesce(sum(${pointsLedgerTable.points}), 0)::int`,
      ledgerEntries: sql<number>`count(${pointsLedgerTable.id})::int`,
    })
    .from(pointsLedgerTable);
  const [accountStats] = await db
    .select({
      totalRewardAccounts: sql<number>`count(${userPointsTable.userId})::int`,
    })
    .from(userPointsTable);

  return {
    totalPointsAwarded: Number(ledgerStats?.totalPointsAwarded ?? 0),
    totalRewardAccounts: Number(accountStats?.totalRewardAccounts ?? 0),
    ledgerEntries: Number(ledgerStats?.ledgerEntries ?? 0),
    updatedAt: new Date().toISOString(),
  };
}
