import { and, desc, eq } from "drizzle-orm";
import { publishRealtimeEvent, userRealtimeChannel } from "../realtime/pusher";
import { logger } from "../logger";
import { sendBrowserPushToUser } from "./push";

export interface CreateNotificationInput {
  kind: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
}

type DbModule = typeof import("@workspace/db");

let dbModulePromise: Promise<DbModule> | null = null;

async function getDbModule(): Promise<DbModule> {
  if (dbModulePromise) return dbModulePromise;

  dbModulePromise = (async () => {
    const databaseUrl = (process.env["DATABASE_URL"] ?? "").trim();

    if (!databaseUrl) {
      throw new Error("DATABASE_URL must be configured to use notification storage.");
    }

    return import("@workspace/db");
  })();

  return dbModulePromise;
}

function toIsoString(value: string | Date | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

export async function createUserNotification(userId: string, input: CreateNotificationInput) {
  const { db, userNotificationsTable } = await getDbModule();
  const rows = await db
    .insert(userNotificationsTable)
    .values({
      userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      payload: input.payload ?? {},
    })
    .returning();
  const notification = rows[0];

  if (!notification) {
    throw new Error("Notification could not be created.");
  }

  const payload = {
    id: notification.id,
    kind: notification.kind,
    title: notification.title,
    body: notification.body,
    readState: notification.readState,
    payload: notification.payload,
    createdAt: toIsoString(notification.createdAt),
  };

  const deliveries = await Promise.allSettled([
    publishRealtimeEvent(userRealtimeChannel(userId), "notification.created", payload),
    sendBrowserPushToUser(userId, payload),
  ]);

  deliveries.forEach((delivery, index) => {
    if (delivery.status === "fulfilled") return;

    logger.warn(
      {
        err: delivery.reason,
        userId,
        notificationId: payload.id,
        channel: index === 0 ? "realtime" : "browser_push",
      },
      "notification delivery failed",
    );
  });

  return payload;
}

export async function listUserNotifications(userId: string, limit = 50) {
  const { db, userNotificationsTable } = await getDbModule();
  const rows = await db
    .select()
    .from(userNotificationsTable)
    .where(eq(userNotificationsTable.userId, userId))
    .orderBy(desc(userNotificationsTable.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    readState: row.readState,
    payload: row.payload,
    createdAt: toIsoString(row.createdAt),
    readAt: row.readAt ? toIsoString(row.readAt) : null,
  }));
}

export async function markUserNotificationRead(userId: string, id: string): Promise<boolean> {
  const { db, userNotificationsTable } = await getDbModule();
  const now = new Date();
  const rows = await db
    .update(userNotificationsTable)
    .set({
      readState: "read",
      readAt: now,
    })
    .where(and(eq(userNotificationsTable.userId, userId), eq(userNotificationsTable.id, id)))
    .returning();

  return rows.length > 0;
}

export async function markAllUserNotificationsRead(userId: string): Promise<number> {
  const { db, userNotificationsTable } = await getDbModule();
  const now = new Date();
  const rows = await db
    .update(userNotificationsTable)
    .set({
      readState: "read",
      readAt: now,
    })
    .where(and(eq(userNotificationsTable.userId, userId), eq(userNotificationsTable.readState, "unread")))
    .returning({ id: userNotificationsTable.id });

  if (rows.length === 0) return 0;

  await publishRealtimeEvent(userRealtimeChannel(userId), "notifications.read", {
    count: rows.length,
    readAt: now.toISOString(),
  });

  return rows.length;
}
