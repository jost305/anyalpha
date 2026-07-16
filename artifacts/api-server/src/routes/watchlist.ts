import { Router, type IRouter } from "express";
import { z } from "zod";
import { getMarketDetail } from "../lib/markets/dexscreener";
import {
  listWatchlistIds,
  listWatchlistItems,
  normalizeWatchlistMarket,
  removeWatchlistItem,
  upsertWatchlistItem,
  type WatchlistItem,
} from "../lib/auth/watchlist-store";
import { getBearerToken, getPrivyClient, verifyPrivyAccessToken } from "../lib/auth/privy-auth";

const addWatchlistItemSchema = z.object({
  market: z.unknown(),
});

const router: IRouter = Router();

async function requireAuthenticatedUser(authorization: string | string[] | undefined) {
  const token = getBearerToken(authorization);

  if (!token) {
    return {
      ok: false as const,
      status: 401,
      body: { error: "Missing Privy access token." },
    };
  }

  if (!getPrivyClient()) {
    return {
      ok: false as const,
      status: 503,
      body: {
        error: "Privy is not configured on the server. Set VITE_PRIVY_APP_ID and PRIVY_APP_SECRET.",
      },
    };
  }

  try {
    const auth = await verifyPrivyAccessToken(token);

    if (!auth) {
      return {
        ok: false as const,
        status: 503,
        body: {
          error: "Privy is not configured on the server. Set VITE_PRIVY_APP_ID and PRIVY_APP_SECRET.",
        },
      };
    }

    return {
      ok: true as const,
      user: auth.user,
      claims: auth.claims,
    };
  } catch {
    return {
      ok: false as const,
      status: 401,
      body: { error: "Invalid or expired Privy access token." },
    };
  }
}

async function refreshWatchlistItem(item: WatchlistItem) {
  try {
    const detail = await getMarketDetail(item.market.chainId, item.market.tokenAddress);
    const liveMarket =
      detail?.pairs.find((pair) => pair.id === item.market.id) ??
      detail?.pairs.find(
        (pair) =>
          pair.pairAddress.toLowerCase() === item.market.pairAddress.toLowerCase() ||
          pair.tokenAddress.toLowerCase() === item.market.tokenAddress.toLowerCase(),
      ) ??
      detail?.token;

    return {
      ...item,
      market: liveMarket ?? item.market,
      live: Boolean(liveMarket),
    };
  } catch {
    return {
      ...item,
      market: item.market,
      live: false,
    };
  }
}

router.get("/watchlist", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const snapshot = await listWatchlistItems(auth.user.id);
    const items = await Promise.all(snapshot.items.map((item) => refreshWatchlistItem(item)));

    res.setHeader("Cache-Control", "no-store");
    res.json({
      items,
      total: items.length,
      updatedAt: new Date().toISOString(),
      source: "watchlist",
    });
  } catch (err) {
    next(err);
  }
});

router.get("/watchlist/ids", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const itemIds = await listWatchlistIds(auth.user.id);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      itemIds,
      total: itemIds.length,
      updatedAt: new Date().toISOString(),
      source: "watchlist",
    });
  } catch (err) {
    next(err);
  }
});

router.post("/watchlist/items", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const body = addWatchlistItemSchema.parse(req.body);
    const market = normalizeWatchlistMarket(body.market);

    if (!market) {
      res.status(400).json({ error: "Invalid market payload." });
      return;
    }

    const item = await upsertWatchlistItem(auth.user.id, market);

    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({
      item,
      source: "watchlist",
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Watchlist limit reached")) {
      res.status(409).json({ error: err.message });
      return;
    }

    next(err);
  }
});

router.delete("/watchlist/items/:marketId", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const marketId = decodeURIComponent(req.params.marketId ?? "").trim();
    if (!marketId) {
      res.status(400).json({ error: "Missing market id." });
      return;
    }

    const removed = await removeWatchlistItem(auth.user.id, marketId);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      removed,
      marketId,
      source: "watchlist",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
