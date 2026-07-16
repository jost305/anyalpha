import { createHash } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { publishTelegramMessage } from "../alerts/telegram";
import { createUserNotification } from "../notifications/store";

export type XAlertMode = "all_posts" | "token_mentions" | "muted";

export interface TrackXAccountInput {
  handle: string;
  alertMode?: XAlertMode;
  telegramEnabled?: boolean;
  browserEnabled?: boolean;
}

export interface XTrackedAccountItem {
  id: string;
  accountId: string;
  handle: string;
  xUserId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  alertMode: XAlertMode;
  telegramEnabled: boolean;
  browserEnabled: boolean;
  lastPostAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface XPostItem {
  id: string;
  authorHandle: string | null;
  text: string;
  url: string | null;
  lang: string | null;
  postedAt: string;
  mentions: Array<{
    tokenSymbol: string | null;
    contractAddress: string | null;
    chain: string | null;
    confidence: number;
  }>;
}

export interface TwitterTrackSnapshot {
  accounts: XTrackedAccountItem[];
  posts: XPostItem[];
  mentions: XPostItem["mentions"];
  monitoring: {
    bearerConfigured: boolean;
    webhookSecretConfigured: boolean;
    publicWebhookBaseConfigured: boolean;
    cryptoFeedQuery: string | null;
    cryptoFeedUpdatedAt: string | null;
    cryptoFeedError: string | null;
  };
  updatedAt: string;
}

export interface XWebhookIngestResult {
  received: number;
  duplicates: number;
  insertedPosts: number;
  insertedMentions: number;
  notificationsCreated: number;
  telegramMessagesSent: number;
  eventIds: string[];
  updatedAt: string;
}

export interface XProviderSyncResult {
  provider: "x";
  endpoint: string;
  activeHandles: number;
  deletedRules: number;
  createdRules: number;
  ruleTags: string[];
  updatedAt: string;
}

type DbModule = typeof import("@workspace/db");

let dbModulePromise: Promise<DbModule> | null = null;
let cryptoTimelineCache:
  | {
      cacheKey: string;
      expiresAt: number;
      result: XCryptoTimelineFetchResult;
    }
  | null = null;

const DEFAULT_X_CRYPTO_TIMELINE_QUERY =
  "(#crypto OR crypto OR web3 OR defi OR memecoin OR solana OR ethereum OR base OR $BTC OR $ETH OR $SOL) -is:retweet lang:en";
const X_CRYPTO_TIMELINE_CACHE_MS = 60_000;

interface XCryptoTimelineFetchResult {
  posts: XPostItem[];
  mentions: XPostItem["mentions"];
  updatedAt: string;
}

interface XCryptoTimelineSnapshot {
  posts: XPostItem[];
  mentions: XPostItem["mentions"];
  updatedAt: string | null;
  error: string | null;
}

async function getDbModule(): Promise<DbModule> {
  if (dbModulePromise) return dbModulePromise;

  dbModulePromise = (async () => {
    const databaseUrl = (process.env["DATABASE_URL"] ?? "").trim();

    if (!databaseUrl) {
      throw new Error("DATABASE_URL must be configured to use Twitter Track storage.");
    }

    return import("@workspace/db");
  })();

  return dbModulePromise;
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeHandle(value: string): string {
  const normalized = value.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(normalized)) {
    throw new Error("Enter a valid X handle.");
  }

  return normalized;
}

function publicApiBaseUrl(): string | null {
  const explicit = process.env["PUBLIC_API_BASE_URL"]?.trim() || process.env["VITE_API_BASE_URL"]?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const railwayDomain = process.env["RAILWAY_PUBLIC_DOMAIN"]?.trim();
  if (railwayDomain) return `https://${railwayDomain.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}`;

  return null;
}

function xCryptoTimelineQuery(): string {
  return process.env["X_CRYPTO_TIMELINE_QUERY"]?.trim() || DEFAULT_X_CRYPTO_TIMELINE_QUERY;
}

function xCryptoTimelineLimit(): number {
  const raw = Number.parseInt(process.env["X_CRYPTO_TIMELINE_LIMIT"] ?? "50", 10);
  if (!Number.isFinite(raw)) return 50;
  return Math.min(100, Math.max(10, raw));
}

function monitoringStatus(options: { cryptoFeedUpdatedAt?: string | null; cryptoFeedError?: string | null } = {}) {
  const bearerConfigured = Boolean(process.env["X_BEARER_TOKEN"]?.trim());

  return {
    bearerConfigured,
    webhookSecretConfigured: Boolean(process.env["X_CONSUMER_SECRET"]?.trim() || process.env["X_API_SECRET"]?.trim()),
    publicWebhookBaseConfigured: Boolean(publicApiBaseUrl()),
    cryptoFeedQuery: bearerConfigured ? xCryptoTimelineQuery() : null,
    cryptoFeedUpdatedAt: options.cryptoFeedUpdatedAt ?? null,
    cryptoFeedError: options.cryptoFeedError ?? null,
  };
}

function attachStreamEnvelope(item: unknown, payload: Record<string, unknown>): unknown {
  if (!isRecord(item)) return item;
  return {
    ...item,
    includes: payload["includes"],
    matching_rules: payload["matching_rules"],
  };
}

function postItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [payload];

