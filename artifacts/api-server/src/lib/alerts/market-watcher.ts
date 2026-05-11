import { logger } from "../logger";
import { getMarketListings } from "../markets/dexscreener";
import { fetchMobulaTokenTrades } from "../markets/mobula";
import type { MarketToken, MarketTokenTrade } from "../markets/types";
import { publishAlertSignal } from "./engine";
import type { AlertChain, AlertSignal, TriggerKind } from "./types";

interface MarketSnapshot {
  signalScore: number;
  volume24hUsd?: number;
  priceChangeH1?: number;
  priceChangeH24?: number;
  txns24h: number;
  seenAt: number;
}

interface SummaryTrigger {
  kind: Extract<TriggerKind, "new_pair" | "price_breakout" | "volume_spike">;
  description: string;
}

interface QueuedAlert {
  market: MarketToken;
  signal: AlertSignal;
}

const state = {
  started: false,
  running: false,
  interval: null as ReturnType<typeof setInterval> | null,
  snapshots: new Map<string, MarketSnapshot>(),
  cooldowns: new Map<string, number>(),
};

function boolEnv(key: string, fallback = false): boolean {
  const raw = process.env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function numberEnv(key: string, fallback: number, min?: number, max?: number): number {
  const raw = Number(process.env[key] ?? fallback);
  if (!Number.isFinite(raw)) return fallback;
  const boundedMin = min ?? raw;
  const boundedMax = max ?? raw;
  return Math.min(boundedMax, Math.max(boundedMin, raw));
}

function optionalLimitEnv(key: string, fallback: number | null, min = 1): number | null {
  const raw = process.env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "0" || raw === "all" || raw === "none" || raw === "unlimited" || raw === "off") {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.floor(parsed));
}

function pollIntervalMs(): number {
  return numberEnv("ALERTS_POLL_INTERVAL_MS", 3_000, 3_000, 15 * 60_000);
}

function watchLimit(): number | null {
  return optionalLimitEnv("ALERTS_WATCH_LIMIT", null, 1);
}

function freshWatchQuota(): number {
  return numberEnv("ALERTS_FRESH_WATCH_QUOTA", 12, 0);
}

function detailLimit(): number | null {
  return optionalLimitEnv("ALERTS_DETAIL_LIMIT", null, 1);
}

function tradeFetchConcurrency(): number {
  return numberEnv("ALERTS_TRADE_FETCH_CONCURRENCY", 10, 1, 30);
}

function maxAlertsPerCycle(): number {
  return numberEnv("ALERTS_MAX_PER_CYCLE", 6, 1, 20);
}

function minSignalScore(): number {
  return numberEnv("ALERTS_MIN_SIGNAL_SCORE", 72, 40, 100);
}

function minLiquidityUsd(): number {
  return numberEnv("ALERTS_MIN_LIQUIDITY_USD", 40_000, 10_000);
}

function minVolumeUsd(): number {
  return numberEnv("ALERTS_MIN_VOLUME_USD", 150_000, 25_000);
}

function maxNewPairAgeMinutes(): number {
  return numberEnv("ALERTS_NEW_PAIR_MAX_AGE_MINUTES", 120, 10, 24 * 60);
}

function minNewPairSignalScore(): number {
  return numberEnv("ALERTS_NEW_PAIR_MIN_SIGNAL_SCORE", 50, 20, 100);
}

function minNewPairLiquidityUsd(): number {
  return numberEnv("ALERTS_NEW_PAIR_MIN_LIQUIDITY_USD", 10_000, 2_500);
}

function minNewPairVolumeUsd(): number {
  return numberEnv("ALERTS_NEW_PAIR_MIN_VOLUME_USD", 75_000, 10_000);
}

function minNewPairTxns24h(): number {
  return numberEnv("ALERTS_NEW_PAIR_MIN_TXNS_24H", 300, 25);
}

function largeBuyLookbackMs(): number {
  return numberEnv("ALERTS_LARGE_BUY_LOOKBACK_MS", 8 * 60_000, 60_000, 60 * 60_000);
}

