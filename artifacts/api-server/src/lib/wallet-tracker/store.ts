import { createHash } from "node:crypto";
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { awardFirstWalletTracked, awardPoints } from "../auth/alpha-points-store";
import { publishTelegramMessage } from "../alerts/telegram";
import { logger } from "../logger";
import { infuraRpcUrl, rpcAuthHeaders } from "../markets/provider-utils";
import { createUserNotification } from "../notifications/store";

const TRACKED_WALLET_LIMIT = 50;
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const MOVE_ADDRESS_RE = /^0x[a-fA-F0-9]{1,64}$/;

export type WalletTrackerChain =
  | "solana"
  | "ethereum"
  | "base"
  | "arbitrum"
  | "bsc"
  | "polygon"
  | "optimism"
  | "sui"
  | "aptos";
export type WalletAlertMode = "alerts_only" | "copy_ready" | "muted";
export type WalletWebhookProvider = "helius" | "alchemy";
type WalletTransactionType = "buy" | "sell" | "transfer" | "mint" | "burn" | "unknown";
export type WalletAlertType = WalletTransactionType;
type WalletTrackerMetadata = Record<string, unknown>;

interface ParsedWalletActivity {
  type: WalletTransactionType;
  tokenAddress: string | null;
  tokenSymbol: string | null;
  tokenName: string | null;
  amountRaw: string | null;
  tokenAmount: string | null;
  amountUsdCents: number | null;
  usdValueSource: string | null;
  tradeConfidence: number;
  counterparty: string | null;
  dex: string | null;
  programId: string | null;
  blockRef: string | null;
}

export interface AddTrackedWalletInput {
  chain: WalletTrackerChain;
  address: string;
  label?: string | null;
  alertMode?: WalletAlertMode;
  telegramEnabled?: boolean;
  browserEnabled?: boolean;
  minUsdCents?: number;
  alertTypes?: WalletAlertType[];
}

export interface UpdateTrackedWalletInput {
  label?: string | null;
  alertMode?: WalletAlertMode;
  telegramEnabled?: boolean;
  browserEnabled?: boolean;
  minUsdCents?: number;
  alertTypes?: WalletAlertType[];
}

export interface WalletTrackerItem {
  id: string;
  walletId: string;
  chain: WalletTrackerChain;
  address: string;
  label: string | null;
  alertMode: WalletAlertMode;
  telegramEnabled: boolean;
  browserEnabled: boolean;
  minUsdCents: number;
  alertTypes: WalletAlertType[];
  source: string;
  score: number | null;
  riskLevel: string | null;
  tags: string[];
  firstSeenAt: string;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
  latestTransactions: Array<{
    id: string;
    signature: string;
    type: string;
    tokenSymbol: string | null;
    tokenName: string | null;
    tokenAddress: string | null;
    tokenAmount: string | null;
    amountUsdCents: number | null;
    tradeConfidence: number;
    realizedPnlUsdCents: number | null;
    costBasisUsdCents: number | null;
    counterparty: string | null;
    dex: string | null;
    programId: string | null;
    occurredAt: string;
  }>;
  performance: {
    buyCount: number;
    sellCount: number;
    winningSellCount: number;
    winRate: number | null;
    realizedPnlUsdCents: number;
    buyVolumeUsdCents: number;
    sellVolumeUsdCents: number;
    openPositions: number;
    lastTradeAt: string | null;
  };
}

export interface WalletTrackerSnapshot {
  wallets: WalletTrackerItem[];
  total: number;
  monitoring: {
    solanaProviderConfigured: boolean;
    evmProviderConfigured: boolean;
    webhookSecretConfigured: boolean;
    heliusAuthConfigured: boolean;
    alchemySignatureConfigured: boolean;
    publicWebhookBaseConfigured: boolean;
  };
  updatedAt: string;
}

export interface PublicWalletTrackerItem {
  id: string;
  chain: WalletTrackerChain;
  address: string;
  label: string | null;
  source: string;
  score: number | null;
  riskLevel: string | null;
  tags: string[];
  balanceLabel: string | null;
  balanceUsdCents: number | null;
  avgDurationSeconds: number | null;
  avgDurationLabel: string | null;
  followerCount: number;
  followed: boolean;
  subscriptionId: string | null;
  firstSeenAt: string;
  lastActiveAt: string | null;
  updatedAt: string;
  performance: {
    buyCount: number;
    sellCount: number;
    winningSellCount: number;
    winRate: number | null;
    realizedPnlUsdCents: number;
    buyVolumeUsdCents: number;
    sellVolumeUsdCents: number;
    openPositions: number;
    lastTradeAt: string | null;
  };
}

export interface PublicWalletTrackerSnapshot {
  wallets: PublicWalletTrackerItem[];
  total: number;
  monitoring: WalletTrackerSnapshot["monitoring"];
  updatedAt: string;
}

export type PublicWalletDiscoveryChain = Extract<WalletTrackerChain, "solana" | "ethereum" | "base">;

export interface PublicWalletDiscoveryInput {
  chains?: PublicWalletDiscoveryChain[];
  maxWalletsPerChain?: number;
  backfillLimit?: number;
  solanaSignatureLimit?: number;
  evmBlockLookback?: number;
}

export interface PublicWalletDiscoveryChainResult {
  chain: PublicWalletDiscoveryChain;
  provider: WalletWebhookProvider;
  discovered: number;
  insertedWallets: number;
  updatedWallets: number;
  backfilledWallets: number;
  receivedTransactions: number;
  insertedTransactions: number;
  duplicates: number;
  matchedWallets: number;
  skipped: number;
  errors: string[];
}

export interface PublicWalletDiscoveryResult {
  source: "wallet_public_discovery";
  chains: PublicWalletDiscoveryChainResult[];
  totals: {
    discovered: number;
    insertedWallets: number;
    updatedWallets: number;
    backfilledWallets: number;
    receivedTransactions: number;
    insertedTransactions: number;
    duplicates: number;
    matchedWallets: number;
    skipped: number;
  };
  updatedAt: string;
}

export interface WalletWebhookIngestResult {
  provider: WalletWebhookProvider;
  chain: WalletTrackerChain;
  received: number;
  duplicates: number;
  matchedWallets: number;
  insertedTransactions: number;
  notificationsCreated: number;
  telegramMessagesSent: number;
  skippedMutedSubscriptions: number;
  skippedPreferenceSubscriptions: number;
  eventIds: string[];
  updatedAt: string;
}

export interface WalletProviderSyncResult {
  provider: WalletWebhookProvider;
  chain: WalletTrackerChain;
  endpoint: string;
  addressCount: number;
  mode: "created" | "updated";
  providerWebhookId: string | null;
  signingKeyReturned?: boolean;
  updatedAt: string;
}

export interface WalletTestAlertResult {
  notificationCreated: boolean;
  telegramMessagesSent: number;
  skippedChannels: string[];
  updatedAt: string;
}

export interface WalletBackfillResult {
  runId: string;
  provider: WalletWebhookProvider;
  chain: WalletTrackerChain;
  walletId: string;
  requestedLimit: number;
  received: number;
  insertedTransactions: number;
  duplicates: number;
  matchedWallets: number;
  updatedAt: string;
}

type DbModule = typeof import("@workspace/db");

let dbModulePromise: Promise<DbModule> | null = null;

async function getDbModule(): Promise<DbModule> {
  if (dbModulePromise) return dbModulePromise;

  dbModulePromise = (async () => {
    const databaseUrl = (process.env["DATABASE_URL"] ?? "").trim();

    if (!databaseUrl) {
      throw new Error("DATABASE_URL must be configured to use Supabase wallet tracker storage.");
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

function normalizeLabel(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  return normalized.slice(0, 48);
}

function normalizeAlertTypes(value: WalletAlertType[] | null | undefined): WalletAlertType[] {
  if (!value) return [];
  const allowed = new Set<WalletAlertType>(["buy", "sell", "transfer", "mint", "burn", "unknown"]);
  return Array.from(new Set(value.filter((item): item is WalletAlertType => allowed.has(item))));
}

function normalizeMinUsdCents(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function normalizeWallet(chain: WalletTrackerChain, address: string) {
  const trimmed = address.trim();

  if (chain === "solana") {
    if (!SOLANA_ADDRESS_RE.test(trimmed)) {
      throw new Error("Enter a valid Solana wallet address.");
    }

    return {
      address: trimmed,
      normalized: trimmed,
    };
  }

  if (chain === "sui" || chain === "aptos") {
    if (!MOVE_ADDRESS_RE.test(trimmed)) {
      throw new Error(`Enter a valid ${chain === "sui" ? "Sui" : "Aptos"} wallet address.`);
    }

    return {
      address: trimmed,
      normalized: trimmed.toLowerCase(),
    };
  }

  if (!EVM_ADDRESS_RE.test(trimmed)) {
    throw new Error("Enter a valid EVM wallet address.");
  }

  return {
    address: trimmed,
    normalized: trimmed.toLowerCase(),
  };
}

function monitoringStatus() {
  return {
    solanaProviderConfigured: Boolean(process.env["HELIUS_API_KEY"]?.trim() || process.env["HELIUS_WEBHOOK_ID"]?.trim()),
    evmProviderConfigured: Boolean(
      process.env["INFURA_API_KEY"]?.trim() ||
        process.env["INFURA_PROJECT_ID"]?.trim() ||
        process.env["ETHEREUM_RPC_URL"]?.trim() ||
        process.env["BASE_RPC_URL"]?.trim() ||
        (!alchemyDisabled() && (process.env["ALCHEMY_API_KEY"]?.trim() || process.env["ALCHEMY_WEBHOOK_ID"]?.trim())),
    ),
    webhookSecretConfigured: Boolean(process.env["WALLET_TRACKER_WEBHOOK_SECRET"]?.trim()),
    heliusAuthConfigured: Boolean(process.env["HELIUS_WEBHOOK_AUTH_HEADER"]?.trim()),
    alchemySignatureConfigured: Boolean(process.env["ALCHEMY_WEBHOOK_SIGNING_KEY"]?.trim()),
    publicWebhookBaseConfigured: Boolean(publicApiBaseUrl()),
  };
}

function publicApiBaseUrl(): string | null {
  const explicit = process.env["PUBLIC_API_BASE_URL"]?.trim() || process.env["VITE_API_BASE_URL"]?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const railwayDomain = process.env["RAILWAY_PUBLIC_DOMAIN"]?.trim();
  if (railwayDomain) return `https://${railwayDomain.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}`;

  return null;
}

function alchemyDisabled(): boolean {
  return process.env["ALCHEMY_DISABLED"]?.trim().toLowerCase() === "true";
}

function walletWebhookEndpoint(provider: WalletWebhookProvider, chain: WalletTrackerChain): string {
  const baseUrl = publicApiBaseUrl();
  if (!baseUrl) throw new Error("PUBLIC_API_BASE_URL or RAILWAY_PUBLIC_DOMAIN is required to register provider webhooks.");
  return `${baseUrl}/api/wallet-tracker/webhooks/${provider}?chain=${chain}`;
}

function providerForChain(chain: WalletTrackerChain): WalletWebhookProvider {
  return chain === "solana" ? "helius" : "alchemy";
}

function liveProviderForChain(chain: WalletTrackerChain): WalletWebhookProvider | null {
  if (chain === "sui" || chain === "aptos") return null;
  return providerForChain(chain);
}

function providerCanSync(provider: WalletWebhookProvider): boolean {
  if (provider === "helius") {
    return Boolean(process.env["HELIUS_API_KEY"]?.trim() && process.env["HELIUS_WEBHOOK_AUTH_HEADER"]?.trim());
  }

  if (alchemyDisabled()) return false;
  return Boolean(process.env["ALCHEMY_NOTIFY_AUTH_TOKEN"]?.trim());
}

function scheduleProviderWebhookSync(chain: WalletTrackerChain, reason: string): void {
  const provider = liveProviderForChain(chain);
  if (!provider) return;
  if (!providerCanSync(provider)) return;

  setTimeout(() => {
    void syncProviderWebhook(provider, chain).catch((err) => {
      logger.warn({ err, provider, chain, reason }, "Wallet provider webhook auto-sync failed.");
    });
  }, 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeJsonHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function collectStrings(value: unknown, output: Set<string>, depth = 0): void {
  if (depth > 8 || value == null) return;

  if (typeof value === "string") {
    output.add(value);
    return;
  }

  if (typeof value === "number" || typeof value === "boolean") return;

  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output, depth + 1);
    return;
  }

  if (!isRecord(value)) return;

  for (const item of Object.values(value)) {
    collectStrings(item, output, depth + 1);
  }
}

function extractCandidateAddresses(chain: WalletTrackerChain, payload: unknown): string[] {
  const strings = new Set<string>();
  const candidates = new Set<string>();
  collectStrings(payload, strings);
  const addressPattern = chain === "solana" ? /[1-9A-HJ-NP-Za-km-z]{32,44}/g : chain === "sui" || chain === "aptos" ? /0x[a-fA-F0-9]{1,64}/g : /0x[a-fA-F0-9]{40}/g;

  for (const value of strings) {
    const words = value.match(addressPattern) ?? [];

    for (const word of words) {
      if (chain === "solana" && SOLANA_ADDRESS_RE.test(word)) {
        candidates.add(word);
      }

      if ((chain === "sui" || chain === "aptos") && MOVE_ADDRESS_RE.test(word)) {
        candidates.add(word.toLowerCase());
      }

      if (!["solana", "sui", "aptos"].includes(chain) && EVM_ADDRESS_RE.test(word)) {
        candidates.add(word.toLowerCase());
      }
    }
  }

  return Array.from(candidates);
}

function nestedArray(value: Record<string, unknown>, keys: string[]): unknown[] | null {
  let cursor: unknown = value;

  for (const key of keys) {
    if (!isRecord(cursor)) return null;
    cursor = cursor[key];
  }

  return Array.isArray(cursor) ? cursor : null;
}

function payloadItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [payload];

  const candidates =
    nestedArray(payload, ["events"]) ??
    nestedArray(payload, ["transactions"]) ??
    nestedArray(payload, ["activity"]) ??
    nestedArray(payload, ["items"]) ??
    nestedArray(payload, ["event", "activity"]) ??
    nestedArray(payload, ["data", "activity"]) ??
    nestedArray(payload, ["data", "transactions"]);

  return candidates ?? [payload];
}

function alchemyActivityItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [payload];

  const candidates =
    nestedArray(payload, ["event", "activity"]) ??
    nestedArray(payload, ["data", "activity"]) ??
    nestedArray(payload, ["activity"]) ??
    nestedArray(payload, ["event", "transactions"]) ??
    nestedArray(payload, ["data", "transactions"]) ??
    nestedArray(payload, ["transactions"]);

  return candidates ?? payloadItems(payload);
}

function payloadItemsForProvider(provider: WalletWebhookProvider, chain: WalletTrackerChain, payload: unknown): unknown[] {
  if (provider !== "alchemy") return payloadItems(payload);

  const items = alchemyActivityItems(payload);
  const grouped = new Map<string, unknown[]>();
  const passthrough: unknown[] = [];

  for (const item of items) {
    const hash = findFirstString(item, ["hash", "transactionHash", "txHash"]);
    if (!hash) {
      passthrough.push(item);
      continue;
    }

    const current = grouped.get(hash) ?? [];
    current.push(item);
    grouped.set(hash, current);
  }

  if (grouped.size === 0) return items;

  return [
    ...Array.from(grouped.entries()).map(([hash, transfers]) => ({
      anyalphaEventId: `${chain}:${hash}`,
      hash,
      transactionHash: hash,
      alchemyTransfers: transfers,
      activity: transfers,
      createdAt: findFirstString(transfers[0], ["createdAt", "timestamp", "blockTimestamp", "time"]),
      blockNum: findFirstString(transfers[0], ["blockNum", "blockNumber"]),
      category: "alchemy_address_activity_bundle",
    })),
    ...passthrough,
  ];
}

function directString(value: unknown, keys: string[]): string | null {
  if (!isRecord(value)) return null;

  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
  }

  return null;
}

function findFirstString(value: unknown, keys: string[], depth = 0): string | null {
  if (depth > 6 || value == null) return null;

  const direct = directString(value, keys);
  if (direct) return direct;

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = findFirstString(item, keys, depth + 1);
      if (candidate) return candidate;
    }

    return null;
  }

  if (!isRecord(value)) return null;

  for (const item of Object.values(value)) {
    const candidate = findFirstString(item, keys, depth + 1);
    if (candidate) return candidate;
  }

  return null;
}

