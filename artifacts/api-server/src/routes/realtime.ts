import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAuthenticatedUser } from "../lib/auth/require-authenticated-user";
import { authenticateRealtimeUser, realtimePublicConfig, userRealtimeChannel } from "../lib/realtime/pusher";

const authSchema = z.object({
  socket_id: z.string().min(1),
  channel_name: z.string().min(1),
});

const router: IRouter = Router();

router.get("/realtime/config", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const config = realtimePublicConfig();

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "realtime",
      ...config,
      channel: userRealtimeChannel(auth.user.id),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/realtime/public-config", async (req, res, next) => {
  try {
    const config = realtimePublicConfig();
    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "realtime-public",
      ...config,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/realtime/pusher/auth", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const body = authSchema.parse(req.body);
    const response = authenticateRealtimeUser(auth.user.id, body.socket_id, body.channel_name);

    res.setHeader("Cache-Control", "no-store");
    res.json(response);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.issues[0]?.message ?? "Invalid realtime auth payload." });
      return;
    }

    if (err instanceof Error && err.message.includes("not configured")) {
      res.status(503).json({ error: err.message });
      return;
    }

    if (err instanceof Error && err.message.includes("not allowed")) {
      res.status(403).json({ error: err.message });
      return;
    }

    next(err);
  }
});

export default router;