function cooldownMs(kind: TriggerKind): number {
  switch (kind) {
    case "new_pair":
      return numberEnv("ALERTS_NEW_PAIR_COOLDOWN_MS", 12 * 60 * 60_000, 30 * 60_000, 24 * 60 * 60_000);
    case "large_buy":
      return numberEnv("ALERTS_LARGE_BUY_COOLDOWN_MS", 20 * 60_000, 60_000, 12 * 60 * 60_000);
    case "volume_spike":
      return numberEnv("ALERTS_VOLUME_SPIKE_COOLDOWN_MS", 4 * 60 * 60_000, 15 * 60_000, 24 * 60 * 60_000);
    case "price_breakout":
      return numberEnv("ALERTS_PRICE_BREAKOUT_COOLDOWN_MS", 3 * 60 * 60_000, 15 * 60_000, 24 * 60 * 60_000);
    case "holder_growth":
      return numberEnv("ALERTS_HOLDER_GROWTH_COOLDOWN_MS", 6 * 60 * 60_000, 15 * 60_000, 24 * 60 * 60_000);
    default:
      return 60 * 60_000;
  }
}

function now(): number {
  return Date.now();
}

function txns24h(market: MarketToken): number {
  return market.txns.h24.buys + market.txns.h24.sells;
}

function buyPressure(market: MarketToken): number {
  const total = txns24h(market);
  if (total <= 0) return 0;
  return (market.txns.h24.buys / total) * 100;
}

function marketCapUsd(market: MarketToken): number | undefined {
  return market.marketCap ?? market.fdv;
}

function alertChainFor(chainId: string): AlertChain {
  switch (chainId.toLowerCase()) {
    case "solana":
    case "base":
    case "ethereum":
    case "arbitrum":
    case "bsc":
    case "ton":
      return chainId.toLowerCase() as AlertChain;
    default:
      return "other";
  }
}

function dedupeTags(market: MarketToken): string[] {
  const tags = [...market.narrativeTags, market.chainId];
  return [...new Set(tags.filter(Boolean))].slice(0, 5);
}

function cooldownKey(kind: TriggerKind, market: MarketToken): string {
  return `${kind}:${market.id}`;
}

function hasActiveCooldown(key: string): boolean {
  const expiresAt = state.cooldowns.get(key);
  return typeof expiresAt === "number" && expiresAt > now();
}

function armCooldown(key: string, kind: TriggerKind): void {
  state.cooldowns.set(key, now() + cooldownMs(kind));
}

function pruneCooldowns(): void {
  const current = now();

  for (const [key, expiresAt] of state.cooldowns.entries()) {
    if (expiresAt <= current) state.cooldowns.delete(key);
  }
}

function isSummaryCandidate(market: MarketToken): boolean {
  return (
    market.signalScore >= minSignalScore() &&
    (market.liquidityUsd ?? 0) >= minLiquidityUsd() &&
    (market.volume.h24 ?? 0) >= minVolumeUsd()
  );
}

