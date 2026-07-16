import { createHash } from "node:crypto";
import Pusher from "pusher";

export interface RealtimePublishResult {
  published: boolean;
  reason?: string;
}

let pusherClient: Pusher | null | undefined;

function pusherConfig() {
  const appId = process.env["PUSHER_APP_ID"]?.trim();
  const key = process.env["PUSHER_KEY"]?.trim();
  const secret = process.env["PUSHER_SECRET"]?.trim();
  const cluster = process.env["PUSHER_CLUSTER"]?.trim();

  if (!appId || !key || !secret || !cluster) return null;

  return { appId, key, secret, cluster };
}

function getPusherClient(): Pusher | null {
  if (pusherClient !== undefined) return pusherClient;

  const config = pusherConfig();
  if (!config) {
    pusherClient = null;
    return pusherClient;
  }

  pusherClient = new Pusher({
    appId: config.appId,
    key: config.key,
    secret: config.secret,
    cluster: config.cluster,
    useTLS: true,
  });

  return pusherClient;
}

export function realtimePublicConfig() {
  const config = pusherConfig();

  if (!config) {
    return {
      configured: false as const,
      key: null,
      cluster: null,
    };
  }

  return {
    configured: true as const,
    key: config.key,
    cluster: config.cluster,
  };
}

export function userRealtimeChannel(userId: string): string {
  const digest = createHash("sha256").update(userId).digest("hex").slice(0, 32);
  return `private-user-${digest}`;
}

export function authenticateRealtimeUser(userId: string, socketId: string, channelName: string) {
  const client = getPusherClient();
  const expectedChannel = userRealtimeChannel(userId);

  if (!client) {
    throw new Error("Pusher is not configured.");
  }

  if (channelName !== expectedChannel) {
    throw new Error("Realtime channel is not allowed for this user.");
  }

  return client.authorizeChannel(socketId, channelName);
}

export async function publishRealtimeEvent(
  channel: string,
  eventName: string,
  payload: Record<string, unknown>,
): Promise<RealtimePublishResult> {
  const client = getPusherClient();

  if (!client) {
    return {
      published: false,
      reason: "Pusher is not configured.",
    };
  }

  await client.trigger(channel, eventName, payload);

  return {
    published: true,
  };
}
