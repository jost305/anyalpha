import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import {
  ingestXWebhook,
  listPublicTwitterTrack,
  listTwitterTrack,
  removeXAccountSubscription,
  syncXFilteredStreamRules,
  trackXAccount,
  type XAlertMode,
} from "../lib/twitter-track/store";
import { getBearerToken, getPrivyClient, verifyPrivyAccessToken } from "../lib/auth/privy-auth";

const router: IRouter = Router();

const trackAccountSchema = z.object({
  handle: z.string().trim().min(1).max(32),
  alertMode: z.enum(["all_posts", "token_mentions", "muted"]).optional(),
  telegramEnabled: z.boolean().optional(),
  browserEnabled: z.boolean().optional(),
});

type RawBodyRequest = Request & { rawBody?: Buffer };

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

function xConsumerSecret(): string | null {
  return process.env["X_CONSUMER_SECRET"]?.trim() || process.env["X_API_SECRET"]?.trim() || null;
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

function validateXSignature(req: RawBodyRequest) {
  const secret = xConsumerSecret();
  if (!secret) {
    return {
      ok: false as const,
      status: 503,
      body: { error: "X_CONSUMER_SECRET or X_API_SECRET is not configured." },
    };
  }

  const rawBody = req.rawBody;
  const signature = headerValue(req.headers["x-twitter-webhooks-signature"])?.replace(/^sha256=/i, "");

  if (!rawBody || !signature) {
    return {
      ok: false as const,
      status: 401,
      body: { error: "Missing X webhook signature." },
    };
  }

  const digest = createHmac("sha256", secret).update(rawBody).digest("base64");
  if (!constantTimeEqual(signature, digest)) {
    return {
      ok: false as const,
      status: 401,
      body: { error: "Invalid X webhook signature." },
    };
  }

  return { ok: true as const };
}

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

router.get("/twitter-track", async (req, res, next) => {
  try {
    const token = getBearerToken(req.headers.authorization);
    const auth = token ? await requireAuthenticatedUser(req.headers.authorization) : null;

    if (auth && !auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const snapshot = auth?.ok ? await listTwitterTrack(auth.user.id) : await listPublicTwitterTrack();

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "twitter_track",
      ...snapshot,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/twitter-track/accounts", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const body = trackAccountSchema.parse(req.body);
    const account = await trackXAccount(auth.user.id, {
      ...body,
      alertMode: body.alertMode as XAlertMode | undefined,
    });

    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({
      source: "twitter_track",
      account,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.issues[0]?.message ?? "Invalid X account payload." });
      return;
    }

    if (err instanceof Error && err.message.includes("X handle")) {
      res.status(400).json({ error: err.message });
      return;
    }

    next(err);
  }
});

router.delete("/twitter-track/accounts/:id", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const subscriptionId = req.params.id?.trim();
    if (!subscriptionId) {
      res.status(400).json({ error: "Missing X account subscription id." });
      return;
    }

    const removed = await removeXAccountSubscription(auth.user.id, subscriptionId);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "twitter_track",
      removed,
      id: subscriptionId,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/twitter-track/webhooks/x", (req, res) => {
  const crcToken = typeof req.query.crc_token === "string" ? req.query.crc_token : null;
  const secret = xConsumerSecret();

  if (!crcToken) {
    res.status(400).json({ error: "Missing crc_token." });
    return;
  }

  if (!secret) {
    res.status(503).json({ error: "X_CONSUMER_SECRET or X_API_SECRET is not configured." });
    return;
  }

  const digest = createHmac("sha256", secret).update(crcToken).digest("base64");
  res.json({ response_token: `sha256=${digest}` });
});

router.post("/twitter-track/webhooks/x", async (req, res, next) => {
  try {
    const validation = validateXSignature(req as RawBodyRequest);

    if (!validation.ok) {
      res.status(validation.status).json(validation.body);
      return;
    }

    const result = await ingestXWebhook(req.body, { signatureVerified: true });

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "twitter_track_webhook",
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/twitter-track/provider-sync/x", async (req, res, next) => {
  try {
    const admin = validateAdminSecret(req);

    if (!admin.ok) {
      res.status(admin.status).json(admin.body);
      return;
    }

    const result = await syncXFilteredStreamRules();

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "twitter_track_provider_sync",
      ...result,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("X_BEARER_TOKEN")) {
      res.status(400).json({ error: err.message });
      return;
    }

    next(err);
  }
});

export default router;
