import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { awardPoints, getOrCreateAlphaPointsAccount } from "../auth/alpha-points-store";

const LINK_CODE_TTL_MINUTES = 15;

export interface TelegramLinkCodeResult {
  code: string;
  command: string;
  deepLink: string | null;
  expiresAt: string;
}

export interface TelegramLinkStatus {
  linked: boolean;
  accounts: Array<{
    telegramUserId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    chatId: string;
    linkedAt: string | null;
  }>;
}

export interface ConsumeTelegramLinkResult {
  ok: boolean;
  userId?: string;
  reason?: "invalid" | "expired" | "used";
}

type DbModule = typeof import("@workspace/db");

let dbModulePromise: Promise<DbModule> | null = null;

async function getDbModule(): Promise<DbModule> {
  if (dbModulePromise) return dbModulePromise;

  dbModulePromise = (async () => {
    const databaseUrl = (process.env["DATABASE_URL"] ?? "").trim();

    if (!databaseUrl) {
      throw new Error("DATABASE_URL must be configured to use Telegram linking.");
    }

    return import("@workspace/db");
  })();

  return dbModulePromise;
}

function botUsername(): string | null {
  const raw = process.env["TELEGRAM_BOT_USERNAME"]?.trim() ?? "anyalphaterminalbot";
  const normalized = raw.replace(/^@/, "").trim();
  return normalized || null;
}

function hashCode(code: string): string {
  return createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}

function newCode(): string {
  return randomBytes(6).toString("hex");
}

function cleanLinkCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase().replace(/^link_/, "");
  if (!normalized || !/^[a-f0-9]{12}$/.test(normalized)) return null;
  return normalized;
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

export async function createTelegramLinkCode(userId: string): Promise<TelegramLinkCodeResult> {
  const { db, telegramLinkCodesTable } = await getDbModule();
  const code = newCode();
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60 * 1000);
  await db.insert(telegramLinkCodesTable).values({
    userId,
    codeHash: hashCode(code),
    expiresAt,
  });

  const bot = botUsername();

  return {
    code,
    command: `/link ${code}`,
    deepLink: bot ? `https://t.me/${bot}?start=link_${code}` : null,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function listTelegramLinkStatus(userId: string): Promise<TelegramLinkStatus> {
  const { db, telegramAccountsTable } = await getDbModule();
  const accounts = await db
    .select()
    .from(telegramAccountsTable)
    .where(eq(telegramAccountsTable.linkedUserId, userId))
    .orderBy(desc(telegramAccountsTable.updatedAt))
    .limit(10);

  return {
    linked: accounts.length > 0,
    accounts: accounts.map((account) => ({
      telegramUserId: account.telegramUserId,
      username: account.username,
      firstName: account.firstName,
      lastName: account.lastName,
      chatId: account.chatId,
      linkedAt: toIsoString(account.updatedAt),
    })),
  };
}

export async function consumeTelegramLinkCode(
  rawCode: string,
  telegramUserId: string,
): Promise<ConsumeTelegramLinkResult> {
  const code = cleanLinkCode(rawCode);
  if (!code) return { ok: false, reason: "invalid" };

  const { db, telegramAccountsTable, telegramLinkCodesTable, userPointsTable } = await getDbModule();
  const rows = await db
    .select()
    .from(telegramLinkCodesTable)
    .where(and(eq(telegramLinkCodesTable.codeHash, hashCode(code)), isNull(telegramLinkCodesTable.usedAt)))
    .limit(1);
  const linkCode = rows[0];

  if (!linkCode) return { ok: false, reason: "invalid" };
  if (new Date(linkCode.expiresAt).getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const now = new Date();
  const existingLinked = await db
    .select()
    .from(telegramAccountsTable)
    .where(or(eq(telegramAccountsTable.linkedUserId, linkCode.userId), eq(telegramAccountsTable.pointsUserId, linkCode.userId)))
    .limit(20);

  for (const account of existingLinked) {
    if (account.telegramUserId === telegramUserId) continue;

    await db
      .update(telegramAccountsTable)
      .set({
        linkedUserId: null,
        pointsUserId: `telegram:${account.telegramUserId}`,
        updatedAt: now,
      })
      .where(eq(telegramAccountsTable.telegramUserId, account.telegramUserId));
  }

  await getOrCreateAlphaPointsAccount(linkCode.userId, { referralSource: "terminal" });

  await db
    .update(telegramAccountsTable)
    .set({
      linkedUserId: linkCode.userId,
      pointsUserId: linkCode.userId,
      updatedAt: now,
    })
    .where(eq(telegramAccountsTable.telegramUserId, telegramUserId));

  await db
    .update(telegramLinkCodesTable)
    .set({
      usedAt: now,
      usedByTelegramUserId: telegramUserId,
    })
    .where(eq(telegramLinkCodesTable.id, linkCode.id));

  await db
    .update(userPointsTable)
    .set({
      telegramJoinedAt: now,
      updatedAt: now,
    })
    .where(and(eq(userPointsTable.userId, linkCode.userId), isNull(userPointsTable.telegramJoinedAt)));

  await awardPoints(linkCode.userId, {
    action: "telegram_linked",
    basePoints: 150,
    source: "telegram",
    relatedEntityId: telegramUserId,
    idempotencyKey: `telegram-linked:${linkCode.userId}:${telegramUserId}`,
    skipPassive: true,
  });

  return {
    ok: true,
    userId: linkCode.userId,
  };
}
