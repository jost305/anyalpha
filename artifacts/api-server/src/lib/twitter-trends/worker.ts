import { db } from "@workspace/db";
import { twitterTrendsTable } from "@workspace/db/schema";
import { logger } from "../logger";

const TWITTER_TRENDS_API_KEY = process.env["TWITTER_API_IO_KEY"] || "";
const WOEID_WORLDWIDE = "1";

let timeoutId: ReturnType<typeof setInterval>;

export async function fetchAndSaveTrends() {
  if (!TWITTER_TRENDS_API_KEY) {
    logger.warn("TWITTER_API_IO_KEY not set. Skipping twitter trends fetch.");
    return;
  }

  try {
    const res = await fetch(`https://api.twitterapi.io/twitter/trends?woeid=${WOEID_WORLDWIDE}`, {
      headers: {
        "X-API-Key": TWITTER_TRENDS_API_KEY,
      },
    });

    if (!res.ok) {
      const txt = await res.text();
      logger.error({ status: res.status, txt }, "Failed to fetch twitter trends");
      return;
    }

    const data = await res.json() as any;
    
    // The response for /twitter/trends usually has { data: { trends: [...] } } or similar.
    const trendsList = data?.trends || data?.data?.trends || (Array.isArray(data) ? data : []);

    if (!Array.isArray(trendsList) || trendsList.length === 0) {
      logger.warn({ data }, "No trends returned from twitterapi.io");
      return;
    }

    const dbRows = trendsList.map((t: any, idx: number) => ({
      trendName: t.name || t.query || String(t),
      trendVolume: t.tweet_volume ? Number(t.tweet_volume) : null,
      rank: idx + 1,
    })).slice(0, 50); // top 50

    await db.transaction(async (tx) => {
      await tx.delete(twitterTrendsTable);
      await tx.insert(twitterTrendsTable).values(dbRows);
    });

    logger.info(`Successfully saved ${dbRows.length} twitter trends`);
  } catch (err) {
    logger.error({ err }, "Error fetching twitter trends");
  }
}

export function startTwitterTrendsWorker() {
  logger.info("Starting Twitter Trends worker...");
  
  // Fetch immediately
  void fetchAndSaveTrends();

  // Fetch every 10 minutes
  const INTERVAL_MS = 10 * 60 * 1000;
  timeoutId = setInterval(() => {
    void fetchAndSaveTrends();
  }, INTERVAL_MS);
}
