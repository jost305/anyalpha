import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import {
  addTrackedWallet,
  backfillTrackedWallet,
  discoverPublicWallets,
  ingestWalletWebhook,
  listPublicWalletTracker,
  listWalletTracker,
  removeTrackedWallet,
  sendTrackedWalletTestAlert,
  syncProviderWebhook,
  updateTrackedWallet,
  type WalletTrackerChain,
  type WalletWebhookProvider,
} from "../lib/wallet-tracker/store";
import { getBearerToken, getPrivyClient, verifyPrivyAccessToken } from "../lib/auth/privy-auth";

const addWalletSchema = z.object({
  chain: z.enum(["solana", "ethereum", "base", "arbitrum", "bsc", "polygon", "optimism", "sui", "aptos"]),
  address: z.string().min(8).max(128),
  label: z.string().max(48).optional().nullable(),
  alertMode: z.enum(["alerts_only", "copy_ready", "muted"]).optional(),
  telegramEnabled: z.boolean().optional(),
  browserEnabled: z.boolean().optional(),
  minUsdCents: z.number().int().min(0).max(1_000_000_000).optional(),
  alertTypes: z.array(z.enum(["buy", "sell", "transfer", "mint", "burn", "unknown"])).max(6).optional(),
});
const updateWalletSchema = z.object({
  label: z.string().max(48).optional().nullable(),
  alertMode: z.enum(["alerts_only", "copy_ready", "muted"]).optional(),
  telegramEnabled: z.boolean().optional(),
  browserEnabled: z.boolean().optional(),
  minUsdCents: z.number().int().min(0).max(1_000_000_000).optional(),
  alertTypes: z.array(z.enum(["buy", "sell", "transfer", "mint", "burn", "unknown"])).max(6).optional(),
});
const backfillWalletSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});

const providerSchema = z.enum(["helius", "alchemy"]);
const chainSchema = z.enum(["solana", "ethereum", "base", "arbitrum", "bsc", "polygon", "optimism", "sui", "aptos"]);
const discoveryChainSchema = z.enum(["solana", "ethereum", "base"]);
const discoveryRunSchema = z.object({
  chains: z.array(discoveryChainSchema).max(3).optional(),
  maxWalletsPerChain: z.number().int().min(1).max(50).optional(),
  backfillLimit: z.number().int().min(1).max(100).optional(),
  solanaSignatureLimit: z.number().int().min(1).max(100).optional(),
  evmBlockLookback: z.number().int().min(1).max(25).optional(),
});
type RawBodyRequest = Request & { rawBody?: Buffer };

const router: IRouter = Router();
const publicDiscoveryState = {
  running: null as Promise<unknown> | null,
  lastStartedAt: 0,
};

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

function constantTimeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function validateSharedFallback(req: Request) {
  if (process.env["WALLET_TRACKER_ALLOW_SHARED_SECRET_FALLBACK"] !== "true") return false;

  const secret = process.env["WALLET_TRACKER_WEBHOOK_SECRET"]?.trim();
  if (!secret) return false;

  const provided =
    headerValue(req.headers["x-anyalpha-webhook-secret"]) ??
    headerValue(req.headers["x-wallet-tracker-secret"]) ??
    bearerToken(req.headers.authorization);

  return Boolean(provided && constantTimeEqual(provided, secret));
}

