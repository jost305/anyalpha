import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { getPlatformRewardsStats, getPointsDashboard } from "../lib/auth/alpha-points-store";
import { getBearerToken, getPrivyClient, verifyPrivyAccessToken } from "../lib/auth/privy-auth";

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

router.get("/points/me", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const dashboard = await getPointsDashboard(auth.user.id);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "points",
      dashboard,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

async function handleRewardsStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await getPlatformRewardsStats();

    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    res.json({
      source: "rewards",
      stats,
      updatedAt: stats.updatedAt,
    });
  } catch (err) {
    next(err);
  }
}

router.get("/points/stats", handleRewardsStats);
router.get("/rewards/stats", handleRewardsStats);

export default router;
