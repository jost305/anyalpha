export interface BrowserPushConfigResponse {
  source: 'notifications';
  push: {
    configured: boolean;
    publicKey: string | null;
  };
}

export interface BrowserPushState {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  configured: boolean;
  subscribed: boolean;
}

function apiUrl(path: string) {
  const rawBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  const baseUrl = rawBaseUrl ? rawBaseUrl.replace(/\/+$/, '') : '';
  return baseUrl ? `${baseUrl}${path}` : path;
}

function browserPushSupported() {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

async function pushFetch<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
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
    throw new Error(body?.error ?? `Push notification request failed with HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

async function notificationRegistration() {
  if (!browserPushSupported()) {
    throw new Error('Browser push is not supported in this browser.');
  }

  const registration = await navigator.serviceWorker.register('/notification-sw.js', { scope: '/' });
  return registration;
}

function assertSubscriptionJson(subscription: PushSubscription) {
  const json = subscription.toJSON();

  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Browser push subscription is incomplete.');
  }

  return {
    endpoint: json.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: {
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
  };
}

export function isBrowserPushSupported() {
  return browserPushSupported();
}

export async function fetchBrowserPushConfig(accessToken: string, signal?: AbortSignal) {
  return pushFetch<BrowserPushConfigResponse>('/api/notifications/push/config', accessToken, { signal });
}

export async function getBrowserPushState(accessToken: string, signal?: AbortSignal): Promise<BrowserPushState> {
  const supported = browserPushSupported();
  const config = await fetchBrowserPushConfig(accessToken, signal);

  if (!supported) {
    return {
      supported: false,
      permission: 'unsupported',
      configured: config.push.configured,
      subscribed: false,
    };
  }

  const registration = await notificationRegistration();
  const subscription = await registration.pushManager.getSubscription();

  return {
    supported: true,
    permission: Notification.permission,
    configured: config.push.configured,
    subscribed: Boolean(subscription),
  };
}

export async function syncExistingBrowserPushSubscription(accessToken: string) {
  if (!browserPushSupported() || Notification.permission !== 'granted') return false;

  const config = await fetchBrowserPushConfig(accessToken);
  if (!config.push.configured) return false;

  const registration = await notificationRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;

  await pushFetch('/api/notifications/push-subscriptions', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      subscription: assertSubscriptionJson(subscription),
      userAgent: navigator.userAgent,
    }),
  });

  return true;
}

export async function subscribeBrowserPush(accessToken: string) {
  if (!browserPushSupported()) {
    throw new Error('Browser push is not supported in this browser.');
  }

  const config = await fetchBrowserPushConfig(accessToken);
  if (!config.push.configured || !config.push.publicKey) {
    throw new Error('Browser push is not configured on the API.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Browser push permission was not granted.');
  }

  const registration = await notificationRegistration();
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.push.publicKey),
    }));

  await pushFetch('/api/notifications/push-subscriptions', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      subscription: assertSubscriptionJson(subscription),
      userAgent: navigator.userAgent,
    }),
  });

  return {
    permission,
    subscribed: true,
  };
}

export async function unsubscribeBrowserPush(accessToken: string) {
  if (!browserPushSupported()) return { removed: false };

  const registration = await notificationRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return { removed: false };

  const subscriptionJson = assertSubscriptionJson(subscription);

  await pushFetch('/api/notifications/push-subscriptions', accessToken, {
    method: 'DELETE',
    body: JSON.stringify({
      endpoint: subscriptionJson.endpoint,
    }),
  });
  await subscription.unsubscribe();

  return {
    removed: true,
  };
}

export async function sendTestNotification(accessToken: string) {
  return pushFetch('/api/notifications/test', accessToken, { method: 'POST' });
}
