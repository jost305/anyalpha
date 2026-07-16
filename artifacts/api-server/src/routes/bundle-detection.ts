import { timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import { analyzeAndStoreBundle, getBundleAnalysis } from "../lib/bundle-detection/store";
import { awardPoints } from "../lib/auth/alpha-points-store";
import { getBearerToken, getPrivyClient, verifyPrivyAccessToken } from "../lib/auth/privy-auth";

const router: IRouter = Router();

const launchTransactionSchema = z.object({
  walletAddress: z.string().trim().min(1),
  blockNumber: z.union([z.string().trim().min(1), z.number()]).optional(),
  timestamp: z.union([z.string().trim().min(1), z.number()]).optional(),
  tokenAmount: z.number().finite().nonnegative().optional(),
  supplyPct: z.number().finite().nonnegative().optional(),
  buyAmountNative: z.number().finite().nonnegative().optional(),
  buyAmountUsd: z.number().finite().nonnegative().optional(),
  fundingSource: z.string().trim().min(1).optional(),
  walletAgeDays: z.number().finite().nonnegative().optional(),
  deployerConnected: z.boolean().optional(),
  isBot: z.boolean().optional(),
});

const analyzeSchema = z.object({
  chain: z.string().trim().min(1),
  tokenAddress: z.string().trim().min(1),
  pairAddress: z.string().trim().min(1).optional(),
  deployerRugs: z.number().int().min(0).optional(),
  totalSupply: z.number().finite().positive().optional(),
  bundleWalletsPnl: z.number().finite().optional(),
  retailAvgPnl: z.number().finite().optional(),
  bundleStillHolding: z.boolean().optional(),
  transactions: z.array(launchTransactionSchema).min(1).max(200),
});

const analyzeBatchSchema = z.object({
  analyses: z.array(analyzeSchema).min(1).max(25),
});

const analyzeLiveSchema = z.object({
  chain: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  force: z.coerce.boolean().default(false),
  maxAgeMinutes: z.coerce.number().int().min(1).max(7 * 24 * 60).default(6 * 60),
  launchWindowMinutes: z.coerce.number().int().min(1).max(60).default(12),
  minLaunchBuys: z.coerce.number().int().min(1).max(25).default(3),
});

const monitorExitsSchema = z.object({
  chain: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(250).default(40),
  dryRun: z.coerce.boolean().default(false),
});

const holderPnlSnapshotSchema = z.object({
  chain: z.string().trim().min(1),
  tokenAddress: z.string().trim().min(1),
});

function headerValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed || null;
}

function bearerToken(value: string | string[] | undefined): string | null {
  const raw = headerValue(value);
  const match = raw?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function constantTimeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function validateAdminSecret(req: Request) {
  const secret = process.env["ANYALPHA_ADMIN_SECRET"]?.trim();

  if (!secret) {
    return {
      ok: false as const,
      status: 503,
      body: { error: "ANYALPHA_ADMIN_SECRET is not configured." },
    };
  }

  const provided = headerValue(req.headers["x-anyalpha-admin-secret"]) ?? bearerToken(req.headers.authorization);
  if (!provided || !constantTimeEqual(provided, secret)) {
    return {
      ok: false as const,
      status: 401,
      body: { error: "Invalid admin secret." },
    };
  }

  return { ok: true as const };
}

async function authenticatedUserId(req: Request): Promise<string | null> {
  const token = getBearerToken(req.headers.authorization);
  if (!token || !getPrivyClient()) return null;

  const auth = await verifyPrivyAccessToken(token).catch(() => null);
  return auth?.user.id ?? null;
}

router.get("/bundle-detection/:chain/:tokenAddress", async (req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.json(await getBundleAnalysis(req.params.chain, req.params.tokenAddress));
  } catch (err) {
    next(err);
  }
});