function summaryTriggerFor(market: MarketToken, previous?: MarketSnapshot): SummaryTrigger | null {
  const liquidityUsd = market.liquidityUsd ?? 0;
  const volume24hUsd = market.volume.h24 ?? 0;
  const priceChangeH1 = market.priceChange.h1 ?? 0;
  const priceChangeH24 = market.priceChange.h24 ?? 0;
  const totalTxns24h = txns24h(market);
  const pressure = buyPressure(market);

  if (
    typeof market.ageMinutes === "number" &&
    market.ageMinutes <= maxNewPairAgeMinutes() &&
    market.signalScore >= minNewPairSignalScore() &&
    liquidityUsd >= minNewPairLiquidityUsd() &&
    volume24hUsd >= minNewPairVolumeUsd() &&
    totalTxns24h >= minNewPairTxns24h() &&
    (priceChangeH1 >= 15 || priceChangeH24 >= 35 || pressure >= 58)
  ) {
    return {
      kind: "new_pair",
      description: "Fresh pair is moving early with real activity and liquidity behind it.",
    };
  }

  if (!isSummaryCandidate(market)) return null;

  const volumeAcceleration =
    previous && typeof previous.volume24hUsd === "number"
      ? volume24hUsd >= previous.volume24hUsd * 1.3
      : volume24hUsd >= 900_000;
  if (
    volumeAcceleration &&
    volume24hUsd >= 500_000 &&
    totalTxns24h >= 900 &&
    pressure >= 58
  ) {
    return {
      kind: "volume_spike",
      description: "Volume and transaction flow are expanding fast enough to justify a live push.",
    };
  }

  const h1Acceleration =
    previous && typeof previous.priceChangeH1 === "number"
      ? priceChangeH1 >= previous.priceChangeH1 + 10
      : priceChangeH1 >= 25;
  if (
    h1Acceleration &&
    liquidityUsd >= 50_000 &&
    volume24hUsd >= 200_000 &&
    pressure >= 55 &&
    (priceChangeH1 >= 18 || priceChangeH24 >= 60 || (market.priceChange.m5 ?? 0) >= 8)
  ) {
    return {
      kind: "price_breakout",
      description: "Momentum is breaking harder than the recent baseline and buyers are leading the tape.",
    };
  }

  return null;
}

function shouldInspectTrades(market: MarketToken): boolean {
  return (
    market.signalScore >= minSignalScore() - 4 &&
    (market.liquidityUsd ?? 0) >= 25_000 &&
    txns24h(market) >= 120
  );
}

function recentSignificantBuy(market: MarketToken, trades: MarketTokenTrade[]): MarketTokenTrade | null {
  const cutoff = now() - largeBuyLookbackMs();
  const minUsdThreshold = Math.max(
    numberEnv("ALERTS_LARGE_BUY_MIN_USD", 75, 10),
    Math.min(2_000, ((market.liquidityUsd ?? 0) * 0.0025)),
  );

  const candidates = trades
    .filter((trade) => trade.type.toLowerCase() === "buy")
    .filter((trade) => typeof trade.timestamp === "number" && trade.timestamp >= cutoff)
    .filter((trade) => (trade.baseTokenAmountUsd ?? trade.quoteTokenAmountUsd ?? 0) >= minUsdThreshold)
    .sort(
      (a, b) =>
        (b.baseTokenAmountUsd ?? b.quoteTokenAmountUsd ?? 0) -
        (a.baseTokenAmountUsd ?? a.quoteTokenAmountUsd ?? 0),
    );

  return candidates[0] ?? null;
}

function baseAlertSignal(
  market: MarketToken,
  source: AlertSignal["source"],
  kind: TriggerKind,
  description?: string,
  triggerOverrides: Partial<AlertSignal["trigger"]> = {},
): AlertSignal {
  return {
    source,
    token: {
      chain: alertChainFor(market.chainId),
      symbol: market.symbol,
      address: market.tokenAddress,
      name: market.name,
      pairAddress: market.pairAddress,
      pairUrl: market.url,
      dex: market.dexId,
    },
    market: {
      priceUsd: market.priceUsd,
      liquidityUsd: market.liquidityUsd,
      marketCapUsd: marketCapUsd(market),
      volume24hUsd: market.volume.h24,
      priceChange24hPct: market.priceChange.h24,
      holderCount: market.security?.holderCount,
      ageMinutes: market.ageMinutes,
      txns24h: txns24h(market),
      buys24h: market.txns.h24.buys,
      sells24h: market.txns.h24.sells,
      buyPressurePct: buyPressure(market),
    },
    trigger: {
      kind,
      description,
      ...triggerOverrides,
    },
    narrativeTags: dedupeTags(market),
    riskFlags: market.riskFlags,
    observedAt: new Date().toISOString(),
  };
}

function snapshotFor(market: MarketToken): MarketSnapshot {
  return {
    signalScore: market.signalScore,
    volume24hUsd: market.volume.h24,
    priceChangeH1: market.priceChange.h1,
    priceChangeH24: market.priceChange.h24,
    txns24h: txns24h(market),
    seenAt: now(),
  };
}

