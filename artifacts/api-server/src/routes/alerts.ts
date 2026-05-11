import { Router, type IRouter } from "express";
import { z } from "zod";
import { publishAlertSignal } from "../lib/alerts/engine";
import { alertChains, alertSources, triggerKinds, type AlertSignal } from "../lib/alerts/types";

const alertTokenSchema = z.object({
  chain: z.enum(alertChains),
  symbol: z.string().trim().min(1),
  address: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  pairAddress: z.string().trim().min(1).optional(),
  pairUrl: z.string().trim().url().optional(),
  dex: z.string().trim().min(1).optional(),
});

const alertMarketSchema = z.object({
  priceUsd: z.number().nonnegative().optional(),
  liquidityUsd: z.number().nonnegative().optional(),
  marketCapUsd: z.number().nonnegative().optional(),
  volume24hUsd: z.number().nonnegative().optional(),
  priceChange24hPct: z.number().optional(),
  holderCount: z.number().int().nonnegative().optional(),
  ageMinutes: z.number().nonnegative().optional(),
  txns24h: z.number().int().nonnegative().optional(),
  buys24h: z.number().int().nonnegative().optional(),
  sells24h: z.number().int().nonnegative().optional(),
  buyPressurePct: z.number().min(0).max(100).optional(),
});

const alertTriggerSchema = z.object({
  kind: z.enum(triggerKinds),
  amountUsd: z.number().nonnegative().optional(),
  txHash: z.string().trim().min(1).optional(),
  walletAddress: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
});

const alertPreviewRequestSchema = z.object({
  source: z.enum(alertSources).default("manual"),
  token: alertTokenSchema,
  market: alertMarketSchema.optional(),
  trigger: alertTriggerSchema,
  narrativeTags: z.array(z.string().trim().min(1)).default([]),
  riskFlags: z.array(z.string().trim().min(1)).default([]),
  observedAt: z.string().datetime().optional(),
  dryRun: z.boolean().default(true),
});

const router: IRouter = Router();

router.post("/alerts/preview", async (req, res, next) => {
  try {
    const parsed = alertPreviewRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid alert preview request.",
        issues: parsed.error.issues,
      });
      return;
    }

    const { dryRun, ...signal } = parsed.data;
    const result = await publishAlertSignal(signal as AlertSignal, { dryRun });

    res.json({
      alertId: result.alert.id,
      score: result.alert.score,
      grade: result.alert.grade,
      riskLevel: result.alert.riskLevel,
      reasons: result.alert.reasons,
      riskFlags: result.alert.riskFlags,
      message: result.message,
      telegram: result.telegram,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
