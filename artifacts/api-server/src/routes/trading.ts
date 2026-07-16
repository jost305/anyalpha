import { Router, type IRouter, type Response } from "express";
import { z } from "zod";
import { requireAuthenticatedUser } from "../lib/auth/require-authenticated-user";
import {
  buildSolanaSwapQuote,
  getSolanaWalletBalances,
  submitSignedSolanaTransaction,
  TradingProviderError,
} from "../lib/trading/jupiter";
import { buildEvmSwapQuote, evmExplorerUrl, getEvmWalletBalances } from "../lib/trading/evm";
import {
  createTradingAudit,
  markTradingApprovalSubmitted,
  markTradingAuditFailed,
  markTradingQuoteReady,
  markTradingSubmitted,
} from "../lib/trading/audit-store";

const solanaAddress = z
  .string()
  .trim()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Invalid Solana address.");

const solanaQuoteSchema = z.object({
  chainId: z.literal("solana"),
  side: z.enum(["buy", "sell"]),
  tokenAddress: solanaAddress,
  walletAddress: solanaAddress,
  pairAddress: z.string().trim().min(1).max(96).optional(),
  amount: z.string().trim().min(1).max(48),
  slippageBps: z.coerce.number().int().min(1).max(500).default(100),
});

const solanaBalancesSchema = z.object({
  tokenAddress: solanaAddress,
  walletAddress: solanaAddress,
});

const solanaSubmitSchema = z.object({
  auditId: z.string().uuid(),
  signedTransaction: z
    .string()
    .trim()
    .min(64)
    .max(200_000)
    .regex(/^[A-Za-z0-9+/=]+$/, "Signed transaction must be base64."),
});

const evmAddress = z
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address.");

const evmChainSchema = z.enum(["ethereum", "base"]);

const evmQuoteSchema = z.object({
  chainId: evmChainSchema,
  side: z.enum(["buy", "sell"]),
  tokenAddress: evmAddress,
  walletAddress: evmAddress,
  pairAddress: evmAddress.optional(),
  amount: z.string().trim().min(1).max(48),
  slippageBps: z.coerce.number().int().min(1).max(500).default(100),
});

const evmBalancesSchema = z.object({
  chainId: evmChainSchema,
  tokenAddress: evmAddress,
  walletAddress: evmAddress,
});

const evmReportSchema = z.object({
  auditId: z.string().uuid(),
  chainId: evmChainSchema,
  stage: z.enum(["approval_submitted", "submitted"]),
  transactionHash: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid EVM transaction hash."),
  approvalTransactionHash: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid EVM approval transaction hash.")
    .optional(),
});

const router: IRouter = Router();

function solanaSafetyPayload(quote: Awaited<ReturnType<typeof buildSolanaSwapQuote>>) {
  const priceImpact = Number(quote.quote.priceImpactPct ?? "0");
  return {
    maxSlippageBps: quote.quote.slippageBps,
    priceImpactPct: quote.quote.priceImpactPct,
    warnings: [
      quote.quote.slippageBps > 100 ? "Slippage is above 1%; review volatility before signing." : null,
      Number.isFinite(priceImpact) && priceImpact >= 3 ? "Price impact is elevated for this route." : null,
    ].filter(Boolean),
  };
}

function evmSafetyPayload(quote: Awaited<ReturnType<typeof buildEvmSwapQuote>>) {
  const priceImpact = Number(quote.quote.priceImpactPct ?? "0");
  return {
    maxSlippageBps: quote.quote.slippageBps,
    priceImpactPct: quote.quote.priceImpactPct,
    approvalRequired: Boolean(quote.approval?.required),
    warnings: [
      quote.approval?.required ? "This sell requires an exact token approval before the swap transaction." : null,
      quote.quote.slippageBps > 100 ? "Slippage is above 1%; review volatility before signing." : null,
      Number.isFinite(priceImpact) && priceImpact >= 3 ? "Price impact is elevated for this route." : null,
    ].filter(Boolean),
  };
}

function sendTradingError(res: Response, err: unknown): boolean {
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: "Invalid trading request.", issues: err.issues });
    return true;
  }

  if (err instanceof TradingProviderError) {
    res.status(err.status).json({ error: err.message });
    return true;
  }

  return false;
}

