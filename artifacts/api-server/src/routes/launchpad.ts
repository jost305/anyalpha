import { Router, type IRouter } from "express";
import { z } from "zod";
import { getLaunchpadPulse } from "../lib/markets/launchpad-pulse";

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

export default router;
