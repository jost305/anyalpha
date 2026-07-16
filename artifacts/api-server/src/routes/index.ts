import { Router, type IRouter } from "express";
import alertsRouter from "./alerts";
import authRouter from "./auth";
import bundleDetectionRouter from "./bundle-detection";
import healthRouter from "./health";
import leaderboardRouter from "./leaderboard";
import launchpadRouter from "./launchpad";
import marketsRouter from "./markets";
import notificationsRouter from "./notifications";
import pointsRouter from "./points";
import realtimeRouter from "./realtime";
import telegramRouter from "./telegram";
import tradingRouter from "./trading";
import twitterTrackRouter from "./twitter-track";
import verificationRouter from "./verification";
import walletTrackerRouter from "./wallet-tracker";
import watchlistRouter from "./watchlist";

const router: IRouter = Router();

router.use(authRouter);
router.use(bundleDetectionRouter);
router.use(healthRouter);
router.use(alertsRouter);
router.use(leaderboardRouter);
router.use(launchpadRouter);
router.use(marketsRouter);
router.use(notificationsRouter);
router.use(pointsRouter);
router.use(realtimeRouter);
router.use(telegramRouter);
router.use(tradingRouter);
router.use(twitterTrackRouter);
router.use(verificationRouter);
router.use(walletTrackerRouter);
router.use(watchlistRouter);

export default router;
