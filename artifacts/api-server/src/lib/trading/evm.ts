import { env, infuraRpcUrl, rpcAuthHeaders } from "../markets/provider-utils";
import { TradingProviderError } from "./jupiter";

const EVM_NATIVE_TOKEN = "0x0000000000000000000000000000000000000000";
const DEFAULT_LIFI_BASE_URL = "https://li.quest/v1";

export type EvmSwapSide = "buy" | "sell";
export type EvmChainId = "ethereum" | "base";

interface EvmChainConfig {
  appChainId: EvmChainId;
  caipChainId: string;
  numericChainId: number;
  nativeSymbol: "ETH";
  rpcEnv: string;
  fallbackRpcUrl: string;
  explorerTxBaseUrl: string;
}

const EVM_CHAINS: Record<EvmChainId, EvmChainConfig> = {
  ethereum: {
    appChainId: "ethereum",
    caipChainId: "eip155:1",
    numericChainId: 1,
    nativeSymbol: "ETH",
    rpcEnv: "ETHEREUM_RPC_URL",
    fallbackRpcUrl: "https://ethereum-rpc.publicnode.com",
    explorerTxBaseUrl: "https://etherscan.io/tx",
  },
  base: {
    appChainId: "base",
    caipChainId: "eip155:8453",
    numericChainId: 8453,
    nativeSymbol: "ETH",
    rpcEnv: "BASE_RPC_URL",
    fallbackRpcUrl: "https://base-rpc.publicnode.com",
    explorerTxBaseUrl: "https://basescan.org/tx",
  },
};

export interface BuildEvmSwapQuoteInput {
  chainId: EvmChainId;
  side: EvmSwapSide;
  tokenAddress: string;
  walletAddress: string;
  amount: string;
  slippageBps: number;
}

export interface EvmWalletBalancesResponse {
  chainId: EvmChainId;
  walletAddress: string;
  native: {
    address: typeof EVM_NATIVE_TOKEN;
    symbol: "ETH";
    decimals: 18;
    amountRaw: string;
    amount: string;
  };
  token: {
    address: string;
    symbol?: string;
    name?: string;
    decimals: number;
    amountRaw: string;
    amount: string;
  };
  updatedAt: string;
}

export interface EvmTransactionRequest {
  chainId: number;
  from?: string;
  to: string;
  data: string;
  value?: string;
  gas?: string;
  gasLimit?: string;
  gasPrice?: string;
}

export interface EvmSwapQuoteResponse {
  provider: "lifi";
  chainId: EvmChainId;
  caipChainId: string;
  side: EvmSwapSide;
  input: {
    address: string;
    symbol?: string;
    name?: string;
    decimals: number;
    amount: string;
    amountRaw: string;
  };
  output: {
    address: string;
    symbol?: string;
    name?: string;
    decimals: number;
    amount?: string;
    amountRaw: string;
    minAmountRaw?: string;
  };
  quote: {
    id?: string;
    tool?: string;
    toolName?: string;
    slippageBps: number;
    priceImpactPct?: string;
    estimatedGas?: string;
    executionDuration?: number;
  };
  approval?: {
    required: boolean;
    spender: string;
    transaction: EvmTransactionRequest;
  };
  transaction: EvmTransactionRequest;
  requestedAt: string;
}

