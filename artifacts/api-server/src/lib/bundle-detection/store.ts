import { and, desc, eq, or, sql, type SQL } from "drizzle-orm";
import type {
  MarketBundleAnalysis,
  MarketBundleHolderPnl,
  MarketBundleLabel,
  MarketBundleReason,
  MarketToken,
} from "../markets/types";
import { publishTelegramMessage } from "../alerts/telegram";
import { anyAlphaTokenUrl } from "../markets/provider-utils";

type DbModule = typeof import("@workspace/db");
type BundleAnalysisRow = import("@workspace/db").BundleAnalysisRow;
type HolderPnlSnapshotRow = import("@workspace/db").HolderPnlSnapshotRow;
type BundleReasonPayload = import("@workspace/db").BundleReasonPayload;
type WalletTrackerChain = "solana" | "ethereum" | "base" | "arbitrum" | "bsc" | "polygon" | "optimism" | "sui" | "aptos";

let dbModulePromise: Promise<DbModule> | null = null;

export interface BundleLaunchTransactionInput {
  walletAddress: string;
  blockNumber?: string | number;
  timestamp?: string | number;
  tokenAmount?: number;
  supplyPct?: number;
  buyAmountNative?: number;
  buyAmountUsd?: number;
  fundingSource?: string;
  walletAgeDays?: number;
  deployerConnected?: boolean;
  isBot?: boolean;
}

export interface BundleAnalysisInput {
  chain: string;
  tokenAddress: string;
  pairAddress?: string;
  deployerRugs?: number;
  totalSupply?: number;
  bundleWalletsPnl?: number;
  retailAvgPnl?: number;
  bundleStillHolding?: boolean;
  evidence?: Record<string, unknown>;
  transactions: BundleLaunchTransactionInput[];
}

export interface StoredBundleAnalysis extends MarketBundleAnalysis {
  chain: string;
  tokenAddress: string;
}

const UNKNOWN_BUNDLE_ANALYSIS: MarketBundleAnalysis = {
  label: "unknown",
  score: 0,
  coordinatedWallets: 0,
  supplySnipedPct: 0,
  sniperWallets: 0,
  deployerRugs: 0,
  bundleStillHolding: true,
  reasons: [
    {
      code: "insufficient_launch_data",
      label: "Insufficient launch data",
      detail: "AnyAlpha has not processed enough first-buy evidence to classify this token yet.",
    },
  ],
  evidence: {
    status: "pending_analysis",
  },
};
const WALLET_TRACKER_CHAINS = new Set<WalletTrackerChain>(["solana", "ethereum", "base", "arbitrum", "bsc", "polygon", "optimism", "sui", "aptos"]);

function normalizeChain(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function toDbDecimal(value: number | undefined): string | undefined {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}

function toCents(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) : undefined;
}

function trackerTags(analysis: MarketBundleAnalysis, wallet: BundleLaunchTransactionInput): string[] {
  const tags = ["bundle-watch"];
  if (analysis.label === "bundled") tags.push("bundle-wallet");
  if (analysis.label === "suspicious") tags.push("suspicious-launch");
  if (wallet.isBot || analysis.sniperWallets > 0) tags.push("sniper");
  if (typeof wallet.walletAgeDays === "number" && wallet.walletAgeDays < 7) tags.push("fresh-wallet");
  if (wallet.fundingSource) tags.push("funding-cluster");
  return Array.from(new Set(tags));
}

function walletTrackerScore(analysis: MarketBundleAnalysis, wallet: BundleLaunchTransactionInput): number {
  const base = Math.max(0, 100 - analysis.score);
  const penalty = (wallet.isBot ? 15 : 0) + (wallet.fundingSource ? 8 : 0);
  return Math.max(0, Math.min(100, Math.round(base - penalty)));
}

function keyFor(chain: string, tokenAddress: string): string {
  return `${normalizeChain(chain)}:${normalizeAddress(tokenAddress)}`;
}

async function getDbModule(): Promise<DbModule> {
  if (dbModulePromise) return dbModulePromise;

  dbModulePromise = (async () => {
    const databaseUrl = (process.env["DATABASE_URL"] ?? "").trim();
    if (!databaseUrl) {
      throw new Error("DATABASE_URL must be configured to use bundle detection storage.");
    }

    return import("@workspace/db");
  })();

  return dbModulePromise;
}

