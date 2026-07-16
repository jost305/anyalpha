export interface UserNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  readState: 'unread' | 'read' | 'archived';
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}

export interface UserNotificationsResponse {
  source: 'notifications';
  notifications: UserNotification[];
  unreadCount: number;
  updatedAt: string;
}

function apiUrl(path: string) {
  const rawBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  const baseUrl = rawBaseUrl ? rawBaseUrl.replace(/\/+$/, '') : '';
  return baseUrl ? `${baseUrl}${path}` : path;
}

async function notificationFetch<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Notifications request failed with HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

export function fetchUserNotifications(accessToken: string, limit = 50, signal?: AbortSignal) {
  return notificationFetch<UserNotificationsResponse>(
    `/api/notifications?limit=${encodeURIComponent(String(limit))}`,
    accessToken,
    { signal },
  );
}

export function markNotificationRead(accessToken: string, id: string) {
  return notificationFetch<{ source: 'notifications'; updated: boolean; id: string }>(
    `/api/notifications/${encodeURIComponent(id)}/read`,
    accessToken,
    { method: 'POST' },
  );
}

export function markAllNotificationsRead(accessToken: string) {
  return notificationFetch<{ source: 'notifications'; updated: number }>(
    '/api/notifications/read-all',
    accessToken,
    { method: 'POST' },
  );
}