function validateProviderWebhook(provider: WalletWebhookProvider, req: RawBodyRequest) {
  if (provider === "helius") {
    const expected = process.env["HELIUS_WEBHOOK_AUTH_HEADER"]?.trim();

    if (!expected) {
      if (validateSharedFallback(req)) return { ok: true as const, signatureVerified: false, providerDeliveryId: null };

      return {
        ok: false as const,
        status: 503,
        body: { error: "HELIUS_WEBHOOK_AUTH_HEADER is not configured." },
      };
    }

    const provided = headerValue(req.headers.authorization);
    if (!provided || !constantTimeEqual(provided, expected)) {
      return {
        ok: false as const,
        status: 401,
        body: { error: "Invalid Helius webhook authorization header." },
      };
    }

    return {
      ok: true as const,
      signatureVerified: true,
      providerDeliveryId: headerValue(req.headers["x-helius-webhook-id"]),
    };
  }

  const signingKey = process.env["ALCHEMY_WEBHOOK_SIGNING_KEY"]?.trim();

  if (!signingKey) {
    if (validateSharedFallback(req)) return { ok: true as const, signatureVerified: false, providerDeliveryId: null };

    return {
      ok: false as const,
      status: 503,
      body: { error: "ALCHEMY_WEBHOOK_SIGNING_KEY is not configured." },
    };
  }

  const signature = headerValue(req.headers["x-alchemy-signature"])?.replace(/^sha256=/i, "");
  const rawBody = req.rawBody;

  if (!signature || !rawBody) {
    return {
      ok: false as const,
      status: 401,
      body: { error: "Missing Alchemy webhook signature." },
    };
  }

  const digest = createHmac("sha256", signingKey).update(rawBody).digest("hex");
  if (!constantTimeEqual(signature, digest)) {
    return {
      ok: false as const,
      status: 401,
      body: { error: "Invalid Alchemy webhook signature." },
    };
  }

  return {
    ok: true as const,
    signatureVerified: true,
    providerDeliveryId: headerValue(req.headers["x-alchemy-webhook-id"]),
  };
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

function readNestedString(value: unknown, path: string[]): string | null {
  let cursor = value;

  for (const key of path) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }

  return typeof cursor === "string" ? cursor : null;
}

function chainFromNetwork(value: string | null | undefined): WalletTrackerChain | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized.includes("solana")) return "solana";
  if (normalized.includes("base")) return "base";
  if (normalized.includes("arb")) return "arbitrum";
  if (normalized.includes("bnb") || normalized.includes("bsc") || normalized.includes("binance")) return "bsc";
  if (normalized.includes("polygon") || normalized.includes("matic")) return "polygon";
  if (normalized.includes("optimism") || normalized === "opt" || normalized.includes("op mainnet")) return "optimism";
  if (normalized.includes("sui")) return "sui";
  if (normalized.includes("aptos")) return "aptos";
  if (normalized.includes("eth")) return "ethereum";

  return null;
}

function chainFromWebhook(provider: WalletWebhookProvider, body: unknown, rawChain: unknown): WalletTrackerChain {
  if (typeof rawChain === "string") {
    const parsed = chainSchema.safeParse(rawChain.trim().toLowerCase());
    if (parsed.success) return parsed.data;
    const fromNetwork = chainFromNetwork(rawChain);
    if (fromNetwork) return fromNetwork;
  }

  const fromBody =
    chainFromNetwork(readNestedString(body, ["chain"])) ??
    chainFromNetwork(readNestedString(body, ["network"])) ??
    chainFromNetwork(readNestedString(body, ["event", "network"])) ??
    chainFromNetwork(readNestedString(body, ["event", "networkId"]));

  if (fromBody) return fromBody;
  return provider === "helius" ? "solana" : "ethereum";
}

