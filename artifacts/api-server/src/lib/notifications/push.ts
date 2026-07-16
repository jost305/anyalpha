import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { and, eq, sql } from "drizzle-orm";
import type * as WebPush from "web-push";
import { logger } from "../logger";

type DbModule = typeof import("@workspace/db");
type WebPushSubscription = WebPush.PushSubscription;

const require = createRequire(import.meta.url);
const webPush = require("web-push") as typeof WebPush;

export interface BrowserPushPublicConfig {
  configured: boolean;
  publicKey: string | null;
}

export interface PushSubscriptionInput {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface UpsertPushSubscriptionInput {
  subscription: PushSubscriptionInput;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

export interface BrowserPushNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface BrowserPushDeliveryResult {
  configured: boolean;
  attempted: number;
  sent: number;
  failed: number;
  disabled: number;
}

let dbModulePromise: Promise<DbModule> | null = null;
let vapidConfigured = false;

async function getDbModule(): Promise<DbModule> {
  if (dbModulePromise) return dbModulePromise;

  dbModulePromise = (async () => {
    const databaseUrl = (process.env["DATABASE_URL"] ?? "").trim();

    if (!databaseUrl) {
      throw new Error("DATABASE_URL must be configured to use browser push subscriptions.");
    }

    return import("@workspace/db");
  })();

  return dbModulePromise;
}

function endpointHash(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

function vapidConfig() {
  const publicKey = process.env["VAPID_PUBLIC_KEY"]?.trim();
  const privateKey = process.env["VAPID_PRIVATE_KEY"]?.trim();
  const subject = process.env["VAPID_SUBJECT"]?.trim() || "mailto:alerts@anyalpha.fun";

  if (!publicKey || !privateKey) return null;

  return { publicKey, privateKey, subject };
}

function configureWebPush(): ReturnType<typeof vapidConfig> {
  const config = vapidConfig();

  if (!config) return null;

  if (!vapidConfigured) {
    webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    vapidConfigured = true;
  }

  return config;
}

function notificationUrl(notification: BrowserPushNotification): string {
  const explicitUrl =
    typeof notification.payload?.["url"] === "string"
      ? notification.payload["url"]
      : typeof notification.payload?.["href"] === "string"
        ? notification.payload["href"]
        : null;

  if (!explicitUrl) return "/notifications";

  if (explicitUrl.startsWith("/")) return explicitUrl;

  try {
    const parsed = new URL(explicitUrl);
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/notifications";
  } catch {
    return "/notifications";
  }
}

function topicForNotification(notification: BrowserPushNotification): string {
  return createHash("sha256").update(notification.id || notification.kind).digest("base64url").slice(0, 32);
}

function errorStatusCode(err: unknown): number | null {
  if (err && typeof err === "object" && "statusCode" in err) {
    const statusCode = (err as { statusCode?: unknown }).statusCode;
    return typeof statusCode === "number" ? statusCode : null;
  }

  return null;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 500);
  return "Browser push delivery failed.";
}

export function browserPushPublicConfig(): BrowserPushPublicConfig {
  const config = vapidConfig();

  return {
    configured: Boolean(config),
    publicKey: config?.publicKey ?? null,
  };
}

export async function upsertUserPushSubscription(userId: string, input: UpsertPushSubscriptionInput) {
  const { db, userPushSubscriptionsTable } = await getDbModule();
  const now = new Date();
  const hash = endpointHash(input.subscription.endpoint);
  const userAgent = input.userAgent?.trim().slice(0, 500) || null;

  const rows = await db
    .insert(userPushSubscriptionsTable)
    .values({
      userId,
      endpoint: input.subscription.endpoint,
      endpointHash: hash,
      p256dh: input.subscription.keys.p256dh,
      auth: input.subscription.keys.auth,
      userAgent,
      metadata: {
        ...(input.metadata ?? {}),
        expirationTime: input.subscription.expirationTime ?? null,
      },
      isEnabled: true,
      failureCount: 0,
      lastError: null,
      lastSeenAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userPushSubscriptionsTable.userId, userPushSubscriptionsTable.endpointHash],
      set: {
        endpoint: input.subscription.endpoint,
        p256dh: input.subscription.keys.p256dh,
        auth: input.subscription.keys.auth,
        userAgent,
        metadata: {
          ...(input.metadata ?? {}),
          expirationTime: input.subscription.expirationTime ?? null,
        },
        isEnabled: true,
        failureCount: 0,
        lastError: null,
        lastSeenAt: now,
        updatedAt: now,
      },
    })
    .returning({
      id: userPushSubscriptionsTable.id,
    });

  return {
    subscribed: rows.length > 0,
  };
}

export async function removeUserPushSubscription(userId: string, endpoint: string): Promise<boolean> {
  const { db, userPushSubscriptionsTable } = await getDbModule();
  const now = new Date();
  const rows = await db
    .update(userPushSubscriptionsTable)
    .set({
      isEnabled: false,
      updatedAt: now,
    })
    .where(and(eq(userPushSubscriptionsTable.userId, userId), eq(userPushSubscriptionsTable.endpointHash, endpointHash(endpoint))))
    .returning({
      id: userPushSubscriptionsTable.id,
    });

  return rows.length > 0;
}

export async function sendBrowserPushToUser(
  userId: string,
  notification: BrowserPushNotification,
): Promise<BrowserPushDeliveryResult> {
  const config = configureWebPush();

  if (!config) {
    return {
      configured: false,
      attempted: 0,
      sent: 0,
      failed: 0,
      disabled: 0,
    };
  }

  const { db, userPushSubscriptionsTable } = await getDbModule();
  const subscriptions = await db
    .select()
    .from(userPushSubscriptionsTable)
    .where(and(eq(userPushSubscriptionsTable.userId, userId), eq(userPushSubscriptionsTable.isEnabled, true)));

  const payload = JSON.stringify({
    ...notification,
    url: notificationUrl(notification),
  });
  const result: BrowserPushDeliveryResult = {
    configured: true,
    attempted: subscriptions.length,
    sent: 0,
    failed: 0,
    disabled: 0,
  };

  await Promise.all(
    subscriptions.map(async (row) => {
      const subscription: WebPushSubscription = {
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth,
        },
      };

      try {
        await webPush.sendNotification(subscription, payload, {
          TTL: 120,
          urgency: "high",
          topic: topicForNotification(notification),
          contentEncoding: "aes128gcm",
        });

        result.sent += 1;
        await db
          .update(userPushSubscriptionsTable)
          .set({
            failureCount: 0,
            lastError: null,
            lastSentAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(userPushSubscriptionsTable.id, row.id));
      } catch (err) {
        const statusCode = errorStatusCode(err);
        const shouldDisable = statusCode === 404 || statusCode === 410;

        if (shouldDisable) {
          result.disabled += 1;
        } else {
          result.failed += 1;
        }

        await db
          .update(userPushSubscriptionsTable)
          .set({
            isEnabled: shouldDisable ? false : row.isEnabled,
            failureCount: sql`${userPushSubscriptionsTable.failureCount} + 1`,
            lastError: errorMessage(err),
            updatedAt: new Date(),
          })
          .where(eq(userPushSubscriptionsTable.id, row.id));

        logger.warn(
          {
            err,
            statusCode,
            userId,
            subscriptionId: row.id,
            disabled: shouldDisable,
          },
          "browser push delivery failed",
        );
      }
    }),
  );

  return result;
}