function eventIdForItem(provider: WalletWebhookProvider, chain: WalletTrackerChain, item: unknown): string {
  const groupedEventId = directString(item, ["anyalphaEventId"]);
  if (groupedEventId) return groupedEventId;

  const explicit = findFirstString(item, [
    "eventId",
    "webhookId",
    "id",
    "signature",
    "transactionSignature",
    "transactionHash",
    "txHash",
    "hash",
  ]);

  if (provider === "alchemy" && explicit) {
    const transferKey = [
      explicit,
      findFirstString(item, ["from", "fromAddress"]) ?? "",
      findFirstString(item, ["to", "toAddress"]) ?? "",
      findFirstString(item, ["asset", "tokenSymbol"]) ?? "",
      findFirstString(item, ["value", "rawAmount", "tokenId"]) ?? "",
    ].join(":");
    return `${chain}:${safeJsonHash(transferKey).slice(0, 32)}`;
  }

  return `${chain}:${explicit ?? safeJsonHash(item).slice(0, 32)}`;
}

function dateFromPayload(value: unknown): Date {
  const raw = findFirstString(value, ["timestamp", "blockTimestamp", "blockTime", "time", "createdAt", "minedAt"]);

  if (!raw) return new Date();

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    return new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

function transactionTypeFromPayload(value: unknown): WalletTransactionType {
  const raw = findFirstString(value, ["type", "eventType", "category", "transactionType"])?.toLowerCase() ?? "";

  if (raw.includes("swap")) {
    const text = JSON.stringify(value).toLowerCase();
    if (text.includes("tokenoutput") || text.includes("token_outputs") || text.includes("erc20_transfers")) return "buy";
    return "unknown";
  }

  if (raw.includes("buy")) return "buy";
  if (raw.includes("sell")) return "sell";
  if (raw.includes("deploy") || raw.includes("create")) return "mint";
  if (raw.includes("mint")) return "mint";
  if (raw.includes("burn")) return "burn";
  if (raw.includes("transfer")) return "transfer";

  return "unknown";
}

function numberFromPayload(value: unknown, keys: string[]): number | null {
  const raw = findFirstString(value, keys);
  if (!raw) return null;

  const parsed = Number(String(raw).replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function amountUsdCentsFromPayload(value: unknown): number | null {
  const directCents = numberFromPayload(value, ["amountUsdCents", "valueUsdCents", "usdCents"]);
  if (directCents !== null) return Math.round(directCents);

  const usd = numberFromPayload(value, ["amountUsd", "amountUSD", "usdValue", "valueUsd", "valueUSD", "erc721TokenValue"]);
  if (usd === null) return null;
  return Math.round(usd * 100);
}

function usdValueSourceFromPayload(value: unknown): string | null {
  if (numberFromPayload(value, ["amountUsdCents", "valueUsdCents", "usdCents"]) !== null) return "provider_cents";
  if (numberFromPayload(value, ["amountUsd", "amountUSD", "usdValue", "valueUsd", "valueUSD"]) !== null) return "provider_usd";
  return null;
}

function tokenAmountFromPayload(value: unknown): string | null {
  return findFirstString(value, [
    "tokenAmount",
    "amount",
    "value",
    "rawAmount",
    "nativeAmount",
    "tokenStandardAmount",
  ]);
}

function dexFromPayload(value: unknown): string | null {
  const direct = findFirstString(value, ["dex", "exchange", "source", "platform", "protocol", "programName"]);
  const directNormalized = direct?.trim();
  if (directNormalized && !["transfer", "external", "internal", "erc20", "erc721", "erc1155"].includes(directNormalized.toLowerCase())) {
    return directNormalized;
  }

  const text = JSON.stringify(value).toLowerCase();
  const knownDexes: Array<[string, string]> = [
    ["jupiter", "Jupiter"],
    ["raydium", "Raydium"],
    ["orca", "Orca"],
    ["meteora", "Meteora"],
    ["pump", "PumpSwap"],
    ["uniswap", "Uniswap"],
    ["pancakeswap", "PancakeSwap"],
    ["aerodrome", "Aerodrome"],
    ["camelot", "Camelot"],
    ["velodrome", "Velodrome"],
    ["sushiswap", "SushiSwap"],
    ["curve", "Curve"],
    ["balancer", "Balancer"],
  ];

  return knownDexes.find(([needle]) => text.includes(needle))?.[1] ?? directNormalized ?? null;
}

function programIdFromPayload(value: unknown): string | null {
  return findFirstString(value, ["programId", "program", "contractAddress", "rawContract", "address"]);
}

function blockRefFromPayload(value: unknown): string | null {
  return findFirstString(value, ["slot", "blockNumber", "blockNum", "blockHash", "block"]);
}

function nestedValue(value: unknown, path: string[]): unknown {
  let cursor = value;

  for (const key of path) {
    if (!isRecord(cursor)) return null;
    cursor = cursor[key];
  }

  return cursor;
}

function nestedString(value: unknown, path: string[]): string | null {
  const candidate = nestedValue(value, path);
  if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
  return null;
}

function numericString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return value.trim();
  return null;
}

function decimalNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function decimalDb(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(18).replace(/\.?0+$/, "");
}

function canonicalAddress(chain: WalletTrackerChain, address: string | null | undefined): string | null {
  if (!address) return null;
  return chain === "solana" ? address : address.toLowerCase();
}

function isEvmChain(chain: WalletTrackerChain): boolean {
  return !["solana", "sui", "aptos"].includes(chain);
}

function tokenIdentity(chain: WalletTrackerChain, tokenAddress: string | null, tokenSymbol: string | null): string | null {
  const address = tokenAddress?.trim();
  if (address) {
    if (chain === "solana") return address;
    if (isEvmChain(chain) && EVM_ADDRESS_RE.test(address)) return address.toLowerCase();
    if ((chain === "sui" || chain === "aptos") && MOVE_ADDRESS_RE.test(address)) return address.toLowerCase();
    if (address.startsWith("native:")) return address.toLowerCase();
  }

  const symbol = tokenSymbol?.trim();
  if (symbol) return `symbol:${chain}:${symbol.toUpperCase()}`;
  return null;
}

function looksLikeTokenAddress(chain: WalletTrackerChain, value: string | null | undefined): boolean {
  if (!value) return false;
  if (chain === "solana") return SOLANA_ADDRESS_RE.test(value);
  if (chain === "sui" || chain === "aptos") return MOVE_ADDRESS_RE.test(value);
  return EVM_ADDRESS_RE.test(value);
}

const QUOTE_SYMBOLS = new Set(["SOL", "WSOL", "ETH", "WETH", "USDC", "USDT", "DAI", "USD", "USDB", "USDE", "USDS", "BNB", "WBNB"]);
const QUOTE_TOKEN_ADDRESSES = new Set([
  "So11111111111111111111111111111111111111112",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYD4zp8Kc4Khq9BvHo7tJq2n",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "0xdac17f958d2ee523a2206206994597c13d831ec7",
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  "0x4200000000000000000000000000000000000006",
  "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
  "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
  "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
]);

function isQuoteAsset(tokenAddress: string | null, tokenSymbol: string | null): boolean {
  const symbol = tokenSymbol?.trim().toUpperCase();
  if (symbol && QUOTE_SYMBOLS.has(symbol)) return true;
  const address = tokenAddress?.trim();
  if (!address) return false;
  return QUOTE_TOKEN_ADDRESSES.has(address) || QUOTE_TOKEN_ADDRESSES.has(address.toLowerCase());
}

interface TokenMovement {
  tokenAddress: string | null;
  tokenSymbol: string | null;
  tokenName: string | null;
  amount: number;
  rawAmount: string | null;
  direction: "in" | "out";
  counterparty: string | null;
  isQuote: boolean;
}

function tokenMovementFromTransfer(chain: WalletTrackerChain, transfer: unknown, walletAddress: string): TokenMovement | null {
  if (!isRecord(transfer)) return null;

  const wallet = walletAddress.toLowerCase();
  const from = canonicalAddress(chain, directString(transfer, ["fromUserAccount", "fromAddress", "from", "sender"]));
  const to = canonicalAddress(chain, directString(transfer, ["toUserAccount", "toAddress", "to", "recipient"]));
  const direction = to?.toLowerCase() === wallet ? "in" : from?.toLowerCase() === wallet ? "out" : null;
  if (!direction) return null;

  const directAddress = directString(transfer, ["mint", "tokenAddress", "contractAddress"]);
  const rawContractAddress = nestedString(transfer, ["rawContract", "address"]);
  const asset = directString(transfer, ["asset"]);
  const tokenAddress =
    (looksLikeTokenAddress(chain, directAddress) ? directAddress : null) ??
    (looksLikeTokenAddress(chain, rawContractAddress) ? rawContractAddress : null) ??
    (looksLikeTokenAddress(chain, asset) ? asset : null);
  const tokenSymbol =
    directString(transfer, ["symbol", "tokenSymbol", "ticker"]) ??
    (asset && !looksLikeTokenAddress(chain, asset) ? asset : null);
  const tokenName = directString(transfer, ["name", "tokenName"]);
  const rawAmount = directString(transfer, ["rawAmount", "amountRaw"]) ?? nestedString(transfer, ["rawContract", "value"]);
  const amount =
    numberFromPayload(transfer, ["tokenAmount", "amount", "value"]) ??
    decimalNumber(rawAmount) ??
    0;

  if (!Number.isFinite(amount) || amount <= 0) return null;

  return {
    tokenAddress,
    tokenSymbol,
    tokenName,
    amount,
    rawAmount,
    direction,
    counterparty: direction === "in" ? from : to,
    isQuote: isQuoteAsset(tokenAddress, tokenSymbol),
  };
}

function nativeMovementFromTransfer(chain: WalletTrackerChain, transfer: unknown, walletAddress: string): TokenMovement | null {
  if (!isRecord(transfer)) return null;

  const wallet = walletAddress.toLowerCase();
  const from = canonicalAddress(chain, directString(transfer, ["fromUserAccount", "fromAddress", "from", "sender"]));
  const to = canonicalAddress(chain, directString(transfer, ["toUserAccount", "toAddress", "to", "recipient"]));
  const direction = to?.toLowerCase() === wallet ? "in" : from?.toLowerCase() === wallet ? "out" : null;
  if (!direction) return null;

  const raw = numberFromPayload(transfer, ["amount", "value", "lamports"]);
  if (raw === null || raw <= 0) return null;
  const isSolana = chain === "solana";
  const symbol =
    isSolana
      ? "SOL"
      : chain === "base" || chain === "ethereum" || chain === "arbitrum" || chain === "optimism"
        ? "ETH"
        : chain === "bsc"
          ? "BNB"
          : chain === "polygon"
            ? "POL"
            : chain === "sui"
              ? "SUI"
              : chain === "aptos"
                ? "APT"
                : "NATIVE";
  const amount = isSolana ? raw / 1_000_000_000 : raw;

  return {
    tokenAddress: `native:${chain}`,
    tokenSymbol: symbol,
    tokenName: symbol,
    amount,
    rawAmount: String(raw),
    direction,
    counterparty: direction === "in" ? from : to,
    isQuote: true,
  };
}

function readArrayField(value: Record<string, unknown>, key: string): unknown[] {
  const candidate = value[key];
  return Array.isArray(candidate) ? candidate : [];
}

function transferArrays(value: unknown) {
  if (!isRecord(value)) return { tokenTransfers: [] as unknown[], nativeTransfers: [] as unknown[] };
  const tokenTransfers = [
    ...readArrayField(value, "tokenTransfers"),
    ...readArrayField(value, "erc20Transfers"),
    ...readArrayField(value, "erc721Transfers"),
    ...readArrayField(value, "erc1155Transfers"),
    ...readArrayField(value, "alchemyTransfers"),
    ...readArrayField(value, "transfers"),
  ];
  const nativeTransfers = [
    ...readArrayField(value, "nativeTransfers"),
    ...readArrayField(value, "nativeBalanceChanges"),
  ];
  return { tokenTransfers, nativeTransfers };
}

function quoteUsdCents(movement: TokenMovement | undefined): number | null {
  if (!movement || !movement.isQuote) return null;
  if (!movement.tokenSymbol) return null;
  const symbol = movement.tokenSymbol.toUpperCase();
  if (["USDC", "USDT", "DAI", "USD", "USDB", "USDE", "USDS"].includes(symbol)) {
    return Math.round(movement.amount * 100);
  }

  return null;
}

function textIncludes(value: unknown, words: string[]): boolean {
  const text = JSON.stringify(value).toLowerCase();
  return words.some((word) => text.includes(word.toLowerCase()));
}

function transactionTypeWithContext(value: unknown, matchedAddresses: string[]): WalletTransactionType {
  const direct = transactionTypeFromPayload(value);
  if (direct !== "unknown") return direct;

  if (!isRecord(value)) return direct;

  const from = findFirstString(value, ["from", "fromAddress", "fromUserAccount", "sender"])?.toLowerCase();
  const to = findFirstString(value, ["to", "toAddress", "toUserAccount", "recipient"])?.toLowerCase();
  const matched = new Set(matchedAddresses.map((address) => address.toLowerCase()));
  const hasSwapContext = textIncludes(value, ["swap", "jupiter", "raydium", "orca", "meteora", "uniswap", "pancakeswap", "aerodrome", "camelot"]);

  if (hasSwapContext && to && matched.has(to) && !from?.startsWith("0x0000000000000000000000000000000000000000")) return "buy";
  if (hasSwapContext && from && matched.has(from)) return "sell";
  if ((to && matched.has(to)) || (from && matched.has(from))) return "transfer";

  if (hasSwapContext) return "unknown";
  return direct;
}

function parseWalletActivity(
  item: unknown,
  chain: WalletTrackerChain,
  walletAddress: string,
  candidateAddresses: string[],
): ParsedWalletActivity {
  const { tokenTransfers, nativeTransfers } = transferArrays(item);
  const tokenMovements = tokenTransfers
    .map((transfer) => tokenMovementFromTransfer(chain, transfer, walletAddress))
    .filter((movement): movement is TokenMovement => Boolean(movement));
  const nativeMovements = nativeTransfers
    .map((transfer) => nativeMovementFromTransfer(chain, transfer, walletAddress))
    .filter((movement): movement is TokenMovement => Boolean(movement));
  const movements = [...tokenMovements, ...nativeMovements];
  const incoming = movements.filter((movement) => movement.direction === "in");
  const outgoing = movements.filter((movement) => movement.direction === "out");
  const incomingNonQuote = incoming.find((movement) => !movement.isQuote) ?? incoming[0];
  const outgoingNonQuote = outgoing.find((movement) => !movement.isQuote) ?? outgoing[0];
  const incomingQuote = incoming.find((movement) => movement.isQuote);
  const outgoingQuote = outgoing.find((movement) => movement.isQuote);
  const hasSwapContext = textIncludes(item, ["swap", "jupiter", "raydium", "orca", "meteora", "uniswap", "pancakeswap", "aerodrome", "camelot"]);
  const baseType = transactionTypeWithContext(item, candidateAddresses);
  let selected = incomingNonQuote ?? outgoingNonQuote ?? incoming[0] ?? outgoing[0] ?? null;
  let type = baseType;
  let tradeConfidence = baseType === "unknown" ? 0 : 45;
  let amountUsdCents = amountUsdCentsFromPayload(item);
  let usdValueSource = usdValueSourceFromPayload(item);

  if (movements.length > 0) {
    if (incomingNonQuote && outgoingQuote) {
      type = "buy";
      selected = incomingNonQuote;
      amountUsdCents = amountUsdCents ?? quoteUsdCents(outgoingQuote);
      usdValueSource = usdValueSource ?? (amountUsdCents !== null ? "quote_token" : null);
      tradeConfidence = amountUsdCents !== null ? (hasSwapContext ? 92 : 78) : hasSwapContext ? 82 : 70;
    } else if (outgoingNonQuote && incomingQuote) {
      type = "sell";
      selected = outgoingNonQuote;
      amountUsdCents = amountUsdCents ?? quoteUsdCents(incomingQuote);
      usdValueSource = usdValueSource ?? (amountUsdCents !== null ? "quote_token" : null);
      tradeConfidence = amountUsdCents !== null ? (hasSwapContext ? 92 : 78) : hasSwapContext ? 82 : 70;
    } else if (hasSwapContext && incoming.length > 0 && outgoing.length > 0) {
      type = baseType === "unknown" ? "unknown" : baseType;
      tradeConfidence = 55;
    } else {
      type = ["mint", "burn"].includes(baseType) ? baseType : "transfer";
      tradeConfidence = 40;
    }
  }

  const tokenAddress =
    selected?.tokenAddress ??
    nestedString(item, ["rawContract", "address"]) ??
    findFirstString(item, ["tokenAddress", "contractAddress", "mint"]) ??
    null;
  const tokenSymbol = selected?.tokenSymbol ?? findFirstString(item, ["tokenSymbol", "symbol", "ticker", "asset"]) ?? null;
  const tokenName = selected?.tokenName ?? findFirstString(item, ["tokenName", "name"]) ?? null;
  const tokenAmount = selected ? String(selected.amount) : tokenAmountFromPayload(item);
  const amountRaw = selected?.rawAmount ?? findFirstString(item, ["amountRaw", "rawAmount", "tokenAmount", "amount", "value"]) ?? null;
  const counterparty =
    selected?.counterparty ??
    findFirstString(item, ["counterparty", "to", "from", "toUserAccount", "fromUserAccount", "toAddress", "fromAddress"]) ??
    null;

  return {
    type,
    tokenAddress,
    tokenSymbol,
    tokenName,
    amountRaw,
    tokenAmount,
    amountUsdCents,
    usdValueSource,
    tradeConfidence,
    counterparty,
    dex: dexFromPayload(item),
    programId: programIdFromPayload(item),
    blockRef: blockRefFromPayload(item),
  };
}

function metadataFromPayload(provider: WalletWebhookProvider, item: unknown, matchedAddresses: string[]): WalletTrackerMetadata {
  return {
    provider,
    matchedAddresses,
    payload: isRecord(item) ? item : { value: item },
  };
}

function formatUsdCentsCompact(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function formatTokenAmount(value: string | null | undefined): string | null {
  const parsed = decimalNumber(value);
  if (parsed === null) return value?.trim() || null;
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: parsed >= 100 ? 2 : 6,
  }).format(parsed);
}

function formatWalletAlertBody(chain: WalletTrackerChain, address: string, parsed: ParsedWalletActivity, signature: string): string {
  const label = chain.charAt(0).toUpperCase() + chain.slice(1);
  const action =
    parsed.type === "buy"
      ? "bought"
      : parsed.type === "sell"
        ? "sold"
        : parsed.type === "transfer"
          ? "moved"
          : `recorded ${parsed.type}`;
  const token = parsed.tokenSymbol ?? parsed.tokenName ?? (parsed.tokenAddress ? shortWallet(parsed.tokenAddress) : "token");
  const amount = formatTokenAmount(parsed.tokenAmount);
  const usd = formatUsdCentsCompact(parsed.amountUsdCents);
  const venue = parsed.dex ? ` on ${parsed.dex}` : "";
  const value = usd ? ` (${usd})` : "";
  const quantity = amount ? `${amount} ` : "";

  return `${label} wallet ${shortWallet(address)} ${action} ${quantity}${token}${venue}${value}. Tx ${shortWallet(signature)}.`;
}

function formatWalletTestAlertBody(chain: WalletTrackerChain, address: string): string {
  const label = chain.charAt(0).toUpperCase() + chain.slice(1);
  return `${label} wallet ${shortWallet(address)} test alert from AnyAlpha Watcher.`;
}

function shouldNotifySubscription(
  subscription: {
    alertMode: WalletAlertMode;
    alertTypes: WalletAlertType[];
    minUsdCents: number;
  },
  type: WalletTransactionType,
  amountUsdCents: number | null,
) {
  if (subscription.alertMode === "muted") {
    return { ok: false as const, reason: "Wallet subscription is muted." };
  }

  if (subscription.alertTypes.length > 0 && !subscription.alertTypes.includes(type)) {
    return { ok: false as const, reason: `Transaction type ${type} is disabled for this wallet.` };
  }

  if (subscription.minUsdCents > 0) {
    if (amountUsdCents === null) {
      return { ok: false as const, reason: "USD value is unavailable and a minimum USD alert size is configured." };
    }

    if (amountUsdCents < subscription.minUsdCents) {
      return { ok: false as const, reason: "Transaction is below the configured minimum USD alert size." };
    }
  }

  return { ok: true as const };
}

function mergeTags(current: string[], next: string[]): string[] {
  return Array.from(new Set([...current, ...next])).slice(0, 12);
}

async function deriveWalletIntelligence(walletId: string, existingTags: string[], item: unknown, amountUsdCents: number | null) {
  const { db, walletTokenPositionsTable, walletTransactionsTable } = await getDbModule();
  const start24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [stats] = await db
    .select({
      txCount: count(),
      tx24h: sql<number>`coalesce(sum(case when ${walletTransactionsTable.occurredAt} >= ${start24h} then 1 else 0 end), 0)::int`,
      volumeUsdCents: sql<number>`coalesce(sum(${walletTransactionsTable.amountUsdCents}), 0)::int`,
    })
    .from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.walletId, walletId));
  const [positionStats] = await db
    .select({
      realizedPnlUsdCents: sql<number>`coalesce(sum(${walletTokenPositionsTable.realizedPnlUsdCents}), 0)::int`,
      buyVolumeUsdCents: sql<number>`coalesce(sum(${walletTokenPositionsTable.buyVolumeUsdCents}), 0)::int`,
      sellVolumeUsdCents: sql<number>`coalesce(sum(${walletTokenPositionsTable.sellVolumeUsdCents}), 0)::int`,
      buyCount: sql<number>`coalesce(sum(${walletTokenPositionsTable.buyCount}), 0)::int`,
      sellCount: sql<number>`coalesce(sum(${walletTokenPositionsTable.sellCount}), 0)::int`,
      winningSellCount: sql<number>`coalesce(sum(${walletTokenPositionsTable.winningSellCount}), 0)::int`,
    })
    .from(walletTokenPositionsTable)
    .where(eq(walletTokenPositionsTable.walletId, walletId));
  const tags: string[] = [];
  const txCount = Number(stats?.txCount ?? 0);
  const tx24h = Number(stats?.tx24h ?? 0);
  const volumeUsdCents = Number(stats?.volumeUsdCents ?? 0);
  const buyCount = Number(positionStats?.buyCount ?? 0);
  const sellCount = Number(positionStats?.sellCount ?? 0);
  const winningSellCount = Number(positionStats?.winningSellCount ?? 0);
  const realizedPnlUsdCents = Number(positionStats?.realizedPnlUsdCents ?? 0);
  const totalTradeVolumeUsdCents = Number(positionStats?.buyVolumeUsdCents ?? 0) + Number(positionStats?.sellVolumeUsdCents ?? 0);
  const winRate = sellCount > 0 ? winningSellCount / sellCount : null;

  if ((amountUsdCents ?? 0) >= 100_000_00 || volumeUsdCents >= 500_000_00) tags.push("whale");
  if (tx24h >= 25) tags.push("high-frequency");
  if (txCount <= 3 && textIncludes(item, ["first", "new wallet", "fresh wallet"])) tags.push("fresh wallet");
  if (textIncludes(item, ["deploy", "deployer", "contract creation", "created contract"])) tags.push("deployer");
  if (textIncludes(item, ["sniper", "sniped", "first buyer", "launch buy"])) tags.push("sniper");
  if (realizedPnlUsdCents > 0 && sellCount >= 2) tags.push("profit wallet");
  if (winRate !== null && winRate >= 0.6 && sellCount >= 5) tags.push("high win-rate");

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        20 +
          Math.min(25, txCount * 1.5) +
          Math.min(20, totalTradeVolumeUsdCents / 50_000_00) +
          (realizedPnlUsdCents > 0 ? Math.min(20, realizedPnlUsdCents / 10_000_00) : 0) +
          (winRate !== null ? winRate * 15 : 0),
      ),
    ),
  );
  const riskLevel =
    sellCount === 0 && buyCount > 0
      ? "unproven"
      : realizedPnlUsdCents > 0
        ? "profitable"
        : realizedPnlUsdCents < 0
          ? "drawdown"
          : txCount > 0
            ? "active"
            : null;

  return {
    tags: mergeTags(existingTags, tags),
    score,
    riskLevel,
  };
}

