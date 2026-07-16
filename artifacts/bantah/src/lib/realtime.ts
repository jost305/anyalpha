export interface RealtimeConfig {
  source: 'realtime';
  configured: boolean;
  key: string | null;
  cluster: string | null;
  channel: string;
}

function apiUrl(path: string) {
  const rawBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  const baseUrl = rawBaseUrl ? rawBaseUrl.replace(/\/+$/, '') : '';
  return baseUrl ? `${baseUrl}${path}` : path;
}

export async function fetchRealtimeConfig(accessToken: string, signal?: AbortSignal): Promise<RealtimeConfig> {
  const response = await fetch(apiUrl('/api/realtime/config'), {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    signal,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Realtime config failed with HTTP ${response.status}`);
  }

  return (await response.json()) as RealtimeConfig;
}

export function realtimeAuthEndpoint() {
  return apiUrl('/api/realtime/pusher/auth');
}
