import { and, eq, inArray, type SQL } from "drizzle-orm";
import { publishTelegramMessage } from "../alerts/telegram";
import { fetchAlchemyPoolTrades } from "../markets/alchemy";
import { fetchGeckoTerminalPoolTrades } from "../markets/geckoterminal";
import { fetchSolanaRecentPoolTrades } from "../markets/helius";
import { fetchMobulaTokenTrades } from "../markets/mobula";
import { fetchMoralisPairSwaps } from "../markets/moralis";
import { anyAlphaTokenUrl } from "../markets/provider-utils";
import type { MarketToken, MarketTokenTrade } from "../markets/types";

type DbModule = typeof import("@workspace/db");

interface ActiveBundleWallet {
  walletId: string;
  analysisId: string | null;
  chain: string;
  tokenAddress: string;
  tokenAddressNormalized: string;
  walletAddress: string;
  walletAddressNormalized: string;
  buyAmountUsdCents: number | null;
  pairAddress: string | null;
  label: "bundled" | "organic" | "suspicious" | "unknown";
  score: number;
}

interface BundleExitHit {
  wallet: ActiveBundleWallet;
  trade: MarketTokenTrade;
  sellAmountUsd?: number;
  exitPnlPct?: number;
}

export interface BundleExitMonitorOptions {
  limit?: number;
  chain?: string;
  dryRun?: boolean;
}

export interface BundleExitMonitorResult {
  source: "bundle_exit_monitor";
  scannedWallets: number;
  scannedTokens: number;
  exitedWallets: number;
  alertsAttempted: number;
  dryRun: boolean;
  data: Array<{
    chain: string;
    tokenAddress: string;
    pairAddress?: string;
    walletAddress: string;
    transactionHash?: string;
    sellAmountUsd?: number;
    exitPnlPct?: number;
  }>;
  updatedAt: string;
}

const DEFAULT_LIMIT = 40;
const AUTO_LIMIT = 15;
const AUTO_COOLDOWN_MS = 90_000;

let dbModulePromise: Promise<DbModule> | null = null;
let scheduledExitMonitor: Promise<void> | null = null;
let lastExitMonitorAt = 0;

async function getDbModule(): Promise<DbModule> {
  if (dbModulePromise) return dbModulePromise;

  dbModulePromise = (async () => {
    const databaseUrl = (process.env["DATABASE_URL"] ?? "").trim();
    if (!databaseUrl) {
      throw new Error("DATABASE_URL must be configured to monitor bundle exits.");
    }

    return import("@workspace/db");
  })();

  return dbModulePromise;
}