interface PositionUpdateResult {
  realizedPnlUsdCents: number | null;
  costBasisUsdCents: number | null;
  quantityBefore: string | null;
  quantityAfter: string | null;
}

async function applyPositionAccounting(
  walletId: string,
  chain: WalletTrackerChain,
  parsed: ParsedWalletActivity,
  occurredAt: Date,
): Promise<PositionUpdateResult> {
  if (!["buy", "sell"].includes(parsed.type)) {
    return { realizedPnlUsdCents: null, costBasisUsdCents: null, quantityBefore: null, quantityAfter: null };
  }

  const tokenAddress = tokenIdentity(chain, parsed.tokenAddress, parsed.tokenSymbol);
  const quantity = decimalNumber(parsed.tokenAmount);
  const amountUsdCents = parsed.amountUsdCents;

  if (!tokenAddress || quantity === null || quantity <= 0 || amountUsdCents === null) {
    return { realizedPnlUsdCents: null, costBasisUsdCents: null, quantityBefore: null, quantityAfter: null };
  }

  const { db, walletTokenPositionsTable } = await getDbModule();
  const [position] = await db
    .select()
    .from(walletTokenPositionsTable)
    .where(and(eq(walletTokenPositionsTable.walletId, walletId), eq(walletTokenPositionsTable.chain, chain), eq(walletTokenPositionsTable.tokenAddress, tokenAddress)))
    .limit(1);
  const beforeQty = decimalNumber(position?.quantity) ?? 0;
  const beforeCost = position?.costBasisUsdCents ?? 0;
  const now = new Date();
  let afterQty = beforeQty;
  let afterCost = beforeCost;
  let realizedPnlUsdCents: number | null = null;
  let costBasisUsdCents: number | null = amountUsdCents;
  const baseValues = {
    walletId,
    chain,
    tokenAddress,
    tokenSymbol: parsed.tokenSymbol,
    tokenName: parsed.tokenName,
    lastTradeAt: occurredAt,
    updatedAt: now,
  };

  if (parsed.type === "buy") {
    afterQty = beforeQty + quantity;
    afterCost = beforeCost + amountUsdCents;

    if (position) {
      await db
        .update(walletTokenPositionsTable)
        .set({
          ...baseValues,
          quantity: decimalDb(afterQty),
          costBasisUsdCents: afterCost,
          buyVolumeUsdCents: position.buyVolumeUsdCents + amountUsdCents,
          buyCount: position.buyCount + 1,
        })
        .where(eq(walletTokenPositionsTable.id, position.id));
    } else {
      await db.insert(walletTokenPositionsTable).values({
        ...baseValues,
        quantity: decimalDb(afterQty),
        costBasisUsdCents: afterCost,
        buyVolumeUsdCents: amountUsdCents,
        buyCount: 1,
      });
    }
  } else {
    const soldQty = Math.min(quantity, beforeQty);
    const costForSold = beforeQty > 0 ? Math.round(beforeCost * (soldQty / beforeQty)) : 0;
    realizedPnlUsdCents = beforeQty > 0 ? amountUsdCents - costForSold : null;
    costBasisUsdCents = beforeQty > 0 ? costForSold : null;
    afterQty = beforeQty > quantity ? beforeQty - quantity : 0;
    afterCost = beforeQty > quantity ? Math.max(0, beforeCost - costForSold) : 0;

    if (position) {
      await db
        .update(walletTokenPositionsTable)
        .set({
          ...baseValues,
          quantity: decimalDb(afterQty),
          costBasisUsdCents: afterCost,
          realizedPnlUsdCents: position.realizedPnlUsdCents + (realizedPnlUsdCents ?? 0),
          sellVolumeUsdCents: position.sellVolumeUsdCents + amountUsdCents,
          sellCount: position.sellCount + 1,
          winningSellCount: position.winningSellCount + (realizedPnlUsdCents !== null && realizedPnlUsdCents > 0 ? 1 : 0),
        })
        .where(eq(walletTokenPositionsTable.id, position.id));
    } else {
      await db.insert(walletTokenPositionsTable).values({
        ...baseValues,
        quantity: "0",
        costBasisUsdCents: 0,
        realizedPnlUsdCents: realizedPnlUsdCents ?? 0,
        sellVolumeUsdCents: amountUsdCents,
        sellCount: 1,
        winningSellCount: realizedPnlUsdCents !== null && realizedPnlUsdCents > 0 ? 1 : 0,
      });
    }
  }

  return {
    realizedPnlUsdCents,
    costBasisUsdCents,
    quantityBefore: decimalDb(beforeQty),
    quantityAfter: decimalDb(afterQty),
  };
}

