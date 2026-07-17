import type { MarketToken, MarketTokenHolderPosition, MarketTokenTrade } from "./types";
import {
  env,
  fetchJson,
  numeric,
  type MarketEnrichment,
  type ProviderBatchResult,
} from "./provider-utils";

interface HeliusAsset {
  id?: string;
  content?: {
    files?: Array<{ uri?: string; cdn_uri?: string }>;
    metadata?: {
      name?: string;
      symbol?: string;
      description?: string;
      image?: string;
      external_url?: string;
    };
  };
  authorities?: Array<{ address?: string; scopes?: string[] }>;
  token_info?: {
    supply?: number;
    decimals?: number;
    token_program?: string;
    mint_authority?: string | null;
    freeze_authority?: string | null;
    price_info?: {
      price_per_token?: number;
      currency?: string;
    };
  };
}

type HeliusRpcResponse =
  | HeliusAsset[]
  | {
      result?: HeliusAsset[];
      error?: {
        message?: string;
      };
    };

interface SolanaRpcResponse<T> {
  result?: T;
  error?: {
    message?: string;
  };
}

interface SolanaLargestTokenAccount {
  address?: string;
  amount?: string;
  uiAmount?: number;
  uiAmountString?: string;
  decimals?: number;
}

interface SolanaTokenSupply {
  value?: {
    amount?: string;
    uiAmount?: number;
    uiAmountString?: string;
    decimals?: number;
  };
}

interface SolanaLargestAccountsResult {
  value?: SolanaLargestTokenAccount[];
}

interface SolanaMultipleAccountsResult {
  value?: Array<{
    data?: {
      parsed?: {
        info?: {
          owner?: string;
          tokenAmount?: {
            uiAmount?: number;
            uiAmountString?: string;
          };
        };
      };
    };
  } | null>;
}

interface SolanaTokenAccountParsed {
  account?: {
    data?: {
      parsed?: {
        info?: {
          mint?: string;
          owner?: string;
          tokenAmount?: {
            decimals?: number;
            uiAmount?: number;
            uiAmountString?: string;
          };
        };
      };
    };
  };
}

interface SolanaTokenAccountsByOwnerResult {
  value?: SolanaTokenAccountParsed[];
}

interface SolanaSignatureInfo {
  signature?: string;
  blockTime?: number;
}

interface SolanaSignaturesResult {
  value?: SolanaSignatureInfo[];
}

interface SolanaParsedTokenBalance {
  accountIndex?: number;
  mint?: string;
  owner?: string;
  uiTokenAmount?: {
    uiAmount?: number;
    uiAmountString?: string;
  };
}

interface SolanaParsedTransaction {
  blockTime?: number;
  meta?: {
    preBalances?: number[];
    postBalances?: number[];
    preTokenBalances?: SolanaParsedTokenBalance[];
    postTokenBalances?: SolanaParsedTokenBalance[];
  };
  transaction?: {
    message?: {
      accountKeys?: Array<string | { pubkey?: string; signer?: boolean; writable?: boolean }>;
    };
    signatures?: string[];
  };
}

function solanaRpcUrl(): { url: string; provider: "alchemy" | "helius" } | null {
  const configured = env("SOLANA_RPC_URL");
  if (configured) {
    return {
      url: configured,
      provider: configured.toLowerCase().includes("alchemy.com") ? "alchemy" : "helius",
    };
  }

  const key = env("HELIUS_API_KEY");
  if (!key) return null;

  return {
    url: `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`,
    provider: "helius",
  };
}

async function solanaRpc<T>(url: string, method: string, params: unknown[]): Promise<T | null> {
  try {
    const response = await fetchJson<SolanaRpcResponse<T>>(
      url,
      {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `anyalpha-${method}`,
          method,
          params,
        }),
      },
      14_000,
    );

    if (response.error) throw new Error(response.error.message ?? "Solana RPC error");
    return response.result ?? null;
  } catch {
    return null;
  }
}

