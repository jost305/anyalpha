import { and, eq } from "drizzle-orm";

export type TradingAuditStatus = "quote_requested" | "quote_ready" | "approval_submitted" | "submitted" | "failed";

export interface TradingAuditQuoteInput {
  userId: string;
  provider: string;
  chainId: string;
  walletAddress: string;
  tokenAddress: string;
  pairAddress?: string;
  side: "buy" | "sell";
  inputAmount: string;
  inputAmountRaw?: string;
  slippageBps: number;
}

export interface TradingAuditReadyInput {
  auditId: string;
  userId: string;
  inputSymbol?: string;
  outputSymbol?: string;
  inputAmountRaw?: string;
  outputAmount?: string;
  outputAmountRaw?: string;
  priceImpactPct?: string;
  quotePayload: Record<string, unknown>;
  safetyPayload: Record<string, unknown>;
}

export interface TradingAuditSubmittedInput {
  auditId: string;
  userId: string;
  transactionHash: string;
  approvalTransactionHash?: string;
}

type DbModule = typeof import("@workspace/db");
type TradingSwapAuditRow = import("@workspace/db").TradingSwapAuditRow;

let dbModulePromise: Promise<DbModule> | null = null;

async function getDbModule(): Promise<DbModule> {
  if (dbModulePromise) return dbModulePromise;

  dbModulePromise = (async () => {
    const databaseUrl = (process.env["DATABASE_URL"] ?? "").trim();

    if (!databaseUrl) {
      throw new Error("DATABASE_URL must be configured to use trading audit storage.");
    }

    return import("@workspace/db");
  })();

  return dbModulePromise;
}

function now() {
  return new Date();
}

function serializeRow(row: TradingSwapAuditRow) {
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    chainId: row.chainId,
    walletAddress: row.walletAddress,
    tokenAddress: row.tokenAddress,
    pairAddress: row.pairAddress ?? undefined,
    side: row.side,
    inputSymbol: row.inputSymbol ?? undefined,
    outputSymbol: row.outputSymbol ?? undefined,
    inputAmount: row.inputAmount,
    inputAmountRaw: row.inputAmountRaw ?? undefined,
    outputAmount: row.outputAmount ?? undefined,
    outputAmountRaw: row.outputAmountRaw ?? undefined,
    slippageBps: row.slippageBps,
    priceImpactPct: row.priceImpactPct ?? undefined,
    status: row.status,
    approvalTransactionHash: row.approvalTransactionHash ?? undefined,
    transactionHash: row.transactionHash ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString(),
  };
}

export async function createTradingAudit(input: TradingAuditQuoteInput) {
  const { db, tradingSwapAuditsTable } = await getDbModule();
  const [row] = await db
    .insert(tradingSwapAuditsTable)
    .values({
      userId: input.userId,
      provider: input.provider,
      chainId: input.chainId,
      walletAddress: input.walletAddress,
      tokenAddress: input.tokenAddress,
      pairAddress: input.pairAddress,
      side: input.side,
      inputAmount: input.inputAmount,
      inputAmountRaw: input.inputAmountRaw,
      slippageBps: input.slippageBps,
      status: "quote_requested",
      updatedAt: now(),
    })
    .returning();

  if (!row) throw new Error("Trading audit row was not created.");
  return serializeRow(row);
}

export async function markTradingQuoteReady(input: TradingAuditReadyInput) {
  const { db, tradingSwapAuditsTable } = await getDbModule();
  const [row] = await db
    .update(tradingSwapAuditsTable)
    .set({
      inputSymbol: input.inputSymbol,
      outputSymbol: input.outputSymbol,
      inputAmountRaw: input.inputAmountRaw,
      outputAmount: input.outputAmount,
      outputAmountRaw: input.outputAmountRaw,
      priceImpactPct: input.priceImpactPct,
      quotePayload: input.quotePayload,
      safetyPayload: input.safetyPayload,
      status: "quote_ready",
      error: null,
      updatedAt: now(),
    })
    .where(and(eq(tradingSwapAuditsTable.id, input.auditId), eq(tradingSwapAuditsTable.userId, input.userId)))
    .returning();

  if (!row) throw new Error("Trading audit row was not found.");
  return serializeRow(row);
}

export async function markTradingAuditFailed(auditId: string, userId: string, error: string) {
  const { db, tradingSwapAuditsTable } = await getDbModule();
  const [row] = await db
    .update(tradingSwapAuditsTable)
    .set({
      status: "failed",
      error,
      updatedAt: now(),
    })
    .where(and(eq(tradingSwapAuditsTable.id, auditId), eq(tradingSwapAuditsTable.userId, userId)))
    .returning();

  return row ? serializeRow(row) : null;
}

export async function markTradingApprovalSubmitted(auditId: string, userId: string, approvalTransactionHash: string) {
  const { db, tradingSwapAuditsTable } = await getDbModule();
  const [row] = await db
    .update(tradingSwapAuditsTable)
    .set({
      status: "approval_submitted",
      approvalTransactionHash,
      updatedAt: now(),
    })
    .where(and(eq(tradingSwapAuditsTable.id, auditId), eq(tradingSwapAuditsTable.userId, userId)))
    .returning();

  if (!row) throw new Error("Trading audit row was not found.");
  return serializeRow(row);
}

export async function markTradingSubmitted(input: TradingAuditSubmittedInput) {
  const { db, tradingSwapAuditsTable } = await getDbModule();
  const [row] = await db
    .update(tradingSwapAuditsTable)
    .set({
      status: "submitted",
      transactionHash: input.transactionHash,
      approvalTransactionHash: input.approvalTransactionHash,
      error: null,
      submittedAt: now(),
      updatedAt: now(),
    })
    .where(and(eq(tradingSwapAuditsTable.id, input.auditId), eq(tradingSwapAuditsTable.userId, input.userId)))
    .returning();

  if (!row) throw new Error("Trading audit row was not found.");
  return serializeRow(row);
}