function limitItems<T>(items: T[], limit: number | null): T[] {
  return typeof limit === "number" ? items.slice(0, limit) : items;
}

function formatLimit(limit: number | null): string {
  return typeof limit === "number" ? String(limit) : "all";
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!values.length) return [];

  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= values.length) return;
      results[index] = await worker(values[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => runWorker()),
  );

  return results;
}

async function publishAutomaticSignal(signal: AlertSignal, market: MarketToken): Promise<boolean> {
  const result = await publishAlertSignal(signal, { dryRun: false });

  if (!result.telegram.published) {
    logger.warn(
      {
        symbol: market.symbol,
        chainId: market.chainId,
        kind: signal.trigger.kind,
        reason: result.telegram.reason,
      },
      "Automatic alert skipped before Telegram publish",
    );
    return false;
  }

  logger.info(
    {
      symbol: market.symbol,
      chainId: market.chainId,
      kind: signal.trigger.kind,
      score: result.alert.score,
      chatId: result.telegram.chatId,
      messageId: result.telegram.messageId,
    },
    "Automatic market alert published",
  );

  return true;
}

async function collectSummaryAlerts(markets: MarketToken[]): Promise<Array<{ market: MarketToken; signal: AlertSignal }>> {
  const alerts: Array<{ market: MarketToken; signal: AlertSignal }> = [];

  for (const market of markets) {
    const previous = state.snapshots.get(market.id);
    state.snapshots.set(market.id, snapshotFor(market));

    const trigger = summaryTriggerFor(market, previous);
    if (!trigger) continue;

    const key = cooldownKey(trigger.kind, market);
    if (hasActiveCooldown(key)) continue;

    alerts.push({
      market,
      signal: baseAlertSignal(market, "dexscreener", trigger.kind, trigger.description),
    });
  }

  return alerts;
}

async function collectLargeBuyAlerts(markets: MarketToken[]): Promise<Array<{ market: MarketToken; signal: AlertSignal }>> {
  const alerts: Array<{ market: MarketToken; signal: AlertSignal }> = [];
  const candidates = limitItems(
    [...markets]
    .filter(shouldInspectTrades)
    .sort((left, right) => {
      const leftFreshness = typeof left.ageMinutes === "number" ? left.ageMinutes : Number.POSITIVE_INFINITY;
      const rightFreshness = typeof right.ageMinutes === "number" ? right.ageMinutes : Number.POSITIVE_INFINITY;

      if (leftFreshness !== rightFreshness) return leftFreshness - rightFreshness;

      const rightTxns = txns24h(right);
      const leftTxns = txns24h(left);
      if (rightTxns !== leftTxns) return rightTxns - leftTxns;

      return right.signalScore - left.signalScore;
    }),
    detailLimit(),
  );

  const tradeBatches = await mapWithConcurrency(
    candidates,
    tradeFetchConcurrency(),
    async (market) => ({
      market,
      trades: await fetchMobulaTokenTrades(market.chainId, market.tokenAddress, 30),
    }),
  );

  for (const batch of tradeBatches) {
    const key = cooldownKey("large_buy", batch.market);
    if (hasActiveCooldown(key)) continue;

    const trade = recentSignificantBuy(batch.market, batch.trades);
    if (!trade) continue;

    alerts.push({
      market: batch.market,
      signal: baseAlertSignal(
        batch.market,
        "mobula",
        "large_buy",
        "A meaningful buy just hit a live token with enough momentum to matter.",
        {
          amountUsd: trade.baseTokenAmountUsd ?? trade.quoteTokenAmountUsd,
          tokenAmount: trade.baseTokenAmount,
          quoteAmount: trade.quoteTokenAmount,
          quoteSymbol: batch.market.quoteSymbol || batch.market.chainLabel,
          txHash: trade.transactionHash,
          walletAddress: trade.makerAddress ?? trade.senderAddress,
        },
      ),
    });
  }

  return alerts;
}

