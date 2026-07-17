import { Router, type IRouter } from "express";
import { z } from "zod";
import { fetchSolanaWalletTokens } from "../lib/markets/helius";
import { fetchMoralisWalletTokens } from "../lib/markets/moralis";
import { fetchMarketTokensByAddress } from "../lib/markets/dexscreener";
import { requireAuthenticatedUser } from "../lib/auth/require-authenticated-user";

const querySchema = z.object({
  chain: z.string().min(1),
  address: z.string().min(1),
});

const router: IRouter = Router();

router.get("/portfolio", async (req, res, next) => {
  try {
    const auth = await requireAuthenticatedUser(req.headers.authorization);
    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }

    const { chain, address } = querySchema.parse(req.query);
    const normalizedChain = chain.toLowerCase();

    let tokens: Array<{
      chainId: string;
      tokenAddress: string;
      symbol?: string;
      name?: string;
      decimals: number;
      balance: number;
      logoUrl?: string;
      priceUsd?: number;
      valueUsd?: number;
      priceChange24h?: number;
    }> = [];

    if (normalizedChain === "solana") {
      const solanaTokens = await fetchSolanaWalletTokens(address);
      
      if (solanaTokens.length > 0) {
        // Fetch prices from Dexscreener
        const markets = await fetchMarketTokensByAddress("solana", solanaTokens.map((t) => t.tokenAddress));
        const marketMap = new Map(markets.map((m) => [m.tokenAddress.toLowerCase(), m]));

        tokens = solanaTokens.map((t) => {
          const market = marketMap.get(t.tokenAddress.toLowerCase());
          const priceUsd = market?.priceUsd;
          const valueUsd = priceUsd ? t.balance * priceUsd : undefined;

          return {
            ...t,
            symbol: market?.symbol,
            name: market?.name,
            logoUrl: market?.imageUrl,
            priceUsd,
            valueUsd,
            priceChange24h: market?.priceChange?.h24,
          };
        });
      }
    } else {
      // Use Moralis for EVM chains
      const moralisTokens = await fetchMoralisWalletTokens(normalizedChain, address);
      tokens = moralisTokens.map((t) => ({
        ...t,
        priceChange24h: undefined,
      }));

      // Enrich EVM with Dexscreener
      if (tokens.length > 0) {
        const markets = await fetchMarketTokensByAddress(normalizedChain, tokens.map((t) => t.tokenAddress));
        const marketMap = new Map(markets.map((m) => [m.tokenAddress.toLowerCase(), m]));

        tokens = tokens.map((t) => {
          const market = marketMap.get(t.tokenAddress.toLowerCase());
          return {
            ...t,
            symbol: t.symbol ?? market?.symbol,
            name: t.name ?? market?.name,
            logoUrl: t.logoUrl ?? market?.imageUrl,
            priceUsd: t.priceUsd ?? market?.priceUsd,
            valueUsd: t.valueUsd ?? (market?.priceUsd ? t.balance * market.priceUsd : undefined),
            priceChange24h: market?.priceChange?.h24,
          };
        });
      }
    }

    // Sort by valueUsd descending
    tokens.sort((a, b) => {
      const valA = a.valueUsd ?? 0;
      const valB = b.valueUsd ?? 0;
      return valB - valA;
    });

    res.setHeader("Cache-Control", "no-store");
    res.json({
      chain: normalizedChain,
      address,
      tokens,
      source: "portfolio",
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid query parameters.", details: err.errors });
      return;
    }
    next(err);
  }
});

export default router;