interface EvmRpcResponse<T> {
  jsonrpc?: string;
  id?: string;
  result?: T;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

interface LifiToken {
  address?: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  priceUSD?: string;
}

interface LifiQuoteResponse {
  id?: string;
  tool?: string;
  toolDetails?: {
    name?: string;
  };
  action?: {
    fromToken?: LifiToken;
    toToken?: LifiToken;
    fromAmount?: string;
  };
  estimate?: {
    fromAmount?: string;
    toAmount?: string;
    toAmountMin?: string;
    approvalAddress?: string;
    executionDuration?: number;
    data?: {
      estimatedGas?: number | string;
      fromToken?: LifiToken;
      toToken?: LifiToken;
      protocols?: Array<{ name?: string }>;
    };
  };
  transactionRequest?: EvmTransactionRequest;
  error?: {
    message?: string;
  };
  message?: string;
}

function chainConfig(chainId: string): EvmChainConfig {
  const config = EVM_CHAINS[chainId as EvmChainId];
  if (!config) {
    throw new TradingProviderError("EVM trading is currently enabled for Ethereum and Base only.", 400);
  }
  return config;
}

function lifiApiKey(): string {
  const key = env("LIFI_API_KEY");
  if (!key) {
    throw new TradingProviderError("LIFI_API_KEY is not configured. Add a LI.FI API key before enabling EVM trading.", 503);
  }
  return key;
}

function lifiBaseUrl(): string {
  return (env("LIFI_API_BASE_URL") ?? DEFAULT_LIFI_BASE_URL).replace(/\/+$/, "");
}

function rpcUrls(config: EvmChainConfig): string[] {
  const urls = [env(config.rpcEnv), infuraRpcUrl(config.appChainId), config.fallbackRpcUrl].filter(
    (url): url is string => Boolean(url),
  );
  return Array.from(new Set(urls));
}

function assertHexAddress(value: string, label: string): string {
  const trimmed = value.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    throw new TradingProviderError(`Invalid ${label} address.`, 400);
  }
  return trimmed;
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
  if (units <= 0n) throw new TradingProviderError("Amount must be greater than zero.", 400);
  return units.toString();
}

function formatUnits(raw: string, decimals: number): string {
  if (!/^\d+$/.test(raw)) return raw;
  const padded = raw.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals) || "0";
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function strip0x(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value;
}

function padUint256(value: string | bigint): string {
  const bigint = typeof value === "bigint" ? value : BigInt(value);
  return bigint.toString(16).padStart(64, "0");
}

function padAddress(value: string): string {
  return strip0x(value).toLowerCase().padStart(64, "0");
}

function encodeBalanceOf(owner: string): string {
  return `0x70a08231${padAddress(owner)}`;
}

function encodeApprove(spender: string, amountRaw: string): string {
  return `0x095ea7b3${padAddress(spender)}${padUint256(amountRaw)}`;
}

function decodeUint256(hex: string): bigint {
  const cleaned = strip0x(hex);
  if (!cleaned) return 0n;
  return BigInt(`0x${cleaned.slice(-64)}`);
}

function decodeString(hex: string): string | undefined {
  const cleaned = strip0x(hex);
  if (!cleaned || cleaned === "0".repeat(cleaned.length)) return undefined;

  if (cleaned.length === 64) {
    const bytes = Buffer.from(cleaned, "hex");
    return Buffer.from(bytes.filter((byte) => byte !== 0)).toString("utf8") || undefined;
  }

  const lengthHex = cleaned.slice(64, 128);
  const length = Number.parseInt(lengthHex, 16);
  if (!Number.isFinite(length) || length <= 0) return undefined;
  const data = cleaned.slice(128, 128 + length * 2);
  return Buffer.from(data, "hex").toString("utf8") || undefined;
}

async function evmRpc<T>(config: EvmChainConfig, method: string, params: unknown[]): Promise<T> {
  let lastError: string | null = null;

  for (const url of rpcUrls(config)) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": "AnyAlphaTerminal/0.1",
          ...rpcAuthHeaders(url),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `anyalpha-${method}-${Date.now()}`,
          method,
          params,
        }),
        signal: AbortSignal.timeout(16_000),
      });

      const payload = (await response.json().catch(() => ({}))) as EvmRpcResponse<T>;

      if (!response.ok || payload.error || payload.result === undefined) {
        lastError = payload.error?.message ?? `HTTP ${response.status}`;
        continue;
      }

      return payload.result;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "request failed";
    }
  }

  throw new TradingProviderError(`EVM RPC ${method} failed: ${lastError ?? "no RPC endpoint available"}`, 502);
}

async function ethCall(config: EvmChainConfig, to: string, data: string): Promise<string> {
  return evmRpc<string>(config, "eth_call", [{ to, data }, "latest"]);
}

