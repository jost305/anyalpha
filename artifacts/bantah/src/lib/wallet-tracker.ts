export type WalletTrackerChain =
  | 'solana'
  | 'ethereum'
  | 'base'
  | 'arbitrum'
  | 'bsc'
  | 'polygon'
  | 'optimism'
  | 'sui'
  | 'aptos';
export type WalletAlertMode = 'alerts_only' | 'copy_ready' | 'muted';
export type WalletAlertType = 'buy' | 'sell' | 'transfer' | 'mint' | 'burn' | 'unknown';

export interface WalletTrackerItem {
  id: string;
  walletId: string;
  chain: WalletTrackerChain;
  address: string;
  label: string | null;
  alertMode: WalletAlertMode;
  telegramEnabled: boolean;
  browserEnabled: boolean;
  minUsdCents: number;
  alertTypes: WalletAlertType[];
  source: string;
  score: number | null;
  riskLevel: string | null;
  tags: string[];
  firstSeenAt: string;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
  latestTransactions: Array<{
    id: string;
    signature: string;
    type: string;
    tokenSymbol: string | null;
    tokenName: string | null;
    tokenAddress: string | null;
    tokenAmount: string | null;
    amountUsdCents: number | null;
    tradeConfidence: number;
    realizedPnlUsdCents: number | null;
    costBasisUsdCents: number | null;
    counterparty: string | null;
    dex: string | null;
    programId: string | null;
    occurredAt: string;
  }>;
  performance: {
    buyCount: number;
    sellCount: number;
    winningSellCount: number;
    winRate: number | null;
    realizedPnlUsdCents: number;
    buyVolumeUsdCents: number;
    sellVolumeUsdCents: number;
    openPositions: number;
    lastTradeAt: string | null;
  };
}

export interface WalletTrackerResponse {
  source: 'wallet_tracker';
  wallets: WalletTrackerItem[];
  total: number;
  monitoring: {
    solanaProviderConfigured: boolean;
    evmProviderConfigured: boolean;
    webhookSecretConfigured: boolean;
    heliusAuthConfigured: boolean;
    alchemySignatureConfigured: boolean;
    publicWebhookBaseConfigured: boolean;
  };
  updatedAt: string;
}

export interface PublicWalletTrackerItem {
  id: string;
  chain: WalletTrackerChain;
  address: string;
  label: string | null;
  source: string;
  score: number | null;
  riskLevel: string | null;
  tags: string[];
  balanceLabel: string | null;
  balanceUsdCents: number | null;
  avgDurationSeconds: number | null;
  avgDurationLabel: string | null;
  followerCount: number;
  followed: boolean;
  subscriptionId: string | null;
  firstSeenAt: string;
  lastActiveAt: string | null;
  updatedAt: string;
  performance: WalletTrackerItem['performance'];
}

export interface PublicWalletTrackerResponse {
  source: 'wallet_tracker_public';
  wallets: PublicWalletTrackerItem[];
  total: number;
  monitoring: WalletTrackerResponse['monitoring'];
  updatedAt: string;
}

export interface WalletTrackerMutationResponse {
  source: 'wallet_tracker';
  wallet?: WalletTrackerItem;
  removed?: boolean;
  id?: string;
}

export interface AddTrackedWalletPayload {
  chain: WalletTrackerChain;
  address: string;
  label?: string | null;
  alertMode?: WalletAlertMode;
  telegramEnabled?: boolean;
  browserEnabled?: boolean;
  minUsdCents?: number;
  alertTypes?: WalletAlertType[];
}

export interface WalletTestAlertResponse {
  source: 'wallet_tracker_test_alert';
  notificationCreated: boolean;
  telegramMessagesSent: number;
  skippedChannels: string[];
  updatedAt: string;
}

export interface WalletBackfillResponse {
  source: 'wallet_tracker_backfill';
  runId: string;
  provider: 'helius' | 'alchemy';
  chain: WalletTrackerChain;
  walletId: string;
  requestedLimit: number;
  received: number;
  insertedTransactions: number;
  duplicates: number;
  matchedWallets: number;
  updatedAt: string;
}

function apiUrl(path: string) {
  const rawBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  const baseUrl = rawBaseUrl ? rawBaseUrl.replace(/\/+$/, '') : '';
  if (!baseUrl) return path;
  if (baseUrl.endsWith('/api') && path.startsWith('/api/')) return `${baseUrl}${path.slice(4)}`;
  return `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}

async function walletTrackerFetch<T>(path: string, accessToken: string | null | undefined, init: RequestInit = {}) {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      accept: 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;

  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `API request failed: ${response.status} ${response.statusText}`;
    throw new Error(errorMessage);
  }

  return payload as T;
}

export function fetchPublicWalletTracker(accessToken?: string | null, signal?: AbortSignal) {
  return walletTrackerFetch<PublicWalletTrackerResponse>('/api/wallet-tracker/public', accessToken, {
    method: 'GET',
    signal,
  });
}

export function fetchWalletTracker(accessToken: string, signal?: AbortSignal) {
  return walletTrackerFetch<WalletTrackerResponse>('/api/wallet-tracker', accessToken, {
    method: 'GET',
    signal,
  });
}

export function addTrackedWallet(accessToken: string, payload: AddTrackedWalletPayload) {
  return walletTrackerFetch<WalletTrackerMutationResponse>('/api/wallet-tracker/wallets', accessToken, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function removeTrackedWallet(accessToken: string, id: string) {
  return walletTrackerFetch<WalletTrackerMutationResponse>(
    `/api/wallet-tracker/wallets/${encodeURIComponent(id)}`,
    accessToken,
    {
      method: 'DELETE',
    },
  );
}

export function unfollowTrackedWallet(accessToken: string, id: string) {
  return removeTrackedWallet(accessToken, id);
}

export function updateTrackedWallet(accessToken: string, id: string, payload: Partial<AddTrackedWalletPayload>) {
  return walletTrackerFetch<WalletTrackerMutationResponse>(
    `/api/wallet-tracker/wallets/${encodeURIComponent(id)}`,
    accessToken,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}

export function sendTrackedWalletTestAlert(accessToken: string, id: string) {
  return walletTrackerFetch<WalletTestAlertResponse>(
    `/api/wallet-tracker/wallets/${encodeURIComponent(id)}/test-alert`,
    accessToken,
    {
      method: 'POST',
    },
  );
}

export function syncTrackedWalletHistory(accessToken: string, id: string, limit = 50) {
  return walletTrackerFetch<WalletBackfillResponse>(
    `/api/wallet-tracker/wallets/${encodeURIComponent(id)}/backfill`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ limit }),
    },
  );
}
