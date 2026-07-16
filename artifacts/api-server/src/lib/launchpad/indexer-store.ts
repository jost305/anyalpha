import { logger } from "../logger";

type DbModule = typeof import("@workspace/db");

let dbModulePromise: Promise<DbModule> | null = null;

export async function getDb(): Promise<DbModule> {
  if (!dbModulePromise) {
    dbModulePromise = import("@workspace/db");
  }
  return dbModulePromise;
}

export async function insertLaunchpadToken(
  chainId: number,
  tokenAddress: string,
  name: string,
  symbol: string,
  metadataUri: string,
  devAddress: string
) {
  try {
    const { db, launchpadTokensTable } = await getDb();
    
    await db.insert(launchpadTokensTable).values({
      chainId,
      tokenAddress: tokenAddress.toLowerCase(),
      name,
      symbol,
      metadataUri,
      devAddress: devAddress.toLowerCase(),
    }).onConflictDoNothing();
    
    logger.info({ tokenAddress, chainId }, "Inserted Launchpad Token");

    // Publish Realtime Event
    publishRealtimeEvent("launchpad-events", "TokenCreated", {
      chainId,
      tokenAddress: tokenAddress.toLowerCase(),
      name,
      symbol,
      metadataUri,
      devAddress: devAddress.toLowerCase(),
    }).catch((err) => logger.error({ err }, "Failed to publish token pusher event"));

  } catch (error: any) {
    logger.error({ error: String(error), details: error?.message }, "Failed to insert Launchpad Token");
  }
}

import { eq, sql, desc } from "drizzle-orm";

import { publishRealtimeEvent } from "../realtime/pusher";

export async function insertLaunchpadTrade(
  tokenAddress: string,
  userAddress: string,
  isBuy: boolean,
  ethAmountRaw: string,
  tokenAmountRaw: string,
  txHash: string
) {
  try {
    const { db, launchpadTradesTable, launchpadTokensTable } = await getDb();
    
    await db.transaction(async (tx) => {
      // 1. Insert trade
      await tx.insert(launchpadTradesTable).values({
        tokenAddress: tokenAddress.toLowerCase(),
        userAddress: userAddress.toLowerCase(),
        isBuy,
        ethAmountRaw,
        tokenAmountRaw,
        txHash,
      }).onConflictDoNothing();

      // Increment replyCount / trade count
      await tx.update(launchpadTokensTable)
        .set({ 
          replyCount: sql`${launchpadTokensTable.replyCount} + 1`,
          updatedAt: new Date()
        })
        .where(eq(launchpadTokensTable.tokenAddress, tokenAddress.toLowerCase()));
    });
      
    logger.info({ txHash, tokenAddress }, "Inserted Launchpad Trade");

    // Publish Realtime Event
    publishRealtimeEvent("launchpad-events", "Trade", {
      tokenAddress: tokenAddress.toLowerCase(),
      userAddress: userAddress.toLowerCase(),
      isBuy,
      ethAmountRaw,
      tokenAmountRaw,
      txHash,
    }).catch((err) => logger.error({ err }, "Failed to publish trade pusher event"));
    
  } catch (error: any) {
    logger.error({ error: String(error), details: error?.message }, "Failed to insert Launchpad Trade");
  }
}

export async function getLaunchpadTokens(limit = 20, sort: 'bump' | 'creation' | 'reply' = 'bump') {
  const { db, launchpadTokensTable } = await getDb();
  
  let orderBy;
  switch (sort) {
    case 'creation':
      orderBy = desc(launchpadTokensTable.createdAt);
      break;
    case 'reply':
      orderBy = desc(launchpadTokensTable.replyCount);
      break;
    case 'bump':
    default:
      orderBy = desc(launchpadTokensTable.updatedAt);
      break;
  }
  
  return db.select().from(launchpadTokensTable).orderBy(orderBy).limit(limit);
}

export async function getLaunchpadTrades(tokenAddress: string, limit = 50) {
  const { db, launchpadTradesTable } = await getDb();
  return db.select()
    .from(launchpadTradesTable)
    .where(eq(launchpadTradesTable.tokenAddress, tokenAddress.toLowerCase()))
    .orderBy(desc(launchpadTradesTable.createdAt))
    .limit(limit);
}