function shortWallet(value: string): string {
  if (value.length <= 16) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function metadataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function metadataString(metadata: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return null;
}

function metadataNumber(metadata: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace(/[$,\s]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function walletBalanceFromMetadata(metadata: Record<string, unknown>) {
  const label = metadataString(metadata, [
    "balanceLabel",
    "nativeBalanceLabel",
    "portfolioValueLabel",
    "balance",
    "nativeBalance",
  ]);
  const balanceUsdCents =
    metadataNumber(metadata, ["balanceUsdCents", "portfolioValueUsdCents", "totalValueUsdCents"]) ??
    (() => {
      const usd = metadataNumber(metadata, ["balanceUsd", "portfolioValueUsd", "totalValueUsd"]);
      return usd === null ? null : Math.round(usd * 100);
    })();

  return {
    balanceLabel: label ? label.slice(0, 48) : null,
    balanceUsdCents,
  };
}

function walletAvgDurationFromMetadata(metadata: Record<string, unknown>) {
  const label = metadataString(metadata, ["avgDurationLabel", "avgHoldDurationLabel", "averageDurationLabel"]);
  const seconds = metadataNumber(metadata, [
    "avgDurationSeconds",
    "avgHoldDurationSeconds",
    "averageDurationSeconds",
    "avgHoldingSeconds",
  ]);

  return {
    avgDurationLabel: label ? label.slice(0, 48) : null,
    avgDurationSeconds: seconds === null ? null : Math.max(0, Math.round(seconds)),
  };
}

const HIDDEN_PUBLIC_WALLET_TAGS = new Set(["bundle-watch", "bundle-wallet", "bundle_wallet", "bundle wallet"]);

function publicWalletTags(
  existingTags: string[],
  buyCount: number,
  sellCount: number,
  transferCount: number,
  score: number | null,
): string[] {
  const next = existingTags.filter((tag) => !HIDDEN_PUBLIC_WALLET_TAGS.has(tag.trim().toLowerCase()));
  const tradeCount = buyCount + sellCount;

  if (tradeCount > 0) next.push("active trader");
  if (tradeCount >= 20 || transferCount >= 40) next.push("high-frequency");
  if (buyCount >= 5 && sellCount === 0) next.push("accumulator");
  if (sellCount >= 5 && buyCount === 0) next.push("distributor");
  if ((score ?? 0) >= 60) next.push("smart money");
  if (next.length === 0 && transferCount > 0) next.push("active wallet");

  return Array.from(new Set(next)).slice(0, 12);
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

export async function listPublicWalletTracker(userId?: string | null, requestedLimit = 100): Promise<PublicWalletTrackerSnapshot> {
  const {
    db,
    trackedWalletsTable,
    userTrackedWalletsTable,
    walletTransactionsTable,
  } = await getDbModule();
  const limit = Math.max(1, Math.min(200, Math.round(Number.isFinite(requestedLimit) ? requestedLimit : 100)));
  const queryLimit = Math.max(limit, Math.min(600, limit * 4));
  const wallets = await db
    .select()
    .from(trackedWalletsTable)
    .orderBy(sql`${trackedWalletsTable.lastActiveAt} desc nulls last`, desc(trackedWalletsTable.score), desc(trackedWalletsTable.updatedAt))
    .limit(queryLimit);

  if (wallets.length === 0) {
    return {
      wallets: [],
      total: 0,
      monitoring: monitoringStatus(),
      updatedAt: new Date().toISOString(),
    };
  }

  const walletIds = wallets.map((wallet) => wallet.id);
  const [transactionStatsRows, followerRows, userRows] = await Promise.all([
    db
      .select({
        walletId: walletTransactionsTable.walletId,
        buyCount: sql<number>`coalesce(sum(case when ${walletTransactionsTable.type} = 'buy' then 1 else 0 end), 0)::int`,
        sellCount: sql<number>`coalesce(sum(case when ${walletTransactionsTable.type} = 'sell' then 1 else 0 end), 0)::int`,
        transferCount: sql<number>`coalesce(sum(case when ${walletTransactionsTable.type} = 'transfer' then 1 else 0 end), 0)::int`,
        winningSellCount: sql<number>`coalesce(sum(case when ${walletTransactionsTable.realizedPnlUsdCents} > 0 then 1 else 0 end), 0)::int`,
        realizedPnlUsdCents: sql<number>`coalesce(sum(coalesce(${walletTransactionsTable.realizedPnlUsdCents}, 0)), 0)::int`,
        buyVolumeUsdCents: sql<number>`coalesce(sum(case when ${walletTransactionsTable.type} = 'buy' then coalesce(${walletTransactionsTable.amountUsdCents}, 0) else 0 end), 0)::int`,
        sellVolumeUsdCents: sql<number>`coalesce(sum(case when ${walletTransactionsTable.type} = 'sell' then coalesce(${walletTransactionsTable.amountUsdCents}, 0) else 0 end), 0)::int`,
        lastTradeAt: sql<Date | null>`max(${walletTransactionsTable.occurredAt})`,
      })
      .from(walletTransactionsTable)
      .where(inArray(walletTransactionsTable.walletId, walletIds))
      .groupBy(walletTransactionsTable.walletId),
    db
      .select({
        walletId: userTrackedWalletsTable.walletId,
        followerCount: sql<number>`count(*)::int`,
      })
      .from(userTrackedWalletsTable)
      .where(and(inArray(userTrackedWalletsTable.walletId, walletIds), eq(userTrackedWalletsTable.isActive, true)))
      .groupBy(userTrackedWalletsTable.walletId),
    userId
      ? db
          .select()
          .from(userTrackedWalletsTable)
          .where(
            and(
              eq(userTrackedWalletsTable.userId, userId),
              inArray(userTrackedWalletsTable.walletId, walletIds),
              eq(userTrackedWalletsTable.isActive, true),
            ),
          )
      : Promise.resolve([]),
  ]);
  const transactionStatsByWallet = new Map(transactionStatsRows.map((row) => [row.walletId, row]));
  const followerMap = new Map(followerRows.map((row) => [row.walletId, Number(row.followerCount ?? 0)]));
  const userSubscriptionMap = new Map(userRows.map((row) => [row.walletId, row]));

  const walletItems = wallets.flatMap((wallet) => {
    const transactionStats = transactionStatsByWallet.get(wallet.id);
    const buyCount = Number(transactionStats?.buyCount ?? 0);
    const sellCount = Number(transactionStats?.sellCount ?? 0);
    const transferCount = Number(transactionStats?.transferCount ?? 0);
    const winningSellCount = Number(transactionStats?.winningSellCount ?? 0);
    const realizedPnlUsdCents = Number(transactionStats?.realizedPnlUsdCents ?? 0);
    const buyVolumeUsdCents = Number(transactionStats?.buyVolumeUsdCents ?? 0);
    const sellVolumeUsdCents = Number(transactionStats?.sellVolumeUsdCents ?? 0);
    const lastTradeAt = transactionStats?.lastTradeAt ?? wallet.lastActiveAt ?? null;
    const metadata = metadataRecord(wallet.metadata);
    const balance = walletBalanceFromMetadata(metadata);
    const avgDuration = walletAvgDurationFromMetadata(metadata);
    const subscription = userSubscriptionMap.get(wallet.id);
    const isUnbackfilledBundleSystemWallet =
      wallet.source === "bundle_detection" && !subscription && buyCount + sellCount + transferCount === 0;

    if (isUnbackfilledBundleSystemWallet) return [];

    return [{
      id: wallet.id,
      chain: wallet.chain,
      address: wallet.address,
      label: wallet.label,
      source: wallet.source,
      score: wallet.score,
      riskLevel: wallet.riskLevel,
      tags: publicWalletTags(wallet.tags, buyCount, sellCount, transferCount, wallet.score),
      balanceLabel: balance.balanceLabel,
      balanceUsdCents: balance.balanceUsdCents,
      avgDurationSeconds: avgDuration.avgDurationSeconds,
      avgDurationLabel: avgDuration.avgDurationLabel,
      followerCount: followerMap.get(wallet.id) ?? 0,
      followed: Boolean(subscription),
      subscriptionId: subscription?.id ?? null,
      firstSeenAt: toIsoString(wallet.firstSeenAt) ?? new Date().toISOString(),
      lastActiveAt: toIsoString(wallet.lastActiveAt ?? lastTradeAt),
      updatedAt: toIsoString(wallet.updatedAt) ?? new Date().toISOString(),
      performance: {
        buyCount,
        sellCount,
        winningSellCount,
        winRate: sellCount > 0 ? Math.round((winningSellCount / sellCount) * 1000) / 10 : null,
        realizedPnlUsdCents,
        buyVolumeUsdCents,
        sellVolumeUsdCents,
        openPositions: 0,
        lastTradeAt: toIsoString(lastTradeAt),
      },
    }];
  });
  walletItems.sort((a, b) => {
    const bTrades = b.performance.buyCount + b.performance.sellCount;
    const aTrades = a.performance.buyCount + a.performance.sellCount;
    if (bTrades !== aTrades) return bTrades - aTrades;
    if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
    return new Date(b.lastActiveAt ?? b.updatedAt).getTime() - new Date(a.lastActiveAt ?? a.updatedAt).getTime();
  });
  const visibleWalletItems = walletItems.slice(0, limit);

  return {
    wallets: visibleWalletItems,
    total: visibleWalletItems.length,
    monitoring: monitoringStatus(),
    updatedAt: new Date().toISOString(),
  };
}

export async function listWalletTracker(userId: string): Promise<WalletTrackerSnapshot> {
  const { db, trackedWalletsTable, userTrackedWalletsTable, walletTokenPositionsTable, walletTransactionsTable } = await getDbModule();
  const subscriptions = await db
    .select()
    .from(userTrackedWalletsTable)
    .where(and(eq(userTrackedWalletsTable.userId, userId), eq(userTrackedWalletsTable.isActive, true)))
    .orderBy(desc(userTrackedWalletsTable.updatedAt));

  if (subscriptions.length === 0) {
    return {
      wallets: [],
      total: 0,
      monitoring: monitoringStatus(),
      updatedAt: new Date().toISOString(),
    };
  }

  const walletIds = subscriptions.map((subscription) => subscription.walletId);
  const wallets = await db.select().from(trackedWalletsTable).where(inArray(trackedWalletsTable.id, walletIds));
  const walletMap = new Map(wallets.map((wallet) => [wallet.id, wallet]));
  const transactions = await db
    .select()
    .from(walletTransactionsTable)
    .where(inArray(walletTransactionsTable.walletId, walletIds))
    .orderBy(desc(walletTransactionsTable.occurredAt))
    .limit(80);
  const positions = await db
    .select()
    .from(walletTokenPositionsTable)
    .where(inArray(walletTokenPositionsTable.walletId, walletIds));
  const transactionsByWallet = new Map<string, typeof transactions>();
  const positionsByWallet = new Map<string, typeof positions>();

  for (const transaction of transactions) {
    const current = transactionsByWallet.get(transaction.walletId) ?? [];
    if (current.length < 5) current.push(transaction);
    transactionsByWallet.set(transaction.walletId, current);
  }

  for (const position of positions) {
    const current = positionsByWallet.get(position.walletId) ?? [];
    current.push(position);
    positionsByWallet.set(position.walletId, current);
  }

  const walletItems: WalletTrackerItem[] = [];

  for (const subscription of subscriptions) {
    const wallet = walletMap.get(subscription.walletId);
    if (!wallet) continue;
    const walletPositions = positionsByWallet.get(wallet.id) ?? [];
    const buyCount = walletPositions.reduce((sum, position) => sum + position.buyCount, 0);
    const sellCount = walletPositions.reduce((sum, position) => sum + position.sellCount, 0);
    const winningSellCount = walletPositions.reduce((sum, position) => sum + position.winningSellCount, 0);
    const lastTradeAt =
      walletPositions
        .map((position) => position.lastTradeAt)
        .filter((value): value is Date => value instanceof Date)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    walletItems.push({
      id: subscription.id,
      walletId: wallet.id,
      chain: wallet.chain,
      address: wallet.address,
      label: subscription.label ?? wallet.label,
      alertMode: subscription.alertMode,
      telegramEnabled: subscription.telegramEnabled,
      browserEnabled: subscription.browserEnabled,
      minUsdCents: subscription.minUsdCents,
      alertTypes: subscription.alertTypes,
      source: wallet.source,
      score: wallet.score,
      riskLevel: wallet.riskLevel,
      tags: wallet.tags,
      firstSeenAt: toIsoString(wallet.firstSeenAt) ?? new Date().toISOString(),
      lastActiveAt: toIsoString(wallet.lastActiveAt),
      createdAt: toIsoString(subscription.createdAt) ?? new Date().toISOString(),
      updatedAt: toIsoString(subscription.updatedAt) ?? new Date().toISOString(),
      latestTransactions: (transactionsByWallet.get(wallet.id) ?? []).map((transaction) => ({
        id: transaction.id,
        signature: transaction.signature,
        type: transaction.type,
        tokenSymbol: transaction.tokenSymbol,
        tokenName: transaction.tokenName,
        tokenAddress: transaction.tokenAddress,
        tokenAmount: transaction.tokenAmount,
        amountUsdCents: transaction.amountUsdCents,
        tradeConfidence: transaction.tradeConfidence,
        realizedPnlUsdCents: transaction.realizedPnlUsdCents,
        costBasisUsdCents: transaction.costBasisUsdCents,
        counterparty: transaction.counterparty,
        dex: transaction.dex,
        programId: transaction.programId,
        occurredAt: toIsoString(transaction.occurredAt) ?? new Date().toISOString(),
      })),
      performance: {
        buyCount,
        sellCount,
        winningSellCount,
        winRate: sellCount > 0 ? Math.round((winningSellCount / sellCount) * 1000) / 10 : null,
        realizedPnlUsdCents: walletPositions.reduce((sum, position) => sum + position.realizedPnlUsdCents, 0),
        buyVolumeUsdCents: walletPositions.reduce((sum, position) => sum + position.buyVolumeUsdCents, 0),
        sellVolumeUsdCents: walletPositions.reduce((sum, position) => sum + position.sellVolumeUsdCents, 0),
        openPositions: walletPositions.filter((position) => Math.abs(decimalNumber(position.quantity) ?? 0) > 0.000000000001).length,
        lastTradeAt: toIsoString(lastTradeAt),
      },
    });
  }

  return {
    wallets: walletItems,
    total: subscriptions.length,
    monitoring: monitoringStatus(),
    updatedAt: new Date().toISOString(),
  };
}

export async function addTrackedWallet(userId: string, input: AddTrackedWalletInput): Promise<WalletTrackerItem> {
  const { db, trackedWalletsTable, userTrackedWalletsTable } = await getDbModule();
  const current = await listWalletTracker(userId);

  if (current.total >= TRACKED_WALLET_LIMIT) {
    throw new Error(`Wallet tracker limit reached (${TRACKED_WALLET_LIMIT}).`);
  }

  const normalized = normalizeWallet(input.chain, input.address);
  const now = new Date();
  const label = normalizeLabel(input.label);
  const alertTypes = normalizeAlertTypes(input.alertTypes);
  const minUsdCents = normalizeMinUsdCents(input.minUsdCents);
  const walletRows = await db
    .insert(trackedWalletsTable)
    .values({
      chain: input.chain,
      address: normalized.address,
      addressNormalized: normalized.normalized,
      label,
      source: "user",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [trackedWalletsTable.chain, trackedWalletsTable.addressNormalized],
      set: {
        address: normalized.address,
        label,
        updatedAt: now,
      },
    })
    .returning();
  const wallet = walletRows[0];

  if (!wallet) {
    throw new Error("Tracked wallet could not be saved.");
  }

  const subscriptionRows = await db
    .insert(userTrackedWalletsTable)
    .values({
      userId,
      walletId: wallet.id,
      label,
      alertMode: input.alertMode ?? "alerts_only",
      telegramEnabled: input.telegramEnabled ?? true,
      browserEnabled: input.browserEnabled ?? true,
      minUsdCents,
      alertTypes,
      isActive: true,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userTrackedWalletsTable.userId, userTrackedWalletsTable.walletId],
      set: {
        label,
        alertMode: input.alertMode ?? "alerts_only",
        telegramEnabled: input.telegramEnabled ?? true,
        browserEnabled: input.browserEnabled ?? true,
        minUsdCents,
        alertTypes,
        isActive: true,
        updatedAt: now,
      },
    })
    .returning();
  const subscription = subscriptionRows[0];

  if (!subscription) {
    throw new Error("Tracked wallet subscription could not be saved.");
  }

  await awardFirstWalletTracked(userId, wallet.id);
  scheduleProviderWebhookSync(input.chain, "wallet_added");

  const snapshot = await listWalletTracker(userId);
  const item = snapshot.wallets.find((entry) => entry.id === subscription.id);

  if (!item) {
    throw new Error("Tracked wallet could not be loaded after save.");
  }

  return item;
}

export async function removeTrackedWallet(userId: string, subscriptionId: string): Promise<boolean> {
  const { db, trackedWalletsTable, userTrackedWalletsTable } = await getDbModule();
  const existingRows = await db
    .select({
      subscription: userTrackedWalletsTable,
      wallet: trackedWalletsTable,
    })
    .from(userTrackedWalletsTable)
    .innerJoin(trackedWalletsTable, eq(userTrackedWalletsTable.walletId, trackedWalletsTable.id))
    .where(and(eq(userTrackedWalletsTable.userId, userId), eq(userTrackedWalletsTable.id, subscriptionId)))
    .limit(1);
  const existing = existingRows[0];
  if (!existing) return false;

  const rows = await db
    .update(userTrackedWalletsTable)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(and(eq(userTrackedWalletsTable.userId, userId), eq(userTrackedWalletsTable.id, subscriptionId)))
    .returning();

  if (rows.length > 0) {
    scheduleProviderWebhookSync(existing.wallet.chain, "wallet_removed");
    return true;
  }

  return false;
}

export async function updateTrackedWallet(
  userId: string,
  subscriptionId: string,
  input: UpdateTrackedWalletInput,
): Promise<WalletTrackerItem> {
  const { db, userTrackedWalletsTable } = await getDbModule();
  const updates: Partial<typeof userTrackedWalletsTable.$inferInsert> = {
    updatedAt: new Date(),
  };

  if ("label" in input) updates.label = normalizeLabel(input.label);
  if (input.alertMode) updates.alertMode = input.alertMode;
  if (typeof input.telegramEnabled === "boolean") updates.telegramEnabled = input.telegramEnabled;
  if (typeof input.browserEnabled === "boolean") updates.browserEnabled = input.browserEnabled;
  if (typeof input.minUsdCents === "number") updates.minUsdCents = normalizeMinUsdCents(input.minUsdCents);
  if (input.alertTypes) updates.alertTypes = normalizeAlertTypes(input.alertTypes);

  const rows = await db
    .update(userTrackedWalletsTable)
    .set(updates)
    .where(and(eq(userTrackedWalletsTable.userId, userId), eq(userTrackedWalletsTable.id, subscriptionId), eq(userTrackedWalletsTable.isActive, true)))
    .returning();

  const subscription = rows[0];
  if (!subscription) throw new Error("Tracked wallet subscription was not found.");

  const snapshot = await listWalletTracker(userId);
  const item = snapshot.wallets.find((entry) => entry.id === subscription.id);
  if (!item) throw new Error("Tracked wallet could not be loaded after update.");

  scheduleProviderWebhookSync(item.chain, "wallet_updated");

  return item;
}

export async function ingestWalletWebhook(
  provider: WalletWebhookProvider,
  chain: WalletTrackerChain,
  payload: unknown,
  options: { signatureVerified?: boolean; providerDeliveryId?: string | null } = {},
): Promise<WalletWebhookIngestResult> {
  const {
    db,
    trackedWalletsTable,
    userTrackedWalletsTable,
    walletAlertLogTable,
    walletTransactionsTable,
    walletWebhookEventsTable,
  } = await getDbModule();
  const items = payloadItemsForProvider(provider, chain, payload);
  const result: WalletWebhookIngestResult = {
    provider,
    chain,
    received: items.length,
    duplicates: 0,
    matchedWallets: 0,
    insertedTransactions: 0,
    notificationsCreated: 0,
    telegramMessagesSent: 0,
    skippedMutedSubscriptions: 0,
    skippedPreferenceSubscriptions: 0,
    eventIds: [],
    updatedAt: new Date().toISOString(),
  };

  for (const item of items) {
    const eventId = eventIdForItem(provider, chain, item);
    result.eventIds.push(eventId);

    const candidateAddresses = extractCandidateAddresses(chain, item);
    const matchedWallets =
      candidateAddresses.length > 0
        ? await db
            .select()
            .from(trackedWalletsTable)
            .where(and(eq(trackedWalletsTable.chain, chain), inArray(trackedWalletsTable.addressNormalized, candidateAddresses)))
        : [];

    const eventRows = await db
      .insert(walletWebhookEventsTable)
      .values({
        provider,
        eventId,
        chain,
        matchedWalletCount: matchedWallets.length,
        signatureVerified: options.signatureVerified ?? false,
        providerDeliveryId: options.providerDeliveryId ?? null,
        payload: metadataFromPayload(provider, item, candidateAddresses),
      })
      .onConflictDoNothing()
      .returning();

    if (!eventRows[0]) {
      result.duplicates += 1;
      continue;
    }

    if (matchedWallets.length === 0) continue;

    result.matchedWallets += matchedWallets.length;
    const walletIds = matchedWallets.map((wallet) => wallet.id);
    const subscriptions = await db
      .select()
      .from(userTrackedWalletsTable)
      .where(and(inArray(userTrackedWalletsTable.walletId, walletIds), eq(userTrackedWalletsTable.isActive, true)));
    const subscriptionsByWallet = new Map<string, typeof subscriptions>();

    for (const subscription of subscriptions) {
      const current = subscriptionsByWallet.get(subscription.walletId) ?? [];
      current.push(subscription);
      subscriptionsByWallet.set(subscription.walletId, current);
    }

    const baseSignature =
      findFirstString(item, ["signature", "transactionSignature", "transactionHash", "txHash", "hash"]) ?? eventId;
    const signature =
      provider === "alchemy"
        ? `${baseSignature}:${safeJsonHash([
            findFirstString(item, ["from", "fromAddress"]) ?? "",
            findFirstString(item, ["to", "toAddress"]) ?? "",
            findFirstString(item, ["asset", "tokenSymbol"]) ?? "",
            findFirstString(item, ["value", "rawAmount", "tokenId"]) ?? "",
          ]).slice(0, 12)}`
        : baseSignature;
    const occurredAt = dateFromPayload(item);

    for (const wallet of matchedWallets) {
      const parsed = parseWalletActivity(item, chain, wallet.addressNormalized, candidateAddresses);
      const transactionRows = await db
        .insert(walletTransactionsTable)
        .values({
          walletId: wallet.id,
          chain,
          signature,
          type: parsed.type,
          tokenAddress: tokenIdentity(chain, parsed.tokenAddress, parsed.tokenSymbol) ?? parsed.tokenAddress,
          tokenSymbol: parsed.tokenSymbol,
          tokenName: parsed.tokenName,
          amountRaw: parsed.amountRaw,
          tokenAmount: parsed.tokenAmount,
          amountUsdCents: parsed.amountUsdCents,
          usdValueSource: parsed.usdValueSource,
          tradeConfidence: parsed.tradeConfidence,
          counterparty: parsed.counterparty,
          dex: parsed.dex,
          programId: parsed.programId,
          blockRef: parsed.blockRef,
          metadata: metadataFromPayload(provider, item, candidateAddresses),
          occurredAt,
        })
        .onConflictDoNothing()
        .returning();
      const transaction = transactionRows[0];

      if (!transaction) continue;

      result.insertedTransactions += 1;

      const position = await applyPositionAccounting(wallet.id, chain, parsed, occurredAt);
      const nextIntelligence = await deriveWalletIntelligence(wallet.id, wallet.tags, item, parsed.amountUsdCents);

      if (
        position.realizedPnlUsdCents !== null ||
        position.costBasisUsdCents !== null ||
        position.quantityBefore !== null ||
        position.quantityAfter !== null
      ) {
        await db
          .update(walletTransactionsTable)
          .set({
            realizedPnlUsdCents: position.realizedPnlUsdCents,
            costBasisUsdCents: position.costBasisUsdCents,
            positionQuantityBefore: position.quantityBefore,
            positionQuantityAfter: position.quantityAfter,
          })
          .where(eq(walletTransactionsTable.id, transaction.id));
      }

      await db
        .update(trackedWalletsTable)
        .set({
          tags: nextIntelligence.tags,
          score: nextIntelligence.score,
          riskLevel: nextIntelligence.riskLevel,
          lastActiveAt: occurredAt,
          updatedAt: new Date(),
        })
        .where(eq(trackedWalletsTable.id, wallet.id));

      const walletSubscriptions = subscriptionsByWallet.get(wallet.id) ?? [];

      for (const subscription of walletSubscriptions) {
        const preference = shouldNotifySubscription(
          {
            alertMode: subscription.alertMode,
            alertTypes: subscription.alertTypes,
            minUsdCents: subscription.minUsdCents,
          },
          parsed.type,
          parsed.amountUsdCents,
        );

        if (!preference.ok) {
          if (subscription.alertMode === "muted") result.skippedMutedSubscriptions += 1;
          else result.skippedPreferenceSubscriptions += 1;
          await db.insert(walletAlertLogTable).values({
            userId: subscription.userId,
            walletId: wallet.id,
            transactionId: transaction.id,
            channel: "browser",
            status: "skipped",
            error: preference.reason,
          });
          continue;
        }

        const body = formatWalletAlertBody(chain, wallet.address, parsed, signature);
        if (subscription.browserEnabled) {
          await createUserNotification(subscription.userId, {
            kind: "wallet_alert",
            title: "Wallet activity",
            body,
            payload: {
              provider,
              chain,
              walletId: wallet.id,
              transactionId: transaction.id,
              signature,
              type: parsed.type,
              tokenAddress: tokenIdentity(chain, parsed.tokenAddress, parsed.tokenSymbol) ?? parsed.tokenAddress,
              tokenSymbol: parsed.tokenSymbol,
              tokenAmount: parsed.tokenAmount,
              amountUsdCents: parsed.amountUsdCents,
              tradeConfidence: parsed.tradeConfidence,
              realizedPnlUsdCents: position.realizedPnlUsdCents,
              counterparty: parsed.counterparty,
              dex: parsed.dex,
              programId: parsed.programId,
            },
          });
          result.notificationsCreated += 1;

          await db.insert(walletAlertLogTable).values({
            userId: subscription.userId,
            walletId: wallet.id,
            transactionId: transaction.id,
            channel: "browser",
            status: "sent",
            sentAt: new Date(),
          });
        } else {
          await db.insert(walletAlertLogTable).values({
            userId: subscription.userId,
            walletId: wallet.id,
            transactionId: transaction.id,
            channel: "browser",
            status: "skipped",
            error: "Browser alerts are disabled for this wallet.",
          });
        }

        await awardPoints(subscription.userId, {
          action: "wallet_alert_received",
          basePoints: 25,
          source: "wallet_tracker",
          relatedEntityId: transaction.id,
          idempotencyKey: `wallet-alert:${subscription.userId}:${transaction.id}`,
          dailyLimit: 20,
        });

        if (!subscription.telegramEnabled) continue;

        const chats = await telegramChatsForUser(subscription.userId);
        if (chats.length === 0) {
          await db.insert(walletAlertLogTable).values({
            userId: subscription.userId,
            walletId: wallet.id,
            transactionId: transaction.id,
            channel: "telegram",
            status: "skipped",
            error: "No linked Telegram chat.",
          });
          continue;
        }

        for (const chatId of chats) {
          try {
            await publishTelegramMessage(["AnyAlpha wallet alert", "", body].join("\n"), { chatId });
            result.telegramMessagesSent += 1;
            await db.insert(walletAlertLogTable).values({
              userId: subscription.userId,
              walletId: wallet.id,
              transactionId: transaction.id,
              channel: "telegram",
              status: "sent",
              sentAt: new Date(),
            });
          } catch (err) {
            await db.insert(walletAlertLogTable).values({
              userId: subscription.userId,
              walletId: wallet.id,
              transactionId: transaction.id,
              channel: "telegram",
              status: "failed",
              error: err instanceof Error ? err.message.slice(0, 500) : "Telegram alert failed.",
            });
          }
        }
      }
    }
  }

  return {
    ...result,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeBackfillLimit(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 50;
  return Math.max(1, Math.min(100, Math.round(value)));
}

function normalizeDiscoveryLimit(value: number | null | undefined, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.round(value)));
}

function parsePublicDiscoveryChains(value: PublicWalletDiscoveryChain[] | string | null | undefined): PublicWalletDiscoveryChain[] {
  const allowed = new Set<PublicWalletDiscoveryChain>(["solana", "base", "ethereum"]);
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",").map((item) => item.trim().toLowerCase())
      : ["solana", "base", "ethereum"];
  const chains = raw.filter((item): item is PublicWalletDiscoveryChain => allowed.has(item as PublicWalletDiscoveryChain));
  return Array.from(new Set(chains.length > 0 ? chains : ["solana", "base", "ethereum"]));
}

function attachBackfillContext(item: unknown, walletAddress: string): WalletTrackerMetadata {
  return {
    ...(isRecord(item) ? item : { value: item }),
    anyalphaBackfillAddress: walletAddress,
    anyalphaBackfill: true,
  };
}

async function fetchHeliusWalletHistory(address: string, limit: number): Promise<unknown[]> {
  const apiKey = process.env["HELIUS_API_KEY"]?.trim();
  if (!apiKey) throw new Error("HELIUS_API_KEY is required to sync Solana wallet history.");

  const url = new URL(`https://api-mainnet.helius-rpc.com/v0/addresses/${encodeURIComponent(address)}/transactions`);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = isRecord(payload) && typeof payload["message"] === "string" ? payload["message"] : response.statusText;
    throw new Error(`Helius history sync failed (${response.status}): ${message}`);
  }

  if (Array.isArray(payload)) return payload;
  if (isRecord(payload) && Array.isArray(payload["transactions"])) return payload["transactions"];
  if (isRecord(payload) && Array.isArray(payload["data"])) return payload["data"];
  return [];
}

function solanaRpcUrl(): string {
  const configured = process.env["SOLANA_RPC_URL"]?.trim();
  if (configured) return configured;

  const heliusKey = process.env["HELIUS_API_KEY"]?.trim();
  if (heliusKey) return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(heliusKey)}`;

  throw new Error("SOLANA_RPC_URL or HELIUS_API_KEY is required for Solana public wallet discovery.");
}

async function rpcRequest(url: string, method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...rpcAuthHeaders(url),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `anyalpha-${method}-${Date.now()}`,
      method,
      params,
    }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || (isRecord(payload) && isRecord(payload["error"]))) {
    const error = isRecord(payload) && isRecord(payload["error"]) ? payload["error"] : null;
    const message = error && typeof error["message"] === "string" ? error["message"] : response.statusText;
    throw new Error(`${method} failed (${response.status}): ${message}`);
  }

  return isRecord(payload) ? payload["result"] : null;
}

function envList(key: string, fallback: string[]): string[] {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function solanaDiscoveryProgramIds(): string[] {
  return envList("WALLET_DISCOVERY_SOLANA_PROGRAM_IDS", [
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
    "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB",
    "675kPX9MHTjS2zt1qfr1NYM1T2uSR6Mp8hzZHc4k6oyg",
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
  ]).filter((value) => SOLANA_ADDRESS_RE.test(value));
}

function extractSolanaSigner(transaction: unknown): string | null {
  const message = nestedValue(transaction, ["transaction", "message"]);
  const accountKeys = isRecord(message) && Array.isArray(message["accountKeys"]) ? message["accountKeys"] : [];

  for (const key of accountKeys) {
    if (typeof key === "string") {
      if (SOLANA_ADDRESS_RE.test(key)) return key;
      continue;
    }

    if (!isRecord(key)) continue;
    const pubkey = typeof key["pubkey"] === "string" ? key["pubkey"] : null;
    const signer = key["signer"] === true;
    const writable = key["writable"] !== false;
    if (pubkey && signer && writable && SOLANA_ADDRESS_RE.test(pubkey)) return pubkey;
  }

  return null;
}

async function discoverSolanaPublicWalletAddresses(signatureLimit: number, maxWallets: number): Promise<string[]> {
  const rpcUrl = solanaRpcUrl();
  const signatures = new Set<string>();

  for (const programId of solanaDiscoveryProgramIds()) {
    const result = await rpcRequest(rpcUrl, "getSignaturesForAddress", [
      programId,
      {
        limit: signatureLimit,
      },
    ]);
    const rows = Array.isArray(result) ? result : [];

    for (const row of rows) {
      if (!isRecord(row)) continue;
      if (row["err"]) continue;
      const signature = typeof row["signature"] === "string" ? row["signature"] : null;
      if (signature) signatures.add(signature);
      if (signatures.size >= signatureLimit * solanaDiscoveryProgramIds().length) break;
    }
  }

  const wallets = new Set<string>();

  for (const signature of signatures) {
    if (wallets.size >= maxWallets) break;

    const transaction = await rpcRequest(rpcUrl, "getTransaction", [
      signature,
      {
        encoding: "jsonParsed",
        maxSupportedTransactionVersion: 0,
      },
    ]).catch(() => null);
    if (!transaction || nestedValue(transaction, ["meta", "err"])) continue;

    const signer = extractSolanaSigner(transaction);
    if (signer) wallets.add(signer);
  }

  return Array.from(wallets).slice(0, maxWallets);
}

function alchemyRpcUrl(chain: WalletTrackerChain): string {
  if (alchemyDisabled()) throw new Error("Alchemy is disabled for EVM wallet history sync.");
  const apiKey = process.env["ALCHEMY_API_KEY"]?.trim();
  if (!apiKey) throw new Error("ALCHEMY_API_KEY is required to sync EVM wallet history.");

  switch (chain) {
    case "ethereum":
      return `https://eth-mainnet.g.alchemy.com/v2/${encodeURIComponent(apiKey)}`;
    case "base":
      return `https://base-mainnet.g.alchemy.com/v2/${encodeURIComponent(apiKey)}`;
    case "arbitrum":
      return `https://arb-mainnet.g.alchemy.com/v2/${encodeURIComponent(apiKey)}`;
    case "bsc":
      return `https://bnb-mainnet.g.alchemy.com/v2/${encodeURIComponent(apiKey)}`;
    case "polygon":
      return `https://polygon-mainnet.g.alchemy.com/v2/${encodeURIComponent(apiKey)}`;
    case "optimism":
      return `https://opt-mainnet.g.alchemy.com/v2/${encodeURIComponent(apiKey)}`;
    case "solana":
      throw new Error("Use Helius for Solana wallet history.");
    case "sui":
    case "aptos":
      throw new Error(`${chain === "sui" ? "Sui" : "Aptos"} wallet history sync requires a Move-chain provider integration.`);
    default:
      return `https://eth-mainnet.g.alchemy.com/v2/${encodeURIComponent(apiKey)}`;
  }
}