function solanaAmount(value: unknown): number | undefined {
  const amount = numeric(value);
  return typeof amount === "number" && amount > 0 ? amount : undefined;
}

export interface SolanaHolderPositionsResult {
  holders: MarketTokenHolderPosition[];
  totalCount?: number;
}

export async function fetchSolanaHolderPositions(
  token: MarketToken,
  limit = 20,
): Promise<SolanaHolderPositionsResult> {
  if (token.chainId !== "solana" || !token.tokenAddress) {
    return {
      holders: [],
    };
  }

  const rpc = solanaRpcUrl();
  if (!rpc) {
    return {
      holders: [],
    };
  }

  const boundedLimit = Math.max(1, Math.min(20, Math.round(limit)));
  const [largestAccounts, supply] = await Promise.all([
    solanaRpc<SolanaLargestAccountsResult>(rpc.url, "getTokenLargestAccounts", [token.tokenAddress]),
    solanaRpc<SolanaTokenSupply>(rpc.url, "getTokenSupply", [token.tokenAddress]),
  ]);
  const accounts = (largestAccounts?.value ?? []).slice(0, boundedLimit);
  if (!accounts.length) {
    return {
      holders: [],
    };
  }

  const accountAddresses = accounts.map((account) => account.address).filter((address): address is string => Boolean(address));
  const accountInfo = accountAddresses.length
    ? await solanaRpc<SolanaMultipleAccountsResult>(rpc.url, "getMultipleAccounts", [
        accountAddresses,
        {
          encoding: "jsonParsed",
        },
      ])
    : null;
  const supplyAmount = solanaAmount(supply?.value?.uiAmountString ?? supply?.value?.uiAmount);
  const ownerByAccount = new Map<string, string>();
  const amountByAccount = new Map<string, number>();

  accountAddresses.forEach((address, index) => {
    const info = accountInfo?.value?.[index]?.data?.parsed?.info;
    const owner = info?.owner;
    if (owner) ownerByAccount.set(address, owner);
    const parsedAmount = solanaAmount(info?.tokenAmount?.uiAmountString ?? info?.tokenAmount?.uiAmount);
    if (parsedAmount) amountByAccount.set(address, parsedAmount);
  });

  const holders = accounts
    .map((account): MarketTokenHolderPosition | null => {
      const accountAddress = account.address;
      if (!accountAddress) return null;

      const tokenAmount = amountByAccount.get(accountAddress) ?? solanaAmount(account.uiAmountString ?? account.uiAmount);
      if (!tokenAmount) return null;

      const walletAddress = ownerByAccount.get(accountAddress) ?? accountAddress;
      const percentageOfTotalSupply = supplyAmount ? (tokenAmount / supplyAmount) * 100 : undefined;

      return {
        walletAddress,
        tokenAmount,
        tokenAmountUsd: typeof token.priceUsd === "number" ? tokenAmount * token.priceUsd : undefined,
        percentageOfTotalSupply,
        labels: [],
        platform: {
          id: rpc.provider,
          name: rpc.provider === "alchemy" ? "Alchemy Solana RPC" : "Helius",
        },
      };
    })
    .filter((holder): holder is MarketTokenHolderPosition => holder !== null);

  return {
    holders,
    totalCount: token.security?.holderCount,
  };
}

function accountKeyAddress(key: string | { pubkey?: string }): string | undefined {
  return typeof key === "string" ? key : key.pubkey;
}

function tokenBalanceAmount(balance: SolanaParsedTokenBalance): number {
  return solanaAmount(balance.uiTokenAmount?.uiAmountString ?? balance.uiTokenAmount?.uiAmount) ?? 0;
}

function balanceMap(rows: SolanaParsedTokenBalance[] | undefined, mint: string): Map<string, number> {
  const map = new Map<string, number>();

  for (const row of rows ?? []) {
    if (row.mint !== mint) continue;
    const owner = row.owner ?? (typeof row.accountIndex === "number" ? `account:${row.accountIndex}` : undefined);
    if (!owner) continue;
    map.set(owner, (map.get(owner) ?? 0) + tokenBalanceAmount(row));
  }

  return map;
}

