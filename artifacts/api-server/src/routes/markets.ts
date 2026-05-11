import { Router, type IRouter } from "express";
import { z } from "zod";
import { getMarketDetail, getMarketListings, getMarketSignals } from "../lib/markets/dexscreener";

const marketQuerySchema = z.object({
  chain: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
  sort: z.enum(["trending", "new", "gainers", "volume", "m5", "h1", "h6", "h24"]).default("trending"),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

const signalQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

const router: IRouter = Router();

router.get("/markets", async (req, res, next) => {
  try {
    const query = marketQuerySchema.parse(req.query);
    res.json(await getMarketListings(query));
  } catch (err) {
    next(err);
  }
});

router.get("/markets/signals", async (req, res, next) => {
  try {
    const query = signalQuerySchema.parse(req.query);
    res.json(await getMarketSignals(query.limit));
  } catch (err) {
    next(err);
  }
});

router.get("/markets/token/:chainId/:tokenAddress", async (req, res, next) => {
  try {
    const result = await getMarketDetail(req.params.chainId, req.params.tokenAddress);

    if (!result) {
      res.status(404).json({ error: "Token market not found." });
      return;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
