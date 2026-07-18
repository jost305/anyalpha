import { logger } from "../logger";
import { getPrivyClient } from "../auth/privy-auth";
import { awardPoints } from "../auth/alpha-points-store";

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

    // Award AlphaPoints for token creation
    try {
      const client = getPrivyClient();
      if (client) {
        const user = await client.getUserByWalletAddress(devAddress);
        if (user && user.id) {
          await awardPoints(user.id, {
            action: "launchpad_token_created",
            basePoints: 500,
            source: "launchpad",
            relatedEntityId: tokenAddress.toLowerCase(),
            idempotencyKey: `launchpad-token-created:${tokenAddress.toLowerCase()}`,
            applyMultiplier: true,
          });
          logger.info({ userId: user.id, tokenAddress }, "Awarded AlphaPoints for token creation");
        }
      }
    } catch (pointsErr: any) {
      // Wallet might not be linked to any privy user, ignore
      logger.debug({ err: pointsErr.message, devAddress }, "Could not award points for token creation");
    }

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

      // Increment replyCount / trade count and update marketCapRaw
      await tx.update(launchpadTokensTable)
        .set({ 
          replyCount: sql`${launchpadTokensTable.replyCount} + 1`,
          marketCapRaw: isBuy 
            ? sql`${launchpadTokensTable.marketCapRaw} + ${ethAmountRaw}::numeric`
            : sql`${launchpadTokensTable.marketCapRaw} - ${ethAmountRaw}::numeric`,
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
    
    // Award AlphaPoints for trade
    try {
      const client = getPrivyClient();
      if (client) {
        const user = await client.getUserByWalletAddress(userAddress);
        if (user && user.id) {
          await awardPoints(user.id, {
            action: "launchpad_trade",
            basePoints: 50,
            source: "launchpad",
            relatedEntityId: txHash,
            idempotencyKey: `launchpad-trade:${txHash}:${user.id}`,
            applyMultiplier: true,
          });
          logger.info({ userId: user.id, txHash }, "Awarded AlphaPoints for launchpad trade");
        }
      }
    } catch (pointsErr: any) {
      // Wallet might not be linked to any privy user, ignore
      logger.debug({ err: pointsErr.message, userAddress }, "Could not award points for trade");
    }
    
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

export async function getLaunchpadReplies(tokenAddress: string, limit = 50) {
  const { db, launchpadRepliesTable } = await getDb();
  return db.select()
    .from(launchpadRepliesTable)
    .where(eq(launchpadRepliesTable.tokenAddress, tokenAddress.toLowerCase()))
    .orderBy(desc(launchpadRepliesTable.createdAt))
    .limit(limit);
}

export async function insertLaunchpadReply(tokenAddress: string, userAddress: string, text: string) {
  try {
    const { db, launchpadRepliesTable, launchpadTokensTable } = await getDb();
    
    await db.transaction(async (tx) => {
      await tx.insert(launchpadRepliesTable).values({
        tokenAddress: tokenAddress.toLowerCase(),
        userAddress: userAddress.toLowerCase(),
        text,
      });

      await tx.update(launchpadTokensTable)
        .set({ 
          replyCount: sql`${launchpadTokensTable.replyCount} + 1`,
          updatedAt: new Date()
        })
        .where(eq(launchpadTokensTable.tokenAddress, tokenAddress.toLowerCase()));
    });

    logger.info({ tokenAddress, userAddress }, "Inserted Launchpad Reply");

    // Publish Realtime Event
    publishRealtimeEvent("launchpad-events", "Reply", {
      tokenAddress: tokenAddress.toLowerCase(),
      userAddress: userAddress.toLowerCase(),
      text,
    }).catch((err) => logger.error({ err }, "Failed to publish reply pusher event"));

    // Award AlphaPoints for reply
    try {
      const client = getPrivyClient();
      if (client) {
        const user = await client.getUserByWalletAddress(userAddress);
        if (user && user.id) {
          await awardPoints(user.id, {
            action: "launchpad_reply",
            basePoints: 10,
            source: "launchpad",
            relatedEntityId: `${tokenAddress}:${Date.now()}`,
            idempotencyKey: `launchpad-reply:${tokenAddress}:${user.id}:${Date.now()}`,
            applyMultiplier: true,
          });
          logger.info({ userId: user.id }, "Awarded AlphaPoints for launchpad reply");
        }
      }
    } catch (pointsErr: any) {
      logger.debug({ err: pointsErr.message, userAddress }, "Could not award points for reply");
    }
  } catch (error: any) {
    logger.error({ error: String(error), details: error?.message }, "Failed to insert Launchpad Reply");
    throw error;
  }
}

export async function getLaunchpadHolders(tokenAddress: string, limit = 10) {
  const { db, launchpadTradesTable } = await getDb();
  
  // Calculate the net balance for each holder
  const holders = await db.execute(sql`
    SELECT 
      user_address as "userAddress",
      SUM(
        CASE WHEN is_buy THEN CAST(token_amount_raw AS numeric)
        ELSE -CAST(token_amount_raw AS numeric) END
      ) as "balance"
    FROM ${launchpadTradesTable}
    WHERE token_address = ${tokenAddress.toLowerCase()}
    GROUP BY user_address
    HAVING SUM(
      CASE WHEN is_buy THEN CAST(token_amount_raw AS numeric)
      ELSE -CAST(token_amount_raw AS numeric) END
    ) > 0
    ORDER BY "balance" DESC
    LIMIT ${limit};
  `);
  
  return holders.rows;
}
