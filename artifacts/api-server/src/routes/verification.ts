import { Router, type IRouter } from "express";
import { z } from "zod";
import { awardPoints } from "../lib/auth/alpha-points-store";
import { getBearerToken, getPrivyClient, verifyPrivyAccessToken } from "../lib/auth/privy-auth";
import { publishTelegramMessage } from "../lib/alerts/telegram";
import {
  createVerificationRequest,
  getVerificationOverview,
  getVerificationRequest,
  markVerificationNotificationQueued,
  markVerificationNotificationSent,
} from "../lib/verification/store";

const verificationApplicationSchema = z.object({
  projectName: z.string().trim().min(3).max(80),
  contractAddress: z.string().trim().min(16).max(120),
  chain: z.enum(["solana", "ethereum", "base", "arbitrum"]),
  officialTwitter: z.string().trim().min(3).max(200),
  officialTelegram: z.string().trim().min(3).max(200),
  website: z.string().trim().min(8).max(240),
  description: z.string().trim().min(18).max(280),
  contact: z.string().trim().min(2).max(120),
  tier: z.enum(["standard", "priority"]),
});

const router: IRouter = Router();

async function getOptionalAuthenticatedUserId(authorization: string | string[] | undefined): Promise<string | null> {
  const token = getBearerToken(authorization);

  if (!token || !getPrivyClient()) return null;

  try {
    const auth = await verifyPrivyAccessToken(token);
    return auth?.user.id ?? null;
  } catch {
    return null;
  }
}

router.get("/verification/overview", async (req, res, next) => {
  void req;
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await getVerificationOverview());
  } catch (err) {
    next(err);
  }
});

router.get("/verification/applications/:requestId", async (req, res, next) => {
  try {
    const requestId = (req.params.requestId ?? "").trim();
    const request = await getVerificationRequest(requestId);

    if (!request) {
      res.status(404).json({ error: "Verification request not found." });
      return;
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({ request });
  } catch (err) {
    next(err);
  }
});

router.post("/verification/applications", async (req, res, next) => {
  try {
    const body = verificationApplicationSchema.parse(req.body);
    const request = await createVerificationRequest(body);
    const submittingUserId = await getOptionalAuthenticatedUserId(req.headers.authorization);

    if (submittingUserId) {
      await awardPoints(submittingUserId, {
        action: "submit_token_verification",
        basePoints: 150,
        source: "verification",
        relatedEntityId: request.id,
        idempotencyKey: `submit-token-verification:${body.chain}:${body.contractAddress.toLowerCase()}`,
        metadata: {
          chain: body.chain,
          contractAddress: body.contractAddress,
          requestId: request.id,
        },
      });
    }

    const message = [
      "[NEW VERIFICATION REQUEST]",
      "",
      `Project: ${request.projectName}`,
      `Tier: ${request.tier === "priority" ? "Priority" : "Standard"}`,
      `Chain: ${request.chain}`,
      `Contract: ${request.contractAddress}`,
      `Twitter: ${request.officialTwitter}`,
      `Telegram: ${request.officialTelegram}`,
      `Website: ${request.website}`,
      `Status: ${request.status}`,
      `Auto-scan score: ${request.autoScanScore}/100`,
      `Request ID: ${request.id}`,
    ].join("\n");

    try {
      const notification = await publishTelegramMessage(message);

      if (notification.published) {
        await markVerificationNotificationSent(request.id);
      } else {
        await markVerificationNotificationQueued(request.id, notification.reason);
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Telegram notification failed.";
      await markVerificationNotificationQueued(request.id, reason);
    }

    const refreshed = (await getVerificationRequest(request.id)) ?? request;

    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({ request: refreshed });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Verification form is incomplete or invalid." });
      return;
    }

    if (err instanceof Error && /active verification request/i.test(err.message)) {
      res.status(409).json({ error: err.message });
      return;
    }

    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }

    next(err);
  }
});

export default router;
