export type XAlertMode = 'all_posts' | 'token_mentions' | 'muted';

export interface XTrackedAccountItem {
  id: string;
  accountId: string;
  handle: string;
  xUserId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  alertMode: XAlertMode;
  telegramEnabled: boolean;
  browserEnabled: boolean;
  lastPostAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface XTokenMention {
  tokenSymbol: string | null;
  contractAddress: string | null;
  chain: string | null;
  confidence: number;
}

export interface XPostItem {
  id: string;
  authorHandle: string | null;
  text: string;
  url: string | null;
  lang: string | null;
  postedAt: string;
  mentions: XTokenMention[];
}

export interface TwitterTrackResponse {
  source: 'twitter_track';
  accounts: XTrackedAccountItem[];
  posts: XPostItem[];
  mentions: XTokenMention[];
  monitoring: {
    bearerConfigured: boolean;
    webhookSecretConfigured: boolean;
    publicWebhookBaseConfigured: boolean;
    cryptoFeedQuery: string | null;
    cryptoFeedUpdatedAt: string | null;
    cryptoFeedError: string | null;
  };
  updatedAt: string;
}

export interface TwitterTrackMutationResponse {
  source: 'twitter_track';
  account?: XTrackedAccountItem;
  removed?: boolean;
  id?: string;
}

function apiUrl(path: string) {
  const rawBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  const baseUrl = rawBaseUrl ? rawBaseUrl.replace(/\/+$/, '') : '';
  return baseUrl ? `${baseUrl}${path}` : path;
}

async function twitterTrackFetch<T>(path: string, accessToken?: string | null, init: RequestInit = {}) {
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
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `API request failed: ${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return payload as T;
}

export function fetchTwitterTrack(accessToken?: string | null, signal?: AbortSignal) {
  return twitterTrackFetch<TwitterTrackResponse>('/api/twitter-track', accessToken, {
    method: 'GET',
    signal,
  });
}

export function trackXAccount(
  accessToken: string,
  payload: {
    handle: string;
    alertMode?: XAlertMode;
    telegramEnabled?: boolean;
    browserEnabled?: boolean;
  },
) {
  return twitterTrackFetch<TwitterTrackMutationResponse>('/api/twitter-track/accounts', accessToken, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function removeXAccount(accessToken: string, id: string) {
  return twitterTrackFetch<TwitterTrackMutationResponse>(
    `/api/twitter-track/accounts/${encodeURIComponent(id)}`,
    accessToken,
    { method: 'DELETE' },
  );
}
