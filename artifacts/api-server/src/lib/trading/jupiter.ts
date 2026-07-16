import { env } from "../markets/provider-utils";

const JUPITER_SOL_MINT = "So11111111111111111111111111111111111111112";
const DEFAULT_SWAP_BASE_URL = "https://api.jup.ag/swap/v1";
const DEFAULT_TOKENS_BASE_URL = "https://api.jup.ag/tokens/v2";

export type SolanaSwapSide = "buy" | "sell";

export interface BuildSolanaSwapQuoteInput {
  side: SolanaSwapSide;
  tokenAddress: string;
  walletAddress: string;
  amount: string;
  slippageBps: number;
}

export interface SolanaWalletBalancesResponse {
  chainId: "solana";
  walletAddress: string;
  sol: {
    mint: typeof JUPITER_SOL_MINT;
    symbol: "SOL";
    decimals: 9;
    lamports: string;
    amount: string;
  };
  token: {
    mint: string;
    symbol?: string;
    name?: string;
    decimals: number;
    amountRaw: string;
    amount: string;
    accountCount: number;
  };
  updatedAt: string;
}

export interface SolanaSwapQuoteResponse {
  provider: "jupiter";
  chainId: "solana";
  side: SolanaSwapSide;
  input: {
    mint: string;
    symbol?: string;
    name?: string;
    decimals: number;
    amount: string;
    amountRaw: string;
  };
  output: {
    mint: string;
    symbol?: string;
    name?: string;
    decimals?: number;
    amount?: string;
    amountRaw: string;
  };
  quote: {
    slippageBps: number;
    priceImpactPct?: string;
    routeLabels: string[];
    contextSlot?: number;
    timeTaken?: number;
  };
  transaction: {
    serialized: string;
    variant: "versioned";
    lastValidBlockHeight?: number;
    prioritizationFeeLamports?: number;
  };
  requestedAt: string;
}

interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: "ExactIn" | "ExactOut";
  slippageBps: number;
  priceImpactPct?: string;
  routePlan?: Array<{
    swapInfo?: {
      label?: string;
    };
  }>;
  contextSlot?: number;
  timeTaken?: number;
  error?: string;
}

interface JupiterSwapResponse {
  swapTransaction?: string;
  lastValidBlockHeight?: number;
  prioritizationFeeLamports?: number;
  error?: string;
}

interface JupiterTokenInfo {
  id?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
}

interface SolanaRpcResponse<T> {
  jsonrpc?: string;
  id?: string;
  result?: T;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

interface SolanaGetBalanceResult {
  value: number;
}

interface SolanaTokenSupplyResult {
  value?: {
    amount?: string;
    decimals?: number;
    uiAmountString?: string;
  };
}

interface SolanaTokenAccountsResult {
  value?: Array<{
    pubkey?: string;
    account?: {
      data?: {
        parsed?: {
          info?: {
            tokenAmount?: {
              amount?: string;
              decimals?: number;
              uiAmountString?: string;
            };
          };
        };
      };
    };
  }>;
}

export class TradingProviderError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "TradingProviderError";
    this.status = status;
  }
}

function requireJupiterApiKey(): string {
  const key = env("JUPITER_API_KEY");
  if (!key) {
    throw new TradingProviderError(
      "JUPITER_API_KEY is not configured. Add a Jupiter API key before enabling live Solana trading.",
      503,
    );
  }
  return key;
}

function jupiterHeaders(): Record<string, string> {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": "AnyAlphaTerminal/0.1",
    "x-api-key": requireJupiterApiKey(),
  };
}

function swapBaseUrl(): string {
  return (env("JUPITER_SWAP_API_BASE_URL") ?? DEFAULT_SWAP_BASE_URL).replace(/\/+$/, "");
}

function tokensBaseUrl(): string {
  return (env("JUPITER_TOKENS_API_BASE_URL") ?? DEFAULT_TOKENS_BASE_URL).replace(/\/+$/, "");
}