function evmRpcUrlForDiscovery(chain: PublicWalletDiscoveryChain): string {
  if (chain === "base") {
    const configured = process.env["BASE_RPC_URL"]?.trim();
    if (configured) return configured;
  }

  if (chain === "ethereum") {
    const configured = process.env["ETHEREUM_RPC_URL"]?.trim();
    if (configured) return configured;
  }

  const infura = infuraRpcUrl(chain);
  if (infura) return infura;

  return alchemyRpcUrl(chain);
}

function evmDexRouterAddresses(chain: PublicWalletDiscoveryChain): Set<string> {
  if (chain === "base") {
    return new Set(
      envList("WALLET_DISCOVERY_BASE_ROUTER_ADDRESSES", [
        "0xcF77a3Ba9A5CA399B7c97c74d54e5bE8cE1fE8F",
        "0x6fF5693b99212Da76ad316178A184AB56D299b43",
      ]).map((item) => item.toLowerCase()),
    );
  }

  return new Set(
    envList("WALLET_DISCOVERY_ETHEREUM_ROUTER_ADDRESSES", [
      "0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B",
      "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
    ]).map((item) => item.toLowerCase()),
  );
}

function hexNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = value.startsWith("0x") ? Number.parseInt(value, 16) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function discoverEvmPublicWalletAddresses(
  chain: PublicWalletDiscoveryChain,
  blockLookback: number,
  maxWallets: number,
): Promise<string[]> {
  const rpcUrl = evmRpcUrlForDiscovery(chain);
  const latest = hexNumber(await rpcRequest(rpcUrl, "eth_blockNumber", []));
  if (latest === null) throw new Error(`Could not read latest ${chain} block.`);

  const routers = evmDexRouterAddresses(chain);
  const wallets = new Set<string>();
  const firstBlock = Math.max(0, latest - blockLookback + 1);

  for (let block = latest; block >= firstBlock; block -= 1) {
    if (wallets.size >= maxWallets) break;

    const result = await rpcRequest(rpcUrl, "eth_getBlockByNumber", [`0x${block.toString(16)}`, true]).catch(() => null);
    const transactions = isRecord(result) && Array.isArray(result["transactions"]) ? result["transactions"] : [];

    for (const tx of transactions) {
      if (!isRecord(tx)) continue;
      const from = typeof tx["from"] === "string" ? tx["from"].toLowerCase() : null;
      const to = typeof tx["to"] === "string" ? tx["to"].toLowerCase() : null;
      if (!from || !to || !EVM_ADDRESS_RE.test(from)) continue;
      if (!routers.has(to)) continue;
      wallets.add(from);
      if (wallets.size >= maxWallets) break;
    }
  }

  return Array.from(wallets).slice(0, maxWallets);
}

