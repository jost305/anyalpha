import { Router, type IRouter } from "express";
import { getOrCreateAlphaPointsAccount, type ReferralSource } from "../lib/auth/alpha-points-store";
import { getBearerToken, getPrivyClient, verifyPrivyAccessToken } from "../lib/auth/privy-auth";

const router: IRouter = Router();

router.get("/auth/me", async (req, res, next) => {
  try {
    const token = getBearerToken(req.headers.authorization);

    if (!token) {
      res.status(401).json({ error: "Missing Privy access token." });
      return;
    }

    const client = getPrivyClient();

    if (!client) {
      res.status(503).json({
        error: "Privy is not configured on the server. Set VITE_PRIVY_APP_ID and PRIVY_APP_SECRET.",
      });
      return;
    }

    try {
      const auth = await verifyPrivyAccessToken(token);

      if (!auth) {
        res.status(503).json({
          error: "Privy is not configured on the server. Set VITE_PRIVY_APP_ID and PRIVY_APP_SECRET.",
        });
        return;
      }

      const { claims, user } = auth;
      const referralSource: ReferralSource = req.query["refSource"] === "telegram" ? "telegram" : "terminal";
      const referralCode = typeof req.query["ref"] === "string" ? req.query["ref"] : null;
      const alphaPoints = await getOrCreateAlphaPointsAccount(user.id, {
        referralCode,
        referralSource,
        hasConnectedWallet: Boolean(user.wallet?.address),
      });

      res.setHeader("Cache-Control", "no-store");
      res.json({
        verified: true,
        verificationSource: "access-token",
        session: {
          appId: claims.appId,
          issuer: claims.issuer,
          issuedAt: claims.issuedAt,
          expiration: claims.expiration,
          sessionId: claims.sessionId,
          userId: claims.userId,
        },
        serverUser: {
          id: user.id,
          createdAt: user.createdAt.toISOString(),
          linkedAccountCount: user.linkedAccounts.length,
          hasAcceptedTerms: null,
          isGuest: user.isGuest,
          email: user.email?.address ?? null,
          phone: user.phone?.number ?? null,
          wallet: user.wallet?.address ?? null,
          googleEmail: user.google?.email ?? null,
          twitterUsername: user.twitter?.username ?? null,
          githubUsername: user.github?.username ?? null,
          farcasterUsername: user.farcaster?.username ?? null,
          telegramUsername: user.telegram?.username ?? null,
          linkedAccountTypes: Array.from(new Set(user.linkedAccounts.map((account) => account.type))),
          customMetadata: user.customMetadata ?? null,
          alphaPoints,
        },
      });
      return;
    } catch {
      res.status(401).json({ error: "Invalid or expired Privy access token." });
      return;
    }
  } catch (err) {
    next(err);
  }
});

export default router;