router.post("/bundle-detection/:chain/:tokenAddress/view", async (req, res, next) => {
  try {
    const userId = await authenticatedUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Missing or invalid Privy access token." });
      return;
    }

    const analysis = await getBundleAnalysis(req.params.chain, req.params.tokenAddress);
    if (analysis.label === "unknown") {
      res.json({
        source: "bundle_detection",
        awarded: false,
        points: 0,
        reason: "Bundle classification is still pending.",
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    const day = new Date().toISOString().slice(0, 10);
    const award = await awardPoints(userId, {
      action: "view_bundle_detail",
      basePoints: 20,
      source: "bundle_detection",
      relatedEntityId: `${req.params.chain}:${req.params.tokenAddress}`.toLowerCase(),
      idempotencyKey: `view-bundle-detail:${userId}:${req.params.chain.toLowerCase()}:${req.params.tokenAddress.toLowerCase()}:${day}`,
      metadata: {
        chain: req.params.chain,
        tokenAddress: req.params.tokenAddress,
        label: analysis.label,
        score: analysis.score,
      },
      dailyLimit: 25,
    });

    res.json({
      source: "bundle_detection",
      awarded: award.awarded,
      points: award.points,
      basePoints: award.basePoints,
      action: award.action,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/bundle-detection/analyze", async (req, res, next) => {
  try {
    const admin = validateAdminSecret(req);
    if (!admin.ok) {
      res.status(admin.status).json(admin.body);
      return;
    }

    const body = analyzeSchema.parse(req.body);
    const analysis = await analyzeAndStoreBundle(body);
    res.status(201).json(analysis);
  } catch (err) {
    next(err);
  }
});

router.post("/bundle-detection/analyze-batch", async (req, res, next) => {
  try {
    const admin = validateAdminSecret(req);
    if (!admin.ok) {
      res.status(admin.status).json(admin.body);
      return;
    }

    const body = analyzeBatchSchema.parse(req.body);
    const analyses = [];
    for (const input of body.analyses) {
      analyses.push(await analyzeAndStoreBundle(input));
    }

    res.status(201).json({
      source: "bundle_detection",
      count: analyses.length,
      data: analyses,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/bundle-detection/analyze-live", async (req, res, next) => {
  try {
    const admin = validateAdminSecret(req);
    if (!admin.ok) {
      res.status(admin.status).json(admin.body);
      return;
    }

    const body = analyzeLiveSchema.parse(req.body ?? {});
    const [{ getMarketListings }, { analyzeLiveBundleTokens }] = await Promise.all([
      import("../lib/markets/dexscreener"),
      import("../lib/bundle-detection/live-analyzer"),
    ]);
    const listings = await getMarketListings({
      sort: "new",
      limit: Math.max(body.limit, Math.min(100, body.limit * 3)),
      chain: body.chain,
      enrich: false,
    });
    const results = await analyzeLiveBundleTokens(listings.data, body);

    res.status(202).json({
      source: "bundle_detection_live_worker",
      scanned: listings.data.length,
      count: results.length,
      analyzed: results.filter((result) => result.status === "analyzed").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      errors: results.filter((result) => result.status === "error").length,
      data: results,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/bundle-detection/monitor-exits", async (req, res, next) => {
  try {
    const admin = validateAdminSecret(req);
    if (!admin.ok) {
      res.status(admin.status).json(admin.body);
      return;
    }

    const body = monitorExitsSchema.parse(req.body ?? {});
    const { monitorBundleExits } = await import("../lib/bundle-detection/exit-monitor");
    res.status(202).json(await monitorBundleExits(body));
  } catch (err) {
    next(err);
  }
});

router.post("/bundle-detection/snapshot-holder-pnl", async (req, res, next) => {
  try {
    const admin = validateAdminSecret(req);
    if (!admin.ok) {
      res.status(admin.status).json(admin.body);
      return;
    }

    const body = holderPnlSnapshotSchema.parse(req.body ?? {});
    const [{ getMarketDetail }, { snapshotHolderPnlFromDetail }] = await Promise.all([
      import("../lib/markets/dexscreener"),
      import("../lib/bundle-detection/holder-pnl"),
    ]);
    const detail = await getMarketDetail(body.chain, body.tokenAddress);
    if (!detail) {
      res.status(404).json({ error: "Token detail not found." });
      return;
    }

    res.status(202).json({
      source: "holder_pnl_snapshot",
      token: {
        chain: detail.token.chainId,
        tokenAddress: detail.token.tokenAddress,
        symbol: detail.token.symbol,
      },
      result: await snapshotHolderPnlFromDetail(detail),
      bundle: detail.token.bundle,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
