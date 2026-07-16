import { fetchAlchemyPoolTrades } from "../markets/alchemy";
import { fetchGeckoTerminalPoolTrades } from "../markets/geckoterminal";
import { fetchSolanaRecentPoolTrades } from "../markets/helius";
import { fetchMobulaTokenTrades } from "../markets/mobula";
import { fetchMoralisPairSwaps } from "../markets/moralis";
import type { MarketBundleLabel, MarketToken, MarketTokenTrade } from "../markets/types";
import { enrichLaunchTransactionsWithFundingTrace } from "./funding-trace";
import {
  analyzeAndStoreBundle,
  type BundleAnalysisInput,
  type BundleLaunchTransactionInput,
  type StoredBundleAnalysis,
} from "./store";

type LiveBundleStatus = "analyzed" | "skipped" | "error";

export interface LiveBundleAnalyzeOptions {
  limit?: number;
  force?: boolean;
  maxAgeMinutes?: number;
  launchWindowMinutes?: number;
  minLaunchBuys?: number;
}

export interface LiveBundleAnalyzeResult {
  status: LiveBundleStatus;
  chain: string;
  tokenAddress: string;
  pairAddress?: string;
  symbol?: string;
  reason?: string;
  tradesFetched: number;
  launchBuys: number;
  providers: string[];
  analysis?: StoredBundleAnalysis;
}

const DEFAULT_MAX_AGE_MINUTES = 6 * 60;
const DEFAULT_LAUNCH_WINDOW_MINUTES = 12;
const DEFAULT_MIN_LAUNCH_BUYS = 3;
const DEFAULT_MANUAL_LIMIT = 12;
const DEFAULT_BACKGROUND_LIMIT = 3;
const AUTO_COOLDOWN_MS = 60_000;

let scheduledAnalysis: Promise<void> | null = null;
let lastScheduledAt = 0;