  if (Array.isArray(payload["data"])) return payload["data"].map((item) => attachStreamEnvelope(item, payload));
  if (isRecord(payload["data"])) return [attachStreamEnvelope(payload["data"], payload)];
  if (Array.isArray(payload["tweets"])) return payload["tweets"];
  if (Array.isArray(payload["tweet_create_events"])) return payload["tweet_create_events"];

  return [payload];
}

function findString(value: unknown, keys: string[], depth = 0): string | null {
  if (depth > 5 || value == null) return null;

  if (isRecord(value)) {
    for (const key of keys) {
      const candidate = value[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
      if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
    }

    for (const item of Object.values(value)) {
      const candidate = findString(item, keys, depth + 1);
      if (candidate) return candidate;
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = findString(item, keys, depth + 1);
      if (candidate) return candidate;
    }
  }

  return null;
}

function postIdForItem(item: unknown): string {
  return findString(item, ["id", "tweet_id", "postId"]) ?? createHash("sha256").update(JSON.stringify(item)).digest("hex").slice(0, 32);
}

function dateFromPost(item: unknown): Date {
  const raw = findString(item, ["created_at", "createdAt", "postedAt", "time"]);
  if (!raw) return new Date();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

function extractMentions(text: string) {
  const mentions: TwitterTrackSnapshot["mentions"] = [];
  const seen = new Set<string>();
  const cashtags = text.match(/\$[A-Za-z][A-Za-z0-9_]{1,15}/g) ?? [];
  const evmContracts = text.match(/0x[a-fA-F0-9]{40}/g) ?? [];
  const solanaContracts = text.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g) ?? [];

  for (const tag of cashtags) {
    const symbol = tag.slice(1).toUpperCase();
    const key = `symbol:${symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mentions.push({ tokenSymbol: symbol, contractAddress: null, chain: null, confidence: 55 });
  }

  for (const address of evmContracts) {
    const key = `contract:${address.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mentions.push({ tokenSymbol: null, contractAddress: address.toLowerCase(), chain: "evm", confidence: 90 });
  }

  for (const address of solanaContracts) {
    if (/^0x/i.test(address)) continue;
    const key = `contract:${address}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mentions.push({ tokenSymbol: null, contractAddress: address, chain: "solana", confidence: 85 });
  }

  return mentions;
}

function xBearerToken(): string | null {
  return process.env["X_BEARER_TOKEN"]?.trim() || null;
}

async function callXApi(path: string, init: RequestInit = {}): Promise<unknown> {
  const bearer = xBearerToken();
  if (!bearer) throw new Error("X_BEARER_TOKEN is required for X API sync.");

  const response = await fetch(`https://api.x.com${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${bearer}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      isRecord(payload) && Array.isArray(payload["errors"]) && isRecord(payload["errors"][0]) && typeof payload["errors"][0]["message"] === "string"
        ? payload["errors"][0]["message"]
        : isRecord(payload) && typeof payload["detail"] === "string"
          ? payload["detail"]
          : response.statusText;
    throw new Error(`X API request failed (${response.status}): ${message}`);
  }

  return payload;
}

interface XUserProfile {
  id: string;
  username: string;
  name: string | null;
  profileImageUrl: string | null;
  metadata: Record<string, unknown>;
}

async function fetchXUserByHandle(handleNormalized: string): Promise<XUserProfile | null> {
  if (!xBearerToken()) return null;

  const payload = await callXApi(
    `/2/users/by/username/${encodeURIComponent(handleNormalized)}?user.fields=profile_image_url,public_metrics,verified,verified_type,description,created_at`,
  );
  const data = isRecord(payload) && isRecord(payload["data"]) ? payload["data"] : null;
  if (!data || typeof data["id"] !== "string" || typeof data["username"] !== "string") return null;

  return {
    id: data["id"],
    username: data["username"],
    name: typeof data["name"] === "string" ? data["name"] : null,
    profileImageUrl: typeof data["profile_image_url"] === "string" ? data["profile_image_url"] : null,
    metadata: data,
  };
}

function xUsersById(payload: unknown): Map<string, Record<string, unknown>> {
  const users = new Map<string, Record<string, unknown>>();
  const includes = isRecord(payload) && isRecord(payload["includes"]) ? payload["includes"] : null;
  const rawUsers = includes && Array.isArray(includes["users"]) ? includes["users"] : [];

  for (const user of rawUsers) {
    if (!isRecord(user) || typeof user["id"] !== "string") continue;
    users.set(user["id"], user);
  }

  return users;
}

function authorHandleForTweet(tweet: Record<string, unknown>, usersById: Map<string, Record<string, unknown>>): string | null {
  const authorId = typeof tweet["author_id"] === "string" ? tweet["author_id"] : null;
  const user = authorId ? usersById.get(authorId) : null;
  const username = typeof user?.["username"] === "string" ? user["username"] : null;

  if (!username) return null;

  try {
    return `@${normalizeHandle(username)}`;
  } catch {
    return `@${username.replace(/^@/, "")}`;
  }
}

function postFromRecentSearchTweet(tweet: Record<string, unknown>, usersById: Map<string, Record<string, unknown>>): XPostItem | null {
  const id = typeof tweet["id"] === "string" ? tweet["id"] : null;
  const text = typeof tweet["text"] === "string" ? tweet["text"].trim() : "";
  if (!id || !text) return null;

  const authorHandle = authorHandleForTweet(tweet, usersById);
  const authorPath = authorHandle ? authorHandle.replace(/^@/, "") : "i/web";
  const postedAtRaw = typeof tweet["created_at"] === "string" ? tweet["created_at"] : null;
  const postedAt = postedAtRaw && !Number.isNaN(new Date(postedAtRaw).getTime()) ? new Date(postedAtRaw).toISOString() : new Date().toISOString();

  return {
    id,
    authorHandle,
    text,
    url: authorHandle ? `https://x.com/${authorPath}/status/${id}` : `https://x.com/i/web/status/${id}`,
    lang: typeof tweet["lang"] === "string" ? tweet["lang"] : null,
    postedAt,
    mentions: extractMentions(text),
  };
}

async function fetchXCryptoTimeline(): Promise<XCryptoTimelineFetchResult> {
  if (!xBearerToken()) {
    return {
      posts: [],
      mentions: [],
      updatedAt: new Date().toISOString(),
    };
  }

  const query = xCryptoTimelineQuery();
  const limit = xCryptoTimelineLimit();
  const cacheKey = `${query}:${limit}`;
  const now = Date.now();

  if (cryptoTimelineCache && cryptoTimelineCache.cacheKey === cacheKey && cryptoTimelineCache.expiresAt > now) {
    return cryptoTimelineCache.result;
  }

  const params = new URLSearchParams({
    query,
    max_results: String(limit),
    expansions: "author_id",
    "tweet.fields": "author_id,created_at,entities,lang,public_metrics",
    "user.fields": "name,profile_image_url,public_metrics,username,verified,verified_type",
  });
  const payload = await callXApi(`/2/tweets/search/recent?${params.toString()}`);
  const usersById = xUsersById(payload);
  const tweets = isRecord(payload) && Array.isArray(payload["data"]) ? payload["data"].filter(isRecord) : [];
  const posts = tweets
    .map((tweet) => postFromRecentSearchTweet(tweet, usersById))
    .filter((post): post is XPostItem => Boolean(post))
    .sort((left, right) => new Date(right.postedAt).getTime() - new Date(left.postedAt).getTime());
  const result = {
    posts,
    mentions: posts.flatMap((post) => post.mentions),
    updatedAt: new Date().toISOString(),
  };

  cryptoTimelineCache = {
    cacheKey,
    expiresAt: now + X_CRYPTO_TIMELINE_CACHE_MS,
    result,
  };

  return result;
}

async function safeFetchXCryptoTimeline(): Promise<XCryptoTimelineSnapshot | null> {
  if (!xBearerToken()) return null;

  try {
    return {
      ...(await fetchXCryptoTimeline()),
      error: null,
    };
  } catch (err) {
    return {
      posts: cryptoTimelineCache?.result.posts ?? [],
      mentions: cryptoTimelineCache?.result.mentions ?? [],
      updatedAt: cryptoTimelineCache?.result.updatedAt ?? null,
      error: err instanceof Error ? err.message : "X crypto timeline fetch failed.",
    };
  }
}

function mergeXPostItems(primary: XPostItem[], secondary: XPostItem[], limit = 100): XPostItem[] {
  const postsById = new Map<string, XPostItem>();

  for (const post of [...primary, ...secondary]) {
    if (!postsById.has(post.id)) postsById.set(post.id, post);
  }

  return Array.from(postsById.values())
    .sort((left, right) => new Date(right.postedAt).getTime() - new Date(left.postedAt).getTime())
    .slice(0, limit);
}

async function telegramChatsForUser(userId: string): Promise<string[]> {
  const { db, telegramAccountsTable } = await getDbModule();
  const byPointsRows = await db
    .select()
    .from(telegramAccountsTable)
    .where(eq(telegramAccountsTable.pointsUserId, userId))
    .limit(5);
  const byLinkedRows = await db
    .select()
    .from(telegramAccountsTable)
    .where(eq(telegramAccountsTable.linkedUserId, userId))
    .limit(5);
  const chats = new Set<string>();

  for (const row of [...byPointsRows, ...byLinkedRows]) {
    chats.add(row.chatId);
  }

  return Array.from(chats);
}

export async function listTwitterTrack(userId: string): Promise<TwitterTrackSnapshot> {
  const { db, userXAccountSubscriptionsTable, xPostsTable, xTokenMentionsTable, xTrackedAccountsTable } = await getDbModule();
  const rows = await db
    .select({
      subscription: userXAccountSubscriptionsTable,
      account: xTrackedAccountsTable,
    })
    .from(userXAccountSubscriptionsTable)
    .innerJoin(xTrackedAccountsTable, eq(userXAccountSubscriptionsTable.xAccountId, xTrackedAccountsTable.id))
    .where(and(eq(userXAccountSubscriptionsTable.userId, userId), eq(userXAccountSubscriptionsTable.isActive, true)))
    .orderBy(desc(userXAccountSubscriptionsTable.updatedAt));
  const postRows = await db.select().from(xPostsTable).orderBy(desc(xPostsTable.postedAt)).limit(80);
  const mentionRows =
    postRows.length > 0
      ? await db.select().from(xTokenMentionsTable).where(inArray(xTokenMentionsTable.postId, postRows.map((post) => post.id)))
      : [];
  const mentionsByPost = new Map<string, typeof mentionRows>();

  for (const mention of mentionRows) {
    const current = mentionsByPost.get(mention.postId) ?? [];
    current.push(mention);
    mentionsByPost.set(mention.postId, current);
  }
  const storedPosts = postRows.map((post) => ({
    id: post.id,
    authorHandle: post.authorHandle,
    text: post.text,
    url: post.url,
    lang: post.lang,
    postedAt: toIsoString(post.postedAt) ?? new Date().toISOString(),
    mentions: (mentionsByPost.get(post.id) ?? []).map((mention) => ({
      tokenSymbol: mention.tokenSymbol,
      contractAddress: mention.contractAddress,
      chain: mention.chain,
      confidence: mention.confidence,
    })),
  }));
  const cryptoTimeline = await safeFetchXCryptoTimeline();
  const posts = mergeXPostItems(cryptoTimeline?.posts ?? [], storedPosts);

  return {
    accounts: rows.map((row) => ({
      id: row.subscription.id,
      accountId: row.account.id,
      handle: row.account.handle,
      xUserId: row.account.xUserId,
      displayName: row.account.displayName,
      avatarUrl: row.account.avatarUrl,
      profileUrl: row.account.profileUrl,
      alertMode: row.subscription.alertMode,
      telegramEnabled: row.subscription.telegramEnabled,
      browserEnabled: row.subscription.browserEnabled,
      lastPostAt: toIsoString(row.account.lastPostAt),
      createdAt: toIsoString(row.subscription.createdAt) ?? new Date().toISOString(),
      updatedAt: toIsoString(row.subscription.updatedAt) ?? new Date().toISOString(),
    })),
    posts,
    mentions: posts.flatMap((post) => post.mentions),
    monitoring: monitoringStatus({
      cryptoFeedUpdatedAt: cryptoTimeline?.updatedAt ?? null,
      cryptoFeedError: cryptoTimeline?.error ?? null,
    }),
    updatedAt: new Date().toISOString(),
  };
}

export async function listPublicTwitterTrack(): Promise<TwitterTrackSnapshot> {
  const { db, xPostsTable, xTokenMentionsTable, xTrackedAccountsTable } = await getDbModule();
  const postRows = await db.select().from(xPostsTable).orderBy(desc(xPostsTable.postedAt)).limit(80);
  const accountIds = Array.from(new Set(postRows.map((post) => post.xAccountId).filter((id): id is string => Boolean(id))));
  const accountRows =
    accountIds.length > 0
      ? await db.select().from(xTrackedAccountsTable).where(inArray(xTrackedAccountsTable.id, accountIds))
      : await db.select().from(xTrackedAccountsTable).orderBy(desc(xTrackedAccountsTable.lastPostAt)).limit(20);
  const mentionRows =
    postRows.length > 0
      ? await db.select().from(xTokenMentionsTable).where(inArray(xTokenMentionsTable.postId, postRows.map((post) => post.id)))
      : [];
  const mentionsByPost = new Map<string, typeof mentionRows>();

  for (const mention of mentionRows) {
    const current = mentionsByPost.get(mention.postId) ?? [];
    current.push(mention);
    mentionsByPost.set(mention.postId, current);
  }
  const storedPosts = postRows.map((post) => ({
    id: post.id,
    authorHandle: post.authorHandle,
    text: post.text,
    url: post.url,
    lang: post.lang,
    postedAt: toIsoString(post.postedAt) ?? new Date().toISOString(),
    mentions: (mentionsByPost.get(post.id) ?? []).map((mention) => ({
      tokenSymbol: mention.tokenSymbol,
      contractAddress: mention.contractAddress,
      chain: mention.chain,
      confidence: mention.confidence,
    })),
  }));
  const cryptoTimeline = await safeFetchXCryptoTimeline();
  const posts = mergeXPostItems(cryptoTimeline?.posts ?? [], storedPosts);

  return {
    accounts: accountRows.map((account) => ({
      id: account.id,
      accountId: account.id,
      handle: account.handle,
      xUserId: account.xUserId,
      displayName: account.displayName,
      avatarUrl: account.avatarUrl,
      profileUrl: account.profileUrl,
      alertMode: "token_mentions",
      telegramEnabled: false,
      browserEnabled: false,
      lastPostAt: toIsoString(account.lastPostAt),
      createdAt: toIsoString(account.firstSeenAt) ?? new Date().toISOString(),
      updatedAt: toIsoString(account.updatedAt) ?? new Date().toISOString(),
    })),
    posts,
    mentions: posts.flatMap((post) => post.mentions),
    monitoring: monitoringStatus({
      cryptoFeedUpdatedAt: cryptoTimeline?.updatedAt ?? null,
      cryptoFeedError: cryptoTimeline?.error ?? null,
    }),
    updatedAt: new Date().toISOString(),
  };
}

export async function trackXAccount(userId: string, input: TrackXAccountInput): Promise<XTrackedAccountItem> {
  const { db, userXAccountSubscriptionsTable, xTrackedAccountsTable } = await getDbModule();
  const handleNormalized = normalizeHandle(input.handle);
  const profile = await fetchXUserByHandle(handleNormalized);
  const canonicalHandle = profile?.username ? normalizeHandle(profile.username) : handleNormalized;
  const handle = `@${canonicalHandle}`;
  const now = new Date();
  const accountRows = await db
    .insert(xTrackedAccountsTable)
    .values({
      handle,
      handleNormalized: canonicalHandle,
      xUserId: profile?.id ?? null,
      displayName: profile?.name ?? null,
      avatarUrl: profile?.profileImageUrl ?? null,
      profileUrl: `https://x.com/${canonicalHandle}`,
      metadata: profile?.metadata ?? {},
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: xTrackedAccountsTable.handleNormalized,
      set: {
        handle,
        xUserId: profile?.id ?? undefined,
        displayName: profile?.name ?? undefined,
        avatarUrl: profile?.profileImageUrl ?? undefined,
        profileUrl: `https://x.com/${canonicalHandle}`,
        metadata: profile?.metadata ?? undefined,
        updatedAt: now,
      },
    })
    .returning();
  const account = accountRows[0];
  if (!account) throw new Error("X account could not be saved.");

  const subscriptionRows = await db
    .insert(userXAccountSubscriptionsTable)
    .values({
      userId,
      xAccountId: account.id,
      alertMode: input.alertMode ?? "token_mentions",
      telegramEnabled: input.telegramEnabled ?? true,
      browserEnabled: input.browserEnabled ?? true,
      isActive: true,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userXAccountSubscriptionsTable.userId, userXAccountSubscriptionsTable.xAccountId],
      set: {
        alertMode: input.alertMode ?? "token_mentions",
        telegramEnabled: input.telegramEnabled ?? true,
        browserEnabled: input.browserEnabled ?? true,
        isActive: true,
        updatedAt: now,
      },
    })
    .returning();
  const subscription = subscriptionRows[0];
  if (!subscription) throw new Error("X account subscription could not be saved.");

  return {
    id: subscription.id,
    accountId: account.id,
    handle: account.handle,
    xUserId: account.xUserId,
    displayName: account.displayName,
    avatarUrl: account.avatarUrl,
    profileUrl: account.profileUrl,
    alertMode: subscription.alertMode,
    telegramEnabled: subscription.telegramEnabled,
    browserEnabled: subscription.browserEnabled,
    lastPostAt: toIsoString(account.lastPostAt),
    createdAt: toIsoString(subscription.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(subscription.updatedAt) ?? new Date().toISOString(),
  };
}

export async function removeXAccountSubscription(userId: string, subscriptionId: string): Promise<boolean> {
  const { db, userXAccountSubscriptionsTable } = await getDbModule();
  const rows = await db
    .update(userXAccountSubscriptionsTable)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(and(eq(userXAccountSubscriptionsTable.userId, userId), eq(userXAccountSubscriptionsTable.id, subscriptionId)))
    .returning();

  return rows.length > 0;
}

async function activeTrackedHandles(): Promise<string[]> {
  const { db, userXAccountSubscriptionsTable, xTrackedAccountsTable } = await getDbModule();
  const rows = await db
    .select({ handle: xTrackedAccountsTable.handleNormalized })
    .from(xTrackedAccountsTable)
    .innerJoin(userXAccountSubscriptionsTable, eq(xTrackedAccountsTable.id, userXAccountSubscriptionsTable.xAccountId))
    .where(eq(userXAccountSubscriptionsTable.isActive, true));

  return Array.from(new Set(rows.map((row) => row.handle).filter(Boolean))).sort();
}

function buildXTrackRules(handles: string[]): Array<{ value: string; tag: string }> {
  const rules: Array<{ value: string; tag: string }> = [];
  let chunk: string[] = [];

  for (const handle of handles) {
    const clause = `from:${handle}`;
    const candidate = [...chunk, clause].join(" OR ");

    if (candidate.length > 430 && chunk.length > 0) {
      rules.push({
        value: `(${chunk.join(" OR ")}) -is:retweet`,
        tag: `anyalpha:x-track:${rules.length + 1}`,
      });
      chunk = [clause];
      continue;
    }

    chunk.push(clause);
  }

  if (chunk.length > 0) {
    rules.push({
      value: `(${chunk.join(" OR ")}) -is:retweet`,
      tag: `anyalpha:x-track:${rules.length + 1}`,
    });
  }

  return rules;
}

export async function syncXFilteredStreamRules(): Promise<XProviderSyncResult> {
  const handles = await activeTrackedHandles();
  const rules = buildXTrackRules(handles);
  const existingPayload = await callXApi("/2/tweets/search/stream/rules");
  const existingRules =
    isRecord(existingPayload) && Array.isArray(existingPayload["data"])
      ? existingPayload["data"].filter((rule): rule is Record<string, unknown> => isRecord(rule))
      : [];
  const anyAlphaRuleIds = existingRules
    .filter((rule) => typeof rule["id"] === "string" && typeof rule["tag"] === "string" && rule["tag"].startsWith("anyalpha:x-track:"))
    .map((rule) => String(rule["id"]));

  if (anyAlphaRuleIds.length > 0) {
    await callXApi("/2/tweets/search/stream/rules", {
      method: "POST",
      body: JSON.stringify({
        delete: {
          ids: anyAlphaRuleIds,
        },
      }),
    });
  }

  if (rules.length > 0) {
    await callXApi("/2/tweets/search/stream/rules", {
      method: "POST",
      body: JSON.stringify({
        add: rules,
      }),
    });
  }

  return {
    provider: "x",
    endpoint: "https://api.x.com/2/tweets/search/stream",
    activeHandles: handles.length,
    deletedRules: anyAlphaRuleIds.length,
    createdRules: rules.length,
    ruleTags: rules.map((rule) => rule.tag),
    updatedAt: new Date().toISOString(),
  };
}

export async function ingestXWebhook(payload: unknown, options: { signatureVerified: boolean }): Promise<XWebhookIngestResult> {
  const {
    db,
    userXAccountSubscriptionsTable,
    xPostsTable,
    xSocialAlertsTable,
    xTokenMentionsTable,
    xTrackedAccountsTable,
    xWebhookEventsTable,
  } = await getDbModule();
  const items = postItems(payload);
  const result: XWebhookIngestResult = {
    received: items.length,
    duplicates: 0,
    insertedPosts: 0,
    insertedMentions: 0,
    notificationsCreated: 0,
    telegramMessagesSent: 0,
    eventIds: [],
    updatedAt: new Date().toISOString(),
  };

  for (const item of items) {
    const postId = postIdForItem(item);
    const eventId = `x:${postId}`;
    result.eventIds.push(eventId);

    const eventRows = await db
      .insert(xWebhookEventsTable)
      .values({
        eventId,
        signatureVerified: options.signatureVerified,
        payload: isRecord(item) ? item : { value: item },
      })
      .onConflictDoNothing()
      .returning();

    if (!eventRows[0]) {
      result.duplicates += 1;
      continue;
    }

    const text = findString(item, ["text", "full_text", "body"]) ?? "";
    if (!text.trim()) continue;

    const authorId = findString(item, ["author_id", "user_id", "id_str"]);
    const authorHandleRaw = findString(item, ["username", "screen_name", "authorHandle", "handle"]);
    const authorHandle = authorHandleRaw ? `@${normalizeHandle(authorHandleRaw)}` : null;
    const accountRows =
      authorHandle || authorId
        ? await db
            .select()
            .from(xTrackedAccountsTable)
            .where(
              authorHandle
                ? eq(xTrackedAccountsTable.handleNormalized, normalizeHandle(authorHandle))
                : eq(xTrackedAccountsTable.xUserId, authorId ?? ""),
            )
            .limit(1)
        : [];
    const account = accountRows[0];
    const postedAt = dateFromPost(item);
    const url = authorHandle ? `https://x.com/${authorHandle.replace(/^@/, "")}/status/${postId}` : null;

    const postRows = await db
      .insert(xPostsTable)
      .values({
        id: postId,
        xAccountId: account?.id ?? null,
        authorId,
        authorHandle,
        text,
        url,
        lang: findString(item, ["lang"]),
        publicMetrics: isRecord(item) && isRecord(item["public_metrics"]) ? item["public_metrics"] : {},
        metadata: isRecord(item) ? item : { value: item },
        postedAt,
      })
      .onConflictDoNothing()
      .returning();

    if (!postRows[0]) continue;
    result.insertedPosts += 1;

    if (account) {
      await db
        .update(xTrackedAccountsTable)
        .set({
          lastPostAt: postedAt,
          updatedAt: new Date(),
        })
        .where(eq(xTrackedAccountsTable.id, account.id));
    }

    const mentions = extractMentions(text);
    const mentionRows = [];

    for (const mention of mentions) {
      const [row] = await db
        .insert(xTokenMentionsTable)
        .values({
          postId,
          tokenSymbol: mention.tokenSymbol,
          contractAddress: mention.contractAddress,
          chain: mention.chain,
          confidence: mention.confidence,
        })
        .returning();

      if (row) {
        mentionRows.push(row);
        result.insertedMentions += 1;
      }
    }

    if (!account) continue;

    const subscriptions = await db
      .select()
      .from(userXAccountSubscriptionsTable)
      .where(and(eq(userXAccountSubscriptionsTable.xAccountId, account.id), eq(userXAccountSubscriptionsTable.isActive, true)));

    for (const subscription of subscriptions) {
      if (subscription.alertMode === "muted") continue;
      if (subscription.alertMode === "token_mentions" && mentionRows.length === 0) continue;

      const body = `${authorHandle ?? "Tracked X account"} posted${mentionRows.length > 0 ? " with token mentions" : ""}: ${text.slice(0, 180)}`;

      if (subscription.browserEnabled) {
        await createUserNotification(subscription.userId, {
          kind: "x_track_alert",
          title: "X Track activity",
          body,
          payload: {
            postId,
            accountId: account.id,
            authorHandle,
            mentions,
            url,
          },
        });
        result.notificationsCreated += 1;
        await db.insert(xSocialAlertsTable).values({
          userId: subscription.userId,
          xAccountId: account.id,
          postId,
          mentionId: mentionRows[0]?.id ?? null,
          channel: "browser",
          status: "sent",
          sentAt: new Date(),
        });
      }

      if (!subscription.telegramEnabled) continue;

      const chats = await telegramChatsForUser(subscription.userId);
      if (chats.length === 0) {
        await db.insert(xSocialAlertsTable).values({
          userId: subscription.userId,
          xAccountId: account.id,
          postId,
          mentionId: mentionRows[0]?.id ?? null,
          channel: "telegram",
          status: "skipped",
          error: "No linked Telegram chat.",
        });
        continue;
      }

      for (const chatId of chats) {
        try {
          await publishTelegramMessage(["AnyAlpha X Track", "", body, url ?? ""].join("\n"), { chatId });
          result.telegramMessagesSent += 1;
          await db.insert(xSocialAlertsTable).values({
            userId: subscription.userId,
            xAccountId: account.id,
            postId,
            mentionId: mentionRows[0]?.id ?? null,
            channel: "telegram",
            status: "sent",
            sentAt: new Date(),
          });
        } catch (err) {
          await db.insert(xSocialAlertsTable).values({
            userId: subscription.userId,
            xAccountId: account.id,
            postId,
            mentionId: mentionRows[0]?.id ?? null,
            channel: "telegram",
            status: "failed",
            error: err instanceof Error ? err.message.slice(0, 500) : "Telegram X alert failed.",
          });
        }
      }
    }
  }

  return {
    ...result,
    updatedAt: new Date().toISOString(),
  };
}
