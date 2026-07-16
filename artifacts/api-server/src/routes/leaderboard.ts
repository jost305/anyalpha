import { Router, type IRouter } from "express";
import { z } from "zod";
import { getLeaderboardSnapshot, type LeaderboardPeriod } from "../lib/leaderboard/store";

const router: IRouter = Router();

const periodSchema = z.enum(["24h", "7d", "30d", "all"]).default("7d");

router.get("/leaderboard", async (req, res, next) => {
  try {
    const period = periodSchema.parse(req.query.period) as LeaderboardPeriod;
    const snapshot = await getLeaderboardSnapshot(period);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "leaderboard",
      ...snapshot,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid leaderboard period." });
      return;
    }

    next(err);
  }
});

export default router;