function normalizeSolanaTrade(
  token: MarketToken,
  tx: SolanaParsedTransaction | null,
  fallbackSignature: string,
): MarketTokenTrade | null {
  if (!tx?.meta) return null;

  const accountKeys = tx.transaction?.message?.accountKeys ?? [];
  const signerIndex = accountKeys.findIndex((key) => typeof key !== "string" && key.signer);
  const signer = signerIndex >= 0 ? accountKeyAddress(accountKeys[signerIndex]) : undefined;
  const preToken = balanceMap(tx.meta.preTokenBalances, token.tokenAddress);
  const postToken = balanceMap(tx.meta.postTokenBalances, token.tokenAddress);
  const owners = new Set([...preToken.keys(), ...postToken.keys()]);
  let selectedOwner = signer && owners.has(signer) ? signer : undefined;
  let selectedDelta = 0;

  for (const owner of owners) {
    const delta = (postToken.get(owner) ?? 0) - (preToken.get(owner) ?? 0);
    if (!selectedOwner || Math.abs(delta) > Math.abs(selectedDelta)) {
      selectedOwner = owner;
      selectedDelta = delta;
    }
  }

  if (!selectedOwner || selectedDelta === 0) return null;

  const signature = tx.transaction?.signatures?.[0] ?? fallbackSignature;
  const type = selectedDelta > 0 ? "buy" : "sell";
  const baseTokenAmount = Math.abs(selectedDelta);
  const signerLamportDelta =
    signerIndex >= 0
      ? ((tx.meta.postBalances?.[signerIndex] ?? 0) - (tx.meta.preBalances?.[signerIndex] ?? 0)) / 1_000_000_000
      : undefined;
  const quoteTokenAmount = typeof signerLamportDelta === "number" ? Math.abs(signerLamportDelta) : undefined;
  const baseTokenAmountUsd = typeof token.priceUsd === "number" ? baseTokenAmount * token.priceUsd : undefined;

  return {
    id: `solana-rpc-${signature}`,
    type,
    operation: type,
    baseTokenAmount,
    baseTokenAmountUsd,
    quoteTokenAmount,
    quoteTokenAmountUsd: baseTokenAmountUsd,
    timestamp: tx.blockTime ? tx.blockTime * 1000 : undefined,
    transactionHash: signature,
    marketAddress: token.pairAddress,
    makerAddress: selectedOwner,
    senderAddress: signer,
    priceUsd: token.priceUsd,
    labels: [],
    platform: {
      id: "solana-rpc",
      name: "Solana RPC",
    },
  };
}

export async function fetchSolanaRecentPoolTrades(
  token: MarketToken,
  limit = 30,
): Promise<MarketTokenTrade[]> {
  if (token.chainId !== "solana" || !token.pairAddress || !token.tokenAddress) return [];

  const rpc = solanaRpcUrl();
  if (!rpc) return [];

  const signatureRows = await solanaRpc<SolanaSignatureInfo[]>(rpc.url, "getSignaturesForAddress", [
    token.pairAddress,
    {
      limit: Math.max(1, Math.min(40, Math.round(limit))),
    },
  ]);
  const signatures = (signatureRows ?? [])
    .map((row) => row.signature)
    .filter((signature): signature is string => Boolean(signature))
    .slice(0, Math.max(1, Math.min(25, Math.round(limit))));

  if (!signatures.length) return [];

  const transactions = await Promise.all(
    signatures.map(async (signature) => {
      const tx = await solanaRpc<SolanaParsedTransaction>(rpc.url, "getTransaction", [
        signature,
        {
          encoding: "jsonParsed",
          maxSupportedTransactionVersion: 0,
        },
      ]);
      return normalizeSolanaTrade(token, tx, signature);
    }),
  );

  return transactions
    .filter((trade): trade is MarketTokenTrade => trade !== null)
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
}