async function fetchTokenMetadata(config: EvmChainConfig, tokenAddress: string) {
  const address = assertHexAddress(tokenAddress, "token");
  const [decimalsResult, symbolResult, nameResult] = await Promise.allSettled([
    ethCall(config, address, "0x313ce567"),
    ethCall(config, address, "0x95d89b41"),
    ethCall(config, address, "0x06fdde03"),
  ]);

  const decimals =
    decimalsResult.status === "fulfilled" ? Number(decodeUint256(decimalsResult.value)) : Number.NaN;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new TradingProviderError("Could not resolve token decimals for this EVM contract.", 422);
  }

  return {
    address,
    decimals,
    symbol: symbolResult.status === "fulfilled" ? decodeString(symbolResult.value) : undefined,
    name: nameResult.status === "fulfilled" ? decodeString(nameResult.value) : undefined,
  };
}

async function fetchLifiQuote(url: string): Promise<LifiQuoteResponse> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": "AnyAlphaTerminal/0.1",
      "x-lifi-api-key": lifiApiKey(),
    },
    signal: AbortSignal.timeout(22_000),
  });

  const payload = (await response.json().catch(() => ({}))) as LifiQuoteResponse;
  if (!response.ok) {
    throw new TradingProviderError(payload.error?.message ?? payload.message ?? `LI.FI quote failed with HTTP ${response.status}`, response.status);
  }
  if (!payload.transactionRequest) {
    throw new TradingProviderError("LI.FI did not return an executable transaction request.", 502);
  }

  return payload;
}

function estimatePriceImpactPct(quote: LifiQuoteResponse): string | undefined {
  const fromPrice = Number(quote.action?.fromToken?.priceUSD ?? quote.estimate?.data?.fromToken?.priceUSD);
  const toPrice = Number(quote.action?.toToken?.priceUSD ?? quote.estimate?.data?.toToken?.priceUSD);
  const fromAmount = Number(formatUnits(quote.estimate?.fromAmount ?? quote.action?.fromAmount ?? "0", quote.action?.fromToken?.decimals ?? 18));
  const toAmount = Number(formatUnits(quote.estimate?.toAmount ?? "0", quote.action?.toToken?.decimals ?? 18));
  const inputUsd = fromAmount * fromPrice;
  const outputUsd = toAmount * toPrice;
  if (!Number.isFinite(inputUsd) || !Number.isFinite(outputUsd) || inputUsd <= 0 || outputUsd <= 0) return undefined;
  const impact = Math.max(0, ((inputUsd - outputUsd) / inputUsd) * 100);
  return impact.toFixed(impact < 0.01 ? 4 : 2);
}

export async function getEvmWalletBalances(
  chainId: EvmChainId,
  walletAddress: string,
  tokenAddress: string,
): Promise<EvmWalletBalancesResponse> {
  const config = chainConfig(chainId);
  const wallet = assertHexAddress(walletAddress, "wallet");
  const token = await fetchTokenMetadata(config, tokenAddress);

  const [nativeRawHex, tokenRawHex] = await Promise.all([
    evmRpc<string>(config, "eth_getBalance", [wallet, "latest"]),
    ethCall(config, token.address, encodeBalanceOf(wallet)),
  ]);

  const nativeRaw = decodeUint256(nativeRawHex).toString();
  const tokenRaw = decodeUint256(tokenRawHex).toString();

  return {
    chainId: config.appChainId,
    walletAddress: wallet,
    native: {
      address: EVM_NATIVE_TOKEN,
      symbol: config.nativeSymbol,
      decimals: 18,
      amountRaw: nativeRaw,
      amount: formatUnits(nativeRaw, 18),
    },
    token: {
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      amountRaw: tokenRaw,
      amount: formatUnits(tokenRaw, token.decimals),
    },
    updatedAt: new Date().toISOString(),
  };
}