function dedupeMarkets(markets: MarketToken[]): MarketToken[] {
  const byId = new Map<string, MarketToken>();

  for (const market of markets) {
    const existing = byId.get(market.id);
    if (!existing || market.signalScore > existing.signalScore) {
      byId.set(market.id, market);
    }
  }

  return [...byId.values()];
}

function sortFreshMarkets(markets: MarketToken[]): MarketToken[] {
  return [...markets].sort((left, right) => {
    const leftAge = left.ageMinutes ?? Number.POSITIVE_INFINITY;
    const rightAge = right.ageMinutes ?? Number.POSITIVE_INFINITY;

    if (leftAge !== rightAge) return leftAge - rightAge;
    return right.signalScore - left.signalScore;
  });
}

function buildWatchedMarkets(
  trending: MarketToken[],
  fresh: MarketToken[],
  momentum: MarketToken[],
  microMomentum: MarketToken[],
  volumeLeaders: MarketToken[],
): MarketToken[] {
  const limit = watchLimit();
  const freshQuota = typeof limit === "number" ? Math.min(limit, freshWatchQuota()) : freshWatchQuota();
  const reservedFresh = sortFreshMarkets(dedupeMarkets(fresh)).slice(0, freshQuota);
  const reservedIds = new Set(reservedFresh.map((market) => market.id));
  const coreMarkets = limitItems(
    dedupeMarkets([...trending, ...momentum, ...microMomentum, ...volumeLeaders, ...fresh])
    .filter((market) => !reservedIds.has(market.id))
    .sort((a, b) => b.signalScore - a.signalScore),
    typeof limit === "number" ? Math.max(0, limit - reservedFresh.length) : null,
  );

  return [...reservedFresh, ...coreMarkets];
}

function summaryPriority(kind: SummaryTrigger["kind"]): number {
  switch (kind) {
    case "new_pair":
      return 0;
    case "price_breakout":
      return 1;
    case "volume_spike":
      return 2;
    default:
      return 99;
  }
}

function sortSummaryAlerts(alerts: QueuedAlert[]): QueuedAlert[] {
  return [...alerts].sort((left, right) => {
    const kindDelta =
      summaryPriority(left.signal.trigger.kind as SummaryTrigger["kind"]) -
      summaryPriority(right.signal.trigger.kind as SummaryTrigger["kind"]);

    if (kindDelta !== 0) return kindDelta;
    return right.market.signalScore - left.market.signalScore;
  });
}

function sortLargeBuyAlerts(alerts: QueuedAlert[]): QueuedAlert[] {
  return [...alerts].sort((left, right) => {
    const rightAmount = right.signal.trigger.amountUsd ?? 0;
    const leftAmount = left.signal.trigger.amountUsd ?? 0;

    if (rightAmount !== leftAmount) return rightAmount - leftAmount;
    return right.market.signalScore - left.market.signalScore;
  });
}

function buildPublishQueue(summaryAlerts: QueuedAlert[], largeBuyAlerts: QueuedAlert[]): QueuedAlert[] {
  const summaries = sortSummaryAlerts(summaryAlerts);
  const trades = sortLargeBuyAlerts(largeBuyAlerts);
  const queue: QueuedAlert[] = [];
  let nextGroup: "summary" | "trade" | null = summaries.length > 0 ? "summary" : trades.length > 0 ? "trade" : null;

  while (summaries.length > 0 || trades.length > 0) {
    if (nextGroup === "summary" && summaries.length > 0) {
      queue.push(summaries.shift()!);
      nextGroup = trades.length > 0 ? "trade" : "summary";
      continue;
    }

    if (nextGroup === "trade" && trades.length > 0) {
      queue.push(trades.shift()!);
      nextGroup = summaries.length > 0 ? "summary" : "trade";
      continue;
    }

    if (summaries.length > 0) {
      queue.push(summaries.shift()!);
      nextGroup = trades.length > 0 ? "trade" : "summary";
      continue;
    }

    if (trades.length > 0) {
      queue.push(trades.shift()!);
      nextGroup = summaries.length > 0 ? "summary" : "trade";
    }
  }

  return queue;
}

