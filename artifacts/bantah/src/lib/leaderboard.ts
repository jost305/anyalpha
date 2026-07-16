export type LeaderboardPeriod = '24h' | '7d' | '30d' | 'all';

export interface LeaderboardAccount {
  accountKey: string;
  display: string;
  referralCode: string | null;
  tier: 'anon' | 'degen' | 'alpha' | 'whale' | 'gigabrain';
  tierLabel: string;
}

export interface PointsLeaderboardRow extends LeaderboardAccount {
  rank: number;
  points: number;
  lifetimePoints: number;
  ledgerEntries: number | null;
}

export interface TradesLeaderboardRow extends LeaderboardAccount {
  rank: number;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  volumeUsdCents: number;
  lastActivityAt: string | null;
}

export interface ReferralsLeaderboardRow extends LeaderboardAccount {
  rank: number;
  referralCount: number;
  activeReferralCount: number;
  passivePoints: number;
  joinedAt: string | null;
}

export interface LeaderboardResponse {
  source: 'leaderboard';
  period: LeaderboardPeriod;
  updatedAt: string;
  points: PointsLeaderboardRow[];
  trades: TradesLeaderboardRow[];
  referrals: ReferralsLeaderboardRow[];
  summary: {
    pointAccounts: number;
    trackedTradeAccounts: number;
    referralAccounts: number;
    topPoints: number;
    trackedTradeEvents: number;
    totalReferrals: number;
  };
}

function apiUrl(path: string) {
  const rawBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  const baseUrl = rawBaseUrl ? rawBaseUrl.replace(/\/+$/, '') : '';
  return baseUrl ? `${baseUrl}${path}` : path;
}

export async function fetchLeaderboard(period: LeaderboardPeriod, signal?: AbortSignal) {
  const params = new URLSearchParams({ period });
  const response = await fetch(apiUrl(`/api/leaderboard?${params.toString()}`), {
    headers: { accept: 'application/json' },
    signal,
  });
  const payload = (await response.json().catch(() => null)) as LeaderboardResponse | { error?: string } | null;

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `API request failed: ${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return payload as LeaderboardResponse;
}