function envNumber(key: string, fallback: number): number {
  const parsed = Number(process.env[key]?.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function bundleAutoAnalysisEnabled(): boolean {
  const raw = process.env["ANYALPHA_BUNDLE_AUTO_ANALYSIS"]?.trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isUnknownBundle(label: MarketBundleLabel | undefined): boolean {
  return !label || label === "unknown";
}

function estimateTotalSupply(token: MarketToken): number | undefined {
  const price = finiteNumber(token.priceUsd);
  const valuation = finiteNumber(token.marketCap) ?? finiteNumber(token.fdv);
  if (!price || price <= 0 || !valuation || valuation <= 0) return undefined;
  const supply = valuation / price;
  return Number.isFinite(supply) && supply > 0 ? supply : undefined;
}

function buyLike(trade: MarketTokenTrade): boolean {
  const type = trade.type?.toLowerCase() ?? "";
  const operation = trade.operation?.toLowerCase() ?? "";
  return type.includes("buy") || operation.includes("buy");
}

function walletForTrade(trade: MarketTokenTrade): string | undefined {
  return trade.makerAddress?.trim() || trade.senderAddress?.trim();
}

function tradeKey(trade: MarketTokenTrade): string {
  return trade.transactionHash?.toLowerCase() || trade.id.toLowerCase();
}

function dedupeTrades(trades: MarketTokenTrade[]): MarketTokenTrade[] {
  const byKey = new Map<string, MarketTokenTrade>();

  for (const trade of trades) {
    const key = tradeKey(trade);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, trade);
  }

  return [...byKey.values()];
}

function inferredBlockNumber(trade: MarketTokenTrade): string | undefined {
  const geckoMatch = trade.id.match(/^[a-z0-9-]+_(\d+)_/i);
  if (geckoMatch?.[1]) return geckoMatch[1];
  return undefined;
}

async function fetchLiveTrades(token: MarketToken): Promise<{ trades: MarketTokenTrade[]; providers: string[] }> {
  const tasks: Array<Promise<{ provider: string; trades: MarketTokenTrade[] }>> = [];

  if (token.pairAddress) {
    tasks.push(
      fetchGeckoTerminalPoolTrades(token.chainId, token.pairAddress, token.tokenAddress, 200).then((trades) => ({
        provider: "geckoterminal",
        trades,
      })),
    );
    tasks.push(
      fetchMoralisPairSwaps(token.chainId, token.pairAddress, token.tokenAddress, 100).then((trades) => ({
        provider: "moralis",
        trades,
      })),
    );
  }

  tasks.push(
    fetchMobulaTokenTrades(token.chainId, token.tokenAddress, 80).then((trades) => ({
      provider: "mobula",
      trades,
    })),
  );

  if (token.chainId === "solana") {
    tasks.push(
      fetchSolanaRecentPoolTrades(token, 40).then((trades) => ({
        provider: "solana-rpc",
        trades,
      })),
    );
  } else {
    tasks.push(
      fetchAlchemyPoolTrades(token, 120).then((trades) => ({
        provider: "alchemy",
        trades,
      })),
    );
  }

  const settled = await Promise.allSettled(tasks);
  const successful = settled
    .filter((result): result is PromiseFulfilledResult<{ provider: string; trades: MarketTokenTrade[] }> => result.status === "fulfilled")
    .filter((result) => result.value.trades.length > 0);

  return {
    trades: dedupeTrades(successful.flatMap((result) => result.value.trades)),
    providers: successful.map((result) => result.value.provider),
  };
}

function launchTransactionsFromTrades(
  token: MarketToken,
  trades: MarketTokenTrade[],
  launchWindowMinutes: number,
): BundleLaunchTransactionInput[] {
  if (!token.pairCreatedAt) return [];

  const pairCreatedAt = token.pairCreatedAt;
  const totalSupply = estimateTotalSupply(token);
  const launchStart = pairCreatedAt - 60_000;
  const launchEnd = pairCreatedAt + launchWindowMinutes * 60_000;

  return trades
    .filter((trade) => buyLike(trade))
    .filter((trade) => {
      const timestamp = finiteNumber(trade.timestamp);
      return timestamp !== undefined && timestamp >= launchStart && timestamp <= launchEnd;
    })
    .sort((left, right) => (left.timestamp ?? 0) - (right.timestamp ?? 0))
    .slice(0, 200)
    .map((trade) => {
      const walletAddress = walletForTrade(trade);
      const tokenAmount = finiteNumber(trade.baseTokenAmount);
      const supplyPct =
        tokenAmount !== undefined && totalSupply !== undefined && totalSupply > 0
          ? (tokenAmount / totalSupply) * 100
          : undefined;
      const buyAmountUsd =
        finiteNumber(trade.baseTokenAmountUsd) ??
        finiteNumber(trade.quoteTokenAmountUsd) ??
        (tokenAmount !== undefined && token.priceUsd ? tokenAmount * token.priceUsd : undefined);
      const secondsFromLaunch = trade.timestamp !== undefined ? (trade.timestamp - pairCreatedAt) / 1000 : undefined;

      return {
        walletAddress: walletAddress ?? "",
        blockNumber: inferredBlockNumber(trade),
        timestamp: trade.timestamp,
        tokenAmount,
        supplyPct,
        buyAmountNative: finiteNumber(trade.quoteTokenAmount),
        buyAmountUsd,
        isBot: secondsFromLaunch !== undefined && secondsFromLaunch >= 0 && secondsFromLaunch <= 3,
      };
    })
    .filter((tx) => tx.walletAddress);
}

function shouldAnalyzeToken(token: MarketToken, options: Required<Pick<LiveBundleAnalyzeOptions, "force" | "maxAgeMinutes">>): boolean {
  if (!token.tokenAddress || !token.pairAddress || !token.pairCreatedAt) return false;
  if (!options.force && !isUnknownBundle(token.bundle?.label)) return false;
  if (options.force) return true;
  const age = finiteNumber(token.ageMinutes);
  return age !== undefined && age >= 0 && age <= options.maxAgeMinutes;
}

export async function analyzeLiveBundleToken(
  token: MarketToken,
  options: LiveBundleAnalyzeOptions = {},
): Promise<LiveBundleAnalyzeResult> {
  const launchWindowMinutes = Math.max(1, Math.min(60, Math.round(options.launchWindowMinutes ?? DEFAULT_LAUNCH_WINDOW_MINUTES)));
  const minLaunchBuys = Math.max(1, Math.min(25, Math.round(options.minLaunchBuys ?? DEFAULT_MIN_LAUNCH_BUYS)));

  if (!token.pairAddress || !token.pairCreatedAt) {
    return {
      status: "skipped",
      chain: token.chainId,
      tokenAddress: token.tokenAddress,
      pairAddress: token.pairAddress,
      symbol: token.symbol,
      reason: "missing_pair_launch_metadata",
      tradesFetched: 0,
      launchBuys: 0,
      providers: [],
    };
  }

  try {
    const live = await fetchLiveTrades(token);
    const launchTransactions = launchTransactionsFromTrades(token, live.trades, launchWindowMinutes);

    if (launchTransactions.length < minLaunchBuys) {
      return {
        status: "skipped",
        chain: token.chainId,
        tokenAddress: token.tokenAddress,
        pairAddress: token.pairAddress,
        symbol: token.symbol,
        reason: "not_enough_launch_window_buys",
        tradesFetched: live.trades.length,
        launchBuys: launchTransactions.length,
        providers: live.providers,
      };
    }

    const fundingTrace = await enrichLaunchTransactionsWithFundingTrace({
      chain: token.chainId,
      launchTimeMs: token.pairCreatedAt,
      transactions: launchTransactions,
    });

    const input: BundleAnalysisInput = {
      chain: token.chainId,
      tokenAddress: token.tokenAddress,
      pairAddress: token.pairAddress,
      totalSupply: estimateTotalSupply(token),
      transactions: fundingTrace.transactions,
      evidence: {
        status: "live_launch_window_analyzed",
        source: "live_market_trade_providers",
        providerIds: live.providers,
        fundingTraceProvider: fundingTrace.provider,
        fundingTraceWallets: fundingTrace.tracedWallets,
        fundingTraceMatches: fundingTrace.fundedWallets,
        tradesFetched: live.trades.length,
        launchWindowMinutes,
        pairCreatedAt: token.pairCreatedAt,
        version: "phase-3-funding-trace",
      },
    };
    const analysis = await analyzeAndStoreBundle(input);

    return {
      status: "analyzed",
      chain: token.chainId,
      tokenAddress: token.tokenAddress,
      pairAddress: token.pairAddress,
      symbol: token.symbol,
      tradesFetched: live.trades.length,
      launchBuys: launchTransactions.length,
      providers: live.providers,
      analysis,
    };
  } catch (err) {
    return {
      status: "error",
      chain: token.chainId,
      tokenAddress: token.tokenAddress,
      pairAddress: token.pairAddress,
      symbol: token.symbol,
      reason: err instanceof Error ? err.message : "Bundle live analysis failed.",
      tradesFetched: 0,
      launchBuys: 0,
      providers: [],
    };
  }
}

export async function analyzeLiveBundleTokens(
  tokens: MarketToken[],
  options: LiveBundleAnalyzeOptions = {},
): Promise<LiveBundleAnalyzeResult[]> {
  const limit = Math.max(1, Math.min(50, Math.round(options.limit ?? DEFAULT_MANUAL_LIMIT)));
  const force = options.force ?? false;
  const maxAgeMinutes = Math.max(1, Math.round(options.maxAgeMinutes ?? DEFAULT_MAX_AGE_MINUTES));
  const candidates = tokens
    .filter((token) => shouldAnalyzeToken(token, { force, maxAgeMinutes }))
    .slice(0, limit);
  const results: LiveBundleAnalyzeResult[] = [];

  for (const token of candidates) {
    results.push(await analyzeLiveBundleToken(token, options));
  }

  return results;
}

export function scheduleBundleAnalysisForMarkets(tokens: MarketToken[]): void {
  if (!bundleAutoAnalysisEnabled()) return;
  if (scheduledAnalysis) return;

  const now = Date.now();
  if (now - lastScheduledAt < envNumber("ANYALPHA_BUNDLE_AUTO_COOLDOWN_MS", AUTO_COOLDOWN_MS)) return;

  const maxAgeMinutes = envNumber("ANYALPHA_BUNDLE_AUTO_MAX_AGE_MINUTES", DEFAULT_MAX_AGE_MINUTES);
  const limit = Math.max(1, Math.min(10, envNumber("ANYALPHA_BUNDLE_AUTO_LIMIT", DEFAULT_BACKGROUND_LIMIT)));
  const candidates = tokens
    .filter((token) => shouldAnalyzeToken(token, { force: false, maxAgeMinutes }))
    .slice(0, limit);

  if (candidates.length === 0) return;

  lastScheduledAt = now;
  scheduledAnalysis = analyzeLiveBundleTokens(candidates, {
    limit,
    force: false,
    maxAgeMinutes,
    launchWindowMinutes: envNumber("ANYALPHA_BUNDLE_AUTO_LAUNCH_WINDOW_MINUTES", DEFAULT_LAUNCH_WINDOW_MINUTES),
    minLaunchBuys: envNumber("ANYALPHA_BUNDLE_AUTO_MIN_LAUNCH_BUYS", DEFAULT_MIN_LAUNCH_BUYS),
  })
    .then(() => undefined)
    .catch((err) => {
      console.warn("Bundle auto analysis failed", err);
    })
    .finally(() => {
      scheduledAnalysis = null;
    });
}