export async function fetchHeliusEnrichments(tokens: MarketToken[]): Promise<ProviderBatchResult> {
  const key = env("HELIUS_API_KEY");
  const solanaTokens = tokens.filter((token) => token.chainId === "solana");

  if (!solanaTokens.length) {
    return {
      enrichments: [],
      snapshot: {
        provider: "helius",
        status: "skipped",
        label: "Helius",
        detail: "No Solana rows in this batch.",
      },
    };
  }

  if (!key) {
    return {
      enrichments: [],
      snapshot: {
        provider: "helius",
        status: "missing_key",
        label: "Helius",
        detail: "Set HELIUS_API_KEY to enrich Solana token metadata and authority flags.",
      },
    };
  }

  try {
    const response = await fetchJson<HeliusRpcResponse>(
      `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "anyalpha-market-enrichment",
          method: "getAssetBatch",
          params: {
            ids: solanaTokens.map((token) => token.tokenAddress).slice(0, 100),
            options: {
              showFungible: true,
            },
          },
        }),
      },
      14_000,
    );

    if (!Array.isArray(response) && response.error) {
      throw new Error(response.error.message ?? "Helius RPC error");
    }

    const assets = Array.isArray(response) ? response : (response.result ?? []);
    const enrichments = assets
      .map((asset): MarketEnrichment | null => {
        if (!asset.id) return null;

        const price = numeric(asset.token_info?.price_info?.price_per_token);
        const metadata = asset.content?.metadata;
        const image = metadata?.image ?? asset.content?.files?.[0]?.cdn_uri ?? asset.content?.files?.[0]?.uri;
        const externalUrl = metadata?.external_url;

        return {
          provider: "helius",
          status: "live",
          label: "Helius",
          detail: "Solana DAS metadata, token program, cached price, and mint authority flags.",
          value: asset.token_info?.token_program,
          updatedAt: new Date().toISOString(),
          chainId: "solana",
          tokenAddress: asset.id,
          name: metadata?.name,
          symbol: metadata?.symbol,
          description: metadata?.description,
          imageUrl: image,
          links: externalUrl ? [{ type: "website", url: externalUrl }] : [],
          priceUsd: asset.token_info?.price_info?.currency === "USD" ? price : undefined,
          mintAuthorityDisabled: !asset.token_info?.mint_authority,
          freezeAuthorityDisabled: !asset.token_info?.freeze_authority,
          riskFlags: [
            ...(asset.token_info?.mint_authority ? ["Mint authority active"] : []),
            ...(asset.token_info?.freeze_authority ? ["Freeze authority active"] : []),
          ],
        };
      })
      .filter((item): item is MarketEnrichment => item !== null);

    return {
      enrichments,
      snapshot: {
        provider: "helius",
        status: "live",
        label: "Helius",
        detail: "Solana DAS enrichment active.",
        value: `${enrichments.length}/${solanaTokens.length} enriched`,
        updatedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      enrichments: [],
      snapshot: {
        provider: "helius",
        status: "error",
        label: "Helius",
        detail: err instanceof Error ? err.message : "Helius enrichment failed.",
      },
    };
  }
}

export async function fetchSolanaWalletTokens(address: string) {
  const rpc = solanaRpcUrl();
  if (!rpc) throw new Error("Solana RPC is not configured.");

  const response = await solanaRpc<SolanaTokenAccountsByOwnerResult>(rpc.url, "getTokenAccountsByOwner", [
    address,
    { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
    { encoding: "jsonParsed" },
  ]);

  if (!response?.value) return [];

  return response.value
    .map((item) => {
      const info = item.account?.data?.parsed?.info;
      if (!info?.mint || !info.tokenAmount) return null;

      const balance = numeric(info.tokenAmount.uiAmountString ?? info.tokenAmount.uiAmount) ?? 0;
      if (balance <= 0) return null;

      return {
        chainId: "solana",
        tokenAddress: info.mint,
        balance,
        decimals: info.tokenAmount.decimals ?? 0,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}