function numberEnv(key: string, fallback: number, min: number, max: number): number {
  const parsed = Number(process.env[key] ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function publicDiscoveryChains() {
  const chains: Array<"solana" | "base" | "ethereum"> = [];
  const infuraConfigured = Boolean(process.env["INFURA_API_KEY"]?.trim() || process.env["INFURA_PROJECT_ID"]?.trim());
  const alchemyEnabled = process.env["ALCHEMY_DISABLED"]?.trim().toLowerCase() !== "true";
  if (process.env["SOLANA_RPC_URL"]?.trim() || process.env["HELIUS_API_KEY"]?.trim()) chains.push("solana");
  if (process.env["BASE_RPC_URL"]?.trim() || infuraConfigured || (alchemyEnabled && process.env["ALCHEMY_API_KEY"]?.trim())) {
    chains.push("base");
  }
  if (process.env["ETHEREUM_RPC_URL"]?.trim() || infuraConfigured || (alchemyEnabled && process.env["ALCHEMY_API_KEY"]?.trim())) {
    chains.push("ethereum");
  }
  return Array.from(new Set(chains));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function refreshThinPublicWalletIndex(userId: string | null, limit: number | undefined) {
  const snapshot = await listPublicWalletTracker(userId, limit);
  const minimumIndexedWallets = numberEnv("WALLET_DISCOVERY_PUBLIC_MIN_WALLETS", 24, 1, 200);
  if (snapshot.total >= minimumIndexedWallets) return snapshot;

  const chains = publicDiscoveryChains();
  if (chains.length === 0) return snapshot;

  const cooldownMs = numberEnv("WALLET_DISCOVERY_PUBLIC_COOLDOWN_MS", 60_000, 5_000, 30 * 60_000);
  const now = Date.now();

  if (!publicDiscoveryState.running && now - publicDiscoveryState.lastStartedAt >= cooldownMs) {
    publicDiscoveryState.lastStartedAt = now;
    publicDiscoveryState.running = discoverPublicWallets({
      chains,
      maxWalletsPerChain: numberEnv("WALLET_DISCOVERY_PUBLIC_MAX_WALLETS_PER_CHAIN", 16, 1, 50),
      backfillLimit: numberEnv("WALLET_DISCOVERY_PUBLIC_BACKFILL_LIMIT", 24, 1, 100),
      solanaSignatureLimit: numberEnv("WALLET_DISCOVERY_PUBLIC_SOLANA_SIGNATURE_LIMIT", 32, 1, 100),
      evmBlockLookback: numberEnv("WALLET_DISCOVERY_PUBLIC_EVM_BLOCK_LOOKBACK", 12, 1, 25),
    })
      .catch(() => null)
      .finally(() => {
        publicDiscoveryState.running = null;
      });
  }

  const shouldWaitForFirstRows = snapshot.total < Math.min(8, minimumIndexedWallets);
  if (!publicDiscoveryState.running || !shouldWaitForFirstRows) return snapshot;

  const waitMs = numberEnv("WALLET_DISCOVERY_PUBLIC_WAIT_MS", 8_000, 0, 20_000);
  if (waitMs > 0) {
    await Promise.race([publicDiscoveryState.running, sleep(waitMs)]);
  }

  return listPublicWalletTracker(userId, limit);
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

async function optionalAuthenticatedUserId(authorization: string | string[] | undefined) {
  const token = getBearerToken(authorization);

  if (!token || !getPrivyClient()) return null;

  try {
    const auth = await verifyPrivyAccessToken(token);
    return auth?.user.id ?? null;
  } catch {
    return null;
  }
}

router.get("/wallet-tracker/public", async (req, res, next) => {
  try {
    const userId = await optionalAuthenticatedUserId(req.headers.authorization);
    const parsedLimit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;
    const snapshot = await refreshThinPublicWalletIndex(userId, limit);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "wallet_tracker_public",
      ...snapshot,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/wallet-tracker", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const snapshot = await listWalletTracker(auth.user.id);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "wallet_tracker",
      ...snapshot,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/wallet-tracker/wallets", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const body = addWalletSchema.parse(req.body);
    const wallet = await addTrackedWallet(auth.user.id, body);

    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({
      source: "wallet_tracker",
      wallet,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.issues[0]?.message ?? "Invalid wallet tracker payload." });
      return;
    }

    if (err instanceof Error && (err.message.includes("wallet address") || err.message.includes("limit reached"))) {
      res.status(400).json({ error: err.message });
      return;
    }

    next(err);
  }
});

router.patch("/wallet-tracker/wallets/:id", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const subscriptionId = req.params.id?.trim();
    if (!subscriptionId) {
      res.status(400).json({ error: "Missing tracked wallet id." });
      return;
    }

    const body = updateWalletSchema.parse(req.body);
    const wallet = await updateTrackedWallet(auth.user.id, subscriptionId, body);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "wallet_tracker",
      wallet,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.issues[0]?.message ?? "Invalid wallet tracker preferences." });
      return;
    }

    if (err instanceof Error && err.message.includes("not found")) {
      res.status(404).json({ error: err.message });
      return;
    }

    next(err);
  }
});