function solanaRpcUrl(): string {
  const configured = env("SOLANA_RPC_URL");
  if (configured) return configured;

  const heliusKey = env("HELIUS_API_KEY");
  if (heliusKey) return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(heliusKey)}`;

  return "https://api.mainnet-beta.solana.com";
}

function parseDecimalToUnits(value: string, decimals: number): string {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new TradingProviderError("Enter a valid positive amount.", 400);
  }

  const [whole = "0", fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) {
    throw new TradingProviderError(`This token supports up to ${decimals} decimals.`, 400);
  }

  const raw = `${whole}${fraction.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/, "");
  const units = BigInt(raw || "0");

  if (units <= 0n) {
    throw new TradingProviderError("SOL amount must be greater than zero.", 400);
  }

  return units.toString();
}

function formatUnits(raw: string, decimals: number): string {
  if (!/^\d+$/.test(raw)) return raw;
  const padded = raw.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals) || "0";
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(18_000),
  });

  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T & { error?: string });

  if (!response.ok) {
    throw new TradingProviderError(parsed.error ?? `Jupiter request failed with HTTP ${response.status}`, response.status);
  }

  if (parsed.error) {
    throw new TradingProviderError(parsed.error, 502);
  }

  return parsed as T;
}

async function fetchTokenInfo(mint: string): Promise<JupiterTokenInfo | null> {
  try {
    const url = new URL(`${tokensBaseUrl()}/search`);
    url.searchParams.set("query", mint);
    const tokens = await fetchJson<JupiterTokenInfo[]>(url.toString(), {
      method: "GET",
      headers: jupiterHeaders(),
    });

    return tokens.find((token) => token.id === mint) ?? tokens[0] ?? null;
  } catch {
    return null;
  }
}

async function solanaRpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(solanaRpcUrl(), {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "AnyAlphaTerminal/0.1",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `anyalpha-${method}-${Date.now()}`,
      method,
      params,
    }),
    signal: AbortSignal.timeout(16_000),
  });

  const payload = (await response.json()) as SolanaRpcResponse<T>;

  if (!response.ok || payload.error || payload.result === undefined) {
    throw new TradingProviderError(payload.error?.message ?? `Solana RPC ${method} failed with HTTP ${response.status}`, 502);
  }

  return payload.result;
}

async function fetchSolanaTokenDecimals(mint: string, fallback?: number): Promise<number> {
  if (mint === JUPITER_SOL_MINT) return 9;
  if (typeof fallback === "number" && Number.isInteger(fallback) && fallback >= 0) return fallback;

  const supply = await solanaRpc<SolanaTokenSupplyResult>("getTokenSupply", [mint]);
  const decimals = supply.value?.decimals;
  if (typeof decimals === "number" && Number.isInteger(decimals) && decimals >= 0) return decimals;

  throw new TradingProviderError("Could not resolve token decimals for this Solana mint.", 422);
}

export async function getSolanaWalletBalances(
  walletAddress: string,
  tokenAddress: string,
): Promise<SolanaWalletBalancesResponse> {
  const [balance, accounts, tokenInfo] = await Promise.all([
    solanaRpc<SolanaGetBalanceResult>("getBalance", [walletAddress]),
    solanaRpc<SolanaTokenAccountsResult>("getTokenAccountsByOwner", [
      walletAddress,
      { mint: tokenAddress },
      { encoding: "jsonParsed" },
    ]),
    fetchTokenInfo(tokenAddress),
  ]);

  let tokenRaw = 0n;
  let parsedDecimals: number | undefined;
  const tokenAccounts = accounts.value ?? [];

  for (const account of tokenAccounts) {
    const amount = account.account?.data?.parsed?.info?.tokenAmount;
    if (!amount?.amount || !/^\d+$/.test(amount.amount)) continue;
    tokenRaw += BigInt(amount.amount);
    if (typeof amount.decimals === "number") parsedDecimals = amount.decimals;
  }

  const decimals = await fetchSolanaTokenDecimals(tokenAddress, parsedDecimals ?? tokenInfo?.decimals);
  const lamports = BigInt(Math.max(0, Math.floor(balance.value ?? 0))).toString();

  return {
    chainId: "solana",
    walletAddress,
    sol: {
      mint: JUPITER_SOL_MINT,
      symbol: "SOL",
      decimals: 9,
      lamports,
      amount: formatUnits(lamports, 9),
    },
    token: {
      mint: tokenAddress,
      symbol: tokenInfo?.symbol,
      name: tokenInfo?.name,
      decimals,
      amountRaw: tokenRaw.toString(),
      amount: formatUnits(tokenRaw.toString(), decimals),
      accountCount: tokenAccounts.length,
    },
    updatedAt: new Date().toISOString(),
  };
}

