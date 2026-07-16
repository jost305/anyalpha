import Redis from "ioredis";
import { logger } from "../logger";

interface CacheEnvelope<T> {
  value: T;
  freshUntil: number;
  staleUntil: number;
  savedAt: string;
}

interface CacheOptions<T> {
  key: string;
  ttlMs: number;
  staleTtlMs: number;
  load: () => Promise<T>;
}

const CACHE_PREFIX = process.env.CACHE_PREFIX?.trim() || "anyalpha";
const memoryCache = new Map<string, CacheEnvelope<unknown>>();
const pendingLoads = new Map<string, Promise<unknown>>();

let redis: Redis | null | false = null;

function redisUrl(): string | null {
  const value = process.env.REDIS_URL?.trim() || process.env.REDIS_PRIVATE_URL?.trim();
  if (value) return value;

  const host = process.env.REDIS_HOST?.trim();
  if (!host) return null;

  const port = process.env.REDIS_PORT?.trim() || "6379";
  const username = process.env.REDIS_USERNAME?.trim();
  const password = process.env.REDIS_PASSWORD?.trim();
  const tls = process.env.REDIS_TLS?.trim().toLowerCase() === "true";
  const protocol = tls ? "rediss" : "redis";
  const auth = password
    ? `${username ? encodeURIComponent(username) : ""}:${encodeURIComponent(password)}@`
    : username
      ? `${encodeURIComponent(username)}@`
      : "";

  return `${protocol}://${auth}${host}:${port}`;
}

function redisClient(): Redis | null {
  if (redis === false) return null;
  if (redis) return redis;

  const url = redisUrl();
  if (!url) return null;

  redis = new Redis(url, {
    connectTimeout: 2_000,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  redis.on("error", (err) => {
    logger.warn({ err }, "Redis cache connection error");
  });

  return redis;
}

function namespaced(key: string): string {
  return `${CACHE_PREFIX}:${key}`;
}

function isFresh<T>(envelope: CacheEnvelope<T>, now = Date.now()): boolean {
  return envelope.freshUntil > now;
}

function isUsableStale<T>(envelope: CacheEnvelope<T>, now = Date.now()): boolean {
  return envelope.staleUntil > now;
}

async function getEnvelope<T>(key: string): Promise<CacheEnvelope<T> | null> {
  const now = Date.now();
  const memoryValue = memoryCache.get(key) as CacheEnvelope<T> | undefined;
  if (memoryValue && isUsableStale(memoryValue, now)) return memoryValue;
  if (memoryValue) memoryCache.delete(key);

  const client = redisClient();
  if (!client) return null;

  try {
    const raw = await client.get(namespaced(key));
    if (!raw) return null;

    const envelope = JSON.parse(raw) as CacheEnvelope<T>;
    if (!isUsableStale(envelope, now)) return null;

    memoryCache.set(key, envelope as CacheEnvelope<unknown>);
    return envelope;
  } catch (err) {
    logger.warn({ err, key }, "Redis cache read failed");
    return null;
  }
}

async function setEnvelope<T>(key: string, envelope: CacheEnvelope<T>): Promise<void> {
  memoryCache.set(key, envelope as CacheEnvelope<unknown>);

  const client = redisClient();
  if (!client) return;

  const ttlSeconds = Math.max(1, Math.ceil((envelope.staleUntil - Date.now()) / 1000));

  try {
    await client.set(namespaced(key), JSON.stringify(envelope), "EX", ttlSeconds);
  } catch (err) {
    logger.warn({ err, key }, "Redis cache write failed");
  }
}

export async function writeCachedJson<T>(key: string, value: T, ttlMs: number, staleTtlMs: number): Promise<void> {
  if (ttlMs <= 0 || staleTtlMs <= 0) return;

  const now = Date.now();
  await setEnvelope(key, {
    value,
    freshUntil: now + ttlMs,
    staleUntil: now + staleTtlMs,
    savedAt: new Date(now).toISOString(),
  });
}

function refresh<T>({ key, ttlMs, staleTtlMs, load }: CacheOptions<T>): Promise<T> {
  const pending = pendingLoads.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = load()
    .then(async (value) => {
      const now = Date.now();
      await setEnvelope(key, {
        value,
        freshUntil: now + ttlMs,
        staleUntil: now + staleTtlMs,
        savedAt: new Date(now).toISOString(),
      });
      return value;
    })
    .finally(() => {
      pendingLoads.delete(key);
    });

  pendingLoads.set(key, promise as Promise<unknown>);
  return promise;
}

export async function cachedJson<T>(options: CacheOptions<T>): Promise<T> {
  if (options.ttlMs <= 0 || options.staleTtlMs <= 0) return options.load();

  const envelope = await getEnvelope<T>(options.key);
  const now = Date.now();

  if (envelope && isFresh(envelope, now)) return envelope.value;

  if (envelope && isUsableStale(envelope, now)) {
    void refresh(options).catch((err) => {
      logger.warn({ err, key: options.key }, "Background cache refresh failed");
    });
    return envelope.value;
  }

  try {
    return await refresh(options);
  } catch (err) {
    if (envelope) return envelope.value;
    throw err;
  }
}

export function cacheNumberEnv(key: string, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const raw = Number(process.env[key] ?? "");
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(raw)));
}