function unknownBundleAnalysis(): MarketBundleAnalysis {
  return {
    ...UNKNOWN_BUNDLE_ANALYSIS,
    reasons: [...UNKNOWN_BUNDLE_ANALYSIS.reasons],
    evidence: { ...UNKNOWN_BUNDLE_ANALYSIS.evidence },
  };
}

function rowToHolderPnl(row: HolderPnlSnapshotRow | undefined): MarketBundleHolderPnl | undefined {
  if (!row) return undefined;

  return {
    inProfitPct: finiteNumber(row.inProfitPct),
    breakevenPct: finiteNumber(row.breakevenPct),
    inLossPct: finiteNumber(row.inLossPct),
    bundlePnl: finiteNumber(row.bundlePnl),
    retailPnl: finiteNumber(row.retailPnl),
    snapshotAt: row.snapshotAt?.toISOString(),
  };
}

function rowToBundle(row: BundleAnalysisRow, holderPnlRow?: HolderPnlSnapshotRow): StoredBundleAnalysis {
  return {
    chain: row.chain,
    tokenAddress: row.tokenAddress,
    label: row.label,
    score: row.score,
    coordinatedWallets: row.coordinatedWallets,
    supplySnipedPct: finiteNumber(row.supplySnipedPct) ?? 0,
    sniperWallets: row.sniperWallets,
    deployerRugs: row.deployerRugs,
    bundleWalletsPnl: finiteNumber(row.bundleWalletsPnl),
    retailAvgPnl: finiteNumber(row.retailAvgPnl),
    bundleStillHolding: row.bundleStillHolding,
    holderPnl: rowToHolderPnl(holderPnlRow),
    reasons: Array.isArray(row.reasons) ? (row.reasons as unknown as MarketBundleReason[]) : [],
    evidence: row.evidence ?? {},
    analyzedAt: row.analyzedAt?.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
  };
}

function toDbReasons(reasons: MarketBundleReason[]): BundleReasonPayload[] {
  return reasons.map((reason) => ({
    code: reason.code,
    label: reason.label,
    ...(reason.detail ? { detail: reason.detail } : {}),
    ...(typeof reason.scoreImpact === "number" ? { scoreImpact: reason.scoreImpact } : {}),
  }));
}