export async function buildSolanaSwapQuote(input: BuildSolanaSwapQuoteInput): Promise<SolanaSwapQuoteResponse> {
  const tokenInfo = await fetchTokenInfo(input.tokenAddress);
  const tokenDecimals = await fetchSolanaTokenDecimals(input.tokenAddress, tokenInfo?.decimals);
  const inputDecimals = input.side === "buy" ? 9 : tokenDecimals;
  const amountRaw = parseDecimalToUnits(input.amount, inputDecimals);

  if (input.side === "buy" && BigInt(amountRaw) > 100n * 1_000_000_000n) {
    throw new TradingProviderError("Single AnyAlpha buy quotes are capped at 100 SOL.", 400);
  }

  const quoteUrl = new URL(`${swapBaseUrl()}/quote`);
  quoteUrl.searchParams.set("inputMint", input.side === "buy" ? JUPITER_SOL_MINT : input.tokenAddress);
  quoteUrl.searchParams.set("outputMint", input.side === "buy" ? input.tokenAddress : JUPITER_SOL_MINT);
  quoteUrl.searchParams.set("amount", amountRaw);
  quoteUrl.searchParams.set("slippageBps", String(input.slippageBps));
  quoteUrl.searchParams.set("restrictIntermediateTokens", "true");
  quoteUrl.searchParams.set("instructionVersion", "V2");

  const quote = await fetchJson<JupiterQuoteResponse>(quoteUrl.toString(), {
    method: "GET",
    headers: jupiterHeaders(),
  });

  const swap = await fetchJson<JupiterSwapResponse>(`${swapBaseUrl()}/swap`, {
    method: "POST",
    headers: jupiterHeaders(),
    body: JSON.stringify({
      userPublicKey: input.walletAddress,
      quoteResponse: quote,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          priorityLevel: "veryHigh",
          maxLamports: 1_000_000,
        },
      },
    }),
  });

  if (!swap.swapTransaction) {
    throw new TradingProviderError("Jupiter did not return a swap transaction.", 502);
  }

  const routeLabels = Array.from(
    new Set(
      (quote.routePlan ?? [])
        .map((route) => route.swapInfo?.label)
        .filter((label): label is string => Boolean(label)),
    ),
  );

  return {
    provider: "jupiter",
    chainId: "solana",
    side: input.side,
    input: {
      mint: quote.inputMint,
      symbol: input.side === "buy" ? "SOL" : tokenInfo?.symbol,
      name: input.side === "buy" ? "Solana" : tokenInfo?.name,
      decimals: inputDecimals,
      amount: formatUnits(amountRaw, inputDecimals),
      amountRaw,
    },
    output: {
      mint: quote.outputMint,
      symbol: input.side === "buy" ? tokenInfo?.symbol : "SOL",
      name: input.side === "buy" ? tokenInfo?.name : "Solana",
      decimals: input.side === "buy" ? tokenDecimals : 9,
      amount: formatUnits(quote.outAmount, input.side === "buy" ? tokenDecimals : 9),
      amountRaw: quote.outAmount,
    },
    quote: {
      slippageBps: quote.slippageBps,
      priceImpactPct: quote.priceImpactPct,
      routeLabels,
      contextSlot: quote.contextSlot,
      timeTaken: quote.timeTaken,
    },
    transaction: {
      serialized: swap.swapTransaction,
      variant: "versioned",
      lastValidBlockHeight: swap.lastValidBlockHeight,
      prioritizationFeeLamports: swap.prioritizationFeeLamports,
    },
    requestedAt: new Date().toISOString(),
  };
}

export async function submitSignedSolanaTransaction(signedTransaction: string): Promise<{ signature: string; rpcUrl: string }> {
  const rpcUrl = solanaRpcUrl();
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "AnyAlphaTerminal/0.1",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `anyalpha-swap-${Date.now()}`,
      method: "sendTransaction",
      params: [
        signedTransaction,
        {
          encoding: "base64",
          skipPreflight: false,
          maxRetries: 3,
        },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });

  const payload = (await response.json()) as SolanaRpcResponse<string>;

  if (!response.ok || payload.error || !payload.result) {
    throw new TradingProviderError(payload.error?.message ?? `Solana RPC send failed with HTTP ${response.status}`, 502);
  }

  return { signature: payload.result, rpcUrl };
}
