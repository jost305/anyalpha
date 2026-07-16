import type { MarketToken } from '@/lib/market-data';

export interface WatchlistItem {
  id: string;
  market: MarketToken;
  addedAt: string;
  updatedAt: string;
  live?: boolean;
}

export interface WatchlistResponse {
  items: WatchlistItem[];
  total: number;
  updatedAt: string;
  source: 'watchlist';
}

export interface WatchlistIdsResponse {
  itemIds: string[];
  total: number;
  updatedAt: string;
  source: 'watchlist';
}

export interface WatchlistMutationResponse {
  source: 'watchlist';
  item?: WatchlistItem;
  removed?: boolean;
  marketId?: string;
}

function apiUrl(path: string) {
  const rawBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  const baseUrl = rawBaseUrl ? rawBaseUrl.replace(/\/+$/, '') : '';
  return baseUrl ? `${baseUrl}${path}` : path;
}

async function watchlistFetch<T>(path: string, accessToken: string, init: RequestInit = {}) {
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

export function fetchWatchlist(accessToken: string, signal?: AbortSignal) {
  return watchlistFetch<WatchlistResponse>('/api/watchlist', accessToken, {
    method: 'GET',
    signal,
  });
}

export function fetchWatchlistIds(accessToken: string, signal?: AbortSignal) {
  return watchlistFetch<WatchlistIdsResponse>('/api/watchlist/ids', accessToken, {
    method: 'GET',
    signal,
  });
}

export function addWatchlistItem(accessToken: string, market: MarketToken) {
  return watchlistFetch<WatchlistMutationResponse>('/api/watchlist/items', accessToken, {
    method: 'POST',
    body: JSON.stringify({ market }),
  });
}

export function removeWatchlistItem(accessToken: string, marketId: string) {
  return watchlistFetch<WatchlistMutationResponse>(`/api/watchlist/items/${encodeURIComponent(marketId)}`, accessToken, {
    method: 'DELETE',
  });
}