function envNumber(key: string, fallback: number): number {
  const parsed = Number(process.env[key]?.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function exitMonitorEnabled(): boolean {
  const raw = process.env["ANYALPHA_BUNDLE_EXIT_MONITOR"]?.trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

function exitAlertsEnabled(): boolean {
  const raw = process.env["ANYALPHA_BUNDLE_EXIT_ALERTS_ENABLED"]?.trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

function normalizeAddress(value: string | undefined | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toDbDecimal(value: number | undefined): string | undefined {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}

function shortAddress(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 5)}...${trimmed.slice(-4)}`;
}

function sellLike(trade: MarketTokenTrade): boolean {
  const type = trade.type?.toLowerCase() ?? "";
  const operation = trade.operation?.toLowerCase() ?? "";
  return type.includes("sell") || operation.includes("sell");
}

function walletForTrade(trade: MarketTokenTrade): string {
  return normalizeAddress(trade.makerAddress) || normalizeAddress(trade.senderAddress);
}

function sellAmountUsd(trade: MarketTokenTrade): number | undefined {
  return finiteNumber(trade.baseTokenAmountUsd) ?? finiteNumber(trade.quoteTokenAmountUsd);
}

function approximateExitPnlPct(wallet: ActiveBundleWallet, sellUsd: number | undefined): number | undefined {
  if (sellUsd === undefined || wallet.buyAmountUsdCents === null || wallet.buyAmountUsdCents <= 0) return undefined;
  const buyUsd = wallet.buyAmountUsdCents / 100;
  return ((sellUsd - buyUsd) / buyUsd) * 100;
}

function minimalMarketToken(row: ActiveBundleWallet): MarketToken {
  return {
    id: `${row.chain}:${row.tokenAddressNormalized}:${row.pairAddress ?? row.tokenAddressNormalized}`,
    chainId: row.chain,
    chainLabel: row.chain,
    dexId: "unknown",
    url: anyAlphaTokenUrl(row.chain, row.tokenAddress),
    pairAddress: row.pairAddress ?? "",
    tokenAddress: row.tokenAddress,
    name: row.tokenAddress,
    symbol: row.tokenAddress.slice(0, 6),
    quoteSymbol: "",
    volume: {},
    priceChange: {},
    txns: {
      m5: { buys: 0, sells: 0 },
      h1: { buys: 0, sells: 0 },
      h6: { buys: 0, sells: 0 },
      h24: { buys: 0, sells: 0 },
    },
    links: [],
    narrativeTags: [],
    riskFlags: [],
    signalScore: 0,
    providers: [],
  };
}

async function fetchRecentTokenTrades(row: ActiveBundleWallet): Promise<MarketTokenTrade[]> {
  const token = minimalMarketToken(row);
  const tasks: Array<Promise<MarketTokenTrade[]>> = [];

  if (row.pairAddress) {
    tasks.push(fetchGeckoTerminalPoolTrades(row.chain, row.pairAddress, row.tokenAddress, 120));
    tasks.push(fetchMoralisPairSwaps(row.chain, row.pairAddress, row.tokenAddress, 80));
  }

  tasks.push(fetchMobulaTokenTrades(row.chain, row.tokenAddress, 80));

  if (row.chain === "solana") {
    tasks.push(fetchSolanaRecentPoolTrades(token, 40));
  } else {
    tasks.push(fetchAlchemyPoolTrades(token, 120));
  }

  const settled = await Promise.allSettled(tasks);
  const seen = new Set<string>();
  const trades: MarketTokenTrade[] = [];

  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const trade of result.value) {
      const key = trade.transactionHash?.toLowerCase() || trade.id.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      trades.push(trade);
    }
  }

  return trades.sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0));
}

async function activeBundleWallets(options: BundleExitMonitorOptions): Promise<ActiveBundleWallet[]> {
  const { db, bundleAnalysisTable, bundleWalletsTable } = await getDbModule();
  const limit = Math.max(1, Math.min(250, Math.round(options.limit ?? DEFAULT_LIMIT)));
  const chain = options.chain?.trim().toLowerCase();
  const filters = [
    eq(bundleWalletsTable.hasExited, false),
    inArray(bundleAnalysisTable.label, ["bundled", "suspicious", "unknown"]),
    chain ? eq(bundleWalletsTable.chain, chain) : undefined,
  ].filter((filter): filter is SQL => Boolean(filter));

  return db
    .select({
      walletId: bundleWalletsTable.id,
      analysisId: bundleWalletsTable.analysisId,
      chain: bundleWalletsTable.chain,
      tokenAddress: bundleWalletsTable.tokenAddress,
      tokenAddressNormalized: bundleWalletsTable.tokenAddressNormalized,
      walletAddress: bundleWalletsTable.walletAddress,
      walletAddressNormalized: bundleWalletsTable.walletAddressNormalized,
      buyAmountUsdCents: bundleWalletsTable.buyAmountUsdCents,
      pairAddress: bundleAnalysisTable.pairAddress,
      label: bundleAnalysisTable.label,
      score: bundleAnalysisTable.score,
    })
    .from(bundleWalletsTable)
    .innerJoin(bundleAnalysisTable, eq(bundleWalletsTable.analysisId, bundleAnalysisTable.id))
    .where(and(...filters))
    .limit(limit);
}

function groupByToken(wallets: ActiveBundleWallet[]): ActiveBundleWallet[][] {
  const groups = new Map<string, ActiveBundleWallet[]>();

  for (const wallet of wallets) {
    const key = `${wallet.chain}:${wallet.tokenAddressNormalized}`;
    const current = groups.get(key) ?? [];
    current.push(wallet);
    groups.set(key, current);
  }

  return [...groups.values()];
}

async function detectExitHits(walletGroup: ActiveBundleWallet[]): Promise<BundleExitHit[]> {
  const first = walletGroup[0];
  if (!first) return [];

  const trades = await fetchRecentTokenTrades(first);
  if (trades.length === 0) return [];

  const walletsByAddress = new Map(walletGroup.map((wallet) => [wallet.walletAddressNormalized, wallet]));
  const hits = new Map<string, BundleExitHit>();

  for (const trade of trades) {
    if (!sellLike(trade)) continue;
    const walletAddress = walletForTrade(trade);
    const wallet = walletsByAddress.get(walletAddress);
    if (!wallet || hits.has(wallet.walletId)) continue;

    const amountUsd = sellAmountUsd(trade);
    hits.set(wallet.walletId, {
      wallet,
      trade,
      sellAmountUsd: amountUsd,
      exitPnlPct: approximateExitPnlPct(wallet, amountUsd),
    });
  }

  return [...hits.values()];
}

async function markExitHits(hits: BundleExitHit[], dryRun: boolean): Promise<void> {
  if (dryRun || hits.length === 0) return;

  const { db, bundleAnalysisTable, bundleWalletsTable } = await getDbModule();
  const now = new Date();

  await Promise.all(
    hits.map((hit) =>
      db
        .update(bundleWalletsTable)
        .set({
          hasExited: true,
          exitPnlPct: toDbDecimal(hit.exitPnlPct),
          updatedAt: now,
        })
        .where(eq(bundleWalletsTable.id, hit.wallet.walletId)),
    ),
  );

  const analysisIds = Array.from(new Set(hits.map((hit) => hit.wallet.analysisId).filter((id): id is string => Boolean(id))));
  await Promise.all(
    analysisIds.map((analysisId) =>
      db
        .update(bundleAnalysisTable)
        .set({
          bundleStillHolding: false,
          updatedAt: now,
        })
        .where(eq(bundleAnalysisTable.id, analysisId)),
    ),
  );
}

async function publishExitAlert(hit: BundleExitHit): Promise<void> {
  if (!exitAlertsEnabled()) return;

  const url = anyAlphaTokenUrl(hit.wallet.chain, hit.wallet.tokenAddress);
  const lines = [
    "🚨 BUNDLE EXIT ALERT",
    "",
    `${hit.wallet.chain.toUpperCase()} token: ${hit.wallet.tokenAddress}`,
    `Wallet: ${shortAddress(hit.wallet.walletAddress)}`,
    hit.sellAmountUsd !== undefined ? `Sell size: $${hit.sellAmountUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : undefined,
    hit.exitPnlPct !== undefined ? `Approx PnL: ${hit.exitPnlPct >= 0 ? "+" : ""}${hit.exitPnlPct.toFixed(1)}%` : undefined,
    hit.trade.transactionHash ? `Tx: ${shortAddress(hit.trade.transactionHash)}` : undefined,
    "",
    "A monitored bundle/sniper wallet has started selling.",
    url,
  ].filter((line): line is string => Boolean(line));

  await publishTelegramMessage(lines.join("\n"), {
    buttons: [[{ text: "Open Token", url }]],
  });
}

export async function monitorBundleExits(options: BundleExitMonitorOptions = {}): Promise<BundleExitMonitorResult> {
  const dryRun = options.dryRun ?? false;
  const wallets = await activeBundleWallets(options);
  const groups = groupByToken(wallets);
  const hits: BundleExitHit[] = [];

  for (const group of groups) {
    hits.push(...(await detectExitHits(group)));
  }

  await markExitHits(hits, dryRun);

  let alertsAttempted = 0;
  if (!dryRun) {
    for (const hit of hits) {
      alertsAttempted += 1;
      await publishExitAlert(hit).catch(() => {});
    }
  }

  return {
    source: "bundle_exit_monitor",
    scannedWallets: wallets.length,
    scannedTokens: groups.length,
    exitedWallets: hits.length,
    alertsAttempted,
    dryRun,
    data: hits.map((hit) => ({
      chain: hit.wallet.chain,
      tokenAddress: hit.wallet.tokenAddress,
      pairAddress: hit.wallet.pairAddress ?? undefined,
      walletAddress: hit.wallet.walletAddress,
      transactionHash: hit.trade.transactionHash,
      sellAmountUsd: hit.sellAmountUsd,
      exitPnlPct: hit.exitPnlPct,
    })),
    updatedAt: new Date().toISOString(),
  };
}

export function scheduleBundleExitMonitor(): void {
  if (!exitMonitorEnabled()) return;
  if (scheduledExitMonitor) return;

  const now = Date.now();
  if (now - lastExitMonitorAt < envNumber("ANYALPHA_BUNDLE_EXIT_MONITOR_COOLDOWN_MS", AUTO_COOLDOWN_MS)) return;

  lastExitMonitorAt = now;
  scheduledExitMonitor = monitorBundleExits({
    limit: envNumber("ANYALPHA_BUNDLE_EXIT_MONITOR_LIMIT", AUTO_LIMIT),
  })
    .then(() => undefined)
    .catch((err) => {
      console.warn("Bundle exit monitor failed", err);
    })
    .finally(() => {
      scheduledExitMonitor = null;
    });
}
