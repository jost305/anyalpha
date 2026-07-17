import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql, desc, ilike, or } from "drizzle-orm";
import { twitterTrendsTable, launchpadTokensTable } from "@workspace/db/schema";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/twitter-trends", async (req, res, next) => {
  try {
    // 1. Fetch latest trends from the database (say, top 50 by rank in the latest batch)
    // We can just query the top 50 latest ones.
    const latestTrends = await db
      .select()
      .from(twitterTrendsTable)
      .orderBy(desc(twitterTrendsTable.createdAt), twitterTrendsTable.rank)
      .limit(50);

    if (latestTrends.length === 0) {
      res.json({ trends: [] });
      return;
    }

    // Since we just insert trends, we want the distinct latest trends.
    // The query above might return duplicates if it spans multiple cron batches,
    // but limit(50) of the *most recent* batch should generally be just 50 trends 
    // assuming they are inserted together. A safer way is to get the distinct trends from the most recent timestamp.
    
    // So let's just group by or manually deduplicate:
    const uniqueTrendsMap = new Map();
    for (const t of latestTrends) {
      const lower = t.trendName.toLowerCase();
      if (!uniqueTrendsMap.has(lower)) {
        uniqueTrendsMap.set(lower, t);
      }
    }
    
    let dedupedTrends = Array.from(uniqueTrendsMap.values());

    // 2. Count tokens for each trend
    // For each trend, run a query to count tokens matching name, ticker, or description.
    // We can do this in parallel using Promise.all for the top ones.
    const enrichedTrends = await Promise.all(
      dedupedTrends.map(async (trend) => {
        // Strip # or other symbols for better matching if desired, but ILIKE with % % is fine.
        const keyword = `%${trend.trendName.replace(/^#/, '')}%`;
        
        const countRes = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(launchpadTokensTable)
          .where(
            or(
              ilike(launchpadTokensTable.name, keyword),
              ilike(launchpadTokensTable.symbol, keyword),
              // we don't have description in launchpadTokensTable, so we'll just match name and symbol
            )
          );
        
        return {
          id: trend.id,
          name: trend.trendName,
          rank: trend.rank,
          volume: trend.trendVolume,
          tokenCount: countRes[0]?.count || 0,
        };
      })
    );

    // Sort by rank ascending
    enrichedTrends.sort((a, b) => a.rank - b.rank);

    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({ trends: enrichedTrends });
  } catch (err) {
    logger.error({ err }, "Failed to fetch twitter trends API");
    next(err);
  }
});

export default router;
