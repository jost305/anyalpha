import { Router, type IRouter } from "express";
import { z } from "zod";
import { getMarketDetail, getMarketListings, getMarketSignals } from "../lib/markets/dexscreener";

const booleanQuery = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return value;
}, z.boolean());

const marketQuerySchema = z.object({
  chain: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
  sort: z.enum(["trending", "new", "gainers", "volume", "m5", "h1", "h6", "h24"]).default("trending"),
  limit: z.coerce.number().int().min(1).max(100).default(100),
  enrich: booleanQuery.optional(),
  all: booleanQuery.optional(),
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

    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