router.post("/wallet-tracker/wallets/:id/test-alert", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const subscriptionId = req.params.id?.trim();
    if (!subscriptionId) {
      res.status(400).json({ error: "Missing tracked wallet id." });
      return;
    }

    const result = await sendTrackedWalletTestAlert(auth.user.id, subscriptionId);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "wallet_tracker_test_alert",
      ...result,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      res.status(404).json({ error: err.message });
      return;
    }

    next(err);
  }
});

router.post("/wallet-tracker/wallets/:id/backfill", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const subscriptionId = req.params.id?.trim();
    if (!subscriptionId) {
      res.status(400).json({ error: "Missing tracked wallet id." });
      return;
    }

    const body = backfillWalletSchema.parse(req.body ?? {});
    const result = await backfillTrackedWallet(auth.user.id, subscriptionId, body.limit);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "wallet_tracker_backfill",
      ...result,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.issues[0]?.message ?? "Invalid wallet history sync request." });
      return;
    }

    if (err instanceof Error && err.message.includes("not found")) {
      res.status(404).json({ error: err.message });
      return;
    }

    if (err instanceof Error && (err.message.includes("required") || err.message.includes("failed") || err.message.includes("provider integration"))) {
      res.status(400).json({ error: err.message });
      return;
    }

    next(err);
  }
});

router.delete("/wallet-tracker/wallets/:id", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const subscriptionId = req.params.id?.trim();
    if (!subscriptionId) {
      res.status(400).json({ error: "Missing tracked wallet id." });
      return;
    }

    const removed = await removeTrackedWallet(auth.user.id, subscriptionId);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "wallet_tracker",
      removed,
      id: subscriptionId,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/wallet-tracker/wallets/:id/unfollow", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const subscriptionId = req.params.id?.trim();
    if (!subscriptionId) {
      res.status(400).json({ error: "Missing tracked wallet id." });
      return;
    }

    const removed = await removeTrackedWallet(auth.user.id, subscriptionId);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "wallet_tracker",
      removed,
      id: subscriptionId,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/wallet-tracker/webhooks/:provider", async (req, res, next) => {
  try {
    const provider = providerSchema.parse(req.params.provider) as WalletWebhookProvider;
    const validation = validateProviderWebhook(provider, req as RawBodyRequest);

    if (!validation.ok) {
      res.status(validation.status).json(validation.body);
      return;
    }

    const chain = chainFromWebhook(provider, req.body, req.query.chain);
    const result = await ingestWalletWebhook(provider, chain, req.body, {
      signatureVerified: validation.signatureVerified,
      providerDeliveryId: validation.providerDeliveryId,
    });

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "wallet_tracker_webhook",
      ...result,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.issues[0]?.message ?? "Invalid wallet tracker webhook payload." });
      return;
    }

    next(err);
  }
});

router.post("/wallet-tracker/provider-sync/:provider", async (req, res, next) => {
  try {
    const admin = validateAdminSecret(req);

    if (!admin.ok) {
      res.status(admin.status).json(admin.body);
      return;
    }

    const provider = providerSchema.parse(req.params.provider) as WalletWebhookProvider;
    const chain = chainSchema.parse(typeof req.query.chain === "string" ? req.query.chain.toLowerCase() : provider === "helius" ? "solana" : "base");
    const result = await syncProviderWebhook(provider, chain);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "wallet_tracker_provider_sync",
      ...result,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.issues[0]?.message ?? "Invalid provider sync request." });
      return;
    }

    if (err instanceof Error && (err.message.includes("required") || err.message.includes("No active") || err.message.includes("provider integration"))) {
      res.status(400).json({ error: err.message });
      return;
    }

    next(err);
  }
});

router.post("/wallet-tracker/discovery/run", async (req, res, next) => {
  try {
    const admin = validateAdminSecret(req);

    if (!admin.ok) {
      res.status(admin.status).json(admin.body);
      return;
    }

    const body = discoveryRunSchema.parse(req.body ?? {});
    const result = await discoverPublicWallets(body);

    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.issues[0]?.message ?? "Invalid public wallet discovery request." });
      return;
    }

    next(err);
  }
});

export default router;
