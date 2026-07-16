import { Router, type IRouter } from "express";
import { z } from "zod";
import { getLaunchpadPulse } from "../lib/markets/launchpad-pulse";
import { getLaunchpadTokens, getLaunchpadTrades } from "../lib/launchpad/indexer-store";

const pulseQuerySchema = z.object({
  chain: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(30).default(18),
});

const router: IRouter = Router();

router.get("/launchpad/pulse", async (req, res, next) => {
  try {
    const query = pulseQuerySchema.parse(req.query);
    res.set("Cache-Control", "no-store");
    res.json(await getLaunchpadPulse(query));
  } catch (err) {
    next(err);
  }
});

const tokensQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['bump', 'creation', 'reply']).default('bump'),
});

router.get("/launchpad/tokens", async (req, res, next) => {
  try {
    const query = tokensQuerySchema.parse(req.query);
    res.set("Cache-Control", "no-store");
    const tokens = await getLaunchpadTokens(query.limit, query.sort);
    res.json(tokens);
  } catch (err) {
    next(err);
  }
});

router.get("/launchpad/tokens/:address/trades", async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    res.set("Cache-Control", "no-store");
    const trades = await getLaunchpadTrades(req.params.address, limit);
    res.json(trades);
  } catch (err) {
    next(err);
  }
});

export default router;