function bundleAlertEnabled(): boolean {
  const raw = process.env["ANYALPHA_BUNDLE_ALERTS_ENABLED"]?.trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

function formatPct(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}

async function publishBundleDetectedAlert(input: {
  chain: string;
  tokenAddress: string;
  pairAddress?: string;
  analysis: MarketBundleAnalysis;
}) {
  if (!bundleAlertEnabled()) return;

  const url = anyAlphaTokenUrl(input.chain, input.tokenAddress);
  const strongestReason = input.analysis.reasons
    .slice()
    .sort((left, right) => (right.scoreImpact ?? 0) - (left.scoreImpact ?? 0))[0];
  const lines = [
    "🔴 BUNDLE DETECTED",
    "",
    `${input.chain.toUpperCase()} token: ${input.tokenAddress}`,
    `Score: ${input.analysis.score}/100`,
    `Coordinated wallets: ${input.analysis.coordinatedWallets}`,
    `Supply sniped: ${formatPct(input.analysis.supplySnipedPct)}`,
    `Sniper wallets: ${input.analysis.sniperWallets}`,
    strongestReason ? `Signal: ${strongestReason.label}` : undefined,
    strongestReason?.detail,
    "",
    "Bundle wallets should be monitored before retail momentum is trusted.",
    url,
  ].filter((line): line is string => Boolean(line));

  await publishTelegramMessage(lines.join("\n"), {
    buttons: [[{ text: "Open Token", url }]],
  });
}

async function upsertBundleWalletsIntoTracker(input: {
  analysis: BundleAnalysisRow;
  scoredAnalysis: MarketBundleAnalysis;
  wallets: BundleLaunchTransactionInput[];
}): Promise<void> {
  const chain = normalizeChain(input.analysis.chain);
  if (!WALLET_TRACKER_CHAINS.has(chain as WalletTrackerChain) || input.wallets.length === 0) return;

  const { db, trackedWalletsTable } = await getDbModule();
  const now = new Date();
  await Promise.all(
    input.wallets.slice(0, 100).map((wallet) => {
      const address = wallet.walletAddress.trim();
      const tags = trackerTags(input.scoredAnalysis, wallet);
      const metadata = {
        source: "bundle_detection",
        tokenAddress: input.analysis.tokenAddress,
        pairAddress: input.analysis.pairAddress,
        bundleLabel: input.scoredAnalysis.label,
        bundleScore: input.scoredAnalysis.score,
        supplyPct: wallet.supplyPct,
        blockNumber: wallet.blockNumber,
        fundingSource: wallet.fundingSource,
        walletAgeDays: wallet.walletAgeDays,
        detectedAt: now.toISOString(),
      };

      return db
        .insert(trackedWalletsTable)
        .values({
          chain: chain as WalletTrackerChain,
          address,
          addressNormalized: normalizeAddress(address),
          label: tags.includes("sniper") ? "Bundle sniper wallet" : "Bundle watch wallet",
          source: "bundle_detection",
          score: walletTrackerScore(input.scoredAnalysis, wallet),
          riskLevel: input.scoredAnalysis.label === "bundled" ? "high" : "medium",
          tags,
          metadata,
          lastActiveAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [trackedWalletsTable.chain, trackedWalletsTable.addressNormalized],
          set: {
            label: sql`coalesce(${trackedWalletsTable.label}, ${tags.includes("sniper") ? "Bundle sniper wallet" : "Bundle watch wallet"})`,
            score: walletTrackerScore(input.scoredAnalysis, wallet),
            riskLevel: input.scoredAnalysis.label === "bundled" ? "high" : "medium",
            tags: sql`${trackedWalletsTable.tags} || ${JSON.stringify(tags)}::jsonb`,
            metadata: sql`${trackedWalletsTable.metadata} || ${JSON.stringify(metadata)}::jsonb`,
            lastActiveAt: now,
            updatedAt: now,
          },
        });
    }),
  );
}

function labelFromScore(score: number, completeOrganicEvidence: boolean): MarketBundleLabel {
  if (score >= 51) return "bundled";
  if (score >= 26) return "suspicious";
  return completeOrganicEvidence ? "organic" : "unknown";
}

function blockKey(tx: BundleLaunchTransactionInput): string | null {
  if (tx.blockNumber !== undefined && tx.blockNumber !== null && String(tx.blockNumber).trim()) {
    return `block:${String(tx.blockNumber).trim()}`;
  }

  const timestamp = finiteNumber(tx.timestamp);
  if (timestamp === undefined) return null;
  const millis = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
  return `second:${Math.floor(millis / 1000)}`;
}

function groupedMaxSize(values: string[]): number {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Math.max(0, ...counts.values());
}

function sourceClusters(transactions: BundleLaunchTransactionInput[]): Map<string, BundleLaunchTransactionInput[]> {
  const clusters = new Map<string, BundleLaunchTransactionInput[]>();

  for (const tx of transactions) {
    const source = tx.fundingSource?.trim().toLowerCase();
    if (!source) continue;
    const rows = clusters.get(source) ?? [];
    rows.push(tx);
    clusters.set(source, rows);
  }

  return clusters;
}

function scoreLaunchEvidence(input: BundleAnalysisInput): {
  analysis: MarketBundleAnalysis;
  bundleWallets: BundleLaunchTransactionInput[];
} {
  const transactions = input.transactions
    .filter((tx) => tx.walletAddress?.trim())
    .slice(0, 200);
  const reasons: MarketBundleReason[] = [];
  const blockKeys = transactions.map(blockKey).filter((key): key is string => Boolean(key));
  const fundingClusters = sourceClusters(transactions.slice(0, 50));
  const fundingClusterSizes = Array.from(fundingClusters.values()).map((cluster) => cluster.length);
  const maxSameBlock = groupedMaxSize(blockKeys);
  const maxFundingCluster = Math.max(0, ...fundingClusterSizes);
  const deployerConnected = transactions.filter((tx) => tx.deployerConnected).length;
  const freshWallets = transactions.filter((tx) => typeof tx.walletAgeDays === "number" && tx.walletAgeDays < 7).length;
  const explicitBots = transactions.filter((tx) => tx.isBot).length;
  const deployerRugs = Math.max(0, Math.round(input.deployerRugs ?? 0));
  const topFiveSupply = transactions
    .slice(0, 5)
    .reduce((sum, tx) => sum + Math.max(0, tx.supplyPct ?? 0), 0);
  const sniperWallets = Math.max(explicitBots, maxSameBlock >= 3 ? maxSameBlock : 0);
  const hasBlockEvidence = blockKeys.length >= Math.min(10, transactions.length);
  const hasFundingEvidence = Array.from(fundingClusters.values()).flat().length >= 10;
  const hasSupplyEvidence = transactions.some((tx) => typeof tx.supplyPct === "number");
  const completeOrganicEvidence = transactions.length >= 25 && hasBlockEvidence && hasFundingEvidence && hasSupplyEvidence;
  let score = 0;

  if (maxSameBlock >= 10) {
    score += 30;
    reasons.push({ code: "same_block_cluster", label: "Heavy same-block buying", detail: `${maxSameBlock} wallets bought in the same launch block/window.`, scoreImpact: 30 });
  } else if (maxSameBlock >= 5) {
    score += 20;
    reasons.push({ code: "same_block_cluster", label: "Same-block buyer cluster", detail: `${maxSameBlock} wallets bought in the same launch block/window.`, scoreImpact: 20 });
  } else if (maxSameBlock >= 3) {
    score += 10;
    reasons.push({ code: "same_block_cluster", label: "Small same-block cluster", detail: `${maxSameBlock} wallets bought together at launch.`, scoreImpact: 10 });
  }

  if (maxFundingCluster >= 8) {
    score += 25;
    reasons.push({ code: "shared_funding_source", label: "Shared funding source", detail: `${maxFundingCluster} launch wallets trace to the same funder.`, scoreImpact: 25 });
  } else if (maxFundingCluster >= 4) {
    score += 15;
    reasons.push({ code: "shared_funding_source", label: "Funding cluster", detail: `${maxFundingCluster} launch wallets share a funding source.`, scoreImpact: 15 });
  } else if (maxFundingCluster >= 2) {
    score += 8;
    reasons.push({ code: "shared_funding_source", label: "Possible funding link", detail: `${maxFundingCluster} launch wallets share a funding source.`, scoreImpact: 8 });
  }

  if (topFiveSupply >= 40) {
    score += 20;
    reasons.push({ code: "launch_supply_concentration", label: "High launch supply capture", detail: `First five buyers captured ${topFiveSupply.toFixed(1)}% of supply.`, scoreImpact: 20 });
  } else if (topFiveSupply >= 25) {
    score += 12;
    reasons.push({ code: "launch_supply_concentration", label: "Elevated launch concentration", detail: `First five buyers captured ${topFiveSupply.toFixed(1)}% of supply.`, scoreImpact: 12 });
  } else if (topFiveSupply >= 15) {
    score += 6;
    reasons.push({ code: "launch_supply_concentration", label: "Launch concentration", detail: `First five buyers captured ${topFiveSupply.toFixed(1)}% of supply.`, scoreImpact: 6 });
  }

  if (deployerRugs >= 3) {
    score += 15;
    reasons.push({ code: "deployer_history", label: "Deployer rug history", detail: `${deployerRugs} prior deployer rug signals were supplied.`, scoreImpact: 15 });
  } else if (deployerRugs >= 1) {
    score += 8;
    reasons.push({ code: "deployer_history", label: "Deployer risk history", detail: `${deployerRugs} prior deployer rug signal was supplied.`, scoreImpact: 8 });
  }

  const sniperRisk = Math.max(explicitBots, freshWallets >= 5 ? 5 : freshWallets >= 2 ? 2 : freshWallets >= 1 ? 1 : 0);
  if (sniperRisk >= 5) {
    score += 10;
    reasons.push({ code: "sniper_or_fresh_wallets", label: "Bot/fresh-wallet snipers", detail: `${sniperRisk} sniper or fresh-wallet signals detected.`, scoreImpact: 10 });
  } else if (sniperRisk >= 2) {
    score += 6;
    reasons.push({ code: "sniper_or_fresh_wallets", label: "Fresh launch wallets", detail: `${sniperRisk} sniper or fresh-wallet signals detected.`, scoreImpact: 6 });
  } else if (sniperRisk >= 1) {
    score += 3;
    reasons.push({ code: "sniper_or_fresh_wallets", label: "Single sniper signal", detail: "One sniper or fresh-wallet signal detected.", scoreImpact: 3 });
  }

  if (deployerConnected > 0) {
    score = Math.min(100, score + Math.min(15, deployerConnected * 4));
    reasons.push({ code: "deployer_connection", label: "Deployer-linked buyers", detail: `${deployerConnected} launch wallets had a supplied deployer connection.` });
  }

  score = Math.min(100, score);
  const label = transactions.length < 10 ? "unknown" : labelFromScore(score, completeOrganicEvidence);
  if (label === "unknown" && reasons.length === 0) {
    reasons.push({
      code: "insufficient_launch_data",
      label: "Insufficient launch data",
      detail: "Classification is pending until first-buy timing, funding, and supply evidence are available.",
    });
  }
  if (label === "organic") {
    reasons.push({
      code: "organic_launch_pattern",
      label: "Organic launch pattern",
      detail: "Launch buyers were sufficiently diverse across block timing, funding, and supply checks.",
    });
  }

  const bundleWalletSet = new Set<string>();
  for (const cluster of fundingClusters.values()) {
    if (cluster.length >= 2) cluster.forEach((tx) => bundleWalletSet.add(normalizeAddress(tx.walletAddress)));
  }
  if (maxSameBlock >= 3) {
    const counts = new Map<string, BundleLaunchTransactionInput[]>();
    for (const tx of transactions) {
      const key = blockKey(tx);
      if (!key) continue;
      const rows = counts.get(key) ?? [];
      rows.push(tx);
      counts.set(key, rows);
    }
    for (const rows of counts.values()) {
      if (rows.length >= 3) rows.forEach((tx) => bundleWalletSet.add(normalizeAddress(tx.walletAddress)));
    }
  }
  transactions
    .filter((tx) => tx.isBot || tx.deployerConnected || (typeof tx.walletAgeDays === "number" && tx.walletAgeDays < 7))
    .forEach((tx) => bundleWalletSet.add(normalizeAddress(tx.walletAddress)));

  const analysis: MarketBundleAnalysis = {
    label,
    score,
    coordinatedWallets: Math.max(maxSameBlock, maxFundingCluster),
    supplySnipedPct: topFiveSupply,
    sniperWallets,
    deployerRugs,
    bundleWalletsPnl: input.bundleWalletsPnl,
    retailAvgPnl: input.retailAvgPnl,
    bundleStillHolding: input.bundleStillHolding ?? true,
    reasons,
    evidence: {
      ...(input.evidence ?? {}),
      transactionsScanned: transactions.length,
      blockEvidenceCount: blockKeys.length,
      fundingTraceCount: Array.from(fundingClusters.values()).flat().length,
      supplyEvidenceCount: transactions.filter((tx) => typeof tx.supplyPct === "number").length,
      maxSameBlock,
      maxFundingCluster,
      topFiveSupplyPct: topFiveSupply,
      completeOrganicEvidence,
      version: input.evidence?.["version"] ?? "phase-1",
    },
    analyzedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    analysis,
    bundleWallets: transactions.filter((tx) => bundleWalletSet.has(normalizeAddress(tx.walletAddress))),
  };
}

export async function getBundleAnalysis(chain: string, tokenAddress: string): Promise<MarketBundleAnalysis> {
  try {
    const { db, bundleAnalysisTable, holderPnlSnapshotsTable } = await getDbModule();
    const rows = await db
      .select()
      .from(bundleAnalysisTable)
      .where(
        and(
          eq(bundleAnalysisTable.chain, normalizeChain(chain)),
          eq(bundleAnalysisTable.tokenAddressNormalized, normalizeAddress(tokenAddress)),
        ),
      )
      .limit(1);

    if (!rows[0]) return unknownBundleAnalysis();

    const holderPnlRows = await db
      .select()
      .from(holderPnlSnapshotsTable)
      .where(
        and(
          eq(holderPnlSnapshotsTable.chain, normalizeChain(chain)),
          eq(holderPnlSnapshotsTable.tokenAddressNormalized, normalizeAddress(tokenAddress)),
        ),
      )
      .orderBy(desc(holderPnlSnapshotsTable.snapshotAt))
      .limit(1);

    return rowToBundle(rows[0], holderPnlRows[0]);
  } catch {
    return unknownBundleAnalysis();
  }
}

export async function getBundleAnalysesForTokens(tokens: Pick<MarketToken, "chainId" | "tokenAddress">[]): Promise<Map<string, MarketBundleAnalysis>> {
  const result = new Map<string, MarketBundleAnalysis>();
  const uniqueTokens = Array.from(
    new Map(tokens.map((token) => [keyFor(token.chainId, token.tokenAddress), token])).values(),
  ).slice(0, 120);

  for (const token of uniqueTokens) {
    result.set(keyFor(token.chainId, token.tokenAddress), unknownBundleAnalysis());
  }

  if (uniqueTokens.length === 0) return result;

  try {
    const { db, bundleAnalysisTable, holderPnlSnapshotsTable } = await getDbModule();
    const analysisClauses = uniqueTokens
      .map((token) =>
        and(
          eq(bundleAnalysisTable.chain, normalizeChain(token.chainId)),
          eq(bundleAnalysisTable.tokenAddressNormalized, normalizeAddress(token.tokenAddress)),
        ),
      )
      .filter((clause): clause is SQL => Boolean(clause));
    const analysisWhereClause = analysisClauses.length === 1 ? analysisClauses[0] : or(...analysisClauses);
    if (!analysisWhereClause) return result;

    const rows = await db
      .select()
      .from(bundleAnalysisTable)
      .where(analysisWhereClause);

    const snapshotClauses = uniqueTokens
      .map((token) =>
        and(
          eq(holderPnlSnapshotsTable.chain, normalizeChain(token.chainId)),
          eq(holderPnlSnapshotsTable.tokenAddressNormalized, normalizeAddress(token.tokenAddress)),
        ),
      )
      .filter((clause): clause is SQL => Boolean(clause));
    const snapshotWhereClause = snapshotClauses.length === 1 ? snapshotClauses[0] : or(...snapshotClauses);
    const snapshotRows = snapshotWhereClause
      ? await db
          .select()
          .from(holderPnlSnapshotsTable)
          .where(snapshotWhereClause)
          .orderBy(desc(holderPnlSnapshotsTable.snapshotAt))
      : [];
    const snapshotsByToken = new Map<string, HolderPnlSnapshotRow>();

    for (const row of snapshotRows) {
      const key = keyFor(row.chain, row.tokenAddress);
      if (!snapshotsByToken.has(key)) snapshotsByToken.set(key, row);
    }

    for (const row of rows) {
      result.set(keyFor(row.chain, row.tokenAddress), rowToBundle(row, snapshotsByToken.get(keyFor(row.chain, row.tokenAddress))));
    }
  } catch {
    // Keep safe unknown labels if storage is unavailable or tables have not been pushed yet.
  }

  return result;
}

export async function attachBundleAnalysesToTokens<T extends Pick<MarketToken, "chainId" | "tokenAddress">>(
  tokens: T[],
): Promise<Array<T & { bundle: MarketBundleAnalysis }>> {
  const analyses = await getBundleAnalysesForTokens(tokens);

  return tokens.map((token) => ({
    ...token,
    bundle: analyses.get(keyFor(token.chainId, token.tokenAddress)) ?? unknownBundleAnalysis(),
  }));
}

export async function analyzeAndStoreBundle(input: BundleAnalysisInput): Promise<StoredBundleAnalysis> {
  const chain = normalizeChain(input.chain);
  const tokenAddress = input.tokenAddress.trim();
  const tokenAddressNormalized = normalizeAddress(input.tokenAddress);
  const scored = scoreLaunchEvidence(input);
  const { db, bundleAnalysisTable, bundleWalletsTable, sniperRegistryTable } = await getDbModule();
  const now = new Date();
  const reasons = toDbReasons(scored.analysis.reasons);
  const previousRows = await db
    .select({ label: bundleAnalysisTable.label })
    .from(bundleAnalysisTable)
    .where(and(eq(bundleAnalysisTable.chain, chain), eq(bundleAnalysisTable.tokenAddressNormalized, tokenAddressNormalized)))
    .limit(1);
  const previousLabel = previousRows[0]?.label;

  const rows = await db
    .insert(bundleAnalysisTable)
    .values({
      chain,
      tokenAddress,
      tokenAddressNormalized,
      pairAddress: input.pairAddress,
      label: scored.analysis.label,
      score: scored.analysis.score,
      coordinatedWallets: scored.analysis.coordinatedWallets,
      supplySnipedPct: toDbDecimal(scored.analysis.supplySnipedPct) ?? "0",
      sniperWallets: scored.analysis.sniperWallets,
      deployerRugs: scored.analysis.deployerRugs,
      bundleWalletsPnl: toDbDecimal(scored.analysis.bundleWalletsPnl),
      retailAvgPnl: toDbDecimal(scored.analysis.retailAvgPnl),
      bundleStillHolding: scored.analysis.bundleStillHolding ?? true,
      evidence: scored.analysis.evidence,
      reasons,
      analyzedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [bundleAnalysisTable.chain, bundleAnalysisTable.tokenAddressNormalized],
      set: {
        pairAddress: input.pairAddress,
        label: scored.analysis.label,
        score: scored.analysis.score,
        coordinatedWallets: scored.analysis.coordinatedWallets,
        supplySnipedPct: toDbDecimal(scored.analysis.supplySnipedPct) ?? "0",
        sniperWallets: scored.analysis.sniperWallets,
        deployerRugs: scored.analysis.deployerRugs,
        bundleWalletsPnl: toDbDecimal(scored.analysis.bundleWalletsPnl),
        retailAvgPnl: toDbDecimal(scored.analysis.retailAvgPnl),
        bundleStillHolding: scored.analysis.bundleStillHolding ?? true,
        evidence: scored.analysis.evidence,
        reasons,
        analyzedAt: now,
        updatedAt: now,
      },
    })
    .returning();

  const analysis = rows[0];
  if (!analysis) throw new Error("Bundle analysis could not be saved.");

  if (scored.bundleWallets.length > 0) {
    await Promise.all(
      scored.bundleWallets.slice(0, 100).map((wallet) =>
        db
          .insert(bundleWalletsTable)
          .values({
            analysisId: analysis.id,
            chain,
            tokenAddress,
            tokenAddressNormalized,
            walletAddress: wallet.walletAddress,
            walletAddressNormalized: normalizeAddress(wallet.walletAddress),
            blockNumber: wallet.blockNumber === undefined ? undefined : String(wallet.blockNumber),
            buyAmountNative: toDbDecimal(wallet.buyAmountNative),
            buyAmountUsdCents: toCents(wallet.buyAmountUsd),
            supplyPct: toDbDecimal(wallet.supplyPct),
            fundingSource: wallet.fundingSource,
            walletAgeDays: wallet.walletAgeDays,
            isBot: wallet.isBot ?? false,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [bundleWalletsTable.chain, bundleWalletsTable.tokenAddressNormalized, bundleWalletsTable.walletAddressNormalized],
            set: {
              analysisId: analysis.id,
              blockNumber: wallet.blockNumber === undefined ? undefined : String(wallet.blockNumber),
              buyAmountNative: toDbDecimal(wallet.buyAmountNative),
              buyAmountUsdCents: toCents(wallet.buyAmountUsd),
              supplyPct: toDbDecimal(wallet.supplyPct),
              fundingSource: wallet.fundingSource,
              walletAgeDays: wallet.walletAgeDays,
              isBot: wallet.isBot ?? false,
              updatedAt: now,
            },
          }),
      ),
    );

    const sniperWallets = scored.bundleWallets.filter((wallet) => wallet.isBot || scored.analysis.sniperWallets > 0);
    await Promise.all(
      sniperWallets.slice(0, 50).map((wallet) =>
        db
          .insert(sniperRegistryTable)
          .values({
            chain,
            walletAddress: wallet.walletAddress,
            walletAddressNormalized: normalizeAddress(wallet.walletAddress),
            isBot: wallet.isBot ?? false,
            lastSeen: now,
          })
          .onConflictDoUpdate({
            target: [sniperRegistryTable.chain, sniperRegistryTable.walletAddressNormalized],
            set: {
              snipeCount: sql`${sniperRegistryTable.snipeCount} + 1`,
              isBot: wallet.isBot ?? false,
              lastSeen: now,
            },
          }),
      ),
    );

    await upsertBundleWalletsIntoTracker({
      analysis,
      scoredAnalysis: scored.analysis,
      wallets: scored.bundleWallets,
    }).catch(() => {});
  }

  if (analysis.label === "bundled" && previousLabel !== "bundled") {
    await publishBundleDetectedAlert({
      chain,
      tokenAddress,
      pairAddress: input.pairAddress,
      analysis: rowToBundle(analysis),
    }).catch(() => {});
  }

  return rowToBundle(analysis);
}