router.post("/trading/solana/quote", async (req, res, next) => {
  let auditId: string | null = null;
  let userId: string | null = null;
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);
    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }
    const nextUserId = auth.user.id;
    userId = nextUserId;

    const body = solanaQuoteSchema.parse(req.body);
    const audit = await createTradingAudit({
      userId: nextUserId,
      provider: "jupiter",
      chainId: body.chainId,
      walletAddress: body.walletAddress,
      tokenAddress: body.tokenAddress,
      pairAddress: body.pairAddress,
      side: body.side,
      inputAmount: body.amount,
      slippageBps: body.slippageBps,
    });
    auditId = audit.id;

    const quote = await buildSolanaSwapQuote({
      side: body.side,
      tokenAddress: body.tokenAddress,
      walletAddress: body.walletAddress,
      amount: body.amount,
      slippageBps: body.slippageBps,
    });
    const safety = solanaSafetyPayload(quote);
    await markTradingQuoteReady({
      auditId,
      userId: nextUserId,
      inputSymbol: quote.input.symbol,
      outputSymbol: quote.output.symbol,
      inputAmountRaw: quote.input.amountRaw,
      outputAmount: quote.output.amount,
      outputAmountRaw: quote.output.amountRaw,
      priceImpactPct: quote.quote.priceImpactPct,
      quotePayload: quote as unknown as Record<string, unknown>,
      safetyPayload: safety,
    });

    res.setHeader("Cache-Control", "no-store");
    res.json({ ...quote, audit: { id: auditId, status: "quote_ready" }, safety });
  } catch (err) {
    if (auditId && userId) {
      await markTradingAuditFailed(auditId, userId, err instanceof Error ? err.message : "Trading quote failed.").catch(() => null);
    }
    if (sendTradingError(res, err)) return;
    next(err);
  }
});

router.get("/trading/solana/balances", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);
    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const query = solanaBalancesSchema.parse(req.query);
    const balances = await getSolanaWalletBalances(query.walletAddress, query.tokenAddress);

    res.setHeader("Cache-Control", "no-store");
    res.json(balances);
  } catch (err) {
    if (sendTradingError(res, err)) return;
    next(err);
  }
});

router.post("/trading/solana/submit", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);
    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const body = solanaSubmitSchema.parse(req.body);
    const result = await submitSignedSolanaTransaction(body.signedTransaction);
    await markTradingSubmitted({
      auditId: body.auditId,
      userId: auth.user.id,
      transactionHash: result.signature,
    });

    res.setHeader("Cache-Control", "no-store");
    res.json({
      signature: result.signature,
      explorerUrl: `https://solscan.io/tx/${encodeURIComponent(result.signature)}`,
      submittedAt: new Date().toISOString(),
    });
  } catch (err) {
    const parsed = solanaSubmitSchema.safeParse(req.body);
    const auth = await requireAuthenticatedUser(req.headers.authorization).catch(() => null);
    if (parsed.success && auth?.ok) {
      await markTradingAuditFailed(parsed.data.auditId, auth.user.id, err instanceof Error ? err.message : "Trading submission failed.").catch(
        () => null,
      );
    }
    if (sendTradingError(res, err)) return;
    next(err);
  }
});

router.post("/trading/evm/quote", async (req, res, next) => {
  let auditId: string | null = null;
  let userId: string | null = null;
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);
    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }
    const nextUserId = auth.user.id;
    userId = nextUserId;

    const body = evmQuoteSchema.parse(req.body);
    const audit = await createTradingAudit({
      userId: nextUserId,
      provider: "lifi",
      chainId: body.chainId,
      walletAddress: body.walletAddress,
      tokenAddress: body.tokenAddress,
      pairAddress: body.pairAddress,
      side: body.side,
      inputAmount: body.amount,
      slippageBps: body.slippageBps,
    });
    auditId = audit.id;

    const quote = await buildEvmSwapQuote(body);
    const safety = evmSafetyPayload(quote);
    await markTradingQuoteReady({
      auditId,
      userId: nextUserId,
      inputSymbol: quote.input.symbol,
      outputSymbol: quote.output.symbol,
      inputAmountRaw: quote.input.amountRaw,
      outputAmount: quote.output.amount,
      outputAmountRaw: quote.output.amountRaw,
      priceImpactPct: quote.quote.priceImpactPct,
      quotePayload: quote as unknown as Record<string, unknown>,
      safetyPayload: safety,
    });

    res.setHeader("Cache-Control", "no-store");
    res.json({ ...quote, audit: { id: auditId, status: "quote_ready" }, safety });
  } catch (err) {
    if (auditId && userId) {
      await markTradingAuditFailed(auditId, userId, err instanceof Error ? err.message : "EVM quote failed.").catch(() => null);
    }
    if (sendTradingError(res, err)) return;
    next(err);
  }
});

router.get("/trading/evm/balances", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);
    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const query = evmBalancesSchema.parse(req.query);
    const balances = await getEvmWalletBalances(query.chainId, query.walletAddress, query.tokenAddress);

    res.setHeader("Cache-Control", "no-store");
    res.json(balances);
  } catch (err) {
    if (sendTradingError(res, err)) return;
    next(err);
  }
});

router.post("/trading/evm/report", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);
    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const body = evmReportSchema.parse(req.body);
    const audit =
      body.stage === "approval_submitted"
        ? await markTradingApprovalSubmitted(body.auditId, auth.user.id, body.transactionHash)
        : await markTradingSubmitted({
            auditId: body.auditId,
            userId: auth.user.id,
            transactionHash: body.transactionHash,
            approvalTransactionHash: body.approvalTransactionHash,
          });

    res.setHeader("Cache-Control", "no-store");
    res.json({
      audit,
      hash: body.transactionHash,
      explorerUrl: evmExplorerUrl(body.chainId, body.transactionHash),
      reportedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (sendTradingError(res, err)) return;
    next(err);
  }
});

export default router;