async function runSweep(): Promise<void> {
  if (state.running) {
    logger.warn("Skipping market alert sweep because the previous cycle is still running");
    return;
  }

  state.running = true;
  pruneCooldowns();

  try {
    const fullWatch = watchLimit() === null;
    const primaryLimit = watchLimit();
    const secondaryLimit =
      typeof primaryLimit === "number" ? Math.max(16, Math.ceil(primaryLimit * 0.75)) : null;
    const [trending, fresh, momentum, microMomentum, volumeLeaders] = await Promise.all([
      getMarketListings({ sort: "trending", limit: primaryLimit ?? undefined, all: fullWatch, enrich: false }),
      getMarketListings({ sort: "new", limit: secondaryLimit ?? undefined, all: fullWatch, enrich: false }),
      getMarketListings({ sort: "h1", limit: secondaryLimit ?? undefined, all: fullWatch, enrich: false }),
      getMarketListings({ sort: "m5", limit: secondaryLimit ?? undefined, all: fullWatch, enrich: false }),
      getMarketListings({ sort: "volume", limit: secondaryLimit ?? undefined, all: fullWatch, enrich: false }),
    ]);

    const markets = buildWatchedMarkets(
      trending.data,
      fresh.data,
      momentum.data,
      microMomentum.data,
      volumeLeaders.data,
    );

    const [summaryAlerts, largeBuyAlerts] = await Promise.all([
      collectSummaryAlerts(markets),
      collectLargeBuyAlerts(markets),
    ]);

    const queued = buildPublishQueue(summaryAlerts, largeBuyAlerts);
    let published = 0;
    const publishedMarkets = new Set<string>();

    for (const item of queued) {
      if (published >= maxAlertsPerCycle()) break;
      if (publishedMarkets.has(item.market.id)) continue;

      const key = cooldownKey(item.signal.trigger.kind, item.market);
      if (hasActiveCooldown(key)) continue;

      try {
        const didPublish = await publishAutomaticSignal(item.signal, item.market);
        if (!didPublish) continue;

        armCooldown(key, item.signal.trigger.kind);
        publishedMarkets.add(item.market.id);
        published += 1;
      } catch (error) {
        logger.error(
          {
            err: error,
            symbol: item.market.symbol,
            chainId: item.market.chainId,
            kind: item.signal.trigger.kind,
          },
          "Automatic market alert publish failed",
        );
      }
    }

    logger.info(
      {
        watchedMarkets: markets.length,
        reservedFreshMarkets: Math.min(markets.length, freshWatchQuota()),
        summaryCandidates: summaryAlerts.length,
        newPairCandidates: summaryAlerts.filter((item) => item.signal.trigger.kind === "new_pair").length,
        breakoutCandidates: summaryAlerts.filter((item) => item.signal.trigger.kind === "price_breakout").length,
        volumeSpikeCandidates: summaryAlerts.filter((item) => item.signal.trigger.kind === "volume_spike").length,
        largeBuyCandidates: largeBuyAlerts.length,
        published,
      },
      "Market alert sweep completed",
    );
  } catch (error) {
    logger.error({ err: error }, "Market alert sweep failed");
  } finally {
    state.running = false;
  }
}

export function startMarketAlertWorker(): void {
  if (state.started) return;

  if (!boolEnv("ALERTS_AUTO_PUBLISH", false)) {
    logger.info("Automatic market alerts are disabled");
    return;
  }

  state.started = true;

  logger.info(
    {
      intervalMs: pollIntervalMs(),
      watchLimit: formatLimit(watchLimit()),
      detailLimit: formatLimit(detailLimit()),
      tradeFetchConcurrency: tradeFetchConcurrency(),
      maxAlertsPerCycle: maxAlertsPerCycle(),
    },
    "Starting automatic market alert worker",
  );

  void runSweep();
  state.interval = setInterval(() => {
    void runSweep();
  }, pollIntervalMs());
  state.interval.unref?.();
}