export async function buildEvmSwapQuote(input: BuildEvmSwapQuoteInput): Promise<EvmSwapQuoteResponse> {
  const config = chainConfig(input.chainId);
  const wallet = assertHexAddress(input.walletAddress, "wallet");
  const token = await fetchTokenMetadata(config, input.tokenAddress);
  const inputDecimals = input.side === "buy" ? 18 : token.decimals;
  const amountRaw = parseDecimalToUnits(input.amount, inputDecimals);
  const fromToken = input.side === "buy" ? EVM_NATIVE_TOKEN : token.address;
  const toToken = input.side === "buy" ? token.address : EVM_NATIVE_TOKEN;
  const slippage = Math.max(0, Math.min(input.slippageBps / 10_000, 1));

  const quoteUrl = new URL(`${lifiBaseUrl()}/quote`);
  quoteUrl.searchParams.set("fromChain", String(config.numericChainId));
  quoteUrl.searchParams.set("toChain", String(config.numericChainId));
  quoteUrl.searchParams.set("fromToken", fromToken);
  quoteUrl.searchParams.set("toToken", toToken);
  quoteUrl.searchParams.set("fromAmount", amountRaw);
  quoteUrl.searchParams.set("fromAddress", wallet);
  quoteUrl.searchParams.set("toAddress", wallet);
  quoteUrl.searchParams.set("slippage", String(slippage));
  quoteUrl.searchParams.set("integrator", "anyalpha");
  quoteUrl.searchParams.set("allowBridges", "none");
  quoteUrl.searchParams.set("order", "FASTEST");

  const quote = await fetchLifiQuote(quoteUrl.toString());
  const fromTokenMeta = quote.action?.fromToken ?? quote.estimate?.data?.fromToken;
  const toTokenMeta = quote.action?.toToken ?? quote.estimate?.data?.toToken;
  const outputDecimals = input.side === "buy" ? token.decimals : 18;
  const outputRaw = quote.estimate?.toAmount ?? "0";
  const approvalSpender = quote.estimate?.approvalAddress;
  const approvalRequired = input.side === "sell" && approvalSpender && /^0x[a-fA-F0-9]{40}$/.test(approvalSpender);
  const transaction = quote.transactionRequest;
  if (!transaction) {
    throw new TradingProviderError("LI.FI did not return an executable transaction request.", 502);
  }

  return {
    provider: "lifi",
    chainId: config.appChainId,
    caipChainId: config.caipChainId,
    side: input.side,
    input: {
      address: fromToken,
      symbol: input.side === "buy" ? config.nativeSymbol : fromTokenMeta?.symbol ?? token.symbol,
      name: input.side === "buy" ? config.nativeSymbol : fromTokenMeta?.name ?? token.name,
      decimals: inputDecimals,
      amount: formatUnits(amountRaw, inputDecimals),
      amountRaw,
    },
    output: {
      address: toToken,
      symbol: input.side === "buy" ? toTokenMeta?.symbol ?? token.symbol : config.nativeSymbol,
      name: input.side === "buy" ? toTokenMeta?.name ?? token.name : config.nativeSymbol,
      decimals: outputDecimals,
      amount: formatUnits(outputRaw, outputDecimals),
      amountRaw: outputRaw,
      minAmountRaw: quote.estimate?.toAmountMin,
    },
    quote: {
      id: quote.id,
      tool: quote.tool,
      toolName: quote.toolDetails?.name,
      slippageBps: input.slippageBps,
      priceImpactPct: estimatePriceImpactPct(quote),
      estimatedGas: quote.estimate?.data?.estimatedGas ? String(quote.estimate.data.estimatedGas) : undefined,
      executionDuration: quote.estimate?.executionDuration,
    },
    approval: approvalRequired
      ? {
          required: true,
          spender: approvalSpender,
          transaction: {
            chainId: config.numericChainId,
            from: wallet,
            to: token.address,
            data: encodeApprove(approvalSpender, amountRaw),
            value: "0x0",
          },
        }
      : undefined,
    transaction,
    requestedAt: new Date().toISOString(),
  };
}

export function evmExplorerUrl(chainId: EvmChainId, transactionHash: string): string {
  const config = chainConfig(chainId);
  return `${config.explorerTxBaseUrl}/${encodeURIComponent(transactionHash)}`;
}