async function fetchAlchemyTransfers(chain: WalletTrackerChain, address: string, direction: "from" | "to", limit: number): Promise<unknown[]> {
  const params: Record<string, unknown> = {
    fromBlock: "0x0",
    toBlock: "latest",
    category: ["external", "internal", "erc20", "erc721", "erc1155"],
    withMetadata: true,
    excludeZeroValue: true,
    order: "desc",
    maxCount: `0x${limit.toString(16)}`,
  };

  if (direction === "from") params["fromAddress"] = address;
  else params["toAddress"] = address;

  const response = await fetch(alchemyRpcUrl(chain), {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `anyalpha-${direction}-${Date.now()}`,
      method: "alchemy_getAssetTransfers",
      params: [params],
    }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || (isRecord(payload) && isRecord(payload["error"]))) {
    const error = isRecord(payload) && isRecord(payload["error"]) ? payload["error"] : null;
    const message = error && typeof error["message"] === "string" ? error["message"] : response.statusText;
    throw new Error(`Alchemy history sync failed (${response.status}): ${message}`);
  }

  const result = isRecord(payload) && isRecord(payload["result"]) ? payload["result"] : null;
  return result && Array.isArray(result["transfers"]) ? result["transfers"] : [];
}

async function fetchAlchemyWalletHistory(chain: WalletTrackerChain, address: string, limit: number): Promise<unknown[]> {
  if (alchemyDisabled()) return [];

  const [outgoing, incoming] = await Promise.all([
    fetchAlchemyTransfers(chain, address, "from", limit),
    fetchAlchemyTransfers(chain, address, "to", limit),
  ]);
  const seen = new Set<string>();
  const merged: unknown[] = [];

  for (const item of [...outgoing, ...incoming]) {
    const key = [
      findFirstString(item, ["hash", "transactionHash", "txHash"]) ?? safeJsonHash(item),
      findFirstString(item, ["from", "fromAddress"]) ?? "",
      findFirstString(item, ["to", "toAddress"]) ?? "",
      findFirstString(item, ["asset", "tokenSymbol"]) ?? "",
      findFirstString(item, ["value", "rawAmount"]) ?? "",
    ].join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged
    .sort((a, b) => dateFromPayload(b).getTime() - dateFromPayload(a).getTime())
    .slice(0, limit);
}

async function upsertPublicIndexedWallet(chain: PublicWalletDiscoveryChain, address: string, metadata: WalletTrackerMetadata) {
  const { db, trackedWalletsTable } = await getDbModule();
  const normalized = normalizeWallet(chain, address);
  const now = new Date();
  const [existing] = await db
    .select({ id: trackedWalletsTable.id })
    .from(trackedWalletsTable)
    .where(and(eq(trackedWalletsTable.chain, chain), eq(trackedWalletsTable.addressNormalized, normalized.normalized)))
    .limit(1);
  const rows = await db
    .insert(trackedWalletsTable)
    .values({
      chain,
      address: normalized.address,
      addressNormalized: normalized.normalized,
      source: "public_indexer",
      metadata,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [trackedWalletsTable.chain, trackedWalletsTable.addressNormalized],
      set: {
        address: normalized.address,
        source: "public_indexer",
        metadata: sql`${trackedWalletsTable.metadata} || ${JSON.stringify(metadata)}::jsonb`,
        updatedAt: now,
      },
    })
    .returning();
  const wallet = rows[0];

  if (!wallet) {
    throw new Error(`Public ${chain} wallet could not be indexed.`);
  }

  return {
    wallet,
    created: !existing,
  };
}

async function backfillPublicIndexedWallet(chain: PublicWalletDiscoveryChain, address: string, limit: number) {
  const provider = liveProviderForChain(chain);
  if (!provider) throw new Error(`${chain} public wallet backfill requires a live provider integration.`);
  const providerItems =
    provider === "helius"
      ? await fetchHeliusWalletHistory(address, limit)
      : await fetchAlchemyWalletHistory(chain, address, limit);
  const payload = providerItems.map((item) => attachBackfillContext(item, address));
  const ingest = await ingestWalletWebhook(provider, chain, payload, {
    signatureVerified: true,
    providerDeliveryId: `public-discovery:${chain}:${safeJsonHash([address, Date.now()]).slice(0, 16)}`,
  });

  return {
    ...ingest,
    received: providerItems.length,
  };
}

export async function discoverPublicWallets(input: PublicWalletDiscoveryInput = {}): Promise<PublicWalletDiscoveryResult> {
  const chains = parsePublicDiscoveryChains(input.chains);
  const maxWalletsPerChain = normalizeDiscoveryLimit(
    input.maxWalletsPerChain ?? Number(process.env["WALLET_DISCOVERY_MAX_WALLETS_PER_CHAIN"] ?? 12),
    12,
    50,
  );
  const backfillLimit = normalizeDiscoveryLimit(
    input.backfillLimit ?? Number(process.env["WALLET_DISCOVERY_BACKFILL_LIMIT"] ?? 20),
    20,
    100,
  );
  const solanaSignatureLimit = normalizeDiscoveryLimit(
    input.solanaSignatureLimit ?? Number(process.env["WALLET_DISCOVERY_SOLANA_SIGNATURE_LIMIT"] ?? 20),
    20,
    100,
  );
  const evmBlockLookback = normalizeDiscoveryLimit(
    input.evmBlockLookback ?? Number(process.env["WALLET_DISCOVERY_EVM_BLOCK_LOOKBACK"] ?? 3),
    3,
    25,
  );
  const results: PublicWalletDiscoveryChainResult[] = [];

  for (const chain of chains) {
    const provider = providerForChain(chain);
    const result: PublicWalletDiscoveryChainResult = {
      chain,
      provider,
      discovered: 0,
      insertedWallets: 0,
      updatedWallets: 0,
      backfilledWallets: 0,
      receivedTransactions: 0,
      insertedTransactions: 0,
      duplicates: 0,
      matchedWallets: 0,
      skipped: 0,
      errors: [],
    };

    try {
      const addresses =
        chain === "solana"
          ? await discoverSolanaPublicWalletAddresses(solanaSignatureLimit, maxWalletsPerChain)
          : await discoverEvmPublicWalletAddresses(chain, evmBlockLookback, maxWalletsPerChain);
      result.discovered = addresses.length;

      for (const address of addresses) {
        try {
          const indexed = await upsertPublicIndexedWallet(chain, address, {
            publicIndexer: {
              source: "public_indexer",
              chain,
              provider,
              discoveredAt: new Date().toISOString(),
            },
          });

          if (indexed.created) result.insertedWallets += 1;
          else result.updatedWallets += 1;

          if (backfillLimit > 0) {
            const backfill = await backfillPublicIndexedWallet(chain, address, backfillLimit);
            result.backfilledWallets += 1;
            result.receivedTransactions += backfill.received;
            result.insertedTransactions += backfill.insertedTransactions;
            result.duplicates += backfill.duplicates;
            result.matchedWallets += backfill.matchedWallets;
          }
        } catch (err) {
          result.skipped += 1;
          result.errors.push(err instanceof Error ? err.message.slice(0, 240) : "Public wallet indexing failed.");
        }
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message.slice(0, 240) : `${chain} public discovery failed.`);
    }

    results.push(result);
  }

  return {
    source: "wallet_public_discovery",
    chains: results,
    totals: {
      discovered: results.reduce((sum, item) => sum + item.discovered, 0),
      insertedWallets: results.reduce((sum, item) => sum + item.insertedWallets, 0),
      updatedWallets: results.reduce((sum, item) => sum + item.updatedWallets, 0),
      backfilledWallets: results.reduce((sum, item) => sum + item.backfilledWallets, 0),
      receivedTransactions: results.reduce((sum, item) => sum + item.receivedTransactions, 0),
      insertedTransactions: results.reduce((sum, item) => sum + item.insertedTransactions, 0),
      duplicates: results.reduce((sum, item) => sum + item.duplicates, 0),
      matchedWallets: results.reduce((sum, item) => sum + item.matchedWallets, 0),
      skipped: results.reduce((sum, item) => sum + item.skipped, 0),
    },
    updatedAt: new Date().toISOString(),
  };
}

export async function backfillTrackedWallet(userId: string, subscriptionId: string, requestedLimit?: number): Promise<WalletBackfillResult> {
  const { db, trackedWalletsTable, userTrackedWalletsTable, walletBackfillRunsTable } = await getDbModule();
  const limit = normalizeBackfillLimit(requestedLimit);
  const rows = await db
    .select({
      subscription: userTrackedWalletsTable,
      wallet: trackedWalletsTable,
    })
    .from(userTrackedWalletsTable)
    .innerJoin(trackedWalletsTable, eq(userTrackedWalletsTable.walletId, trackedWalletsTable.id))
    .where(and(eq(userTrackedWalletsTable.userId, userId), eq(userTrackedWalletsTable.id, subscriptionId), eq(userTrackedWalletsTable.isActive, true)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("Tracked wallet subscription was not found.");

  const provider = liveProviderForChain(row.wallet.chain);
  if (!provider) throw new Error(`${row.wallet.chain} live history sync requires a Move-chain provider integration.`);
  const [run] = await db
    .insert(walletBackfillRunsTable)
    .values({
      userId,
      walletId: row.wallet.id,
      provider,
      chain: row.wallet.chain,
      requestedLimit: limit,
      status: "running",
    })
    .returning();

  if (!run) throw new Error("Wallet history sync run could not be created.");

  try {
    const providerItems =
      provider === "helius"
        ? await fetchHeliusWalletHistory(row.wallet.address, limit)
        : await fetchAlchemyWalletHistory(row.wallet.chain, row.wallet.address, limit);
    const payload = providerItems.map((item) => attachBackfillContext(item, row.wallet.address));
    const ingest = await ingestWalletWebhook(provider, row.wallet.chain, payload, {
      signatureVerified: true,
      providerDeliveryId: `backfill:${run.id}`,
    });

    await db
      .update(walletBackfillRunsTable)
      .set({
        status: "completed",
        received: providerItems.length,
        insertedTransactions: ingest.insertedTransactions,
        finishedAt: new Date(),
      })
      .where(eq(walletBackfillRunsTable.id, run.id));

    return {
      runId: run.id,
      provider,
      chain: row.wallet.chain,
      walletId: row.wallet.id,
      requestedLimit: limit,
      received: providerItems.length,
      insertedTransactions: ingest.insertedTransactions,
      duplicates: ingest.duplicates,
      matchedWallets: ingest.matchedWallets,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    await db
      .update(walletBackfillRunsTable)
      .set({
        status: "failed",
        error: err instanceof Error ? err.message.slice(0, 500) : "Wallet history sync failed.",
        finishedAt: new Date(),
      })
      .where(eq(walletBackfillRunsTable.id, run.id));

    throw err;
  }
}

async function activeTrackedAddresses(chain: WalletTrackerChain): Promise<string[]> {
  const { db, trackedWalletsTable, userTrackedWalletsTable } = await getDbModule();
  const userRows = await db
    .select({ address: trackedWalletsTable.address })
    .from(trackedWalletsTable)
    .innerJoin(userTrackedWalletsTable, eq(trackedWalletsTable.id, userTrackedWalletsTable.walletId))
    .where(and(eq(trackedWalletsTable.chain, chain), eq(userTrackedWalletsTable.isActive, true)));
  const publicLimit = normalizeDiscoveryLimit(Number(process.env["WALLET_DISCOVERY_WEBHOOK_PUBLIC_LIMIT"] ?? 250), 250, 1_000);
  const publicRows = await db
    .select({ address: trackedWalletsTable.address })
    .from(trackedWalletsTable)
    .where(and(eq(trackedWalletsTable.chain, chain), eq(trackedWalletsTable.source, "public_indexer")))
    .orderBy(sql`${trackedWalletsTable.lastActiveAt} desc nulls last`, desc(trackedWalletsTable.score), desc(trackedWalletsTable.updatedAt))
    .limit(publicLimit);

  return Array.from(new Set([...userRows, ...publicRows].map((row) => row.address)));
}

function alchemyNetworkForChain(chain: WalletTrackerChain): string {
  switch (chain) {
    case "ethereum":
      return "ETH_MAINNET";
    case "base":
      return "BASE_MAINNET";
    case "arbitrum":
      return "ARB_MAINNET";
    case "bsc":
      return "BNB_MAINNET";
    case "polygon":
      return "MATIC_MAINNET";
    case "optimism":
      return "OPT_MAINNET";
    case "solana":
      return "SOLANA_MAINNET";
    case "sui":
    case "aptos":
      throw new Error(`${chain === "sui" ? "Sui" : "Aptos"} provider webhook sync requires a Move-chain provider integration.`);
    default:
      return "ETH_MAINNET";
  }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(payload) && typeof payload["message"] === "string" ? payload["message"] : response.statusText;
    throw new Error(`Provider webhook sync failed (${response.status}): ${message}`);
  }

  return payload;
}

function readProviderWebhookId(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const data = isRecord(payload["data"]) ? payload["data"] : payload;
  const id = data["webhookID"] ?? data["id"] ?? data["webhook_id"];
  return typeof id === "string" ? id : null;
}

export async function syncProviderWebhook(provider: WalletWebhookProvider, chain: WalletTrackerChain): Promise<WalletProviderSyncResult> {
  const endpoint = walletWebhookEndpoint(provider, chain);
  const addresses = await activeTrackedAddresses(chain);

  if (addresses.length === 0) {
    throw new Error(`No active ${chain} wallets are available to register with ${provider}.`);
  }

  if (provider === "helius") {
    if (chain !== "solana") throw new Error("Helius wallet webhook sync is only configured for Solana in this workspace.");

    const apiKey = process.env["HELIUS_API_KEY"]?.trim();
    const authHeader = process.env["HELIUS_WEBHOOK_AUTH_HEADER"]?.trim();
    if (!apiKey) throw new Error("HELIUS_API_KEY is required to sync the Helius webhook.");
    if (!authHeader) throw new Error("HELIUS_WEBHOOK_AUTH_HEADER is required to sync and validate the Helius webhook.");

    const webhookId = process.env["HELIUS_WEBHOOK_ID"]?.trim();
    const payload = {
      webhookURL: endpoint,
      transactionTypes: ["ANY"],
      accountAddresses: addresses,
      webhookType: "enhanced",
      authHeader,
      txnStatus: "success",
    };
    const url = webhookId
      ? `https://api-mainnet.helius-rpc.com/v0/webhooks/${encodeURIComponent(webhookId)}?api-key=${encodeURIComponent(apiKey)}`
      : `https://api-mainnet.helius-rpc.com/v0/webhooks?api-key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: webhookId ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const responseBody = await readJsonResponse(response);

    return {
      provider,
      chain,
      endpoint,
      addressCount: addresses.length,
      mode: webhookId ? "updated" : "created",
      providerWebhookId: readProviderWebhookId(responseBody),
      updatedAt: new Date().toISOString(),
    };
  }

  const authToken = process.env["ALCHEMY_NOTIFY_AUTH_TOKEN"]?.trim();
  const webhookId = process.env[`ALCHEMY_WEBHOOK_ID_${chain.toUpperCase()}`]?.trim() || process.env["ALCHEMY_WEBHOOK_ID"]?.trim();
  if (!authToken) throw new Error("ALCHEMY_NOTIFY_AUTH_TOKEN is required to sync the Alchemy webhook.");

  if (webhookId) {
    const response = await fetch("https://dashboard.alchemy.com/api/update-webhook-addresses", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-alchemy-token": authToken,
      },
      body: JSON.stringify({
        webhook_id: webhookId,
        addresses,
      }),
    });

    await readJsonResponse(response);

    return {
      provider,
      chain,
      endpoint,
      addressCount: addresses.length,
      mode: "updated",
      providerWebhookId: webhookId,
      updatedAt: new Date().toISOString(),
    };
  }

  const response = await fetch("https://dashboard.alchemy.com/api/create-webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-alchemy-token": authToken,
    },
    body: JSON.stringify({
      network: alchemyNetworkForChain(chain),
      webhook_type: "ADDRESS_ACTIVITY",
      webhook_url: endpoint,
      name: `AnyAlpha ${chain} wallet tracker`,
      addresses,
    }),
  });
  const responseBody = await readJsonResponse(response);

  return {
    provider,
    chain,
    endpoint,
    addressCount: addresses.length,
    mode: "created",
    providerWebhookId: readProviderWebhookId(responseBody),
    signingKeyReturned: Boolean(isRecord(responseBody) && isRecord(responseBody["data"]) && responseBody["data"]["signing_key"]),
    updatedAt: new Date().toISOString(),
  };
}

export async function sendTrackedWalletTestAlert(userId: string, subscriptionId: string): Promise<WalletTestAlertResult> {
  const { db, trackedWalletsTable, userTrackedWalletsTable, walletAlertLogTable } = await getDbModule();
  const rows = await db
    .select({
      subscription: userTrackedWalletsTable,
      wallet: trackedWalletsTable,
    })
    .from(userTrackedWalletsTable)
    .innerJoin(trackedWalletsTable, eq(userTrackedWalletsTable.walletId, trackedWalletsTable.id))
    .where(and(eq(userTrackedWalletsTable.userId, userId), eq(userTrackedWalletsTable.id, subscriptionId), eq(userTrackedWalletsTable.isActive, true)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("Tracked wallet subscription was not found.");

  const skippedChannels: string[] = [];
  const body = formatWalletTestAlertBody(row.wallet.chain, row.wallet.address);
  let notificationCreated = false;
  let telegramMessagesSent = 0;

  if (row.subscription.alertMode === "muted") {
    skippedChannels.push("muted");
  }

  if (row.subscription.alertMode !== "muted" && row.subscription.browserEnabled) {
    await createUserNotification(userId, {
      kind: "wallet_test_alert",
      title: "Wallet test alert",
      body,
      payload: {
        chain: row.wallet.chain,
        walletId: row.wallet.id,
        subscriptionId: row.subscription.id,
      },
    });
    notificationCreated = true;
    await db.insert(walletAlertLogTable).values({
      userId,
      walletId: row.wallet.id,
      channel: "browser",
      status: "sent",
      sentAt: new Date(),
    });
  } else if (row.subscription.alertMode !== "muted") {
    skippedChannels.push("browser_disabled");
    await db.insert(walletAlertLogTable).values({
      userId,
      walletId: row.wallet.id,
      channel: "browser",
      status: "skipped",
      error: "Browser alerts are disabled for this wallet.",
    });
  }

  if (row.subscription.alertMode !== "muted" && row.subscription.telegramEnabled) {
    const chats = await telegramChatsForUser(userId);

    if (chats.length === 0) {
      skippedChannels.push("telegram_unlinked");
      await db.insert(walletAlertLogTable).values({
        userId,
        walletId: row.wallet.id,
        channel: "telegram",
        status: "skipped",
        error: "No linked Telegram chat.",
      });
    }

    for (const chatId of chats) {
      try {
        await publishTelegramMessage(["AnyAlpha wallet test alert", "", body].join("\n"), { chatId });
        telegramMessagesSent += 1;
        await db.insert(walletAlertLogTable).values({
          userId,
          walletId: row.wallet.id,
          channel: "telegram",
          status: "sent",
          sentAt: new Date(),
        });
      } catch (err) {
        await db.insert(walletAlertLogTable).values({
          userId,
          walletId: row.wallet.id,
          channel: "telegram",
          status: "failed",
          error: err instanceof Error ? err.message.slice(0, 500) : "Telegram test alert failed.",
        });
      }
    }
  } else if (row.subscription.alertMode !== "muted") {
    skippedChannels.push("telegram_disabled");
  }

  return {
    notificationCreated,
    telegramMessagesSent,
    skippedChannels,
    updatedAt: new Date().toISOString(),
  };
}
