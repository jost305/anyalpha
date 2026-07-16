import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAuthenticatedUser } from "../lib/auth/require-authenticated-user";
import { handleTelegramUpdate, type TelegramUpdate } from "../lib/telegram/bot";
import { createTelegramLinkCode, listTelegramLinkStatus } from "../lib/telegram/linking";

const router: IRouter = Router();

function configuredSecret(): string | null {
  const secret = process.env["TELEGRAM_WEBHOOK_SECRET"]?.trim();
  return secret || null;
}

function validateTelegramSecret(headerValue: string | string[] | undefined) {
  const secret = configuredSecret();

  if (!secret) {
    return {
      ok: false as const,
      status: 503,
      body: { error: "TELEGRAM_WEBHOOK_SECRET is not configured." },
    };
  }

  const provided = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (provided !== secret) {
    return {
      ok: false as const,
      status: 401,
      body: { error: "Invalid Telegram webhook secret." },
    };
  }

  return { ok: true as const };
}

const updateSchema = z.object({
  update_id: z.number().optional(),
  message: z.unknown().optional(),
  edited_message: z.unknown().optional(),
});

router.get("/telegram/status", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    source: "telegram",
    botConfigured: Boolean(process.env["TELEGRAM_BOT_TOKEN"]?.trim()),
    alertChatConfigured: Boolean(
      process.env["TELEGRAM_ALERT_CHAT_ID"]?.trim() ||
        process.env["TELEGRAM_CHANNEL_ID"]?.trim() ||
        process.env["TELEGRAM_ALERT_CHANNEL"]?.trim(),
    ),
    webhookSecretConfigured: Boolean(configuredSecret()),
    botUsernameConfigured: Boolean(process.env["TELEGRAM_BOT_USERNAME"]?.trim()),
  });
});

router.get("/telegram/link-status", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const status = await listTelegramLinkStatus(auth.user.id);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "telegram_link",
      ...status,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/telegram/link-code", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const link = await createTelegramLinkCode(auth.user.id);

    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({
      source: "telegram_link",
      link,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/telegram/webhook", async (req, res, next) => {
  try {
    const secret = validateTelegramSecret(req.headers["x-telegram-bot-api-secret-token"]);

    if (!secret.ok) {
      res.status(secret.status).json(secret.body);
      return;
    }

    updateSchema.parse(req.body);
    const result = await handleTelegramUpdate(req.body as TelegramUpdate);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.issues[0]?.message ?? "Invalid Telegram update." });
      return;
    }

    next(err);
  }
});

export default router;
