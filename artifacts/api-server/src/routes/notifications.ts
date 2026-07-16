import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAuthenticatedUser } from "../lib/auth/require-authenticated-user";
import {
  listUserNotifications,
  markAllUserNotificationsRead,
  markUserNotificationRead,
  createUserNotification,
} from "../lib/notifications/store";
import {
  browserPushPublicConfig,
  removeUserPushSubscription,
  upsertUserPushSubscription,
} from "../lib/notifications/push";

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const pushSubscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(4096),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({
      p256dh: z.string().min(16).max(4096),
      auth: z.string().min(8).max(4096),
    }),
  }),
  userAgent: z.string().max(500).optional(),
});

const removePushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(4096),
});

const router: IRouter = Router();

router.get("/notifications/push/config", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "notifications",
      push: browserPushPublicConfig(),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/notifications", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const query = listSchema.parse(req.query);
    const notifications = await listUserNotifications(auth.user.id, query.limit ?? 50);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "notifications",
      notifications,
      unreadCount: notifications.filter((notification) => notification.readState === "unread").length,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.issues[0]?.message ?? "Invalid notifications query." });
      return;
    }

    next(err);
  }
});

router.post("/notifications/push-subscriptions", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const body = pushSubscriptionSchema.parse(req.body);
    const userAgentHeader = req.headers["user-agent"];
    const requestUserAgent = typeof userAgentHeader === "string" ? userAgentHeader : null;
    const result = await upsertUserPushSubscription(auth.user.id, {
      subscription: body.subscription,
      userAgent: body.userAgent ?? requestUserAgent,
      metadata: {
        source: "web",
      },
    });

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "notifications",
      push: {
        configured: browserPushPublicConfig().configured,
        ...result,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.issues[0]?.message ?? "Invalid push subscription payload." });
      return;
    }

    next(err);
  }
});

router.delete("/notifications/push-subscriptions", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const body = removePushSubscriptionSchema.parse(req.body);
    const removed = await removeUserPushSubscription(auth.user.id, body.endpoint);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "notifications",
      push: {
        removed,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.issues[0]?.message ?? "Invalid push subscription removal payload." });
      return;
    }

    next(err);
  }
});

router.post("/notifications/test", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const notification = await createUserNotification(auth.user.id, {
      kind: "system_test",
      title: "AnyAlpha alert test",
      body: "Push and in-app notifications are connected.",
      payload: {
        url: "/notifications",
      },
    });

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "notifications",
      notification,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/notifications/:id/read", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const id = req.params.id?.trim();
    if (!id) {
      res.status(400).json({ error: "Missing notification id." });
      return;
    }

    const updated = await markUserNotificationRead(auth.user.id, id);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "notifications",
      updated,
      id,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/notifications/read-all", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const updated = await markAllUserNotificationsRead(auth.user.id);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "notifications",
      updated,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
