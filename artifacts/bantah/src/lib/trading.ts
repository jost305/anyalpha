export interface SolanaSwapQuote {
  provider: 'jupiter';
  chainId: 'solana';
  side: 'buy' | 'sell';
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
    variant: 'versioned';
    lastValidBlockHeight?: number;
    prioritizationFeeLamports?: number;
  };
  audit: {
    id: string;
    status: 'quote_ready';
  };
  safety: {
    maxSlippageBps: number;
    priceImpactPct?: string;
    warnings: string[];
  };
  requestedAt: string;
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

export interface EvmSwapQuote {
  provider: 'lifi';
  chainId: 'ethereum' | 'base';
  caipChainId: string;
  side: 'buy' | 'sell';
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
  audit: {
    id: string;
    status: 'quote_ready';
  };
  safety: {
    maxSlippageBps: number;
    priceImpactPct?: string;
    approvalRequired?: boolean;
    warnings: string[];
  };
  requestedAt: string;
}

export interface SolanaWalletBalances {
  chainId: 'solana';
  walletAddress: string;
  sol: {
    mint: string;
    symbol: 'SOL';
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

export interface EvmWalletBalances {
  chainId: 'ethereum' | 'base';
  walletAddress: string;
  native: {
    address: string;
    symbol: 'ETH';
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

export interface SolanaSwapSubmitResponse {
  signature: string;
  explorerUrl: string;
  submittedAt: string;
}

export interface SolanaSwapQuoteInput {
  side: 'buy' | 'sell';
  tokenAddress: string;
  walletAddress: string;
  pairAddress?: string;
  amount: string;
  slippageBps: number;
}

export interface EvmSwapQuoteInput {
  chainId: 'ethereum' | 'base';
  side: 'buy' | 'sell';
  tokenAddress: string;
  walletAddress: string;
  pairAddress?: string;
  amount: string;
  slippageBps: number;
}

async function tradingFetch<T>(path: string, token: string, init: RequestInit): Promise<T> {
  const rawBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  const baseUrl = rawBaseUrl ? rawBaseUrl.replace(/\/+$/, '') : '';
  const requestUrl = baseUrl ? `${baseUrl}/api${path}` : `/api${path}`;

  const response = await fetch(requestUrl, {
    ...init,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });

  const payload = (await response.json().catch(() => null)) as { error?: string } | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? `Trading request failed: ${response.status} ${response.statusText}`);
  }

  return payload as T;
}

export function requestSolanaSwapQuote(input: SolanaSwapQuoteInput, accessToken: string): Promise<SolanaSwapQuote> {
  return tradingFetch<SolanaSwapQuote>('/trading/solana/quote', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      chainId: 'solana',
      ...input,
    }),
  });
}

export function requestEvmSwapQuote(input: EvmSwapQuoteInput, accessToken: string): Promise<EvmSwapQuote> {
  return tradingFetch<EvmSwapQuote>('/trading/evm/quote', accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchSolanaWalletBalances(
  walletAddress: string,
  tokenAddress: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<SolanaWalletBalances> {
  const query = new URLSearchParams({ walletAddress, tokenAddress });
  return tradingFetch<SolanaWalletBalances>(`/trading/solana/balances?${query.toString()}`, accessToken, {
    method: 'GET',
    signal,
  });
}

export function fetchEvmWalletBalances(
  chainId: 'ethereum' | 'base',
  walletAddress: string,
  tokenAddress: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<EvmWalletBalances> {
  const query = new URLSearchParams({ chainId, walletAddress, tokenAddress });
  return tradingFetch<EvmWalletBalances>(`/trading/evm/balances?${query.toString()}`, accessToken, {
    method: 'GET',
    signal,
  });
}

export function submitSolanaSwapTransaction(
  auditId: string,
  signedTransaction: string,
  accessToken: string,
): Promise<SolanaSwapSubmitResponse> {
  return tradingFetch<SolanaSwapSubmitResponse>('/trading/solana/submit', accessToken, {
    method: 'POST',
    body: JSON.stringify({ auditId, signedTransaction }),
  });
}

export function reportEvmSwapTransaction(
  input: {
    auditId: string;
    chainId: 'ethereum' | 'base';
    stage: 'approval_submitted' | 'submitted';
    transactionHash: string;
    approvalTransactionHash?: string;
  },
  accessToken: string,
): Promise<{ hash: string; explorerUrl: string; reportedAt: string }> {
  return tradingFetch('/trading/evm/report', accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
