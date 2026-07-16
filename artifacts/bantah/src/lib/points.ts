export type PointsTier = 'anon' | 'degen' | 'alpha' | 'whale' | 'gigabrain';
export type ReferralTier = 'starter' | 'builder' | 'connector' | 'amplifier' | 'network';

export interface AlphaPointsAccount {
  label: 'Alpha Points';
  balance: number;
  welcomeGrant: number;
  awardedAt: string;
  updatedAt: string;
  username: string;
  referralCode: string;
  tier: PointsTier;
  tierLabel: string;
  tierEmoji: string;
  lifetimePoints: number;
  streakDays: number;
  multiplierBps: number;
  nextTier: {
    tier: PointsTier;
    label: string;
    minPoints: number;
    pointsRemaining: number;
  } | null;
}

export interface PointsDashboard {
  account: AlphaPointsAccount;
  referralLinks: {
    terminal: string;
    telegram: string | null;
  };
  referralStats: {
    totalReferrals: number;
    activeReferrals: number;
    referralTier: ReferralTier;
    referralTierLabel: string;
    referralBonusBps: number;
    referralPoints: number;
    passivePoints: number;
    passivePointsToday: number;
    rank: number | null;
  };
  referrals: Array<{
    id: string;
    refereeId: string;
    refereeDisplay: string;
    refereeReferralCode: string | null;
    refereePoints: number;
    source: 'terminal' | 'telegram';
    isActive: boolean;
    totalPassivePoints: number;
    joinedAt: string;
  }>;
  recentLedger: Array<{
    id: string;
    action: string;
    source: string;
    points: number;
    basePoints: number;
    multiplierBps: number;
    relatedUserId: string | null;
    relatedEntityId: string | null;
    createdAt: string;
  }>;
  leaderboard: Array<{
    rank: number;
    userId: string;
    display: string;
    referralCode: string;
    totalPoints: number;
    tier: PointsTier;
    tierLabel: string;
  }>;
}

export interface PointsDashboardResponse {
  source: 'points';
  dashboard: PointsDashboard;
  updatedAt: string;
}

export interface RewardsStatsResponse {
  source: 'rewards';
  stats: {
    totalPointsAwarded: number;
    totalRewardAccounts: number;
    ledgerEntries: number;
    updatedAt: string;
  };
  updatedAt: string;
}

export interface TelegramLinkCode {
  code: string;
  command: string;
  deepLink: string | null;
  expiresAt: string;
}

export interface TelegramLinkStatus {
  source: 'telegram_link';
  linked: boolean;
  accounts: Array<{
    telegramUserId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    chatId: string;
    linkedAt: string | null;
  }>;
  updatedAt: string;
}

export interface TelegramLinkCodeResponse {
  source: 'telegram_link';
  link: TelegramLinkCode;
  updatedAt: string;
}

function apiUrl(path: string) {
  const rawBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  const baseUrl = rawBaseUrl ? rawBaseUrl.replace(/\/+$/, '') : '';
  return baseUrl ? `${baseUrl}${path}` : path;
}

export async function pointsFetch<T>(path: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
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

export async function publicPointsFetch<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      accept: 'application/json',
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

export function fetchPointsDashboard(accessToken: string, signal?: AbortSignal) {
  return pointsFetch<PointsDashboardResponse>('/api/points/me', accessToken, {
    method: 'GET',
    signal,
  });
}

export function fetchRewardsStats(signal?: AbortSignal) {
  return publicPointsFetch<RewardsStatsResponse>('/api/rewards/stats', {
    method: 'GET',
    signal,
  });
}

export function fetchTelegramLinkStatus(accessToken: string, signal?: AbortSignal) {
  return pointsFetch<TelegramLinkStatus>('/api/telegram/link-status', accessToken, {
    method: 'GET',
    signal,
  });
}

export function createTelegramLinkCode(accessToken: string) {
  return pointsFetch<TelegramLinkCodeResponse>('/api/telegram/link-code', accessToken, {
    method: 'POST',
  });
}
